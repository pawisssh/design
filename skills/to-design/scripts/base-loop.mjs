#!/usr/bin/env node
// Base-first loop (#31): from a Base Component readback to in-place Contract edits, and the owner's approval.
// The pure functions sit on the shared Contract module (expansion, rule matching, the closure and the hash
// live only there); this file adds the readback diff, the blast radius and the edit write-back.
//
//   node skills/to-design/scripts/base-loop.mjs readback <result.json> --out <readback.json> [--ledger <path>]
//   node skills/to-design/scripts/base-loop.mjs diff     <component.json> <readback.json>
//   node skills/to-design/scripts/base-loop.mjs apply    <component.json> <readback.json> [--confirm Node.field,...|all] [--by <who>] [--out <path>]
//   node skills/to-design/scripts/base-loop.mjs discard  <component.json> <readback.json> --note <at> [--out <path>]
//   node skills/to-design/scripts/base-loop.mjs review   <component.json> <readback.json> --file-key <key>
//   node skills/to-design/scripts/base-loop.mjs approve  <component.json> <readback.json> --snapshot-id <id> --content-hash <hash> [--at <iso>] [--prototype --out <.scratch path>]
//   node skills/to-design/scripts/base-loop.mjs regen    <fixtures dir> <out dir>   (the fixtures dir holds button.component.json and readback.*.json)
// Every command takes [--foundations <file>] (default: the one next to the contracts folder).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  approve, asDraft, baseTuple, closure, contentHash, coversScope, expand, matches, resolve, scopeFor, validate, variantName,
} from '../../contract/scripts/contract.mjs';
import { ledgerPath, readLedger } from './ledger.mjs';

const SECTIONS = ['layout', 'paint'];
const clone = o => JSON.parse(JSON.stringify(o));
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isToken = v => isObj(v) && 'token' in v;
const isRaw = v => isObj(v) && 'raw' in v;

/** The reason a raw value from an owner tweak carries (no token backs it). */
export const RAW_REASON = 'owner tweak at Base Component approval; no token';

// ---------- what the Base Component should read back as ----------

/** The review specimen's property values: TEXT and INSTANCE_SWAP at their default, every BOOLEAN on (Icon = true). */
export function reviewProps(contract) {
  return Object.fromEntries(contract.properties.map(p => [p.key, p.type === 'BOOLEAN' ? true : p.default]));
}

