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

Output with the Button Contract (#108): 38 closure tokens; 698 variables (244 Primitives, 249 Theme, 15 Layer, 44 Layout, 146 Type) and 36 Text Styles. To-design's default subset of it is still 75 variables and 2 Text Styles. 1203 values match the compiled `@carbon/styles` CSS: 996 Theme mode values (all 936 `themes.json` values and the 60 `button-*` ones), 45 Layer mode values (#109), 17 layout values, 141 type values and the 4 per-style `font-family` properties (`code-01`/`02`, `fluid-quotation-01`/`02`). Two type values differ from `styles.ts` and are listed in `checks.css.differs` (see [Text Styles](#text-styles)). All 27 Sass codeSyntax fallbacks exist in `@carbon/layout`. The Button Contract passes rule 6 against the document, so every Contract use of a token falls inside that variable's scopes.

## Top level

| Field | Required | Content |
|---|---|---|
| `schemaVersion` | yes | Integer, `1`. Same rule as the Contract: an additive optional field keeps it; a rename, removal or change of meaning bumps it. |
| `designSystem` | yes | `{key, name}`. `key` names the file (`carbon.foundations.json`) and the ledger section. |
| `source` | yes | Same shape as the Contract's `source`: `codeLibrary`, `adapter`, `repository`, `tag`, `commit`, `packages`, `files {path: sha256:…}`, `snapshotId`. `files` lists every file the Adapter read for foundations, and `snapshotId` is computed over it the same way as the Contract's. It includes `colors.json` and `scale.ts`, which are not in Button's Contract. The Generic Adapter reads a consumer's project, which has no repository, tag or commit: its `source` is `codeLibrary`, `adapter: "generic"`, `packages` (the pinned versions of the packages the project resolves and its CSS imports), `files` (paths relative to the project) and `snapshotId`. |
| `closure` | yes | A record of what Contracts use, not the document's scope (#107). `contracts: [{family, path, snapshotId}]` is the Contracts this document was derived from. `tokens` is the sorted union of their token references, including `textStyle` references. To-design builds the closure in every Design Library file (see [To-design builds a subset](#to-design-builds-a-subset)). |
| `collections` | yes | Ordered list `{key, name, modes: [{key, label, selector?}], hidden?}`. The first mode is the default. `selector` is the CSS that switches to the mode (`.cds--g100`, `.cds--layer-two`, `.dark`). A default Mode that is the page itself (shadcn's `:root` Light) has none, and the renderer's `modeClass` names an inert class for it. It is review-only: To-preview reads it, and the build plan strips it. To-preview applies each Mode as one class, so a selector it reads is one class selector (#109). |
| `variables` | yes | Map from flat name to variable. See [Variables](#variables). The order is collection order, then tokens by name, which is also the creation order (aliases need their targets first). The Generic Adapter puts a collection's Synthesized tokens (`source` starting `synthesized: `) after its Code Library tokens, each part by name. |
| `textStyles` | yes (may be `{}`) | Map from flat name to Text Style. See [Text Styles](#text-styles). |
| `checks` | yes | Evidence from generation: a CSS cross-check (`against`, `sha256`, `matched`, `missing`, and `differs`, the sorted flat names whose value the document takes from the CSS over the source), a Sass fallback check (`against`, `matched`) and the scope check (`by`, the validator and rule that ran; `contracts`, how many Contracts it checked; `errors`, always 0, since generation fails otherwise). The Generic Adapter records `css` (`against` the project's CSS file, `converted`: mode values through the shared converter), `compiled` (`against` the pinned Tailwind, `matched`: utilities whose compiled declaration equals the document). It records `scopes` when its closure lists a Contract: the Adapter builds each family's Contract against the document in the same run (#120). |
| `notes` | no | `{level: info|warning|verify, at, message}`, as in the Contract. |

## Collections and modes

The Carbon collections, each holding the whole theme (#108).

| key | name | modes | Content |
|---|---|---|---|
| `primitives` | `Primitives` | `default` | The whole palette (`colors.json`, 244 entries). `hidden: true` (`hiddenFromPublishing`), scopes `[]`. |
| `theme` | `Theme` | `white` White, `g10` Gray 10, `g90` Gray 90, `g100` Gray 100, selectors `.cds--white` … `.cds--g100` | Every `themes.json` token, plus the component tokens of each Component Family that has a Contract (`button.json`'s 15 `button-*`, each with `family: "button"`). Component tokens of families without a Contract stay out (ADR 0006). |
| `layer` | `Layer` | `one` One, `two` Two, `three` Three, selectors `.cds--layer-one` … `.cds--layer-three` | The 15 contextual tokens of `@carbon/styles`' layer sets (`layer/_layer-sets.scss`, #109): `field`, `layer`, `border-subtle` and the rest. Level n aliases the set's nth Theme token (`field` → `field-01`/`02`/`03`; `border-subtle` lists `-00` first, so One is `border-subtle-00`). A Layer value is an alias only (see [Value forms](#value-forms-per-mode)). ADR 0012. |
| `layout` | `Layout` | `default` | Every `layout.json` group: Spacing, Fluid spacing, Container, Layout, Size, Icon size, Border radius. |
| `type` | `Type` | `default` | The variables that Text Styles bind, for every `@carbon/type` style. |

The shadcn collections, from the Generic Adapter ([`adapter-generic`](../../adapter-generic/SKILL.md), #118):

| key | name | modes | Content |
|---|---|---|---|
| `theme` | `Theme` | `light` Light (`:root`), `dark` Dark (`.dark`) | Every colour custom property of the project's global CSS. Component tokens (`sidebar`, `sidebar-*`, `chart-*`) carry `family`. Then each Component Family's Synthesized tokens (#120, ADR 0009): `Button/button-outline-fill` and the rest, with `family` and `source: "synthesized: <file>:<lines> <utilities>"`. |
| `layout` | `Layout` | `default` | `Spacing/spacing-<step>` (Tailwind's classic scale over `--spacing`) and `Radius/radius-<k>` (the `@theme --radius-*` steps over `--radius`). |

- **Modes are keyed by the Code Library's theme key** (`white`, `g10`, `g90`, `g100`), not by the Figma label. `label` is the Figma mode name, so renaming a label never breaks values or the ledger, the same rule as Contract axis values. The Adapter iterates this fixed list, so extra DTCG keys such as `button-separator`'s `fallback` are ignored.
- Single-mode collections use the mode key `default` (label `Default`).
- A Layer variable takes its Figma group from its level-one target (`Field/field`, `Border/border-subtle`), so a group selected for a subset build brings its Layer tokens with it. Layer is built after Theme, because its aliases need their targets first.

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
| map key | The **flat name**: the Code Library's own name for Theme, Layout and Type (`button-primary`, `spacing-05`, `body-compact-01-font-size`), the same string a Contract writes. Primitives use the palette path (`blue.60Hover`, `white`). The dot cannot occur in a Carbon flat name, so the two namespaces cannot collide. A Synthesized token's name is the Adapter's, derived from its Contract rule (#70 §1), and generation fails if a Code Library token already has it. |
| `collection` | A collection `key`. |
| `name` | The Figma variable name, `<Group>/<flat-name>` (#9). Group is the DTCG top-level key in sentence case: first word capitalised, the rest lowercase (`Button`, `Text`, `Background`, `Spacing`, `Size`, `Icon size`, `Border radius`, `Font family`). Owner-confirmed 2026-10-16. Axis value labels in a Contract stay Title Case; groups are variable folders, not property values. Primitives use `<Hue>/<step>` (`Blue/60Hover`), and single-level palette entries use `Neutral/<Name>`. |
| `type` | `COLOR`, `FLOAT` or `STRING`. Figma cannot change a variable's type after creation. |
| `source` | The DTCG file and JSON pointer, or the `@carbon/type` export. The Generic Adapter writes the CSS file and property, or for a Synthesized token `synthesized: <component file>:<lines> <utilities>` (#120). The Adapter stores the flat name explicitly, because no single rule derives it: `themes.json` joins the path (`text` › `on` › `color` → `text-on-color`), while in `layout.json` the leaf key is already the full name (`spacing` › `spacing-05`). |
| `scopes` | The Figma `VariableScope` list, stored per variable (see [Scopes](#scopes)). |
| `codeSyntax` | `{WEB: …}` per variable, or `{}` (see [codeSyntax](#codesyntax)). |
| `hidden` | `true` → `hiddenFromPublishing`. Set on Primitives. |
| `values` | One entry per mode key of the collection. See the value forms below. |
| `usedBy` | Component Family keys whose Contracts reference this token. Derived. It is used for review and for orphan reports. |
| `family` | Optional. The Component Family key that marks this variable as a component token (`button-primary` → `button`), whether or not a Contract uses it yet. `validateProposal` reads it (#111). Review-only: the build plan strips it. |

### Value forms (per mode)

| Form | Meaning | Figma write |
|---|---|---|
| `{alias, resolved}` | Alias to any variable earlier in document order, by its flat name: a Primitive, or a Theme token for a Layer token. `resolved` is the final colour. A Layer value is `{alias}` alone: its colour depends on the Theme mode too, so it has no single `resolved`. The builder core today accepts only a target in an earlier collection, so a same-collection alias (a Synthesized token, ADR 0009) waits on a core change. | `createVariableAlias(target)` |
| `{raw, alpha, resolved, from, level, reason}` | The source value is an alias plus alpha (`{value, alpha}` in `themes.json`, `org.carbon.alphaModifiers` in `button.json`). It is flattened to RGBA because a Figma alias cannot carry alpha. `from` keeps the source alias. | `{r, g, b, a}` |
| `{raw, alpha, resolved, from: {css}, level?, reason?}` | A literal colour with alpha below 1 (shadcn dark `--border: oklch(1 0 0 / 10%)`). The builder writes alpha only from `raw`, so a literal with alpha takes this form too; there is no alias, and `level`/`reason` appear only when clipped. | `{r, g, b, a}` |
| `{raw, alpha?, resolved, from: {alias}, level: "info", reason}` | A Synthesized token's mode value that is a plain Theme token (Generic Adapter, #120), flattened to that token's value in the mode. This is the #103 fallback until the builder core binds a same-collection alias (#124): `from.alias` keeps the target, so a later pass can turn it into `{alias, resolved}`. A Synthesized token at an opacity (`bg-input/30`) takes the alias-plus-alpha form above, with `from: {alias, alpha}`. | `{r, g, b, a}` |
| `{raw, alpha?, resolved, from: {mix}, level: "info", reason}` | A Synthesized token's mode value that is a `color-mix` of tokens: the mix text, evaluated by the shared converter over each token's CSS in that mode. | `{r, g, b, a}` |
| any COLOR form with `from.css` | Optional. The value's source text as CSS (a custom property's declared value). Review-only, like the rest of `from`. A value the shared converter clipped into sRGB carries `level: "info"`, `reason: "outside sRGB, clipped per channel"` (#70 §5). | as the form |
| `{value, resolved?, level?, reason?}` | A literal that is the token's own source value: palette hexes, layout px, type numbers, `fluid-spacing-*` CSS text, and `button-danger-hover` `#b81921`. In a Theme collection whose source is aliases (Carbon), a `value` always carries `level` and `reason`, because that Theme is otherwise alias-only. `button-danger-hover` is kept exact; the nearest primitive, `red.60Hover` `#b81922`, is off by one. The three `ai-popover-caret-*` tokens are DTCG colour objects (`{colorSpace, components, hex}`) in every mode; the value is their `hex`, at level `info`. A Code Library whose theme is literal CSS (shadcn) writes every Theme value as a literal with `from.css`, and `level`/`reason` only when clipped. | literal |
| FLOAT with `from: {multiplier, factor}` | A step of a scale over one CSS multiplier: `spacing-1_5` is 1.5 × `--spacing`, `radius-sm` 0.6 × `--radius`. The multiplier itself is not a variable (#70 §3). | literal |

- `resolved` is present on every COLOR mode value outside Layer. It is written in the same notation as the compiled CSS (`#0f62fe`, `rgba(141, 141, 141, 0.3)`), so the generator can compare it against each `.cds--<theme>` block, and To-preview can use it without resolving aliases.
- FLOAT values are px. `from` records the conversion: `spacing-*`, `container-*` and `layout-*` are in miniUnits (×8), `size-*` and most `border-radius-*` are px with a rem converter, `icon-size-*` is a `"1rem"` string (×16), and `border-radius-00` and `border-radius-max` are px strings (`"0px"`, `"999999px"`).
- `fluid-spacing-*` is viewport-relative (`0`, `2vw`, `5vw`, `10vw`). Figma has no vw unit, so it is a STRING holding the exact CSS text, with scopes `[]` and an info reason. It is there for codeSyntax and for matching, and binds to nothing.
- Every value the generator cannot read (a palette hex, a Layout value, a Theme mode value, a Type field) fails generation, naming the token, and the mode where there is one. Nothing is skipped silently.
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
| Size, Icon size, Container | `WIDTH_HEIGHT` | Container is new (#108) |
| Border radius | `CORNER_RADIUS` | no change |
| Fluid spacing | `[]` | new (#108): a STRING of CSS text binds to nothing |
| Layout (`layout-*`) | `[]` | new (#108): deprecated in `@carbon/layout` (`$extensions['carbon.layout'].deprecated`), so it stays out of the pickers; each value carries the reason |
| Type | `FONT_FAMILY`, `FONT_SIZE`, `LINE_HEIGHT`, `FONT_WEIGHT`, `LETTER_SPACING` | new |
| Primitives | `[]` | no change |
| Synthesized (Generic Adapter) | only the scope its use needs: `FRAME_FILL`, `STROKE_COLOR` or `EFFECT_COLOR` | new (#120) |

Scopes only filter Figma's picker. The Plugin API binds a variable regardless of its scopes, so a wrong scope does not break the build. It hides the token from designers.

### codeSyntax

`WEB` is `var(--cds-<flat-name>)` only when that custom property exists in the compiled `@carbon/styles` CSS. Otherwise it is the Sass variable name, with an info note. This changes #9, which put `var(--cds-*)` on everything:

| Tokens | WEB codeSyntax | Why |
|---|---|---|
| Theme colours, `spacing-*`, `fluid-spacing-*` | `var(--cds-button-primary)`, `var(--cds-spacing-05)`, `var(--cds-fluid-spacing-02)` | emitted by `@carbon/styles@1.117.0` |
| `size-*`, `icon-size-*`, `border-radius-*`, `container-*`, `layout-*` | `$size-lg`, `$icon-size-01`, `$border-radius-04`, `$container-01`, `$layout-01` | no `--cds-*` property exists. `--cds-layout-size-height-*` is a contextual layout property, not this token. The Sass names exist in `@carbon/layout@11.61.0` `scss/generated`. |
| Type variables | `var(--cds-body-compact-01-font-size)`, `-line-height`, `-font-weight`, `-letter-spacing` | emitted |
| `font-family-sans`, `font-family-mono`, `font-family-serif` | `{}` | there is no per-family custom property; the styles that set a family (`code-*`, `fluid-quotation-*`) emit the whole stack as `font-family` |
| Primitives | none | hidden, never shown in Dev Mode |
| shadcn (Generic Adapter) | whatever Tailwind compiles for the variable's utility: `var(--primary)` (`bg-primary`), `calc(var(--spacing) * 1.5)` (`p-1.5`), `1px` (`p-px`), `0px` (`p-0`), `calc(var(--radius) * 0.6)` (`rounded-sm`, inlined by `@theme inline`) | the codeSyntax is what a developer's compiled CSS says, so a reference match by codeSyntax hits (#70 §3) |
| Synthesized (Generic Adapter) | the utilities that set it, in source order: `bg-background dark:bg-input/30` | no single custom property holds it (#120) |

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
- Type variable flat names are Carbon's own custom property names (`body-compact-01-font-size`). One shared STRING variable per family serves every style of that family: `font-family-sans`, `font-family-mono` (`code-*`) and `font-family-serif` (`fluid-quotation-*`), each holding the first family of Carbon's stack.
- **All 36 `@carbon/type` styles** are emitted, each under the current name an alias points at (`bodyCompact01 = bodyShort01` → `body-compact-01`; `heading07 = productiveHeading07` → `heading-07`), or its own name when no alias does. Legacy names (`body-short-01`) are not emitted; a Contract that uses one fails generation as not found.
- **Fluid styles** (`fluid-*`) carry their base values. Their `breakpoints` are ignored, with a note, because a Text Style has one value per field.
- **Inherited weight.** A style whose `styles.ts` sets no `fontWeight` inherits regular, 400. `helper-text-02`'s CSS emits `--cds-helper-text-02-font-weight: 400`, so it has the variable and bind, with an info reason. `helper-text-01`'s CSS emits none, so it has no font-weight variable, and an info note at `textStyles.helper-text-01.fontWeight`.
- **Where `styles.ts` and the compiled CSS differ,** the document takes the CSS, because codeSyntax names the CSS property. Only an explicit list in the Adapter may differ: `heading-07-line-height` (1.199 vs 1.19) and `expressive-heading-01-line-height` (1.25 vs 1.42857). Each carries a warning note and a value-level `level: "warning"` and `reason`, and is listed in `checks.css.differs`, not counted in `matched`. Any other difference, or a listed one that no longer differs, fails generation.
- Carbon line heights are unitless (1.28572). The variable holds px, `round(ratio × size)` (18, 22), while its codeSyntax still names the unitless CSS property.
- Type fields other than `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing` and `breakpoints` fail generation, naming the style and field.
- **Verified in #27** ([probes](../../../docs/research/foundations-figma-probes.md)): Type variables bound onto a Text Style through `use_figma` hold, `fontWeight` 400 selects `Regular` for IBM Plex Sans, and px `lineHeight` and `letterSpacing` bind. The text-node fallback is not used. `letterSpacing` reads back as float32 (0.16 → 0.1599999964), so readback diffs compare it with a tolerance.

## Who writes it

The Adapter generates the document. Nobody edits it by hand. Its inputs are:

1. the Code Library token sources at the pinned commit (`source.files`),
2. the token closure, which is the union of every listed Contract's token references (layout, paint, effects and `textStyle`),
3. the Adapter's fixed mapping rules: the collection split, mode list, naming, scopes, codeSyntax and raw exceptions above.

The document carries the whole theme (ADR 0006, #107, #108); a variable no Contract uses has an empty `usedBy`. The Carbon Adapter's theme source is `themes.json`, `colors.json`, `layout.json` and `@carbon/type`'s `styles.ts`, plus the component token file of each Component Family that has a Contract. A closure token found in none of them fails generation. What a Design Library file holds is To-design's choice, not the document's (see [To-design builds a subset](#to-design-builds-a-subset)).

To change a value, change the source pin or an Adapter rule and regenerate. To add a Component Family, add its Contract to `closure.contracts` and regenerate. There is no separate approval step: the document is a pure function of approved inputs, and the foundations slice report (created, updated, orphaned) is what the owner reviews.

## Versioning and staleness

The document is stale, and must be regenerated before any build, when any of these holds:

- `source.commit` differs from the `source.commit` of any Contract in `closure.contracts`. A Design System is pinned to one Code Library version. Contracts at different commits are rejected. This rule holds for libraries pinned by commit. An installed-source library has none, and the same check by `source.packages` is future work.
- A listed Contract's current `source.snapshotId` differs from the one recorded in `closure.contracts`.
- The recomputed token union differs from `closure.tokens`, for example after a Contract edit that did not change its snapshot.
- Contract validation rule 6 ("every token exists in the foundations") fails.

The ledger records the `documentHash` (sha256 of the document bytes) that it was applied from. The components slice refuses to bind when the hash differs, and the foundations slice must run first.

## Foundations ledger

The foundations ledger is one section of the single authoritative ledger per Design Library file that `to-design` already keeps under `.scratch/to-design/` (gitignored). The components slice owns `sets`.

```json
{
  "schemaVersion": 1,
  "fileKey": "<Design Library file key>",
  "foundationsGroups": ["Size", "Spacing"],   // the owner's selection; absent means this default
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
- The foundations slice package carries the selected subset of the document (or one chunk of it) without the review-only fields (`source`, `closure`, `from`, `reason`, `level`, `usedBy`, `family`, `resolved`, `notes`, `checks`, and each mode's `selector`). That is about 17.8 K characters of compact JSON for Button, under the 50 K code cap with room for the core (the whole package was 34.1 K characters on the first live run and 37.6 K with a full ledger). `skills/to-design/scripts/build-plan.mjs` strips these fields when it derives the build plan, and a to-design test asserts that the stripped and the full document build the same objects (#29).

## To-design builds a subset

The document carries the whole theme; a Design Library file holds only a selection of it (ADR 0006, #107). `skills/to-design/scripts/foundations-subset.mjs` computes it, and `build-plan.mjs --slice foundations` packages it.

- **Group** is the first segment of the Figma `name`: `Spacing/spacing-05` is in Spacing, `Body/body-compact-01` in Body.
- **The selection** is `closure.tokens`, plus every variable and Text Style in the file's groups, plus every alias target and Text Style bind target they reach, transitively. A file's groups are the ledger's `foundationsGroups`, else whichever of Spacing and Size the document has (shadcn has no Size). The owner changes them with `node skills/to-design/scripts/ledger.mjs groups --doc <foundations.json> --file-key <key> --add <group> --remove <group>`; a group the document lacks is refused when the owner names it. A slice result never carries `foundationsGroups`, so recording a build keeps it.
- **The plan** holds the selected entries in document order and only the collections they use. `documentHash` is still the whole document's hash.
- **Over the cap, chunked by group.** When the plan and state would pass the `use_figma` code cap, the selection is split into calls of whole groups in document order, so Primitives come first; each chunk carries the alias and bind targets its groups reach. `build-plan.mjs --chunk N` derives chunk N, and refuses it until every earlier chunk's groups are recorded from this document. A chunk's state holds only the chunk's names, so the unchanged core orphans none of the other chunks' names, and `ledger.mjs record` merges a chunk's names into the section. Chunk 1 also carries the recorded names that left the selection, so they are orphaned once, and `prune` runs only with chunk 1. A single group too big for one call is refused by name.
- **Removing a group** makes its entries Orphans on the next build (rule 6 below), never deletions; an entry a remaining selection still reaches stays built.
- **The base-loop picker** lists every document variable and marks those this file has not built (`name (not built: add group G)`). A token edit to an unbuilt token is refused with the group to add.

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
6. **Orphans.** A ledger entry whose name is no longer in the selection (it left the document, or the owner removed its group) is never deleted. It moves to `orphans` with the `since` hash and appears in the report. Consumers keep their bindings. If the name returns, the same id is restored from `orphans`. Deletion happens only through the explicit run option `prune: [names]`, which the owner confirms.
7. **Renames.** A token renamed in the Code Library is a new flat name plus an orphan, with no rename inference in v1. A variable renamed by hand in Figma is renamed back, because the document is the source.
8. **Return** `{slice: "foundations", fileKey, summary, created, updated, orphaned, restored, pruned, conflicts, extraModes, ledger: {foundations}, ms, outputBytes}`. `summary` counts `created` (collections, modes, variables and Text Styles), `updated`, `unchanged`, `orphaned`, `restored`, `pruned` and `conflicts`. A run with conflicts returns the old ledger section unchanged. The agent records the result with `node skills/to-design/scripts/ledger.mjs record <result.json>` before the next call. Live on the draft file (#29): the first run created 88 objects in 457 ms (5.3 KB output); the second created 0, updated 0 and left 81 unchanged in 174 ms (3.9 KB).

## Where it lives

- This schema sits in the shared Contract skill (`skills/contract/references/`), next to the Contract schema. The generators are in the Adapter skills: `skills/adapter-carbon/scripts/foundations.mjs` (#28) and `skills/adapter-generic/scripts/foundations.mjs` (shadcn, #118).
- A real instance is one `<designSystem.key>.foundations.json` per Design System, kept next to that Design System's Contracts in `design-systems/<designSystem.key>/` (layout set by [#21](https://github.com/pawisssh/design/issues/21)).
- The ledger sits at `.scratch/to-design/<fileKey>.ledger.json`. It is gitignored and there is one per Design Library file. Foundations stay local to the Component Set file for the pilot (#9). Publishing them as a separate library stays in map fog; then a single foundations file would hold the ledger section and consumers would bind by variable key.

## Not verified

- Whether a `GAP`-only variable appears in the **padding** picker in the Figma UI. The API binds it to padding and `GAP` is the only auto-layout spacing scope it accepts (#27), but only an eye check in Figma can show the picker.

## Validation (generator)

1. Every Contract in `closure.contracts` pins the same `source.commit`. This holds for libraries pinned by commit; installed-source libraries have no commit yet.
2. Every closure token resolves in the Code Library sources, every source value is readable, and every Theme alias target exists in the palette. Every layer set lists at least three Theme tokens, and every Layer alias targets a Theme token.
3. Every resolved Theme value equals the compiled CSS in the matching `.cds--white` / `.cds--g10` / `.cds--g90` / `.cds--g100` block. Every Layer value matches its `.cds--layer-one` / `-two` / `-three` block, `var(--cds-<target>, <White fallback>)`, in target and fallback, and every Mode selector has a rule in the CSS. Every emitted layout and type custom property matches in px (`fluid-spacing-*` as exact text), and each family's first font matches the CSS stack, except the listed `checks.css.differs`.
4. Every Sass codeSyntax fallback exists in `@carbon/layout`.
5. Every Contract passes rule 6 of the shared module's `validate()` against the generated document, so every Contract use (fill on FRAME, TEXT or vector; stroke; effect colour; padding or gap; min height or size; radius) is inside the bound variable's scopes.
6. Figma names are unique. No flat name is both a variable and a Text Style.
7. Every Theme mode value that is not an alias carries `level` and `reason` (Carbon, whose Theme is alias-based; the Generic Adapter's literal Theme values carry them only when clipped, and its Synthesized values always, at `info`).
