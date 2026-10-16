---
name: adapter-carbon
description: Carbon React Adapter, from Carbon source at a pinned commit to a draft Contract and the Carbon foundations document. Use when creating or refreshing a Carbon Contract or the Carbon foundations document.
---

# Carbon Adapter

The Adapter for the Carbon React Code Library. There is one Adapter skill per Code Library, so adding another Code Library adds a sibling skill and leaves `to-preview` and `to-design` untouched. What a Contract and a foundations document must contain is defined in the shared [`contract`](../contract/SKILL.md) skill; this skill only knows how to read Carbon.

## Outputs

- A draft Contract per Component Family, read from Carbon source at the pinned tag and commit.
- The Carbon foundations document, generated from the pinned Carbon token sources plus the union of all Contracts' token references. It is never edited by hand.
- The Carbon React preview renderer that `to-preview` uses to render specimens.

The committed outputs for the pilot (Carbon `v11.118.0`, commit `44f90d8`) are in [`design-systems/carbon/`](../../design-systems/carbon/). The Button Contract there was written by an agent and is the reference output.

## Foundations step

Regenerate the foundations document after any Contract edit that changes its tokens, a new Contract, or a new source pin:

```
node skills/adapter-carbon/scripts/foundations.mjs
```

- It reads every `design-systems/carbon/contracts/*.component.json` and writes `design-systems/carbon/carbon.foundations.json`. Never edit that file by hand; change a Contract, the pin or a rule here, and regenerate.
- Sources: [`scripts/sources.mjs`](scripts/sources.mjs) pins Carbon `v11.118.0` (commit `44f90d8`). It fetches the 8 value files (DTCG themes, button, layout, colors and `@carbon/type` sources) from the repository at that commit and checks each sha256. It also fetches the `@carbon/styles` and `@carbon/layout` npm tarballs, used only for the checks, and checks each against its registry `integrity`. Everything lands in gitignored `.scratch/adapter-carbon/sources/`. The step fetches on first use; `node skills/adapter-carbon/scripts/sources.mjs` fetches up front. Nothing from a package is run.
- The token closure comes from the shared module's `closure()`. After generating, it runs the shared module's `validate()` on every Contract against the new document and keeps the rule 6 errors. Generation fails, and writes nothing, on any rule 6 error (a token used outside its variable's scopes), a token Carbon does not define, a Contract pinning another Carbon commit or package version, a resolved value that differs from the compiled CSS, or a missing Sass fallback.
- The rules it applies (collections, modes, naming, scopes, codeSyntax, raw exceptions) are in the [foundations schema](../contract/references/foundations-schema.md).
- Tests: `node --test skills/adapter-carbon/test/*.test.mjs`. They skip, saying so, until the sources are fetched.

## Preview renderer

[`scripts/preview.mjs`](scripts/preview.mjs) is the renderer `to-preview` finds by convention (the interface is in [to-preview's page reference](../to-preview/references/interactive-template.md)). It renders each tuple with the real `@carbon/react` component through `react-dom/server`, maps axis values through their Contract `code` props, shows the Contract's default icon so the icon slot is reviewed, returns the compiled `@carbon/styles` CSS, and maps a Theme mode to its Carbon class (`white` → `cds--white`).

- Packages: [`preview/package.json`](preview/package.json) and its lockfile pin them. `node skills/adapter-carbon/scripts/sources.mjs` (or `node skills/adapter-carbon/scripts/preview.mjs`) installs them into gitignored `.scratch/adapter-carbon/preview/` with `npm ci --ignore-scripts`, so no install script runs (`@carbon/react` has a telemetry postinstall).
- It refuses to render when an installed package differs from the Contract's `source.packages`. After moving the pin, update `preview/package.json` and regenerate the lockfile with `npm install --package-lock-only --ignore-scripts --legacy-peer-deps` in that folder.
- Tests: `node --test skills/adapter-carbon/test/preview.test.mjs`. They skip, saying so, until the packages are fetched.

## Coming next

The agent guide from Carbon source to a draft Contract (#34).