// "icon:default" -> the Contract's default icon key; "icon:<key>" -> key.
const iconRef = (contract, ref) => {
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
 * What the Base Component should read back as, for the review specimen `props`:
 * {tuple, name, tree, layout, paint, visible, text, swap}. `visible` covers every node below the root,
 * `text` the TEXT property's node, `swap` each INSTANCE node's icon key.
 */
export function expectedBase(contract, props = reviewProps(contract)) {
  const tuple = baseTuple(contract);
  const r = resolve(contract, tuple);
  const visible = {};
  const text = {};
  const swap = {};
  (function walk(n, root) {
    if (!root) visible[n.name] = true;
    if (n.type === 'INSTANCE' && /^icon:/.test(n.instanceOf || '')) swap[n.name] = iconRef(contract, n.instanceOf);
    (n.children || []).forEach(c => walk(c, false));
  })(contract.anatomy, true);
  for (const p of contract.properties)
    for (const b of r.binds[p.key]) {
      if (p.type === 'BOOLEAN' && b.field === 'visible') visible[b.node] = !!props[p.key];
      if (p.type === 'TEXT' && b.field === 'characters') text[b.node] = props[p.key];
      if (p.type === 'INSTANCE_SWAP' && b.field === 'mainComponent') swap[b.node] = iconRef(contract, props[p.key]);
    }
  return { tuple, name: variantName(contract, tuple), tree: anatomyTree(contract.anatomy), layout: r.layout, paint: r.paint, visible, text, swap };
}

// ---------- readback: Figma ids -> Contract vocabulary ----------

/**
 * A core readback (`base` slice, ids) in Contract vocabulary: `{var: id}` becomes `{token: flatName}` and
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

// ---------- diff ----------

const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-3;
// A value without its annotations (by, was, level, reason, why): what Figma can show.
function norm(v) {
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
function same(a, b) {
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

/** A value as one short string: `{spacing-07}`, `raw 15`, `none`, `∅`. */
export function show(v) {
  if (v === undefined || v === null) return '∅';
  if (Array.isArray(v)) return `[${v.map(e => (isObj(e) ? `${e.type} ${show(e.color)} spread ${show(e.spread)}` : show(e))).join(', ')}]`;
  if (isToken(v)) return v.token === null ? `{? ${v.id}}` : `{${v.token}}`;
  if (isRaw(v)) return `raw ${v.raw}`;
  if (isObj(v)) return JSON.stringify(v);
  return String(v);
}

// The value a token stands for in the default mode: a number, or a resolved colour "#rrggbb".
function tokenValue(foundations, token) {
  const v = foundations.variables[token];
  if (!v) return undefined;
  const first = Object.values(v.values)[0];
  return v.type === 'COLOR' ? String(first.resolved).toLowerCase() : first.value;
}

// The typography a Text Style sets, as the readback's `extras` reports it.
function styleTypography(style) {
  const metric = m => (!m ? undefined : m.unit === 'PIXELS' ? m.value : m.unit === 'PERCENT' ? `${m.value}%` : m.unit);
  return { fontFamily: style.fontFamily, fontStyle: style.fontStyle, fontSize: style.fontSize, lineHeight: metric(style.lineHeight), letterSpacing: metric(style.letterSpacing) };
}

// Why a tweak cannot become an in-place edit, and what the owner can do about it.
const UNMAPPED = {
  typography: ['no Contract field', 'Needs a token or a schema field.'],
  structure: ['the anatomy fixes the layer tree', 'Change the anatomy by hand if wanted.'],
  property: ['a component property default (properties[].default), not a rule', 'Change properties[].default by hand if wanted.'],
  keyword: ['a keyword value cannot carry by and was', 'Edit the rule by hand if wanted.'],
  unruled: ['no rule sets this field for the Base Component', 'Add a rule by hand if wanted.'],
  effects: ['effects change as a whole list, with no in-place form', 'Edit the effects by hand if wanted.'],
  foreign: ['bound to a variable or style the foundations ledger does not know', 'Bind a foundations variable instead.'],
};

/**
 * Diff a normalized Base Component readback against what the Contract resolves to for the Base Component.
 * Returns {name, changes, unread}: each change is {kind, section, node, field, from, to, why?} with kind
 * `token-edit` (the owner bound a variable), `raw-edit` (a typed value), `detached` (a binding lost while the
 * value stayed, which a rebuild restores) or `unmapped` (a tweak the Contract cannot carry, `why` says which).
 * `unread` lists the expected fields the readback does not report. Effects are compared in order.
 */
export function diff(contract, readback, foundations, props = reviewProps(contract)) {
  const exp = expectedBase(contract, props);
  const changes = [];
  const unread = [];
  const unmapped = (reason, section, node, field, from, to) =>
    changes.push({ kind: 'unmapped', section, node, field, from, to, why: UNMAPPED[reason][0], reason });

  if (readback.tree === undefined) unread.push('tree');
  else {
    const readTree = { ...readback.tree, name: contract.anatomy.name }; // the variant's name is not a layer name
    if (JSON.stringify(readTree) !== JSON.stringify(exp.tree)) unmapped('structure', 'structure', contract.anatomy.name, 'tree', exp.tree, readTree);
  }
  for (const section of SECTIONS) {
    for (const [node, fields] of Object.entries(exp[section]))
      for (const [field, want] of Object.entries(fields)) {
        const read = readback[section] && readback[section][node];
        if (!read || !(field in read)) { unread.push(`${section}.${node}.${field}`); continue; }
        const got = read[field];
        if (same(want, got)) continue;
        if (isToken(got) && got.token === null) unmapped('foreign', section, node, field, want, got);
        else if (isToken(got)) changes.push({ kind: 'token-edit', section, node, field, from: want, to: got });
        else if (isRaw(got)) {
          const tv = isToken(want) ? tokenValue(foundations, want.token) : undefined;
          const kept = tv !== undefined && (near(tv, got.raw) || tv === String(got.raw).toLowerCase());
          changes.push({ kind: kept ? 'detached' : 'raw-edit', section, node, field, from: want, to: got });
        } else if (field === 'textStyle' && got == null && isToken(want)) changes.push({ kind: 'detached', section, node, field, from: want, to: got });
        else unmapped(field === 'effects' ? 'effects' : 'keyword', section, node, field, want, got);
      }
    // fields the readback reports with a value that no rule sets for the Base Component
    for (const [node, fields] of Object.entries(readback[section] || {}))
      for (const [field, got] of Object.entries(fields))
        if (!(exp[section][node] && field in exp[section][node]) && got !== null && got !== undefined)
          unmapped('unruled', section, node, field, undefined, got);
  }
  // typography the Contract only names through textStyle: compare it with that Text Style
  for (const [node, fields] of Object.entries(exp.layout)) {
    const style = isToken(fields.textStyle) && foundations.textStyles[fields.textStyle.token];
    if (!style) continue;
    const want = styleTypography(style);
    const got = (readback.extras && readback.extras[node]) || {};
    for (const [field, w] of Object.entries(want)) {
      if (!(field in got)) { unread.push(`extras.${node}.${field}`); continue; }
      if (got[field] !== w && !near(got[field], w)) unmapped('typography', 'layout', node, field, w, got[field]);
    }
  }
  for (const part of ['visible', 'text', 'swap'])
    for (const [node, want] of Object.entries(exp[part])) {
      if (!readback[part] || !(node in readback[part])) { unread.push(`${part}.${node}`); continue; }
      if (readback[part][node] !== want) unmapped('property', part, node, part === 'visible' ? 'visible' : part === 'text' ? 'characters' : 'mainComponent', want, readback[part][node]);
    }
  return { name: exp.name, changes, unread };
}

// ---------- proposals: where each tweak lands, and what else it changes ----------

// The value at section.node.field for every selected tuple, before and after an edit; the tuples that differ.
function blastRadius(before, after, section, node, field) {
  const selected = expand(before);
  const at = (c, t) => { const r = resolve(c, t)[section][node]; return r && r[field]; };
  const changed = selected.filter(t => !same(at(before, t), at(after, t)));
  return { count: changed.length, of: selected.length, sample: changed.slice(0, 3).map(t => variantName(before, t)) };
}

const isDerived = v => isRaw(v) && v.level === 'info' && /^derived/i.test(v.reason || '');

/** The later rules that also set section.node.field for a selected variant the rule at ruleIdx covers. */
function shieldsOf(contract, section, ruleIdx, node, field) {
  const rule = contract[section][ruleIdx];
  const selected = expand(contract);
  return contract[section].map((r, i) => ({ r, i }))
    .filter(({ r, i }) => i > ruleIdx && r.set[node] && r.set[node][field] !== undefined && selected.some(x => matches(rule.match, x) && matches(r.match, x)))
    .map(({ r, i }) => ({ rule: i, match: r.match, value: r.set[node][field] }));
}

/** Who may make an edit: the owner, or a simulated owner named as such ("owner (simulated, ...)"). */
export const isOwner = by => by === 'owner' || /^owner \(simulated[^)]*\)$/.test(String(by));

