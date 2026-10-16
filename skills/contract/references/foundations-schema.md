# Foundations document schema, v1

Answer for [#19](https://github.com/pawisssh/design/issues/19), part of map [#1](https://github.com/pawisssh/design/issues/1). It builds on [#9](https://github.com/pawisssh/design/issues/9) (collections, modes, naming, raw exceptions) and [#7](https://github.com/pawisssh/design/issues/7) (the Contract names tokens only). The vocabulary follows `GLOSSARY.md`: Code Library, Design Library, Design System, Contract, Adapter.

A Contract binds values by Carbon flat token name (`{ "token": "button-primary" }`, `textStyle: { "token": "body-compact-01" }`). The foundations document defines what those names are: the Figma Variable collections, modes, per-mode values and aliases, scopes, codeSyntax and Text Styles. The foundations slice of the builder core reads it and creates or updates the Figma objects. It returns the ids, which go into the per-file ledger.

| Thing | Count | Holds | Written by |
|---|---|---|---|
| Foundations document | one per Design System | names, modes, values, aliases, scopes, codeSyntax, Text Styles. No Figma ids. | the Adapter, generated |
| Foundations ledger | one per Design Library file | flat name → Figma id for collections, modes, variables and Text Styles | the foundations slice (its return value) |

Worked example: [`carbon.foundations.json`](../../../design-systems/carbon/carbon.foundations.json), the Carbon Button closure at `v11.118.0`. Ledger example: `docs/foundations/examples/carbon.foundations-ledger.example.json` on branch `research/skills-split`; its ids are illustrative. The generator is the Carbon Adapter's foundations step, [`skills/adapter-carbon/scripts/foundations.mjs`](../../adapter-carbon/scripts/foundations.mjs) (#28). The committed document is its output:

```
node skills/adapter-carbon/scripts/foundations.mjs
```

It reads every Contract in `design-systems/carbon/contracts/` and the pinned Carbon sources, which `skills/adapter-carbon/scripts/sources.mjs` fetches into gitignored `.scratch/adapter-carbon/sources/` and checks against their pinned hashes. The token closure comes from the shared module's `closure()`, and the scope check is rule 6 of the shared module's `validate()`, run on the generated document. The output does not depend on the order of the Contracts, and two runs produce byte-identical files, so the ledger's `documentHash` is stable.

Output for Button: 38 closure tokens, 75 variables (20 Primitives, 24 Theme, 22 Layout, 9 Type) and 2 Text Styles. Layout holds 12 closure tokens plus the 10 other `spacing-*` steps (see [Who writes it](#who-writes-it)). All 96 Theme mode values, 13 spacing values and 8 type values match the compiled `@carbon/styles` CSS. All 9 Sass codeSyntax fallbacks exist in `@carbon/layout`. The Button Contract passes rule 6 against the document, so every Contract use of a token falls inside that variable's scopes.

## Top level

| Field | Required | Content |
|---|---|---|
| `schemaVersion` | yes | Integer, `1`. Same rule as the Contract: an additive optional field keeps it; a rename, removal or change of meaning bumps it. |
| `designSystem` | yes | `{key, name}`. `key` names the file (`carbon.foundations.json`) and the ledger section. |
| `source` | yes | Same shape as the Contract's `source`: `codeLibrary`, `adapter`, `repository`, `tag`, `commit`, `packages`, `files {path: sha256:…}`, `snapshotId`. `files` lists every file the Adapter read for foundations, and `snapshotId` is computed over it the same way as the Contract's. It includes `colors.json` and `scale.ts`, which are not in Button's Contract. |
| `closure` | yes | `contracts: [{family, path, snapshotId}]` is the Contracts this document was derived from. `tokens` is the sorted union of their token references, including `textStyle` references. `fullScales` lists the Layout groups carried whole regardless of the closure (`["size", "spacing"]`). |
| `collections` | yes | Ordered list `{key, name, modes: [{key, label}], hidden?}`. The first mode is the default. |
| `variables` | yes | Map from flat name to variable. See [Variables](#variables). The order is collection order, then name, which is also the creation order (aliases need their targets first). |
| `textStyles` | yes (may be `{}`) | Map from flat name to Text Style. See [Text Styles](#text-styles). |
| `checks` | yes | Evidence from generation: a CSS cross-check (`against`, `sha256`, `matched`, `missing`), a Sass fallback check (`against`, `matched`) and the scope check (`by`, the validator and rule that ran; `contracts`, how many Contracts it checked; `errors`, always 0, since generation fails otherwise). |
| `notes` | no | `{level: info|warning|verify, at, message}`, as in the Contract. |

## Collections and modes

| key | name | modes | Content |
|---|---|---|---|
| `primitives` | `Primitives` | `default` | Palette entries that some Theme mode aliases. `hidden: true` (`hiddenFromPublishing`), scopes `[]`. |
| `theme` | `Theme` | `white` White, `g10` Gray 10, `g90` Gray 90, `g100` Gray 100 | Theme and `button-*` component tokens (#9). |
| `layout` | `Layout` | `default` | Spacing and Size (full scales), Icon size and Border radius (closure only). |
| `type` | `Type` | `default` | The variables that Text Styles bind. |

- **Modes are keyed by the Code Library's theme key** (`white`, `g10`, `g90`, `g100`), not by the Figma label. `label` is the Figma mode name, so renaming a label never breaks values or the ledger, the same rule as Contract axis values. The Adapter iterates this fixed list, so extra DTCG keys such as `button-separator`'s `fallback` are ignored.
- Single-mode collections use the mode key `default` (label `Default`).

## Variables

```json
"button-disabled": {
  "collection": "theme", "name": "Button/button-disabled", "type": "COLOR",
  "source": "packages/themes/src/dtcg/components/button.json#/button/disabled",
  "scopes": ["ALL_FILLS", "STROKE_COLOR"], "codeSyntax": { "WEB": "var(--cds-button-disabled)" },
  "values": {
    "white": { "alias": "gray.30", "resolved": "#c6c6c6" },
    "g10":   { "alias": "gray.30", "resolved": "#c6c6c6" },
    "g90":   { "raw": "#8d8d8d", "alpha": 0.3, "resolved": "rgba(141, 141, 141, 0.3)",
               "from": { "alias": "gray.50", "alpha": 0.3 }, "level": "info", "reason": "alpha: a Figma alias cannot carry alpha, …" },
    "g100":  { … same as g90 … }
  },
  "usedBy": ["button"]
}
```

| Field | Content |
|---|---|
| map key | The **flat name**: the Code Library's own name for Theme, Layout and Type (`button-primary`, `spacing-05`, `body-compact-01-font-size`), the same string a Contract writes. Primitives use the palette path (`blue.60Hover`, `white`). The dot cannot occur in a Carbon flat name, so the two namespaces cannot collide. |
| `collection` | A collection `key`. |
| `name` | The Figma variable name, `<Group>/<flat-name>` (#9). Group is the DTCG top-level key in Title Case (`Button`, `Text`, `Background`, `Spacing`, `Size`, `Icon size`, `Border radius`). Primitives use `<Hue>/<step>` (`Blue/60Hover`), and single-level palette entries use `Neutral/<Name>`. |
| `type` | `COLOR`, `FLOAT` or `STRING`. Figma cannot change a variable's type after creation. |
| `source` | The DTCG file and JSON pointer, or the `@carbon/type` export. The Adapter stores the flat name explicitly, because no single rule derives it: `themes.json` joins the path (`text` › `on` › `color` → `text-on-color`), while in `layout.json` the leaf key is already the full name (`spacing` › `spacing-05`). |
| `scopes` | The Figma `VariableScope` list, stored per variable (see [Scopes](#scopes)). |
| `codeSyntax` | `{WEB: …}` per variable, or `{}` (see [codeSyntax](#codesyntax)). |
| `hidden` | `true` → `hiddenFromPublishing`. Set on Primitives. |
| `values` | One entry per mode key of the collection. See the value forms below. |
| `usedBy` | Component Family keys whose Contracts reference this token. Derived. It is used for review and for orphan reports. |

### Value forms (per mode)

| Form | Meaning | Figma write |
|---|---|---|
| `{alias, resolved}` | Alias to a Primitive by its flat name. `resolved` is the final colour. | `createVariableAlias(primitive)` |
| `{raw, alpha, resolved, from, level, reason}` | The source value is an alias plus alpha (`{value, alpha}` in `themes.json`, `org.carbon.alphaModifiers` in `button.json`). It is flattened to RGBA because a Figma alias cannot carry alpha. `from` keeps the source alias. | `{r, g, b, a}` |
| `{value, resolved?, level?, reason?}` | A literal that is the token's own source value: palette hexes, layout px, type numbers, and `button-danger-hover` `#b81921`. In the Theme collection a `value` always carries `level` and `reason`, because Theme is otherwise alias-only. `button-danger-hover` is kept exact; the nearest primitive, `red.60Hover` `#b81922`, is off by one. | literal |

- `resolved` is present on every COLOR mode value. It is written in the same notation as the compiled CSS (`#0f62fe`, `rgba(141, 141, 141, 0.3)`), so the generator can compare it against each `.cds--<theme>` block, and To-preview can use it without resolving aliases.
- FLOAT values are px. `from` records the conversion: `spacing-*` is in miniUnits (×8), `size-*` is px with a rem converter, `icon-size-*` is a `"1rem"` string (×16), and `border-radius-00` is `"0px"`.
- A mode can mix forms. `text-on-color-disabled` is an alias in White and Gray 10, and raw `rgba(255, 255, 255, 0.25)` in Gray 90 and Gray 100.
- A Contract never sees any of this: a token that is raw in some mode is still `{token}` there (#7).

### Scopes

These are the #9 group rules, amended where the Button Contract binds a token outside them. The generator checks every Contract use against the variable's scopes and fails on a miss.

| Tokens | Scopes | Change from #9 |
|---|---|---|
| `text-*` | `TEXT_FILL`, `SHAPE_FILL` | adds `SHAPE_FILL`. `Glyph/Vector` fill is `sameAs Label.fill` (currentColor), so text tokens paint icon vectors. |
| `focus` | `STROKE_COLOR`, `EFFECT_COLOR` | adds `EFFECT_COLOR` for the focus ring's inner shadow (#7). |
| `background` | `ALL_FILLS`, `STROKE_COLOR`, `EFFECT_COLOR` | adds `EFFECT_COLOR` for the gap-ring shadow (#7). |
| other colours | `ALL_FILLS`, `STROKE_COLOR` | no change |
| Spacing | `GAP` (gap and padding; `PADDING` is not an API scope, and the API binds a `GAP` variable to padding, #27) | no change |
| Size, Icon size | `WIDTH_HEIGHT` | no change |
| Border radius | `CORNER_RADIUS` | no change |
| Type | `FONT_FAMILY`, `FONT_SIZE`, `LINE_HEIGHT`, `FONT_WEIGHT`, `LETTER_SPACING` | new |
| Primitives | `[]` | no change |

Scopes only filter Figma's picker. The Plugin API binds a variable regardless of its scopes, so a wrong scope does not break the build. It hides the token from designers.

### codeSyntax

`WEB` is `var(--cds-<flat-name>)` only when that custom property exists in the compiled `@carbon/styles` CSS. Otherwise it is the Sass variable name, with an info note. This changes #9, which put `var(--cds-*)` on everything:

| Tokens | WEB codeSyntax | Why |
|---|---|---|
| Theme colours, `spacing-*` | `var(--cds-button-primary)`, `var(--cds-spacing-05)` | emitted by `@carbon/styles@1.117.0` |
| `size-*`, `icon-size-*`, `border-radius-00` | `$size-lg`, `$icon-size-01`, `$border-radius-00` | no `--cds-*` property exists. `--cds-layout-size-height-*` is a contextual layout property, not this token. The Sass names exist in `@carbon/layout@11.61.0` `scss/generated`. |
| Type variables | `var(--cds-body-compact-01-font-size)`, `-line-height`, `-font-weight`, `-letter-spacing` | emitted |
| `font-family-sans` | `{}` | body styles inherit the family; there is no custom property |
| Primitives | none | hidden, never shown in Dev Mode |

## Text Styles

```json
"body-compact-01": {
  "name": "Body/body-compact-01",
  "source": "packages/type/src/styles.ts#bodyShort01 (bodyCompact01 = bodyShort01)",
  "fontFamily": "IBM Plex Sans", "fontStyle": "Regular", "fontSize": 14,
  "lineHeight": { "unit": "PIXELS", "value": 18 }, "fontWeight": 400, "letterSpacing": { "unit": "PIXELS", "value": 0.16 },
  "binds": { "fontFamily": "font-family-sans", "fontSize": "body-compact-01-font-size", "lineHeight": "body-compact-01-line-height",
             "fontWeight": "body-compact-01-font-weight", "letterSpacing": "body-compact-01-letter-spacing" },
  "usedBy": ["button"]
}
```

- The map key is the flat name a Contract uses in `textStyle: {token}`. Text Styles live in their own map. A name may not appear in both `variables` and `textStyles`, so the builder resolves `textStyle` through `textStyles` and every other field through `variables`.
- The literal fields are what the builder writes first, so the style is correct even before the binds are applied. `binds` then attaches the Type variables (`TextStyle.setBoundVariable`).
- Type variable flat names are Carbon's own custom property names (`body-compact-01-font-size`). One shared `font-family-sans` STRING variable serves every sans style.
- Carbon line heights are unitless (1.28572). The variable holds px, `round(ratio × size)` (18, 22), while its codeSyntax still names the unitless CSS property.
- **Verified in #27** ([probes](../../../docs/research/foundations-figma-probes.md)): Type variables bound onto a Text Style through `use_figma` hold, `fontWeight` 400 selects `Regular` for IBM Plex Sans, and px `lineHeight` and `letterSpacing` bind. The text-node fallback is not used. `letterSpacing` reads back as float32 (0.16 → 0.1599999964), so readback diffs compare it with a tolerance.

## Who writes it

The Adapter generates the document. Nobody edits it by hand. Its inputs are:

1. the Code Library token sources at the pinned commit (`source.files`),
2. the token closure, which is the union of every listed Contract's token references (layout, paint, effects and `textStyle`),
3. the Adapter's fixed mapping rules: the collection split, mode list, naming, scopes, codeSyntax and raw exceptions above.

Scope follows the closure, with one exception. The `Layout` collection carries Carbon's full `spacing-*` (01–13) and `size-*` (xs–2xl) scales regardless of the closure, because an owner can only bind a variable that already exists, and adjusting a Base Component (#8) needs the other spacing steps in the picker. Those variables have an empty `usedBy`. Theme colours, Type variables and Primitives stay closure-only: a Primitive appears only if some Theme mode aliases it, and a Type variable only if a Text Style binds it. `icon-size-*`, `border-radius-*`, `fluid-spacing-*`, `container-*` and `layout-*` stay closure-only too. The document does not hold the whole Carbon theme. That stays in map fog ("Theming beyond what Button needs").

To change a value, change the source pin or an Adapter rule and regenerate. To add a Component Family, add its Contract to `closure.contracts` and regenerate. There is no separate approval step: the document is a pure function of approved inputs, and the foundations slice report (created, updated, orphaned) is what the owner reviews.

## Versioning and staleness

The document is stale, and must be regenerated before any build, when any of these holds:

- `source.commit` differs from the `source.commit` of any Contract in `closure.contracts`. A Design System is pinned to one Code Library version. Contracts at different commits are rejected.
- A listed Contract's current `source.snapshotId` differs from the one recorded in `closure.contracts`.
- The recomputed token union differs from `closure.tokens`, for example after a Contract edit that did not change its snapshot, or the Adapter's full-scale rule differs from `closure.fullScales`.
- Contract validation rule 6 ("every token exists in the foundations") fails.

The ledger records the `documentHash` (sha256 of the document bytes) that it was applied from. The components slice refuses to bind when the hash differs, and the foundations slice must run first.

## Foundations ledger

The foundations ledger is one section of the single authoritative ledger per Design Library file that `to-design` already keeps under `.scratch/to-design/` (gitignored). The components slice owns `sets`.

```json
{
  "schemaVersion": 1,
  "fileKey": "<Design Library file key>",
  "foundations": {
    "designSystem": "carbon",
    "snapshotId": "sha256:…",          // document source.snapshotId
    "documentHash": "sha256:…",        // exact document applied
    "appliedAt": "2026-10-16T00:00:00Z",
    "collections": { "theme": { "id": "VariableCollectionId:21:2", "modes": { "white": "21:1", "g10": "21:2", "g90": "21:3", "g100": "21:4" } }, … },
    "variables":   { "blue.60": "VariableID:21:103", "button-primary": "VariableID:21:131", "spacing-05": "VariableID:21:150", … },
    "textStyles":  { "body-compact-01": "S:…,21:900", "body-compact-02": "S:…,21:901" },
    "orphans":     { "variables": { "icon-primary": { "id": "VariableID:21:99", "since": "sha256:<documentHash>" } }, "textStyles": {} }
  },
  "sets": {}
}
```

- Keys are flat names in both `variables` and `textStyles`, and mode keys in `collections.*.modes`. These are the same strings the Contract and the document use, so the builder binds with `ledger.variables[token]` and `ledger.textStyles[token]`.
- The slice returns this section uncompacted. It is about 3 KB for Button, far under the 20 KB output cap, so #18's ID-array compaction is not needed here.
- The foundations slice package carries the document without the review-only fields (`source`, `closure`, `from`, `reason`, `level`, `usedBy`, `resolved`, `notes`, `checks`). That is about 17.8 K characters of compact JSON for Button, under the 50 K code cap with room for the core (the whole package was 34.1 K characters on the first live run and 37.6 K with a full ledger). `skills/to-design/scripts/build-plan.mjs` strips these fields when it derives the build plan, and a to-design test asserts that the stripped and the full document build the same objects (#29).

## Update semantics (idempotent)

Identity is the flat name, carried through the ledger id. Figma names and labels are presentation and may change.

1. **Gate, then preflight, read-only.** The core first verifies the package `CHECK` (#17) and the file key. Then it reads every ledger id and every local collection, variable and Text Style, and works out every conflict before any mutation.
2. **Ownership.** The slice touches only collections, modes, variables and Text Styles recorded in the ledger. If a same-name object exists that the ledger does not record, the result is `conflict: unowned` and nothing changes. Any conflict stops the whole slice before its first change. The owner's own file, for example, has a `Theme` collection with Light/Dark modes. The run option `adopt: true` allows taking over exact-name objects. It is used only after a lost connection, once a readback has shown they came from this workflow (#10: lost connections still commit).
3. **Collections and modes.** A ledger id that resolves is renamed in place if the name differs. A missing collection is created; its first mode is renamed to the default label and the rest are added. Modes match by key through the ledger, and a changed label is renamed. A mode in Figma that the document lacks is reported in `extraModes` and kept, because removing a mode deletes its values. Mode order is fixed, not just reported: Figma has no reorder method, but `setDefaultMode` moves a mode to index 0, so when the order differs the slice calls it for each document mode in reverse order. That leaves the document order, with the first mode (`white`) as the default (#27; confirmed by readback after the #29 live run). Extra modes end up after the document modes.
4. **Variables**, in document order (Primitives, Theme, Layout, Type):
   - Resolve the ledger id (or its `orphans` id, which restores it). If the id is missing and an unrecorded variable with the exact `name` sits in the owned collection, that is `conflict: unowned`, the same rule as step 2; `adopt: true` takes it over. Otherwise create the variable.
   - If the resolved type differs, the result is `conflict: type-change`. Figma cannot change a variable's type, and deleting it would unbind consumers, so the owner decides. A recorded variable found in a different collection is `conflict: collection-change`.
   - Then compare and write only what differs: `name`, `scopes`, `codeSyntax` (removing WEB when it is `{}`), `hiddenFromPublishing`, and every mode value. Figma stores numbers as float32 (`0.16` reads back as `0.1599999964`), so numbers compare within 1e-4 and colour channels within 1/512. The report lists the changed fields per name; a name with none counts as unchanged.
5. **Text Styles**, after Type: resolve or create, load the font, write the literals for a new style or for fields no variable binds, then `setBoundVariable` for each bind whose bound id differs.
6. **Orphans.** A ledger entry whose name is no longer in the document is never deleted. It moves to `orphans` with the `since` hash and appears in the report. Consumers keep their bindings. If the name returns, the same id is restored from `orphans`. Deletion happens only through the explicit run option `prune: [names]`, which the owner confirms.
7. **Renames.** A token renamed in the Code Library is a new flat name plus an orphan, with no rename inference in v1. A variable renamed by hand in Figma is renamed back, because the document is the source.
8. **Return** `{slice: "foundations", fileKey, summary, created, updated, orphaned, restored, pruned, conflicts, extraModes, ledger: {foundations}, ms, outputBytes}`. `summary` counts `created` (collections, modes, variables and Text Styles), `updated`, `unchanged`, `orphaned`, `restored`, `pruned` and `conflicts`. A run with conflicts returns the old ledger section unchanged. The agent records the result with `node skills/to-design/scripts/ledger.mjs record <result.json>` before the next call. Live on the draft file (#29): the first run created 88 objects in 457 ms (5.3 KB output); the second created 0, updated 0 and left 81 unchanged in 174 ms (3.9 KB).

## Where it lives

- This schema sits in the shared Contract skill (`skills/contract/references/`), next to the Contract schema. The generator is in the Carbon Adapter skill (`skills/adapter-carbon/scripts/foundations.mjs`, #28).
- A real instance is one `<designSystem.key>.foundations.json` per Design System, kept next to that Design System's Contracts in `design-systems/<designSystem.key>/` (layout set by [#21](https://github.com/pawisssh/design/issues/21)).
- The ledger sits at `.scratch/to-design/<fileKey>.ledger.json`. It is gitignored and there is one per Design Library file. Foundations stay local to the Component Set file for the pilot (#9). Publishing them as a separate library stays in map fog; then a single foundations file would hold the ledger section and consumers would bind by variable key.

## Not verified

- Whether a `GAP`-only variable appears in the **padding** picker in the Figma UI. The API binds it to padding and `GAP` is the only auto-layout spacing scope it accepts (#27), but only an eye check in Figma can show the picker.

## Validation (generator)

1. Every Contract in `closure.contracts` pins the same `source.commit`.
2. Every closure token resolves in the Code Library sources, and every alias target exists in the palette.
3. Every resolved Theme value equals the compiled CSS in the matching `.cds--white` / `.cds--g10` / `.cds--g90` / `.cds--g100` block. Every emitted layout and type custom property matches in px.
4. Every Sass codeSyntax fallback exists in `@carbon/layout`.
5. Every Contract passes rule 6 of the shared module's `validate()` against the generated document, so every Contract use (fill on FRAME, TEXT or vector; stroke; effect colour; padding or gap; min height or size; radius) is inside the bound variable's scopes.
6. Figma names are unique. No flat name is both a variable and a Text Style.
7. Every Theme mode value that is not an alias carries `level` and `reason`.
