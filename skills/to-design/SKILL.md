---
name: code-to-canvas
description: Generate and optionally execute programmatic native Figma batch scripts from approved HTML component selections, layout specs and tokens. Use for selected variants with Auto Layout, bound component properties and tracked in-place updates; component-sheet-html prepares the interactive preview.
---

# Code to Canvas — Native Script Workflow

Own orchestration, script packaging, execution state and source-to-Figma parity. Consume approved selection/spec data and generate native Figma API code; `figma-generate-library` owns component construction guidance and `figma-use` owns executor/API rules. HTML is the review surface, not a required capture/import step.

## Prepare the selected input

These two custom skills are an installation pair. Read [component-sheet-html's contract](../component-sheet-html/references/sheet-contract.md). If a verified selection is missing, load `component-sheet-html`, prepare the interactive catalog and obtain the user's selected snapshot before generating the native script. Sheet-only requests finish there; avoid reciprocal workflow calls.

Require exact selected specimen IDs/variant tuples/themes, full source matrices, source/version snapshot, layout/token/property plans and dependency closure. Reject stale snapshots, unknown IDs, unsupported tuples or missing selected-case evidence. Default to full selected families, honoring explicit per-variant/state/size/theme exclusions. Collapse duplicate native tuples across token modes only when their structure really matches; preserve selected mode coverage separately.

Resolve partial-set effective defaults from the selected manifest, preserving the source default when selected. Do not quietly add excluded variants or claim complete-family coverage for a partial selection. Keep dependencies visible and scoped to selected content.

## Compile Programmatic Native scripts

Read [references/layout-and-token-mapping.md](references/layout-and-token-mapping.md) and [references/figma-workflow.md](references/figma-workflow.md). Load `figma-generate-library` and `figma-use` before authoring native construction code; inspect the connected supported types/APIs. Follow the selected unpublished-component scope: publishing and Code Connect are separate requested work.

Generate a reusable async core `buildComponentSets(figma, plan, state)` from the source-backed build plan. It loops over dependencies/families/selected tuples, creates or updates native nodes, applies tokens and Auto Layout explicitly, binds TEXT/BOOLEAN/INSTANCE_SWAP to real sublayers, and arranges sets plus instance review grids. Use shared standards supported by both MCP and the intended Console/Scripter runtime, rather than MCP-only helpers in the shared core.

Create or reuse only required foundations/helpers. Keep complete selected tuple coverage despite matrix size. Read stored IDs and update workflow-owned components/variants/properties in place to preserve instances; inspect before repairing missing IDs. Preserve unrelated assets. For deselected previously-owned variants, use the tracked reversible deprecation strategy rather than deleting active instances.

Save `native-builder-core.js`, versioned `build-plan.json`, and run state. Use [scripts/package_native_builder.py](scripts/package_native_builder.py) to emit `build-components.mcp.js` and `build-components.js` from the same core/plan. The MCP wrapper uses top-level return; the Console/Scripter wrapper uses an async function invocation and reports results. Do not promise that a plain browser/Node console provides the `figma` API.

## One-call execution and recovery

Default to generating artifacts without Figma writes. Execute only when the user requested/authorized execution of the reviewed selected snapshot; respect existing authorization instead of adding redundant approval prompts. An Export Selection browser action alone is not an MCP execution bridge.

For requested execution, resolve the actual file and create one only with that scope, loading `figma-create-new-file` first. Read/embed the saved MCP script as the `code` argument to `use_figma`. Build all selected sets on one page in one call, with a single page switch and dependency-first loops; there is no call per variant. Reuse the same page/IDs on updates. Split only if the live executor limit/failure or an explicit multi-page destination requires it; retain the complete selection and report the actual batch count.

Return all created/updated IDs, component/property mappings, coverage evidence and partial state even on recoverable failures. Persist one authoritative ledger under `.scratch/code-to-canvas/`; subordinate skill state paths reference that ledger. Inspect partial output before retry, then regenerate the packaged script with reconciled state. Keep canvas mutations serialized under the live executor contract.

## Validate and complete

Parse both wrappers without executing, validate plan/selection/source consistency and inspect native APIs/property bindings before delivery. Script generation is complete when artifacts, included selection counts, dependencies and validation are reviewable; mark execution as unperformed. Never claim Figma creation from packaging success.

After execution, read back actual selected tuples/types/defaults/property references, Auto Layout/sizing, token/style bindings/mode resolution and nested instances. Use [scripts/check_coverage.py](scripts/check_coverage.py) with [references/component-sheet.md](references/component-sheet.md), supplying the selection manifest for partial scope. Verify all selected themes separately and compare actual review instances with the approved HTML, including label/icon/width changes. Repair scoped defects and recheck.

Return saved scripts/plan/ledger paths, selected-vs-built counts, execution status, Figma links when executed and concrete limitations. Retain the original source matrix so unselected cases remain auditable without being created.
