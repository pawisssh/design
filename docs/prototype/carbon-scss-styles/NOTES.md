# Prototype: a Carbon + SCSS Prototype's component styles (#312)

Throwaway. Never merged. It answers [#312](https://github.com/pawisssh/design/issues/312), on map [#310](https://github.com/pawisssh/design/issues/310): should the Adapter read a Carbon + SCSS Prototype's component styles from its compiled Sass rules, or from computed styles?

It reads `DrilldownItem` (`src/App.jsx:49`), the code behind reference set 706:7182, in two ways and compares them per state, element and property.

## Running it

Run it on a scratch copy of health-check-management-main. Never run it on the owner's original.

```
node skills/to-handoff/scripts/deps.mjs
rsync -a --exclude node_modules --exclude dist /Users/kane/Projects/kane/design/.kane/projects/health-check-management-main/ .scratch/carbon-scss-styles/app/
npm ci --prefix .scratch/carbon-scss-styles/app
mkdir -p .scratch/carbon-scss-styles/fa && npm pack @fortawesome/fontawesome-free@6.7.2 --pack-destination .scratch/carbon-scss-styles/fa && tar -xzf .scratch/carbon-scss-styles/fa/fortawesome-fontawesome-free-6.7.2.tgz -C .scratch/carbon-scss-styles/fa
node docs/prototype/carbon-scss-styles/setup.mjs .scratch/carbon-scss-styles/app
node docs/prototype/carbon-scss-styles/static.mjs .scratch/carbon-scss-styles/app .scratch/carbon-scss-styles/fa/package
node docs/prototype/carbon-scss-styles/runtime.mjs .scratch/carbon-scss-styles/app
node docs/prototype/carbon-scss-styles/compare.mjs
```

The scripts:

- **`setup.mjs`** is a state harness for the copy. It exports `DrilldownItem` from the copy's `App.jsx` and adds `src/__proto/States.jsx`, which renders one row per state at the reference width (288) inside the drilldown's own wrappers. It also adds `proto.html` and `proto.vite.config.js`, which has the app's own plugins.
- **`static.mjs`** is the static way:
  - It compiles every `.scss` the JS imports, in bundle order, with the app's own `sass-embedded`, Carbon's `@use` and source maps.
  - It adds Font Awesome's `css/all.css` from the npm tarball, the same 6.7.2 the cdnjs link loads.
  - It server-renders the harness with Vite's `ssrLoadModule` and `renderToStaticMarkup`, which needs no browser and no build.
  - It cascades the compiled rules onto that markup.
  - It reads the `className` ternaries in `App.jsx:41-74` through TypeScript.
- **`runtime.mjs`** is the runtime way, as To-handoff's runtime reader works (ADR 0015):
  - It copies the app and tags every `.jsx` with `tagJsx`.
  - It runs `npm ci --ignore-scripts`, `vite build` and `vite preview`, and opens the page in system Chrome.
  - It reads `getComputedStyle` for the same properties, and hovers each row and memo button.
  - It probes the CSSOM.
- **`compare.mjs`** joins the two outputs and writes `out/report.md`.

The outputs are `out/static.json`, `out/runtime.json`, `out/report.md` and `out/runtime.png`, which shows the four rows as rendered.

## Answer key

The answer key is what `App.scss` and `App.jsx` say each state should show. It was written up after the runs, read straight from the source lines it cites.

| Element | Expected | Source |
|---|---|---|
| Row | padding 16px; border-bottom 1px solid `#f4f4f4`; flex; hover background `#f9f9f9` | `App.scss:989-1000` |
| Name | 1rem/600, `#000000` | `App.scss:1008-1012` |
| Meta | gap 0.5rem | `App.scss:1014-1018` |
| Type tag | 0.75rem, `#888888` on `#f0f0f0`; padding 0.125rem 0.375rem; radius 2px | `App.scss:1020-1026` |
| Icons | gap 16px; padding-right 8px; each `<i>` 18px, 20 wide | `App.scss:24-38`, `:958-963`, `:1028-1032` |
| Memo button (Carbon `OverflowMenu`) | transparent, no border, padding 0, 24×24; stays transparent on hover | `App.scss:966-987` |
| Memo icon | `phc-icon--black` (`var(--phc-text-primary)`) when `isReady \|\| isActive`, else `phc-icon--gray` (`#8d8d8d`) | `App.jsx:44`, `App.scss:1039-1045` |
| Clock icon | `phc-icon--red` (`#da1e28`) when `isOverdue`, else gray | `App.jsx:70`, `App.scss:1035-1041` |

The harness renders four states, named by the 706:7182 Status each one stands for:

| State | isReady | isActive | isOverdue |
|---|---|---|---|
| None | false | false | false |
| In Progress | false | true | false |
| Ready to Report | true | false | false |
| Overdue | true | false | true |

New has no spinner in the code, and its nearest props are In Progress's. The Status `--` and the Type axis (Pending or Permanent) have no Prototype code, so neither is scored. #311 lists those gaps.

## Results

`out/report.md` holds the full tables. Both ways read the same 17 elements in each of the 4 states, 25 properties each: 1,700 reads in all.

### Static: compiled Sass rules matched to server-rendered markup

**Accuracy against the computed values.** The computed values are the ground truth for resolved values. On css.mjs as it is, 156 reads differed. After implementing the general CSS rules below, none did. That 0 is in-sample: the engine was fixed against this same runtime output, on this one component.

| Verdict | css.mjs as it is | After the fixes | Meaning |
|---|---|---|---|
| Agree | 444 | 628 | Static's resolved value equals the computed one. |
| Initial | 920 | 908 | Nothing is declared, and the computed value is the initial one. |
| Layout | 180 | 164 | The layout decides the size, so static has no value. |
| Differ | 156 | 0 | |

**The 156 differences** were each a missing CSS rule in To-handoff's toy cascade, not a limit of the approach. Each was closed by implementing the general rule, never by patching a value:

- **Shorthands.** css.mjs expands `border` but drops its style, and `border: none` lost its style and colour. The fix reads each declaration's raw text again and expands it with a full reset.
- **Logical properties.** Carbon sizes the overflow-menu icon with `block-size` and `inline-size` (`_overflow-menu.scss:101-105`).
- **`font-size: 100%`, `em`, and the unitless line-height** that depends on them.
- **Blockification.** A flex item's `inline-block` `<i>` becomes `block`, and Carbon's `position: absolute` popover is blockified too.
- **Comparison artifacts.** A `<span>`'s user-agent display is `inline`, and Chrome serialises `BlinkMacSystemFont` as `"system-ui"`.

**What is still guessed.** css.mjs reads `:not()`, `:where()`, `:is()` and `:has()` as bare pseudo names, and it never matches sibling combinators. Five Carbon popover and tag rules on these elements use them. None changed a read value here, but a real reader needs a real selector engine.

**Provenance.** Every declaration keeps its authored value and its source line:
- **Raw hex.** The row's border-bottom colour is `#f4f4f4` from `src/App.scss:994`.
- **The phc variable.** The memo icon is `var(--phc-text-primary)` from `src/App.scss:1044`.
- **Carbon tokens.** The memo button's colour is `var(--cds-link-primary, #0f62fe)` from `@carbon/styles/scss/components/button/_mixins.scss:124`.

The `phc-*` rules use no Carbon token. Their colours are raw hex, plus one `--phc-*` variable.

**Carbon defaults against phc overrides.** Static shows which rule won:
- `App.scss:967-974` beats Carbon's small button size, so the button is 24×24.
- Carbon's `.cds--overflow-menu__icon { block-size: 1rem }` beats the phc icon rule. The memo `<i>` therefore renders 20×16, while the clock and chat `<i>` render 20×18.
- In the base state, the phc `background: transparent` rule (`App.scss:968`) beats Carbon's ghost background.

**Axes.** Only static finds where an axis meets a class, through the `className` ternaries:
- `src/App.jsx:44`: `(isReady || isActive) ? 'phc-icon--black' : 'phc-icon--gray'`
- `src/App.jsx:70`: `isOverdue ? 'phc-icon--red' : 'phc-icon--gray'`

**Hover.** Static gets the row's `#f9f9f9` (`App.scss:999`) and the memo button's `var(--cds-link-primary-hover, #0043ce)` (`_button.scss:216`) without running anything. The phc `:hover` reset beats Carbon's `.cds--overflow-menu:hover` background, as in the browser.

**Nested Carbon components.** Server-rendering runs Carbon's own `OverflowMenu`. The markup therefore holds its wrapper, popover, tooltip and button, and every Carbon rule carries an `@carbon/...` source. This splits the instance's own Carbon styling from the phc overrides the parent puts on it, which is what ADR 0012's `family:<key>` nodes need. The SSR needed `ssr.noExternal: [/^@carbon\//]`: with `@carbon/react` external, its CommonJS interop gave `{default: forwardRef}` and rendering threw.

**Font Awesome `<i>`.** The markup's class list gives the icon's name and style (`fa-regular fa-file-lines`). The npm tarball's CSS gives the font family and weight, with no network. `App.scss` gives the 18px size and the 20 width.

**Carbon's theme.** The g10 tokens are declared only under `.cds--white`, `.cds--g10`, `.cds--g90` and `.cds--g100`, never on `:root`, and the app applies none of those classes. Every `var(--cds-…, fallback)` therefore renders its compiled g10 fallback. Static keeps the token name in each case, which nothing else does.

**Cost.** Like the runtime, it needs the app's `node_modules`, so both start with an `npm ci` of about 2 s (warm cache). After that:
- About 1.1–1.2 s: compile about 330–380 ms (1.2 s cold), SSR about 0.7–0.8 s, cascade about 40 ms.
- No browser and no network.
- 957 KB of compiled CSS in 5 sheets, 9,831 rules.
- Byte-identical on a rerun.

### Runtime: computed styles of the built and rendered copy

**Values.** Computed styles give the resolved value of every property, which is the ground truth here.

**Layout sizes.** Only the runtime has the 164 layout reads, among them the row's 288×69. The reference row is 64 high.

**Provenance is lost.** The computed values are resolved: `rgb(141, 141, 141)`, with no `var()`, no source and no Carbon-or-phc split.

**Matching by value is wrong.** Matched against the g10 tokens by value, each raw phc colour claims several Carbon tokens it never used:

| Raw hex | g10 tokens with the same value |
|---|---|
| `#8d8d8d` | 7, among them `border-strong-01` |
| `#f4f4f4` | 8, among them `background` and `layer-02` |
| `#da1e28` | 6, among them `support-error` |

Carbon's own `#0f62fe` equals 22 tokens.

**Axes.** It never sees the ternary. Its fibre walk does read `memoizedProps`, so diffing `isReady`, `isActive` and `isOverdue` against each `<i>`'s class list across the rendered states could infer which prop toggles which class. That holds only for the states the harness renders, and it gives the outcome, not the rule.

**Hover.** Hovering takes 2.7–3.6 s. It also catches incidental state: hovering the memo button opens Carbon's "Options" tooltip.

**Joins.** Every phc element joins `own` to an `App.jsx` line. Carbon's internal wrappers join through the fibre walk to `App.jsx:59:9`, the `OverflowMenu` site.

**Fonts.** Carbon's `@font-face` uses webpack-style `url(~@ibm/plex/...)`. In the harness's `vite build` and `vite preview`, the built CSS keeps those URLs unresolved, so the two font requests fail (`ERR_ABORTED`) and the text renders in a fallback font. The owner's own `vite` dev server was not checked. Any text metric or size the runtime measures comes from that fallback, not from IBM Plex Sans, while static gives the authored `'IBM Plex Sans'`.

**The CSSOM** gives the authored rules, with `var()` kept. `out/runtime.json` keeps only their selectors and whether `var()` survived, as #322 did; `out/static.json` holds the authored values. For example, `.phc-icon--black` gives `var(--phc-text-primary)`. It has no source line and no Sass origin, so a Carbon rule and a phc rule differ only by selector. `:root` holds 8 colour custom properties, and the Carbon theme tokens are not among them.

**Cost.** After the same `npm ci` of about 2 s:
- About 2.8–3.7 s for one read: build about 1.5–2.3 s, preview about 0.3 s, Chrome launch about 0.2–0.5 s, load about 0.7 s.
- About 2.7–3.6 s more for the hover pass, which static does not need.
- Chrome, playwright-core, and the cdnjs network.
- 823 KB of built CSS, with `var(--cds-` 3,106 times.
- Deterministic apart from the order of network events: two reruns differed only in that order.

### #322's two claims, checked here

- **"Authored classes and rules carry the names."** This holds. Each part's class names it: `phc-drilldown-item-name`, `-tag` and `-icons`. The state axis is carried by modifier classes, `phc-icon--gray`, `--black` and `--red`, and the ternaries choose them.
- **"The CSSOM throws `SecurityError` on cross-origin sheets."** This does not hold here. The cdnjs Font Awesome sheet is cross-origin, but it loads with `crossorigin="anonymous"` and cdnjs sends CORS headers, so all 1,971 of its rules are readable. `SecurityError` comes from a cross-origin sheet loaded without `crossorigin`, or without CORS, not from cross-origin alone.

## Verdict

**The Adapter reads a Carbon + SCSS Prototype's component styles from its compiled Sass rules, with source maps, matched to the component's server-rendered markup in each variant.** Computed styles stay with the runtime reader, as ADR 0015 has it: they check resolved values, and they supply the sizes the layout decides.

The reasons:

1. **Provenance.** Static keeps `var(--cds-…)` apart from raw hex, and a Carbon default apart from a phc override, each with a source line. Those lines are the code anchor, and they show what an edit to `App.scss` would redraft. Computed values lose all three. Matching them by value maps a raw `#8d8d8d` to seven Carbon tokens it never used.
2. **Axes.** The `className` ternaries are where a Property Axis meets a class. Only the static way reads them. The runtime could infer the same links only for the states it renders.
3. **State and cost.** Static gets hover rules without running, in about 1 s after `npm ci`, with no browser and no network, and it is byte-identical on a rerun. The runtime takes about 3 s more for one read, and 3 s more again to hover. It needs a browser and the network, and here it measured text in a fallback font.

**The rejected alternative is computed styles as the source.** They are right about resolved values and sizes, but on their own they can't say where a value came from, which axis chose it, or whether it is a Carbon token.

**What static needs that the prototype faked.** css.mjs is a toy cascade. Every gap found here was a missing CSS rule, and the prototype closed each one, but only on this sample. The Adapter needs a real selector engine and full shorthand and logical-property handling, not this prototype's.

**For #323.** The deciding signal is again the authored rules, as in #322. Here they are read from the compiled Sass, where the source map gives a source line. The browser's CSSOM gives the same rules, with `var()` kept and every sheet readable, but with no source line.

**Assumptions:**

1. **The element tree comes from server-rendering each variant in Node** (Vite `ssrLoadModule` and `renderToStaticMarkup`, with Carbon kept internal). A component that needs browser APIs to render would need the browser's DOM instead. The rule-reading side stays the same, so this is the more reversible choice.
2. **Raw hex stays raw.** The reader keeps `#8d8d8d` as written and never matches it to a Carbon token by value. Whether Foundations carry the phc palette as Off-system values, Synthesized tokens or a palette collection stays #310's Foundations fog. A by-value map can be added later on top of kept provenance, but lost provenance can't be recovered.
3. **Which cascade engine the Adapter uses** is left to the build. This prototype only shows that the engine must implement the CSS rules listed above.
