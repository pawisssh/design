---
name: to-design
description: Generate and optionally execute programmatic native Figma batch scripts from approved HTML component selections, layout specs and tokens. Use for selected variants with Auto Layout, bound component properties and tracked in-place updates; to-preview prepares the interactive preview.
---

# To-design — Native Script Workflow

Own orchestration, script packaging, execution state and source-to-Figma parity. Consume approved selection/spec data and generate native Figma API code; `figma-generate-library` owns component construction guidance and `figma-use` owns executor/API rules. HTML is the review surface, not a required capture/import step.

## Prepare the selected input

These two custom skills are an installation pair. Read [to-preview's contract](../to-preview/references/sheet-contract.md). If a verified selection is missing, load `to-preview`, prepare the interactive catalog and obtain the user's selected snapshot before generating the native script. Sheet-only requests finish there; avoid reciprocal workflow calls.

Require exact selected specimen IDs/variant tuples/themes, full source matrices, source/version snapshot, layout/token/property plans and dependency closure. Reject stale snapshots, unknown IDs, unsupported tuples or missing selected-case evidence. Default to full selected families, honoring explicit per-variant/state/size/theme exclusions. Collapse duplicate native tuples across token modes only when their structure really matches; preserve selected mode coverage separately.

Resolve partial-set effective defaults from the selected manifest, preserving the source default when selected. Do not quietly add excluded variants or claim complete-family coverage for a partial selection. Keep dependencies visible and scoped to selected content.

## Compile Programmatic Native scripts

Read [references/layout-and-token-mapping.md](references/layout-and-token-mapping.md) and [references/figma-workflow.md](references/figma-workflow.md). Load `figma-generate-library` and `figma-use` before authoring native construction code; inspect the connected supported types/APIs. Follow the selected unpublished-component scope: publishing and Code Connect are separate requested work.

The builder core is fixed: [assets/builder-core.js](assets/builder-core.js), `async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK)`. A run never edits it; a run changes only the build plan and the ledger state. It runs in `use_figma` only (there is no Console/Scripter wrapper). Keep it ASCII, with everything inside that one function, because the integrity gate hashes `buildComponentSets.toString()`. Slices share the gate and dispatch on `plan.slice`:

- **Foundations** (#29, built). [scripts/build-plan.mjs](scripts/build-plan.mjs) derives the plan from `design-systems/<key>/<key>.foundations.json`, stripping the review-only fields, and embeds the ledger section as state. The slice builds the Variable collections, modes, variables and Text Styles, and follows the update semantics in [foundations-schema.md](../contract/references/foundations-schema.md#update-semantics-idempotent): ownership through the ledger, `conflict` before any change, diff-based writes, mode order fixed with `setDefaultMode`, orphans kept until `--prune`. Use `--adopt` only after a lost connection, once a readback shows the objects came from this workflow.
- **Icon atoms and Component Sets** (#30, #31, #32; not built yet). It loops over dependencies, families and selected tuples, creates or updates native nodes, applies tokens and Auto Layout explicitly, binds TEXT/BOOLEAN/INSTANCE_SWAP to real sublayers, and arranges sets plus instance review grids.

```
node skills/to-design/scripts/build-plan.mjs foundations --doc design-systems/carbon/carbon.foundations.json --file-key <key> --out .scratch/to-design/<run> [--page <name>] [--adopt] [--prune a,b]
python3 skills/to-design/scripts/package_native_builder.py skills/to-design/assets/builder-core.js .scratch/to-design/<run>/plan.json .scratch/to-design/<run> --state .scratch/to-design/<run>/state.json
# send the package to use_figma (see Package delivery), save the returned JSON, then:
node skills/to-design/scripts/ledger.mjs record .scratch/to-design/<run>/result.json
```

`build-plan.mjs` reads `.scratch/to-design/<fileKey>.ledger.json` by default. Record every result before deriving the next plan, so the state the package carries is the ledger Figma last returned.

Create or reuse only required foundations/helpers. Keep complete selected tuple coverage despite matrix size. Read stored IDs and update workflow-owned components/variants/properties in place to preserve instances; inspect before repairing missing IDs. Preserve unrelated assets. For deselected previously-owned variants, use the tracked reversible deprecation strategy rather than deleting active instances.

[scripts/package_native_builder.py](scripts/package_native_builder.py) emits `build-components.mcp.js` from the core, plan and state. It embeds plan and state as `String.raw` text next to a `CHECK` block `{planLen, entries, plan, state, core}` of FNV-1a-32 hashes, and refuses text with a backtick, `${` or non-ASCII (JSON escapes non-ASCII). Before its first change the core recomputes every field; on a mismatch it returns `{error: "package-mismatch", field, expected, got}` and changes nothing. If `figma.fileKey` differs from the plan's, it returns `{error: "wrong-file"}`.

## Package delivery

Run the packager from the project root and write the package under `.scratch/to-design/`. It records `fileSha256` in `script-package.json` and prints `chars`, `fileSha256` and a fail-closed `stub`:

```
/*@package .scratch/to-design/<run>/build-components.mcp.js sha256=<hex>*/ throw new Error("package not injected");
```

Once the hook is registered and its live check (#26) has passed, send exactly that stub as `use_figma`'s `code`; never re-type the package. Until then, deliver the contents of `build-components.mcp.js` inline. The PreToolUse hook [hooks/use-figma-package.mjs](hooks/use-figma-package.mjs) swaps it for the file after checking the sha256 against the stub and `fileSha256`, the path stays inside the project, and the package is at most 50,000 chars. It logs each swap to `.scratch/to-design/use-figma-package.log`. If the hook refuses, it blocks the call with a one-line reason: fix the cause and re-package rather than editing the stub.

- **Registering the hook is the owner's step.** The owner pastes [hooks/settings.snippet.json](hooks/settings.snippet.json) into the project's `.claude/settings.json`; agents don't edit settings. `onFailure` needs Claude Code v2.1.295 or later (Claude Code hooks docs).
- **Project hooks load only at session start.** After registering, start a fresh session. Ticket #26 runs the live check.
- **If `use_figma` returns `Error: package not injected`**, the hook isn't loaded, and nothing was changed in Figma. Deliver the contents of `build-components.mcp.js` inline instead. The core's integrity gate (#17) catches drift in an inline paste before its first change.

## One-call execution and recovery

Default to generating artifacts without Figma writes. Execute only when the user requested/authorized execution of the reviewed selected snapshot; respect existing authorization instead of adding redundant approval prompts. An Export Selection browser action alone is not an MCP execution bridge.

For requested execution, resolve the actual file and create one only with that scope, loading `figma-create-new-file` first. Deliver the package as the `code` argument to `use_figma` as [Package delivery](#package-delivery) describes: the printed stub once the hook is live, inline until then. Build all selected sets on one page in one call, with a single page switch and dependency-first loops; there is no call per variant. Reuse the same page/IDs on updates. Split only if the live executor limit/failure or an explicit multi-page destination requires it; retain the complete selection and report the actual batch count.

Return all created/updated IDs, component/property mappings, coverage evidence and partial state even on recoverable failures. Persist one authoritative ledger under `.scratch/to-design/`; subordinate skill state paths reference that ledger. Inspect partial output before retry, then regenerate the packaged script with reconciled state. Keep canvas mutations serialized under the live executor contract.

## Validate and complete

Parse the package without executing, validate plan/selection/source consistency and inspect native APIs/property bindings before delivery. Script generation is complete when artifacts, included selection counts, dependencies and validation are reviewable; mark execution as unperformed. Never claim Figma creation from packaging success.

After execution, read back actual selected tuples/types/defaults/property references, Auto Layout/sizing, token/style bindings/mode resolution and nested instances. Use [scripts/check_coverage.py](scripts/check_coverage.py) with [references/component-sheet.md](references/component-sheet.md), supplying the selection manifest for partial scope. Verify all selected themes separately and compare actual review instances with the approved HTML, including label/icon/width changes. Repair scoped defects and recheck.

Return saved scripts/plan/ledger paths, selected-vs-built counts, execution status, Figma links when executed and concrete limitations. Retain the original source matrix so unselected cases remain auditable without being created.
