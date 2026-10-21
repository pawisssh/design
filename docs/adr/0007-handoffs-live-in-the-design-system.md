# Handoffs live in the Design System

A Handoff, its last signed-off copy, its screenshots and its Renderings live in `design-systems/<ds>/handoffs/<feature-key>/`, beside the Contracts and Component Proposals it uses, not with the Prototype or in the developer's code. The Prototype is read, never edited (only Figma-to-Vibe edits it, ADR 0017); the developer's project is not To-handoff's to write; and which Handoffs use a Component Proposal is found by scanning Handoffs, so they must sit where the Design System can see them. A Handoff pins what it was made from (the Prototype's file hashes, each used Contract and Proposal by `contentHash`, and a hash of only the Foundations tokens it references), and Drift is computed from those pins, never stored.

## Considered Options

- In the Prototype's repo, next to the code it describes: rejected, To-handoff never writes to the Prototype, and a v0 or Lovable repo is thrown away once the feature is built.
- In the developer's repo: rejected, it may not exist yet, and To-handoff never scaffolds or writes into a developer's project.
- Only as a published page (an Artifact, Confluence, Notion): rejected, it cannot be scanned for Proposal usage or diffed between revisions. A published Rendering is a copy stamped with the Handoff's revision and `contentHash`, never a source.
- Pinning the whole Foundations document's `documentHash`: rejected, every new Contract changes it (ADR 0006), so every Handoff would drift at once.
