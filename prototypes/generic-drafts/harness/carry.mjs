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
// A class is variant prefixes + a utility; the prefixes end at the last colon outside brackets
// (has-[>svg]:grid-cols-[auto_1fr] -> has-[>svg]: + grid-cols-[auto_1fr]). Rev 2, after the v3 test:
// rev 1 matched prefixes as [\w-]+: only, so a bracketed prefix hid the class from the layout set.
const split = w => { const m = w.match(/^((?:[^:[]|\[[^\]]*\])*:)?(.*)$/); return [m[1] || '', m[2]]; };
const LAYOUT = /^(flex|inline-flex|grid|flex-[\w-]+|items-[\w-]+|justify-[\w-]+|self-[\w-]+|w-[\w./-]+|h-[\w./-]+|size-[\w./-]+|min-[wh]-[\w./-]+|max-[wh]-[\w./-]+|grow|shrink[\w-]*|basis-[\w./-]+|grid-cols-\S+|grid-rows-\S+|col-[\w-]+|row-[\w-]+|aspect-[\w-]+)$/;
const isLayout = w => LAYOUT.test(split(w)[1]);
const sizeNorm = w => { const [p, u] = split(w); return p + u.replace(/^(w|h|size|min-w|min-h|max-w|max-h)-(\d+(?:\.\d+)?|\[[^\]]+\]|px|xs|sm|md|lg|xl|\dxl)$/, '$1-#'); };
const TEXT = /^(text-(xs|sm|base|lg|\dxl|xl)|font-[\w-]+|leading-[\w-]+|tracking-[\w-]+|uppercase|truncate|line-clamp-\d+)$/;
const isText = w => TEXT.test(split(w)[1]);
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
    // rev 2: the family's part list too, since parent and order depend on the siblings
    return { node: [slot.element, slot.dataSlot, slot.attrs, slot.props], parts: structure(c).slots, address: [...new Set(all.filter(x => ADDRESS.test(x)))].sort() };
  if (area === 'layout') return { layout: [...new Set(slotWords(c, slot).filter(isLayout).map(sizeNorm))].sort() };
  if (area === 'textStyles') return { text: [...new Set(slotWords(c, slot).filter(isText))].sort() };
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
  const carried = {}, reopened = {}, vanished = [], missing = [];
  // The subject a key names: an axis value, or a data-slot node. Gone from the source -> vanished.
  const valueKeys = f => Object.fromEntries(Object.values(exact.components[f]?.cvas || {}).flatMap(v => Object.entries(v.variants).map(([ax, vs]) => [ax, Object.keys(vs)])));
  const slots = f => (exact.components[f]?.slots || []).map(s => s.dataSlot).filter(Boolean);
  const gone = k => {
    const [f, area, sub, kind, v] = k.split('.');
    if (!exact.components[f]) return true;
    if (area === 'axes' && kind === 'values') return valueKeys(f)[sub] && !valueKeys(f)[sub].includes(v);
    if (/^(anatomy|layout|properties|textStyles)$/.test(area) && sub.startsWith(f + '-') && !sub.startsWith('wrap-')) return !slots(f).includes(sub);
    return false;
  };
  for (const [k, d] of Object.entries(drafts)) {
    if (gone(k)) { vanished.push(k); continue; }
    const fp = hash(pick(exact, k));
    if (fp === d.fingerprint) carried[k] = d; else reopened[k] = { ...d, newFingerprint: fp };
  }
  // Keys the new source needs that no draft has: an axis value with no label, a data-slot with no anatomy.
  for (const f of Object.keys(exact.components)) {
    for (const [ax, vs] of Object.entries(valueKeys(f))) for (const v of vs) if (!(`${f}.axes.${ax}.values.${v}.label` in drafts)) missing.push(`${f}.axes.${ax}.values.${v}.label`);
    for (const s of slots(f)) if (!(`${f}.anatomy.${s}` in drafts)) missing.push(`${f}.anatomy.${s}`);
  }
  writeFileSync(out, JSON.stringify({ carried, reopened, vanished, missing }, null, 2) + '\n');
  console.log('vanished', vanished.length, vanished.join(' '), '| missing', missing.length, missing.join(' '));
  // keys only, for the unanchored control re-draft (no previous values)
  writeFileSync(out.replace(/\.json$/, '-keys.json'), JSON.stringify(Object.keys(reopened), null, 2) + '\n');
  const fam = o => Object.keys(o).reduce((m, k) => (m[k.split('.')[0]] = (m[k.split('.')[0]] || 0) + 1, m), {});
  console.log('carried', Object.keys(carried).length, JSON.stringify(fam(carried)), 'reopened', Object.keys(reopened).length, JSON.stringify(fam(reopened)));
  for (const k of Object.keys(reopened)) console.log('  reopened', k);
}
