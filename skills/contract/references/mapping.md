# Mapping today's artifacts onto the Contract

How the artifacts of `skills/to-preview` (was `component-sheet-html`) and `skills/to-design` (was `code-to-canvas`) map onto the Contract ([`contract-schema.md`](contract-schema.md)).

**Recommendation.** The Contract replaces `selection-manifest.json`, `<Family>.expected.json` and the per-family layout and token plans as the canonical record. `build-plan.json` stays, but becomes a derived, throwaway compile target:

```
Contract + foundations + run options → build-plan.json → package (#18 compaction)
```

To-preview's HTML `catalog` (its specimens) is also derived from the Contract.

## `selection-manifest.json` (To-preview, `selection-model.js` `manifest()`)

| Manifest field | Contract | Notes |
|---|---|---|
| `schemaVersion: 1` | `schemaVersion: 1` | This is a new document type, so its version line starts fresh. |
| `snapshotId` | `source.snapshotId` | Same drift rule: a changed snapshot voids the approval. The Contract also keeps `tag`, `commit` and `packages`. |
| `intent: generate-native-script` | dropped | Execution intent belongs to the agent, not the content. |
| `selectedFamilies[]` | one Contract file per family | A batch is a list of Contract paths. |
| `entries[].properties` | `axes` − `excluded` − `selection.omit` | Expanded on demand, never stored. |
| `entries[].specimenId` | derived (`button\|primary\|lg\|enabled`) | Used only inside To-preview. The builder core never reads it (#12). |
| `entries[].themeId` | dropped | Themes are modes. Every variant is built once and resolves in every mode. |
| `entries[].familyId` | `family.key` | |
| `dependencies` (closure) | derived from the Contract | Tokens come from `token` refs, icons from `icons`, families from `dependencies.families`, fonts from `dependencies.fonts`. |
| `families[].expectedFile` | `axes` + `excluded` | `expected.json` is absorbed (see below). |
| `families[].layoutPlanFile`, `tokenPlanFile` | `anatomy` + `layout` + `paint` | The `16 [--token]` annotation becomes `{token}`. Computed bounds stay To-preview evidence and are not stored in the Contract. |
| `families[].sourceDefaultProperties` | `axes[].default` + `defaultSource` | |
| `families[].effectiveDefaultProperties` | same as the source default | The default tuple must be selected (Base Component). A different default is an explicit owner edit. |
| `families[].selectedThemes` | dropped | See `themeId`. |
| `selectedCount`, `fullCount`, `scope` | `selection.expectedCount`; derived | `scope` is `complete` when `omit` is empty. |
| `approval.{action, approvedAt}` | `selection.status` + `selection.approval {by, at, snapshotId, contentHash}` | |
| `approval.executionAuthorized` | dropped | Not inferred from the content, as today. |

## `<Family>.expected.json` (sheet-contract, input to `check_coverage.py`)

| Field | Contract |
|---|---|
| `family`, `familyId` | `family.name`, `family.key` |
| `sources` | `source.files` (+ `repository`@`commit`) |
| `snapshotId` | `source.snapshotId` |
| `axes` (`{Name: [values]}`) | `axes[].label` → `values[].label` (what Figma readback shows), with keys kept for identity |
| `excluded` (full tuples) | `excluded` (patterns); the checker expands them |
| `specimens` | derived |

`check_coverage.py` should take the Contract directly: expand the selection with `expand()` from [`contract.mjs`](../scripts/contract.mjs) and compare it with the readback by labels. Until then, `expected.json` can be generated from the Contract.

## `build-plan.json` (To-design) and the smoke-test core

The rows cover every plan field that `native-builder-core.js` on `task/builder-core-smoke-test` reads.

| Plan field | Source after this change | Belongs in the Contract? |
|---|---|---|
| `schemaVersion`, `snapshotId` | package header; `snapshotId` copied from the Contract | no (`snapshotId` yes) |
| `slice` (`foundations` / `components`) | run option | no |
| `page`, `origin`, `onExisting` | `figma.page` from the Contract; origin and onExisting are run options | page only |
| `font` | derived from `textStyle` tokens via the foundations | no |
| `selection.entries[]` (the core reads `properties` and `familyId`) | expanded from the Contract; #18 compacts it to axis-ordered tuples | as patterns |
| `foundations` (collection, modes, colours) | the foundations document (Design System level, #9) | no |
| `families[].id`, `name`, `description` | `family.key`, `family.name`, `figma.description` | yes |
| `families[].axes` | `axes[].key` order + labels | yes |
| `families[].sizes{height, paddingRight}` | `layout` rules (`minHeight` token, paddings) | yes (as rules) |
| state / ledger (`collection`, `variables`, `sets`) | builder ledger | never |

What the real core needs beyond the smoke core is all in the Contract: anatomy names, properties and binds, `paint` rules, icons and the grid.
