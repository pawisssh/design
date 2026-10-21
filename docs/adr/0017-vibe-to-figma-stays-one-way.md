# Vibe-to-Figma stays one-way: only Figma-to-Vibe writes the Prototype

Vibe-to-Figma only ever carries code to Figma. A Figma edit stays in Figma as a Held variant, or as an edit to a variant whose code did not change, which is never read. Carrying Figma edits back into the Prototype's code is a separate skill, Figma-to-Vibe. It is the only skill that writes a Prototype, and it runs only when the owner asks. For every other skill, Vibe-to-Figma and To-handoff included, the Prototype stays read-only, as ADR 0007 has it. This is phase 2 of [#175](https://github.com/pawisssh/design/issues/175). The owner chose it when phase 2 was grilled on 2026-10-21, over pulling the edits inside Vibe-to-Figma: "ยังไม่ต้องแก้ที่โค้ด จนกว่าจะใช้ skill design-to-vibe or something ที่จะส่งค่ากลับไปที่ user vibe" ("don't touch the code until a skill, design-to-vibe or something, sends the values back to the owner's vibe project").

## Considered Options

- **Vibe-to-Figma edits the Prototype's component files itself**, for example as a third way to resolve a Held variant: rejected. A build would then also write code, and every rerun could change the owner's project.
- **Write the Figma edit into the Contract**, as To-design's base loop does before a Contract is approved: rejected. The approved Contract would no longer match the code it is read from (ADR 0005). A redraft also carries only the Drafted values (the Generic Adapter) and the owner's omits (Vibe-to-Figma's folder step), so the edit would be lost at the next code change.
- **A patch file the owner applies, from Vibe-to-Figma**: rejected for Vibe-to-Figma, which then still writes code, if only as a file. Whether Figma-to-Vibe writes the code in place or as a patch is for its spec.

## Consequences

- Vibe-to-Figma keeps its Held variants, `--take-code` and `--keep-figma` as they are. It records nothing more about Figma edits: Figma-to-Vibe reads Figma afresh when it runs, since a Held variant's record lists only the fields that differ, not their values.
- Figma-to-Vibe's scope:
  - **Component Families.** It reads every variant of the Component Families the owner names, not only the Held variants.
  - **Foundations.** Edits to Figma variables' values are left for later.
  - **Merging.** It merges both sides only where they changed different fields of a variant. Where both changed the same field, it asks the owner.
- The code Figma-to-Vibe writes reaches Figma by the usual path: Vibe-to-Figma drafts the Contracts again, then the owner reviews and approves, and the build runs. A Contract is still read only from code (ADR 0005).
- Vibe-to-Figma's Edit check reads a variant back only against the Contract it was built from. Once Figma-to-Vibe writes a Held variant's Figma version into the code, that variant matches the new Contract but not its old one. The Edit check must also accept a match with the new Contract, or the variant stays held after both sides agree. This is for Figma-to-Vibe's spec to settle.
