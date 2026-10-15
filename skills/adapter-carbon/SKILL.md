---
name: adapter-carbon
description: Carbon React Adapter, from Carbon source at a pinned commit to a draft Contract and the Carbon foundations document. Use when creating or refreshing a Carbon Contract or the Carbon foundations document.
---

# Carbon Adapter

The Adapter for the Carbon React Code Library. There is one Adapter skill per Code Library, so adding another Code Library adds a sibling skill and leaves `to-preview` and `to-design` untouched. What a Contract and a foundations document must contain is defined in the shared [`contract`](../contract/SKILL.md) skill; this skill only knows how to read Carbon.

## Outputs

- A draft Contract per Component Family, read from Carbon source at the pinned tag and commit.
- The Carbon foundations document, generated from the pinned Carbon token sources plus the union of all Contracts' token references. It is never edited by hand.
- The Carbon React preview renderer that `to-preview` uses to render specimens.

The committed outputs for the pilot (Carbon `v11.118.0`, commit `44f90d8`) are in [`design-systems/carbon/`](../../design-systems/carbon/). The Button Contract there was written by an agent and is the reference output.

## Coming next

The foundations step `scripts/derive_foundations.py` lands in #28, the preview renderer in #33, and the agent guide from Carbon source to a draft Contract in #34.
