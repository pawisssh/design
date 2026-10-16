#!/usr/bin/env node
// PROTOTYPE for #91 (Should the near tier guard chroma so a tinted colour never matches a grey token?).
// Throwaway: lives on prototype/chroma-guard only.
//
//   node skills/adapter-carbon/scripts/sources.mjs              (once: the pinned Carbon DTCG files)
//   npm pack tailwindcss@4.3.3 --ignore-scripts                 (in a scratch dir outside the repo; untar it)
//   node prototypes/chroma-guard/measure.mjs --tailwind <scratch>/package/theme.css [--carbon <dir>] [--labels A|B]
//
// Measures #61's near tier (OKLab ΔE ≤ 0.02, role-filtered) with and without a guard, on every distinct
// (raw value, role, Design System mode) whose best tier is near or Off-system. A near match is judged by
// palette family, never by colour maths, so no guard can grade itself:
//   - Carbon theme tokens: the family of the Primitive each mode aliases ({gray.10} -> gray).
//   - Raw Tailwind and Carbon palette colours: the family in their name. shadcn tokens: chroma 0 -> neutral,
//     destructive -> red, dark sidebar-primary -> blue. Sample colours: the author's intent (inputs/samples.json).
//   - Labels A: every grey-ish family is neutral (Tailwind slate/gray/zinc/stone/mauve/olive/mist/taupe,
//     Carbon coolGray/warmGray). Labels B: only chroma-0 families are neutral; each tinted neutral is its own family.
// A near pick is right when both sides are neutral, or both are hued with an overlapping hue family.
// A guard is a candidate filter applied before ranking, so a blue tint can still near-match a blue token.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '../../');
const { values: args } = parseArgs({
  options: {
    carbon: { type: 'string', default: join(REPO, '.scratch/adapter-carbon/sources/carbon') },
    tailwind: { type: 'string' },
    shadcn: { type: 'string', default: join(HERE, 'inputs/shadcn-neutral.globals.css') },
    samples: { type: 'string', default: join(HERE, 'inputs/samples.json') },
    labels: { type: 'string', default: 'A' },
    out: { type: 'string', default: join(HERE, 'out') },
  },
});
if (!args.tailwind) throw new Error('--tailwind <path to tailwindcss@4.3.3 package/theme.css> is required');
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));

// ---------- converter: the #70 algorithm (CSS Color 4 to sRGB, clip per channel, round to 8-bit) ----------
// skills/contract/scripts/color.mjs is not on main yet; this is the clip path of issue70-gamut-measure.mjs.
const enc = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const dec = x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3;
  const m = (L - 0.1055613458156586 * a - 0.0638541728258133 * b) ** 3;
  const s = (L - 0.0894841775298119 * a - 1.2914855480194092 * b) ** 3;
  return [
    4.0767416360759583 * l - 3.3077115392580629 * m + 0.2309699031821043 * s,
    -1.2684380040921763 * l + 2.6097574006633715 * m - 0.3413193963102197 * s,
    -0.0041960865418371 * l - 0.7034186144594493 * m + 1.7076147009309444 * s,
  ];
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const hexOf = rgb => '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
/** CSS colour text -> { hex, alpha } (hex, oklch only: all this corpus has). */
function toHex(css) {
  css = css.trim().toLowerCase();
  let m = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    return { hex: `#${h}`, alpha: 1 };
  }
  m = css.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+|none)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/);
  if (m) {
    const L = m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]), C = parseFloat(m[3]), H = m[4] === "none" ? 0 : (parseFloat(m[4]) * Math.PI) / 180;
    const alpha = m[5] === undefined ? 1 : m[6] ? parseFloat(m[5]) / 100 : parseFloat(m[5]);
    return { hex: hexOf(oklabToLinear([L, C * Math.cos(H), C * Math.sin(H)]).map(enc)), alpha };
  }
  throw new Error(`unsupported colour ${css}`);
}
const labCache = new Map();
const lab = hex => {
  if (!labCache.has(hex)) labCache.set(hex, linearToOklab([1, 3, 5].map(i => dec(parseInt(hex.slice(i, i + 2), 16) / 255))));
  return labCache.get(hex);
};
const chroma = hex => Math.hypot(lab(hex)[1], lab(hex)[2]);
const hueDeg = hex => ((Math.atan2(lab(hex)[2], lab(hex)[1]) * 180) / Math.PI + 360) % 360;
const deltaE = (p, q) => Math.hypot(...lab(p).map((v, i) => v - lab(q)[i]));
const deltaAB = (p, q) => Math.hypot(lab(p)[1] - lab(q)[1], lab(p)[2] - lab(q)[2]);
const exact = (p, q) => [1, 3, 5].every(i => Math.abs(parseInt(p.slice(i, i + 2), 16) - parseInt(q.slice(i, i + 2), 16)) <= 1);

