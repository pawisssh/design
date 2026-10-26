// Tests of the unused-export check: run with `node --test .github/test/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportsOf, importsOf, unusedExports } from '../exports.mjs';

const SCRIPT = new URL('../exports.mjs', import.meta.url).pathname;
const all = text => new Set(text.split('\n').map((_, i) => i + 1));

test('a file\'s exports: declarations and export lists, each at its line; a default export is left out', () => {
  const text = [
    'export function a() {}', 'export async function b() {}', 'export const c = 1;', 'export class D {}',
    'export { e, f as g } from \'./x.mjs\';', 'export default h;', '  export const indented = 1;', 'const i = 1;',
  ].join('\n');
  assert.deepEqual(exportsOf(text), [
    { name: 'a', line: 1 }, { name: 'b', line: 2 }, { name: 'c', line: 3 }, { name: 'D', line: 4 },
    { name: 'e', line: 5 }, { name: 'g', line: 5 },
  ]);
});

test('a file\'s imports from the repo: named across lines, renamed, re-exported, namespace and dynamic', () => {
  const text = [
    'import { a,', '  b as c } from \'./x.mjs\';', 'import d, { e } from \'../one/y.mjs\';', 'import * as z from \'./z.mjs\';',
    'export { f } from \'./x.mjs\';', 'const m = await import(\'./m.mjs\');', 'import { g } from \'node:fs\';',
  ].join('\n');
  assert.deepEqual(importsOf('skills/two/scripts/w.mjs', text), {
    'skills/two/scripts/x.mjs': new Set(['a', 'b', 'f']),
    'skills/two/one/y.mjs': new Set(['e']),
    'skills/two/scripts/z.mjs': '*',
    'skills/two/scripts/m.mjs': '*',
  });
});

test('an added export no other file imports is reported; one a test imports, or an export already there, is not', () => {
  const files = {
    'skills/s/scripts/m.mjs': 'export function used() {}\nexport function helper() {}\nexport const old = 1;\n',
    'skills/s/test/m.test.mjs': 'import { used } from \'../scripts/m.mjs\';\n',
  };
  assert.deepEqual(unusedExports(files, { 'skills/s/scripts/m.mjs': new Set([1, 2]) }), [{ file: 'skills/s/scripts/m.mjs', line: 2, name: 'helper' }]);
});

test('a module imported whole, or only by itself, or outside skills/*/scripts/, follows that', () => {
  const files = {
    'skills/s/scripts/m.mjs': 'export function a() {}\n',
    'skills/s/scripts/n.mjs': 'import { b } from \'./n.mjs\';\nexport function b() {}\n',
    'skills/s/scripts/o.mjs': 'import * as m from \'./m.mjs\';\n',
    'skills/s/test/t.mjs': 'export function c() {}\n',
  };
  const added = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, all(t)]));
  assert.deepEqual(unusedExports(files, added), [{ file: 'skills/s/scripts/n.mjs', line: 2, name: 'b' }]);
});

test('the CLI fails naming each unused export a branch adds, and passes once something imports it', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'exports-')));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const commit = msg => { git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg); };
  const run = () => spawnSync(process.execPath, [SCRIPT, 'main~1'], { cwd: root, encoding: 'utf8' });
  mkdirSync(join(root, 'skills/s/scripts'), { recursive: true });
  writeFileSync(join(root, 'skills/s/scripts/m.mjs'), 'export function old() {}\n');
  git('init', '-q', '-b', 'main');
  commit('base');
  writeFileSync(join(root, 'skills/s/scripts/m.mjs'), 'export function old() {}\nexport function helper() {}\n');
  commit('export');
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /^skills\/s\/scripts\/m\.mjs:2 exports `helper`, which no other file imports$/m);
  assert.doesNotMatch(failed.stdout, /`old`/);
  writeFileSync(join(root, 'skills/s/scripts/n.mjs'), 'import { helper } from \'./m.mjs\';\n');
  commit('import');
  const passed = spawnSync(process.execPath, [SCRIPT, 'main~2'], { cwd: root, encoding: 'utf8' });
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
});
