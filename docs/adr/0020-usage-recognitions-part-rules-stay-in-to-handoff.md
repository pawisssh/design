# Usage recognition's part rules and its import-to-Contract rule stay in To-handoff, not in the Adapter

To-handoff decides two things about a Code Library component it reads:
- **Part rules:** whether the component is part of a Container (a CardFooter in a Card, ModalBody in Modal) or a Usage of its own (a Button in a Card);
- **Import-to-Contract rule:** which Contract the component's import names.

Both rules stay inside To-handoff's Usage recognition, and no Adapter has a say in them. The part rules depend on how the Code Library ships, not on which Adapter reads it:
- In a package that puts every component in one module (`@carbon/react`), a part is named after its Container.
- In a local `ui/` folder with one family per file, anything from the Container's module is a part.

A Container's Slot axis part is named Container plus slot (Card + Footer, Modal + Footer) in both. If the Adapters owned these rules, the Carbon and Generic Adapters would each carry the same two branches. The owner chose this on 2026-10-24, in the architecture review that deepened Usage recognition out of `generate()`. The same review decided that a prop that picks a different Contract (`<Button hasIconOnly>` is Icon Button, #347) is part of the import-to-Contract rule, so it stays in To-handoff until a second skill needs it.

## Considered Options

- **The Adapter answers whether a component is a part of a Container**: rejected. Both Adapters would implement the same rule twice, so the variation sits in how a library ships, not in the Adapter. The architecture review that proposed it read #226 (a Carbon fix that changed only `generate.mjs`) as a sign the seam was misplaced. That fix changed the package branch of a rule both Adapters share.
- **The Contract carries the discriminating prop (`code.when`), read by To-handoff and Vibe-to-Figma's path C (#317)**: deferred. #317 is the only other skill that needs the rule, and it is not built yet.

## Consequences

- A Code Library whose parts follow neither rule, such as Chakra's namespaced `Card.Body`, reopens this decision: the part rule then becomes the Adapter's.
- Once #317 needs the import-to-Contract rule, it moves into `contract/` as Contract data, so both skills read one rule.
