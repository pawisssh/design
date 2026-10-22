# The review page

## On the Artifact

- **Ticks persist.** Each tick or untick saves every family's omit patch to the Artifact's db, one document `review/ticks`: `{designSystem, documentHash, families: {<family>: <omit patch>}}`. A reload restores them. The first open saves the page's state once, so the document exists as soon as every catalog has rendered.
- **Only the owner's ticks save**, by the access rule and the page's `isOwner()` check. Anyone else can tick, but nothing they tick is saved, and the page says so.
- **A tick saves 400 ms after the last one**, or at once when the owner leaves the page for the chat. The page says "Saving the ticks" until the db holds what it shows, then "Ticks saved". Each save writes the page's whole state, so with the page open in two tabs the last to save wins.
- **No export button**, since an Artifact cannot download a file.

## Without the Artifact

Without the Artifact (no `window.claude`), the same file is the local page: open it from `file://` or any static server, and it keeps the export under [The tabs](#the-tabs).

## The tabs

- **Foundations tab:** the Theme colors with each mode's value, and the Text Styles with a specimen. They are read-only, because Foundations change only with the code.
- **Then one tab per Contract:** the family's name, description and variant count, its Drafted values read-only (the owner corrects one in chat: see [2. The review page](../SKILL.md#2-the-review-page)), then [To-preview](../../to-preview/SKILL.md)'s own catalog page for it, unchanged, in an iframe. `buildCatalog` builds it, and the Adapter's preview renderer renders it over `--project`. Only the catalog's own export button is hidden.
- **Export the review** downloads one file, `<name>.review.json`: `{designSystem, documentHash, families: {<family>: {patch, checked}}}`. Each family's `patch` and `checked` are exactly what To-preview's export writes for that family, and `documentHash` names the Foundations document the page showed. It refuses until every catalog has rendered. It also dispatches the `window` event `vibe-to-figma:review`, with the file's content in `event.detail`.

The seams are `reviewModel(dir)` and `buildReview({dir, renderer})` ([`scripts/review.mjs`](../scripts/review.mjs)), `reviewExport(model, selections)` ([`assets/review-export.js`](../assets/review-export.js)), and `storedTicks(exported)` and `restorable(model, stored)` ([`assets/review-store.js`](../assets/review-store.js)), which the page and the tests share. The page restores a family's ticks with To-preview's `Catalog.setSelection(patch)`.
