---
name: adapter-cds
description: CDS Web Adapter, from the Coinbase Design System's web library (`@coinbase/cds-web`) at a pinned commit to its pinned sources and Foundations document. Use when fetching the CDS sources, snapshotting a CDS Contract's source files, regenerating the CDS Foundations document, or moving the CDS pin.
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

No package script runs: the tarballs are only listed and extracted with `tar`. It also fetches the four sources the Foundations step reads beyond those: `ThemeProvider.tsx`, `Interactable.tsx`, `interactableCSSProperties.ts` and `ButtonBaseProps.ts`. Done when it prints `CDS Web 9.29.0 (commit 135dc3c, untagged) sources OK`. A re-run with everything intact downloads nothing.

For the later steps, `readSources()` returns the files and, for each package, its folder and member list. It throws, naming the file or package, when a hash differs.
- The compiled modules import each other without extensions (`'./blendColors'`), so load them through a bundler or loader rather than plain Node ESM.
- `getBlendedColor` imports `d3-color`, the one package outside these tarballs. The fetch also installs it, from the committed lockfile in [`foundations/`](foundations/), with `npm ci --ignore-scripts` into `.scratch/adapter-cds/foundations/`, and prints `CDS Foundations packages OK` first.

Tests: `node --test skills/adapter-cds/test/*.test.mjs`. The offline tests always run; the ones that read the fetched sources skip, saying to run the fetch, until it has run.

## 2. Snapshot a Contract's source files

```
node skills/adapter-cds/scripts/sources.mjs snapshot <repo path> <repo path> ...
```

It downloads each repository path at the pinned commit into `.scratch/adapter-cds/sources/cds/<path>` and prints `{tag, commit, files, snapshotId}`. Copy `files` and `snapshotId` into the Contract's `source`; `snapshotId` is the Adapter guide's manifest hash, so its shell recipe recomputes it from those files. If you read another file later, re-run `snapshot` with the full list.

## 3. Foundations step

Regenerate the Foundations document after a new or edited Contract, a new family, or a new pin:

```
node skills/adapter-cds/scripts/foundations.mjs --family button
```

- It reads every `design-systems/cds/contracts/*.component.json` and writes [`design-systems/cds/cds.foundations.json`](../../design-systems/cds/cds.foundations.json). Never edit that file by hand. A rerun with the same inputs is byte-identical.
- `--family` (repeatable) names a family whose component and Synthesized tokens to emit before its Contract exists. The families of committed Contracts are always emitted. A family with no CDS token map fails; only `button` (`cds-common`'s `tokens/button.js`) has one.
- It needs Node 22.15 or later: it loads the compiled modules (`defaultTheme`, `createThemeCssVars`, `getBlendedColor`, the token maps) with `module.registerHooks`, which adds the `.js` their relative imports omit and maps `d3-color` to the installed copy. Any other import fails. `checks.css.modules` holds the sha256 of each module it evaluated.
- The token closure comes from the shared `closure()`, and rule 6 from the shared `validate()`, run on every Contract against the new document.
- Generation fails, naming the token, and writes nothing, on: a value that differs from `createThemeCssVars`'s output for `defaultTheme` in Light or Dark; a custom property it emits that the document neither carries nor excludes; a Synthesized value that differs from `getBlendedColor`'s output, or a Synthesized name a CDS token already has; a token the closure uses that the document lacks; a template, number or rem value it cannot read; a rule 6 error; a Contract pinned to another commit or package version.

### Collections

| Collection | Modes | Variables | Name in Figma |
| --- | --- | --- | --- |
| Primitives (hidden) | Default | `light-<hue><step>`, `dark-<hue><step>`: both spectrums, as hex | `Light/blue60` |
| Theme | Light, Dark | the semantic colours by CDS's keys (`bgPrimary`), each aliasing the Primitive its `defaultTheme.ts` template names; alpha templates hold the flattened colour with the alias in `from` | `Background/bgPrimary` |
| Layout | Default | `space-<key>` (dots as `_`: `space-0_25`), `borderRadius-`, `borderWidth-`, `iconSize-`, `controlSize-<key>`, in px | `Spacing/space-0_25` |
| Type | Default | `fontFamily-`, `fontSize-`, `fontWeight-`, `lineHeight-<text key>`; rem is ×16 | `Font size/fontSize-body` |

Light and Dark have no selector: ThemeProvider sets the custom properties inline for its `activeColorScheme`. Text Styles are named by CDS's text keys (`Body/body`, `Display/display1`), in Inter, the first family of `--defaultFont-sans`, with letter spacing 0, and bind the four Type variables.

Component tokens and Synthesized tokens go in the Theme collection, with `family`:

- Component: `<family>-<variant>[-transparent]-<color|background|border>`, aliasing the Theme colour the token map names (`button-primary-background` → `bgPrimary`). Contracts bind these.
- Synthesized ([ADR 0009](../../docs/adr/0009-mode-specific-styling-becomes-synthesized-tokens.md)): `<family>-<variant>[-transparent]-<hover|pressed|disabled>-<background|border>`, the colour `Interactable` computes with `getBlendedColor` at `opacityHovered`, `opacityPressed` and `opacityDisabled` (disabled skips contrast optimization). Each Mode's value holds the raw colour, the call in `from`, and the derivation in `reason`. They sort after the other Theme tokens.
- Both have empty `codeSyntax`: CDS emits no custom property for them. Button paints `var(--color-<token>)`, which must keep matching the Theme colour, and Interactable's `--inter-*` properties hold a different colour per element.
- A `@deprecated` variant in `ButtonBaseProps.ts` (`foregroundMuted`) gets scopes `[]`.

Not carried, each with a note: shadows (`elevation1`, `elevation2`), `avatarSize`, illustration colours, `textTransform`, `fontFamilyMono`, `currentColor`, the scheme-fixed `--lightColor-*`/`--darkColor-*` copies, the unprefixed spectrum, and every theme but `defaultTheme`.

Tests: `node --test skills/adapter-cds/test/*.test.mjs`. The Foundations tests skip, saying so, until the fetch has run.

## Moving the pin

1. Find the release commit: CDS releases are untagged, so take the commit that bumped `packages/web/package.json` to the new version, from `gh api 'repos/coinbase/cds/commits?path=packages/web/package.json'`, and check its patch shows the bump.
2. Take each package's version and `dist.integrity` from `https://registry.npmjs.org/<name>/<version>`. Pin `@coinbase/cds-common` at the same version, and `@coinbase/cds-icons` at the version cds-web's `dependencies` names.
3. Update `CDS` in `sources.mjs`: the commit, the `note`, every file's sha256 (`curl -s https://raw.githubusercontent.com/coinbase/cds/<commit>/<path> | shasum -a 256`), and the versions and integrities. Check the `LICENSE` is still Apache-2.0, then update [`design-systems/cds/NOTICE`](../../design-systems/cds/NOTICE) and the versions in section 1.
4. Run the fetch and the tests. An extract pattern that matches nothing fails the fetch, naming it, and a compiled module whose relative import was not extracted fails the tests.
5. Re-run `snapshot` for every Contract, update their `source`, regenerate the Foundations document, and run each Contract through To-design's base loop again: a new `snapshotId` voids every approval.
