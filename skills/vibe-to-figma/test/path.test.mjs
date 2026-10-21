// Vibe-to-Figma chooses its path before it reads anything (#252): shadcn, path A, or a plain refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFolder } from '../scripts/folder.mjs';
import { choosePath } from '../scripts/path.mjs';

const V0 = fileURLToPath(new URL('../../to-handoff/test/fixtures/v0-app', import.meta.url));
const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [FOLDER, ...args], { encoding: 'utf8' });

test('a project with components.json takes the shadcn path', () => {
  assert.deepEqual(choosePath(V0), { path: 'shadcn' });
});

test('a React project with no components.json and Tailwind utilities in className is path A', () => {
  assert.deepEqual(choosePath(fixture('tailwind-no-shadcn')), { path: 'A' });
});

test('plain HTML is refused, naming what was found and what the skill needs', () => {
  const r = choosePath(fixture('html-app'));
  assert.equal(r.path, 'refused');
  assert.match(r.message, /plain HTML/);
  assert.match(r.message, /components\.json/);
  assert.match(r.message, /Tailwind/);
});

test('a Carbon + SCSS app is refused and pointed to the Carbon Adapter', () => {
  const r = choosePath(fixture('carbon-scss-app'));
  assert.equal(r.path, 'refused');
  assert.match(r.message, /Carbon/);
  assert.match(r.message, /Carbon Adapter/);
});

test('a React project styled by CSS classes only, or with no Tailwind in its JSX, is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-to-figma-path-'));
  try {
    cpSync(fixture('tailwind-no-shadcn'), dir, { recursive: true });
    writeFileSync(join(dir, 'src/App.tsx'), 'export default () => <div className="phc-card"><button className="phc-btn">Add</button></div>;\n');
    const plain = choosePath(dir);
    assert.equal(plain.path, 'refused');
    assert.match(plain.message, /no Tailwind utilities in className/);
    writeFileSync(join(dir, 'src/app.scss'), '.phc-card { padding: 1rem; }\n');
    const scss = choosePath(dir);
    assert.equal(scss.path, 'refused');
    assert.match(scss.message, /SCSS or CSS classes/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a project that is not a directory is refused plainly', () => {
  const r = choosePath(join(tmpdir(), 'vibe-to-figma-no-such-project'));
  assert.equal(r.path, 'refused');
  assert.match(r.message, /no such directory/);
});

test('buildFolder refuses before reading anything, and says path A is not built yet', async () => {
  await assert.rejects(buildFolder({ project: fixture('html-app'), root: tmpdir() }), /plain HTML/);
  await assert.rejects(buildFolder({ project: fixture('tailwind-no-shadcn'), root: tmpdir() }), /path A.*not built yet/);
});

test('the CLI exits 1 with one plain message, no stack trace and no ENOENT, with or without --all', () => {
  for (const [name, found] of [['html-app', /plain HTML/], ['carbon-scss-app', /Carbon/], ['tailwind-no-shadcn', /path A.*not built yet/]]) {
    for (const extra of [[], ['--all']]) {
      const r = cli(fixture(name), ...extra);
      assert.equal(r.status, 1, `${name} ${extra}`);
      assert.match(r.stderr, found);
      assert.doesNotMatch(r.stderr + r.stdout, /ENOENT|\n\s+at /);
      assert.equal(r.stderr.trim().split('\n').length, 1);
    }
  }
});
