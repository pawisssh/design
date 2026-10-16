#!/usr/bin/env node
// The Component Set coverage check (#32): a sets readback against the Contract. The Contract module expands
// and resolves; this file only compares. Three readbacks, each from a read-only sets call:
//   coverage  every variant's `Prop=Value` name, grid cell and property wiring; the set, its page and header
//   sample    full values of a few variants, diffed like the Base Component (base-loop.mjs diff)
//   theme     each bound colour resolved per Theme mode, against the foundations document
//
//   node skills/to-design/scripts/coverage.mjs <coverage|sample|theme> <contract.json> <result.json> [--ledger <path>] [--foundations <path>]
// Prints {ok, problems, ...}; exits 1 when a problem is found.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseTuple, expand, resolve, variantName } from '../../contract/scripts/contract.mjs';
import { diff } from './base-loop.mjs';
import { defaultProps, iconRef, normalizeReadback } from './expected.mjs';
import { ledgerPath, readLedger } from './ledger.mjs';

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

/**
 * Every expanded variant against a `coverage` readback: names (every `Prop=Value` label is a Contract axis and
 * value label), no missing, extra or duplicate variant, every one a component in its grid cell with the
 * default variant top-left, its property wiring, the set's properties, and the set's page, frame and header.
 */
export function checkCoverage(contract, readback) {
  const problems = [];
  const bad = (what, detail) => problems.push({ what, ...detail });
  const tuples = expand(contract);
  const want = new Map(tuples.map(t => [variantName(contract, t), t]));
  const labels = new Map(contract.axes.map(a => [a.label, new Set(a.values.map(v => v.label))]));
  const seen = new Map();
  for (const [parts, refsIdx, row, col, isComponent] of readback.rows) {
    const pairs = parts.map(i => readback.dict[i]);
    const name = pairs.join(', ');
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

  const s = readback.set || {};
  const def = variantName(contract, baseTuple(contract));
  const rows = contract.figma.grid.rows.reduce((m, k) => m * contract.axes.find(a => a.key === k).values.length, 1);
  const cols = contract.figma.grid.columns.reduce((m, k) => m * contract.axes.find(a => a.key === k).values.length, 1);
  const expectSet = { name: contract.figma.componentSetName, description: contract.figma.description, layoutMode: 'GRID', grid: [rows, cols],
    defaultVariant: def, page: contract.figma.page, parents: ['Content', 'Components'] };
  for (const [k, v] of Object.entries(expectSet)) if (!eqJ(s[k], v)) bad('set', { field: k, want: v, got: s[k] });
  const sec = readback.section || {};
  if (!eqJ(sec.children, ['Header', 'Content']) || sec.minWidth !== 2560 || sec.minHeight !== 1440) bad('section', { got: sec });
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
  return { ok: problems.length === 0, expected: tuples.length, read: readback.rows.length, problems };
}

/** A `sample` readback: each variant diffed against what the Contract resolves for it, at the property defaults. */
export function checkSample(contract, readback, ledger, foundations) {
  const byName = new Map(expand(contract).map(t => [variantName(contract, t), t]));
  const problems = [];
  const names = Object.keys(readback.sample || {});
  for (const name of names) {
    const raw = readback.sample[name];
    const t = byName.get(name);
    if (!raw || !t) { problems.push({ what: raw ? 'extra' : 'missing', name }); continue; }
    const d = diff(contract, normalizeReadback(raw, ledger), foundations, defaultProps(contract), t);
    if (d.changes.length || d.unread.length) problems.push({ what: 'diff', name, changes: d.changes, unread: d.unread });
    const wantRefs = refsOf(contract, t);
    if (!eqJ(raw.refs || {}, wantRefs)) problems.push({ what: 'wiring', name, want: wantRefs, got: raw.refs });
    const cell = cellOf(contract, t);
    if (!eqJ(raw.cell, cell)) problems.push({ what: 'cell', name, want: cell, got: raw.cell });
  }
  return { ok: problems.length === 0 && names.length > 0, sampled: names.length, problems };
}

// "#rrggbb" or "rgba(r, g, b, a)" -> "#rrggbb" or "#rrggbb/a", as the theme readback reports colours
export function colourKey(v) {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(String(v));
  if (!m) return String(v).toLowerCase();
  const hex = '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
  return m[4] != null && +m[4] < 1 ? `${hex}/${Math.round(+m[4] * 1000) / 1000}` : hex;
}

/**
 * A `theme` readback: every bound colour resolved with the Theme switched to each mode equals the foundations
 * document's resolved value for that mode. Reports how many colours change between modes.
 */
export function checkTheme(contract, readback, foundations) {
  const byName = new Map(expand(contract).map(t => [variantName(contract, t), t]));
  const modeKey = {};
  for (const c of foundations.collections) for (const m of c.modes) { modeKey[m.key] = m.key; modeKey[m.label] = m.key; }
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
        const exp = v.values[modeKey[mode]];
        checked++;
        if (!exp || colourKey(exp.resolved) !== got) problems.push({ what: 'colour', name, at: where, token, mode, want: exp && colourKey(exp.resolved), got });
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
  const [what, contractPath, resultPath] = args;
  if (!['coverage', 'sample', 'theme'].includes(what) || !contractPath || !resultPath) {
    console.error('usage: coverage.mjs <coverage|sample|theme> <contract.json> <result.json> [--ledger <path>] [--foundations <path>]');
    process.exit(2);
  }
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const foundations = JSON.parse(readFileSync(foundationsArg || join(root, 'design-systems', contract.source.adapter, `${contract.source.adapter}.foundations.json`), 'utf8'));
  let report;
  if (what === 'coverage') report = checkCoverage(contract, result);
  else if (what === 'theme') report = checkTheme(contract, result, foundations);
  else report = checkSample(contract, result, readLedger(ledgerArg || ledgerPath(result.fileKey)), foundations);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
