// Nested instances (#593, ADR 0023): a family that holds another family of its own Design System as an INSTANCE
// node `family:<key>`, whose variant and property values the holding Contract's `instances` rules set per variant.
// The held family is built first; a nested instance resolves to the held variant through the ledger's sets.
// `held` is {designSystem, contracts: {key: Contract}}: the holding family's Design System and the Contracts it
// holds, loaded beside it.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { baseTuple, contentHash, expand, resolve, resolveInstances, tupleKey, variantName } from '../../contract/scripts/contract.mjs';
import { readJson } from '../../contract/scripts/io.mjs';

const PROP_TYPES = { TEXT: 'string', BOOLEAN: 'boolean', INSTANCE_SWAP: 'string' };

/** The anatomy's nested instances: [{node, key}] for each INSTANCE node `family:<key>`. */
export function familyNodes(contract) {
  const out = [];
  (function walk(n) {
    const m = n.type === 'INSTANCE' && /^family:(.+)$/.exec(n.instanceOf || '');
    if (m) out.push({ node: n.name, key: m[1] });
    (n.children || []).forEach(walk);
  })(contract.anatomy);
  return out;
}

/** A Contract's `dependencies.families` in its own Design System: one that names a `designSystem` is another's (#594). */
export const localFamilies = contract => ((contract.dependencies && contract.dependencies.families) || []).filter(d => !d.designSystem);

/**
 * The held Contracts a Contract's dependencies name, read from its own contracts folder: {designSystem, contracts}, or
 * null for a Contract that holds no family.
 */
export function loadHeld(contractPath, contract, designSystem) {
  if (!familyNodes(contract).length) return null;
  const contracts = {};
  for (const dep of localFamilies(contract)) {
    const path = join(dirname(contractPath), `${dep.contract || dep.key}.component.json`);
    if (existsSync(path)) contracts[dep.key] = readJson(path);
  }
  return { designSystem, contracts };
}

// "icon:default" -> the Contract's default icon key; "icon:<key>" -> key.
export const iconRef = (contract, ref) => {
  const key = String(ref).replace(/^icon:/, '');
  return key === 'default' ? contract.icons && contract.icons.default : key;
};

/** A held variant's ref, as a swap and the state's ids name it: `family:<designSystem>/<key>/<tupleKey>`. */
export const heldRef = (designSystem, key, c, t) => `family:${designSystem}/${key}/${tupleKey(c, t)}`;

// One nested instance as the holder's rule on it (`v`, from resolveInstances) sets it: the held tuple, where the axes
// left out take the held default, and each held property at the value written, else the held default (`written`).
function heldValues(c, v = { variant: {}, props: {} }) {
  return {
    tuple: { ...baseTuple(c), ...v.variant },
    values: c.properties.map(p => ({ p, written: p.key in v.props, value: p.key in v.props ? v.props[p.key] : p.default })),
  };
}

/**
 * What one tuple's nested instances hold: {node: {key, tuple, ref, props, written}}. `tuple` is the held variant,
 * `ref` names it (heldRef), `props` holds every held property by label, at the value the holder writes, else the held
 * Contract's default (an INSTANCE_SWAP as {icon}), and `written` only the ones the holder writes. A property left out
 * keeps the held family's default, so the build writes only `written` (#317).
 */
export function nestedOf(contract, tuple, held) {
  const set = resolveInstances(contract, tuple);
  const out = {};
  for (const { node, key } of familyNodes(contract)) {
    const c = held && held.contracts[key];
    if (!c) throw new Error(`${contract.family.key}.${node} holds ${key}, whose Contract is not loaded: give the held Contracts`);
    const { tuple: t, values } = heldValues(c, set[node]);
    const props = {};
    const written = {};
    for (const { p, value, written: w } of values) {
      props[p.label] = p.type === 'INSTANCE_SWAP' ? { icon: iconRef(c, value) } : value;
      if (w) written[p.label] = props[p.label];
    }
    out[node] = { key, tuple: t, ref: heldRef(held.designSystem, key, c, t), props, written };
  }
  return out;
}

/**
 * The Figma fields a nested instance's owner overrides may name for one tuple (#593): {node: {path: [field]}}, the path
 * '' for the instance itself. The instance's own name and property values, the holder's layout and paint fields on it
 * and on its paths, and the fields the held family's property binds drive. Anything else is an owner's edit.
 */
