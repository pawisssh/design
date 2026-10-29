# Design System Skills

Agent skills for [Claude Code](https://claude.com/claude-code) that take a **Prototype**, such as an app made with an AI tool (v0, Lovable, Bolt, Claude…), to **Component Sets in Figma**, to a **Handoff** for developers, or to both. Both outputs go through a **Design System**: one described once from a Code Library your developers already use (Carbon, CDS, shadcn/ui), or one made from the Prototype itself.

The terms in **bold** have exact meanings in this repo. They are defined in [`GLOSSARY.md`](GLOSSARY.md).

## How it works

```
                    ┌─► Adapter ─► Contracts ─► To-preview ─► owner approves ─► To-design ─► Component Sets in Figma
Prototype ─► check ─┤                           (optional)
                    └─► To-handoff ─► handoff.json + Rendering ─► owner signs off ─► hand-over (private Artifact)
```

- **The check** ([From-Prototype](skills/from-prototype/SKILL.md)) reads the Prototype without writing or fetching anything. It names the Prototype's kind, says which outputs it can have, and plans the stages.
- **Component Sets.** An **Adapter** reads the Code Library and writes one **Contract** per Component Family: a library-neutral description of its Property Axes, anatomy, layout and tokens. The owner narrows the variants in **To-preview**, approves the Contract, and **To-design** builds the Component Set in a Figma Design Library through the Figma MCP server.
- **A Handoff.** **To-handoff** reads the Prototype, statically and by rendering it, and writes a validated `handoff.json` against the Design System's Foundations, Contracts and Proposals. It also writes a static HTML Rendering where each Usage of a Contract renders as the real Code Library. After the owner's Sign-off, the hand-over publishes the Rendering as a private Artifact.

Approving a Contract and signing off a Handoff are always the owner's own steps. The agent waits for them in chat.

## Supported Prototypes

| Prototype kind | Tools that default to it | Component Sets | Handoff |
|---|---|---|---|
| React + Tailwind + shadcn | v0, Lovable, Replit, Figma Make, Base44 | yes | yes |
| React + Tailwind, no Code Library | Bolt, Google AI Studio | yes, through an Extracted Library | yes |
| React + CSS or SCSS classes | none | yes | yes |
| Plain HTML + CSS classes | Claude | yes, through an Extracted Library | yes |
| Vue, Svelte, Angular | none | no | no |

Some tools' defaults still fail a gate inside a supported kind (a lockfile, a router, a Tailwind version), and each gap has its own ticket. The full table, with those tickets, is in [ADR 0019](docs/adr/0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md). The check tells you where your own Prototype stands.

## Getting started

### Requirements

- **Node.js 22 or later.** The repo has no npm dependencies. Each skill fetches its own pinned tools into the gitignored `.scratch/`, and checks each one against its hash.
- **Claude Code**, to run the skills.
- **The Figma MCP server**, connected to your Figma account, for Component Sets.
- **Google Chrome**, for To-handoff's runtime reader. Without it, the reader fetches Playwright's headless Chromium.
- **Python 3**, to package To-design's Figma build and to serve the To-preview page locally.

### Setup

The repository is private, so cloning it needs access granted by its owner.

```bash
git clone https://github.com/pawisssh/design.git
```

```bash
cd design && node scripts/fetch.mjs
```

`scripts/fetch.mjs` runs every skill's pinned fetch (`skills/*/scripts/sources.mjs` and `deps.mjs`). It stops at the first fetch that fails, and names it.

### Run it

Open the repo in Claude Code. Two skills are linked in [`.claude/skills/`](.claude/skills) as entry points:

**`/from-prototype`** is where a run on a Prototype starts. Ask for Component Sets, a Handoff, or both. The skill runs its check first:

```
node skills/from-prototype/scripts/from-prototype.mjs check <prototype> [--figma <url>] [--handoff] [--ds <design-system>] [--name <name>] [--all]
```

- `<prototype>` is a folder, or a single HTML file for a plain HTML Prototype.
- `--figma` asks for Component Sets, built into that Figma file.
- `--handoff` asks for a Handoff against the Design System that `--ds` names by its folder name (`carbon`, `cds`, `shadcn`, or the Prototype's own).

Exit code 2 means the check has questions for you, 1 means a refusal with its reason, and 0 means a plan whose stages the agent then runs.

**`/vibe-to-figma`** runs the Component Sets stages alone on a React + Tailwind Prototype:

```
/vibe-to-figma <project> [<figma-file-url>] [--all] [--name <name>]
```

The Figma link is optional: only the last stage, the Figma build, needs it.

Every stage writes under `.scratch/`. Nothing a run makes lands in `design-systems/` unless you commit it.

## Skills

| Skill | What it does |
|---|---|
| [`from-prototype`](skills/from-prototype/SKILL.md) | The one entry from a Prototype: the check, the stage plan, and the hand-over of a signed-off Handoff |
| [`vibe-to-figma`](skills/vibe-to-figma/SKILL.md) | Component Sets' stages for a React + Tailwind Prototype: its Design System folder, the review page, the owner's approve, the Figma build |
| [`contract`](skills/contract/SKILL.md) | The Contract and Foundations document schemas, and the one module that validates, expands, resolves and hashes a Contract |
| [`adapter-carbon`](skills/adapter-carbon/SKILL.md) | Carbon React Adapter: pinned Carbon source to draft Contracts and the Carbon Foundations document |
| [`adapter-cds`](skills/adapter-cds/SKILL.md) | CDS Web Adapter for the Coinbase Design System (`@coinbase/cds-web`) |
| [`adapter-generic`](skills/adapter-generic/SKILL.md) | Generic Adapter for shadcn/ui-style Code Libraries, read from a consumer's installed project |
| [`to-preview`](skills/to-preview/SKILL.md) | Shows every combination a Contract allows, rendered with the real Code Library, so the owner can leave out the ones they don't want |
| [`to-design`](skills/to-design/SKILL.md) | Builds a Design Library in Figma from Contracts with fixed builder cores: foundations, icons, the Base Component loop, the batch build and its checks |
| [`to-handoff`](skills/to-handoff/SKILL.md) | Turns a Prototype into a validated Handoff and its Rendering, then reviews, signs off and checks it for Drift |

## Repository layout

```
skills/                 one folder per skill: SKILL.md, scripts/, tests
design-systems/<ds>/    committed Design Systems: carbon, cds, shadcn
  <ds>.foundations.json   the Foundations document (generated by the Adapter, never edited by hand)
  contracts/              one <family>.component.json per Component Family
  proposals/              Component Proposals
  handoffs/<feature>/     Handoffs and their Renderings
docs/adr/               decisions, one file each, with a revisit list
docs/research/          research notes behind the decisions
docs/agents/            how agents use the issue tracker, triage labels and domain docs
scripts/                repo tooling: fetch, per-skill tests, merge, ADRs, research, the issue map
.github/                CI workflow and the scripts it runs
.scratch/               gitignored: fetched tools and every run's output
```

## Development

```bash
npm test
```

`npm test` runs every skill's suite and the CI scripts' (`.github/test`). Without `node scripts/fetch.mjs` (see [Setup](#setup)) first, the tests that need fetched tools skip, each naming the command to run. To run only some skills' suites:

```bash
npm run test:skills -- contract to-design
```

Before opening a pull request, run CI's checks of the change against `origin/main`. They fail a copied block of 8 or more lines under `skills/`, and an export nothing imports:

```bash
git fetch origin && npm run check
```

For a pull request stacked on another branch, set `BASE=origin/<branch>`.

CI ([`.github/workflows/test.yml`](.github/workflows/test.yml)) runs the fetch and `npm test` on each pull request and on each push to `main`, and `npm run check` on pull requests only. It runs on a self-hosted runner.

## Contributing

- **Issues and specs** live in GitHub Issues, triaged with `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) and [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).
- **Coding standards**: [`CODING_STANDARDS.md`](CODING_STANDARDS.md) holds the judgement calls review checks a diff against. Anything a test or script can check lives in a test or script instead.
- **Terms**: use the words in [`GLOSSARY.md`](GLOSSARY.md), and avoid the ones it lists under _Avoid_.
- **Decisions**: read the ADRs that touch your area in [`docs/adr/`](docs/adr/README.md) before changing it.
- **Agents**: [`CLAUDE.md`](CLAUDE.md) holds the instructions Claude Code reads in this repo.

## Licensing

This repository has no licence file. Files derived from third-party Code Libraries carry a `NOTICE` beside them:

- [`design-systems/carbon/NOTICE`](design-systems/carbon/NOTICE): Carbon Design System, Copyright IBM Corp., Apache License 2.0
- [`design-systems/cds/NOTICE`](design-systems/cds/NOTICE): Coinbase Design System, Copyright Coinbase, Apache License 2.0
- [`design-systems/shadcn/NOTICE`](design-systems/shadcn/NOTICE): shadcn/ui, Copyright shadcn, MIT License

Some test fixtures that copy a third party's files carry a `NOTICE` of their own, under `skills/`. A design system's `NOTICE` names any fixture it covers.
