---
name: adapter-carbon
description: Carbon React Adapter, from Carbon source at a pinned commit to a draft Contract and the Carbon foundations document. Use when creating or refreshing a Carbon Contract or the Carbon foundations document.
---

# Carbon Adapter

The Adapter for the Carbon React Code Library. There is one Adapter skill per Code Library, so adding another Code Library adds a sibling skill and leaves `to-preview` and `to-design` untouched. What a Contract and a foundations document must contain is defined in the shared [`contract`](../contract/SKILL.md) skill and its [Adapter guide](../contract/references/adapter-guide.md); this skill only knows how to read Carbon.

## Outputs

- A draft Contract per Component Family, read from Carbon source at the pinned tag and commit.
- The Carbon foundations document, generated from the pinned Carbon token sources. It carries Carbon's whole theme (every Theme token, the whole palette, every Layout group and every Type style) plus the component tokens of each family that has a Contract, and records the union of all Contracts' token references as `closure`. It is never edited by hand.
- The Carbon React preview renderer that `to-preview` uses to render specimens.

The committed outputs for the pilot (Carbon `v11.118.0`, commit `44f90d8`) are in [`design-systems/carbon/`](../../design-systems/carbon/). The Button Contract there was written by an agent and is the reference output: read it next to this guide.

## 1. Fetch the sources

```
node skills/adapter-carbon/scripts/sources.mjs
```

[`scripts/sources.mjs`](scripts/sources.mjs) pins Carbon `v11.118.0` (commit `44f90d8`) and fetches into gitignored `.scratch/adapter-carbon/`:

