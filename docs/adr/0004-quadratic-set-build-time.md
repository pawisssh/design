# Quadratic Component Set build time is accepted

Building a Component Set costs about 1.6 ms × variants created × set size per call, so a family builds in quadratic time: Button's 245 variants take about 56s, and 539 variants took 263s. Calls are capped at 49 variants (measured in #32, see `skills/to-design/SKILL.md`). The owner accepted this in the joint review on 2026-10-16 instead of opening a probe for a faster build, because no family is that large yet and an update-free rerun stays fast.

## Revisit

When a family exceeds about 600 variants, probe the build cost before building it.

## Measured: combine once vs append

Probe #165 built the shadcn Button set in the smoke draft four ways, each on its own page. Method A is the current core: it seeds with `combineAsVariants([seed])` and then calls `appendChild` per call. Method B builds loose components 49 per call, then makes one final call that runs `figma.combineAsVariants(all, page)` and styles and places the grid. The per-variant content code was identical in both. 624 is the Button Contract with `button.omit-patch.json` applied in memory only, and 2304 is the full Contract. B′ is what was tried after B's final call failed. It uses B's loose phase, then one call that only runs `combineAsVariants`, then grid placement in calls capped at 60 s.

| Run | Calls ok / failed | In-call total | Wall total | Longest call | `combineAsVariants` | Grid placement |
|---|---|---|---|---|---|---|
| A-624 | 13 / 0 | 369.4 s | 397.5 s | 49.0 s | — | — |
| B-624 | 14 / 0 | 37.9 s | 62.1 s | 24.0 s (final call) | 3.2 s | 19.6 s |
| A-2304 | 67 / 5 | 4788.6 s | 5350.8 s | 107.3 s | — | — |
| B-2304 as specified | 48 / 2 | loose phase only: 68.4 s | 397.3 s | final call dropped at ~126 s, twice | no set committed | — |
| B′-2304 | 54 / 0 | 376.6 s | 468.5 s | 62.6 s | 46.9 s | 255.5 s |

- **In-call** is the sum of `Date.now()` deltas inside each successful call. **Wall** runs from the hook's package swap to the response and includes failed calls.
- **Ratios.** At 624, B is 9.7× faster than A in-call and 6.4× by wall. At 2304, B′ is 12.7× faster than A in-call and 11.4× by wall.
- **Identity.** A-624 and B-624 match variant by variant (cell, layers, fields, bindings), and so do A-2304 (set 91:10) and B′-2304 (set 90:5), with no differences.
- **The limit.** No per-call limit is documented. Every failure is consistent with a ceiling of about 2 min per `use_figma` call.
  - B-2304's final call dropped with "MCP server connection lost" at 126.9 s and again at 126.1 s.
  - Each time it rolled back, leaving 2304 loose components and no set.
- **Why B failed.** `combineAsVariants` alone fits in a call: 3.2 s at 624 and 46.9 s at 2304, roughly quadratic. What does not fit at 2304 is combine plus grid placement in one call. `setGridChildPosition` costs about 31 ms per move at 624 and 89–120 ms per move at 2304, about 255 s in total.
- **A also exceeds the limit at 49 per call.** It failed at set size 1274, after its longest successful call took 107.3 s (1176–1225).
  - From 1274 it finished at 41–36 variants per call up to 1466, then 30–16 per call.
  - A's total cost is about 1.7–1.9 ms × variants created × set size, which sums to about N²/2 whatever the per-call size, so the A totals remain comparable.
- **A's five failures.**
  - Four came back as "An unexpected error occurred" and committed nothing. The 1274 call was re-run at a smaller size, and the other three passed on retry.
  - The fifth (833–882) created its variants but lost its response. Its in-call time is estimated at 73.1 s.
- **B's loose calls** took 1–1.9 s per 49 variants. That is nearly flat: the pre-pass grew from about 80 ms to 300 ms as the page filled.
- **Setup deviations.**
  - The shadcn Foundations were built as "shadcn Theme" and "shadcn Layout" in a separate probe ledger, so they do not collide with Carbon's collection names.
  - Variants were adopted by name.
  - The prototype Contract was approved in memory only. The shadcn Button Contract stays draft.
  - The probe core's per-phase counters (`T.style`, `T.moves`) were added partway through the runs. They read timers only and do not change what is built.
- **Run order.** The runs ran one after another against the same file, which held more pages as it went. B-2304 ran before A-2304.

**Conclusion.** The decision rule requires B to be at least 3× faster than A at 2304 and to stay under the limit. It did not fire, because B as specified cannot finish its final call at 2304. No follow-up issue was opened. B′ is 12.7× faster than A and stays under the limit, with a longest call of 62.6 s. It builds an identical set. It changes the core's call shape, though: one combine-only call, then placement resumed across calls. The owner can weigh whether to adopt it. Either way, at 2304 variants A also needs smaller calls than 49 per call.
