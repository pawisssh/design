#!/usr/bin/env node
// The Component Set coverage check (#32): a sets readback against the Contract. The Contract module expands
// and resolves; this file only compares. Three readbacks, each from a read-only sets call:
//   coverage  every variant's `Prop=Value` name, grid cell and property wiring; the set, its page and header
//   sample    full values of a few variants, diffed like the Base Component (base-loop.mjs diff)
//   theme     each bound colour resolved per Theme mode, against the foundations document
//
//   node skills/to-design/scripts/coverage.mjs <coverage|sample|theme> <contract.json> <result.json> [--ledger <path>] [--foundations <path>] [--page <name>]
//   node skills/to-design/scripts/coverage.mjs coverage <contract.json> <page-0 result.json> <page-1 result.json> ... (a paged read, --batch)
// Prints {ok, problems, ...}; exits 1 when a problem is found.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseTuple, expand, resolve, variantName } from '../../contract/scripts/contract.mjs';
import { diff } from './base-loop.mjs';
import { valueAt } from './foundations-value.mjs';
import { defaultProps, iconRef, normalizeReadback, rootFillProblems } from './readback.mjs';
import { defaultLedgerPath, readLedger } from './ledger.mjs';

// The grid cell [row, column] a tuple sits in: figma.grid lists the axes that make the rows and the columns;
// along each axis the default value comes first, then the others in Contract order.
export function cellOf(contract, tuple) {
  const order = a => { const vals = a.values.map(v => v.key); return [a.default, ...vals.filter(v => v !== a.default)]; };
  const axis = k => contract.axes.find(a => a.key === k);
  return ['rows', 'columns'].map(dim => contract.figma.grid[dim].reduce((m, k) => m * axis(k).values.length + order(axis(k)).indexOf(tuple[k]), 0));
}

// What the variant's layers should reference: {node: {field: property label}}.
function refsOf(contract, tuple) {
  const binds = resolve(contract, tuple).binds;
  const out = {};
  for (const p of contract.properties) for (const b of binds[p.key]) (out[b.node] = out[b.node] || {})[b.field] = p.label;
  return out;
}

const sortKeys = o => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])])) : o);
const eqJ = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// The family page template (#22 Figma structure rules): the set's grid chrome, the Components frame and its
// Content. Written out here, apart from the core that builds it, so the check does not trust the builder.
const PAGE_TEMPLATE = {
  set: { gap: [20, 20], padding: 20, dash: [10, 5], radius: 5, stroke: { raw: '#9747ff' } },
  section: { name: 'Components', layoutMode: 'VERTICAL', children: ['Header', 'Content'], minWidth: 2560, minHeight: 1440 },
  content: { padding: [80, 80, 80, 80], gap: 80 },
};

/**
 * One coverage readback from the pages of a paged read (`build-plan.mjs sets --mode coverage --batch N`), each a
 * window of the set's children: every page of one read, once, of the same set with the same number of children.
 * The rows join in page order under one dictionary, and so do the off-centre nodes; the set's own fields come from
 * the first page.
 */
export function mergeCoverage(pages) {
  if (!pages.length) throw new Error('no coverage pages');
  const of = pages[0].batch ? pages[0].batch[1] : null;
  if (pages.length === 1 && !pages[0].batch) return pages[0];
  const byBatch = new Map();
  for (const p of pages) {
    if (p.mode !== 'coverage' || !p.batch) throw new Error('a paged read merges only coverage pages (--mode coverage --batch N)');
    if (p.batch[1] !== of || p.family !== pages[0].family || p.fileKey !== pages[0].fileKey) throw new Error('the pages are not of one read');
    if (p.set.id !== pages[0].set.id || p.summary.children !== pages[0].summary.children)
      throw new Error(`the set changed between pages (${pages[0].set.id}, ${pages[0].summary.children} children): read every page again`);
    if (byBatch.has(p.batch[0])) throw new Error(`page ${p.batch[0]} is given twice`);
    byBatch.set(p.batch[0], p);
  }
  const missing = Array.from({ length: of }, (_, i) => i).filter(i => !byBatch.has(i));
  if (missing.length) throw new Error(`pages ${missing.join(', ')} of ${of} are not read yet`);
  const dict = [];
  const di = new Map();
  const D = s => (di.has(s) ? di.get(s) : (di.set(s, dict.push(s) - 1), dict.length - 1));
  const rows = [];
  for (let i = 0; i < of; i++) {
    const p = byBatch.get(i);
    for (const [parts, refs, ...rest] of p.rows) rows.push([parts.map(x => D(p.dict[x])), D(p.dict[refs]), ...rest]);
  }
  const { batch, offCentre, ...first } = pages[0];
  const centring = pages.every(p => Array.isArray(p.offCentre)) ? { offCentre: pages.flatMap(p => p.offCentre) } : {};
  return { ...first, summary: { ...first.summary, variants: rows.length }, dict, rows, ...centring };
}

