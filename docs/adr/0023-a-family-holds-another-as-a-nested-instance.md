# A family holds another as a nested instance, kept in its own Design System and set by the holding family's Contract

A Component Family that renders another, whether the Prototype's own family or a Carbon component, holds it as an `INSTANCE` node `family:<key>` ([#317](https://github.com/pawisssh/design/issues/317)).
- **The holding family's Contract sets that instance's variant and property values per variant,** in an `instances` list of `{match, set}` rules. It styles the instance through its own `layout` and `paint` rules, as [ADR 0012](0012-styling-set-by-surroundings-is-a-mode-or-the-parents-contract.md) decided.
- **The held family keeps its own Contract and set in its own Design System.** A dependency names that Design System with `designSystem`; without it, the family is in the holding Contract's own.
- **Both are built into one Figma file, each under its own ledger.** Held families are built first, in topological order over `dependencies.families`, and an instance resolves by tuple through the held family's ledger.
- **The Coverage check reads each nested instance's variant. The Edit check reads its variant, property values and overrides,** never the held family's own contents.
- **A held family's change rewrites no holding variant.** Figma carries it into the instances.

Decided by grilling, #317.

## Considered Options

- **Carbon copied into the Prototype's Design System:** rejected. A Design System is for one Code Library, and the copy would fork Carbon once per app.
- **Library instances imported by key from another file:** rejected. Import by key is unverified ([ADR 0008](0008-design-library-binds-a-linked-library-by-reference.md)), the ledger would hold another file's keys, and the Edit check would read a component it can't write.
- **A Linked Library's components:** rejected. A Linked Library lends variables and Text Styles only (ADR 0008).
- **The tuple written as layout fields, or as one fixed value on the anatomy node:** rejected. The first mixes non-layout values into layout. The second can't vary per variant, as a Loading icon or a `canGoBack` back button does.
- **Text overrides by path inside a held instance:** rejected. They bypass the held family's properties, and Code Connect can't map them.
- **An icon-only trigger drawn as its bare icon:** rejected. It flattens Carbon into the app family, and it loses that the trigger is a menu for Code Connect and the Handoff.
- **The held Contract fingerprinted into the holding family:** rejected. Every Button edit would rewrite or hold every variant that holds a Button.

## Consequences

- `validate` checks one Contract's `instances` shape. The held family's tuple and property keys are checked by To-design's build plan, where both Contracts are loaded.
- A Proposal's dependency in another Design System counts only when it names that Design System's approved Contract.
- `icons(contract)` lists the swap values in `instances`, so their icon atoms are built in the holding Design System.
- A build whose families hold another Design System's families loads one ledger per Design System (#594).
