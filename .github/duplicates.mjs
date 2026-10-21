#!/usr/bin/env node
// Fails on a block of WINDOW or more lines a change adds under skills/ that the repo already has elsewhere, as
// CODING_STANDARDS.md's "Each shared helper lives in one place" asks. No dependencies, so no jscpd.
//
//   node .github/duplicates.mjs <base ref> [<head ref>]    e.g. origin/main; CI gives the pull request's base
//
// Lines are compared trimmed, without blank lines, comment-only lines or lines of brackets alone. Only blocks that
// hold an added line count, so duplication already on the base is not reported again.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WINDOW = 8;

// A line as compared, or null for one that never counts: blank, a comment alone, or brackets and punctuation alone.
function normalized(line) {
  const t = line.trim();
  if (!t || /^(\/\/|\/\*|\*|#)/.test(t) || /^[\s{}()[\];,]*$/.test(t)) return null;
  return t;
}

// Each file's counted lines: [{text, line}] with 1-based line numbers.
const counted = text => text.split('\n').flatMap((l, i) => { const t = normalized(l); return t === null ? [] : [{ text: t, line: i + 1 }]; });

/**
 * The duplicated blocks a change adds. `files` is {path: text} at the change's head, `added` {path: Set of added line
 * numbers}. -> [{file, from, to, also: [{file, from, to}]}], one per run of overlapping windows.
 */
export function duplicates(files, added, window = WINDOW) {
  const lines = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, counted(t)]));
  const where = new Map();
  for (const [file, ls] of Object.entries(lines))
    for (let i = 0; i + window <= ls.length; i++) {
      const key = ls.slice(i, i + window).map(l => l.text).join('\n');
      if (!where.has(key)) where.set(key, []);
      where.get(key).push({ file, i });
    }
  const found = [];
  for (const [file, set] of Object.entries(added)) {
    const ls = lines[file] || [];
    let open = null;
    for (let i = 0; i + window <= ls.length; i++) {
      const block = ls.slice(i, i + window);
      const key = block.map(l => l.text).join('\n');
      // a copy elsewhere: another file, or this one at a place that does not overlap this window
      const also = block.some(l => set.has(l.line)) ? where.get(key).filter(o => o.file !== file || Math.abs(o.i - i) >= window) : [];
      if (!also.length) { open = null; continue; }
      if (!(open && open.end === i - 1)) found.push(open = { file, from: block[0].line, end: i, also: new Map() });
      open.to = block.at(-1).line;
      open.end = i;
      // each other file's copy as the span of its matching lines
      for (const o of also) {
        const from = lines[o.file][o.i].line, to = lines[o.file][o.i + window - 1].line;
        const a = open.also.get(o.file);
        open.also.set(o.file, a ? { from: Math.min(a.from, from), to: Math.max(a.to, to) } : { from, to });
      }
    }
  }
  return found.map(({ file, from, to, also }) => ({ file, from, to, also: [...also].map(([f, a]) => ({ file: f, ...a })) }));
}

// The lines a diff adds to each file: {path: Set of line numbers at the head}.
export function addedLines(diff) {
  const added = {};
  let file = null;
  for (const l of diff.split('\n')) {
    const to = l.match(/^\+\+\+ (?:b\/(.*)|\/dev\/null)$/);
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

// Each file's text at `head`, read in one `git cat-file --batch`: per file a header `<oid> blob <size>`, its bytes and
// a newline.
function blobs(head, paths) {
  const out = execFileSync('git', ['cat-file', '--batch'], { input: paths.map(p => `${head}:${p}`).join('\n') + '\n', maxBuffer: 1 << 28 });
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
  const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const tracked = git(['ls-tree', '-r', '--name-only', head, '--', 'skills']).split('\n').filter(f => f.endsWith('.mjs') && !f.includes('/fixtures/'));
  const files = blobs(head, tracked);
  const added = addedLines(git(['diff', '-U0', '--no-color', '--diff-filter=AM', `${base}...${head}`, '--', 'skills/*.mjs']));
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
