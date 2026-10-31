// What a built variant should read back as, and a readback in Contract vocabulary (#31, #32).
// Shared by the base-first loop (base-loop.mjs), the build-plan deriver and the coverage check. Rule
// matching, expansion and the closure live only in the shared Contract module.
import { baseTuple, expand, resolve, variantName } from '../../contract/scripts/contract.mjs';
import { valueAt } from './foundations-value.mjs';
import { familyNodes, heldRefs, nestedBack, nestedOf } from './nested.mjs';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isToken = v => isObj(v) && 'token' in v;
const isRaw = v => isObj(v) && 'raw' in v;

// ---------- what a variant should read back as ----------

/** The review specimen's property values: TEXT and INSTANCE_SWAP at their default, every BOOLEAN on (Icon = true). */
export function reviewProps(contract) {
  return Object.fromEntries(contract.properties.map(p => [p.key, p.type === 'BOOLEAN' ? true : p.default]));
}

/** Every property at its default: what a Component Set's variants show, since the set's property defaults drive them. */
export function defaultProps(contract) {
  return Object.fromEntries(contract.properties.map(p => [p.key, p.default]));
}

/**
 * The property values the Base Component is built and read back at. While it stands alone (the base-first
 * loop, before the batch build) it is the review specimen, so the owner sees every optional layer. Once its
 * Component Set holds it, it is a variant like the others, at the property defaults, since the set's
 * property definitions drive every variant. `inSet`: the ledger records a set for the family.
 */
export function baseProps(contract, inSet) {
  return inSet ? defaultProps(contract) : reviewProps(contract);
}

// "icon:default" -> the Contract's default icon key; "icon:<key>" -> key.
export const iconRef = (contract, ref) => {
  const key = String(ref).replace(/^icon:/, '');
  return key === 'default' ? contract.icons && contract.icons.default : key;
};

/**
 * The anatomy as a readback reports it: name, type and children (an instance's children are not part of it).
 * `types` names the nodes built as another type ({node: type}, an arc's VECTOR).
 */
export function anatomyTree(node, types = {}) {
  const out = { name: node.name, type: types[node.name] || node.type };
  if (node.type !== 'INSTANCE' && node.children && node.children.length) out.children = node.children.map(c => anatomyTree(c, types));
  return out;
}

/**
 * An arc's stroke path (#442), in its parent's coordinates for a w×h box at (0, 0): the centre line of a stroke
 * `weight` wide, clockwise from `start` degrees (0 at the top) through `sweep`, as cubic pieces of at most 90°.
 * Returns the path's tokens ['M', x, y, 'C', ...], numbers rounded to 1e-7.
 */
function arcPath(w, h, weight, { start, sweep }) {
  const r = w / 2 - weight / 2;
  const rad = d => (d * Math.PI) / 180;
  const at = a => [w / 2 + r * Math.sin(a), h / 2 - r * Math.cos(a)];
  const round = v => Math.round(v * 1e7) / 1e7 + 0;
  const n = Math.ceil(sweep / 90 - 1e-9);
  const d = ['M', ...at(rad(start)).map(round)];
  for (let i = 0; i < n; i++) {
    const a = rad(start + (sweep * i) / n);
    const b = rad(start + (sweep * (i + 1)) / n);
    const k = ((r * 4) / 3) * Math.tan((b - a) / 4);
    const [p0, p3] = [at(a), at(b)];
    d.push('C', ...[p0[0] + k * Math.cos(a), p0[1] + k * Math.sin(a), p3[0] - k * Math.cos(b), p3[1] - k * Math.sin(b), ...p3].map(round));
  }
  return d;
}

