// Path A's folder step (#257, spec #249, ADR 0016): a React + Tailwind Prototype with no components.json gets an
// Extracted Library, a Family map, the Foundations document and a draft Contract per family, with the Contracts read
// from the library and never from the Prototype. The fixture's committed answers stand in for the agent's one batch
// of judgement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../contract/scripts/contract.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { read, scratch, skip } from './helpers.mjs';

const PROTOTYPE = fileURLToPath(new URL('./fixtures/path-a-app', import.meta.url));
const ANSWERS = fileURLToPath(new URL('./fixtures/path-a-app.answers.json', import.meta.url));
const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));
const FAMILIES = ['action-button', 'card', 'icon-button', 'pill-button', 'segment'];
const cli = (...args) => spawnSync(process.execPath, [FOLDER, PROTOTYPE, ...args], { encoding: 'utf8' });
const answers = () => read(ANSWERS);
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/** Every file under `dir` as text, keyed by its path relative to it. */
function tree(dir) {
  const out = {};
  (function walk(d) {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(dir, path)] = readFileSync(path, 'utf8');
    }
  })(dir);
  return out;
}

test('the first run writes one requests file and exits 2; nothing else is written', { skip }, () => {
  const root = scratch(), requests = join(root, 'requests.json');
  const r = cli('--root', join(root, 'out'), '--requests', requests);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /5 groups of the Prototype await the agent's judgement/);
  assert.match(r.stdout, /skipped src\/App\.tsx:\d+: `buttonClass\("solid"\)` is a function call/);
  assert.equal(existsSync(join(root, 'out')), false);
  const { path, groups, skipped } = read(requests);
  assert.equal(path, 'A');
  assert.equal(groups.length, 5);
  assert.deepEqual(skipped.map(s => s.site.replace(/:\d+$/, '')), ['src/App.tsx']);
  assert.deepEqual(groups.map(g => g.id), Object.keys(answers().groups).sort(), 'the committed answers name every group');
  assert.ok(groups.every(g => g.open.includes('family') && g.open.includes('description')));
  assert.deepEqual(readdirSync(root).sort(), ['requests.json']);
});

test('with the committed answers the run prints OK and writes the folder; layout wrappers are no families', { skip }, () => {
  const root = scratch(), out = join(root, 'out');
  const r = cli('--root', out, '--drafts', ANSWERS);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /path-a-app: 5 Component Families extracted from the Prototype \(action-button, card, icon-button, pill-button, segment\)/);
  assert.match(r.stdout, /OK\s*$/);
  const dir = join(out, 'path-a-app');
  assert.deepEqual(Object.keys(tree(dir)).filter(f => f.startsWith('contracts/')), FAMILIES.map(f => `contracts/${f}.component.json`));
  assert.ok(existsSync(join(dir, 'path-a-app.foundations.json')));
  assert.deepEqual(Object.keys(tree(join(dir, 'library'))).sort(), ['components.json', ...FAMILIES.map(f => `components/ui/${f}.tsx`), 'package-lock.json', 'src/index.css'].sort());

  // The Family map: which Prototype sites make each family, by place in the code (no line, no classes); wrappers and the
  // svg icons are in none.
  const map = read(join(dir, 'path-a-app.family-map.json'));
  assert.deepEqual(Object.keys(map.families), FAMILIES);
  assert.deepEqual(Object.fromEntries(Object.entries(map.families).map(([k, f]) => [k, f.sites.length])), { 'action-button': 1, card: 2, 'icon-button': 3, 'pill-button': 1, segment: 1 });
  const sites = Object.values(map.families).flatMap(f => f.sites);
  assert.ok(sites.every(s => s.file === 'src/App.tsx' && /^App:/.test(s.path) && Object.keys(s).join() === 'file,path'));
  assert.ok(!sites.some(s => /\/svg|\/path/.test(s.path)));
  assert.equal(new Set(sites.map(s => s.path)).size, sites.length, 'a site belongs to one family');
  assert.equal(sites.length, 8, 'eight elements make the five families; the other divs are layout wrappers');
  assert.ok(Object.values(map.families).every(f => f.by === 'agent' && /^sha256:/.test(f.fingerprint) && f.evidence.length));
});

