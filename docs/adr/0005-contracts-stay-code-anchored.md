# Contracts stay code-anchored

A Contract is only ever written by an Adapter reading a Code Library, never from a Figma Design Library or a prototype, because its `source` pins and `code` mapping are what let a handoff tell a developer the exact import and props. A Component Family that does not exist in code yet is described as a Component Proposal instead (Contract-shaped, no `source` or `code`), which is retired when the Adapter reads the built component into a real Contract. Figma and prototypes are inputs to To-handoff, not sources of Contracts.

## Considered Options

- Derive Contracts from a Figma Design Library: rejected, Figma has no commit, file hashes, imports or props, so `source` and `code` would be empty and approval would mean nothing.
- A Contract with `status: proposed`: rejected, it breaks the rule that every Contract is backed by code, and every reader would have to special-case it.

## Consequences

- A Component Proposal built in an app rather than the Code Library stays a Proposal that records where it was built, because no Adapter reads the app, so no Contract can be anchored there (#80).
- A Proposal is retired when a Contract takes its place: one the Adapter read from the built component, or an existing one the owner chose instead. Nothing from the Proposal is copied into that Contract (#80).
- To-design may build a Component Set from a Proposal ahead of code, but the set never feeds a Contract. At retirement the Contract adopts the set in place and rebuilds it from the Contract; owner tweaks in Figma write into the Proposal, never into a Contract (#79).
- Amended 2026-10-21 by [ADR 0016](0016-a-prototype-with-no-code-library-gets-an-extracted-library.md) ([#249](https://github.com/pawisssh/design/issues/249)): a Prototype with no Code Library gets an Extracted Library generated from its repeated elements, and its Contracts are read from that library, never from the Prototype itself. A Proposal built in a Prototype that has a Code Library still stays a Proposal.
