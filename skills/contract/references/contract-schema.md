# Contract (`component.json`) schema, v1

Answer for [#7](https://github.com/pawisssh/design/issues/7), part of map [#1](https://github.com/pawisssh/design/issues/1). The vocabulary follows `GLOSSARY.md`: Code Library, Design Library, Component Family, Property Axis, Base Component, Sub-component, Component Set, Contract, Adapter.

The Contract is the library-neutral, canonical and readable description of one Component Family. The Adapter for a Code Library writes it, the owner approves it once, at the end of To-design's base loop (see [Approval](#approval)), and the To-design builder reads it. This is one file per Component Family. Compaction for `use_figma` is the packager's job ([#12](https://github.com/pawisssh/design/issues/12), #18); the Contract itself is never compacted.

Worked example: [`button.component.json`](../../../design-systems/carbon/contracts/button.component.json), Carbon React Button at `v11.118.0`. Formal schema: [`contract.schema.json`](../contract.schema.json). Checker: the shared Contract module [`scripts/contract.mjs`](../scripts/contract.mjs), from the command line `node skills/contract/scripts/check.mjs <contract> [--table]`. How an Adapter writes one: the [Adapter guide](adapter-guide.md).

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
| `code` | yes | Code Connect: `framework`, `package`, `component`, `import`, `alwaysEmit`, and optionally `required` and `items` (#93, see [Code](#code)). Per-value and per-property code mappings sit next to the value or property they describe. |
| `notes` | no | Report entries `{level: info|warning|verify, at, message}` for decisions and render checks that are not tied to a single raw value. When a probe settles a `verify` note, it becomes `info` and its message starts with `Resolved (#N)` or `Adjusted (#N)`. |
| `drafted` | no | [Drafted values](#drafted-values): a map from value path to `{by: "agent", evidence, fingerprint}` or `{by: "owner", was}`. |

## Axes

```json
{ "key": "size", "label": "Size", "default": "lg", "defaultSource": "_button.scss layout.use $default lg",
  "values": [ { "key": "lg-expressive", "label": "Large (Expressive)", "code": { "size": "lg", "isExpressive": true } } ] }
```

- **`key` and `label`.** `key` is the identity used in tuples, rules, selection and ids. For a Code Library axis it is the code value (`lg-expressive`, `danger--tertiary`). For the canonical State axis it is the lowercase state (`hover`). `label` is the Figma name in Title Case (`Large (Expressive)`) and appears in `Prop=Value`. Labels must be unique within an axis and must not contain `=` or `,`. Renaming a label never changes a key, so selections and ledgers survive.
- **Order.** The array order is the Figma property order. Each `values` array order is the grid order. The first value is not the default unless `default` says so.
- **`default`.** Required. `defaultSource` records where the default came from (code, SCSS, canonical, or owner). The tuple of all defaults is the Base Component, and it must be in the selection.
- **`code`.** The props that this value means in code. `{}` means "the default render". `null` means "no code counterpart". A value may map to several props (`lg-expressive` → `size="lg"` + `isExpressive`). An optional `css` field records the pseudo-class for State values.
- **`canonical: true`** marks the State axis. Its value keys come from the fixed set `enabled, hover, active, focus, disabled` (labels `Enabled`…`Disabled`). The Adapter keeps only the states the CSS defines for the family. The owner changes that list only through an explicit Contract edit; To-preview edits only `selection.omit` (#21). The builder never adds a state.
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

- The selected set = cartesian product of `axes` − `excluded` − `selection.omit`. The Contract never stores the expanded tuple list. `expand()` derives it, and #18 compacts it for the package.
- `expectedCount` is a checksum. Tools reject the Contract when the expansion gives a different count.
- `status` is `draft` or `approved`. `approval` is `null` while draft and `{by, at, snapshotId, contentHash}` once approved (see [Approval](#approval)). Execution authorisation is not stored here.
- The default tuple must be selected. To start from a different Base Component, change `axes[].default` and set `defaultSource: "owner"`.
- To-preview's export is an omit patch, `{family, snapshotId, omit: [pattern], expectedCount}`. It is the whole owner omit list, so `applyOmit()` replaces `selection.omit` with it (each pattern becomes `{match}`, keeping the `reason` of a pattern that was already there) rather than adding to it, so a combination the owner re-checks drops out of the list. The agent then validates and asserts that the expanded set equals the checked combinations. To-preview edits only `selection.omit` and `expectedCount` and never writes an approval.

### Approval

```jsonc
"selection": {
  "status": "approved",
  "omit": [],
  "expectedCount": 245,
  "approval": { "by": "owner", "at": "2026-10-16T09:00:00Z",
                "snapshotId": "<= source.snapshotId>",
                "contentHash": "sha256:<canonical Contract without selection.status and selection.approval>" }
}
```

- There is one approval, at the end of To-design's base loop, after the agent has shown the clean readback of the Base Component, every edit with its blast radius and shields, and the tweaks the Contract cannot carry. Only an explicit "approve" from the owner in chat counts. Silence, Figma state and inference never do. To-preview never approves.
- Only the owner approves (`by: "owner"`). An orchestrator may approve on the owner's behalf only in a prototype, never for a build into the owner's Design Library, so a committed Contract always carries `by: "owner"`. `approve(contract, at, {prototype: true})` writes `by: "orchestrator (prototype)"`, which rule 8 rejects; `base-loop.mjs approve --prototype` writes it only to an `--out` path under `.scratch/`.
- `base-loop.mjs approve <component.json> <readback.json> --snapshot-id <id> --content-hash <hash>` is the command to run after the owner's "approve". It refuses unless the readback is clean (no difference, nothing unread) and names the Base Component, and the snapshotId and contentHash are the ones `review` showed the owner, so an edit after the review voids the command.
- `contentHash` is `sha256:` of the canonical JSON (keys sorted, no whitespace, UTF-8) of the whole Contract with `selection.status` and `selection.approval` removed. `contentHash()` computes it and `approve()` writes the block.
- An approval is valid only when `snapshotId` equals `source.snapshotId` and `contentHash` equals the Contract's current hash. A source change or any edit after approval voids it.
- **Every Contract write** (an omit patch, an owner edit, an Adapter re-run, a hand edit) resets `status: "draft"` and `approval: null` (`asDraft()`). An edited Contract is never treated as approved.
- Approval lives only in the Contract. Figma cannot hold it: `setPluginData` is unsupported in `use_figma`, and `sharedPluginData` is public.

### Owner edits

A tweak the owner makes to the Base Component in Figma lands **in place**, on the rule that last set that field for the Base Component tuple (`resolve().from` names it). It is never a later-wins override and never a Base-only patch. The edited value carries `by: "owner"` and the replaced value under `was`:

```jsonc
"gap":        { "token": "spacing-06", "by": "owner", "was": { "token": "spacing-07" } }
"paddingTop": { "raw": 14, "level": "warning", "reason": "owner tweak", "by": "owner", "was": { "raw": 15 } }
```

- A tweak to a bound variable becomes a token edit. A typed number becomes a raw `warning`. Tokens are read only from `boundVariables`, and a typed number that equals exactly one token is offered as that token, never swapped in silently.
- `was` is history, not a live value: the token closure and the raw `level`/`reason` check skip it.
- The agent asks first when the rule is shared by other variants (blast radius). There is no top-level edit log. A derived raw that an edit made stale gets a `verify` note, not a recompute. Tweaks the Contract cannot express (for example `letterSpacing`, a structure change) become `notes` at level `warning` and block approval: `approve()` refuses and rule 8 rejects an approved Contract while one is open.
- Which derived raws get a `verify` note (there is no `derivedFrom` link yet): an `info` raw whose `reason` starts with `derived` in a later rule that shields part of the edit's blast radius for the same field, and a derived raw on a sibling field of the same node in the edited rule. The note sits at that value's path, for example `layout[8].Button.gap`.
- A `warning` note is cleared only by the owner's decision to drop the tweak, once a rebuild from the Contract reads back with no difference and reports the noted field: run `base-loop.mjs discard` only when the owner says so. It turns the note into `info` with a message that starts `Discarded (base loop rebuild): `.
- [base-loop.mjs](../../to-design/scripts/base-loop.mjs) (`diff`, `apply`, `discard`, `review`, `approve`) writes owner edits, notes and approvals. Edits and notes go through `asDraft()`. A write keeps the file's layout (`writeJson` in [io.mjs](../scripts/io.mjs) splices only the changed values) and is refused when the result does not validate (a prototype approval excepted, under `.scratch/` only) or a shared rule is not confirmed. `by` is `owner`; only a prototype or a test names a simulated owner, `owner (simulated, ...)`.
- An Adapter re-run keeps `by: "owner"` values and reports a conflict when the source value also changed (merge mechanics not yet specified).

## Anatomy

```json
{ "name": "Button", "type": "COMPONENT", "children": [
  { "name": "Label", "type": "TEXT", "role": "label" },
  { "name": "Icon", "type": "FRAME", "role": "icon-slot", "children": [
    { "name": "Glyph", "type": "INSTANCE", "role": "icon", "instanceOf": "icon:default" } ] } ] }
```

- One tree per Component Set, shared by every variant (#6). States and sizes change bound values, never the tree.
- Layer names are final Figma layer names, and they are unique within the tree. Rules address nodes by name. A path such as `Glyph/Vector` addresses a layer inside an instance; the single-`Vector` icon rule from #13 makes that path stable.
- `instanceOf` is `icon:default`, `icon:<key>` (one fixed icon, #93), `family:<key>` (another Component Family, which must be built first), or `sub:<name>` (a Sub-component).
- A node that shows only in some variants, such as a form control's status icon or validation message, is in the tree once and hidden with a `visible: false` layout rule elsewhere (#88, #93). Where the content differs per variant, each version is its own node: TextInput has `Invalid icon` (`icon:warning--filled`) and `Warn icon` (`icon:warning--alt--filled`), and `Invalid text` and `Warn text`, each shown by its validation value. One node per version keeps one icon per INSTANCE, one code prop per property and one fill per path.
- A border on one side, such as a field's underline, is its own FRAME (`Underline`, `height` 1px, `fill` the border colour), because a node has one `strokeWeight` (#93). Revisit only if a family needs per-side widths that a FRAME cannot draw, such as a border that changes width on one side per state.

## Properties

| Type | Fields |
|---|---|
| `TEXT` | `default`, `binds: [{node, field: "characters"}]`, `code: {prop}`; or `code: {itemProp}` for the text of the shown Repeated child (#93, see [Code](#code)) |
| `BOOLEAN` | `default`, `binds: [{match?, node, field: "visible"}]`, `code: {prop, whenFalse}` |
| `INSTANCE_SWAP` | `default: "icon:default"`, `preferred: "icon:preferred"`, `binds: [{node, field: "mainComponent"}]`, `code: {prop, valueFrom}` |

- `binds` may differ per variant through `match`. Every selected variant must get exactly one bind per property. Button uses this so that the `Icon` BOOLEAN hides `Glyph` (the slot keeps its space) on kinds that reserve the end padding, and hides the whole `Icon` slot on ghost kinds. Figma supports this: one set-level property referenced by different nodes in different variants keeps every reference and its instance value across variant switches (checked in #20).
- `label` is the Figma property name. `key` is the stable id.

## Rules

`layout` and `paint` are ordered lists of `{match, set}`. `set` maps an anatomy node name to fields. For each variant, the builder applies every matching rule in order, and a later rule wins per field. The Adapter resolves the CSS cascade into these rules. The builder does no cascade logic beyond "later wins", and it never guesses a value: when a required field is unresolved for a selected variant, the Contract is invalid.

**Layout fields** (a neutral vocabulary that maps 1:1 to Auto Layout): `direction` (`row`/`column`), `width`/`height` (`hug`/`fill`/`fixed` or a value), `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `alignMain`, `alignCross` (`start`/`center`/`end`/`space-between`), `paddingTop`/`Right`/`Bottom`/`Left`, `gap`, `radius`, `strokeWeight`, `strokeAlign` (`inside`/`center`/`outside`), `textStyle`, `textResize`, `visible` (`true`/`false`; any rule may set it: a size that hides a node (#88), a validation value that shows a message (#93); To-design writes it as the variant's layer visibility, not a layout field).

**Paint fields:** `fill`, `stroke`, `effects` (a list of `{type: inner-shadow|drop-shadow, spread, blur, x, y, color}`), `opacity`. On a TEXT node `fill` is the text colour.

`effects` are listed in Figma array order: a later entry paints above an earlier one. This is the reverse of CSS `box-shadow`, where the first shadow is on top, so the Adapter reverses the CSS list. The stroke paints above inner shadows. The builder writes the list as given and never reorders it (checked in #20).

### Value references

| Form | Meaning |
|---|---|
| `{ "token": "button-primary" }` | Bind to the Code Library's flat token name. The builder resolves it through the foundations ledger (name → variable id), so the Contract never holds Figma ids. Text styles use the same form (`{ "token": "body-compact-01" }`). |
| `{ "raw": 15, "level": "info", "reason": "derived (size − 1lh)/2" }` | A literal with no token. `level: info` means derived from tokens. `level: warning` means a constant with no token. `reason` is required. |
| `"none"` | No paint (CSS `transparent`). Neither raw nor a warning. |
| `{ "sameAs": "Label.fill" }` | Copy another node's resolved value (CSS `currentColor`). It is resolved after all rules. |

A `token` or `raw` value may also carry `by: "owner"` and `was` (see [Owner edits](#owner-edits)).

A token whose *mode value* is raw in Figma (the alpha entries, `button-danger-hover` from #9) is still a `token` reference in the Contract. Rawness inside a mode belongs to the foundations, not to the Contract.

## Icons

```json
"icons": { "source": { "package": "@carbon/icons", "version": "11.90.0", "path": "svg/16/{key}.svg", "fallback": "svg/32/{key}.svg" },
           "default": "add", "preferred": ["add", "arrow--right", "…"] }
```

- Keys are `@carbon/icons` file names. The kit-style Figma name is derived by rule: capitalise the first letter and keep `--` (`arrow--right` → `Arrow--right`).
- `default` must be in `preferred`. A family whose icons are all fixed `icon:<key>` instances, such as TextInput, still declares `default` and `preferred` (rule 7). The builder builds exactly the union of every Contract's icon list (see [Derived](#derived-not-stored)) as icon atoms (#13); `default` and `preferred` become the INSTANCE_SWAP `preferredValues`.
- An icon is one flattened Vector with one fill. A two-tone icon whose second colour comes from CSS (Carbon's `warning--alt--filled`, inner mark `$black-100`) loses that colour; the Contract says so in a `verify` note. Shapes that paint nothing (`fill="none"`, `opacity="0"`) are dropped before flattening.
- The icon fill per Kind × State comes from the `paint` rules on `Glyph/Vector`.

## Sub-components

```json
{ "name": "_Number input base", "tier": "base", "anatomy": { … }, "axes": [ … ], "properties": [ … ], "layout": [ … ], "paint": [ … ] }
```

A Sub-component uses the same fields as a family, without `source`, `selection`, `figma` or `code`. It is private and never published (#6). Build order is: icon atoms → `item` → `base` → the Component Set. Button has none.

## Derived, not stored

These are computed from the Contract, never written into it:

- the token closure, which feeds the foundations scope (#9)
- the icon list: `icons(contract)` returns one Contract's `default`, then its `preferred`, then every fixed `icon:<key>` an INSTANCE names in the anatomy or a Sub-component (#93), without duplicates (the builder takes the union over Contracts), and `iconName(key)` gives the kit-style name (`trash-can` → `Trash-can`)
- the expanded variant tuples and their tuple keys (`tupleKey`, To-preview's internal ids)
- Figma ids and keys, which live in the builder ledger

`closure()` derives the token closure: the tokens (variables and Text Styles) that the selected variants resolve to, after `sameAs`, skipping `was`. A token used only by omitted variants, or only by a value a later rule always overrides, is not in it. For Button it is 38 tokens, which adds `spacing-07` to #9's list. It also shows that Button does not use `spacing-10`, `icon-primary` (the ghost icon renders `link-primary`, checked by render in #20), `icon-on-color-disabled`, `background-selected`, `layer-selected-disabled`, `button-separator` or the skeleton tokens.

## Code

`code` maps the Component Family to its Code Library component for Code Connect and for a Handoff's snippets.

| Field | Meaning |
|---|---|
| `framework`, `package`, `component`, `import` | the component and how to import it |
| `alwaysEmit` | axis keys a snippet always writes, even at the default (with `alwaysEmitWhy`) |
| `required` | optional (#93): props the component requires that no axis value or property sets, such as `id`. Whoever renders or emits the component supplies them: To-preview a placeholder per tuple, a Handoff the Usage's id. |
| `items` | optional (#93): `{component, props}` for a Repeated child, such as Select's `{"component": "SelectItem", "props": ["value", "text"]}`. The Contract never lists the children; a Handoff Usage gives them as `items: [{value, text}, …]`. A TEXT property with `code: {itemProp: "text"}` shows the shown child's text in Figma and is not a component prop. |

A TEXT property whose node a variant hides (`visible: false`) is not emitted for that variant, so a warn snippet carries `warnText` and not `invalidText` [assumption, #93].

## Drafted values

`drafted` lists the values an Adapter's agent chose because neither the source nor the Adapter's own rules state them ([ADR 0010](../../../docs/adr/0010-drafted-values-carry-over-by-evidence-fingerprint.md)). The value itself stays in its usual place, so readers that ignore `drafted` read the Contract unchanged. A value with no entry is exact.

```json
"drafted": {
  "axes.size.values.lg.label": { "by": "agent", "evidence": ["Button.tsx:L40 size union \"lg\""], "fingerprint": "sha256:…" },
  "layout.Button.gap": { "by": "owner", "was": { "token": "spacing-07" } }
}
```

- **Agent entry:** `by: "agent"`, `evidence` (one or more `"file:Lnn what it shows"` strings) and `fingerprint` (`sha256:` of the exact-tier facts its key kind is drafted from).
- **Owner entry:** `by: "owner"` (or `"owner (simulated, …)"` in a prototype) and `was`, the value before the owner's correction. The base loop writes it when an owner tweak lands on a drafted value; an entry already the owner's keeps its first `was`.
- **Keys** are fixed by rule ([ADR 0010](../../../docs/adr/0010-drafted-values-carry-over-by-evidence-fingerprint.md)), and `draftedValue(contract, key)` resolves one:
  - `axes.<axis>.label`, `axes.<axis>.values.<value>.label`, `family.<field>`, `icons.<field>`, `figma.<field>`, `code.<field>`: the path, with list items picked by `key` or `name`.
  - `anatomy.<node>`: a layer and its name.
  - `properties.<key>.<field>`, such as `properties.label.default`, or `properties.<node>.<characters|visible|mainComponent>` for the property that binds that node field.
  - `layout.<node>.<field>` for a value in the base rule (`match: {}`), `layout<match>.<node>.<field>` for any other rule, with the match as canonical JSON (keys sorted, no spaces): `layout{"size":"sm"}.Box.height`. `draftedKey(section, match, node, field)` writes it. The same holds for `paint`.
  - Not yet: excluded combinations have no key form.
- `drafted` is inside `contentHash`, so one approval covers every entry, and adding a table to an approved Contract voids its approval. An approved Contract gains its table at its next re-approval.
- The base loop's review package lists the entries by kind, the most taste-prone first, and To-preview marks a drafted axis value label on each card (a drafted axis label shows only in the tooltip).

## Validation

`validate(contract, foundations)` checks these rules and returns `{ok, errors: [{rule, at, message}]}`. It first checks the structure that the rules rely on (rule `"schema"`); [`contract.schema.json`](../contract.schema.json) is the full formal structure.

1. `schemaVersion` is known, and the axis, value and property keys are unique. Labels are unique per axis, Title Case, and contain no `=` or `,`.
2. Every axis has a `default` that is one of its values. The default tuple is selected.
3. Every pattern (`excluded`, `selection.omit`, rules, property `binds`) names known axes and values. Every exclusion has `reason` and `evidence`. Every rule and bind names an anatomy node, or an `<INSTANCE node>/<layer>` path such as `Glyph/Vector`. `visible` is `true` or `false`, set only by a layout rule and only on a non-root anatomy node. `code.required` names no prop an axis value or a property already sets; `code.items` has a `component` and a non-empty `props`; a property's `code.itemProp` is on a TEXT property and is one of `code.items.props` (#93).
4. The expansion equals `selection.expectedCount`.
5. Every selected variant resolves every required field for every anatomy node, every `sameAs` resolves, and every variant gets exactly one bind per property. Required fields are, per anatomy node type: COMPONENT `direction`, `padding*`, `gap`, `fill`, `stroke`; TEXT `textStyle`, `fill`; FRAME `width`, `height`. On top of these, a field that any rule sets for a node is required for that node in every selected variant, so the builder never falls back to a Figma default (for Button this makes every field of the first layout and paint rules required everywhere, plus `minHeight` on every size). No property binds a `visible` that a rule sets (#93).
6. Every `raw` value has `level` (`info` or `warning`) and `reason`. Every token a selected variant uses exists in the foundations document (`textStyle` in `textStyles`, every other field in `variables`) and is used inside that variable's `scopes`. The scope a field needs: `padding*` and `gap` → `GAP` (Figma has no padding scope, #27); `width`, `height`, `min*`, `max*` → `WIDTH_HEIGHT`; `radius` → `CORNER_RADIUS`; `strokeWeight` → `STROKE_FLOAT`; `stroke` → `STROKE_COLOR`; effect `color` → `EFFECT_COLOR`; `fill` → `TEXT_FILL` on a TEXT node, `SHAPE_FILL` on an `<instance>/<layer>` path, `FRAME_FILL` otherwise (`ALL_FILLS` covers all three). Uses are checked after `sameAs`, so `Glyph/Vector` checks the label colour as `SHAPE_FILL`. `was` is skipped.
7. Every `instanceOf` target is declared: `icon:*` needs `icons` (whose `default` is in `preferred`), `family:<key>` needs `dependencies.families`, `sub:<name>` needs `subComponents`. That each target is built first is enforced by the builder's build order, not by `validate`.
8. `status` is `draft` with `approval: null`, or `approved` with an [approval](#approval) by the owner whose `snapshotId` and `contentHash` both match, and no `warning` note (an uncarried owner tweak) is open.
9. Every [`drafted`](#drafted-values) key names a value in the Contract, and every entry is `{by: "agent", evidence, fingerprint}`, with at least one evidence string and a `sha256:<64 hex>` fingerprint, or `{by: "owner", was}`.

## Component Proposal

A Component Proposal records a Component Family the Code Library does not ship ([#60](https://github.com/pawisssh/design/issues/60), [#80](https://github.com/pawisssh/design/issues/80), ADR 0005). It is stored at `design-systems/<ds>/proposals/<key>.proposal.json`, one per family, and shared by every Handoff that uses it. Worked example: [`promo-banner.proposal.json`](../test/fixtures/promo-banner.proposal.json). Formal schema: [`proposal.schema.json`](../proposal.schema.json). It has its own `schemaVersion` (1), counted separately from the Contract's.

- **Required:** `schemaVersion`, `family`, `proposal`, `axes` (may be `[]`), `anatomy`, `status` and `approval`.
  - `proposal` is `{by: "agent", reason, considered: [{contract, whyNot}], origin: {input, repo?, commit?, url?, at?}, home: {where: "code-library" | "app", package?, path?}}`.
- **Optional:** `properties`, `layout`, `paint`, `icons`, `subComponents`, `dependencies` and `notes`, written as in a Contract. Anything present must validate.
  - `dependencies.families` entries are `{key, contract}` or `{key, proposal}`.
- **Never present:** `source`, `code`, `selection`, `excluded` and `figma`, and no `code` mapping on an axis value or a property. Axis, value and property keys double as the suggested prop names.
- **Theme tokens only.** A component token (a Foundations variable with `family`) or a hidden Primitive fails rule 6. A mode-specific paint is an Off-system value in the Handoff.
- **Approval.** `status: "pending"` with `approval: null`, or `status: "approved"` with `approval: {by: "owner", at, contentHash}`. There is no `snapshotId`, since there is no code.
  - `proposalContentHash()` hashes the canonical Proposal without `status`, `approval`, `retirement` and `built`.
  - Every write goes through `asPending()`, except one that only adds `retirement` or `built`.
- **`retirement`** (optional) is `{contract, how: "built" | "replaced", map, by: "owner", at}`. It is written when the owner confirms a Contract takes the Proposal's place. The file then becomes a read-only tombstone.
  - `map` is `{values: {"<axis>.<value>": {axis, value} | {property, value} | null}, properties: {"<property>": "<contract property>" | null}}` **[assumption, #111]**.
- **`built`** (optional) is `{ref: "repo@commit:path", export, by: "owner", at}`, for a `home.where: "app"` Proposal.

`validateProposal(proposal, foundations, {contracts, proposals})` returns `{ok, errors, readyToRetire}`. An array as the third argument is read as `contracts`. The checks that need those lists are skipped when they are not given.

- **Applied from the Contract:**
  - rule 1;
  - rule 2's defaults (there is no selection);
  - rule 3;
  - rule 6, plus theme tokens only;
  - rule 7, where `family:<key>` must be declared and name a Contract or a Proposal.
- **Not applied:** rule 4, rule 5 (a description-only input could never meet it) and rule 8's `snapshotId` part.
- **Added:**
  - `"schema"`: required, optional and forbidden blocks;
  - `"cycle"`: Proposals never compose in a cycle;
  - `"considered"`: every `considered[].contract` exists;
  - `8`: status and approval with `contentHash`;
  - `"retirement"`: the Contract exists and the map names real keys;
  - `"built"`: home is the app.
- **Key collision.** A Contract whose `family.key` equals the Proposal's is not an error. `readyToRetire` names it, and the owner confirms retirement in chat. A retired Proposal skips this check.

## Versioning

- `schemaVersion` is an integer. Adding an optional field does not change it. Renaming, removing or changing the meaning of a field increments it, and tools reject a version they do not know.
- Source drift is tracked separately, through `source.tag`, `commit`, `packages` and `snapshotId`. To upgrade Carbon, re-run the Adapter, run the base loop and approve again.
- The formal JSON Schema is [`contract.schema.json`](../contract.schema.json). A breaking change updates it, `validate()` and this document together.