/**
 * Every expanded variant against a `coverage` readback: names (every `Prop=Value` label is a Contract axis and
 * value label), no missing, extra or duplicate variant, every one a component in its grid cell with the
 * default variant top-left, its property wiring, every absolute node centred in its parent (#442), the set's
 * properties, and the set's page, frame and header. The page is on `page` (the name `--page` built it on) when
 * given; else, when the ledger records the set's page and the readback has its id, on that page (matched by id, so
 * a rename is no problem); else on the Contract's.
 */
export function checkCoverage(contract, readback, ledger = null, { page = null } = {}) {
  const problems = [];
  // a variant the selection dropped, which the ledger keeps as an orphan until a prune (#67), is listed under the
  // name the ledger keeps, not a problem. It is matched by its id (the readback's row ends with it), and by name
  // only for an orphan the ledger has no id for.
  const recordedSet = (ledger && ledger.sets && ledger.sets[contract.family.key]) || {};
  const orphans = recordedSet.orphans || {};
  const byId = new Map(Object.entries(orphans).filter(([, o]) => o.id).map(([name, o]) => [o.id, name]));
  const orphaned = [];
  const bad = (what, detail) => problems.push({ what, ...detail });
  const tuples = expand(contract);
  for (const p of rootFillProblems(contract, tuples)) bad('contract', p);
  const want = new Map(tuples.map(t => [variantName(contract, t), t]));
  const labels = new Map(contract.axes.map(a => [a.label, new Set(a.values.map(v => v.label))]));
  const seen = new Map();
  for (const [parts, refsIdx, row, col, isComponent, id] of readback.rows) {
    const pairs = parts.map(i => readback.dict[i]);
    const name = pairs.join(', ');
    if (byId.has(id)) { orphaned.push(byId.get(id)); continue; }
    if (orphans[name] && !orphans[name].id && !want.has(name)) { orphaned.push(name); continue; }
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (!labels.has(k) || !labels.get(k).has(v)) bad('label', { name, label: pair });
    }
    if (seen.has(name)) { bad('duplicate', { name }); continue; }
    seen.set(name, true);
    const t = want.get(name);
    if (!t) { bad('extra', { name }); continue; }
    if (!isComponent) bad('not-a-component', { name });
    const cell = cellOf(contract, t);
    if (row !== cell[0] || col !== cell[1]) bad('cell', { name, want: cell, got: [row, col] });
    const refs = JSON.parse(readback.dict[refsIdx]);
    const wantRefs = refsOf(contract, t);
    if (!eqJ(refs, wantRefs)) bad('wiring', { name, want: wantRefs, got: refs });
  }
  for (const name of want.keys()) if (!seen.has(name)) bad('missing', { name });
  // the core lists [variant, node, px] for each absolute node more than Figma's half pixel off its parent's centre
  const absolute = contract.layout.some(r => Object.values(r.set).some(f => f.position === 'absolute'));
  if (absolute && !Array.isArray(readback.offCentre)) bad('off-centre', { reason: 'unread' });
  for (const [name, node, px] of readback.offCentre || []) bad('off-centre', { name, node, px });

  const s = readback.set || {};
  const def = variantName(contract, baseTuple(contract));
  const cells = keys => keys.reduce((m, k) => m * contract.axes.find(a => a.key === k).values.length, 1);
  const recordedPage = s.pageId ? recordedSet.page : null;
  const expectSet = { name: contract.figma.componentSetName, description: contract.figma.description, layoutMode: 'GRID',
    grid: [cells(contract.figma.grid.rows), cells(contract.figma.grid.columns)], defaultVariant: def, ...(recordedPage && !page ? {} : { page: page || contract.figma.page }),
    parents: ['Content', 'Components'], ...PAGE_TEMPLATE.set };
  for (const [k, v] of Object.entries(expectSet)) if (!eqJ(s[k], v)) bad('set', { field: k, want: v, got: s[k] });
  if (recordedPage && s.pageId !== recordedPage) bad('set', { field: 'page', want: recordedPage, got: s.pageId });
  const sec = readback.section || {};
  for (const [k, v] of Object.entries(PAGE_TEMPLATE.section)) if (!eqJ(sec[k], v)) bad('section', { field: k, want: v, got: sec[k] });
  for (const [k, v] of Object.entries(PAGE_TEMPLATE.content)) if (!eqJ((readback.content || {})[k], v)) bad('content', { field: k, want: v, got: (readback.content || {})[k] });
  const h = contract.figma.header;
  const wantHeader = { Type: h.type, Title: h.title, Namespace: h.namespace };
  if (!eqJ(readback.header, wantHeader)) bad('header', { want: wantHeader, got: readback.header });

  for (const p of contract.properties) {
    const got = (readback.props || {})[p.label];
    const exp = { type: p.type, default: p.type === 'INSTANCE_SWAP' ? iconRef(contract, p.default) : p.default };
    if (p.type === 'INSTANCE_SWAP') exp.preferred = p.preferred === 'icon:preferred' ? [...contract.icons.preferred] : [].concat(p.preferred || []).map(r => iconRef(contract, r));
    if (!got) { bad('property', { name: p.label, reason: 'missing' }); continue; }
    for (const [k, v] of Object.entries(exp)) if (!eqJ(got[k], v)) bad('property', { name: p.label, field: k, want: v, got: got[k] });
  }
  const extraProps = Object.keys(readback.props || {}).filter(k => !contract.properties.some(p => p.label === k));
  for (const name of extraProps) bad('property', { name, reason: 'extra' });
  return { ok: problems.length === 0, expected: tuples.length, read: readback.rows.length, orphaned, problems };
}