// ---------- families ----------
const TINTED_NEUTRALS = new Set(['coolGray', 'warmGray', 'slate', 'gray-tw', 'zinc', 'stone', 'mauve', 'olive', 'mist', 'taupe']);
const PURE_NEUTRALS = new Set(['gray', 'white', 'black', 'neutral']);
// Coarse hue families shared by both palettes [assumption]; a Tailwind family between two Carbon hues gets both.
const HUES = {
  red: ['red'], orange: ['orange'], yellow: ['yellow'], green: ['green'], teal: ['teal'], cyan: ['cyan'], blue: ['blue'], purple: ['purple'], magenta: ['magenta'],
  amber: ['orange', 'yellow'], lime: ['green', 'yellow'], emerald: ['green', 'teal'], sky: ['cyan', 'blue'], indigo: ['blue', 'purple'],
  violet: ['purple'], fuchsia: ['magenta', 'purple'], pink: ['magenta'], rose: ['red', 'magenta'],
};
function label(family) {
  if (PURE_NEUTRALS.has(family)) return { family, neutral: true, set: ['neutral'] };
  if (TINTED_NEUTRALS.has(family)) return args.labels === 'A' ? { family, neutral: true, set: ['neutral'] } : { family, neutral: true, set: [`tinted:${family === 'gray-tw' ? 'gray' : family}`] };
  if (!HUES[family]) throw new Error(`no hue family for ${family}`);
  return { family, neutral: false, set: HUES[family] };
}
const compatible = (a, b) => (a.neutral || b.neutral ? a.neutral && b.neutral && a.set.some(x => b.set.includes(x)) : a.set.some(x => b.set.includes(x)));

