# Vibe-to-Figma supports a Tailwind app without shadcn

Vibe-to-Figma was written for a Prototype with a shadcn Code Library: `components.json`, the Code Library folder under `aliases.ui`, and the Generic Adapter's pins. A Prototype with no shadcn, such as a Vite + React + Tailwind app whose whole UI is in one `App.tsx`, crashed with a raw ENOENT before it wrote anything (the batch-sell live test, [#212](https://github.com/pawisssh/design/issues/212)).

Vibe-to-Figma will support such an app instead of refusing it. It finds the app's Component Families itself, from repeated elements in its JSX or rendered DOM, and feeds them into the same pipeline: Adapter, Contract, review, To-design. The first version supports React + Tailwind only. Any other app gets a plain message instead of a crash.

How the families are found is designed in its own grill and spec (path A), which records its own ADR. This ADR records only the choice to support.

Decided by the owner in [Decide: vibe-to-figma without shadcn, and runtime styles in to-handoff](https://github.com/pawisssh/design/issues/212) (2026-10-21), choosing path A over a refusal and over path B; recorded in [this comment](https://github.com/pawisssh/design/issues/212#issuecomment-6312844442).

## Considered Options

- **Refuse plainly, and keep Vibe-to-Figma shadcn-only.** A preflight would name every missing input in one message and point to To-handoff against an existing Design System, which already works on such an app. Rejected: it leaves such an app with no way into Figma.
- **Refuse now, with support as a revisit trigger.** Rejected for the same reason.
- **A separate skill with no Contracts for these apps** (path B). Rejected: it would be a second pipeline beside Adapter → Contract → To-design, where path A reuses the one that exists.

## Consequences

- **#215 changes.** It was a refusal. It becomes path A's preflight: a React + Tailwind app with no shadcn goes to path A, and any other app gets the plain message. The `shadcn@undefined` pin message still becomes "the lockfile has no shadcn".
- **ADR 0005 must change.** It says a Contract is never written from a Prototype, and that a family built in an app stays a Component Proposal. Path A's ADR amends it; this ADR does not.
- **Vibe-to-Figma's SKILL.md Inputs widen** when path A lands. Until then, the shadcn inputs stay its only supported path.
- Amended 2026-10-22 by [ADR 0019](0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md) ([#325](https://github.com/pawisssh/design/issues/325)):
  - **Families come from the Prototype's source, never its rendered DOM** ([#323](https://github.com/pawisssh/design/issues/323)).
  - **"React + Tailwind only" now describes the Extracted Library, not the Prototype.** A plain HTML Prototype enters the one pipeline through a library transcribed from its CSS rules ([#327](https://github.com/pawisssh/design/issues/327)). A React app styled by CSS or SCSS classes enters through its own components ([#310](https://github.com/pawisssh/design/issues/310)).
  - **Which kinds of Prototype are supported, per output, is ADR 0019's.**
