# The catalog page and the preview renderer

Read when writing an Adapter's preview renderer or changing the page.

## Preview renderer (one per Adapter)

`scripts/catalog.mjs` imports `skills/adapter-<source.adapter>/scripts/preview.mjs` and calls `previewRenderer(contract)`. It returns (or resolves to):

| Field | What |
|---|---|
| `render(tuple)` | HTML text of the real Code Library component for one tuple `{axisKey: valueKey}`. Map axis values through their Contract `code` props. A value with `code: null` renders like the default; the page forces it through its CSS pseudo-class. |
| `stylesheet` | The Code Library's compiled CSS, inlined into the page. |
| `modeClass(modeKey)` | The class that applies one foundations Theme mode to the page, and so to every specimen and the card chrome. |

It should refuse to render when the installed packages differ from `contract.source.packages`. The Carbon renderer is [`adapter-carbon/scripts/preview.mjs`](../../adapter-carbon/scripts/preview.mjs).

## The page

[`assets/catalog-template.html`](../assets/catalog-template.html) is the shell; `catalog.mjs` inlines into it the library CSS, the shared Contract module (`skills/contract/scripts/contract.mjs`, with `export` stripped, as `window.Contract`), [`assets/selection-model.js`](../assets/selection-model.js), [`assets/catalog-card.js`](../assets/catalog-card.js) and the catalog data `{contract, modes, forces, sourceLabel, specimens}`:

- `modes`: the foundations document's one multi-mode collection, `[{key, label, className}]`; the first is the default.
- `forces`: `[{axis, value, pseudo}]` for every axis value with `code: null`; `pseudo` is the leading pseudo-class of its `css`.
- `sourceLabel`: the card footer value, `code.package` and its pin in `source.packages` (`@carbon/react 1.118.0`).
- `specimens`: `{key: html}`, keyed by `tupleKey` from the shared Contract module. The key (`primary|lg|enabled`) is an internal DOM id and never leaves the page.

`Catalog.configure({catalog, renderSpecimen})` builds the selection model, forces the States and renders every specimen into its card. Captions and checkboxes stay outside the component DOM.

**Cards.** The grid follows the IBM UI Icon Library (Community) grid: 200×200 cards with shared 1px borders and no gap, at most 6 columns, in Contract axis order with no group headings. `catalogCard(specimen, {contract, baseId, sourceLabel, h})` builds one card through the node factory `h(tag, props, ...children)`:

- top-left, the axis values only (`Primary / Extra Small / Enabled`), with the full variant name as the tooltip;
- top-right, the selection checkbox, labelled with the full variant name and locked on the Base Component; the name and checkbox share one `<label>`, so clicking the name toggles it;
- the specimen host, centred; an unchecked card's specimen is dimmed to 40%;
- the footer, `Source` and `sourceLabel`, or `Base Component` on the base card.

The chrome uses Carbon `--cds-*` tokens from the library stylesheet, never raw hex: page `--cds-background`, card `--cds-layer-01`, border `--cds-border-subtle-01`, text `--cds-text-primary` and `--cds-text-secondary`. The Theme toggle puts the mode class (`modeClass`) on `<body>`, so the specimens and the chrome switch together.

**Forcing a State.** Every style rule whose selector uses a forced pseudo-class gets a copy with the pseudo-class replaced by a class (`:hover` becomes `.tp-force-hover`), inserted right after the original. Copies from a hover-capability media query (`@media (any-hover: hover)`) go beside the query, so they apply in any browser. The rendered component's root element gets the class.

**Selection model.** `new CatalogSelection(contract, contractModule)`: `specimens`, `selected`, `baseId`, `select(id, on)` (throws on unchecking the Base Component), `selectAll`, `selectMatching(filters, on)` (skips the Base Component), `verify(id)`, `checkedTuples()` and `omitPatch()`. All expansion and matching goes through the shared Contract module.

**Export.** Downloads `<family>.omit-patch.json` and `<family>.checked.json` and dispatches the `window` event `to-preview:selection` with `{patch, checked}` in `event.detail`; `Catalog.getSelection()` returns the same. A download does not reach the agent by itself: the owner says where the files are, or a project-local bridge collects them.
