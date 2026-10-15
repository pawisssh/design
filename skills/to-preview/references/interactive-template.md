# Interactive template integration

Copy `component-sheet-template.html` with `selection-model.js` into the generated preview. Integrate its markup/styles/script into an existing framework route when imports/providers require that runtime. The template is a selection shell, not a fabricated component library.

Call `ComponentSheet.configure({catalog, renderSpecimen})` from the source-backed adapter. `catalog` follows the shared contract. `renderSpecimen(family, specimen, host)` must mount the real selected code export/state/theme into `host`, returning a Promise when necessary. Apply theme-specific specimen backgrounds and the original source font/provider contexts, including inherited font values on the specimen host when the component relies on app-level styles. Keep shell CSS scoped to its tagged controls. Controls/captions stay outside the actual component DOM.

Use framework lifecycle cleanup when re-mounting specimens; for React keep root handles in the adapter and unmount a previous family before replacing its host. Wait for framework commit/effects before resolving the renderer Promise. Template checks nonempty DOM plus font/image readiness, not fidelity; AI/browser review must still verify source states, typography and geometry.

Catalog source specimen rows are never generated from selected nodes. Selecting a family selects all its specimen rows; user edits can reduce them. Filters change visibility only; Select visible / Clear visible change checkboxes explicitly. Export ensures every selected family has rendered before producing the manifest. A selected source default is retained; when excluded, the first selected source-ordered tuple becomes the effective default and is shown in the summary/manifest.

Dependencies are stable IDs in a catalog registry. Transitive closure is ordered dependency-first and rejects missing references or cycles. Include per-family essentials and per-specimen state/asset requirements, not every possible icon or unrelated family. Record helper data/spec references in registry entries so the native builder has actual source evidence.

Export / Apply Selection downloads `selection-manifest.json` and dispatches `window` event `component-sheet:selection` with the manifest in `event.detail`. `ComponentSheet.getSelection()` provides the same data to an explicitly implemented local bridge. Downloads alone do not write an arbitrary project path or notify AI; locate the downloaded file or implement a project-local save endpoint with the task's scope. A backend/native plugin bridge is required for direct MCP execution from the preview.

The manifest approves selected content and has `executionAuthorized: false`; it does not override an explicit user request/authorization to execute elsewhere in the conversation. Default downstream scope is generating scripts; actual execution remains a separately requested action.
