# Default font survey (#362)

Does a Prototype name a font for its Text Styles? Measured on 2026-10-23, on #319's eight pinned samples and #338's 33 Figma Make bundles, all read as data at their pinned SHAs.

## #319's samples: 6 of 8 name a font

| Tool | Sample | Font | Where it is named | Foundations today |
|---|---|---|---|---|
| v0 | patna-run-club @1057893 | Inter | `@theme inline --font-sans: 'Inter', …`, plus a next/font Inter loader (`variable: '--font-inter'`) | reads Inter |
| Lovable (new) | inventory @df38065 | Geist Sans | `@font-face`, plus `@theme inline --font-sans` | reads Geist Sans |
| Lovable (older) | HackBerlin_Solar @5deef2d | none | Tailwind 3: no `fontFamily` in the config, no font link | refuses (`foundations.mjs:224`) |
| Bolt | free-web-tuner @b3105a2 | Poppins | Google Fonts `<link>`, plus `theme.extend.fontFamily.sans` | reads Poppins through #337's carry |
| Replit | simple_foundation_website @585175d (`artifacts/hopebridge`) | Inter | Google Fonts; `@theme --font-sans: var(--app-font-sans)`, with `:root { --app-font-sans: 'Inter', sans-serif }` | refuses: `fontOf` follows `var()` only to a next/font loader or another `@theme` font |
| Figma Make | smart-parking @0a7d831 | Inter | `fonts.css` `@import`, plus `body { font-family }`; no `--font-sans` | refuses (#360, item 3) |
| AI Studio | maincs1 @7f2c155 | Inter | `@import`, plus `@theme --font-sans` | reads Inter |
| Base44 | demo-333 @678e219 | none | Tailwind 3: no `fontFamily` | refuses (`foundations.mjs:224`) |

Inter is the font in 4 of the 6 that name one. #362 said v0 sets Geist: that is the committed fixture's font, and the pinned v0 sample sets Inter.

## #338's Figma Make bundles: 15 of 32 name no font

`out/count.txt` is `count.mjs`'s output over `fetch.sh`'s download of `out/repos.txt`. The download holds each bundle's stylesheets, `index.html`, Tailwind config and root `package.json`. One bundle, anujrwt08, has no `src/` (only `dist/`) and is skipped.

- **15 name no font.** Make's template ships `src/styles/fonts.css` empty, with no `body` font-family and no font package. Subu2006 counts here: its FKGroteskNeue belongs to a second, non-Make app in the same repo.
- **17 name one.** 7 name Inter as their sans; the others name Plus Jakarta Sans, Syne, Oswald/Montserrat, Lora, Syncopate, JetBrains Mono, SAP 72, Helvetica Neue and Fustat.
- **How "names a font" is read** (`count.mjs`):
  - Any of these counts:
    - a Google Fonts URL;
    - an `@font-face`;
    - a `font-family` or `--font-sans` whose first family is not a generic or system keyword, following one `var()`;
    - a `@fontsource`, `geist` or `@next/font` dependency.
  - A font set only in a `.tsx` `style` or class is not counted.

## The owner's Prototypes

- **batch-sell-main** (Tailwind 4, path A): `src/index.css` is only `@import "tailwindcss";`, and `index.html` names no font. Path A copies that stylesheet into the Extracted Library, so Foundations refuses at `:224`.
- **health-check-main** names 'Finnomena Trek' through `--body-font-family`. #327's rule takes the family on `body` as `--font-sans`.

## Reproduce

```bash
zsh fetch.sh /tmp/make33 out/repos.txt
node count.mjs /tmp/make33
```

Read the download as data only, and run nothing from it.