/** A `sample` readback: each variant diffed against what the Contract resolves for it, at the property defaults. */
export function checkSample(contract, readback, ledger, foundations) {
  const byName = new Map(expand(contract).map(t => [variantName(contract, t), t]));
  const problems = [];
  const unbuilt = new Set();
  const names = Object.keys(readback.sample || {});
  for (const name of names) {
    const raw = readback.sample[name];
    const t = byName.get(name);
    if (!raw || !t) { problems.push({ what: raw ? 'extra' : 'missing', name }); continue; }
    const d = diff(contract, { ...normalizeReadback(raw, ledger), specimen: 'set' }, foundations, defaultProps(contract), t);
    if (d.changes.length || d.unread.length || d.problems.length) problems.push({ what: 'diff', name, changes: d.changes, unread: d.unread, problems: d.problems });
    d.unbuilt.forEach(f => unbuilt.add(f));
    const wantRefs = refsOf(contract, t);
    if (!eqJ(raw.refs || {}, wantRefs)) problems.push({ what: 'wiring', name, want: wantRefs, got: raw.refs });
    const cell = cellOf(contract, t);
    if (!eqJ(raw.cell, cell)) problems.push({ what: 'cell', name, want: cell, got: raw.cell });
  }
  return { ok: problems.length === 0 && names.length > 0, sampled: names.length, problems, unbuilt: [...unbuilt].sort() };
}

// "#rrggbb" or "rgba(r, g, b, a)" -> "#rrggbb" or "#rrggbb/a", as the theme readback reports colours
export function colourKey(v) {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(String(v));
  if (!m) return String(v).toLowerCase();
  const hex = '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
  return m[4] != null && +m[4] < 1 ? `${hex}/${Math.round(+m[4] * 1000) / 1000}` : hex;
}

