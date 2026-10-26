// Vibe-to-Figma chooses its path before it reads anything (#252): shadcn, path A, or a plain refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFolder } from '../scripts/folder.mjs';
import { choosePath } from '../scripts/path.mjs';
import { hasTypescript } from '../../to-handoff/scripts/deps.mjs';
import { V0 } from './helpers.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [FOLDER, ...args], { encoding: 'utf8' });
// Path A reads the Prototype's JSX with To-handoff's React reader before it can say it found nothing (#425).
const noReader = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';

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

test('what counts as Tailwind: opacity, fractions, semantic colours, ${} templates and class strings held in constants', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-to-figma-path-'));
  const app = (source, tailwind = true) => { mkdirSync(join(dir, 'src'), { recursive: true }); writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '19.2.4' }, devDependencies: tailwind ? { tailwindcss: '4.2.2' } : {} })); writeFileSync(join(dir, 'src/App.tsx'), source); return choosePath(dir).path; };
  try {
    assert.equal(app('export default () => <i className="w-1/2 h-10 bg-primary text-foreground hover:bg-primary/90" />;'), 'A');
    assert.equal(app('export default () => <i className={`p-4 ${on ? "m-2" : ""} w-4 gap-2`} />;'), 'A');
    assert.equal(app('const base = cva("p-4 m-2 w-4 flex"); export default () => <i className={base()} />;'), 'A');
    assert.equal(app('export default () => <i className="container p-3 mb-2 text-center" />;', false), 'refused'); // Bootstrap
    assert.equal(app('export default () => <i className="card rounded border truncate underline italic" />;'), 'refused');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a broken symlink, a missing or invalid package.json are refused plainly, not with a stack trace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-to-figma-path-'));
  try {
    symlinkSync(join(dir, 'gone'), join(dir, 'dangling'));
    assert.match(choosePath(dir).message, /no package\.json and no components\.json/);
    writeFileSync(join(dir, 'package.json'), '{ not json');
    assert.match(choosePath(dir).message, /package\.json that is not valid JSON/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a project that is not a directory is refused plainly', () => {
  const r = choosePath(join(tmpdir(), 'vibe-to-figma-no-such-project'));
  assert.equal(r.path, 'refused');
  assert.match(r.message, /no such directory/);
});

// The CLI exits 1 with one plain message, no stack trace and no ENOENT, with or without --all.
function refusesPlainly(name, found) {
  for (const extra of [[], ['--all']]) {
    const r = cli(fixture(name), ...extra);
    assert.equal(r.status, 1, `${name} ${extra}`);
    assert.match(r.stderr, found);
    assert.doesNotMatch(r.stderr + r.stdout, /ENOENT|\n\s+at /);
    assert.equal(r.stderr.trim().split('\n').length, 1);
  }
}

test('buildFolder refuses before reading anything', async () => {
  await assert.rejects(buildFolder({ project: fixture('html-app'), root: tmpdir() }), /plain HTML/);
});

test('the CLI exits 1 with one plain message, no stack trace and no ENOENT, with or without --all', () => {
  refusesPlainly('html-app', /plain HTML/);
  refusesPlainly('carbon-scss-app', /Carbon/);
});

test('path A with nothing to extract says so, from buildFolder and the CLI', { skip: noReader }, async () => {
  await assert.rejects(buildFolder({ project: fixture('tailwind-no-shadcn'), root: tmpdir() }), /path A found no Component Family/);
  refusesPlainly('tailwind-no-shadcn', /path A found no Component Family/);
});
