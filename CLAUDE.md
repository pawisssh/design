## Tests

`npm test` runs every skill's suite and the CI scripts' (`.github/test`); CI runs it on each PR. Run `node scripts/fetch.mjs` first: it runs every skill's pinned fetch (`skills/*/scripts/sources.mjs` and `deps.mjs`), without which the tests that need them skip.

Before opening a PR, `git fetch origin` and run `npm run check`: CI's checks of the change against `origin/main` (no copied block of 8+ lines under `skills/`, no export nothing imports). For a PR stacked on another branch, set `BASE=origin/<branch>`.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `pawisssh/design`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