/**
 * A `theme` readback: every bound colour, resolved with its variable's collection switched to each mode (the
 * Theme, or the Layer for a contextual Layer token), equals the foundations document's value for that mode.
 * Reports how many colours change between modes.
 */
export function checkTheme(contract, readback, foundations) {
  const byName = new Map(expand(contract).map(t => [variantName(contract, t), t]));
  const problems = [];
  let checked = 0;
  let switching = 0;
  for (const [name, colours] of Object.entries(readback.theme || {})) {
    const t = byName.get(name);
    if (!colours || !t) { problems.push({ what: colours ? 'extra' : 'missing', name }); continue; }
    // every colour the Contract gives a token: a fill or stroke, or an effect's colour
    const want = {};
    for (const [node, fields] of Object.entries(resolve(contract, t).paint))
      for (const [field, value] of Object.entries(fields)) {
        if (field === 'effects' && Array.isArray(value)) value.forEach((e, j) => { if (e.color && e.color.token) want[`${node}.effects.${j}`] = e.color.token; });
        else if (value && value.token && foundations.variables[value.token] && foundations.variables[value.token].type === 'COLOR') want[`${node}.${field}`] = value.token;
      }
    for (const where of Object.keys(colours)) if (!(where in want)) problems.push({ what: 'unexpected', name, at: where });
    for (const [where, token] of Object.entries(want)) {
      const perMode = colours[where];
      if (!perMode) { problems.push({ what: 'unbound', name, at: where, token }); continue; }
      const v = foundations.variables[token];
      const modes = (foundations.collections.find(c => c.key === v.collection) || { modes: [] }).modes;
      if (Object.keys(perMode).length !== modes.length) problems.push({ what: 'modes', name, at: where, want: modes.map(m => m.key), got: Object.keys(perMode) });
      for (const [mode, got] of Object.entries(perMode)) {
        // the read switches only the token's own collection: a Layer token is checked per level, Theme at its default
        const key = (modes.find(m => m.key === mode || m.label === mode) || {}).key;
        const exp = key && valueAt(foundations, token, { [v.collection]: key });
        const expKey = exp == null ? undefined : colourKey(exp);
        checked++;
        if (expKey === undefined || expKey !== got) problems.push({ what: 'colour', name, at: where, token, mode, want: expKey, got });
      }
      if (new Set(Object.values(perMode)).size > 1) switching++;
    }
  }
  return { ok: problems.length === 0 && checked > 0, checked, switching, problems };
}

function main() {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(name); return i === -1 ? null : args.splice(i, 2)[1]; };
  const ledgerArg = opt('--ledger');
  const foundationsArg = opt('--foundations');
  const pageArg = opt('--page');
  const [what, contractPath, resultPath, ...pages] = args;
  if (!['coverage', 'sample', 'theme'].includes(what) || !contractPath || !resultPath || (pages.length && what !== 'coverage')
    || (pageArg !== null && (!pageArg || pageArg.startsWith('--') || what !== 'coverage'))) {
    console.error('usage: coverage.mjs <coverage|sample|theme> <contract.json> <result.json> [<result.json> ... (coverage pages)] [--ledger <path>] [--foundations <path>] [--page <name> (coverage only)]');
    process.exit(2);
  }
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  const result = mergeCoverage([resultPath, ...pages].map(p => JSON.parse(readFileSync(p, 'utf8'))));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const foundations = JSON.parse(readFileSync(foundationsArg || join(root, 'design-systems', contract.source.adapter, `${contract.source.adapter}.foundations.json`), 'utf8'));
  let report;
  if (what === 'coverage') report = checkCoverage(contract, result, readLedger(ledgerArg || defaultLedgerPath(result.fileKey)), { page: pageArg });
  else if (what === 'theme') report = checkTheme(contract, result, foundations);
  else report = checkSample(contract, result, readLedger(ledgerArg || defaultLedgerPath(result.fileKey)), foundations);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`coverage: ${e.message}`); process.exit(1); }
}
