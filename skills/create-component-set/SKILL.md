---
name: create-component-set
description: Create editable Figma component sets from local Coinbase CDS .txt specifications using Figma MCP. Use for one component family, a selected batch, or the complete documented web component library.
---

# Create Component Set

Turn Coinbase CDS specifications into reusable Figma components, component sets, and the foundations they require. Perform creation through Figma MCP and validate both structure and appearance.

## Inputs and scope

Use the Figma file URL supplied by the user or established in the current conversation. If no target is available, ask for it while inspecting the local specifications. Create a new Figma file only when the user requests one.

Default local sources:

- Component specifications: `/Users/kane/Projects/_archive/mino/node_modules/@coinbase/cds-mcp-server/mcp-docs/web/components/`
- Implementation, themes, and assets: `/Users/kane/Projects/_archive/mino/node_modules/@coinbase/`

Allow the user to override either source location. If a source is missing, locate the installed CDS package or ask for its location; retain the requested scope.

Honor an explicitly selected component or batch. When invoked to create the complete library without a selection, inventory every web component `.txt` file. Discover the current count rather than assuming a fixed total. Use Coinbase's default theme with light and dark modes unless the user specifies another theme.

Record the package versions and source paths as a local snapshot. Treat the source directories as read-only inputs.

## Discover and resolve the specification

1. Load `figma-generate-library` for component construction and `figma-use` before its MCP calls when these skills are available. Follow the connected tools' documented capabilities. For authorized new-file creation, also load `figma-create-new-file` when available.
2. Inspect the target file's components, variables, styles, and organization. When using library discovery, call `get_libraries` before `search_design_system`. Reuse compatible existing assets.
3. Read each in-scope specification and its referenced dependencies. Classify entries as visual components, composition/layout primitives, or code-only utilities/providers. Provider documentation can inform foundations; each entry must still receive an explicit outcome in the manifest.
4. Derive anatomy, documented variants, sizes, states, defaults, and composition from the `.txt` specifications. Inspect installed `cds-web` and `cds-common` source, styles, and `defaultTheme` for exact visual values. Use installed Coinbase icons and illustrations where required.
5. Resolve conflicting documentation and implementation using the recorded snapshot and available rendered examples. Record the chosen evidence. If exact visual values remain unavailable, mark the affected work as blocked and continue independent components. An approximation must be labeled and explicitly requested.

Discovery is complete when the manifest accounts for the requested inventory, dependencies, reuse decisions, source evidence, and unresolved gaps.

## Foundations

Create missing foundations before their dependent components. Reuse compatible variables and shared text/effect styles. Bind colors, spacing, radii, and other supported visual properties to source-derived variables.

Use semantic aliases, appropriate variable scopes, source-derived code syntax, and light/dark color modes. Confirm that any reused foundation matches the selected theme and recorded source version.

## Component construction

Build in dependency order. For a complete library, begin with Button, TextInput, and Checkbox where available to validate the construction pattern, then continue through the inventory. For a selected batch, use its simplest representative family first.

- Create native, editable Figma components and component sets with meaningful layer names.
- Represent documented visual differences with variants, retaining documented defaults and meaningful combinations.
- Use text properties for labels, boolean properties for optional content, and instance-swap properties for icons or interchangeable nested components.
- Model layout behavior through Auto Layout, resizing, constraints, and nested instances. Represent composition primitives through reusable structures or documented examples as appropriate.
- Avoid blindly expanding all code props into a Cartesian variant matrix. Use properties and nested components to keep the public component API usable while preserving required state coverage.
- Add concise usage guidance and source references to component or component-set descriptions.
- Arrange review frames with instances showing relevant variants, sizes, states, and both color modes. Keep main components separate from review instances.

Validate the representative family before building dependent families. Continue through routine construction decisions without an approval checkpoint.

## Execution and recovery

Keep Figma mutations sequential. Check the manifest and existing assets before creation so resumed work updates or reuses the same objects.

Persist progress under the working project's `.scratch/create-component-set/` directory. Record the target file, source paths and versions, per-spec outcomes, returned node IDs, dependency mappings, completed validations, and unresolved gaps. Re-read this manifest after interruption or context compaction; confirm recorded nodes still exist before resuming.

Before retrying an uncertain mutation, inspect the canvas to determine what succeeded. Restrict cleanup to exact IDs recorded for this run and preserve unrelated user-owned assets. Build the library locally in the target file; publishing requires a user request.

## Validation and completion

For each completed family, verify variant coverage, default values, exposed properties, variable bindings, text/effect styles, nested instances, and resizing behavior. Visually inspect the review instances against source or rendered references. Repair clipping, missing assets, incorrect typography, spacing, and state mismatches; recheck the affected output.

Every discovered in-scope spec must have one outcome:

- **Built:** validated editable component or component set, with its node IDs.
- **Represented:** mapped to an existing component, reusable composition, or foundation, with the mapping recorded.
- **Code-only:** evidence that no standalone visual asset is appropriate.
- **Blocked:** a concrete missing input or unresolved conflict and the work needed to resolve it.

The build is complete when every in-scope visual deliverable is represented and passes validation. Blocked items remain incomplete; report them accurately while completing independent work.

Return the Figma link, created component/component-set counts, per-spec coverage, structural and visual validation results, and any unresolved gaps. Provide the manifest location so another session can resume the same build.
