# Skills split around the Contract

This is the answer for [#21](https://github.com/pawisssh/design/issues/21), part of map [#1](https://github.com/pawisssh/design/issues/1). It was decided by the orchestrator on the owner's behalf and is pending owner review. Terms follow `GLOSSARY.md`. The decisions themselves are in the #21 resolution comment; this file records the target layout, what each skill emits and consumes, and what is retired.

This branch is cut from `prototype/base-first-loop`, which has the newest `docs/contract/tools/expand_contract.py` (it skips `was`). `docs/foundations/` is brought in from `research/foundations-schema`.

## Target layout

The skills target Claude Code only, so the `agents/openai.yaml` files are dropped.

```
skills/
  contract/                      # neutral; every other skill references ../contract/
    references/contract-schema.md
    references/foundations-schema.md
    references/adapter-guide.md   # what any Adapter must produce; generic parts of
                                  # sheet-contract.md, source-adapters.md, layout-and-token-mapping.md
    contract.schema.json
    scripts/contract.mjs          # the one implementation of: validate (incl. contentHash, rule 6),
                                  # expand, match/resolve, closure, apply-omit
  adapter-carbon/                # one Adapter skill per Code Library (later: adapter-shadcn, ...)
    SKILL.md                     # agent guide: Carbon source -> Contract draft
    scripts/derive_foundations.py # Python is fine, but closure/match/resolve come from contract.mjs
    assets/renderer/             # Carbon React preview renderer for To-preview
  to-preview/                    # was component-sheet-html (git mv)
    SKILL.md
    assets/component-sheet-template.html
    assets/selection-model.js
    scripts/derive_catalog.mjs
  to-design/                     # was code-to-canvas (git mv)
    SKILL.md
    assets/builder-core.js       # fixed core: foundations + components slices
    scripts/derive_build_plan.mjs
    scripts/package_native_builder.py   # spike version (fileSha256 + stub), then #17 + #18
    scripts/use-figma-package.mjs       # PreToolUse hook source
    scripts/check_coverage.mjs
    scripts/base_loop.mjs        # readback/diff/blast radius (from prototype loop.mjs)

<project>/                       # the pilot project is this repo
  .claude/settings.json          # registers to-design/scripts/use-figma-package.mjs
  design-systems/carbon/         # committed: owner edits and approval live here
    carbon.foundations.json
    contracts/button.component.json
  .scratch/to-preview/           # gitignored: catalog, preview evidence
  .scratch/to-design/            # gitignored: build-plan, packages, readbacks
    <fileKey>.ledger.json
```

## What each skill emits and consumes

| Skill | Consumes | Emits |
|---|---|---|
| `adapter-carbon` | Carbon source at the pinned commit, `contract.mjs` | a draft Contract (`selection {status: "draft", omit: [], expectedCount: <full>}`), the foundations document, and the preview renderer |
| `to-preview` | the Contract, the foundations modes, and the Adapter renderer | an omit patch `{family, snapshotId, omit, expectedCount}`, which the agent applies to the Contract in place and validates. The expanded set must equal the tuples checked in the UI. To-preview never writes approval. |
| `to-design` | approved Contract(s), the foundations document, the ledger, and run options | the foundations slice, icon atoms, then the base loop (draft → approved), then the batch Component Set build (which rebuilds the base), then verification. Code Connect runs after publish. |

These rules apply across skills:
- **To-preview edits only `selection.omit` and `expectedCount`.** Dropping a state is an omit pattern. Changing a default or a label is an explicit Contract edit by the agent, never made from the catalog.
- **Every Contract write resets** `status: "draft"` and `approval: null`. Only the base-loop approval sets `approved`, with `contentHash`.
- **To-preview is not a gate.** To-design accepts any valid draft Contract. The base-loop approval is the only gate.
- **Catalog.** `derive_catalog.mjs` derives the catalog from the Contract:
  - Specimens are axes − excluded, with omitted tuples shown unchecked.
  - Ids are derived (`button|primary|lg|enabled`).
  - Props are the merged `values[].code`. State is forced through its `css` pseudo-class.
  - The default tuple is locked on.
  - Theme is a display-only toggle over the foundations mode keys. Export requires every selected tuple to be rendered in the default mode only (245 cells for Button, against 980 if every mode were required).
- **`selection-model.js`** drops `themeId`, `specimenId` in its output, the effective-default fallback, the plan-file paths, `intent` and `executionAuthorized`. `manifest()` becomes `omitPatch()`.
- **Build plan.** `build-plan.json` is derived and throwaway. It carries the Contract's rules plus compact tuples (#18), and the fixed core resolves them in Figma.
  - Measured for Button: pre-resolved per-variant specs for all 245 variants are 313,653 characters (224,856 stripped), against the 50K `use_figma` cap. The rules alone are 8,810.
  - Only the MCP wrapper is emitted. The Console/Scripter wrapper and the dual-runtime constraint are dropped.
- **Coverage check.** `check_coverage.mjs` expands the Contract and compares `Prop=Value` labels with the readback `variantProperties`. Scope is `complete` when omit is empty. It adds the base-loop per-variant value diff on a sample.

## Retired (hard cut, no `expected.json` stopgap)

| Today | Fate |
|---|---|
| `selection-manifest.json` | replaced by the omit patch applied to the Contract |
| `<Family>.expected.json` | absorbed into the Contract (`axes`, `excluded`) |
| layout / token plan files | absorbed into the Contract (`anatomy`, `layout`, `paint`) |
| `references/sheet-contract.md` | matrix and plan rules → `contract/references/adapter-guide.md`; catalog and render rules stay in To-preview |
| `references/source-adapters.md` | generic part → adapter guide; Coinbase CDS part dropped |
| `code-to-canvas/references/component-sheet.md` | its mapping table is encoded in Contract `properties`; checker notes move to `check_coverage.mjs` |
| `code-to-canvas/references/layout-and-token-mapping.md` | CSS → layout half → adapter guide; naming and modes half superseded by #9 / #19 |
| `figma-workflow.md`: AI generates the core per run | replaced by the fixed `assets/builder-core.js` |
| `check_coverage.py`, `--selection`, `themeId`, `specimenId` | replaced by `check_coverage.mjs` on the Contract |
| `expand_contract.py` | retired once `contract.mjs` exists |
| match/resolve copies in `expand_contract.py`, `loop.mjs`, `derive_foundations.py` | one copy in `contract.mjs` |
| `agents/openai.yaml` (both skills) | dropped (Claude Code only) |
| ledger at `.scratch/code-to-canvas/` (#19) | `.scratch/to-design/<fileKey>.ledger.json` |