// ---------- Design System targets: { system, mode, tokens: [{ name, hex, label, roles }] } ----------
const ROLES = ['background-color', 'color', 'border-color'];
// Carbon: #61's group-by-role, as in the #63 stand-in (build.mjs ROLE_GROUPS), at Figma-group level.
const CARBON_ROLE = {
  'background-color': n => /^(background|layer|field)(-|$)/.test(n),
  color: n => /^(text|link|icon)-/.test(n),
  'border-color': n => /^border-/.test(n),
};
const carbonColors = readJson(join(args.carbon, 'packages/colors/src/dtcg/colors.json'));
const palette = {};
for (const [k, v] of Object.entries(carbonColors)) {
  if (k.startsWith('$')) continue;
  if ('$value' in v) palette[k] = v.$value.toLowerCase();
  else for (const [step, node] of Object.entries(v)) if (!step.startsWith('$')) palette[`${k}.${step}`] = node.$value.toLowerCase();
}
const familyOfKey = key => key.replace(/Hover$/, '').split('.')[0];
const themes = readJson(join(args.carbon, 'packages/themes/src/dtcg/themes.json'));
const carbonTokens = [];
(function walk(node, path) {
  if (!node || typeof node !== 'object') return;
  if (node.$extensions?.['carbon.themes']) carbonTokens.push({ name: path.join('-'), modes: node.$extensions['carbon.themes'] });
  for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) walk(v, [...path, k]);
})(themes, []);
const targets = [];
let skippedCarbon = 0;
for (const mode of ['white', 'g10', 'g90', 'g100']) {
  const tokens = [];
  for (const t of carbonTokens) {
    const v = t.modes[mode];
    const ref = typeof v === 'string' ? v : null; // {value, alpha} forms are translucent: never near an opaque raw value
    if (!ref || !ref.startsWith('{')) { skippedCarbon++; continue; }
    const key = ref.replace(/^\{|\}$/g, '').replace(/\.default$/, '');
    if (!palette[key]) throw new Error(`${t.name} ${mode}: unknown primitive ${ref}`);
    const roles = ROLES.filter(r => CARBON_ROLE[r](t.name));
    if (roles.length) tokens.push({ name: t.name, hex: palette[key], label: label(familyOfKey(key)), roles, primitive: key });
  }
  targets.push({ system: 'carbon', mode, tokens });
}
// shadcn neutral (the theme `shadcn init` wrote into the #84 v0 app). Role table [assumption]: surfaces for
// backgrounds, foregrounds plus primary/destructive for text (text-primary, text-destructive), border/input/ring for borders.
const SHADCN_ROLE = {
  'background-color': n => /^(background|card|popover|primary|secondary|muted|accent|destructive|sidebar|sidebar-primary|sidebar-accent|chart-\d)$/.test(n),
  color: n => /foreground$/.test(n) || /^(primary|destructive)$/.test(n),
  'border-color': n => /^(border|input|ring|sidebar-border|sidebar-ring)$/.test(n),
};
const twCss = readFileSync(args.tailwind, 'utf8');
const tw = {}; // 'zinc-500' -> oklch text
for (const [, fam, step, css] of twCss.matchAll(/--color-([a-z]+)-(\d+):\s*(oklch\([^)]*\))/g)) tw[`${fam}-${step}`] = css;
// The neutral theme is what `shadcn init` wrote into the #84 app. Every grey in it is a Tailwind neutral step
// (oklch(0.145 0 0) = neutral-950). The other base colours are derived by swapping that step's family
// [assumption: shadcn's base colours are a step-for-step family swap; the npm tarball does not ship themes.ts].
const neutralStepOf = L => Object.keys(tw).find(k => k.startsWith('neutral-') && Math.abs(parseFloat(tw[k].match(/oklch\(([\d.]+)/)[1]) / 100 - L) < 1e-6);
const shadcnCss = readFileSync(args.shadcn, 'utf8');
for (const base of ['neutral', 'zinc', 'stone', 'gray', 'slate'])
  for (const [mode, sel] of [['light', ':root'], ['dark', '.dark']]) {
    const block = shadcnCss.slice(shadcnCss.indexOf(`${sel} {`)).split('}')[0];
    const tokens = [];
    for (const [, name, text] of block.matchAll(/--([\w-]+):\s*(oklch\([^)]*\))/g)) {
      let css = text, family;
      const grey = text.match(/^oklch\(([\d.]+) 0 0\)$/);
      if (grey && parseFloat(grey[1]) < 1) {
        const step = neutralStepOf(parseFloat(grey[1]));
        if (!step) throw new Error(`shadcn ${name} ${text}: not a Tailwind neutral step`);
        css = tw[step.replace('neutral', base)];
        family = base === 'gray' ? 'gray-tw' : base;
      }
      const { hex, alpha } = toHex(css);
      if (alpha !== 1) continue;
      family ??= chroma(hex) < 1e-3 ? 'neutral' : name === 'destructive' ? 'red' : name === 'sidebar-primary' ? 'blue' : null;
      if (!family) throw new Error(`shadcn ${mode} ${name}: chromatic token with no family`);
      const roles = ROLES.filter(r => SHADCN_ROLE[r](name));
      if (roles.length) tokens.push({ name, hex, label: label(family), roles });
    }
    targets.push({ system: base === 'neutral' ? 'shadcn' : `shadcn-${base}`, mode, tokens });
  }

