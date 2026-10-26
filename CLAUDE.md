## Tests

`npm test` runs every skill's suite and the CI scripts' (`.github/test`); CI runs it on each PR. Run `node skills/adapter-carbon/scripts/sources.mjs`, `node skills/adapter-generic/scripts/sources.mjs` and `node skills/adapter-cds/scripts/sources.mjs` first, or the adapter tests that need them skip. Run `node skills/to-handoff/scripts/deps.mjs` too, or the to-handoff tests and adapter-generic's catalog measurements skip. The vibe-to-figma tests need both the adapter-generic tools and those deps.

Before `gh pr create`, rebase on a fresh `origin/main` (`git fetch origin && git rebase origin/main`), commit, and run `npm run pr-check`: CI's pull-request-only checks (a copied block of 8+ lines, an unused export) on the committed branch against `origin/main`, or `BASE=<ref>` for a stacked PR.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `pawisssh/design`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
