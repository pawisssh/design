# Foundations probes: Text Style binding, GAP on padding, mode order

Probes for [pawisssh/design#27](https://github.com/pawisssh/design/issues/27). Spec: [#22](https://github.com/pawisssh/design/issues/22), section "Foundations in Figma". Vocabulary follows `GLOSSARY.md`.

Probed on 2026-10-16 through the official remote Figma MCP `use_figma`, on the scratch draft `Alpt8YsrzDVu6DnwsrF26h`. All objects were built on a temporary page `Probe #27` and were checked by name and deleted afterwards. Every result below comes from a **separate readback call**, so it shows the state after the writing call ended.

`FIG` = `https://developers.figma.com/docs/plugins/api/`

## Answer

| Question | Result | Decision |
| --- | --- | --- |
| Do Type variables bound onto a Text Style hold? | Yes | Keep Text Styles bound to Type variables. The node-binding fallback is not needed. |
| Can a `GAP`-scoped variable bind to padding? | Yes, but the API ignores scopes on bind, and `PADDING` is not an API scope | Spacing scopes stay `["GAP"]`. Validation rule 6 maps `padding*` and `gap` to `GAP`. |
| Can Figma reorder modes? | No reorder method, but `setDefaultMode` moves a mode to index 0 | The slice sets the mode order by calling `setDefaultMode` in reverse key order. |

## 1. Text Style binding

- `TextStyle.setBoundVariable` accepted these fields:

  | Field | Variable | Scope |
  | --- | --- | --- |
  | `fontFamily` | STRING `IBM Plex Sans` | `FONT_FAMILY` |
  | `fontSize` | FLOAT | `FONT_SIZE` |
  | `lineHeight` | FLOAT | `LINE_HEIGHT` |
  | `letterSpacing` | FLOAT | `LETTER_SPACING` |
  | `fontWeight` | FLOAT 400 | `FONT_WEIGHT` |

- **Weight 400 → `Regular`.** The style started as `SemiBold` on purpose. After binding, `fontName` was `{family: "IBM Plex Sans", style: "Regular"}`.
- **px units hold.** After binding, `lineHeight` was `{unit: "PIXELS", value: 18}` and `letterSpacing` was `{unit: "PIXELS"}`. The letterSpacing value was set to 0.16 and reads back as `0.1599999964…` (float32 storage). Compare with a tolerance in readback diffs.
- **The style tracks the variables.** I changed the variables to size 16, lineHeight 22, letterSpacing 0.32 and weight 600. The style became `SemiBold` / 16 / 22 px / 0.32 px, and so did a text node using the style. Weights snap to an available style: 500 and 450 both resolved to `Medium`.
- A STRING `fontStyle` binding (`"Regular"`) also works on a Text Style. It is an alternative to `fontWeight` if a family's weight mapping is ambiguous.
- **Fallback works but is not needed.** `TextNode.setRangeBoundVariable` binds the same five fields directly on a node. Those bindings track variable changes the same way.

## 2. `GAP` scope on padding

- A FLOAT variable scoped `["GAP"]` bound to `paddingLeft/Right/Top/Bottom` and to `itemSpacing`, and the bindings persisted.
- **Control:** a variable scoped `["CORNER_RADIUS"]` also bound to all four paddings and to `itemSpacing`. The Plugin API does not enforce scopes on bind. `FIG` `VariableScope` describes scopes as controlling only whether a variable shows in the picker.
- **`PADDING` is not an API scope.** Setting it throws. The enum the runtime accepts is:

  `ALL_SCOPES`, `TEXT_CONTENT`, `CORNER_RADIUS`, `WIDTH_HEIGHT`, `GAP`, `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `STROKE_FLOAT`, `EFFECT_FLOAT`, `EFFECT_COLOR`, `OPACITY`, `COLOR_OPACITY`, `FONT_FAMILY`, `FONT_STYLE`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`

  `GAP` is the only auto-layout spacing scope the generator can write.
- **Consequences for the spec:**
  - Spacing scopes stay `["GAP"]`.
  - Validation rule 6 (every token used inside its variable's scopes) treats `padding*` and `gap` as `GAP`.
  - Rule 6 is the only scope guard, because Figma does not reject an out-of-scope binding at build time.
- **Open, UI only:** the [Figma variables help article](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections) lists "Auto layout → Gap / Padding" as separate checkboxes in the editor. The API can't show whether a `GAP`-only variable appears in the **padding** picker. A [forum thread](https://forum.figma.com/suggest-a-feature-11/variables-distinguish-between-auto-layout-gap-and-padding-29182) reports that the gap and padding pickers share one scope. Check this by eye in Figma during the live foundations run: open a `spacing-*` variable's scope panel and the padding picker.

## 3. Mode order

- `VariableCollection` exposes `addMode`, `removeMode`, `renameMode` and `setDefaultMode`. There is no reorder method.
- `setDefaultMode(id)` **moves that mode to index 0** and leaves the order of the other modes alone. Created as `g100, white, g10, g90`, then `setDefaultMode(white)` gave `white, g100, g10, g90`. The new order persisted.
- **Full reorder:** call `setDefaultMode` for each mode in *reverse* target order. Calling `g100`, `g90`, `g10`, `white` gave `white, g10, g90, g100`, with `white` as the default. The order persisted.
- The file accepted 4 modes in one collection, enough for `Theme`.
- **Consequence:** the spec line "until confirmed, the slice reports a different default mode instead of fixing it" can be replaced. The slice fixes both the order and the default.
