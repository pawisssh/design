# How Carbon React Button exposes its Property Axes

Research for issue #5 (map #1). This note describes the Carbon React **Button** Component Family: its Property Axes, values, defaults, invalid combinations, layout and color tokens, themes and nested dependencies. It ends with what an Adapter has to read to derive these automatically, and what it can't.

## Sources (pinned)

| Source | Ref |
|---|---|
| `carbon-design-system/carbon` tag `v11.118.0` (annotated tag, dereferences to commit `44f90d8d6b24889af06cee1422ceb37f58e40bed`; `main` has since moved to `e34dc31`) | `@carbon/react` 1.118.0, `@carbon/styles` 1.117.0, `@carbon/themes` 11.83.0 |
| `carbon-design-system/carbon-website` `main` | commit `5e9cd1da43c32d3d3b991dc947b427f674da61a8` |

Abbreviations used below. All of them are permalinks at the commits above.

- **[Button.tsx]**: [`packages/react/src/components/Button/Button.tsx`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/Button/Button.tsx)
- **[ButtonBase.tsx]**: [`packages/react/src/components/Button/ButtonBase.tsx`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/Button/ButtonBase.tsx)
- **[Skeleton.tsx]**: [`packages/react/src/components/Button/Button.Skeleton.tsx`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/Button/Button.Skeleton.tsx)
- **[IconButton]**: [`packages/react/src/components/IconButton/index.tsx`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/IconButton/index.tsx)
- **[stories]**: [`packages/react/src/components/Button/Button.stories.js`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/Button/Button.stories.js)
- **[migrate]**: [`packages/react/src/components/Button/migrate-to-7.x.md`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/Button/migrate-to-7.x.md)
- **[Layout]**: [`packages/react/src/components/Layout/index.tsx`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/react/src/components/Layout/index.tsx)
- **[_button]**: [`packages/styles/scss/components/button/_button.scss`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/styles/scss/components/button/_button.scss)
- **[_mixins]**: [`packages/styles/scss/components/button/_mixins.scss`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/styles/scss/components/button/_mixins.scss)
- **[_radius]**: [`packages/styles/scss/components/button/_radius.scss`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/styles/scss/components/button/_radius.scss)
- **[_vars]**: [`packages/styles/scss/components/button/_vars.scss`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/styles/scss/components/button/_vars.scss)
- **[_tokens]**: [`packages/styles/scss/components/button/_tokens.scss`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/styles/scss/components/button/_tokens.scss)
- **[_layout]**: [`packages/styles/scss/utilities/_layout.scss`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/styles/scss/utilities/_layout.scss)
- **[button.json]**: [`packages/themes/src/dtcg/components/button.json`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/themes/src/dtcg/components/button.json)
- **[themes.json]**: [`packages/themes/src/dtcg/themes.json`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/themes/src/dtcg/themes.json)
- **[colors.json]**: [`packages/colors/src/dtcg/colors.json`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/colors/src/dtcg/colors.json)
- **[layout.json]**: [`packages/layout/src/dtcg/layout.json`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/layout/src/dtcg/layout.json)
- **[type styles]**: [`packages/type/src/styles.ts`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/type/src/styles.ts)
- **[style.mdx]**: [`carbon-website: src/pages/components/button/style.mdx`](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/button/style.mdx)
- **[usage.mdx]**: [`carbon-website: src/pages/components/button/usage.mdx`](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/button/usage.mdx)

Where docs and code disagree, this note follows **code**, as `source-adapters.md` asks. Each disagreement is listed in the Docs vs code section.

## Summary

- The React types expose two finite visual props, **`kind`** and **`size`**, plus three booleans: **`hasIconOnly`**, **`isExpressive`** and **`isSelected`**. `disabled` is a fourth.
- Everything else is set in SCSS, not in props:
  - pseudo-states (hover, active, focus)
  - layout numbers, and the **default size** (`lg`)
  - **density**
- Color values belong to `@carbon/themes`, across four themes.
- `Button` hands off to a different component, `IconButton`, when `hasIconOnly` is true. That component wraps a Tooltip and accepts fewer kinds (4) and fewer sizes (4).
- The type list contains a dead value, `danger--primary`, that no CSS styles. An Adapter that reads only types will over-report the axes.

## Property Axes

