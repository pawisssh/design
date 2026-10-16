# Form-control content is one node per version, and code names what no axis sets

A form control's content changes with its variant in ways a Button's does not. Carbon's TextInput shows a red
`WarningFilled` icon and `invalidText` when invalid, a two-tone `WarningAltFilled` icon and `warnText` when warned,
and `helperText` otherwise. It also needs props that no variant sets, such as `id`. Select adds a list of options
that the feature supplies. The Contract carries all of this with the schema it has, plus two optional `code` fields:

- **Visibility.** A node that shows only in some variants is in the anatomy once. It is hidden with a `visible: false` layout rule (ADR 0011's field, set by any rule) wherever Carbon leaves it out of the DOM.
- **Content that differs per variant is one node per version.**
  - One INSTANCE per icon (`Invalid icon` is `icon:warning--filled`, `Warn icon` is `icon:warning--alt--filled`), each shown by its validation value. The icon list adds every fixed `icon:<key>` in the anatomy.
  - One TEXT node and one property per message (`invalidText`, `warnText`), each naming one code prop. A Handoff snippet leaves out a TEXT prop whose node the variant hides.
- **A border on one side is its own FRAME** (`Underline`), because a node has one `strokeWeight`.
- **`code.required`** names props the component requires that no axis value or property sets (`["id"]`). To-preview gives a placeholder, and a Handoff gives the Usage's id.
- **`code.items`** names a family's Repeated children (`{component: "SelectItem", props: ["value", "text"]}`).
  - The Contract never lists them. A Handoff's Usage does.
  - A TEXT property with `code.itemProp` shows one Repeated child's text in Figma.

All of this keeps both fixed builder cores unchanged (ADR 0001). Visibility, instances and text are wiring the cores already apply.

Decided by the agent standing in for the owner in [What does the Contract schema need for form-control families?](https://github.com/pawisssh/design/issues/93) (2026-10-17). Checked on TextInput and Select three ways: `check.mjs`; every selected tuple rendered with real `@carbon/react` and compared node by node with `resolve()`; and a To-design build on the mock Figma. The prototype is on `prototype/form-schema`. The owner has not reviewed it yet.

## Considered Options

- **A per-rule icon or a per-variant code prop on one node.** Rejected. Either one changes what a bound instance or a property means per variant. The cores would need to swap a main component, or the snippet would rename a prop, per variant. One node per version needs no new mechanism.
- **Per-side `strokeWeight` fields.** Rejected for now. It would be a core change, and a FRAME draws a 1px underline exactly.
- **The Handoff or To-preview inventing required props per family.** This is what #90 did, with a per-family table. Rejected: the Adapter can read the requirement from the code, and every consumer needs it.
- **Listing a Select's options in the Contract.** Rejected. The options belong to the feature, so they vary per Usage, not per variant.

## Consequences

- **More layers.** Hidden layers add to the anatomy. TextInput has 2 icons and 3 messages where Carbon renders at most 1 of each.
- **Two-tone icons lose their second colour.** An icon is one flattened Vector (#13). `WarningAltFilled`'s black inner mark becomes a cut-out, and the Contract says so in a `verify` note.
- **To-preview cannot force Focus over Carbon's invalid outline.** That outline is styled on `:not(:focus)`. The Contract follows Carbon (focus wins), and only the preview differs.
- **The Handoff gains `items` on a Usage.** It has no written schema yet, so the field is defined by the prototype sample until it does.
