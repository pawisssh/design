#!/usr/bin/env node
// Pinned runtime packages for To-handoff's static reader (#112): parse5, for one HTML file.
//   node skills/to-handoff/scripts/deps.mjs [--dir <dir>]   fetch into .scratch/to-handoff
//
// Packages come from deps/package.json and its lockfile, installed with `npm ci --ignore-scripts` into
// gitignored scratch, so each tarball is checked against its lockfile `integrity` and nothing from a package
// runs at install. The repo keeps zero dependencies; tests that need the reader skip when it is absent.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEPS_DIR = join(REPO_ROOT, '.scratch/to-handoff');
const PINNED_DIR = fileURLToPath(new URL('../deps/', import.meta.url));
const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);

/** True when the pinned packages are installed in `dir` from the committed lockfile. */
export function hasDeps(dir = DEPS_DIR) {
  return lockOf(dir) === lockOf(PINNED_DIR) && existsSync(join(dir, 'node_modules/parse5/package.json'));
}

/** Install the pinned packages into `dir`. Skips when already installed. */
export function fetchDeps(dir = DEPS_DIR) {
  if (hasDeps(dir)) return dir;
  mkdirSync(dir, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(PINNED_DIR, f), join(dir, f));
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  return dir;
}

/** parse5 from the scratch install. Throws, naming the fetch command, when it is missing. */
export function loadParse5(dir = DEPS_DIR) {
  if (!hasDeps(dir)) throw new Error(`To-handoff packages missing in ${dir}; run: node skills/to-handoff/scripts/deps.mjs`);
  return createRequire(join(dir, 'package.json'))('parse5');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : DEPS_DIR;
  try { fetchDeps(dir); console.log(`To-handoff packages OK in ${dir}`); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