| Axis (proposed Contract name) | Source prop | Values | Default | Where it is defined |
|---|---|---|---|---|
| **Kind** | `kind` | `primary`, `secondary`, `tertiary`, `ghost`, `danger`, `danger--tertiary`, `danger--ghost` (7 styled) | `primary` | `ButtonKinds` [Button.tsx L15–24], default [Button.tsx L159], [ButtonBase.tsx L28]; class `cds--btn--${kind}` [ButtonBase.tsx L53] |
| **Size** | `size` | `xs` 24, `sm` 32, `md` 40, `lg` 48, `xl` 64, `2xl` 80 (px height) | **none in React**; renders as `lg` through SCSS `layout.use('size', $min:'xs', $default:'lg', $max:'2xl')` [_button L116] | `ButtonSizes` [Button.tsx L28]; heights in `$layout-tokens` [_layout L15–23] |
| **Expressive** (or the Size value "lg expressive") | `isExpressive` | `false`, `true` | `false` [ButtonBase.tsx L26] | Prop doc: "Only applies to the large/default button size" [Button.tsx L63–66]. The website lists "Large (expressive)" as one of 7 sizes [style.mdx Size table] |
| **Icon** (text buttons) | `renderIcon` | `none`, `trailing` (16 px, or 20 px when expressive) | `none` | [ButtonBase.tsx L66–72], [_mixins L93–107] |
| **Icon only** | `hasIconOnly` | `false`, `true` | `false` [Button.tsx L155] | Swaps to `IconButton` [Button.tsx L182–241] |
| **State** | none (CSS pseudo-classes) plus `disabled` | `enabled`, `hover`, `active`, `focus`, `disabled` | `enabled`; `disabled=false` [ButtonBase.tsx L22] | `:hover` (inside `@media (any-hover: hover)` / `(hover: hover)`), `:focus`, `:active` [_mixins L113–149]; disabled through `:disabled` and `.cds--btn--disabled` [_mixins L80–91] |
| **Selected** (icon-only ghost only) | `isSelected` | `false`, `true` | `undefined` (false) | Class emitted only if `hasIconOnly && isSelected && kind === 'ghost'` [ButtonBase.tsx L57]; sets `aria-pressed` [ButtonBase.tsx L88–89]; style `$background-selected` [_button L293–295] |
| **Theme** (Figma Variable mode, not a variant) | none (theme zone class / `@carbon/themes`) | `white`, `g10`, `g90`, `g100` | `white` (SCSS fallback) | [_tokens], [button.json] |
| **Density** (context, not a Button prop) | ancestor `<Layout density>` [Layout L49, L66] | `normal` (padding-inline 16), `condensed` (8) | `normal` [_button L117] | [_layout L24–29] |

**Not Property Axes:** these are content slots or instance properties.

- label text (`children`)
- icon identity (`renderIcon` component)
- `iconDescription`
- `dangerDescription`: screen-reader text only [ButtonBase.tsx L74–102]
- `href` and `as`: they change the element, not the visuals. `href` together with `disabled` renders a `<button>` [ButtonBase.tsx L104–113].
- `type`
- the tooltip props `tooltipPosition` (default `top`), `tooltipAlignment` (default `center`), `tooltipHighContrast` (default `true`), `tooltipDropShadow` (default `false`) and `autoAlign` [Button.tsx L152–168]
- `badgeCount`: experimental, see Nested dependencies

### Icon-only (`IconButton`) axes

- **Kind:** `IconButtonKinds = primary | secondary | ghost | tertiary` [IconButton L25–30].
- **Size:** `Extract<ButtonSize, 'xs'|'sm'|'md'|'lg'>` [IconButton L137]; propTypes `oneOf(['xs','sm','md','lg'])` [IconButton propTypes `size`].
- **Kind validation:** `Button` checks `kind` against `IconButtonKinds` when `hasIconOnly` is set, using a custom propTypes validator [Button.tsx L322–339].
- **Selected:** only for `ghost`.
- **Shape:** square, `block-size` = `inline-size` = the size's height, padding 0 [_button L247–279].

### Skeleton

`ButtonSkeleton` is a separate export, not a State value:

- renders a `<div>` (or `<a>` with `href`)
- takes only a `size` prop, default **`lg`** [Skeleton.tsx L34–53]
- fixed width 150 px, using the `skeleton` mixin [_button L458–463], which reads `$skeleton-background` and `$skeleton-element`

