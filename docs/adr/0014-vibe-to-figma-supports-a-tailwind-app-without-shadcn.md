# Vibe-to-Figma supports a Tailwind app without shadcn

Vibe-to-Figma was written for a Prototype with a shadcn Code Library: `components.json`, the Code Library folder under `aliases.ui`, and the Generic Adapter's pins. A Prototype with no shadcn, such as a Vite + React + Tailwind app whose whole UI is in one `App.tsx`, crashed with a raw ENOENT before it wrote anything (the batch-sell live test, [#212](https://github.com/pawisssh/design/issues/212)).

Vibe-to-Figma will support such an app instead of refusing it. It finds the app's Component Families itself, from repeated elements in its JSX or rendered DOM, and feeds them into the same pipeline: Adapter, Contract, review, To-design. The first version supports React + Tailwind only. Any other app gets a plain message that names what it needs, instead of a crash.

How the families are found is designed in its own grill (the "Path A" session). It also covers what a found family becomes, given ADR 0005, and where the found families live. That work records its own ADR, which amends ADR 0005. This ADR records only the choice to support.

Decided by the owner in [#212](https://github.com/pawisssh/design/issues/212) (2026-10-21, "path A"; [comment](https://github.com/pawisssh/design/issues/212#issuecomment-6312844442)).

## Considered Options

- **Refuse plainly, and keep Vibe-to-Figma shadcn-only.** A preflight would name every missing input in one message and point to To-handoff against an existing Design System, which already works on such an app. Not chosen: it leaves such an app with no way into Figma.
- **Refuse now, with support as a revisit trigger.** Not chosen, for the same reason.
- **A separate skill with no Contracts for these apps** (path B). Not chosen: it would be a second pipeline beside Adapter → Contract → To-design, where path A reuses the one that exists.

## Consequences

- **#215 changes.** It was a refusal. It becomes the path-A preflight: route a React + Tailwind app with no shadcn to the new path, and give any other app the plain message. The `shadcn@undefined` pin message still becomes "the lockfile has no shadcn".
- **ADR 0005 must change.** It says a Contract is never written from a Prototype, and that a family built in an app stays a Component Proposal. Path A's ADR amends it.
- **SKILL.md's Inputs widen** when path A lands. Until then, the shadcn inputs stay its only supported path.