- the 8 value files (DTCG themes, button, layout, colors and `@carbon/type` sources), from the repository at that commit, each checked against its sha256;
- from npm, each tarball checked against its registry `integrity`: `@carbon/styles` (the compiled CSS, `sources/npm/@carbon/styles@1.117.0/package/css/styles.css`), `@carbon/layout` (the Sass fallbacks) and `@carbon/icons@11.90.0` (`package.json`, `svg/16` and `svg/32`, which To-design's icons slice reads from `sources/npm/@carbon/icons@11.90.0/package`);
- the preview renderer's packages (see [Preview renderer](#preview-renderer)).

Nothing from a package is run. Done when it prints `Carbon v11.118.0 sources OK` and `Carbon preview packages OK`.

## 2. From Carbon source to a draft Contract

Write `design-systems/carbon/contracts/<family>.component.json` by hand, following the [Adapter guide](../contract/references/adapter-guide.md) and the [Contract schema](../contract/references/contract-schema.md). No generator exists. For Carbon:

1. **Pick the files** at the pin. For a family `<Family>` they are usually:
   - React: `packages/react/src/components/<Family>/*.tsx` (props, kinds, defaults);
   - styles: `packages/styles/scss/components/<family>/_<family>.scss`, `_mixins.scss`, `_vars.scss`, and any utility they `@use` that sets a value (Button: `packages/styles/scss/utilities/_layout.scss`);
   - tokens: `packages/themes/src/dtcg/components/<family>.json` when the family has component tokens, `packages/themes/src/dtcg/themes.json`, `packages/layout/src/dtcg/layout.json`, `packages/type/src/styles.ts`.
2. **Fetch them and get `source`:**

   ```
   node skills/adapter-carbon/scripts/sources.mjs snapshot <repo path> <repo path> ...
   ```

   It downloads each path at the pinned commit into `.scratch/adapter-carbon/sources/carbon/<path>` and prints `{tag, commit, files, snapshotId}`. Copy `files` and `snapshotId` into `source`. Fill the rest of `source` from the Button Contract: `codeLibrary: "Carbon React"`, `adapter: "carbon"`, the repository, tag, commit and the same `packages` versions (the foundations step refuses a Contract pinned to another commit or version). If you read another file later, re-run `snapshot` with the full list.
3. **Kinds.** Take the values of the kind prop from the React types, then keep only the ones the SCSS styles. A type-only value goes in `dropped` with the line it was found on and the SCSS that lacks it (Button: `danger--primary`). Order values as Carbon's docs do, and say so in a note if it differs from the source order.
4. **Sizes.** Sizes come from `layout.use('size', ...)` in the SCSS and the `size-*` tokens; the SCSS default (`$default: 'lg'`) is `defaultSource` when React has none. A prop that only modifies one size (`isExpressive`) is its own size value (`lg-expressive`, code `{size: "lg", isExpressive: true}`).
5. **State from pseudo-classes.** Map `:hover` (Carbon wraps it in `@media (any-hover: hover)`), `:active`, `:focus` and `:disabled` / `.cds--btn--disabled` onto the canonical State axis, with each selector in `css`. Hover, Active and Focus have `code: null`; Disabled has `code: {disabled: true}`.
6. **Cascade → ordered rules.** Read `_button.scss` top to bottom: the base `.cds--btn` block is the `{}` rule, each `&--<kind>` / `&--<size>` modifier is a rule matching that value, and state blocks come after the kind they modify. Mixins (`button-theme`) expand into fill, stroke and text colour per kind and state. Where Carbon sets a token through a CSS custom property, bind the token the property resolves to.
7. **Values.**
   - A Sass constant without a token (`$button-outline-width`, `max-inline-size: to-rem(320px)`) is `{raw, level: "warning", reason}`.
   - A value Carbon computes from tokens is `{raw, level: "info", reason}` with the derivation. Button's vertical paddings are `(size − 1 line height)/2`, its expressive gap is `64 − 16 − 20`.
   - `transparent` is `"none"`, and an icon that takes `currentColor` is `{sameAs: "Label.fill"}`.
   - Text styles bind the type token (`body-compact-01`).
8. **Focus ring.** Carbon draws it as a 1px border plus inset `box-shadow`s. Model it as an inside stroke bound to `focus` plus `inner-shadow` effects, **reversed** into Figma order (the CSS list's first shadow becomes the last effect). The spreads add the 1px border to the inset width, and they are `warning` raws.
9. **Icons.** Carbon renders an icon through `renderIcon`, so the anatomy gets an `Icon` slot FRAME holding a `Glyph` INSTANCE of `icon:default`, with a `Swap icon` INSTANCE_SWAP and an `Icon` BOOLEAN property. Set `icons.source` to `@carbon/icons` `11.90.0`, `svg/16/{key}.svg`, fallback `svg/32/{key}.svg`. Pick `default` and `preferred` from Carbon's docs examples; every key must exist in the fetched `svg/16` or `svg/32` folder.
10. **Code Connect.** Each axis value and property has its React props in `code`. Set the top-level `code` with `import { <Family> } from '@carbon/react';` and the props that must always be emitted (Button: `size`, because a Button without it inherits the nearest `<Layout size>`).
11. **Selection.** Set `selection` to `{status: "draft", omit: [], expectedCount: <the expansion count>, approval: null}`. `check.mjs` reports the real count.
12. **Notes.** Record every disagreement you resolved and every behaviour you could not check (wrapping, a sub-pixel offset), with `at` and `level`.

Then check the draft and regenerate the foundations document:

```
node skills/contract/scripts/check.mjs design-systems/carbon/contracts/<family>.component.json
node skills/adapter-carbon/scripts/foundations.mjs
node skills/contract/scripts/check.mjs design-systems/carbon/contracts/<family>.component.json --table
```

`check.mjs` prints the variant count, Base Component and token closure, then `OK`. A token outside the foundations document fails until `foundations.mjs` adds it. `--table` prints the resolved paint per grid row: compare it with the compiled CSS. Next: [To-preview](../to-preview/SKILL.md) to narrow the selection (optional), then [To-design](../to-design/SKILL.md).

## 3. Foundations step

Regenerate the foundations document after any Contract edit that changes its tokens, a new Contract, or a new source pin:

```
node skills/adapter-carbon/scripts/foundations.mjs
```

- It reads every `design-systems/carbon/contracts/*.component.json` and writes `design-systems/carbon/carbon.foundations.json`. Never edit that file by hand; change a Contract, the pin or a rule here, and regenerate. A rerun with the same inputs is byte-identical, so `git diff` shows nothing.
- The step fetches its sources on first use (step 1).
- The token closure comes from the shared module's `closure()`. After generating, it runs the shared module's `validate()` on every Contract against the new document and keeps the rule 6 errors. Generation fails, and writes nothing, on any rule 6 error (a token used outside its variable's scopes), a token Carbon does not define, a source value or Type field it cannot read, a Contract pinning another Carbon commit or package version, a resolved value that differs from the compiled CSS (other than the two listed Type line heights, where the document takes the CSS), or a missing Sass fallback.
- The rules it applies (collections, modes, naming, scopes, codeSyntax, raw exceptions) are in the [foundations schema](../contract/references/foundations-schema.md).
- Tests: `node --test skills/adapter-carbon/test/*.test.mjs`. They skip, saying so, until the sources are fetched.

## Preview renderer

[`scripts/preview.mjs`](scripts/preview.mjs) is the renderer `to-preview` finds by convention (the interface is in [to-preview's page reference](../to-preview/references/interactive-template.md)). It renders each tuple with the real `@carbon/react` component through `react-dom/server`, maps axis values through their Contract `code` props, shows the Contract's default icon so the icon slot is reviewed, returns the compiled `@carbon/styles` CSS, and maps a Theme mode to its Carbon class (`white` → `cds--white`).

- Packages: [`preview/package.json`](preview/package.json) and its lockfile pin them. `node skills/adapter-carbon/scripts/sources.mjs` (or `node skills/adapter-carbon/scripts/preview.mjs`) installs them into gitignored `.scratch/adapter-carbon/preview/` with `npm ci --ignore-scripts`, so no install script runs (`@carbon/react` has a telemetry postinstall).
- It refuses to render when an installed package differs from the Contract's `source.packages`. After moving the pin, update `preview/package.json` and regenerate the lockfile with `npm install --package-lock-only --ignore-scripts --legacy-peer-deps` in that folder.
- Tests: `node --test skills/adapter-carbon/test/preview.test.mjs`. They skip, saying so, until the packages are fetched.

## Moving the pin

Change `CARBON` in `sources.mjs` (tag, commit, value-file hashes, npm versions and integrities) and `preview/package.json`, re-run `snapshot` for every Contract, update their `source`, regenerate the foundations document, and run each Contract through To-design's base loop again: a new `snapshotId` voids every approval.