Don't cross it with Kind or State. Model it as one extra row per Size, or as its own small Component Family.

## Invalid combinations (exclusions)

This is in the `expected.json` shape from `skills/component-sheet-html/references/sheet-contract.md`. Axis names are the proposals above. "Text" and "IconOnly" are split by the `IconOnly` axis.

```json
{
  "family": "Button",
  "axes": {
    "Kind": ["primary", "secondary", "tertiary", "ghost", "danger", "danger--tertiary", "danger--ghost"],
    "Size": ["xs", "sm", "md", "lg", "xl", "2xl"],
    "Expressive": ["false", "true"],
    "Icon": ["none", "trailing"],
    "IconOnly": ["false", "true"],
    "State": ["enabled", "hover", "active", "focus", "disabled"],
    "Selected": ["false", "true"]
  },
  "excluded": [
    {"match": {"Kind": "danger--primary"}, "reason": "Type-only legacy value: listed in ButtonKinds but no SCSS selector styles .cds--btn--danger--primary (renders as unstyled .cds--btn); removed per migrate-to-7.x; omitted from story options", "evidence": ["Button.tsx L20", "_button.scss L332-427 (only &--tertiary and &--ghost nested)", "migrate-to-7.x.md L8", "Button.stories.js L220-229"]},
    {"match": {"IconOnly": "true", "Kind": ["danger", "danger--tertiary", "danger--ghost"]}, "reason": "IconButtonKinds excludes danger kinds; propTypes validator errors; docs: danger cannot be icon-only", "evidence": ["IconButton L25-30", "Button.tsx L322-339", "usage.mdx L1431"]},
    {"match": {"IconOnly": "true", "Size": ["xl", "2xl"]}, "reason": "IconButton size is Extract<'xs'|'sm'|'md'|'lg'>; Button passes through with @ts-expect-error", "evidence": ["IconButton L137", "Button.tsx L212-219"]},
    {"match": {"IconOnly": "true", "Icon": "none"}, "reason": "icon-only requires an icon; Icon axis is implicit (always present)", "evidence": ["Button.tsx L172-178"]},
    {"match": {"Selected": "true", "IconOnly": "false"}, "reason": "cds--btn--selected only emitted for hasIconOnly", "evidence": ["ButtonBase.tsx L57"]},
    {"match": {"Selected": "true", "Kind": ["primary", "secondary", "tertiary"]}, "reason": "selected only for kind ghost", "evidence": ["ButtonBase.tsx L57", "Button.tsx L68-71"]},
    {"match": {"Expressive": "true", "Size": ["xs", "sm", "md", "xl", "2xl"]}, "reason": "Expressive applies only to large; code does not enforce (xl/2xl classes still emitted) but docs define only 'Large (expressive)'", "evidence": ["Button.tsx L63-66", "ButtonBase.tsx L46-51", "style.mdx Size table"]},
    {"match": {"Expressive": "true", "IconOnly": "true"}, "reason": "UNCERTAIN: story TODO says expressive does not work on React icon buttons; SCSS has .btn--icon-only.btn--expressive padding 12px 13px", "evidence": ["Button.stories.js L269", "_button.scss L443-446"]}
  ]
}
```

Selected × State: the selected rule `.cds--btn--icon-only.cds--btn--selected` [_button L293] has the same specificity as `.cds--btn--ghost:hover`/`:active` and comes later in the file. So `$background-selected` probably **overrides** hover and active backgrounds. A browser render has to confirm this before Selected × {hover, active} counts as distinct.

**Size of the matrix**, before the uncertain expressive × icon-only case. Themes are modes, so they are not counted here.

| Group | Calculation | Tuples |
|---|---|---|
| Text buttons, productive | 7 kinds × 6 sizes × 2 icon × 5 states | 420 |
| Text buttons, expressive | 7 kinds × lg × 2 icon × 5 states | 70 |
| Icon-only | 4 kinds × 4 sizes × 5 states | 80 |
| Icon-only ghost, selected | 4 sizes × 5 states | 20 |

The 20 selected tuples collapse further if the selected rule really does override hover and active.

## Layout per size (productive, density `normal`, computed from the SCSS)

