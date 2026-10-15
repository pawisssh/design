# Layout and token mapping: code ↔ Figma

Read for CSS layout/sizing, typography, variable naming and Light/Dark alias mapping. Consume the producer’s source-backed per-anatomy plan and translate it into native Figma construction. This is an interpretation guide, not a lossless automatic CSS converter.

## Determine where Auto Layout belongs

Inspect DOM/component structure, authored CSS and computed styles together. Record each layout-owning container and its actual visual children. Keep meaningful nested layout containers; omit inert wrappers only if they contribute no layout, clipping, styling or state behavior.

- A row of in-flow children usually maps to a HORIZONTAL Auto Layout frame; a stacked column maps to VERTICAL. Each nested container receives its own layout decision. Button → icon/label, card → header/body/footer, and toolbar → action groups may need several frames.
- `display: flex` / `inline-flex` supplies direction, alignment and wrap evidence. A block-flow stack can also be modeled with VERTICAL Auto Layout when behavior is equivalent; resolve margins, collapsing and spacing first.
- For CSS grid, inspect tracks, spans, alignment and responsive changes. Use Figma GRID only when the connected executor supports the needed properties. Otherwise model an equivalent nested row/column structure or separate breakpoint variants and record limitations. A Figma layout guide grid is not a CSS grid layout engine.
- Keep badges, overlays, focus decorations and source `position: absolute` children out of the flow when appropriate. Auto Layout can coexist with absolute children. Preserve source anchors/constraints.
- `position: relative` can establish an anchor for absolute descendants without taking the node out of flow. Figma `layoutPositioning: AUTO` means participation in Auto Layout, not a requirement to write CSS `position: relative`.
- Figma `layoutMode: NONE` means no Auto Layout on that container; it does not imply that every corresponding DOM child uses CSS absolute positioning. Preserve intended freeform geometry where applicable.

Prefer an explicit source-backed plan over position-based guesses. Use authored/source behavior to assign Auto Layout explicitly; positional inference is only supporting evidence.

## Context-aware property mapping

| Code evidence | Figma plan | Required context |
| --- | --- | --- |
| Flex direction row / column | `layoutMode: HORIZONTAL / VERTICAL` | Reverse direction needs visual ordering/reverse handling; preserve DOM semantics in code |
| `flex-wrap: wrap` | `layoutWrap: WRAP` | Verify supported row/column behavior and cross-axis spacing |
| `justify-content: flex-start/end/center/space-between` | `primaryAxisAlignItems: MIN/MAX/CENTER/SPACE_BETWEEN` | Main axis follows direction; space-between is not a fixed gap |
| `align-items: flex-start/end/center/baseline` | `counterAxisAlignItems: MIN/MAX/CENTER/BASELINE` | Cross axis follows direction; use baseline only where supported |
| `align-items: stretch` / `align-self: stretch` | In-flow child's cross-axis FILL sizing where equivalent | There is no generic `counterAxisAlignItems: STRETCH` mapping |
| `gap`, `row-gap`, `column-gap` | `itemSpacing`, and `counterAxisSpacing` for wrapped layouts | Resolve direction: row main gap uses column-gap; column main gap uses row-gap |
| Padding shorthand / side values | `paddingTop/Right/Bottom/Left` | Resolve units and logical sides using the source writing direction |
| Intrinsic content-driven size / shrink-to-fit inline-flex | HUG on that axis | Confirm min/max constraints and text wrapping; CSS `auto` is context-dependent |
| Definite source width/height | FIXED + source-derived dimension | Use browser box-sizing/border evidence, not only computed bounds |
| `flex-grow`, `flex: 1`, available-space stretch | FILL on the relevant child axis when equivalent | Account for basis, shrink, siblings and parent direction |
| `width: 100%` | Often horizontal FILL, otherwise resolved geometry | Parent must support the behavior; percentage sizing is not always Auto Layout fill |
| `min/max-width/height` | `minWidth/maxWidth/minHeight/maxHeight` | Resolve relative units at the chosen viewport; preserve behavior limits |
| `border-radius` / corner values | `cornerRadius` / individual radii | Percentages or pill radii need geometry-aware handling |
| Background/text/border colors | Frame/text fills and strokes | Preserve alpha and token role; element opacity also affects descendants |
| Font family/weight/size/line-height/tracking | `fontName`, `fontSize`, `lineHeight`, `letterSpacing` and shared text style | Resolve units and actual available font style; line-height may be normal, px, ratio or percentage |

Separate behavior from measurements: a computed width of 120px might be intrinsic HUG, fixed 120px, or the result of FILL. Record the authored constraint and confirm with a changed label/parent width. HUG is supported for Auto Layout frames and text; FILL applies to Auto Layout children. Create/configure the parent and append the child before assigning FILL. Avoid parent-HUG/child-FILL cycles by identifying the actual dimension-owning container.

