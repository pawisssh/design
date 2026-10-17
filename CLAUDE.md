## Tests

`npm test` runs every skill's suite; CI runs it on each PR. Run `node skills/adapter-carbon/scripts/sources.mjs` and `node skills/adapter-generic/scripts/sources.mjs` first, or 45 adapter-carbon and 114 adapter-generic tests skip. Run `node skills/to-handoff/scripts/deps.mjs` too, or the to-handoff tests and adapter-generic's catalog measurements skip.

## Worktree agents

An agent isolated in a worktree runs each command as its own plain call from the worktree root, with literal paths and one `git` command per call. Put multi-step logic in a script file and run that. The worktree guard refuses shell variables, loops and heredocs around commands.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `pawisssh/design`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
