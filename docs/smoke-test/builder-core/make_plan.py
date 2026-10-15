#!/usr/bin/env python3
"""Generate a smoke-test build plan: make_plan.py <out.json> <slice> <sizes,comma> [--font Family/Style] [--x N]."""
import argparse
import json

KINDS = ["primary", "secondary", "tertiary", "ghost", "danger"]
STATES = ["default", "hover", "active", "disabled"]
SIZES = {"sm": 32, "md": 40, "lg": 48, "xl": 64, "2xl": 80}
# Approximate Carbon White / G100 values; smoke test only, not the token mapping (see the Carbon-tokens ticket).
BG = {
    "primary": [("#0f62fe", "#0f62fe"), ("#0050e6", "#0050e6"), ("#002d9c", "#002d9c")],
    "secondary": [("#393939", "#6f6f6f"), ("#474747", "#5e5e5e"), ("#6f6f6f", "#393939")],
    "tertiary": [("#ffffff", "#161616"), ("#0050e6", "#f4f4f4"), ("#002d9c", "#c6c6c6")],
    "ghost": [("#ffffff", "#161616"), ("#e8e8e8", "#333333"), ("#c6c6c6", "#525252")],
    "danger": [("#da1e28", "#da1e28"), ("#b81921", "#b81921"), ("#750e13", "#750e13")],
}
TEXT = {"primary": ("#ffffff", "#ffffff"), "secondary": ("#ffffff", "#ffffff"), "tertiary": ("#0f62fe", "#ffffff"),
        "ghost": ("#0f62fe", "#78a9ff"), "danger": ("#ffffff", "#ffffff")}


def colors():
    out = {}
    for k in KINDS:
        for i, s in enumerate(STATES):
            w, g = BG[k][i] if s != "disabled" else ("#c6c6c6", "#525252")
            out[f"button/{k}/{s}/bg"] = {"css": f"button-{k}-{s}", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"White": w, "G100": g}}
        w, g = TEXT[k]
        out[f"button/{k}/text"] = {"css": f"text-on-{k}", "scopes": ["TEXT_FILL"], "values": {"White": w, "G100": g}}
    out["button/disabled/text"] = {"css": "text-on-color-disabled", "scopes": ["TEXT_FILL"], "values": {"White": "#8d8d8d", "G100": "#8d8d8d"}}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("slice")
    ap.add_argument("sizes")
    ap.add_argument("--font", default="Inter/Regular")
    ap.add_argument("--x", type=int, default=400)
    ap.add_argument("--on-existing", default="rebuild")
    a = ap.parse_args()
    sizes = a.sizes.split(",")
    entries = [{"specimenId": f"button:{k}:{s}:{st}", "familyId": "button", "themeId": "white",
                "properties": {"kind": k, "size": s, "state": st}}
               for k in KINDS for s in sizes for st in STATES]
    family, style = a.font.split("/")
    plan = {
        "schemaVersion": 1, "snapshotId": "carbon-react@v11.118.0", "slice": a.slice, "page": "Smoke test",
        "origin": {"x": a.x, "y": 100}, "onExisting": a.on_existing, "font": {"family": family, "style": style},
        "selection": {"schemaVersion": 1, "snapshotId": "carbon-react@v11.118.0", "selectedFamilies": ["button"], "entries": entries},
        "foundations": {"collection": "Smoke / Button", "modes": ["White", "G100"], "colors": colors()},
        "families": [{"id": "button", "name": "Button", "axes": ["kind", "size", "state"],
                      "description": "Smoke-test Button Component Set (Carbon v11 pilot).",
                      "sizes": {s: {"height": SIZES[s], "paddingRight": 64 if s != "sm" else 32} for s in SIZES}}],
    }
    with open(a.out, "w") as fh:
        json.dump(plan, fh, indent=1)


if __name__ == "__main__":
    main()
