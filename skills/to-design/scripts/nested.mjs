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

/** The held Contracts a Contract's dependencies name, read from its own contracts folder: {designSystem, contracts}. */
export function loadHeld(contractPath, contract, designSystem) {
  const contracts = {};
  for (const dep of contract.dependencies.families || []) {
    const path = join(dirname(contractPath), `${dep.contract || dep.key}.component.json`);
    if (!dep.designSystem && existsSync(path)) contracts[dep.key] = readJson(path);
  }
  return { designSystem, contracts };
}

/**
 * What one tuple's nested instances hold: {node: {key, tuple, ref, props}}. `tuple` is the held variant (the axes
 * the holder leaves out take the held default), `ref` names it `family:<designSystem>/<key>/<tupleKey>`, and `props`
 * every held property by label, at the value the holder writes, else the held default (an INSTANCE_SWAP as {icon}).
 */
export function nestedOf(contract, tuple, held) {
  const set = resolveInstances(contract, tuple);
  const out = {};
  for (const { node, key } of familyNodes(contract)) {
    const c = held && held.contracts[key];
    if (!c) throw new Error(`${contract.family.key}.${node} holds ${key}, whose Contract is not loaded: give the held Contracts`);
    const v = set[node] || { variant: {}, props: {} };
    const t = { ...baseTuple(c), ...v.variant };
    const props = {};
    for (const p of c.properties) {
      const value = p.key in v.props ? v.props[p.key] : p.default;
      props[p.label] = p.type === 'INSTANCE_SWAP' ? { icon: String(value).replace(/^icon:/, '') } : value;
    }
    out[node] = { key, tuple: t, ref: `family:${held.designSystem}/${key}/${tupleKey(c, t)}`, props };
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
    expand(c).forEach((t, i) => { if (rec.variants[i]) out[rec.variants[i]] = `family:${held.designSystem}/${key}/${tupleKey(c, t)}`; });
  }
  return out;
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
 * `property` (a props key that is no held property, or a value of the wrong type).
 */
export function nestedConflicts(contract, held, ledger) {
  const nodes = familyNodes(contract);
  const out = [];
  const seen = new Set();
  const bad = (node, kind, reason) => { const k = `${node}\n${kind}\n${reason}`; if (!seen.has(k)) { seen.add(k); out.push({ node, kind, reason }); } };
  const ok = {};
  for (const { node, key } of nodes) {
    const dep = (contract.dependencies.families || []).find(d => d.key === key) || {};
    const c = held && held.contracts[key];
    const rec = ledger && ledger.sets && ledger.sets[key];
    if (dep.designSystem && dep.designSystem !== (held && held.designSystem))
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
      const ht = { ...baseTuple(c), ...v.variant };
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
    for (const dep of contracts[key].dependencies.families || []) if (contracts[dep.key]) visit(dep.key, [...path, key]);
    state[key] = 'done';
    out.push(key);
  };
  for (const key of Object.keys(contracts)) visit(key, []);
  return out;
}
