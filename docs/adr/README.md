# Decisions

Hard-to-reverse decisions, one file each. Read the ones that touch the area you work in.

## Revisit list

Re-open a decision when its trigger happens.

| Decision | Trigger |
|---|---|
| [0002 Strict Contract rule 5](0002-strict-contract-rule-5.md) | A family cannot satisfy rule 5 |
| [0004 Quadratic set build time](0004-quadratic-set-build-time.md) | A family exceeds about 600 variants |
| [0010 Drafted values carry over by evidence fingerprint](0010-drafted-values-carry-over-by-evidence-fingerprint.md) | A re-run carries a Drafted value whose correct value moved |
| [0011 Slot-dependent styling becomes a Slot axis](0011-slot-dependent-styling-becomes-a-slot-axis.md) | A family needs more than two Slot axes, or Figma does not show a False/True Slot axis as a toggle |
| [0012 Styling set by surroundings is a Mode or the parent's Contract](0012-styling-set-by-surroundings-is-a-mode-or-the-parents-contract.md) | A family a destination spec uses is styled by an ancestor that is neither a Mode nor its parent's Contract |
| [0013 Form-control content is one node per version](0013-form-control-content-is-one-node-per-version.md) | A family needs a border whose width changes on one side per variant, or Repeated children that nest (SelectItemGroup) |
| [0014 Vibe-to-Figma supports a Tailwind app without shadcn](0014-vibe-to-figma-supports-a-tailwind-app-without-shadcn.md) | A Prototype that is neither React + Tailwind nor shadcn has to reach Figma |
| [0015 The runtime reader reads computed paint, spacing and radius](0015-the-runtime-reader-reads-computed-paint-spacing-and-radius.md) | A runtime run's tie requests or Off-system values are too many for the owner to review at Sign-off |
