# Lane worker

A lane is an ordered list of tickets one session works for an orchestrator session. The orchestrator's brief names the lane and its order; this file holds the rules every lane shares, so a later "same rules" message needs no repeat.

## Per ticket

1. Read the issue (`gh issue view <n> -R pawisssh/design --json …`) and check it is not already shipped.
2. Branch from `origin/main`: `claude/<issue>-<slug>`.
3. Work test-first (`tdd`); the failing test comes before the change.
4. Run only `npm run test:skills -- <skill>` for each skill touched, then `git fetch origin && npm run check`. The full `npm test` is CI's.
5. Run `code-review` (Standards and Spec) on `git diff origin/main...HEAD` and fold the findings in or name them in the PR.
6. Open one PR per ticket with a `pr`-skill body (Summary, Evidence, Merge Danger) and `Closes #<n>`. Then stop and report the PR number; the orchestrator merges and sends the next ticket.

## Never

- Merge your own PR, Sign off or approve a Handoff or Contract, or write under `design-systems/`. A ticket that seems to need the last two is a stop-and-report.
- Rebase, `git reset --hard` or force-push. Bring a branch up to date by merging `origin/main`.

## A decision that is hard to reverse

Write it as an ADR under `docs/adr/` and say so in the PR. An easily reversed choice with no new dependency needs none; say that in the PR too.
