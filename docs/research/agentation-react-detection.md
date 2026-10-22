# How does Agentation's React detection work, and what could To-preview and path A borrow from it?

Research for the owner's question of 2026-10-22. There is no issue for it, and no issue in `pawisssh/design` mentions Agentation (`gh search issues agentation` returns none). Related: [#62](https://github.com/pawisssh/design/issues/62) and [#84](https://github.com/pawisssh/design/issues/84) (To-handoff's static and runtime readers, and the source link), [#212](https://github.com/pawisssh/design/issues/212) and [#218](https://github.com/pawisssh/design/issues/218) (runtime styles), [#249](https://github.com/pawisssh/design/issues/249), [#257](https://github.com/pawisssh/design/issues/257), [#261](https://github.com/pawisssh/design/issues/261) and [#262](https://github.com/pawisssh/design/issues/262) (path A, the Family map and the Families tab). Vocabulary follows `GLOSSARY.md`.

Researched 2026-10-22. The repo side is read at commit `907614b`:

- `GLOSSARY.md`, `docs/adr/` (titles; 0015, 0016 and 0017 in full);
- `skills/to-preview/` (`SKILL.md`, `references/interactive-template.md`, `scripts/catalog.mjs`);
- `skills/adapter-generic/` (`SKILL.md`, `scripts/preview.mjs`, and the headers of `scripts/components.mjs` and `scripts/drafts.mjs`);
- `skills/vibe-to-figma/` (`SKILL.md`, `scripts/path.mjs`, `scripts/used.mjs`, `scripts/extract.mjs` in part, and `test/fixtures/path-a-app`);
- `skills/to-handoff/` (`SKILL.md`, `scripts/react.mjs` header and L331–400, `scripts/runtime.mjs`, `scripts/tag.mjs`, `scripts/generate.mjs` L174–179);
- issue #84's resolution comment.

Agentation was read from its published packages and its repository. Both npm tarballs were unpacked in a scratch folder and read, never run. Line numbers below are those of the TypeScript sources embedded in the npm package's sourcemap (`dist/index.mjs.map`). For `react-detection.ts` and `source-location.ts`, those sources are byte-identical to the repository's `package/src/utils/` at the commit below.

## Answer

1. **React detection names the components above a clicked element; it does not locate source.** From the DOM node, it reads React's `__reactFiber$<random>` property and walks `fiber.return` up to 30 fibers. It keeps at most 6 component names, drops minified names and framework wrappers by name lists, and prints them outermost first, as `<App> <Layout> <Button>`. The toolbar turns it on only when `process.env.NODE_ENV === "development"`, because production names are minified.
2. **Source location (`path:line:col`) is a separate mechanism, and on React 19 it rests on one trick.** React 19 removed `_debugSource` ([PR #28265](https://github.com/facebook/react/pull/28265)), and Agentation does not read its replacement, `_debugStack`. So on React 19 it swaps React's hooks dispatcher for one that throws, calls the component function with `{}` outside React's render, and parses the error stack. *Inference from the code:* this finds the line of the component's first hook call, not the usage site. By its own tests, it returns nothing for files bundled into production chunks.
3. **The rest of the product** is a toolbar for leaving element-pinned feedback. The feedback goes out as Markdown (copy and paste, in four detail levels) or as JSON through a local MCP and HTTP server, with intent, severity, status and threads. The licence file is named PolyForm Shield 1.0.0, but its body is a short three-condition text, not the canonical 17-section PolyForm text it links to. None of the ideas below copies its code.
4. **Most of what React detection offers, we already have, and ours is sturdier.**
   - To-handoff's runtime reader rewrites a scratch copy so every JSX element carries `data-handoff-at="file:line:col"` chains. It falls back to a fiber walk that reads `memoizedProps`, not names.
   - It was measured at 36/36 and 35/35 labelled usages on React 19 Next and Vite production builds (#84).
   - What is missing is wiring, not mechanism. To-preview cards are static `renderToStaticMarkup` HTML with no fibers. Vibe-to-Figma's path A is static only by ADR 0016.
5. **Ranked by the goal** (which vibe-coded projects reach Figma Component Sets or a Handoff), see [3. Ideas to borrow](#3-ideas-to-borrow). Ideas 2 and 3 change To-preview itself. Ideas 1 and 4 work upstream, in path A's extraction and the Families tab, and change which Component Families reach To-preview:

   | Rank | Idea | Verdict |
   | --- | --- | --- |
   | 1 | Runtime evidence for path A: read each rendered element's classes and site, and fill in the sites static extraction skips | Try as a prototype, then an ADR 0016 amendment for the owner |
   | 2 | "Used by the screens" marks on To-preview cards, from the literal props To-handoff's static reader already reads | Try as a prototype, static first |
   | 3 | Computed styles of To-preview specimens checked against the Contract, before a Figma build | Try as a prototype |
   | 4 | "Where in the app" on the Families tab: each site boxed on a screenshot, and click an element to see its family | Try as a prototype, with idea 1 (one runtime run) |
   | — | Owner notes pinned to a card or a site; identifying attributes as names; DOM → source on To-preview cards; component-name paths and smart filtering; the source probe; MCP server, watch loop and webhooks; Layout mode | Skip |

## Sources

- `AG-SITE` = https://www.agentation.com, read live (WebFetch gives a paraphrase) and from its source in `AG-REPO` `package/example/src/app/*/page.tsx`: features (`/features#react-detection`), output (`/output`), install, FAQ, changelog.
- `AG-REPO` = https://github.com/benjitaylor/agentation at commit `0e3236eb1a0f5577852ab7bb5121f5dd46d42f1d` (2026-09-22).
- `AG-NPM` = `agentation@3.1.2` (published 2026-09-22), https://registry.npmjs.org/agentation/-/agentation-3.1.2.tgz. Source paths `src/...` come from `dist/index.mjs.map`.
- `AG-MCP` = `agentation-mcp@1.3.2`, https://registry.npmjs.org/agentation-mcp/-/agentation-mcp-1.3.2.tgz, and `AG-REPO` `mcp/src/server/mcp.ts` and `mcp/README.md`.
- `AG-LICENSE` = `AG-REPO` `LICENSE`, byte-identical to the npm tarball's `LICENSE`.
- `POLYFORM` = https://polyformproject.org/licenses/shield/1.0.0 (read through WebFetch, which returns a paraphrase).
- `REACT` = https://github.com/facebook/react at tag `v19.2.0`.
- `REACT-28265` = https://github.com/facebook/react/pull/28265, "Remove __self and __source location from elements", merged 2024-02-07.

## 1. How Agentation works

### 1.1 React detection, step by step

`AG-NPM` `src/utils/react-detection.ts` (704 lines) and `src/components/page-toolbar-css/index.tsx`:

1. **The gate.** The toolbar sets `isDevMode = process.env.NODE_ENV === "development"`. The effective React mode is the output level's mode only when `isDevMode && settings.reactEnabled`, else `"off"` (`index.tsx` L760–766). The mapping is compact → off, standard → filtered, detailed → smart, forensic → all (`OUTPUT_TO_REACT_MODE`, L235). `reactEnabled` defaults to true and the output level to standard (L213, L217).
2. **On click**, `identifyElementWithReact` calls `getReactComponentName` and puts the path in front of the element's human name (L137–166).
3. **The fiber.** `getFiberFromElement` finds the DOM node's own property whose key starts with `__reactFiber$` or `__reactInternalInstance$` (`react-detection.ts` L440–457). React DOM sets `__reactFiber$` plus a random suffix on every host node it creates, with no DEV guard (`REACT` `packages/react-dom-bindings/src/client/ReactDOMComponentTree.js` L41–50). So the fiber is reachable in production too. *Inference:* only the names are lost there, to minification.
4. **The walk.** It follows `fiber.return` up to `maxDepth` 30 and collects up to `maxComponents` 6 names (defaults at L221–222; the JSDoc above says 3 and 25), inside a try/catch (L619–704).
5. **Naming a fiber** goes by work tag (L466–585, with tag numbers from React's `ReactWorkTags.js`):
   - host, fragment, mode and profiler fibers give no name;
   - a ForwardRef gives its render function's name, a Memo its inner type's;
   - a resolved Lazy gives its result's name;
   - function and class components give `displayName`, else `name`.

   React 19.2 has no tag 2 (IndeterminateComponent), which Agentation still lists (`REACT` `packages/react-reconciler/src/ReactWorkTags.js` L44–73).
6. **Filtering.**
   - A name of 2 characters or fewer, or 3 lowercase characters, counts as minified and is dropped (L604–610).
   - Then the mode decides (L307–354):
     - **all** keeps every name;
     - **filtered** drops exact names (Fragment, Suspense, Routes, Outlet, HotReload, …; L75–90) and patterns (`/Boundary$/`, `/Provider$/`, `/Router$/`, Next App Router internals such as `/^Segment(ViewNode|Node)$/` and `/^Server(Root|Component|Render)/`, `/^With[A-Z]/`, `/Wrapper$/`, …; L97–117);
     - **smart** also keeps only names whose words match class names on the element's 10 nearest DOM ancestors (`SideNav` against `side-nav`, with CSS-module hashes stripped; L241–305), falling back to a list of common words (Page, Card, Button, Modal, …; L123–142).
7. **Output.** The names are reversed and joined, outermost first (L695–697): `<App> <Dashboard> <Button>` (the example in `AG-REPO` `package/src/types.ts` L23). Results are cached in a WeakMap in `all` mode only. Neither function is in the package's public exports (`AG-NPM` `dist/index.d.ts`).

### 1.2 Source location (`sourceFile`)

`AG-NPM` `src/utils/source-location.ts` (916 lines). `detectSourceFile` runs on every annotation and is **not** behind the dev gate (`index.tsx` L304–311). It tries `getSourceLocation`, then the same on up to 10 DOM ancestors (`findNearestComponentSource`, L792–815).

1. **`_debugSource`.** It walks `.return` up to 50 fibers for `_debugSource`, then `_debugOwner._debugSource` (L284–314). Then it tries other key names and `memoizedProps.__source` (L322–377).
2. **React 19 has none of these.** `REACT-28265` removed `__self`/`__source` and the fiber's `_debugSource`. It proposed that DevTools find a component's location lazily instead, at the cost of less exact lines. DEV fibers now carry `_debugOwner`, `_debugStack` (an `Error`) and `_debugTask` (`REACT` `packages/react-reconciler/src/ReactFiber.js` L197–208, set at L738–742; types in `ReactInternalTypes.js` L201–204). Agentation never reads `_debugStack`: the string does not occur in its sources.
3. **The probe, which is what works on React 19** (L585–642, walked up to 15 fibers at L648–664):
   - It takes the app's hooks dispatcher: `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H` on React 19, `ReactCurrentDispatcher.current` on 16–18 (L446–481). It reaches it through its own `import * as React from "react"`.
   - It replaces the dispatcher with a `Proxy` whose every property throws `Error("probe")` (L607–611).
   - It **calls the component function with `{}`** (L621), outside React's render.
   - A component that calls a hook throws, and the first stack frame that names the function and is not a library or bundle path is kept (L486–541). That excludes `node_modules`, `react-dom`, `/_next/static/chunks/`, `/.vite/deps/`, `/_astro/` and hashed `/assets/` files.
   - Bundler prefixes are stripped (`turbopack:///[project]/`, `webpack-internal:///./`, …; L546–579).
   - A component with no hook "runs to completion", and its result is discarded (the comment at L618–620).

   React does the same itself to build component stacks (`REACT` `packages/shared/ReactComponentStackFrame.js` L70–82).
4. **What the probe finds.**
   - *Inference from the code:* the frame is the line of the component's first hook call, inside its definition. It is not the JSX site that used the component. A hook-less component (most leaf UI) gives way to the nearest ancestor that has a hook.
   - Agentation's own tests expect `found: false` for production chunk paths (`AG-REPO` `package/src/utils/source-location.review.test.ts`).
   - Its README calls React metadata "best effort" and possibly unavailable in production builds (`AG-NPM` `README.md` L119).
   - The `sourceFile` field's comment still says it comes from `_debugSource` (`types.ts` L24), which React 19 no longer has.

### 1.3 The other features

From `AG-SITE` features and the toolbar source:

- **Annotation modes:** text selection, a single element, multi-select, an area, and freezing animations.
- **The toolbar:** pause, hide, copy, clear, send, settings, and **Layout mode**. Layout mode lets a reviewer place or rearrange 65+ component types as "spatial hints" (annotation `kind` `placement`/`rearrange`, `types.ts` L40).
- **Element identification:**
  - a human name ("button "Save"", "link …");
  - a 4-level CSS path (`element-identification.ts` L65–106, L127–249);
  - up to 16 identifying attributes (`data-testid`, `data-test`, `data-qa`, `data-cy`, `data-component`; `element-attributes.ts`).
- **Computed styles:**
  - a short list per element type (`getDetailedComputedStyles`, L481–521);
  - a "forensic" list of colour, type, box, layout, flex, opacity, overflow, shadow and transform properties (L523–563). The click handler always captures the forensic list (`index.tsx` L2057).
- **Fit:** Shadow DOM, same-origin iframes, a `portalContainer`. The site's limitations list says desktop only, local storage for 7 days, no screenshots, and React 18+ (`AG-REPO` `package/example/src/app/features/page.tsx` L172–181).
- **History** (`AG-SITE` changelog):
  - React component detection, MCP and the schema came in 2.0.0 (Feb 2026);
  - source-file detection in 2.3.0 (Mar 2026);
  - Layout mode in 3.0.0;
  - a React 19 import crash fix in 3.1.0 (Sep 2026).

### 1.4 What it hands an agent

- **Markdown**, from `generate-output.ts`. The header is `## Page Feedback: <pathname>` (L27–32). Then, per detail level:
  - compact gives one line per annotation, `1. **element** (source): comment` (from L65);
  - standard and detailed give a `### n. element` block with `**Location:**`, `**Source:**`, `**React:**` and `**Feedback:**` lines (L109–132);
  - detailed adds classes, position and context;
  - forensic adds an environment block, full DOM path, computed styles, accessibility and nearby elements (L48–57, L70–107).

  A copy format can also be just the source, the classes or one attribute (`copy-format.ts`).
- **JSON over MCP** (`AG-MCP`):
  - **Process:** one process runs an HTTP server on port 4747, which the toolbar posts to, plus a stdio MCP server. Annotations are stored in SQLite at `~/.agentation/store.db`, with SSE events and webhooks. It is loopback-only by default and needs Node 20+ (`mcp/README.md` L17, L53, L194–204).
  - **Tools:** list sessions, get pending, acknowledge, resolve with a summary, dismiss with a reason, reply, and `watch_annotations`, which blocks until a batch arrives (`mcp.ts` L133–253).
  - **Payload:** each annotation goes out as pretty-printed JSON text (L370). It carries id, kind, comment, element, path, URL, intent (`fix`/`change`/`question`/`approve`), severity, nearby text, `reactComponents`, `sourceFile`, attributes and frame. It **leaves out** computed styles, classes and the bounding box (`mapAnnotationForMcp`, L338).

### 1.5 Dev and production, React versions, frameworks

- **Dev only:** the component path (the gate above). The install page renders the toolbar only in development (`AG-SITE` install).
- **Either, in principle:** `sourceFile` is not gated. *Inference:* in practice it needs unbundled dev sources, given the probe's path filters and its tests.
- **React versions:**
  - the peer dependencies are `react`/`react-dom` `>=18`, optional (`AG-NPM` `package.json`);
  - the site says React 18+ only;
  - `source-location.ts`'s header claims 16.8–19 (L11–21).
- **Frameworks:** source detection is claimed for Vite, Next.js, Webpack and Turbopack (`AG-REPO` `package/example/src/app/output/page.tsx` L217–225), and the FAQ names Next.js, Remix and Astro, client-side.

### 1.6 Licence

- **The file.** `AG-LICENSE` is titled "PolyForm Shield License 1.0.0", © 2026 Benji Taylor. It grants use, copying, modification and distribution on three conditions (L9–17):
  - no product or service that competes with the Software, or with a Licensor product that includes it;
  - keep the notices;
  - ship the licence with any distribution.
- **The canonical text it links** (`POLYFORM`) has 17 sections, among them a patent licence, a Notices rule for "Required Notice:" lines, and a broad Competition definition: free products, other platforms and other languages count, and so does marketing as a substitute.
- **What each says about us.**
  - *Inference:* which text governs is unclear, and this note gives no legal verdict.
  - *Inference:* our pipeline does not offer a feedback toolbar.
  - None of the ideas below copies Agentation code. Our source link (`tag.mjs`) was ported from our own #84 prototype (`skills/to-handoff/scripts/tag.mjs` L29). So the reuse question does not arise unless someone copies code.

## 2. Where our pipeline is today

- **To-preview renders static HTML.** The Generic Adapter's preview renderer runs the component with `react-dom/server` in Node (`skills/adapter-generic/scripts/preview.mjs` header), and `catalog.mjs` embeds the specimens as HTML strings. There is no live React tree on the page, so no fibers.
  - A card's footer names the package and its version (`catalog.mjs` L54–56).
  - It shows every combination the Contract allows. Nothing says which ones the screens use.
  - It never approves and never changes defaults (`skills/to-preview/SKILL.md` L8; `GLOSSARY.md` L174).
- **To-handoff already links the rendered DOM to source, without component names** (#84):
  - `tag.mjs` rewrites a scratch copy so every JSX element carries `data-handoff-at`, placed after every spread, as a chain of sites, outermost first (`tag.mjs` L26–52).
  - `runtime.mjs` builds it for production (`next build`, `vite build`; L7–8) and joins each host element in four steps (`snapshot`, L126–150):
    1. its own innermost app site;
    2. else the fiber walk over `memoizedProps["data-handoff-at"]`;
    3. else a DOM ancestor;
    4. else the document shell.
  - #84 measured every labelled usage correct on Next (webpack and Turbopack) and Vite, React 19.
  - At this commit it reads only text metrics (`PROPS`, L28). ADR 0015 adds computed paint, spacing and radius, specified in #218.
- **Vibe-to-Figma reads statically.**
  - On the shadcn path, the families come from To-handoff's static reader (`used.mjs`).
  - Path A's extraction reads the JSX and never runs the Prototype (ADR 0016 L17). Contracts are read from the Extracted Library only (ADR 0016 L5).
- **Where path A misses:**
  - A className that is a function call, a prop, an import, an object or an array is skipped with its reason (`extract.mjs` L91–98, L199–200). In the fixture, `<button className={buttonClass("solid")}>` is one such site (`test/fixtures/path-a-app/src/App.tsx` L54).
  - A group with one site and no ternary is no family (`extract.mjs` L599, reason "it appears once and has no className ternary", L694). *Inference:* a `.map` over mock data renders one JSX site many times, but it counts once.
  - The Families tab shows each site as `file:line` and its opening tag, with no picture of where it sits in the app (`skills/vibe-to-figma/SKILL.md` L105).
- **Corrections go through chat only, by design.** The owner corrects the Family map and Drafted values in chat. Saved ticks are page data, never an approval, and only a message the owner typed in chat counts (`skills/vibe-to-figma/SKILL.md` L66, L106, L122, L124).

## 3. Ideas to borrow

Ranked by the goal. Cost is a rough guess: S is a day or less, M a few days, L more.

| # | Idea | What Agentation does | What it would change for us | What it unlocks toward the goal | Cost | Risks | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Runtime evidence for path A | Reads `__reactFiber$` from a clicked node and walks `.return`, for names only | A runtime step for path A in `skills/vibe-to-figma/scripts/extract.mjs`/`folder.mjs`, reusing `skills/to-handoff/scripts/runtime.mjs` (copy, `tagJsx`, build, serve). It reads each host's rendered `class` and `data-handoff-at`, joins them to sites by `file:line` (`extract.mjs` L224), and feeds resolved classes and rendered-element counts into the requests and the Family map | Prototypes whose class strings come from helpers, props or imports, or whose repeats come from `.map`, can yield families where today they are skipped or dropped. That means more apps reach Component Sets | M | ADR 0016 says "Static only" (L17), so this needs an amendment. It sees only the branches rendered in the states visited. It needs a build that succeeds (#84: 19–25 s on Next). Runtime evidence must reach a Contract only through the Extracted Library (ADR 0016 L5) | Try as a prototype, then an ADR amendment for the owner |
| 2 | "Used by the screens" marks on To-preview cards | Nothing like it: the path carries names, not props | The catalog data gains the tuples the screens use, and each card shows a mark (`skills/to-preview/scripts/catalog.mjs`, `references/interactive-template.md`). Static first: To-handoff's static reader already reads literal props on Code Library leaves (`react.mjs` L331–400). Later, at runtime, `memoizedProps` on the leaf's fiber | The owner narrows a large family faster: Button narrowed 3,072 → 48 (`skills/vibe-to-figma/SKILL.md` L42), and a set above MAX_COMBINE 3,000 stops the build (L161). It does not add projects; it shortens review | S static, M runtime | "Used" is not "wanted": a Design System may keep unused variants. To-preview never changes defaults or ticks for the owner, so it is a mark only. Dynamic props are invisible statically | Try as a prototype, static first |
| 3 | Computed styles of To-preview specimens checked against the Contract | Captures computed styles at click time (a per-element-type list, or the forensic list), values only. MCP output leaves them out | The catalog page is real HTML plus the compiled stylesheet in a browser, so `getComputedStyle` works on specimens with no fibers. For a sample of variants (first, middle, last, as To-design's sample check does; `docs/research/shadcn-figma-probes.md`), compare each anatomy node's paint, spacing, radius and text metrics, found by the root and its `data-slot` parts, with what the Contract resolves. Its home: a new headless script beside `catalog.mjs`, say `skills/to-preview/scripts/specimen-styles.mjs`, using To-handoff's pinned `playwright-core` | Catches a misread by the Generic Adapter before a wrong Component Set is built. For example, path A's radius scale is not read today (`skills/vibe-to-figma/SKILL.md` L73). Today nothing compares the Contract with what the code renders: the Coverage and sample checks compare Figma with the Contract. It applies to both paths | M | A computed value has lost its `var()`, so compare resolved values per Mode, not token names. States forced through their CSS pseudo-class come from the page's classes, not real hover. To-handoff's runtime styles are already decided (ADR 0015, #218) and are not this idea | Try as a prototype |
| 4 | "Where in the app" on the Families tab | Click an element, get the component path and `path:line:col` | From idea 1's runtime run: a screenshot per screen with each family's sites boxed, by `data-handoff-at` → `getBoundingClientRect`. The inverse too: click a box to see its family, or "no family" with the reason (`skills/vibe-to-figma/scripts/review.mjs`, the Families tab) | The owner checks merges, splits and drops by sight instead of by `file:line`. That suits owners of Prototypes who do not read the code. Fewer wrong families reach Figma | M (S on top of idea 1) | Page size: 4.9 MB today on the v0 fixture (`skills/vibe-to-figma/SKILL.md` L83), against the 16 MB Artifact limit. Only the states visited are shown. *Inference:* display only, so it may not need ADR 0016's amendment | Try as a prototype, with idea 1 |
| 5 | Owner notes pinned to a card or a site | Annotations with comment, intent, severity and status, read by the agent over MCP | A note box on review-page cards and Families-tab sites, saved in the review Artifact's db beside `review/ticks`, where the owner-write rule and `isOwner()` already exist. The agent would read it with `ArtifactData` and raise each note in chat | Corrections would arrive pinned to the exact card or site, so fewer round trips. It adds no projects | S–M | A note is never the owner's word: approval and Family-map corrections stay chat-only (`skills/vibe-to-figma/SKILL.md` L122, L124), and changing that needs an ADR. Artifacts already have comment threads (the `ArtifactComments` tool), which may be enough. Revisit if corrections in chat prove slow | Skip |
| 6 | Identifying attributes as names | Captures `data-testid`, `data-test`, `data-qa`, `data-cy` and `data-component` and puts short ones in the path | To-handoff's `nameOf` (`generate.mjs` L179) would go `id`, then a naming class, then `data-testid`/`data-component`, before falling back to `null` | More readable region and usage ids in Handoffs of Tailwind Prototypes (#216). *Inference:* Prototypes rarely set these | S | Ids change, and owner decisions are keyed by stable key, so a carried decision could be dropped on the first rerun. Revisit when a Prototype with test ids arrives | Skip |
| 7 | DOM → source on To-preview cards | Click an element, get the component path and `path:line:col` | — | — | — | A card renders one Contract's component, so its component and file are already the Contract's `code` and `source.files`. Parts already carry `data-slot`, in shadcn sources and in the generated Extracted Library components (`extract.mjs` L534, L545), so a hover label naming the part would cost S. It moves no project toward either output | Skip |
| 8 | Component-name paths and smart filtering | Names from fibers, framework skip lists, DOM-class correlation | — | — | — | Our runtime builds for production, where names are minified. Smart mode matches name words to CSS class words, and Tailwind utilities carry none. Our site chain already names usages | Skip |
| 9 | The source probe | Calls each component with `{}` under a throwing dispatcher | — | — | — | It runs user code outside render with fake props, and it finds the first hook's line, not the usage. `tag.mjs` gives exact usage sites with no execution | Skip |
| 10 | MCP server, watch loop, webhooks | Local HTTP and MCP, SQLite, "hands-free" loop | — | — | — | Vibe-to-Figma stays one-way (ADR 0017), and only the owner's chat message approves. Our steps pass files and the Artifact db, not a live channel | Skip |
| 11 | Layout mode | Reviewers place or rearrange components as spatial hints for the agent to build | — | — | — | Vibe-to-Figma only carries code to Figma (`GLOSSARY.md`). Design edits happen in Figma, and pulling them back is Figma-to-Vibe's job | Skip |

Notes on the table:

- **Idea 1, the join.** `tagJsx` writes `file:line:col` at each JSX opening tag, and `extract.mjs` keeps `at = file:line` for each site (L224). So a site's rendered hosts are the elements whose chain holds that `file:line`.
  - **Two sites on one line** need the column too. The extractor would have to keep it.
  - **What the evidence covers.** In the fixture, `buttonClass("solid")` would resolve to the solid branch's classes, but never to the `"link"` branch, which no screen renders.
  - **Why it adds nothing to app components.** Family boundaries made by app components (a `PlanCard` rendered three times) are already visible statically: `react.mjs` inlines app components.
- **Idea 2, which path it serves.** On the shadcn path the axes come from cva, so runtime props can only mark values, never add axes. On path A the axes come from differences between sites, so idea 1, not idea 2, is the one that adds values.
- **The constraint for every runtime idea.** Read attributes we inject and props, never component names or `_debug*` fields. That is what lets To-handoff's join work on production builds and on React 19.

## 4. Open questions for the owner

1. **Path A at runtime.** Will you amend ADR 0016's "Static only" so path A may build and run a copy of the Prototype, as To-handoff's runtime reader does? If so, should runtime classes only become evidence in the agent's requests, or should they also fill a skipped site's classes on their own?
2. **States.** For a path A runtime run, is the first load enough, or should it reuse To-handoff's `reach` decisions to visit other states?
3. **"Used by the screens".** Do you want the marks on To-preview cards? Should they stay marks only, with no pre-unticking, so To-preview keeps never changing ticks or defaults?
4. **Checking specimens against the Contract.** If idea 3's check finds a mismatch, should it only report it on the review page, or should it block approval, as a `warning` note already can?
5. **Notes on the review page.** Do you want them at all, given that chat is the only channel for decisions? Or are Artifact comment threads enough?
6. **Licence.** No idea here copies Agentation code. Do you want the licence file's text checked against canonical PolyForm Shield before anyone reads Agentation's source closely for implementation work?
