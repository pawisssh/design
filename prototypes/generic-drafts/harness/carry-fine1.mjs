// PROTOTYPE (#65): carry approved drafts over a re-run by key, gated on an evidence fingerprint.
//
// A draft's fingerprint is sha256 of the exact-tier facts it was drafted from, chosen by its key
// (never by the agent, and never including line numbers, so a moved line is not a change):
//   <f>.axes.<cvaAxis>.*        -> that cva axis {values: classes, default}, or the TS prop union + default
//   <f>.axes.state|<attr axis>  -> the family's sorted state- and attribute-prefixed classes
//   <f>.anatomy|layout|textStyles.<node> -> that data-slot function {element, attrs, classes, props}
//                                  (a node with no data-slot: the family root's)
//   anything else (family.*, properties, excluded, icons, figma.*) -> the whole family's facts
//
// usage:
//   node carry.mjs stamp  <drafts.json> <exact.json> <out.json>          add fingerprints (what approval pins)
//   node carry.mjs carry  <stamped.json> <new-exact.json> <out.json>     split into carried / reopened
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = s => 'sha256:' + createHash('sha256').update(s).digest('hex');
const canon = v => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => !/^(line|baseLine)$/.test(k)).map(k => [k, canon(v[k])])) : v;
const hash = v => sha(JSON.stringify(canon(v)));
const STATE = /^(hover|focus-visible|focus|active|disabled|aria-[\w-]+|data-\[state=[^\]]+\]|dark:(hover|focus-visible|active|disabled|aria-[\w-]+)):/;

export function facts(exact, key) {
  const [f, area, sub] = key.split('.');
  const c = exact.components[f];
  if (!c) return null;
  const cva = Object.values(c.cvas)[0];
  const root = c.slots.find(s => s.dataSlot === f) || c.slots[0];
  if (area === 'axes') {
    if (cva && cva.variants[sub]) return { axis: cva.variants[sub], default: cva.defaultVariants[sub] };
    if (root.props[sub]) return { union: root.props[sub], default: root.defaults[sub] };
    const all = [cva && cva.base, ...(cva ? Object.values(cva.variants).flatMap(a => Object.values(a).map(v => v.classes)) : []), ...c.slots.flatMap(s => s.classes)]
      .filter(Boolean).join(' ').split(/\s+/);
    return { stateClasses: [...new Set(all.filter(x => STATE.test(x)))].sort() };
  }
  if (area === 'anatomy' || area === 'layout' || area === 'textStyles') {
    const slot = c.slots.find(s => s.dataSlot === sub) || root;
    return { slot: { element: slot.element, attrs: slot.attrs, classes: slot.classes, props: slot.props, defaults: slot.defaults, cva: slot.cva && c.cvas[slot.cva] } };
  }
  return { family: c };
}

// --fine: each key kind pins only the facts its value is drafted from.
//   axis/value labels   -> the axis's value keys (a label names a key; a class change cannot move it)
//   state/attr axes     -> the set of state and attribute prefixes used
//   anatomy, properties -> the node's element, data-slot, attrs, props, and the family's node-addressing classes
//   layout.<node>       -> the node's layout classes, sizes normalised (h-9 and h-10 are both "fixed")
//   textStyles.<node>   -> the node's text classes
//   family, excluded, figma.grid, icons -> axis keys, value keys, defaults, compound variants, slot list,
//                          plus node-addressing classes for icons
const words = c => [Object.values(c.cvas).flatMap(v => [v.base, ...Object.values(v.variants).flatMap(a => Object.values(a).map(x => x.classes))]), c.slots.flatMap(s => s.classes)]
  .flat().filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
const slotWords = (c, slot) => [slot.classes, slot.cva && (v => [v.base, ...Object.values(v.variants).flatMap(a => Object.values(a).map(x => x.classes))])(c.cvas[slot.cva])]
  .flat(2).filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
