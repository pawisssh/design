// Path A's folder step (#257, spec #249, ADR 0016): a React + Tailwind Prototype with no components.json gets an
// Extracted Library, a Family map, the Foundations document and a draft Contract per family, with the Contracts read
// from the library and never from the Prototype. The fixture's committed answers stand in for the agent's one batch
// of judgement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../contract/scripts/contract.mjs';
import { sha256 } from '../../adapter-generic/scripts/sources.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { PATH_A as PROTOTYPE, PATH_A_ANSWERS as ANSWERS, PATH_A_FAMILIES as FAMILIES, read, scratch, skip, tree } from './helpers.mjs';

const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [FOLDER, PROTOTYPE, ...args], { encoding: 'utf8' });
const answers = () => read(ANSWERS);

test('the first run writes one requests file and exits 2; nothing else is written', { skip }, () => {
  const root = scratch(), requests = join(root, 'requests.json');
  const r = cli('--root', join(root, 'out'), '--requests', requests);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /6 groups of the Prototype await the agent's judgement/);
  assert.match(r.stdout, /skipped src\/App\.tsx:\d+: `buttonClass\("solid"\)` is a function call/);
  assert.equal(existsSync(join(root, 'out')), false);
  const { path, groups, skipped } = read(requests);
  assert.equal(path, 'A');
  assert.equal(groups.length, 6);
  assert.deepEqual(skipped.map(s => s.site.replace(/:\d+$/, '')), ['src/App.tsx']);
  assert.deepEqual(groups.map(g => g.id), Object.keys(answers().groups).sort(), 'the committed answers name every group');
  assert.ok(groups.every(g => g.open.includes('family') && g.open.includes('description')));
  assert.deepEqual(readdirSync(root).sort(), ['requests.json']);
});

test('with the committed answers the run prints OK and writes the folder; layout wrappers are no families', { skip }, () => {
  const root = scratch(), out = join(root, 'out');
  const r = cli('--root', out, '--drafts', ANSWERS);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /path-a-app: 6 Component Families extracted from the Prototype \(action-button, card, chip, icon-button, pill-button, segment\)/);
  assert.match(r.stdout, /OK\s*$/);
  const dir = join(out, 'path-a-app');
  assert.deepEqual(Object.keys(tree(dir)).filter(f => f.startsWith('contracts/')), FAMILIES.map(f => `contracts/${f}.component.json`));
  assert.ok(existsSync(join(dir, 'path-a-app.foundations.json')));
  assert.deepEqual(Object.keys(tree(join(dir, 'library'))).sort(), ['components.json', ...FAMILIES.map(f => `components/ui/${f}.tsx`), 'package-lock.json', 'src/index.css'].sort());

  // The Family map: which Prototype sites make each family, by place in the code (no line, no classes); wrappers and the
  // svg icons are in none.
  const map = read(join(dir, 'path-a-app.family-map.json'));
  assert.deepEqual(Object.keys(map.families), FAMILIES);
  assert.deepEqual(Object.fromEntries(Object.entries(map.families).map(([k, f]) => [k, f.sites.length])), { 'action-button': 1, card: 2, chip: 3, 'icon-button': 3, 'pill-button': 1, segment: 1 });
  const sites = Object.values(map.families).flatMap(f => f.sites);
  assert.ok(sites.every(s => s.file === 'src/App.tsx' && /^App:/.test(s.path) && Object.keys(s).join() === 'file,path'));
  assert.ok(!sites.some(s => /\/svg|\/path/.test(s.path)));
  assert.equal(new Set(sites.map(s => s.path)).size, sites.length, 'a site belongs to one family');
  assert.equal(sites.length, 11, 'eleven elements make the six families; the other divs are layout wrappers');
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
    assert.equal(contract.source.files[`components/ui/${family}.tsx`], `sha256:${sha256(readFileSync(join(dir, 'library/components/ui', `${family}.tsx`), 'utf8'))}`);
  }
  // The library pins what the Prototype resolves: its own tailwindcss entry (version and integrity), and a CSS entry that is its stylesheet.
  const lock = name => read(join(name, 'package-lock.json')).packages['node_modules/tailwindcss'];
  assert.deepEqual(lock(join(dir, 'library')), lock(PROTOTYPE));
  assert.equal(read(join(dir, 'library/components.json')).tailwind.css, 'src/index.css');
  assert.equal(readFileSync(join(dir, 'library/src/index.css'), 'utf8'), readFileSync(join(PROTOTYPE, 'src/index.css'), 'utf8'));
  const icon = read(join(dir, 'contracts/icon-button.component.json'));
  assert.deepEqual(icon.axes.map(a => [a.key, a.values.map(v => v.key)]), [['tone', ['positive', 'danger', 'warning']], ['state', ['enabled', 'hover', 'disabled']]]);
  assert.equal(icon.family.description, 'A small square icon button; its tone sets the icon colour and the hover wash.');
  assert.deepEqual(icon.figma.grid, { columns: ['tone'], rows: ['state'] });
  // The ternary that mirrors `disabled` is the disabled State, not an axis: no axis of the action button.
  assert.deepEqual(read(join(dir, 'contracts/action-button.component.json')).axes.map(a => [a.key, a.values.map(v => v.key)]), [['state', ['enabled', 'disabled']]]);
  assert.match(readFileSync(join(dir, 'library/components/ui/action-button.tsx'), 'utf8'), /disabled:bg-\[#e2e8f0\]/);
});

