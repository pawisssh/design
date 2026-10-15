#!/usr/bin/env python3
"""Derive a foundations document from Carbon sources and one or more Contracts.

  derive_foundations.py --repo <carbon checkout at the pinned commit> --css <@carbon/styles css/styles.css>
                        --contract <component.json> [--contract ...] [-o carbon.foundations.json]

This is the Carbon Adapter's foundations step, as a research prototype (#19). It:
  1. unions the token closure of every Contract (token refs in layout/paint, textStyle refs),
  2. resolves each token from Carbon DTCG JSON (themes, components/button, layout, colors) and @carbon/type,
  3. maps them onto the #9 collections (Primitives / Theme / Layout / Type) and Text Styles,
  4. checks every resolved value against the compiled @carbon/styles CSS per theme,
  5. checks that every Contract use of a token lies inside that variable's scopes,
  6. writes the document deterministically (sorted keys inside maps, fixed collection/mode order).
It never writes Figma ids; those live in the per-file ledger.
"""
import argparse
import hashlib
import itertools
import json
import re
import sys
from pathlib import Path

MODES = [("white", "White"), ("g10", "Gray 10"), ("g90", "Gray 90"), ("g100", "Gray 100")]  # fixed order; DTCG may add keys such as "fallback"
SINGLE = [("default", "Default")]
FILES = [
    "packages/colors/src/dtcg/colors.json",
    "packages/layout/src/dtcg/layout.json",
    "packages/themes/src/dtcg/components/button.json",
    "packages/themes/src/dtcg/themes.json",
    "packages/type/src/fontFamily.ts",
    "packages/type/src/fontWeight.ts",
    "packages/type/src/scale.ts",
    "packages/type/src/styles.ts",
]
ALPHA_REASON = "alpha: a Figma alias cannot carry alpha, so this mode holds the flattened RGBA"


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# ---------- DTCG reading ----------

def flatten_theme(doc):
    """themes.json / components/*.json: flat name = path joined with '-' (button + danger-hover)."""
    out = {}

    def walk(node, path):
        if isinstance(node, dict):
            if "$extensions" in node and path:
                out["-".join(path)] = (node, "#/" + "/".join(path))
            for k, v in node.items():
                if not k.startswith("$"):
                    walk(v, path + [k])
    walk(doc, [])
    return out


def flatten_layout(doc):
    """layout.json: the leaf key already carries the full name (spacing > spacing-05)."""
    out = {}
    for group, members in doc.items():
        if group.startswith("$"):
            continue
        for key, node in members.items():
            if not key.startswith("$") and isinstance(node, dict) and "$value" in node:
                out[key] = (group, node, f"#/{group}/{key}")
    return out


def palette(doc):
    """colors.json: 'white', 'blue' > '60', 'blue' > '60Hover' -> keys white, blue.60, blue.60Hover."""
    out = {}
    for k, v in doc.items():
        if k.startswith("$"):
            continue
        if "$value" in v:
            out[k] = v["$value"].lower()
        else:
            for step, node in v.items():
                if not step.startswith("$"):
                    out[f"{k}.{step}"] = node["$value"].lower()
    return out


def palette_key(ref):
    """'{blue.60Hover}' -> 'blue.60Hover'; '{white.default}' -> 'white' (themes reference the generated palette)."""
    key = ref.strip("{}")
    return key[: -len(".default")] if key.endswith(".default") else key


def title(s):
    return s.replace("-", " ").capitalize()


def primitive_name(key):
    if "." not in key:
        return f"Neutral/{key.capitalize()}"
    hue, step = key.split(".", 1)
    return f"{hue.capitalize()}/{step}"


def rgba_css(hexv, alpha=None):
    r, g, b = (int(hexv[i:i + 2], 16) for i in (1, 3, 5))
    return hexv if alpha is None else f"rgba({r}, {g}, {b}, {alpha:g})"


# ---------- Contract closure and usage ----------

