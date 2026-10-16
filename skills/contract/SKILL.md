---
name: contract
description: Contract (component.json) and foundations document schemas, plus the one module that validates, expands, resolves and hashes a Contract. Use when writing, editing, validating or approving a Contract, writing a foundations document, or writing an Adapter.
---

# Contract

The neutral, shared skill: the one place that defines the **Contract** (one `component.json` per Component Family) and the **Foundations document** (one per Design System). It knows no Code Library and no Figma API. The Adapter skills write these documents; `to-preview` and `to-design` read and edit them.

## Reference

- [Contract schema](references/contract-schema.md): every field of a Contract, its match patterns, rules and value forms. Read before writing or editing a Contract.
- [Foundations schema](references/foundations-schema.md): collections, modes, variables, scopes, codeSyntax and Text Styles, plus the foundations ledger. Read before generating or reading a foundations document.
- [Adapter guide](references/adapter-guide.md): what any Adapter must produce, and how to get from Code Library source to a draft Contract (variants, anatomy, CSS to layout fields, rules, raw values, icons, Code Connect). Read before writing an Adapter or a Contract.

## Instances

Committed instances live in the project, per Design System: `design-systems/<designSystem.key>/<designSystem.key>.foundations.json` and `design-systems/<designSystem.key>/contracts/<family>.component.json`. The pilot is [`design-systems/carbon/`](../../design-systems/carbon/).

## Contract module

[`scripts/contract.mjs`](scripts/contract.mjs) is the only implementation of the Contract logic. Never re-implement expansion, rule matching, the closure or the hash elsewhere; import or inline this file. It is pure, synchronous JavaScript with no imports and no node, browser or Figma API (sha256 included), so the builder core and the To-preview page can inline it. Every function takes parsed JSON and never mutates its input.

| Function | Returns |
|---|---|
| `validate(contract, foundations)` | `{ok, errors: [{rule, at, message}]}` for the rules in [Validation](references/contract-schema.md#validation), including rule 6 (tokens inside their variable's scopes) and rule 8 (approval `snapshotId` and `contentHash`). |
| `expand(contract)` | The selected tuples, `{axisKey: valueKey}` in axis order. |
| `baseTuple(contract)`, `variantName(contract, tuple)`, `tupleKey(contract, tuple)` | The Base Component tuple; the Figma name `Kind=Primary, Size=Large, State=Enabled`; the value keys joined in axis order (`primary\|lg\|enabled`), an internal id that never leaves a tool. |
| `matches(pattern, tuple)` | Whether a match pattern covers a tuple. |
| `resolve(contract, tuple)` | `{layout, paint, from, binds}`: per node, the fields after every matching rule (later wins) and `sameAs`; `from["layout.Button.gap"]` is the index of the rule that set the field; `binds[propertyKey]` is the property binds for the tuple. |
| `closure(contract)` | The sorted token names the selected variants use, skipping `was`. |
| `icons(contract)`, `iconName(key)` | The Contract's icon keys (`default` first, then `preferred`); the kit-style Figma name (`arrow--right` → `Arrow--right`). |
| `applyOmit(contract, patch)` | A draft copy with To-preview's omit patch applied (replaces `selection.omit`). Throws on another family or `snapshotId`. |
| `asDraft(contract)` | A copy with `status: "draft"`, `approval: null`. Use it on every Contract write. |
| `approve(contract, at, {prototype})` | A copy approved by the owner: `{by: "owner", at, snapshotId, contentHash}`. Call it only after the owner's explicit "approve" in chat. Throws while a `warning` note is open. `prototype: true` writes `by: "orchestrator (prototype)"` (`PROTOTYPE_APPROVER`), which rule 8 rejects, so it never stands in a committed Contract. |
| `scopeFor(contract, node, field, key)`, `coversScope(scopes, need)` | The VariableScope a token bound at `node.field` needs (rule 6; `key` for an effect's nested reference), or undefined; whether a variable's `scopes` cover it. |
| `draftedValue(contract, key)`, `draftedKey(section, match, node, field)` | `{found, value}` or `{found: false, why}` for a [`drafted`](references/contract-schema.md#drafted-values) key (rule 9); the key of a value a layout or paint rule sets, `layout{"size":"sm"}.Box.height` under a non-empty match. |
| `contentHash(contract)`, `sha256(text)` | `sha256:<hex>` of the canonical Contract without `selection.status` and `selection.approval`; hex sha256 of a string's UTF-8 bytes. |

[`scripts/io.mjs`](scripts/io.mjs) is the file side, for node only: `readJson`, `foundationsPathFor(contractPath, given)` (the given path, else the single `*.foundations.json` next to the `contracts/` folder) and `writeJson(path, value, {from})`. Every tool that writes a Contract writes through `writeJson`: it splices the changed values into the file's existing text, so hand-aligned lines and inline objects stay as they were and a diff shows only what changed.

From the command line: `node skills/contract/scripts/check.mjs <component.json> [--foundations <file>] [--table]` validates and prints the variant count, Base Component, token closure and, with `--table`, the resolved paint for the grid rows. It exits 1 on a validation error and 2 when a file cannot be read. Tests: `node --test skills/contract/test/*.test.mjs`.

The formal JSON Schema is [`contract.schema.json`](contract.schema.json).
