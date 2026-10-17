---
name: adapter-generic
description: Generic Adapter for shadcn/ui-style Code Libraries, from a consumer's installed project (components.json, its global CSS, its lockfile) to the Foundations document and draft component Contracts. Use when creating or refreshing the shadcn foundations document or a shadcn component Contract.
---

# Generic Adapter

The Adapter for Code Libraries a consumer installs as source and themes with CSS custom properties and Tailwind v4, starting with shadcn/ui (spec [#103](https://github.com/pawisssh/design/issues/103)). It is a sibling of the [Carbon Adapter](../adapter-carbon/SKILL.md) with the same outputs. What a Foundations document must contain is defined in the shared [`contract`](../contract/SKILL.md) skill's [foundations schema](../contract/references/foundations-schema.md); this skill only knows how to read the project.

Today it has the exact tier: the Foundations step ([#118](https://github.com/pawisssh/design/issues/118)), the component step ([#119](https://github.com/pawisssh/design/issues/119)), Synthesized tokens ([#120](https://github.com/pawisssh/design/issues/120)) and Slot axes ([#121](https://github.com/pawisssh/design/issues/121)), and the agent tier's first keys ([#122](https://github.com/pawisssh/design/issues/122)): axis and value labels, the Figma grid and the family description. It reads Button, Card and Alert, and has a [preview renderer](#4-preview-renderer) and a To-handoff module ([#123](https://github.com/pawisssh/design/issues/123)). The rest of the agent tier is later tickets.

## Inputs

- **A consumer project:** `components.json` (which CSS file, and the `ui` alias), that global CSS, `package-lock.json` (the versions the project resolves) and the component sources under the `ui` alias. Registry `bases/*` are never read.
- **The reference project** is [`fixtures/radix-nova/`](fixtures/radix-nova/): a shadcn 4.22.0 radix-nova project, as source plus lockfile. See its NOTICE.

## 1. Fetch the tools

```
node skills/adapter-generic/scripts/sources.mjs
```

[`scripts/sources.mjs`](scripts/sources.mjs) pins `tailwindcss@4.3.3`, `typescript@6.0.3`, `shadcn@4.22.0` and `tw-animate-css@1.4.0`. It fetches each npm tarball into gitignored `.scratch/adapter-generic/tools/`, checks it against its registry sha512 `integrity`, and extracts only the named members with `tar`. Nothing is installed and no lifecycle script runs.

- `shadcn` and `tw-animate-css` are read only as stylesheets, because the project's CSS imports them.
- `typescript` is read only as a parser: the component step reads each component file's AST and never type-checks or runs it.

The command then fetches the [preview renderer](#4-preview-renderer)'s packages. Done when it prints `Generic Adapter tools OK` and `Generic preview packages OK`.

The reading tier (steps 2 and 3) executes only Tailwind's own compiler, over the project's CSS ([`scripts/tailwind.mjs`](scripts/tailwind.mjs)):

- `compile()` from the pinned `tailwindcss` runs with no bundler.
- A plain file loader resolves each `@import`:
  - a relative path inside the project;
  - or a pinned stylesheet package, through its `exports` map. That is the `style` condition for `tailwindcss` and `tw-animate-css`, and the plain `./tailwind.css` path for `shadcn/tailwind.css`.
- `loadModule` refuses, so a `@plugin` or `@config` fails, naming it.

## 2. Foundations step

```
node skills/adapter-generic/scripts/foundations.mjs [--project <dir>] [--tools <dir>] [--family <key>]... [-o <file>]
```

It reads the reference project and the fetched tools by default, and writes [`design-systems/shadcn/shadcn.foundations.json`](../../design-systems/shadcn/shadcn.foundations.json).

- Never edit that file by hand. Change the project, the pins or a rule here, and regenerate.
- A rerun is byte-identical.
- The seam is `generate({project, families, drafts})`. `drafts` must be empty: a Foundations document holds no Drafted values (ADR 0010), and no drafted key changes a token.
- **Families.** `--family` repeats; by default it is every family with a committed Contract in `design-systems/shadcn/contracts/`. One run writes the Code Library tokens and every family's [Synthesized tokens](#synthesized-tokens) (#70 §1): for each family it reads the component the way the component step does, adds its Synthesized tokens and its component file (so editing the file makes the document stale), and builds its Contract against the result. That Contract fills `closure.contracts`, `closure.tokens`, each token's `usedBy` and `checks.scopes` (`contract.mjs validate`, rule 6, with no errors).

### Modes

| Selector | Mode key | Label |
|---|---|---|
| `:root` | `light` | Light (default) |
| `.dark` | `dark` | Dark |

- Dark records its `selector`, `.dark`. Light records none: `:root` is the page itself, and To-preview and To-handoff apply a Mode as one class (#109), so the renderer's `modeClass` gives Light an inert class.
- A property that `.dark` does not declare inherits its `:root` value.
- A property declared only in `.dark`, or under any other selector, gets a `warning` note and is not read.

### Theme collection: colours

Every colour custom property in `:root` becomes a COLOR variable in the `theme` collection.

- **Conversion.** Each mode value goes through the shared converter, [`color.mjs`](../contract/scripts/color.mjs) `convert`, and nowhere else.
  - `from.css` keeps the declared text.
  - A value with alpha 1 is `{value, resolved}`.
  - A value with alpha is `{raw, alpha, resolved: rgba(…)}`, because the builder writes alpha only from `raw`.
  - A clipped value adds `level: "info"`, `reason: "outside sRGB, clipped per channel"`.
- **Naming and code syntax.**
  - The flat name is the property name without `--`.
  - `codeSyntax.WEB` is `var(--<name>)`, which is what Tailwind compiles for `bg-<name>` under `@theme inline`.
  - The Figma name is `Color/<name>`, or `<Family>/<name>` for a component token.
- **Scopes** come from the role table.
- **Component tokens.** A colour whose first name segment is a shadcn component family carries `family`: `sidebar`, `sidebar-*` → `sidebar` and `chart-*` → `chart`.
- **Failures.** Generation fails on:
  - a value the converter cannot read, such as relative colour syntax, naming the property;
  - a property whose value is `var(…)` (aliases between theme properties are not read yet);
  - a `@theme --color-*` that refers to a property no mode declares.

### Layout collection

The `layout` collection has one `default` mode.

- **Spacing:**
  - One FLOAT per step of Tailwind's classic named scale: 0, px, 0.5 to 4 by 0.5, 5 to 12, 14, 16, 20 to 64 by 4, 72, 80 and 96.
  - The flat name is `spacing-<step>`, with `.` written `_`.
  - The value is step × `--spacing`, with `from: {multiplier: "--spacing", factor}`, and `spacing-px` is 1.
  - `--spacing` comes from the project's `@theme`, or else from the pinned `tailwindcss/theme.css` (0.25rem = 4 px).
  - Scopes are `GAP` and `WIDTH_HEIGHT`, and the Figma group is `Spacing`.
- **Radius:** each `@theme --radius-<k>` becomes `radius-<k>`.
  - Its value is `calc(var(--radius) * f)` or `var(--radius)` over the `:root` `--radius`, with `from: {multiplier: "--radius", factor}`.
  - Scope is `CORNER_RADIUS`, and the Figma group is `Radius`.
- **Multipliers** (`--spacing`, `--radius`) are not variables. Each would duplicate a step as a match candidate (#70 §3).
- **Non-colour mode properties** must hold one value in every mode, or generation fails, naming the property.

### Compiled cross-check

Every variable with a utility is compiled with Tailwind in one `build()`: `bg-<name>`, `rounded-<k>` and `p-<step>`.

- Its declaration is the `codeSyntax.WEB`, for example `calc(var(--spacing) * 1.5)`, `calc(var(--radius) * 0.6)`, `1px` or `0px`.
- A COLOR must compile to `var(--<name>)`.
- A FLOAT's compiled expression is evaluated to px and must equal the document value.
- `checks.compiled.matched` counts them, and a mismatch fails generation.

### Role table

| `@theme` key | Figma type | Scopes | Utility compiled |
|---|---|---|---|
| `--color-<k>: var(--<name>)` | COLOR | `ALL_FILLS`, `EFFECT_COLOR`, `STROKE_COLOR`: every Tailwind colour feeds `bg-`, `text-`, `border-`, `ring-` and `shadow-` | `bg-<k>` |
| `--radius-<k>` | FLOAT | `CORNER_RADIUS` | `rounded-<k>` |
| `--spacing` | (multiplier) | steps: `GAP`, `WIDTH_HEIGHT` | `p-<step>` |
| `--font-<k>` | not carried | info note: the fixture's fonts are set at runtime by next/font | |
| anything else | not carried | warning note | |

A literal `@theme --color-*` (not `var(…)`) gets a warning note and is not carried yet.

### Not carried (notes in the document)

- **Tailwind's default theme.** Its palette, fonts and shadows are not carried. Only the project's own CSS is read.
- **Fonts.** In the fixture, `--font-sans` and `--font-mono` refer to next/font variables set at runtime.

## 3. Component step

```
node skills/adapter-generic/scripts/components.mjs --family <key> [--project <dir>] [--foundations <file>] [--tools <dir>] [-o <file>]
  [--drafts <file>] [--requests <file>] [--rewrite]
```

It reads one component family of the project, `<ui alias>/<key>.tsx`, and writes the draft Contract `design-systems/shadcn/contracts/<key>.component.json`. It checks the Contract with [`contract.mjs`](../contract/scripts/contract.mjs) `validate` and writes it with [`io.mjs`](../contract/scripts/io.mjs) `writeJson`. A rerun writes nothing when nothing changed. The seams are `readFamily({project, family, foundations})` (the exact-tier reading, with the family's Synthesized tokens) and `generate({project, family, foundations, prior, drafts})`, which merges the [Drafted values](#agent-tier-drafted-values).

- **Snapshot.** The Foundations document must be from this project's snapshot: every file in its `source.files` must hash the same, or the step fails with "another snapshot". The Contract's `source.files` are the document's, minus other families' component files, plus its own. Its `source.packages` are the document's, plus the [preview renderer](#4-preview-renderer)'s packages at the versions the project's lockfile resolves, plus the component's import path, pinned to its file's hash (`"@/components/ui/card": "sha256:…"`): the component is a project module, not a package, and To-preview reads `source.packages[code.package]`.
- **Synthesized tokens.** The document must hold exactly the family's Synthesized tokens as its source reads now, and a closure entry with the Contract's `snapshotId`. Otherwise the step fails, naming the tokens and the fix: regenerate with `foundations.mjs --family <key>`.
- **Source** ([`scripts/source.mjs`](scripts/source.mjs)). From the TypeScript AST: every `cva(base, {variants, defaultVariants, compoundVariants})` and every top-level function component, with its element (also through `const Comp = asChild ? Slot.Root : "button"`), `data-slot`, the attributes it sets from props (`data-size={size}`), its destructured defaults and its class lists, each with its line. The root is the export named after the family (`button` → `Button`). A family with `compoundVariants` fails.
- **A root with no cva** (Card) is one variant: its className is its base. A prop it sets as an attribute that no axis reads (Card's `data-size={size}`) keeps its default, and its rules under another value are a note, not carried.
- **Parts.** Every other exported component is a part (CardHeader, AlertTitle): a FRAME under the root named by rule (#103): its `data-slot` without the family prefix, in Title Case (`card-header` → `Header`), in source order, whatever its real nesting. Only its size is read: `width` and `height` from its own utilities, else across the root's direction it fills where the root stretches and its `align-self` allows (`self-start` hugs), and along it hugs unless it grows. A part with `position: absolute` or `fixed` (AlertAction) is left out, with its slot utilities, in a note. A `has-data-[slot=<part>]` rule is a [Slot axis](#slot-axes) over that part, so Card's Footer shows only where its axis is filled.
- **Cascade** ([`scripts/cascade.mjs`](scripts/cascade.mjs)). Every class is compiled with Tailwind in one `build()`. The utilities layer is read, and the base layer only for its `*` border colour. An `@supports` branch replaces the fallback it guards. A custom property a utility sets on the root (`--card-spacing`) is substituted where a length reads it. Each rule is sorted by its compiled selector:
  - a Mode, from `:is(<mode selector> *)`;
  - a canonical state: `:hover` (inside `@media (hover: hover)`), `:focus-visible` and `:focus` → `focus`, `:active`, and `:disabled` with its other spellings `[aria-disabled="true"]` and `[data-disabled]`;
  - an attribute the component sets from a prop (`[data-size="sm"]`), which is that prop's value;
  - any other attribute (`[aria-invalid="true"]`), which must be in the attribute table below;
  - a filled slot, `:has([<attr>="<value>"])` (`has-data-[icon=inline-start]:pl-2`), which is a [Slot axis](#slot-axes). Any other `:has(…)` is noted, not carried.

  Specificity counts `:is`, `:not` and `:has` as their most specific argument and `:where` as nothing. The winner per property is the highest specificity, then the latest rule in the output.
- **Merging.** Before the cascade, each variant's classes are merged the way `cn()` merges them. This is modelled; no package code runs. A later class drops an earlier one that has the same variants and whose CSS properties it covers (`rounded-[min(…)]` drops `rounded-lg`). It also drops an earlier class when both set a font size, as tailwind-merge's font-size group does (`text-[0.8rem]` drops `text-sm`). No other class group is modelled. The Contract notes each drop.

### Axes

In order: each cva variant axis, then the attribute axes, then the Slot axes, then the canonical State.

- **cva axes.** Keys and values are the code's, and their labels are [Drafted values](#agent-tier-drafted-values) (`xs` → `Extra Small`). Each value's `code` is `{<axis>: <value>}`. The default comes from `defaultVariants`, or else from the destructured default.
- **Attribute axes.** Each is absent by default:

  | Attribute | Axis | Values |
  |---|---|---|
  | `aria-invalid="true"` | `invalid` | `valid`, `invalid` |
  | `aria-expanded="true"` | `expanded` | `collapsed`, `expanded` |

  Any other attribute state fails, naming the utility.
- **Slot axes.** See [Slot axes](#slot-axes).
- **State.** `enabled`, then each of `hover`, `active`, `focus` and `disabled` that a carried rule uses. `css` lists the selectors the CSS uses for that state, joined with ", ". `disabled` is `{disabled: true}` on a native control, else the attribute.
- **Selection.** An attribute axis changes only the variants whose classes style that attribute, so `selection.omit` drops its on value everywhere else: those variants would be twins of their off value. The omit is read from the source, never listed by hand. Button omits `expanded` for `variant` `default`, `destructive` and `link`, which have no `aria-expanded:` utility: 768 − 192 = 576, and its two Slot axes make that 2304 variants. Nothing else is cut. Past ADR 0004's ~600 variants after the omit, a `verify` note says so, as it does for Button.

### Layout and paint of the root

| CSS | Field |
|---|---|
| `display: flex` or `inline-flex`, `flex-direction` | `direction` |
| `display: grid` or `inline-grid` with no `grid-template-columns` and a row flow | `direction: column`; explicit columns or a column flow fail, naming the utility |
| `justify-content`, `align-items` (a grid: `align-content`, `justify-items`) | `alignMain`, `alignCross` |
| `width`, `height` | `width`, `height`; `100%` is `fill`. Absent width is `fill` for a block-level root (`flex`, `grid`) and `hug` for an inline one; absent height is `hug` |
| `gap` (a grid: `row-gap`; a flex row: `column-gap`) | `gap`; absent is `spacing-0` |
| `padding*` | `padding*`, plus the border width as a derived `info` raw, because an inside stroke takes no layout space |
| `border-radius` | `radius` |
| `border-width` | `strokeWeight` (raw), `strokeAlign: inside` |
| `background-color`, `border-color` | `fill`, `stroke`; `transparent` and absent are `none` |
| `opacity` | `opacity` |
| `--tw-ring-shadow` + `--tw-ring-color` | `effects`: one `drop-shadow` with the ring width as `spread` |

- **Lengths.** A length is the Foundations variable whose `codeSyntax.WEB` is the compiled text and whose scopes cover the field. Otherwise it is evaluated to px (`var`, `calc`, `min`, `max`) as an `info` raw that names the utility.
- **Base border.** A border with no `border-color` utility takes the project's base layer `* { border-color }` (`border-border`), with a note.
- **Colours.** `var(--<name>)` is that COLOR variable. A literal goes through [`color.mjs`](../contract/scripts/color.mjs) `convert` and is a `warning` raw. A colour that differs by Mode, carries an opacity or is a `color-mix` is a [Synthesized token](#synthesized-tokens).
- **Rules.** For each field, the step finds the fewest axes its value depends on. The Base Component's value goes in `{}`. Rules follow fewest axes first, then in axis order, and a later rule wins. A rule is added where the rules so far give its anchor (that value combination, every other axis at its default) the wrong value, and that value holds for at least half of the anchor and its neighbours one axis away. A rule over every remaining axis is always added when needed. Rules on the same axes are merged while two differ in one axis alone. A self-check confirms `resolve()` gives back every variant.
- **Fails:**
  - layout, an opacity or an effect's shape (anything but its colour) that differs by Mode, naming the utility;
  - a ring with no colour.

### Slot axes

A slot whose presence changes the root ([ADR 0011](../../docs/adr/0011-slot-dependent-styling-becomes-a-slot-axis.md), #121) is a Slot axis over a FRAME the root holds. Button's `has-data-[icon=inline-start]:pl-2` compiles to `:has([data-icon="inline-start"])`.

- **Axis.** One per attribute selector a carried rule needs, keyed `<attr without data->-<value>` (`icon-inline-start`), labelled in Title Case, with `slot` the node of the same name (`Icon Inline Start`). Its values are `none` (`False`, `filled: false`, `css: :not(:has(…))`) and the key (`True`, `filled: true`, `css: :has(…)`), both with `code: {}`, and `none` is the default. Slots on the logical sides come start first, then end; any other slot follows by key.
- **Padding.** A slot rule applies where its axis is filled, and wins the cascade by its specificity: Default `px-2.5` with `has-data-[icon=inline-start]:pl-2` is 10 → 8 px of CSS, recorded as 11 → 9 with the border; xs is 8 → 6 (9 → 7), sm 10 → 6 (11 → 7). The icon sizes have no slot utility, so their padding stays the same, but a filled slot still shows its frame there, so it is no twin. An icon size with both slots empty is an empty square; the exact tier cuts only twins, so it stays selected for the owner to omit in To-preview.
- **Against ADR 0011.** The ADR's example is new-york-v4's single `has-[>svg]:px-3` slot (192 → 288 variants with the empty icon-only squares omitted). radix-nova marks its slots with `data-icon`, so Button has two Slot axes and 2304 variants, and `:has(>svg)`, which names no slot, stays a note.
- **Frame.** Each slot node is a FRAME (role `icon`) whose `width` and `height` come from the descendant svg size utilities (`[&_svg:not([class*='size-'])]:size-4`, `size-3` in xs and icon-xs, `size-3.5` in sm), merged as `cn()` merges them, and whose `visible` is the axis value's `filled`. A note says that a consumer `size-*` class on the svg overrides the size (off-axis) and that the frame stands in for the icon instance and its INSTANCE_SWAP with `code.visibleWhen: {axis}`, which are left for a later agent-tier ticket: the exact tier has no icon to name as `icons.default`. Other descendant utilities (`[&_svg]:shrink-0`) stay notes.
- **Fails:** a slot selector with an empty value; a slot no svg size utility sizes; a frame size that differs by Mode.

### Synthesized tokens

Paint the Foundations tokens cannot bind directly becomes a Synthesized token (#70, #120): a per-mode COLOR in the `theme` collection that the Contract binds as a plain `{token}`. That is paint that differs by Mode (`bg-background dark:bg-input/30`), a token at an opacity (`bg-primary/80`) or a `color-mix` of tokens. A value that is the same plain token in every Mode stays that token.

- **Name.** `<family>-<the rule's match values in axis order, a list joined by "+">[-<node>]-<field>`, with the node left out for the root and the field `fill`, `stroke`, `effect` or `effect-<n>`. The Figma name is `<Family>/<name>`, for example `Button/button-outline-fill`.
- **Per-mode value.** Each Mode's winning utility is converted through [`color.mjs`](../contract/scripts/color.mjs), `color-mix` included:
  - `var(--x)` is flattened to that token's own value in the Mode: `{raw, alpha?, resolved, from: {alias: "x"}}` with an `info` reason. This is the #103 fallback: the builder core does not bind an alias within one collection yet (#124). `from.alias` keeps the alias so a later pass can bind it instead.
  - `x / N` (Tailwind's `color-mix(in oklab, var(--x) N%, transparent)`) is that value with its alpha multiplied by N%: `{raw, alpha, resolved, from: {alias, alpha}}`, because a Figma alias cannot carry alpha. Dark `bg-input/30` over a 15% white `--input` is alpha 0.045.
  - Any other `color-mix` is evaluated over each token's CSS in that Mode: `{raw, alpha?, resolved, from: {mix}}`.
  - A literal is the literal form, and `none` is transparent black.
- **Metadata.** `source` is `synthesized: <file>:<lines> <utilities>`, `codeSyntax.WEB` the utilities in source order, `family` and `usedBy` the family, and `scopes` only the one its use needs (`FRAME_FILL`, `STROKE_COLOR` or `EFFECT_COLOR`).
- **Order.** In the document a collection's Code Library tokens come first, then the Synthesized ones, each by name.
- **Fails:**
  - a name a Code Library token already has, naming both;
  - a name two families both derive, naming both;
  - relative colour syntax, which the converter cannot read, naming the utility.

### Agent tier: Drafted values

A value that neither the source nor a rule here states is drafted by an agent. The value sits in its usual place in the Contract, and the `drafted` table records where it came from ([ADR 0010](../../docs/adr/0010-drafted-values-carry-over-by-evidence-fingerprint.md), [contract schema](../contract/references/contract-schema.md#drafted-values)). [`scripts/drafts.mjs`](scripts/drafts.mjs) owns the rules.

- **What is drafted.** Keys, evidence and fingerprints are fixed by rule; the agent supplies only the value.

  | Key | Evidence | Fingerprint pins |
  |---|---|---|
  | `axes.<cva axis>.label`, `axes.<cva axis>.values.<value>.label` | the line of the axis or value key | the axis's value keys |
  | `axes.<attribute axis>.label` | the first utility that styles the attribute | the variant prefixes of its utilities (`aria-invalid`, `dark:aria-invalid`) |
  | `family.description`, `figma.grid` | the root export and the cva variants | every axis's key, value keys and default; the exported parts |

  Slot and State axis labels and an attribute axis's value labels (its state words) are rules, so they are not drafted.
- **Placeholders.** The Foundations step builds the Contract only for its closure, without drafts. That Contract keeps placeholders: Title Case labels, `size` across in the grid, and a description that names the source file.
- **A run** reads the prior Contract at `-o` and, per key:
  - an owner entry is kept with its value. When the snapshot changed it is also listed under `ownerCheck`, because an owner entry has no fingerprint to show whether its evidence moved. An owner value the key no longer accepts, such as a grid without a new axis, is reopened and listed under `ownerCheck`;
  - an agent entry whose fingerprint is unchanged is carried verbatim;
  - a moved fingerprint reopens the entry, and a key with no entry is missing. Each takes its value from `--drafts`, or is requested;
  - a prior entry whose subject is gone, such as a renamed axis value's label, is dropped and listed as vanished. An owner entry is dropped too, since every key must name a value (rule 9).
  - a carried entry keeps its evidence verbatim, line numbers included, so a line that moved without moving the fingerprint is not rewritten.
- **Requests.** While one is open, the CLI writes no Contract. It writes `{family, requests: [{key, evidence, fingerprint, brief, prior}]}` to `--requests` (default `.scratch/adapter-generic/drafts/<key>.requests.json`) and exits 2. A reopened request carries `prior` and asks to keep it unless the new evidence contradicts it. The agent answers with a drafts file, `{"family": "<key>", "drafts": {"<key>": <value>}}`, and the step runs again with `--drafts <file>`.
  - A label or a description is a non-empty string. A grid is `{columns, rows}`, naming every axis exactly once with at least one column. Anything else fails, naming the key.
  - A draft that no open key takes is reported as unused.
- **Unchanged.** On the prior's snapshot with no Drafted value reopened, missing or vanished, or when the merged Contract has the prior's `contentHash`, the CLI prints `unchanged` and writes nothing. The owner's omit patch, a tweak and the approval stand. Otherwise the Contract is written as a draft (`approval: null`).
  - `--rewrite` writes on an unchanged snapshot anyway, to apply a change of the Adapter's own rules. It still carries the Drafted values.
- **Button.** The committed Contract was drafted from [`fixtures/drafts/button.json`](fixtures/drafts/button.json). It stays a draft until the owner approves it in To-design's base loop.

### Left for later tickets

- **Notes.** Each of these gets an `info` note, and none is carried:
  - `:has(…)` conditions other than `:has([<attr>="<value>"])`, such as `has-[>svg]`;
  - ancestor styling such as `in-data-[slot=button-group]` (ADR 0012);
  - descendant styling other than a slot frame's svg size, such as `[&_svg]:shrink-0`, plus text utilities and a part's paint, padding and layout (a later agent-tier ticket);
  - other media queries and conditions;
  - utilities no field carries;
  - classes that compile to no CSS.
- **Defaults.** The anatomy is the root, its icon slot frames and its parts, and `properties` is `[]`.
- **Agent tier.** The anatomy below the slot frames and parts (a part's own children, text and paint), each slot's icon (an INSTANCE with an INSTANCE_SWAP, `icons.default` and `code.visibleWhen: {axis}`), properties, text styles and excluded combinations are not drafted yet.

## 4. Preview renderer

[`scripts/preview.mjs`](scripts/preview.mjs) is the renderer To-preview finds by convention, and [`scripts/handoff-adapter.mjs`](scripts/handoff-adapter.mjs) hands the same renderer to To-handoff, with the rest of #102's Adapter interface. `previewRenderer(contract)` resolves to:

- `render(tuple, properties)`: the project's own component, rendered with `react-dom/server` `renderToStaticMarkup`. A missing axis takes its default, and each axis value's `code` props are set. Each anatomy node the variant shows is a child, in anatomy order: an icon slot an `<svg>` carrying the attribute its Slot axis tests, a part its exported component holding its layer name. A node the resolved layout hides (`visible: false`) is not rendered. The Contract has no properties yet.
- `stylesheet`: the project's global CSS compiled by the pinned Tailwind over every class of the component files the render loads, Preflight and the base layer included. Tailwind's `@supports (color: color-mix(…))` guards are unwrapped, because To-preview's state forcing does not read inside `@supports`.
- `modeClass(mode)`: `mode-<key>`, used only for Light, which records no selector. Dark switches by its `selector`, `.dark`.

Unlike the reading tier, it runs code: the project's component files, transpiled with the pinned TypeScript, and the packages they import. Those are pinned in [`preview/package.json`](preview/package.json) and its lockfile, at the versions the fixture's lockfile resolves, and installed with `npm ci --ignore-scripts` into gitignored `.scratch/adapter-generic/preview/`. A bare import the file does not pin fails. It refuses when a project file is not the Contract's snapshot, when a pinned package is not the Contract's `source.packages` version, or when any installed package's version differs from the project's lockfile.

```
node skills/to-preview/scripts/catalog.mjs design-systems/shadcn/contracts/button.component.json
```

The To-handoff module's `roleGroups` match colours to `Color` and `Sidebar` tokens, lengths to `Spacing` and radii to `Radius`. Its surfaces are `background` and `card`, its breakpoints Tailwind's `--breakpoint-*`, and `checkContract` holds a Contract to the Design System's package pins and file hashes. Its `contractProcedure`, for a family with no Contract yet, regenerates the Foundations document with `--family` for every committed family plus the new one (an explicit list replaces the default), then runs the component step with its drafts, then `check.mjs`.

Tests: `node --test skills/adapter-generic/test/*.test.mjs`. They skip, saying so, until the tools are fetched; the catalog measurements also need To-handoff's browser (`node skills/to-handoff/scripts/deps.mjs`).

## Moving a pin

Change `TOOLS` in `sources.mjs` (the version and its registry `integrity`). The Adapter refuses a project whose lockfile resolves another version of a `stylesheet` package (`shadcn`, `tailwindcss`, `tw-animate-css`), because the compiled cross-check must run the Tailwind the project runs. `source.packages` records those three. After the change, regenerate the document.

The preview renderer's packages are pinned in [`preview/package.json`](preview/package.json) and its lockfile, which must resolve every package at the version the project's lockfile does: the renderer refuses otherwise, naming the package. To move one, change it in the project, then in `preview/package.json`, and run `npm install --package-lock-only --ignore-scripts` in `preview/`.
