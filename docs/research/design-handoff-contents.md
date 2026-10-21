# What must a Handoff for one vibe-coded feature carry, and how does each Rendering show it?

Research for the Handoff's content model. Related: [#63](https://github.com/pawisssh/design/issues/63) (what the HTML Rendering should look like), map [#52](https://github.com/pawisssh/design/issues/52). Vocabulary follows `GLOSSARY.md` (Handoff, Rendering, Prototype, Stand-in, Off-system value, Sign-off, Drift, Contract, Foundations document, Usage, Mode).

Researched 2026-10-21. The repo side is read at commit `c650fc6`:

- the schema: `skills/to-handoff/handoff.schema.json`;
- what generate writes: `skills/to-handoff/scripts/generate.mjs`;
- what validate accepts: `scripts/validate.mjs`;
- what the HTML Rendering shows: `scripts/render-html.mjs`;
- the two committed recorded Handoffs: `design-systems/carbon/handoffs/invite-teammates` and `design-systems/shadcn/handoffs/request-access`.

**partial** marks a key that the schema allows but generate never writes. Such a key does not count as covered.

The sources below are paraphrased, not quoted.

Short prefixes:

- `FIG-STATUS` = https://help.figma.com/hc/en-us/articles/26781702258583-Dev-Mode-statuses-and-notifications
- `FIG-ANNOT` = https://help.figma.com/hc/en-us/articles/20774752502935-Add-measurements-and-annotate-designs
- `FIG-COMPARE` = https://help.figma.com/hc/en-us/articles/15023193382935-Compare-changes-in-Dev-Mode
- `FIG-DEV` = https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode
- `FIG-INSPECT` = https://help.figma.com/hc/en-us/articles/22012921621015-Guide-to-inspecting
- `FIG-VARS` = https://help.figma.com/hc/en-us/articles/27882809912471-Variables-in-Dev-Mode
- `FIG-VARMODE` = https://help.figma.com/hc/en-us/articles/15253268379799-Variable-modes-in-prototypes
- `FIG-EASING` = https://help.figma.com/hc/en-us/articles/360051748654-Prototype-easing-and-spring-animations
- `FIG-FLOWS` = https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows
- `FIG-CC` = https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect
- `CC` = https://developers.figma.com/docs/code-connect/
- `DTCG` = https://www.designtokens.org/tr/2025.10/format/ (Design Tokens Format Module 2025.10, 28 October 2025)
- `DTCG-RES` = https://www.designtokens.org/tr/drafts/resolver/ (Design Tokens Resolver Module, draft)
- `WCAG` = https://www.w3.org/TR/WCAG22/ (W3C Recommendation, 12 December 2024)
- `APG-KB` = https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- `APG-LM` = https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/
- `APG-DIALOG` = https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- `I18N-DIR` = https://www.w3.org/International/questions/qa-html-dir
- `I18N-SIZE` = https://www.w3.org/International/articles/article-text-size
- `CARBON-CHECK` = https://carbondesignsystem.com/contributing/component-checklist/
- `CARBON-MOTION` = https://carbondesignsystem.com/elements/motion/overview/
- `GOVUK-ERR` = https://design-system.service.gov.uk/components/error-message/
- `PRIMER-A11Y` = https://primer.style/accessibility/annotation-toolkit/basics/features/
- `PRIMER-ORDER` = https://primer.style/accessibility/annotation-toolkit/tutorials/ordering/
- `ATL-A11Y` = https://atlassian.design/foundations/accessibility
- `M3-RTL` = https://m3.material.io/foundations/layout/bidirectionality-rtl. The page renders client-side, so this note relies on the search index's text of it and did not read the page.

## Answer

1. **Most of the content already has a key.** A Handoff's schema already holds most of what the sources ask a design to give developers:

   | Content | Key |
   | --- | --- |
   | Goal, scope and non-goals | `feature` |
   | Screens × the five standard states × breakpoints, with screenshots | `screens` |
   | Every element as a Contract Usage with its tuple, or as a raw element with a reason | `regions[].usages` |
   | Token-bound styles and Off-system values | `regions[].styles`, `values` |
   | Copy | `copy` |
   | Flow | `flow` |
   | Stand-ins | `data`, `source.notes` |
   | Acceptance criteria in Given/When/Then form | `acceptance` |
   | Open questions | `openQuestions` |
   | Sign-off, with Drift computed from pins | `status`, `approval`, `source.*` pins |