const ADDRESS = /svg|data-icon|data-\[slot|data-slot|has-|\[&|^\*:/;
const LAYOUT = /^(?:[\w-]+:)*(flex|inline-flex|grid|flex-[\w-]+|items-[\w-]+|justify-[\w-]+|self-[\w-]+|w-[\w./-]+|h-[\w./-]+|size-[\w./-]+|min-[wh]-[\w./-]+|max-[wh]-[\w./-]+|grow|shrink[\w-]*|basis-[\w./-]+|grid-cols-[\w[\]_-]+|col-[\w-]+|row-[\w-]+)$/;
const sizeNorm = w => w.replace(/^((?:[\w-]+:)*)(w|h|size|min-w|min-h|max-w|max-h)-(\d+(?:\.\d+)?|\[[^\]]+\]|px|xs|sm|md|lg|xl|\dxl)$/, '$1$2-#');
const TEXT = /^(?:[\w-]+:)*(text-(xs|sm|base|lg|\dxl|xl)|font-[\w-]+|leading-[\w-]+|tracking-[\w-]+|uppercase|truncate|line-clamp-\d+)$/;
const structure = c => ({
  axes: Object.fromEntries(Object.values(c.cvas).flatMap(v => Object.entries(v.variants).map(([k, a]) => [k, Object.keys(a).sort()]))),
  defaults: Object.values(c.cvas).map(v => v.defaultVariants), compound: Object.values(c.cvas).map(v => v.compoundVariants),
  props: c.slots.map(s => s.props), slots: c.slots.map(s => [s.dataSlot, s.element]),
});
export function factsFine(exact, key) {
  const [f, area, sub] = key.split('.');
  const c = exact.components[f];
  if (!c) return null;
  const root = c.slots.find(s => s.dataSlot === f) || c.slots[0];
  const slot = c.slots.find(s => s.dataSlot === sub) || root;
  const all = words(c);
  const cvaAxis = Object.values(c.cvas).map(v => v.variants[sub]).find(Boolean);
  if (area === 'axes') {
    if (cvaAxis) return { valueKeys: Object.keys(cvaAxis).sort() };
    if (root.props[sub]) return { union: root.props[sub] };
    return { prefixes: [...new Set(all.map(x => (x.match(STATE) || [])[1]).filter(Boolean))].sort() };
  }
  if (area === 'anatomy' || area === 'properties')
    return { node: [slot.element, slot.dataSlot, slot.attrs, slot.props], address: [...new Set(all.filter(x => ADDRESS.test(x)))].sort() };
  if (area === 'layout') return { layout: [...new Set(slotWords(c, slot).filter(x => LAYOUT.test(x)).map(sizeNorm))].sort() };
  if (area === 'textStyles') return { text: [...new Set(slotWords(c, slot).filter(x => TEXT.test(x)))].sort() };
  if (area === 'icons') return { structure: structure(c), address: [...new Set(all.filter(x => ADDRESS.test(x)))].sort() };
  return { structure: structure(c) };
}

const args = process.argv.slice(2);
const fine = args[0] === '--fine' ? (args.shift(), true) : false;
const pick = fine ? factsFine : facts;
const [cmd, a, b, out] = args;
const drafts = JSON.parse(readFileSync(a, 'utf8'));
const exact = JSON.parse(readFileSync(b, 'utf8'));
if (cmd === 'stamp') {
  const stamped = Object.fromEntries(Object.entries(drafts).map(([k, d]) => [k, { ...d, by: 'agent', fingerprint: hash(pick(exact, k)) }]));
  writeFileSync(out, JSON.stringify(stamped, null, 2) + '\n');
  console.log('stamped', Object.keys(stamped).length);
} else if (cmd === 'carry') {
  const carried = {}, reopened = {};
  for (const [k, d] of Object.entries(drafts)) {
    const fp = hash(pick(exact, k));
    if (fp === d.fingerprint) carried[k] = d; else reopened[k] = { ...d, newFingerprint: fp };
  }
  writeFileSync(out, JSON.stringify({ carried, reopened }, null, 2) + '\n');
  // keys only, for the unanchored control re-draft (no previous values)
  writeFileSync(out.replace(/\.json$/, '-keys.json'), JSON.stringify(Object.keys(reopened), null, 2) + '\n');
  const fam = o => Object.keys(o).reduce((m, k) => (m[k.split('.')[0]] = (m[k.split('.')[0]] || 0) + 1, m), {});
  console.log('carried', Object.keys(carried).length, JSON.stringify(fam(carried)), 'reopened', Object.keys(reopened).length, JSON.stringify(fam(reopened)));
  for (const k of Object.keys(reopened)) console.log('  reopened', k);
}
