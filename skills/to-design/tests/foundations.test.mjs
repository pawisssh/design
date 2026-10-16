// Foundations slice, through the offline chain: foundations document + ledger → build plan → package → core on a mock figma.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationsPlan } from '../scripts/build-plan.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';

const DOC_PATH = new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url);
const DOC_TEXT = readFileSync(DOC_PATH, 'utf8');
const CORE = new URL('../assets/builder-core.js', import.meta.url).pathname;
const PACKAGER = new URL('../scripts/package_native_builder.py', import.meta.url).pathname;
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-16T00:00:00.000Z';

// Derives the plan, packages it with the real packager, and returns the package code.
function pack({ docText = DOC_TEXT, ledger = null, options = {}, strip } = {}) {
  const { plan, state } = foundationsPlan(docText, ledger, { fileKey: FILE_KEY, at: AT, strip, ...options });
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-foundations-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, CORE, 'plan.json', 'out', '--state', 'state.json'], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return { code: readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8'), out: JSON.parse(run.stdout), plan, state };
}

// One use_figma call: package and run on the mock.
async function call(mock, opts) {
  const { code } = pack(opts);
  return runPackage(code, mock.figma);
}

// The ledger file after recording a result, as `ledger.mjs record` merges it.
const ledgerAfter = (result, previous = null) => ({ schemaVersion: 1, fileKey: FILE_KEY, sets: {}, ...previous, ...result.ledger });

test('the package embeds plan and state as String.raw text with an FNV-1a-32 CHECK block', () => {
  const { code, out } = pack();
  assert.match(code, /const PLAN_SRC = String\.raw`\{/);
  assert.match(code, /const STATE_SRC = String\.raw`\{/);
  const check = JSON.parse(code.match(/const CHECK = (\{.*\});/)[1]);
  assert.deepEqual(Object.keys(check).sort(), ['core', 'entries', 'plan', 'planLen', 'state']);
  assert.equal(check.entries, 77, '75 variables + 2 Text Styles');
  for (const field of ['plan', 'state', 'core']) assert.match(check[field], /^[0-9a-f]{8}$/);
  assert.ok(out.chars < 50000, `package is ${out.chars} chars`);
});

test('a drifted package returns package-mismatch and changes nothing', async () => {
  const { code } = pack();
  const drifts = {
    plan: code.replace('"Gray 10"', '"Gray 11"'),
    planLen: code.replace('"Gray 10"', '"Gray 1"'),
    state: code.replace('const STATE_SRC = String.raw`{', 'const STATE_SRC = String.raw`{"x":1,'),
    core: code.replace(/(async function buildComponentSets\([^)]*\) \{)/, '$1 '),
    entries: code.replace(/"entries":\d+/, '"entries":76'),
  };
  for (const [field, drifted] of Object.entries(drifts)) {
    assert.notEqual(drifted, code, `${field} drift must change the package`);
    const mock = mockFigma({ fileKey: FILE_KEY });
    const result = await runPackage(drifted, mock.figma);
    assert.equal(result.error, 'package-mismatch', field);
    assert.equal(result.field, field);
    assert.ok('expected' in result && 'got' in result);
    assert.notEqual(result.expected, result.got);
    assert.deepEqual(mock.log, [], `${field}: nothing written`);
  }
});

const byName = (list, name) => list.find(x => x.name === name);
const rgb = (r, g, b, a = 1) => ({ r: Math.fround(r / 255), g: Math.fround(g / 255), b: Math.fround(b / 255), a: Math.fround(a) });

test('a first run on an empty file creates the four collections, their modes, 75 variables and 2 Text Styles', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const result = await call(mock);
  assert.equal(result.error, undefined, JSON.stringify(result).slice(0, 300));
  const snap = mock.snapshot();

  assert.deepEqual(snap.collections.map(c => c.name), ['Primitives', 'Theme', 'Layout', 'Type']);
  assert.deepEqual(snap.collections.map(c => c.hidden), [true, false, false, false]);
  assert.deepEqual(byName(snap.collections, 'Theme').modes.map(m => m.name), ['White', 'Gray 10', 'Gray 90', 'Gray 100']);
  for (const name of ['Primitives', 'Layout', 'Type']) assert.deepEqual(byName(snap.collections, name).modes.map(m => m.name), ['Default']);
  assert.deepEqual(snap.collections.map(c => c.variables.length), [20, 24, 22, 9]);

  const all = snap.collections.flatMap(c => c.variables);
  const v = name => byName(all, name);
  const primary = v('Button/button-primary');
  assert.equal(primary.type, 'COLOR');
  assert.deepEqual(primary.scopes, ['ALL_FILLS', 'STROKE_COLOR']);
  assert.deepEqual(primary.codeSyntax, { WEB: 'var(--cds-button-primary)' });
  assert.deepEqual(primary.values[0], ['White', { type: 'VARIABLE_ALIAS', id: v('Blue/60').id }]);
  assert.deepEqual(v('Blue/60').values, [['Default', rgb(0x0f, 0x62, 0xfe)]]);
  assert.equal(v('Blue/60').hidden, true);
  assert.deepEqual(v('Blue/60').scopes, []);
  assert.deepEqual(v('Button/button-disabled').values[2], ['Gray 90', rgb(141, 141, 141, 0.3)]);
  assert.deepEqual(v('Button/button-danger-hover').values[0], ['White', rgb(0xb8, 0x19, 0x21)]);
  assert.deepEqual(v('Spacing/spacing-05'), { ...v('Spacing/spacing-05'), type: 'FLOAT', scopes: ['GAP'], codeSyntax: { WEB: 'var(--cds-spacing-05)' }, values: [['Default', 16]] });
  assert.deepEqual(v('Size/size-lg').codeSyntax, { WEB: '$size-lg' });
  assert.deepEqual(v('Font family/font-family-sans'), { ...v('Font family/font-family-sans'), type: 'STRING', codeSyntax: {}, values: [['Default', 'IBM Plex Sans']] });

  assert.deepEqual(snap.textStyles.map(s => s.name), ['Body/body-compact-01', 'Body/body-compact-02']);
  const body01 = snap.textStyles[0];
  assert.deepEqual(body01.fontName, { family: 'IBM Plex Sans', style: 'Regular' });
  assert.equal(body01.fontSize, 14);
  assert.deepEqual(body01.lineHeight, { unit: 'PIXELS', value: 18 });
  assert.ok(Math.abs(body01.letterSpacing.value - 0.16) < 1e-6);
  assert.deepEqual(body01.bound, {
    fontFamily: 'Font family/font-family-sans', fontSize: 'Body/body-compact-01-font-size', lineHeight: 'Body/body-compact-01-line-height',
    fontWeight: 'Body/body-compact-01-font-weight', letterSpacing: 'Body/body-compact-01-letter-spacing',
  });

  assert.deepEqual(result.summary, { created: 88, updated: 0, unchanged: 0, orphaned: 0, restored: 0, pruned: 0, conflicts: 0 });
  assert.equal(result.created.modes.length, 7);
  assert.ok(mock.log.some(([op]) => op === 'setCurrentPage'), 'sets the current page explicitly');
});