// The Figma fields the builder writes for a variant's geometry (#442), beside the Contract's, which the readback
// reports like any other. A full circle is an ELLIPSE with strokeAlign inside, at (0, 0) under a parent without
// Auto Layout. An arc is a stroked VECTOR with strokeAlign center whose box Figma owns: it carries its path and
// no size or position. An absolute node sits centred in its parent, which does not clip it. Changes `r` in place;
// returns {types: the VECTOR nodes, drawn: {node: [field]}}.
function draw(contract, r, foundations) {
  const types = {};
  const drawn = {};
  const add = (node, fields) => {
    Object.assign((r.layout[node] = r.layout[node] || {}), fields);
    (drawn[node] = drawn[node] || []).push(...Object.keys(fields));
  };
  const px = (v, at) => {
    const x = isToken(v) ? foundations && valueAt(foundations, v.token) : isRaw(v) ? v.raw : v;
    if (typeof x !== 'number') throw new Error(`${at} needs a number to draw the arc: give the foundations document`);
    return x;
  };
  (function walk(n, parent) {
    const L = r.layout[n.name] || {};
    if (n.type === 'ELLIPSE') {
      const { arc, ...rest } = L;
      if (arc && arc.sweep < 360) {
        const { width, height, ...kept } = rest;
        types[n.name] = 'VECTOR';
        r.layout[n.name] = kept;
        // Figma draws a stroke 1 px wide when no rule sets one
        const weight = L.strokeWeight === undefined ? 1 : px(L.strokeWeight, `${n.name}.strokeWeight`);
        add(n.name, { strokeAlign: 'center', path: { d: arcPath(px(width, `${n.name}.width`), px(height, `${n.name}.height`), weight, arc) }, dashPattern: [] });
      } else {
        r.layout[n.name] = rest;
        const dir = (r.layout[parent.name] || {}).direction;
        add(n.name, { strokeAlign: 'inside', dashPattern: [], ...(dir === undefined || dir === 'none' ? { x: 0, y: 0 } : {}) });
      }
    }
    if (L.position === 'absolute') {
      add(n.name, { offCentre: 0 });
      add(parent.name, { clipsContent: false });
    }
    (n.children || []).forEach(c => walk(c, n));
  })(contract.anatomy, null);
  return { types, drawn };
}

/**
 * What one variant should read back as, for the property values `props`:
 * {tuple, name, tree, layout, paint, visible, text, swap, refs, drawn}. `visible` covers every node below the root,
 * `text` the TEXT property's node, `swap` each INSTANCE node's icon key, `refs` the property each bound
 * node field follows ({node: {field: propertyKey}}). `layout` holds the fields the builder draws (see draw), which
 * `drawn` lists by node, and `tree` an arc as the VECTOR it is drawn as. `foundations` (the Foundations document)
 * gives an arc's token sizes their numbers. A nested instance (#593) swaps to its held variant's ref
 * (`family:<designSystem>/<key>/<tupleKey>`), and `props` holds its property values by label (see nested.mjs
 * nestedOf), which `held` ({designSystem, contracts}) resolves.
 */
export function expectedVariant(contract, tuple, props, foundations, held) {
  const r = resolve(contract, tuple);
  const visible = {};
  const text = {};
  const swap = {};
  const refs = {};
  (function walk(n, root) {
    if (!root) visible[n.name] = true;
    if (n.type === 'INSTANCE' && /^icon:/.test(n.instanceOf || '')) swap[n.name] = iconRef(contract, n.instanceOf);
    (n.children || []).forEach(c => walk(c, false));
  })(contract.anatomy, true);
  // A `visible` layout field (#93) is property wiring for the core, not a layout fragment.
  for (const [node, fields] of Object.entries(r.layout))
    if ('visible' in fields) { visible[node] = fields.visible; delete fields.visible; }
  for (const p of contract.properties)
    for (const b of r.binds[p.key]) {
      (refs[b.node] = refs[b.node] || {})[b.field] = p.key;
      if (p.type === 'BOOLEAN' && b.field === 'visible') visible[b.node] = !!props[p.key];
      if (p.type === 'TEXT' && b.field === 'characters') text[b.node] = props[p.key];
      if (p.type === 'INSTANCE_SWAP' && b.field === 'mainComponent') swap[b.node] = iconRef(contract, props[p.key]);
    }
  const nested = {};
  if (familyNodes(contract).length)
    for (const [node, n] of Object.entries(nestedOf(contract, tuple, held))) { swap[node] = n.ref; nested[node] = n.props; }
  const { types, drawn } = draw(contract, r, foundations);
  return { tuple, name: variantName(contract, tuple), tree: anatomyTree(contract.anatomy, types), layout: r.layout, paint: r.paint, visible, text, swap, refs, drawn, props: nested };
}

