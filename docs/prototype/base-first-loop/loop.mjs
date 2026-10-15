// PROTOTYPE (#8, throwaway): the To-design base-first loop as pure functions.
//
// Question: build the Base Component from the Contract, let the owner tweak it in Figma,
// read it back, diff it against what the Contract resolves to, and turn each tweak into
// a Contract edit. Where does approval live, and how do tweaks map back?
//
// Pure: no Figma, no fs. run.mjs drives it; figma/*.js are the use_figma bodies.

import { createHash } from 'node:crypto';

// ---------- resolve (same semantics as expand_contract.py: ordered rules, later wins) ----------
export const matches = (pattern, tuple) =>
  Object.entries(pattern).every(([axis, want]) => (Array.isArray(want) ? want : [want]).includes(tuple[axis]));

export function selected(c) {
  const keys = c.axes.map(a => a.key);
  let out = [{}];
  for (const a of c.axes) out = out.flatMap(t => a.values.map(v => ({ ...t, [a.key]: v.key })));
  const hit = list => t => list.some(p => matches(p.match, t));
  return out.filter(t => !hit(c.excluded)(t) && !hit(c.selection.omit)(t)).map(t => Object.fromEntries(keys.map(k => [k, t[k]])));
}

export const baseTuple = c => Object.fromEntries(c.axes.map(a => [a.key, a.default]));

// Returns { layout, paint, visible, from } where from["layout.Button.gap"] = winning rule index.
export function resolve(c, tuple, propValues = {}) {
  const res = { layout: {}, paint: {}, visible: {}, from: {} };
  for (const section of ['layout', 'paint'])
    c[section].forEach((rule, i) => {
      if (!matches(rule.match, tuple)) return;
      for (const [node, fields] of Object.entries(rule.set))
        for (const [f, v] of Object.entries(fields)) {
          (res[section][node] ??= {})[f] = v;
          res.from[`${section}.${node}.${f}`] = i;
        }
    });
  for (const node of Object.values(res.paint))
    for (const [f, v] of Object.entries(node))
      if (v && typeof v === 'object' && v.sameAs) { const [n, ff] = v.sameAs.split('.'); node[f] = res.paint[n][ff]; }
  for (const p of c.properties.filter(p => p.type === 'BOOLEAN')) {
    const on = propValues[p.key] ?? p.default;
    const bind = p.binds.find(b => matches(b.match ?? {}, tuple));
    res.visible[bind.node] = on;
  }
  return res;
}

export const variantName = (c, t) =>
  c.axes.map(a => `${a.label}=${a.values.find(v => v.key === t[a.key]).label}`).join(', ');

