// Icon atoms slice (#30), through the offline chain: Contract + @carbon/icons SVGs + ledger → build plan →
// package → core on a mock figma. Needs the pinned sources: node skills/adapter-carbon/scripts/sources.mjs
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconsPlan } from '../scripts/build-plan.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';
import { pack } from './pack.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8'));
// The Button icons' SVGs, and the TextInput and Select status and chevron icons (#93), copied verbatim from the
// pinned package, so these tests run on a fresh clone.
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const PINNED_DIR = join(ROOT, '.scratch/adapter-carbon/sources/npm/@carbon/icons@11.90.0/package');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-16T00:00:00.000Z';
const BUTTON_ICONS = ['Add', 'Arrow--right', 'Launch', 'Download', 'Save', 'Edit', 'Filter', 'Trash-can', 'Close'];

const derive = ({ ledger = null, contracts = [BUTTON], dir = ICONS_DIR, options = {} } = {}) =>
  iconsPlan(contracts, dir, ledger, { fileKey: FILE_KEY, at: AT, ...options });

// One use_figma call: derive, package, run on the mock. `edit` may change the plan before packaging.
async function call(mock, opts = {}) {
  const { plan, state } = derive(opts);
  if (opts.edit) opts.edit(plan);
  return runPackage(pack(plan, state, CORE).code, mock.figma);
}

const writes = mock => mock.log.filter(([op]) => op !== 'setCurrentPage');
const iconsPage = mock => mock.snapshot().pages.find(p => p.name === 'Icons');
const ledgerAfter = (result, previous = { schemaVersion: 1, fileKey: FILE_KEY, foundations: null, sets: {} }) => recordResult(previous, result);