// ---------- raw values: { raw, hex, label, source, roles } ----------
const raws = [];
for (const [key, css] of Object.entries(tw)) {
  const fam = key.split('-')[0];
  raws.push({ raw: key, hex: toHex(css).hex, label: label(fam === 'gray' ? 'gray-tw' : fam), source: 'tailwind', roles: ROLES });
}
// Hold-out, never used to pick a threshold: CSS named colours, labelled by name [assumption, see inputs/css-named.json].
for (const n of readJson(join(HERE, 'inputs/css-named.json')).colors)
  raws.push({ raw: n.name, hex: n.hex, label: label(n.family), source: 'css-named', roles: ROLES });
for (const [key, hex] of Object.entries(palette)) raws.push({ raw: key, hex, label: label(familyOfKey(key)), source: 'carbon-primitive', roles: ROLES });
for (const t of targets.filter(t => t.system === 'shadcn'))
  for (const tok of t.tokens) raws.push({ raw: `shadcn ${t.mode} ${tok.name}`, hex: tok.hex, label: tok.label, source: 'shadcn-theme', roles: ROLES });
for (const s of readJson(args.samples).samples)
  raws.push({ raw: `${s.raw} (${s.from})`, hex: toHex(s.raw).hex, label: label(s.family), source: 'sample', roles: [s.role] });
// Hand-typed noise around every token value: ±2 and ±4 in one channel, ±2/±3 in all three. Same family as the token.
const NOISE = [];
for (const d of [-4, -2, 2, 4]) for (const ch of [0, 1, 2]) NOISE.push([0, 1, 2].map(i => (i === ch ? d : 0)));
for (const d of [-3, -2, 2, 3]) NOISE.push([d, d, d]);
const seenNoise = new Set();
for (const t of targets)
  for (const tok of t.tokens)
    for (const n of NOISE) {
      const rgb = [1, 3, 5].map((i, k) => Math.min(255, Math.max(0, parseInt(tok.hex.slice(i, i + 2), 16) + n[k])) / 255);
      const hex = hexOf(rgb);
      const key = `${hex} ${tok.label.set.join('+')} ${tok.label.neutral}`;
      if (exact(hex, tok.hex) || seenNoise.has(key)) continue;
      seenNoise.add(key);
      raws.push({ raw: `${tok.hex}${n.map(x => (x >= 0 ? '+' : '') + x).join('')}`, hex, label: tok.label, source: 'noise', roles: ROLES });
    }

// ---------- the matcher with a pluggable candidate guard ----------
const NEAR = 0.02;
function decide(raw, role, target, guard, near = NEAR) {
  const inRole = target.tokens.filter(t => t.roles.includes(role));
  if (inRole.some(t => exact(t.hex, raw.hex))) return null; // exact tier: the near guard never sees it
  const ranked = inRole.map(t => ({ t, d: deltaE(raw.hex, t.hex) })).filter(c => c.d <= near).sort((a, b) => a.d - b.d || a.t.name.localeCompare(b.t.name));
  const kept = ranked.filter(c => guard(raw.hex, c.t.hex));
  return { ranked, kept, pick: kept[0] || null };
}

