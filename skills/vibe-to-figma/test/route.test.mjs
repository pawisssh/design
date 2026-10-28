// Vibe-to-Figma run alone routes by From-Prototype's check, its Component Sets half (#439, spec #343 Vibe-to-Figma
// changes): the shadcn path, path A, or the check's own refusal, before it fetches a tool or reads a component.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFolder, routeOf } from '../scripts/folder.mjs';
import { V0, skip } from './helpers.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));
const CHECK = fileURLToPath(new URL('../../from-prototype/scripts/from-prototype.mjs', import.meta.url));
const FIGMA = 'https://www.figma.com/design/abcdefghijklmnopqrstuv/x';
// A refused run must stop at the check, so a fetch past it would show as a timeout, not as a 6-minute wait.
const cli = (...args) => spawnSync(process.execPath, [FOLDER, ...args], { encoding: 'utf8', timeout: 60_000 });
// The check's own message for Component Sets, as From-Prototype prints it when they are asked.
const checked = project => spawnSync(process.execPath, [CHECK, 'check', project, '--figma', FIGMA], { encoding: 'utf8' }).stdout.trim();

const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const tmp = () => { const dir = mkdtempSync(join(tmpdir(), 'vibe-to-figma-route-')); made.push(dir); return dir; };
const copy = (from, change) => { const dir = tmp(); cpSync(from, dir, { recursive: true }); change(dir); return dir; };

test('the v0 fixture takes the shadcn path, and the path A fixture path A', () => {
  assert.deepEqual(routeOf(V0), { path: 'shadcn' });
  assert.deepEqual(routeOf(fixture('path-a-app')), { path: 'A' });
});

test("a v0 copy with only a yarn.lock is refused before any fetch, with the check's message", () => {
  const project = copy(V0, dir => { rmSync(join(dir, 'package-lock.json')); writeFileSync(join(dir, 'yarn.lock'), ''); });
  const tools = tmp(), root = tmp();
  const r = cli(project, '--tools', tools, '--root', root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stderr, /Component Sets: no\. Not supported: no tool writes yarn by default/);
  assert.equal(r.stderr.trim(), `FAIL: ${checked(project)}`);
  assert.deepEqual(readdirSync(tools), [], 'the empty tools folder stays empty');
  assert.deepEqual(readdirSync(root), []);
});

test('buildFolder refuses with the same message before it reads anything', async () => {
  const project = fixture('html-app');
  await assert.rejects(buildFolder({ project, root: tmp(), tools: tmp() }), e => e.message === checked(project));
});

// The CLI exits 1 with the check's message, no stack trace and no ENOENT, with or without --all.
function refusesPlainly(project, found) {
  for (const extra of [[], ['--all']]) {
    const tools = tmp();
    const r = cli(project, '--tools', tools, '--root', tmp(), ...extra);
    assert.equal(r.status, 1, `${project} ${extra}`);
    assert.match(r.stderr, found);
    assert.equal(r.stderr.trim(), `FAIL: ${checked(project)}`);
    assert.doesNotMatch(r.stderr + r.stdout, /ENOENT|\n\s+at /);
    assert.deepEqual(readdirSync(tools), []);
  }
}

test("plain HTML, a Carbon + SCSS app, a CSS-classes React app and a missing folder are refused by the check's rows", () => {
  refusesPlainly(fixture('html-app'), /plain HTML \+ CSS classes .*\n- Component Sets: no\. Not yet: there is no reader for plain HTML \+ CSS classes \(spec #339\)/);
  refusesPlainly(fixture('carbon-scss-app'), /React \+ CSS or SCSS classes .*@carbon\/react.*\n- Component Sets: no\. Not yet: Component Sets for this kind are charted in map #310/);
  const classes = copy(fixture('path-a-app'), dir => writeFileSync(join(dir, 'src/App.tsx'), 'export default () => <div className="phc-card"><button className="phc-btn">Add</button></div>;\n'));
  refusesPlainly(classes, /React \+ CSS or SCSS classes/);
  refusesPlainly(join(tmpdir(), 'vibe-to-figma-no-such-project'), /unknown \(no such file or folder\)/);
});

test('a run with no Figma link reaches the folder step', { skip }, () => {
  const root = tmp(), requests = join(tmp(), 'requests.json');
  const r = cli(V0, '--root', root, '--requests', requests);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  assert.ok(existsSync(join(root, 'v0-app', 'v0-app.foundations.json')));
  assert.ok(Object.keys(JSON.parse(readFileSync(requests, 'utf8')).requests).includes('button'));
});

test('path A with nothing to extract says so, from buildFolder and the CLI', { skip }, async () => {
  // The path A fixture's lockfile and stylesheet, with one screen whose elements never repeat.
  const project = copy(fixture('path-a-app'), dir => cpSync(fixture('tailwind-no-shadcn/src/App.tsx'), join(dir, 'src/App.tsx')));
  assert.deepEqual(routeOf(project), { path: 'A' });
  await assert.rejects(buildFolder({ project, root: tmp() }), /path A found no Component Family/);
  const r = cli(project, '--root', tmp(), '--requests', join(tmp(), 'requests.json'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /path A found no Component Family/);
  assert.equal(r.stderr.trim().split('\n').length, 1);
});
