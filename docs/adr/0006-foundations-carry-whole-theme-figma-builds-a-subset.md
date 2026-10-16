# The Foundations document carries the whole theme; To-design builds a selected subset

The Foundations document holds the Code Library's whole theme (for Carbon: every Theme token, the whole palette as Primitives, every Layout group and every Type style; about 700 variables), not only the Contracts' token closure, because To-handoff matches raw prototype values against it. Component tokens stay limited to families that have a Contract. `usedBy` says which Contracts use a variable, and `closure.tokens` becomes a record instead of the scope. The rule is Adapter-neutral: each Adapter names its Code Library's theme source.

To-design does not build all of it in Figma. By default it builds the closure plus the Spacing and Size groups; the owner adds whole groups, and the choice is kept in the per-file ledger. Alias targets and Text Style binds are pulled in automatically, a dropped group's variables become ledger orphans, and a selection over the `use_figma` cap runs in several calls. The owner chose this on 2026-10-16 in [How does the Foundations document carry a Code Library's whole theme?](https://github.com/pawisssh/design/issues/59). So a Design Library with about 80 Figma variables can sit beside a document with about 700.

## Considered Options

- A per-collection `fullScales` list: rejected, someone would keep deciding which groups are whole, and any group left out is a gap To-handoff cannot match against.
- A separate full-theme document: rejected, it contradicts the decision that the one Foundations document carries the whole theme, and two documents would drift.
- Build the whole document in Figma: rejected, about 192K characters of package against a 50K cap, and hundreds of variables no Contract uses in the owner's pickers.

## Status

Decided, not built. Until it is, the Carbon Adapter generates the closure plus full `spacing-*` and `size-*` scales, and To-design builds every variable in the document.
