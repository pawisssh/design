# Design System Skills

Agent skills that turn a component library written in code into a matching component library in Figma, and keep the two in sync.

## Libraries

**Code Library**:
A component library written in code that serves as the source, such as Carbon React or shadcn/ui.
_Avoid_: Code component library, framework, source library

**Design Library**:
A Figma library file produced from a Code Library.
_Avoid_: Figma library, design kit

**Design System**:
The set of one or more Design Libraries planned together, plus the theme they share.
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
The translation from one specific Code Library into the Contract.
_Avoid_: Source adapter, connector, parser

**Foundations document**:
The generated description of a Design System's shared tokens and themes, which every Contract in that Design System refers to. One per Design System.
_Avoid_: Tokens file, theme file, variables JSON

## Skills

**To-preview**:
The skill that shows a Contract's combinations, rendered with the real Code Library, so the owner can leave out the ones they don't want. It never approves anything.
_Avoid_: component-sheet-html, component sheet, HTML catalog skill

**To-design**:
The skill that builds a Design Library in Figma from Contracts, where the owner approves each Base Component before its Component Set is built.
_Avoid_: code-to-canvas