/** What the Base Component should read back as, for `props` (default: the review specimen; see baseProps). */
export function expectedBase(contract, props = reviewProps(contract), foundations) {
  return expectedVariant(contract, baseTuple(contract), props, foundations);
}

// ---------- readback: Figma ids -> Contract vocabulary ----------

/**
 * A core readback (ids) in Contract vocabulary: `{var: id}` becomes `{token: flatName}` and
 * `{style: id}` becomes `{token: styleName}` through the file's ledger; a swap's component id becomes the
 * icon key, or a held variant's ref through the ledger's sets and `held` (#593); a nested instance's properties and
 * overrides (`nested`) become `props` and `over` (nested.mjs nestedBack). An id the ledger does not know becomes
 * `{token: null, id}`.
 */
export function normalizeReadback(raw, ledger, held = null) {
  const f = (ledger && ledger.foundations) || {};
  const byId = {};
  const add = (map, kind) => { for (const [name, id] of Object.entries(map || {})) byId[id] = { kind, name }; };
  add(f.variables, 'var');
  add(f.textStyles, 'style');
  for (const kind of ['variables', 'textStyles'])
    for (const [name, o] of Object.entries((f.orphans && f.orphans[kind]) || {})) byId[o.id] = { kind: kind === 'variables' ? 'var' : 'style', name };
  const icons = {};
  for (const [key, o] of Object.entries((ledger && ledger.icons && ledger.icons.components) || {})) icons[o.id] = key;
  const map = v => {
    if (Array.isArray(v)) return v.map(map);
    if (!isObj(v)) return v;
    if ('var' in v || 'style' in v) {
      const id = 'var' in v ? v.var : v.style;
      const hit = byId[id];
      return hit && hit.kind === ('var' in v ? 'var' : 'style') ? { token: hit.name } : { token: null, id };
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x)]));
  };
  // a nested instance's main component is a held variant (#593), through the ledger's sets
  const variants = heldRefs(held, ledger);
  const out = { ...raw, layout: map(raw.layout), paint: map(raw.paint) };
  if (raw.swap) out.swap = Object.fromEntries(Object.entries(raw.swap).map(([n, id]) => [n, icons[id] || variants[id] || (id ? `unknown:${id}` : null)]));
  if (raw.nested) {
    delete out.nested;
    Object.assign(out, nestedBack(raw.nested, held, ledger));
  }
  return out;
}

// ---------- problems no Contract difference shows (#236) ----------

const round2 = n => Math.round(n * 100) / 100;
// A text's line in px: its line height (px, or a percent of the font size), else Figma's automatic line, about 1.2 em.
const AUTO_LINE = 1.2;
const lineOf = ({ fontSize, lineHeight }) => typeof lineHeight === 'number' ? lineHeight : typeof fontSize !== 'number' ? 0
  : /%$/.test(lineHeight) ? fontSize * parseFloat(lineHeight) / 100 : fontSize * AUTO_LINE;

/**
 * What a readback shows in its visible texts that the Contract cannot say: a text one line of text is too tall for
 * (`text-wrapped`: it wrapped, because its box is narrower than its words), a text under 1 px wide (`text-narrow`),
 * and a variant narrower than its widest text (`variant-narrow`). Each is {what, node, reason}. Hidden layers and
 * the layers under them are exempt, and a readback whose texts report no size (`extras[node].w` and `.h`, which a
 * core before #236 does not write) has none. A text meant to wrap over several lines is flagged too.
 */
