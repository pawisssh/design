---
name: adapter-generic
description: Generic Adapter for shadcn/ui-style Code Libraries, from a consumer's installed project (components.json, its global CSS, its lockfile) to the Foundations document and draft component Contracts. Use when creating or refreshing the shadcn foundations document or a shadcn component Contract.
---

# Generic Adapter

The Adapter for Code Libraries a consumer installs as source and themes with CSS custom properties and Tailwind v4, starting with shadcn/ui (spec [#103](https://github.com/pawisssh/design/issues/103)). It is a sibling of the [Carbon Adapter](../adapter-carbon/SKILL.md) with the same outputs. What a Foundations document must contain is defined in the shared [`contract`](../contract/SKILL.md) skill's [foundations schema](../contract/references/foundations-schema.md); this skill only knows how to read the project.

Today it has the exact tier: the Foundations step ([#118](https://github.com/pawisssh/design/issues/118)) and the component step ([#119](https://github.com/pawisssh/design/issues/119)). Synthesized tokens ([#120](https://github.com/pawisssh/design/issues/120)), the slot axis ([#121](https://github.com/pawisssh/design/issues/121)), the agent tier ([#122](https://github.com/pawisssh/design/issues/122)) and the preview renderer are later tickets.

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

Done when it prints `Generic Adapter tools OK`.

The one thing ever executed is Tailwind's own compiler, over the project's CSS ([`scripts/tailwind.mjs`](scripts/tailwind.mjs)):

- `compile()` from the pinned `tailwindcss` runs with no bundler.
- A plain file loader resolves each `@import`:
  - a relative path inside the project;
  - or a pinned stylesheet package, through its `exports` map. That is the `style` condition for `tailwindcss` and `tw-animate-css`, and the plain `./tailwind.css` path for `shadcn/tailwind.css`.
- `loadModule` refuses, so a `@plugin` or `@config` fails, naming it.

## 2. Foundations step

```
node skills/adapter-generic/scripts/foundations.mjs [--project <dir>] [--tools <dir>] [-o <file>]
```

It reads the reference project and the fetched tools by default, and writes [`design-systems/shadcn/shadcn.foundations.json`](../../design-systems/shadcn/shadcn.foundations.json).

- Never edit that file by hand. Change the project, the pins or a rule here, and regenerate.
- A rerun is byte-identical.
- The seam is `generate({project, drafts})`. `drafts` must be empty until the agent tier (#122) exists.

### Modes

| Selector | Mode key | Label |
|---|---|---|
| `:root` | `light` | Light (default) |
| `.dark` | `dark` | Dark |

- Each Mode records its `selector`.
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
```

It reads one component family of the project, `<ui alias>/<key>.tsx`, and writes the draft Contract `design-systems/shadcn/contracts/<key>.component.json`. It checks the Contract with [`contract.mjs`](../contract/scripts/contract.mjs) `validate` and writes it with [`io.mjs`](../contract/scripts/io.mjs) `writeJson`. A rerun is byte-identical. The seams are `readFamily({project, family, foundations})` (the exact-tier reading, with what is pending) and `generate({project, family, foundations, drafts})`.

- **Snapshot.** The Foundations document must be from this project's snapshot: every file in its `source.files` must hash the same, or the step fails with "another snapshot". The Contract's `source.files` adds the component file.
- **Source** ([`scripts/source.mjs`](scripts/source.mjs)). From the TypeScript AST: every `cva(base, {variants, defaultVariants, compoundVariants})` and every top-level function component, with its element (also through `const Comp = asChild ? Slot.Root : "button"`), `data-slot`, the attributes it sets from props (`data-size={size}`), its destructured defaults and its class lists, each with its line. The root is the export named after the family (`button` → `Button`). A family without a cva, or with `compoundVariants`, fails.
- **Cascade** ([`scripts/cascade.mjs`](scripts/cascade.mjs)). Every class is compiled with Tailwind in one `build()`. Only the utilities layer is read, and an `@supports` branch replaces the fallback it guards. Each rule is sorted by its compiled selector:
  - a Mode, from `:is(<mode selector> *)`;
  - a canonical state: `:hover` (inside `@media (hover: hover)`), `:focus-visible` and `:focus` → `focus`, `:active`, and `:disabled` with its other spellings `[aria-disabled="true"]` and `[data-disabled]`;
  - an attribute the component sets from a prop (`[data-size="sm"]`), which is that prop's value;
  - any other attribute (`[aria-invalid="true"]`), which must be in the attribute table below.

  Specificity counts `:is`, `:not` and `:has` as their most specific argument and `:where` as nothing. The winner per property is the highest specificity, then the latest rule in the output.
- **Merging.** Before the cascade, each variant's classes are merged the way `cn()` merges them. This is modelled; no package code runs. A later class drops an earlier one that has the same variants and whose CSS properties it covers (`rounded-[min(…)]` drops `rounded-lg`). It also drops an earlier class when both set a font size, as tailwind-merge's font-size group does (`text-[0.8rem]` drops `text-sm`). No other class group is modelled. The Contract notes each drop.

### Axes

In order: each cva variant axis, then the attribute axes, then the canonical State.

- **cva axes.** Keys and values are the code's, and labels are Title Case (`icon-xs` → `Icon Xs`). Each value's `code` is `{<axis>: <value>}`. The default comes from `defaultVariants`, or else from the destructured default.
- **Attribute axes.** Each is absent by default:

  | Attribute | Axis | Values |
  |---|---|---|
  | `aria-invalid="true"` | `invalid` | `valid`, `invalid` |
  | `aria-expanded="true"` | `expanded` | `collapsed`, `expanded` |

  Any other attribute state fails, naming the utility.
- **State.** `enabled`, then each of `hover`, `active`, `focus` and `disabled` that a carried rule uses. `css` lists the selectors the CSS uses for that state, joined with ", ". `disabled` is `{disabled: true}` on a native control, else the attribute.
- **Selection.** An attribute axis changes only the variants whose classes style that attribute, so `selection.omit` drops its on value everywhere else: those variants would be twins of their off value. The omit is read from the source, never listed by hand. Button omits `expanded` for `variant` `default`, `destructive` and `link`, which have no `aria-expanded:` utility: 768 − 192 = 576 variants. Nothing else is cut. Past ADR 0004's ~600 variants after the omit, a `verify` note says so.

### Layout and paint of the root

| CSS | Field |
|---|---|
| `display: flex` or `inline-flex`, `flex-direction` | `direction` (anything else fails) |
| `justify-content`, `align-items` | `alignMain`, `alignCross` |
| `width`, `height` | `width`, `height`; absent is `hug` |
| `gap` | `gap`; absent is `spacing-0` |
| `padding*` | `padding*`, plus the border width as a derived `info` raw, because an inside stroke takes no layout space |
| `border-radius` | `radius` |
| `border-width` | `strokeWeight` (raw), `strokeAlign: inside` |
| `background-color`, `border-color` | `fill`, `stroke`; `transparent` and absent are `none` |
| `opacity` | `opacity` |
| `--tw-ring-shadow` + `--tw-ring-color` | `effects`: one `drop-shadow` with the ring width as `spread` |

- **Lengths.** A length is the Foundations variable whose `codeSyntax.WEB` is the compiled text and whose scopes cover the field. Otherwise it is evaluated to px (`var`, `calc`, `min`, `max`) as an `info` raw that names the utility.
- **Colours.** `var(--<name>)` is that COLOR variable. A literal goes through [`color.mjs`](../contract/scripts/color.mjs) `convert` and is a `warning` raw.
- **Rules.** For each field, the step finds the fewest axes its value depends on. The commonest value goes in `{}` (a tie goes to the Base Component's). The other values become rules that are merged while two differ in one axis alone. A self-check confirms `resolve()` gives back every variant.
- **Fails:**
  - layout that differs by Mode;
  - a border with no `border-color` utility, which would take the base layer's colour;
  - a ring with no colour.

### Left for later tickets

- **Synthesized tokens (#120).** Paint that differs by Mode (`bg-background` / `dark:bg-input/30`), a token at an opacity (`bg-primary/80`) or a `color-mix` of tokens. `readFamily` lists each one under `pending`: the winning utility per Mode, its source lines and how many variants use it. `generate` fails and lists every one. The CLI prints `FAIL`, exits 1 and writes nothing. That is the fixture Button today.
- **Notes.** Each of these gets an `info` note, and none is carried:
  - slot conditions such as `has-data-[icon=…]` (#121);
  - ancestor styling such as `in-data-[slot=button-group]` (ADR 0012);
  - descendant styling such as `[&_svg]`, plus text utilities and parts other than the root (#122);
  - other media queries and conditions;
  - utilities no field carries;
  - classes that compile to no CSS.
- **Defaults.** The anatomy is the root only, `properties` is `[]`, and `figma.grid` is a placeholder: `size` across, every other axis down.

Tests: `node --test skills/adapter-generic/test/*.test.mjs`. They skip, saying so, until the tools are fetched.

## Moving a pin

Change `TOOLS` in `sources.mjs` (the version and its registry `integrity`). The Adapter refuses a project whose lockfile resolves another version of a `stylesheet` package (`shadcn`, `tailwindcss`, `tw-animate-css`), because the compiled cross-check must run the Tailwind the project runs. `source.packages` records those three. After the change, regenerate the document.
