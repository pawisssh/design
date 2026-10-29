# An Adapter may evaluate a Code Library's compiled theme when its tokens exist only as code

The Coinbase Design System's web library (CDS Web, `@coinbase/cds-web`) ships no token file. Its semantic colours are TypeScript template strings over a spectrum of `"r,g,b"` values, and its hover, pressed and disabled colours are computed at run time by `getBlendedColor` in `@coinbase/cds-common`. So the CDS Adapter's Foundations step imports the compiled theme modules (`esm/themes/defaultTheme.js`) from the pinned npm tarball and calls the pinned `getBlendedColor`, where the Carbon Adapter only parses its value files and never runs them. The owner chose this on 2026-10-25, in the grilling session for the CDS Adapter ([#383](https://github.com/pawisssh/design/issues/383)).

Running a Code Library's code is allowed only under these limits:
- **The fetch runs nothing.** It checks each tarball against its registry `integrity` and extracts named members with `tar`; no install script runs.
- **Only named compiled modules are evaluated, by the Foundations step.** Those are the theme modules, `createThemeCssVars` and `getBlendedColor`, with the modules they import. They come from the tarballs the fetch verified, never from an install of the Code Library. The one package outside those tarballs is `d3-color`, which `getBlendedColor` imports: the fetch installs it with `npm ci --ignore-scripts` from a lockfile committed in `skills/adapter-cds/foundations/`, which checks it against the lockfile's integrity, and the loader maps the import to that copy.
- **The values are checked against the Code Library's own CSS-variable output.** For each Mode, every value must equal the custom property that CDS's `createThemeCssVars` emits for that theme and colour scheme, or generation fails. This stands in for Carbon's check against its compiled CSS.
- **The TypeScript sources are the evidence.** The theme's `.ts` files at the pinned commit are hashed into `source.files`, so each value can be traced to a source line.

The same session settled the pin. CDS Web 9.29.0, the npm `latest`, has no git tag and its package has no `gitHead`. The pin is the commit on `coinbase/cds` master that bumped `packages/web/package.json` to 9.29.0, with `tag` left empty and a note saying how the commit was found. The npm versions and integrities pin the packages themselves.

## Considered Options

- **Parse the TypeScript theme sources without running them**: rejected. It means evaluating template strings and `getBlendedColor`'s luminance-adjusted blend in a second, hand-written copy, which can drift from what CDS renders.
- **Read the values from a rendered page's computed custom properties**: rejected. It needs a browser for a document that is otherwise generated offline, and hover and pressed colours appear only on an element in that state.
- **Pin the `v9.0.0` tag**: rejected. It is the only web semver tag, five months older than 9.29.0, and its packages are not the ones a CDS Prototype installs today.

## Consequences

- Another Adapter may evaluate a Code Library's compiled code only under the same limits: the fetch runs nothing, the modules are named, and the values are checked against the library's own CSS output.
- An untagged pin can't be found from a tag later. The Adapter's SKILL.md says how to find the release commit when moving the pin.
