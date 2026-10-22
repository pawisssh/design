# A Prototype reaches Component Sets or a Handoff by its kind, through one entry

The goal (owner, 2026-10-22): someone who vibe-coded a project can turn it into Component Sets in Figma, or into a Handoff. In this repo's terms, the project is a Prototype. Which Prototypes can do that is decided per Prototype kind and per output, and every run starts from one entry, `/from-prototype`.

**The unit is the Prototype kind, not the tool.** A kind is a framework plus the way it is styled. Some things are gates inside a kind, not kinds of their own:
- the Tailwind version;
- the lockfile;
- the framework or router variant;
- where `package.json` declares React.

A failed gate under a supported kind is a gap with a ticket of its own. The kind is still supported.

**Support per kind and output.** The tools column is [#319](https://github.com/pawisssh/design/issues/319)'s research.

| Prototype kind | Tools that default to it | Component Sets | Handoff |
|---|---|---|---|
| React + Tailwind + shadcn | v0, Lovable, Replit, Figma Make, Base44 | supported: the shadcn path | supported |
| React + Tailwind, no Code Library | Bolt, Google AI Studio | supported: path A, an Extracted Library ([ADR 0016](0016-a-prototype-with-no-code-library-gets-an-extracted-library.md)) | supported |
| React + CSS or SCSS classes, Carbon or not | none | supported: the Prototype's own components ([#310](https://github.com/pawisssh/design/issues/310)) | supported |
| Plain HTML + CSS classes | Claude | supported: an Extracted Library transcribed from its CSS rules ([#327](https://github.com/pawisssh/design/issues/327)) | supported |
| Vue, Svelte, Angular | none | not supported | not supported |

A Handoff is supported wherever To-handoff's reader takes the framework: one HTML file, a Next.js App Router app, or a Vite app with an `index.html`.
- **Its Design System** is chosen by [#321](https://github.com/pawisssh/design/issues/321)'s order. Against a Design System that already exists, the user's own or a packaged Code Library's, it needs nothing from Vibe-to-Figma.
- **Against the Prototype's own Design System folder,** it follows Component Sets support. Where the Prototype doesn't import its families, it also needs [#265](https://github.com/pawisssh/design/issues/265), which recognises sites as Usages through the Family map.

Not supported:
- **Vue, Svelte and Angular.** No tool defaults to them.
- **Component Sets for a React app styled by CSS modules or CSS-in-JS.** No reader takes that styling.
- **Component Sets for a plain HTML page styled only by Tailwind's CDN script or by `style=""`.** No sample of either has been read.
- **Native mobile apps.** Out of scope.

[#323](https://github.com/pawisssh/design/issues/323) refuses a kind with no reader plainly. A kind costs only the front ends it lacks, because each kind is read from its source by a reader of its own over shared parts.

**The gates lifted.** Each is a ticket on the map, [#318](https://github.com/pawisssh/design/issues/318):
- `bun.lock` and a pnpm workspace's `pnpm-lock.yaml` ([#335](https://github.com/pawisssh/design/issues/335));
- TanStack Start and wouter ([#336](https://github.com/pawisssh/design/issues/336));
- Tailwind 3 ([#337](https://github.com/pawisssh/design/issues/337));
- a Figma Make bundle, with React only in `peerDependencies` and no `components.json` ([#338](https://github.com/pawisssh/design/issues/338));
- a plain HTML Prototype's need for a `package.json` ([#339](https://github.com/pawisssh/design/issues/339)).

yarn's lockfile is not lifted: no tool writes it by default.

**The entry.** `/from-prototype` checks first, then runs only what the owner asked for ([#324](https://github.com/pawisssh/design/issues/324), spec [#334](https://github.com/pawisssh/design/issues/334)).
- **The check.** Before it fetches or writes anything, it names the Prototype kind and checks every gate of each output's reader.
- **The verdict.** It gives one verdict per output, and refuses an output plainly, naming the gate or the ticket it waits on.
- **The run.** It makes the outputs the owner asks for, never both unasked, and settles a Handoff's Design System once, at the start.
- **The skills underneath.** Vibe-to-Figma and To-handoff keep their names and still run alone.

The skills run in a checkout of this repo, and the owner of a run is the person in that session's chat ([#320](https://github.com/pawisssh/design/issues/320)).

**Not decided here:**
- **A React app that mixes Tailwind utilities with its own class-styled components.** That is [#331](https://github.com/pawisssh/design/issues/331).
- **A Prototype with both its own folder and a packaged Code Library's Design System.** Which one its Handoff uses is the second half of #321's D6.

This amends [ADR 0014](0014-vibe-to-figma-supports-a-tailwind-app-without-shadcn.md):
- **Families come from the Prototype's source, never its rendered DOM** (#323).
- **"React + Tailwind only" now describes the Extracted Library, not the Prototype.** Other kinds enter the one pipeline through it, or through their own components (#310).

It amends [ADR 0016](0016-a-prototype-with-no-code-library-gets-an-extracted-library.md):
- **Static only.** It holds for families, axes and rules, but the element tree may be server-rendered (#323).
- **What feeds a family file.** Its file may come from CSS rules (#327).
- **Pins.** The Adapter's own pins apply when the Prototype resolves none (#327).
- **Where it applies.** Plain HTML is no longer refused.

Decided in [#325](https://github.com/pawisssh/design/issues/325) on 2026-10-22, the last ticket on #318. The tickets linked above hold the decisions this one rests on.

## Considered Options

- **Support per tool** ("v0 and Lovable"). Rejected for two reasons:
  - A tool changes its default. Lovable moved to TanStack Start and bun on 2026-05-13.
  - Several tools hand over one kind, so a per-tool table repeats itself.
- **Treat a failed gate as an unsupported kind.** Rejected. Only the v0 and Google AI Studio samples pass every gate, so most tools' defaults would be unsupported for reasons that cost one reader change each.
- **Ask the user to upgrade a Tailwind 3 Prototype first.** Rejected. The flow never writes the Prototype (#324), and the upgrade rewrites the classes the owner sees.
- **Count a Handoff only against the Prototype's own Design System folder.** Rejected. #321 puts a Design System the user names first, and that route already works for every kind To-handoff reads.
- **One reader of the rendered page for every kind, as a fallback.** Rejected in #323.

## Consequences

- **The entry refuses a supported kind until its gap lands.** Each supported kind or output that doesn't work yet has a ticket on #318, and the entry's refusal links it.
- **Vibe-to-Figma's SKILL.md no longer pairs the shadcn path with Lovable.** Lovable's defaults fail a gate, either TanStack Start with bun or Tailwind 3.
- **The glossary gains three terms and rewords one.**
  - New: **Prototype kind**, **Owner** and **From-Prototype**.
  - Reworded: **Extracted Library**, which may now be transcribed from CSS rules.
- **A new kind is added by its reader.** A kind gains support when a reader takes it. A tool whose default is a kind already here needs no new decision.
