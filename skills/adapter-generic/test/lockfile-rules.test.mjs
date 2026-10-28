// The Adapter's lockfile rules applied to a Prototype's own folder (#432, spec #343): no components.json, no fetched
// tool. Every failing rule is reported by name and message, so From-Prototype's gate rows can call them (#434).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, TOOLS, cssEntry, lockfileRules } from '../scripts/sources.mjs';

// Vibe-to-Figma's path A Prototype: React + Tailwind 4.2.2, no components.json, no shadcn.
const PATH_A = join(REPO_ROOT, 'skills/vibe-to-figma/test/fixtures/path-a-app');
const CSS = 'src/index.css';

/**
 * A copy of the path A fixture edited by `edit({css, lock})` (the lockfile's `packages` map), at <tmp>/repo/app with
 * a `.git` in repo/, so the lockfile walk stops there. -> the Prototype's folder.
 */
function variant(edit = () => {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'generic-rules-'));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  mkdirSync(join(tmp, 'repo/.git'), { recursive: true });
  const dir = join(tmp, 'repo/app');
  cpSync(PATH_A, dir, { recursive: true });
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
  const state = { css: readFileSync(join(dir, CSS), 'utf8'), lock: lock.packages };
  edit(state);
  writeFileSync(join(dir, CSS), state.css);
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ ...lock, packages: state.lock }, null, 2));
  return dir;
}

const failures = dir => lockfileRules(dir).failures.map(({ rule, message }) => ({ rule, message }));

test('a path A Prototype with no components.json passes, with the Tailwind its lockfile resolves', () => {
  const r = lockfileRules(variant());
  assert.deepEqual(r.failures, []);
  assert.equal(r.css, CSS);
  assert.deepEqual(r.lockfiles, ['package-lock.json']);
  assert.deepEqual(Object.keys(r.pins).sort(), ['tailwindcss', 'typescript']);
  assert.equal(r.pins.tailwindcss.version, '4.2.2');
});

