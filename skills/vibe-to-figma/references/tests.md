# Tests

**Tests never approve a committed file.** `approveFolder({…, test: true})` writes `approval.by: "test (.scratch)"`, To-handoff's test approver, and only under `<repo>/.scratch/`. Rule 8 rejects that approver anywhere a Contract is validated.

## Folder, review and approve

The suites run on [`skills/to-handoff/test/fixtures/v0-app`](../../to-handoff/test/fixtures/v0-app), with the Adapter's committed [`fixtures/drafts`](../../adapter-generic/fixtures/drafts) as the agent's answers, and skip, saying so, until both tool sets are fetched. `test/route.test.mjs` covers the route by From-Prototype's check: its refusals run the folder CLI on temp copies with `--tools` an empty temp folder, which must stay empty, and only its run with no Figma link needs the tools. The review tests use a stub renderer, but for one catalog in `test/families-tab.test.mjs`: it builds the path A fixture's folder (`test/fixtures/path-a-app`, as `path-a.test.mjs` does) and renders a family of its Extracted Library with the real preview renderer, which runs `npm ci` into `.scratch/adapter-generic/preview/` (network the first time). The approve tests build the folder under `.scratch/vibe-to-figma-tests/` and remove it afterwards. They cover approve, approve except, the refusals, the narrowed closure, a rerun of `folder.mjs` after approve, and To-handoff's run against the approved folder. Approve except and the refusals run on the path A fixture's folder too, with two of its classes edited to Tailwind palette colours and the folder built again, so its Foundations hold palette tokens. On it, `approve` regenerates the Foundations byte for byte from the Extracted Library, an untick drops its last variant's palette token from the closure, and the Prototype passed as the project is refused, naming the library (#263). `test/foundations.test.mjs` covers the Foundations approval: approve writes it, and a Foundations document it does not cover is refused by the build, shown alone on the page, and approved there. The Artifact tests check that the saved ticks give back the export and approve as it does, and, in a browser with a stand-in `window.claude` db (To-handoff's runtime; they skip without it), that ticks save (at once when the owner leaves the page), survive a reload, restore only at their snapshot, save nothing for a viewer who is not the owner, and that the page without the runtime keeps its export.

## Build

`skills/vibe-to-figma/test/build.test.mjs` drives the whole loop on To-design's mock Figma. A mock smoke draft holds Carbon's collections and Templates page. The tests cover:

- the refusal before approve, and of a Foundations document no approve covers (`foundations.test.mjs`);
- Foundations and every set by B′, each passing its paged Coverage check, on the v0 folder and on the path A folder with its palette tokens, which reach the mock as variables;
- `approve except`;
- the MAX_COMBINE stop and `--skip`;
- the CLI packaging the first call, and a package the packager refuses, which stops the CLI with the packager's own reason. The packaging test skips, saying so, in a worktree outside its main working tree, where the packager writes no package;
- the ledger refusals;
- a failed check, then `--rebuild`.

`skills/vibe-to-figma/test/rerun.test.mjs` reruns on a copy of the v0 project: with no change nothing is written, reviewed or built; after `input.tsx` changes, only input is drafted, reviewed and approved, the other approvals stay byte-unchanged, and its set gets one call with its two changed variants, while hand edits to an unchanged variant and to another family survive. After `button.tsx` changes, narrowed Button is drafted again at 48 variants, the page shows it so, a plain approve keeps it, and its set gets only its changed disabled variants; new values and axes keep the Adapter's default ticks. It also covers a change undone before its update is checked, a build record from before #180, `pendingUpdate` and the `indexes` refusals. It also covers a removed component. With Textarea gone from the screens, the rerun sets its approved Contract aside, the review page is the narrowed Foundations alone, and after its approve the build makes only the Foundations call. The textarea set stays in the mock and is named orphaned. When Textarea comes back, it returns as a draft from its set-aside copy, then is reviewed, approved and built into its old set. Removed with an owner's omit and an owner-corrected Drafted value and brought back after its code changed, it keeps both. A draft Contract whose component is removed, or whose family the Adapter now skips, is set aside too, and approve goes on without it.

`skills/vibe-to-figma/test/path-a-rerun.test.mjs` reruns on a copy of the path A fixture. Built into the mock, an edit of one family's classes is drafted, reviewed and approved alone, and the build sends one update call, into that family's set only.

`skills/vibe-to-figma/test/held.test.mjs` covers the Held variants on the same copy:
- a hand-edited variant whose code changed is read back, left as it is and reported, while the other changed variant updates and edits to unchanged variants are not read or reported;
- the Held variant is still reported on a rerun with no change, and still edited at a further change;
- `--take-code` and `--keep-figma`, and their refusals;
- a variant removed in Figma, and `--take-code` building it again;
- a Held variant whose code goes back, and one that is unticked;
- a Baseline from before #181;
- the record's Contract files, and a record from before the rename that keeps its Held variants as `conflicts`.
