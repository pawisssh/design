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
| [0014 Vibe-to-Figma supports a Tailwind app without shadcn](0014-vibe-to-figma-supports-a-tailwind-app-without-shadcn.md) | A kind of Prototype needs a pipeline other than Adapter → Contract → To-design to reach Figma |
| [0015 The runtime reader reads computed paint, spacing and radius](0015-the-runtime-reader-reads-computed-paint-spacing-and-radius.md) | A runtime run's tie requests or Off-system values are too many for the owner to review at Sign-off |
| [0016 A Prototype with no Code Library gets an Extracted Library](0016-a-prototype-with-no-code-library-gets-an-extracted-library.md) | A family's look cannot be written as a cva of Tailwind utilities, whether from its class strings or transcribed from its CSS rules |
| [0017 Vibe-to-Figma stays one-way](0017-vibe-to-figma-stays-one-way.md) | The owner wants a Figma edit to reach the code without running Figma-to-Vibe |
| [0018 A screen may have Extra states](0018-a-screen-may-have-extra-states.md) | Extra states multiply on one screen, or a Code Library ships a state pattern the five Standard states should absorb |
| [0019 A Prototype reaches Component Sets or a Handoff by its kind](0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md) | A vibe-coding tool defaults to a kind of Prototype this decision does not support, or a supported kind's gap has no ticket |
| [0020 Usage recognition's part rules stay in To-handoff](0020-usage-recognitions-part-rules-stay-in-to-handoff.md) | A Code Library's parts follow neither rule (Chakra's `Card.Body`), or Vibe-to-Figma's path C (#317) needs the import-to-Contract rule |
| [0021 An Adapter may evaluate a Code Library's compiled theme](0021-an-adapter-may-evaluate-a-code-librarys-compiled-theme.md) | CDS ships a token file or tags its releases, or an Adapter needs to run a Code Library's code beyond the named compiled modules |
| [0022 A Family map site is a Usage by the Family map](0022-a-family-map-site-is-a-usage-by-the-family-map.md) | A family's site can't be found by its JSX path again (a component inlined twice, a site in a `.map` with per-item classes), or a reviewer needs the axis a ternary switches resolved per screen state |
| [0023 A family holds another as a nested instance](0023-a-family-holds-another-as-a-nested-instance.md) | A Prototype needs a held family from a file other than the target (a Carbon library imported by key), or a consumer-swappable slot that takes any family |
