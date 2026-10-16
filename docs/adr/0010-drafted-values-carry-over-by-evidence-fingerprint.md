# Drafted values carry over by evidence fingerprint and sit in a side table

The Generic Adapter's agent drafts what standard formats leave out: axis and value labels, anatomy, properties, layout, excluded combinations, icons and the Figma grid. A Contract records each of these Drafted values in an optional top-level `drafted` map. Each entry is keyed by the value's path, such as `axes.size.values.lg.label` or `anatomy.card-footer`, and holds `{by: "agent", evidence, fingerprint}`. When the owner corrects a value, its entry becomes `{by: "owner", was}`. The value itself stays in its usual place in the Contract, so builders, To-preview and both fixed builder cores (ADR 0001) read Contracts unchanged.

On a re-run, the Adapter keeps an agent entry verbatim while its fingerprint is unchanged, approved or not. The fingerprint is the sha256 of the exact-tier facts its key kind is drafted from. An entry whose fingerprint moved is re-drafted with its previous value as the anchor ("keep it unless the new evidence contradicts it"). An entry whose subject is gone is dropped. Owner entries are always kept.

In the prototype ([`prototype/generic-drafts`](https://github.com/pawisssh/design/tree/prototype/generic-drafts/prototypes/generic-drafts)), fresh drafting changed 20% of judged values between runs even with keying rules. An unanchored re-draft changed 16 of 57 approved values after an upgrade. An anchored re-draft changed none, and all of them were still correct. Labels and layer names become Figma property and layer names, and instance overrides follow them, so a label that changes on every run breaks the owner's files.

Decided by the agent standing in for the owner in [How are the Generic Adapter's agent-drafted values marked, approved, and graduated?](https://github.com/pawisssh/design/issues/65) (2026-10-17). The owner has not reviewed it yet.

## Considered Options

- **Re-draft from scratch on every run, as a Handoff's agent decisions are (#64)**: rejected for Contracts. Measured churn is 20% per run, and a Contract's labels are names that Figma files and code mappings depend on. Handoffs keep their own rule.
- **Inline `by: "agent"` on each value, as near matches carry it in a Handoff (#55, #61)**: rejected. Labels, names and booleans are plain strings or scalars in a Contract, so marking them inline changes the shape every reader parses. The `{by: "owner", was}` form for token and raw values stays as it is.
- **A stored confidence per draft**: rejected. The drafter's confidence predicts churn only loosely (high 12%, low 53% on an unstable key). The owner reviews every draft anyway. Adding it later is an optional field, so the choice is reversible.
- **One fingerprint per Component Family**: rejected. A one-class change reopened 59 of 141 drafts, against 8 for per-kind fingerprints.

## Consequences

- `drafted` is part of `contentHash`, so the owner's one approval of the Contract covers every Drafted value, as Sign-off covers every agent mark in a Handoff. A re-run on an unchanged snapshot writes nothing, and the approval stands. A changed snapshot voids it as before, and the review then shows only the reopened, new and vanished entries.
- Keys are fixed by rule, never chosen by the agent. A node is keyed by `data-slot`, or by the source token that addresses it. A property is keyed `<node>.<characters|visible|mainComponent>`. Fields a rule can derive leave the agent tier: family name, Figma page and Component Set name, the State axis label and Text Style composition.
- The fingerprint rules must over-reopen rather than miss. A first version missed 3 changes on an unseen upgrade: sibling order after a new part, and a layout class behind a bracketed variant. The rules are a revisit trigger.