2. **The biggest gaps are keys the schema has but generate never writes.** Neither recorded Handoff has them, and the HTML Rendering prints *Not specified* for each one:
   - `a11y`, which holds `focusOrder`, `landmarks` and `labels`;
   - `interactions`, for keyboard, hover and motion;
   - `tokensToAdd`;
   - `regions[].responsive`;
   - `data[].shape`.

   Accessibility is the gap the sources stress most:
   - Carbon's checklist requires the flow of focus to be documented (`CARBON-CHECK`).
   - WCAG makes three of these points normative: focus order (2.4.3), keyboard operation (2.1.1) and accessible names (4.1.2) (`WCAG`).

3. **Some content has no key at all.** These are **missing**:
   - any state beyond the standard five (validate rejects other state names);
   - content limits, overflow, and long or short copy;
   - i18n and RTL;
   - headings and status announcements;
   - motion values;
   - icon and asset delivery, which To-handoff lists as out of scope;
   - analytics events.

4. **The two Renderings must place the same content.**
   - In the HTML Rendering, most of that content already has a section.
   - Figma's Dev Mode shows two kinds of information. Some is Handoff content, carried by component properties, Code Connect, variables, prototype connections and annotations. The rest is Figma's own reading of the frame: generated code, measurements and detected icons.
   - Where Figma's reading disagrees with the Handoff, the Handoff wins. Off-system values are where this happens.
   - Figma's Ready for dev and Completed statuses are workflow flags, not Sign-off.
   - Figma's Changed flag ignores updates to library instances and variables (`FIG-STATUS`), so it cannot stand in for Drift.

5. **The repo has no Figma Rendering today.** Vibe-to-Figma builds Component Sets on the Design Library side, not a Handoff's screens. A Figma Rendering would:
   - place instances of those Component Sets in frames, one per screen × state × breakpoint;
   - carry a stamp with the Handoff's `revision` and `contentHash`, like any published Rendering (ADR 0007);
   - be a copy that nothing reads back, under ADR 0017's one-way rule.

## Findings

### 1. What the Handoff already carries, and what generate writes

