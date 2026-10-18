# The catalog page and the preview renderer

Read when writing an Adapter's preview renderer or changing the page.

## Preview renderer (one per Adapter)

`scripts/catalog.mjs` imports `skills/adapter-<source.adapter>/scripts/preview.mjs` and calls `previewRenderer(contract)`. It returns (or resolves to):

| Field | What |
|---|---|
| `render(tuple, properties)` | HTML text of the real Code Library component for one tuple `{axisKey: valueKey}`. Map axis values through their Contract `code` props, and fill a missing axis with its `default`. A value with `code: null` renders like the default; the page forces it through its CSS pseudo-class. Without `properties` it renders the specimen: TEXT properties at their defaults, and the default icon shown. To-handoff passes a usage's `properties`, keyed by Contract property key (`{label: "Save", icon: false}`); a missing key takes its Contract default. Each `code.required` prop comes from `properties[<prop>]`, else from a per-tuple placeholder (`<family>-<values>`). |
| `stylesheet` | The Code Library's compiled CSS, inlined into the page. |
| `modeClass(modeKey)` | The class that applies one foundations Theme mode to the page, and so to every specimen and the card chrome. Only a Mode with no `selector` uses it; a Mode's `selector` wins (#109). |

It should refuse to render when the installed packages differ from `contract.source.packages`. The Carbon renderer is [`adapter-carbon/scripts/preview.mjs`](../../adapter-carbon/scripts/preview.mjs).

## The page

[`assets/catalog-template.html`](../assets/catalog-template.html) is the shell; `catalog.mjs` inlines into it the library CSS, the shared Contract module (`skills/contract/scripts/contract.mjs`, with `export` stripped, as `window.Contract`), [`assets/selection-model.js`](../assets/selection-model.js), [`assets/catalog-card.js`](../assets/catalog-card.js) and the catalog data `{contract, toggles, forces, sourceLabel, specimens}`:

- `toggles`: one per multi-mode collection of the foundations document, in document order, `[{key, label, modes: [{key, label, className}]}]`. `className` is the Mode's `selector` without its dot; `buildCatalog` refuses a selector that is not one class. Each collection's first mode is the default.
- `forces`: `[{axis, value, pseudo}]` for every axis value with `code: null`; `pseudo` is the leading pseudo-class of its `css`.
- `sourceLabel`: the card footer value, `code.package` and its pin in `source.packages` (`@carbon/react 1.118.0`).
- `specimens`: `{key: html}`, keyed by `tupleKey` from the shared Contract module. The key (`primary|lg|enabled`) is an internal DOM id and never leaves the page.

`Catalog.configure({catalog, renderSpecimen})` builds the selection model, forces the States and renders every specimen into its card. Captions and checkboxes stay outside the component DOM.

**Cards.** The grid follows the IBM UI Icon Library (Community) grid: 200×200 cards with shared 1px borders and no gap, at most 6 columns, in Contract axis order with no group headings. The cards of one catalog share one size, which grows past 200×200 only to fit a specimen:

- **Width.** A specimen too wide for a 200px card, such as Carbon's 288px Toast, widens every card of that catalog to fit it. After the specimens render, the page measures each one at its min-content width. One with a set width counts at that width. A fluid one (`width:100%`) counts at its narrowest and still fills its card. The widest one sets `--tp-cell-width`.
- **Height.** At that width, the tallest card (label, specimen and footer) sets `--tp-cell-height`, as the shadcn Card does.
- **Fill.** A specimen whose Contract root is `fill` width (resolve()'s layout) fills its card, as it fills its parent. Its root gets `.tp-fill`.
- **Resize.** The page measures again on resize, because a specimen's width can follow the viewport (the Toast is 22rem from 99rem).

A card is one column (`minmax(0,1fr)`), so its text never widens it. The label wraps, with the full variant name as its tooltip. Each footer item stays on one line and is cut with an ellipsis. The source carries its full text as its tooltip (a shadcn source is the package path and its hash). `catalogCard(specimen, {contract, baseId, sourceLabel, h})` builds one card through the node factory `h(tag, props, ...children)`:

- top-left, the axis values only (`Primary / Extra Small / Enabled`), with the full variant name as the tooltip. A value label the agent drafted (an `axes.<axis>.values.<value>.label` entry `by: "agent"` in the Contract's [`drafted`](../../contract/references/contract-schema.md#drafted-values) table) is marked `.tp-drafted`, in italics with a dotted underline and an asterisk, and the tooltip ends `(drafted: Size)`. An owner-corrected label is not marked. To-preview only flags it; the owner approves it with the Contract;
- top-right, the selection checkbox, labelled with the full variant name and locked on the Base Component; the name and checkbox share one `<label>`, so clicking the name toggles it;
- the specimen host, centred; an unchecked card's specimen is dimmed to 40%;
- the footer, `Source` and `sourceLabel`, or `Base Component` on the base card.

The chrome uses Carbon `--cds-*` tokens from the library stylesheet, never raw hex: page `--cds-layer-01` (gray in White, as in the reference), card `--cds-layer-background`, falling back to `--cds-background` (the surface Carbon designs components on, which follows the Layer Mode), border `--cds-border-subtle-01`, text `--cds-text-primary` and `--cds-text-secondary`. The first toggle (Theme) puts its Mode class on `<body>`, so the specimens and the chrome switch together. Each later toggle (Layer) puts its class on a `div.tp-mode-host` wrapped around the grid, inside the Theme, because Carbon's theme classes re-declare the level-one contextual tokens and a Layer class on the same element would lose to them. A specimen counts as rendered for export only if it rendered with every toggle at its default.

**Forcing a State.** Every style rule whose selector uses a forced pseudo-class gets a copy with the pseudo-class replaced by a class (`:hover` becomes `.tp-force-hover`), inserted right after the original. Copies from a hover-capability media query (`@media (any-hover: hover)`) go beside the query, so they apply in any browser. Every element of the rendered specimen gets the class, its root and each descendant, because a form control styles `:hover` and `:focus` on its nested `<input>` or `<select>` (#93).

**Selection model.** `new CatalogSelection(contract, contractModule)`: `specimens`, `selected`, `baseId`, `select(id, on)` (throws on unchecking the Base Component), `selectAll`, `selectMatching(filters, on)` (skips the Base Component), `verify(id)`, `checkedTuples()` and `omitPatch()`. All expansion and matching goes through the shared Contract module.

**Export.** Downloads `<family>.omit-patch.json` and `<family>.checked.json` and dispatches the `window` event `to-preview:selection` with `{patch, checked}` in `event.detail`; `Catalog.getSelection()` returns the same. A download does not reach the agent by itself: the owner says where the files are, or a project-local bridge collects them. [Vibe-to-Figma](../../vibe-to-figma/SKILL.md)'s review page runs this page unchanged in an iframe per family, hides its `#export` button and collects `Catalog.getSelection()` from each into one file.
