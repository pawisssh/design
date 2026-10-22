# Design System Skills

Agent skills that describe a component library written in code once, then use that description to build a matching component library in Figma and to hand features off to developers against the real components.

## Libraries

**Code Library**:
A component library written in code that serves as the source, such as Carbon React or shadcn/ui.
_Avoid_: Code component library, framework, source library

**Design Library**:
A Figma library file produced from a Code Library.
_Avoid_: Figma library, design kit

**Linked Library**:
One or more published Figma library files the owner already has for the same Code Library, made outside To-design, whose variables and Text Styles a Design Library binds to instead of having its own. To-design reads it and never changes it.
_Avoid_: Existing library, team library, kit, external library, adopted library

**Extracted Library**:
A Code Library generated from a Prototype that has none, with one component per Component Family found among the Prototype's repeated elements. An Adapter reads it, and developers adopt it instead of the Prototype's code.
_Avoid_: Generated library, inline library, synthetic library

**Family map**:
The record of which elements of a Prototype make up each Component Family of its Extracted Library, including the owner's corrections.
_Avoid_: Clusters, grouping

**Design System**:
One Foundations document and the Contracts and Component Proposals planned with it, for one Code Library; Design Libraries are built from it, and handoffs refer to it.
_Avoid_: DS, system

## Components

**Component Family**:
One conceptual component, such as Button, covering every variant it supports.
_Avoid_: Component (when the whole family is meant)

**Property Axis**:
One dimension along which a Component Family's variants differ, such as Size, State, Hierarchy or Style. A Mode is never a Property Axis.
_Avoid_: Prop, variant property, dimension

**Slot axis**:
A Property Axis whose values say whether one slot of a Component Family is filled. It exists only where filling the slot changes the family's other styling, such as a Button's padding when it holds an icon.
_Avoid_: Icon axis, presence variant, boolean variant

**Base Component**:
The single final variant of a Component Family with every Property Axis at its default, such as Button Primary/Large/Enabled. It is built in Figma and approved by the user before the other variants are derived from it.
_Avoid_: Master, template, first variant

**Sub-component**:
A private component, prefixed `_`, at tier Item or Base, used to compose a Component Family; never published on its own.
_Avoid_: Base Component (that is the first approved final variant), building block, part

**Repeated child**:
A child component that a Component Family's code takes any number of, with content the feature chooses, such as a Select's SelectItem options. The Contract names its component and props; a Usage lists them.
_Avoid_: Item (that is a Sub-component tier), option, slot

**Component Set**:
The Figma node that groups a Component Family's variants. Used only for the Figma artifact.
_Avoid_: Variant group

## Bridging

**Contract**:
The library-neutral description of a Component Family (its Property Axes, anatomy, layout and tokens) that every skill produces or consumes.
_Avoid_: component.json (that is the file, not the concept), spec, schema

**Adapter**:
The translation from one Code Library into its Contracts and Foundations document. It is either the Generic Adapter or a Dedicated Adapter.
_Avoid_: Source adapter, connector, parser

**Generic Adapter**:
The Adapter for any Code Library: it reads standard token and prop formats exactly, and an agent drafts what those formats leave out, marked for the owner to approve.
_Avoid_: Universal adapter, AI adapter

**Drafted value**:
A value in a Contract that an Adapter's agent chose because neither the source nor the Adapter's own rules state it, such as a label, a layer, or an icon slot's default, recorded with the evidence it was drafted from. A value read from source, including a raw with its reason, is not one. The Contract's one approval covers it, and a re-run keeps it while that evidence is unchanged.
_Avoid_: Draft Contract (that is a Contract not yet approved), guess, suggestion, AI value

**Dedicated Adapter**:
An Adapter written for one Code Library: a reading procedure with that library's own rules, whose output a validator checks, such as the Carbon Adapter. An agent may carry it out, and what its rules still leave to judgement is recorded as Drafted values. A Code Library graduates to one when the owner keeps correcting its Drafted values, or its upgrades keep reopening many of them.
_Avoid_: Custom adapter, scripted adapter (an agent may carry one out)

**Component Proposal**:
The description of a whole new Component Family that does not exist in the Code Library yet, shaped like a Contract but with no code behind it, and stating why no existing Contract fits. A missing value on an existing family is not a Component Proposal. It is retired when a Contract takes its place, read from the built component or chosen by the owner instead; one built in an app rather than the Code Library stays a Proposal that records where it was built.
_Avoid_: Draft Contract, proposed Contract, custom component

**Foundations document**:
The generated description of the Code Library's whole theme (every shared token and mode it defines, used by a Contract or not), which every Contract in that Design System refers to. One per Design System.
_Avoid_: Tokens file, theme file, variables JSON

**Foundations approval**:
The record of which Foundations document the owner's last approve of a Design System's review covered, kept beside the document. The document itself carries no approval. A Foundations build sends no call for any other document.
_Avoid_: Foundations sign-off, approved Foundations (the document is never marked approved)

**Mode**:
One of the alternative value sets a Foundations document defines for a group of tokens, such as Carbon's Gray 100 theme or its second Layer level. The page or an enclosing element picks it, never the component's own props.
_Avoid_: Theme (when a Layer level is meant), context, mode variant

**Synthesized token**:
A token the Adapter adds to the Foundations document for one Component Family, where the Code Library styles that component with a value none of its own tokens holds in every mode, such as a dark-only override or a token at reduced opacity.
_Avoid_: Derived token, fake token, component variable

## Handoffs

**Handoff**:
The library-bound description of one feature (one user goal, across its screens and states) for developers to build, referring to a Design System's Contracts and Component Proposals by key.
_Avoid_: Handoff doc, spec, feature spec, brief, blueprint

