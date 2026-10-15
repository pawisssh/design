# Spike: deliver packages to `use_figma` through a PreToolUse hook (#16)

Pieces:
- `.claude/settings.json` registers the hook. It matches `mcp__.*__use_figma`, uses `onFailure: "block"`, and has a 10 s timeout.
- `.claude/hooks/use-figma-package.mjs` is the hook script. It expands the stub only when the code is exactly the stub. It checks the sha256 against both the stub and `script-package.json` `fileSha256`, keeps the path inside the project, and enforces at most 50,000 chars. On any failure it exits 2. Unmarked calls pass through. It logs to `.claude/hooks/use-figma-package.log` (gitignored).
- `skills/code-to-canvas/scripts/package_native_builder.py` now records `fileSha256` and prints `chars` and `stub`. Run it from the repo root, because the stub path is relative to the repo root.

Probe:
- `probe-core.js` is a probe `buildComponentSets`. It creates or reuses page `probe-16` and returns FNV-1a-32 `CHECK` values. It nests the smoke-test core, unused, so the package reaches a realistic size.
- The probe was packaged with `plan-c100.json` and `state.json` into `gen/`, giving 24,394 chars and sha256 `02cd5fe3…fe70`.
- `node expected-check.mjs` gives the expected result: `{"planLen":14892,"entries":100,"plan":"0f68f207","state":"3233b49e","core":"ffccefd9"}`.

Regenerate and print the stub:

```bash
python3 skills/code-to-canvas/scripts/package_native_builder.py docs/spike/package-hook/probe-core.js docs/spike/package-hook/plan-c100.json docs/spike/package-hook/gen --state docs/spike/package-hook/state.json
```

Results are in the #16 resolution comment.