/**
 * Where a change lands and what it does. Expressible changes (`token-edit`, `raw-edit`) edit the rule that
 * last set the field for the Base Component, in place. The proposal carries that rule, the new value with
 * `by` and `was`, the blast radius (selected variants whose value changes), `shared` (the edit changes more
 * than the Base Component, so the owner is asked first), the later rules that shield variants from it, the
 * derived raws it may make stale, and, for a typed number, the tokens of the field's scope with that value.
 */
export function propose(contract, change, foundations, { by = 'owner' } = {}) {
  if (!isOwner(by)) throw new Error(`an edit is by "owner" (or "owner (simulated, ...)" in a prototype), not "${by}"`);
  const { kind, section, node, field } = change;
  if (kind === 'detached') return { change, expressible: false, note: 'binding lost in Figma; the Contract keeps the token and a rebuild restores it' };
  if (kind === 'unmapped') return { change, expressible: false, note: change.why };
  const t = baseTuple(contract);
  const ruleIdx = resolve(contract, t).from[`${section}.${node}.${field}`];
  if (ruleIdx === undefined) return { change: { ...change, kind: 'unmapped', why: UNMAPPED.unruled[0], reason: 'unruled' }, expressible: false, note: UNMAPPED.unruled[0] };
  const rule = contract[section][ruleIdx];
  const newValue = { ...norm(change.to), by, was: norm(change.from) };
  if (isRaw(newValue)) Object.assign(newValue, { level: 'warning', reason: RAW_REASON });
  const edited = clone(contract);
  edited[section][ruleIdx].set[node][field] = newValue;
  const blast = blastRadius(contract, edited, section, node, field);
  const shields = shieldsOf(contract, section, ruleIdx, node, field);
  // A derived raw is flagged when it may rest on the edited value: one that shields the edit (same field), or a
  // sibling field on the same node of the edited rule. There is no machine-readable derivedFrom yet.
  const stale = shields.filter(s => isDerived(s.value)).map(s => ({ path: `${section}[${s.rule}].${node}.${field}`, value: s.value }))
    .concat(Object.entries(rule.set[node]).filter(([f, v]) => f !== field && isDerived(v)).map(([f, v]) => ({ path: `${section}[${ruleIdx}].${node}.${f}`, value: v })));
  const need = scopeFor(contract, node, field);
  let problem;
  if (isToken(newValue)) {
    if (field === 'textStyle') { if (!foundations.textStyles[newValue.token]) problem = `text style "${newValue.token}" is not in the foundations document`; }
    else if (!foundations.variables[newValue.token]) problem = `token "${newValue.token}" is not in the foundations document`;
    else if (!need || !coversScope(foundations.variables[newValue.token].scopes || [], need))
      problem = `token "${newValue.token}" is scoped [${foundations.variables[newValue.token].scopes}] and ${node}.${field} needs ${need}`;
  }
  const tokenCandidates = isRaw(newValue) && need
    ? Object.entries(foundations.variables)
      .filter(([, v]) => coversScope(v.scopes || [], need) && v.collection !== 'primitives')
      .filter(([n]) => { const tv = tokenValue(foundations, n); return near(tv, newValue.raw) || tv === String(newValue.raw).toLowerCase(); })
      .map(([n]) => n).sort()
    : [];
  return {
    change, expressible: true, id: `${node}.${field}`, path: `${section}[${ruleIdx}].${node}.${field}`, rule: ruleIdx, ruleMatch: rule.match,
    newValue, blast, shared: blast.count > 1, shields, stale, tokenCandidates, ...(problem ? { problem } : {}),
  };
}

