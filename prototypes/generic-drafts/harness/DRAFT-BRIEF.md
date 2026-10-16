# Draft brief: the Generic Adapter's agent tier (prototype for pawisssh/design#65)

You are the agent half of a "Generic Adapter". A script has already read everything that standard formats give exactly. Your job is to draft **only what those formats leave out**, for three shadcn/ui Component Families: **button**, **card**, **alert**.

Work alone. Do not look at any other run's output, any git branch, or the internet. Read only these files (paths relative to `GD` = the folder that contains this brief's parent):

- `GD/library/components/ui/button.tsx`, `card.tsx`, `alert.tsx` (the installed Code Library source)
- `GD/library/app/globals.css`, `GD/library/components.json`
- `GD/out/exact.json`: the exact tier. `components.<f>.cvas` (cva axes, values, defaults), `components.<f>.slots` (each exported function: `dataSlot`, element, literal prop unions, destructured defaults, class strings), `compiled` (every class compiled by Tailwind 4.3.3 into CSS), `tokens` (CSS variables per mode).
- Background on what a Contract is: `REPO/skills/contract/references/contract-schema.md` and `REPO/skills/contract/references/adapter-guide.md` (sections 2–5). REPO is given in your task prompt.

## What is exact, so you must NOT draft it

- Axis keys, value keys, `default` and per-value `code` that cva `variants`/`defaultVariants` or a TS literal union with a destructured default give.
- Every CSS value (sizes, paddings, colours, opacities) in `compiled`. Token names are the CSS variable names without `--`.
- State values that map 1:1 from `hover:`, `focus-visible:`, `active:`, `disabled:`; attribute-state values from `aria-*` / `data-[state=*]`.

## What you draft

Emit one JSON object, keyed by a **stable key path**. Each entry is `{ "value": <your draft>, "evidence": [<"file:Lnn what it shows"> ...], "confidence": "high" | "medium" | "low" }`. Use exactly these key patterns; `<f>` is `button`, `card` or `alert`; `<node>` is the anatomy node's key (use the `data-slot` value when the node has one, otherwise a lowercase id you choose).

| Key | Value |
|---|---|
| `<f>.family.name` | Component Family name, Title Case |
| `<f>.family.description` | One sentence |
| `<f>.family.split` | `{ "families": [<keys>], "reason": "..." }` — whether this source file is one Component Family or several (for example: are Button's `icon*` sizes a separate Icon Button family? are Card's sub-components one family's anatomy or separate families?) |
| `<f>.axes.<axisKey>.label` | Figma property name, Title Case |
| `<f>.axes.<axisKey>.values.<valueKey>.label` | Figma value label, Title Case, no `=` or `,` |
| `<f>.axes.state.values` | the ordered list of canonical State values (`enabled, hover, active, focus, disabled`) this family's styles define |
| `<f>.axes.<attrAxisKey>` | for each non-canonical attribute-state axis you would add (`aria-invalid`, `aria-expanded`, ...): `{ "label": ..., "values": [{"key","label","code"}], "default": ... }`; `code` is the prop(s) that set it |
| `<f>.anatomy.<node>` | `{ "name": <Figma layer name>, "type": "COMPONENT"|"FRAME"|"TEXT"|"INSTANCE", "role": <short role>, "parent": <node key or null>, "order": <int among siblings> }` |
| `<f>.properties.<propKey>` | `{ "type": "TEXT"|"BOOLEAN"|"INSTANCE_SWAP", "label": ..., "default": ..., "binds": [<node keys>], "code": {...} }` |
| `<f>.textStyles.<node>` | `{ "name": <Text Style flat name>, "fontSize": <token>, "lineHeight": <token or value>, "fontWeight": <token>, "fontFamily": <token> }` |
| `<f>.layout.<node>.<field>` | only the Auto Layout fields that need interpretation, not a CSS value: `direction`, `width`, `height` (`hug`/`fill`/`fixed`), `alignMain`, `alignCross`, `textResize` |
| `<f>.excluded` | list of `{ "match": {...}, "reason": ... }` combinations the source makes impossible, or `[]` |
| `<f>.icons` | `{ "package": ..., "default": <icon key>, "preferred": [<icon keys>] }`, or `null` when the family has no icon slot |
| `<f>.figma.page`, `<f>.figma.componentSetName`, `<f>.figma.grid` | page name (plural), set name, `{ "columns": <axis key>, "rows": <axis key> }` |

Rules:
- Draft every key that applies; omit a key only when it cannot apply (no icon slot → `icons: null`, not omitted).
- Be faithful to the source; prefer the evidence the files give (`data-slot`, prop names, class strings) over taste.
- Slot-dependent styling (`has-[>svg]`, `has-data-[...]`, `[&_svg]`, `*:[svg]`) is an open question elsewhere; mention it only in evidence, do not invent axes for it.
- `confidence` is your honest estimate that a second, independent drafter would produce the same `value`.

Write the object, pretty-printed with 2-space indent and keys sorted alphabetically, to the output path given in your task prompt. Then reply with only the number of keys you wrote.
