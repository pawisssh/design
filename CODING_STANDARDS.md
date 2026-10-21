# Coding standards

The judgement calls `/code-review` checks a diff against. Anything a test or a script can check belongs in a test or a script, not here.

## Comments

**A behaviour's comment sits beside the code that does it.** Put the comment on the function or block that implements the behaviour, citing its issue (`// in (#193): …`). A module's header comment stays a short summary of what the module is for. When a change adds a behaviour, add the comment beside it and leave the header as it is.

## Shared helpers

**Each shared helper lives in one place.** When a script or test needs something another file in the same skill already does (a repo path, reading JSON, a hash, the text that names a Usage), import that helper, or move it somewhere both files can import it from. Don't write a second copy. Two copies of the same few lines drift apart the next time only one of them is changed. CI's `.github/duplicates.mjs` already fails a pull request that adds a copy of 8 or more lines under `skills/`; review catches the shorter ones and a copy reworded just enough to slip past it.
