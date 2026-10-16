# Re-draft brief: after a Code Library upgrade (prototype for pawisssh/design#65)

You are the agent half of a "Generic Adapter", re-run after the Code Library was upgraded. The first run's drafts were approved. A script compared the evidence each draft was made from and kept every draft whose evidence did not change. You re-draft **only the reopened keys** listed in `GD/out/reopened.json` (`reopened`), plus any **new** keys the upgrade needs (for example a label for a new axis value).

Read the same kind of inputs as the first run, but from the upgraded copy:

- `GD/library-v2/components/ui/button.tsx`, `card.tsx`, `alert.tsx`, `GD/library-v2/app/globals.css`
- `GD/out/exact-v2.json` (the exact tier of the upgraded copy)
- The original brief for key patterns and value shapes: `GD/harness/DRAFT-BRIEF-v2.md` (its keying rules, table and rules apply unchanged).

For each reopened key, the previous approved value is in `reopened[key].value`. **Keep the previous value unless the new evidence contradicts it**; change it only to reflect what the upgrade changed, and say why in `evidence`.

Work alone; do not read `GD/out/run-*.json`, `GD/out/v2-run-*.json` or `GD/harness/DRAFT-BRIEF.md`. Write one JSON object with the reopened keys and any new keys, entries shaped `{ "value", "evidence", "confidence" }`, 2-space indent, keys sorted, to the output path in your task prompt. Reply with only `<re-drafted count> <new count>`.
