# Coding standards

The judgement calls `/code-review` checks a diff against. Anything a test or a script can check belongs in a test or a script, not here.

## Comments

**A behaviour's comment sits beside the code that does it.** Put the comment on the function or block that implements the behaviour, citing its issue when there is one (`// in (#193): …`); without one, name its source instead (`// live check, 2026-10-20: …`). A module's header comment stays a short summary of what the module is for. When a change adds a behaviour, add the comment beside it and leave the header as it is.

## Shared helpers

**Each shared helper lives in one place.** When a script or test needs something another file in the same skill already does (a repo path, reading JSON, a hash, the text that names a Usage), import that helper, or move it somewhere both files can import it from. Don't write a second copy. Two copies of the same few lines drift apart the next time only one of them is changed. CI's `.github/duplicates.mjs` already fails a pull request that adds a copy of 8 or more lines under `skills/`; review catches the shorter ones and a copy reworded just enough to slip past it.

## Tests

**A test that reads a committed Contract sets up the selection it needs.** A committed Contract moves from draft to approved when its owner approves it. A test whose case needs a draft or an approval makes one with `asDraft` or `approve`, and takes the rest of the Contract as it is. In #389, two fingerprints tests assumed the committed CDS Button was a draft, and they failed once it was approved.

## Domain docs

**A diff to `GLOSSARY.md` or `docs/adr/` follows the `domain-modeling` skill's `GLOSSARY-FORMAT.md` and `ADR-FORMAT.md`.**
