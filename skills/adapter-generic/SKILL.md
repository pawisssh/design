---
name: adapter-generic
description: Generic Adapter for shadcn/ui-style Code Libraries, from a consumer's installed project (components.json, its global CSS, its lockfile) to the Foundations document. Use when creating or refreshing the shadcn foundations document.
---

# Generic Adapter

The Adapter for Code Libraries a consumer installs as source and themes with CSS custom properties and Tailwind v4, starting with shadcn/ui (spec [#103](https://github.com/pawisssh/design/issues/103)). It is a sibling of the [Carbon Adapter](../adapter-carbon/SKILL.md) with the same outputs. What a Foundations document must contain is defined in the shared [`contract`](../contract/SKILL.md) skill's [foundations schema](../contract/references/foundations-schema.md); this skill only knows how to read the project.

Today it has the exact tier's Foundations step ([#118](https://github.com/pawisssh/design/issues/118)). Draft Contracts, Synthesized tokens and the preview renderer are later tickets.

## Inputs

- **A consumer project:** `components.json` (which CSS file), that global CSS and `package-lock.json` (the versions the project resolves). Registry `bases/*` are never read.
- **The reference project** is [`fixtures/radix-nova/`](fixtures/radix-nova/): a shadcn 4.22.0 radix-nova project, as source plus lockfile. See its NOTICE.

## 1. Fetch the tools

```
node skills/adapter-generic/scripts/sources.mjs
```

[`scripts/sources.mjs`](scripts/sources.mjs) pins `tailwindcss@4.3.3`, `typescript@6.0.3`, `shadcn@4.22.0` and `tw-animate-css@1.4.0`. It fetches each npm tarball into gitignored `.scratch/adapter-generic/tools/`, checks it against its registry sha512 `integrity`, and extracts only the named members with `tar`. Nothing is installed and no lifecycle script runs.

- `shadcn` and `tw-animate-css` are read only as stylesheets, because the project's CSS imports them.
- TypeScript is for the component tier, a later ticket.

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
- The seam is `generate({project, drafts})`. `drafts` must be empty until the component tier exists.

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

Tests: `node --test skills/adapter-generic/test/*.test.mjs`. They skip, saying so, until the tools are fetched.

## Moving a pin

Change `TOOLS` in `sources.mjs` (the version and its registry `integrity`). The Adapter refuses a project whose lockfile resolves another version of a `stylesheet` package (`shadcn`, `tailwindcss`, `tw-animate-css`), because the compiled cross-check must run the Tailwind the project runs. `source.packages` records those three. After the change, regenerate the document.
