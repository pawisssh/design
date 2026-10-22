# Tailwind 3 Prototype through Tailwind 4: fidelity check (#337)

Throwaway check for [#337](https://github.com/pawisssh/design/issues/337): how does Vibe-to-Figma read a Prototype whose
Tailwind is 3? It compares, on three pinned samples, the computed style of each utility and class string the Prototype uses:

- (a) Tailwind 3.4.17 over the Prototype's config (read statically) and its one plugin. This is also what (c), the Prototype's own build, emits, minus autoprefixer and minification.
- (b0) The config carried into a Tailwind 4.3.3 stylesheet (`@theme inline`, `@custom-variant dark`, a container `@utility`), compiled by the Adapter's own pin.
- (b1) (b0) plus a Tailwind 3.4 defaults layer. The layer holds the v3 palette and shadow, drop-shadow, radius and blur scales, the v3 font stacks, the 3px ring and outline, and the v3 base rules (border gray-200, placeholder gray-400, button cursor). Its values come from v3's own `tailwindcss/colors` and `tailwindcss/defaultTheme`.
- (b2) (b1)'s defaults layer, but the config goes through Tailwind 4's own `@config`. `loadModule` hands back the statically read object, so nothing executes.

## Samples

| Sample | Repo and SHA | Lock resolves |
|---|---|---|
| bolt | malDuffin/free-web-tuner@b3105a2 | tailwindcss 3.4.17 |
| base44 | shahata/demo-333@678e219 | tailwindcss 3.4.19 |
| lovable | Walbrkt/HackBerlin_Solar@5deef2d | tailwindcss 3.4.17 + tailwindcss-animate 1.0.7 |

The samples were cloned at those SHAs into scratch and never installed. Each config was read by `readconfig.mjs`, which parses with TypeScript 6.0.3 and evaluates literals only. All three configs read with no refusal, including Lovable's `tailwind.config.ts` (`satisfies Config`, `require("tailwindcss-animate")`).

## Run

```bash
npm install --ignore-scripts   # this folder's package.json
node compare.mjs <this folder> <adapter-generic tools dir> <sample checkout> out/out-<sample>.json
```

The Tailwind 4.3.3, tw-animate-css 1.4.0 and TypeScript 6.0.3 builds come from `node skills/adapter-generic/scripts/sources.mjs`. Chrome is driven through playwright-core's `chrome` channel. Each subject is rendered at 1280×800 in two fixtures:

- `<div class=…><span/><span/><input/></div>`, with computed styles compared;
- a stack of three block children, with the boxes compared.

## Results

Utilities / class strings that differ from (a):

| Sample | utilities | strings | (b0) | (b2) | (b1) | (b1) visible |
|---|---|---|---|---|---|---|
| base44 | 178 | 89 | 178 / 89 | 10 / 16 | 8 / 12 | 1 / 2 |
| lovable | 730 | 356 | 730 / 356 | 40 / 91 | 39 / 87 | 10 / 27 |
| bolt | 428 | 373 | 428 / 373 | 19 / 45 | 19 / 45 | 3 / 3 |

"Visible" leaves out diffs that move nothing:

- v4's `translate`/`rotate`/`scale` properties for v3's `transform`, when the boxes match;
- longer `transition-property` lists;
- empty shadow layers;
- `space-y-*` when a stack of block children has the same boxes;
- animation frames.

The visible ones that remain:

- **Selector change.** `space-x-*` and `divide-y`: v4 puts the margin or border at the end of every child but the last, where v3 put it at the start of every child but the first.
- **`[--var]` shorthand.** v3 read an arbitrary value written as `[--x]` as `var(--x)`; v4 doesn't. Lovable has 5 such classes: `w-[--sidebar-width]`, `border-[--color-border]`, …
- **Multi-layer `drop-shadow` steps.** v4 wraps the whole theme value in one `drop-shadow()`.
- **Gradient interpolation.** v4 adds `in oklab`.
- **`bg-gray-900/98`.** v3 generates no opacity modifier outside its scale; v4 does.
- **`outline-none`.** v3 wrote `2px solid transparent`; v4 writes `none`. The two look the same except in forced colours.
- **tw-animate-css vs tailwindcss-animate.** `duration-*` doesn't set `animation-duration` on its own, and `animate-in` adds `blur(0px)`. Every tailwindcss-animate class Lovable uses was generated.

## Caveats

- Some onlyA/onlyB tokens are artifacts of this check's selector parsing (`75`, `17`, `css`, and v3's escaped commas in `transition-[left,right,width]`).
- (a) used 3.4.17 for Base44, whose lock resolves 3.4.19.
