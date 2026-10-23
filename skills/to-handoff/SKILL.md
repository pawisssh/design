---
name: to-handoff
description: Turns a Prototype (a single HTML file, or a React app on Next.js App Router or Vite + react-router) into a validated Handoff (handoff.json) against a Design System's Foundations, Contracts and Proposals, plus a static HTML Rendering where Contract usages render as the real Code Library. Use when a vibe-coded prototype should become a developer handoff, and to review, sign off or check a Handoff for Drift. Sign-off is the owner's.
---

# To-handoff

Reads a Prototype (one HTML file, or a React app folder), statically and then by rendering a scratch copy, and writes `design-systems/<ds>/handoffs/<feature-key>/handoff.json` and `renderings/index.html`. Every pick that could be a guess is a **decision** the agent answers in a `decisions.json`; with any decision open, generate writes nothing and returns the requests. To-handoff knows no Code Library: the Adapter named by the Foundations document's `source.adapter` supplies the role groups, the mode-map surfaces, the optional theme wrapper (`themeWrapper`: the component, its prop and the mode each value names), the breakpoints, the Contract-writing procedure (`<family>` in it is filled with the family's key), the check a Contract written mid-run must pass (`checkContract`) and the renderer, in `skills/adapter-<adapter>/scripts/handoff-adapter.mjs`.

Out of scope so far, for React Prototypes: compiling Tailwind or cva classes, icons as the icon property, layout regions recorded once across screens, and overlay flow transitions. The owner signs a Handoff off; the agent runs `approve` only on the owner's explicit "approve" in chat (section 5).

## 1. Fetch the reader's packages

```
node skills/to-handoff/scripts/deps.mjs
```

It installs parse5, TypeScript 6 and playwright-core from `deps/package-lock.json` (pinned versions and integrity hashes) into gitignored `.scratch/to-handoff` with `npm ci --ignore-scripts`. The runtime reader's browser is the system Chrome; without one it fetches Playwright's headless Chromium into `.scratch/to-handoff/browsers`. The Rendering also needs the Adapter's renderer packages (Carbon: `node skills/adapter-carbon/scripts/sources.mjs`). Tests skip, saying which command to run, until both are fetched; the runtime tests also skip without a browser.

## 2. Generate: ask, answer, re-run

```
node skills/to-handoff/scripts/handoff.mjs generate <index.html | app folder> --ds design-systems/<ds> --decisions <decisions.json> [--static]
```

The runtime reader runs unless `--static` (`generate({runtime: true})` from code; the default there is static). See section 3.

With an empty `{}` it exits 2 and prints `{requests: [{key, kind, question, candidates, evidence: {at}}]}`. Answer each key in the decisions file and run it again. An answer outside its candidates is refused, naming the key.

