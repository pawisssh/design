# Can a packaged builder reach `use_figma` without the agent re-typing it?

Follow-up to [`figma-mcp-batch-builder.md`](https://github.com/pawisssh/design/blob/research/figma-mcp-batch-builder/docs/research/figma-mcp-batch-builder.md) and the builder-core smoke test (`origin/task/builder-core-smoke-test`, `docs/smoke-test/builder-core/`). Vocabulary follows `GLOSSARY.md` (Contract, Component Set, Component Family).

Researched 2026-10-16. Figma's first-party skill repo is cited at a pinned commit, [`figma/mcp-server-guide@f278942`](https://github.com/figma/mcp-server-guide/tree/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5). Claude Code docs are cited as they read on the research date.

**What was run.** Three canvas-free `use_figma` probes on the smoke-test draft file (`Alpt8YsrzDVu6DnwsrF26h`). No nodes were created or changed.

- **Probe A** checked the runtime globals.
- **Probe B** wrote `sharedPluginData` on `figma.root` and tried `clientStorage` and `setPluginData`.
- **Probe C** ran in a fresh call. It read the data back, executed stored code through `new Function`, and cleared the probe keys. Afterwards `getSharedPluginDataKeys('pkgprobe')` returned `[]`.

Nothing else was executed. No Claude Code hook was installed or tested. Claims marked *inferred* are reasoning, not documented or observed fact.

## Problem

The pipeline packages a fixed core and an embedded JSON build plan into `build-components.mcp.js`, using `skills/code-to-canvas/scripts/package_native_builder.py`. The agent then has to put that text into `use_figma`'s `code` argument. The tool's input schema is `{fileKey, code (string, maxLength 50000), description (≤2000), skillNames}`. It has no file, URL or resource parameter.

So today the package passes through model output. In the smoke test, 2 of 4 calls were not the packaged file. Calls 1 and 4 were trimmed or rewritten by hand, and call 4 "still carried the original package hash header" (`results.json` → `calls[0].note`, `calls[3].note`, `integrity`). Nothing at runtime noticed.

## Answer

1. **Yes, there is a way to skip re-emission.** A Claude Code `PreToolUse` hook can replace a tool call's arguments before it runs (`updatedInput`), and MCP tools go through the same hook events. The agent sends a short stub naming the package and its hash. The hook reads the file from disk, verifies it and swaps it into `code`.
   - This is documented, but untested for `use_figma` specifically.
   - Every other route either still passes the bytes through the model or is not available. This covers Figma-side storage, fetching, MCP resources, `@`-mentions and a direct HTTP client.
2. **As defense in depth, the core verifies its plan before any mutation.** It checks three things: the embedded plan text length, the entry count, and an FNV-1a-32 hash. `crypto` is undefined in the `use_figma` runtime (probed). On mismatch, the script returns a short error and has created nothing.
3. **Yes, compact the per-variant encoding, but only inside the package.** The core never reads `specimenId`, `themeId`, or per-entry `familyId`. Dropping them and writing axis values as tuples takes an entry from 155 chars to about 30. The 20 KB output cap binds next, at about 410 variants, so the returned ledger has to be compacted too. The approved selection manifest stays canonical and readable.

## Findings

### 1. Delivery routes

| Route | Works? | Evidence |
|---|---|---|
| File, URL or resource parameter on `use_figma` | **No** | Schema has only `fileKey`, `code`, `description`, `skillNames` (tool definition as served to this session). Figma: "Getting design context and code from files is link-based" ([Remote server installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)), i.e. Figma file links, not script files. |
| `get_figma_skill` | **No** | Reads `skill://` URIs only. "You MUST NOT use this for any other resource" (tool description). It returns text to the model and cannot feed `use_figma`. |
| `upload_assets` | **No** | "Supports PNG, JPG, GIF, WebP, and SVG". Uploads become image fills or vector nodes, not executable code (tool description). |
| `fetch` / network load inside `use_figma` | **No** | Probe: `typeof fetch === "undefined"` and `typeof XMLHttpRequest === "undefined"`. Figma: "`use_figma` has no network access" ([api-reference.md L266](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/references/api-reference.md#L266)). The regular plugin sandbox also "does not expose browser APIs" ([How plugins run](https://developers.figma.com/docs/plugins/how-plugins-run/)). `networkAccess` is a manifest key for real plugins ([Making network requests](https://developers.figma.com/docs/plugins/making-network-requests/)), and `use_figma` code has no manifest. |
| `eval` / `new Function` inside `use_figma` | **Yes (observed, undocumented)** | Probe: `typeof eval === "function"`, `new Function('return 1')()` → `1`, indirect `(0,eval)('1+1')` → `2`. No Figma doc mentions either. |
| `figma.clientStorage` across calls | **No** | Probe: the object exists, but `setAsync` and `getAsync` throw `"... is not a supported API"`. Figma: "UI, client storage, … are not available through `use_figma`" ([plugin-api-standalone.index.md L102](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/references/plugin-api-standalone.index.md#L102)). |
| `setPluginData` (private) | **No** | Probe throws: "figma.setPluginData is not supported in this host runtime (only private plugins on web can use it). Use figma.setSharedPluginData…". This matches the tool description's "MUST NEVER use … setPluginData". |
| `figma.root.setSharedPluginData` across calls | **Yes (observed)** | Probe B wrote a 60,000-char value and Probe C (a separate call) read back 60,000. Docs: an entry (namespace + key + value) "cannot exceed 100 kB", and the data "will be readable by any plugin" ([setSharedPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/)). |
| Stored core, run through `new Function` | **Yes (observed)** | Probe C stored an `async function core(figma, plan)` source in `sharedPluginData`, rebuilt it with `new Function(...)()` and awaited it: `{pages: 2, n: 7}`. |
| JS globals reused across calls | **No** | Probe A set `globalThis.__pkgProbe`. Probes B and C read `null`, so each call gets a fresh realm, which agrees with "No state persists across `use_figma` calls" ([figma-use SKILL.md L43](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-use/SKILL.md#L43)). |
| Claude Code `PreToolUse` hook with `updatedInput` | **Yes (documented, untested here)** | See below. |
| `@`-mention of an MCP resource | **No** | "Resources are automatically fetched and included as attachments when referenced" ([Claude Code MCP: Use MCP resources](https://code.claude.com/docs/en/mcp#use-mcp-resources)). That adds them to model context, not to a tool argument. In MCP, `tools/call` carries an `arguments` object defined by the tool's `inputSchema`, and resource links appear only in *results* ([MCP spec: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)). |
| `mcp_tool` hook calling `use_figma` itself | **No** | `input` "String values support `${path}` substitution from the hook's JSON input" ([Hooks: MCP tool hook fields](https://code.claude.com/docs/en/hooks#mcp-tool-hook-fields)). It can't read a file, so the code would still have to come from somewhere. |
| Own script calling `https://mcp.figma.com/mcp` directly | **No (not supported)** | "Only clients listed in the Figma MCP catalog" can connect ([Remote server installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)). A Figma staff forum post says the check is a `client_name` allowlist at dynamic client registration ([forum thread](https://forum.figma.com/report-a-problem-6/figma-s-approach-breaks-the-core-promise-of-mcp-52507), secondary source). Getting in means impersonating an allowed client, which is unendorsed. Not recommended. |
| Figma "generative plugin" (stored plugin code) | **Not a fit** | The source is stored in the account, but it is authored by sending full `code.ts` content through `update_generative_plugin`, so it still goes through the model. A human runs it from its UI in the editor ([figma-generative-plugins SKILL.md](https://github.com/figma/mcp-server-guide/blob/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5/skills/figma-generative-plugins/SKILL.md)). It could be a manual fallback but cannot deliver code into `use_figma`. |

#### The hook route

What Claude Code documents:

- `updatedInput` "directly under `hookSpecificOutput` replaces a tool's arguments before it runs." It "Replaces the entire input object, so include unchanged fields alongside modified ones." It combines with `"allow"` to auto-approve or `"ask"` to show the modified input ([Hooks: PreToolUse decision control](https://code.claude.com/docs/en/hooks#pretooluse-decision-control)).
- "MCP server tools appear as regular tools in tool events (`PreToolUse`, …)" and are named `mcp__<server>__<tool>`. The matcher needs a regex such as `mcp__.*__use_figma`, because a bare prefix "is compared as an exact string" ([Hooks: matchers](https://code.claude.com/docs/en/hooks)).
- **Failure default is unsafe.** A hook that errors, times out or can't start is a *non-blocking* error, and "the action goes ahead". Set `onFailure: "block"` (Claude Code v2.1.295+) ([Hooks: exit code output](https://code.claude.com/docs/en/hooks#exit-code-output)).
- Deny and ask rules are still evaluated "against the input your hook returns, not the input Claude sent".

Proposed shape (*inferred*):

1. **The agent sends a stub** that fails closed on its own:
   ```js
   /*@package skills-out/gen-c100/build-components.mcp.js sha256=<fileSha256>*/
   throw new Error("package not injected");
   ```
   If the hook is missing or skipped, Figma runs the stub, which throws before any mutation.
2. **The hook** (`PreToolUse`, matcher `mcp__.*__use_figma`, `onFailure: "block"`) does the following:
   - If the code has no `@package` marker, it outputs nothing, so ad-hoc `use_figma` calls are untouched.
   - Otherwise it reads the file and checks its sha256 against both the marker and `script-package.json`. It also checks the file length is ≤ 50,000.
   - It returns `updatedInput` = `{fileKey, description, skillNames?, code: <file text>}` with `permissionDecision: "ask"` (or `"allow"` once trusted).
   - On any mismatch it exits 2 with a one-line reason, which Claude sees.
3. **The transcript then shows the stub, not 24K chars of package.** This is also an input-token saving, because the model never emits the package. The package's text is still bounded by the server's 50K `maxLength`.

Not verified:

- That `updatedInput` takes effect for a *remote HTTP* MCP tool in practice. The docs make no exception, but this was not tested.
- That the server re-validates `maxLength` on the substituted input. It should, given that "Servers MUST: Validate all tool inputs" ([MCP spec: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)).
- Whether Figma marks `use_figma` with `_meta["anthropic/requiresUserInteraction"]`. If it does, a hook "can't skip its approval prompt with `"allow"`" ([Hooks](https://code.claude.com/docs/en/hooks#allow-with-updatedinput)). That costs a click, not correctness.
- That the hook fires the same way in the Desktop app and cloud sessions. The docs say it does: "Claude Code fires the same hook events wherever it runs".

#### The stored-core route (secondary)

Probes B and C show a core can be stored once per file in `figma.root` `sharedPluginData` and run later with `new Function`. Each call then carries only a loader of about 300 chars plus the plan. This frees about 5.8K chars per call today, and more as the core grows.

It does **not** remove re-emission:

- Storing the core is itself one `use_figma` call with the core in `code`.
- The plan is still emitted on every call.

It adds two risks:

- **`eval` and `new Function` are undocumented** in `use_figma` and could be withdrawn.
- **Shared plugin data is "readable by any plugin"**, and *inferred*, writable by any code that knows the namespace. A stored core must therefore be hash-checked before it is executed.

Use it only if the real core grows past roughly 25K chars and the code cap starts to bind before the output cap.

### 2. Startup integrity check

Hashing:

- **SHA-256 is not available.** Probe: `typeof crypto === "undefined"`; `crypto.subtle.digest` → "'crypto' is not defined". `TextEncoder` is also undefined. `Math.imul` exists.
- **Hash the embedded text, not a re-serialization.** The packager writes `json.dumps(plan, ensure_ascii=True, sort_keys=True)`, which uses `", "` and `": "` separators. JS `JSON.stringify` uses none and puts integer-like keys first. A hash of a JS re-serialization would never match Python's.

Proposed package layout (*inferred*):

```js
// Native build package: <identity>
<core>
const PLAN_SRC = String.raw`<plan json text>`;
const PLAN_CHECK = { len: 16256, entries: 100, fnv1a32: "1cad0a0f" };
const BUILD_STATE = {...};
return await buildComponentSets(figma, PLAN_SRC, PLAN_CHECK, BUILD_STATE);
```

Why it is built this way:

- **`String.raw` adds no escaping.** Every JSON escape (`\"`, `\uXXXX`) stays literal text that `JSON.parse` understands. The packager must reject plan text containing a backtick or `${`.
- **`ensure_ascii=True` makes every char code a single byte.** So JS `charCodeAt` over `PLAN_SRC` and a Python loop over the same string produce the same FNV-1a-32 hash with no UTF-8 encoder. Python over the smoke `plan-c100.json` encoding gives len 16,256 and FNV-1a-32 `0x1cad0a0f`.
- **The core runs four checks first, before any `figma.*` write, `loadFontAsync` or `setCurrentPageAsync`:**
  1. `PLAN_SRC.length === len`.
  2. `fnv1a32(PLAN_SRC) === fnv1a32` (about 10 lines; 16K chars is negligible time).
  3. `JSON.parse` succeeds.
  4. `entries.length === entries`.
- **Optionally also hash the core's own source.** `buildComponentSets.toString()` returned the exact source text in the probe (`fnToString`). An FNV over it catches a hand-edited core.
- **On failure, return without throwing:**
  ```js
  return { error: "package-mismatch", field: "fnv1a32", expected: "1cad0a0f", got: "…" };
  ```
  Returning keeps the message well under the 20 KB cap, and nothing was mutated, so the call is safe to retry.

Failure mode: a drifted call returns about 100 bytes, creates nothing, and the agent re-sends. Through the hook that means re-running the stub. FNV-1a-32 detects accidental drift (dropped rows, trimmed entries, re-typed values). It is not a defense against an adversary; the hook's sha256 covers that on the local side.

### 3. Compact per-variant encoding

Measured on `plan-c100.json` as packaged (`sort_keys`, default separators): 100 entries take 15,540 chars, **155.4 chars/entry**. The fixed part of the c100 package is 8,058 chars (5,813 core + 1,330 state + plan header + wrapper). One entry:

```json
{"familyId": "button", "properties": {"kind": "primary", "size": "sm", "state": "default"}, "specimenId": "button:primary:sm:default", "themeId": "white"}
```

Which per-entry fields the core actually needs:

| Field | Used by core? | Derivable? |
|---|---|---|
| `familyId` | Yes, to filter by family | Yes. Group entries under their family instead of repeating it on each one. |
| `properties` | Yes | No. This is the tuple. |
| `specimenId` | **No** | Here yes (`family:kind:size:state` for all 100). Not in general: it is the source specimen's ID, which `check_coverage.py` matches against independent source rows. |
| `themeId` | **No** | Not in general. Several source specimens across themes can dedupe to one native tuple plus a mode (`figma-workflow.md` L15). In this plan it is the constant `"white"`. |

Encodings (chars/entry measured on the 100 entries; capacity from `(50000 − fixed) / perEntry`):

| Encoding | Example row | chars/entry | Variants/call by code cap, 5.8K core | Same, 15K core (*inferred*) |
|---|---|---|---|---|
| Today | as above | 155.4 | ~270 | ~210 |
| Properties only, grouped by family | `{"kind": "primary", "size": "sm", "state": "default"}` | 54.7 | ~770 | ~600 |
| Value tuples, axis order in family | `["primary", "sm", "default"]` | 29.7 | ~1,410 | ~1,100 |
| Index tuples into per-axis value lists | `[0, 0, 0]` | 11.0 (8.0 with compact separators) | ~3,800 | ~3,000 |

The *15K core* column assumes the real core (icons, booleans, `INSTANCE_SWAP`, structure rules) adds about 9K chars.

**The other caps bind first.** The smoke test measured output at about 1,400 B + 46.5 B per variant, and the 20,480 B cap is a hard error that rolls back the whole call (`results.json` → `probes.outputCap`). That limits a call to **about 410 variants** whatever the code encoding, because the return value is a name-keyed map `"kind=primary, size=sm, state=default": "6:123"`.

- Returning variant IDs as an array in tuple order (about 8–10 B each) moves the output cap to about 2,000 variants.
- Time then becomes the limit: 22 ms per variant, with 90 s OK and 180 s losing the connection (`probes`). 2,000 variants is roughly 45 s (*inferred* linear).

Trade-off:

- **Value tuples** keep the package readable. A reviewer can still see `["danger","2xl","disabled"]`. They cover every plausible Component Family in one call once the ledger output is compacted.
- **Index tuples** only add capacity that the output and time caps don't allow. They also make a hand-edit drift impossible to spot by eye; the hash catches it anyway.
- **The audit fields stay canonical.** `specimenId` and `themeId` remain in the approved selection manifest on disk, which `check_coverage.py` reads. The package is a derived encoding, and the packager asserts `decode(compact) == selection` tuples before writing.

## Recommendation

1. **Adopt the `PreToolUse` hook as the delivery path.** The agent emits a fail-closed stub with `@package <path> sha256=<hash>`, and the hook substitutes the verified file with `onFailure: "block"`. This removes the observed drift at its source: the model never re-types the package.
2. **Keep an in-script integrity check anyway.** Embed the plan as `String.raw` text and check length, entry count and FNV-1a-32 before the first mutation. On mismatch, return `{error:"package-mismatch",…}`. This catches a bypassed or misconfigured hook and any manual run.
3. **Switch the package's selection encoding to value tuples grouped by family**, about 30 chars/entry, and keep the manifest canonical. **Compact the returned ledger** to tuple-ordered ID arrays at the same time, because otherwise output (about 410 variants) still binds before code.
4. **Don't build the stored-core-in-`sharedPluginData` path now.** It relies on undocumented `eval`, the stored data is publicly readable, and it doesn't remove re-emission. Revisit only if the real core exceeds about 25K chars.
5. **Do not build a direct MCP HTTP client.** It is catalog-gated, and getting in means impersonating an allowed client.

## Newly specifiable work

- Write a `PreToolUse` hook script (matcher `mcp__.*__use_figma`, `onFailure: "block"`) that replaces an `@package <path> sha256=<hash>` stub with the verified package file via `updatedInput`, and passes un-marked calls through untouched.
- Have `package_native_builder.py` record `fileSha256` of `build-components.mcp.js` in `script-package.json` and print the ready-to-send stub, so the hook can verify the exact file bytes rather than only `inputHash`.
- Run a live check that `updatedInput` substitution reaches the remote `use_figma` server: a stub plus a 24K-char package on the smoke file, with the run confirmed from the returned `PLAN_CHECK`.
- Change the packager to embed the plan as `const PLAN_SRC = String.raw\`…\`` with `PLAN_CHECK {len, entries, fnv1a32}`, and to reject plan text containing a backtick or `${`.
- Add a pre-mutation integrity gate to the builder core (length, FNV-1a-32 and entry count, optionally an FNV of `buildComponentSets.toString()`) that returns `{error:"package-mismatch", field, expected, got}` and touches nothing.
- Define a compact package selection encoding (entries grouped by family as axis-ordered value tuples) and have the packager assert that it decodes back to the approved selection's tuples.
- Change the core's return value to tuple-ordered variant ID arrays per Component Set, so the 20 KB output cap allows about 2,000 variants instead of about 410.
- Re-measure the time slope on a ≥500-variant set to confirm the about 22 ms/variant linear estimate and set a safe per-call variant ceiling below the about 90–180 s connection limit.
- Check whether the Figma server's `use_figma` `tools/list` entry carries `anthropic/requiresUserInteraction`, which decides whether the hook can use `"allow"` or must use `"ask"`.

## Open uncertainties

1. **`eval` and `new Function` are undocumented** in `use_figma`. They work today (probed) but could be removed. Only the secondary stored-core route depends on them.
2. **`updatedInput` on a remote MCP tool** is documented in general but not tested here.
3. **Whether `sharedPluginData` written by `use_figma` code is writable by other plugins** is *inferred* from the docs' "readable by any plugin" plus the namespace model. It was not tested.
4. **FNV-1a-32 is a drift check, not a tamper check.** The 2^-32 accidental collision rate is acceptable for that purpose.
5. **The output-per-variant and time slopes** come from one 100-variant run of a minimal core. A real core's per-variant output and time will differ.

## Sources

- Figma developer docs:
  - [Remote server installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
  - [How plugins run](https://developers.figma.com/docs/plugins/how-plugins-run/)
  - [Making network requests](https://developers.figma.com/docs/plugins/making-network-requests/)
  - [setSharedPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/)
- Figma first-party skills: [figma/mcp-server-guide @ f278942](https://github.com/figma/mcp-server-guide/tree/f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5)
  - `skills/figma-use/SKILL.md` L43
  - `skills/figma-use/references/api-reference.md` L266, L348–L357
  - `skills/figma-use/references/plugin-api-standalone.index.md` L88, L102
  - `skills/figma-generative-plugins/SKILL.md`
- Figma MCP tool definitions as served to Claude Code: `use_figma`, `get_figma_skill`, `upload_assets`.
- Claude Code docs:
  - [Hooks](https://code.claude.com/docs/en/hooks): PreToolUse decision control, matchers, MCP tool hook fields, `onFailure`
  - [MCP](https://code.claude.com/docs/en/mcp): Use MCP resources, `anthropic/requiresUserInteraction`
- MCP spec: [Tools (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- Secondary: [Figma forum: client_name allowlist](https://forum.figma.com/report-a-problem-6/figma-s-approach-breaks-the-core-promise-of-mcp-52507)
- This repo:
  - `skills/code-to-canvas/scripts/package_native_builder.py`
  - `skills/code-to-canvas/scripts/check_coverage.py`
  - `skills/code-to-canvas/references/figma-workflow.md`
  - `origin/task/builder-core-smoke-test:docs/smoke-test/builder-core/`: `results.json`, `plan-c100.json`, `gen-c100/build-components.mcp.js`, `native-builder-core.js`
