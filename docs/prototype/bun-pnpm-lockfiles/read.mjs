#!/usr/bin/env node
// PROTOTYPE (#335), point 1: does one lock reader give projectPins what package-lock.json gives it today?
//   node docs/prototype/bun-pnpm-lockfiles/read.mjs <app folder> [--top <stop folder>] [--oracle <js-yaml dir>] [--fetch]
// Without --top the walk stops where workspaceTop says (lock.mjs).
// Prints the lock found, the catalog: resolutions, projectPins' pins and the preview renderer's React, as JSON.
// --oracle parses pnpm-lock.yaml with js-yaml too and compares (a check of the subset reader, not a dependency).
// --fetch downloads the Tailwind tarball the lock names and checks it against the lock's integrity (sources.mjs).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { downloadVerified } from '../../../skills/adapter-generic/scripts/sources.mjs';
import { findLock, lockView, parsePnpmLock } from './lock.mjs';
import { previewFrom, projectPinsFrom } from './pins.mjs';

const { values, positionals: [app] } = parseArgs({ allowPositionals: true, options: { top: { type: 'string' }, oracle: { type: 'string' }, fetch: { type: 'boolean' } } });
const out = { app };
const step = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = { error: e.message }; } };

let view;
step('lock', () => { view = lockView(app, values.top); const { file, kind, importer, notes } = view; return { file, kind, importer, packages: Object.keys(view.packages).length, notes: notes.slice(0, 5), moreNotes: Math.max(0, notes.length - 5) }; });
if (view) {
  step('catalog', () => view.catalog.length ? { count: view.catalog.length, allAgree: view.catalog.every(c => c.agrees !== false), tailwindcss: view.catalog.find(c => c.name === 'tailwindcss'), react: view.catalog.find(c => c.name === 'react') } : 'none');
  step('projectPins', () => {
    const { pins, imported } = projectPinsFrom(app, view);
    return { cssImports: imported, pins: Object.fromEntries(Object.entries(pins).map(([n, p]) => [n, `${p.version} ${p.integrity.slice(0, 19)}…`])) };
  });
  step('previewRenderer', () => previewFrom(view));
  if (values.oracle && view.kind === 'pnpm') step('oracle', () => {
    const yaml = createRequire(join(values.oracle, 'x.js'))('js-yaml');
    const text = readFileSync(findLock(app, values.top).file, 'utf8');
    const norm = x => JSON.stringify(x, (k, v) => (typeof v === 'number' ? String(v) : v));
    const mine = parsePnpmLock(text), theirs = yaml.load(text);
    const diffs = Object.keys(theirs).filter(k => norm(mine[k]) !== norm(theirs[k]));
    return diffs.length ? { equal: false, sections: diffs } : { equal: true, sections: Object.keys(theirs) };
  });
}
if (values.fetch && out.projectPins && out.projectPins.pins) {
  const tw = view.packages['node_modules/tailwindcss'];
  try { const bytes = await downloadVerified('tailwindcss', tw.version, tw.integrity); out.tailwindTarball = `tailwindcss@${tw.version}: ${bytes.length} bytes, sha512 matches the lock`; }
  catch (e) { out.tailwindTarball = { error: e.message }; }
}
console.log(JSON.stringify(out, null, 2));