Base: `display:inline-flex; justify-content:space-between; inline-size:max-content; max-inline-size:20rem (320px); min-block-size: layout height; border 1px ($button-outline-width); text-align:start` [_mixins L25–78, _vars L80].

**Type**

| Mode | Token | Font | Line height | Letter-spacing |
|---|---|---|---|---|
| Productive | `body-compact-01` | 14 px / 400 | 1.28572 (= 18 px) | 0.16 px |
| Expressive | `body-compact-02` | 16 px / 400 | 1.375 (= 22 px) | 0 |

Sources: [type styles L72–91], [_mixins L46], [_button L431].

**Formulas** ([_mixins L61–70, L99–106]):

- `padding-block = min((H − 1lh)/2 − 1px, (48 − 1lh)/2 − 1px)`. The cap is lg's value.
- `padding-inline = (density − 1px)` at the start and `(3·density + 16 − 1px)` at the end.
- Icon: `position:absolute; inset-block-start = min((H − 16)/2 − 1px, cap) + margin-block-start 1px` (the 1px is reset to 0 for xs, sm and md [_button L287–291]); `inset-inline-end = density`.

| Size | H `--cds-layout-size-height-*` | padding-block (top/bottom) | padding-inline start / end | Icon top offset (inside border) | Icon-only box |
|---|---|---|---|---|---|
| xs | 24 | **1.5** (override [_button L282–284]) / 2 | 15 / 63 | 3 | 24×24 |
| sm | 32 | 6 / 6 | 15 / 63 | 7 | 32×32 |
| md | 40 | 10 / 10 | 15 / 63 | 11 | 40×40 |
| lg | 48 | 14 / 14 | 15 / 63 | 15 | 48×48 |
| xl | 64 | 14 / 14 (capped, so the **label is top-aligned**) | 15 / 63 | 15 | n/a (excluded) |
| 2xl | 80 | 14 / 14 (capped, top-aligned) | 15 / 63 | 15 | n/a (excluded) |

- **Border:** each figure above sits inside the 1px border. Adding the border gives the docs' "16 left / 64 right" [style.mdx Structure table]. The `−1px` terms exist to make room for the border.
- **Density `condensed`** (`spacing-03` = 8): padding-inline becomes 7 / 39, and the icon inset becomes 8.
- **Ghost and danger ghost:** `padding-inline-end = density − 1px` (15). The icon is `position:static; align-self:center; margin-inline-start: $spacing-03` (8 px) [_button L208–216, L396–403].
- **Expressive (lg):**
  - padding-block = min((48 − 22)/2 − 1, cap) = 12 px. The cap is computed with `1em` = 16px, so ≈ 12.7.
  - The icon is 20×20 [_button L430–451].
  - Icon-only expressive uses padding `12px 13px` [_button L443–446].
- **Tokens behind the numbers:**
  - `--cds-layout-size-height-{xs..2xl}`, `--cds-layout-density-padding-inline-{condensed,normal}` [_layout L15–29]
  - `$spacing-03` = 8, `$spacing-05` = 16, `$spacing-07` = 32, `$spacing-10` = 64 ([layout.json]: mini-units × 8px)
- **Radius:**
  - 0 in v11. The `enable-v12-release` feature flag switches it to `$border-radius-max`.
  - Per-corner overrides: `--cds-button-radius` and `--cds-button-radius-{ss,se,es,ee}` [_radius L17–41, _vars L24]
  - The story `Radius` exercises these.

## Color tokens per Kind × State (code resolution)

The `button-theme($bg, $border, $font, $hover-bg, $icon, $active)` mixin [_mixins L113–149] plus the per-kind overrides in [_button]:

