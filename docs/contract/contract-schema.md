# Contract (`component.json`) schema, v1

Answer for [#7](https://github.com/pawisssh/design/issues/7), part of map [#1](https://github.com/pawisssh/design/issues/1). The vocabulary follows `GLOSSARY.md`: Code Library, Design Library, Component Family, Property Axis, Base Component, Sub-component, Component Set, Contract, Adapter.

The Contract is the library-neutral, canonical and readable description of one Component Family. The Adapter for a Code Library writes it, the owner approves it in To-preview, and the To-design builder reads it. This is one file per Component Family. Compaction for `use_figma` is the packager's job ([#12](https://github.com/pawisssh/design/issues/12), #18); the Contract itself is never compacted.

Worked example: [`examples/carbon-button.component.json`](examples/carbon-button.component.json), Carbon React Button at `v11.118.0`. Checker: [`tools/expand_contract.py`](tools/expand_contract.py) (`python3 docs/contract/tools/expand_contract.py docs/contract/examples/carbon-button.component.json --table`). Mapping from today's artifacts: [`mapping.md`](mapping.md).

## Top level

| Field | Required | Content |
|---|---|---|
| `schemaVersion` | yes | Integer, `1`. See [Versioning](#versioning). |
| `family` | yes | `{key, name, description}`. `key` is a stable lowercase id (`button`). `name` is the Component Family name. |
| `source` | yes | Where the Contract came from: `codeLibrary`, `adapter`, `repository`, `tag`, `commit` (the dereferenced commit, not the tag object), `packages` (name → exact version), `files` (a map from each repo path the Adapter read to `sha256:<hex>` of its bytes), and `snapshotId`. `snapshotId` is `sha256:` of the `shasum -a 256` manifest text: one line per file, `<hex>  <path>\n`, sorted by path in byte order. If `snapshotId` changes, the selection approval is void. |
| `axes` | yes | Ordered list of Property Axes. See [Axes](#axes). |
| `excluded` | yes (may be `[]`) | Source-proven invalid combinations, written as [match patterns](#match-patterns), each with `reason` and `evidence`. |
| `selection` | yes | The owner's sparse choice inside the valid matrix. See [Selection](#selection). |
| `anatomy` | yes | The fixed layer tree, with layer names. See [Anatomy](#anatomy). |
| `properties` | yes (may be `[]`) | Non-variant component properties (TEXT, BOOLEAN, INSTANCE_SWAP) and what they bind. |
| `layout` | yes | [Rules](#rules) that set Auto Layout fields per anatomy node. |
| `paint` | yes | [Rules](#rules) that set fills, strokes and effects per anatomy node. This is the state model. |
| `icons` | when an icon slot exists | Icon source, default icon and preferred icons. See [Icons](#icons). |
| `subComponents` | yes (may be `[]`) | `_`-prefixed Sub-components, tier `item` or `base`. See [Sub-components](#sub-components). |
| `dependencies` | yes | `families`: other Component Families used as instances, as `{key, contract, source.tag}`. `fonts`: the fonts used. Tokens and icons are not listed here, because they are derived (see [Derived, not stored](#derived-not-stored)). |
| `figma` | yes | Figma-only presentation: `page` (plural), `componentSetName`, `description`, `header` (Type, Title, Namespace for the `Component Header` instance), and `grid` (`columns` and `rows` as axis keys). |
| `code` | yes | Code Connect: `framework`, `package`, `component`, `import`, `alwaysEmit`. Per-value and per-property code mappings sit next to the value or property they describe. |
| `notes` | no | Report entries `{level: info|warning|verify, at, message}` for decisions and render checks that are not tied to a single raw value. When a probe settles a `verify` note, it becomes `info` and its message starts with `Resolved (#N)` or `Adjusted (#N)`. |

## Axes

```json
{ "key": "size", "label": "Size", "default": "lg", "defaultSource": "_button.scss layout.use $default lg",
  "values": [ { "key": "lg-expressive", "label": "Large (Expressive)", "code": { "size": "lg", "isExpressive": true } } ] }
```

- **`key` and `label`.** `key` is the identity used in tuples, rules, selection and ids. For a Code Library axis it is the code value (`lg-expressive`, `danger--tertiary`). For the canonical State axis it is the lowercase state (`hover`). `label` is the Figma name in Title Case (`Large (Expressive)`) and appears in `Prop=Value`. Labels must be unique within an axis and must not contain `=` or `,`. Renaming a label never changes a key, so selections and ledgers survive.
- **Order.** The array order is the Figma property order. Each `values` array order is the grid order. The first value is not the default unless `default` says so.
- **`default`.** Required. `defaultSource` records where the default came from (code, SCSS, canonical, or owner). The tuple of all defaults is the Base Component, and it must be in the selection.
- **`code`.** The props that this value means in code. `{}` means "the default render". `null` means "no code counterpart". A value may map to several props (`lg-expressive` → `size="lg"` + `isExpressive`). An optional `css` field records the pseudo-class for State values.
- **`canonical: true`** marks the State axis. Its value keys come from the fixed set `enabled, hover, active, focus, disabled` (labels `Enabled`…`Disabled`). The Adapter keeps only the states the CSS defines for the family, and the owner may edit that list at approval. The builder never adds a state.
- **`dropped`** (optional) records code values the Adapter removed, with `reason` and `evidence` (for example the type-only `danger--primary`).

Themes are not an axis. They are Figma Variable modes, defined once per Design System in the foundations document (separate ticket).

## Match patterns

`excluded`, `selection.omit`, `layout`, `paint` and BOOLEAN `binds` all use one pattern grammar:

```json
{ "match": { "kind": ["ghost", "danger--ghost"], "state": "focus" } }
```

- Each key is an axis key. A string value matches that value. An array matches any of its values.
- An axis that is left out matches every value. `{}` matches everything.
- Every axis key and value must exist in `axes`.

## Selection

```json
"selection": { "status": "draft", "omit": [ { "match": { "size": "2xl", "kind": "danger--ghost" }, "reason": "owner: not used" } ], "expectedCount": 240, "approval": null }
```

- The selected set = cartesian product of `axes` − `excluded` − `selection.omit`. The Contract never stores the expanded tuple list. The packager expands it, and #18 compacts it.
- `expectedCount` is a checksum. Tools reject the Contract when the expansion gives a different count.
- `status` is `draft` or `approved`. `approval` is `{by, at, snapshotId}` once approved. Execution authorisation is not stored here.
- The default tuple must be selected. To start from a different Base Component, change `axes[].default` and set `defaultSource: "owner"`.

## Anatomy

```json
{ "name": "Button", "type": "COMPONENT", "children": [
  { "name": "Label", "type": "TEXT", "role": "label" },
  { "name": "Icon", "type": "FRAME", "role": "icon-slot", "children": [
    { "name": "Glyph", "type": "INSTANCE", "role": "icon", "instanceOf": "icon:default" } ] } ] }
```

- One tree per Component Set, shared by every variant (#6). States and sizes change bound values, never the tree.
- Layer names are final Figma layer names, and they are unique within the tree. Rules address nodes by name. A path such as `Glyph/Vector` addresses a layer inside an instance; the single-`Vector` icon rule from #13 makes that path stable.
- `instanceOf` is `icon:default`, `family:<key>` (another Component Family, which must be built first), or `sub:<name>` (a Sub-component).

## Properties

| Type | Fields |
|---|---|
| `TEXT` | `default`, `binds: [{node, field: "characters"}]`, `code: {prop}` |
| `BOOLEAN` | `default`, `binds: [{match?, node, field: "visible"}]`, `code: {prop, whenFalse}` |
| `INSTANCE_SWAP` | `default: "icon:default"`, `preferred: "icon:preferred"`, `binds: [{node, field: "mainComponent"}]`, `code: {prop, valueFrom}` |

- `binds` may differ per variant through `match`. Every selected variant must get exactly one bind per property. Button uses this so that the `Icon` BOOLEAN hides `Glyph` (the slot keeps its space) on kinds that reserve the end padding, and hides the whole `Icon` slot on ghost kinds. Figma supports this: one set-level property referenced by different nodes in different variants keeps every reference and its instance value across variant switches (checked in #20).
- `label` is the Figma property name. `key` is the stable id.

## Rules

`layout` and `paint` are ordered lists of `{match, set}`. `set` maps an anatomy node name to fields. For each variant, the builder applies every matching rule in order, and a later rule wins per field. The Adapter resolves the CSS cascade into these rules. The builder does no cascade logic beyond "later wins", and it never guesses a value: when a required field is unresolved for a selected variant, the Contract is invalid.

**Layout fields** (a neutral vocabulary that maps 1:1 to Auto Layout): `direction` (`row`/`column`), `width`/`height` (`hug`/`fill`/`fixed` or a value), `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `alignMain`, `alignCross` (`start`/`center`/`end`/`space-between`), `paddingTop`/`Right`/`Bottom`/`Left`, `gap`, `radius`, `strokeWeight`, `strokeAlign` (`inside`/`center`/`outside`), `textStyle`, `textResize`.

**Paint fields:** `fill`, `stroke`, `effects` (a list of `{type: inner-shadow|drop-shadow, spread, blur, x, y, color}`), `opacity`. On a TEXT node `fill` is the text colour.

`effects` are listed in Figma array order: a later entry paints above an earlier one. This is the reverse of CSS `box-shadow`, where the first shadow is on top, so the Adapter reverses the CSS list. The stroke paints above inner shadows. The builder writes the list as given and never reorders it (checked in #20).

### Value references

| Form | Meaning |
|---|---|
| `{ "token": "button-primary" }` | Bind to the Code Library's flat token name. The builder resolves it through the foundations ledger (name → variable id), so the Contract never holds Figma ids. Text styles use the same form (`{ "token": "body-compact-01" }`). |
| `{ "raw": 15, "level": "info", "reason": "derived (size − 1lh)/2" }` | A literal with no token. `level: info` means derived from tokens. `level: warning` means a constant with no token. `reason` is required. |
| `"none"` | No paint (CSS `transparent`). Neither raw nor a warning. |
| `{ "sameAs": "Label.fill" }` | Copy another node's resolved value (CSS `currentColor`). It is resolved after all rules. |

A token whose *mode value* is raw in Figma (the alpha entries, `button-danger-hover` from #9) is still a `token` reference in the Contract. Rawness inside a mode belongs to the foundations, not to the Contract.

## Icons

```json
"icons": { "source": { "package": "@carbon/icons", "version": "11.90.0", "path": "svg/16/{key}.svg", "fallback": "svg/32/{key}.svg" },
           "default": "add", "preferred": ["add", "arrow--right", "…"] }
```

- Keys are `@carbon/icons` file names. The kit-style Figma name is derived by rule: capitalise the first letter and keep `--` (`arrow--right` → `Arrow--right`).
- `default` must be in `preferred`. The builder builds exactly the union of every Contract's `default` and `preferred` as icon atoms (#13), and those become the INSTANCE_SWAP `preferredValues`.
- The icon fill per Kind × State comes from the `paint` rules on `Glyph/Vector`.

## Sub-components

```json
{ "name": "_Number input base", "tier": "base", "anatomy": { … }, "axes": [ … ], "properties": [ … ], "layout": [ … ], "paint": [ … ] }
```

A Sub-component uses the same fields as a family, without `source`, `selection`, `figma` or `code`. It is private and never published (#6). Build order is: icon atoms → `item` → `base` → the Component Set. Button has none.

## Derived, not stored

These are computed from the Contract, never written into it:

- the token closure, which feeds the foundations scope (#9)
- the icon list
- the expanded variant tuples and specimen ids
- Figma ids and keys, which live in the builder ledger

`tools/expand_contract.py` prints the derived closure. For Button it adds `spacing-07` to #9's list. It also shows that Button does not use `spacing-10`, `icon-primary` (the ghost icon renders `link-primary`, checked by render in #20), `icon-on-color-disabled`, `background-selected`, `layer-selected-disabled`, `button-separator` or the skeleton tokens.

## Validation

1. `schemaVersion` is known, and the axis, value and property keys are unique. Labels are unique per axis, Title Case, and contain no `=` or `,`.
2. Every axis has a `default` that is one of its values. The default tuple is selected.
3. Every pattern names known axes and values. Every exclusion has `reason` and `evidence`.
4. The expansion equals `selection.expectedCount`.
5. Every selected variant resolves every required field for every anatomy node, and gets exactly one bind per property.
6. Every `raw` value has `level` and `reason`, and every `token` exists in the foundations.
7. Every `instanceOf` and `dependencies.families` target exists and is built first.

## Versioning

- `schemaVersion` is an integer. Adding an optional field does not change it. Renaming, removing or changing the meaning of a field increments it, and tools reject a version they do not know.
- Source drift is tracked separately, through `source.tag`, `commit`, `packages` and `snapshotId`. To upgrade Carbon, re-run the Adapter and approve the selection again.
- A formal JSON Schema file (`contract.schema.json`) and validator are build work carried into the spec.