/** Diff a readback and propose an edit for each change: {name, changes, unread, proposals}. */
export function review(contract, readback, foundations, opts = {}) {
  const d = diff(contract, readback, foundations, opts.props);
  return { ...d, proposals: d.changes.map(ch => propose(contract, ch, foundations, opts)) };
}

const noteMessage = (p, all) => {
  const ch = p.change;
  const detached = all.some(q => q.change.kind === 'detached' && q.change.node === ch.node && q.change.field === 'textStyle');
  const needs = (UNMAPPED[ch.reason] || UNMAPPED.unruled)[1];
  return `Owner tweak at Base Component review not carried: ${ch.field} ${show(ch.from)} -> ${show(ch.to)} (${p.note}${ch.reason === 'typography' && detached ? '; in Figma it also detached the text style' : ''}). Not carried; discarded when the Base Component is rebuilt from the Contract. ${needs}`;
};

/**
 * Write the proposals back into the Contract, in place. An edit to a shared rule (blast radius above 1)
 * is refused unless its id ("Button.gap") is in `confirm` (or `confirm` is "all"): the owner is asked first
 * and may narrow the rule instead. A tweak the Contract cannot carry becomes a `warning` note (it blocks
 * approval); a derived raw the edit may make stale gets a `verify` note. Returns {contract (draft), applied,
 * notes, closure: {added, removed}}.
 */