test('every Contract validates and is drafted from the Extracted Library, not the Prototype', { skip }, async () => {
  const root = scratch();
  const report = await buildFolder({ project: PROTOTYPE, root, drafts: {}, answers: answers() });
  const dir = join(root, 'path-a-app');
  assert.deepEqual(report.families, FAMILIES);
  assert.deepEqual(report.requests, {});
  assert.equal(report.extraction, null);
  assert.deepEqual(report.skipped.map(s => s.family.replace(/:\d+$/, '')), ['src/App.tsx']);
  assert.match(report.skipped[0].reason, /buttonClass\("solid"\).*function call/);
  const foundations = read(join(dir, 'path-a-app.foundations.json'));
  for (const family of FAMILIES) {
    const contract = read(join(dir, 'contracts', `${family}.component.json`));
    assert.deepEqual(validate(contract, foundations).errors, [], family);
    assert.ok(contract.drafted, `${family} is a draft`);
    const files = Object.keys(contract.source.files);
    assert.ok(files.includes(`components/ui/${family}.tsx`), `${family}'s source is its library file`);
    assert.ok(files.every(f => existsSync(join(dir, 'library', f))), 'every source file is in the library');
    assert.ok(!files.some(f => f.startsWith('src/') && f !== 'src/index.css') && !files.includes('src/App.tsx'), 'none is a Prototype file');
    assert.equal(contract.source.files[`components/ui/${family}.tsx`], sha(readFileSync(join(dir, 'library/components/ui', `${family}.tsx`), 'utf8')));
  }
  const icon = read(join(dir, 'contracts/icon-button.component.json'));
  assert.deepEqual(icon.axes.map(a => [a.key, a.values.map(v => v.key)]), [['tone', ['positive', 'danger', 'warning']], ['state', ['enabled']]]);
  assert.equal(icon.family.description, 'A small square icon button; its tone sets the icon colour and the hover wash.');
  assert.deepEqual(icon.figma.grid, { columns: ['tone'], rows: ['state'] });
  // The ternary that mirrors `disabled` is the disabled State, not an axis: no axis of the action button.
  assert.deepEqual(read(join(dir, 'contracts/action-button.component.json')).axes.map(a => a.key), ['state']);
  assert.match(readFileSync(join(dir, 'library/components/ui/action-button.tsx'), 'utf8'), /disabled:bg-\[#e2e8f0\]/);
});

test('a second run with the same answers writes nothing, byte for byte', { skip }, async () => {
  const root = scratch();
  await buildFolder({ project: PROTOTYPE, root, answers: answers() });
  const before = tree(root);
  const again = await buildFolder({ project: PROTOTYPE, root, answers: answers() });
  assert.deepEqual(tree(root), before);
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.unchanged, FAMILIES);
  assert.equal(again.foundations.written, false);
  assert.deepEqual(again.library.written, []);
});

test('a group the answers leave open stops the run before any file is written', { skip }, async () => {
  const root = scratch();
  const partial = answers();
  const id = Object.keys(partial.groups)[0];
  delete partial.groups[id];
  const report = await buildFolder({ project: PROTOTYPE, root, answers: partial });
  assert.deepEqual(report.extraction.map(g => g.id), [id]);
  assert.equal(existsSync(join(root, 'path-a-app')), false);
});

test('a Prototype with no repeated element names its refusal', { skip }, async () => {
  const project = fileURLToPath(new URL('./fixtures/tailwind-no-shadcn', import.meta.url));
  await assert.rejects(buildFolder({ project, root: scratch() }), /path A found no Component Family/);
});
