# To-handoff's runtime reader reads computed paint, spacing and radius; raw text metrics are Off-system values

To-handoff matches colour, spacing and radius from a Prototype's source CSS declarations. A React Prototype styles itself with Tailwind classes, which To-handoff does not compile (SKILL.md, "Out of scope so far"), so those declarations are empty. The runtime reader already renders the app and reads computed styles, but it keeps only the text metrics. As a result, every React Handoff has `styles: []` in every region and `values: []`. This is true of the committed v0 Handoff (`design-systems/shadcn/handoffs/request-access`) as well as the batch-sell live test ([#212](https://github.com/pawisssh/design/issues/212)). The Off-axis rule can never fire, and a Handoff with no colour information can be signed off.

The decision has four parts.

- **Computed paint, spacing and radius.** On a runtime run, the reader reads each element's computed colour, spacing and radius, at the widest breakpoint like the text metrics, into the region's `styles`. A Contract usage's own computed colours feed the Off-axis rule. These are the matcher's existing roles: background, text, border and outline colour; padding, margin and gap; border radius. Static runs and HTML Prototypes keep matching from source declarations.
- **A reference beats a value.** A computed value has lost its `var()`, and several tokens can share a value. In shadcn's light mode, for example, `background`, `card` and `popover` are all white. So when the built stylesheet's rule names a token (`.bg-card { background-color: var(--color-card) }`), that token wins. Matching by value is the fallback, and a tie left after it is a `token-tie` request, as today.
- **Raw text metrics are Off-system values.** Each distinct raw text metric (size, line height, weight, letter spacing) becomes one Off-system value. It is deduplicated, carries its nearest Text Styles, and shows as ≠ in the Rendering, the same as a colour that matches no token.
- **Off-system values do not block Sign-off.** `review` lists every one, with its nearest tokens, so the owner sees them before approving, and the owner's Sign-off covers them. A near match is already a request, so what is left is genuinely off-system.

Reading the browser's computed result is not compiling Tailwind, so the SKILL.md line stays. What changes is that runtime runs no longer depend on source declarations for these roles.

Decided by the owner in [#212](https://github.com/pawisssh/design/issues/212) (2026-10-21: Q2 and Q3 "yes", Q4 and Q5 "as recommended").

## Considered Options

- **Keep runtime styles out of scope.** Rejected: every React Handoff stays colourless, and the Off-axis rule stays dead.
- **Compile Tailwind classes statically.** Rejected: it would reimplement Tailwind's resolution for each version, and the browser already has the result.
- **Computed values only, matched by value.** Rejected: every shared-value token becomes a `token-tie` request, even where the built CSS names the token.
- **One owner question per run about the Off-system values, or one blocking question per value.** Rejected: a Tailwind-palette app has dozens of them, so the questions would swamp the run. Sign-off is where the owner accepts them.

## Consequences

- **More requests on a runtime run.** These are near and tie requests for colours, spacing and radii, and `offAxis` questions on Contract usages whose computed colour their tuple does not paint.
- **The `offSystem` schema changes.** An entry today holds one `role` and one raw value per mode. A text metric has four parts. The spec for [#218](https://github.com/pawisssh/design/issues/218) decides the shape.
- **`review` gains an Off-system section**, and the Rendering's "Needs a look" gains a ≠ row for each run that has one.
- **The `runtime.mjs` comment on its properties** ("Colours and spacing still match from the source declarations") and SKILL.md section 3, step 4, change with the implementation.
