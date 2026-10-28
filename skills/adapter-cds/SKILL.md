---
name: adapter-cds
description: CDS Web Adapter, from the Coinbase Design System's web library (`@coinbase/cds-web`) at a pinned commit to its pinned sources, draft Contracts and Foundations document. Use when fetching the CDS sources, writing or checking a CDS Contract and its Drafted-value fingerprints, snapshotting a CDS Contract's source files, regenerating the CDS Foundations document, rendering CDS specimens for To-preview, comparing a CDS Contract with CDS's own render, taking a CDS Prototype through To-handoff, or moving the CDS pin.
---

# CDS Adapter

The Dedicated Adapter for CDS Web, the Coinbase Design System's web Code Library. Its Contracts have `source.adapter: "cds"` and `codeLibrary: "CDS Web"`, and its outputs live in [`design-systems/cds/`](../../design-systems/cds/). What a Contract and a Foundations document must contain is in the shared [`contract`](../contract/SKILL.md) skill and its [Adapter guide](../contract/references/adapter-guide.md); this skill only knows how to read CDS. The spec is [#383](https://github.com/pawisssh/design/issues/383).

CDS has no token file: its theme is TypeScript, and its hover, pressed and disabled colours are computed by `getBlendedColor`. So the Foundations step evaluates CDS's compiled theme modules, under the limits [ADR 0021](../../docs/adr/0021-an-adapter-may-evaluate-a-code-librarys-compiled-theme.md) sets.

## 1. Fetch the sources

```
node skills/adapter-cds/scripts/sources.mjs
```

[`scripts/sources.mjs`](scripts/sources.mjs) pins CDS Web 9.29.0 at commit `135dc3c` with an empty `tag`: 9.29.0 has no git tag, and its npm package has no `gitHead`. The commit is the one on `coinbase/cds` master that bumped `packages/web/package.json` to 9.29.0 ("chore: release cds 9.29.0 (#901)"). The command fetches into gitignored `.scratch/adapter-cds/sources/`:

- `cds/<repo path>`: raw files at the pinned commit, each checked against its sha256. They are the evidence later steps cite: `LICENSE`, each package's `package.json`, the theme's TypeScript sources (`defaultTheme.ts`, `theme.ts`, `createThemeCssVars.ts`), and `cds-common`'s blend and Button token sources. It also fetches every file a committed CDS Contract pins, and fails on a Contract pinned to another commit.
- `npm/<name>@<version>/package/...`: the members of three npm tarballs, each tarball checked against its registry `integrity`. Only the members the `extract` patterns in `CDS.packages` name are extracted:
  - `@coinbase/cds-web` 9.29.0: every compiled `.css` under `esm/` (per-component, `esm/styles/`, `esm/styles/responsive/`), `esm/themes/*.js`, and `esm/core/createThemeCssVars.js` with `esm/core/theme.js`.
  - `@coinbase/cds-common` 9.29.0: the token maps `esm/tokens/*.js` and `esm/color/getBlendedColor.js`, each with the modules it imports.
  - `@coinbase/cds-icons` 5.26.0, the version cds-web depends on: `esm/svgs/*.svg`.

  Each package's `package/package.json` is extracted too. Each package folder has an `.extracted.json` manifest with its pin and the sha256 of every member.

No package script runs: the tarballs are only listed and extracted with `tar`. It also fetches the five sources the Foundations step reads beyond those: `ThemeProvider.tsx`, `Interactable.tsx`, `interactableCSSProperties.ts`, cds-common's `tokens/interactable.ts` and `ButtonBaseProps.ts`. The command also installs the [preview renderer](#preview-renderer)'s packages. Done when it prints `CDS Web 9.29.0 (commit 135dc3c, untagged) sources OK` and `CDS preview packages OK`. A re-run with everything intact downloads nothing.

For the later steps, `readSources()` returns the files and, for each package, its folder and member list. It throws, naming the file or package, when a hash differs.
- The compiled modules import each other without extensions (`'./blendColors'`), so load them through a bundler or loader rather than plain Node ESM.
- `getBlendedColor` imports `d3-color`, the one package outside these tarballs. The fetch also installs it, from the committed lockfile in [`foundations/`](foundations/), with `npm ci --ignore-scripts` into `.scratch/adapter-cds/foundations/`, and prints `CDS Foundations packages OK` first.

