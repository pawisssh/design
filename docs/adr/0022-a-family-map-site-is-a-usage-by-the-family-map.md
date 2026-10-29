# A Family map site is a Usage by the Family map, found again in the code and pinned by the map's hash

A path A Prototype ([ADR 0016](0016-a-prototype-with-no-code-library-gets-an-extracted-library.md)) never imports its Extracted Library: each family is inline JSX. Against its own Design System folder, To-handoff therefore can't recognise a Usage by import. Instead, it reads the folder's Family map ([#265](https://github.com/pawisssh/design/issues/265)):
- **Each site the map records is a Usage of its family's Contract.** It is recorded with `match.by: "family-map"` and needs no decision. The map is read when the Prototype has the files it names. A map that names none of them belongs to another Prototype, and is not read. A map that names only some of them is refused, as stale.
- **Vibe-to-Figma's extraction finds the sites again.** `familySites` in `skills/vibe-to-figma/scripts/extract.mjs` runs the extraction on the Prototype as it is now. It refuses when the result is not the map, and asks for the folder step to run again. Each site comes back with its file, line and column, and its axis values. To-handoff joins its own elements to the sites by `file:line:col`. To-handoff never rebuilds the map's JSX paths, and the map never holds lines.
- **The axis values come from the site's classes,** read the same way the Contract's values were. An axis whose `className` ternary switches it between values is left out of the tuple, because no single value is right. `match.switches` names its values (`{"selected": ["on", "off"]}`).
- **`source.familyMap` pins the map file's hash,** and only on a Handoff that read it. A map that changed or is gone is Drift: the folder step regrouped the sites the Usages stand for.

## Considered Options

- **Per-site axis values stored in the Family map:** rejected. The map is the record of the grouping, by JSX path and never by line or classes ([#261](https://github.com/pawisssh/design/issues/261)). A site's values follow from its classes, so storing them would duplicate the code and go stale with it.
- **The tuple carries the default value of a switched axis:** rejected. It would say the site is always "off" when the code switches it, and validate couldn't tell.
- **No pin, Drift by the Contracts alone:** rejected. A regrouping can move a site from one family to another while both Contracts stay byte-identical.

## Consequences

- To-handoff depends on Vibe-to-Figma's extraction for this route, as Vibe-to-Figma already depends on To-handoff's readers.
- A recorded Handoff that read no map keeps its bytes: `source.familyMap` is written only when a map was read.
- An Extracted Library's Foundations may lack the surface tokens that pick the Prototype's mode, because its colours can all stay raws. generate then compares nothing, and its note says which mode it assumed.
- Plain HTML's markup sites wait on [#528](https://github.com/pawisssh/design/issues/528).
