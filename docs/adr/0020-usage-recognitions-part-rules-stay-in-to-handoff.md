# Usage recognition's part rules and its import-to-Contract rule stay in To-handoff, not in the Adapter

To-handoff decides two things about a Code Library component it reads, and no Adapter has a say in either:
- **Part of a Container, or a Usage of its own?** A CardFooter in a Card is a part; a Button in a Card is its own Usage. This is `isPart`, `partsOf` and `slotTuple` in `skills/to-handoff/scripts/generate.mjs`.
- **Which Contract its import names.** This is `contractOfImport`. It also covers a prop that picks a different Contract, such as `<Button hasIconOnly>` as Icon Button ([#347](https://github.com/pawisssh/design/issues/347)).

The part rule depends on how the Code Library ships, and To-handoff's React reader already records that as a component's kind: `ds` for a package, `ui` for a local `ui/` folder.
- A package holds every component in one module (`@carbon/react`). There, a part is named after its Container (ModalBody in Modal).
- A local `ui/` folder holds one family per file. There, anything from the Container's module is a part.

In both cases, a part that fills a Container's slot is named Container plus slot (Card + Footer is CardFooter). The owner chose this on 2026-10-24, in the architecture review that deepened Usage recognition out of `generate()` ([#379](https://github.com/pawisssh/design/issues/379)).

## Considered Options

- **The Adapter answers whether a component is a part**: rejected. Both the Carbon Adapter and the Generic Adapter would carry the same two branches. The review that proposed this pointed to [#226](https://github.com/pawisssh/design/issues/226), a Carbon fix that changed To-handoff and no Adapter, as a sign the seam was misplaced. That fix added the rule's package branch, and that branch depends on how the library ships.
- **The Contract names the prop that picks it, and both To-handoff and Vibe-to-Figma's path C ([#317](https://github.com/pawisssh/design/issues/317)) read it there**: deferred. #317 is the only other skill that needs the rule, and it is not built yet.

## Consequences

- A Code Library whose parts follow neither rule, such as Chakra's namespaced `Card.Body`, reopens the part rule for the Adapter.
