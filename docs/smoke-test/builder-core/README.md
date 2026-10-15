# Builder core smoke test (use_figma)

Throwaway evidence for the wayfinder ticket "Smoke-test the builder core via use_figma on a draft file". Not merged.

- `native-builder-core.js`: minimal fixed core `buildComponentSets(figma, plan, state)` that runs one plan slice per call (`foundations` | `components` | `all`).
- `make_plan.py`: generates the smoke plan (Carbon Button: 5 kinds x N sizes x 4 states, approximate White/G100 colors).
- `gen-*/build-components.mcp.js`: packages from `skills/code-to-canvas/scripts/package_native_builder.py`, sent to `use_figma`.
- `state-*.json`: ledger fed between slices (variable IDs from the foundations call).
- `results.json`: measurements, probes and node IDs.
