# A Prototype with no Code Library gets an Extracted Library

Some Prototypes are styled by Tailwind classes written straight into their JSX, with no Code Library behind them. The owner's batch-sell app is one: a single `App.tsx` and no shadcn. For such a Prototype, Vibe-to-Figma finds the Component Families among the Prototype's repeated elements and writes an Extracted Library: one generated React + cva component per family, committed in the Design System folder's `library/` sub-folder. The Generic Adapter reads that library as it reads any installed-source Code Library.

This amends ADR 0005, whose rule, a Contract never written from a Prototype, would otherwise leave such an app with no Contracts. The amendment is narrow. The Contracts are read from the Extracted Library, never from the Prototype itself, so `code` names a real component with real props, and developers adopt the library, never the Prototype's code.

Decided with the owner by grilling on 2026-10-21, path A of [#212](https://github.com/pawisssh/design/issues/212); spec [#249](https://github.com/pawisssh/design/issues/249).

## Considered Options

- **A Contract anchored to the Prototype's source sites.** Rejected. A Contract's `code` names a component, its import and each axis value's props, and an inline family has none of these, so the schema and every reader of `code` would change. The Contract's `source.files` would hold `App.tsx`, so any edit to that one file voids every family's approval.
- **The found families as Component Proposals.** Rejected. A Proposal fits ADR 0005 as written, but it has no `source`, so a rerun cannot tell which family's code changed. It has no `code` either, so To-preview has nothing to render.
- **An agent reads the Prototype and names the families.** Rejected for cost and stability. A script reads the JSX statically, groups the elements, and reads axes from className ternaries and from differences between sites. The agent judges only names, merges and labels, in one batch.

## Consequences

- **Static only.** Extraction reads the JSX and never runs the Prototype.
- **What feeds a family file.** Each generated file is a pure function of its family's class strings and names, and the Prototype's files are never in a Contract's `source.files`. So an edit redrafts only the family it touches.
- **The Family map.** A committed file records which Prototype elements make each family, identified by their place in the code, not by line or classes. It keeps the families the agent chose and the owner's corrections across reruns.
- **The Generic Adapter's inputs grow.**
  - It reads cva `compoundVariants`.
  - It uses the Tailwind version the project's lockfile resolves, checked against its integrity.
  - It carries the Tailwind default-palette colours a family uses as tokens in the Foundations document. Arbitrary values stay raws.
- **Preview.** The renderer installs the project's own React version.
- **What a Handoff names.** A Handoff against such a Design System names Extracted Library components that the Prototype does not import. That is intended: developers adopt the library.
- **Where it applies.** A Prototype with `components.json` keeps the shadcn path. Anything other than React JSX styled by Tailwind classes, such as plain HTML, a Carbon app, or CSS or SCSS classes, is out of scope and refused plainly.
- Amended 2026-10-22 by [ADR 0019](0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md) ([#325](https://github.com/pawisssh/design/issues/325)):
  - **Static only** holds for families, axes and rules. A reader may build the element tree by server-rendering components in Node. It may build it in a browser only once that tree is the same on every run ([#323](https://github.com/pawisssh/design/issues/323)).
  - **What feeds a family file.** A family file may also come from the CSS rules its class strings are transcribed from ([#327](https://github.com/pawisssh/design/issues/327)).
  - **Pins.** The Generic Adapter's Tailwind and the renderer's React fall back to the Adapter's own pins when the Prototype resolves none (#327).
  - **Where it applies.** Plain HTML styled by CSS classes is no longer out of scope (#327). It is refused until its reader lands ([#339](https://github.com/pawisssh/design/issues/339)). A React app styled by CSS or SCSS classes, Carbon or not, waits on [#310](https://github.com/pawisssh/design/issues/310).
- Amended 2026-10-23 by [#332](https://github.com/pawisssh/design/issues/332), for a family whose subtree holds parts, other families or both, such as the chat card of [#322](https://github.com/pawisssh/design/issues/322)'s plain HTML Prototype, a card with a typed prompt and two Buttons:
  - **What a family file renders.** It renders the family's whole subtree as the Prototype nests it, wrappers included, each element with its own classes and a `data-slot` that names it as a part. Where another family's site sits inside it, the file imports that family's component and renders it in place, with the site's axis values as literal props. The Contract reads it as a Nested instance, in the form [#317](https://github.com/pawisssh/design/issues/317) decided: a `family:` node whose values per variant are `instances` rules. A rule of the outer family that styles it is passed as its `className`, which the Contract reads as that node's own paint and layout rules.
  - **What enters through props.** Text the feature chooses is a prop. Repeated children come in as `children`, as a Select's options do. Children that differ between sites with no axis to explain them come in as `children` too, and that family is a Container.
  - **What feeds a family file.** It reads its own class strings, or the CSS rules they come from, and its names. For each family it nests, it reads only that family's key, its component name and the axis and value keys each site takes, never that family's classes. A Contract's `source.files` never holds a nested family's file.
    - So a style edit to Button that keeps its axis and value keys leaves the chat card's file byte-identical, and the chat card's approval stands.
    - Moving one of its Buttons to another variant, or renaming Button's axes, redrafts the chat card.
  - **Order.** A nested family is generated before any family that holds it. A family that holds itself, directly or not, is refused.
