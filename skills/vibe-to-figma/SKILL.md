---
name: vibe-to-figma
description: One command from a vibe-coded React + shadcn + Tailwind project (v0, Lovable) to its own Design System folder and, after the owner approves, Component Sets in Figma. Use when the owner wants a vibe-coded app's components laid out as Figma Component Sets, or runs /vibe-to-figma.
---

# Vibe-to-Figma

```
/vibe-to-figma <project> <figma-file-url> [--all] [--name <name>]
```

Runs the existing skills end to end on a vibe-coded Prototype (spec [#175](https://github.com/pawisssh/design/issues/175)). It adds no Adapter and no builder: the [Generic Adapter](../adapter-generic/SKILL.md) reads the project, [To-preview](../to-preview/SKILL.md) and [Contract](../contract/SKILL.md) approval narrow and approve it, and [To-design](../to-design/SKILL.md) builds it. [To-handoff](../to-handoff/SKILL.md) reads the same folder afterwards.

Today it has step 1, the Design System folder ([#176](https://github.com/pawisssh/design/issues/176)). The review page, the approve and the Figma build are later tickets (see [Left for later tickets](#left-for-later-tickets)); until then the run stops after step 1.

## Inputs

- **A project:** React + shadcn + Tailwind, as v0 and Lovable write it: Next.js App Router or Vite + react-router, `components.json`, its global CSS, `package-lock.json` and the Code Library under `aliases.ui`. The Generic Adapter's pins apply: the lockfile must resolve its `shadcn`, `tailwindcss` and `tw-animate-css` versions.
- **Tools:** `node skills/adapter-generic/scripts/sources.mjs` (the Adapter's tools) and `node skills/to-handoff/scripts/deps.mjs` (the React reader's TypeScript).

## 1. The Design System folder

```
node skills/vibe-to-figma/scripts/folder.mjs <project> [--all] [--name <name>] [--root <dir>] [--drafts <file>]... [--requests <file>]
```

It writes `design-systems/<name>/`: `<name>.foundations.json` and `contracts/<family>.component.json`, one draft Contract per component. It writes no review page, approves nothing and touches no Figma file. The seams are `usedFamilies(project, {all})` ([`scripts/used.mjs`](scripts/used.mjs)) and `buildFolder({project, name, root, all, drafts})` ([`scripts/folder.mjs`](scripts/folder.mjs)).

- **Name.** `package.json` `name` without its npm scope, or `--name`. It must be lowercase letters, digits, `.`, `_` or `-`, and it is the Foundations document's `designSystem.key` too, which names the file, the folder and the To-design ledger section.
- **Which components.** A component is a Component Family keyed by its file in the Code Library folder (`components/ui/select.tsx` is `select`, whichever of its exports a screen renders). By default, the families the Prototype's screens render, read with To-handoff's static React reader: each page's tree and the layouts it mounts in, so the root layout's Toaster counts. `--all` takes every `.tsx` file in the Code Library folder.
- **Skipped.** Each family is first read against the Code Library tokens alone. One the Adapter cannot read is skipped and named in the report with the Adapter's reason, and the run goes on: on the v0 fixture, sonner's Toaster, which is not a flex or grid container or a plain box. A family whose Contract the component step refuses is skipped the same way, and the Foundations document is regenerated without it, so its closure lists only families with a Contract.
- **Foundations.** One Foundations document over every readable family, with each family's Synthesized tokens. A rerun that changes nothing leaves it unwritten.
- **Drafted values.** Labels, descriptions, the Figma grid and default text are drafted by the agent, as in the Adapter's component step. While any is open, the CLI writes every family's requests to one file (default `.scratch/vibe-to-figma/<name>.requests.json`), writes those families no Contract, and exits 2. Draft each one, then run again with `--drafts <file>` holding `{"drafts": {"<family>": {"<key>": <value>}}}`. The Adapter's own form, `{"family", "drafts"}`, is read too, one file per `--drafts`.
- **Reruns.** Each Contract at its path is the prior: the component step carries its Drafted values while their fingerprints hold, and a Contract that would not change is left unwritten, so an approval stands.

Done when the CLI prints `OK`.

Tests: `node --test skills/vibe-to-figma/test/*.test.mjs`. They run on [`skills/to-handoff/test/fixtures/v0-app`](../to-handoff/test/fixtures/v0-app), with the Adapter's committed [`fixtures/drafts`](../adapter-generic/fixtures/drafts) as the agent's answers, and skip, saying so, until both tool sets are fetched.

## Left for later tickets

- **Review page and one approve** ([#177](https://github.com/pawisssh/design/issues/177)): a Foundations tab and one catalog tab per Contract, one combined export, then "approve" or "approve except <family>".
- **Review page as a private Artifact** ([#178](https://github.com/pawisssh/design/issues/178)), with ticks that survive a reload.
- **Figma build after approval** ([#179](https://github.com/pawisssh/design/issues/179)) into the linked file only: Foundations, then each Component Set by B′.
- **Reruns on changed code** ([#180](https://github.com/pawisssh/design/issues/180)) and **Figma edits never overwritten** ([#181](https://github.com/pawisssh/design/issues/181)).
