---
name: from-prototype
description: One entry from a Prototype to Component Sets in Figma, a Handoff for developers, or both. Today it holds the check, which names a Prototype's kind and says which outputs it can have, and the hand-over, the last stage: after the owner's Sign-off, a Handoff's Rendering is published as a private Artifact. Use when the owner asks what a Prototype can become, or when a To-handoff Handoff is signed off and the owner wants it handed over.
---

# From-Prototype

From-Prototype (spec [#343](https://github.com/pawisssh/design/issues/343)) is where every run on a Prototype starts. It runs the stages each output needs, then hands each output over. This folder holds the check and the hand-over today. The check's other gate rows, the outputs question and the plan land in [#434](https://github.com/pawisssh/design/issues/434)–[#438](https://github.com/pawisssh/design/issues/438), and until then the stages run alone: [Vibe-to-Figma](../vibe-to-figma/SKILL.md) for Component Sets, [To-handoff](../to-handoff/SKILL.md) for a Handoff.

## The check

Run it on the Prototype before any stage. `<prototype>` is a folder, or for plain HTML one HTML file.

```
node skills/from-prototype/scripts/from-prototype.mjs check <prototype> [--figma <url>] [--handoff]
```

`--figma` asks for Component Sets and `--handoff` for a Handoff. The check reads file names, `package.json` and source text. It writes nothing, fetches nothing and loads no fetched parser. It prints:

1. the Prototype's kind ([ADR 0019](../../docs/adr/0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md)'s) and the files that show it;
2. each output's verdict, with each refusing gate's reason and the ticket it waits on;
3. what is still possible;
4. "Nothing was fetched or written."

It exits 1 when an output it was asked for is refused, and 0 otherwise. **Give the owner the message as printed.** On exit 1, run no stage: the flow never switches outputs on its own ([#324](https://github.com/pawisssh/design/issues/324) D7).

Today only each output's `reader` gate is checked. A "yes" can still be refused later, by a stage, for a reason a later gate row will name.

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

The page's links are rewritten from `../screens/` to `screens/`, so the copy refers to nothing outside itself. A copy already there is replaced. The command refuses, exits 1 and writes nothing when:

- the Handoff is not signed off;
- `signed.json` doesn't match `handoff.json`, or the content changed after Sign-off;
- the Rendering's stamp isn't the signed Handoff's: render it again;
- the page links outside the copy, or refers to a screenshot that isn't there;
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

`node --test skills/from-prototype/test/*.test.mjs`. `test/check.test.mjs` runs the check on Vibe-to-Figma's and To-handoff's committed fixtures, and on temp-dir Prototypes for the other kinds. It asserts each kind, its evidence and each verdict, the CLI's message and exit code, and, in a child process that records file writes, child processes and fetches, that the check makes none, leaves the Prototype as it was and loads no fetched parser. `test/hand-over.test.mjs` signs off To-handoff's "Invite teammates" fixture with a test approval under `.scratch/from-prototype-tests/`, as `signoff.test.mjs` does (its setup is To-handoff's `test/signed.mjs`). The fixture is run with the runtime reader, so it has screenshots. The test renders the Handoff, writes the copy, and checks the copy and each refusal. It skips without the runtime reader (`node skills/to-handoff/scripts/deps.mjs`) or Carbon's sources (`node skills/adapter-carbon/scripts/sources.mjs`).