test('the returned ledger records every collection, mode, variable and Text Style by key and flat name', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const result = await call(mock);
  const snap = mock.snapshot();
  const f = result.ledger.foundations;
  assert.equal(result.fileKey, FILE_KEY);
  assert.equal(f.designSystem, 'carbon');
  assert.equal(f.documentHash, `sha256:${createHash('sha256').update(DOC_TEXT).digest('hex')}`);
  assert.equal(f.snapshotId, JSON.parse(DOC_TEXT).source.snapshotId);
  assert.equal(f.appliedAt, AT);
  const theme = byName(snap.collections, 'Theme');
  assert.deepEqual(f.collections.theme, { id: theme.id, modes: { white: theme.modes[0].modeId, g10: theme.modes[1].modeId, g90: theme.modes[2].modeId, g100: theme.modes[3].modeId } });
  assert.deepEqual(Object.keys(f.collections), ['primitives', 'theme', 'layout', 'type']);
  const ids = Object.fromEntries(snap.collections.flatMap(c => c.variables).map(v => [v.name, v.id]));
  const doc = JSON.parse(DOC_TEXT);
  assert.equal(Object.keys(f.variables).length, 75);
  for (const [flat, v] of Object.entries(doc.variables)) assert.equal(f.variables[flat], ids[v.name], flat);
  assert.deepEqual(f.textStyles, { 'body-compact-01': snap.textStyles[0].id, 'body-compact-02': snap.textStyles[1].id });
  assert.deepEqual(f.orphans, { variables: {}, textStyles: {} });
  assert.ok(JSON.stringify(result).length < 20480, `output ${JSON.stringify(result).length} bytes`);
});

