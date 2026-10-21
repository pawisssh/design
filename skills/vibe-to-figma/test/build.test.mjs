// The Figma build after approval (#179): the gate (nothing before the owner's approve, the linked file only, a set
// above MAX_COMBINE put to the owner) and the plan, driven end to end on To-design's mock Figma: Foundations, each
// approved Component Set by B′, then each set's paged coverage check. Tests approve only under .scratch/ with the
// test approver, which the build takes as a prototype approval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expand } from '../../contract/scripts/contract.mjs';
import { mergeCoverage } from '../../to-design/scripts/coverage.mjs';
import { mockFigma } from '../../to-design/tests/mock-figma.mjs';
import { REPO_ROOT } from '../../to-handoff/scripts/system.mjs';
import { approveFolder } from '../scripts/approve.mjs';
import { fileKeyOf, gate, namespaced, nextStep, recordStep } from '../scripts/build.mjs';
import { reviewModel } from '../scripts/review.mjs';
import { AT, FILE_KEY, NARROW, URL_, drive, smokeDraft } from './drive.mjs';
import { READABLE, V0, packageSkip, read, scratch, selections, skip, v0Folder } from './helpers.mjs';

const { reviewExport } = createRequire(import.meta.url)('../assets/review-export.js');
const BUILD = fileURLToPath(new URL('../scripts/build.mjs', import.meta.url));
async function approvedFolder(said = 'approve') {
  const { dir } = await v0Folder();
  await approveFolder({ dir, project: V0, exported: reviewExport(reviewModel(dir), selections(dir, NARROW)), said, at: AT, test: true });
  return dir;
}

test('only a Figma Design file link is a build target', () => {
  assert.equal(fileKeyOf(URL_), FILE_KEY);
  assert.equal(fileKeyOf('https://figma.com/design/Alpt8YsrzDVu6DnwsrF26h'), 'Alpt8YsrzDVu6DnwsrF26h');
  for (const url of ['', 'Alpt8YsrzDVu6DnwsrF26h', 'https://www.figma.com/board/Alpt8YsrzDVu6DnwsrF26h/x', 'https://www.figma.com/make/Alpt8YsrzDVu6DnwsrF26h/x',
    'https://evil.example/design/Alpt8YsrzDVu6DnwsrF26h', 'https://www.figma.com/design/Alpt8YsrzDVu6DnwsrF26h/branch/BRANCHKEY0000000000000/x'])
    assert.throws(() => fileKeyOf(url), /is not a Figma Design file link|is a branch/, url);
});

test('before approval nothing is derived: the run says why and writes nothing', { skip }, async () => {
  const { dir } = await v0Folder();
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY }), /nothing in .* is approved, so nothing is written to Figma/);
  const tmp = scratch();
  const run = spawnSync(process.execPath, [BUILD, 'next', dir, URL_, '--out', join(tmp, 'run'), '--ledger', join(tmp, 'ledger.json')], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /nothing in .* is approved, so nothing is written to Figma: show the owner the review page/);
  assert.ok(!existsSync(join(tmp, 'run')) && !existsSync(join(tmp, 'ledger.json')) && !existsSync(join(tmp, 'ledger.build.json')));
});

test('after "approve", Foundations then every Component Set by B′, each passing its paged coverage check', { skip }, async () => {
  const dir = await approvedFolder();
  const mock = smokeDraft();
  // On a file whose collections and Templates page another ledger owns, the plain build stops before any change.
  const plain = await drive({ dir, mock });
  assert.equal(plain.n.status, 'conflicts');
  assert.deepEqual(plain.n.conflicts.map(c => [c.kind, c.reason]), [['collection', 'unowned'], ['collection', 'unowned']]);
  assert.ok(!plain.ledger.foundations);
  assert.ok(!('namespace' in plain.record));
  assert.ok(!('foundations' in plain.record));
  // In its own namespace it builds, on from the conflict.
  const { n, ledger, record, steps } = await drive({ dir, mock, ledger: plain.ledger, record: plain.record, namespace: 'v0-app', coveragePerCall: 4 });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(n.families.map(f => f.family), READABLE);
  assert.deepEqual(n.drafts, []);
  assert.equal(ledger.foundations.designSystem, 'v0-app');
  // The record keeps the Foundations document the ledger was built from.
  assert.equal(record.foundations, readFileSync(join(dir, 'v0-app.foundations.json'), 'utf8'));
  const names = (await mock.figma.variables.getLocalVariableCollectionsAsync()).map(c => c.name).sort();
  assert.deepEqual(names, ['Layout', 'Theme', 'v0-app Layout', 'v0-app Theme']);
  assert.ok(mock.figma.root.children.some(p => p.name === 'v0-app Templates'));
  // The order: Foundations, then each family's loose batches, combine and place calls, then the coverage pages.
  const kinds = steps.map(s => s.step);
  assert.equal(kinds[0], 'foundations');
  assert.ok(kinds.lastIndexOf('foundations') < kinds.indexOf('sets') && kinds.lastIndexOf('sets') < kinds.indexOf('coverage'));
  for (const f of READABLE) {
    const c = read(join(dir, 'contracts', `${f}.component.json`));
    const total = expand(c).length;
    const phases = steps.filter(s => s.step === 'sets' && s.family === f).map(s => s.options.mode === 'build' ? s.options.phase : s.options.mode);
    assert.deepEqual([...new Set(phases)], ['loose', 'combine', 'place'], f);
    assert.equal(steps.filter(s => s.step === 'coverage' && s.family === f).length, Math.ceil(total / 4), f);
    assert.equal(record.coverage[f].ok, true, `${f}: ${JSON.stringify(record.coverage[f].problems)}`);
    assert.equal(record.coverage[f].read, total, f);
    assert.equal(ledger.sets[f].variants.filter(Boolean).length, total, f);
  }
  assert.equal(expand(read(join(dir, 'contracts/button.component.json'))).length, 48);
  // A rerun derives nothing: the build is done, and Figma is not called again.
  assert.equal(nextStep({ dir, fileKey: FILE_KEY, ledger, record, namespace: 'v0-app', at: AT }).status, 'built');
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, ledger, record, namespace: null, at: AT }), /built with --namespace "v0-app"/);
  assert.throws(() => recordStep({ dir, fileKey: FILE_KEY, ledger, record, result: steps.at(-1).result, at: AT }), /built with --namespace "v0-app"/);
});

