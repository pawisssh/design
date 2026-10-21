# How can a Prototype's Font Awesome icons become Figma icon components?

Research for [pawisssh/design#313](https://github.com/pawisssh/design/issues/313). Map: [#310](https://github.com/pawisssh/design/issues/310). Vocabulary follows `GLOSSARY.md` (Prototype, Contract, Component Set, Conflict). "Icon atom" is To-design's term for one icon component (`skills/to-design/SKILL.md`).

Researched 2026-10-22. This note answers the ticket's five questions with facts only. It decides nothing. The decisions it leaves open are listed in [Questions left for the spec](#questions-left-for-the-spec).

**Pins:**

- **Font Awesome.** `@fortawesome/fontawesome-free@6.7.2`. Its tarball integrity is `sha512-JUOtgFW6k9u4Y+xeIaEiLr3+cjoUPiAuLXoyKOJSia6Duzb7pq+A76P9ZdPDoAoxHdHzq6gE9/jKBGXlZT8FbA==` (shasum `8249de9b…`, 2149 files). The release date is 2024-12-13.
- **This repo.** Commit `1594a3f`.
- **The Prototype.** health-check-management-main, which is read-only and was only read.

Short prefixes:

- `NPM_FA` = the `fontawesome-free-6.7.2.tgz` tarball from `registry.npmjs.org`. Its paths are under `package/`. It was fetched into gitignored `.scratch/`, checked against the registry integrity, and never run.
- `FA6` = Font Awesome's v6 docs, `https://docs-v6.fontawesome.com/`.
- `FA_GQL` = Font Awesome's public GraphQL API, `https://api.fontawesome.com`, queried with `release(version: "6.7.2")`. No token was used. The schema is documented at `FA6 apis/graphql/objects`.
- `PROTO` = `/Users/kane/Projects/kane/design/.kane/projects/health-check-management-main`.
- `REPO` = this repository at `1594a3f`.

## Answer

1. **Source.** The SVGs come from the `@fortawesome/fontawesome-free@6.7.2` npm tarball, checked by its registry integrity. The tarball holds a `.svg` file under `svgs/<style>/<name>.svg` for every Free icon and style. The tarball is the same release the Prototype runs:
   - The Prototype's SRI-pinned `css/all.min.css` from cdnjs is byte-identical to the tarball's `package/css/all.min.css`.
   - cdnjs builds that library from this same npm package.
2. **License.** The `.svg` files are CC BY 4.0. Attribution is required:
   - **What FA ships.** Font Awesome says the comment it embeds in every SVG is sufficient attribution.
   - **What reaches Figma.** That comment very likely does not survive SVG import into Figma (assumption A2). Today the icon component's description carries only `<package>@<version> <file>`.
   - **Adapted Material.** Flattening and resizing are format changes that CC BY 4.0 §2(a)(4) says never produce Adapted Material.
   - **Open.** Whether putting the icons into a Figma file counts as "Share" under the license is not decided here (A3).
3. **Class to SVG.**
   - **The rule.** A class list maps to one file in four steps:
     1. The style class (`fa-solid`/`fas`, `fa-regular`/`far`, `fa-brands`/`fab`) gives the folder.
     2. The one remaining `fa-X` whose `X` is an icon id or a name alias in `metadata/icon-families.json` is the name. Every other `fa-*` class is a modifier, such as `fa-spin`.
     3. An alias resolves to its canonical id. An alias has a CSS rule but no SVG file.
     4. The pair is valid only if `{classic, <style>}` is in that icon's `familyStylesByLicense.free`. The file is then `svgs/<style>/<id>.svg`.
   - **The Prototype's pairs.** It uses 25 pairs: 4 regular and 21 solid. None of its names is an alias, and every file exists.
4. **Input shape.**
   - **What the icons slice takes today:**
     - One unpacked icon package directory with a matching `package.json`.
     - Icon keys that are bare file names.
     - One `icons.source` with a `path` and an optional `fallback` template, shared by every Contract.
   - **What it builds.** Each SVG becomes a 16×16 component named by `iconName(key)`.
   - **How the Carbon path supplies it.** `sources.mjs` fetches `@carbon/icons@11.90.0` by integrity and extracts only `package.json`, `svg/16` and `svg/32`.
   - **Where Font Awesome input fails today:**
     - The shape cannot say which style a key uses.
     - It would stretch Font Awesome's non-square icons to a square.
     - Vibe-to-Figma refuses any Contract that names icons.

   The details, all measured with the repo's own `iconsPlan` and packager, are in [§4](#4-input-shape-what-to-designs-icons-slice-takes-today).
5. **Pro icons.**
   - **They are not in the package.** memo, message-dots, spinner-third and memo-circle-check are Pro-only in 6.7.2. `FA_GQL` lists no Free style for any of them. The Free package has no SVG, no metadata entry and no CSS rule for them.
   - **The icons slice stops.** Naming one stops the whole plan with an error before any Figma call.
   - **Getting them needs Pro.** The SVGs are only available to a Pro-scoped token, and the Pro License governs their use.
   - **The Prototype is unaffected.** It uses no Pro icon. angle-right and clock are Free, but angle-right only in solid.

## Findings

### 1. Source: where each SVG comes from, pinned and verified

**What the Prototype loads**

- **One stylesheet, from cdnjs.** `PROTO index.html:7` loads `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css` with `integrity="sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg=="`. Font Awesome is not in `PROTO package.json`, so the Prototype has no npm copy of it.
- **cdnjs's source.** cdnjs builds this library from npm. In the cdnjs packages repository, `packages/f/font-awesome.json` sets `autoupdate.source` to `npm` and `target` to `@fortawesome/fontawesome-free`, with a file map of `css|js|webfonts|sprites|svgs`. The cdnjs API (`api.cdnjs.com/libraries/font-awesome/6.7.2?fields=sri`) gives the same SRI for `css/all.min.css`.

**The integrity chain, checked end to end**

| Link | Value | Check |
| --- | --- | --- |
| npm registry `dist.integrity` for 6.7.2 | `sha512-JUOt…FbA==` | — |
| Downloaded tarball | sha512 = `sha512-JUOt…FbA==`, sha1 = `8249de9b…` | equals the registry |
| `NPM_FA css/all.min.css` | sha512 = `sha512-Evv84…ABhg==` | equals the Prototype's SRI |
| `NPM_FA svgs/` | solid 1402 + regular 163 + brands 495 = **2060** files | equals `FA_GQL` `iconCount.free` = 2060 |

**What the package holds**

| Member | Content |
| --- | --- |
| `package.json` | `name` `@fortawesome/fontawesome-free`, `version` `6.7.2`, `license` `(CC-BY-4.0 AND OFL-1.1 AND MIT)` |
| `LICENSE.txt` | the Free license, see §2 |
| `svgs/{solid,regular,brands}/<id>.svg` | one file per Free icon and style, named by canonical id only |
| `metadata/icon-families.json` | 1895 icons keyed by id, each with `aliases.names`, `unicode`, `familyStylesByLicense.{free,pro}`, and `svgs.classic.<style>` (`viewBox`, `width`, `height`, `path`, `raw`) |
| `metadata/icons.yml`, `categories.yml`, `shims.yml` | older and v4-compatibility metadata, not needed for the mapping |
| `css/`, `webfonts/`, `js/`, `sprites/` | the web-font and JS frameworks, not needed for SVG input |

**What every SVG looks like** (all 2060 checked)

- **Shape.** Each file has exactly one `<path>`, with no `fill`, `opacity` or `style` attribute.
- **Attribution comment.** Each file starts with `<!--! Font Awesome Free 6.7.2 by @fontawesome … License - https://fontawesome.com/license/free (Icons: CC BY 4.0, …) Copyright 2024 Fonticons, Inc. -->`.
- **Size.** Every viewBox is `0 0 W 512`, with W between 256 and 640. 684 files are square (W = 512). The most common widths are 448 (382 files), 640 (352), 576 (294), 384 (182) and 320 (83).
- **Why widths vary.** FA6 `web/style/fixed-width` says the icons share one height but vary in width.

**For comparison: how the Carbon path pins its icons**

- `REPO skills/adapter-carbon/scripts/sources.mjs:53-57` pins `@carbon/icons@11.90.0` by `integrity`.
- Lines 77-91 of the same file:
  - check the downloaded tarball's sha512 against the pin;
  - extract only the named members (`package/package.json`, `package/svg/16`, `package/svg/32`) into a fresh directory;
  - never run anything from the package (header, lines 10-12).
- `REPO skills/to-design/SKILL.md:24,82` then passes the unpacked `package` directory to the icons slice as `--icons-dir`.
- The Font Awesome tarball can be read the same way. The members that hold what the icons slice and the class mapping read are:
  - `package/package.json`
  - `package/svgs/solid` and `package/svgs/regular`
  - `package/metadata/icon-families.json`
  - `package/LICENSE.txt`

### 2. License: what the Free license requires when the SVGs go into Figma

**The three licenses**

Three licenses cover the Free package, and the same split appears in `NPM_FA LICENSE.txt` and on [fontawesome.com/license/free](https://fontawesome.com/license/free) (last updated July 12, 2018):

| Part | License |
| --- | --- |
| Icons as `.svg` and `.js` files | CC BY 4.0 |
| Icons as web or desktop font files | SIL OFL 1.1 |
| All other files | MIT |

**Font Awesome's attribution guidance**

- **Embedded comments.** All three licenses require attribution. Font Awesome says the comments embedded in its downloaded files already give sufficient attribution, and asks that they not be removed. Sources: `LICENSE.txt`, "Attribution"; the free-license page, "Attribution".
- **The support FAQ.** [fontawesome.com/support](https://fontawesome.com/support), under "Can I use Font Awesome Free in open source projects?", says Free's license requires that you maintain attribution when you use Font Awesome assets.
- **Dos and don'ts.** The free-license page allows embedding Free in apps and documents. It disallows using the Font Awesome name in a project's name.

**What CC BY 4.0 requires** ([legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en))

- **Trigger.** The conditions apply when You "Share", which §1 defines as providing material to the public by any means that needs permission under the license.
- **What to keep (§3(a)(1)).**
  - (A) Retain the creator's identification, the copyright notice, a notice referring to the license, a notice referring to the disclaimer, and a link to the material where reasonably practicable.
  - (B) Say whether you modified it.
  - (C) Say it is under CC BY 4.0 and include the license text or its link.
- **How (§3(a)(2)).** These may be met in any reasonable manner for the medium and context.
- **Format changes (§2(a)(4)).** Technical modifications needed to use the material in another format are allowed, and making them alone never produces Adapted Material.

**What reaches Figma today**

- **The component description.** The icons slice sets it to `<package>@<version> <file>`. This is `REPO skills/to-design/assets/builder-core.js:380,386`.
- **The import step.** `createNodeFromSvg` returns a frame of vector children (`docs/research/carbon-icon-source.md`, probe table). A Figma node has no field that holds an XML comment, so the embedded attribution comment is very likely lost on import. **Not probed (A2).**

**Other license points**

- **Brand icons.** These are trademarks, and the license asks that they be used only to represent their owner. The Prototype uses no brand icon: `fa-brands` appears only as a selector at `PROTO src/App.scss:28`.
- **Font Awesome's own Figma guidance.**
  - FA's support FAQ says Free is available by default in Figma as a font. For Pro it recommends FA's plugin or locally installed Pro fonts with ligatures.
  - FA6 `desktop/add-icons/figma-plugin` says the official plugin places each icon as an SVG, 16 px high, in a frame named after the icon.
  - The plugin's padding options are: none (the frame fits the icon), fixed-width (20×16), square (20×20) and roomy (24×24).

### 3. Class to SVG: how a class pair maps to one SVG

**What Font Awesome's docs and CSS say** (FA6 `web/add-icons/how-to`)

- **The parts of an icon.** An icon is a style class plus its name prefixed with `fa-`. A family class is optional, and Classic is the default.
- **Style classes.** Each style class sets a font weight: solid 900, regular 400, brands 400 (`NPM_FA css/all.css:6255-6257, 7859-7861, 7873-7875`).
- **Legacy prefixes.** `fas`, `far` and `fab` still work.
- **Aliases.** Renamed icons keep their old names as aliases, so either name renders the same icon.
- **Style availability.** The page's table lists Classic Regular as "Pro only". The package and metadata show that Free does include Regular, but only for 163 icons.

**How `NPM_FA css/all.css` resolves a class pair**

- **Name classes** set only a codepoint: `.fa-xmark { --fa: "\f00d"; }`.
- **Every style class** draws it with `::before { content: var(--fa); }` (lines 25-32).
- **Style classes** set the font family and weight. The weight picks the face: `fa-regular-400` or `fa-solid-900` (lines 7852-7875).
- **Consequence.** Style and name are independent in CSS. Any pair gets a rule, including pairs for which Free ships no glyph.
- **Aliases are CSS-only.**
  - `.fa-close`, `.fa-multiply`, `.fa-remove` and `.fa-times` set the same `--fa` as `.fa-xmark`.
  - `svgs/solid/close.svg` and `svgs/solid/times.svg` do not exist.
  - `metadata/icon-families.json` maps them: `xmark.aliases.names` = `[close, multiply, remove, times]`. Another example: `clock.aliases.names` = `[clock-four]`.
  - `FA_GQL` confirms this: `icon(name: "close")` returns id `xmark`. Per `FA6 apis/graphql/objects` ("Name Aliases"), the `name` argument accepts an id or any alias.
- **Which styles are Free.** `familyStylesByLicense.free` lists the Free family and style pairs for each icon, and is empty for a Pro-only icon (`FA6 apis/graphql/objects`, `FamilyStylesByLicense`). In the package, 1402 icons have a Free solid SVG and 163 have a Free regular SVG.
  - Example: `angle-right.free` is `[classic/solid]` only.
  - Example: `clock.free` is `[classic/regular, classic/solid]`.

**How the Prototype marks icons**

- **Three ways.** Every icon is an `<i>` with a class string. It comes from one of:
  - `FaIcon({icon})`, at `PROTO src/App.jsx:18-20` and copied into seven other component files;
  - `faRenderIcon(iconClass)` for Carbon's `renderIcon` prop, at `App.jsx:22-24`;
  - `MemoIcon`, at `src/components/PortfolioVersion/PortfolioVersion.jsx:9-15`.
- **All literals.** Every class string is a string literal, so a static read finds them all:
  - some are inline;
  - some are in `src/data/mockData.js:22-39` as `icon:` fields;
  - one is the default in `iconClass={task.icon || 'fa-regular fa-file-lines'}` at `PortfolioVersion.jsx:255`.
- **Modifiers.** The only modifier class is `fa-spin`, on `circle-notch` (`PortfolioVersion.jsx:11`).
- **Sizing.** `PROTO src/App.scss:25-31` sets every `.fa-solid`, `.fa-regular` and `.fa-brands` to `font-size: 16px; line-height: 1`. `.phc-drilldown-item-icons i` uses 18px in a 20px-wide box (lines 33-38), and sidebar icons are 18px (40-42).

**The 25 pairs, with these checks for each:**

- the pair resolves to a canonical id (none is an alias);
- `{classic, style}` is in `familyStylesByLicense.free`;
- the file's `d` equals the metadata `path`;
- the metadata `unicode` equals the CSS `--fa` codepoint.

All 25 pass all four checks. Under "Used at", paths are under `PROTO src/`: `PV` = `components/PortfolioVersion/PortfolioVersion.jsx`, `PVD` = `components/PortfolioVersionDetail/PortfolioVersionDetail.jsx`, `PS` = `components/PortfolioSummary/PortfolioSummary.jsx`, `PM` = `components/PortfolioManagement/PortfolioManagement.jsx`, `D` = `components/Dashboard/Dashboard.jsx`, `AM` = `components/Modals/AppointmentModal.jsx`.

| Style | Id | viewBox W×H | Free styles | Used at |
| --- | --- | --- | --- | --- |
| regular | file-lines | 384×512 | regular, solid | App.jsx:44; PV:13, 255; PM:233; mockData.js:22 |
| regular | clock | 512×512 | regular, solid | App.jsx:70; PM:202; mockData.js:23 |
| regular | comment-dots | 512×512 | regular, solid | App.jsx:71; PV:188; PS:127; mockData.js:24 |
| regular | circle | 512×512 | regular, solid | PV:99 (opacity 0.2) |
| solid | arrow-left | 448×512 | solid | App.jsx:153 |
| solid | ellipsis | 448×512 | solid | App.jsx:164 |
| solid | house | 576×512 | solid | App.jsx:752 |
| solid | magnifying-glass | 512×512 | solid | App.jsx:761 |
| solid | chart-line | 512×512 | solid | App.jsx:762 |
| solid | chart-pie | 576×512 | solid | App.jsx:763 |
| solid | bell | 448×512 | regular, solid | App.jsx:764 |
| solid | bars | 448×512 | solid | App.jsx:767 |
| solid | plus | 448×512 | solid | App.jsx:810; PVD:124; PV:286; PS:162; PM:187 |
| solid | circle-check | 512×512 | regular, solid | App.jsx:854; PV:97 |
| solid | xmark | 384×512 | solid | PVD:52, 69, 102 |
| solid | caret-down | 320×512 | solid | PVD:99 |
| solid | paperclip | 448×512 | solid | PVD:127 |
| solid | arrow-right | 448×512 | solid | PVD:184, 191, 208 |
| solid | circle-notch | 512×512 | solid | PV:11 (with `fa-spin`) |
| solid | angle-right | 320×512 | solid | PV:132; PS:60, 90; D:95 |
| solid | circle-user | 512×512 | regular, solid | PV:191; PS:131 |
| solid | angle-up | 448×512 | solid | PV:212 |
| solid | angle-down | 448×512 | solid | PV:233 |
| solid | circle-info | 512×512 | solid | AM:100 |
| solid | trash | 448×512 | solid | PM:142 |

Two facts from this table:

- **Seven names exist in both Free styles.** These are file-lines, clock, comment-dots, circle, bell, circle-check and circle-user. The Prototype draws the first four in regular and the last three in solid.
- **Sixteen of the 25 are not square.**

### 4. Input shape: what To-design's icons slice takes today

**The Contract's `icons` field** (`REPO skills/contract/references/contract-schema.md:160-170`)

- **Shape.** `{source: {package, version, path, fallback}, default, preferred}`.
- **Keys.** Keys are package file names. The Figma name comes from `iconName(key)`, which capitalises the first letter (`skills/contract/scripts/contract.mjs:148`).
- **Shape rule.** An icon is one flattened Vector with one fill.
- **The icon list.** `icons(contract)` returns `default`, then `preferred`, then every fixed `icon:<key>` INSTANCE in the anatomy (`contract.mjs:136`).
- **Today's values.** The Carbon Contracts set `path` to `svg/16/{key}.svg` and `fallback` to `svg/32/{key}.svg`.

**The plan: `iconsPlan`** (`REPO skills/to-design/scripts/build-plan.mjs:112-145`)

- **One source.** All Contracts that name icons must share one `icons.source`, or the plan throws (line 117).
- **Package check.** `<iconsDir>/package.json` must match `source.package` and `source.version` (121-123).
- **Key format.** Each key must match `/^[a-z0-9]+(-{1,2}[a-z0-9]+)*$/` (126).
- **File choice.** The first template whose file exists wins: `path`, then `fallback`. If neither exists, the plan throws (127-129).
- **Clean-up.** Unpainted shapes are stripped (`UNPAINTED`, line 104). Then the SVG's sha256 is taken (130-131).
- **Output.** The plan is `{slice: 'icons', fileKey, page, at, options, source: {package, version}, icons: [{key, name, file, svg, sha256}]}`.

**The builder core: `iconsSlice`** (`REPO skills/to-design/assets/builder-core.js:304-431`)

- **Building each icon** (`svgFrame`, 367-375):
  1. Call `figma.createNodeFromSvg`.
  2. Flatten the children into one `VECTOR` named `Vector`, constrained `SCALE`/`SCALE`.
  3. Resize the frame to `SIZE`×`SIZE`, where `SIZE` is 16 (line 305).
- **The component.** It has no fill and the description `<package>@<version> <file>` (380-386).
- **The ledger.** It records `icons.components[key] = {id, key, file, sha256}` (420).
- **Later slices.** The base and sets slices resolve an icon INSTANCE only through these ledger entries. A missing icon is an error (`build-plan.mjs:184,368`) or a `missing` icon Conflict (`builder-core-components.js:113-140`).

**Vibe-to-Figma today.** Its gate refuses any Contract that names icons, with `Vibe-to-Figma builds no icon atoms yet` (`REPO skills/vibe-to-figma/scripts/build.mjs:153`).

**What Font Awesome input meets in this shape**

These results were measured by calling the repo's `iconsPlan` and `tests/pack.mjs` (the real packager) on the unpacked tarball. The Contract was a copy of the Carbon Button Contract, with `icons` replaced by the 25 ids and `source.package` set to `@fortawesome/fontawesome-free@6.7.2`. Nothing ran in Figma.

1. **The package check and key format pass.** `package/package.json` matches the source. All 25 ids pass the key regex, and every file is found.
2. **The current fields cannot carry the style.**
   - **A style prefix in the key is rejected.** A key of `regular/clock` fails with `icon key "regular/clock" is not an icon file name`.
   - **The first template wins regardless of style:**

     | Templates | Result |
     | --- | --- |
     | `path` = `svgs/solid/{key}.svg`, `fallback` = `svgs/regular/{key}.svg` | All 25 are taken from `solid`, including the 4 the Prototype draws in regular. |
     | Regular first | bell, circle-check and circle-user are taken from `regular`, though the Prototype draws them solid. |

   - **Names collide.** `iconName` gives `Clock` for either style. The ledger is keyed by icon key, so one name holds one component.
   - **One source for every Contract.** The one-source rule (line 117) stops any later split by Contract.
3. **Non-square icons would be stretched.**
   - **How the stretch happens.** `svgFrame` resizes the frame to 16×16. Figma's `resize()` applies the children's constraints (cited in `carbon-icon-source.md` §3). With `SCALE`/`SCALE`, the vector scales by 16/W across and 16/512 down.
   - **Examples.**
     - angle-right (320×512) would come out 1.6 times wider than drawn.
     - house (576×512) would come out at 0.89 times its drawn width.
   - **Why Carbon never showed it.** Carbon's viewBoxes are all square (`0 0 16 16` or `0 0 32 32`).
   - **How Font Awesome itself sizes icons:**
     - `NPM_FA css/svg-with-js.css:29-33` sets `.svg-inline--fa` to `height: 1em`, so the width follows the viewBox.
     - The official Figma plugin uses a 16 px height, a frame that fits the icon, or a fixed-width 20×16 frame (§2).
   - **Status.** Code reading plus Figma's documented resize semantics. Not probed with these SVGs (A4).
4. **Paint passes.** Each Font Awesome SVG is one `<path>` with no `fill` or `opacity`, so `UNPAINTED` strips nothing. The single-`Vector` rule holds, and the fill comes from the Contract's `Glyph/Vector` paint rules as for Carbon.
5. **Size fits in one call.**
   - **Measured.** The packaged icons call for the 25 icons is 36,790 characters with the solid-first templates, and 37,623 with regular-first. Both are under `use_figma`'s 50,000 (`SKILL.md:41`).
   - **Raw SVG text.** The 25 SVGs total 14,363 characters, of which the attribution comments are 5,275.
6. **A second icon package may be needed.**
   - **Carbon icons in the Prototype.** The Prototype's Carbon components draw their own `@carbon/icons-react` icons wherever it does not pass `renderIcon`. The lockfile has `@carbon/icons-react@11.77.0` (`PROTO package-lock.json:330-333`).
   - **The conflict.** If a reference set needs one of those, Carbon and Font Awesome icons would meet the one-source rule.
   - **Status.** Not checked (A5).

### 5. Pro icons: what happens to an icon only Pro has

**Free versus Pro availability** (`FA_GQL`, 6.7.2)

| Icon | Unicode | Free family and styles | Pro family and styles |
| --- | --- | --- | --- |
| memo | e1d8 | none | 16 (classic, duotone, sharp, sharp-duotone × solid, regular, light, thin) |
| message-dots (aliases comment-alt-dots, messaging) | f4a3 | none | 16 |
| spinner-third | f3f4 | none | 16 |
| memo-circle-check | e1d9 | none | 16 |
| angle-right | f105 | classic/solid | 16, including classic/regular |
| clock (alias clock-four) | f017 | classic/regular, classic/solid | 16 |

**What a Pro-only name meets in each place**

- **In the Free package.** The four Pro-only names have no file under `svgs/`, no key in `metadata/icon-families.json`, and no `.fa-<name>` rule in `css/all.css` (0 matches).
- **In the Prototype's browser.** A class such as `fa-regular fa-memo` therefore sets no `--fa`, and the `::before` has no content to draw. This is inferred from the CSS and was not rendered.
- **A Pro-only style.** `fa-regular fa-angle-right` gets a codepoint, but Free lists angle-right only in classic/solid, so `fa-regular-400` is not expected to have its glyph. Not rendered (A7).
- **In the icons slice.** A Pro-only key stops the whole plan before any Figma call. The measured error is `icon memo: none of svgs/solid/memo.svg in @fortawesome/fontawesome-free@6.7.2`.

**Getting the Pro SVGs**

- **Token scope.** Per `FA6 apis/graphql/objects` ("Authorization Scopes and the svgs Field"), an icon's `svgs` field returns Pro family-styles only for a token with the `svg_icons_pro` scope. Free SVGs need the `svg_icons_free` scope.

**What the Pro License allows** ([fontawesome.com/license](https://fontawesome.com/license), last updated April 20, 2022)

- **Allowed.** Creators, meaning licensed seat holders, may embed Pro icons in designs and graphic art.
- **Not allowed:**
  - making, sharing or publishing standalone copies of Pro icons for non-Creators;
  - copies made in a non-transformative way, or where the Pro icons are the main part of what is shared;
  - giving non-Creators permission to change Pro icons or projects that embed them.
- **Open.** Whether a Figma icon library counts as such a standalone copy is not decided here (A3).

**What this means for the Prototype and the references**

- **The Prototype.** It uses no Pro icon: all 25 pairs in §3 are Free.
- **MemoIcon.** Its `MemoIcon` (`PV:9-15`) renders `fa-regular fa-file-lines`, or `fa-solid fa-circle-notch fa-spin` while loading. This is a code fact only. This note claims no mapping from a reference's Pro icon to a Prototype icon (A6).
- **The owner's organization library.** "(v3) Foundations / Icons" draws Font Awesome as TEXT glyphs in Style × Size component sets, not as vectors (`docs/research/carbon-icon-source.md` §2).

**Version note.** FA's support FAQ says v7 is the current major version and v6 is in long-term support. v7 moved to square icon canvases. The Prototype pins 6.7.2, so the 6.7.2 viewBoxes above are what its code renders.

## Assumptions flagged

- **A1. The font glyph is assumed to be the same drawing as the SVG.**
  - **What the Prototype renders.** The web-font glyphs (`webfonts/*.woff2`, OFL).
  - **What is checked.** For each pair, the metadata `path` equals the file's `d`, and the metadata `unicode` equals the CSS codepoint.
  - **Not checked.** The font outlines were not parsed.
- **A2. Figma's SVG import is assumed to drop the attribution comment.** Not probed. The current component description does not carry the attribution either.
- **A3. Two license questions are left open, not decided here:**
  - whether placing the icons in a Figma file (private, team-shared or published as a library) is "Share" under CC BY 4.0 §1;
  - whether a Figma icon library would be a "standalone copy" under the Pro License.
- **A4. The 16×16 stretch is a code reading.** It rests on `builder-core.js:367-375` plus Figma's documented `resize` and constraint semantics. It was not probed in Figma with Font Awesome SVGs.
- **A5. Carbon icons were not checked.** Whether any of the owner's reference sets needs a Carbon `@carbon/icons-react` icon next to the Font Awesome ones is unknown.
- **A6. The reference sets were not opened.** This note does not say which Free icon, if any, stands in for each Pro icon they name.
- **A7. Pro-only styles were not rendered.** What a browser draws for a Free name in a style Free lacks (such as `fa-regular fa-angle-right`) was not rendered.

## Questions left for the spec

These questions fall out of the facts above. They are not answered here.

- How a Contract names an icon's style (solid or regular) when one name exists in both, given the key regex, the single `icons.source`, and `iconName`.
- How a non-square icon is sized in its component: square 16×16 as for Carbon, 16 px high with the width from the viewBox, or a fixed 20×16.
- Where attribution goes in the Figma file, if the answer to A3 requires it.
- What Vibe-to-Figma does with a Pro-only icon name: refuse it, substitute a Free icon, or require a Pro source.
- Whether Font Awesome icons and any Carbon icons share one Icons page and ledger, given the one-source rule.
