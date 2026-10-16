# Which standard token and prop formats do shadcn, Bootstrap and other Code Libraries expose?

Research for [pawisssh/design#58](https://github.com/pawisssh/design/issues/58). Map: [#52](https://github.com/pawisssh/design/issues/52). Vocabulary follows `GLOSSARY.md` (Code Library, Contract, Foundations document, Adapter, Property Axis, Base Component). The terms Generic Adapter and Dedicated Adapter come from [#55](https://github.com/pawisssh/design/issues/55) and are not yet in main's glossary.

Researched 2026-10-16. All six libraries were read at these pins, from their own repos and docs:

| Code Library | Pin | Commit |
|---|---|---|
| shadcn/ui | tag `shadcn@4.22.0` (CLI 4.22.0) | `ad0a097d30cf9524ac4a3b5294c9513c5c344672` |
| Bootstrap | tag `v5.3.8` | `25aa8cc0b32f0d1a54be575347e6d84b70b1acd7` |
| MUI (Material UI) | tag `v9.5.0` | `1c3f8b4903f21cfad12c102edb3db4ceba2e8c8c` |
| Chakra UI | tag `@chakra-ui/react@3.37.0` | `2e7517745cff2fcde0b8012f136cf99611ff262a` |
| Radix Themes | tag `3.3.0` | `7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43` |
| Coinbase CDS | `master`, which `packages/web/package.json` says is `@coinbase/cds-web` 9.29.0. The repo has no 9.29.0 tag, so the pin is the commit. | `6299b0d100460974d9d83548b7b6c37fbaa77063` |

Formats and tools:

| Thing | Pin | Commit |
|---|---|---|
| Tailwind CSS | tag `v4.3.3` | `c2b24dd15fed1c59dd521bd86082f520c9f5ad0d` |
| Tailwind docs | `tailwindcss.com` main | `7f92c2213315c195dae583d68752da4042da3ade` |
| DTCG Format and Resolver Modules | `2025.10` (`community-group` main; the respec config says `specStatus: 'CG-DRAFT'`) | `882ebd6716abef9a46d8ef5fb12e82009d6cee2e` |

Other npm versions current on the research date: `class-variance-authority` 0.7.1, `tailwind-variants` 3.3.1, `style-dictionary` 5.7.0, `@storybook/react` 10.6.2, `react-docgen-typescript` 2.4.0, `@figma/code-connect` 2.0.2.

Short prefixes:

- `SH` = `https://github.com/shadcn-ui/ui/blob/ad0a097d30cf9524ac4a3b5294c9513c5c344672/`
- `BS` = `https://github.com/twbs/bootstrap/blob/v5.3.8/`
- `MUI` = `https://github.com/mui/material-ui/blob/v9.5.0/`
- `CH` = `https://github.com/chakra-ui/chakra-ui/blob/2e7517745cff2fcde0b8012f136cf99611ff262a/`
- `RT` = `https://github.com/radix-ui/themes/blob/3.3.0/packages/radix-ui-themes/`
- `CDS` = `https://github.com/coinbase/cds/blob/6299b0d100460974d9d83548b7b6c37fbaa77063/`
- `TW` = `https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/`
- `TWD` = `https://github.com/tailwindlabs/tailwindcss.com/blob/7f92c2213315c195dae583d68752da4042da3ade/src/docs/`
- `DTCG` = `https://github.com/design-tokens/community-group/blob/882ebd6716abef9a46d8ef5fb12e82009d6cee2e/technical-reports/`

## Answer

1. **None of the six libraries ships DTCG or Style Dictionary.** At the pinned commits, no file path in any of the six repos matches `dtcg`, `style-dictionary` or `*.tokens.json`. Chakra's `apps/www/public/r/theme/tokens.json` matches by name, but it only lists category names (`"colors"`, `"spacing"`, …) for the CLI. No Button story uses `argTypes`. Chakra and CDS have stories without `argTypes`, and shadcn/ui, MUI and Radix Themes have no stories at all. This corrects #55's tier-1 list: DTCG and Style Dictionary are formats for a team's own token pipeline (and for Carbon, which the Carbon Adapter already reads as DTCG). They are not what these Code Libraries publish. Storybook `argTypes` is low priority.

2. **What all six share is CSS custom properties, with one block per theme mode, keyed by a selector.** This is the format to support first for the Foundations document:

   | Code Library | Light | Dark | Where |
   |---|---|---|---|
   | shadcn/ui | `:root` | `.dark` | the CLI writes `:root` for `light` and `.<key>` for other keys (`SH packages/registry/src/updaters/update-css-vars.ts` L159, L298), and adds `@custom-variant dark (&:is(.dark *))` (L94) |
   | Radix Themes | `:root, .light, .light-theme` | `.dark, .dark-theme` | `RT src/styles/tokens/colors/blue.css`; `@radix-ui/colors` imports |
   | Bootstrap | `:root, [data-bs-theme=light]` | `[data-bs-theme=dark]`, or `prefers-color-scheme` when `$color-mode-type: media-query` | `BS scss/_root.scss` L2, L133; `BS scss/mixins/_color-mode.scss` |
   | MUI | `colorSchemes.light` | `colorSchemes.dark`; `colorSchemeSelector` picks `class`, `data`, a custom selector, or the media query | `MUI docs/data/material/customization/css-theme-variables/configuration.md` L27–66; emitted as `--mui-palette-primary-main` (`usage.md` L17–29) |
   | Chakra UI | `_light` (`:root &, .light &`) | `_dark` (`.dark &, .dark .chakra-theme:not(.light) &`) | `CH packages/react/src/preset-base.ts` L187–190 |
   | Coinbase CDS | `lightColor` / `lightSpectrum` | `darkColor` / `darkSpectrum`, which `ThemeProvider` turns into `--color-*` plus a `.light` / `.dark` class | `CDS packages/web/src/themes/defaultTheme.ts` L297–314; `CDS apps/docs/docs/getting-started/theming/_webContent.mdx` L60–95 |

   In shadcn/ui and Radix Themes these blocks are **source files**. In Bootstrap they are compiler output. In MUI, Chakra and CDS they come from **running JS**.

3. **For prop sources, the line that matters is how you have to read them:**
   - **Exact by static parse:** shadcn cva, Chakra `defineRecipe`, Radix PropDefs, MUI's generated `api/button.json`, and CDS JSDoc `@default`s with destructured defaults.
   - **Exact only by compiling:** Tailwind class strings, Bootstrap Sass.
   - **Exact only by executing the library's JS:** MUI, Chakra and CDS theme objects, and MUI's per-variant styles.
   - **Not exact at all:** anatomy everywhere, and Bootstrap's axes.

   The Generic Adapter should read the first group, run the official compiler for the second, and leave the third to agent drafts or a Dedicated Adapter. That is where the #55 graduation line falls in practice.

4. **For shadcn/ui as the first target, there are four schema-level findings** (details in [shadcn/ui](#shadcnui)):
   - **The Code Library is the consumer's installed copy.** It is not an npm package: `shadcn` is the CLI, and only `new-york-v4` sources contain inline classes.
   - **cva gives Property Axes, per-value `code` and `default` exactly.**
   - **Tailwind classes resolve exactly only through Tailwind's own `compile().build(candidates)`.** Spacing is one multiplier, and opacity modifiers become `color-mix()`.
   - **`dark:` classes inside a component are the first real blocker.** A Contract cannot hold modes, so the Adapter must synthesize a component variable in the Foundations document.

5. **Always drafted by the agent, `by: "agent"`, in every library:**
   - `anatomy`; shadcn's `data-slot` and CDS's Code Connect layer names are hints, not sources
   - `excluded`
   - non-variant `properties`, such as children/label TEXT, the icon slot and `asChild`
   - `icons.preferred`
   - `figma`
   - Text Style composition
   - the owner's `selection`
   - Bootstrap's axes and defaults, which have no prop layer

6. **Recommendation, in order:**
   - (a) CSS custom properties by mode selector, including Tailwind v4 `@theme` / `@theme inline`
   - (b) cva `variants` / `defaultVariants`, with class strings resolved through the Tailwind compiler
   - (c) the TypeScript prop types as a fallback for axes
   - (d) DTCG Format + Resolver second, for teams with their own token pipeline

   Prove (a) and (b) on a real installed shadcn/ui project. Defer Bootstrap (compiled CSS, axes drafted), Radix PropDefs and Chakra recipes; each is a small reader once the first three exist. Leave MUI and CDS to agent drafts until a team keeps them, which would earn a Dedicated Adapter.

## Per library

### shadcn/ui

**Where the components live.** The npm package `shadcn` is the CLI (`SH packages/shadcn/package.json` L2–3, `bin` L65). Components are copied into the consumer's project. In the registry, `new-york-v4/ui/button.tsx` holds inline Tailwind classes. The newer `bases/{radix,base,aria}/ui/button.tsx` hold placeholders instead (`variant.default: "cn-button-variant-default"`, `SH apps/v4/registry/bases/radix/ui/button.tsx` L11; `bases/base` and `bases/aria` have the same six `cn-button-variant-*` values). At install, the CLI's style map fills them from `apps/v4/registry/styles/style-<name>.css`: `createStyleMap` collects every `cn-` rule's `@apply` classes (`SH packages/shadcn/src/styles/create-style-map.ts` L8), and `transformStyleMap` rewrites them into the `cva` call (`transform-style-map.ts` L41). So the Adapter reads the **installed** `components/ui/*.tsx`, `components.json` and the CSS file named by `tailwind.css`. `source.files` pins those, and `source.packages` records `class-variance-authority`, `tailwindcss`, `radix-ui` and the icon library. `components.json` `iconLibrary` names the icon source.

**Props, variants, defaults.** `buttonVariants = cva(base, {variants: {variant: {...6}, size: {...8}}, defaultVariants: {variant: "default", size: "default"}})` (`SH apps/v4/registry/new-york-v4/ui/button.tsx` L9–36). The function repeats the defaults (`variant = "default"`, L42). In the Contract:
- each `variants` key is a Property Axis
- each value key is an axis value with `code: {variant: "<key>"}`
- `defaultVariants` gives `default`, with `defaultSource: "cva defaultVariants"`

`compoundVariants`, when present, are multi-axis `layout`/`paint` rules, not `excluded`. The `size` axis mixes text sizes and `icon*` sizes. Whether `icon` is a separate Component Family or a size value is an agent/owner call. `asChild` is a non-variant prop, and `data-slot="button"` (L54) is the exact node name for the root.

**Tokens.** The theme is semantic CSS variables in `:root` and `.dark`, exposed to Tailwind through `@theme inline { --color-primary: var(--primary); … }` (`SH apps/v4/content/docs/(root)/theming.mdx` L62–64, L100, L118–133). The registry ships themes as `cssVars: {theme, light, dark}` (`SH apps/v4/public/schema/registry-item.json` L138–156; `SH apps/v4/registry/themes.ts` L8–43), so the same data is also available as JSON. Radius is one `--radius` with a derived scale (`--radius-sm: calc(var(--radius) * 0.6)` … `-4xl`) that the CLI writes (`update-css-vars.ts` L427–437). Tailwind's own defaults live in `@theme default` (`TW theme.css` L1), for example `--spacing: 0.25rem` (L325), `--text-sm` with `--text-sm--line-height` (L349–350), `--font-weight-medium` (L378) and `--shadow-xs` (L407).

**What compiling the class strings means for the Contract.**
- **Spacing is a multiplier.** `h-<n>` is `height: calc(var(--spacing) * <n>)` (`TWD height.mdx` L13), and the same holds for `px-*` and `gap-*`. There are no named steps like Carbon's `spacing-05`. The Foundations document needs a fixed naming rule (for example `spacing-9` = 36 px, generated for the steps the closure uses plus a full scale like Carbon's `fullScales`). That rule is an Adapter decision for the spec.
- **Opacity modifiers.** `bg-primary/90` compiles to `color-mix(in oklab, <value> 90%, transparent)` (`TW src/utilities.ts` L176–192). This is the Carbon alias-plus-alpha case. It fits the Foundations `{raw, alpha, from: {alias, alpha}}` value form, but it needs a synthesized flat name (for example `primary/90`), because a Contract binds only `{token}`.
- **`dark:` utilities in a component.** The outline variant has `dark:bg-input/30` (`button.tsx` L14–15). That is a per-mode fill no single shadcn token expresses, and a Contract cannot carry modes ("Themes are not an axis", contract-schema). The Adapter must synthesize a component variable in the Foundations Theme collection, for example `button-outline-bg` with light → `background` and dark → `input` at 30 %. This is the first real blocker for the shadcn tracer, and the spec has to name it.
- **Colour space.** Values are `oklch(...)`. The Foundations `resolved` field and Figma both need sRGB, so the spec must fix the conversion, how out-of-gamut values are clipped, and the notation. Style `vega` also mixes two tokens: `hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]` (`SH apps/v4/registry/styles/style-vega.css` L157–158). That has no alias form, so it is a raw `info` value per mode.
- **States.** The prefixes `hover:`, `focus-visible:`, `active:` and `disabled:` map one-to-one onto the canonical State axis, with `css` set to the pseudo-class. `aria-invalid:`, `aria-expanded:` and `data-[state=checked]:` (Checkbox has no cva at all; its checked look is `data-[state=checked]:bg-primary`) fall outside the fixed `enabled, hover, active, focus, disabled` set. This is a schema gap: a non-canonical state axis, or a Radix-state axis, must be specified before Checkbox-like families can be read.
- **Effects.** `focus-visible:ring-[3px] ring-ring/50` is a box-shadow ring. It maps to `effects` (spread 3, colour `ring` at 50 %).
- **Text styles.** `text-sm` and `font-medium` are separate utilities. A Text Style is a combination the Adapter must compose and name. The agent drafts this.
- **codeSyntax.** Whether `WEB` is `var(--primary)` or the utility (`bg-primary`) is a decision for the spec. Both are exact.

**How to compile exactly.** `tailwindcss` exports `compile(css, opts)`, which returns `{build(candidates: string[]): string}` (`TW src/index.ts` L820–827). The Adapter can feed it each cva value's class list with the project's CSS entry and read the declarations back. Each declaration still names the `var(--…)` it uses, so token links survive. This is the step that makes `layout` and `paint` exact instead of drafted.

**Figma.** The shadcn docs list only community Figma kits (`SH apps/v4/content/docs/(root)/figma.mdx`). There is no first-party Design Library to align with.

### Bootstrap

**Tokens.** Bootstrap has three token layers:
- **Sass variables** such as `$blue: #0d6efd`, `$primary: $blue` and `$theme-colors` (`BS scss/_variables.scss` L39, L301, L312), with dark overrides in `scss/_variables-dark.scss`.
- **Root CSS custom properties** `--bs-*` (`BS scss/_root.scss`).
- **Component-local custom properties** `--bs-btn-*` on `.btn` (`BS scss/_buttons.scss` L5–22). The docs call these "local CSS variables" (`BS site/src/content/docs/components/buttons.mdx` L195–199; `customize/css-variables.mdx` L27–33).

Dark mode is `[data-bs-theme=dark]` by default (`$enable-dark-mode: true`, `$color-mode-type: data`, `_variables.scss` L387–388; `BS site/src/content/docs/customize/color-modes.mdx` L17, L55–66).

**Variants.** There are no props. Variants are modifier classes generated by Sass loops: `.btn-#{$color}` and `.btn-outline-#{$color}` over `$theme-colors`, `.btn-link`, and `.btn-lg` / `.btn-sm` (`_buttons.scss` L131–161, L170, L210–216). Hover and active colours are compile-time results of `shade-color()` / `tint-color()` and `color-contrast()` (`BS scss/mixins/_buttons.scss` L11–15). They exist **only** as literal hexes in the compiled `.btn-primary { --bs-btn-hover-bg: … }`.

**Reading.** Read the compiled CSS (`package.json` `"style": "dist/css/bootstrap.css"`, L40), or compile the team's Sass with Dart Sass. The values are exact, but the link from `.btn-primary`'s `#0d6efd` to `--bs-primary` survives only as an equal value, so the agent proposes it. The `.btn-<theme-color>` and `.btn-outline-*` colours are compiled constants, not mode-aware variables, so in Bootstrap's own CSS those variants look the same in light and dark mode. The bare `.btn` text colour and `.btn-link` do follow the mode. They point at root variables (`$btn-color: var(--bs-body-color)`, `$btn-link-color: var(--bs-link-color)`, `_variables.scss` L818, L843), which `_root.scss` redefines under `color-mode(dark)` (L137, L169).

**What has no source.** Axes, axis labels, the Base Component and per-value `code` (here a class, `{className: "btn-primary"}`, which the Contract's `code` block has no field for yet) have no machine-readable source. Bootstrap ships no JS component API for buttons. The agent drafts these from the loop maps.

### MUI

**Props and defaults.** `docs/pages/material-ui/api/button.json` is generated, and it is **the strongest prop artifact found**. For every prop it gives the type and the `default`: `variant` `'contained'|'outlined'|'text'|string`, default `'text'`; `size` default `'medium'`; `color` default `'primary'`; booleans with defaults. It also sets `themeDefaultProps: true`. The defaults match the destructuring in `MUI packages/mui-material/src/Button/Button.js` L506–525. The unions include `| string`, because of `OverridableStringUnion` (`Button.d.ts` L30–31, L88, L101), and a theme can override defaults through `components.MuiButton.defaultProps`. So the axis values are exact for stock MUI, but the defaults are exact only after reading the team's theme.

**Tokens.** The tokens are a JS theme object (`createTheme`). CSS variables are opt-in with `cssVariables: true`, which emits `--mui-palette-*` with the `--mui` prefix (configurable). Light and dark come from `colorSchemes` (`usage.md` L7–43; `configuration.md` L7–66).

**Paint.** Per-variant paint is computed in JS: the `variants` arrays in `styled()`, colour loops over `theme.palette` and `theme.alpha()` (`Button.js` L95–195). Some branches depend on the mode, such as `theme.palette.mode === 'light' ? grey[300] : grey[800]` (L96–97). None of this is readable without executing MUI. `layout`/`paint` are agent-drafted, or come from a Dedicated Adapter.

### Chakra UI

**Variants.** `defineRecipe({base, variants: {size, variant}, defaultVariants: {size: "md", variant: "solid"}})` is a static object literal (`CH packages/react/src/theme/recipes/button.ts` L3–188). It is as exact as cva, and its values are already token names (`h: "10"`, `px: "4"`, `bg: "colorPalette.solid"`, `_hover: {bg: "colorPalette.solid/90"}`). `colorPalette` is an extra virtual axis that is not in the recipe. Its default `gray` comes from `CH packages/react/src/theme/global-css.ts` L47.

**Tokens.** `defineTokens` (`{value: "0.25rem"}`) and `defineSemanticTokens` with mode conditions: `bg: {value: {_light: "{colors.white}", _dark: "{colors.black}"}}` (`CH packages/react/src/theme/semantic-tokens/colors.ts` L3–7; `CH apps/www/content/docs/theming/semantic-tokens.mdx` L57–89). The shape looks like DTCG, with `{ref}` aliases, but it is not DTCG: the key is `value`, not `$value`, there is no `$type`, and modes are inline conditions, not a Resolver.

**Reading.** In a consumer project the theme is TS, merged through `createSystem(defaultConfig, config)`. `chakra typegen` and `chakra eject` (`CH apps/www/content/docs/get-started/cli.mdx` L54–57) emit types and the default theme, but no token JSON. Reading a stock recipe is exact. Reading a team's theme needs execution.

### Radix Themes

**Props and defaults.** PropDefs are runtime objects with `type`, `values`, `default` and the CSS `className`: `size: {type: 'enum', className: 'rt-r-size', values: ['1','2','3','4'], default: '2', responsive: true}` and `variant: {… values: ['classic','solid','soft','surface','outline','ghost'], default: 'solid'}` (`RT src/components/_internal/base-button.props.ts` L11–17). This is exact, and it even gives the class each value toggles. `responsive: true` means breakpoint objects, which the Contract cannot represent.

**Tokens.** Tokens are plain CSS custom properties (`--space-3: calc(12px * var(--scaling))`, `RT src/styles/tokens/space.css`), with `:root, .light, .light-theme` and `.dark, .dark-theme` blocks (`RT src/styles/tokens/colors/blue.css`). Variant CSS reads them (`.rt-r-size-2 { --base-button-height: var(--space-6) }`, `RT src/components/_internal/base-button.css` L40–63).

**What the Foundations schema has not met yet.** The theme has several independent knobs: `appearance`, `accentColor` (default `indigo`), `grayColor`, `radius`, `scaling` and `panelBackground` (`RT src/components/theme.props.tsx` L26–62). Each would multiply Figma modes or collections. The `classic` variant also paints with `linear-gradient` background images and `filter` (`base-button.css` L110–125), and the Contract `paint` vocabulary has no field for either.

### Coinbase CDS

**Props and defaults.**
- **Prop types** are TS with JSDoc defaults (`@default primary` for `variant`, `@default l` for size; `CDS packages/web/src/buttons/Button.tsx` L123–180) and destructured defaults (L203).
- **Sizes** are a local const map, `buttonSizes = {xs: {paddingX: 2, …, borderRadius: 700, font: 'label1'}, …}` (L29–43).
- **Variant paint** is a shared map, `variants = {primary: {color: 'fgInverse', background: 'bgPrimary', borderColor: 'bgPrimary'}, …}` (`CDS packages/common/src/tokens/button.ts` L12–48). It reads like a Contract `paint` table, but only for the enabled state.
- **Docs props tables** come from a docgen plugin over the TS sources (`CDS apps/docs/docgen.config.js`).

**Tokens.** The theme is a TS object. `lightColor.bgPrimary` is `` `rgb(${lightSpectrum.blue60})` `` (`CDS packages/web/src/themes/defaultTheme.ts` L297–314). The alias to `blue60` survives a static AST read of that template literal, but not execution. `ThemeProvider` emits `--color-*`, `--space-*` and other variables through `createThemeCssVars` (`CDS packages/web/src/core/createThemeCssVars.ts`), plus a `.light`/`.dark` class.

**Code Connect.** CDS ships Code Connect files, for example `CDS packages/web/src/buttons/__figma__/Button.figma.ts`. Its Figma `state` axis lists `hover` and `pressed`, which it says are "interaction-only states with no code equivalent" (L21–28). Under ADR 0001 these files are evidence for an agent draft (labels, `code` mapping) and never an exact source: they describe CDS's own Figma kit, not the code.

## Formats: what the Generic Adapter can read

| Format | Read exactly? | Fills | Agent drafts |
|---|---|---|---|
| **CSS custom properties per mode selector** (shadcn `:root`/`.dark`, Radix, Bootstrap compiled `[data-bs-theme]`, MUI/CDS emitted CSS) | Yes, by static CSS parse of a source file or compiled output | Foundations `variables` (flat name = the property without `--`), the Theme collection's `modes` (one per selector), per-mode `values` (alias when the value is `var(--x)`, otherwise a literal), `codeSyntax.WEB` = `var(--name)` | Collection split (Primitives vs Theme), Figma `name` grouping, `scopes` beyond the field-based rules, which selector is the default mode, the mode labels |
| **Tailwind v4 `@theme` / `@theme inline`** (shadcn) | Yes, static parse. `inline` means "use the value", not a reference (`TWD theme.mdx` L480–501) | The utility → variable map (`--color-primary` → `--primary`), the radius scale, Tailwind defaults (`--spacing`, `--text-*`, `--font-weight-*`, `--shadow-*`) | The naming rule for multiplier spacing, Text Style composition |
| **cva `variants` / `defaultVariants` / `compoundVariants`** (shadcn; `tailwind-variants` is similar but was not read for this report) | Yes, by TS AST when the config is an object literal | `axes` (keys, values, per-value `code`, `default` + `defaultSource`), and the class lists to compile | Axis labels, `figma.grid`, whether a value (shadcn `icon`) is really another Component Family |
| **Tailwind class strings** (inside cva or `className`) | Only by running `tailwindcss` `compile().build()` with the project CSS | `layout` (height/minHeight, padding, gap, radius), `paint` (fill, stroke, opacity, `effects` from `ring`/`shadow`), the State axis from `hover:`/`focus-visible:`/`active:`/`disabled:` with `css` | Synthesized per-mode variables for `dark:` utilities, flat names for `/alpha` mixes, non-canonical states (`aria-*`, `data-[state=*]`), anatomy from the `[&_svg]` / `has-[>svg]` selectors |
| **Sass variables / maps** (Bootstrap) | Only by compiling. Route it through the compiled CSS. | Through compiled CSS: exact layout/paint values per modifier class | Token links (value-matched), axes from the `$theme-colors` loop, Base Component, `code` as a class |
| **Library PropDef objects** (Radix Themes) | Yes, by static parse | `axes` with values, `default` and a `className` per value | Breakpoint handling, the theme knobs as Foundations modes |
| **Recipe objects** (Chakra `defineRecipe`) | Yes, for a stock recipe. A team's theme needs execution. | `axes`, `default`, token-named `layout`/`paint` | The `colorPalette` axis, the semantic-token mode split |
| **Generated API JSON** (MUI `docs/pages/*/api/*.json`) | Yes | `axes` values (drop `string`), `default`s, booleans as `properties` | Everything in `layout`/`paint`, the team's `defaultProps` overrides |
| **TypeScript prop types** (all React libraries; through `react-docgen-typescript` or the TS checker) | Yes for literal unions and JSDoc `@default`. **Not verified** on `VariantProps<typeof cva>`, which is a mapped type and probably needs the TS checker rather than docgen. | `axes` values, `default` (JSDoc or destructuring) | Which props are axes and which are `properties`, everything visual |
| **JS/TS theme objects** (MUI `createTheme`, CDS `defaultTheme`, Chakra `createSystem`) | Only by executing the library. A static AST read keeps aliases (CDS template literals) but misses computed values. | Execution gives the resolved values and the emitted CSS variables | Aliases lost by execution, computed per-variant styles (MUI) |
| **DTCG Format + Resolver 2025.10** | Yes. Tokens are `$value`/`$type`/`{alias}`, and the Resolver's `sets` / `modifiers` → `contexts` (`DTCG resolver/syntax.md` L3–14, L73–85) map to collections and modes | Foundations `variables`, `modes` (one modifier = one mode set), aliases, `$extensions` (Carbon's `org.carbon.alphaModifiers` is the precedent). `dimension` is `{value, unit}` in `px`/`rem` (`DTCG format/types.md` L17–19). | Which modifier becomes which Figma collection, `scopes` |
| **Style Dictionary** | As DTCG when its sources use the DTCG format (Style Dictionary 5.x). Otherwise its legacy `value` format, which is close to Chakra's. | As DTCG | As DTCG |
| **Storybook `argTypes`** | Yes when they are written by hand. None of the six writes them for Button (Storybook infers them from docgen). | `axes` values and `control` defaults | Same as TS prop types |
| **Figma Code Connect files** (CDS `__figma__`) | Exact as files, but under ADR 0001 they are evidence for drafts, not a source | — | Axis labels, Figma names, `code` mappings, the non-code Figma states |

**Never in any format** (always `by: "agent"`): `anatomy` (only hinted by `data-slot`, `[&_svg]` selectors and Code Connect layer names), `excluded`, non-variant `properties` (children → TEXT, icon slot → INSTANCE_SWAP + BOOLEAN, `asChild`), `icons.preferred`, the `figma` block, Text Style composition, and `selection`.

## Recommendation

1. **First: CSS custom properties by mode selector**, with the Tailwind v4 `@theme` / `@theme inline` reader on top. All six libraries can emit this format, and it fills the Foundations document's Theme collection, modes and codeSyntax exactly. For shadcn/ui it is the source itself.
2. **Second: cva**, read by TS AST, with every class list compiled through `tailwindcss` `compile().build()` against the project's CSS entry. This makes the shadcn Contract's `axes`, `default`, `layout`, `paint` and State axis exact. The agent drafts anatomy, properties, labels and Text Styles. Before the shadcn tracer, the spec must answer:
   - how per-mode component variables are synthesized for `dark:` utilities
   - how flat names are given to `/alpha` and `color-mix` values
   - the spacing naming rule
   - oklch → sRGB conversion
   - non-canonical states
3. **Third: TypeScript prop types**, as the fallback for axes and defaults where there is no cva: Checkbox-like shadcn families and CDS.
4. **Fourth: DTCG Format + Resolver 2025.10**, for teams whose own tokens come from a DTCG or Style Dictionary pipeline. The Carbon Adapter's DTCG reading is the starting point.
5. **Later, small readers:** Bootstrap through compiled CSS, Radix PropDefs and Chakra recipes. **Not in the Generic Adapter:** executing MUI, CDS or Chakra theme objects. That is Dedicated Adapter work, by the #55 rule.

Target library: a real `npx shadcn init` project (style `new-york` or a `base-*` style, Tailwind v4), with Button read from `components/ui/button.tsx`. `bases/*` registry sources are not inputs, because they hold `cn-*` placeholders until the CLI fills them.

## Not verified

- Whether `react-docgen-typescript` resolves `VariantProps<typeof buttonVariants>` into literal unions. The cva AST read makes this unnecessary for shadcn.
- Whether `tailwindcss` `compile()` runs without a bundler for a project whose CSS imports `shadcn/tailwind.css` and `tw-animate-css`. It needs a `loadStylesheet` callback. A probe belongs in the Generic Adapter spec.
- Whether every installed shadcn style keeps the cva object literal shape after the CLI's style map transform. The transform rewrites strings inside the cva call (`transform-style-map.ts` L41), which suggests it does.