def matches(pattern, variant):
    return all(variant[a] in (w if isinstance(w, list) else [w]) for a, w in pattern.items())


def resolve(rules, variant):
    out = {}
    for rule in rules:
        if matches(rule["match"], variant):
            for node, fields in rule["set"].items():
                out.setdefault(node, {}).update(fields)
    return out


FIELD_SCOPE = {  # Contract field -> Figma scope a bound variable needs
    "paddingTop": "GAP", "paddingRight": "GAP", "paddingBottom": "GAP", "paddingLeft": "GAP", "gap": "GAP",
    "minHeight": "WIDTH_HEIGHT", "maxHeight": "WIDTH_HEIGHT", "minWidth": "WIDTH_HEIGHT", "maxWidth": "WIDTH_HEIGHT",
    "width": "WIDTH_HEIGHT", "height": "WIDTH_HEIGHT", "radius": "CORNER_RADIUS", "strokeWeight": "STROKE_FLOAT",
    "stroke": "STROKE_COLOR",
}


def contract_uses(c):
    """Return ({token: {scopes needed}}, {textStyle tokens}) over every selected variant."""
    axes = c["axes"]
    keys = [a["key"] for a in axes]
    domain = [[v["key"] for v in a["values"]] for a in axes]
    variants = [dict(zip(keys, t)) for t in itertools.product(*domain)]
    variants = [v for v in variants if not any(matches(e["match"], v) for e in c["excluded"] + c["selection"]["omit"])]
    anatomy = {}

    def walk(n):
        anatomy[n["name"]] = n["type"]
        for ch in n.get("children", []):
            walk(ch)
    walk(c["anatomy"])
    uses, styles = {}, set()
    for v in variants:
        lay, pnt = resolve(c["layout"], v), resolve(c["paint"], v)
        for node, fields in pnt.items():
            for f, val in list(fields.items()):
                if isinstance(val, dict) and "sameAs" in val:
                    rn, rf = val["sameAs"].split(".")
                    fields[f] = pnt[rn][rf]
        for node, fields in lay.items():
            for f, val in fields.items():
                if isinstance(val, dict) and "token" in val:
                    if f == "textStyle":
                        styles.add(val["token"])
                    else:
                        uses.setdefault(val["token"], set()).add(FIELD_SCOPE[f])
        for node, fields in pnt.items():
            for f, val in fields.items():
                if f == "fill" and isinstance(val, dict) and "token" in val:
                    kind = "TEXT_FILL" if anatomy.get(node) == "TEXT" else ("SHAPE_FILL" if "/" in node else "FRAME_FILL")
                    uses.setdefault(val["token"], set()).add(kind)
                elif f == "stroke" and isinstance(val, dict) and "token" in val:
                    uses.setdefault(val["token"], set()).add("STROKE_COLOR")
                elif f == "effects":
                    for e in val:
                        if isinstance(e.get("color"), dict) and "token" in e["color"]:
                            uses.setdefault(e["color"]["token"], set()).add("EFFECT_COLOR")
    return uses, styles


def covers(scopes, need):
    fills = {"FRAME_FILL", "SHAPE_FILL", "TEXT_FILL"}
    return need in scopes or ("ALL_FILLS" in scopes and need in fills) or "ALL_SCOPES" in scopes


# ---------- Adapter rules (#9, amended by #19) ----------

def theme_scopes(group, name):
    if group == "text":
        return ["SHAPE_FILL", "TEXT_FILL"]          # #9 said TEXT_FILL; icons take currentColor = text colour
    if name == "focus":
        return ["EFFECT_COLOR", "STROKE_COLOR"]     # #9 said STROKE_COLOR; #7 focus ring uses inner shadows
    if name == "background":
        return ["ALL_FILLS", "EFFECT_COLOR", "STROKE_COLOR"]  # gap ring shadow (#7)
    return ["ALL_FILLS", "STROKE_COLOR"]


