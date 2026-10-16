---
name: to-handoff
description: Turns a single-HTML-file Prototype into a validated Handoff (handoff.json) against a Design System's Foundations, Contracts and Proposals, plus a static HTML Rendering where Contract usages render as the real Code Library. Use when a vibe-coded prototype should become a developer handoff. Tracer scope (#112); sign-off stays the owner's.
---

# To-handoff

Reads one Prototype file, statically and then by rendering a scratch copy, and writes `design-systems/<ds>/handoffs/<feature-key>/handoff.json` and `renderings/index.html`. Every pick that could be a guess is a **decision** the agent answers in a `decisions.json`; with any decision open, generate writes nothing and returns the requests. To-handoff knows no Code Library: the Adapter named by the Foundations document's `source.adapter` supplies the role groups, the mode-map surfaces, the Contract-writing procedure and the renderer, in `skills/adapter-<adapter>/scripts/handoff-adapter.mjs`.

Out of scope in the tracer: multi-file or React Prototypes as generate input (the runtime reader can already tag and build them; #114), review, approve and check. The owner signs a Handoff off; To-handoff never does.

## 1. Fetch the reader's packages

```
node skills/to-handoff/scripts/deps.mjs
```

It installs parse5, TypeScript 6 and playwright-core from `deps/package-lock.json` (pinned versions and integrity hashes) into gitignored `.scratch/to-handoff` with `npm ci --ignore-scripts`. The runtime reader's browser is the system Chrome; without one it fetches Playwright's headless Chromium into `.scratch/to-handoff/browsers`. The Rendering also needs the Adapter's renderer packages (Carbon: `node skills/adapter-carbon/scripts/sources.mjs`). Tests skip, saying which command to run, until both are fetched; the runtime tests also skip without a browser.

## 2. Generate: ask, answer, re-run

```
node skills/to-handoff/scripts/handoff.mjs generate <index.html> --ds design-systems/<ds> --decisions <decisions.json> [--static]
```

The runtime reader runs unless `--static` (`generate({runtime: true})` from code; the default there is static). See section 3.

With an empty `{}` it exits 2 and prints `{requests: [{key, kind, question, candidates, evidence: {at}}]}`. Answer each key in the decisions file and run it again. An answer outside its candidates is refused, naming the key.

| key | answer |
| --- | --- |
| `recognise:<signature>` | `{contract, tuple, via: "library"\|"element"}`, `{proposal, tuple, via}`, `{noContract: "<family>", reason}` (a raw usage plus the Adapter's Contract-writing step as a question), or `{raw: true, reason}`. A tuple names non-State axes only: States come from the Prototype's conditions. |
| `token:<role>:<value>` | one of the tied or near tokens, or `"value"` to keep it Off-system. |
| `textStyle:<size>/<line-height>/<weight>/<letter-spacing>` | a Text Style among the candidates, or `"value"`. |
| `token:font-size:<n>px` | a font-size token, when no whole Text Style matches. |
| `condition:<expr>` | `true` or `false`: a plain condition's value when the screen first shows. |
| `reach:<screen>:<state>` | runtime only: how a present non-default state is reached from first load, `{steps: [{fill: "<selector>", value} \| {click: "<selector>"} \| {clock: <ms>} \| {expect: "<selector>"}]}`, or `{unreachable: "<reason>"}`. |
| `feature` | `{owner, goal, scope, nonGoals}`. |
| `acceptance` | `[{id, screen, state, given, when, then}]`. |

What generate does without asking:

- **Values**: a `var(--…)` reference is followed through the Prototype's own custom properties to a Foundations token. Other values match by value within the CSS role's token groups, and every colour goes through `skills/contract/scripts/color.mjs`. Primitives (`hidden`) and component tokens (`family`) never match a region: a reference to one is Off-system with its reason. A value with no token within range is an Off-system `values[]` entry with its nearest tokens and the Primitive it equals.
- **Modes**: the page and first container surfaces are scored against the Adapter's surface tokens in each Theme mode. The best mode is the Prototype's only mode, and the others render unverified.
- **States**: conditions shaped like loading, empty, error or success become those standard states. A standard state with no condition is `missing` and becomes a question. A ternary that sets a Contract State attribute (`disabled`) or swaps a usage's text becomes `usageStates`.
- **Stand-ins**: `mock…` data, `setTimeout` work and placeholder copy are flagged, and each gets a developer question.
- **Off-axis**: a Contract usage's own colour that its tuple does not paint becomes an `offAxis` entry and a question.

The store writes only when the content changes. Each write bumps `revision` and leaves `status: "pending"` and `approval: null`. A re-run on the same inputs is byte-identical and reports `unchanged`. generate validates before it reports.

## 3. The runtime reader

`scripts/runtime.mjs` never touches the owner's checkout. It works on a copy in `.scratch/to-handoff/runs/`, which it removes after the run:

1. **Tag** every element of the copy with `data-handoff-at="<file>:<line>:<col>"`. The HTML file is tagged at the static reader's offsets, including markup built in scripts. Each `.tsx`/`.jsx` file is tagged through TypeScript 6, with the attribute after every spread; a host element reached through `{...props}` carries the chain, outermost site first. A file TypeScript cannot parse stays untagged, and a `q-untagged-…` question names it.
2. **Build and serve.** With a `package.json`, it runs `npm ci --ignore-scripts`, then `next build --no-lint` and `next start`, or `vite build` and `vite preview`, or the `build` script and a static server. Without one, it serves the files statically. A page that does not load (a non-2xx response) fails the run.
3. **Visit each state at each breakpoint.** It opens a fresh page at that width and installs a fake clock, so a `setTimeout` Stand-in waits for a `{clock}` step. It runs the state's `reach` steps and checks the state was reached: every element shown only in that state is on the page. Then it takes a full-page screenshot.
4. **Read computed styles** at the widest breakpoint. Each element joins to its source site in this order: its innermost own site outside the Code Library folder (`components.json` `aliases.ui`, else `components/ui/`), the React fibre walk, the nearest DOM ancestor, then the document shell. Computed text metrics replace the source-only ones in the Text Style match. A recognise request shows the rendered size.

The Adapter names the breakpoints (Carbon: `sm` 320, `md` 672, `lg` 1056, `xlg` 1312, `max` 1584, from @carbon/layout). Each state's `screenshots` maps a breakpoint to `screens/<screen>.<state>.<breakpoint>.png`, which sits next to `handoff.json`, or to `{missing, reason}`. The PNGs are rewritten with the Handoff, so an unchanged Handoff keeps them byte for byte. Their bytes are not part of the content hash.

A failure in the copy, tag, build or browser step gives a **static-only Handoff**. Every screenshot is `{missing, reason}` with the failing command and its last output line, and a `q-runtime` question tells the owner. A state whose steps fail is missing only at that breakpoint.

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
- Needs a look, counted per flag: ≠ Off-system, ≈ near, ◇ agent pick, + Proposal, ∅ no Contract, ↯ off-axis, ! missing, ◌ Stand-in, and `? q-…` linking to the question that settles it. Elsewhere, = exact, ✓ import (a Contract usage) and – n/a;
- States, with a states × breakpoints matrix of screenshots (a missing state is a hatched row; a missing screenshot shows its reason) and one tab per state with its screenshots;
- Components, with real renders inside the mapped mode's class, per-state renders and code snippets from each Contract's `code`;
- Tokens & values;
- Copy & questions.

A mode toggle covers every Theme mode, each applied as the one class its Mode `selector` names (the Adapter renderer's mode class when a Mode has none), and the stamp reads `r<revision> · <contentHash> · pending sign-off`.

## Tests

`node --test skills/to-handoff/test/handoff.test.mjs` runs generate → validate → render on [test/fixtures/invite-teammates](test/fixtures/invite-teammates) with its fixed `decisions.json`, statically. `test/runtime.test.mjs` covers tagging, then the runtime reader on the same fixture: screenshots per state and breakpoint, computed metrics in the match, and a forced build failure. The Design System is assembled in a temp folder, so the test writes nothing under `design-systems/`.