test('a second run with the returned ledger creates nothing, updates nothing and writes nothing', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const first = await call(mock);
  const before = mock.snapshot();
  mock.log.length = 0;
  const second = await call(mock, { ledger: ledgerAfter(first) });
  assert.deepEqual(second.summary, { created: 0, updated: 0, unchanged: 81, orphaned: 0, restored: 0, pruned: 0, conflicts: 0 });
  assert.deepEqual(mock.snapshot(), before);
  assert.deepEqual(mock.log.filter(([op]) => !['setCurrentPage', 'loadFont'].includes(op)), []);
  assert.deepEqual(second.ledger, first.ledger);
});

// ---- ownership ----

const docWith = edit => { const doc = JSON.parse(DOC_TEXT); edit(doc); return JSON.stringify(doc, null, 2) + '\n'; };
const writes = mock => mock.log.filter(([op]) => !['setCurrentPage', 'loadFont'].includes(op));
const allVariables = mock => mock.snapshot().collections.flatMap(c => c.variables);

// A file after a first run, with its ledger.
async function built() {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const first = await call(mock);
  mock.log.length = 0;
  return { mock, first, ledger: ledgerAfter(first) };
}

test('an unrecorded same-name collection is a conflict, and nothing changes', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const owners = mock.figma.variables.createVariableCollection('Theme');
  owners.renameMode(owners.modes[0].modeId, 'Light');
  owners.addMode('Dark');
  mock.log.length = 0;
  const before = mock.snapshot();
  const result = await call(mock);
  assert.deepEqual(result.conflicts, [{ kind: 'collection', name: 'theme', reason: 'unowned', id: owners.id }]);
  assert.equal(result.summary.conflicts, 1);
  assert.equal(result.summary.created, 0);
  assert.deepEqual(mock.log, [], 'no writes, no page switch');
  assert.deepEqual(mock.snapshot(), before);
  assert.deepEqual(result.ledger, { foundations: null });
});

test('adopt takes over an unrecorded same-name collection; its extra modes are reported and kept', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const owners = mock.figma.variables.createVariableCollection('Theme');
  owners.renameMode(owners.modes[0].modeId, 'Light');
  owners.addMode('Dark');
  const result = await call(mock, { options: { adopt: true } });
  assert.deepEqual(result.conflicts, []);
  const theme = byName(mock.snapshot().collections, 'Theme');
  assert.equal(theme.id, owners.id);
  assert.deepEqual(theme.modes.map(m => m.name), ['White', 'Gray 10', 'Gray 90', 'Gray 100', 'Light', 'Dark']);
  assert.deepEqual(result.extraModes.map(m => [m.collection, m.name]), [['theme', 'Light'], ['theme', 'Dark']]);
  assert.equal(result.ledger.foundations.collections.theme.id, owners.id);
});

test('after a lost connection, a run without the ledger reports conflicts; adopt then reclaims every object without creating any', async () => {
  const { mock, first } = await built();
  const lost = await call(mock);
  assert.deepEqual(lost.conflicts.map(c => `${c.kind}:${c.name}`), [
    'collection:primitives', 'collection:theme', 'collection:layout', 'collection:type', 'textStyle:body-compact-01', 'textStyle:body-compact-02',
  ]);
  assert.deepEqual(mock.log, []);
  const adopted = await call(mock, { options: { adopt: true } });
  assert.equal(adopted.summary.created, 0);
  assert.equal(adopted.summary.conflicts, 0);
  assert.deepEqual(adopted.ledger.foundations.variables, first.ledger.foundations.variables);
  assert.deepEqual(adopted.ledger.foundations.collections, first.ledger.foundations.collections);
  assert.deepEqual(adopted.ledger.foundations.textStyles, first.ledger.foundations.textStyles);
});

test('an unrecorded same-name variable inside an owned collection is a conflict unless adopt', async () => {
  const { mock, ledger } = await built();
  const id = ledger.foundations.variables['spacing-05'];
  delete ledger.foundations.variables['spacing-05'];
  const result = await call(mock, { ledger });
  assert.deepEqual(result.conflicts, [{ kind: 'variable', name: 'spacing-05', reason: 'unowned', id }]);
  assert.deepEqual(mock.log, []);
  const adopted = await call(mock, { ledger, options: { adopt: true } });
  assert.equal(adopted.summary.created, 0);
  assert.equal(adopted.ledger.foundations.variables['spacing-05'], id);
});