test('a set that fails its coverage check stops the run until --rebuild builds it again in place', { skip }, async () => {
  const dir = await approvedFolder();
  const mock = smokeDraft();
  const opts = { dir, mock, namespace: 'v0-app', coveragePerCall: 4 };
  let { ledger, record } = await drive(opts);
  // As the smoke draft's Label was (#179): its text layer renamed after its characters, so the Text property wires nothing.
  const page = mock.figma.root.children.find(p => p.name === 'Label');
  const set = page.findOne(n => n.type === 'COMPONENT_SET');
  const text = set.findOne(n => n.type === 'TEXT');
  text.componentPropertyReferences = {};
  text.name = 'Label';
  const { label: _, ...coverage } = record.coverage;
  const failed = await drive({ ...opts, ledger, record: { ...record, coverage } });
  assert.equal(failed.n.status, 'problems');
  assert.equal(failed.n.family, 'label');
  assert.deepEqual(failed.n.problems.map(p => p.what), ['wiring']);
  // Still stopped on a rerun; an unknown family is refused.
  assert.equal(nextStep({ dir, fileKey: FILE_KEY, ledger: failed.ledger, record: failed.record, namespace: 'v0-app', at: AT }).status, 'problems');
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, ledger: failed.ledger, record: failed.record, namespace: 'v0-app', rebuild: ['sonner'], at: AT }), /--rebuild sonner: not an approved family/);
  // Only a build batch into the set its current verdict failed starts a rebuild; after a Contract change it is an update.
  const append = { slice: 'sets', mode: 'build', phase: 'append', fileKey: FILE_KEY, family: 'label', batch: [0, 2], conflicts: [], ledger: { sets: { label: failed.ledger.sets.label } } };
  const into = record => recordStep({ dir, fileKey: FILE_KEY, ledger: failed.ledger, record, result: append, namespace: 'v0-app', at: AT }).record.rebuild;
  assert.deepEqual(into(failed.record), { label: [0] });
  assert.equal(into({ ...failed.record, coverage: { ...failed.record.coverage, label: { ...failed.record.coverage.label, contentHash: 'sha256:before' } } }), undefined);
  const fixed = await drive({ ...opts, ledger: failed.ledger, record: failed.record, rebuild: ['label', 'button'] });
  assert.equal(fixed.n.status, 'built', JSON.stringify(fixed.n));
  // Only the failed set is built again, inside its set (same set id), then read again.
  assert.deepEqual(fixed.steps.map(s => [s.step, s.family, s.options.phase || s.options.mode]), [['sets', 'label', 'append'], ['coverage', 'label', 'coverage']]);
  assert.equal(fixed.ledger.sets.label.set.id, set.id);
  assert.equal(fixed.record.coverage.label.ok, true);
  assert.deepEqual(fixed.record.rebuild, {});
  assert.equal(set.findOne(n => n.type === 'TEXT').name, 'Text');
  // Done: --rebuild of a set that passes derives nothing.
  assert.equal(nextStep({ dir, fileKey: FILE_KEY, ledger: fixed.ledger, record: fixed.record, namespace: 'v0-app', rebuild: ['label'], at: AT }).status, 'built');
});

test('"approve except select" builds every family but select, and names it a draft', { skip }, async () => {
  const dir = await approvedFolder('approve except select');
  const g = gate({ dir, fileKey: FILE_KEY });
  assert.deepEqual(g.drafts, ['select']);
  assert.deepEqual(g.families, READABLE.filter(f => f !== 'select'));
  const mock = mockFigma({ fileKey: FILE_KEY });
  const { n, steps } = await drive({ dir, mock });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(n.drafts, ['select']);
  assert.ok(!steps.some(s => s.family === 'select'));
  assert.ok(!mock.figma.root.children.some(p => p.name === 'Select'));
});

