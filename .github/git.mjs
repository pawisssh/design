// Git reads the CI checks share: a tree's code files, and the lines a diff adds.
import { execFileSync } from 'node:child_process';

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

/** The code files under `roots` at `head`, {path: text}: paths `code` matches, outside any fixtures/ folder, whose
 * files are inputs to tests, not code the repo runs. */
export function codeAt(head, roots, code) {
  const paths = git(['ls-tree', '-r', '-z', '--name-only', head, '--', ...roots]).toString('utf8').split('\0')
    .filter(f => code.test(f) && !f.includes('/fixtures/'));
  return blobs(head, paths);
}