test('a type change is a conflict, and nothing changes', async () => {
  const { mock, ledger } = await built();
  const docText = docWith(doc => { doc.variables['spacing-05'].type = 'STRING'; doc.variables['spacing-05'].values.default = { value: '16px' }; });
  const result = await call(mock, { docText, ledger });
  assert.deepEqual(result.conflicts, [{ kind: 'variable', name: 'spacing-05', reason: 'type-change', id: ledger.foundations.variables['spacing-05'] }]);
  assert.deepEqual(mock.log, []);
});

test('hand renames are reverted and a moved default mode is put back in order', async () => {
  const { mock, ledger } = await built();
  const f = ledger.foundations;
  const v = await mock.figma.variables.getVariableByIdAsync(f.variables['button-primary']);
  v.name = 'Button/primary (renamed)';
  const theme = await mock.figma.variables.getVariableCollectionByIdAsync(f.collections.theme.id);
  theme.name = 'Theme (old)';
  theme.renameMode(f.collections.theme.modes.g10, 'G10');
  theme.setDefaultMode(f.collections.theme.modes.g90);
  const style = await mock.figma.getStyleByIdAsync(f.textStyles['body-compact-02']);
  style.name = 'Body/renamed';
  mock.log.length = 0;
  const result = await call(mock, { ledger });
  assert.deepEqual(result.updated, {
    collections: { theme: ['name', 'mode:g10', 'modeOrder'] },
    variables: { 'button-primary': ['name'] },
    textStyles: { 'body-compact-02': ['name'] },
  });
  assert.equal(result.summary.updated, 3);
  const snap = mock.snapshot();
  assert.deepEqual(byName(snap.collections, 'Theme').modes.map(m => m.name), ['White', 'Gray 10', 'Gray 90', 'Gray 100']);
  assert.ok(byName(allVariables(mock), 'Button/button-primary'));
  assert.ok(byName(snap.textStyles, 'Body/body-compact-02'));
});

test('a changed value or an unbound Text Style field is written back', async () => {
  const { mock, ledger } = await built();
  const f = ledger.foundations;
  const spacing = await mock.figma.variables.getVariableByIdAsync(f.variables['spacing-05']);
  spacing.setValueForMode(f.collections.layout.modes.default, 15);
  const style = await mock.figma.getStyleByIdAsync(f.textStyles['body-compact-01']);
  style.setBoundVariable('fontSize', null);
  mock.log.length = 0;
  const result = await call(mock, { ledger });
  assert.deepEqual(result.updated.variables, { 'spacing-05': ['value:default'] });
  assert.deepEqual(result.updated.textStyles, { 'body-compact-01': ['bind:fontSize'] });
  assert.equal(byName(allVariables(mock), 'Spacing/spacing-05').values[0][1], 16);
});

test('a dropped token becomes an orphan that keeps its id, and gets the same id back when it returns', async () => {
  const { mock, ledger } = await built();
  const id = ledger.foundations.variables['spacing-13'];
  const dropped = docWith(doc => { delete doc.variables['spacing-13']; });
  const result = await call(mock, { docText: dropped, ledger });
  assert.deepEqual(result.orphaned, { variables: ['spacing-13'], textStyles: [] });
  assert.equal(result.summary.orphaned, 1);
  assert.deepEqual(result.ledger.foundations.orphans.variables, { 'spacing-13': { id, since: `sha256:${createHash('sha256').update(dropped).digest('hex')}` } });
  assert.equal(result.ledger.foundations.variables['spacing-13'], undefined);
  assert.ok(byName(allVariables(mock), 'Spacing/spacing-13'), 'an orphan is never deleted by a run');
  assert.deepEqual(writes(mock), []);

  const back = await call(mock, { ledger: ledgerAfter(result, ledger) });
  assert.deepEqual(back.restored, ['spacing-13']);
  assert.equal(back.summary.created, 0);
  assert.equal(back.ledger.foundations.variables['spacing-13'], id);
  assert.deepEqual(back.ledger.foundations.orphans, { variables: {}, textStyles: {} });
});

