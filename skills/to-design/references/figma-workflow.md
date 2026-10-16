# Native batch script generation and execution

Read for native construction, dual-runtime packaging, one-call execution or resume. HTML capture is not the required construction method in this workflow.

## Responsibility and scope

`to-preview` owns source discovery, full source matrices and selected preview evidence. `to-design` owns selection-to-build orchestration, packaging, parity and a single native ledger. Load `figma-generate-library` for construction/foundations and `figma-use` for API/executor rules; both are required for component authoring. Load each once, not recursively. For requested new files also load `figma-create-new-file`.

Lock selected unpublished component scope. Library-wide examples must not silently add publishing/Code Connect. `figma-generate-design` owns composed product screens; `figma-design-to-code` owns the reverse direction. No separate `create-component-set` route remains.

## Build-plan contract

`build-plan.json` has `schemaVersion: 1`, source `snapshotId`, the exact approved selection under `selection`, selected family/native tuple mappings, selected theme assignments, dependency order and source-derived node/token/property specs. Add actual target `fileKey` when known. Keep full source coverage paths independently referenced. Map source roles to node IDs only after actual construction/readback.

Record native tuple deduplication across token modes and structural differences explicitly. Every selected source specimen resolves to a native variant plus mode/context; no excluded content can appear silently. Effective defaults come from selection and must be validated.

## Generated shared core

Author `async function buildComponentSets(figma, plan, state)` as plain JavaScript using the supported standard API surface. It receives an embedded immutable plan/state, not filesystem paths. Use common APIs such as `createComponent`, `createFrame` with explicit layout mode, `createText`, `createNodeFromSvg`, `combineAsVariants`, variable/style methods and property references. The shared core must not require MCP-only `createAutoLayout`, top-level return, `showUI`, network fetch, `setPluginData`, or `closePlugin`.

Load exact fonts before all text/typography/mode mutations. Build/reuse dependency tokens/helpers first. Preserve source aliases, scopes, modes and actual code syntax. Bind paints with the appropriate paint-binding API; align numeric bindable fields with the live field/type list. Import exact SVGs for vectors. For raster content, use upload_assets to prepare actual in-file image hashes before the shared core executes; MCP byte-upload APIs createImage/createImageAsync are unsupported by current executor guidance. Record required asset-preparation calls separately from the one native build call. A standalone-only byte loader would be a separate adapter, not part of the shared MCP-compatible core.

Implement creation/update through component-domain guidance. Apply per-anatomy Auto Layout, HUG/FILL/FIXED, min/max, padding/gap/alignment and overlay decisions. Append children before context-sensitive sizing. Add/reuse TEXT/BOOLEAN/INSTANCE_SWAP keys, capture returned keys and attach real sublayer references; variants encode finite visual tuples. Arrange variants after combining and produce a separate instance review grid.

All selected sets live on one chosen page by default. Resolve/create the page once and call `setCurrentPageAsync` at most once. One dependency-first loop can build every selected set; do not implement a separate MCP call per variant/family. The script must return counts, all created/updated IDs and authoritative ledger changes.

## In-place update and partial selections

Only update native assets whose IDs/family/tuple identity are recorded as owned by this workflow and whose readback matches the ledger. Preserve existing main component/set IDs and functional property keys where possible. When IDs disappear, inspect and reconcile before regenerating; avoid fuzzy-name overwrite of unrelated assets.

For deselected previously-owned variants, move exact tracked components outside the active set to a run-owned Deprecated area on the same page, keeping their IDs/instances alive. Record that status. Do not delete their unrelated dependents or silently retain them as active selected variants. Restore/reuse the same IDs if selected again. Preserve existing user-owned content and report a conflict if reconciliation cannot safely update it.

Maintain one durable ledger under `.scratch/to-design/` for file/page/collection/mode/component/variant/property IDs, source snapshot, script hash and selected mappings. If another loaded skill expects a temp state file, use a pointer/copy from this ledger with explicit synchronization; it is not an independent authority.

## Packaging and syntax validation

```bash
python3 skills/to-design/scripts/package_native_builder.py \
  skills/to-design/assets/builder-core.js \
  .scratch/to-design/<run>/plan.json \
  .scratch/to-design/<run> \
  --state .scratch/to-design/<run>/state.json
```

Omit `--state` for an initial empty ledger. The helper validates packaging identity/snapshot fields and emits:

- `build-components.mcp.js`: the fixed core, `PLAN_SRC`/`STATE_SRC` as `String.raw` text, the `CHECK` block and a top-level `return await ...`, for the actual `use_figma` code argument. MCP only: there is no Console/Scripter wrapper.
- `script-package.json`: input hash, `fileSha256`, `check`, source snapshot and `execution: not-run` metadata.

The packager is not a native engine or a visual validator. Parse the MCP file inside an AsyncFunction without invoking it. Test core logic through meaningful mocked invariants when appropriate; this does not replace Figma readback.

## Execute one native build call

Execution is separate from artifact generation. When the user has requested/authorized the selected build, resolve the actual target and live schemas; read the saved MCP file and submit its full contents to `use_figma` once. Its tool schema takes `code`, not a local path. Use required `skillNames` logging from loaded Figma skills; names do not load the instructions themselves.

Default to the single page/single native call. Executor resource limits or explicit multi-page output may require splitting; report that exception and preserve the full selected union rather than promising arbitrary library sizes fit. Serialize mutating calls, with one page switch per call. Do not adopt conflicting multi-page parallel examples for this one-page workflow.

Persist returned results/ledger immediately. Handle a partially failed build by returning recorded IDs/progress, reading the canvas and reconciling before retry. After changing state, record the result into the ledger and re-package, so the package does not replay stale empty IDs. Use the connected error's retry-safety information when available.

## Verify

Coverage is selected native tuples, not the entire source product for a partial selection. Supply `--selection` to the checker and verify source specimen identity/snapshot. Audit theme/mode mapping, default, property references, tokens/styles/fonts, nested swaps, Auto Layout/resizing and selected visual parity separately. Excluded source rows remain in the independent full manifest for audit. Script creation/parse success is never evidence of actual Figma output.

References: [Figma tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/), [Component properties](https://developers.figma.com/docs/plugins/working-with-component-properties/), [Plugin API](https://developers.figma.com/docs/plugins/api/figma/).
