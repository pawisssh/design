---
name: to-handoff
description: Turns a single-HTML-file Prototype into a validated Handoff (handoff.json) against a Design System's Foundations, Contracts and Proposals, plus a static HTML Rendering where Contract usages render as the real Code Library. Use when a vibe-coded prototype should become a developer handoff, and to review, sign off or check a Handoff for Drift. Sign-off is the owner's.
---

# To-handoff

Reads one Prototype file statically and writes `design-systems/<ds>/handoffs/<feature-key>/handoff.json` and `renderings/index.html`. Every pick that could be a guess is a **decision** the agent answers in a `decisions.json`; with any decision open, generate writes nothing and returns the requests. To-handoff knows no Code Library: the Adapter named by the Foundations document's `source.adapter` supplies the role groups, the mode-map surfaces, the Contract-writing procedure and the renderer, in `skills/adapter-<adapter>/scripts/handoff-adapter.mjs`.

Out of scope so far: multi-file or React Prototypes, and screenshots (the Rendering says `missing (static-only)`). The owner signs a Handoff off; the agent runs `approve` only on the owner's explicit "approve" in chat (§4).

## 1. Fetch the reader's package

```
node skills/to-handoff/scripts/deps.mjs
```

It installs parse5 from `deps/package-lock.json` into gitignored `.scratch/to-handoff` with `npm ci --ignore-scripts`. The Rendering also needs the Adapter's renderer packages (Carbon: `node skills/adapter-carbon/scripts/sources.mjs`). Tests skip, saying which command to run, until both are fetched.

## 2. Generate: ask, answer, re-run

```
node skills/to-handoff/scripts/handoff.mjs generate <index.html> --ds design-systems/<ds> --decisions <decisions.json>
```

With an empty `{}` it exits 2 and prints `{requests: [{key, kind, question, candidates, evidence: {at}}]}`. Answer each key in the decisions file and run it again. An answer outside its candidates is refused, naming the key.

| key | answer |
| --- | --- |
| `recognise:<signature>` | `{contract, tuple, via: "library"\|"element"}`, `{proposal, tuple, via}`, `{noContract: "<family>", reason}` (a raw usage plus the Adapter's Contract-writing step as a question), or `{raw: true, reason}`. A tuple names non-State axes only: States come from the Prototype's conditions. |
| `token:<role>:<value>` | one of the tied or near tokens, or `"value"` to keep it Off-system. |
| `textStyle:<size>/<line-height>/<weight>/<letter-spacing>` | a Text Style among the candidates, or `"value"`. |
| `token:font-size:<n>px` | a font-size token, when no whole Text Style matches. |
| `condition:<expr>` | `true` or `false`: a plain condition's value when the screen first shows. |
| `feature` | `{owner, goal, scope, nonGoals}`. |
| `acceptance` | `[{id, screen, state, given, when, then}]`. |

**Owner decisions.** Only on the owner's words in chat, an entry is `{"by": "owner", "answer": …}`:

| key | owner answer |
| --- | --- |
| any key above | the owner's pick. It wins over the agent's, and its mark reads `by: "owner"`. |
| `question:<id>` | `{"by": "owner", "answer": "<text>"}`, or `{"by": "owner", "to": "developer"}` to re-address it. |
| `acceptance:<id>` | `{"by": "owner", "answer": {state, given, when, then}}`. It replaces the agent's criterion with that id, or adds one. |

The Handoff records the owner's decisions in `ownerDecisions` by stable key. A re-run carries them over from the stored `handoff.json`, so the agent's `decisions.json` never needs to repeat them. They are kept while their key still exists. A key that is gone, or a carried answer that no longer fits its candidates, is dropped and printed (`dropped owner decision …`). Agent decisions are re-decided every run. Never write `by: "owner"` for anything the owner did not say.

What generate does without asking:

- **Values**: a `var(--…)` reference is followed through the Prototype's own custom properties to a Foundations token. Other values match by value within the CSS role's token groups, and every colour goes through `skills/contract/scripts/color.mjs`. Primitives (`hidden`) and component tokens (`family`) never match a region: a reference to one is Off-system with its reason. A value with no token within range is an Off-system `values[]` entry with its nearest tokens and the Primitive it equals.
- **Modes**: the page and first container surfaces are scored against the Adapter's surface tokens in each Theme mode. The best mode is the Prototype's only mode, and the others render unverified.
- **States**: conditions shaped like loading, empty, error or success become those standard states. A standard state with no condition is `missing` and becomes a question. A ternary that sets a Contract State attribute (`disabled`) or swaps a usage's text becomes `usageStates`.
- **Stand-ins**: `mock…` data, `setTimeout` work and placeholder copy are flagged, and each gets a developer question.
- **Off-axis**: a Contract usage's own colour that its tuple does not paint becomes an `offAxis` entry and a question.

The store writes only when the content changes. Each write bumps `revision` and leaves `status: "pending"` and `approval: null`. A re-run on the same inputs is byte-identical and reports `unchanged`. generate validates before it reports.

## 3. Validate and render

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
- States, with one tab per state and screenshot slots;
- Components, with real renders inside the mapped mode's class, per-state renders and code snippets from each Contract's `code`;
- Tokens & values;
- Copy & questions.

A mode toggle covers every Theme mode, each applied as the one class its Mode `selector` names (the Adapter renderer's mode class when a Mode has none), and the stamp reads `r<revision> · <contentHash> · pending sign-off`.

## 4. Sign-off: review, approve, check

```
node skills/to-handoff/scripts/handoff.mjs review design-systems/<ds>/handoffs/<key>/handoff.json --ds design-systems/<ds>
```

`review` prints the package the owner signs off:

- the revision, the content hash and every pin;
- the diff against `signed.json`, or "First sign-off". When only `source` changed it says "only pins moved";
- agent marks by kind, with their candidates;
- open questions by addressee, missing states and missing screenshots;
- the Contracts used, with their status (a draft Contract doesn't block);
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
node skills/to-handoff/scripts/handoff.mjs check <handoff.json> --ds design-systems/<ds> --prototype <index.html>
```

`check` computes Drift and never stores it. Drift is any of:

- a Prototype file changed, added or removed;
- a used Contract edited, its source moved, or gone;
- a used Proposal changed, back to `pending` after sign-off, or gone;
- the Foundations `usedHash` moved.

Adding another family's Contract moves only the informational `documentHash`, which is not Drift. `check` re-validates and prints "no drift", "drifted, still valid" or "drifted, broken", and exits 1 on Drift or a failed validation.

**Tests never sign off.** `approve({…, test: true})` writes `approval.by: "test (.scratch)"` and only under `.scratch/`. `validateHandoff` rejects that approver anywhere else.

## Tests

`node --test skills/to-handoff/test/handoff.test.mjs` runs generate → validate → render on [test/fixtures/invite-teammates](test/fixtures/invite-teammates) with its fixed `decisions.json`. `test/signoff.test.mjs` runs the Sign-off lifecycle: owner answers as test inputs, refusals, a test approval, a re-run against `signed.json`, and Drift. Its Design Systems live under `.scratch/to-handoff-tests/` and are removed afterwards. Neither test writes anything under `design-systems/`.
