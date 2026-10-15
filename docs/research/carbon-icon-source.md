# Where do icon components come from in a Design Library?

Research for [pawisssh/design#13](https://github.com/pawisssh/design/issues/13). Map: [#1](https://github.com/pawisssh/design/issues/1). Vocabulary follows `GLOSSARY.md` (Design Library, Component Family, Component Set, Contract, Sub-component).

Researched 2026-10-16. Carbon is pinned to monorepo tag `v11.118.0` (commit `3169e192`), which ships `@carbon/react` 1.118.0, `@carbon/icons` 11.90.0 and `@carbon/icons-react` 11.90.0. 11.90.0 is also the current npm release.

Evidence comes from three places:

- **Sources:** primary sources, cited inline.
- **Read-only scripts:** run with `use_figma` against the Carbon v11 Community kit (`S7xhIXAhdx0f0DBFMGobQs`).
- **Probes:** three `use_figma` probes on the scratch draft (`Alpt8YsrzDVu6DnwsrF26h`). Each probe built on a temporary page and then deleted it.

Short prefixes:

- `GH` = `https://github.com/carbon-design-system/carbon/blob/v11.118.0/`
- `NPM_ICONS` = `@carbon/icons@11.90.0` tarball
- `NPM_IR` = `@carbon/icons-react@11.90.0` tarball
- `FIG` = `https://developers.figma.com/docs/plugins/api/`

## Answer

1. **Source.** The builder creates icon atoms from **`@carbon/icons@11.90.0` SVGs**. For each icon it uses `svg/16/<name>.svg` when that file exists, and `svg/32/<name>.svg` otherwise. This is the asset `@carbon/react` Button actually renders.
   - The builder does not use the Carbon Community kit's icon library.
   - It does not use a hand-maintained page.
   - It builds only the icons the Contract names (default icon plus preferred icons), not all 2775.

2. **Structure.** Each icon is **one component with no Size variant**. The structure rules:

   | Part | Rule |
   | --- | --- |
   | Component | 16×16, no fill. |
   | Child | Exactly one flattened `VECTOR` named `Vector`, with constraints `SCALE`/`SCALE`. |
   | Name | The Carbon icon name in kit style: `Add`, `Arrow--right`. |
   | Prefix | No `_` prefix. Icons are public atoms, not Sub-components. |

   Button places the icon in its per-size `Icon` auto-layout wrapper:
   - The wrapper is 16 for the normal sizes and 20 for `lg-expressive`.
   - The instance sits inside it with `layoutSizingHorizontal`/`Vertical = 'FILL'`.
   - `Swap icon` (INSTANCE_SWAP) then works at both sizes, and token-bound fills survive a swap. Both were verified.

3. **Location.** For the pilot, icons go **in the same Design Library file**, on their own `Icons` page, built in the atoms step before items, bases and sets. They do not go in a separate linked library:
   - The Plugin API cannot publish a library.
   - A linked library would therefore force a manual publish between the icons step and the Button step. That breaks the batch flow and the builder's "stop if a dependency is missing" check.
   - Splitting icons into a shared library is later work (fog), not part of this answer.

## Findings

### 1. `@carbon/icons`: what exists and what React renders

**Package and naming**

- **License.** `@carbon/icons` and `@carbon/icons-react` are both Apache-2.0, so importing the SVGs is allowed (keep attribution if redistributed). — `packages/icons/package.json` at the tag; `LICENSE` in NPM_ICONS.
- **Package layout.** The npm package ships optimized single-path SVGs in `svg/{16,20,24,32}/`, plus a `metadata.json` covering 2775 icons. Each icon entry has `name`, `sizes`, `assets[]` and `output[]` (`moduleName`, `descriptor`). — NPM_ICONS.
- **Naming.** `arrow--right` (file) → `ArrowRight` (React component, `@carbon/icons-react/es/ArrowRight.js`). `add` → `Add`. — NPM_ICONS `metadata.json`, NPM_IR.

**Available sizes**

- **Most icons have only a 32 source.**
  - 2691 of 2775 icons are `sizes: [32]` only. Only 68 have a 16 source, and 9 have a 20 source. — `packages/icons/icons.yml`, NPM_ICONS `metadata.json`.
  - `add` exists only as `svg/32/add.svg`, with viewBox `0 0 32 32` and path `M17 15 17 8 15 8 15 15 8 15 8 17 15 17 15 24 17 24 17 17 24 17 24 15z`.
  - `arrow--right` has hand-tuned 16, 20, 24 and 32 sources. The 16 version has a 1px stroke and the 20 version a 1.4px stroke, so the smaller sizes are redrawn, not the 32 scaled down. — `GH packages/icons/src/svg/{16,20,32}/arrow--right.svg`.
- **For 32-only icons, the "16" module is the 32 artwork with `width/height = 16`.** — NPM_ICONS `es/add/16.js` (`viewBox: "0 0 32 32", width: 16`).

**What Button renders**

- **Button never passes a size, so it always renders the 16 module.**
  - `ButtonBase.tsx` renders `<ButtonImageElement aria-label=… className={`${prefix}--btn__icon`} aria-hidden="true" />` with no `size` prop. — `GH packages/react/src/components/Button/ButtonBase.tsx#L66-L72`.
  - The icon-only path in `Button.tsx` does the same. — `GH …/Button.tsx#L180`.
  - icons-react components default to `size = 16`. — NPM_IR `es/ArrowRight.js`.
- **CSS sizes the icon box.**
  - `.cds--btn__icon` is 16×16. — `GH packages/styles/scss/components/button/_mixins.scss#L93-L97`.
  - `.cds--btn--expressive .cds--btn__icon` is 20×20. — `GH …/button/_button.scss#L448-L451`.
  - `isExpressive` adds the `cds--btn--expressive` class. — `GH ButtonBase.tsx#L55`.
- **Consequence.** In code, an Expressive button shows the **16 asset (or the 32 artwork) stretched to 20**, never the hand-tuned 20 glyph. One scalable icon component per icon, filling a 16 or 20 wrapper, therefore matches code exactly. A Size variant per icon would not match code.

**Carbon guidance**

- "Use a 16px icon within buttons; use a 20px icon within the large expressive buttons." — [carbondesignsystem.com/components/button/usage](https://carbondesignsystem.com/components/button/usage/) (`carbon-website` `src/pages/components/button/usage.mdx` L1190).
- The structure table lists "Icon | 16 x 16" and "Icon: expressive | 20 x 20". — [button/style](https://carbondesignsystem.com/components/button/style/) (`style.mdx` L456–466).

### 2. The Carbon Community kit icons, read via `use_figma`

| What | Observed |
| --- | --- |
| Button `Swap icon` | `INSTANCE_SWAP`, default = `Add` (`41080:384381`), `preferredValues: []` |
| `Add` main component | **remote** (linked library), standalone `COMPONENT` (not in a set), 16×16, one `Vector` child at (4,4,8,8) with constraints `SCALE`/`SCALE` |
| Large variant | `Icon` wrapper 16×16; instance 16×16, sizing `FIXED` |
| Expressive variant | `Icon` wrapper 20×20; **same 16×16 `Add` component**, instance resized to 20×20 → vector becomes (5,5,10,10), `scaleFactor` 1 |
| Other icons used in the kit | All remote, standalone, 16×16: `Close`, `Chevron--down`, `Chevron--up`, `Checkmark`, `Checkbox--checked--filled`, `Search`, `Caret--right`, `Warning--filled` (used at 20) |
| Kit pages | No icon page; icons come only from a linked library |

What the kit shows:

- **Naming and structure.** The kit's own convention matches the recommendation. Icons are named after the Carbon name with a capital first letter and `--` kept. There is one component per icon with no size variant, and Expressive scales the same component to 20.
- **Library identity.** `search_design_system` finds a community library "IBM® UI Icon Library (Community)" with an `Add` component of the same shape (16×16, one SCALE `Vector`). Its key is `d0e41c3a…`, which is **not** the key the kit uses (`2789a71e…`). The kit's icon library is therefore an unnamed or older publish that we cannot pin or control. This is another reason not to depend on it.
- **Wrapper sizing.** The kit sizes the instance `FIXED` per variant. Per #6 we size by wrapper plus `FILL` instead.
- **The SVG build reproduces the kit exactly.** Our `Add` built from `svg/32/add.svg` gives a vector at exactly (4,4,8,8), identical to the kit's `Add`.

The owner's organization icon library "(v3) Foundations / Icons" works differently, so it is not a template for this pipeline:

- Its icons are Font Awesome **TEXT glyphs** in component sets with `Style` × `Size` variants (10 sizes) and varying widths.
- They are not vectors, so they cannot FILL a wrapper.

### 3. Figma Plugin API: building scalable icon atoms

**Documented API facts**

- **SVG import.** `figma.createNodeFromSvg(svg): FrameNode` is "equivalent to the SVG import feature in the editor". — [FIG figma](https://developers.figma.com/docs/plugins/api/figma/).
- **Making a component.** `figma.createComponentFromNode(node)` keeps the node's children. It throws if the node is inside a component or instance. — [FIG createComponentFromNode](https://developers.figma.com/docs/plugins/api/properties/figma-createcomponentfromnode/).
- **Resizing with constraints.** `resize()` applies the children's constraints. `resizeWithoutConstraints()` never resizes children. `rescale()` is the Scale tool and changes `scaleFactor`, so avoid it. — [resize](https://developers.figma.com/docs/plugins/api/properties/nodes-resize/), [resizeWithoutConstraints](https://developers.figma.com/docs/plugins/api/properties/nodes-resizewithoutconstraints/), [rescale](https://developers.figma.com/docs/plugins/api/properties/nodes-rescale/), [scaleFactor](https://developers.figma.com/docs/plugins/api/properties/InstanceNode-scalefactor/).
- **FILL sizing.** `layoutSizingHorizontal/Vertical = 'FILL'` is valid only on children of an auto-layout frame, and throws otherwise. — [layoutSizingHorizontal](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/).
- **INSTANCE_SWAP default.** The default value is a component **node id**. `preferredValues` take component **keys** (`{type:'COMPONENT'|'COMPONENT_SET', key}`). — [working with component properties](https://developers.figma.com/docs/plugins/working-with-component-properties/), [InstanceSwapPreferredValue](https://developers.figma.com/docs/plugins/api/InstanceSwapPreferredValue/).
- **Importing by key.** `importComponentByKeyAsync` "is rejected if there is no published component with that key". — [FIG figma](https://developers.figma.com/docs/plugins/api/figma/).
- **No publish call.** The only library-related member on `figma` is `teamLibrary`, which only reads available libraries. Checked with `Object.keys(figma)` in a `use_figma` probe.
- **`use_figma` limits.** The docs only say it "can't add new" images (raster). They are silent on `createNodeFromSvg`, which is why it was probed below. — [MCP tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/).

**Probes on the scratch draft** (built on a temporary page each time, then deleted)

| Probe | Result |
| --- | --- |
| `createNodeFromSvg` inside `use_figma` | **Works.** Returns a `FRAME` with one fill and one `VECTOR` child already set to `SCALE`/`SCALE`. 32 SVG → 32×32 frame. |
| `createComponentFromNode` → `resize(16,16)` | `Add` → vector (4,4,8,8), same as the kit. `Arrow--right` (16 SVG) → vector (1,3,14,10). |
| Multi-shape SVG (rect + circle) → `figma.flatten` | One `VECTOR`, renamed `Vector`, constraints `SCALE`/`SCALE`. |
| Host component, `Icon` auto-layout wrapper 16 or 20, instance `FILL`×`FILL`, `Swap icon` INSTANCE_SWAP wired with `componentPropertyReferences.mainComponent` | Before the swap: 16 → `Add` 16×16; 20 → 20×20 (vector 10×10). After `setProperties` to `Arrow--right`: **size held** (16 → 16×16; 20 → 20×20, vector 17.5×12.5), `scaleFactor` 1. |
| Fill override on the nested `Vector` (raw RGB) then swap | Override **kept** after the swap, because both icons have one layer named `Vector`. |
| Fill on the nested `Vector` **bound to a variable** (`button/danger/active/bg`) then swap | Binding **kept** (`boundVariables.color` = same variable id). |
| `preferredValues` with keys of **local, unpublished** components | Accepted and stored. Preferred icons work at build time; no publish needed. |

## Builder recipe for icon atoms

Steps 1–3 run in the atoms step, before items, bases and Component Sets:

1. **Collect the icons.** From the Contract, take the set of icon names: each family's default icon plus its preferred icons.
2. **Choose each file.** Read `svg/16/<name>.svg` if it exists in `@carbon/icons@11.90.0`, else `svg/32/<name>.svg`.
3. **Create each component.**
   1. Call `createNodeFromSvg`.
   2. Call `createComponentFromNode`.
   3. Name the component in kit style (first letter capitalized, `--` kept: `Arrow--right`).
   4. Set `fills = []`.
   5. Flatten all children into one `VECTOR` named `Vector` with `SCALE`/`SCALE` constraints.
   6. Call `resize(16,16)`.
   7. Place it on the `Icons` page.
   8. Record the node id and key in the ledger. The ledger keeps the build idempotent.

The Component Set step then wires each family to its icons:

4. **Place the icon.** Each family's `Icon` wrapper is auto layout at a fixed per-size size (16, or 20 for `lg-expressive`). It holds an instance of the default icon set to `FILL`×`FILL`, with its `Vector` fill bound to the kind's icon token.
5. **Add the swap property.** Call `addComponentProperty('Swap icon', 'INSTANCE_SWAP', <default node id>, {preferredValues: [<keys>]})`, then set `componentPropertyReferences = {mainComponent: id}`. Add a BOOLEAN for visibility, per #6.

**Single-layer rule.** Every icon must be exactly one layer named `Vector`. Swapping keeps overrides (including bound fills) only by matching layer names, so a second layer or a different name would drop the color on swap.

## Open items / fog

- **Contract (#7).** The Contract must declare each family's icon list: the default icon, the preferred icons, and the icon fill token per kind/state.
- **Shared icon library.** Moving icons into a separate shared or linked icon library later, once more than one Design Library needs them, means a manual publish step and a key remap.
- **Code Connect.** Mapping icons to `@carbon/icons-react` components (`Arrow--right` → `ArrowRight`) is not yet specified.
- **Hand-tuned 20 glyphs.** If a family ever passes `size={20}` in code, the hand-tuned 20 glyph would differ from a scaled 16. No family does this today. Button never passes a size.
