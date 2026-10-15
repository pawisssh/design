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
The first variant of a Component Family that is built in Figma and approved by the user before the other variants are derived from it.
_Avoid_: Master, template, first variant

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
