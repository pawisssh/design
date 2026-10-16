# Prototype: chroma guard on the near tier (#91)

Throwaway. This prototype answers one question: should the near tier from #61 (OKLab ΔE ≤ 0.02, role-filtered) refuse to match a tinted colour to a grey token?

**Answer.** Yes, by an asymmetric chroma floor. After ΔE ≤ 0.02, a candidate token is dropped when the raw value's OKLab chroma is ≥ 0.01 and the token's chroma is < 0.01. A grey value may still near-match a tinted-neutral token. The exact tier (within 1/255 per channel) is unchanged. The resolution comment on #91 holds the counts and the guards that were rejected.

## Run

```bash
node skills/adapter-carbon/scripts/sources.mjs
```

That fetches the pinned Carbon DTCG files into `.scratch/adapter-carbon/sources/carbon`. Then, in a scratch directory outside the repo:

```bash
npm pack tailwindcss@4.3.3 --ignore-scripts
```

```bash
tar xzf tailwindcss-4.3.3.tgz
```

Back in the repo root:

```bash
node prototypes/chroma-guard/measure.mjs --tailwind <scratch>/package/theme.css
```

```bash
node prototypes/chroma-guard/measure.mjs --tailwind <scratch>/package/theme.css --labels B
```

`CHOSEN=<guard id>` picks which guard gets detail lists and the #91 asserts. The default is `chroma-asym@0.01`. Outputs go to `out/report.<labels>.txt` and `out/results.<labels>.json`.

## Inputs

**Carbon.** Every white, g10, g90 and g100 colour token whose name fits the role. That is `background|layer|field` for background-color, `text|link|icon` for color, and `border` for border-color. Translucent token-modes are skipped. All 244 Carbon Primitives are used as raw values.

**shadcn.** `inputs/shadcn-neutral.globals.css` is shadcn's neutral theme, copied from the #84 v0 app (`prototype/source-link`). shadcn@4.22.0 on npm ships no theme files. The zinc, stone, gray and slate bases are derived from it by swapping each Tailwind neutral step's family [assumption].

**Tailwind.** All 286 colours of the v4.3.3 palette.

**Samples.** `inputs/samples.json` holds the colours of the #63 sample Prototype, the #91 pairs, and #84's `text-emerald-600`. #62 has no sample Prototype of its own.

**Noise.** ±2 and ±4 on one channel, and ±2 and ±3 on all channels, around every token. This stands for hand-typed near-copies.

**Hold-out.** `inputs/css-named.json` holds the CSS named greys, whites and pale tints. It is never used to pick a threshold.

## Judging

A near pick is judged by palette family, never by colour maths, so no guard grades itself. Labels A count every grey-ish family as neutral (slate, zinc, stone, coolGray and so on). Labels B make each tinted neutral its own family. Labels B is reported as a sensitivity check only. Pure greys and zinc-type greys (C ≈ 0.005) can't be told apart by colour, so every guard scores thousands wrong under labels B.

- **Wrong:** the nearest candidate the guard keeps has an incompatible family.
- **Missed:** with no guard there was a right candidate within ΔE 0.02, and the guard keeps none.
