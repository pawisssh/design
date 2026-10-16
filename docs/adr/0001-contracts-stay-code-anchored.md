# Contracts stay code-anchored

A Contract is only ever written by an Adapter reading a Code Library, never from a Figma Design Library or a prototype, because its `source` pins and `code` mapping are what let a handoff tell a developer the exact import and props. A Component Family that does not exist in code yet is described as a Component Proposal instead (Contract-shaped, no `source` or `code`), which is retired when the Adapter reads the built component into a real Contract. Figma and prototypes are inputs to To-handoff, not sources of Contracts.

## Considered Options

- Derive Contracts from a Figma Design Library: rejected, Figma has no commit, file hashes, imports or props, so `source` and `code` would be empty and approval would mean nothing.
- A Contract with `status: proposed`: rejected, it breaks the rule that every Contract is backed by code, and every reader would have to special-case it.
