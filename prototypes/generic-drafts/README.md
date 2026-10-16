# Prototype: the Generic Adapter's drafted values (#65)

Throwaway evidence for [How are the Generic Adapter's agent-drafted values marked, approved, and graduated?](https://github.com/pawisssh/design/issues/65). This folder is never merged. It answers the question with measurements.

## What it does

1. **Library.** `harness/fetch-library.mjs` copies shadcn/ui (`radix-nova`, Button, Card, Alert, `globals.css`) as the shadcn CLI installed it on `prototype/source-link` (c2b4f98), into `library/`. See `library/ORIGIN.txt`.
   - The tooling comes from the npm registry only: `@tailwindcss/node` 4.3.3, `typescript` 6.0.3, `shadcn` 4.22.0. Run `npm install --ignore-scripts` in `harness/`.
2. **Exact tier.** `harness/extract.mjs` reads the following and writes `out/exact.json`. Re-runs are byte-identical.
   - CSS variables per mode and `@theme inline`.
   - cva through the TS AST.
   - Function components: data-slot, element, prop unions, defaults, class strings.
   - Every candidate class, compiled by Tailwind (a fresh `compile()` per class).
3. **Agent tier.**
   - The briefs: `DRAFT-BRIEF.md` (v1) and `DRAFT-BRIEF-v2.md` (v2, which adds keying rules).
   - Fresh-context subagents drafted everything the exact tier leaves out, three times per brief: `out/run-{1,2,3}.json` and `out/v2-run-{4,5,6}.json`.
   - Each entry is `{value, evidence, confidence}`.
4. **Churn.** `diff.mjs`, `causes.mjs`, `fields.mjs` and `residual.mjs` count what changed between runs, and why.
5. **Upgrades.**
   - `make-v2.mjs`: Button lg `h-9`→`h-10`; Alert gains `warning`; Card gains a comment line.
   - `make-v3.mjs`: Card gains a `card-media` part and its footer becomes `flex-col`; Card title `text-base`→`text-lg`; Alert drops its icon column; Button `xs`→`xxs`.
   - `carry.mjs stamp|carry [--fine]` fingerprints each draft's evidence and splits a re-run into carried, reopened, vanished and missing.
   - `compare.mjs` scores a re-draft against the approved values.
   - `REDRAFT-BRIEF.md` is anchored: it shows the previous value. `REDRAFT-CONTROL-BRIEF.md` shows only the keys.

## Results

| Measurement | Result |
|---|---|
| v1 drafts, 3 fresh runs | 179 keys; 49% stable; 46% pairwise change |
| v1 cause of the 91 unstable keys | 66 key names the agent chose; 9 prose only; 16 real judgement |
| v2 drafts (keying rules), 3 fresh runs | 141 keys; 72% stable (74% without prose); 20% pairwise change on judged keys |
| Like for like (kinds both briefs draft, no prose) | v1 47% stable, 48% pairwise change → v2 74% stable, 20% pairwise change |
| v2 residual by field | `properties.code` 17 keys (an unspecified shape); anatomy layer `name` 13 (a naming convention); real taste ~12 |
| Projected residual (name by rule, `code` from the exact tier) | 12 of 138 keys (9%) unstable. **Projected, not measured.** |
| Drafter confidence → share on an unstable key (v2) | high 12%, medium 37%, low 53% |
| Upgrade v2, coarse fingerprint (whole family) | 82 carried, 59 reopened |
| Upgrade v2, fine fingerprint (per key kind) | 133 carried, 8 reopened (all Alert, from the new `warning` value), 1 missing |
| Re-draft of the 59 coarse-reopened keys, **anchored** on the approved value | 0 of 57 changed (+1 new label); 8 checked by hand, all still correct |
| Same, **unanchored** control | 16 of 57 changed (28%), including `button.family.split` and `figma.grid` |
| Upgrade v3 with fine rev 1 (`carry-fine1.mjs`) | 3 false carries: Card `card-content`/`card-footer` order after a new part; Alert root `direction` after its icon column went |
| Upgrade v3 with fine rev 2 (`carry.mjs`) | 78 carried, 62 reopened, 1 vanished (`xs` label), 2 missing (`xxs` label, `card-media` part), no known false carry |

## Caveats

- The fine rules (rev 1) were written after the v2 coarse result, so the v2 fine figure is fitted. v3 was written after rev 1 and found 3 false carries. Rev 2 was then fitted to v3. No fourth unseen upgrade was run.
- One agent model drafted every run, and the sample is 3 families from one Code Library.
- The library is `radix-nova`, not the `new-york-v4` style that #70 measured.
- `approved*.json` simulates an owner approval of `v2-run-4.json`. No owner reviewed it.