| Kind | enabled | hover | active | focus | disabled |
|---|---|---|---|---|---|
| primary [_button L128–141] | bg `button-primary`, border transparent, text `text-on-color`, icon currentColor | bg `button-primary-hover` | bg `button-primary-active` | focus ring\* | bg+border `button-disabled`, text `text-on-color-disabled` |
| secondary [L143–157] | bg `button-secondary`, text `text-on-color` | bg `button-secondary-hover` | bg `button-secondary-active` | focus ring\* | as primary |
| tertiary [L159–196] | bg transparent, border+text `button-tertiary` | bg `button-tertiary-hover`, text `text-inverse` | bg `button-tertiary-active`, border transparent, text `text-inverse` | bg `button-tertiary`, text `text-inverse` + focus ring\* | bg transparent, border `button-disabled`, text `text-disabled` |
| ghost [L198–245] | bg+border transparent, text `link-primary` | bg `background-hover`, text `link-primary-hover` | bg `background-active`, text `link-primary-hover` | focus ring\* | bg+border transparent, text `text-disabled` |
| danger [L332–344] | bg `button-danger-primary`, text `text-on-color` | bg `button-danger-hover` | bg `button-danger-active` | focus ring\* | as primary |
| danger--tertiary [L346–384] | bg transparent, border+text `button-danger-secondary` | bg+border `button-danger-hover`, text `text-on-color` | bg+border `button-danger-active`, text `text-on-color` | bg `button-danger-primary`, text `text-on-color` + focus ring\* | bg transparent, border `button-disabled`, text `text-disabled` |
| danger--ghost [L386–426] | bg+border transparent, text `button-danger-secondary` | bg `button-danger-hover`, text `text-on-color` | bg `button-danger-active`, text `text-on-color` | focus ring\* | bg+border transparent, text `text-disabled` |
| icon-only ghost [L263–320] | icon `icon-primary` | as ghost | as ghost | inset 1px `focus` only (no background gap) | icon: see Docs vs code item 6 |
| icon-only ghost **selected** | bg `background-selected` [L293–295] | probably unchanged (cascade) | probably unchanged | | |

\*Focus ring: `border-color: $focus` plus `box-shadow: inset 0 0 0 1px $focus, inset 0 0 0 2px $background` [_mixins L134–139]. This draws a 2px focus band with a 1px gap in the background color. It is overridable through the `--cds-button-focus-color` custom property [_mixins L23].

**Button-set only** (not a Button axis): `$button-separator`, `$icon-on-color-disabled` and `$layer-selected-disabled` [_button L478–518].

### Resolved values per theme

Sources: [button.json], [themes.json], [colors.json].

| Token | white | g10 | g90 | g100 |
|---|---|---|---|---|
| `button-primary` | #0f62fe | #0f62fe | #0f62fe | #0f62fe |
| `button-primary-hover` | #0050e6 | #0050e6 | #0050e6 | #0050e6 |
| `button-primary-active` | #002d9c | #002d9c | #002d9c | #002d9c |
| `button-secondary` | #393939 | #393939 | #6f6f6f | #6f6f6f |
| `button-secondary-hover` | #474747 | #474747 | #5e5e5e | #5e5e5e |
| `button-secondary-active` | #6f6f6f | #6f6f6f | #393939 | #393939 |
| `button-tertiary` | #0f62fe | #0f62fe | #ffffff | #ffffff |
| `button-tertiary-hover` | #0050e6 | #0050e6 | #f4f4f4 | #f4f4f4 |
| `button-tertiary-active` | #002d9c | #002d9c | #c6c6c6 | #c6c6c6 |
| `button-danger-primary` | #da1e28 | #da1e28 | #da1e28 | #da1e28 |
| `button-danger-secondary` | #da1e28 | #da1e28 | **#ff8389** | **#fa4d56** |
| `button-danger-hover` | #b81921 | #b81921 | #b81921 | #b81921 |
| `button-danger-active` | #750e13 | #750e13 | #750e13 | #750e13 |
| `button-disabled` | #c6c6c6 | #c6c6c6 | #8d8d8d | #8d8d8d |
| `button-separator` | #e0e0e0 | #e0e0e0 | #161616 | #161616 |
| `text-on-color` | #ffffff | #ffffff | #ffffff | #ffffff |
| `text-on-color-disabled` | #8d8d8d | #8d8d8d | #ffffff @25% | #ffffff @25% |
| `text-disabled` / `icon-disabled` | #161616 @25% | #161616 @25% | #f4f4f4 @25% | #f4f4f4 @25% |
| `text-inverse` | #ffffff | #ffffff | #161616 | #161616 |
| `link-primary` | #0f62fe | #0f62fe | #78a9ff | #78a9ff |
| `link-primary-hover` | #0043ce | #0043ce | #a6c8ff | #a6c8ff |
| `icon-primary` | #161616 | #161616 | #f4f4f4 | #f4f4f4 |
| `background` (focus gap) | #ffffff | **#f4f4f4** | **#262626** | #161616 |
| `background-hover` | #8d8d8d @12% | #8d8d8d @12% | #8d8d8d @16% | #8d8d8d @16% |
| `background-active` | #8d8d8d @50% | #8d8d8d @50% | #8d8d8d @40% | #8d8d8d @40% |
| `background-selected` | #8d8d8d @20% | #8d8d8d @20% | #8d8d8d @24% | #8d8d8d @24% |
| `focus` | #0f62fe | #0f62fe | #ffffff | #ffffff |
| `skeleton-background` | #e8e8e8 | #e8e8e8 | #333333 | #292929 |
| `skeleton-element` | #c6c6c6 | #c6c6c6 | #525252 | #393939 |

