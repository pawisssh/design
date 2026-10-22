# Can the Carbon Adapter propose the OverflowMenu and Icon Button Contracts?

Research for [pawisssh/design#333](https://github.com/pawisssh/design/issues/333). Map: [#310](https://github.com/pawisssh/design/issues/310). Vocabulary follows `GLOSSARY.md` (Contract, Component Family, Property Axis, Repeated child, Drafted value, Dedicated Adapter, Usage).

Researched 2026-10-22. Carbon is the Carbon Design System's pin: monorepo tag `v11.118.0` (commit `44f90d8d`), with `@carbon/react` 1.118.0, `@carbon/styles` 1.117.0 and `@carbon/icons` 11.90.0 (`skills/adapter-carbon/scripts/sources.mjs:24-59`). The Prototype pins `@carbon/react` 1.104.0 (`PROTO/package-lock.json`), so 1.104.0 is checked where it differs.

Evidence comes from four places:

- **Sources:** Carbon at the pin, fetched with `sources.mjs snapshot` into scratch. Overflow menu: 5 files, snapshotId `sha256:716a3247…`. Icon button: 7 files, `sha256:e8e97d76…`.
- **The 1.104.0 tarballs** of `@carbon/react` and `@carbon/feature-flags` 1.2.0, integrity-checked against the Prototype's lockfile.
- **A render check:** `renderToStaticMarkup` with the repo's own To-preview install (`.scratch/adapter-carbon/preview`, `@carbon/react` 1.118.0), as `preview.mjs` renders. Cases R1 to R4 are listed under Evidence.
- **The repo:** the Adapter, the four Carbon Contracts, #11 and #317, and one session transcript for cost.

No Contract was written and no Adapter run was made.

Short prefixes:

- `GH` = `https://github.com/carbon-design-system/carbon/blob/v11.118.0/`
- `R104` = `@carbon/react@1.104.0` tarball, `package/lib/components/`
- `FF12` = `@carbon/feature-flags@1.2.0` tarball, `package/lib/index.js`
- `PROTO` = `.kane/projects/health-check-management-main/` (read-only)
- `CSS` = `.scratch/adapter-carbon/preview/node_modules/@carbon/styles/css/styles.css` (1.117.0, compiled)
- `FIGHELP` = `https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties`

## Answer

1. **Trigger, icon and sizes: yes.**
   - The v11 OverflowMenu draws its trigger as an `IconButton` with `kind="ghost"` (GH `packages/react/src/components/OverflowMenu/OverflowMenu.tsx:627-645`). The v12 menu sits behind `enable-v12-overflowmenu`, which is off by default at the pin and in 1.104.0.
   - The icon is `renderIcon`, which defaults to `OverflowMenuVertical` (`:281`). That is a `Swap icon` INSTANCE_SWAP with `code: {prop: "renderIcon", valueFrom: "icon"}`. Its default `overflow-menu--vertical` exists in `@carbon/icons` `svg/32`. `preview.mjs` renders this form today.
   - Sizes are xs, sm, md and lg (`:246-249`, `:837-839`; SCSS `layout.use('size', $default: 'md', $min: 'xs', $max: 'lg')`). The Prototype uses sm and md. md is the default.
   - The holders' `hasIconOnly` is no axis value. It spreads through `...other` onto `IconButton`, which sets it anyway (R2).

2. **Floating menu: left out of the anatomy. OverflowMenuItem: a Repeated child in `code.items`.**
   - The menu renders only when `open && hasMountedTrigger` (`OverflowMenu.tsx:646`). `hasMountedTrigger` is set in an effect, so server rendering never draws the menu, even with `open` (R1).
   - `code.items` is `{component: "OverflowMenuItem", props: ["itemText", "disabled", "hasDivider", "onClick"]}`, the props the Prototype uses. No TEXT property shows an item, because nothing in Figma draws the menu.
   - The Open state is left out (Assumption 3).

3. **Icon Button: 100 variants, three layers.**
   - Axes: Kind (primary, secondary, tertiary, ghost; default primary), Size (xs, sm, md, lg; default lg), State (enabled, hover, active, focus, disabled), and Selected (unselected, selected), which only ghost takes.
   - Count: 4 × 4 × 5 + 4 × 5 = 100.
   - Anatomy: `Icon button` COMPONENT > `Icon` FRAME > `Glyph` INSTANCE.
   - `code.component` is `IconButton`, and `label` is in `code.required`.
   - This matches #11's decision. Both Contracts stand on it in code: Button with `hasIconOnly` delegates to `IconButton` (GH `packages/react/src/components/Button/Button.tsx:182`, `:220-238`), and so does OverflowMenu.

4. **Adapter change: one is needed, for Icon Button only. It is not made here.**
   - `preview.mjs` passes an INSTANCE_SWAP icon only as a prop. `IconButton` takes its icon as `children`, so To-preview and the Base-loop specimen cannot show Icon Button. That needs an icon-as-children form.
   - Two weaker changes:
     - `foundations.mjs` finds the `button-*` tokens only because Button's Contract exists.
     - `fingerprints.mjs` gives Icon Button an empty `parts`.
   - OverflowMenu needs no Adapter change if it inlines its trigger (Assumption 1). Nesting Icon Button would need #317's schema follow-on and a property-forwarding form that #317 does not have.

5. **Cost (total tokens processed, the unit of #310's "about 40M"; output is about 0.5% of it, and the rest is mostly cache reads):**
   - **Icon Button, full.** The Adapter change is about 3–6M tokens. The Contract draft is about 4–10M. The To-design build (Base Component and 100 variants) is about 5–15M. That makes about 12–30M in all.
   - **OverflowMenu, extra on top.** The draft is about 2–5M, because it reuses Icon Button's read of `_button.scss`. The 20-variant build is about 2–6M. That makes about 4–11M.
   - **Owner effort.** One To-preview review and one Contract approval per family, then one Base Component approval each.
   - **Uncertainty.** About 2× either way, driven by context size per call more than by call count. See Cost.

## Assumptions

Each is the more reversible option, unless it says otherwise.

1. **OverflowMenu inlines its trigger. It does not hold Icon Button as a nested instance.** Its anatomy owns `Icon` and `Glyph`, and its own `Swap icon` binds to `Glyph`.
   - **Why.** The holders swap OverflowMenu's own icon property: `props: {icon: "icon:…"}` on the held OverflowMenu (#317 Decisions 3 and 5). If OverflowMenu nested Icon Button, its own `Swap icon` would have to reach a `Glyph` inside the Icon Button instance.
   - **What #317 lacks.** Its `instances.props` writes fixed values per variant only (`icon:<key>`). It has no way for a middle family to forward its own property to its held instance. For text it says a value two levels down "needs the middle family to have a property for it".
   - **What Figma offers.** Figma's documented route to a nested instance's properties is "Expose properties from nested instances" (FIGHELP). That route shows the inner property to the holder; it does not forward the middle family's property. Whether a parent's property can bind to a layer inside a nested instance was not tested.
   - **Reversible.** The holders' values target OverflowMenu's own `swapIcon`, so a later switch to nesting keeps them.
   - **Cost.** Icon Button's ghost paint is copied into OverflowMenu's paint rules. A later Icon Button change does not flow into OverflowMenu in Figma.
   - **Precedent.** Toast's close button is a weak one. Carbon draws it as a plain `<button>` (`GH packages/react/src/components/Notification/Notification.tsx:182-203`), and its Contract inlines it as `Close button` FRAME > `Close icon`. Button's own icon slot is inlined the same way. OverflowMenu is different because Carbon really renders an `IconButton`, so code honesty argues for nesting. The forwarding gap decides against it for now.
2. **Icon Button's `code.component` is `IconButton`, not `Button` with `hasIconOnly`.** The `code` schema has `alwaysEmit`, `required` and `items`, but no field for a fixed prop such as `hasIconOnly: true` (`skills/contract/references/contract-schema.md:191-202`). The Prototype writes `<Button hasIconOnly>`, so To-handoff must map it (New questions).
3. **OverflowMenu carries no Open state.**
   - Carbon styles one: `cds--overflow-menu--open` gives the trigger a shadow and `$layer` (`_overflow-menu.scss:76-83`), and R1 shows server rendering sets that class.
   - But Open's main look is the menu, which is not drawn. An Open variant with no menu would misstate it. The Prototype never sets `open`.
   - Adding it later renames OverflowMenu's 20 variants. That is a small rebuild.
4. **The Tooltip is left out of both anatomies.**
   - `IconButton` always wraps a `Tooltip` whose popover is hidden until hover or focus (R3).
   - Icon Button's required `label` goes in `code.required`: To-preview fills a placeholder, and a Handoff supplies the text.
   - OverflowMenu's `iconDescription` defaults to `'Options'` (`OverflowMenu.tsx:271`), so it is code-only. VersionItem's `iconDescription="Menu"` therefore has no property to land in (New questions).
5. **Icon Button carries Selected, as #11 decided.**
   - It is valid only for ghost. The other kinds are `excluded` (`ButtonBase.tsx:57`).
   - From source order, Selected × hover and Selected × active show the same background as Selected × enabled. The selected rule (CSS:6460) comes after ghost `:active` (CSS:6392, 6412) at equal specificity. The ghost `:hover` rule sits inside `@media (any-hover: hover)` (`_mixins.scss:113-150`) and was not located in the compiled CSS. The Adapter run's render check confirms. If it holds, the owner may omit them in To-preview, but they are not invalid.
   - The Prototype does not use Selected.
6. **Icon Button's Kind has no danger values.**
   - `IconButtonKinds` is primary, secondary, ghost and tertiary (`IconButton/index.tsx:25-30`, `:344`).
   - `PROTO/src/components/PortfolioManagement/PortfolioManagement.jsx:141-148` passes `danger`, which is not a Carbon prop. It spreads to the DOM: React warns "Received `true` for a non-boolean attribute `danger`", and the button renders plain ghost (R4).
   - That button is rendered: the portfolio view opens from the Dashboard search (`PROTO/src/App.jsx:128`, `:355-361`), and the button shows once assets exist. No reference set holds it.
7. **Default icons.**
   - OverflowMenu's default `overflow-menu--vertical` is read from source (`OverflowMenu.tsx:281`), so it is not a Drafted value.
   - Icon Button has no default icon in code. `add` is drafted, matching Button's Contract.
   - Both keys are in `@carbon/icons@11.90.0` `svg/32` only. `svg/16` holds 68 files and neither. `SKILL.md:58` allows the `svg/32` fallback.
8. **The pin's Contracts serve the Prototype's 1.104.0, as #317 Assumption 1 decided.** The one gap found is harmless: 1.104.0 defaults OverflowMenu's `size` to `"md"` (`R104 OverflowMenu/OverflowMenu.js:90`), and 1.118.0 has no default (`OverflowMenu.tsx:283`). Every Prototype OverflowMenu passes `size`, and `alwaysEmit: ["size"]` writes it in snippets anyway.
9. **OverflowMenu's `light`, `flipped`, `direction`, `menuOffset` and `menuOptionsClass` are no axes.** `light` is deprecated. The rest place or style only the menu, which is left out.

## Evidence: the Adapter

- **No generator.** The Carbon Adapter is a 14-step procedure an agent carries out by hand: "Write … by hand … No generator exists" (`skills/adapter-carbon/SKILL.md:33-35`). To-handoff's mid-run uses the same steps (`SKILL.md:99`, `skills/adapter-carbon/scripts/handoff-adapter.mjs:39-41`), and `checkContract` validates the result (`handoff-adapter.mjs:48-57`).
- **The rules both families meet:**
  - Kinds are kept only if the SCSS styles them (`SKILL.md:48`).
  - Sizes come from `layout.use('size', …)` (`:49`).
  - State comes from pseudo-classes (`:50`).
  - Icons come through `renderIcon` as an `Icon` FRAME, a `Glyph` INSTANCE, a `Swap icon` INSTANCE_SWAP and an `Icon` BOOLEAN, with every key in `svg/16` or `svg/32` (`:58`).
  - Repeated children go in `code.items` (`:60`).
  - Drafted values get fingerprints from a node map (`:62-85`).
- **Repeated child form.** It is `{component, props}` (`skills/contract/references/contract-schema.md:200`). Select's `{"component": "SelectItem", "props": ["value", "text"]}` is the precedent.
- **State axis.** The canonical State axis holds only enabled, hover, active, focus and disabled (`contract-schema.md:42`). Any other styled prop is an attribute axis (`:44`), as Text Input's `readOnly` is.

## Evidence: the existing Contracts

| | button | select | text-input | toast-notification |
|---|---|---|---|---|
| Bytes | 19135 | 35909 | 34863 | 30707 |
| Variants | 245 | 52 | 36 | 6 |
| Anatomy nodes | 4 | 13 | 12 | 15 |
| Drafted values | 0 (predates them) | 53 | 54 | 44 |
| Source files | 10 | 10 | 11 | 6 |

- **Button.** It says "Icon-only buttons are the separate Icon Button family" (`design-systems/carbon/contracts/button.component.json:7`).
  - Its icon slot is the inline `Icon` > `Glyph` form, with `swapIcon` `code: {prop: "renderIcon", valueFrom: "icon", visibleWhen: "icon"}`.
  - Its `alwaysEmitWhy` is the `<Layout size>` inheritance (`:270-271`). The same reason holds for both new families: `cds--layout--size-${size}` is set only when `size` is passed (`ButtonBase.tsx:52`, `OverflowMenu.tsx:548`).
- **Select** is the `code.items` precedent.
- **Toast** inlines its close button, as Assumption 1 covers.
- **The schema has no `instances` and no `designSystem` yet.**
  - `dependencies.families` items require only `key` and `contract` (`skills/contract/contract.schema.json:93-95`).
  - The schema has no top-level `additionalProperties: false`, so an `instances` field would pass and be ignored today.
  - Rule 7 looks a dependency up only in its own Design System (`contract.mjs:581`, per #317).
- **#11** decided Icon Button's Kind (four kinds), its Size (xs to lg, no expressive), and Selected for ghost only. It also recorded that it wraps a Tooltip with a required label. It left "icon-only icon fills per kind and state" and "Selected × hover/active" to a render. Both are answered below and in Assumption 5.

## Evidence: OverflowMenu at the pin

- **Version switch.** `OverflowMenu/index.tsx:23-36` picks `next/` only when `useFeatureFlag('enable-v12-overflowmenu')` is on.
  - The flag is `enabled: false` in `GH packages/feature-flags/feature-flags.yml:40-43`, and false by default in `FF12:42-44, 80, 128-130`.
  - R1 printed "`enable-v12-overflowmenu` is available but not enabled".
  - The Prototype sets no FeatureFlags in `src`, `vite.config.js` or `index.html`.
  - 1.104.0 makes the same switch (`R104 OverflowMenu/index.js:24`).
- **Props.**
  - `OverflowMenuProps` extends `IconButtonProps` minus `kind`, `size`, `label` and others (`OverflowMenu.tsx:126-140`).
  - `size?: 'xs' | 'sm' | 'md' | 'lg'` (`:246-249`), with no default (`:283`).
  - `iconDescription = 'Options'` (`:271`); `renderIcon: IconElement = OverflowMenuVertical` (`:281`); `...other` (`:285`).
- **Render.**
  - `<span cds--overflow-menu__wrapper>` holds `<IconButton {...other} … label={iconDescription} kind="ghost">` with `<IconElement className="cds--overflow-menu__icon cds--btn__icon" aria-label={iconDescription}/>`, then `{open && hasMountedTrigger && wrappedMenuBody}` (`:621-649`).
  - `hasMountedTrigger` starts false and is set in an effect (`:292`, `:315-319`).
  - Trigger classes are `cds--overflow-menu`, `--open`, `--light`, `--${size}` and `cds--layout--size-${size}`, each only when its prop is set (`:541-550`). An undefined `size` emits no class (R1).
- **1.104.0 render path.** It is the same: wrapper, `IconButton`, `kind: "ghost"`, and the menu only when `open && hasMountedTrigger` (`R104 OverflowMenu/OverflowMenu.js:266-287`).
- **SCSS** (`GH packages/styles/scss/components/overflow-menu/_overflow-menu.scss`):
  - `@use` of button and tooltip (`:8-10`).
  - `layout.use('size', $default: 'md', $min: 'xs', $max: 'lg')` (`:33`). The trigger is square at `layout.size('height')` (`:42-45`).
  - The button radius applies (`:50`). Focus is the focus outline (`:52-54`). Hover is `$background-hover` (`:56-60`).
  - The icon is 16px with `fill: $icon-primary` (`:91-95`).
  - `--open` adds a shadow and `$layer` (`:76-83`).
  - The menu and its items run from `:101` to `:350`, including the danger item, which uses `button.$button-danger-primary`.
  - The trigger has no disabled rule of its own. Disabled comes from the ghost icon-only button rules.
- **Default size on the trigger.** The trigger carries both `.cds--btn` (default lg) and `.cds--overflow-menu` (default md). In the compiled CSS, `.cds--overflow-menu` comes later at equal specificity (CSS:6204 versus CSS:8009), so md wins.
- **Component tokens.** The pin has no `packages/themes/src/dtcg/components/overflow-menu.json`. The trigger uses theme tokens only.
- **OverflowMenuItem props.** `itemText` (required; `OverflowMenuItem.tsx:59`, `:249`), `disabled` (`:37`), `hasDivider` (`:47`), `isDelete` (`:64`), `href` (`:52`) and `onClick` (`:255`).

**Render check** (1.118.0, `renderToStaticMarkup`):

- **R1** `<OverflowMenu open>`:
  - `aria-expanded="true"` and the `cds--overflow-menu--open` class are on the trigger.
  - No `cds--overflow-menu-options` is in the output.
  - No size class is emitted.
- **R2** `<OverflowMenu size="sm" renderIcon={Edit} hasIconOnly>`:
  - `class="cds--overflow-menu cds--overflow-menu--sm cds--layout--size-sm cds--btn cds--btn--sm … cds--btn--ghost cds--btn--icon-only"`.
  - The svg has `cds--overflow-menu__icon cds--btn__icon`.
  - The class list is the same as without `hasIconOnly`.
- **R3** `<IconButton kind="ghost" size="sm" label="Back" isSelected><Add/></IconButton>`:
  - `cds--popover-container … cds--icon-tooltip` > `cds--tooltip-trigger__wrapper` > `<button class="cds--btn cds--btn--sm … cds--btn--ghost cds--btn--icon-only cds--btn--selected" aria-pressed="true">`.
  - The svg has **no class**.
  - A hidden `cds--popover` holds the label.
- **R4** `<Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} danger>`:
  - React's `danger` warning.
  - Plain ghost icon-only markup.

## Evidence: Icon Button at the pin

- **IconButton** (`GH packages/react/src/components/IconButton/index.tsx`):
  - `IconButtonKinds` is primary, secondary, ghost and tertiary (`:25-30`).
  - `children` is the icon (`:65-67`). `label: ReactNode` is required (`:122`, `:354`).
  - `size?: … 'xs' | 'sm' | 'md' | 'lg'` (`:137`). `kind` has no default (`:164`), so ButtonBase's `kind = 'primary'` applies (`ButtonBase.tsx:28`).
  - It renders `<Tooltip … label={label}><ButtonBase … kind={kind} isSelected hasIconOnly>{children}{badge}</ButtonBase></Tooltip>` (`:192-224`).
  - The tooltip classes are `cds--icon-tooltip` and `--disabled` (`:176-182`).
  - `badgeCount` is only for ghost at lg (`:184-187`, `:217-220`).
- **ButtonBase** (`…/Button/ButtonBase.tsx`):
  - `cds--btn--${kind}` (`:53`), `cds--btn--icon-only` (`:56`).
  - `cds--btn--selected` only when `hasIconOnly && isSelected && kind === 'ghost'` (`:57`).
  - `aria-pressed` for ghost icon-only (`:80-89`).
  - `...rest` reaches the DOM (`:38`, `:123`).
- **Button** (`…/Button/Button.tsx`):
  - With `hasIconOnly` it returns `<IconButton {...rest} label={iconDescription} …>{iconOnlyImage ?? children}</IconButton>` (`:182`, `:220-238`).
  - `iconOnlyImage = <ButtonImageElement />` has no class (`:180`).
  - It logs an error for `renderIcon` without `iconDescription` (`:173-179`). PortfolioManagement's trash button triggers it.
  - 1.104.0 delegates the same way (`R104 Button/Button.js:53, 61, 75`).
- **SCSS** (`GH packages/styles/scss/components/button/_button.scss`):
  - `.cds--btn` uses `layout.use('size', $min: 'xs', $default: 'lg', $max: '2xl')` (`:116`). So lg is the default (CSS:6204).
  - `.cds--btn--icon-only` is square at `layout.size('height')` with padding 0 (`:247-253`). Its first child is at least 16px wide (`:255-257`).
  - The ghost icon-only focus is an inset box-shadow (`:263-267`).
  - Selected is `$background-selected` (`:293-295`).
  - Ghost `:not([disabled]) svg` fills `$icon-primary` (`:242-244`). Disabled ghost uses `color: $text-disabled` (`:230-240`).
  - The `.cds--btn__icon` fills for ghost icon-only (`$icon-primary`, disabled `$icon-on-color-disabled`, `:301-316`) do not apply to Icon Button's classless child svg (R3). They do apply to OverflowMenu's icon (R2).
  - Per-kind colours come from `button-theme` (`_mixins.scss:113-150`). The icon is 16px (`_mixins.scss:93-97`).
- **#11's two render questions, read from source order only.** R1 to R4 show markup, not computed paint. The Adapter run's render check confirms, as #20 did for Button's ghost icon (`contract-schema.md:188`).
  - **Icon fills per kind.** Primary, secondary and tertiary should take their font colour through the svg's `fill="currentColor"`. Ghost should take `$icon-primary`, or `$text-disabled` when disabled. OverflowMenu's classed icon should take `$icon-primary`, or `$icon-on-color-disabled` when disabled. If so, the disabled-ghost fills differ between the families, and each Contract needs its own paint rule.
  - **Selected × hover/active** is in Assumption 5.

## Evidence: Prototype usage

- **OverflowMenu.** These are the three holders #333 lists, and all three swap the icon:
  - `DrilldownItem`: `PROTO/src/App.jsx:59-68`, with `size="sm"`, `flipped`, the memo icon, and items "View Report", "View Script" and "Set Password" (`onClick`).
  - `VersionItem`: `PROTO/src/components/PortfolioVersion/PortfolioVersion.jsx:119-129`, with `size="md"` and `iconDescription="Menu"`. The memo icon becomes `fa-circle-notch fa-spin` while loading. The items use `disabled={hasReport === 'loading'}`.
  - The column header: `App.jsx:164-168`, with `size="md"`, `flipped`, `hasIconOnly` and the ellipsis icon. Its items are "Refresh", "Add to Column" (`onClick`) and "Close Column" (`onClick`, `hasDivider`).
- **Icon Button.** Two sites, both ghost and sm:
  - The header back button: `App.jsx:148-157`, with `iconDescription="Back"`, shown when `canGoBack`.
  - The trash button: `PortfolioManagement.jsx:141-148`, with `danger` and no `iconDescription`.
  - No other icon-only Carbon button is in `src`. `SideNavLink` is another family.
- **Shared traits.**
  - Every icon is Font Awesome through `renderIcon` (`App.jsx:22-24`). Those are icons of the holding Design System (#317 Decision 5).
  - The `phc-*` class overrides are the holders' own layout and paint rules (#317 Decision 4).
  - No site uses Selected, Open, xs, lg or a non-ghost kind.

## Evidence: Adapter changes

| Change | Where | What it blocks | Real work? |
|---|---|---|---|
| An icon as `children` | `skills/adapter-carbon/scripts/preview.mjs:97-99` sets `props[code.prop] = Icon` (a component type), and `:126` passes `children` as the third argument, which overrides `props.children`. An Icon Button `swapIcon` with `code.prop: "children"` loses its icon: `props.children` is overwritten. | To-preview and the Base-loop specimen for Icon Button. Not `validate`. | Yes. A small form: an INSTANCE_SWAP with `prop: "children"` sets `children = React.createElement(Icon)`. To file. |
| Component tokens by use, not by family key | `foundations.mjs:49-50` `COMPONENTS = { button: … }`, read only when a Contract's `family.key` is `button` (`:282-285`); an unknown token fails (`:307-309`) | Nothing today, because Button's Contract exists. An Icon Button Contract alone would fail. | Small. Map `icon-button` to `button.json`, or load a file when any closure token is in it. To file. |
| `parts` from another block's classes | `fingerprints.mjs:90` matches only `cds--<family>__*`. Icon Button has none, so `parts` is `[]`, and node keys keep their full class (`:105`). OverflowMenu gets `icon` and `wrapper`. | Nothing. The fingerprints are weaker, not wrong. | Optional. |
| `instances`, `designSystem` | `contract.schema.json:93-95`. No validator support. | The holders, not these two Contracts, if OverflowMenu is inlined. | #317's follow-on, already decided. |
| Forwarding a middle family's property into a nested instance | Not in #317 | Only a nested OverflowMenu → Icon Button | A design question first. |

The validator accepts both sketches' code forms as they stand:
- `code.items` needs only `component` and a non-empty `props` list (`skills/contract/scripts/contract.mjs:387-389`). No rule requires a TEXT `itemProp`, which is checked only when present (`:390-396`), so OverflowMenu's items with no TEXT property pass.
- Nothing restricts which prop an INSTANCE_SWAP's `code` names. `valueFrom` is read only by `preview.mjs`. So Icon Button's `code.prop: "children"` passes `validate`; only the preview fails.
- `code.required` may not name a prop an axis value or property sets (`:383-385`). `label` is set by neither.

`preview.mjs` already handles `code.component` lookup (`:62-65`), OverflowMenu's `renderIcon` (`:97-99`), `code.items` (`:79-81`, `:104-106`) and `code.required` placeholders (`:108-110`). OverflowMenu's items render inside a menu that is never drawn, which is harmless.

## Evidence: cost

- **Unit.** "Tokens" means input + cache writes + cache reads + output, the unit behind #310's "about 40M". In the measured session, output was 1.02M of 205M, about 0.5%. The rest is mostly cache reads; the split between uncached input, cache writes and cache reads was not measured.
- **The 40M figure.** One Carbon window ran a live test, its fixes and the Base loop: 263 calls at about 149k context, about 40.5M tokens (the owner's 2026-10-21 session-briefs retro, kept in local Claude memory, not in the repo; #310's Notes carry the rounded figure). That is mostly context re-read per call, not one Contract.
- **One measured draft.**
  - Session `4ae80bd2` (2026-10-16, worktree `awesome-bartik-c24aeb`) first wrote `text-input.component.json` at call 44, at 6.4M tokens cumulative.
  - Its first Edit to it came at call 63, at 10.3M.
  - The window was a continued one at about 145k context per call, and it also wrote three scratch tools first. So this is an upper bound for one draft in a heavy window.
  - The dig stopped there, as the brief allowed.
- **Method.** tokens ≈ calls × mean context.
  - **Icon Button draft.** Its source read is close to Text Input's: Button, ButtonBase, IconButton, `_button.scss`, `_mixins.scss` and layout. Its anatomy is smaller (3 nodes, against 12), with about 15–25 Drafted values. So about 40–70 calls at 80–145k context, or about 4–10M.
  - **Adapter change.** One PR, with tests and `/code-review`. About 20–40 calls at about 100k context, or about 3–6M.
  - **Build.** A Base loop plus a 100-variant set, unmeasured on its own: about 5–15M.
- **OverflowMenu extra.**
  - The draft reuses the button sources and adds `_overflow-menu.scss`, `OverflowMenu.tsx` and `OverflowMenuItem.tsx`, about 25–45 calls, or about 2–5M.
  - The 20-variant build is about 2–6M.
  - No Adapter change is needed for it.
  - Nesting instead would add #317's follow-on and the forwarding question, not estimated here.
- **Uncertainty.** About 2× either way. A fresh window at about 60k mean context costs half of a 145k window for the same calls.
- **Owner effort.** Icon Button means a To-preview review of 100 variants, perhaps omitting the 8 Selected × hover/active ones, then one approval and one Base Component approval. OverflowMenu means a review of 20 variants and the same two approvals.

## Sketch: Icon Button

A sketch for the Adapter run, not a Contract.

- **family:** `icon-button`, "Icon button". "Carbon's icon-only button: an IconButton, or a Button with `hasIconOnly`, which delegates to it."
- **axes:**
  - `kind`: primary (default), secondary, tertiary, ghost. Code `{kind: "<value>"}`.
  - `size`: xs, sm, md, lg (default lg). Code `{size: "<value>"}`.
  - `state`: enabled, hover (`:hover`), active (`:active`), focus (`:focus`), disabled (`:disabled`, code `{disabled: true}`).
  - `selected`: unselected (default, `{}`), selected (`{isSelected: true}`).
- **excluded:** `{match: {kind: ["primary", "secondary", "tertiary"], selected: "selected"}, reason: "isSelected styles only a ghost icon-only button", evidence: ["ButtonBase.tsx L57"]}`.
- **properties:** `swapIcon` "Swap icon", INSTANCE_SWAP, default `icon:default`. It binds `Glyph`, with code `{prop: "children", valueFrom: "icon"}`, which needs the preview change. There is no `Icon` BOOLEAN, because the icon is always there.
- **anatomy:** `Icon button` COMPONENT (the `<button>`) > `Icon` FRAME (16×16) > `Glyph` INSTANCE `icon:default`. Node map: `"Icon button": "btn btn--icon-only"`, `"Icon": {"of": "Icon button"}`, `"Glyph": {"of": "Icon button"}`. The child svg has no class (R3), so the button is the only classed element. OverflowMenu's icon is classed and Icon Button's is not, so the two node maps differ. That is the same weakness as the empty `parts`.
- **paint:**
  - Per kind, from `button-theme`. Ghost icon `$icon-primary`, disabled `$text-disabled`, from source order (the run's render check confirms).
  - Selected is `$background-selected`. Ghost focus is an inset box-shadow.
  - It needs the `button-*` tokens for primary, secondary and tertiary.
- **icons:** default `add` (drafted). Preferred as Button's list. `svg/32` fallback.
- **code:** `{framework: "react", package: "@carbon/react", component: "IconButton", import: "import { IconButton } from '@carbon/react';", alwaysEmit: ["size"], alwaysEmitWhy: "<Layout size> inheritance", required: ["label"]}`. No `items`.
- **expected variants:** 4 × 4 × 5 + 4 × 5 = **100**.
- **left out, and why:**
  - **The Tooltip** and its `align`, `autoAlign`, `enterDelayMs`, `leaveDelayMs`, `closeOnActivation`, `dropShadow`, `highContrast` and `wrapperClasses`. It is hidden at rest (Assumption 4).
  - **`badgeCount`.** It is ghost lg only and unused.
  - **`href`.** It renders an `<a>`, with the same look.
  - **Danger kinds.** They are not `IconButtonKinds`.
  - **xl, 2xl and expressive.** The type limits sizes to xs–lg (#11).

## Sketch: OverflowMenu

A sketch for the Adapter run, not a Contract.

- **family:** `overflow-menu`, "Overflow menu". "The closed trigger of Carbon's v11 OverflowMenu, a ghost icon-only button. The floating menu is code-only."
- **axes:**
  - `size`: xs, sm, md (default), lg. Code `{size: "<value>"}`.
  - `state`: enabled, hover, active, focus, disabled (`{disabled: true}`, through `...other`).
- **excluded:** none.
- **properties:** `swapIcon` "Swap icon", INSTANCE_SWAP, default `icon:default`. It binds `Glyph`, with code `{prop: "renderIcon", valueFrom: "icon"}`. This is the property the holders' `instances` set.
- **anatomy:** `Overflow menu` COMPONENT (the `<button>`) > `Icon` FRAME (16×16) > `Glyph` INSTANCE `icon:default`. Node map: `"Overflow menu": "overflow-menu btn btn--ghost btn--icon-only"`, `"Icon": "overflow-menu__icon btn__icon"`, `"Glyph": {"of": "Icon"}`. The wrapper span and tooltip span carry no paint and are left out.
- **paint:**
  - Transparent at rest. Hover is `$background-hover`. Active is `$background-active` (ghost).
  - Focus is the outline or the inset shadow, whichever wins in the compiled order (the run checks).
  - Icon `$icon-primary`; disabled icon `$icon-on-color-disabled`, from source order (the run's render check confirms).
  - It is square at `layout.size('height')`. It needs no component tokens.
- **icons:** default `overflow-menu--vertical` (read). Preferred `overflow-menu--vertical` and `overflow-menu--horizontal` (drafted). `svg/32` fallback.
- **code:** `{framework: "react", package: "@carbon/react", component: "OverflowMenu", import: "import { OverflowMenu, OverflowMenuItem } from '@carbon/react';", alwaysEmit: ["size"], alwaysEmitWhy: "<Layout size> inheritance; 1.104.0 defaults md, 1.118.0 has no default", items: {component: "OverflowMenuItem", props: ["itemText", "disabled", "hasDivider", "onClick"]}}`.
- **source.files:** OverflowMenu `index.tsx` and `OverflowMenu.tsx`, `OverflowMenuItem.tsx`, `IconButton/index.tsx`, `ButtonBase.tsx`, `_overflow-menu.scss`, `_button.scss`, `_mixins.scss`, `_vars.scss`, and the layout SCSS.
- **expected variants:** 4 × 5 = **20**.
- **left out, and why:**
  - **The floating menu,** with its `<ul>` and FloatingMenu: never drawn by server rendering.
  - **Open:** Assumption 3.
  - **`light`:** deprecated.
  - **`flipped`, `direction`, `menuOffset` and `menuOptionsClass`:** menu only.
  - **The Tooltip and `iconDescription`:** Assumption 4.
  - **`isDelete` and `href` on items:** unused, though `code.items` can add them.
  - **The v12 `next/` menu:** behind a flag that is off.
  - **Nesting Icon Button:** Assumption 1.

## Bears on open tickets

- **#315:** These two are Carbon's Contracts, not anchored on the Prototype. Whatever #315 decides, the holders' `dependencies.families` point at `{key: "overflow-menu" | "icon-button", designSystem: "carbon", source.tag: "v11.118.0"}`, and until both are approved #317 Assumption 2 refuses DrilldownItem, VersionItem and the column header.
- **#316:** The holders' `instances` values come from the Prototype: OverflowMenu sm or md, icon memo, ellipsis or circle-notch when Loading, and Icon Button ghost sm. All of them sit inside these sketches' full selections, so no selection change is needed.
- **#331:** On either path, the Prototype's Carbon components are Carbon Design System families. Both paths need the same recognition rules: `<OverflowMenu>` is `overflow-menu`, and `<Button hasIconOnly>` is `icon-button`, not `button`.

## New questions

- **How does a Usage of `<Button hasIconOnly>` map to `icon-button`, not `button`?**
  The Prototype never imports `IconButton`, and `code.component` must be `IconButton` (Assumption 2). To-handoff finds a Usage's Contract by its import alone: `contractOfImport` matches `code.package` and `code.component` against the import's module and export (`skills/to-handoff/scripts/generate.mjs:326-330`). So today `<Button hasIconOnly>` is a Button Usage, though Button's Contract says icon-only is another family. To-handoff and the Vibe-to-Figma recognisers need a rule keyed on `hasIconOnly`, as Carbon's own `Button.tsx:182` is. The snippet should then emit the Contract's form (`IconButton`).
- **How does a middle family forward its own property into a nested instance?**
  #317's `instances.props` holds fixed values only. A held family that itself holds a family, such as OverflowMenu over Icon Button, cannot pass its holder's swap down. Figma's "expose nested instances" does something else. This must be settled before OverflowMenu can nest Icon Button.
- **Adapter change: To-preview renders an INSTANCE_SWAP icon as `children` (needs-triage).**
  `preview.mjs:97-99` and `:126` cannot render `IconButton`'s icon. It blocks Icon Button's To-preview review and Base-loop specimen. The fix is small, with a test.
- **Adapter change: Foundations loads component token files by use, not by family key (needs-triage).**
  `foundations.mjs:49-50` and `:282-285` find the `button-*` tokens for Icon Button only because Button's Contract exists. It is a robustness fix before a second family uses another family's token file.
- **Adapter change: drafted-value `parts` for a family styled by another block (needs-triage, optional).**
  `fingerprints.mjs:90` gives Icon Button `parts: []`. A node-map or Contract field naming the class blocks would make its family fingerprints meaningful.
- **Where does a content prop that nothing draws live, such as a tooltip label?**
  Icon Button's `label` fits `code.required`, but OverflowMenu's optional `iconDescription` ("Menu" in VersionItem) has no home, so a Usage drops it. The question is whether the Contract needs code-only properties, or whether the Tooltip should be drawn.
- **Should OverflowMenu carry an Open state?**
  Carbon styles the open trigger, and server rendering shows it, but not the menu. Carrying Open means a Figma menu, which is perhaps a Sub-component built from `_overflow-menu.scss:101-350`, or an Open trigger with no menu.
- **PortfolioManagement's `danger` on an icon-only Button does nothing.**
  Carbon has no `danger` prop and no danger Icon Button kind, and React warns. The Handoff should record it as ghost, and perhaps report the Prototype's intent, a red trash button, as an Off-system question for the owner.