| Key | What it holds | Written by generate? |
| --- | --- | --- |
| `feature` | `key`, `name`, `owner`, `goal`, `scope[]`, `nonGoals[]` | Yes. `owner`, `scope` and `nonGoals` are written when the `feature` decision gives them. |
| `screens[]` | `id`, `name`, `breakpoints[]` (the Adapter's keys), `regions[]`, `states{}` | Yes. |
| `screens[].states` | Exactly `default`, `loading`, `empty`, `error` and `success`. Each state is one of: content with `trigger`, `usageStates` and per-breakpoint `screenshots`; `missing` with a question; or `na` with a reason. | Yes. Validate rejects any other state name (`validate.mjs` L132–134). |
| `regions[]` | `landmark`, `overlay`, `shell`, `states`, `styles[]`, `text[]`, `usages[]`, `responsive{}` | All except `responsive`. `landmark` is written (for example `main`). `overlay` is set on fixed or absolute regions. |
| `usages[]` | One of: a Contract with a `tuple`; a Proposal; or `raw` with a `reason`. Also `state` (authored State values only, such as `disabled`), `properties`, `items` (Repeated children), `in`, `modes`, `offAxis` and `match.by`. | Yes. |
| `copy` | `text`, `placeholder`, `at` | Yes. |
| `values[]` | Off-system values: `raw`, `role`, `reason`, `nearest[]`, `primitive`, `at` | Yes. |
| `flow[]` | `from`, `trigger`, `to`, `source` (mock, simulated or missing) | Yes, from simulated functions and timers. `SKILL.md` puts overlay flow transitions out of scope. |
| `data[]` | `id`, `source` (mock, simulated or real), `shape`, `note`, `question`, `at` | Yes, except `shape`, which neither `data.push` site writes. |
| `acceptance[]` | `id`, `screen`, `state` (standard states only), `given`, `when`, `then`, `by` | Yes, from the `acceptance` decision. |
| `openQuestions[]` | Kinds `font`, `mode-map`, `breakpoint`, `no-contract`, `off-axis`, `missing-state`, `stand-in`, `prop`, `runtime` and `split`, each addressed to the owner or the developer | Yes. |
| `a11y` | `focusOrder{screen: [ids]}`, `landmarks{}`, `labels{id: copy:ref}` | **Never.** |
| `interactions` | Free text per usage id, covering hover, focus, keyboard and motion | **Never.** |
| `tokensToAdd` | DTCG tokens with per-mode values | **Never.** |
| `revision`, `status`, `approval`, `source.*` pins | Sign-off and Drift | Yes. `check` computes Drift and never stores it. |

To verify, `jq` was run over both recorded Handoffs:
- Both have exactly these keys: `acceptance`, `approval`, `copy`, `data`, `feature`, `flow`, `openQuestions`, `ownerDecisions`, `revision`, `schemaVersion`, `screens`, `source`, `status`, `values`.
- No region has `responsive`.
- No `data[]` entry has `shape`.

### 2. Gaps tested against the schema

**Responsive and breakpoint behaviour: partial.**

What the Handoff has:
- `screens[].breakpoints` lists the Adapter's breakpoints.
- Each state has one screenshot per breakpoint.
- An `@media` rule raises a `q-breakpoint-…` question that says which breakpoints the rule applies at.

What it lacks: the behaviour at each breakpoint. Its key, `regions[].responsive`, exists but is never written.

What the sources ask for:
- Carbon's checklist asks designs to cover behaviours such as responsiveness, content overflow, reflow, expansion and scrolling. It asks code to work on all device sizes, down to about 320 px wide (`CARBON-CHECK`).
- WCAG 1.4.10 Reflow (AA) requires that content stays usable at a width equivalent to 320 CSS px (`WCAG`).

A repo finding: the Generic Adapter's smallest breakpoint is `sm` at 640 (`to-handoff/SKILL.md` §3). So no screenshot of a shadcn or v0 Prototype shows the 320 width that Reflow names. Carbon's `sm` is 320.

**Motion and transitions: missing.**

What the Handoff has:
- `interactions` could hold motion as free text, but generate never writes it.
- `values[]` covers only colour, spacing, size, radius and type (GLOSSARY, Off-system value), so a motion value has no place there either.
- Neither recorded Foundations document has a duration or easing token; `grep` finds none.

What the sources offer:
- The DTCG Format Module 2025.10 defines three relevant token types (`DTCG`), so `tokensToAdd` could carry motion in structured form:
  - `duration`: an object with a number and a unit of `ms` or `s`;
  - `cubicBezier`: four numbers;
  - `transition`: a composite of `duration`, `delay` and `timingFunction`.
- Carbon publishes duration tokens from `duration-fast-01` (70 ms) to `duration-slow-02` (700 ms), and a productive standard easing of `cubic-bezier(0.2, 0, 0.38, 0.9)` (`CARBON-MOTION`).
- Two WCAG criteria make "can this motion be turned off" part of the content (`WCAG`):
  - 2.3.3 Animation from Interactions (AAA);
  - 2.2.2 Pause, Stop, Hide (A).

**Asset and icon delivery: missing.**
- To-handoff lists icons as the icon property among the things out of scope (`to-handoff/SKILL.md`). The Handoff has no asset list and no icon key on a Usage.
- Dev Mode detects icons on its own and offers them as downloadable assets (`FIG-INSPECT`). That is Figma's reading of a frame, not Handoff content.
- RTL also touches assets. Directional icons are mirrored. Clocks, media controls and physical objects are not (`M3-RTL`, from the search index only).

**Content limits, truncation, overflow, and long or short copy: missing.**
- `copy` holds only `text`, `placeholder` and `at`. There is no maximum length, no truncation rule and no long or short sample.
- Carbon asks designs to cover content overflow and reflow (`CARBON-CHECK`).
- W3C i18n gives two points (`I18N-SIZE`):
  - The shorter the source string, the more its translation tends to grow. IBM's figures put growth at 200–300% for strings of ten characters or fewer.
  - Layouts should let text reflow rather than use small fixed-width containers.
- WCAG 1.4.12 Text Spacing (AA) requires content to keep working when users increase text spacing (`WCAG`).

**i18n and RTL: missing.**
- The Handoff has no key for locale, text direction or the language of parts of a page.
- W3C i18n says to put `dir="rtl"` on the `html` element of an RTL document, and: "Do not use CSS to apply base direction in HTML pages." (`I18N-DIR`)
- WCAG 3.1.2 Language of Parts (AA) applies (`WCAG`).
- Material mirrors layouts and directional icons for RTL (`M3-RTL`, from the search index only).

**Focus order, keyboard, names and landmarks: partial.** Each sub-item has a different status.

- **Focus order: partial.** `a11y.focusOrder` exists in the schema, but generate never writes it.
  - WCAG 2.4.3 Focus Order (A) applies.
  - APG says the default tab sequence follows DOM order (`APG-KB`). So a Prototype's DOM order is a draft focus order, which the owner must confirm.
  - Carbon requires the flow of focus to be documented (`CARBON-CHECK`).
  - Primer's annotation toolkit has stamps for focus order, arrow stops and reading order, which show engineers the intended sequence (`PRIMER-ORDER`).
- **Keyboard: partial.** Its only home is the free text in `interactions`, which generate never writes.
  - WCAG 2.1.1 Keyboard (A) applies.
  - Each APG pattern has a Keyboard Interaction section. In the modal dialog, for example, opening moves focus into the dialog and closing returns it to the element that opened it (`APG-DIALOG`).
  - *Reasoning, not sourced:* a Contract Usage inherits the keyboard behaviour of its Code Library component. So the Handoff needs only the feature-level parts: focus order, where focus goes after an action (closing a dialog, submitting, deleting), and any shortcut keys.
- **Accessible names: partial.** `a11y.labels` (a `copy:` reference per usage) exists, but generate never writes it. WCAG 4.1.2 Name, Role, Value (A) and 3.3.2 Labels or Instructions (A) apply.
- **Landmarks: partial.** There are two keys.
  - `regions[].landmark` is written, from the element or its `role`. The recorded Handoffs show `main` and `null`.
  - `a11y.landmarks` is never written.
  - APG recommends that all perceivable content sit inside a landmark region (`APG-LM`). So a region whose `landmark` is `null` is a candidate question.
- **Headings and reading order: missing.** The Handoff has no key for them.
  - WCAG 1.3.1 Info and Relationships and 1.3.2 Meaningful Sequence apply.
  - Primer has stamps for heading levels and reading order (`PRIMER-A11Y`).
- **Status announcements: missing.**
  - Announcing loading, success and error falls under WCAG 4.1.3 Status Messages (AA).
  - Primer has a live-region stamp (`PRIMER-A11Y`).
- **Atlassian's kit.** Atlassian lists accessibility annotations for passing accessibility requirements to engineers (`ATL-A11Y`). The kit is for Atlassians only, so this note cannot cite what it contains.

**Analytics and tracking events: missing.**
- The Handoff has no key for them.
- None of the primary design-system sources read for this note names analytics events as content a design should give developers.
- **Practitioner consensus only:** teams often attach event names to interactions when they hand a design over.

**States beyond the five: missing. Field validation: partial.**

States beyond the five:
- The schema allows extra names in `screens[].states` (`additionalProperties`).
- Validate rejects any state name outside `default`, `loading`, `empty`, `error` and `success`. It applies the same rule to `region.states`, `text.states`, `usage.states` and `acceptance[].state`.
- So partial data, offline and permission-denied states have nowhere to go.

Field validation:
- What exists:
  - A field's invalid look rides on `usage.state` or `usageStates` (a Contract State value, such as `invalid`) inside the `error` state.
  - Its message is a `copy` entry.
- What is missing: a key for each error condition.
- GOV.UK's guidance (`GOVUK-ERR`):
  - Show the message next to the field and in the error summary.
  - Say what went wrong and how to fix it.
  - Write a different message for each kind of error: an empty field, a value that is too long, a value in the wrong format.
- WCAG 3.3.1 Error Identification (A) and 3.3.3 Error Suggestion (AA) apply.
- So one `error` state per screen cannot hold a feature that has several distinct validation errors.

**Data contracts and API shape: partial, by design.**
- `data[]` records each Stand-in's `source` and asks the developer a question (`q-data-…`).
- `shape` exists in the schema but is never written.
- GLOSSARY says the Handoff records what a Stand-in pretends to do, never how. So the API itself is the developer's question, not the designer's content.
- *Reasoning, not sourced:* `shape` would still be the designer's content wherever the UI depends on a field, such as a name shown in a list or a count that drives the `empty` state.

**Versioning, changelog and Drift: partial.**

What exists:
- `revision` goes up with each content change.
- `signed.json` keeps the last signed-off copy, and `review` prints the diff against it.
- `check` computes Drift from the pins: Prototype file hashes, the `contentHash` of each Contract and Proposal, and the Foundations `usedHash`.

What is missing: a stored changelog. A developer reading a Rendering at `r7` cannot see what changed since `r5` without running `review`.

Figma's model is coarser:
- Editing a frame marked Ready for dev sets its status to Changed. The designer clears Changed by updating the status, and can add a reason that shows in version history (`FIG-STATUS`).
- Updates to shared-library instances and changes to variable or style values do not set Changed (`FIG-STATUS`). Those are exactly the Design System changes that Drift catches.
- Compare changes diffs a top-level frame's layers, properties and code between saved versions (`FIG-COMPARE`). That is the Rendering's history, not the Handoff's.

**Out of scope and non-goals: covered.** `feature.scope[]` and `feature.nonGoals[]` hold them; the `feature` decision asks for them.

**Acceptance criteria: covered, but only for the five states.**
- `acceptance[]` holds Given/When/Then criteria with `by: agent|owner`.
- A re-run carries the owner's criteria over by key.
- A criterion cannot name a state outside the five standard ones (see above).

**Hover, pressed and focus looks: in the Contract, not the Handoff.**
- The schema limits `usage.state` to authored State values whose Contract code is not null, such as `disabled`.
- Hover and focus looks therefore belong to the Contract's State axis, so a Contract Usage gets them from the Design System.
- For a raw Usage they are **missing**. `interactions` is their per-feature home, and generate never writes it.
- Carbon asks designs to cover component states such as hover, focus, selected, disabled and error (`CARBON-CHECK`).
- WCAG 2.4.7 Focus Visible (AA) applies.

### 3. Presentation per Rendering

Rules that apply to both Renderings:
- A Rendering lays out the Handoff's content and never adds or drops any (GLOSSARY, Rendering).
- Each Rendering carries a stamp, `r<revision> · <contentHash>`, and its Sign-off state (ADR 0007).

**What the HTML Rendering does today (`render-html.mjs`)**

The page has a header stamp and six sections.

- **Header.** The stamp reads `r<revision> · <hash> · pending sign-off` or `… · signed off`.
- **Overview.**
  - Holds `feature` and the pins.
  - Prints *Not specified* for each optional key that is absent (`flow`, `interactions`, `data`, `a11y`, `tokensToAdd`).
  - Shows each present optional key as a table (`flow`) or as raw JSON.
- **Needs a look.**
  - Counts every flag: ≠ Off-system, ≈ near, ◇ agent pick, + Proposal, ∅ no Contract, ↯ off-axis, ! missing, ◌ Stand-in, ◐ draft Contract.
  - Links each flag to the `q-…` question that settles it.
- **States.**
  - A matrix of screenshots, states × breakpoints. A missing state is hatched. A missing screenshot shows its reason.
  - One tab per state. The tabs switch screenshots, not live components.
- **Components.**
  - Live Code Library renders inside the mapped Mode's class, with per-state renders of each Usage and its nested container Usages.
  - A code snippet from the Contract's `code` in a read-only `<textarea>`. The snippet can be selected, but there is no copy button.
  - A mode toggle that covers every Theme mode and applies each Mode's `selector` class.
- **Tokens & values.** A table.
- **Copy & questions.** A table.

**What the HTML Rendering would need for the missing or partial content**

| Content | HTML presentation | Why |
| --- | --- | --- |
| `a11y.focusOrder` | Numbered badges over the default-state screenshot, with an ordered list keyed to usage ids. Tab also moves through the live renders. | WCAG 2.4.3; Primer's focus-order stamps (`PRIMER-ORDER`) |
| Landmarks and headings | An outline: landmark → heading level → region | `APG-LM`; Primer's heading and landmark stamps (`PRIMER-A11Y`) |
| `regions[].responsive` | One line per region per breakpoint beside the matrix. A 320 column when the Adapter has none. | WCAG 1.4.10 |
| Motion (a `transition` in `tokensToAdd`) | Duration and easing as DTCG values, with a replay of the live render | `DTCG` |
| Content limits | Live renders with long and short copy toggled | `CARBON-CHECK`, `I18N-SIZE` |
| RTL | A `dir` toggle for the live renders, set on the `html` element | `I18N-DIR` |
| Tokens | A copy button per token name and value | Reasoning, not sourced |

**Figma Rendering: where each key sits**

The layout below is this note's own proposal, built from the features each source documents:

- **Cover frame.** `feature` (goal, scope, non-goals), `acceptance[]`, the open `openQuestions[]`, and the stamp `r<revision> · <contentHash> · pending sign-off|signed off`. It also carries a dev resource link to the HTML Rendering and to `handoff.json`; Dev Mode supports links to resources such as GitHub, Jira and Storybook (`FIG-DEV`).
- **Frames.**
  - One section per screen.
  - Inside each section, one top-level frame per state × breakpoint. A missing state or screenshot becomes a placeholder frame that names its question.
  - The frames hold instances of the Component Sets that Vibe-to-Figma or To-design built, set to each Usage's tuple.
- **Annotations.** Annotations hold free text and pinned properties, which stay current as the design changes. They come with four preset categories, Development, Interaction, Accessibility and Content, and editors can add their own (`FIG-ANNOT`). Mapped to the Handoff:
  - **Content:** `copy` keys and placeholder flags.
  - **Accessibility:** `a11y` (focus order, labels, landmarks).
  - **Interaction:** `interactions`.
  - **Development:** Off-system values with their reasons and nearest tokens, `data[]` Stand-in notes, and the questions addressed to developers.
- **Prototype connections.** `flow[]`: one named flow per screen, starting from its default-state frame, with each connection labelled by `trigger`. Figma sets flow starting points on top-level frames, lets one file hold several flows, and lets each flow have a name and a description (`FIG-FLOWS`).
- **No Figma home yet.** Content limits, RTL, motion values and analytics have no Figma home, because the Handoff itself has no key for them yet.

**Figma features, in three groups**

Group 1: features that carry Handoff content.

| Figma feature | Handoff content it carries | Source |
| --- | --- | --- |
| Component properties on instances, and the Dev Mode playground | A Usage's `tuple`, `state` and `properties`. In the playground, a developer can try a component's properties and variable modes without changing the design. | `FIG-INSPECT` |
| Code Connect | The Contract's `code`. Code Connect CLI replaces Dev Mode's generated snippets with the design system's own. Code Connect UI shows no snippet in Inspect, only the file and component name. | `FIG-CC`, `CC` |
| Variables and modes | Foundations tokens and `source.modes`. Dev Mode shows a variable's value in each mode and follows its alias chain to the raw value. The Set variable mode action switches a page's mode in a prototype. | `FIG-VARS`, `FIG-INSPECT`, `FIG-VARMODE` |
| Prototype connections | `flow[]`. Dev Mode's Inspect lists the prototype interactions applied to a layer. A transition's easing is a Bézier preset, a custom Bézier, a spring preset or a custom spring. | `FIG-DEV`, `FIG-EASING` |
| Annotations | `copy`, Off-system values, questions, `a11y`, `interactions`, `data`. Adding an annotation needs a Full seat with edit access. | `FIG-ANNOT` |

Group 2: what Figma generates on its own. It must not override the Handoff.

- **Generated code and measurements.**
  - Dev Mode fills the Code section from the selected layer (`FIG-INSPECT`).
  - Measurements read pixel distances. They are either temporary, made with Alt or Option, or saved with Shift M (`FIG-ANNOT`).
  - For a token-bound style, both agree with the Handoff.
  - For an Off-system value, both show the raw number without the Handoff's reason or nearest token. The Rendering must carry those in a Development annotation.
- **Detected icons as downloadable assets** (`FIG-INSPECT`). The Handoff has no asset list behind them, so they stay outside its content until icons are in scope.

Group 3: workflow status. None of it is Sign-off.

- **The statuses.**
  - Ready for dev can mark sections, frames and components. Completed exists only on Organization and Enterprise plans.
  - Any Full or Dev seat can set either status (`FIG-STATUS`).
- **Sign-off is not a status.**
  - Sign-off is the owner's `approve` in chat, recorded in `handoff.json`.
  - A Figma Rendering marks its frames Ready for dev only once the Handoff it was rendered from is signed off.
  - Its stamp names that revision.
- **Drift comes from `check`.** Library and variable updates do not set Changed (`FIG-STATUS`), so a developer learns about Drift from `check`, not from Figma.
- **No reading back.** Edits made to a Figma Rendering are never read back into the Handoff or the Prototype (ADR 0017).

## Summary table

| Content item | Schema key | Source(s) |
| --- | --- | --- |
| Goal, scope, non-goals | `feature.goal`, `feature.scope[]`, `feature.nonGoals[]` | Repo (GLOSSARY, Handoff) |
| Screens and the five standard states | `screens[].states.{default,loading,empty,error,success}` | Repo |
| States beyond the five (partial data, offline, permission denied) | **missing**: validate rejects other state names | Practitioner consensus only |
| Field validation errors | **partial**: `usage.state` or `usageStates` in `error`; the message in `copy`; no key per error | `GOVUK-ERR`; WCAG 3.3.1, 3.3.3 |
| Breakpoints and screenshots | `screens[].breakpoints[]`, `states.*.screenshots{}`, `q-breakpoint-…` | WCAG 1.4.10 |
| Behaviour per breakpoint | **partial**: `regions[].responsive` exists but is never written; the Generic Adapter has no 320 width | `CARBON-CHECK`; WCAG 1.4.10 |
| Components and their axis values | `regions[].usages[].{contract,tuple,state,properties,items,in}` | `FIG-INSPECT` (playground), `FIG-CC` |
| Hover, pressed and focus looks | The Contract's State axis for Contract Usages; **missing** for raw Usages (`interactions` is never written) | `CARBON-CHECK`; WCAG 2.4.7 |
| Token-bound styles | `regions[].styles[].token`, `text[].style.textStyle` | `CARBON-CHECK` (system tokens only); `FIG-VARS` |
| Off-system values | `values[]`, `styles[].value` | Repo (GLOSSARY) |
| New tokens for developers | **partial**: `tokensToAdd` exists but is never written; per-mode values sit outside the Format Module | `DTCG`, `DTCG-RES` |
| Modes (light and dark, layers) | `source.modes`, `usages[].modes` | `FIG-VARS`, `FIG-VARMODE`, `DTCG-RES` |
| Motion: duration, easing, reduced motion | **missing**: `interactions` is free text and never written; the Foundations documents have no motion tokens | `DTCG`, `CARBON-MOTION`, WCAG 2.3.3 and 2.2.2, `FIG-EASING` |
| Copy | `copy{}.text`, `.placeholder` | Repo |
| Content limits, truncation, long and short copy | **missing** | `CARBON-CHECK`, `I18N-SIZE`, WCAG 1.4.12 |
| i18n, RTL, language of parts | **missing** | `I18N-DIR`, `I18N-SIZE`, WCAG 3.1.2, `M3-RTL` (search index only) |
| Icons and assets | **missing**: out of scope in To-handoff | `FIG-INSPECT`, `M3-RTL` (search index only) |
| Focus order | **partial**: `a11y.focusOrder` exists but is never written | WCAG 2.4.3, `APG-KB`, `CARBON-CHECK`, `PRIMER-ORDER` |
| Keyboard behaviour and focus after actions | **partial**: free text in `interactions`, never written | WCAG 2.1.1, `APG-DIALOG` |
| Accessible names | **partial**: `a11y.labels` exists but is never written | WCAG 4.1.2, 3.3.2 |
| Landmarks | **partial**: `regions[].landmark` is written; `a11y.landmarks` is never written | `APG-LM`, `PRIMER-A11Y` |
| Headings and reading order | **missing** | WCAG 1.3.1, 1.3.2, `PRIMER-A11Y` |
| Status announcements | **missing** | WCAG 4.1.3, `PRIMER-A11Y` |
| Flow between states and screens | `flow[]` (no overlay transitions) | `FIG-FLOWS`, `FIG-DEV` |
| Stand-ins and data | `data[].{source,note,question}`, `source.notes` | Repo (GLOSSARY, Stand-in) |
| The data shape the UI depends on | **partial**: `data[].shape` exists but is never written | Reasoning, not sourced |
| Analytics events | **missing** | Practitioner consensus only |
| Acceptance criteria | `acceptance[]` (Given/When/Then, standard states only) | Repo |
| Open questions | `openQuestions[]` | Repo |
| Revision, Sign-off, Drift | `revision`, `status`, `approval`, `source.*` pins; `check` | `FIG-STATUS`, `FIG-COMPARE` (for contrast) |
| Changelog between revisions | **partial**: `review` diffs against `signed.json`; nothing is stored | `FIG-STATUS` (a status reason shows in version history) |