**What changes between themes:**

- **white and g10** are identical for every `button-*` token.
- **g90 and g100** differ in only one `button-*` token: `button-danger-secondary` (red.40 vs red.50).
- The differences that matter across all four themes are the semantic tokens: `background`, which is the focus gap, and the skeleton tokens.
- **Minimum for a "≥2 modes" pilot:** white and g100 already exercise every distinct button value except g90's danger-secondary.

**Side notes:**

- `button-danger-hover` is a hard-coded `#b81921`, not an alias. The palette's `red.60Hover` is `#b81922` [colors.json], so the two differ by one digit.
- In the DTCG files each hyphen segment of a flat name becomes one nesting level. For example, `text-on-color-disabled` is stored at `text → on → color → disabled` ([`packages/themes/src/dtcg/README.md`](https://github.com/carbon-design-system/carbon/blob/44f90d8d6b24889af06cee1422ceb37f58e40bed/packages/themes/src/dtcg/README.md)).

## Docs vs code disagreements (code chosen)

| # | Topic | Code | Docs (carbon-website) |
|---|---|---|---|
| 1 | Focus inner ring | `$background` [_mixins L136–138] | `$focus-inset` [style.mdx L63–64 and others]. The two differ on g10 (#f4f4f4 vs #ffffff) and g90 (#262626 vs #161616) |
| 2 | Ghost focus | border and inset rings; background unchanged [_mixins L134–139] | "Container background-color `$focus`" [style.mdx L273] |
| 3 | Ghost active | `$background-active` [_button L205, L225–228] | `$background-hover` [style.mdx L274] |
| 4 | Danger-tertiary and danger-ghost disabled background | transparent [_button L380, L422] | `$button-disabled` [style.mdx L381, L425] |
| 5 | Ghost icon-only disabled icon | rule targets `.cds--btn__icon` with `$icon-on-color-disabled` [_button L308–316] | `$icon-disabled` [style.mdx L285] |
| 6 | Icon-only icon class | Through `Button`, the icon is rendered as `<ButtonImageElement />` **without** `cds--btn__icon` [Button.tsx L180, L236–238]. The `.btn__icon` fill rules therefore miss it. Only `.cds--btn--ghost:not([disabled]) svg { fill: $icon-primary }` applies [_button L242–244]; otherwise the svg's own `currentColor` is used | Docs give icon tokens per state. **Icon color for icon-only buttons has to be verified by rendering.** |
| 7 | Ghost text-button icon | `svg` gets `$icon-primary` [_button L242], but the mixin's `path:not([data-icon-path])` fill `currentColor` (= `link-primary`) is more specific [_mixins L145–148] | `$link-primary` [style.mdx L234]. Likely the same on screen; needs a render to confirm |
| 8 | `dangerDescription` default | `''` [ButtonBase.tsx L21] | story table `"danger"` [stories L211] |
| 9 | Size default | none (SCSS `lg`) | story table `"lg"` [stories L248] |

## Nested dependencies

- **Icons:** `@carbon/icons-react` components passed as `renderIcon` (stories use `Add`, `Filter`, `Notification` [stories L10]).
  - Size 16, or 20 when expressive. Paths marked `data-icon-path="inner-path"` get `fill:none` [_button L297–299].
  - Icon identity is a swap slot, not an axis.
- **Tooltip** (icon-only only):
  - `IconButton` always wraps `ButtonBase` in `<Tooltip>` with a required `label` (= `iconDescription`) [IconButton L192–204, propTypes `label.isRequired`].
  - Defaults: `highContrast=true`, `dropShadow=false`, `enterDelayMs=leaveDelayMs=100`, `closeOnActivation=true` [IconButton L150–170].
  - Placement: `align` is derived from `tooltipPosition` and `tooltipAlignment` [Button.tsx L193–209].
  - The disabled wrapper class is `cds--icon-tooltip--disabled` [IconButton L176–182, _button L324–330].
  - Tooltip pulls in Popover (`PopoverAlignment`) and `@carbon/styles` `../tooltip`.
- **BadgeIndicator** (experimental):
  - Only valid with icon-only + `ghost` + `lg`; anything else gives `console.warn` [IconButton L184–189].
  - Not rendered when `disabled` [IconButton L217–222].
- **Layout context:** `<Layout size density>` [Layout L14–67] sets `cds--layout--size-*` and `cds--layout--density-*` on an ancestor. A Button without `size` **inherits the ancestor's size**, so an Adapter or renderer must always pass `size` explicitly.

## What an Adapter should read

| Need | Read | Why not elsewhere |
|---|---|---|
| Axis names, values, defaults | Exported `as const` arrays (`ButtonKinds`, `ButtonSizes`, `IconButtonKinds`) and the destructuring defaults in `Button.tsx`, `ButtonBase.tsx` and `IconButton/index.tsx` | The TS conditional type on `kind` (`ButtonBaseProps['hasIconOnly'] extends true ? …`) always resolves to `ButtonKind`, so types alone can't express the icon-only constraint |
| Cross-axis constraints | propTypes custom validators (`kind` vs `hasIconOnly`), `IconButton`'s `Extract<>` size type, className gating (`isSelected`), `console.warn` guards | Partly only in runtime code. "Expressive only for lg" exists only as a comment and in the docs |
| Dead or legacy values | Check every type value against a SCSS selector (or the compiled CSS) | `danger--primary` passes types and tests but has no styles |
| State axis (pseudo-states) | SCSS / compiled CSS: `:hover` (inside `any-hover`/`hover` media queries), `:focus`, `:active`, `:disabled`, `.cds--btn--disabled` | Not visible in types or stories. Stories show only the enabled state |
| Color tokens per Kind × State | The `button-theme(...)` calls and per-kind overrides in `_button.scss`, then token values from `@carbon/themes` DTCG `components/button.json` + `themes.json` + `@carbon/colors` DTCG | The SCSS gives token **identity**; the DTCG files give per-theme **values** |
| Layout per size | `_layout.scss` `$layout-tokens` plus the formulas in `_mixins.scss`, **verified by computed styles in a real render** | The values are `calc()`/`min()`/`clamp()` over custom properties and `em`, and they depend on context (density, ancestor size) |
| Defaults/options sanity check | Storybook `argTypes` | Inconsistent with code (items 8 and 9 above; `danger--primary` omitted). Treat as a hint, not truth |
| Design intent | carbon-website `usage.mdx` / `style.mdx` | Pairing rules, which sizes to use, "danger cannot be icon-only", "full bleed" for xl/2xl |

**Can't be derived automatically; needs human or render evidence:**

- The final cascade result where specificity and source order decide the color: icon fills on icon-only buttons, and Selected × hover/active.
- Resolving the docs-vs-code mismatches. Policy: code wins, and record the mismatch.
- Whether Expressive is a separate axis or a Size value. Expressive × icon-only is unclear in React.
- Recommended vs not-recommended **pairings** inside button groups. These are ButtonSet guidance, not single-button exclusions.
- Figma layer naming and Auto Layout structure. The reference is the Carbon v11 Community kit, not this code.
- Behavior under touch/mobile emulation: the hover rules are gated by `(any-hover: hover)` / `(hover: hover)`, so a To-preview renderer running in mobile emulation would drop hover styling. Force hover through a desktop pointer or CDP `forcePseudoState`.
- Windows high-contrast focus mode [_button L534–536]. Out of scope.

## Open questions

1. Model **Expressive** as a Size value (`lg-expressive`, matching the docs' seven sizes) or as a Boolean axis with exclusions?
2. Is icon-only a value of an axis on Button, or its own Component Family (it is a different React component, `IconButton`, and has a reduced matrix)?
3. Confirm by rendering: icon-only icon fills per kind and state, Selected × hover/active, and the ghost text-button icon color.
4. Pin `v11.118.0` (commit `44f90d8`) for the pilot, or follow the latest release?
