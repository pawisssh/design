---
name: contract
description: The shared Contract (component.json) and foundations document reference used by every other skill. Use when reading, writing, validating or editing a Contract or a foundations document, or when writing an Adapter.
---

# Contract

The neutral, shared skill: the one place that defines the **Contract** (one `component.json` per Component Family) and the **Foundations document** (one per Design System). It knows no Code Library and no Figma API. The Adapter skills write these documents; `to-preview` and `to-design` read and edit them.

## Reference

- [Contract schema](references/contract-schema.md): every field of a Contract, its match patterns, rules and value forms. Read before writing or editing a Contract.
- [Foundations schema](references/foundations-schema.md): collections, modes, variables, scopes, codeSyntax and Text Styles, plus the foundations ledger. Read before generating or reading a foundations document.
- [Mapping](references/mapping.md): how the older hand-off files (selection manifest, expected file, layout and token plans, build plan) map onto the Contract.

## Instances

Committed instances live in the project, per Design System: `design-systems/<designSystem.key>/<designSystem.key>.foundations.json` and `design-systems/<designSystem.key>/contracts/<family>.component.json`. The pilot is [`design-systems/carbon/`](../../design-systems/carbon/).

## Coming next

This skill will also hold the formal JSON Schema and `scripts/contract.mjs`, the single implementation of validate, expand, match/resolve, token closure and apply-omit (#24), and the Adapter guide (#34). Until #24 lands, the research expander on branch `research/skills-split` is the only checker.
