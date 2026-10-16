# Dropped variants become ledger orphans

When a new selection drops variants, they follow the same rule as tokens that drop out of the closure (#22 user story 50): they become orphans in the ledger and are deleted only through a prune list the owner confirms, after an instance count. The owner chose this in the joint review on 2026-10-16 over leaving them in the set as `extra` and deleting them by hand in Figma, so the ledger keeps tracking them and re-selecting a dropped variant reuses its id.

## Status

Decided, not built. #67 builds it. Until then To-design reports a dropped variant as `extra` (see `skills/to-design/SKILL.md`, "After a Contract edit").
