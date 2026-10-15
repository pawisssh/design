# Can Figma MCP run a fixed builder core with a JSON payload in one call?

Research for [pawisssh/design#3](https://github.com/pawisssh/design/issues/3). Map: [#1](https://github.com/pawisssh/design/issues/1). Vocabulary follows `GLOSSARY.md` (Contract, Component Set, Component Family, Code Library).

Researched 2026-10-16. Figma's first-party skill repo is cited at a pinned commit, [`figma/mcp-server-guide@f278942`](https://github.com/figma/mcp-server-guide/tree/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5) (2026-10-15). Docs pages are cited as they read on the research date.

**Nothing here was run against Figma.** No Figma MCP tools were connected in the research session. Every claim comes from documentation. Claims marked *inferred* are reasoning, not documented fact.

## Answer

**Conditional yes.** The remote Figma MCP server's `use_figma` tool runs arbitrary Plugin API JavaScript in a file. A fixed builder core with the Contract embedded as a JS literal can build Component Sets in batch, which is how `package_native_builder.py` already packages `build-components.mcp.js`. The Professional plan is supported, with a Full seat.

The limits that matter:

- **Output:** 20 KB per call.
- **Execution time limit:** it exists, but its length is not documented.
- **Code size:** no documented limit.
- **Feature status:** beta.

So "one call for the whole Contract" is not guaranteed for a large Component Family. The safe design is one fixed core that can also run on slices of the plan:

- one call for the variables and foundations;
- then one or more calls for the Component Sets;
- every call idempotent through the ledger.

The agent still never builds components one at a time. A Figma plugin fallback is not needed on the evidence so far.

## Findings

### 1. `use_figma` executes arbitrary Plugin API JavaScript

- `use_figma` is "the general-purpose tool for writing to Figma files". It creates, edits, deletes and inspects pages, frames, components, variants, variables and styles ([Tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)).
- "Write to canvas works by letting your client execute JavaScript in the context of a Figma file through the Plugin API" ([Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)).
- The code runs as plain JavaScript with top-level `await` and `return`. It is "automatically wrapped in an async context". The returned value is JSON-serialized, and `console.log()` is not returned ([figma-use SKILL.md L24–L29](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L24-L29)).
- `use_figma` accepts code only, never a file path. The JSON Contract therefore has to be embedded in the code string. The parameter names (`code`, and the logging-only `skillNames`) come from Figma's skill docs ([figma-use SKILL.md L11](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L11)), not from the public tools page, which lists no parameters.
- No state persists between `use_figma` calls. IDs from earlier calls must be passed back in as literals ([figma-use SKILL.md L43](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L43)). This matches embedding `BUILD_STATE` in the package.
- Figma's guidance allows large batches: "a complete section or page may be built in one call". It recommends splitting only at page-context boundaries, at mutations that are hard to recover, or after a real failure ([figma-use SKILL.md L30](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L30)).
- Each call resets to the first page. Switch with `await figma.setCurrentPageAsync()` at most once per call ([figma-use SKILL.md L34](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L34)).

**Fit with today's packager.** `package_native_builder.py` writes the core, then `const BUILD_PLAN = {...}` and `const BUILD_STATE = {...}`, then a top-level `return await buildComponentSets(figma, BUILD_PLAN, BUILD_STATE);`. That matches the auto-wrapped async context above (*inferred*: shape compatible; not executed). The existing rules in `skills/code-to-canvas/references/figma-workflow.md` also match the documented executor: no `showUI`, no fetch, no `closePlugin`, one page switch, and `upload_assets` for raster images.

### 2. Limits

| Limit | Value | Source |
|---|---|---|
| Output per call | 20 KB ("Each tool call can return up to 20 KB of output") | [MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs), [Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/) |
| Execution time | A time limit exists ("Script exceeded time limit"). Its length is not documented. Figma's fix is "create N/2 variants per call" and "at most 20–30 variables per call" | [error-recovery.md L285](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-generate-library/references/error-recovery.md#L285), [L318](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-generate-library/references/error-recovery.md#L318), [L331](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-generate-library/references/error-recovery.md#L331) |
| Code / payload size | Not documented in any Figma source found | — |
| Images | `use_figma` cannot add images. Use `upload_assets` first. `createImage`/`createImageAsync` are unsupported and there is no network access | [MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs), [api-reference.md L266](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/references/api-reference.md#L266) |
| Fonts | "Fonts must be uploaded to your Figma account". Locally installed fonts are not available | [MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs) |
| Error recovery | Errors carry `safeToRetryWithoutCanvasRead`. If it is `false`, read the canvas before retrying | [figma-use SKILL.md L42](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L42) |
| Quality | "Output is beta quality and may need manual review and cleanup". Test on a duplicate or draft file first | [MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs) |

What these limits mean for the design (*inferred*):

- **The 20 KB output cap conflicts with today's return contract.** `figma-workflow.md` says the script "must return counts, all created/updated IDs and authoritative ledger changes." A full Carbon Button matrix covers kinds × sizes × states, with icon and nested-instance IDs. With names included, that could exceed 20 KB.
  - Return a compact result instead: counts, plus a map from tuple key to ID. Fetch anything more with a follow-up read call.
  - Whether going over the cap truncates the output or raises an error is not documented.
- **The time limit decides whether a single call is enough.** The core should accept a slice of the plan, such as foundations only or one family's set, and resume through the ledger. That turns "split on timeout" into re-running the same core on a smaller slice, not writing new code.

### 3. Plugin API surface available

The Contract needs four groups of APIs. All are in the official Plugin API, and `use_figma` exposes them.

- **Component Sets:** `figma.createComponent`, `figma.combineAsVariants(nodes, parent, index?)` returns a `ComponentSetNode`, and `createNodeFromSvg` covers Carbon icons ([figma global](https://developers.figma.com/docs/plugins/api/figma/)).
- **Component properties:**
  - `addComponentProperty(name, type, default, options?)` takes `BOOLEAN`, `TEXT`, `INSTANCE_SWAP`, `VARIANT` (on the set) and `SLOT`.
  - Sublayers link to properties through `componentPropertyReferences`.
  - Renaming a property changes its ID ([Working with component properties](https://developers.figma.com/docs/plugins/working-with-component-properties/)).
- **Variables:**
  - Collections and modes: `createVariableCollection`, `createVariable`, `addMode`/`renameMode`, `setValueForMode`.
  - Binding: `setBoundVariable`, `setBoundVariableForPaint`, `setRangeBoundVariable`.
  - Extended collections are Enterprise-only ([Working with variables](https://developers.figma.com/docs/plugins/working-with-variables/)).
- **Auto Layout:** `layoutMode`, padding, gap and `layoutSizingHorizontal/Vertical` on frames and components.
  - `figma.createAutoLayout()` is an MCP-side helper. It appears in the figma-use skill and its bundled typings ([figma-use SKILL.md L38](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L38)), but not on the official [figma global](https://developers.figma.com/docs/plugins/api/figma/) page.
  - This confirms the current workflow rule that the shared core must not require `createAutoLayout`.

Not available in `use_figma`:

- `figma.notify` throws an error.
- `showUI` and `openExternal` do nothing.
- `loadAllPagesAsync`, `teamLibrary.*` and `extendLibraryCollectionByKeyAsync` are not implemented.
- There is no `getLocalComponents*` ([api-reference.md L348–L357](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/references/api-reference.md#L348-L357)).

### 4. Plans, seats and servers

- **Plans:** "Writing to the canvas is available on Professional, Education, Organization, and Enterprise plans." Starter is not on that list ([Get started with the Figma MCP server](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)).
- **Seats:**
  - "You need a Full seat to write to files outside your drafts."
  - With a Dev seat you can write only in your drafts; other files are read-only.
  - Editing an existing file also needs edit permission on it ([MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs), [Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)).
- **Server:**
  - "`use_figma` is only available on the remote server" (`https://mcp.figma.com/mcp`), with a client that supports writing ([MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs); remote-only marker on [Tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)).
  - The desktop server "doesn't support writing to the canvas" ([Get started](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)).
  - Claude Code is a supported client ([Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)).
  - Other write tools on the remote server: `upload_assets`, `create_new_file`, `generate_figma_design` and others ([Tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)).
- **Pricing:** "free during the beta period and will eventually become a usage-based paid feature" ([MCP FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs), [README L18](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/README.md#L18)).
- **Rate limits:**
  - Professional Full and Dev seats get up to 200 calls/day and 10/min for tools that read data ([Rate limits & access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)).
  - The README says write tools "are exempt from the rate limits" ([README L6](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/README.md#L6)). The rate-limits page names only `add_code_connect_map`, `create_new_file` and `whoami` as exempt, so whether `use_figma` is exempt is unclear.
  - The batch design needs only a few calls, so this does not matter in practice.
- **Variable modes on Professional:** "Up to 10 modes per collection" ([Compare Figma plans](https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features)).
  - Figma's own skill still says "Professional=4" ([error-recovery.md L308](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-generate-library/references/error-recovery.md#L308)). That figure is stale; the plans page is authoritative.
  - Either limit covers the map's requirement of at least 2 modes. All four Carbon themes (White, G10, G90, G100) also fit.

## Open uncertainties

1. **Code and payload size limit for `use_figma`:** undocumented. Measure it.
2. **Execution time limit:** its length is undocumented. Measure it, and design the core to run on slices of the plan.
3. **Over 20 KB output:** whether it truncates or raises an error is undocumented.
4. **Which runtime surface Claude Code gets.** Figma ships two skill trees.
   - `skills-figquery/figma-use` says the `figma.create*` methods "do not exist in this environment" and requires the `$fig` builder ([L19](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills-figquery/figma-use/SKILL.md#L19)).
   - The README for that tree says only Cursor reads it, and "Only the guidance content differs" ([skills-figquery/README.md L3, L14](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills-figquery/README.md#L3)).
   - Claude Code reads `skills/`, which uses the raw `figma.createComponent` API.
   - The runtime may vary by client or by a feature flag. The core should check at startup that `figma.createComponent` and `figma.combineAsVariants` exist, and fail fast if they do not.
5. **The owner's seat type:** a Full seat is needed for non-draft files. Confirm it.
6. **Fonts:** check that IBM Plex Sans is available to the account with `figma.listAvailableFontsAsync()` before building.
7. **Beta:** behavior and limits may change, and the feature will become usage-priced.

## Recommended next step

Before [#7](https://github.com/pawisssh/design/issues/7), run a smoke test on a draft file:

1. Package a realistic Carbon Button plan and record the `build-components.mcp.js` byte size.
2. Submit it once through `use_figma`.
3. Record the elapsed time, whether it hits the time limit, and the size of the returned output.
4. If it hits the time limit, re-run the same core on foundations first and then the Component Set. Record where the split point falls.

## Sources

- Figma developer docs:
  - [Tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
  - [Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)
  - [Rate limits & access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)
  - [Desktop server setup](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)
- Figma Plugin API:
  - [figma global](https://developers.figma.com/docs/plugins/api/figma/)
  - [Working with variables](https://developers.figma.com/docs/plugins/working-with-variables/)
  - [Working with component properties](https://developers.figma.com/docs/plugins/working-with-component-properties/)
- Figma Help Center:
  - [Get started with the Figma MCP server](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)
  - [Figma MCP server FAQs](https://help.figma.com/hc/en-us/articles/39252411778583-Figma-MCP-server-FAQs)
  - [Compare Figma plans and features](https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features)
- Figma first-party skills: [figma/mcp-server-guide @ f278942](https://github.com/figma/mcp-server-guide/tree/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5)
  - `skills/figma-use/SKILL.md`
  - `skills/figma-use/references/api-reference.md`
  - `skills/figma-generate-library/references/error-recovery.md`
  - `skills-figquery/`
  - `README.md`
- This repo:
  - `skills/code-to-canvas/scripts/package_native_builder.py`
  - `skills/code-to-canvas/references/figma-workflow.md`