export function applyEdits(contract, proposals, { confirm = [] } = {}) {
  const ok = p => confirm === 'all' || (Array.isArray(confirm) && confirm.includes(p.id));
  const unconfirmed = proposals.filter(p => p.expressible && p.shared && !ok(p));
  if (unconfirmed.length)
    throw new Error(`ask the owner first: ${unconfirmed.map(p => `${p.id} changes ${p.blast.count}/${p.blast.of} variants (${p.path})`).join('; ')}`);
  const bad = proposals.filter(p => p.expressible && p.problem);
  if (bad.length) throw new Error(`cannot carry: ${bad.map(p => `${p.id}: ${p.problem}`).join('; ')}`);
  const c = clone(contract);
  const applied = [];
  for (const p of proposals.filter(q => q.expressible)) {
    c[p.change.section][p.rule].set[p.change.node][p.change.field] = clone(p.newValue);
    applied.push(p.path);
  }
  const notes = [];
  for (const p of proposals.filter(q => !q.expressible && q.change.kind === 'unmapped'))
    notes.push({ level: 'warning', at: `${p.change.section}.${p.change.node}.${p.change.field}`, message: noteMessage(p, proposals) });
  for (const p of proposals.filter(q => q.expressible))
    for (const s of p.stale)
      notes.push({ level: 'verify', at: s.path, message: `Derived ${show(s.value)} (${s.value.reason}) may be stale: the owner changed ${p.path} ${show(p.change.from)} -> ${show(p.change.to)}. Check it; it is not recomputed.` });
  const have = new Set((c.notes || []).map(n => `${n.level}|${n.at}|${n.message}`));
  const fresh = notes.filter(n => !have.has(`${n.level}|${n.at}|${n.message}`));
  if (fresh.length) c.notes = (c.notes || []).concat(fresh);
  const before = closure(contract);
  const after = closure(c);
  return {
    contract: asDraft(c), applied, notes: fresh,
    closure: { added: after.filter(t => !before.includes(t)), removed: before.filter(t => !after.includes(t)) },
  };
}

/**
 * Discard an uncarried tweak once the owner has chosen to drop it and the Base Component was rebuilt without
 * it: the `warning` note at `at` becomes `info`, so it no longer blocks approval. Refused while the readback
 * shows any difference, or does not report the noted field (a blind readback cannot prove the tweak is gone).
 */
export function discardNote(contract, at, readback, foundations) {
  const i = (contract.notes || []).findIndex(n => n.level === 'warning' && n.at === at);
  if (i < 0) throw new Error(`no warning note at ${at}`);
  const d = diff(contract, readback, foundations);
  const still = d.changes.filter(ch => `${ch.section}.${ch.node}.${ch.field}` === at);
  if (still.length) throw new Error(`the readback still shows ${at}: ${show(still[0].from)} -> ${show(still[0].to)}; rebuild the Base Component first`);
  if (d.changes.length) throw new Error(`the readback is not clean (${d.changes.length} difference(s)); rebuild the Base Component first`);
  // the noted field as `unread` names it: section.node.field, extras.node.field (typography), part.node, or tree
  const [part, node, field] = at.split('.');
  const blind = d.unread.filter(u => { const p = u.split('.'); return u === 'tree' ? field === 'tree' : p.length === 2 ? p[0] === part && p[1] === node : p[1] === node && p[2] === field; });
  if (blind.length) throw new Error(`the readback does not report ${blind.join(', ')}; read the Base Component back in full first`);
  const c = clone(contract);
  c.notes[i] = { ...c.notes[i], level: 'info', message: `Discarded (base loop rebuild): ${c.notes[i].message}` };
  return asDraft(c);
}

/** Every value carrying `by`, with its `was`, the blast radius of that edit (variants that differ from `was`) and the later rules that shield variants from it. */
export function ownerEdits(contract) {
  const out = [];
  for (const section of SECTIONS)
    contract[section].forEach((rule, i) => {
      for (const [node, fields] of Object.entries(rule.set || {}))
        for (const [field, value] of Object.entries(fields)) {
          if (!isObj(value) || value.by === undefined) continue;
          const undone = clone(contract);
          undone[section][i].set[node][field] = clone(value.was);
          out.push({ path: `${section}[${i}].${node}.${field}`, by: value.by, value: norm(value), was: value.was, blast: blastRadius(undone, contract, section, node, field),
            shields: shieldsOf(contract, section, i, node, field) });
        }
    });
  return out;
}

