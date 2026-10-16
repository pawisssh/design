---
name: to-preview
description: HTML catalog of a Contract's variants, rendered with the real Code Library, where the owner unchecks the combinations they don't want; exports an omit patch the agent applies to the Contract. Use to review or narrow a Component Family's variants before To-design.
---

# To-preview

Shows every combination a Contract allows, rendered with the real Code Library component, so the owner can leave some out. The only output is an **omit patch**; the agent applies it to the Contract. To-preview never approves anything and never changes defaults, labels or States: those are explicit Contract edits. It is optional: To-design starts from any valid draft Contract.

To-preview knows no Code Library. The Adapter named in the Contract's `source.adapter` renders the specimens (see [references/interactive-template.md](references/interactive-template.md) for the renderer interface and the page).

## 1. Generate the catalog

```
node skills/to-preview/scripts/catalog.mjs design-systems/<ds>/contracts/<family>.component.json
```

- It validates the Contract (refusing an invalid one) and writes one self-contained page to `.scratch/to-preview/<family>/index.html` (gitignored). `--foundations <file>` and `--out <file>` override the defaults.
- The Adapter's packages must be fetched first. For Carbon: `node skills/adapter-carbon/scripts/sources.mjs`.
- Done when the command prints the page path and the checked count.

## 2. The owner reviews

Open the page (from `file://`, or serve `.scratch/to-preview/` with any static server). What the owner sees:

- **Specimens** are the Contract's axes minus `excluded`. Tuples the Contract already omits are shown unchecked, so they can be re-included.
- Each specimen is a 200×200 **card** in one grid of up to 6 columns, in Contract axis order: the axis values at top-left (the full variant name on hover), the checkbox at top-right, the specimen centred, and `Source` with the Code Library package and version in the footer. An unchecked card's specimen is dimmed.
- The **Base Component** (every axis at its default) is locked on, and its card footer reads `Base Component`.
- A State whose `code` is `null` (Hover, Active, Focus) is forced through its CSS pseudo-class; Disabled renders through its code props.
- **Theme** and **Layer** are display-only toggles, one per multi-mode collection of the foundations document, each applying its Mode's selector; the cards follow them too. Specimens render once, with every collection in its default (first) mode, and export needs only that.
- Axis filters change what is visible; **Check visible** and **Uncheck visible** change the selection.

**Export omit patch** downloads two files:

- `<family>.omit-patch.json`: exactly `{family, snapshotId, omit, expectedCount}`. `omit` is the whole owner omit list: the Contract's own patterns that still hold (kept verbatim so their reasons survive), then whole-value patterns (`{"state": "focus"}`, or an array when several values of one axis are off), then single tuples.
- `<family>.checked.json`: `{family, snapshotId, checked: [tuple]}`, the tuples left checked.

The page refuses to export unless every checked specimen rendered and the patch, applied to the Contract, expands to exactly the checked tuples. Browsers may ask once to allow the second download.

## 3. Apply the patch

```
node skills/to-preview/scripts/apply-omit.mjs <family>.omit-patch.json --checked <family>.checked.json --contract design-systems/<ds>/contracts/<family>.component.json
```

It applies the patch with the shared module's `applyOmit`, validates against the foundations document, asserts the expanded set equals the checked tuples (tuple by tuple, not only the count) and that nothing but `selection` changed, then writes the Contract in place. The written Contract is a draft with `approval: null`. On any failure it writes nothing and exits 1. Done when it prints the variant count and `status draft`. The write keeps the Contract's layout, so a diff shows only the `selection` lines.

## 4. Next

Regenerate the foundations document with the Adapter's foundations step (Carbon: `node skills/adapter-carbon/scripts/foundations.mjs`). It changes only when the omit dropped every variant that used a token. Then hand the draft Contract to [To-design](../to-design/SKILL.md), whose base loop ends with the owner's approval.

Tests: `node --test skills/to-preview/test/*.test.mjs`.
