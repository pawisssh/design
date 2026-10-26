#!/usr/bin/env node
// Fails on an export a change adds under skills/*/scripts/ that no other file imports: a module's interface is what
// its callers and tests use, and a helper only the module itself calls stays unexported (#381's review).
//
//   node .github/exports.mjs <base ref> [<head ref>]    e.g. origin/main; CI gives the pull request's base
//
// An import counts from any code file under skills/, scripts/ or .github/, tests included. A namespace import
// (`import * as m`) or a dynamic `import('./x.mjs')` counts as using every export of its module.
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { addedLines, blobs, git } from './duplicates.mjs';

const CODE = /\.m?js$/;
const CHECKED = /^skills\/[^/]+\/scripts\/[^/]+\.m?js$/;

// An export declaration: `export [async] function|const|let|class name`, or `export { a, b as c } [from '…']`.
const DECLARED = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const LISTED = /^export\s*\{([^}]*)\}/;

/** The names a file exports, each at its 1-based line: [{name, line}]. `export default` is left out. */
export function exportsOf(text) {
  return text.split('\n').flatMap((l, i) => {
    const declared = l.match(DECLARED);
    if (declared) return [{ name: declared[1], line: i + 1 }];
    const listed = l.match(LISTED);
    if (!listed) return [];
    return listed[1].split(',').map(s => s.trim()).filter(Boolean)
      .map(s => ({ name: s.split(/\s+as\s+/).pop(), line: i + 1 })).filter(e => e.name !== 'default');
  });
}

// `import <clause> from '<spec>'` and `export { … } from '<spec>'`, either across lines; then `import('<spec>')`.
const STATIC = /\b(?:import\s+([\w$\s,{}*]*?)|export\s*(\{[^}]*\}))\s*from\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * What one file imports from the repo's own modules: {path: Set of names, or '*' for all of them}. Only a relative
 * specifier names a repo file; it resolves against the importing file's folder.
 */
export function importsOf(file, text) {
  const out = {};
  const add = (spec, names) => {
    if (!spec.startsWith('.')) return;
    const path = posix.normalize(posix.join(posix.dirname(file), spec));
    if (out[path] === '*') return;
    if (names === '*') out[path] = '*';
    else for (const n of names) (out[path] ??= new Set()).add(n);
  };
  for (const [, clause, reexport, spec] of text.matchAll(STATIC)) {
    const body = clause ?? reexport;
    if (/\*\s*as\b/.test(body)) { add(spec, '*'); continue; }
    const braces = body.match(/\{([^}]*)\}/);
    add(spec, braces ? braces[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : []);
  }
  for (const [, spec] of text.matchAll(DYNAMIC)) add(spec, '*');
  return out;
}

/**
 * The exports a change adds that no other file imports. `files` is {path: text} at the change's head, `added`
 * {path: Set of added line numbers}. -> [{file, line, name}]
 */
export function unusedExports(files, added) {
  const used = {};
  for (const [file, text] of Object.entries(files))
    for (const [path, names] of Object.entries(importsOf(file, text))) {
      if (path === file) continue;
      if (names === '*' || used[path] === '*') used[path] = '*';
      else for (const n of names) (used[path] ??= new Set()).add(n);
    }
  return Object.entries(added).filter(([f]) => CHECKED.test(f) && files[f] !== undefined).flatMap(([file, lines]) =>
    used[file] === '*' ? [] : exportsOf(files[file]).filter(e => lines.has(e.line) && !(used[file] && used[file].has(e.name))).map(e => ({ file, ...e })));
}

function main() {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  if (!base) { console.error('usage: node .github/exports.mjs <base ref> [<head ref>]'); process.exit(2); }
  const code = f => CODE.test(f) && !f.includes('/fixtures/');
  const tracked = git(['ls-tree', '-r', '-z', '--name-only', head, '--', 'skills', 'scripts', '.github']).toString('utf8').split('\0').filter(code);
  const files = blobs(head, tracked);
  const diff = git(['diff', '-U0', '--no-color', '--diff-filter=AMR', `${base}...${head}`, '--', 'skills']).toString('utf8');
  const found = unusedExports(files, addedLines(diff));
  for (const e of found) console.log(`${e.file}:${e.line} exports \`${e.name}\`, which no other file imports`);
  if (found.length) {
    console.log(`\n${found.length} unused export(s): drop \`export\`, so the module's interface is only what its callers and tests use.`);
    process.exit(1);
  }
  console.log('no unused export added under skills/*/scripts/');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
