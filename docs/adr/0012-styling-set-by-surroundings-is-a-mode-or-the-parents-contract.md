# Styling set by surroundings is a token mode or the parent's Contract

Some Code Libraries style a component by what surrounds it. Carbon resolves `$field` to `field-01`, but inside `<Layer>`, and so inside every Modal, ComposedModal, Dialog and OverflowMenu, it resolves to `field-02`. Carbon's ButtonSet stretches the Buttons it holds. shadcn/ui's ButtonGroup squares off its children's inner corners, and its Kbd changes colour inside a TooltipContent. A Contract still describes its Component Family on its own. Styling set by surroundings reaches a family in one of two ways, and nothing else carries it.

- **A token mode an ancestor picks.** Carbon's contextual tokens become a Layer collection in the Foundations document. These are the 15 layer sets in `@carbon/styles`, such as `layer`, `field` and `border-subtle`.
  - Its modes are Carbon's levels `one`, `two` and `three`.
  - Each variable aliases a Theme token per level, as `@carbon/styles` `layer/_layer-sets.scss` lists them, so Layer sits after Theme.
  - The Contract stays mode-free (ADR 0009) and binds the level-one token, as it already does for Theme.
- **The parent family's Contract.** Where a family styles the instances of another family it holds, it does so through ordinary rules on its own `family:<key>` instance nodes. The child's Contract does not change.
- **The Handoff records the surroundings, not the styling.** A usage records the usage it sits in and any mode that differs from its page's. A developer who composes the same way gets the Code Library's own styling.

Theme already works this way: the Contract binds `background`, and the page picks the mode (#61). Layer behaves like Theme, set by an ancestor and not by the component, so it is carried the same way. Every level-one token belongs to exactly one of Carbon's 15 layer sets, so a bound `field-01` maps back to `field` and on to `field-02` without ambiguity.

Decided by the agent standing in for the owner in [How is a component's styling carried when it depends on what surrounds it?](https://github.com/pawisssh/design/issues/97) (2026-10-17). The owner has not reviewed it yet.

## Considered Options

- **A Layer or context Property Axis on each family.** Rejected. It triples the variants of every family that uses a contextual token, and the axis value would be chosen by an ancestor, not by the component's props.
- **Synthesized tokens per level** (ADR 0009). Rejected. Carbon already names each level's token, so synthesizing adds names the Code Library does not need. A level is also a mode of the whole subtree, not one family's.
- **The child's Contract matches its ancestor** (a rule `match: {in: "tooltip"}`). Rejected. Every pairing would have to be a variant. The family would stop being describable on its own, and the parent's styling would be scattered across its children.
- **Leaving contextual tokens out of the Foundations document.** Rejected. The document carries the whole theme (#59), and To-handoff needs the per-level values to check and render a field inside a Modal.

## Consequences

- To-handoff renders a usage in its recorded mode, for example by wrapping the per-family render in `.cds--layer-two`. It resolves bound tokens through the Layer collection when it checks the usage's evidence.
- A child styled by an ancestor that is neither its parent's Contract nor a mode gets an info note in its Contract and nothing else. Examples are shadcn Kbd in TooltipContent and Calendar in Card.
- To-design does not yet build the Layer collection, and a Contract that binds `field-01` does not follow a Figma frame's Layer mode. Binding the contextual name instead is open.
- A parent Contract's anatomy has a fixed number of child instances. ButtonSet, ButtonGroup and ToggleGroup take any number in code.