| key | answer |
| --- | --- |
| `recognise:<signature>` | `{contract, tuple, via: "library"\|"element"}`, `{proposal, tuple, via}`, `{draft: "<family>", tuple, via, reason}` (the Code Library ships the family but the Design System has no Contract: the Adapter writes one mid-run), `{noContract: "<family>", reason}` (a raw usage plus the Adapter's Contract-writing step as a question), or `{raw: true, reason}`. A tuple names non-State axes only: States come from the Prototype's conditions. |
| `contract:<family>` | asked after a `draft` answer: `{path}` of the whole-family Contract the agent wrote by the Adapter's procedure, at `status: "draft"` and `approval: null`, or `{unwritable: reason}`. A draft that passes the Adapter's `checkContract` joins `contracts/` byte for byte (never over an existing Contract), and the usage points at it. One that fails, can't be read or isn't a draft leaves the usage raw with the reason in its no-Contract question. The Handoff's sign-off never approves it. |
| `token:<role>:<value>` | one of the tied or near tokens, or `"value"` to keep it Off-system. |
| `textStyle:<size>/<line-height>/<weight>/<letter-spacing>` | a Text Style among the candidates, or `"value"`. |
| `token:font-size:<n>px` | a font-size token, when no whole Text Style matches. |
| `condition:<expr>` | `true` or `false`: a plain condition's value when the screen first shows. |
| `reach:<screen>:<state>` | runtime only: how a present non-default state is reached from first load, `{steps: [{fill: "<selector>", value} \| {click: "<selector>"} \| {clock: <ms>} \| {expect: "<selector>"}]}`, or `{unreachable: "<reason>"}`. |
| `feature` | `{owner, goal, scope, nonGoals}`. |
| `acceptance` | `[{id, screen, state, given, when, then}]`. |

**Owner decisions.** Only on the owner's words in chat, an entry is `{"by": "owner", "answer": …}`:

| key | owner answer |
| --- | --- |
| any key above | the owner's pick. It wins over the agent's, and its mark reads `by: "owner"`. |
| `question:<id>` | `{"by": "owner", "answer": "<text>"}`, or `{"by": "owner", "to": "developer"}` to re-address it. |
| `acceptance:<id>` | `{"by": "owner", "answer": {state, given, when, then}}`. It replaces the agent's criterion with that id, or adds one. |

Write a `question:<id>` answer with `node skills/to-handoff/scripts/handoff.mjs answer <handoff.json> --decisions <decisions.json> --question <id> --answer "<the owner's words>"`, then re-run generate. It refuses an id that is no open owner question in the Handoff, or a key the file already has, and leaves the entries already there as they were.

The Handoff records the owner's decisions in `ownerDecisions` by stable key. A re-run carries them over from the stored `handoff.json`, so the agent's `decisions.json` never needs to repeat them. They are kept while their key still exists. A key that is gone, or a carried answer that no longer fits its candidates, is dropped and printed (`dropped owner decision …`). Agent decisions are re-decided every run. Never write `by: "owner"` for anything the owner did not say.

What generate does without asking:

- **Values**: a `var(--…)` reference is followed through the Prototype's own custom properties to a Foundations token. Other values match by value within the CSS role's token groups, and every colour goes through `skills/contract/scripts/color.mjs`. Primitives (`hidden`) and component tokens (`family`) never match a region: a reference to one is Off-system with its reason. A value with no token within range is an Off-system `values[]` entry with its nearest tokens and the Primitive it equals.
- **Modes**: a Code Library theme wrapper that names a mode (Carbon `<Theme theme="g10">`) is the Prototype's mode, and the surfaces are not compared. A value the Adapter has no mode for, or one that is not a literal, is an owner question (`q-mode-theme`, kind `mode-map`) and the surfaces stand in. With no wrapper, the page and first container surfaces are scored against the Adapter's surface tokens in each Theme mode. The best mode is the Prototype's only mode, and the others render unverified.
- **States**: conditions shaped like loading, empty, error or success become those standard states. A standard state with no condition is `missing` and becomes a question. A ternary that sets a Contract State attribute (`disabled`) or swaps a usage's text becomes `usageStates`.
- **Stand-ins**: `mock…` data, `setTimeout` work and placeholder copy are flagged, and each gets a developer question. On Next, a `fetch` of a path the Prototype serves itself (`fetch('/api/x')` and `app/api/x/route.ts`) is a stub API: one `data[]` entry per route (`source: "simulated"`, `at` the fetch, `q-data-<route>`, ending `-api` when another Stand-in has that id) says what it pretends, its literal `setTimeout` delay and the literal error statuses (`{status: 500}`) it can answer, never how it picks them. A dynamic route (`app/api/items/[id]/route.ts`, `[...slug]`) serves `/api/items/3` and `` `/api/items/${id}` ``: a template hole takes one dynamic segment, never a static one, and a static route wins over a dynamic one, as in Next. The query, hash and a trailing slash drop before matching; a hole that holds the query (`` `/api/items${qs}` ``) matches no route. `mock…` data in the modules a fetched route imports is a mock too; their timers and fetches are how the stub works. The states its innermost function sets before the call (`setStatus("loading")`, `setSending(true)`) and after it (`setStatus("error")`, `setHasError(!res.ok)`) give the flow: default → the before state, then to error when it fails and to success when it answers ok.
- **Off-axis**: a Contract usage's own colour that its tuple does not paint becomes an `offAxis` entry and a question.
- **React Prototypes** (`scripts/react.mjs`): a Next.js App Router app has a screen per `app/**/page.tsx` inside its layouts; a Vite app a screen per `<Route path>` or `createBrowserRouter` entry, or, with neither, one screen, `index`. JSX conditions, `.map` lists and boolean props read as the HTML reader's conditions, repeats and attribute holes, and app components are inlined. A template-literal `className` signs its element by its static classes (`` `px-2 ${on ? 'bg-white' : ''}` `` is `button.px-2`), never by a token a hole touches (`` `w-${n}` ``). In a Tailwind project (a `tailwindcss` or `@tailwindcss/*` dependency) a utility class names nothing: a region, usage or copy id comes from the element's `id`, else a class an authored stylesheet selects, else its tag (a component's name); copy on a plain element takes its first words instead of the tag. An import from a Contract's `code.package` with its `code.component` is that Contract **by import** (`match.by: "import"`, no decision); a `code.package` that resolves to a project file (shadcn's `@/components/ui/button`) is that file however it is imported: its tuple comes from each axis value's `code`, most keys winning, and an axis prop that maps to no value, or a styling prop no axis or property names, is kept in `offAxis` with a `prop` question. A Code Library component (`components.json` `aliases.ui`, else `components/ui/`, `src/components/ui/` on Vite) is decided once per `recognise:<Name>[prop=value]` signature, `via: "library"`; `asChild` lifts its only child. A Code Library component that holds components that are not its parts (a Card around a form; a Carbon `Theme` around its Buttons, a `Modal` around its TextInputs) is a **container**, walked with its own parts, so the usages inside it are their own; one whose children are all its own parts (Alert, Select) is a leaf. A local ui file's parts are the other components of its file; a package's (`@carbon/react`, one module for all) are the components named after the container (`ModalBody` in `Modal`). A container whose family has a Contract is that Contract by import, and each usage inside it records it in `in` (the nearest enclosing container usage; `usages` stays flat, in reading order). Its tuple's Slot axes come from the parts it renders (a `CardFooter` fills `card-footer`), its TEXT properties from the parts its Contract names (`CardTitle`, `CardDescription`), and a `className` on a part is kept in `offAxis` with a `prop` question; text in no part the Contract knows, icons and raw elements stay the region's. A container with no Contract is read as a wrapper: its styles and text stay in the region, and a `source.notes` info note names it with its import. Next's `loading.tsx`, `error.tsx` and a feature folder's `not-found.tsx` are the loading, error and empty states of the pages under them; the root `app/not-found.tsx` is ignored. A fetched API route is read and pinned, so editing the stub is Drift; API routes nothing fetches, middleware, private and parallel-route folders are listed in `source.ignored`; `next/font` and `geist/font` imports join the font question; when the Design System has no Text Styles, it asks which font they should use. With more than one screen, missing-state questions end in the screen id (`q-state-error-invite`) and flow states read `<screen>/<state>`. Above six routes, a `q-split` question asks whether to split the Prototype.

The store writes only when the content changes. Each write bumps `revision` and leaves `status: "pending"` and `approval: null`. A re-run on the same inputs is byte-identical and reports `unchanged`. generate validates before it reports.

With requests open, stderr's first line counts them by kind (`69 requests: 44 condition, 23 recognise, …`). To read a written Handoff, run `review` (section 5) instead of parsing `handoff.json`.

## 3. The runtime reader

`scripts/runtime.mjs` never touches the owner's checkout. It works on a copy in `.scratch/to-handoff/runs/`, which it removes after the run:

1. **Tag** every element of the copy with `data-handoff-at="<file>:<line>:<col>"`. The HTML file is tagged at the static reader's offsets, including markup built in scripts. Each `.tsx`/`.jsx` file is tagged through TypeScript 6, with the attribute after every spread; a host element reached through `{...props}` carries the chain, outermost site first. A file TypeScript cannot parse stays untagged, and a `q-untagged-…` question names it.
2. **Build and serve.** With a `package.json`, it runs `npm ci --ignore-scripts`, then `next build --no-lint` and `next start`, or `vite build` and `vite preview`, or the `build` script and a static server. Without one, it serves the files statically. A page that does not load (a non-2xx response) fails the run.
3. **Visit each state at each breakpoint.** It opens a fresh page at that width and installs a fake clock, so a `setTimeout` Stand-in waits for a `{clock}` step. It runs the state's `reach` steps and checks the state was reached: every element shown only in that state is on the page. Then it takes a full-page screenshot.
4. **Read computed styles** at the widest breakpoint. Each element joins to its source site in this order: its innermost own site outside the Code Library folder (`components.json` `aliases.ui`, else `components/ui/`, `src/components/ui/` on Vite), the React fibre walk, the nearest DOM ancestor, then the document shell. Computed text metrics replace the source-only ones in the Text Style match. A recognise request shows the rendered size.

The Adapter names the breakpoints (Carbon: `sm` 320, `md` 672, `lg` 1056, `xlg` 1312, `max` 1584, from @carbon/layout; Generic: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536, from tailwindcss 4.3.3). Each state's `screenshots` maps a breakpoint to `screens/<screen>.<state>.<breakpoint>.png`, which sits next to `handoff.json`, or to `{missing, reason}`. A rewritten Handoff retakes them only when its Prototype snapshot changed, and an absent one is always taken: two renders of the same page differ by a few anti-aliased pixels, so a rewrite for any other reason keeps them byte for byte. Delete `screens/` to force a retake after a change the snapshot does not see: a state's `reach` steps, or an Adapter's breakpoint widths. The PNGs' bytes are not part of the content hash.

A failure in the copy, tag, build or browser step gives a **static-only Handoff**. Every screenshot is `{missing, reason}` with the failing command and its last output line, and a `q-runtime` question tells the owner. A state whose steps fail is missing only at that breakpoint. A `@media` rule raises a `q-breakpoint-…` question: on a runtime run it names the breakpoints the query applies at and, for one px width, the two it falls between; a static run says the static reader has no viewport.

## 4. Validate and render

```
node skills/to-handoff/scripts/handoff.mjs validate design-systems/<ds>/handoffs/<key>/handoff.json --ds design-systems/<ds>
node skills/to-handoff/scripts/handoff.mjs render design-systems/<ds>/handoffs/<key>/handoff.json --ds design-systems/<ds>
```

`validate` checks [handoff.schema.json](handoff.schema.json), then the cross-field rules:

- tuples against the Contract or Proposal axes;
- tokens exist and are theme tokens;
- copy, value and question references resolve;
- all five standard states are present;
- no usage of a retired Proposal (`migrate`).

`render` writes `renderings/index.html`, one static page with these sections:

- Overview, which says *Not specified* for each optional section the Handoff lacks;
- Needs a look, counted per flag: ≠ Off-system, ≈ near, ◇ agent pick, + Proposal, ∅ no Contract, ↯ off-axis, ! missing, ◌ Stand-in, ◐ Contract draft, not approved (also on each card that uses one), and `? q-…` linking to the question that settles it. Elsewhere, = exact, ✓ import (a Contract usage) and – n/a;
- States, with a states × breakpoints matrix of screenshots (a missing state is a hatched row; a missing screenshot shows its reason) and one tab per state with its screenshots;
- Components, with real renders inside the mapped mode's class, per-state renders and code snippets from each Contract's `code`. A container usage's card lists the usages nested in it (whose `in` names it), indented, deeper nesting under its own container;
- Tokens & values;
- Copy & questions.

A mode toggle covers every Theme mode, each applied as the one class its Mode `selector` names (the Adapter renderer's mode class when a Mode has none), and the stamp reads `r<revision> · <contentHash> · pending sign-off` (`signed off` once approve has run: approve renders the page again).

## 5. Sign-off: review, approve, check

```
node skills/to-handoff/scripts/handoff.mjs review design-systems/<ds>/handoffs/<key>/handoff.json --ds design-systems/<ds>
```

`review` prints the package the owner signs off:

- the revision, the content hash and every pin;
- the diff against `signed.json`, or "First sign-off". When only `source` changed it says "only pins moved";
- agent marks by kind, with their candidates;
- open questions by addressee, missing states and missing screenshots;
- the Contracts used, with their status, then, when a usage records `in`, each container usage with the usages nested in it indented under it;
- each pending Proposal in full, with its hash;
- signed Handoffs these Proposals put into Drift;
- what blocks sign-off;
- the approve command.

Show it to the owner. Only after the owner types "approve" in chat, run the printed command:

```
node skills/to-handoff/scripts/handoff.mjs approve <handoff.json> --ds design-systems/<ds> --content-hash <h> --proposal <key>=<hash>
```

It refuses, writes nothing and exits 1 with every reason when:

- validation fails;
- a question to the owner is unanswered;
- a Contract the Handoff uses is still a draft: the Handoff takes its look from the Contract, so the owner approves the Contract first;
- a pending Proposal the Handoff uses wasn't passed;
- a hash moved since the review;
- a Design System pin moved (re-run To-handoff);
- the Handoff is already signed off.

Otherwise it writes, in order:

1. each shown pending Proposal's `approval: {by: "owner", at, contentHash}`, in that Proposal's own file;
2. the Handoff's `status: "approved"` and `approval: {by: "owner", at, revision, contentHash}`;
3. `signed.json`, a byte copy of `handoff.json`.

Any later content change from a re-run resets the Handoff to `pending`. A re-run that changes nothing leaves it signed.

```
node skills/to-handoff/scripts/handoff.mjs check <handoff.json> --ds design-systems/<ds> --prototype <index.html | app folder>
```

The Handoff pins its Prototype's files, not where they live: a recorded Handoff's Prototype is named in `test/recorded.test.mjs`'s `RECORDED`. `check` computes Drift and never stores it. Drift is any of:

- a Prototype file changed, added or removed. For a React app folder, `check` re-hashes the pinned read set, so a file the app newly imports shows only after a re-generate;
- a used Contract edited, its source moved, or gone;
- a used Proposal changed, back to `pending` after sign-off, or gone;
- the Foundations `usedHash` moved.

Adding another family's Contract moves only the informational `documentHash`, which is not Drift. `check` re-validates and prints "no drift", "drifted, still valid" or "drifted, broken", and exits 1 on Drift or a failed validation.

**Tests never sign off.** `approve({…, test: true})` writes `approval.by: "test (.scratch)"` and only under `.scratch/`. `validateHandoff` rejects that approver anywhere else.

## Tests

`node --test skills/to-handoff/test/handoff.test.mjs` runs generate → validate → render on [test/fixtures/invite-teammates](test/fixtures/invite-teammates) with its fixed `decisions.json`, statically. `test/runtime.test.mjs` covers tagging, then the runtime reader on the same fixture: screenshots per state and breakpoint, computed metrics in the match, and a forced build failure. `test/react.test.mjs` runs the React reader and generate on [test/fixtures/vite-app](test/fixtures/vite-app) and [test/fixtures/next-app](test/fixtures/next-app), each with its `decisions.json`; they are source plus lockfile, never installed by the static tests. `test/answer.test.mjs` runs `answer` on a temp `decisions.json`. `test/signoff.test.mjs` runs the Sign-off lifecycle: owner answers as test inputs, refusals, a test approval, a re-run against `signed.json`, and Drift. Its Design Systems live under `.scratch/to-handoff-tests/` and are removed afterwards. `test/recorded.test.mjs` regenerates each committed recorded Handoff (a `handoffs/<feature>/` with a `decisions.json`) from its decisions in a temp copy of its Design System, without the Contracts the run wrote mid-run, and compares `handoff.json`, the Rendering and those Contracts byte for byte; a generator change that moves one fails there until the recorded run is regenerated. To regenerate one, run `generate` on its Prototype with its `decisions.json` (`--ds` the committed Design System), then `render`; check `revision` went up with `status: "pending"` and `approval: null` (a run that changes nothing reports `unchanged` and keeps them). The Sign-off that follows is the owner's. No test writes anything under `design-systems/`. A live or trial run writes its Handoff against a copy of the Design System under `.scratch/` (`--ds .scratch/<run>/<ds>`): one written into the committed folder with its `decisions.json` fails `recorded.test.mjs` until it is added there as a recorded run.
