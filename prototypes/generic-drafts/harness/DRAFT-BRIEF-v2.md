# Draft brief v2: the Generic Adapter's agent tier, with keying rules (prototype for pawisssh/design#65)

You are the agent half of a "Generic Adapter". A script has already read everything that standard formats give exactly. Your job is to draft **only what those formats leave out**, for three shadcn/ui Component Families: **button**, **card**, **alert**.

Work alone. Do not look at any other run's output, any git branch, or the internet. Read only these files (`GD` = the folder that contains this brief's parent):

- `GD/library/components/ui/button.tsx`, `card.tsx`, `alert.tsx` (the installed Code Library source)
- `GD/library/app/globals.css`, `GD/library/components.json`
- `GD/out/exact.json`: the exact tier. `components.<f>.cvas` (cva axes, values, defaults), `components.<f>.slots` (each exported function: `dataSlot`, element, literal prop unions, destructured defaults, class strings), `compiled` (every class compiled by Tailwind 4.3.3 into CSS), `tokens` (CSS variables per mode).
- Background on what a Contract is: `REPO/skills/contract/references/contract-schema.md` and `REPO/skills/contract/references/adapter-guide.md` (sections 2–5). REPO is given in your task prompt.

## Not yours: exact, or derived by a fixed rule

Do not emit these; a script writes them.
- Axis keys, value keys, `default` and per-value `code` from cva or a TS literal union; State axis values from `hover:`/`focus-visible:`/`active:`/`disabled:`; attribute-state values from `aria-*`/`data-[state=*]`; every CSS value in `compiled`.
- Family name (the exported root function), Figma page and Component Set name, the canonical State axis label, Text Style composition.

## Keys are fixed by rule, never chosen

- **Node key** `<node>`: the node's `data-slot` value. A node with no `data-slot` takes the token the source uses to address it: `data-icon=inline-start` → `inline-start`, `data-icon=inline-end` → `inline-end`, `>svg` / `[&_svg]` / `*:[svg]` → `svg`, the root's text children → `children`. A wrapper the source does not have (you add it only for Auto Layout) is keyed `wrap-<key of its first child>`.
- **Property key** `<prop>`: `<node>.<field>` of the node it binds, `field` being `characters` (TEXT), `visible` (BOOLEAN) or `mainComponent` (INSTANCE_SWAP). A BOOLEAN that binds several nodes uses the first in anatomy order.
- **Attribute axis key**: the attribute name (`aria-invalid`, `aria-expanded`, `data-state`).

## What you draft

One JSON object, keyed by these patterns; each entry is `{ "value": <draft>, "evidence": [<"file:Lnn what it shows">...], "confidence": "high" | "medium" | "low" }`. `<f>` is `button`, `card` or `alert`. Put reasons in `evidence`, never in `value`.

| Key | Value |
|---|---|
| `<f>.family.description` | one sentence (prose) |
| `<f>.family.split` | the sorted list of Component Family keys this source file becomes (for example `["button"]` or `["button", "icon-button"]`) |
| `<f>.axes.<axisKey>.label` | Figma property name, Title Case, for each cva/TS axis |
| `<f>.axes.<axisKey>.values.<valueKey>.label` | Figma value label, Title Case, no `=` or `,` |
| `<f>.axes.<attr>` | each non-canonical attribute-state axis you would add: `{ "label", "values": [{"key","label","code"}], "default" }` |
| `<f>.anatomy.<node>` | `{ "name": <Figma layer name>, "type": "COMPONENT"\|"FRAME"\|"TEXT"\|"INSTANCE", "role": "root"\|"container"\|"text"\|"icon"\|"slot", "parent": <node key or null>, "order": <int among siblings> }` |
| `<f>.properties.<prop>` | `{ "type": "TEXT"\|"BOOLEAN"\|"INSTANCE_SWAP", "label", "default", "binds": [<node keys>], "code": {...} }` |
| `<f>.layout.<node>.<field>` | **every** field for the node's type: COMPONENT/FRAME `direction`, `width`, `height`, `alignMain`, `alignCross`; TEXT `width`, `height`, `textResize`. INSTANCE nodes have none. Values: `direction` `row`/`column`; `width`/`height` `hug`/`fill`/`fixed`; `align*` `start`/`center`/`end`/`space-between`; `textResize` `width-and-height`/`height`/`none` |
| `<f>.excluded` | list of `{ "match": {...} }` combinations the source makes impossible, or `[]` |
| `<f>.icons` | `{ "package", "default": <icon key>, "preferred": [<icon keys>] }`, or `null` when the family has no icon slot |
| `<f>.figma.grid` | `{ "columns": <axis key>, "rows": <axis key or null> }` |

Rules:
- Draft every key that applies; `icons: null` rather than omitted.
- Be faithful to the source; prefer what the files give (`data-slot`, prop names, class strings) over taste.
- Slot-dependent styling (`has-[>svg]`, `has-data-[...]`, `[&_svg]`, `*:[svg]`) is an open question elsewhere; mention it only in evidence, do not invent axes for it.
- `confidence` is your honest estimate that a second, independent drafter would produce the same `value`.

Write the object, 2-space indent, keys sorted alphabetically, to the output path in your task prompt. Reply with only the number of keys you wrote.