FULL_SCALES = ("spacing", "size")  # Layout groups carried whole, regardless of the closure: an owner can only bind a
                                   # variable that exists, so the picker must offer the whole scale (#8 base loop).
                                   # Colours, Type and Primitives stay closure-only.

LAYOUT_GROUP = {  # DTCG group -> (Figma group, scopes, px converter)
    "spacing": ("Spacing", ["GAP"]),
    "size": ("Size", ["WIDTH_HEIGHT"]),
    "icon-size": ("Icon size", ["WIDTH_HEIGHT"]),
    "border-radius": ("Border radius", ["CORNER_RADIUS"]),
}


def layout_px(node):
    px, how = _layout_px(node)
    return (int(px) if float(px).is_integer() else px), how


def _layout_px(node):
    v, conv = node["$value"], node.get("$extensions", {}).get("carbon.layout", {}).get("converter")
    if conv == "miniUnits":
        return v * 8, f"{v:g} miniUnits x 8"
    if conv == "rem":
        return v, f"{v:g}px (rem converter)"
    if isinstance(v, str) and v.endswith("rem"):
        return float(v[:-3]) * 16, f"{v} x 16"
    if isinstance(v, str) and v.endswith("px"):
        return float(v[:-2]), v
    fail(f"unknown layout unit {node}")


TYPE_STYLES = {  # @carbon/type has no DTCG file; values from styles.ts/scale.ts/fontWeight.ts (bodyCompactNN = bodyShortNN)
    "body-compact-01": {"source": "packages/type/src/styles.ts#bodyShort01 (bodyCompact01 = bodyShort01)",
                         "fontSize": (14, "rem(scale02), scale02 = 14"), "lineHeight": 1.28572, "fontWeight": 400, "letterSpacing": 0.16},
    "body-compact-02": {"source": "packages/type/src/styles.ts#bodyShort02 (bodyCompact02 = bodyShort02)",
                         "fontSize": (16, "rem(scale03), scale03 = 16"), "lineHeight": 1.375, "fontWeight": 400, "letterSpacing": 0},
}


# ---------- CSS cross-check ----------

