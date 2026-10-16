# A Design Library binds a Linked Library by reference and never writes it

When the owner already has a published Figma library for the same Code Library (a Linked Library), To-design still builds its Component Sets in its own Design Library file, and binds the Contracts' tokens to the Linked Library's variables and Text Styles instead of creating its own. Each Foundations document token is matched to the Linked Library by reference only: a codeSyntax naming the token, the same Figma name, or a last path segment that is the flat name or ends in `(<flat-name>)`. A rule counts only when exactly one candidate of the same type matches. A value is never a key, only a check. The owner confirms the whole link once, in chat, and it is kept in the Design Library's ledger. Tokens with no confirmed link get the Design Library's own variables, so a mixed Design Library is the normal case. The ownership rule is not relaxed: linked variables live in another file that the Design Library cannot edit, `conflict: unowned` and `adopt` keep their meaning, and To-design never builds into the Linked Library's own file. Decided in [How does To-design bind to a library the owner already has, instead of creating variables?](https://github.com/pawisssh/design/issues/75), 2026-10-17. The owner reviews it after the fact.

## Considered Options

- Match by codeSyntax only: rejected. The Carbon v11 Community kit carries no WEB codeSyntax on any of its 548 Theme variables. On its spacing variables it puts the same codeSyntax on the positive and the negative variable. The owner's own v3 file has no codeSyntax on any variable.
- Match by value: rejected as a key. In the kit, one Button token value is held by as many as 77 variables (`#0f62fe` by 36, `16` by 40).
- Reuse `adopt`, or relax `conflict: unowned` to a read-only local mode: rejected. `adopt` takes ownership, which means To-design writes. A local read-only mode would put To-design's objects inside the owner's file.
- Link all or nothing: rejected. On the kit, only 36 of the Button document's 75 variables have a counterpart. The Primitives, Size, Icon size, Border radius and Type variables have none, and the kit has no local Text Styles.
- Let the library value win silently when it differs from the document: rejected, because Figma would then disagree with the code (ADR 0005).

## Status

Decided, not built. Import by key, binding a library variable, switching a library collection's mode, and how the published version relates to the library file's current state are unverified in the Plugin API.
