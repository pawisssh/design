# Carbon Drafted values (#94)

Evidence for [Is the Carbon Adapter a Dedicated Adapter while an agent writes its Contracts?](https://github.com/pawisssh/design/issues/94). Never merged.

## What it does

`count-carbon.mjs` puts every value in a Carbon Contract into one of five classes:

| Class | Meaning |
|---|---|
| read | A token, CSS selector, code prop, default or exclusion read from pinned source |
| computed | An `info` raw computed from tokens, with the derivation in `reason` |
| constant | A `warning` raw: a Sass constant with no token, with the constant in `reason` |
| rule | A value that `skills/adapter-carbon/SKILL.md` §2, or the canonical State axis, names outright |
| drafted | A value the agent judged inside the procedure: a Drafted value (ADR 0010) |

`try-drafted.mjs` adds a `drafted` map to the approved Button Contract and runs `validate()` and `contentHash()`.

## Run

From the repo root:

```bash
node prototypes/carbon-drafted/count-carbon.mjs design-systems/carbon/contracts/button.component.json
```

```bash
git show origin/prototype/no-contract:design-systems/carbon/contracts/text-input.component.json > .scratch/text-input.component.json
```

```bash
node prototypes/carbon-drafted/count-carbon.mjs .scratch/text-input.component.json
```

```bash
node prototypes/carbon-drafted/try-drafted.mjs
```

Outputs are in `out/`.

## Results

| | Button (main, approved) | TextInput (`prototype/no-contract`, draft) |
|---|---|---|
| read | 90 | 40 |
| computed (info raw) | 11 | 14 |
| constant (warning raw) | 3 | 6 |
| rule (§2 names it) | 25 | 18 |
| **drafted** | **at most 33** | **at most 58** |
| total | 162 | 136 |

- **Drafted Button values:**
  - 16 axis and value labels;
  - `family.description`, the Icon Button split, the `Label` layer and `label` property, and the per-kind icon binds;
  - 7 layout scalars;
  - `icons.default` and `icons.preferred`;
  - `figma.description`, `figma.grid` and `code.alwaysEmit`.
- **Upper bound.** Every layout `direction`, `width`, `height`, `align*` and `textResize` counts as drafted unless it was checked against the pinned SCSS. Only Button's root `direction` (`display: inline-flex`) and `width` (`inline-size: max-content`) were checked, and both are read. Several TextInput scalars probably read from `display: flex` or `inline-size: 100%` too.
- **TextInput's 58** includes the Active state folded into Focus (`css ":focus, :active"`). §2 has no fold rule, so today that is the agent's call. With a fold rule it is 57.
- **`try-drafted`:**
  - `validate()` accepts an unknown top-level `drafted` key. The only error is rule 8.
  - `contentHash` covers `drafted`, so adding it to the approved Button voids the owner's approval (`4a9e9f38…` → `6890708d…`).
- **Classifier limits.** `family.split` is a hardcoded match on the description, and the anatomy and property split is by role and type. The detail lists in `out/` show every call.