// ---------- reports ----------

/** The diff and its proposals as text, one line per change. */
export function formatDiff(contract, readback, result) {
  const lines = [`${result.name}  (${readback.id})  ${result.changes.length ? `${result.changes.length} difference(s)` : 'MATCHES the Contract'}`];
  for (const x of result.changes) lines.push(`  [${x.kind}] ${x.section}.${x.node}.${x.field}: ${show(x.from)} -> ${show(x.to)}${x.why ? `  (${x.why})` : ''}`);
  if (result.unread.length) lines.push(`  not in this readback: ${result.unread.join(', ')}`);
  if (result.proposals.length) lines.push('', 'Proposed Contract edits:');
  for (const p of result.proposals) {
    const ch = p.change;
    if (!p.expressible) { lines.push(`  x ${ch.node}.${ch.field}: NOT carried (${p.note})`); continue; }
    lines.push(`  + ${p.path} match=${JSON.stringify(p.ruleMatch)} := ${JSON.stringify(p.newValue)}`);
    lines.push(`      blast radius ${p.blast.count}/${p.blast.of}${p.shared ? '  (shared rule: ask the owner first; narrowing means splitting the rule)' : ''}`);
    for (const s of p.shields) lines.push(`      shielded by ${ch.section}[${s.rule}] ${JSON.stringify(s.match)} = ${show(s.value)}${s.value.reason ? `  reason: ${s.value.reason}` : ''}`);
    for (const s of p.stale) lines.push(`      verify: derived ${s.path} = ${show(s.value)} may be stale`);
    if (p.tokenCandidates.length) lines.push(`      raw value equals token(s) ${p.tokenCandidates.join(', ')} -> ask the owner: bind the token instead? (never upgraded silently)`);
    if (p.problem) lines.push(`      cannot carry: ${p.problem}`);
  }
  return lines.join('\n') + '\n';
}

/** The owner's review package: node link, snapshotId, contentHash, readback diff, owner edits, notes, approve command. */
export function formatReview(contract, readback, result, { fileKey, contractPath, readbackPath }) {
  const nodeId = String(readback.id || '').replace(/:/g, '-');
  const edits = ownerEdits(contract);
  const notes = contract.notes || [];
  const warnings = notes.filter(n => n.level === 'warning');
  const verify = notes.filter(n => n.level === 'verify');
  const clean = !result.changes.length && !result.unread.length;
  const lines = [
    `Base Component review: ${result.name}`,
    `Figma node: https://www.figma.com/design/${fileKey}/?node-id=${nodeId}`,
    `snapshotId: ${contract.source.snapshotId}`,
    `contentHash: ${contentHash(contract)}`,
    `selection: ${contract.selection.status}, ${expand(contract).length} variants`,
    `Readback: ${result.changes.length} difference(s), ${result.unread.length} field(s) not read${clean ? ' -- clean' : ''}`,
    ...result.changes.map(x => `  [${x.kind}] ${x.section}.${x.node}.${x.field}: ${show(x.from)} -> ${show(x.to)}`),
    `Edits with by/was: ${edits.length}`,
    ...edits.flatMap(e => [`  ${e.path} = ${show(e.value)}  by ${e.by}, was ${show(e.was)}; changes ${e.blast.count}/${e.blast.of} variants`,
      ...e.shields.map(x => `    shielded by ${e.path.split('[')[0]}[${x.rule}] ${JSON.stringify(x.match)} = ${show(x.value)}`)]),
    `Uncarried tweaks (warning notes, block approval): ${warnings.length}`,
    ...warnings.map(n => `  ${n.at}: ${n.message}`),
    `Verify notes: ${verify.length}`,
    ...verify.map(n => `  ${n.at}: ${n.message}`),
  ];
  if (clean && !warnings.length)
    lines.push('Approve only after the owner types "approve" in chat:',
      `  node skills/to-design/scripts/base-loop.mjs approve ${contractPath} ${readbackPath} --snapshot-id ${contract.source.snapshotId} --content-hash ${contentHash(contract)}`);
  else lines.push('Not ready to approve: the readback must be clean and no warning note open.');
  return lines.join('\n') + '\n';
}

