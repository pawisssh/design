#!/usr/bin/env node
// Fails on a block of WINDOW or more lines a change adds under skills/ that the repo already has elsewhere, as
// CODING_STANDARDS.md's "Each shared helper lives in one place" asks. No dependencies, so no jscpd.
//
//   node .github/duplicates.mjs <base ref> [<head ref>]    e.g. origin/main; CI gives the pull request's base
//
// A block counts when most of its lines are ones the change adds, so an edit inside a copy already on the base, or a
// line changed in both copies, is not a new copy.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WINDOW = 8;
// The code files under skills/ the check reads; fixtures are inputs to tests, not code the repo runs.
const CODE = /\.(m?js|py)$/;

// A line as compared, or null for one that never counts: blank, a comment alone, or brackets and punctuation alone.
function normalized(line) {
  const text = line.trim();
  if (!text || /^(\/\/|\/\*|\*|#)/.test(text) || /^[\s{}()[\];,]*$/.test(text)) return null;
  return text;
}

// A file's counted lines: [{text, line}] with 1-based line numbers.
const countedLines = text => text.split('\n').flatMap((l, i) => { const t = normalized(l); return t === null ? [] : [{ text: t, line: i + 1 }]; });
const keyOf = (lines, i, window) => lines.slice(i, i + window).map(l => l.text).join('\n');

/**
 * The duplicated blocks a change adds. `files` is {path: text} at the change's head, `added` {path: Set of added line
 * numbers}. -> [{file, from, to, also: [{file, from, to}]}], one per run of overlapping windows; a pair the change adds
 * both sides of is reported once.
 */
export function duplicates(files, added, window = WINDOW) {
  const lines = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, countedLines(t)]));
  const copiesOf = new Map();
  for (const [file, ls] of Object.entries(lines))
    for (let i = 0; i + window <= ls.length; i++) {
      const key = keyOf(ls, i, window);
      if (!copiesOf.has(key)) copiesOf.set(key, []);
      copiesOf.get(key).push({ file, i });
    }
  const found = [];
  for (const [file, set] of Object.entries(added)) {
    const ls = lines[file] || [];
    let run = null;
    for (let i = 0; i + window <= ls.length; i++) {
      const block = ls.slice(i, i + window);
      const isNew = block.filter(l => set.has(l.line)).length * 2 > window;
      // a copy elsewhere: another file, or this one at a place that does not overlap this window
      const copies = isNew ? copiesOf.get(keyOf(ls, i, window)).filter(o => o.file !== file || Math.abs(o.i - i) >= window) : [];
      if (!copies.length) { run = null; continue; }
      if (!(run && run.end === i - 1)) found.push(run = { file, from: block[0].line, end: i, also: new Map() });
      run.to = block.at(-1).line;
      run.end = i;
      // each other file's copy as the span of its matching lines
      for (const o of copies) {
        const from = lines[o.file][o.i].line, to = lines[o.file][o.i + window - 1].line;
        const span = run.also.get(o.file);
        run.also.set(o.file, span ? { from: Math.min(span.from, from), to: Math.max(span.to, to) } : { from, to });
      }
    }
  }
  const blocks = found.map(({ file, from, to, also }) => ({ file, from, to, also: [...also].map(([f, span]) => ({ file: f, ...span })) }));
  return blocks.filter((d, n) => !blocks.slice(0, n).some(k => k.also.some(a => a.file === d.file && a.from <= d.to && d.from <= a.to)));
}

// The lines a diff adds to each file: {path: Set of line numbers at the head}. Git ends a path holding a space with a
// tab on the +++ line.
export function addedLines(diff) {
  const added = {};
  let file = null;
  for (const l of diff.split('\n')) {
    const to = l.match(/^\+\+\+ (?:b\/(.*?)\t?|\/dev\/null)$/);
    if (to) { file = to[1] || null; continue; }
    const hunk = l.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (hunk && file) {
      const start = +hunk[1];
      const n = hunk[2] === undefined ? 1 : +hunk[2];
      for (let k = start; k < start + n; k++) (added[file] ??= new Set()).add(k);
    }
  }
  return added;
}

// core.quotePath=false keeps a path with non-ASCII characters as it is, unquoted, in ls-tree and diff.
export const git = (args, input) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { input, maxBuffer: 1 << 28 });

// Each file's text at `head`, read in one `git cat-file --batch`: per file a header `<oid> blob <size>`, its bytes and
// a newline.
export function blobs(head, paths) {
  const out = git(['cat-file', '--batch'], paths.map(p => `${head}:${p}`).join('\n') + '\n');
  const files = {};
  let at = 0;
  for (const p of paths) {
    const eol = out.indexOf(10, at);
    const size = +out.subarray(at, eol).toString().split(' ')[2];
    files[p] = out.subarray(eol + 1, eol + 1 + size).toString('utf8');
    at = eol + 1 + size + 1;
  }
  return files;
}

function main() {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  if (!base) { console.error('usage: node .github/duplicates.mjs <base ref> [<head ref>]'); process.exit(2); }
  const code = f => CODE.test(f) && !f.includes('/fixtures/');
  const tracked = git(['ls-tree', '-r', '-z', '--name-only', head, '--', 'skills']).toString('utf8').split('\0').filter(code);
  const files = blobs(head, tracked);
  // R: a file moved and edited gives the lines its edit adds, under its new path.
  const diff = git(['diff', '-U0', '--no-color', '--diff-filter=AMR', `${base}...${head}`, '--', 'skills']).toString('utf8');
  const added = Object.fromEntries(Object.entries(addedLines(diff)).filter(([f]) => code(f)));
  const found = duplicates(files, added);
  for (const d of found)
    console.log(`${d.file}:${d.from}-${d.to} repeats ${d.also.map(a => `${a.file}:${a.from}-${a.to}`).join(', ')}`);
  if (found.length) {
    console.log(`\n${found.length} duplicated block(s) of ${WINDOW}+ lines: import the one copy, or move it where both files can import it (CODING_STANDARDS.md, "Shared helpers").`);
    process.exit(1);
  }
  console.log(`no duplicated block of ${WINDOW}+ lines added under skills/`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
