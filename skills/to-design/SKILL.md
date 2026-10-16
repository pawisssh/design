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

The builder cores are fixed. Each is `async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK)`: [assets/builder-core.js](assets/builder-core.js) runs foundations and icons, [assets/builder-core-components.js](assets/builder-core-components.js) runs the base slice and the component sets. One core holding every slice would not fit `use_figma`'s 50,000-char limit next to the foundations plan. Pass the core for the slice to the packager; a plan given to the other core returns `unknown-slice` or `package-mismatch` before any change. A run never edits a core; a run changes only the build plan and the ledger state. They run in `use_figma` only (there is no Console/Scripter wrapper). Keep them ASCII, with everything inside that one function, because the integrity gate hashes `buildComponentSets.toString()`. Slices share the gate and dispatch on `plan.slice`:

- **Foundations** (#29, built). [scripts/build-plan.mjs](scripts/build-plan.mjs) derives the plan from `design-systems/<key>/<key>.foundations.json`, stripping the review-only fields, and embeds the ledger section as state. The slice builds the Variable collections, modes, variables and Text Styles, and follows the update semantics in [foundations-schema.md](../contract/references/foundations-schema.md#update-semantics-idempotent): ownership through the ledger, `conflict` before any change, diff-based writes, mode order fixed with `setDefaultMode`, orphans kept until `--prune`. Use `--adopt` only after a lost connection, once a readback shows the objects came from this workflow.
- **Icons** (#30, built). `build-plan.mjs icons` takes the union of the Contracts' `icons.default` and `icons.preferred` (`icons()` in the shared contract module), reads each SVG from the unpacked, pinned `@carbon/icons` package (16 px file, else the 32 px fallback), and strips unpainted shapes such as the transparent bounding box. The slice builds one 16x16 component per icon on the Icons page: no fill, one flattened VECTOR named `Vector` with SCALE/SCALE constraints, kit-style name (`Arrow--right`), the source file in the description. Ownership is the same as for foundations, but there is no prune: a dropped icon becomes an orphan and is never deleted. A rerun reverts hand edits to the name, description, size, fill, page, and the Vector's name and constraints. It does not compare the Vector's geometry or fill. A changed SVG sha256, or a component reclaimed with `--adopt` (no recorded sha256), rebuilds only the Vector, so the component keeps its id and key. The ledger's `icons.components[key]` holds `{id, key, file, sha256}`: the key is what INSTANCE_SWAP `preferredValues` need, the id is the property default.
- **Base** (#31, built; components core). `build-plan.mjs base` resolves one family's Base Component (each axis at its default; review specimen: every BOOLEAN on, TEXT and INSTANCE_SWAP at their default) in node, so the core never matches rules. It refuses a Contract that fails validation, and a foundations doc whose `documentHash` is not the one the ledger built. The slice builds the anatomy inside one COMPONENT on the Contract's page, binds tokens through the ledger's ids, writes a field only when the read value differs, and rebuilds the layers inside the same component when the tree differs (the id and key stay). `--read-only` reads back without writing. Ownership as for icons, in the ledger's `bases[family]` `{page, id, key, name, snapshotId, contentHash, documentHash, builtAt}`. The readback sets `figma.skipInvisibleInstanceChildren = false` and reads effects in order.
- **The base-first loop** ([scripts/base-loop.mjs](scripts/base-loop.mjs)) closes it: `readback` names the result's ids through the ledger; `diff` lists token edits, raw edits, detached bindings and unmapped changes, and fields not read; `apply` writes each mapped change in place into the winning rule with `by` and a nested `was`, shows the blast radius and refuses a shared rule until the owner confirms it (`--confirm Node.field,...|all`), writes a `warning` note for each unmapped change (it blocks approval) and a `verify` note for each derived raw that may be stale; `discard` downgrades a warning note to info when the owner drops the tweak and a rebuild reads back clean, reporting that field; `review` prints the review package (node link, snapshotId, contentHash, diff summary, edits with by/was, blast radius and shields) and the approve command. `approve` runs only after the owner types "approve" in chat: it needs a clean readback, the Base Component's name, and the snapshotId and contentHash the owner reviewed. Only the owner approves; `--prototype` writes `by: "orchestrator (prototype)"` and only to an `--out` under `.scratch/`. `regen` rebuilds the goldens from saved readbacks byte-for-byte.
- **Component Sets** (#32, built; components core). `build-plan.mjs sets` takes an approved Contract only: it refuses a draft, a failing validation, and a foundations doc the ledger did not build. It expands the selection with the shared contract module, resolves every tuple in node (layout, paint, binds; identical fragments deduped), and packs each entry as an axis-ordered tuple of value indexes that decodes back to the approved selection. Batches hold `PER_CALL` (49) entries in expansion order. The slice builds one Grid Auto Layout COMPONENT_SET per family on the Contract's page:
  - **Layout.** Size makes the columns; Kind then State make the rows. Each axis runs default-first, so the default variant sits top-left.
  - **Header.** The set sits inside a `Components` section whose Header is an instance of the Component Header template, built once on a `Templates` page.
  - **Properties.** TEXT, BOOLEAN and INSTANCE_SWAP properties are wired with `componentPropertyReferences`. The INSTANCE_SWAP `preferredValues` are the ledger's icon keys, and its default is the icon id.
  - **The Base.** When the ledger has `bases[family]`, the Base Component is rebuilt in place inside the set (same id and key), and the first batch must hold it ("base-first").

  The rules for writing and recording:
  - **Diffs only.** Writes happen only where the readback differs, so a rerun creates and updates nothing.
  - **Batch ids only.** A call carries and returns only its batch's variant ids. `ledger.mjs record` merges them into `sets[family].variants` (an array of `total` ids) and keeps the other families.
  - **Lost connection.** A call whose result was lost may still have committed. Run `--mode reconcile` (it finds the set's variants by name and records them) before retrying the batch.

  Read modes leave the file as they found it:
  - `coverage` returns every variant's name, cell and property wiring, plus the set, section, Header and property definitions.
  - `sample` reads chosen variants in full, as the base slice does.
  - `theme` resolves each bound colour in every mode of its collection, then restores the explicit modes.

  [scripts/coverage.mjs](scripts/coverage.mjs) checks them against the Contract through the shared contract module (`coverage`, `sample`, `theme`).
  - **Hidden children.** A hidden child of an auto layout reports FILL sizing as `FIXED`, so the readback takes fill from `layoutGrow` (main axis) or `layoutAlign: STRETCH` (cross axis).

  **Measured live (#32, 245 and 539 variants, 49 per call):**
  - **Package size.** Packages run 40-47K chars, so 64 per call left too little room under 50,000.
  - **Output.** Build output is at most 2.3KB. A coverage read is about 1.5KB plus 23 bytes per variant (6.6KB at 245, 13.1KB at 539), so 20KB holds about 800 variants. A sample read is about 1.6KB per variant (keep it to 12 or fewer); a theme read is about 0.35KB per variant.
  - **Time.** A creating call costs about 1.6 ms × variants created × set size. The calls took 5.1s at 49, 13.1s at 147, 18.6s at 245, 28.4s at 343, 37.6s at 441 and 41.8s at 539, so building a family is quadratic: 539 variants took 263s over 11 calls. An update-free rerun call takes 0.4-1.1s, and a coverage read takes 0.3s at 539.
  - **Ceiling.** No call failed at 41.8s. For a family above about 600 variants, lower `--per-call` so that 1.6 ms × per-call × set size stays under about 45s.

```
node skills/to-design/scripts/build-plan.mjs foundations --doc design-systems/carbon/carbon.foundations.json --file-key <key> --out .scratch/to-design/<run> [--page <name>] [--adopt] [--prune a,b]
node skills/to-design/scripts/build-plan.mjs icons --contract design-systems/carbon/contracts/button.component.json --icons-dir .scratch/adapter-carbon/sources/npm/@carbon/icons@11.90.0/package --file-key <key> --out .scratch/to-design/<run> [--page Icons] [--adopt]
node skills/to-design/scripts/build-plan.mjs base --contract design-systems/carbon/contracts/button.component.json --doc design-systems/carbon/carbon.foundations.json --file-key <key> --out .scratch/to-design/<run> [--read-only] [--page <name>] [--adopt]
node skills/to-design/scripts/build-plan.mjs sets --contract design-systems/carbon/contracts/button.component.json --doc design-systems/carbon/carbon.foundations.json --file-key <key> --out .scratch/to-design/<run> [--mode build|reconcile|coverage|sample|theme] [--batch N] [--per-call 49] [--sample i,j]
node skills/to-design/scripts/coverage.mjs <coverage|sample|theme> <component.json> .scratch/to-design/<run>/result.json [--ledger <path>] [--foundations <path>]
python3 skills/to-design/scripts/package_native_builder.py skills/to-design/assets/<builder-core.js | builder-core-components.js> .scratch/to-design/<run>/plan.json .scratch/to-design/<run> --state .scratch/to-design/<run>/state.json
# send the package to use_figma (see Package delivery), save the returned JSON, then:
node skills/to-design/scripts/ledger.mjs record .scratch/to-design/<run>/result.json
# base only:
node skills/to-design/scripts/base-loop.mjs readback .scratch/to-design/<run>/result.json --out .scratch/to-design/<run>/readback.json
node skills/to-design/scripts/base-loop.mjs diff <component.json> .scratch/to-design/<run>/readback.json
node skills/to-design/scripts/base-loop.mjs apply <component.json> .scratch/to-design/<run>/readback.json --confirm Node.field,...|all [--out <path>]
node skills/to-design/scripts/base-loop.mjs discard <component.json> .scratch/to-design/<run>/readback.json --note <at>   # only when the owner drops the tweak
node skills/to-design/scripts/base-loop.mjs review <component.json> .scratch/to-design/<run>/readback.json --file-key <key>
node skills/to-design/scripts/base-loop.mjs approve <component.json> .scratch/to-design/<run>/readback.json --snapshot-id <id> --content-hash <hash>   # only after the owner types "approve"
node skills/to-design/scripts/base-loop.mjs regen skills/to-design/tests/fixtures/base-loop skills/to-design/tests/fixtures/base-loop/expected
```

`build-plan.mjs` reads `.scratch/to-design/<fileKey>.ledger.json` by default. Record every result before deriving the next plan, so the state the package carries is the ledger Figma last returned.

Create or reuse only required foundations/helpers. Keep complete selected tuple coverage despite matrix size. Read stored IDs and update workflow-owned components/variants/properties in place to preserve instances; inspect before repairing missing IDs. Preserve unrelated assets. For deselected previously-owned variants, use the tracked reversible deprecation strategy rather than deleting active instances.

[scripts/package_native_builder.py](scripts/package_native_builder.py) emits `build-components.mcp.js` from the core, plan and state. It embeds plan and state as `String.raw` text next to a `CHECK` block `{planLen, entries, plan, state, core}` of FNV-1a-32 hashes, and refuses text with a backtick, `${` or non-ASCII (JSON escapes non-ASCII). It compacts the core line by line (drops `//` comments and the whitespace no token needs; strings are kept as written), so a core uses `//` comments only and no regex literals; the gate hashes the compacted text. Before its first change the core recomputes every field; on a mismatch it returns `{error: "package-mismatch", field, expected, got}` and changes nothing. If `figma.fileKey` differs from the plan's, it returns `{error: "wrong-file"}`.

## Package delivery

Run the packager from the project root and write the package under `.scratch/to-design/`. It records `fileSha256` in `script-package.json` and prints `chars`, `fileSha256` and a fail-closed `stub`:

```
/*@package .scratch/to-design/<run>/build-components.mcp.js sha256=<hex>*/ throw new Error("package not injected");
```

Once the hook is registered and its live check (#26) has passed, send exactly that stub as `use_figma`'s `code`; never re-type the package. Until then, deliver the contents of `build-components.mcp.js` inline. The PreToolUse hook [hooks/use-figma-package.mjs](hooks/use-figma-package.mjs) swaps it for the file after checking the sha256 against the stub and `fileSha256`, the path stays inside the project, and the package is at most 50,000 chars. It logs each swap to `.scratch/to-design/use-figma-package.log`. If the hook refuses, it blocks the call with a one-line reason: fix the cause and re-package rather than editing the stub.

- **Registering the hook is the owner's step.** The owner pastes [hooks/settings.snippet.json](hooks/settings.snippet.json) into the project's `.claude/settings.json`; agents don't edit settings. `onFailure` needs Claude Code v2.1.295 or later (Claude Code hooks docs).
- **Project hooks load only at session start.** After registering, start a fresh session. Ticket #26 runs the live check.
- **If `use_figma` returns `Error: package not injected`**, the hook isn't loaded, and nothing was changed in Figma. Deliver the contents of `build-components.mcp.js` inline instead. The core's integrity gate (#17) catches drift in an inline paste before its first change.
- **The package never spells `<`.** `use_figma` transpiles any script whose strings hold markup-like text (`<svg`, `<p`, even the escape `\u003csvg`). That reformats `buildComponentSets.toString()`, so the gate fails with a `core` mismatch before any change (found live in #30). The packager therefore emits plan and state text that holds a `<` as `String.raw` pieces joined with `String.fromCharCode(60)`, and it refuses a core that spells markup-like text. Never hand-edit a package to put a `<` back.

## One-call execution and recovery

Default to generating artifacts without Figma writes. Execute only when the user requested/authorized execution of the reviewed selected snapshot; respect existing authorization instead of adding redundant approval prompts. An Export Selection browser action alone is not an MCP execution bridge.

For requested execution, resolve the actual file and create one only with that scope, loading `figma-create-new-file` first. Deliver the package as the `code` argument to `use_figma` as [Package delivery](#package-delivery) describes: the printed stub once the hook is live, inline until then. Build each family's set on its page in batches of `PER_CALL` variants (one call per batch, recorded before the next is derived); there is no call per variant. Reuse the same page/IDs on updates. Split only if the live executor limit/failure or an explicit multi-page destination requires it; retain the complete selection and report the actual batch count.

Return all created/updated IDs, component/property mappings, coverage evidence and partial state even on recoverable failures. Persist one authoritative ledger under `.scratch/to-design/`; subordinate skill state paths reference that ledger. Inspect partial output before retry, then regenerate the packaged script with reconciled state. Keep canvas mutations serialized under the live executor contract.

## Validate and complete

Parse the package without executing, validate plan/selection/source consistency and inspect native APIs/property bindings before delivery. Script generation is complete when artifacts, included selection counts, dependencies and validation are reviewable; mark execution as unperformed. Never claim Figma creation from packaging success.

After execution, read back actual selected tuples/types/defaults/property references, Auto Layout/sizing, token/style bindings/mode resolution and nested instances. Check sets with [scripts/coverage.mjs](scripts/coverage.mjs) (above); the older [scripts/check_coverage.py](scripts/check_coverage.py) with [references/component-sheet.md](references/component-sheet.md) goes in #34. Verify all selected themes separately and compare actual review instances with the approved HTML, including label/icon/width changes. Repair scoped defects and recheck.

Return saved scripts/plan/ledger paths, selected-vs-built counts, execution status, Figma links when executed and concrete limitations. Retain the original source matrix so unselected cases remain auditable without being created.
