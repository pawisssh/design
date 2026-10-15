---
name: component-sheet-html
description: Build an interactive HTML component catalog from real library code or component specs, with full state/size/theme grids, variant checkboxes, filters and selection-manifest export. Use to review and select component families or individual variants before generating native Figma scripts.
---

# Component Sheet HTML

Own source discovery, interactive preview and selection evidence. Produce an inspectable catalog backed by real components plus a versioned selection manifest. Native Figma script generation belongs to `code-to-canvas`; this skill returns its artifacts to the caller without starting that workflow itself.

## Source and scope

Discover the requested project's exports, implementation/types/styles, stories, tokens, fonts/providers and assets. Accept HTML/CSS, installed code libraries and `.txt` component specs. Read [references/source-adapters.md](references/source-adapters.md) for Coinbase/spec inputs. Inventory family names cheaply; render full grids only for opened/selected families. For an explicitly scoped batch, limit the catalog to that batch.

Stories are examples, not exhaustive coverage. Include source-defined CSS pseudo-states and supported selected/focus composites; record state precedence, defaults, constraints, aliases and source/version evidence. Equivalent aliases require an explicit mapping. Preserve unresolved source gaps instead of inventing visual values.

## Catalog, matrix and source plan

Read [references/sheet-contract.md](references/sheet-contract.md) for the shared catalog/selection contract. Derive the full supported finite visual matrix independently of rendered success. Keep arbitrary text and icon names outside the finite product; show supported compositions, long copy and icon/visibility review cases. Record invalid complete tuples with source evidence.

Record anatomy/parent-child roles, authored layout and intrinsic/fixed/stretch intent, min/max limits, text behavior, overlays/anchors and token identities/aliases per mode. Keep computed pixel bounds as separate evidence. This source plan feeds both preview review and the later native builder; Figma API conversion is owned by the consuming skill.

Compute dependencies per specimen/family: required tokens, actual icons, fonts and nested components. Include their transitive closure automatically, show it in the selection summary and preserve order. Dependency helpers do not authorize building unrelated complete families.

## Interactive HTML

Copy/adapt [assets/component-sheet-template.html](assets/component-sheet-template.html) and [assets/selection-model.js](assets/selection-model.js). Wire `ComponentSheet.configure({catalog, renderSpecimen})` to the real project renderer as documented in [references/interactive-template.md](references/interactive-template.md). React/Vue/etc. previews mount real exports through the existing runtime; plain HTML uses original markup/styles. Keep source packages unchanged.

Provide family checkboxes, a complete variant grid for each opened/selected family, variant checkboxes, size/state/theme filters, group select/clear actions and a selection/dependency count. Choosing a family selects its supported specimens by default; users may exclude individual states/sizes/themes/variants. Visible filters only change display; Select/Clear visible explicitly changes selection. Keep selected and excluded cases recognizable.

Every specimen has a stable source-mapped ID; captions/controls stay outside the component DOM. Materialize transient states with source-backed stable preview mechanisms and compare with real interactions. Wait for fonts/assets, provide inverse/background contexts and avoid virtualization hiding required selected specimens. Large family grids may be explicit batches whose union is verified.

The Export / Apply Selection action creates `selection-manifest.json` containing exact selected rows, source snapshot, dependency closure and approval of the selected content. Show source-supported effective defaults and any differences from source defaults for partial sets. Export is a browser download/copy/custom event; immediate local file/API delivery requires an explicitly implemented bridge. Do not claim the browser can call MCP or write an arbitrary filesystem path by itself.

## Validate and hand off

Before export, render/verify every selected family and confirm selected specimen IDs, tuples/themes and dependency closure against the independent matrix. Record actual fonts/assets/states and short/long-label, optional-icon and narrow/wide behavior. Distinguish complete-family selection from a deliberate partial selection; full source coverage remains available for audit, but only approved rows are build scope.

Persist source catalog, full expected matrices, plans, preview adapter/start command, batch URLs, verification and selection under `.scratch/component-sheet-html/`. Pin selection to the reviewed source snapshot; source drift invalidates approval and requires refreshed preview/selection.

Return preview path/URL/start command and exported manifest location with selected/unselected counts and unresolved gaps. Opening the catalog alone is not verification of unopened families. Return to the caller; `code-to-canvas` can consume the handoff when the user requests script generation. HTML export approves content selection, not external execution by itself.
