# Reference Component Sets: what they hold, and which Prototype code drives each axis

Research for [pawisssh/design#311](https://github.com/pawisssh/design/issues/311). Map: [#310](https://github.com/pawisssh/design/issues/310). Vocabulary follows `GLOSSARY.md`. This note reports facts only and makes no design decisions; those belong to the later grilling tickets.

## Sources

- **Figma:** the owner's file `zLHp2lK9hegxnFOGSJ9jFm`, read on 2026-10-22. It was read only, with the Figma MCP tools `get_metadata`, `get_screenshot` and `get_design_context`. Nothing was written to the file.
- **Prototype:** `/Users/kane/Projects/kane/design/.kane/projects/health-check-management-main/src/`, read statically and not run. In this note, `App.jsx:L` means `src/App.jsx` line L. Other Prototype paths are relative to `src/`.

Every Figma fact carries a node ID and one of these evidence tags:

| Tag | Source |
| --- | --- |
| `[meta]` | `get_metadata`: node IDs, layer types, names, positions and sizes |
| `[ctx]` | `get_design_context`: generated code with node IDs, bound variable names with fallback values, the Text Styles list and component descriptions |
| `[shot]` | `get_screenshot`, so visual reading only |

## Summary

| Set | Node | Page | Variants | Axes | Main Prototype code |
| --- | --- | --- | --- | --- | --- |
| HCT Customer Content Lists | `706:7182` | `706:7173` ↳ Tables / HCT Customer Content Lists | 12 | Status (6) × Type (2), plus 4 booleans that follow from Status | `DrilldownItem`, `App.jsx:49-74` (partial match) |
| Health Check Task Lists (task row) | `99:35445` | `99:34046` ↳ Tables / HCT Task Content Lists | 5 | Status (5), plus 4 booleans that follow from Status | `DrilldownItem`, `App.jsx:49-74`; the rows are built at `App.jsx:242-258` |
| Health Check Task Lists (version row) | `100:5853` | `100:5844` ↳ Tables / HCT Portfolio Version Table | 2 | Report, Loading (they never take the same value) | `VersionItem`, `components/PortfolioVersion/PortfolioVersion.jsx:108-135` |
| HCT Customer Detail | `668:51993` | `99:39906` ↳ Pages / HCT Customer Detail | 13 | Status (7) × Mutual Fund × Stock (only some combinations exist) | `PortfolioSummary`, `components/PortfolioSummary/PortfolioSummary.jsx:99-170`, and the column header `App.jsx:146-170` |
| Customer Lists | `112:5001` | `99:30687` ↳ Pages / HCT Customer Lists | 8 | Filter (8) | the drilldown view `App.jsx:185-264`; the entry points are `components/Dashboard/Dashboard.jsx:47-59` |

All page locations were confirmed with `[meta]` on the page.

Key facts:

- **Two different sets share the name "Health Check Task Lists":** `99:35445` (the task row) and `100:5853` (the version row) `[meta]`. Later tickets must refer to them by node ID.
- **The two list-row sets carry one row family's states in Status.** In both `706:7182` and `99:35445`, the booleans Task, Report, Calendar and Overdue are fixed by Status. Only `706:7182` has a free second axis, Type `[meta]`.
- **The reference lists one row per health check; the Prototype lists one row per customer.**
  - In Filter=Ready to Report, Robert Brown appears twice: once with Mutual Fund (`99:39009`) and once with Bond (`99:39010`) `[ctx]`.
  - The Prototype builds one `DrilldownItem` per customer. Its tag comes from `p.healthChecks[0].assetType` (`App.jsx:242-251`).
- **The reference uses Font Awesome Pro icons, and the Prototype uses Free substitutes.** The reference uses memo, memo-circle-check, message-dots, spinner-third and clock, in "Font Awesome 6 Sharp" styles `[ctx]`. The Prototype uses `fa-file-lines`, `fa-comment-dots` and `fa-circle-notch`.
- **Library and variable-collection names are not visible with the three permitted tools.** "Local" and "library" below come from how node IDs resolve (see [Limits](#limits-and-assumptions)).

---

## 1. HCT Customer Content Lists, `706:7182`

### Family, axes and variants

The set is 636×524, and each variant is 288×64 `[meta]`. Its variant names list six axes: Status, Task, Report, Calendar, Overdue and Type.

| Status | Task | Report | Calendar | Overdue | Type=Pending | Type=Permanent |
| --- | --- | --- | --- | --- | --- | --- |
| `--` | False | False | False | False | `809:11892` | `809:11907` |
| None | False | False | False | False | `706:18539` | `706:7183` |
| New | True | False | False | False | `706:18554` | `706:7198` |
| In Progress | True | True | False | False | `706:18569` | `706:7213` |
| Ready to Report | True | True | True | False | `706:18584` | `706:7228` |
| Overdue | True | True | True | True | `706:18599` | `706:7243` |

### Axes that follow from others

- Status fixes Task, Report, Calendar and Overdue: each Status value appears with exactly one boolean combination (table above) `[meta]`.
- `--` and None share the same boolean combination. They differ in layers: the `--` variants have no Report and no Calendar frame at all (`809:11892`) `[meta]`.
- Type is independent of Status: all 6 × 2 combinations exist `[meta]`.
- The only component properties are the variant axes. There are no text, boolean or instance-swap properties on the set `[ctx]`.

### Layer tree: `706:7228` (Status=Ready to Report, Type=Permanent) `[meta]` `[ctx]`

```
706:7228  symbol, auto-layout row, px 8, w 288
└─ Content 706:7229  row, gap 16, min-h 64, border-bottom border/subtle
   ├─ Frame 8 706:7230  column, py 4, fill
   │  ├─ Customer Name 706:7231
   │  │  └─ Frame 10 706:7232
   │  │     └─ text "Robert Brown" 706:7233  (Utility/label, text/primary)
   │  └─ Asset Type 706:7234  row, gap 4
   │     ├─ instance Display Tag 706:7235  (circle-user + "Amelia J.")
   │     └─ instance Customer Status Tag 706:21135  (Status=Permanent)
   ├─ Report 706:7237  min-h 64, py 8
   │  └─ instance memo 706:7238
   ├─ Calendar 706:7239
   │  └─ instance clock 706:7240  (style fa-regular)
   └─ Chat 706:7241
      └─ instance message-dots 706:7242
```

The `--` Pending tree (read through its instance `661:15600`, main `809:11892`) is: Content `809:11893` > Customer Name `809:11895` > text `809:11897`, then Asset Type `809:11898`, which holds Display Tag `809:11899` and Customer Status Tag, then Chat `809:11905`. It has no Report and no Calendar frame `[ctx]`.

### Nested instances

| Instance | Main component | Local or library | Evidence |
| --- | --- | --- | --- |
| Display Tag (advisor) | Display Tag. Its inner IDs `3257:7523` (circle-user) and `3257:7524` (text) return "not found" | library | `[ctx]` `[meta]` |
| Customer Status Tag | `706:21085` Status=Permanent / `706:21086` Status=Pending, set `706:21087` | local, in the page's "Items" section | `[meta]` |
| memo | `99:35358` (description "report") | library | `[ctx]` |
| clock | `99:33698` (Style=fa-regular), and `99:33695` (fa-solid) seen in other variants | library | `[ctx]` |
| message-dots | `99:33766` (fa-regular), set `99:33762` (description "contact, call center, fa") | library | `[ctx]` |
| spinner-third (Status=New only, in place of memo) | `139:10199` (description "loading") | library | `[ctx]` |
| circle-user (inside Display Tag) | `100:3666` (description "menu, profile") | library | `[ctx]` |
| Tooltip (inside Customer Status Tag, hidden in rows) | Tooltip, with caret `706:19002` | library | `[ctx]` |

### Icon colour by Status `[ctx]`

| Status | memo slot | clock | message-dots |
| --- | --- | --- | --- |
| `--` | (no frame) | (no frame) | `#01172b`, raw (not bound) |
| None | memo, `icon/disabled` rgba(1,23,43,0.45) | `icon/information` (grey) | `#01172b`, raw |
| New | **spinner-third**, `icon/highlight` #1817e7 | `icon/information` | `#01172b`, raw |
| In Progress | memo, `icon/primary` #01172b | `icon/information` | `#01172b`, raw |
| Ready to Report | memo, `icon/primary` | the Clock component's fa-regular style, `#01172b` raw (not bound) | `#01172b`, raw |
| Overdue | memo, `icon/primary` | `icon/error` #f73232 | `#01172b`, raw |

### Bound variables and Text Styles `[ctx]`

- **Text Styles:**
  - `Utility/label` (Label 01), `Utility/footnote` (Footnote 01);
  - `fa-sharp fa-solid/small`, `fa-sharp fa-regular/default`;
  - in the tooltip, Body 02 variables.
- **Variables:**
  - `border/subtle`, `text/primary`;
  - `tag/secondary/background`, `tag/secondary/color`, `tag/white/secondary/icon`;
  - `icon/primary`, `icon/disabled`, `icon/information`, `icon/error`, `icon/highlight`;
  - `dynamic/utility/label-01/*`, `dynamic/utility/footnote-01/*`;
  - in the tooltip: `background/inverse`, `text/inverse`, `body/body-02/*`, `transparent/transparent`.

### Text and default text `[ctx]`

| Layer | Default text |
| --- | --- |
| Name | "Robert Brown" in `706:7228`; "Aaron Brown" in the All list instance `661:15600` |
| Advisor Display Tag | "Amelia J." |
| Customer Status Tag | "Matching" when Status=Pending; "Permanent" when Status=Permanent |
| Customer Status Tag colours | Pending: `tag/secondary` #f2f3f4 on #01172b. Permanent: #f2fef8 on #006830. |
| Tooltip | "Customer Status", "Matching: Potential clients in the pairing phase.", "Permanent: Confirmed and dedicated long-term clients." |

The Customer Status Tag has a `visible` boolean property for the Tooltip. It is `false` in the rows.

None of this text is a component property on `706:7182`.

### Axis → Prototype code

| Axis value | Prototype counterpart |
| --- | --- |
| Status=`--` (no Report or Calendar) | **none.** `DrilldownItem` always renders memo, clock and chat (`App.jsx:57-72`). |
| Status=None (grey memo, grey clock) | `DrilldownMemoIcon` gets `phc-icon--gray` when `!isReady && !isActive` (`App.jsx:44`). The clock is `phc-icon--gray` when `!isOverdue` (`App.jsx:70`). |
| Status=New (spinner-third) | **none.** Nearest: `isActive` is true when any `steps[0]` or `steps[1]` is active or loading (`App.jsx:245`), and that gives a black memo (`App.jsx:44`). No spinner. |
| Status=In Progress (dark memo, grey clock) | `isActive` (`App.jsx:245`) gives `phc-icon--black` (`App.jsx:44`); the clock is grey (`App.jsx:70`). |
| Status=Ready to Report (dark memo, dark clock) | `isReady` (any `steps[2]` active, loading or complete, `App.jsx:244`) gives a black memo. The clock stays grey: the Prototype has **no dark-clock state** (`App.jsx:70`). |
| Status=Overdue (red clock) | `isOverdue={p.isOverdue}` (`App.jsx:252`) gives `phc-icon--red` (`App.jsx:70`). Data: `isOverdue` in `data/mockData.js`, e.g. Robert Brown at `mockData.js:177`. |
| Task / Report / Calendar | **no separate props.** They follow Status in Figma. The Prototype derives two booleans, `isReady` and `isActive` (`App.jsx:244-245`). |
| Overdue | `isOverdue` (`App.jsx:49`, `App.jsx:252`) |
| Type=Pending ("Matching") / Type=Permanent | **not in `DrilldownItem`.** The data exists as `tags[].variant` `'matching'` / `'permanent'` (e.g. `mockData.js:147`, `mockData.js:180`). It is rendered only in `PortfolioSummary.jsx:113-120`. |
| Name text | `name={p.name}` (`App.jsx:250`), rendered at `App.jsx:52` |
| Advisor tag "Amelia J." | **none.** No mock field holds an advisor. |

### Reference vs Prototype

- **Second tag:** the reference shows the Customer Status Tag ("Matching" or "Permanent"). The Prototype shows `type` = asset type (`App.jsx:54`, `App.jsx:251`), which matches `99:35445`, not this set.
- **Icons:**
  - Chat is message-dots `#01172b` in the reference; the Prototype has `fa-regular fa-comment-dots`, always grey (`App.jsx:71`).
  - The report icon is memo in the reference; the Prototype has `fa-regular fa-file-lines` (`App.jsx:44`).
- **Sizes and colours:**
  - Reference: 24 px icon frames, gap 16; the name uses Utility/label 15 px in `text/primary`.
  - Prototype: icons 18 px in 20 px boxes (`App.scss:34-38`), gap 1rem (`App.scss:1028-1032`); the name is 1rem/600 `#000000` (`App.scss:1008-1012`).
  - Tag: reference 13 px footnote, h 20, radius 4, `#f2f3f4`/`#01172b`. Prototype 0.75rem, `#888888` on `#f0f0f0`, radius 2px (`App.scss:1020-1026`).
  - Icon colours: Prototype red `#da1e28` vs reference `icon/error` #f73232. Prototype grey `#8d8d8d` vs reference `icon/information` / `icon/disabled` rgba(1,23,43,0.45) (`App.scss:1035-1045`).
- **Overflow menu:** the Prototype wraps the memo in a Carbon `OverflowMenu` with View Report, View Script and Set Password (`App.jsx:59-68`). The reference row has no menu layer.

---

## 2. Health Check Task Lists (task row), `99:35445`

### Family, axes and variants `[meta]`

The set is 328×440, and each variant is 288×64.

| Status | Task | Report | Calendar | Overdue | Node |
| --- | --- | --- | --- | --- | --- |
| None | False | False | False | False | `414:11723` |
| New | True | False | False | False | `99:35444` |
| In Progress | True | True | False | False | `99:35767` |
| Ready to Report | True | True | True | False | `99:35441` |
| Overdue | True | True | True | True | `99:35443` |

### Axes that follow from others

These are the same as in `706:7182`: Status fixes all four booleans. Compared with `706:7182`, there is no Type axis and no `--` value `[meta]`. The generated props are the five variant axes only `[ctx]`.

### Layer tree: `99:35441` (Status=Ready to Report), read through its instance `99:39009` `[ctx]`

```
99:35441  symbol, row, px 8, w 288
└─ Content 99:35336  row, gap 16, min-h 64, border-bottom border/subtle
   ├─ 99:35337  column, py 4
   │  ├─ Customer Name 99:35338 > 99:35339 > text "Robert Brown" 99:35340  (Utility/label, text/primary)
   │  └─ Asset Type 99:35341  row, gap 4
   │     ├─ instance Display Tag 673:54751  (circle-user + "Amelia J.")
   │     └─ instance Display Tag 99:35342   ("Mutual Fund", no icon)
   ├─ Report 99:35345 > instance memo 99:35346  (icon/primary)
   ├─ Calendar 99:35343 > instance Clock (main 99:33698, fa-regular, #01172b raw)
   └─ Chat 99:35347 > instance MessageDots (main 99:33766, #01172b raw)
```

### Nested instances

The nested instances are the same library components as in `706:7182`: Display Tag, memo `99:35358`, Clock `99:33698` / `99:33695`, message-dots `99:33766`, spinner-third `139:10199` and circle-user `100:3666`. The difference is that the second tag is a plain library Display Tag holding the asset type, not the local Customer Status Tag `[ctx]`. The icon colour by Status is the same as in `706:7182` (In Progress `99:35767`: memo `icon/primary`, clock `icon/information`) `[ctx]`.

### Bound variables and Text Styles `[ctx]`

- **Text Styles:** `Utility/label`, `Utility/footnote`, `fa-sharp fa-solid/small`, `fa-sharp fa-regular/default`.
- **Variables:** `border/subtle`, `text/primary`, `tag/secondary/*`, `tag/white/secondary/icon`, `icon/*`, `dynamic/utility/*`.

### Text and default text `[ctx]`

| Layer | Default text |
| --- | --- |
| Name | "Robert Brown" |
| Advisor tag | "Amelia J." |
| Asset-type tag | "Mutual Fund". Instances in Customer Lists override it to "Bond" (`99:39010`) and "Stock" (`99:39012`). |

None of these are component properties.

### Axis → Prototype code

| Axis value | Prototype counterpart |
| --- | --- |
| Status=None | grey memo when `!isReady && !isActive` (`App.jsx:44`), grey clock (`App.jsx:70`) |
| Status=New (spinner-third) | **none.** Nearest: `isActive` (`App.jsx:245`) gives a black memo. |
| Status=In Progress | `isActive` (`App.jsx:245`) gives a black memo; grey clock |
| Status=Ready to Report | `isReady` (`App.jsx:244`) gives a black memo; the clock stays grey (**no dark-clock state**, `App.jsx:70`) |
| Status=Overdue | `isOverdue` gives the red clock (`App.jsx:70`, `App.jsx:252`) |
| Asset-type tag text | `type={primaryHC.assetType \|\| 'Mutual Fund'}`, where `primaryHC = p.healthChecks[0]` (`App.jsx:243`, `App.jsx:251`). Rendered at `App.jsx:54`. Mock values: `'Mutual Fund'`, `'Thai Stock'`, `'Bond'` (e.g. `mockData.js:184`, `194`, `206`). |
| Advisor tag | **none** |

### Reference vs Prototype

- **Granularity:** a reference row stands for one health check. The same customer appears once per asset type (`99:39009` and `99:39010`). The Prototype renders one row per customer and shows only `healthChecks[0]`'s asset type (`App.jsx:242-251`).
- **Status:** the Prototype's row state is derived across *all* of a customer's health checks (`.some(...)`, `App.jsx:244-245`), not from one health check.
- **Asset-type label:** the reference uses "Stock" (`99:39012`); the mock data uses "Thai Stock" (`mockData.js:194`).
- The icon, size and colour differences are the same as in §1.

---

## 3. Health Check Task Lists (version row), `100:5853`

### Family, axes and variants `[meta]`

The set is 328×204, and each variant is 288×72.

| Report | Loading | Node |
| --- | --- | --- |
| False | True | `139:10251` |
| True | False | `100:13843` |

The page also holds a loose instance `331:30217` of this set, outside the sections `[meta]`.

### Axes that follow from others

Loading = not Report. Report=False/Loading=False and True/True do not exist `[meta]`. The props are the two variant axes only `[ctx]`.

### Layer tree: `100:13843` (Report=True, Loading=False) `[meta]` `[ctx]`

```
100:13843  symbol, w 288
└─ Content 100:13844  row, gap 16, border-bottom
   ├─ Title + Detail 100:13847  column, gap 4, min-h 72
   │  ├─ text "Version 1" 100:13848  (Body/body-02, text/primary)
   │  └─ Caption 331:30107  py 2
   │     └─ text "2025-03-29 11:29:19" 100:13849  (Utility/footnote, text/information)
   ├─ Report 100:13855
   │  └─ instance memo-circle-check 100:13856  (icon/primary)
   ├─ instance Separator 100:13854  (1×24, miscellaneous/separator rgba(1,23,43,0.1))
   └─ Chat 100:13852
      └─ instance angle-right 100:13853  (fa-regular, #01172b)
```

In `139:10251` (Loading=True), the memo-circle-check is replaced by an instance of the local **Report Generation Loading** set at Status=25% (`811:17715`). That instance holds a spinner-third plus the text "25%" (Utility/label) `[ctx]`.

### Nested instances

| Instance | Main component | Local or library | Evidence |
| --- | --- | --- | --- |
| memo-circle-check | `99:33731` (description "report") | library | `[ctx]` |
| Separator | `4:12960` | library | `[ctx]` |
| angle-right | `100:2239` (fa-regular) | library | `[ctx]` |
| Report Generation Loading | set `811:14562` on page `811:11795` "Loading". Variants: Status=0% `811:14534`, 25% `811:14561`, 50% `811:14560`, 100% `811:14559` | local | `[meta]` |
| spinner-third (inside Report Generation Loading) | `139:10199` | library | `[ctx]` |

### Bound variables and Text Styles `[ctx]`

- **Text Styles:** `Body/body-02`, `Utility/footnote`, `Utility/label`, `fa-sharp fa-regular/default`.
- **Variables:** `text/primary`, `text/information`, `icon/primary`, `miscellaneous/separator`, `border/subtle`.

### Text and default text `[ctx]`

"Version 1", "2025-03-29 11:29:19", and "25%" (Loading only). None of these are component properties.

### Axis → Prototype code

| Axis value | Prototype counterpart |
| --- | --- |
| Report=True, Loading=False | `hasReport === true` gives the `phc-pv-version-report-icon--active` class (`PortfolioVersion.jsx:116`) and the icon `fa-regular fa-file-lines` (`PortfolioVersion.jsx:13`) |
| Report=False, Loading=True | `hasReport === 'loading'` gives `fa-solid fa-circle-notch fa-spin` (`PortfolioVersion.jsx:10-11`), the `--loading` class (`PortfolioVersion.jsx:116`), and disables View Report and View Script (`PortfolioVersion.jsx:126-127`). It is set by `handleSaveVersion` (`App.jsx:527`) and flipped to `true` after 8 s (`App.jsx:581-602`). |
| (no reference variant) | `hasReport === false`, the default (`PortfolioVersion.jsx:108`). Mock example: Robert Brown, Mutual Fund, Version 1 (`mockData.js:190`). |
| Version text | `version={v.name}` (`PortfolioVersion.jsx:275`), rendered at `PortfolioVersion.jsx:111` |
| Date text | `date={v.date}` (`PortfolioVersion.jsx:276`), rendered at `PortfolioVersion.jsx:112`. Mock format: `'2026-03-29 11:29:00'` (`mockData.js:201`). |
| "25%" progress | **none.** Generation is a single timer with no percentage (`App.jsx:581-602`). |

### Reference vs Prototype

- **States:** the Prototype has three states (`false`, `true`, `'loading'`); the reference has two variants.
- **Icons:**
  - Report: reference memo-circle-check vs Prototype `fa-file-lines`.
  - Loading: reference spinner-third with a percentage vs Prototype `fa-circle-notch fa-spin` in `var(--phc-accent, #1817e7)` (`PortfolioVersion.scss:433-435`).
  - Chevron: reference angle-right **fa-regular** vs Prototype `fa-solid fa-angle-right` (`PortfolioVersion.jsx:132`).
- **Separator:** both are 1×24 in rgba(1,23,43,0.1) (`PortfolioVersion.scss:323-328`).
- **Type:**
  - Name: reference Body/body-02 (15 px) vs Prototype 15px/600, line-height 24px (`PortfolioVersion.scss:266-272`).
  - Date: reference Utility/footnote (footnote-01 size fallback 13 px) vs Prototype 11px (`PortfolioVersion.scss:274-280`).
- **Menu:** the Prototype adds an `OverflowMenu` on the report icon (`PortfolioVersion.jsx:119-129`). The reference has no menu layer.
- **Date text:** the reference has "2025-03-29 11:29:19"; the mock has 2026 dates with `:00` seconds.

---

## 4. HCT Customer Detail, `668:51993`

### Family, axes and variants `[meta]`

The set is 2400×1492. Each variant is 320 wide; heights are 584 to 760.

| Status | Mutual Fund=True, Stock=False | Mutual Fund=True, Stock=True |
| --- | --- | --- |
| Empty (only with Mutual Fund=False, Stock=False) | `668:51992` | — |
| New (Generating) | `100:5012` | `668:53741` |
| New | `668:52210` | `668:53470` |
| In Progress | `668:52331` | `668:53199` |
| Ready to Report | `668:52542` | `668:51994` |
| Done | `668:52753` | `668:54012` |
| Error | `668:52964` | `668:54283` |

The generated props are exactly `status`, `mutualFund` and `stock` `[ctx]` (`668:51992`).

### Axes that follow from others

- Status=Empty ⇔ Mutual Fund=False and Stock=False. Mutual Fund=False and Stock=True does not exist `[meta]`.
- With Stock=False, Status drives the Mutual Fund card; Thai Stock and Bond are simple cards `[shot]`.
- With Stock=True, the Mutual Fund card is always at the Generating state, and Status drives the Thai Stock card `[shot]`.

### Progress Bar per Status, on the driven card `[shot]`

| Status | Bars 1-4 | Highlighted label | Description |
| --- | --- | --- | --- |
| Empty | (no progress card) | — | — |
| New (Generating) | loading, disabled, disabled, disabled | none | "--" |
| New | active, loading, disabled, disabled | New Task | "--" |
| In Progress | active, active, loading, disabled | In Progress | "--" |
| Ready to Report | active, active, active, loading | Ready | "March 29, 2025" |
| Done | 4 green (Success) bars | Done | "March 29, 2025" |
| Error | one full-width red bar | (labels read "New Task" and "Error") | "--" |

- **Progress Bar item nodes** (library):
  - Active `100:3190` (`icon/highlight` #1817e7);
  - Loading `100:3206` (image shimmer, inset 0 14%);
  - Disabled `100:3210` (track only, `border/subtle`);
  - Success `100:3198` (`icon/accent/dark-green` #007436);
  - Error `100:3202` (`icon/error` #f73232).
- **Labels:** the current step's label is `text/primary`; the others are `text/information` `[ctx]`.
- **Thai Stock description:** with Stock=True, the Thai Stock description is "March 29, 2025" in every Status `[shot]`.

### Layer tree: `668:51994` (Ready to Report, Mutual Fund=True, Stock=True) `[meta]` `[ctx]`

```
668:51994  symbol, w 320, radius 26
└─ Content  border-left border/subtle
   ├─ Toolbar  h 64, px end-margins (16)
   │  ├─ Leading > Button 668:51998  (pill 36×36, arrow-left fa-solid)
   │  ├─ Leading > text "Robert Brown"  (Heading/headline-01)
   │  └─ Trailing > Button 668:52002  (ellipsis fa-solid)
   └─ Content Area
      ├─ Header  aspect 1:1, px 16
      │  └─ Content  gap 12, py 12, border-bottom
      │     ├─ Header > Title "Robert Brown"  (Display/display-03, fluid 48/64)
      │     ├─ Tag  row, gap 4
      │     │  ├─ instance Investor Tier Display Tag 756:19434  (Tier=Exclusive)
      │     │  ├─ instance Display Tag 706:21619  ("Amelia J." + circle-user)
      │     │  └─ instance Display Tag 668:52010  ("Permanent")
      │     └─ Frame 38
      │        ├─ instance Button 668:52012  (message-dots fa-regular + "CHAT")
      │        └─ instance Button 668:52013  (icon-only circle-user fa-solid)
      └─ Content Lists  px 16
         └─ Content  gap 4, py 12
            ├─ Mutual Fund Card 668:52016  (layer/layer-03, radius 24, px 12, py 16)
            │  ├─ title, description, angle-right
            │  ├─ instance spinner-third 748:63043
            │  └─ instance Progress Bar 668:52018
            ├─ Thai Stock Card 668:52019
            └─ Baond Card 668:52022  (sic)
               ├─ Title "Bond"
               ├─ instance memo-circle-check 748:63111
               └─ instance AngleRight  (fa-solid, 100:2238)
```

In `668:51992` (Empty), all three cards are named "Baond Card" (`149:4309`, `149:4411`, `149:4417`). Mutual Fund carries spinner-third (`748:62997`); Thai Stock and Bond carry memo-circle-check (`748:63095`, `748:63007`). None of them has a description or a Progress Bar `[ctx]`.

### Nested instances

| Instance | Main component | Local or library | Evidence |
| --- | --- | --- | --- |
| Investor Tier Display Tag | `748:22646` Tier=Exclusive, set `748:22647` on this page's "Items" section. Its 8 variants: Club `801:7438`, Exclusive `748:22646`, Private `748:22645`, Ultra `748:22644`, Exclusive \| Prime `801:7487`, Private \| Plus `801:7524`, Ultra \| EX `801:7598`, Ultra \| Ultra `801:7633` | local; contains library Display Tag `746:5775` with a finnomena-symbol icon | `[meta]` `[ctx]` |
| Display Tag (advisor, Permanent) | Display Tag; inner IDs `3496:3786` / `3496:5003` do not resolve | library | `[ctx]` |
| Button (back, ellipsis, CHAT, profile) | pill Button; ellipsis `99:29961` (description "more, menu") | library | `[ctx]` |
| Progress Bar | library; its child `7057:3644` returns "not found" | library | `[ctx]` |
| spinner-third | `139:10199` | library | `[ctx]` |
| memo-circle-check | `99:33731` | library | `[ctx]` |
| angle-right / AngleRight | `100:2238` (fa-solid) | library | `[ctx]` |

### Bound variables and Text Styles `[ctx]`

- **Text Styles:**
  - `fa-sharp fa-solid/default`, `fa-sharp fa-solid/small`, `fa-sharp fa-regular/default`;
  - `Heading/headline-01`, `Display/display-03`;
  - `Utility/footnote`, `Utility/label`, `Utility/caption-01`;
  - `Body/body-02`.
- **Variables:**
  - `end-margins`, `border/subtle`, `layer/layer-03`;
  - `button/secondary`, `button/spacing`, `button/pill/radius`, `button/pill/horizontal-padding`, `button/pill/vertical-padding`;
  - `text/primary`, `text/secondary`, `text/information`;
  - `tag/primary/background` (#f2f93c), `tag/primary/color` / `tag/primary/icon` (#3d3e0f);
  - `tag/secondary/*`;
  - `icon/primary`, `icon/highlight`, `icon/accent/dark-green`, `icon/error`;
  - `fluid/display/display-03/*`, `dynamic/headline/*`.
- **One variable name, three fallback values:** `tag/secondary/background` falls back to `#d3dfe5` on the advisor tag, `#f2fef8` on the Permanent tag, and `#f2f3f4` in the list rows. `tag/secondary/color` falls back to `#2a3033`, `#006830` and `#01172b` in the same places. Which collections or modes produce this is not visible.

### Text and default text `[ctx]`

| Layer | Default text |
| --- | --- |
| Toolbar title and hero | "Robert Brown" |
| Tags | "Exclusive", "Amelia J.", "Permanent" |
| Button | "CHAT" |
| Card titles | "Mutual Fund", "Thai Stock", "Bond" |
| Descriptions | "--", "March 29, 2025" |
| Step labels | "New Task", "In Progress", "Ready", "Done"; "Error" in the Error state |

None of this text is a component property.

### Axis → Prototype code

| Axis value | Prototype counterpart |
| --- | --- |
| Mutual Fund=True | the Mutual Fund health check has `hasProgress: true`. Found by `healthChecks.find(h => h.assetType === assetName)`, then `if (hc.hasProgress)` (`PortfolioSummary.jsx:138-141`) |
| Stock=True | the same lookup for `'Thai Stock'` (`PortfolioSummary.jsx:138-141`). Robert Brown has both MF and Thai Stock with progress (`mockData.js:183-204`). |
| Mutual Fund=False / Stock=False (simple card) | `hasProgress: false` gives a simple card with title and a `fa-solid fa-plus` button (`PortfolioSummary.jsx:152-164`). `SimpleAssetCard` (title + chevron, `PortfolioSummary.jsx:87-92`) is defined but not used in the render. |
| Status=Empty | every health check has `hasProgress: false`, so three simple cards (`PortfolioSummary.jsx:138-166`) |
| Status=New (Generating) | `steps: ['loading','disabled','disabled','disabled']` (`mockData.js:94`, `187`; set at runtime by `App.jsx:557`). `deriveStepState` returns loading for bar 0 and disabled for the rest (`PortfolioSummary.jsx:20-21`). |
| Status=New | `['active','loading','disabled','disabled']` (`mockData.js:95`; set by `App.jsx:594-596` after 8 s) |
| Status=In Progress | `['complete','active','loading','disabled']` (`mockData.js:96`) |
| Status=Ready to Report | `['complete','complete','active','loading']` (`mockData.js:97`; Robert Brown, Thai Stock, `mockData.js:198`) |
| Status=Done | **ambiguous; not resolved here.** The mock has both "Done" `['complete','complete','complete','active']` (`mockData.js:98`) and "Completed" (all `'complete'`, `mockData.js:99`). The reference Done shows four green bars `[shot]`. |
| Status=Error | **none.** No error step state exists (`PortfolioSummary.jsx:11` lists `'active' \| 'complete' \| 'loading' \| 'disabled'`). |
| Bar state → class | `StepProgressBar` renders `phc-step-bar--${state}` (`PortfolioSummary.jsx:13-16`). Rules: before the current step → `complete`; the current step → `steps[current]`; the next step → `loading` if the current step is `active` (`PortfolioSummary.jsx:32-39`). |
| Highlighted label | `isActiveLabel = isGenerating ? i === 0 : i <= currentIdx` (`PortfolioSummary.jsx:68`) |
| Description | `hc.description`, shown if truthy (`PortfolioSummary.jsx:58`). Mock: `'--'` (`mockData.js:185`), `'March 29, 2026'` (`mockData.js:195`). |
| Card title | `hc.assetType` (`PortfolioSummary.jsx:57`), from the fixed order `['Mutual Fund','Thai Stock','Bond']` (`PortfolioSummary.jsx:138`) |
| Toolbar | the column header, shared by every view (`App.jsx:146-170`): back button when `canGoBack` (`App.jsx:148-158`), title `data?.name` (`App.jsx:109`), ellipsis `OverflowMenu` with Refresh, Add to Column and Close Column (`App.jsx:164-168`) |
| Hero name | `<h1>{customerName}</h1>` (`PortfolioSummary.jsx:100`, `108`) |
| Tags | `customer.tags.map(...)` gives `phc-display-tag--${tag.variant}` (`PortfolioSummary.jsx:113-120`). Robert Brown: Exclusive and Permanent (`mockData.js:178-181`). |
| CHAT / profile buttons | `fa-regular fa-comment-dots` + "CHAT" (`PortfolioSummary.jsx:126-129`); `fa-solid fa-circle-user` (`PortfolioSummary.jsx:130-132`) |

### Reference vs Prototype

- **Toolbar placement:**
  - In the reference, the Toolbar is inside the Component Set variant.
  - In the Prototype, it is the column header outside `PortfolioSummary` (`App.jsx:146-170`), and the back button appears only when there is history (`App.jsx:148`).
- **Step-bar colours:**
  - The Prototype's `--complete` uses the same `#1817e7` as `--active` (`PortfolioSummary.scss:217-220`). That matches the reference for earlier steps (shown blue) but not for Done (green) `[shot]`.
  - There is no green and no error colour in the SCSS.
- **Labels:**
  - The reference highlights only the current step's label `[shot]` `[ctx]`. The Prototype highlights every label up to the current one (`i <= currentIdx`, `PortfolioSummary.jsx:68`).
  - For Generating, the Prototype highlights "New Task" (`PortfolioSummary.jsx:68`). The reference shows no highlighted label `[shot]`.
- **Card icons:**
  - The reference progress cards carry spinner-third plus angle-right. The reference simple cards carry memo-circle-check plus angle-right `[shot]` `[ctx]`.
  - The Prototype progress card has only `fa-solid fa-angle-right` (`PortfolioSummary.jsx:60`). Its simple card has a "+" button (`PortfolioSummary.jsx:157-163`).
- **Tags:**
  - The reference has three tags: Investor Tier, advisor and customer status. The Prototype renders `customer.tags` only and has no advisor tag.
  - Colours:
    - Exclusive: Prototype `#fbfdbf`/`#6d701b` (`PortfolioSummary.scss:50-53`) vs reference `tag/primary` #f2f93c/#3d3e0f with a finnomena-symbol icon.
    - Permanent: Prototype `#f2fef8`/`#006830` (`PortfolioSummary.scss:55-58`), which matches the reference.
    - Matching: Prototype `#e8f0ff`/`#0043ce` (`PortfolioSummary.scss:60-63`) vs reference Customer Status Tag Pending "Matching" `#f2f3f4`/`#01172b`.
  - The reference Investor Tier set has 8 tiers; the mock uses only `exclusive`.
- **CHAT icon:** reference message-dots vs Prototype `fa-comment-dots`.
- **Description date:** "March 29, 2025" in the reference vs "March 29, 2026" in the mock.

---

## 5. Customer Lists, `112:5001`

### Family, axes and variants `[meta]`

The set is 2740×1911. Each variant is 320 wide, with min 320 and max 640 `[ctx]`. Heights are 361 to 1406.

| Filter | Node | Height |
| --- | --- | --- |
| Today | `99:35794` | 508 |
| Scheduled | `99:36422` | 899 |
| All | `99:37372` | 1406 |
| Completed | `99:38260` | 930 |
| Overdue | `112:5000` | 986 |
| Ready to Report | `99:39903` | 489 |
| In Progress | `99:39904` | 425 |
| New | `99:39905` | 361 |

### Axes that follow from others

There is one axis, Filter, and the only generated prop is `filter` `[ctx]`. The toolbar title and the Section Header title are per-variant text, not properties.

One layer name differs from its text: in Filter=Completed, the toolbar text layer is *named* "All" (`99:37690`) but renders "Completed" `[meta]` `[shot]`.

### Layer tree: `99:39903` (Filter=Ready to Report) `[meta]` `[ctx]`

```
99:39903  symbol, w 320 (min 320, max 640), radius 26
└─ Content 99:38992  column, border-left border/subtle
   ├─ Toolbar 99:38993  h 64, px end-margins (16)
   │  ├─ Leading 99:38994 > Button 99:38995  (pill 36×36, arrow-left fa-solid)
   │  ├─ Leading 99:38996 > text "Ready to Report" 99:38997  (Heading/headline-01)
   │  └─ Trailing 99:38998 > Button 99:38999  (ellipsis fa-solid)
   └─ Content Area 99:39000 > Content Area 99:39001
      └─ Content Lists 99:39002  column, gap 8, py 12
         ├─ instance Section Header 99:39003  ("Ready to Report" | "3", Heading/large-title 34/48)
         ├─ instance HCT Search Field + Filter 368:11462  (Open=False)
         └─ Content 99:39007  px 8
            ├─ instance Health Check Task Lists 99:39009  (main 99:35441; Robert Brown / Mutual Fund)
            ├─ instance Health Check Task Lists 99:39010  (Robert Brown / Bond)
            ├─ instance Health Check Task Lists 99:39011  (Jane Smith / Mutual Fund)
            └─ instance Health Check Task Lists 99:39012  (John Doe / Stock)
```

### Row set and grouping per Filter

| Filter | Row set | Grouping | Rows | Count text |
| --- | --- | --- | --- | --- |
| Today | `99:35445` | time of day: "Morning" (Component 3), "Afternoon" (Component 2), "Evening" (Section Header) `[meta]` `[ctx]` `[shot]` | 3 | none |
| Scheduled | `99:35445` | month (Section Header) > day: "March" > "Today" (3 rows), "Tomorrow", "Mon 30"; "April" > "Wed 1" (1 row); "May", "June", "July", "August" (grey, no rows) `[meta]` `[shot]` | 4 | none |
| All | `706:7182` at Status=`--`, Type=Pending (`661:15600` resolves into `809:11892`) | first letter: A, B, R, ก, ส `[meta]` `[ctx]` `[shot]` | 16 | none |
| Completed | `99:35445` | month > day: "March" > "Mon 23" (3), "Tue 17" (1); "February" > "Mon 9" (1); "January"…"October" with no rows `[meta]` `[shot]` | 5 | none |
| Overdue | `99:35445` | same structure as Completed; red clocks `[meta]` `[shot]` | 5 | "3" `[shot]` |
| Ready to Report | `99:35445` (`99:39009` → `99:35441`) | none | 4 | "3" `[ctx]` |
| In Progress | `99:35445` (`99:39319` → `99:35767`) | none | 3 | "3" `[shot]` |
| New | `99:35445`: `99:39628` → `99:35767` (**Status=In Progress**); `99:39629` shows a spinner `[shot]` | none | 2 | "2" `[shot]` |

- **Count text is static.** The Section Header main's default amount text is "3" (`99:35577`) `[ctx]`. Ready to Report shows "3" over 4 rows, and Overdue shows "3" over 5 rows.
- **Row variant per filter:** for Today, Scheduled, Completed and Overdue, it was read from the screenshot only. For Ready to Report, In Progress, New and All, it was resolved with `[ctx]` on one instance each.

### Nested instances

| Instance | Main component | Local or library | Evidence |
| --- | --- | --- | --- |
| Health Check Task Lists | set `99:35445` | local | `[ctx]` `[meta]` |
| HCT Customer Content Lists (All only) | set `706:7182` | local | `[ctx]` |
| Section Header | `99:35577` "Size=Medium, States=Enabled". Props: `headerText` (text), `amount` (bool), `separator` (bool). The top header resolves through `99:35641` (large-title). | local (its nodes resolve with `[meta]`); the containing set was not located | `[ctx]` `[meta]` |
| Component 2 / Component 3 (day and time sub-headers) | inner Content `99:35566`, `Utility/caption-02` 11/16 | local (nodes resolve) | `[ctx]` `[meta]` |
| HCT Search Field + Filter | `368:10874` Open=False, in set `368:10875` (Open=False / Open=True `368:10873`) on this page's "Items" section | local | `[meta]` |
| Search icon / filter icon | magnifying-glass `99:25802` ("menu, search"); bars-filter `195:11158` ("filter, sort") | library | `[ctx]` |
| Toolbar Buttons | pill Button with arrow-left / ellipsis `99:29961` | library | `[ctx]` |
| Separator (in Section Header) | `4:12960` | library | `[ctx]` |

### Bound variables and Text Styles `[ctx]`

- **Text Styles:**
  - `Heading/headline-01`, `Heading/large-title`, `Heading/title-03`;
  - `Utility/label`, `Utility/footnote`, `Utility/caption-02`;
  - `fa-sharp fa-solid/default`, `fa-sharp fa-solid/small`, `fa-sharp fa-regular/default`.
- **Variables:**
  - `border/subtle`, `end-margins`, `16px`, `layout/horizontal/component-default`;
  - `field/field-03` (rgba(1,23,43,0.05));
  - `button/secondary`, `button/spacing`, `button/pill/radius`, `button/pill/vertical-padding`;
  - `icon/primary`, `icon/information`;
  - `text/primary`, `text/information`;
  - `dynamic/headline/*`, `dynamic/large-title/*`, `dynamic/title/*`, `dynamic/utility/*`;
  - `miscellaneous/separator`, `tag/*`.

### Text and default text `[ctx]` `[shot]`

| Layer | Default text |
| --- | --- |
| Toolbar title and Section Header title | the Filter label ("Today", "Scheduled", "All", "Completed", "Overdue", "Ready to Report", "In Progress", "New") |
| Search placeholder | "Search" (Heading/title-03, `text/information`) |
| Rows | the overridden name and asset-type text listed above |

The only text property found is the Section Header's `headerText`.

### Axis → Prototype code

The Prototype opens the drilldown with `onOpenSection({id, label, count})` (`Dashboard.jsx:71`, `Dashboard.jsx:88`) and `navigateTo('drilldown', section)` (`App.jsx:122-124`).

| Filter | Dashboard entry | `filterBySection` case |
| --- | --- | --- |
| Today | `{id:'today'}` KPI tile (`Dashboard.jsx:48`) | `hasProgress` and any step active or loading (`App.jsx:197`) |
| Scheduled | `{id:'scheduled'}` (`Dashboard.jsx:49`) | any `tasks` item with `id === 'date' && completed` (`App.jsx:198`) |
| All | `{id:'all'}` (`Dashboard.jsx:50`) | `true` (`App.jsx:192`) |
| Completed | `{id:'completed'}` (`Dashboard.jsx:51`) | every `hasProgress` health check has `steps[3] === 'complete'` (`App.jsx:199-200`) |
| Overdue | `{id:'overdue'}` section row (`Dashboard.jsx:55`) | `p.isOverdue` (`App.jsx:193`) |
| Ready to Report | `{id:'ready'}` (`Dashboard.jsx:56`) | any `steps[2]` active or loading (`App.jsx:194`) |
| In Progress | `{id:'progress'}` (`Dashboard.jsx:57`) | any `steps[1]` active or loading (`App.jsx:195`) |
| New | `{id:'new'}` (`Dashboard.jsx:58`) | any `steps[0]` active or loading (`App.jsx:196`) |

Other parts of the variant:

| Reference part | Prototype counterpart |
| --- | --- |
| Toolbar title | `getTitle()` gives `data?.label` (`App.jsx:108`), in the column header (`App.jsx:160-162`) |
| Section Header title and count | `<h1>{data?.label}</h1>` and `<span>{filtered.length}</span>` (`App.jsx:224-227`). The count is computed, not static. |
| HCT Search Field + Filter | Carbon `TextInput` with placeholder "Search Customer..." (`App.jsx:229-238`). There is **no filter button** in the drilldown. Search matches on `p.name` (`App.jsx:207`). |
| Grouping (time of day, month > day, first letter) | **none.** The list is flat, sorted overdue first, then by distance of `p.date` from `2026-03-31` (`App.jsx:187`, `App.jsx:208-220`). |
| Row component | one `DrilldownItem` for every Filter (`App.jsx:248-257`). In the reference, All uses `706:7182` and the others use `99:35445`. |

### Reference vs Prototype

- The reference uses two different row sets depending on Filter. The Prototype uses one.
- The reference groups rows (time of day, month > day, alphabet); the Prototype does not.
- The reference lists a customer once per health check; the Prototype lists each customer once (see §2).
- The reference's count text is static ("3" over 4 or 5 rows); the Prototype's is `filtered.length`.
- The reference's Filter=New list contains a Status=In Progress row (`99:39628` → `99:35767`). The Prototype's `new` filter selects on `steps[0]`.
- Reference search is a pill field (`field/field-03`, radius 200) plus a 48×48 filter button. The Prototype's is a Carbon `TextInput` with no filter button.

---

## Limits and assumptions

- **Local vs library is inferred from how node IDs resolve, not from a library name.**
  - Local: the main component resolves with `get_metadata`, and child IDs inside its instances resolve.
  - Library: either `get_metadata` on the component's local copy returns "This is an invalid node selection… select a node from a visible page" (a hidden internal canvas), or the source-file child IDs inside instance paths (e.g. `3257:7524`, `2565:48`, `7057:4389`, `3496:3786`) return "not found".
  - The library names, and the collections and modes behind variables, were **not visible with the three permitted tools**.
- **Variable values** are the fallback values in the generated code, not resolved per mode. One name can show different fallbacks in different places (see `tag/secondary/background` in §4).
- **`[shot]` facts** (bar states per Status, label highlights, grouping labels, row variants for Today, Scheduled, Completed and Overdue, count-to-row mismatches) are visual readings. Node data was not checked for them.
- **"Done" vs "Completed":** the mapping of the reference Status=Done to the mock's "Done" or "Completed" step arrays is left open (§4).
- **Prototype data is mock data.**
  - Its dates are 2026; the reference shows 2025.
  - No mock field holds an advisor name ("Amelia J.") or an investor tier other than `exclusive`.
- **Static reading only:** the Prototype was not run. Runtime-only states, such as `hasReport: 'loading'` and the Generating → New transition, were read from the code paths cited.