**Off-system value**:
A colour, spacing, size, radius or type value in a feature's input that matches no token in the Foundations document, exactly or nearly, and is kept as written in the Handoff with a reason.
_Avoid_: Raw value (when the unmatched kind is meant), hard-coded value, magic number

**Prototype**:
Feature code made quickly to show what a feature should do, such as a v0 or Lovable app or a single HTML file, given to To-handoff or Vibe-to-Figma as input. Only Figma-to-Vibe edits it, and only when the owner asks; its code is never handed to developers.
_Avoid_: Mockup, vibe code, POC, prototype Contract (that is a Contract approved only for a trial build)

**Usage**:
One element of a feature's input, as the Handoff records it: a Contract with a tuple of its axis values (and its Repeated children, if the family has them), a Component Proposal, or a raw element with a reason. It always records how it was recognised.
_Avoid_: Instance (that is the Figma node), component reference, match

**Container**:
A Code Library component whose subtree holds Usages of other Code Library components, such as a Card around a form. With a Contract, it is a Usage that the others nest in through `in`; one whose children are all its own parts is a leaf.
_Avoid_: Wrapper (that is the reading of a container with no Contract), parent

**Standard state**:
One of the five states every screen in a Handoff accounts for: default, loading, empty, error and success.
_Avoid_: Core state, base state, State (that is a Property Axis of a Contract)

**Extra state**:
A screen state beyond the Standard states that the Prototype shows or the owner names, such as offline or permission denied. A screen has as many as it needs, or none.
_Avoid_: Custom state, edge state, State (that is a Property Axis of a Contract)

**Stand-in**:
Anything in a Prototype that fakes what the real feature will do, such as mock data, a stub API, fake latency or placeholder copy. The Handoff records what it pretends to do, never how.
_Avoid_: Mock (when more than data is meant), fake, throwaway code

**Rendering**:
One output format's layout of a Handoff, such as HTML, Markdown, a Figma frame or a Confluence page. It never adds or drops a Handoff's content.
_Avoid_: Export, view, handoff document

**Sign-off**:
The owner's one explicit approval of a Handoff revision, covering every decision the agent made in it and the pending Component Proposals it uses. Developers read a signed-off Handoff; they never sign it.
_Avoid_: Approval (when the Handoff's is meant; that is a Contract's or a Component Proposal's), acceptance (that is the Handoff's Given/When/Then criteria), review

**Drift**:
A change, after Sign-off, to the Prototype or to a part of the Design System that a Handoff uses. A Handoff with Drift keeps its content but no longer counts as signed off until the owner signs it again.
_Avoid_: Stale (that is a Foundations document that must be regenerated), outdated, out of sync

## Building

**Orphan**:
A token or variant To-design built that the Foundations document, the Contract's selection or the Component Proposal's axes no longer hold, including a Proposal's variant that its retirement maps to nothing. The ledger keeps tracking it by id and Figma keeps the node, so a token or variant that comes back reuses it; it is deleted only through a Prune list.
_Avoid_: Extra (that is a node the ledger never recorded), deprecated variant, stale node

**Conflict**:
A reason To-design stops a call before it changes anything in Figma, such as a same-name object its ledger does not own (`unowned`), a variable whose type changed (`type-change`), or a token the call needs that is not built yet. The call writes nothing until its cause is resolved.
_Avoid_: Held variant (that is a variant a rerun leaves as Figma has it), clash, collision

**Coverage check**:
The read of a whole built Component Set that confirms each variant's name, grid cell and property wiring match its Contract.
_Avoid_: Check (when the Edit check is meant), verification

**Baseline**:
The version of each variant's code that a Component Set holds, as of its last passing Coverage check, with the Contract the set was built from; a variant the owner kept as Figma has it takes the code's version it was kept at. A rerun writes only the variants whose code differs from it.
_Avoid_: Snapshot, last build

**Edit check**:
The read-only read, before a rerun writes over variants already in a Component Set, of those variants, each against the Contract it was built from, to find the ones changed in Figma since.
_Avoid_: Check (when the Coverage check is meant), sample, diff

**Held variant**:
A variant whose code changed since its Baseline while Figma may no longer hold it as built: edited or deleted in Figma, or not read back by an Edit check. A rerun leaves it as Figma has it until the owner takes the code's version or keeps Figma's.
_Avoid_: Conflict (that is To-design's stop before any change), Figma edit, clash

**Prune list**:
The Orphans the owner confirmed, by name, for To-design to delete; for variants, each with the instance count the owner was shown. A prune refuses any name whose count has changed since.
_Avoid_: prune.json (that is the file, not the concept), delete list, cleanup

## Skills

**To-preview**:
The skill that shows a Contract's combinations, rendered with the real Code Library, so the owner can leave out the ones they don't want. It never approves anything.
_Avoid_: component-sheet-html, component sheet, HTML catalog skill

**To-design**:
The skill that builds a Design Library in Figma from Contracts, and from the Component Proposals the owner asks for ahead of code, where the owner approves each Base Component before its Component Set is built.
_Avoid_: code-to-canvas

**To-handoff**:
The skill that turns one feature, given as prototype code, a Figma URL, an artifact URL or a description, into a Handoff for developers written against a Design System's Contracts and Component Proposals.
_Avoid_: design-handoff, handoff doc skill, spec generator

**Vibe-to-Figma**:
The skill that turns a Prototype into its own Design System folder and, after the owner approves, Component Sets in Figma. It only ever carries code to Figma.
_Avoid_: sync, two-way sync

**Figma-to-Vibe**:
The skill that carries the owner's edits to a Prototype's Component Sets in Figma back into the Prototype's code, when the owner asks. Vibe-to-Figma's reverse.
_Avoid_: Design-to-vibe, pull, write-back