/**
 * The approval, bound to what the owner reviewed: refused unless the readback is clean (no difference, every
 * field read) and `snapshotId` and `contentHash` equal the Contract's current values. Only after an explicit
 * "approve" from the owner in chat. `prototype` writes the prototype approver (never valid outside prototypes).
 */
export function approveReviewed(contract, readback, foundations, { snapshotId, contentHash: hash, at, prototype = false }) {
  const d = diff(contract, readback, foundations);
  if (d.changes.length || d.unread.length) throw new Error(`the readback is not clean: ${d.changes.length} difference(s), ${d.unread.length} field(s) not read`);
  if (readback.name !== d.name) throw new Error(`the readback is ${readback.name}, not the Base Component ${d.name}`);
  if (snapshotId !== contract.source.snapshotId) throw new Error(`snapshotId ${snapshotId} is not the Contract's ${contract.source.snapshotId}: the source moved since the review`);
  if (hash !== contentHash(contract)) throw new Error(`contentHash ${hash} is not the Contract's ${contentHash(contract)}: the Contract changed since the review`);
  return approve(contract, at, { prototype });
}

// ---------- CLI ----------

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
// A saved readback: one object, or the prototype's array of readbacks (the first is the Base Component).
const readReadback = p => { const r = readJson(p); return Array.isArray(r) ? r[0] : r; };

function foundationsFor(contractPath, given) {
  if (given) return readJson(given);
  const dsDir = resolvePath(dirname(contractPath), '..');
  const found = readdirSync(dsDir).filter(f => f.endsWith('.foundations.json'));
  if (found.length !== 1) throw new Error(`no single *.foundations.json in ${dsDir}; pass --foundations <file>`);
  return readJson(join(dsDir, found[0]));
}

// Validates before writing and refuses an invalid Contract; `allow(error)` names the errors a prototype accepts.
function writeContract(path, c, foundations, allow = () => false) {
  const v = validate(c, foundations);
  const blocking = v.errors.filter(e => !allow(e));
  if (blocking.length) throw new Error(`refused to write an invalid Contract to ${path}: ${blocking.map(e => `[${e.rule}] ${e.at}: ${e.message}`).join('; ')}`);
  writeJson(path, c);
  return v;
}