test('the stylesheet that imports tailwindcss is found, the shallowest first', () => {
  const dir = variant();
  writeFileSync(join(dir, 'src/deeper.css'), '@import "tailwindcss";\n');
  mkdirSync(join(dir, 'node_modules/x'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/x/a.css'), '@import "tailwindcss";\n');
  assert.equal(cssEntry(dir), 'src/deeper.css', 'byte order breaks the tie at one depth; node_modules is not read');
  writeFileSync(join(dir, 'top.css'), "@import url('tailwindcss');\n");
  assert.equal(cssEntry(dir), 'top.css');
  rmSync(join(dir, 'top.css'));
  rmSync(join(dir, 'src/deeper.css'));
  writeFileSync(join(dir, CSS), '/* no Tailwind */\n');
  assert.equal(cssEntry(dir), null);
  assert.equal(lockfileRules(dir).css, null, 'with no stylesheet, no package import is checked');
  assert.deepEqual(failures(dir), []);
  assert.deepEqual(lockfileRules(dir, 'src/gone.css').failures,
    [{ rule: 'tailwind-stylesheet', message: 'no src/gone.css: the Adapter reads resolved versions from it' }]);
});

test('which lockfile: none, or only one the Adapter does not read, is reported with the lockfiles found', () => {
  const dir = variant();
  rmSync(join(dir, 'package-lock.json'));
  const none = lockfileRules(dir);
  assert.deepEqual(failures(dir), [{ rule: 'lockfile', message: 'no package-lock.json: the Adapter reads resolved versions from it' }]);
  assert.deepEqual(none.lockfiles, []);
  assert.equal(none.pins, null);
  for (const name of ['bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
    writeFileSync(join(dir, name), '');
    assert.deepEqual(lockfileRules(dir).lockfiles, [name]);
    assert.equal(failures(dir)[0].rule, 'lockfile');
    rmSync(join(dir, name));
  }
});

test('a pnpm-lock.yaml at a workspace root above is found; one above .git is not', () => {
  const dir = variant();
  rmSync(join(dir, 'package-lock.json'));
  writeFileSync(join(dir, '../pnpm-lock.yaml'), '');
  assert.deepEqual(lockfileRules(dir).lockfiles, ['../pnpm-lock.yaml']);
  rmSync(join(dir, '../pnpm-lock.yaml'));
  writeFileSync(join(dir, '../../pnpm-lock.yaml'), '');
  assert.deepEqual(lockfileRules(dir).lockfiles, [], 'the walk stops at the folder that holds .git');
});

test('a lockfile that is not JSON is reported, not thrown', () => {
  const dir = variant();
  writeFileSync(join(dir, 'package-lock.json'), '{');
  assert.equal(failures(dir)[0].rule, 'lockfile');
  assert.match(failures(dir)[0].message, /^package-lock\.json is not JSON: /);
});

test('tailwind-version: none resolved, or a 3.x, is reported with the version', () => {
  const none = variant(s => { delete s.lock['node_modules/tailwindcss']; });
  assert.deepEqual(failures(none), [{ rule: 'tailwind-version', message: 'package-lock.json resolves no tailwindcss' }]);
  const v3 = variant(s => { s.lock['node_modules/tailwindcss'].version = '3.4.17'; });
  const r = lockfileRules(v3);
  assert.deepEqual(failures(v3), [{ rule: 'tailwind-version', message: 'the project resolves tailwindcss@3.4.17, but the Adapter compiles Tailwind 4 only' }]);
  assert.equal(r.failures[0].version, '3.4.17');
});

test('tailwind-integrity: no sha512 is reported for any version; a disagreement with the pin for a 4.x', () => {
  const sha1 = variant(s => { s.lock['node_modules/tailwindcss'].integrity = 'sha1-abc='; });
  assert.deepEqual(failures(sha1), [{ rule: 'tailwind-integrity',
    message: 'package-lock.json gives tailwindcss@4.2.2 no sha512 integrity (sha1-abc=), the only one the tools step checks' }]);
  const { version, integrity: pin } = TOOLS.tailwindcss;
  const pinned = variant(s => { s.lock['node_modules/tailwindcss'].version = version; });
  const { integrity } = JSON.parse(readFileSync(join(pinned, 'package-lock.json'), 'utf8')).packages['node_modules/tailwindcss'];
  assert.deepEqual(failures(pinned), [{ rule: 'tailwind-integrity',
    message: `tailwindcss@${version}: the lockfile's integrity ${integrity} does not match the Adapter's pin ${pin}` }]);
});

test('code-library-pins: a shadcn or tw-animate-css the CSS imports at another version is reported, naming both', () => {
  const dir = variant(s => {
    s.css = s.css.replace('@import "tailwindcss";', '@import "tailwindcss";\n@import "./more.css";');
    s.lock['node_modules/tw-animate-css'] = { version: '1.3.0' };
  });
  writeFileSync(join(dir, 'src/more.css'), '@import "shadcn/tailwind.css";\n@import "tw-animate-css";\n');
  assert.deepEqual(lockfileRules(dir).failures, [
    { rule: 'code-library-pins', message: `the project resolves shadcn@undefined, but the Adapter pins shadcn@${TOOLS.shadcn.version}`,
      name: 'shadcn', version: undefined, pinned: TOOLS.shadcn.version },
    { rule: 'code-library-pins', message: `the project resolves tw-animate-css@1.3.0, but the Adapter pins tw-animate-css@${TOOLS['tw-animate-css'].version}`,
      name: 'tw-animate-css', version: '1.3.0', pinned: TOOLS['tw-animate-css'].version },
  ]);
});

test('every failing rule is reported, not only the first, in the order projectPins refuses them', () => {
  const dir = variant(s => {
    s.css = `@import "shadcn/tailwind.css";\n${s.css}`;
    Object.assign(s.lock['node_modules/tailwindcss'], { version: '3.4.17', integrity: 'sha1-abc=' });
  });
  assert.deepEqual(failures(dir).map(f => f.rule), ['tailwind-version', 'tailwind-integrity', 'code-library-pins']);
  assert.equal(lockfileRules(dir).pins, null);
});

test('the rules read only: the Prototype\'s folder listing and files are unchanged', () => {
  const dir = variant(s => { s.lock['node_modules/tailwindcss'].version = '3.4.17'; });
  const listing = () => readdirSync(dir, { recursive: true }).sort().map(f => [f, statSync(join(dir, f)).mtimeMs]);
  const before = listing();
  lockfileRules(dir);
  assert.deepEqual(listing(), before);
});
