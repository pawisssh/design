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
A published Figma library the owner already has for the same Code Library, made outside To-design, whose variables and Text Styles a Design Library binds to instead of having its own. To-design reads it and never changes it.
_Avoid_: Existing library, team library, kit, external library, adopted library

**Design System**:
One Foundations document and the Contracts planned with it, for one Code Library; Design Libraries are built from it, and handoffs refer to it.
_Avoid_: DS, system

## Components

**Component Family**:
One conceptual component, such as Button, covering every variant it supports.
_Avoid_: Component (when the whole family is meant)

**Property Axis**:
One dimension along which a Component Family's variants differ, such as Size, State, Hierarchy, Style or Mode.
_Avoid_: Prop, variant property, dimension

**Base Component**:
The single final variant of a Component Family with every Property Axis at its default, such as Button Primary/Large/Enabled. It is built in Figma and approved by the user before the other variants are derived from it.
_Avoid_: Master, template, first variant

**Sub-component**:
A private component, prefixed `_`, at tier Item or Base, used to compose a Component Family; never published on its own.
_Avoid_: Base Component (that is the first approved final variant), building block, part

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

**Dedicated Adapter**:
An Adapter written for one Code Library that reads it fully without an agent, such as the Carbon Adapter. A Code Library graduates to one when the Generic Adapter's drafts keep changing between runs.
_Avoid_: Custom adapter, scripted adapter

**Component Proposal**:
The description of a Component Family that does not exist in the Code Library yet, shaped like a Contract but with no code behind it. It is retired when the Adapter reads the built component into a real Contract.
_Avoid_: Draft Contract, proposed Contract, custom component

**Foundations document**:
The generated description of the Code Library's whole theme (every shared token and mode it defines, used by a Contract or not), which every Contract in that Design System refers to. One per Design System.
_Avoid_: Tokens file, theme file, variables JSON

## Handoffs

**Handoff**:
The library-bound description of one feature (one user goal, across its screens and states) for developers to build, referring to a Design System's Contracts and Component Proposals by key.
_Avoid_: Handoff doc, spec, feature spec, brief, blueprint

**Off-system value**:
A colour, spacing, size, radius or type value in a feature's input that matches no token in the Foundations document, exactly or nearly, and is kept as written in the Handoff with a reason.
_Avoid_: Raw value (when the unmatched kind is meant), hard-coded value, magic number

**Prototype**:
Feature code made quickly to show what a feature should do, such as a v0 or Lovable app or a single HTML file, given to To-handoff as input. It is read, never edited, and its code is never handed to developers.
_Avoid_: Mockup, vibe code, POC, prototype Contract (that is a Contract approved only for a trial build)

**Usage**:
One element of a feature's input, as the Handoff records it: a Contract with a tuple of its axis values, a Component Proposal, or a raw element with a reason. It always records how it was recognised.
_Avoid_: Instance (that is the Figma node), component reference, match

**Stand-in**:
Anything in a Prototype that fakes what the real feature will do, such as mock data, a stub API, fake latency or placeholder copy. The Handoff records what it pretends to do, never how.
_Avoid_: Mock (when more than data is meant), fake, throwaway code

**Rendering**:
One output format's layout of a Handoff, such as HTML, Markdown, a Figma frame or a Confluence page. It never adds or drops a Handoff's content.
_Avoid_: Export, view, handoff document

## Building

**Orphan**:
A token or variant To-design built that the Foundations document or the Contract's selection no longer holds. The ledger keeps tracking it by id and Figma keeps the node, so a token or variant that comes back reuses it; it is deleted only through a Prune list.
_Avoid_: Extra (that is a node the ledger never recorded), deprecated variant, stale node

**Prune list**:
The Orphans the owner confirmed, by name, for To-design to delete; for variants, each with the instance count the owner was shown. A prune refuses any name whose count has changed since.
_Avoid_: prune.json (that is the file, not the concept), delete list, cleanup

## Skills

**To-preview**:
The skill that shows a Contract's combinations, rendered with the real Code Library, so the owner can leave out the ones they don't want. It never approves anything.
_Avoid_: component-sheet-html, component sheet, HTML catalog skill

**To-design**:
The skill that builds a Design Library in Figma from Contracts, where the owner approves each Base Component before its Component Set is built.
_Avoid_: code-to-canvas

**To-handoff**:
The skill that turns one feature, given as prototype code, a Figma URL, an artifact URL or a description, into a Handoff for developers written against a Design System's Contracts and Component Proposals.
_Avoid_: design-handoff, handoff doc skill, spec generator
