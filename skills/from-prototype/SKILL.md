---
name: from-prototype
description: One entry from a Prototype to Component Sets in Figma, a Handoff for developers, or both. Its check names a Prototype's kind, says which outputs it can have, asks which to make and plans the stages; the hand-over, the last stage, publishes a signed-off Handoff's Rendering as a private Artifact. Use when the owner wants Component Sets or a Handoff from a Prototype, asks what a Prototype can become, or wants a signed-off Handoff handed over.
---

# From-Prototype

From-Prototype (spec [#343](https://github.com/pawisssh/design/issues/343)) is where every run on a Prototype starts. It runs the stages each output needs, then hands each output over. The stages are [Vibe-to-Figma](../vibe-to-figma/SKILL.md)'s for Component Sets and [To-handoff](../to-handoff/SKILL.md)'s for a Handoff. The check's other gate rows land in [#434](https://github.com/pawisssh/design/issues/434)–[#436](https://github.com/pawisssh/design/issues/436).

## The check

Run it on the Prototype before any stage. `<prototype>` is a folder, or for plain HTML one HTML file.

```
node skills/from-prototype/scripts/from-prototype.mjs check <prototype> [--figma <url>] [--handoff] [--ds <design-system>] [--name <name>] [--all]
```

`--figma` asks for Component Sets, built into that Figma file. `--handoff` asks for a Handoff against the Design System `--ds` names by its folder name; naming the Prototype's own folder makes the Handoff against it. `--name` and `--all` pass to Vibe-to-Figma's folder step. Run alone, that folder step runs this check first, Component Sets asked with no link (`check(prototype, {componentSets: true, all})`), and stops with its message when they are refused ([#439](https://github.com/pawisssh/design/issues/439)). The check reads file names, `package.json` and source text. It writes nothing, fetches nothing and loads no fetched parser. It prints:

1. the Prototype's kind ([ADR 0019](../../docs/adr/0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md)'s) and the files that show it;
2. each output's verdict, with each refusing gate's reason and the ticket it waits on; for plain HTML the Handoff's verdict names the one page it reads;
3. what is still possible;
4. the owner's questions, or the plan;
5. "Nothing was fetched or written."

**Give the owner the message as printed.** Then by its exit code:

- **2, the owner's questions.** With no output asked, one question offers only the outputs whose verdict is not "no", with the Design System question beside it when a Handoff is among them. A Handoff asked with no `--ds` asks its Design System, and so does `--ds` naming the own folder of a Prototype that can't have Component Sets. Component Sets with no usable folder name ask for `--name`. Wait for the owner's own chat answer, the only one that counts, then run the check again with it as options.
- **The Design System question** ([#321](https://github.com/pawisssh/design/issues/321)'s order) lists the Design Systems here, committed and under `.scratch/design-systems/`, as "if your developers build with one of these". Never suggest one because it looks closest. "None: this Prototype's own folder" is offered only while that route is open. The default is a Design System whose Contracts' package the Prototype depends on (`@carbon/react` gives `carbon`), else the own folder; there is none when the Prototype has both. A Handoff of this Prototype's feature key already in a Design System here answers the question, and nothing is asked: the message names it.
- **1, a refusal.** An output asked for is refused, or nothing is possible, or `--ds` names no Design System here, or the Prototype's own folder name is taken by a committed Design System or another scratch folder (run again with `--name`). Run no stage. When the other output can run alone, the message gives its command; run it only on the owner's word. The flow never switches outputs on its own ([#324](https://github.com/pawisssh/design/issues/324) D7).
- **0, the plan.** Run [the stages](#the-stages) in its order.

**The Figma file.** On exit 0 with Component Sets, before any stage, read the linked file once through the owner's Figma connection: one read-only call on the link's file key, such as `get_metadata`. If it fails, give the owner "Component Sets: no: <the reason>" and run no stage.

Today each output's `reader` gate and the `figma` link are checked. A "yes" can still be refused later, by a stage, for a reason a later gate row will name.

## The stages

The plan lists the stages in order, each with its folder under `.scratch/design-systems/` and its Design System, then its notes. Give the owner each note:

- **A new Handoff.** `--ds` names another Design System than the one this Prototype's Handoff is already in.
- **The committed Design System has moved** since its scratch copy was made, with the files that differ. Refresh the copy only when the owner says so in chat: copy those files from `design-systems/<ds>/` over the copy's, keeping its `handoffs/` and any Contract written mid-run. Refreshing puts the copy's signed Handoffs into Drift.

Run each stage by its own section, with its own questions: the folder step's requests (exit 2), To-handoff's decisions, and the owner's approve and Sign-off. Component Sets always come from the Prototype's own folder, `.scratch/design-systems/<name>/`; a named Design System changes only the Handoff. With both outputs, neither waits on the other's result: a failed coverage check is reported and the Handoff stages still run.

| Stage | Run |
|---|---|
| `folder` | [Vibe-to-Figma's folder step](../vibe-to-figma/SKILL.md#1-the-design-system-folder) with `--root .scratch/design-systems`, and `--name` and `--all` as given to the check |
| `review-page` | [Vibe-to-Figma's review page](../vibe-to-figma/SKILL.md#2-the-review-page) for that folder |
| `approve` | [the owner's approve](../vibe-to-figma/SKILL.md#3-approve): wait for it, as that section says |
| `figma-build` | [the Figma build](../vibe-to-figma/SKILL.md#4-figma-build) into the plan's link, the file read above |
| `scratch-copy` | copy `design-systems/<ds>/` to `.scratch/design-systems/<ds>/`. The plan has it only when the copy is absent; a copy already there is used in place |
| `generate` | [To-handoff's generate](../to-handoff/SKILL.md#2-generate-ask-answer-re-run) with `--ds` the stage's folder, on the stage's page when it names one (plain HTML), else on the Prototype |
| `review` | [To-handoff's `review`](../to-handoff/SKILL.md#5-sign-off-review-approve-check), and give the owner the package |
| `sign-off` | the owner's Sign-off, by To-handoff's `approve`: wait for it, as that section says |
| `hand-over` | [the hand-over](#the-hand-over) of each output the plan names |

Write nothing under `design-systems/`: every stage's folder is under `.scratch/`.

## The hand-over

Hand over each output the run made, once its own last stage is done.

### Component Sets

After the [Figma build](../vibe-to-figma/SKILL.md#4-figma-build)'s `next` prints `OK`, give the owner:

- the link of the Figma file the owner gave, the only file the build wrote to;
- the Component Sets that last `next` lists, each with its page and set id;
- each `orphaned <family>` set and `HELD <family>:<variant>` it prints, as [Vibe-to-Figma's reruns](../vibe-to-figma/references/reruns.md#the-build) say.

### A Handoff, before Sign-off

Give the owner the local Rendering, `handoffs/<key>/renderings/index.html`, and `review`'s package ([To-handoff's Sign-off](../to-handoff/SKILL.md#5-sign-off-review-approve-check)). **Publish nothing.** Developers never read a Handoff the owner hasn't signed.

### A Handoff, after Sign-off

`approve` renders the Rendering again with its stamp `r<revision> · <contentHash> · signed off`. Then write the publish copy:

```
node skills/from-prototype/scripts/from-prototype.mjs hand-over <ds>/handoffs/<key>/handoff.json
```

It writes `.scratch/from-prototype/<key>/` (gitignored). The folder holds:

- `index.html`, the stamped page, titled `<key> handoff`;
- `screens/`, every screenshot the page refers to.

The page's links are rewritten from `../screens/` to `screens/`, and Carbon's IBM Plex faces, which its CSS loads from IBM's CDN, are embedded: IBM Plex Sans and Mono in the Latin1 and Pi subsets. Other CDN faces are dropped, and their text falls back to the system font. So the copy refers to nothing outside itself. A copy already there is replaced. The command refuses, exits 1 and writes nothing when:

- the Handoff is not signed off;
- `signed.json` doesn't match `handoff.json`, or the content changed after Sign-off;
- the Rendering's stamp isn't the signed Handoff's: render it again;
- the page links outside the copy, or refers to a screenshot that isn't there;
- the page's CSS loads a `url()` from another host (`http:`, `https:` or `//`), which an Artifact blocks;
- the copy is over an Artifact's limits. The message names each size over a limit: the page over 16 MB, a screenshot over 15 MB, more than 511 files, or more than 256 MB in all.

**Publish the copy as a private Artifact** with the Artifact tool:

- `file_path`: the copy's `index.html`;
- `files`: each screenshot, `{"screens/<file>": ".scratch/from-prototype/<key>/screens/<file>"}`;
- `icon`: `"handoff"` on the first publish.

One publish takes at most 255 files. A Handoff with more screenshots is published in batches to the same `url`, each later batch adding to the files already there.

**After a later Sign-off**, write the copy again and publish it to the same URL, so the link the owner shared shows the latest signed revision. Find the URL with the Artifact tool's `action: "list"`, by the title `<key> handoff`.

**Give the owner:**

- the Artifact's link;
- the path of `handoff.json`;
- the path of `library/`, when the Handoff is against the Prototype's own folder and that folder has an Extracted Library. Developers adopt it ([ADR 0016](../../docs/adr/0016-a-prototype-with-no-code-library-gets-an-extracted-library.md)).

An Artifact starts private. **Never share it.** Sharing is the owner's act.

## Tests

`node --test skills/from-prototype/test/*.test.mjs`. `test/check.test.mjs` runs the check on Vibe-to-Figma's and To-handoff's committed fixtures, and on temp-dir Prototypes for the other kinds. It asserts each kind, its evidence and each verdict, the owner's questions, the plan's stages, the Handoff's Design System in a temp repo root (the check's `root` option), the CLI's message and its exit codes 0, 1 and 2, and, in a child process that records file writes, child processes and fetches, that the check makes none, leaves the Prototype as it was and loads no fetched parser. `test/hand-over.test.mjs` signs off To-handoff's "Invite teammates" fixture with a test approval under `.scratch/from-prototype-tests/`, as `signoff.test.mjs` does (its setup is To-handoff's `test/signed.mjs`). The fixture is run with the runtime reader, so it has screenshots. The test renders the Handoff, writes the copy, and checks the copy and each refusal. It skips without the runtime reader (`node skills/to-handoff/scripts/deps.mjs`) or Carbon's sources (`node skills/adapter-carbon/scripts/sources.mjs`).
