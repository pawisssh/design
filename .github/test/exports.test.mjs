// Tests of the unused-export check: run with `node --test .github/test/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportsOf, importsOf, unusedExports } from '../exports.mjs';

const SCRIPT = new URL('../exports.mjs', import.meta.url).pathname;
const lines = (...ls) => ls.join('\n') + '\n';

test('a file\'s exports: declarations and export lists, one across lines, each at its line; a default export is left out', () => {
  const text = lines(
    'export function a() {}', 'export async function b() {}', 'export const c = 1;', 'export class D {}',
    'export { e, f as g } from \'./x.mjs\';', 'export default h;', '  export const indented = 1;', 'export {', '  i,', '  j as k,', '};',
  );
  assert.deepEqual(exportsOf(text), [
    { name: 'a', line: 1 }, { name: 'b', line: 2 }, { name: 'c', line: 3 }, { name: 'D', line: 4 },
    { name: 'e', line: 5 }, { name: 'g', line: 5 }, { name: 'i', line: 8 }, { name: 'k', line: 8 },
  ]);
});

test('a file\'s imports from the repo: named across lines, renamed, re-exported, namespace and dynamic', () => {
  const text = lines(
    'import { a,', '  b as c } from \'./x.mjs\';', 'import d, { e } from \'../one/y.mjs\';', 'import * as z from \'./z.mjs\';',
    'export { f } from \'./x.mjs\';', 'const m = await import(\'./m.mjs\');', 'import { g } from \'node:fs\';',
  );
  assert.deepEqual(importsOf('skills/two/scripts/w.mjs', text), {
    'skills/two/scripts/x.mjs': new Set(['a', 'b', 'f']),
    'skills/two/one/y.mjs': new Set(['e']),
    'skills/two/scripts/z.mjs': '*',
    'skills/two/scripts/m.mjs': '*',
  });
});

test('an export the base lacked and no other file imports is reported; one a test imports, or one the base had, is not', () => {
  const files = {
    'skills/s/scripts/m.mjs': lines('export function used() {}', 'export function helper() {}', 'export { old, older } from \'./o.mjs\';'),
    'skills/s/test/m.test.mjs': 'import { used } from \'../scripts/m.mjs\';\n',
  };
  assert.deepEqual(unusedExports(files, { 'skills/s/scripts/m.mjs': new Set(['old', 'older']) }), [{ file: 'skills/s/scripts/m.mjs', line: 2, name: 'helper' }]);
});

test('a module imported whole, loaded by its file name, imported only by itself, or outside skills/*/scripts/, follows that', () => {
  const files = {
    'skills/s/scripts/m.mjs': 'export function a() {}\n',
    'skills/s/scripts/n.mjs': lines('import { b } from \'./n.mjs\';', 'export function b() {}'),
    'skills/s/scripts/o.mjs': 'import * as m from \'./m.mjs\';\n',
    'skills/a/scripts/adapter.mjs': 'export function c() {}\n',
    'skills/s/scripts/load.mjs': 'const at = join(root, \'scripts\', \'adapter.mjs\');\n',
    'skills/s/test/t.mjs': 'export function d() {}\n',
  };
  const before = Object.fromEntries(Object.keys(files).map(f => [f, new Set()]));
  assert.deepEqual(unusedExports(files, before), [{ file: 'skills/s/scripts/n.mjs', line: 2, name: 'b' }]);
});

test('the CLI fails naming each unused export a branch adds, and passes once something imports it', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'exports-')));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const commit = msg => { git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg); };
  const run = base => spawnSync(process.execPath, [SCRIPT, base], { cwd: root, encoding: 'utf8' });
  mkdirSync(join(root, 'skills/s/scripts'), { recursive: true });
  writeFileSync(join(root, 'skills/s/scripts/m.mjs'), 'export function old() {}\n');
  git('init', '-q', '-b', 'main');
  commit('base');
  // the line holding `old` changes too, and `old` stays unreported
  writeFileSync(join(root, 'skills/s/scripts/m.mjs'), lines('export function old(x) {}', 'export function helper() {}'));
  commit('export');
  const failed = run('main~1');
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /^skills\/s\/scripts\/m\.mjs:2 exports `helper`, which no other file imports$/m);
  assert.doesNotMatch(failed.stdout, /`old`/);
  writeFileSync(join(root, 'skills/s/scripts/n.mjs'), 'import { helper } from \'./m.mjs\';\n');
  commit('import');
  const passed = run('main~2');
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
});