test('a set above MAX_COMBINE stops the run before any write, until the owner narrows it or skips it', { skip }, async () => {
  const dir = await approvedFolder();
  const ask = nextStep({ dir, fileKey: FILE_KEY, maxCombine: 40 });
  assert.equal(ask.status, 'ask');
  assert.deepEqual(ask.ask, [{ family: 'button', total: 48 }]);
  // Skipped on the owner's word, Button is left out of the gate to the end, even where it would not pass it.
  const button = join(dir, 'contracts/button.component.json');
  const approved = readFileSync(button, 'utf8');
  writeFileSync(button, JSON.stringify({ ...JSON.parse(approved), source: { ...JSON.parse(approved).source, snapshotId: 'sha256:elsewhere' } }));
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY }), /cannot build [^]*\n- button /);
  const mock = mockFigma({ fileKey: FILE_KEY });
  const { n } = await drive({ dir, mock, maxCombine: 40, skip: ['button'] });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(n.skipped, ['button']);
  assert.ok(!n.families.some(f => f.family === 'button'));
  writeFileSync(button, approved);
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, skip: ['sonner'] }), /--skip sonner: sonner is not an approved Contract here/);
});

test('under MAX_COMBINE the CLI derives and packages the first call, Foundations', { skip: packageSkip }, async () => {
  const dir = await approvedFolder();
  const tmp = scratch();
  const run = spawnSync(process.execPath, [BUILD, 'next', dir, URL_, '--out', join(tmp, 'run'), '--ledger', join(tmp, 'ledger.json')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).step, 'foundations');
  assert.ok(existsSync(join(tmp, 'run/build-components.mcp.js')));
});

test('a package the packager refuses stops the CLI with the packager\'s own reason', { skip }, async () => {
  const dir = await approvedFolder();
  const tmp = scratch(), out = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-to-figma-out-')));
  try {
    const run = spawnSync(process.execPath, [BUILD, 'next', dir, URL_, '--out', out, '--ledger', join(tmp, 'ledger.json')],
      { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT } });
    assert.equal(run.status, 1, run.stdout);
    assert.match(run.stderr, /^FAIL: the packager refused: Package path must be inside the (main working tree|project dir) /);
    assert.ok(!existsSync(join(out, 'build-components.mcp.js')));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('only the linked file and this Design System\'s own ledger are built into', { skip }, async () => {
  const dir = await approvedFolder();
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, ledger: { schemaVersion: 1, fileKey: 'OTHERFILEKEY000000000000', foundations: null, sets: {} } }), /the ledger is for OTHERFILEKEY/);
  const carbon = { schemaVersion: 1, fileKey: FILE_KEY, foundations: { designSystem: 'carbon', documentHash: 'sha256:x' }, sets: {} };
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, ledger: carbon }), /the ledger holds carbon's Foundations, not v0-app's/);
  // A test approval builds only under .scratch/: the same folder elsewhere is refused.
  const elsewhere = join(realpathSync(mkdtempSync(join(tmpdir(), 'vibe-to-figma-'))), 'v0-app');
  cpSync(dir, elsewhere, { recursive: true });
  assert.throws(() => nextStep({ dir: elsewhere, fileKey: FILE_KEY }), /approved by "test \(\.scratch\)", which builds only under/);
});

test('a namespace renames only the plan\'s collections and Templates page', () => {
  const plan = { foundations: { collections: [{ key: 'theme', name: 'Theme' }] }, templates: { page: 'Templates' }, documentHash: 'sha256:x' };
  assert.deepEqual(namespaced(plan, 'v0-app'), { foundations: { collections: [{ key: 'theme', name: 'v0-app Theme' }] }, templates: { page: 'v0-app Templates' }, documentHash: 'sha256:x' });
  assert.equal(namespaced(plan, null), plan);
});

test('coverage pages merge only as one whole read of one set', () => {
  const page = (b, of, rows, extra = {}) => ({ slice: 'sets', mode: 'coverage', fileKey: 'K', family: 'f', batch: [b, of], set: { id: '1:1' }, summary: { variants: rows.length, children: 3 }, dict: ['A=x', 'A=y', '{}'], rows, ...extra });
  const merged = mergeCoverage([page(1, 2, [[[1], 2, 0, 1, 1]]), page(0, 2, [[[0], 2, 0, 0, 1]])]);
  assert.deepEqual(merged.rows.map(r => r[0].map(i => merged.dict[i])), [['A=x'], ['A=y']]);
  assert.equal(merged.summary.variants, 2);
  assert.ok(!('batch' in merged));
  assert.throws(() => mergeCoverage([page(0, 2, [])]), /pages 1 of 2 are not read yet/);
  assert.throws(() => mergeCoverage([page(0, 2, []), page(1, 2, [], { set: { id: '2:2' } })]), /the set changed between pages/);
  assert.throws(() => mergeCoverage([page(0, 2, []), page(0, 2, [])]), /page 0 is given twice/);
});