/** Re-derives every offline output from saved readbacks (fixtures), deterministically. Returns {file: text}. */
export function regenerate(fixturesDir, contract, foundations) {
  const rb = name => readReadback(join(fixturesDir, `readback.${name}.json`));
  const out = {};
  // The prototype's tweaks were made by a simulated owner, so every proposed and applied edit names it.
  const by = 'owner (simulated, prototype #8)';
  for (const name of ['v0', 'typed24', 'tweaked']) {
    const r = rb(name);
    out[`diff.${name}.txt`] = formatDiff(contract, r, review(contract, r, foundations, { by }));
  }
  const tweaked = review(contract, rb('tweaked'), foundations, { by });
  const applied = applyEdits(contract, tweaked.proposals, { confirm: 'all' });
  out['contract.edited.json'] = JSON.stringify(applied.contract, null, 2) + '\n';
  const v1 = rb('v1');
  const rebuilt = review(applied.contract, v1, foundations);
  out['review.edited.txt'] = formatReview(applied.contract, v1, rebuilt, { fileKey: 'PROTOTYPE', contractPath: 'contract.edited.json', readbackPath: 'readback.v1.json' });
  let blocked;
  try { approve(applied.contract, 'never'); } catch (e) { blocked = e.message; }
  const discarded = discardNote(applied.contract, 'layout.Label.letterSpacing', v1, foundations);
  out['approval.txt'] = [
    `closure added: ${applied.closure.added.join(', ') || '-'}; removed: ${applied.closure.removed.join(', ') || '-'}`,
    `approve while the letterSpacing tweak is open: refused (${blocked})`,
    `after the rebuild without it, discard the note: warning notes ${discarded.notes.filter(n => n.level === 'warning').length}`,
    `review package after the discard:`,
    formatReview(discarded, v1, review(discarded, v1, foundations), { fileKey: 'PROTOTYPE', contractPath: 'contract.edited.json', readbackPath: 'readback.v1.json' }).trimEnd(),
    '',
  ].join('\n');
  return out;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      foundations: { type: 'string' }, ledger: { type: 'string' }, out: { type: 'string' }, confirm: { type: 'string', default: '' },
      by: { type: 'string', default: 'owner' }, note: { type: 'string' }, 'file-key': { type: 'string' },
      'snapshot-id': { type: 'string' }, 'content-hash': { type: 'string' }, at: { type: 'string' }, prototype: { type: 'boolean', default: false },
    },
  });
  const [cmd, a, b] = positionals;
  const print = s => process.stdout.write(s);
  if (cmd === 'readback' && a && values.out) {
    const result = readJson(a);
    if (result.error || !result.readback) throw new Error(`no readback in ${a}: ${result.error || 'missing'}`);
    const ledger = readLedger(values.ledger || ledgerPath(result.fileKey));
    writeJson(values.out, normalizeReadback(result.readback, ledger));
    return print(`wrote ${values.out}\n`);
  }
  if (cmd === 'regen' && a && b) {
    const contract = readJson(join(a, 'button.component.json'));
    const foundations = readJson(values.foundations || fileURLToPath(new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url)));
    for (const [name, text] of Object.entries(regenerate(a, contract, foundations))) { mkdirSync(b, { recursive: true }); writeFileSync(join(b, name), text); }
    return print(`regenerated ${b}\n`);
  }
  if (!a || !b) { console.error('usage: see the header of base-loop.mjs'); process.exit(2); }
  const contract = readJson(a);
  const foundations = foundationsFor(a, values.foundations);
  const readback = readReadback(b);
  const outPath = values.out || a;
  if (cmd === 'diff') return print(formatDiff(contract, readback, review(contract, readback, foundations)));
  if (cmd === 'apply') {
    const r = review(contract, readback, foundations, { by: values.by });
    const confirm = values.confirm === 'all' ? 'all' : values.confirm.split(',').map(s => s.trim()).filter(Boolean);
    const res = applyEdits(contract, r.proposals, { confirm });
    const v = writeContract(outPath, res.contract, foundations);
    return print(JSON.stringify({ status: 'applied', out: outPath, applied: res.applied, notes: res.notes.map(n => `${n.level} ${n.at}`), closure: res.closure, valid: v.ok, errors: v.errors }, null, 2) + '\n');
  }
  if (cmd === 'discard') {
    if (!values.note) throw new Error('discard needs --note <at>');
    writeContract(outPath, discardNote(contract, values.note, readback, foundations), foundations);
    return print(`discarded the note at ${values.note}; wrote ${outPath}\n`);
  }
  if (cmd === 'review') {
    if (!values['file-key']) throw new Error('review needs --file-key');
    return print(formatReview(contract, readback, review(contract, readback, foundations), { fileKey: values['file-key'], contractPath: a, readbackPath: b }));
  }
  if (cmd === 'approve') {
    if (values.prototype) {
      const rel = relative(process.env.CLAUDE_PROJECT_DIR || process.cwd(), resolvePath(outPath));
      if (!values.out || !rel.startsWith('.scratch/')) throw new Error('a prototype approval is written only under .scratch/ (pass --out .scratch/...)');
    }
    const c = approveReviewed(contract, readback, foundations, {
      snapshotId: values['snapshot-id'], contentHash: values['content-hash'], at: values.at || new Date().toISOString(), prototype: values.prototype,
    });
    // a prototype approval fails rule 8 by design: it is never an owner approval
    const v = writeContract(outPath, c, foundations, e => values.prototype && e.rule === 8 && /only the owner approves/.test(e.message));
    return print(JSON.stringify({ status: 'approved', out: outPath, approval: c.selection.approval, valid: v.ok, errors: v.errors }, null, 2) + '\n');
  }
  console.error('usage: see the header of base-loop.mjs');
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`base-loop: ${e.message}`); process.exit(1); }
}

export { same, norm };