test('the chips with and without an icon child are one family with a Slot axis: Figma gets an icon frame and Icon True/False (#259)', { skip }, async () => {
  const root = scratch();
  await buildFolder({ project: PROTOTYPE, root, answers: answers() });
  const dir = join(root, 'path-a-app');
  assert.equal(read(join(dir, 'path-a-app.family-map.json')).families.chip.sites.length, 3);
  const tsx = readFileSync(join(dir, 'library/components/ui/chip.tsx'), 'utf8');
  assert.match(tsx, /has-data-\[icon=inline-start\]:gap-1/);
  assert.deepEqual([...tsx.matchAll(/^import .* from "([^"]+)"/gm)].map(m => m[1]), ['react', 'cn'], 'no icon package');
  const chip = read(join(dir, 'contracts/chip.component.json'));
  const slot = chip.axes.find(a => a.slot);
  assert.deepEqual([slot.key, slot.default, slot.values.map(v => [v.key, v.label])], ['icon-inline-start', 'none', [['none', 'False'], ['icon-inline-start', 'True']]]);
  assert.deepEqual(chip.anatomy.children.map(n => [n.name, n.type, n.role]), [['Icon Inline Start', 'FRAME', 'icon'], ['Label', 'TEXT', undefined]]);
  assert.deepEqual(chip.figma.grid, { columns: ['state'], rows: ['icon-inline-start'] });
  // The icon sites' gap is the filled value's alone; without the slot the frame is hidden and the root has no gap.
  const [always, filled] = chip.layout;
  assert.deepEqual([always.match, always.set.Chip.gap, always.set['Icon Inline Start']], [{}, { token: 'spacing-0' }, { width: { token: 'spacing-3' }, height: { token: 'spacing-3' }, visible: false }]);
  assert.deepEqual(filled, { match: { 'icon-inline-start': 'icon-inline-start' }, set: { Chip: { gap: { token: 'spacing-1' } }, 'Icon Inline Start': { visible: true } } });
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

test('a family renamed in the answers leaves no stale component in the library', { skip }, async () => {
  const root = scratch();
  await buildFolder({ project: PROTOTYPE, root, answers: answers() });
  const renamed = answers();
  renamed.groups['div-1fa6b3d0'].family = 'panel';
  await buildFolder({ project: PROTOTYPE, root, answers: renamed });
  const ui = readdirSync(join(root, 'path-a-app/library/components/ui'));
  assert.ok(ui.includes('panel.tsx') && !ui.includes('card.tsx'));
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