// ---------- diff: readback (contract vocabulary + extras) vs resolved expectation ----------
const norm = v => (v && typeof v === 'object' && 'token' in v ? { token: v.token }
  : v && typeof v === 'object' && 'raw' in v ? { raw: v.raw } : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const show = v => (v == null ? '∅' : typeof v !== 'object' ? String(v) : 'token' in v ? `{${v.token}}` : 'raw' in v ? `raw ${v.raw}` : JSON.stringify(v));

// Fields the readback reports that the Contract vocabulary has no slot for.
// Their expected value comes from the text style the Contract names (foundations).
const TYPO_EXTRAS = ['fontFamily', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing'];

export function diff(expected, readback, foundations, expectedTree, readTree) {
  const changes = [];
  if (JSON.stringify(expectedTree) !== JSON.stringify(readTree))
    changes.push({ kind: 'unmapped', what: 'structure', from: expectedTree, to: readTree });
  for (const section of ['layout', 'paint'])
    for (const [node, fields] of Object.entries(expected[section]))
      for (const [field, want] of Object.entries(fields)) {
        if (section === 'paint' && field === 'effects') continue; // not exercised by this prototype
        const got = readback[section]?.[node]?.[field];
        if (same(want, got)) continue;
        let kind;
        if (got && typeof got === 'object' && 'token' in got) kind = 'token-edit';
        else if (want && typeof want === 'object' && 'token' in want && got && 'raw' in got) {
          const tv = foundations.floats[want.token];
          kind = tv === got.raw ? 'detached' : 'raw-edit';
        } else if (got == null && want && want.token && foundations.textStyles[want.token]) kind = 'detached';
        else kind = 'raw-edit';
        changes.push({ kind, section, node, field, from: want, to: got });
      }
  // vocabulary-external typography: compare against the text style the Contract asked for
  for (const [node, fields] of Object.entries(expected.layout)) {
    const ts = fields.textStyle?.token && foundations.textStyles[fields.textStyle.token];
    if (!ts) continue;
    const exp = { fontFamily: ts.family, fontStyle: ts.style, fontSize: ts.fontSize, lineHeight: ts.lineHeight, letterSpacing: ts.letterSpacing };
    for (const f of TYPO_EXTRAS) {
      const got = readback.extras?.[node]?.[f];
      if (got !== undefined && Math.abs((+got || 0) - (+exp[f] || 0)) > 1e-6 && got !== exp[f])
        changes.push({ kind: 'unmapped', section: 'layout', node, field: f, from: exp[f], to: got, why: 'Contract v1 has no field for this; only textStyle' });
    }
  }
  for (const [node, want] of Object.entries(expected.visible)) {
    const got = readback.visible?.[node];
    if (got !== undefined && got !== want) changes.push({ kind: 'raw-edit', section: 'visible', node, field: 'visible', from: want, to: got });
  }
  return changes;
}

// ---------- map a change onto a Contract edit, with blast radius ----------
const clone = o => structuredClone(o);
function valueAt(c, t, section, node, field) { return resolve(c, t)[section]?.[node]?.[field]; }

function blast(c, c2, section, node, field) {
  const sel = selected(c);
  const changed = sel.filter(t => !same(valueAt(c, t, section, node, field), valueAt(c2, t, section, node, field)));
  return { count: changed.length, of: sel.length, sample: changed.slice(0, 3).map(t => Object.values(t).join('/')) };
}

// Strategies: A = edit the winning rule in place; B = append an override with the winning rule's match;
// C = append an override scoped to the Base Component tuple only.
// SCOPE_PREFIX: which token family a raw number on this field could be (for a typed-number tweak).
const SCOPE_PREFIX = { gap: 'spacing-', paddingTop: 'spacing-', paddingRight: 'spacing-', paddingBottom: 'spacing-', paddingLeft: 'spacing-', minHeight: 'size-', width: 'icon-size-', height: 'icon-size-', radius: 'border-radius-' };
export function proposeEdit(c, change, foundations) {
  const t = baseTuple(c);
  const { section, node, field } = change;
  if (change.kind === 'unmapped' || change.kind === 'detached' || section === 'visible')
    return { change, expressible: false, note: change.kind === 'unmapped' ? 'no Contract field'
      : change.kind === 'detached' ? 'binding lost in Figma (side effect of a raw override); the Contract keeps the token'
      : 'BOOLEAN visibility is a component property, not a rule' };
  const ruleIdx = resolve(c, t).from[`${section}.${node}.${field}`];
  const rule = c[section][ruleIdx];
  // `was` is the replaced value object ({token} or {raw}), so its type is never ambiguous (#8 decision).
  // expand_contract.py and closure() skip `was`: it is history, not a live value.
  const newVal = { ...change.to, by: 'owner', was: norm(change.from) };
  if ('raw' in newVal) Object.assign(newVal, { level: 'warning', reason: 'owner tweak at Base Component approval; no token' });

  const A = clone(c); A[section][ruleIdx].set[node][field] = newVal;
  const B = clone(c); B[section].push({ match: rule.match, set: { [node]: { [field]: newVal } } });
  const C = clone(c); C[section].push({ match: t, set: { [node]: { [field]: newVal } } });

  // rules that also set this node.field and win over the edited rule for some variants ("shielded")
  const shields = c[section].map((r, i) => ({ r, i }))
    .filter(({ r, i }) => i > ruleIdx && r.set[node]?.[field] !== undefined
      && selected(c).some(t => matches(rule.match, t) && matches(r.match, t)))
    .map(({ r, i }) => ({ rule: i, match: r.match, value: show(r.set[node][field]), reason: r.set[node][field].reason }));

  return {
    change, expressible: true, rule: ruleIdx, ruleMatch: rule.match,
    scope: Object.keys(rule.match).length === 0 ? 'shared' : 'axis-specific',
    widerThanBase: Object.entries(rule.match).some(([, v]) => Array.isArray(v) && v.length > 1),
    newValue: newVal,
    strategies: {
      A_editInPlace: blast(c, A, section, node, field),
      B_appendSameMatch: blast(c, B, section, node, field),
      C_appendBaseOnly: blast(c, C, section, node, field),
    },
    shields,
    tokenOutsideClosure: newVal.token && !closure(c).has(newVal.token) ? newVal.token : undefined,
    // a typed raw that equals exactly one token of the field's family: propose it, never auto-upgrade
    tokenCandidates: 'raw' in newVal && foundations ? Object.entries(foundations.floats)
      .filter(([n, v]) => v === newVal.raw && n.startsWith(SCOPE_PREFIX[field] ?? '\u0000')).map(([n]) => n) : undefined,
  };
}

export function applyInPlace(c, proposals) {
  const c2 = clone(c);
  for (const p of proposals.filter(p => p.expressible)) c2[p.change.section][p.rule].set[p.change.node][p.change.field] = p.newValue;
  return c2;
}

export function closure(c) {
  const s = new Set();
  const walk = o => { if (o && typeof o === 'object') { if (typeof o.token === 'string') s.add(o.token); Object.entries(o).forEach(([k, v]) => k !== 'was' && walk(v)); } };
  walk(c.layout); walk(c.paint);
  return s;
}

// ---------- approval ----------
const canon = o => Array.isArray(o) ? `[${o.map(canon).join(',')}]`
  : o && typeof o === 'object' ? `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}` : JSON.stringify(o);
export function contentHash(c) {
  const x = clone(c); delete x.selection.status; delete x.selection.approval;
  return 'sha256:' + createHash('sha256').update(canon(x)).digest('hex');
}
export function approve(c, by, at) {
  const x = clone(c);
  x.selection.status = 'approved';
  x.selection.approval = { by, at, snapshotId: c.source.snapshotId, contentHash: contentHash(c) };
  return x;
}
// Q25 as written (snapshotId only) vs with contentHash.
export function approvalValid(c) {
  const a = c.selection.approval;
  if (c.selection.status !== 'approved' || !a) return { q25: false, withHash: false, why: 'not approved' };
  const q25 = a.snapshotId === c.source.snapshotId;
  return { q25, withHash: q25 && a.contentHash === contentHash(c) };
}
export { show, same };
