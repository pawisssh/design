#!/usr/bin/env node
// PROTOTYPE (#335): the lockfile row's variants, in temp copies, through lockView + projectPinsFrom.
//   node docs/prototype/bun-pnpm-lockfiles/cases.mjs <lovable clone> <replit clone>
// Also checks that a package-lock.json Prototype (the committed radix-nova fixture) gives the same pins as projectPins.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURE, projectPins } from '../../../skills/adapter-generic/scripts/sources.mjs';
import { lockView } from './lock.mjs';
import { projectPinsFrom } from './pins.mjs';

const [lovable, replit] = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'lock-335-'));
const short = pins => Object.fromEntries(Object.entries(pins).map(([n, p]) => [n, `${p.version} ${p.integrity.slice(7, 19)}`]));
const run = (label, app, top) => {
  try { const v = lockView(app, top); const { pins } = projectPinsFrom(app, v); return [label, `${v.file} (${v.kind}) -> ${JSON.stringify(short(pins))}`]; }
  catch (e) { return [label, `refused: ${e.message}`]; }
};
const copy = (from, name, drop = [], add = {}) => {
  const to = join(tmp, name);
  cpSync(from, to, { recursive: true, filter: s => !/\/(node_modules|\.git)$/.test(s) });
  for (const f of drop) rmSync(join(to, f), { force: true });
  for (const [f, text] of Object.entries(add)) writeFileSync(join(to, f), text);
  return to;
};
const rows = [];
const real = short(projectPins(FIXTURE));
const mine = run('package-lock.json (radix-nova fixture)', FIXTURE, FIXTURE)[1];
rows.push(['package-lock.json: same pins as projectPins', mine.endsWith(JSON.stringify(real)) ? `yes, ${JSON.stringify(real)}` : `NO: ${mine} vs ${JSON.stringify(real)}`]);
rows.push(run('bun.lock (Lovable)', lovable, lovable));
const lockb = copy(lovable, 'lockb-only', ['bun.lock']);
rows.push(run('bun.lockb only', lockb, lockb));
const yarn = copy(lovable, 'yarn-only', ['bun.lock', 'bun.lockb'], { 'yarn.lock': '# yarn lockfile v1\n' });
rows.push(run('yarn.lock only', yarn, yarn));
const none = copy(lovable, 'none', ['bun.lock', 'bun.lockb']);
rows.push(run('no lockfile', none, none));
const both = copy(lovable, 'both', [], { 'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/tailwindcss': { version: '3.4.17', integrity: 'sha512-x' } } }) });
rows.push(run('package-lock.json beside bun.lock: package-lock.json wins', both, both));
const app = join(replit, 'artifacts/hopebridge');
rows.push(run('pnpm workspace root, from the app folder', app, replit));
rows.push(run('pnpm: top is the app folder (the walk stops there)', app, app));
rows.push(run('pnpm: a folder that is not an importer', join(replit, 'artifacts'), replit));
rmSync(tmp, { recursive: true, force: true });
for (const [label, result] of rows) console.log(`- ${label}: ${result}`);