Tests: `node --test skills/adapter-cds/test/*.test.mjs`. The offline tests always run; the ones that read the fetched sources skip, saying to run the fetch, until it has run.

## 2. Snapshot a Contract's source files

```
node skills/adapter-cds/scripts/sources.mjs snapshot <repo path> <repo path> ...
```

It downloads each repository path at the pinned commit into `.scratch/adapter-cds/sources/cds/<path>` and prints `{tag, commit, files, snapshotId}`. Copy `files` and `snapshotId` into the Contract's `source`; `snapshotId` is the Adapter guide's manifest hash, so its shell recipe recomputes it from those files. If you read another file later, re-run `snapshot` with the full list.

## 3. From CDS source to a draft Contract

Write `design-systems/cds/contracts/<family>.component.json` by hand, following the [Adapter guide](../contract/references/adapter-guide.md) and the [Contract schema](../contract/references/contract-schema.md). No generator exists. The [Button Contract](../../design-systems/cds/contracts/button.component.json) is the worked example. For CDS:

1. **Pick the files** at the pin. For a family `<Family>` they are usually:
   - the component: `packages/web/src/<group>/<Family>.tsx` (props, defaults, and its Linaria `css` literals). Button's `<group>` is `buttons/`.
   - its token map, `packages/common/src/tokens/<family>.ts` (`variants`, `transparentVariants`), and the variant type in `packages/common/src/types/` (`ButtonBaseProps.ts`, with its `@deprecated` values).
   - the shared behaviour it renders through: `packages/web/src/system/Interactable.tsx` (state colours, child opacity, the focus ring), `Pressable.tsx` (loading, press scale), and `packages/common/src/tokens/interactable.ts` (the opacities).
   - the docs examples, `apps/docs/docs/components/<docs group>/<Family>/_webExamples.mdx` (labels, icons; the docs group can differ, Button's is `inputs/`), CDS's Code Connect file `packages/web/src/<group>/__figma__/<Family>.figma.ts`, and `packages/web/package.json` for the export path.

   Snapshot them (section 2) and copy `files` and `snapshotId` into `source`. Fill the rest from the Button Contract: `codeLibrary: "CDS Web"`, `adapter: "cds"`, the repository, the empty `tag`, the commit, and the three `packages` versions. The Foundations step refuses a Contract pinned to another commit or version.
2. **Values from the styles, not the types.** The compiled CSS under `npm/@coinbase/cds-web@9.29.0/package/esm/` is what a value is checked against. A Linaria literal compiles to one hashed class (`startNodeCss-s2x7iw5`). Layout props (`paddingX={4}`, `borderRadius={900}`) compile to atomic classes in `styles/responsive/base.css` (`._4-_sm7rau { padding-inline-start: var(--space-4); padding-inline-end: var(--space-4) }`).
3. **Variants.** Take the variant union from the types and keep the values the token map styles. A `@deprecated` value goes in `dropped` with its evidence, and Foundations gives its tokens scopes `[]` (Button: `foregroundMuted`). A boolean that swaps the token map is its own axis (Button's `transparent` is the `fill` axis, `solid` / `transparent`), and so is one that changes the drawing (`loading`).
4. **Sizes.** Take them from the family's size table (Button's `buttonSizes`: `paddingX`, `paddingY`, `borderRadius`, `iconSize`, `font` per size), with the default from the `default<Family>Size` constant. A deprecated alias (`compact`, size `s`) goes in `dropped`. Props that only place the component in its parent (`block`, `flush`) are not axes: give them a note.
5. **State from Interactable.** Interactable styles `:hover`, `:active` / `[aria-pressed='true']`, `:disabled` / `[aria-disabled='true']` and `:focus-visible`, so a family that renders through it gets all five canonical states. Hover, Active and Focus have `code: null` and their selector in `css`, and Disabled has `code: {disabled: true}`. Pressable makes a loading component disabled, so loading with Hover, Active or Focus can't happen in use. Keep those tuples, with a note, and let the owner omit them in To-preview.
6. **Cascade → ordered rules.** The stylesheet order is global, the responsive files, then `Interactable.css`, `Pressable.css` and each component's CSS. At equal specificity the later file wins: Pressable's `[data-loading='true']` beats Interactable's `:disabled`, and `transparentWhileInactiveCss` keeps a transparent component's background `transparent` while disabled. Write the base rule, then one rule per variant and per size, then the states, then loading last, so the later rule wins as the CSS does.
7. **Values.**
   - Bind a variant's colours to the component tokens (`button-<variant>[-transparent]-<background|color>`). Bind a state's colours to the Synthesized tokens (`button-<variant>[-transparent]-<hover|pressed|disabled>-background`).
   - Bind sizes to the Layout tokens the size table names: `paddingX` 4 is `space-4`, `borderRadius` 900 is `borderRadius-900`, `iconSize` m is `iconSize-m`. `font` is the text style (`headline`).
   - The opacities Interactable sets on the children (`> *`) go on each direct child of the root (Button's Start icon, Middle and End icon, not the Label inside Middle) as `{raw, level: "info"}`, naming `opacityHovered` (0.88) or `opacityPressed` (0.82). The disabled opacity goes on the root, as `accessibleOpacityDisabled` (0.5).
   - A `visibility: hidden` child that keeps its width is `opacity` raw 0. `color="currentColor"` on an Icon is `{sameAs: "Label.fill"}`.
   - Button passes `borderWidth` 0: bind `borderWidth-0` and leave `stroke` `none`.
8. **Focus ring.** Interactable draws a 2px solid outline in `bgPrimary`, offset 2px. Model it on Focus as `stroke: {token: "bgPrimary"}`, `strokeWeight` raw 2 (`warning`, a constant) and `strokeAlign: "outside"`, with a note that the offset gap is lost. A drop shadow can't bind `bgPrimary`, which has no `EFFECT_COLOR` scope.
9. **Icons.** A family that takes icon names (`startIcon="add"`) gets an icon-slot FRAME per position holding a glyph INSTANCE of `icon:default`. Each slot has a BOOLEAN bound to its `visible` and an INSTANCE_SWAP bound to the glyph's `mainComponent`, `valueFrom: "icon"`. Set `icons.source` to `@coinbase/cds-icons` `5.26.0`, `esm/svgs/{key}-16-inactive.svg`, fallback `esm/svgs/{key}-24-inactive.svg`. Pick `default` and `preferred` from the docs examples. Every key must exist in the fetched `esm/svgs`, and the preview renderer checks it against the icon font's glyph map. A part CDS draws with `position: absolute` is a FRAME with `direction: "none"`, `position: "absolute"` and its constraints, its circles ELLIPSE layers with `arc` and `strokeCap` (Button's loading Spinner › Track, Arc, hidden unless Loading=On). An animated part is drawn as the frame it starts on, with an `info` note naming the animation (the Arc's `rotate: -90`).
10. **Code Connect.** Each axis value and property carries its React props in `code`, from `<Family>.tsx`. The top-level `code` is `import { <Family> } from '@coinbase/cds-web/<group>';` (the exports map's subpath). Where CDS's own `<Family>.figma.ts` disagrees (Button's maps five variants and emits `start` / `end` nodes), follow the component and record a note.
11. **Selection.** Set `selection` to `{status: "draft", omit: [], expectedCount: <the expansion count>, approval: null}`.
12. **Drafted values.** Record in [`drafted`](../contract/references/contract-schema.md#drafted-values) every value you chose by judgement: an axis or value label CDS has no word for (`Fill`, `Solid`), a layer name, the label default, an icon default, the grid, the description. A value read from source is never one, nor is a raw with its reason. Each entry is `{by: "agent", evidence: ["<file>:L<n> what it shows"], fingerprint}`, keyed per [ADR 0010](../../docs/adr/0010-drafted-values-carry-over-by-evidence-fingerprint.md). Each claim names an identifier or quotes a value the cited lines show (`_webExamples.mdx:L232 startIcon="wallet" with endIcon="forwardArrow"`), and cites each further file as `<file>:L<n>` too. In a `reason` or a note, a citation follows the clause it backs, and its lines show every identifier that clause names (#459).

    **Node map.** Write the family's node map to `skills/adapter-cds/nodes/<family>.nodes.json`. Each anatomy layer name maps to what its element carries, space-separated, identifying entry first: the static class CDS gives it (`cds-Button`, `cds-Icon`) and the names of the `css` literals of `<Family>.tsx` on it (`"Button": "cds-Button baseCss unsetNoWrapCss iconCss blockCss flushCss"`, `"Start icon": "startNodeCss"`). A layer drawn inside another element takes that element's literals, the element's identifying entry first (Button's Label: `"middleNodeCss hiddenCss"`; Track and Arc, the circles in the spinner: `"spinnerContainerCss"`).

    Most families have no `cds-<Family>` class (#470). The identifying entry is the static class CDS gives the element, in either case, else its first literal:
    - **Static class.** Tag's root carries `tagStaticClassName`, which is `cds-tag`: `"Tag": "cds-tag"`, and its start node `"Start": "nodeCss"`. Checkbox and Radio render inside Control, whose root carries `cds-Control`.
    - **Literal.** The box Checkbox draws carries only `checkboxCss`: `"Box": "checkboxCss"`.

    The fingerprint script refuses a static class that isn't first. `compare.mjs` matches a static class as written. It finds a literal by the one class Linaria compiles it to (`checkboxCss-c198zdvk`), read from the family's stylesheet in the fetched package: `packages/web/src/<path>.tsx` compiles to `esm/<path>.css`. The name alone isn't enough, because other components name their literals alike: `baseCss` is in 20 compiled files.

    **Fingerprint.** It is `sha256:` of the canonical JSON of the facts its key kind is drafted from. The key kinds are an axis or axis value label, an anatomy node, a property field, a layout field, and a family-wide value (`family.*`, `icons.*`, `figma.*`, `code.*`). A node's facts are its node map entries and the rules of the literals among them. Compute them with [`scripts/fingerprints.mjs`](scripts/fingerprints.mjs), the one definition the tests also use; don't hash by hand. Each kind's facts are in `draftedFingerprints` ([`contract.mjs`](../contract/scripts/contract.mjs)), shared with Carbon, and `test/fingerprints.test.mjs` works one example per kind.

    The family's own TSX is hashed by its literals. A layer, layout or property entry also holds the pin of each other file its evidence cites (`ProgressCircle.tsx` for `Track` and `Arc`, #459), so a change there reopens it. A change in Interactable, Pressable or a token map that no evidence cites moves no fingerprint: those feed values read from source, which the check and the render comparison catch. Write the entries without a fingerprint, run the script with `--write` to record them, then `--check`; the shared command line ([`fingerprints-cli.mjs`](../contract/scripts/fingerprints-cli.mjs)) says what each prints, the citation check included. The script reads the files the Contract pins from the sources dir, checking each sha256:

    ```
    node skills/adapter-cds/scripts/fingerprints.mjs design-systems/cds/contracts/<family>.component.json --nodes skills/adapter-cds/nodes/<family>.nodes.json [--write | --check]
    ```
13. **Notes.** Record every disagreement you resolved and every behaviour you could not draw (the press scale, a spinner's rotation, the focus offset), with `at` and `level`.

Then check the draft, regenerate the Foundations document, and compare:

```
node skills/contract/scripts/check.mjs design-systems/cds/contracts/<family>.component.json
node skills/adapter-cds/scripts/foundations.mjs
node skills/contract/scripts/check.mjs design-systems/cds/contracts/<family>.component.json --table
node skills/to-preview/scripts/catalog.mjs design-systems/cds/contracts/<family>.component.json
node skills/adapter-cds/scripts/compare.mjs design-systems/cds/contracts/<family>.component.json --nodes skills/adapter-cds/nodes/<family>.nodes.json --run
```

`check.mjs` prints the variant count, Base Component and token closure, then `OK`; Button has 480 variants. `--table` prints the resolved paint per grid row. [`compare.mjs`](scripts/compare.mjs) writes `compare.js` beside the catalog page, and `--run` opens the page in headless Chrome (`$CHROME`, else the macOS app) and runs it there, printing `checked <n>, <m> mismatches`, then each mismatch. Without Chrome, start the `to-preview` launch config, open `http://localhost:8737/<family>/index.html` in the browser pane, and run `(await import('./compare.js')).compare()`. It reads every specimen's computed fill, opacity, stroke, padding, radius and size in each Theme Mode (an ELLIPSE's stroke, size, arc sweep and cap from its `<circle>`; a layer the Contract hides must have no element) against the Contract resolved through the Foundations document, and lists each mismatch as `<tuple> <mode> <layer>.<field>: page <value>, Contract <value>`. Button: `checked 960, 0 mismatches` (480 tuples in both Modes). Fix the Contract until the list is empty, or record the difference as a note.

**Mid-run, for To-handoff.** When a Prototype uses a family CDS ships but the Design System has no Contract for, To-handoff asks decision `contract:<family>`. Write the whole family by steps 1–13 to a file outside `contracts/`, at `status: "draft"` with `approval: null`. Run `check.mjs` and the fingerprint `--check` on it, then answer `{path}`. Answer `{unwritable: "<reason>"}` when a source can't be read or the family can't be written. To-handoff runs `checkContract` from [`scripts/handoff-adapter.mjs`](scripts/handoff-adapter.mjs) (the `check.mjs` rules plus the CDS pin) and copies a passing draft into `contracts/` byte for byte, never over an existing Contract. A failing one leaves the usage raw with a question. Approve the draft later through To-design's base loop. Once the draft is in `contracts/`, `foundations.mjs` emits its family ([#396](https://github.com/pawisssh/design/issues/396)): the component and Synthesized tokens of `cds-common`'s `esm/tokens/<family>.js` when the pinned tarball has one that exports `variants`, else only the closure, with an `info` note saying so. The run doesn't fail. The draft's `source.files` must list the evidence (step 1): `packages/common/src/tokens/<family>.ts`, which the component tokens cite, and the props type under `packages/common/src/types/`, whose `@deprecated` variants get scopes `[]`. That is how they reach the pin, since `sources.mjs` fetches every file a committed Contract lists. Don't add them to `CDS.files`.

## 4. Foundations step

Regenerate the Foundations document after a new or edited Contract, a new family, or a new pin:

```
node skills/adapter-cds/scripts/foundations.mjs --family button
```

- It reads every `design-systems/cds/contracts/*.component.json` and writes [`design-systems/cds/cds.foundations.json`](../../design-systems/cds/cds.foundations.json). Never edit that file by hand. A rerun with the same inputs is byte-identical.
- `--family` (repeatable) names a family whose component and Synthesized tokens to emit before its Contract exists. The families of committed Contracts are always emitted. A family with no CDS token map fails; only `button` (`cds-common`'s `tokens/button.js`) has one.
- It needs Node 22.15 or later: it loads the compiled modules (`defaultTheme`, `createThemeCssVars`, `getBlendedColor`, the token maps) with `module.registerHooks`, which adds the `.js` their relative imports omit and maps `d3-color` to the installed copy. Any other import fails. `checks.css.modules` holds the sha256 of each module it evaluated.
- The token closure comes from the shared `closure()`, and rule 6 from the shared `validate()`, run on every Contract against the new document.
- Generation fails, naming the token, and writes nothing, on: a value that differs from `createThemeCssVars`'s output for `defaultTheme` in Light or Dark; a custom property it emits that the document neither carries nor excludes; a Synthesized name a CDS token already has; a token the closure uses that the document lacks; a template, number or rem value it cannot read; a rule 6 error; a Contract pinned to another commit or package version.

### Collections

| Collection | Modes | Variables | Name in Figma |
| --- | --- | --- | --- |
| Primitives (hidden) | Default | `light-<hue><step>`, `dark-<hue><step>`: both spectrums, as hex | `Light/blue60` |
| Theme | Light, Dark | the semantic colours by CDS's keys (`bgPrimary`), each aliasing the Primitive its `defaultTheme.ts` template names; alpha templates hold the flattened colour with the alias in `from` | `Background/bgPrimary` |
| Layout | Default | `space-<key>` (dots as `_`: `space-0_25`), `borderRadius-`, `borderWidth-`, `iconSize-`, `controlSize-`, `avatarSize-<key>`, in px | `Spacing/space-0_25` |
| Type | Default | `fontFamily-`, `fontSize-`, `fontWeight-`, `lineHeight-<text key>`; rem is ×16 | `Font size/fontSize-body` |

Light and Dark have no selector: ThemeProvider sets the custom properties inline for its `activeColorScheme`. Text Styles are named by CDS's text keys (`Body/body`, `Display/display1`), in Inter, the first family of `--defaultFont-sans`, with letter spacing 0, and bind the four Type variables.

Component tokens and Synthesized tokens go in the Theme collection, with `family`:

- Component: `<family>-<variant>[-transparent]-<color|background|border>`, aliasing the Theme colour the token map names (`button-primary-background` → `bgPrimary`). Contracts bind these.
- Synthesized ([ADR 0009](../../docs/adr/0009-mode-specific-styling-becomes-synthesized-tokens.md)): `<family>-<variant>[-transparent]-<hover|pressed|disabled>-<background|border>`, the colour `Interactable` computes with `getBlendedColor` at `opacityHovered`, `opacityPressed` and `opacityDisabled` (disabled skips contrast optimization). Each Mode's value is `getBlendedColor`'s output as a raw colour, with the call in `from` and the derivation in `reason`; the tests recompute every one. `source` is `synthesized: packages/common/src/tokens/interactable.ts blend(<token>, <opacity>)`. They sort after the other Theme tokens.
- Both have empty `codeSyntax`: CDS emits no custom property for them. Button paints `var(--color-<token>)`, which must keep matching the Theme colour, and Interactable's `--inter-*` properties hold a different colour per element.
- A `@deprecated` variant in `ButtonBaseProps.ts` (`foregroundMuted`) gets scopes `[]`.
- A `colorSchemeMap` instead of `variants` (Avatar's, #478) gives `<family>-<scheme>-color` per colour scheme, aliasing the Primitive the map names in each Mode (`avatar-blue-color` → `light-blue60`, `dark-blue60`), checked against the active scheme's spectrum property the component paints (`rgb(var(--blue60))`). Its scopes are `FRAME_FILL` and `EFFECT_COLOR`, the fill and ring Avatar paints with `currentColor`, and it has no Synthesized tokens.
- A colour token a Contract strokes through `sameAs` also gets `STROKE_COLOR`, so rule 6 passes: Button's Arc strokes `sameAs: "Label.fill"`, so the `button-<variant>[-transparent]-color` tokens are `["SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"]`.

Not carried, each with a note: shadows (`elevation1`, `elevation2`), illustration colours, `textTransform`, `fontFamilyMono`, `currentColor`, the scheme-fixed `--lightColor-*`/`--darkColor-*` copies, the unprefixed spectrum, and every theme but `defaultTheme`.

Tests: `node --test skills/adapter-cds/test/*.test.mjs`. The Foundations tests skip, saying so, until the fetch has run.

## Preview renderer

[`scripts/preview.mjs`](scripts/preview.mjs) is the renderer `to-preview` finds by convention; the interface is in [to-preview's page reference](../to-preview/references/interactive-template.md). It bundles the Contract's `code.import` with esbuild, `.css` imports stubbed, and renders each tuple with the real `@coinbase/cds-web` component through `react-dom/server`. Each axis value's Contract `code` props are merged in. A value whose `code` is null (Hover, Active, Focus) renders like the default, and To-preview forces its pseudo-class.

- Import: Button is `import { Button } from '@coinbase/cds-web/buttons';`. The package's exports map has `./buttons` → `esm/buttons/index.js`, which re-exports `./Button`. `code.import` must import from `code.package` or one of its subpaths.
- Providers: each specimen is wrapped in `ThemeProvider` (`defaultTheme`, `activeColorScheme` from the Mode) and `MediaQueryProvider`. `PortalProvider` is not needed: Button renders without it, Loading (`ProgressCircle`) included, and nothing under `buttons/`, `system/` or `ProgressCircle` uses a portal.
- Modes: CDS writes colours inline, so the markup depends on the scheme. `ThemeProvider` writes the theme variables, and `Interactable` writes `--inter-hover-bg` and the other state colours, blended for the active scheme. So `render` returns one subtree per scheme, `light` and `dark`, and `modeClass(mode)` returns `cds-preview-<mode>`, which shows that subtree. The Foundations document's Theme Modes must be keyed `light` and `dark` with no `selector`: a selector would bypass `modeClass`. The theme variables sit in the stylesheet once per scheme (`.cds-preview-scheme.light,.cds-preview-light{…}`), not inline in every specimen. The Mode class sets them on the page too, so the catalog chrome takes the scheme's colours: `chrome` is page `--color-bgAlternate`, card `--color-bg`, border `--color-bgLine`, text `--color-fg` and `--color-fgMuted`, controls `--color-bgLineHeavy`, focus `--color-bgPrimary`, warning `--color-fgWarning` and error `--color-fgNegative` (#392).
- Stylesheet: Inter, then the CSS the bundled component imports, in import order: `styles/global.css`, `styles/defaultFont.css`, `styles/responsive/` base, phone, tablet and desktop, then each component's CSS. Every file opens with `@layer cds`, and each is prefixed with a comment naming its path. Then the CoinbaseIcons font. Inter comes from the pinned `@fontsource-variable/inter`, and both fonts are inlined as data URIs.
- Icons: an `INSTANCE_SWAP` with `valueFrom: "icon"` passes the icon's name (`add`). The renderer throws when `@coinbase/cds-icons` has no glyph for it.
- Packages: [`preview/package.json`](preview/package.json) and its lockfile pin them. `node skills/adapter-cds/scripts/sources.mjs` (or `node skills/adapter-cds/scripts/preview.mjs`) installs them into gitignored `.scratch/adapter-cds/preview/` with `npm ci --ignore-scripts`. The lockfile's CDS integrities are the ones `CDS.packages` pins.
- It refuses to render when a package the Contract's `source.packages` pins is not installed at that version. It also refuses a Contract with `code.required`, whose placeholders only the Carbon renderer writes.
- The props come from the shared `codeProps` and `contentProps` in [`contract.mjs`](../contract/SKILL.md#contract-module), as in the Carbon renderer.
- Tests: `node --test skills/adapter-cds/test/preview.test.mjs`, on the committed Button Contract and Foundations document. They skip, saying so, until the packages are fetched.

## Handoff Adapter

[`scripts/handoff-adapter.mjs`](scripts/handoff-adapter.mjs) is the module [To-handoff](../to-handoff/SKILL.md) finds by convention from the Foundations document's `source.adapter`. It exports CDS's role groups for matching Prototype values, the surfaces that map a Prototype to a Theme Mode, `themeWrapper` (`<ThemeProvider activeColorScheme>`), the breakpoints from the pinned responsive CSS, the step for writing a missing Contract, `checkContract` (the `check.mjs` rules plus the CDS pin, `@coinbase/cds-icons` included) and the preview renderer for the Rendering.

To-handoff recognises a Contract usage by import only when the import's module is exactly the Contract's `code.package`. CDS's Button is imported from the `@coinbase/cds-web/buttons` subpath, so a React Prototype's CDS Buttons aren't recognised yet ([#400](https://github.com/pawisssh/design/issues/400)). A single-HTML Prototype's Buttons can be recognised by decision, `via: "element"`.

Tests: `node --test skills/adapter-cds/test/handoff-adapter.test.mjs`. The last one takes [`test/fixtures/send-crypto`](test/fixtures/send-crypto) through To-handoff statically with its `decisions.json`, in a temp copy of the Design System, to a validated Handoff and a Rendering with the real CDS Button. It skips until the CDS preview packages and To-handoff's packages (`node skills/to-handoff/scripts/deps.mjs`) are fetched.

## Moving the pin

1. Find the release commit: CDS releases are untagged, so take the commit that bumped `packages/web/package.json` to the new version, from `gh api 'repos/coinbase/cds/commits?path=packages/web/package.json'`, and check its patch shows the bump.
2. Take each package's version and `dist.integrity` from `https://registry.npmjs.org/<name>/<version>`. Pin `@coinbase/cds-common` at the same version, and `@coinbase/cds-icons` at the version cds-web's `dependencies` names.
3. Update `CDS` in `sources.mjs`: the commit, the `note`, every file's sha256 (`curl -s https://raw.githubusercontent.com/coinbase/cds/<commit>/<path> | shasum -a 256`), and the versions and integrities. Check the `LICENSE` is still Apache-2.0, then update [`design-systems/cds/NOTICE`](../../design-systems/cds/NOTICE) and the versions in section 1.
4. Update the three CDS versions in [`preview/package.json`](preview/package.json) and regenerate the lockfile with `npm install --package-lock-only --ignore-scripts` in that folder.
5. Run the fetch and the tests. An extract pattern that matches nothing fails the fetch, naming it, and a compiled module whose relative import was not extracted fails the tests.
6. Re-run `snapshot` for every Contract, update their `source`, and run the fingerprint `--write` on each: it records the new fingerprints, and you re-draft every entry it names. Regenerate the Foundations document, and run each Contract through To-design's base loop again: a new `snapshotId` voids every approval.
