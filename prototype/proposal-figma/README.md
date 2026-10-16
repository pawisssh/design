# Prototype: a Component Proposal built in Figma ahead of code (#79)

Throwaway. It answers [#79](https://github.com/pawisssh/design/issues/79): can To-design build a Component Proposal's set with the existing plans and cores, and what happens to that set when a Contract with the same key arrives?

Every approval here is **simulated** (`by: "orchestrator (prototype)"`). A real base-loop approval is the owner's alone.

## Files

- `plan-option.proposal.json`: a sample Proposal (`home: app`) with two axes (Selected × State, 8 variants). It binds only theme tokens that the smoke draft's foundations already hold.
- `proposal-view.mjs`:
  - the build gate (`buildReady`);
  - the derived stand-in for `figma` (`derivedFigma`);
  - a Contract-shaped **shim** (`buildView`) that the unchanged `basePlan`/`setsPlan` read;
  - the `proposal:<key>` ledger namespace (`ledgerView`, `namespaced`);
  - adoption in place at retirement (`adoptInPlace`, #80 §9).

  The shim is prototype-only. The real seam is a neutral build input, derived after `validateProposal()`, which both a Contract and a Proposal produce. That way `validate()` never sees a Proposal (ADR 0005, #60).
- `run-mock.mjs`: the offline run on `skills/to-design/tests/mock-figma.mjs`. Output is in `mock-report.json`.
- `live.mjs`: the same derivation for the normal packager → `use_figma` → `ledger.mjs record` cycle, against the smoke draft only, with its own ledger copy.
- `live/`: the live results from the smoke draft `Alpt8YsrzDVu6DnwsrF26h`, plus the Proposal with its simulated approval.

## What it showed

| Question | Result |
| --- | --- |
| Do the cores need a change to build a Proposal? | No. Both cores, the packager and the hook ran unchanged. Live: base 35,645 chars, sets 38,508 chars, coverage `ok` (8/8). The set sits on page `Plan option (Proposal)` with Header Type `Component Proposal` and the description `Component Proposal: not in Carbon React yet. …`. |
| Does the completeness gate separate buildable Proposals from the rest? | Yes. A description-only Proposal is refused (`layout`, `paint` required for a Figma build). The sample passes rule 5 over all 8 combinations. A same-key Contract refuses the build ("ready to retire"). |
| Does the base loop work without `source`, `code` or To-preview? | Yes. A simulated owner tweak (gap → `spacing-04`) diffed as `token-edit`, applied into the Proposal with no `by`/`was`, moved its hash (→ `pending`), and rebuilt clean. Live: base readback diff empty. |
| Does the derived grid match hand-picked grids? | The rule is: the last non-State axis gives the columns, the other axes and then State give the rows. It reproduces Button's `columns [size]`, `rows [kind, state]`. Plan option gives a 4×2 grid. |
| What happens if a same-key Contract is built with no retirement act? | **Two sets** named `Plan option`, on two pages, under the ledger keys `proposal:plan-option` and `plan-option`. The gate must refuse this. |
| Does adoption in place keep node identity? | Yes. Same set node, **8/8 variant ids kept** after the axis rename (Selected→Checked, false/true→off/on), 2 new `Active` variants created, Header Type → `Component`, description → the Contract's. |
| Does adoption rename the page? | **No.** The core finds an owned page by id and never renames it, so the page stays `Plan option (Proposal)`. Adoption needs a page rename (in the core or in the adopt step). |

## Run

```
node prototype/proposal-figma/run-mock.mjs
```

Live (smoke draft only, ledger copy only):

```
node prototype/proposal-figma/live.mjs base --ledger .scratch/to-design/proposal-79.ledger.json --out .scratch/to-design/p79-base-1
```

Then package with `builder-core-components.js`, call `use_figma`, and `ledger.mjs record --ledger <copy>`. Use the same pattern for `diff`, `approve` (simulated), `sets --batch 0`, `coverage` and `check-coverage`.

The smoke draft now holds the page `Plan option (Proposal)` (`74:2`, set `74:14`). The main ledger does not track it. Its copy is in the side-session notes as `ledger-proposal-79-copy.json`.