const GUARDS = [{ id: 'none', kind: 'none', fn: () => true }];
for (const x of [0.004, 0.006, 0.008, 0.01, 0.012, 0.014, 0.016, 0.018]) GUARDS.push({ id: `dab<=${x}`, kind: 'Δab cap', x, fn: (p, q) => deltaAB(p, q) <= x });
for (const x of [0.004, 0.006, 0.008, 0.01, 0.012, 0.014]) GUARDS.push({ id: `dC<=${x}`, kind: 'ΔC cap', x, fn: (p, q) => Math.abs(chroma(p) - chroma(q)) <= x });
for (const f of [0.004, 0.006, 0.008, 0.009, 0.01, 0.011, 0.012, 0.0125, 0.013, 0.015, 0.02]) {
  GUARDS.push({ id: `chroma-asym@${f}`, kind: 'chroma floor, chromatic raw vs achromatic token', x: f, fn: (p, q) => !(chroma(p) >= f && chroma(q) < f) });
  GUARDS.push({ id: `chroma-sym@${f}`, kind: 'chroma floor, both directions', x: f, fn: (p, q) => chroma(p) >= f === chroma(q) >= f });
}
const hueDiff = (p, q) => { const d = Math.abs(hueDeg(p) - hueDeg(q)); return Math.min(d, 360 - d); };
for (const th of [10, 20, 30, 45])
  GUARDS.push({ id: `hue<=${th}°`, kind: 'hue angle (only when both chroma ≥ 0.01)', x: th, fn: (p, q) => !(chroma(p) >= 0.01 && chroma(q) >= 0.01) || hueDiff(p, q) <= th });
for (const f of [0.006, 0.008, 0.01, 0.012])
  GUARDS.push({ id: `chroma-sym@${f}+hue<=30°`, kind: 'chroma floor both directions + hue angle', x: f, fn: (p, q) => chroma(p) >= f === chroma(q) >= f && (!(chroma(p) >= f && chroma(q) >= f) || hueDiff(p, q) <= 30) });
for (const f of [0.008, 0.01, 0.012])
  for (const th of [20, 30, 45])
    GUARDS.push({ id: `chroma-asym@${f}+hue<=${th}°`, kind: 'chroma floor (chromatic raw vs achromatic token) + hue angle', x: f, fn: (p, q) => !(chroma(p) >= f && chroma(q) < f) && (!(chroma(p) >= f && chroma(q) >= f) || hueDiff(p, q) <= th) });
// A tighter ΔE alone, for comparison (not a guard: it shrinks the near radius for every colour).
const RADII = [0.01, 0.012, 0.014, 0.015, 0.016, 0.018];

