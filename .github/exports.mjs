#!/usr/bin/env node
// Fails on an export a change adds under skills/*/scripts/ that no other file imports: a module's interface is what
// its callers and tests use, and a helper only the module itself calls stays unexported (#381's review).
//
//   node .github/exports.mjs <base ref> [<head ref>]    e.g. origin/main; CI gives the pull request's base
//
// An export counts as added when its file did not export that name on the base, so editing a line that holds an
// older export leaves that export alone.
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { codeAt, git } from './git.mjs';

const CODE = /\.m?js$/;
const CHECKED = /^skills\/[^/]+\/scripts\/[^/]+\.m?js$/;
// Every export of a module: what a namespace import, a dynamic import or a load by file name uses.
const ALL = '*';

// An export declaration, `export [async] function|const|let|class name`, or an export list, `export { a, b as c }`,
// which may span lines.
const DECLARED = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const LISTED = /^export\s*\{([^}]*)\}/gm;
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** The names a file exports, each at its 1-based line, in file order: [{name, line}]. `export default` is left out. */
export function exportsOf(text) {
  const found = [...text.matchAll(DECLARED)].map(m => ({ name: m[1], line: lineAt(text, m.index) }));
  for (const m of text.matchAll(LISTED))
    for (const s of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const name = s.split(/\s+as\s+/).pop();
      if (name !== 'default') found.push({ name, line: lineAt(text, m.index) });
    }
  return found.sort((a, b) => a.line - b.line);
}

// `import <clause> from '<spec>'` and `export { … } from '<spec>'`, either across lines; then `import('<spec>')`.
const STATIC = /\b(?:import\s+([\w$\s,{}*]*?)|export\s*(\{[^}]*\}))\s*from\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
// A module loaded by convention from a computed path, `join(…, 'scripts', 'handoff-adapter.mjs')`: a string that is
// a file name alone.
const BY_NAME = /['"]([\w.-]+\.m?js)['"]/g;

// Adds `names` (a list, or ALL) to what `used` records for `path`.
function use(used, path, names) {
  if (used[path] === ALL) return;
  if (names === ALL) used[path] = ALL;
  else for (const n of names) (used[path] ??= new Set()).add(n);
}

/**
 * What one file imports from the repo's own modules: {path: Set of names, or ALL}. A relative specifier resolves
 * against the importing file's folder; a re-export counts as a use of what it re-exports.
 */
export function importsOf(file, text) {
  const out = {};
  const add = (spec, names) => { if (spec.startsWith('.')) use(out, posix.normalize(posix.join(posix.dirname(file), spec)), names); };
  for (const [, clause, reexport, spec] of text.matchAll(STATIC)) {
    const body = clause ?? reexport;
    if (/\*\s*as\b/.test(body)) { add(spec, ALL); continue; }
    const braces = body.match(/\{([^}]*)\}/);
    add(spec, braces ? braces[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : []);
  }
  for (const [, spec] of text.matchAll(DYNAMIC)) add(spec, ALL);
  return out;
}

/**
 * The exports a change adds that no other file imports. `files` is {path: text} at the change's head, `before`
 * {path: Set of the names it exported on the base} for each file the change adds or edits, an empty Set for a new
 * file. -> [{file, line, name}]
 */
export function unusedExports(files, before) {
  const used = {};
  const byName = new Set();
  for (const [file, text] of Object.entries(files)) {
    for (const [path, names] of Object.entries(importsOf(file, text))) if (path !== file) use(used, path, names);
    for (const [, name] of text.matchAll(BY_NAME)) byName.add(name);
  }
  for (const file of Object.keys(files)) if (byName.has(posix.basename(file))) use(used, file, ALL);
  return Object.entries(before).filter(([f]) => CHECKED.test(f) && f in files && used[f] !== ALL).flatMap(([file, old]) =>
    exportsOf(files[file]).filter(e => !old.has(e.name) && !(used[file] && used[file].has(e.name))).map(e => ({ file, ...e })));
}

function main() {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  if (!base) { console.error('usage: node .github/exports.mjs <base ref> [<head ref>]'); process.exit(2); }
  // Importers are every code file under these roots, tests included.
  const files = codeAt(head, ['skills', 'scripts', '.github'], CODE);
  // Each file the change adds, edits or moves, against what it exported where the change forked from the base (a
  // moved file: under its old path).
  const before = {};
  const fork = git(['merge-base', base, head]).toString('utf8').trim();
  const changes = git(['diff', '--name-status', '-z', '--diff-filter=AMR', fork, head, '--', 'skills']).toString('utf8').split('\0');
  for (let i = 0; i < changes.length - 1;) {
    const status = changes[i++];
    const from = changes[i++], to = status.startsWith('R') ? changes[i++] : from;
    if (!CHECKED.test(to)) continue;
    const old = status === 'A' ? '' : git(['show', `${fork}:${from}`]).toString('utf8');
    before[to] = new Set(exportsOf(old).map(e => e.name));
  }
  const found = unusedExports(files, before);
  for (const e of found) console.log(`${e.file}:${e.line} exports \`${e.name}\`, which no other file imports`);
  if (found.length) {
    console.log(`\n${found.length} unused export(s): drop \`export\`, so the module's interface is only what its callers and tests use.`);
    process.exit(1);
  }
  console.log('no unused export added under skills/*/scripts/');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
