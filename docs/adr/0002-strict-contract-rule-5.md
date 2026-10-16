# Strict Contract rule 5

Rule 5 in [contract-schema.md](../../skills/contract/references/contract-schema.md) requires every field that any rule sets for a node to resolve in every selected variant, not only the per-node-type minimum. The builder then never falls back to a Figma default, so every built value has a source in the Contract. The owner kept it strict in the joint review on 2026-10-16, over relaxing it to the per-node-type minimum. Button passes.

## Revisit

When a family cannot satisfy rule 5, add an explicit empty value to the Contract schema (a field set to "none" on purpose) rather than relaxing the rule.
