// Tests of the duplicate-code check: run with `node --test .github/test/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { duplicates } from '../duplicates.mjs';
import { addedLines } from '../git.mjs';

const SCRIPT = new URL('../duplicates.mjs', import.meta.url).pathname;
// Ten counted lines, a function and nine statements, with a blank line, a comment and a lone bracket that never count.
const BLOCK = Array.from({ length: 9 }, (_, i) => `  const v${i} = read(${i}) + ${i};`);
const block = ['function f() {', ...BLOCK.slice(0, 4), '', '  // a comment', ...BLOCK.slice(4), '}'];
const lines = (...ls) => ls.join('\n') + '\n';
const span = (from, to) => new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i));

test('a block a change adds that another file has is reported with both places', () => {
  const files = { 'a.mjs': lines('import x;', ...block), 'b.mjs': lines(...block, 'export {};') };
  const found = duplicates(files, { 'b.mjs': span(1, 12) });
  assert.deepEqual(found, [{ file: 'b.mjs', from: 1, to: 12, also: [{ file: 'a.mjs', from: 2, to: 13 }] }]);
});

test('a copy the change does not add, or an edit inside one already there, or a block under 8 counted lines, is not reported', () => {
  const files = { 'a.mjs': lines(...block), 'b.mjs': lines('const y = 1;', ...block) };
  assert.deepEqual(duplicates(files, { 'b.mjs': new Set([1]) }), []);
  // one line changed the same way in both copies leaves each window mostly lines the base had
  assert.deepEqual(duplicates(files, { 'a.mjs': new Set([4]), 'b.mjs': new Set([5]) }), []);
  const short = ['function g() {', ...BLOCK.slice(0, 6), '}'];
  assert.deepEqual(duplicates({ 'a.mjs': lines(...short), 'b.mjs': lines(...short) }, { 'b.mjs': span(1, 8) }), []);
});

test('a pair the change adds both sides of is reported once', () => {
  const files = { 'a.mjs': lines(...block), 'b.mjs': lines(...block) };
  assert.deepEqual(duplicates(files, { 'a.mjs': span(1, 12), 'b.mjs': span(1, 12) }), [{ file: 'a.mjs', from: 1, to: 12, also: [{ file: 'b.mjs', from: 1, to: 12 }] }]);
});

test('blank lines, comments and lone brackets never make two blocks the same', () => {
  const filler = Array.from({ length: 12 }, (_, i) => (i % 3 ? '' : i % 2 ? '  });' : '  // note'));
  assert.deepEqual(duplicates({ 'a.mjs': lines(...filler), 'b.mjs': lines(...filler) }, { 'b.mjs': new Set(filler.map((_, i) => i + 1)) }), []);
});

test('a copy in the same file counts once it does not overlap', () => {
  const file = lines(...block, 'const between = 1;', ...block);
  assert.deepEqual(duplicates({ 'a.mjs': file }, { 'a.mjs': span(14, 26) }).map(d => [d.from, d.to, d.also]), [[15, 26, [{ file: 'a.mjs', from: 1, to: 12 }]]]);
});

test('the lines a unified diff adds, by file and head line', () => {
  const diff = ['diff --git a/x.mjs b/x.mjs', '--- a/x.mjs', '+++ b/x.mjs', '@@ -3,0 +4,2 @@', '+a', '+b', '@@ -9 +11 @@', '-c', '+d',
    'diff --git a/gone.mjs b/gone.mjs', '--- a/gone.mjs', '+++ /dev/null', '@@ -1 +0,0 @@', '-e',
    'diff --git a/sp ace.mjs b/sp ace.mjs', '--- a/sp ace.mjs\t', '+++ b/sp ace.mjs\t', '@@ -1,0 +2 @@', '+f'].join('\n');
  assert.deepEqual(addedLines(diff), { 'x.mjs': new Set([4, 5, 11]), 'sp ace.mjs': new Set([2]) });
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
  // a file moved under a name with a space and an accent keeps its copy unreported, and a copy pasted into it is named
  git('mv', 'skills/one/scripts/b.mjs', 'skills/one/scripts/c é.mjs');
  commit('move');
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'main~1'], { cwd: root, encoding: 'utf8' }).status, 0);
  writeFileSync(join(root, 'skills/one/scripts/c é.mjs'), lines(...block, 'const between = 1;', ...block));
  commit('paste');
  const moved = spawnSync(process.execPath, [SCRIPT, 'main~1'], { cwd: root, encoding: 'utf8' });
  assert.equal(moved.status, 1);
  assert.match(moved.stdout, /^skills\/one\/scripts\/c é\.mjs:15-26 repeats /m);
});
