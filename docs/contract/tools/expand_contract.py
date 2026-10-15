#!/usr/bin/env python3
"""Expand and check a Contract (component.json): expand_contract.py <component.json> [--table].

Checks: unique keys and labels, defaults valid, selection count, default tuple selected (Base Component),
every selected variant resolves the required layout/paint fields, raw values carry level+reason,
property binds name real anatomy nodes. Prints the token closure and, with --table, the resolved
Kind x State paint table.
"""
import itertools
import json
import sys

NINE_CLOSURE = {  # #9 resolution scope (Button token closure)
    "button-primary", "button-primary-hover", "button-primary-active",
    "button-secondary", "button-secondary-hover", "button-secondary-active",
    "button-tertiary", "button-tertiary-hover", "button-tertiary-active",
    "button-danger-primary", "button-danger-secondary", "button-danger-hover", "button-danger-active",
    "button-disabled", "button-separator",
    "text-on-color", "text-on-color-disabled", "text-disabled", "text-inverse",
    "icon-primary", "icon-on-color-disabled", "link-primary", "link-primary-hover",
    "background", "background-hover", "background-active", "background-selected",
    "layer-selected-disabled", "focus", "skeleton-background", "skeleton-element",
    "size-xs", "size-sm", "size-md", "size-lg", "size-xl", "size-2xl",
    "spacing-03", "spacing-05", "spacing-10", "icon-size-01", "icon-size-02", "border-radius-00",
    "body-compact-01", "body-compact-02",
}
REQUIRED = {
    "Button": {"layout": ["direction", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap", "minHeight"],
               "paint": ["fill", "stroke"]},
    "Label": {"layout": ["textStyle"], "paint": ["fill"]},
    "Icon": {"layout": ["width", "height"], "paint": []},
    "Glyph/Vector": {"layout": [], "paint": ["fill"]},
}


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def matches(pattern, variant):
    for axis, want in pattern.items():
        if axis not in variant:
            fail(f"pattern names unknown axis {axis}")
        if variant[axis] not in (want if isinstance(want, list) else [want]):
            return False
    return True


def resolve(rules, variant):
    out = {}
    for rule in rules:
        if matches(rule["match"], variant):
            for node, fields in rule["set"].items():
                out.setdefault(node, {}).update(fields)
    return out


def walk_values(obj, tokens, raws, path):
    if isinstance(obj, dict):
        if "token" in obj:
            tokens.add(obj["token"])
        if "raw" in obj:
            if obj.get("level") not in ("info", "warning") or not obj.get("reason"):
                fail(f"raw value without level/reason at {path}")
            raws.append((path, obj["raw"], obj["level"]))
        for k, v in obj.items():
            if k == "was":  # owner edit history (#8): the replaced value, not a live one
                continue
            walk_values(v, tokens, raws, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk_values(v, tokens, raws, f"{path}[{i}]")


def main():
    c = json.load(open(sys.argv[1]))
    if c.get("schemaVersion") != 1:
        fail("schemaVersion must be 1")
    axes = c["axes"]
    keys = [a["key"] for a in axes]
    if len(set(keys)) != len(keys):
        fail("duplicate axis keys")
    domain = {}
    for a in axes:
        vk = [v["key"] for v in a["values"]]
        vl = [v["label"] for v in a["values"]]
        if len(set(vk)) != len(vk) or len(set(vl)) != len(vl):
            fail(f"{a['key']}: duplicate value keys or labels")
        if any(ch in l for l in vl for ch in "=,"):
            fail(f"{a['key']}: label contains '=' or ','")
        if a["default"] not in vk:
            fail(f"{a['key']}: default not a value")
        domain[a["key"]] = vk
    full = [dict(zip(keys, t)) for t in itertools.product(*(domain[k] for k in keys))]
    for ex in c["excluded"]:
        if not ex.get("reason") or not ex.get("evidence"):
            fail("exclusion without reason/evidence")
    valid = [v for v in full if not any(matches(e["match"], v) for e in c["excluded"])]
    selected = [v for v in valid if not any(matches(o["match"], v) for o in c["selection"]["omit"])]
    default = {a["key"]: a["default"] for a in axes}
    print(f"domain {len(full)}  valid {len(valid)}  selected {len(selected)}  expectedCount {c['selection']['expectedCount']}")
    if len(selected) != c["selection"]["expectedCount"]:
        fail("expectedCount mismatch")
    if default not in selected:
        fail("default tuple (Base Component) is not selected")
    print("Base Component:", ", ".join(f"{a['label']}={next(v['label'] for v in a['values'] if v['key'] == a['default'])}" for a in axes))

    def anatomy_names(node, prefix=""):
        names = [node["name"]]
        for ch in node.get("children", []):
            names += anatomy_names(ch)
        return names
    nodes = set(anatomy_names(c["anatomy"]))
    for p in c["properties"]:
        for b in p["binds"]:
            if b["node"] not in nodes:
                fail(f"property {p['key']} binds unknown node {b['node']}")
        # BOOLEAN binds must cover every selected variant exactly once
        if p["type"] == "BOOLEAN":
            for v in selected:
                hits = [b for b in p["binds"] if matches(b.get("match", {}), v)]
                if len(hits) != 1:
                    fail(f"{p['key']}: {len(hits)} binds for {v}")

    tokens, raws = set(), []
    table = {}
    for v in selected:
        lay, pnt = resolve(c["layout"], v), resolve(c["paint"], v)
        for node, req in REQUIRED.items():
            for f in req["layout"]:
                if f not in lay.get(node, {}):
                    fail(f"{v}: layout {node}.{f} unresolved")
            for f in req["paint"]:
                if f not in pnt.get(node, {}):
                    fail(f"{v}: paint {node}.{f} unresolved")
        glyph = pnt["Glyph/Vector"]["fill"]
        if "sameAs" in glyph:
            ref_node, ref_field = glyph["sameAs"].split(".")
            pnt["Glyph/Vector"]["fill"] = pnt[ref_node][ref_field]
        walk_values(lay, tokens, raws, "layout")
        walk_values(pnt, tokens, raws, "paint")
        if v["size"] == "lg":
            def t(x):
                return x["token"] if isinstance(x, dict) else x
            b = pnt["Button"]
            table[(v["kind"], v["state"])] = (t(b["fill"]), t(b["stroke"]), t(pnt["Label"]["fill"]), t(pnt["Glyph/Vector"]["fill"]), len(b.get("effects", [])))
    print(f"\ntokens used ({len(tokens)}):", ", ".join(sorted(tokens)))
    print("\nadded vs #9 closure:", sorted(tokens - NINE_CLOSURE) or "none")
    print("in #9 closure but unused by Button:", sorted(NINE_CLOSURE - tokens))
    levels = {}
    for path, val, lvl in raws:
        levels.setdefault(lvl, set()).add((path.split(".", 2)[-1] if False else path, val))
    print("\nraw values (distinct path=value):")
    for lvl in sorted(levels):
        for path, val in sorted(levels[lvl], key=str):
            print(f"  {lvl:7} {path} = {val}")
    if "--table" in sys.argv:
        print("\nKind x State at Size=lg: fill | stroke | label | icon | effects")
        for (k, s), row in table.items():
            print(f"  {k:17} {s:9}", " | ".join(str(x) for x in row))
    print("\nOK")


if __name__ == "__main__":
    main()
