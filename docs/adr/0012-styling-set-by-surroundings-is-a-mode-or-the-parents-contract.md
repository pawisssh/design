# Styling set by surroundings is a Mode or the parent's Contract

Some Code Libraries style a component by what surrounds it.

- Carbon resolves `$field` to `field-01`, but to `field-02` inside a `<Layer>`. Modal and ComposedModal bodies and Dialog content are all inside one, because `LayerContext` defaults to level 1 and an unset `<Layer>` renders `cds--layer-two`.
- Carbon's ButtonSet stretches the Buttons it holds.
- shadcn/ui's ButtonGroup squares off its children's inner corners.
- shadcn/ui's Kbd changes colour inside a TooltipContent.

A Contract still describes its Component Family on its own. Styling set by surroundings reaches a family in one of two ways, and nothing else carries it.

- **A Mode an ancestor picks.** Carbon's contextual tokens become a Layer collection in the Foundations document.
  - These are the 15 layer sets in `@carbon/styles`, such as `layer`, `field` and `border-subtle`.
  - Its Modes are Carbon's levels `one`, `two` and `three`. Each variable aliases a Theme token per level, so Layer sits after Theme.
  - The Contract binds the name the Code Library's CSS uses: `field` where Carbon writes `$field`, and `field-01` where it writes `$field-01`.
- **The parent family's Contract.** Where a family styles the instances of another family that it holds, it does so through ordinary rules on its own `family:<key>` instance nodes. The child's Contract does not change.
- **The Handoff records the surroundings, not the styling.** A usage records the usage it sits in, and any Mode that differs from its page's. A developer who composes the same way gets the Code Library's own styling.

Theme already works this way: the Contract binds `background`, and the page picks the Mode (#61). A Layer level is set by an ancestor and not by the component, so it is carried the same way, and the Contract stays free of Modes (ADR 0009).

The binding must keep Carbon's own name because 49 rules in the compiled CSS use a level-one token literally. For example, `.cds--modal .cds--text-input--fluid .cds--text-input` stays `field-01` inside a modal. A Contract bound to `field-01` alone could not tell that rule from a contextual `$field`.

Decided by the agent standing in for the owner in [How is a component's styling carried when it depends on what surrounds it?](https://github.com/pawisssh/design/issues/97) (2026-10-17). The owner has not reviewed it yet.

## Considered Options

- **A Layer or context Property Axis on each family.** Rejected. It triples the variants of every family that uses a contextual token, and the axis value would be chosen by an ancestor, not by the component's props.
- **Synthesized tokens per level** (ADR 0009). Rejected. Carbon already names each level's token, and a level is a Mode of a whole subtree, not one family's.
- **Bind the level-one token and translate it per level.** Rejected. It mistranslates the 49 literal uses.
- **The child's Contract matches its ancestor** (a rule `match: {in: "tooltip"}`). Rejected.
  - Every pairing would have to be a variant.
  - The family would stop being describable on its own.
  - The parent's styling would be scattered across its children.
- **Leaving contextual tokens out of the Foundations document.** Rejected. The document carries the whole theme (#59). To-handoff needs the per-level values to check and render a field inside a Modal.

## Consequences

- **Foundations.** Each Mode records the CSS selector that switches to it, such as `.cds--layer-two`, `.cds--g100` or `.dark`. To-handoff finds a usage's Mode from its nearest such ancestor.
- **To-handoff.** It renders a usage in its recorded Mode by wrapping the per-family render in that selector.
- **To-design.** A Contract binding `field` pulls the Layer collection into the build subset. A Figma frame set to a Layer Mode then shifts the fields inside it.
- **To-preview.** Its catalog accepts only one multi-Mode collection, so Carbon with Layer breaks it until that changes.
- **Neither way covers a child styled by some other ancestor.** That styling gets an info note in the child's Contract and nothing else. Examples are shadcn Kbd in TooltipContent and Calendar in Card.
- **Fixed child counts.** A parent Contract's anatomy has a fixed number of child instances, while ButtonSet, ButtonGroup and ToggleGroup take any number in code.
