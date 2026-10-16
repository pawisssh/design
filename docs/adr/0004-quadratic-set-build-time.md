# Quadratic Component Set build time is accepted

Building a Component Set costs about 1.6 ms × variants created × set size per call, so a family builds in quadratic time: Button's 245 variants take about 56s, and 539 variants took 263s. Calls are capped at 49 variants (measured in #32, see `skills/to-design/SKILL.md`). The owner accepted this in the joint review on 2026-10-16 instead of opening a probe for a faster build, because no family is that large yet and an update-free rerun stays fast.

## Revisit

When a family exceeds about 600 variants, probe the build cost before building it.
