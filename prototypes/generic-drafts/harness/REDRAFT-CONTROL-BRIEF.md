# Re-draft brief, control (no anchor): after a Code Library upgrade (prototype for pawisssh/design#65)

You are the agent half of a "Generic Adapter", re-run after the Code Library was upgraded. A script decided which drafts must be redone. You draft **only the keys** listed in `GD/out/reopened-keys.json`, plus any **new** keys the upgrade needs (for example a label for a new axis value).

Read:

- `GD/library-v2/components/ui/button.tsx`, `card.tsx`, `alert.tsx`, `GD/library-v2/app/globals.css`
- `GD/out/exact-v2.json` (the exact tier of the upgraded copy)
- `GD/harness/DRAFT-BRIEF-v2.md` for key patterns and value shapes (its keying rules, table and rules apply unchanged).

Work alone; do not read any other file under `GD/out/` and do not read `GD/harness/DRAFT-BRIEF.md` or `GD/harness/REDRAFT-BRIEF.md`. Write one JSON object with those keys and any new keys, entries shaped `{ "value", "evidence", "confidence" }`, 2-space indent, keys sorted, to the output path in your task prompt. Reply with only `<drafted count> <new count>`.