Single-line content labels can use content-driven text sizing; wrapping text generally needs constrained width and auto-growing height. Match truncation/wrap behavior and use the real font. Icon geometry usually stays FIXED while neighboring text/container sizing follows source behavior.

Borders require separate stroke geometry and box-model handling. `strokeAlign: INSIDE` is not itself equivalent to `box-sizing: border-box`; outline and outside stroke are also not universally interchangeable. Margins, CSS sticky/scroll behavior, transforms and breakpoint rules may need explicit modeling instead of a single-property inversion.

## Shared layout plan

Save this with the coverage manifest, once per family and for structural variants that differ. Each node records role/parent, source evidence, direction, axis behavior, constraints, spacing/alignment, flow/overlay decision and token references. Record the source DOM-to-Figma-node mapping after construction. Measured bounds are validation evidence, not replacements for HUG/FILL/FIXED intent.

Illustrative shorthand adapted from the user's existing spec conventions:

```yaml
name: Button/Container
source: src/Button.css:20
direction: HORIZONTAL
width: { hug: true }
height: { fixed: 40 }
align: CENTER
cross-align: CENTER
padding:
  left: "16 [--button-padding-x]"
  right: "16 [--button-padding-x]"
  top: "8 [--button-padding-y]"
  bottom: "8 [--button-padding-y]"
gap: "8 [--button-gap]"
radius: "12 [--button-radius]"
fill: "[--button-background]"
children:
  - { name: Icon, position: auto, width: { fixed: 16 }, height: { fixed: 16 } }
  - { name: Label, position: auto, width: { hug: true }, height: { hug: true } }
```

Values are illustrative, not defaults. Resolve shorthand into Plugin API properties explicitly. `[--token-name]` is a spec annotation; emitted CSS uses the actual valid source identifier as `var(--token-name)`. Keep a fallback/resolved number only as source snapshot evidence. Plan-owned example metadata such as `hug: true` is not a Figma API parameter.

Preserve the existing library implementation and use its plan to build the matching native design. Reverse design-to-code work belongs to figma-design-to-code; this mapping guide does not own that workflow.

## Naming, binding and modes

Follow existing project/target collection conventions. If the user adopts the `_Component Template` scheme from their notes, preserve leaves such as `Radius (border-radius)`, `Padding left`, `Padding right`, `Layout width` and `Layout height` under the appropriate component/element group. Do not impose a past project's entire collection hierarchy on a new library.

Record source token identity, semantic role, Figma variable ID/key, collection ID, type, scopes, per-mode values/aliases and actual code syntax. Reuse compatible primitives and bind semantic/component roles to them with aliases. A matching hex value alone is not a token binding.

Bind numeric supported fields such as padding/gap/radius with `setBoundVariable`; bind paint color with `figma.variables.setBoundVariableForPaint`. Use the connected API's actual bindable field/type list for typography and other properties. Enum behavior such as HUG/FILL/FIXED or direction must be assigned by the construction plan; a string variable named “width sizing” does not automatically control those enum fields.

For the Liquid Glass example, Theme/Light can alias the source Light/* variables and Theme/Dark the source Dark/* variables. Generalize the method, not its names or variable count. Read actual collection/mode IDs and validate target/source types. If a source uses one variable with several modes instead of separate Light/* and Dark/* variables, alias that variable and establish/verify the source collection mode context; names shared across collections do not prove modes resolve correctly. Prevent alias cycles and missing targets.

Set the intended collection modes on review frames and inspect resolved values on descendants in both Light and Dark. Verify reused source aliases stay live after source-variable changes in a scoped test when permitted. Keep typography styles and token variables coordinated; not every compound CSS property has a single bindable Figma variable field.

## Verify behavior, not only pixels

Read back direction, wrap, alignment, side padding, gaps, sizing, min/max limits, overlay settings, font/style IDs and variable bindings against the layout plan. On temporary review instances, compare code and Figma at supported narrow/wide widths, short/long labels, optional icon changes and theme switches. Confirm expected wrapping, alignment, retained fixed icon geometry, overlays and source-defined clipping/truncation.

Preview screenshots alone cannot establish these relationships. Repair layout properties explicitly when readback or resize checks disagree. Record unsupported CSS behavior or missing executor APIs as a concrete parity gap.

## Provenance and API references

Adapted from the user's notes: “Figma Frame Property → React / CSS Mapping” (2026-05-21), “Finnomena component spec & variable workflow” (source archive 2026-10-14, component workflow around line 395), and “Mapping the Figma variable collection” (2026-05-17). This reference is self-contained so the skill can work outside the original note vault.

- [layoutMode](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutmode/)
- [layoutSizingHorizontal](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/)
- [setBoundVariable](https://developers.figma.com/docs/plugins/api/properties/nodes-setboundvariable/)
- [Working with variables](https://developers.figma.com/docs/plugins/working-with-variables/)
