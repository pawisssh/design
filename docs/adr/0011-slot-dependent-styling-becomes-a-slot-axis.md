# Slot-dependent styling becomes a Slot axis

Some Code Libraries style a component by whether a slot is filled. shadcn/ui's Button, for example, pads `px-4` and narrows to `px-3` when it holds an icon (`has-[>svg]:px-3`). Carbon's Tag does the same with `:has(.cds--tag__custom-icon)`. Where a slot's presence changes a field on another node of the same Component Family, the Adapter makes that presence a Slot axis.

- The Slot axis is a non-canonical Property Axis that names its slot.
- Its values are an empty one and a filled one (`none` and `icon`).
- Ordinary `{match, set}` rules carry the styling that differs.
- The slot's visibility is a `visible` layout field set by those rules, so validation can tie it to the axis value.
- The Slot axis replaces that slot's BOOLEAN.
- A slot whose presence changes nothing else keeps its BOOLEAN. Carbon's Button is one: it reserves its end padding with or without an icon.

A Figma component property of type BOOLEAN can only show or hide a layer, so it cannot change the parent's padding. Only a variant can. Making the variant explicit in the Contract keeps the schema change to one optional axis field, one optional value field and one layout field. It also leaves both fixed builder cores unchanged (ADR 0001): To-design writes `visible` as the variant's layer visibility, which the cores already apply.

Decided by the agent standing in for the owner in [How does a Contract carry styling that depends on a filled slot?](https://github.com/pawisssh/design/issues/88) (2026-10-17), and checked end to end on shadcn's Button in To-preview. The owner has not reviewed it yet.

## Considered Options

- **Rules that match a BOOLEAN property.** Rejected. Figma still needs a variant, so the builder would turn the BOOLEAN into a hidden axis. Every consumer of tuples would then have to translate it: expansion, the selection, To-preview, Handoffs and readback names.
- **One flattened padding with a note.** Rejected. It loses the exact value that a Generic Adapter's output is checked against.
- **A separate Component Family per slot state.** Rejected. Families stay code-anchored (ADR 0005), and the code has one Button.

## Consequences

- **More variants.** A Slot axis doubles a family's variants where the slot is optional.
  - shadcn Button grows from 192 to 288, after icon-only sizes without an icon are omitted.
  - A family with several such slots multiplies further. ADR 0004's limit of about 600 variants applies, and the owner narrows the matrix in To-preview.
- **The Figma property changes.** Designers flip a variant property where they used to flip a BOOLEAN.
  - Its values are labelled False/True so that Figma can show it as a toggle. This is unverified, and it is a label choice that is cheap to change.
- **Child state and composition are not Slot axes.**
  - A child's state (`has-focus`, `has-aria-invalid`) stays on the State or attribute axes.
  - Styling that depends on what the consumer composes around the component (a parent group, a nested family) is not carried by a standalone Contract.
