#!/usr/bin/env node
// Node entry for the shared Contract module: reads files, validates, prints a summary.
//   node skills/contract/scripts/check.mjs <component.json> [--foundations <file>] [--table]
// The foundations document defaults to the one next to the contracts folder
// (design-systems/<ds>/contracts/<family>.component.json -> design-systems/<ds>/<ds>.foundations.json).
// --table prints the resolved paint for the Figma grid rows (figma.grid.rows) at the default of
// every other axis. Exit code 1 when the Contract is invalid.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { validate, expand, baseTuple, variantName, closure, resolve } from './contract.mjs';

const args = process.argv.slice(2);
const contractPath = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--foundations');
if (!contractPath) {
  console.error('usage: check.mjs <component.json> [--foundations <file>] [--table]');
  process.exit(2);
}
let foundationsPath = args.includes('--foundations') ? args[args.indexOf('--foundations') + 1] : null;
if (!foundationsPath) {
  const dsDir = resolvePath(dirname(contractPath), '..');
  const found = readdirSync(dsDir).filter(f => f.endsWith('.foundations.json'));
  if (found.length !== 1) {
    console.error(`no single *.foundations.json in ${dsDir}; pass --foundations <file>`);
    process.exit(2);
  }
  foundationsPath = join(dsDir, found[0]);
}

const c = JSON.parse(readFileSync(contractPath, 'utf8'));
const foundations = JSON.parse(readFileSync(foundationsPath, 'utf8'));
const { ok, errors } = validate(c, foundations);
for (const e of errors) console.log(`FAIL [rule ${e.rule}] ${e.message}`);
if (errors.some(e => e.rule === 'schema' || e.rule === 3)) process.exit(1);

const selected = expand(c);
const tokens = closure(c);
console.log(`variants ${selected.length} (expectedCount ${c.selection.expectedCount}), status ${c.selection.status}`);
console.log(`Base Component: ${variantName(c, baseTuple(c))}`);
console.log(`token closure (${tokens.length}): ${tokens.join(', ')}`);

if (args.includes('--table')) {
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
