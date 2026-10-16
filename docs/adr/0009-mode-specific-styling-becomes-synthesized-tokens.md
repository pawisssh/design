# Mode-specific component styling becomes Synthesized tokens; the Contract stays mode-free

Some Code Libraries style a component differently per mode inside the component itself. shadcn/ui's outline Button, for example, carries `dark:bg-input/30`, and its default Button carries `hover:bg-primary/90`. Wherever a Contract `paint` value is not one Code Library token in every mode (it differs by mode, is a token at an opacity, or mixes tokens), the Adapter adds a Synthesized token to the Foundations document's Theme collection. The token holds one value per mode, and the Contract binds it as a plain `{token}`, named after where it is used (`button-outline-fill`).

Figma can switch a component's look by mode only through a bound variable, so a variable must exist wherever this logic lands. Making it in the Adapter leaves the Contract schema, rule 5, To-preview and both fixed builder cores (ADR 0001) unchanged. It also matches Carbon, which ships its own per-mode component tokens (`button-primary-hover`).

Decided by the agent standing in for the owner in [How does a Contract carry mode-specific component styling?](https://github.com/pawisssh/design/issues/70) (2026-10-17). The owner has not reviewed it yet.

## Considered Options

- **Mode-aware Contract rules or values** (`match: {mode: "dark"}`, a per-mode value form): rejected. Figma would still need a variable, which the builder would then have to synthesize inside a fixed core. The other way to show them is per-mode variants, which make Theme an axis: the variant count doubles, and instances stop following their frame's mode.
- **One global flat name per opacity** (`primary-90`): rejected. It would be a theme-level raw-value match candidate beside `primary`, the ambiguity ADR 0006 keeps component tokens out of, and the list grows with every opacity used. `/` is also Figma's group separator.
- **A Contract `{token, alpha}` value drawn with Figma paint opacity**: rejected. `dark:` makes the opacity itself mode-specific, so it covers only half the cases, at the cost of a schema and builder change.

## Consequences

- The Foundations document now holds names the Code Library does not define. Each one says it is synthesized in `source`, and its `codeSyntax` gives the utilities that produce it.
- A Synthesized token aliases the Code Library's Theme tokens within the same collection. So the document orders Synthesized tokens after Code Library tokens, and To-design's subset rule must pull those alias targets in.
