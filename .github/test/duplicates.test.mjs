// Tests of the duplicate-code check: run with `node --test .github/test/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addedLines, duplicates } from '../duplicates.mjs';

const SCRIPT = new URL('../duplicates.mjs', import.meta.url).pathname;
// Ten counted lines, a function and nine statements, with a blank line, a comment and a lone bracket that never count.
const BLOCK = Array.from({ length: 9 }, (_, i) => `  const v${i} = read(${i}) + ${i};`);
const block = ['function f() {', ...BLOCK.slice(0, 4), '', '  // a comment', ...BLOCK.slice(4), '}'];
const lines = (...ls) => ls.join('\n') + '\n';

test('a block a change adds that another file has is reported with both places', () => {
  const files = { 'a.mjs': lines('import x;', ...block), 'b.mjs': lines(...block, 'export {};') };
  const found = duplicates(files, { 'b.mjs': new Set([3]) });
  assert.deepEqual(found, [{ file: 'b.mjs', from: 1, to: 12, also: [{ file: 'a.mjs', from: 2, to: 13 }] }]);
});

test('a copy whose lines the change does not touch, or a block under 8 counted lines, is not reported', () => {
  const files = { 'a.mjs': lines(...block), 'b.mjs': lines('const y = 1;', ...block) };
  assert.deepEqual(duplicates(files, { 'b.mjs': new Set([1]) }), []);
  const short = ['function g() {', ...BLOCK.slice(0, 6), '}'];
  assert.deepEqual(duplicates({ 'a.mjs': lines(...short), 'b.mjs': lines(...short) }, { 'b.mjs': new Set([2, 3, 4]) }), []);
});

test('blank lines, comments and lone brackets never make two blocks the same', () => {
  const filler = Array.from({ length: 12 }, (_, i) => (i % 3 ? '' : i % 2 ? '  });' : '  // note'));
  assert.deepEqual(duplicates({ 'a.mjs': lines(...filler), 'b.mjs': lines(...filler) }, { 'b.mjs': new Set(filler.map((_, i) => i + 1)) }), []);
});

test('a copy in the same file counts once it does not overlap', () => {
  const file = lines(...block, 'const between = 1;', ...block);
  assert.deepEqual(duplicates({ 'a.mjs': file }, { 'a.mjs': new Set([17]) }).map(d => [d.from, d.to, d.also]), [[15, 26, [{ file: 'a.mjs', from: 1, to: 12 }]]]);
});

test('the lines a unified diff adds, by file and head line', () => {
  const diff = ['diff --git a/x.mjs b/x.mjs', '--- a/x.mjs', '+++ b/x.mjs', '@@ -3,0 +4,2 @@', '+a', '+b', '@@ -9 +11 @@', '-c', '+d',
    'diff --git a/gone.mjs b/gone.mjs', '--- a/gone.mjs', '+++ /dev/null', '@@ -1 +0,0 @@', '-e'].join('\n');
  assert.deepEqual(addedLines(diff), { 'x.mjs': new Set([4, 5, 11]) });
});

test('the CLI fails naming each block a branch adds, and passes on one that adds none', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dup-')));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const commit = msg => git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-am', msg);
  mkdirSync(join(root, 'skills/one/scripts'), { recursive: true });
  mkdirSync(join(root, 'skills/two/fixtures'), { recursive: true });
  writeFileSync(join(root, 'skills/one/scripts/a.mjs'), lines(...block));
  git('init', '-q', '-b', 'main');
  git('add', '.');
  commit('base');
  // a copy under fixtures/ is not code the repo runs
  writeFileSync(join(root, 'skills/two/fixtures/c.mjs'), lines(...block));
  git('add', '.');
  commit('fixture');
  const clean = spawnSync(process.execPath, [SCRIPT, 'main~1'], { cwd: root, encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  writeFileSync(join(root, 'skills/one/scripts/b.mjs'), lines(...block));
  git('add', '.');
  commit('copy');
  const run = spawnSync(process.execPath, [SCRIPT, 'main~1'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^skills\/one\/scripts\/b\.mjs:1-12 repeats skills\/one\/scripts\/a\.mjs:1-12$/m);
  assert.match(run.stdout, /1 duplicated block\(s\) of 8\+ lines/);
});