test('prune deletes only orphans the owner listed; a name still in the document is refused', async () => {
  const { mock, ledger } = await built();
  const dropped = docWith(doc => { delete doc.variables['spacing-13']; delete doc.variables['spacing-12']; });
  const orphanRun = await call(mock, { docText: dropped, ledger });
  const next = ledgerAfter(orphanRun, ledger);
  mock.log.length = 0;

  const refused = await call(mock, { docText: dropped, ledger: next, options: { prune: ['spacing-13', 'spacing-05'] } });
  assert.deepEqual(refused.conflicts, [{ kind: 'prune', name: 'spacing-05', reason: 'not-orphan' }]);
  assert.deepEqual(mock.log, []);

  const pruned = await call(mock, { docText: dropped, ledger: next, options: { prune: ['spacing-13'] } });
  assert.deepEqual(pruned.pruned, ['spacing-13']);
  assert.equal(byName(allVariables(mock), 'Spacing/spacing-13'), undefined);
  assert.ok(byName(allVariables(mock), 'Spacing/spacing-12'), 'an unlisted orphan stays');
  assert.deepEqual(Object.keys(pruned.ledger.foundations.orphans.variables), ['spacing-12']);
});

test('a package for another file changes nothing', async () => {
  const mock = mockFigma({ fileKey: 'SOMEOTHERFILE' });
  const result = await call(mock);
  assert.deepEqual(result, { error: 'wrong-file', expected: FILE_KEY, got: 'SOMEOTHERFILE' });
  assert.deepEqual(mock.log, []);
});

test('recording a result replaces the foundations section, keeps other sections and refuses a failed call', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const result = await call(mock);
  const ledger = recordResult({ schemaVersion: 1, fileKey: FILE_KEY, foundations: null, sets: { button: { id: '1:2' } } }, result);
  assert.deepEqual(ledger.sets, { button: { id: '1:2' } });
  assert.deepEqual(ledger.foundations, result.ledger.foundations);
  assert.throws(() => recordResult(ledger, { error: 'package-mismatch', field: 'plan' }), /package-mismatch/);
  assert.throws(() => recordResult({ ...ledger, fileKey: 'OTHER' }, result), /ledger is for OTHER/);
});

// ---- review-only fields ----

test('the package leaves out review-only fields, and the stripped document builds the same objects', async () => {
  const stripped = pack().plan.foundations;
  const full = pack({ strip: false }).plan.foundations;
  const text = JSON.stringify(stripped);
  for (const field of ['source', 'from', 'reason', 'level', 'usedBy', 'resolved', 'notes', 'checks', 'closure']) {
    assert.ok(!text.includes(`"${field}":`), `${field} stripped`);
    assert.ok(JSON.stringify(full).includes(`"${field}":`), `${field} present in the full document`);
  }
  const a = mockFigma({ fileKey: FILE_KEY });
  const b = mockFigma({ fileKey: FILE_KEY });
  const fromStripped = await call(a);
  const fromFull = await call(b, { strip: false });
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.deepEqual(fromStripped.ledger, fromFull.ledger);
  assert.ok(pack().out.chars < pack({ strip: false }).out.chars);
});

// ---- CLIs ----

test('the build-plan and ledger CLIs run from a path that contains a space', () => {
  // The scripts keep their place next to the shared Contract module they import.
  const base = join(realpathSync(mkdtempSync(join(tmpdir(), 'to-design-cli-'))), 'a space');
  const dir = join(base, 'skills/to-design/scripts');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(base, 'skills/contract/scripts'), { recursive: true });
  copyFileSync(new URL('../../contract/scripts/contract.mjs', import.meta.url), join(base, 'skills/contract/scripts/contract.mjs'));
  for (const name of ['build-plan.mjs', 'ledger.mjs']) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(dir, name));
  const plan = spawnSync('node', [join(dir, 'build-plan.mjs'), 'foundations', '--doc', fileURLToPath(DOC_PATH), '--file-key', FILE_KEY, '--out', join(dir, 'run')], { cwd: dir, encoding: 'utf8' });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).status, 'derived');
  assert.equal(JSON.parse(readFileSync(join(dir, 'run', 'plan.json'), 'utf8')).fileKey, FILE_KEY);
  const ledger = spawnSync('node', [join(dir, 'ledger.mjs')], { cwd: dir, encoding: 'utf8' });
  assert.equal(ledger.status, 2, 'usage error, so main() ran');
});