export function allowedOverrides(contract, tuple, held) {
  const r = resolve(contract, tuple);
  const out = {};
  for (const [node, n] of Object.entries(nestedOf(contract, tuple, held))) {
    const c = held.contracts[n.key];
    const o = out[node] = { '': ['name', 'componentProperties', 'visible'] };
    const add = (path, f) => (o[path] = o[path] || []).push(...(FIGMA_FIELDS[f] || [f]));
    for (const sec of ['layout', 'paint'])
      for (const [at, fields] of Object.entries(r[sec])) {
        const path = at === node ? '' : at.startsWith(`${node}/`) ? at.slice(node.length + 1) : null;
        if (path !== null) Object.keys(fields).forEach(f => add(path, f));
      }
    const binds = resolve(c, n.tuple).binds;
    for (const p of c.properties) for (const b of binds[p.key]) add(b.node === c.anatomy.name ? '' : b.node, b.field);
  }
  return out;
}

// Contract fields as the Figma fields an instance override lists (InstanceNode.overrides' overriddenFields).
const FIGMA_FIELDS = {
  fill: ['fills'], stroke: ['strokes'], gap: ['itemSpacing'], direction: ['layoutMode'], alignMain: ['primaryAxisAlignItems'], alignCross: ['counterAxisAlignItems'],
  width: ['width', 'layoutSizingHorizontal', 'layoutGrow', 'layoutAlign'], height: ['height', 'layoutSizingVertical', 'layoutGrow', 'layoutAlign'],
  radius: ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'],
  strokeWeight: ['strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'],
  textStyle: ['textStyleId', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing'], textResize: ['textAutoResize'], position: ['layoutPositioning'],
};

/** {variant id: ref} for every recorded variant of each held family built from its held Contract: how a readback's main component reads. */
export function heldRefs(held, ledger) {
  const out = {};
  for (const [key, c] of Object.entries((held && held.contracts) || {})) {
    const rec = ledger && ledger.sets && ledger.sets[key];
    if (!rec || rec.contentHash !== contentHash(c)) continue;
    expand(c).forEach((t, i) => { if (rec.variants[i]) out[rec.variants[i]] = heldRef(held.designSystem, key, c, t); });
  }
  return out;
}

/**
 * What the plan writes into one tuple's nested instances (#593): {node: {Figma property key: value}}, each property
 * the holder writes keyed as the ledger's held set records it, an INSTANCE_SWAP value as the icon's component id. A
 * node that writes none is {}, so the core still reads its properties and overrides back.
 */
export function figmaProps(nested, held, ledger) {
  const comps = (ledger && ledger.icons && ledger.icons.components) || {};
  const out = {};
  for (const [node, n] of Object.entries(nested)) {
    const keys = ledger.sets[n.key].props || {};
    out[node] = {};
    for (const p of held.contracts[n.key].properties) {
      if (!(p.label in n.written)) continue;
      const v = n.written[p.label];
      out[node][keys[p.key]] = p.type === 'INSTANCE_SWAP' ? comps[v.icon].id : v;
    }
  }
  return out;
}

/**
 * A core readback's nested instances, `{node: [componentProperties, [[layer name, fields]]]}`, in Contract terms
 * (#593): `props` {node: {label: value}} (an INSTANCE_SWAP's as {icon: key}, through `icons`, the ledger's icon keys by
 * component id) and `over` {node: [[path, fields]]}, the path '' for the instance itself. The held family is the one
 * whose set records the property keys.
 */
export function nestedBack(raw, held, ledger, icons) {
  const byKey = {};
  for (const [key, c] of Object.entries((held && held.contracts) || {})) {
    const keys = (ledger && ledger.sets && ledger.sets[key] && ledger.sets[key].props) || {};
    for (const p of c.properties) if (keys[p.key]) byKey[keys[p.key]] = { c, p };
  }
  const props = {};
  const over = {};
  for (const [node, [cp, overrides]] of Object.entries(raw)) {
    props[node] = {};
    let c = null;
    for (const [k, { value }] of Object.entries(cp)) {
      const hit = byKey[k];
      if (!hit) continue;
      c = hit.c;
      props[node][hit.p.label] = hit.p.type === 'INSTANCE_SWAP' ? { icon: icons[value] || `unknown:${value}` } : value;
    }
    const paths = { [c ? c.anatomy.name : '']: '' };
    if (c) (function walk(n, at) { for (const k of n.children || []) { paths[k.name] = at ? `${at}/${k.name}` : k.name; walk(k, paths[k.name]); } })(c.anatomy, '');
    over[node] = overrides.map(([name, fields]) => [name in paths ? paths[name] : name, [...fields].sort()]);
  }
  return { props, over };
}

/** The variant id each ref names, from the ledger's sets by the held Contract's expansion order: {ref: {id}}. */
export function heldIds(refs, held, ledger) {
  const byRef = {};
  for (const [id, ref] of Object.entries(heldRefs(held, ledger))) byRef[ref] = { id };
  return Object.fromEntries(refs.map(ref => [ref, byRef[ref]]));
}

/**
 * The build plan's checks of a holding Contract's nested instances, where both Contracts are loaded (#593): each a
 * named Conflict {node, kind, reason}. Kinds: `design-system` (a held family in another Design System, #594),
 * `held-contract` (not loaded), `not-built` (no placed set, or a variant without an id), `stale` (the set was built
 * from another contentHash than the held Contract's), `not-selected` (a resolved tuple outside the held selection) and
 * `property` (a props key that is no held property, or a value of the wrong type) and `icon` (an INSTANCE_SWAP value
 * the ledger has no icon for, #313).
 */
function nestedConflicts(contract, held, ledger) {
  const nodes = familyNodes(contract);
  const out = [];
  if (!nodes.length) return out;
  const seen = new Set();
  const bad = (node, kind, reason) => { const k = `${node}\n${kind}\n${reason}`; if (!seen.has(k)) { seen.add(k); out.push({ node, kind, reason }); } };
  const ok = {};
  for (const { node, key } of nodes) {
    const dep = (contract.dependencies.families || []).find(d => d.key === key) || {};
    const c = held && held.contracts[key];
    const rec = ledger && ledger.sets && ledger.sets[key];
    if (dep.designSystem)
      bad(node, 'design-system', `${key} is a family of Design System ${dep.designSystem}: building against another Design System's ledger is #594`);
    else if (!c) bad(node, 'held-contract', `no Contract of ${key} is loaded beside ${contract.family.key}: load the held Contracts (dependencies.families)`);
    else if (!rec || !rec.set || rec.placed === false) bad(node, 'not-built', `the ${key} set is not built yet: build it, record it and run its Coverage check before ${contract.family.key}`);
    else if (rec.contentHash !== contentHash(c)) bad(node, 'stale', `the ${key} set was built from ${rec.contentHash}, not the held Contract's ${contentHash(c)}: rebuild ${key} first`);
    else ok[node] = c;
  }
  for (const t of expand(contract)) {
    const set = resolveInstances(contract, t);
    for (const [node, c] of Object.entries(ok)) {
      const v = set[node] || { variant: {}, props: {} };
      const { tuple: ht, values } = heldValues(c, v);
      const i = expand(c).findIndex(x => tupleKey(c, x) === tupleKey(c, ht));
      const unknown = Object.keys(v.variant).filter(k => !c.axes.some(a => a.key === k));
      if (unknown.length || i === -1)
        bad(node, 'not-selected', `${variantName(contract, t)}: ${unknown.length ? `${unknown.join(', ')} is no axis of ${c.family.name}` : `${variantName(c, ht)} is not in ${c.family.name}'s selection`}`);
      else if (!ledger.sets[c.family.key].variants[i]) bad(node, 'not-built', `${variantName(c, ht)} has no variant id in the ledger: build the ${c.family.key} set first`);
      for (const [k, value] of Object.entries(v.props)) {
        const p = c.properties.find(x => x.key === k);
        if (!p) bad(node, 'property', `${k} is no property of ${c.family.name}`);
        else if (typeof value !== PROP_TYPES[p.type] || (p.type === 'INSTANCE_SWAP' && !/^icon:/.test(value)))
          bad(node, 'property', `${k} is a ${p.type} property of ${c.family.name}, not ${JSON.stringify(value)}`);
      }
      const keys = ledger.sets[c.family.key].props || {};
      for (const { p, value } of values) {
        if (!keys[p.key]) bad(node, 'not-built', `the ${c.family.key} set records no Figma key for its ${p.key} property: run its place calls first`);
        const icon = p.type === 'INSTANCE_SWAP' && iconRef(c, value);
        if (icon && !((ledger.icons && ledger.icons.components) || {})[icon]) bad(node, 'icon', `${p.key} swaps to icon ${icon}, which the ledger lacks: build icons first (#313)`);
      }
    }
  }
  return out;
}

/** Throws the nested instances' Conflicts as one Error (with `conflicts`), when there are any. */
export function assertNested(contract, held, ledger) {
  const conflicts = nestedConflicts(contract, held, ledger);
  if (!conflicts.length) return;
  const e = new Error(`nested instances: ${conflicts.map(c => `${c.node} ${c.kind}: ${c.reason}`).join('; ')}`);
  e.conflicts = conflicts;
  throw e;
}

/** The families in build order: each after every family it holds (`dependencies.families`), else in the order given. A cycle throws. */
export function buildOrder(contracts) {
  const out = [];
  const state = {};
  const visit = (key, path) => {
    if (state[key] === 'done') return;
    if (state[key] === 'open') throw new Error(`families hold each other in a cycle: ${[...path.slice(path.indexOf(key)), key].join(' → ')}`);
    state[key] = 'open';
    for (const dep of localFamilies(contracts[key])) if (contracts[dep.key]) visit(dep.key, [...path, key]);
    state[key] = 'done';
    out.push(key);
  };
  for (const key of Object.keys(contracts)) visit(key, []);
  return out;
}
