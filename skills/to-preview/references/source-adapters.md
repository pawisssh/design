# Source adapters

> **Superseded (#33).** Reading a Code Library is now an Adapter skill's job (such as `adapter-carbon`); To-preview reads only the Contract. This file goes in the hard cut (#34).

Read only for the source formats present. Adapters produce the same source inventory, full visual matrix, anatomy/layout/token plans and renderer registration. They do not independently construct Figma assets.

## Code / HTML libraries

Discover the user's library and actual package version/commit. Inspect exports/types, implementation, CSS/pseudo-state rules, tokens, themes, fonts, providers and assets. Reuse the project's runtime to render actual components. Do not infer exhaustive source coverage from stories alone.

## Component `.txt` / Coinbase CDS specifications

Read each selected spec and its dependencies; derive anatomy, props/defaults, supported variants/sizes/states and composition. Classify nonvisual providers/utilities separately. Resolve exact values through matching installed implementation and theme tokens, then render the actual code export where available.

Known local Coinbase sources from the retired workflow, used only when relevant and present:

- Specs: `/Users/kane/Projects/_archive/mino/node_modules/@coinbase/cds-mcp-server/mcp-docs/web/components/`
- Implementation/themes/assets: `/Users/kane/Projects/_archive/mino/node_modules/@coinbase/`

The current user's selected project/path/version takes precedence; locate its installed CDS packages or local copied specs before falling back. Inspect `cds-web`, `cds-common`, `defaultTheme`, actual icons and illustrations. Treat packages as read-only inputs. If a renderer is unavailable, a labeled spec-derived renderer may be generated for preview, but must be compared with authoritative implementation/reference before being marked verified; do not present an approximation as the actual library.

Preserve source light/dark behavior and default values; do not impose Coinbase themes on other libraries. Record exact source refs and the chosen resolution when docs/types/implementation disagree. Missing visual evidence remains a blocking gap for that specimen, not permission to fabricate values.

The archived `create-component-set` skill is historical provenance. All live spec ingestion now belongs here; no separate spec-to-Figma construction route is invoked.
