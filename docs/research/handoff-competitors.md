# How do Supernova, UXPin Merge and Builder.io map designs to code components?

Research for [#57](https://github.com/pawisssh/design/issues/57) (map [#52](https://github.com/pawisssh/design/issues/52)). Sources checked on 2026-10-16. Only public docs, open-source repos and published SDK type definitions were used. No closed product was installed, run or decompiled.

Every claim is tagged with its source tier:

- **[docs]**: vendor documentation.
- **[src]**: open source at a pinned commit or version.
- **[blog]**: vendor blog.

Where the sources say nothing, this note says **not documented**. Inference is labelled as inference.

## Short answer

None of the three keeps anything like a Contract (one library-neutral record per Component Family, holding axes, values and code). Each one stores the code side in a different place:

| | Identifies a code component by | Records props / variants as | Unmatched elements | Handoff output |
|---|---|---|---|---|
| **UXPin Merge** | File path in `uxpin.config.js` categories; the default export is the component | Props parsed from PropTypes, Flow or TS into a typed property list; JSX presets with `uxpId` | Designers place native UXPin elements beside Merge components; Get Code gives CSS and specs for those | Get Code mode: JSX/React plus dependencies, StackBlitz (Full Code Export is Beta, open-source libraries only) |
| **Builder.io** | Figma `componentKey` (or `url`) in a `.mapper` file (deprecated), now AI "component indexing" of the repo | A `mapper(figma)` function that turns Figma properties into JSX props; indexing writes MDX docs per component group | Not documented; the default generated code "doesn't depend on specific libraries" (inference: plain generated markup) | Generated framework code; mapped imports "reproduced verbatim" |
| **Supernova** | Two separate worlds. (a) Figma design components, plus doc "Component" records linked by hand to a Figma component. (b) A code scan of npm packages (`CodeComponent`: package, file path, props) | Figma side: Boolean / InstanceSwap / Text / Variant definitions and variant value maps. Code side: prop `name / type / isRequired`, plus usage counts per prop value | Not documented. AI prototypes are generated inside a container that installs the real packages | Prototype code and Markdown docs, pulled by coding agents through MCP. The classic exporters emit tokens, styles and assets only, never component mappings |

## UXPin Merge

### How a code component is identified

- `uxpin.config.js` sits at the repo root. Its `components.categories[].include` lists the component file paths and accepts globs. A `wrapper` file wraps every component, for example with a theme provider [docs: [Config File](https://uxpin.com/docs/merge/config-file)].
- Requirements: "One component per directory", "the filename defines the component name", and each file must "contain export default providing the component" [docs: [Integrating your own components](https://www.uxpin.com/docs/merge/integrating-your-own-components/)].
- With wrapped integration, the exported name must match the original component's name, because "this name shows up in the UXPin Editor and the UXPin spec mode" [docs: same page].
- In the CLI source, each component carries `info.implementation.{path, lang, framework}` and an optional `namespace.importSlug` [src: [`ComponentInfo.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/discovery/component/ComponentInfo.ts), [`ComponentDefinition.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/serialization/component/ComponentDefinition.ts)].
- The whole library snapshot is pinned to version control. `DesignSystemSnapshot.vcs` carries `branchName`, `commitHash` and the paths of moved components [src: [`DesignSystemSnapshot.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/serialization/DesignSystemSnapshot.ts)].

### How props and variants are recorded

- The CLI reads JavaScript with PropTypes, Flow or TypeScript [docs: Integrating your own components]. Props are "serialized with their names from the code", and each type gets a default control: oneOf → select, bool → switcher, func → interactions, and so on [docs: [Configuring the Properties Panel](https://uxpin.com/docs/merge/configuring-the-properties-panel)].
- Each serialized property holds `name`, `type`, `isRequired`, `defaultValue` and `description`. Types include `enum`, `union`, `shape`, `literal`, and **`unsupported: { raw }`** for anything the parser cannot type [src: [`ComponentPropertyDefinition.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/serialization/component/implementation/ComponentPropertyDefinition.ts), [`createUnsupportedTypeDefinition.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/serialization/component/implementation/createUnsupportedTypeDefinition.ts)].
- JSDoc tags change only the editor presentation, never the code name:
  - `@uxpinignoreprop`, `@uxpinpropname`, `@uxpindescription` and `@uxpincontroltype` are documented [docs: Configuring the Properties Panel].
  - `@uxpinbind`, `@uxpindynamicoptions`, `@uxpincomponent`, `@uxpinnamespace`, `@uxpinwrappers`, `@uxpindocurl` and `@uxpinuseportal` appear in the source but **not in the public docs** [src: `ComponentPropertyDefinition.ts`, [`CommentTags.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/serialization/component/CommentTags.ts)].
- There is no separate "variant" concept. A variant is just a combination of prop values.
- Starting compositions are **JSX presets** in `presets/0-default.jsx`. Every element needs a unique `uxpId`, chosen by role, so that Merge can "automatically update all designs" when a component is replaced [docs: [Authoring and Managing JSX Presets](https://www.uxpin.com/docs/merge/authoring-and-managing-jsx-presets/)]. The serialized form is `{ name, rootId, elements: { [id]: { name, props } } }` [src: [`ComponentPreset.ts`](https://github.com/UXPin/uxpin-merge-tools/blob/77319b4d47728612ba107166af9649a760d0fda0/packages/uxpin-merge-cli/src/steps/serialization/component/presets/ComponentPreset.ts)].

### Elements that match no component

- In UXPin the design *is* made of code components, so there is nothing to match after the fact. Merge components can be edited "only as much as the code allows". Native elements keep ordinary controls for colour, text, border and shadow [docs: [Using React.js components](https://uxpin.com/docs/merge/using-react.js-components)].
- Get Code mode gives native elements size, colour, typography, spacing and copyable CSS [docs: [Get Code Mode](https://uxpin.com/docs/sharing/spec-mode)].
- With `useUXPinProps: true`, any Merge component also gains Custom Styles and Custom Props on its root element. This is an escape hatch for values the props don't cover [docs: Using React.js components].
- UXPin's AI-assisted integration skips components it cannot integrate correctly and reports them with reasons. It "does not invent component properties or values that do not exist in your design system" [docs: [AI-Assisted Merge Integration](https://www.uxpin.com/docs/merge/ai-assisted-merge-integration/)].

### Handoff output

- Get Code mode provides "React code with dependencies, functions, JSX, and component descriptions", downloadable or openable in StackBlitz. "Full Code Export is currently in Beta" and limited to open-source libraries such as MUI, Ant Design and Bootstrap [docs: Get Code Mode].
- The Properties Panel has a JSX view that shows the full JSX of the selected component [docs: Using React.js components].

## Builder.io (and Mitosis)

### How a code component is identified

**Legacy `.mapper` files** are marked **Deprecated** in the docs:

- A mapping is a `figmaMapping({ componentKey, mapper(figma) { return <Button .../> } })` call in a `*.mapper.{tsx,jsx,ts,js,mjs}` file inside the codebase [docs: [Map components](https://www.builder.io/c/docs/figma-to-code-map-components), [Mapping functions](https://www.builder.io/c/docs/mapping-functions)].
- Publishing validates each file:
  - TypeScript syntax.
  - The `figmaMapping()` call structure.
  - That a "`componentKey` or `url`" is present.
  - That no two mappings point at the same Figma component.

  Publishing then uploads the mappings to the Builder space [docs: [Map components in depth](https://www.builder.io/c/docs/map-components-in-depth)].
- Mapping requires a Precise Mode export from the Figma plugin, and Precise Mode needs Auto Layout throughout the design [docs: Map components; [Figma plugin modes](https://www.builder.io/c/docs/figma-plugin-modes)].

**Component indexing** is the current approach:

- `npx "@builder.io/dev-tools@latest" index-repo`, Enterprise only. Builder says it "automatically discover[s], analyze[s], and map[s] design system components, icons, and tokens" [docs: [Component indexing](https://www.builder.io/c/docs/component-indexing)].
- Components are grouped by "architectural interdependency, not thematic similarity", so Button, IconButton and ToggleButton stay separate [docs: same page].
- Automated discovery "typically achieves 70% mapping accuracy" [docs: same page].
- How a Figma node is matched to an indexed component is **not documented**.
- Mapping and indexing cannot run together. Migrating means **deleting every `.mapper` file** and republishing with none [docs: [Migration guide](https://www.builder.io/c/docs/component-mapping-migration-guide)].

### How props and variants are recorded

- In a mapper, the `figma` argument exposes the Figma component properties by name. Variant values are converted by hand, for example `variant={figma.Variant?.toLowerCase() ?? "default"}`.
- Helpers include:
  - `$children`, which accepts an `exclude` option.
  - `$textContent`.
  - `$findOneByName('Label')`.
- Function props such as `onClick` are left out [docs: Mapping functions].
- So the variant-to-prop translation is imperative code per component, not data.
- Indexing writes "individual MDX files for component groups" and uploads component information to Builder's servers. The format of the prop and variant records is **not documented** [docs: Component indexing].

### Elements that match no component

- **Not documented** directly. The closest statements:
  - Builder by default "generates code from your Figma design that doesn't depend on specific libraries or component methods" [docs: Map components].
  - A generic mapper's non-matching nodes "keep the default rendering behavior" [docs: Mapping functions].
- Inference: unmatched layers become plain generated markup and styles, with no flag that they were unmatched.

### Handoff output

- Generated code in the chosen framework, from the Visual Editor or the CLI. It uses "your mapped components within its results" [docs: Map components].
- Import paths in mappers are "reproduced verbatim during code generation". Builder therefore tells users to use published package names or path aliases, never relative paths [docs: Map components; Map components in depth].

### Mitosis

- Mitosis is **not a mapper**. It parses a static subset of JSX into "a simple JSON structure", and per-framework serializers walk that JSON to emit React, Vue, Angular and others [docs: [Mitosis overview](https://mitosis.builder.io/docs/overview/)].
- Its Figma integration only generates new code through Fusion, which Mitosis then adapts to each framework [docs: [Mitosis Figma](https://mitosis.builder.io/docs/figma/); src: [BuilderIO/mitosis README](https://github.com/BuilderIO/mitosis)].
- Its relevance here is the architecture: one framework-neutral intermediate, with many layout-only outputs.

## Supernova

### How a code component is identified

**Classic design-system data (Figma side):**

- `DesignComponent` has `componentPropertyDefinitions` of type Boolean, InstanceSwap, Text or Variant, plus `children: DesignComponentVariant[]`. Each variant carries `variantPropertyValues: Record<string,string>` [src: [`@supernovaio/sdk-exporters@2.5.1`](https://unpkg.com/@supernovaio/sdk-exporters@2.5.1/build/types/model/components/) `SDKDesignComponent*.d.ts`, MIT].
- Documentation `Component` records are created by hand in the Components tab and linked to "their Figma counterparts" through a "Figma component" column [blog: [How to document your components](https://www.supernova.io/blog/how-to-document-your-design-system-components-in-supernova), 2023-10-17].
- In the 2.5.1 types, this link is a custom property whose `linkElementType` is `FigmaComponent` or `DocumentationPage`. **No field on `Component` or `DesignComponent` in sdk-exporters 2.5.1 references a `CodeComponent`** [src: `SDKElementProperty.d.ts`, `SDKComponent.d.ts`].

**Code side (newer):**

- `supernova code analyze --package <name>` reads TypeScript definitions, JSDoc, Markdown docs, Storybook stories and "real usage/adoption signals in consumer code". Snapshots are written to `<package>/.supernova/snapshots/<id>/` and uploaded [docs: [Code analyze](https://developers.supernova.io/latest/supernova-cli/cli-commands/code-analyze-CxYs5WCk)].
- The result in the SDK:
  - `CodeComponent { name, packageName, repositoryName, filePath, description, props[], storybookFiles[], docFiles[] }`.
  - AI-generated `CodeComponentMarkdown` per `{ packageName, componentName }`.
  - `CodeComponentUsage` with per-prop `values: Record<string, number>` usage counts.

  [src: sdk-exporters 2.5.1 `model/code-components/*.d.ts`, `core/areas/SDKAreaCodeComponents.d.ts`]

### How props and variants are recorded

- Code props are only `name`, `type` (a string) and `isRequired` [src: `SDKCodeComponentPropertyDefinition.d.ts`].
- There is no variant concept on the code side. Usage statistics show which prop values are actually used [src: `SDKCodeComponentPropUsage.d.ts`].

### Elements that match no component

- **Not documented.**
- Supernova's AI prototyping (Supernova Create) generates code inside a "code container": a Vite/React template where you install your packages and add `supernova/components.md`, `icons.md` and `usage.md` as agent rules, plus Storybook stories as examples [src: [component-container-template @ 8ac6633](https://github.com/Supernova-Studio/component-container-template/tree/8ac66336208ff263c8315845bc689efeb4ab0d60)].
- Without the scan-generated `usage.md`, the docs warn this "produces low-quality prototypes" [docs: [Guided container setup](https://developers.supernova.io/latest/supernova-create/set-up-code-libraries/guided-container-setup-Kh7LnoyQ)].
- A required Vite plugin, `@supernovaio/prototyping-tooling`, injects "metadata into JSX elements" for element selection and annotation [src: container README]. This is how a prototype element stays traceable. Its metadata format is not documented.

### Handoff output

- The "MCP export" streams the prototype's latest iteration, with the "full file content" of each artifact, and project documents "in Markdown format" to Cursor or Claude Code [docs: [MCP export](https://developers.supernova.io/latest/supernova-create/delivery-and-handoff/mcp-export-k6KBlGRX)].
- **None of Supernova's open-source exporters maps components.** The [exporters monorepo](https://github.com/Supernova-Studio/exporters) contains css, css-in-js, tailwind-4, style-dictionary, jetpack-compose, svg-to-react, skills, and Claude Code / Codex / Cursor plugins. The standalone [exporter-react](https://github.com/Supernova-Studio/exporter-react) emits only colours, text styles, gradients, shadows, borders and radii [src].
- The Claude Code plugin exporter deliberately leaves design-system data out of the artifact: "That data stays live in Supernova and is retrieved through the context-scoped MCP server" [src: [claude-code-plugin README](https://github.com/Supernova-Studio/exporters/tree/main/exporters/claude-code-plugin)].

## Ideas for To-handoff

### Borrow

1. **Pin the Code Library version in the intermediate JSON.** UXPin pins every snapshot to `vcs.branchName` and `vcs.commitHash` (`DesignSystemSnapshot.ts`). To-handoff should record the Code Library package and version, and the Contract revision, it resolved against.
2. **Imports come only from the Contract's `code`, never from the prototype.** Builder copies mapper import paths "verbatim" and has to warn against relative paths. To-handoff should take package and import from the Contract's `code`, and treat the prototype's import lines as evidence only.
3. **Figma input: match by component key, and reject duplicates.** Builder's publish step validates `componentKey`/`url` and rejects two mappings for one Figma component. This confirms #53's "component key first" ordering for the Figma input.
4. **Keep values that fit no Property Axis as raw and flagged, never dropped.** UXPin's parser keeps `unsupported: { raw }`, and `useUXPinProps` gives an explicit Custom Styles escape hatch. In the intermediate JSON, an element that maps to a Contract but carries an off-axis value should keep the raw value with a flag.
5. **Report what didn't match, with reasons, and never invent props.** UXPin's AI integration skips and reports components with reasons, and "does not invent component properties". To-handoff's unmatched list *is* its Component Proposals. Each needs a reason, such as "no Component Family", "family exists but this value is off-axis", or "layout only".
6. **Give stable, role-named IDs to elements in the intermediate JSON.** UXPin presets require a unique, role-based `uxpId` so designs survive component replacement. Role IDs let the HTML, Obsidian and Figma outputs refer to the same element, and let a later re-run diff cleanly.
7. **Later: use real prop-value usage to propose default tuples.** Supernova's `CodeComponentUsage.props[].values` counts how often each value is used. A future Generic Adapter could weight its suggestions by this. This is not a tracer-bullet item.

### Avoid

1. **Mappings that live outside the Contract.** Builder's `.mapper` files sat beside the code as imperative per-component functions. Migrating to indexing means deleting them all. ADR 0001 already keeps the Contract as the one code-anchored record, so To-handoff should never write its own mapping files.
2. **Silent auto-mapping.** Builder's indexing "typically achieves 70% mapping accuracy", and unmatched nodes are not documented as flagged. To-handoff should show how each element was matched (key, name or by-value) and its confidence, so the owner can spot wrong matches.
3. **A handoff that only works while connected.** Supernova keeps design-system data live behind MCP and leaves it out of the artifact. That suits agents, but a developer handoff must be self-contained: the HTML and intermediate JSON carry the resolved Contract data. A link back is fine as an extra.
4. **Collapsing variants into ad-hoc prop code.** Builder's `figma.Variant?.toLowerCase()` and Supernova's `type: string` props both lose the explicit value-to-code table. Our Contracts already hold `code` per variant value, so To-handoff should cite the exact tuple, not re-derive props.
