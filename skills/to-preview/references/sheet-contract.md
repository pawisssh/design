# Catalog, source matrix and selection contract

This contract is the single handoff between the two custom skills. Install `to-preview` and `to-design` together; the consumer references this resource rather than pretending it can read it when the producer is absent.

## Independent source matrix

Discover the full finite visual product before rendering: sizes, hierarchy/style/intent, supported states/composites, shapes or structural changes. Subtract only source-proven invalid complete tuples, with `reason` and `evidence`. Arbitrary labels/icons/callbacks are not infinite variant axes. Record defaults, aliases and content/property review cases separately. An axis-free family has one structural tuple `{}`.

Save `<Family>.expected.json` with `family`, stable `familyId`, source `snapshotId`, nonempty `sources`, `axes`, `excluded` and all source specimen rows `{id, properties, themeId}`. Axis values are unique nonempty strings; `properties` contains exactly the source axis names. Specimen IDs are unique across the catalog and stable for source tuple/theme. Retain the full matrix even after users choose a subset.

`axes` can be `{"Size":["s","m"],"State":["default","hover"]}` with no exclusions: four structural tuples, eight specimens for Light/Dark. The two themes may share four native variants via token modes; different mode-dependent anatomy needs an explicit native mapping.

## Versioned HTML catalog

```json
{
  "schemaVersion": 1,
  "snapshotId": "source-content-hash",
  "dependencies": [
    {"id":"token/button-bg","name":"Button background","type":"token","dependencies":[],"specFile":"tokens.json"}
  ],
  "families": [
    {
      "id":"button", "name":"Button",
      "expectedFile":"Button.expected.json",
      "layoutPlanFile":"Button.layout.json", "tokenPlanFile":"tokens.json",
      "defaultProperties":{"Size":"s","State":"default"},
      "dependencies":["token/button-bg"],
      "specimens":[
        {"id":"button|s|default|light","properties":{"Size":"s","State":"default"},"themeId":"light","dependencies":[]},
        {"id":"button|s|hover|light","properties":{"Size":"s","State":"hover"},"themeId":"light","dependencies":[]}
      ]
    }
  ]
}
```

This abbreviated shape is an illustration, not a complete Button matrix or default source values. The real catalog must list every supported source specimen for the discovered family. The renderer adapter resolves each row to actual code props/theme/forced-state behavior. Dependency registry entries contain source-backed helper data or spec paths; closure is dependency-first and rejects missing nodes/cycles.

## Approved selection

Export `selection-manifest.json`: `schemaVersion: 1`, reviewed `snapshotId`, `intent: generate-native-script`, `selectedFamilies`, exact `entries` (`familyId`, `specimenId`, `properties`, `themeId`), dependency closure, per-family spec paths/counts/scope/effective defaults and approval metadata. Family checkboxes select all source specimens; per-row edits and Select/Clear visible explicitly reduce or expand the selected subset.

Each selected row must resolve to the independent source specimen with identical tuple/theme. Reject unknown IDs, unsupported values, duplicates or stale snapshots. Source default is the effective default when selected; otherwise use the first selected source-ordered tuple and show the changed default. Keep source default metadata for audit. A partial selection is valid and must never be labeled a complete family.

The browser export approves selected content; `approval.executionAuthorized` is false. Existing explicit user execution authorization is tracked by the agent, not inferred from export. A custom event/download is not an automatic MCP connection.

## Source layout / token plan

For each meaningful anatomy node record role/parent/child order, source selectors/files, authored direction/wrap/alignment, margins/gaps/side padding, intrinsic/fixed/stretch intent and min/max limits, text wrap/truncation/fonts, fixed icon geometry and flow/absolute anchors. Save computed bounds/viewport separately as validation evidence.

Preserve real token identities, semantic role, alias chain, per-theme values, typography/assets and their references. Spec annotation `16 [--button-padding-x]` means resolved value plus token identity; emitted CSS uses real `var(--button-padding-x)`. The Figma consumer translates this evidence to API fields/bindings.

## Rendering and verification

Discover all family names cheaply but render opened/selected family grids on demand. A selected family must have all its selected tuple/theme specimens rendered and source-verified before export, including required dependencies and long-label/icon/parent-width behavior. Filters may hide cells without changing selection; selected rows remain auditable. Do not equate unopened catalog entries with verified coverage.

Use original source components/styles/providers/fonts/assets, stable transient-state mechanisms and correct inverse backgrounds. Captions/checkboxes are outside component DOM. Explicit large-grid pages can partition a family with recorded unions; virtualization cannot hide selected cases from verification.

## Snapshot and handoff

Persist catalog, full expected JSON, source/spec adapters, layout/token plans, renderer/start command, specimen-to-props mapping and selected verification under `.scratch/to-preview/`. Paths resolve against a recorded project/manifest base. Hash relevant source and plan content; do not rely on a timestamp alone. Source drift invalidates the reviewed selection.

Pass preview URL, catalog/spec plans, full matrices and exact selected manifest to `to-design`. It adds generated native script artifacts and a single authoritative native-ID/property ledger; the producer never guesses Figma IDs or calls back into the consumer itself.