// A fake @carbon/icons package directory, for the 16-else-32 choice and the SVG clean-up.
function fakeIcons(files, version = '11.90.0') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-icons-pkg-')));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@carbon/icons', version }));
  for (const [path, svg] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), svg);
  }
  return dir;
}
const svg = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`;
const withIcons = (keys, def = keys[0]) => ({ ...BUTTON, icons: { ...BUTTON.icons, default: def, preferred: keys } });

// ---- plan ----

test('the plan holds exactly the Contract\'s icons, 16 when present else 32, in Contract order', () => {
  const { plan, state } = derive();
  assert.equal(plan.slice, 'icons');
  assert.equal(plan.page, 'Icons');
  assert.deepEqual(plan.source, { package: '@carbon/icons', version: '11.90.0' });
  assert.deepEqual(plan.icons.map(i => i.name), BUTTON_ICONS);
  const file = Object.fromEntries(plan.icons.map(i => [i.key, i.file]));
  assert.equal(file.add, 'svg/32/add.svg');
  assert.equal(file['arrow--right'], 'svg/16/arrow--right.svg');
  assert.equal(file['trash-can'], 'svg/32/trash-can.svg');
  for (const i of plan.icons) {
    assert.equal(i.svg, readFileSync(join(ICONS_DIR, i.file), 'utf8').trim());
    assert.match(i.sha256, /^sha256:[0-9a-f]{64}$/);
  }
  assert.deepEqual(state, { schemaVersion: 1, fileKey: FILE_KEY, icons: null }, 'state carries only the icons section');
});

test('the fixture matches the pinned @carbon/icons package: the same plan, file for file', {
  skip: existsSync(PINNED_DIR) ? false : 'pinned package missing: run node skills/adapter-carbon/scripts/sources.mjs',
}, () => {
  assert.deepEqual(derive({ dir: PINNED_DIR }), derive());
});

test('a fake package: 16 is preferred, 32 is the fallback, a missing icon or another version is refused', () => {
  const dir = fakeIcons({
    'svg/16/both.svg': svg(16, '<path d="M1 1 15 1 15 15z"/>'),
    'svg/32/both.svg': svg(32, '<path d="M2 2 30 2 30 30z"/>'),
    'svg/32/only-32.svg': svg(32, '<path d="M2 2 30 2 30 30z"/>'),
  });
  const { plan } = derive({ contracts: [withIcons(['both', 'only-32'])], dir });
  assert.deepEqual(plan.icons.map(i => [i.key, i.name, i.file]), [['both', 'Both', 'svg/16/both.svg'], ['only-32', 'Only-32', 'svg/32/only-32.svg']]);
  assert.throws(() => derive({ contracts: [withIcons(['both', 'nowhere'])], dir }), /nowhere.*svg\/16\/nowhere\.svg.*svg\/32\/nowhere\.svg/);
  assert.throws(() => derive({ contracts: [withIcons(['../both'])], dir }), /icon key/);
  assert.throws(() => derive({ contracts: [withIcons(['both'])], dir: fakeIcons({}, '11.89.0') }), /11\.89\.0.*11\.90\.0/);
});

test('camelCase icon keys (CDS) resolve to their own files and kit names; path-unsafe keys are still refused (#403)', () => {
  const cds = { ...BUTTON.icons.source, package: '@coinbase/cds-icons', version: '5.26.0', path: 'esm/svgs/{key}-16-inactive.svg', fallback: 'esm/svgs/{key}-24-inactive.svg' };
  const contract = keys => { const c = withIcons(keys); c.icons.source = cds; return c; };
  const dir = fakeIcons({
    'esm/svgs/forwardArrow-16-inactive.svg': svg(16, '<path d="M1 1 15 1 15 15z"/>'),
    'esm/svgs/externalLink-24-inactive.svg': svg(24, '<path d="M2 2 22 2 22 22z"/>'),
  }, '5.26.0');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@coinbase/cds-icons', version: '5.26.0' }));
  const { plan } = derive({ contracts: [contract(['forwardArrow', 'externalLink'])], dir });
  assert.deepEqual(plan.icons.map(i => [i.key, i.name, i.file]), [
    ['forwardArrow', 'ForwardArrow', 'esm/svgs/forwardArrow-16-inactive.svg'],
    ['externalLink', 'ExternalLink', 'esm/svgs/externalLink-24-inactive.svg'],
  ]);
  for (const bad of ['../forwardArrow', 'a/b', 'forward Arrow', 'forwardArrow..x', '-forwardArrow'])
    assert.throws(() => derive({ contracts: [contract([bad])], dir }), /icon key/, bad);
});

test('icons from several Contracts are built once; Contracts that pin different icon packages are refused', () => {
  const dir = fakeIcons({ 'svg/32/a.svg': svg(32, '<path d="M2 2 30 30z"/>'), 'svg/32/b.svg': svg(32, '<path d="M2 2 30 30z"/>') });
  const { plan } = derive({ contracts: [withIcons(['a', 'b']), withIcons(['b']), { ...BUTTON, icons: undefined }], dir });
  assert.deepEqual(plan.icons.map(i => i.key), ['a', 'b']);
  const other = withIcons(['b']);
  other.icons.source = { ...other.icons.source, version: '11.91.0' };
  assert.throws(() => derive({ contracts: [withIcons(['a']), other], dir }), /one icon package/);
});

test('shapes that paint nothing (fill="none", Carbon\'s inner path and transparent rectangle) are dropped from the SVG', () => {
  const dir = fakeIcons({
    'svg/32/two-tone.svg': svg(32, '<path d="M16,2A14,14,0,1,0,30,16Z"/><path fill="none" d="M14 21 9 16z" data-icon-path="inner-path"/><rect id="_Transparent_Rectangle_" data-name="&lt;Transparent Rectangle&gt;" class="cls-1" width="32" height="32" style="fill:none"/>'),
  });
  const { plan } = derive({ contracts: [withIcons(['two-tone'])], dir });
  assert.equal(plan.icons[0].svg, svg(32, '<path d="M16,2A14,14,0,1,0,30,16Z"/>'));
});

test('a 16px status icon\'s inner path marked opacity="0" is dropped too, so warning--filled keeps its mark (#93)', () => {
  const textInput = JSON.parse(readFileSync(join(ROOT, 'skills/contract/test/fixtures/form-controls/text-input.component.json'), 'utf8'));
  const { plan } = derive({ contracts: [textInput] });
  assert.deepEqual(plan.icons.map(i => [i.key, i.file]), [['warning--filled', 'svg/16/warning--filled.svg'], ['warning--alt--filled', 'svg/32/warning--alt--filled.svg']]);
  const [filled, alt] = plan.icons.map(i => i.svg);
  assert.equal((filled.match(/<path/g) || []).length, 1, 'only the disc with the mark cut out is left');
  assert.doesNotMatch(filled, /opacity="0"|inner-path/);
  assert.doesNotMatch(alt, /fill="none"|inner-path/);
  const dir = fakeIcons({ 'svg/16/x.svg': svg(16, '<path d="M8,1z"/><path d="M7.5,4h1z" data-icon-path="inner-path" opacity="0"/><path d="M2,2z" opacity="0.5"/>') });
  assert.equal(derive({ contracts: [withIcons(['x'])], dir }).plan.icons[0].svg, svg(16, '<path d="M8,1z"/><path d="M2,2z" opacity="0.5"/>'), 'a partly transparent shape stays');
});

test('the package is well under the 50,000-char cap; save.svg\'s literal TAB reaches the core intact', async () => {
  const { plan, state } = derive();
  const { code, out } = pack(plan, state, CORE);
  assert.ok(out.chars < 50000, `package is ${out.chars} chars`);
  assert.equal(out.check.entries, 9);
  const save = plan.icons.find(i => i.key === 'save');
  assert.ok(save.svg.includes('\t'), 'the pinned save.svg has a TAB in its path data');
  assert.ok(!code.includes('\t'), 'the package escapes it');
  const mock = mockFigma({ fileKey: FILE_KEY });
  const seen = [];
  const create = mock.figma.createNodeFromSvg;
  mock.figma.createNodeFromSvg = text => { seen.push(text); return create(text); };
  await runPackage(code, mock.figma);
  assert.ok(seen.includes(save.svg));
});

// Live finding (#30): use_figma transpiles a script whose strings hold markup-like text, even spelled <,
// which reformats buildComponentSets.toString() and fails the core hash. The SVGs reach the core intact anyway.
test('the package never spells "<" before a tag name, yet the core receives every SVG byte for byte', async () => {
  const { plan, state } = derive();
  const { code } = pack(plan, state, CORE);
  assert.doesNotMatch(code, /<[A-Za-z/!?]/);
  assert.doesNotMatch(code, /\\u003c|\\x3c/i);
  assert.match(code, /\.join\(String\.fromCharCode\(60\)\)/);
  const mock = mockFigma({ fileKey: FILE_KEY });
  const seen = [];
  const create = mock.figma.createNodeFromSvg;
  mock.figma.createNodeFromSvg = text => { seen.push(text); return create(text); };
  const result = await runPackage(code, mock.figma);
  assert.equal(result.error, undefined, JSON.stringify(result).slice(0, 300));
  assert.equal(result.summary.created, 10);
  assert.deepEqual(seen, plan.icons.map(i => i.svg));
});

// ---- first run ----

test('a first run creates the Icons page and one 16x16 component per icon, with no fill and one SCALE Vector', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const result = await call(mock);
  assert.equal(result.error, undefined, JSON.stringify(result).slice(0, 300));
  const page = iconsPage(mock);
  assert.ok(page, 'Icons page');
  assert.deepEqual(page.children.map(n => n.name), BUTTON_ICONS);
  for (const c of page.children) {
    assert.equal(c.type, 'COMPONENT', c.name);
    assert.deepEqual([c.width, c.height], [16, 16], c.name);
    assert.deepEqual(c.fills, [], c.name);
    assert.equal(c.children.length, 1, c.name);
    assert.deepEqual([c.children[0].type, c.children[0].name], ['VECTOR', 'Vector'], c.name);
    assert.deepEqual(c.children[0].constraints, { horizontal: 'SCALE', vertical: 'SCALE' }, c.name);
    assert.equal(c.children[0].fills.length, 1, `${c.name}: the vector keeps the SVG fill`);
  }
  const box = name => { const v = page.children.find(c => c.name === name).children[0]; return [v.x, v.y, v.width, v.height]; };
  assert.deepEqual(box('Add'), [4, 4, 8, 8], 'the 32 source scaled to 16, as the kit');
  assert.deepEqual(box('Arrow--right'), [1, 3, 14, 10]);
  assert.equal(page.children.find(c => c.name === 'Trash-can').children.length, 1, 'four shapes flattened into one Vector');
  assert.equal(page.children[0].description, '@carbon/icons@11.90.0 svg/32/add.svg');
  assert.deepEqual(result.summary, { created: 10, updated: 0, unchanged: 0, orphaned: 0, restored: 0, conflicts: 0 });
  assert.equal(result.created.page, true);
  assert.equal(result.created.icons.length, 9);
});

test('the returned ledger records the page and every component by icon key; recording it keeps foundations', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const result = await call(mock);
  const page = iconsPage(mock);
  const icons = result.ledger.icons;
  assert.deepEqual(Object.keys(result.ledger), ['icons']);
  assert.equal(icons.page, page.id);
  assert.deepEqual(icons.source, { package: '@carbon/icons', version: '11.90.0' });
  const { plan } = derive();
  assert.deepEqual(Object.keys(icons.components), plan.icons.map(i => i.key));
  page.children.forEach((c, n) => {
    const i = plan.icons[n];
    assert.deepEqual(icons.components[i.key], { id: c.id, key: c.key, file: i.file, sha256: i.sha256 });
  });
  assert.deepEqual(icons.orphans, {});
  assert.ok(JSON.stringify(result).length < 20480, `output ${JSON.stringify(result).length} bytes`);

  const foundations = { designSystem: 'carbon', variables: { 'spacing-05': 'VariableID:1:2' } };
  const ledger = recordResult({ schemaVersion: 1, fileKey: FILE_KEY, foundations, sets: { button: { id: '1:2' } } }, result);
  assert.deepEqual(ledger.foundations, foundations);
  assert.deepEqual(ledger.sets, { button: { id: '1:2' } });
  assert.deepEqual(ledger.icons, icons);
});

test('a rerun with the recorded ledger creates nothing, writes nothing and returns the same ids', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const first = await call(mock);
  const before = mock.snapshot();
  mock.log.length = 0;
  const second = await call(mock, { ledger: ledgerAfter(first) });
  assert.deepEqual(second.summary, { created: 0, updated: 0, unchanged: 9, orphaned: 0, restored: 0, conflicts: 0 });
  assert.deepEqual(writes(mock), []);
  assert.deepEqual(mock.snapshot(), before);
  assert.deepEqual(second.ledger, first.ledger);
});

test('icons go on the Icons page even when another page is current; other pages are left alone', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1', 'Buttons'] });
  await mock.figma.setCurrentPageAsync(mock.figma.root.children[1]);
  await call(mock);
  const snap = mock.snapshot();
  assert.deepEqual(snap.pages.map(p => [p.name, p.children.length]), [['Page 1', 0], ['Buttons', 0], ['Icons', 9]]);
});

// ---- ownership ----

async function built() {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const first = await call(mock);
  mock.log.length = 0;
  return { mock, first, ledger: ledgerAfter(first) };
}
const node = (mock, id) => mock.figma.getNodeByIdAsync(id);

test('an unrecorded Icons page is a conflict and nothing changes; adopt builds on it', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1', 'Icons'] });
  const theirs = mock.figma.root.children[1];
  const result = await call(mock);
  assert.deepEqual(result.conflicts, [{ kind: 'page', name: 'Icons', reason: 'unowned', id: theirs.id }]);
  assert.equal(result.summary.created, 0);
  assert.deepEqual(mock.log, []);
  assert.deepEqual(result.ledger, { icons: null });
  const adopted = await call(mock, { options: { adopt: true } });
  assert.equal(adopted.ledger.icons.page, theirs.id);
  assert.deepEqual(adopted.summary.created, 9);
});

test('after a lost connection, a run without the ledger reports conflicts; adopt reclaims every component by id', async () => {
  const { mock, first } = await built();
  const lost = await call(mock);
  assert.deepEqual(lost.conflicts.map(c => `${c.kind}:${c.name}`), ['page:Icons']);
  const adopted = await call(mock, { options: { adopt: true } });
  assert.equal(adopted.summary.created, 0);
  assert.equal(adopted.summary.conflicts, 0);
  assert.deepEqual(Object.values(adopted.ledger.icons.components).map(c => c.id), Object.values(first.ledger.icons.components).map(c => c.id));
});

test('an unrecorded same-name component on the owned page is a conflict unless adopt', async () => {
  const { mock, ledger } = await built();
  const id = ledger.icons.components.close.id;
  delete ledger.icons.components.close;
  const result = await call(mock, { ledger });
  assert.deepEqual(result.conflicts, [{ kind: 'icon', name: 'close', reason: 'unowned', id }]);
  assert.deepEqual(mock.log, []);
  const adopted = await call(mock, { ledger, options: { adopt: true } });
  assert.equal(adopted.summary.created, 0);
  assert.equal(adopted.ledger.icons.components.close.id, id);
});

test('hand edits are reverted in place: name, size, fill, a renamed Vector, a move to another page', async () => {
  const { mock, ledger } = await built();
  const c = ledger.icons.components;
  const editVector = { ...(await node(mock, c.edit.id)).children[0] };
  (await node(mock, c.add.id)).name = 'Plus';
  (await node(mock, c.edit.id)).resize(20, 20);
  (await node(mock, c.save.id)).fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  (await node(mock, c.close.id)).children[0].name = 'Path';
  mock.figma.root.children[0].appendChild(await node(mock, c.filter.id));
  mock.log.length = 0;
  const result = await call(mock, { ledger });
  assert.deepEqual(result.updated, { add: ['name'], edit: ['size'], save: ['fills'], close: ['vector:name'], filter: ['page'] });
  assert.deepEqual(result.summary, { created: 0, updated: 5, unchanged: 4, orphaned: 0, restored: 0, conflicts: 0 });
  const page = iconsPage(mock);
  assert.deepEqual(page.children.map(n => n.name).sort(), [...BUTTON_ICONS].sort());
  for (const n of page.children) assert.deepEqual([n.width, n.height, n.fills, n.children[0].name], [16, 16, [], 'Vector'], n.name);
  const v = page.children.find(n => n.name === 'Edit').children[0];
  assert.deepEqual([v.x, v.y, v.width, v.height], [editVector._x, editVector._y, editVector.width, editVector.height], 'the Vector scales back with the component');
  assert.deepEqual(result.ledger, { icons: ledger.icons }, 'same ids');
});

test('a changed SVG rebuilds only the Vector: the component keeps its id and key', async () => {
  const { mock, ledger } = await built();
  const before = await node(mock, ledger.icons.components.add.id);
  const oldVector = before.children[0].id;
  const result = await call(mock, {
    ledger,
    edit: plan => { const add = plan.icons[0]; add.svg = add.svg.replace('M17 15', 'M18 15'); add.sha256 = 'sha256:' + '1'.repeat(64); },
  });
  assert.deepEqual(result.updated, { add: ['vector'] });
  const after = await node(mock, ledger.icons.components.add.id);
  assert.equal(after, before);
  assert.notEqual(after.children[0].id, oldVector);
  assert.deepEqual([after.children.length, after.children[0].name, after.children[0].constraints], [1, 'Vector', { horizontal: 'SCALE', vertical: 'SCALE' }]);
  assert.deepEqual([after.width, after.height], [16, 16]);
  assert.equal(result.ledger.icons.components.add.sha256, 'sha256:' + '1'.repeat(64));
  assert.equal(result.ledger.icons.components.add.key, ledger.icons.components.add.key);
});

test('a dropped icon becomes an orphan that keeps its id and its node; it gets the same id back when it returns', async () => {
  const { mock, ledger } = await built();
  const id = ledger.icons.components.close.id;
  const fewer = withIcons(BUTTON.icons.preferred.filter(k => k !== 'close'), 'add');
  const dropped = await call(mock, { ledger, contracts: [fewer] });
  assert.deepEqual(dropped.orphaned, ['close']);
  assert.equal(dropped.summary.orphaned, 1);
  assert.equal(dropped.ledger.icons.orphans.close.id, id);
  assert.equal(dropped.ledger.icons.orphans.close.since, AT);
  assert.equal(dropped.ledger.icons.components.close, undefined);
  assert.ok(await node(mock, id), 'an orphan is never deleted by a run');
  assert.deepEqual(writes(mock), []);

  const back = await call(mock, { ledger: ledgerAfter(dropped, ledger) });
  assert.deepEqual(back.restored, ['close']);
  assert.equal(back.summary.created, 0);
  assert.equal(back.ledger.icons.components.close.id, id);
  assert.deepEqual(back.ledger.icons.orphans, {});
});

test('a recorded component deleted by hand is created again', async () => {
  const { mock, ledger } = await built();
  (await node(mock, ledger.icons.components.launch.id)).remove();
  const result = await call(mock, { ledger });
  assert.deepEqual(result.created.icons, ['launch']);
  assert.notEqual(result.ledger.icons.components.launch.id, ledger.icons.components.launch.id);
  assert.deepEqual(iconsPage(mock).children.map(n => n.name).sort(), [...BUTTON_ICONS].sort());
});

test('a package for another file changes nothing', async () => {
  const mock = mockFigma({ fileKey: 'SOMEOTHERFILE' });
  const result = await call(mock);
  assert.deepEqual(result, { error: 'wrong-file', expected: FILE_KEY, got: 'SOMEOTHERFILE' });
  assert.deepEqual(mock.log, []);
});

// ---- CLI ----

test('the icons CLI derives plan.json and state.json from Contracts and an icons directory', () => {
  const out = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-icons-cli-')));
  const run = spawnSync('node', [join(ROOT, 'skills/to-design/scripts/build-plan.mjs'), 'icons',
    '--contract', join(ROOT, 'design-systems/carbon/contracts/button.component.json'), '--icons-dir', ICONS_DIR,
    '--file-key', FILE_KEY, '--out', out, '--ledger', join(out, 'none.json')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).icons, 9);
  assert.equal(JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8')).icons.length, 9);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'state.json'), 'utf8')), { schemaVersion: 1, fileKey: FILE_KEY, icons: null });
});
