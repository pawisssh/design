// What a built variant should read back as, and a readback in Contract vocabulary (#31, #32).
// Shared by the base-first loop (base-loop.mjs), the build-plan deriver and the coverage check. Rule
// matching, expansion and the closure live only in the shared Contract module.
import { baseTuple, resolve, variantName } from '../../contract/scripts/contract.mjs';

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

/** The anatomy as a readback reports it: name, type and children (an instance's children are not part of it). */
export function anatomyTree(node) {
  const out = { name: node.name, type: node.type };
  if (node.type !== 'INSTANCE' && node.children && node.children.length) out.children = node.children.map(anatomyTree);
  return out;
}

/**
 * What one variant should read back as, for the property values `props`:
 * {tuple, name, tree, layout, paint, visible, text, swap, refs}. `visible` covers every node below the root,
 * `text` the TEXT property's node, `swap` each INSTANCE node's icon key, `refs` the property each bound
 * node field follows ({node: {field: propertyKey}}).
 */
export function expectedVariant(contract, tuple, props) {
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
  for (const p of contract.properties)
    for (const b of r.binds[p.key]) {
      (refs[b.node] = refs[b.node] || {})[b.field] = p.key;
      if (p.type === 'BOOLEAN' && b.field === 'visible') visible[b.node] = !!props[p.key];
      if (p.type === 'TEXT' && b.field === 'characters') text[b.node] = props[p.key];
      if (p.type === 'INSTANCE_SWAP' && b.field === 'mainComponent') swap[b.node] = iconRef(contract, props[p.key]);
    }
  return { tuple, name: variantName(contract, tuple), tree: anatomyTree(contract.anatomy), layout: r.layout, paint: r.paint, visible, text, swap, refs };
}

/** What the Base Component should read back as, for `props` (default: the review specimen; see baseProps). */
export function expectedBase(contract, props = reviewProps(contract)) {
  return expectedVariant(contract, baseTuple(contract), props);
}

// ---------- readback: Figma ids -> Contract vocabulary ----------

/**
 * A core readback (ids) in Contract vocabulary: `{var: id}` becomes `{token: flatName}` and
 * `{style: id}` becomes `{token: styleName}` through the file's ledger; a swap's component id becomes the
 * icon key. An id the ledger does not know becomes `{token: null, id}`.
 */
export function normalizeReadback(raw, ledger) {
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
  const out = { ...raw, layout: map(raw.layout), paint: map(raw.paint) };
  if (raw.swap) out.swap = Object.fromEntries(Object.entries(raw.swap).map(([n, id]) => [n, icons[id] || (id ? `unknown:${id}` : null)]));
  return out;
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
    return keys.every(k => (isObj(x[k]) || isObj(y[k]) ? same(x[k], y[k]) : x[k] === y[k] || near(x[k], y[k])));
  }
  return x === y || near(x, y) || (x == null && y == null);
}