def css_blocks(css):
    blocks = {}
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sel = m.group(1).strip()
        for mode, _ in MODES:
            if sel == f".cds--{mode}":
                blocks[mode] = dict(re.findall(r"--cds-([a-z0-9-]+):\s*([^;]+)", m.group(2)))
    props = set(re.findall(r"--cds-([a-z0-9-]+):", css))
    return blocks, props


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--css", required=True, type=Path)
    ap.add_argument("--contract", action="append", required=True, type=Path)
    ap.add_argument("--layout-scss", type=Path, help="@carbon/layout package scss/generated dir; verifies Sass fallback names")
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args()

    contracts = [json.loads(p.read_text()) for p in args.contract]
    commits = {c["source"]["commit"] for c in contracts}
    if len(commits) != 1:
        fail(f"Contracts pin different commits {commits}; one Code Library version per foundations document")
    src0 = contracts[0]["source"]

    # 1. closure union
    uses, styles, used_by = {}, set(), {}
    for c in contracts:
        u, s = contract_uses(c)
        for t, need in u.items():
            uses.setdefault(t, set()).update(need)
            used_by.setdefault(t, set()).add(c["family"]["key"])
        for t in s:
            styles.add(t)
            used_by.setdefault(t, set()).add(c["family"]["key"])

    R = args.repo
    themes = flatten_theme(json.loads((R / "packages/themes/src/dtcg/themes.json").read_text()))
    comps = {k: (n, "packages/themes/src/dtcg/components/button.json" + p)
             for k, (n, p) in flatten_theme(json.loads((R / "packages/themes/src/dtcg/components/button.json").read_text())).items()}
    themes = {k: (n, "packages/themes/src/dtcg/themes.json" + p) for k, (n, p) in themes.items()}
    layout = flatten_layout(json.loads((R / "packages/layout/src/dtcg/layout.json").read_text()))
    pal = palette(json.loads((R / "packages/colors/src/dtcg/colors.json").read_text()))
    css_text = args.css.read_text()
    blocks, props = css_blocks(css_text)

    variables, notes, checks = {}, [], {"css": 0, "cssMissing": [], "scope": 0, "sass": 0}
    prims_needed = set()

    def code_syntax(name, sass):
        if name in props:
            return {"WEB": f"var(--cds-{name})"}
        if args.layout_scss:
            scss = "".join(f.read_text() for f in sorted(args.layout_scss.glob("*.scss")))
            if not re.search(rf"^\{sass}:", scss, re.M):
                fail(f"Sass fallback {sass} not found in {args.layout_scss}")
            checks["sass"] += 1
        notes.append({"level": "info", "at": f"variables.{name}.codeSyntax",
                      "message": f"No --cds-{name} custom property in compiled @carbon/styles; codeSyntax uses the Sass name {sass}."})
        return {"WEB": sass}

    # 2. theme + component colours
    for name in sorted(t for t in uses if t in themes or t in comps):
        node, ptr = comps.get(name) or themes[name]
        group = ptr.split("#/")[1].split("/")[0]
        mods = node["$extensions"].get("org.carbon", {}).get("alphaModifiers", {})
        values = {}
        for mode, _ in MODES:
            v = node["$extensions"]["carbon.themes"][mode]
            alpha = mods.get(mode)
            if isinstance(v, dict):
                v, alpha = v["value"], v["alpha"]
            if v.startswith("{"):
                key = palette_key(v)
                if key not in pal:
                    fail(f"{name}/{mode}: palette {key} missing")
                if alpha is None:
                    values[mode] = {"alias": key, "resolved": pal[key]}
                    prims_needed.add(key)
                else:
                    values[mode] = {"raw": pal[key], "alpha": alpha, "resolved": rgba_css(pal[key], alpha),
                                    "from": {"alias": key, "alpha": alpha}, "level": "info", "reason": ALPHA_REASON}
            else:
                near = [k for k, h in pal.items() if abs(int(h[1:], 16) - int(v[1:], 16)) <= 2]
                values[mode] = {"value": v.lower(), "resolved": v.lower(), "level": "info",
                                "reason": f"DTCG literal, not a palette alias; kept exact (nearest primitive {', '.join(f'{k} {pal[k]}' for k in near) or 'none'} differs)"}
            css_v = blocks.get(mode, {}).get(name)
            if css_v is None:
                checks["cssMissing"].append(f"{name}/{mode}")
            elif css_v.strip().lower() != values[mode]["resolved"]:
                fail(f"CSS mismatch {name}/{mode}: doc {values[mode]['resolved']} css {css_v}")
            else:
                checks["css"] += 1
        variables[name] = {"collection": "theme", "name": f"{title(group)}/{name}", "type": "COLOR", "source": ptr,
                           "scopes": theme_scopes(group, name), "codeSyntax": code_syntax(name, f"${name}"),
                           "values": values, "usedBy": sorted(used_by[name])}

    # 3. layout
    for name in sorted(t for t in layout if t in uses or layout[t][0] in FULL_SCALES):
        group, node, ptr = layout[name]
        fig_group, scopes = LAYOUT_GROUP[group]
        px, how = layout_px(node)
        root = re.search(rf"--cds-{name}:\s*([^;]+)", css_text)
        if root:  # spacing-* is emitted as rem; size/icon-size/border-radius are Sass-only
            got = root.group(1).strip()
            if not got.endswith("rem") or float(got[:-3]) * 16 != px:
                fail(f"CSS mismatch {name}: doc {px}px css {got}")
            checks["css"] += 1
        variables[name] = {"collection": "layout", "name": f"{fig_group}/{name}", "type": "FLOAT",
                           "source": "packages/layout/src/dtcg/layout.json" + ptr, "scopes": scopes,
                           "codeSyntax": code_syntax(name, f"${name}"),
                           "values": {"default": {"value": px, "from": how}}, "usedBy": sorted(used_by.get(name, ()))}

    unknown = set(uses) - set(variables)
    if unknown:
        fail(f"tokens not found in Carbon sources: {sorted(unknown)}")

    # 4. primitives (only the palette entries the closure aliases)
    for key in sorted(prims_needed):
        variables[key] = {"collection": "primitives", "name": primitive_name(key), "type": "COLOR",
                          "source": f"packages/colors/src/dtcg/colors.json#/{key.replace('.', '/')}",
                          "scopes": [], "hidden": True, "values": {"default": {"value": pal[key]}}}

    # 5. type variables + text styles
    text_styles = {}
    fam = "font-family-sans"
    if styles:
        variables[fam] = {"collection": "type", "name": f"Font family/{fam}", "type": "STRING",
                          "source": "packages/type/src/fontFamily.ts#sans", "scopes": ["FONT_FAMILY"], "codeSyntax": {},
                          "values": {"default": {"value": "IBM Plex Sans", "from": "first family of the sans stack"}},
                          "usedBy": sorted(set().union(*(used_by[s] for s in styles)))}
        notes.append({"level": "info", "at": f"variables.{fam}.codeSyntax",
                      "message": "Carbon emits no font-family custom property for body styles (they inherit); codeSyntax left empty."})
    for s in sorted(styles):
        if s not in TYPE_STYLES:
            fail(f"text style {s} has no @carbon/type entry in this prototype")
        t = TYPE_STYLES[s]
        size, size_from = t["fontSize"]
        lh_px = round(t["lineHeight"] * size)
        fields = {
            "font-size": ("fontSize", size, size_from, ["FONT_SIZE"], f"{size / 16:g}rem"),
            "line-height": ("lineHeight", lh_px, f"{t['lineHeight']} x {size} = {t['lineHeight'] * size:.4f}, rounded", ["LINE_HEIGHT"], f"{t['lineHeight']:g}"),
            "font-weight": ("fontWeight", t["fontWeight"], "fontWeight.ts regular", ["FONT_WEIGHT"], f"{t['fontWeight']}"),
            "letter-spacing": ("letterSpacing", t["letterSpacing"], "px", ["LETTER_SPACING"], f"{t['letterSpacing']:g}px" if t["letterSpacing"] else "0"),
        }
        binds = {"fontFamily": fam}
        for suffix, (field, val, how, scopes, css_expect) in fields.items():
            vname = f"{s}-{suffix}"
            root = re.search(rf"--cds-{vname}:\s*([^;]+)", css_text)
            if not root or root.group(1).strip() != css_expect:
                fail(f"CSS mismatch {vname}: expected {css_expect}, css {root and root.group(1)}")
            checks["css"] += 1
            variables[vname] = {"collection": "type", "name": f"{title(s.split('-')[0])}/{vname}", "type": "FLOAT",
                                "source": t["source"], "scopes": scopes, "codeSyntax": code_syntax(vname, f"${vname}"),
                                "values": {"default": {"value": val, "from": how}}, "usedBy": sorted(used_by[s])}
            binds[field] = vname
        text_styles[s] = {"name": f"{title(s.split('-')[0])}/{s}", "source": t["source"],
                          "fontFamily": "IBM Plex Sans", "fontStyle": "Regular", "fontSize": size, "lineHeight": {"unit": "PIXELS", "value": lh_px},
                          "fontWeight": t["fontWeight"], "letterSpacing": {"unit": "PIXELS", "value": t["letterSpacing"]},
                          "binds": binds, "usedBy": sorted(used_by[s])}

    # 6. scope check: every Contract use is inside the variable's scopes
    for t, need in uses.items():
        for n in need:
            if not covers(variables[t]["scopes"], n):
                fail(f"scope: {t} is used as {n} but scoped {variables[t]['scopes']}")
            checks["scope"] += 1

    # uniqueness: one flat-name namespace across variables and text styles
    clash = set(variables) & set(text_styles)
    if clash:
        fail(f"names used by both a variable and a text style: {clash}")
    names = [v["name"] for v in variables.values()]
    if len(names) != len(set(names)):
        fail("duplicate Figma variable names")

    files = {p: "sha256:" + sha(R / p) for p in FILES}
    manifest = "".join(f"{h[7:]}  {p}\n" for p, h in sorted(files.items()))
    doc = {
        "schemaVersion": 1,
        "designSystem": {"key": "carbon", "name": "Carbon"},
        "source": {
            "codeLibrary": src0["codeLibrary"], "adapter": src0["adapter"], "repository": src0["repository"],
            "tag": src0["tag"], "commit": src0["commit"],
            "packages": {k: src0["packages"][k] for k in ["@carbon/colors", "@carbon/layout", "@carbon/styles", "@carbon/themes", "@carbon/type"]},
            "files": files,
            "snapshotId": "sha256:" + hashlib.sha256(manifest.encode()).hexdigest(),
        },
        "closure": {
            "contracts": sorted(({"family": c["family"]["key"], "path": p.as_posix(), "snapshotId": c["source"]["snapshotId"]}
                                 for c, p in zip(contracts, args.contract)), key=lambda e: e["family"]),
            "tokens": sorted(set(uses) | styles),
            "fullScales": sorted(FULL_SCALES),
        },
        "collections": [
            {"key": "primitives", "name": "Primitives", "modes": [dict(key=k, label=l) for k, l in SINGLE], "hidden": True},
            {"key": "theme", "name": "Theme", "modes": [dict(key=k, label=l) for k, l in MODES]},
            {"key": "layout", "name": "Layout", "modes": [dict(key=k, label=l) for k, l in SINGLE]},
            {"key": "type", "name": "Type", "modes": [dict(key=k, label=l) for k, l in SINGLE]},
        ],
        "variables": dict(sorted(variables.items(), key=lambda kv: (["primitives", "theme", "layout", "type"].index(kv[1]["collection"]), kv[0]))),
        "textStyles": text_styles,
        "checks": {
            "css": {"against": "@carbon/styles@" + src0["packages"]["@carbon/styles"] + " css/styles.css",
                    "sha256": "sha256:" + sha(args.css), "matched": checks["css"], "missing": checks["cssMissing"]},
            "sass": {"against": "@carbon/layout@" + src0["packages"]["@carbon/layout"] + " scss/generated", "matched": checks["sass"]},
            "scopes": {"contractUses": checks["scope"], "outOfScope": 0},
        },
        "notes": notes + [
            {"level": "verify", "at": "textStyles.*.binds", "message": "Unverified: binding Type variables onto Text Styles through use_figma (fontWeight 400 selecting IBM Plex Sans Regular vs a fontStyle bind, px lineHeight/letterSpacing). Probe as an early build check. Fallback: bind the Type variables directly onto text nodes and skip Text Styles (#9 Q12 alternative)."},
            {"level": "info", "at": "variables.*-line-height", "message": "Carbon line heights are unitless (1.28572); Figma binds lineHeight in px, so the variable holds size x ratio rounded (18, 22). codeSyntax still names the unitless CSS property."},
        ],
    }
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        args.out.write_text(text)
    counts = {}
    for v in variables.values():
        counts[v["collection"]] = counts.get(v["collection"], 0) + 1
    print(f"closure {len(doc['closure']['tokens'])} tokens from {len(contracts)} Contract(s); variables {counts}; text styles {len(text_styles)}")
    print(f"css matched {checks['css']}, missing {checks['cssMissing']}; sass fallbacks {checks['sass']}; scope uses checked {checks['scope']}; doc {len(text)} chars")
    print("OK")


if __name__ == "__main__":
    main()
