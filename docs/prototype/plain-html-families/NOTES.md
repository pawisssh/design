# Prototype: a plain HTML Prototype's Component Families (#322)

Throwaway. Never merged. It answers [#322](https://github.com/pawisssh/design/issues/322): are a plain HTML Prototype's
Component Families and Property Axes found from its markup and CSS rules, or from the rendered page?

Run it on a scratch copy of health-check-main (never the owner's original):

```
node skills/to-handoff/scripts/deps.mjs
rsync -a --exclude node_modules /Users/kane/Projects/kane/design/.kane/projects/health-check-main/ .scratch/plain-html-families/health-check-main/
node docs/prototype/plain-html-families/run.mjs .scratch/plain-html-families/health-check-main/banner-app.html
```

It writes `out/static.json`, `out/rendered.json`, `out/report.md` and `out/rendered.png`.

## Answer key: what a person would draw

Written before either reader ran, the way #249 wrote "about 8 families are expected".

**Families (2, or 3 if Icon Button splits from Button):**

1. **Button.** Three sites:
   - `add-button`: icon only, secondary, a 36×36 circle;
   - `send-button`: icon only, primary, a 56×36 pill;
   - `cta-button`: a label with a trailing icon, secondary, 36 high, 8px radius.

   Axes:
   - Kind: `primary | secondary`;
   - Content: `icon only | label + icon`;
   - State: `default | hover | pressed`.

   The stylesheet's own tokens point to one family with these axes: `--button-primary`/`--button-secondary`, `--button-pill-*`/`--button-rect-*`, `--button-min-height`. A person could also split it into Icon Button (add, send) and Button (cta), and either answer counts.
2. **Chat input card** (`chat-card`). A compound family:
   - an AI-icon header;
   - an input row of typed text with a blinking cursor;
   - an action row with two Button slots, left and right.

   It has one variant as drawn: the typing state, with one of the six strings and the cursor.

**Not families:**

- `title`, `intro` and `typed-text` are text in Text Styles: `title-03`, `footnote-01` and `body-01`.
- `container`, `header`, `body`, `input-area`, `action`, `action-left`, `action-right`, `info-section` and `cta-section` are layout. They become auto-layout frames.
- `cursor` is a part of the chat card: a 10×20 rectangle in `--icon-highlight`.
- **Icons:**
  - Font Awesome Sharp Solid `plus`, `arrow-up` and `chevron-right`;
  - the AI logo `assets/ai-icon.svg`.

  They become icons by the map's icon rule, not families.
- **Copy:** the six Typed.js strings are the card's text. A drawing shows one.
- `assets/chevron-right.svg` is never used.

## Results

`out/report.md` holds the measured table. `out/rendered.png` is the page as the runtime reader saw it. `out/rendered-fa-free.png` is the same page with the Font Awesome stylesheets redirected to the Free CDN, run as an experiment.

**Static way** (`static.mjs`). It reuses To-handoff's `readHtml`, `parseCss` and cascade. It adds:
- linked local stylesheets;
- state rules;
- grouping;
- a text scan of the scripts.

What it found:
- **Groups:** naive grouping gives 22 groups, one per class list. With the candidate rule (interactive, own paint, or own state rules), 5 candidates remain.
- **Families:** `chat-card`, `add-button`, `send-button` and `cta-button`.
- **Parts and slots:** `cursor` is a part of `chat-card`, and `chat-card` has the slots `add-button` and `send-button`.
- **Merge proposals:**
  - `add-button` + `send-button`, with Jaccard 1 over own declarations, differing in width, background, radius and colour;
  - `cta-button` with each of them, at 0.43. With `add-button` it shares the paint token `--button-secondary` and the hover paint.
- **Axis names from the stylesheet's own tokens:**
  - `--button-primary` / `--button-secondary`;
  - `--button-pill-radius` / `--button-rect-radius`.
- **States:** hover and pressed, from `:hover` and `:active` rules, on all three buttons, without running anything.
- **Icons:** by name and style: `plus`, `arrow-up`, `chevron-right` (sharp solid).
- **Image icon:** `assets/ai-icon.svg`. It also reports `assets/chevron-right.svg` as unused.
- **Script:**
  - all six Typed.js strings;
  - the touch handler's inline `transform`;
  - no classes toggled at all.
- **Text:** `title` → `title-03` and `intro` → `footnote-01`, from their `var()` names. `typed-text` is text written by the script.
- **Media rules:** both breakpoints, and the DPR-2 `border-width: 2px`.
- **Cost:** 2–100 ms, no network, parse5 only, 7 KB of output, and byte-identical on every rerun.

**Rendered way** (`rendered.mjs`). It groups by computed style and structure. Class names are shown as labels only and are never used to group.

What it found:
- **Naive grouping:** 21 signatures. The one repeated signature is `.header` + `.body`, two layout divs, so it is a false family.
- **Similarity over every element:** 9 groups.
  - The 10 layout divs form one group.
  - `typed-text` + `cursor` form another.
  - The three icons form a third, only because each one is 0×0.
- **With a candidate rule** (painted or pointer): the same 5 candidates, in 4 groups. `add` and `send` group together; `cursor` stands alone because there is no nesting rule.
- **No names and no token names.** Kind is `rgb(1, 23, 43)` against `rgba(1, 23, 43, 0.1)`.
- **States:** hover and pressed values, by hovering and pressing each pointer element. That takes 2 s, with a 250 ms wait for the 0.15 s transition.
- **Icons:**
  - The Pro CDN (`site-assets.fontawesome.com`) answers **403** to both stylesheets, so all three `<i>` are 0×0 and the buttons are blank.
  - Redirected to the Free CDN, the icons render as Free *classic* solid glyphs, not Sharp. Free 6.5.1's CSS names `.fa-sharp` only in its base display rule and has no Sharp font, so `.fa-solid`'s "Font Awesome 6 Free" wins. Either way the reader sees private-use code points (`"\f062"`), not names.
- **Typed text:** a moving target. Five samples over 5 s saw `""`, one complete string and the start of a second, so four of the six strings never appeared. Sample 2 differs between runs, `คุยกับ C` in one and `คุยกับ Ch` in the next, so a rerun of the rendered way is not byte-identical.
- **Fonts:** no `@font-face`. The text renders in Finnomena Trek only because it is installed on this Mac.
- **What it never sees:** the touch handler, and the DPR-2 border unless a second context runs at DPR 2.
- **Cost:**
  - 8.5–12 s;
  - a Chrome and playwright-core;
  - third-party network: unpkg, and the Font Awesome CDN, which refuses;
  - 27 KB of output;
  - reruns differ. Over four invocations of `run.mjs`, one pair of rendered runs differed in 15 paths (the typed text and the network order). The other three differed in network order alone.
- **Browser CSSOM:** the browser can give each element its matched authored rules, with `var()` and the state selectors kept. That works only for same-origin sheets: the Font Awesome sheets throw `SecurityError`. This is the static read done in the browser, not a computed one.

## Verdict

**Families and axes come from the markup and CSS rules.** The static way, grouped by authored class, is the source. Values and screenshots stay with To-handoff's runtime reader, as ADR 0015 has them. On this Prototype the rendered way found no family, axis or state that the static way missed, and it missed names, token-named axes, icons, four of the six strings and slots. Without a candidate rule it gives the 21 or 9 groups that #249's "29 groups" warned of. With one, it finds the same 5 candidates as the static way, but nameless.

Every family here appears once, so "group the repeated elements" finds nothing. A plain HTML author's class name is their component name, and the class's rules are its definition.

**Against the answer key:**
- **Static.** It gives `chat-card`, with the slots `add-button` and `send-button` and the part `cursor`. It gives the three buttons with merge proposals. One batch of agent judgement turns that into the key's Button, either one family or Icon Button + Button, and Chat input card. It names every icon and the AI image, and it gives all six strings as copy.
- **Rendered.** It gives 4 groups with no names, and `cursor` is a group of its own. There are no icons and one frame of text.

**What this page never tested in the static way:**
- modifier classes, such as `.button--primary`;
- classes a script toggles;
- repeated elements;
- markup a script builds.

Here every axis came from token names and pseudo-class rules.

**The deciding signal is the authored classes and rules, not where they are read.** The browser's CSSOM gives the same selectors, `var()` names and state rules for same-origin sheets. A browser-based reader that reads the CSSOM and the live DOM's `class` attributes would find the same families, at the browser's cost. It also throws `SecurityError` on cross-origin sheets. What this prototype rejects is grouping by computed style and structure.

**Assumption (scope):** this holds for plain HTML styled by authored CSS classes, in a `<style>` block or a linked local stylesheet. #319 has Claude's default as one page with inline CSS, from Claude's docs, with no sample. A page styled by Tailwind's CDN script, or by `style=""` attributes alone, has no authored class to group by, and it is untested here.

**Assumption (anchor):** the Contract anchors to an Extracted Library, as in ADR 0016. The library holds one generated component per family, generated from the family's CSS rules and nothing else, and the Family map identifies each site by its place in the markup. A Contract never anchors to `styles.css` selectors: that needs a new `code` shape, and one edit to the one stylesheet would void every approval, which ADR 0016 rejected. The library is generated, so its form can change by regenerating.

**Open:** what that generated file is. ADR 0016's file is a React + cva component, read with the project's own Tailwind, and this project has neither React nor Tailwind.