// ---------- run ----------
const decisions = []; // every (raw, role, target) that reaches the near/Off-system stage
const seen = new Set();
for (const target of targets)
  for (const raw of raws)
    for (const role of raw.roles) {
      const key = `${raw.source}|${raw.hex}|${raw.label.set.join('+')}|${raw.label.neutral}|${role}|${target.system}:${target.mode}|${raw.source === 'sample' ? raw.raw : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const base = decide(raw, role, target, () => true, 0.2);
      if (!base) continue;
      decisions.push({ raw, role, target, all: base.ranked });
    }

function score(guardFn, near = NEAR, filter = () => true) {
  const s = { right: 0, wrong: 0, missed: 0, off: 0, wrongCandidates: 0, wrongList: [], missedList: [] };
  for (const d of decisions) {
    if (!filter(d)) continue;
    const ranked = d.all.filter(c => c.d <= near);
    const baseRight = ranked.some(c => compatible(d.raw.label, c.t.label));
    const kept = ranked.filter(c => guardFn(d.raw.hex, c.t.hex));
    const pick = kept[0];
    s.wrongCandidates += kept.filter(c => !compatible(d.raw.label, c.t.label)).length;
    if (!pick) {
      if (baseRight) { s.missed++; s.missedList.push(d); } else s.off++;
    } else if (compatible(d.raw.label, pick.t.label)) s.right++;
    else { s.wrong++; s.wrongList.push({ d, pick }); }
  }
  return s;
}
const fmt = n => n.toFixed(4);
const show = (d, pick) => `${d.raw.source.padEnd(16)} ${d.raw.raw.padEnd(44)} ${d.raw.hex} [${d.raw.label.family}] ${d.role.padEnd(16)} ${d.target.system}:${d.target.mode.padEnd(5)} -> ${pick ? `${pick.t.name} ${pick.t.hex} [${pick.t.label.family}] ΔE ${fmt(pick.d)} Δab ${fmt(deltaAB(d.raw.hex, pick.t.hex))} C ${fmt(chroma(d.raw.hex))}/${fmt(chroma(pick.t.hex))}` : 'Off-system'}`;

const SOURCES = ['tailwind', 'carbon-primitive', 'shadcn-theme', 'sample', 'noise', 'css-named'];
const nearDecisions = decisions.filter(d => d.all.some(c => c.d <= NEAR));
const lines = [];
const log = s => { lines.push(s); console.log(s); };
log(`labels ${args.labels}; ${raws.length} raw values (${SOURCES.map(k => `${raws.filter(r => r.source === k).length} ${k}`).join(', ')})`);
log(`targets: ${targets.map(t => `${t.system}:${t.mode} ${t.tokens.length}`).join(', ')} (Carbon translucent token-modes skipped: ${skippedCarbon})`);
log(`${decisions.length} distinct (raw, role, mode) decisions past the exact tier; ${nearDecisions.length} have a candidate within ΔE ${NEAR}`);
const SELECT = d => d.raw.source !== 'css-named'; // the hold-out never picks a threshold
const HOLDOUT = d => d.raw.source === 'css-named';
const SEL_SOURCES = SOURCES.filter(k => k !== 'css-named');
log('');
log(`selection set (${decisions.filter(SELECT).length} decisions, ${nearDecisions.filter(SELECT).length} with a near candidate):`);
log('guard'.padEnd(30) + ` right  WRONG  missed    off  wrong-offered   wrong | missed by source (${SEL_SOURCES.join('/')})`);
const bySource = list => SEL_SOURCES.map(k => list.filter(x => (x.d || x).raw.source === k).length).join('/');
const results = [];
const row = (id, s, extra = '') => `${id.padEnd(30)} ${String(s.right).padStart(5)} ${String(s.wrong).padStart(6)} ${String(s.missed).padStart(7)} ${String(s.off).padStart(6)} ${String(s.wrongCandidates).padStart(13)}   ${extra}`;
for (const g of GUARDS) {
  const s = score(g.fn, NEAR, SELECT), h = score(g.fn, NEAR, HOLDOUT);
  results.push({ id: g.id, kind: g.kind, x: g.x, right: s.right, wrong: s.wrong, missed: s.missed, off: s.off, wrongCandidates: s.wrongCandidates, wrongBySource: bySource(s.wrongList), missedBySource: bySource(s.missedList), holdout: { right: h.right, wrong: h.wrong, missed: h.missed } });
  log(row(g.id, s, `${bySource(s.wrongList)} | ${bySource(s.missedList)}`));
}
log('');
log('tighter ΔE radius, no guard (missed = right at 0.02, gone at this radius):');
const base = score(() => true, NEAR, SELECT);
for (const r of RADII) {
  const s = score(() => true, r, SELECT);
  log(`${`ΔE<=${r}`.padEnd(30)} right ${s.right} WRONG ${s.wrong} missed ${base.right - s.right}`);
  results.push({ id: `dE<=${r}`, kind: 'ΔE radius', x: r, right: s.right, wrong: s.wrong, missed: base.right - s.right });
}
log('');
log(`hold-out: CSS named colours (${decisions.filter(HOLDOUT).length} decisions, ${nearDecisions.filter(HOLDOUT).length} with a near candidate):`);
for (const r of results.filter(r => r.holdout && /^(none|chroma-|dab<=0.01$|dab<=0.012$)/.test(r.id))) log(`${r.id.padEnd(30)} right ${r.holdout.right} WRONG ${r.holdout.wrong} missed ${r.holdout.missed}`);
log('');
log('by Design System (selection set), right/WRONG/missed:');
const SYSTEMS = [...new Set(targets.map(t => t.system))];
log('guard'.padEnd(30) + ' ' + SYSTEMS.map(s => s.padStart(16)).join(''));
for (const g of GUARDS.filter(g => /^(none|chroma-(a?sym)@0.0(08|1|12)(\+hue<=30°)?$|dab<=0.01$|dab<=0.012$|dC<=0.012$)/.test(g.id)))
  log(g.id.padEnd(30) + ' ' + SYSTEMS.map(sys => { const s = score(g.fn, NEAR, d => SELECT(d) && d.target.system === sys); return `${s.right}/${s.wrong}/${s.missed}`.padStart(16); }).join(''));

// ---------- detail for the baseline and the chosen guard ----------
const CHOSEN = process.env.CHOSEN || 'chroma-asym@0.01';
const chosen = GUARDS.find(g => g.id === CHOSEN);
for (const [title, g] of [['none', GUARDS[0]], [CHOSEN, chosen]]) {
  const s = score(g.fn);
  log('');
  log(`== ${title}: wrong near picks (${s.wrong}) ==`);
  for (const { d, pick } of s.wrongList.filter(x => x.d.raw.source !== 'noise')) log(show(d, pick));
  const noiseWrong = s.wrongList.filter(x => x.d.raw.source === 'noise');
  if (noiseWrong.length) { log(`  + ${noiseWrong.length} from noise, e.g.`); for (const { d, pick } of noiseWrong.slice(0, 8)) log('  ' + show(d, pick)); }
  log(`== ${title}: missed (${s.missed}) ==`);
  for (const d of s.missedList.filter(x => x.raw.source !== 'noise')) log(show(d, d.all.find(c => c.d <= NEAR && compatible(d.raw.label, c.t.label))) + '   (dropped)');
  const noiseMissed = s.missedList.filter(x => x.raw.source === 'noise');
  if (noiseMissed.length) { log(`  + ${noiseMissed.length} from noise, e.g.`); for (const d of noiseMissed.slice(0, 8)) log('  ' + show(d, d.all.find(c => c.d <= NEAR && compatible(d.raw.label, c.t.label))) + '   (dropped)'); }
}

// ---------- the issue's test case and pairs (hard asserts) ----------
const white = targets.find(t => t.system === 'carbon' && t.mode === 'white');
const pairs = [['#edf5ff', '#f4f4f4', false], ['#fafafa', '#ffffff', true], ['#0f62fe', '#0b5cff', true], ['#18181b', '#161616', true]];
log('');
log(`== #91 pairs under ${CHOSEN} ==`);
for (const [a, b, wantNear] of pairs) {
  const ok = deltaE(a, b) <= NEAR && chosen.fn(a, b);
  log(`${a} -> ${b}: ΔE ${fmt(deltaE(a, b))} Δab ${fmt(deltaAB(a, b))} C ${fmt(chroma(a))}/${fmt(chroma(b))} -> ${ok ? 'near' : 'not near'} ${ok === wantNear ? 'ok' : 'FAIL'}`);
  if (ok !== wantNear) throw new Error(`#91 pair ${a} -> ${b}: expected ${wantNear ? 'near' : 'not near'}`);
}
const tc = decide({ hex: '#edf5ff' }, 'background-color', white, chosen.fn);
const nearest = tc.ranked.length ? tc.ranked : decide({ hex: '#edf5ff' }, 'background-color', white, () => true, 1).ranked;
const prim = Object.entries(palette).find(([, h]) => exact(h, '#edf5ff'))?.[0];
log(`test case #edf5ff background-color on Carbon White: ${tc.pick ? `near ${tc.pick.t.name}` : 'Off-system'}; nearest ${nearest.slice(0, 3).map(c => `${c.t.name} ${fmt(c.d)}`).join(', ')}; primitive ${prim}`);
// layer-01, field-01 and field-03 are all #f4f4f4 in White: a tie the agent pick breaks by role (#61).
if (tc.pick || !nearest.some(c => c.t.name === 'layer-01' && c.d === nearest[0].d) || prim !== 'blue.10') throw new Error('#91 test case failed');

writeFileSync(join(args.out, `results.${args.labels}.json`), JSON.stringify({ labels: args.labels, chosen: CHOSEN, raws: raws.length, decisions: decisions.length, near: nearDecisions.length, results }, null, 2) + '\n');
writeFileSync(join(args.out, `report.${args.labels}.txt`), lines.join('\n') + '\n');
