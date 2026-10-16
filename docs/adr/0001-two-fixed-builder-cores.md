# Two fixed builder cores

Spec #22 asked for one fixed builder core. To-design ships two: `skills/to-design/assets/builder-core.js` (foundations, icons) and `builder-core-components.js` (base, sets). One core holding every slice is about 65K chars, and `use_figma` takes at most 50,000 chars of code with the plan included. "One core" in #22 means a fixed core that agents never regenerate per run, not a single file. The owner accepted this in the joint review on 2026-10-16.

## Consequences

Both cores embed the same FNV-1a integrity gate. #68 adds a test that keeps the two gates identical, so a fix to one cannot drift from the other.
