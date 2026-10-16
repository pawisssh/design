# PROTOTYPE: slot-dependent styling (#88)

Throwaway. This lives on the `prototype/slot-styling` branch only and is never merged.

**Question.** How does a Contract carry styling that depends on whether a slot is filled? shadcn/ui Button pads
`px-4` with no icon and `px-3` with one (`has-[>svg]:px-3`). A Figma BOOLEAN can only show or hide a layer, so it
cannot change the parent's padding.

**Verdict.** The Slot axis. The slot's presence is a non-canonical Property Axis (`icon`: `none` / `icon`, labels
`False` / `True`). The axis names its slot (`"slot": "Icon"`), and each value says whether the slot is filled
(`"filled": false|true`). Ordinary `{match, set}` rules then carry the padding. The slot's visibility is a layout
field (`Icon.visible`), and validation ties it to `filled`. The axis replaces that slot's BOOLEAN.

## Run

```
node prototypes/slot-styling/run.mjs
```

The script does four things:

- installs the pinned packages into `.scratch/prototype-slot-styling` with `npm ci --ignore-scripts`;
- compiles `vendor/button.tsx` with esbuild and Tailwind 4.3.3;
- writes the To-preview catalog to `.scratch/to-preview/button-shadcn-prototype/index.html`;
- adds a check script to the page, so you can run `window.__check()` in its console.

## What it showed (2026-10-17)

- **To-preview.** All 96 specimens match: 72 selected, plus the 24 omitted icon sizes with no icon.
  - The check compares each rendered shadcn Button against `resolve()` for its tuple: padding left and right,
    height, width, gap, whether the svg and the label are there, and the svg size.
  - The renderer needs one rule: a node renders unless the tuple's resolved layout sets `visible: false` on it.
    shadcn's own `has-[>svg]` CSS then picks the padding.
- **To-design.** The core needs no change.
  - `expectedVariant` moves `visible` layout fields into the variant wiring. The core already applies
    `spec.visible` per variant.
  - The 72 variants come out as 3 distinct wirings, and no `visible` is left in the layout fragments.
  - No Figma build was run. The open question was the Contract shape, not whether Figma can hide a layer per
    variant: the builder already does that for every variant.
- **Contract.** `npm test` runs 218 tests and all pass. 6 of them are new, for the Slot axis.

## Files

| File | What it is |
|---|---|
| `button.component.json` | shadcn Button Contract. Variant is narrowed to default and outline; state to enabled, hover and disabled |
| `shadcn.foundations.json` | Only the foundations this Contract binds |
| `preview.mjs` | To-preview renderer, shaped like an Adapter's `preview.mjs` |
| `run.mjs` | The run script above |
| `check.js` | The check that runs inside the page |
| `vendor/button.tsx` | `registry/new-york-v4/ui/button.tsx`, fetched from the live @shadcn registry with the shadcn 4.22.0 CLI. sha256 `79dd6f75…893bb`. MIT, © shadcn |