export function textProblems(readback) {
  const extras = readback.extras || {};
  const hidden = new Set(Object.entries(readback.visible || {}).filter(([, v]) => v === false).map(([n]) => n));
  const shown = [];
  (function walk(n, off) {
    off = off || hidden.has(n.name);
    if (!off && extras[n.name]) shown.push(n.name);
    (n.children || []).forEach(c => walk(c, off));
  })(readback.tree || { name: '', children: Object.keys(extras).map(name => ({ name })) }, false);
  const out = [];
  let widest = null;
  for (const node of shown) {
    const { w, h, fontSize, lineHeight } = extras[node];
    if (typeof w !== 'number' || typeof h !== 'number') continue;
    if (!widest || w > extras[widest].w) widest = node;
    if (w < 1) { out.push({ what: 'text-narrow', node, reason: `${round2(w)} px wide` }); continue; }
    const line = lineOf(extras[node]);
    const want = String((readback.text || {})[node] ?? '').split('\n').length;
    const lines = line > 0 ? Math.round(h / line) : 0;
    if (lines > want) out.push({ what: 'text-wrapped', node, reason: `${round2(w)} px wide and ${round2(h)} px high: ${lines} lines of ${round2(line)} px for ${want} line${want === 1 ? '' : 's'} of text` });
  }
  const size = readback.size;
  if (widest && size && typeof size.w === 'number' && size.w + 0.5 < extras[widest].w)
    out.push({ what: 'variant-narrow', node: widest, reason: `${round2(size.w)} px wide, narrower than its text ${widest} (${round2(extras[widest].w)} px)` });
  return out;
}

/**
 * The Contract's own problem with a set: a root width of "fill" in a variant has nothing to fill (the grid hugs, so
 * the root reads back as its content). One {what: 'contract', node, field: 'width', reason} when any of `tuples`
 * resolves the root to fill, else none.
 */
export function rootFillProblems(contract, tuples) {
  const root = contract.anatomy.name;
  const n = tuples.filter(t => (resolve(contract, t).layout[root] || {}).width === 'fill').length;
  return n ? [{ what: 'contract', node: root, field: 'width', reason: `width "fill" has nothing to fill in a hug grid set (${n} of ${tuples.length} variant${tuples.length === 1 ? '' : 's'}): use hug or a fixed width` }] : [];
}

// ---------- comparing values ----------

export const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-3;

/** A value without its annotations (by, was, level, reason, why): what Figma can show. */
export function norm(v) {
  if (Array.isArray(v)) return v.map(normEffect);
  if (isToken(v)) return { token: v.token };
  if (isRaw(v)) return { raw: v.raw };
  return v;
}
// An effect with every numeric field present (Figma reports 0 for what the Contract leaves out).
function normEffect(e) {
  if (!isObj(e)) return e;
  const out = { type: e.type };
  for (const k of ['color', 'spread', 'blur', 'x', 'y']) out[k] = e[k] === undefined ? { raw: k === 'color' ? null : 0 } : norm(e[k]);
  if (e.visible === false) out.visible = false;
  return out;
}

/** Two values are the same once their annotations are dropped (numbers within 1e-3). */
export function same(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (Array.isArray(x) || Array.isArray(y))
    return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((e, i) => same(e, y[i]));
  if (isObj(x) && isObj(y)) {
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])];
    // a nested list or object (an arc's path `d`, #442) compares the same way, numbers within 1e-3
    const nested = v => v !== null && typeof v === 'object';
    return keys.every(k => (nested(x[k]) || nested(y[k]) ? same(x[k], y[k]) : x[k] === y[k] || near(x[k], y[k])));
  }
  return x === y || near(x, y) || (x == null && y == null);
}
