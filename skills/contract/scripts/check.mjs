#!/usr/bin/env node
// Node entry for the shared Contract module: reads files, validates, prints a summary.
//   node skills/contract/scripts/check.mjs <component.json> [--foundations <file>] [--table]
//   node skills/contract/scripts/check.mjs <proposal.json> [--foundations <file>]
// A Proposal (design-systems/<ds>/proposals/<key>.proposal.json) is validated against the Design System's
// Contracts (contracts/*.component.json) and other Proposals.
// The foundations document defaults to the one next to the contracts folder
// (design-systems/<ds>/contracts/<family>.component.json -> design-systems/<ds>/<ds>.foundations.json).
// --table prints the resolved paint for the Figma grid rows (figma.grid.rows) at the default of
// every other axis. Exit code 1 when the Contract is invalid.
import { parseArgs } from 'node:util';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { validateProposal, validate, expand, baseTuple, variantName, closure, resolve } from './contract.mjs';
import { foundationsPathFor, readJson } from './io.mjs';

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { foundations: { type: 'string' }, table: { type: 'boolean', default: false } } });
const [contractPath] = positionals;
if (!contractPath) {
  console.error('usage: check.mjs <component.json | proposal.json> [--foundations <file>] [--table]');
  process.exit(2);
}
let c, foundations;
try {
  c = readJson(contractPath);
  foundations = readJson(foundationsPathFor(contractPath, args.foundations));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
if (contractPath.endsWith('.proposal.json')) {
  const dsDir = resolvePath(dirname(contractPath), '..');
  const readAll = (dir, suffix) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(suffix)).map(f => readJson(join(dir, f))) : []);
  const contracts = readAll(join(dsDir, 'contracts'), '.component.json');
  const proposals = readAll(dirname(contractPath), '.proposal.json').filter(x => !c.family || !x.family || x.family.key !== c.family.key);
  // a dependency's `designSystem` names a sibling folder, whose approved Contracts it is looked up among (#317)
  const designSystems = {};
  for (const f of (c.dependencies && c.dependencies.families) || []) {
    const dir = f.designSystem && join(dsDir, '..', f.designSystem, 'contracts');
    if (dir && existsSync(dir)) designSystems[f.designSystem] = readAll(dir, '.component.json');
  }
  const result = validateProposal(c, foundations, { contracts, proposals, designSystems });
  for (const e of result.errors) console.log(`FAIL [rule ${e.rule}] ${e.message}`);
  if (result.readyToRetire) console.log(`ready to retire: Contract "${result.readyToRetire}" has this key; the owner confirms retirement in chat`);
  console.log(result.ok ? `\nOK (Proposal ${c.family.key}, status ${c.status})` : `\nINVALID (${result.errors.length} errors)`);
  process.exit(result.ok ? 0 : 1);
}
const { ok, errors } = validate(c, foundations);
for (const e of errors) console.log(`FAIL [rule ${e.rule}] ${e.message}`);
if (errors.some(e => e.rule === 'schema' || e.rule === 3)) process.exit(1);

const selected = expand(c);
const tokens = closure(c);
console.log(`variants ${selected.length} (expectedCount ${c.selection.expectedCount}), status ${c.selection.status}`);
console.log(`Base Component: ${variantName(c, baseTuple(c))}`);
console.log(`token closure (${tokens.length}): ${tokens.join(', ')}`);

if (args.table) {
  const rows = (c.figma && c.figma.grid && c.figma.grid.rows) || c.axes.map(a => a.key);
  const base = baseTuple(c);
  const show = v => (Array.isArray(v) ? `[${v.length} effects]` : v && typeof v === 'object' ? (v.token || `raw ${v.raw}`) : String(v));
  const fixed = c.axes.filter(a => !rows.includes(a.key)).map(a => `${a.key}=${base[a.key]}`).join(', ');
  console.log(`\npaint by ${rows.join(' x ')}${fixed ? ` at ${fixed}` : ''}:`);
  for (const t of selected.filter(t => c.axes.every(a => rows.includes(a.key) || t[a.key] === base[a.key]))) {
    const { paint } = resolve(c, t);
    const cells = Object.entries(paint).flatMap(([node, fields]) => Object.entries(fields).map(([f, v]) => `${node}.${f}=${show(v)}`));
    console.log(`  ${rows.map(k => t[k]).join(' / ')}: ${cells.join('  ')}`);
  }
}
console.log(ok ? '\nOK' : `\nINVALID (${errors.length} errors)`);
process.exit(ok ? 0 : 1);
