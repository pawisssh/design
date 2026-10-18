// A rerun touches only the components whose code changed (#180). With no code change, folder.mjs writes nothing, the
// review page has nothing to show and the build derives no call. After one component's source changes, only its
// Contract is drafted again, the review page shows only it, the other approvals stay byte-unchanged, and the build
// updates only the variants that changed in its set, leaving the rest of the file (and the owner's edits) alone.
// Built on To-design's mock Figma, with a copy of the v0 project under .scratch/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, expand } from '../../contract/scripts/contract.mjs';
import { setsPlan } from '../../to-design/scripts/build-plan.mjs';
import { approveFolder } from '../scripts/approve.mjs';
import { baselined, gate, nextStep, pendingUpdate, variantFingerprints } from '../scripts/build.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { buildReview, reviewModel } from '../scripts/review.mjs';
import { AT, FILE_KEY, NARROW, drive, smokeDraft } from './drive.mjs';
import { READABLE, V0, read, scratch, selections, skip } from './helpers.mjs';

const { reviewExport } = createRequire(import.meta.url)('../assets/review-export.js');
const REVIEW = fileURLToPath(new URL('../scripts/review.mjs', import.meta.url));
const DRAFTS = fileURLToPath(new URL('../../adapter-generic/fixtures/drafts/', import.meta.url));
const drafts = Object.fromEntries(READABLE.map(f => [f, read(join(DRAFTS, `${f}.json`)).drafts]));
const contractPath = (dir, family) => join(dir, 'contracts', `${family}.component.json`);
const snapshot = dir => Object.fromEntries(['', 'contracts'].flatMap(sub => readdirSync(join(dir, sub)).filter(f => f.endsWith('.json')).map(f => [join(sub, f), readFileSync(join(dir, sub, f), 'utf8')])));
const RED = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1, visible: true, blendMode: 'NORMAL' }];
// The page's export, in node, for the families on it.
const exported = (dir, edits) => { const model = reviewModel(dir); const all = selections(dir, edits); return reviewExport(model, Object.fromEntries(model.families.map(f => [f.family, all[f.family]]))); };
// Input's disabled State at opacity 40 in place of 50: its two disabled variants change (invalid × state, indexes 2 and 5).
const fadeDisabled = file => writeFileSync(file, readFileSync(file, 'utf8').replace('disabled:opacity-50', 'disabled:opacity-40'));

/** A copy of the v0 project with its folder built, approved (Button narrowed) and built on the mock. */
async function builtProject() {
  const root = scratch();
  const project = join(root, 'project');
  cpSync(V0, project, { recursive: true });
  const { dir } = await buildFolder({ project, root: join(root, 'ds'), drafts });
  await approveFolder({ dir, project, exported: exported(dir, NARROW), said: 'approve', at: AT, test: true });
  const mock = smokeDraft();
  const first = await drive({ dir, mock, namespace: 'v0-app' });
  assert.equal(first.n.status, 'built', JSON.stringify(first.n));
  return { project, root: join(root, 'ds'), dir, mock, ledger: first.ledger, record: first.record };
}
// One built project for the tests that change neither it nor the mock.
let shared;
const sharedProject = () => (shared ??= builtProject());

test('a rerun with no code change reviews nothing and builds nothing', { skip }, async () => {
  const { project, root, dir, mock, ledger, record } = await sharedProject();
  const before = snapshot(dir);
  const r = await buildFolder({ project, root, drafts });
  assert.deepEqual([r.written, r.unchanged, r.foundations.written], [[], READABLE, false]);
  assert.deepEqual(snapshot(dir), before);
  const review = await buildReview({ dir, renderer: () => { throw new Error('no catalog is built'); } });
  assert.equal(review.html, null);
  assert.deepEqual(review.model.kept, READABLE);
  const cli = spawnSync(process.execPath, [REVIEW, dir, '--project', project, '--out', join(root, 'review.html')], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /^nothing to review: every Contract is approved \(alert, button, card, input, label, select, textarea\), so no page is written\nOK/);
  assert.ok(!readdirSync(root).includes('review.html'));
  const writes = mock.log.length;
  const again = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.equal(again.n.status, 'built');
  assert.deepEqual(again.steps, []);
  assert.equal(mock.log.length, writes);
});

test('after one component\'s code changes, only it is reviewed and only its changed variants are built', { skip }, async () => {
  const { project, root, dir, mock, ledger, record } = await builtProject();
  const before = snapshot(dir);
  const input = read(contractPath(dir, 'input'));
  const ids = ledger.sets.input.variants;
  // The owner's own edits in Figma, to a variant whose code did not change and to another family's.
  const touched = [ids[0], ledger.sets.label.variants[0]];
  for (const id of touched) (await mock.figma.getNodeByIdAsync(id)).fills = RED;

  fadeDisabled(join(project, 'components/ui/input.tsx'));
  const r = await buildFolder({ project, root, drafts });
  assert.deepEqual(r.written, ['input']);
  const after = snapshot(dir);
  for (const f of READABLE.filter(f => f !== 'input')) assert.equal(after[join('contracts', `${f}.component.json`)], before[join('contracts', `${f}.component.json`)], f);
  const redrafted = read(contractPath(dir, 'input'));
  assert.equal(redrafted.selection.status, 'draft');
  assert.notEqual(redrafted.source.snapshotId, input.source.snapshotId);

  // The review page holds the changed one alone; the others keep their approval.
  const model = reviewModel(dir);
  assert.deepEqual(model.families.map(f => f.family), ['input']);
  assert.deepEqual(model.kept, READABLE.filter(f => f !== 'input'));
  const cli = spawnSync(process.execPath, [REVIEW, dir, '--project', project, '--out', join(root, 'review.html')], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /: Foundations, then input 6 \(.* MB\); kept approved, not reviewed again: alert, button, card, label, select, textarea\n/);
  const page = JSON.parse(/<script type="application\/json" id="review">(.*?)<\/script>/s.exec(readFileSync(join(root, 'review.html'), 'utf8'))[1]);
  assert.deepEqual(page.tabs, ['foundations', 'input']);
  assert.deepEqual(Object.keys(page.catalogs), ['input']);

  const a = await approveFolder({ dir, project, exported: exported(dir), said: 'approve', at: AT, test: true });
  assert.deepEqual([a.approved, a.unchanged, a.kept], [['input'], [], READABLE.filter(f => f !== 'input')]);
  const approved = snapshot(dir);
  for (const f of READABLE.filter(f => f !== 'input')) assert.equal(approved[join('contracts', `${f}.component.json`)], before[join('contracts', `${f}.component.json`)], f);

  // The build: one Foundations call (the closure moved with input's snapshot) that writes nothing, then one call into
  // input's set with only its two changed variants, then input's coverage check. No other family is called.
  const { n, ledger: next, record: kept, steps } = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(steps.map(s => [s.step, s.family]), [['foundations', null], ['sets', 'input'], ...steps.filter(s => s.step === 'coverage').map(() => ['coverage', 'input'])]);
  assert.ok(steps.some(s => s.step === 'coverage'));
  const { created, updated, orphaned, pruned, conflicts } = steps[0].result.summary;
  assert.deepEqual({ created, updated, orphaned, pruned, conflicts }, { created: 0, updated: 0, orphaned: 0, pruned: 0, conflicts: 0 });
  assert.deepEqual(steps[0].writes, []);
  const update = steps[1];
  assert.equal(update.options.indexes, 2);
  assert.deepEqual(update.plan.selection.entries.map(e => e[0]), [2, 5]);
  assert.equal(kept.coverage.input.ok, true, JSON.stringify(kept.coverage.input.problems));
  // The same set and variants, the owner's edits kept, every other family's ledger record as it was.
  assert.equal(next.sets.input.set.id, ledger.sets.input.set.id);
  assert.deepEqual(next.sets.input.variants, ids);
  for (const id of touched) assert.deepEqual((await mock.figma.getNodeByIdAsync(id)).fills, RED, id);
  for (const f of READABLE.filter(f => f !== 'input')) assert.deepEqual(next.sets[f], ledger.sets[f], f);
  // The baseline follows the build, and a second rerun derives nothing.
  assert.equal(kept.built.input.contentHash, contentHash(read(contractPath(dir, 'input'))));
  const writes = mock.log.length;
  const again = await drive({ dir, mock, ledger: next, record: kept, namespace: 'v0-app' });
  assert.deepEqual([again.n.status, again.steps], ['built', []]);
  assert.equal(mock.log.length, writes);
});

test('a build record from before #180 gets its baseline from the coverage checks that passed, and no call', { skip }, async () => {
  const { dir, ledger, record } = await sharedProject();
  const legacy = { ...record };
  delete legacy.built;
  const n = nextStep({ dir, fileKey: FILE_KEY, ledger, record: legacy, namespace: 'v0-app', at: AT });
  assert.equal(n.status, 'built');
  assert.deepEqual(Object.keys(n.record.built).sort(), READABLE);
  assert.deepEqual(n.record.built, record.built);
  // No passing check of the Contract as it is, no baseline: the change is built as before #180.
  const failed = { ...legacy, coverage: { ...legacy.coverage, label: { ...legacy.coverage.label, ok: false } } };
  assert.ok(!('label' in nextStep({ dir, fileKey: FILE_KEY, ledger, record: failed, namespace: 'v0-app', at: AT }).record.built));
  // A baseline that is current already leaves the record as it is.
  const g = gate({ dir, fileKey: FILE_KEY, ledger });
  assert.equal(baselined(record, g, ledger), record);
});

test('pendingUpdate: no update without a baseline of the same set; a change of the set alone sends none of its variants', { skip }, async () => {
  const { dir, ledger, record } = await sharedProject();
  // The Contracts as the build takes them (a test approval as its prototype approval)
  const g = gate({ dir, fileKey: FILE_KEY, ledger });
  const contract = g.contracts.input;
  const built = record.built.input;
  assert.deepEqual(Object.keys(built.variants), variantFingerprints(contract).map(v => v.name));
  assert.equal(pendingUpdate(contract, ledger, built), null);
  assert.equal(pendingUpdate(contract, ledger, undefined), null);
  assert.equal(pendingUpdate(contract, ledger, { ...built, set: '9:9' }), null);
  assert.equal(pendingUpdate(contract, { ...ledger, sets: { ...ledger.sets, input: { ...ledger.sets.input, placed: false } } }, built), null);
  // A description is the set's, not a variant's: the update's one call sends no variant.
  const described = { ...contract, family: { ...contract.family, description: 'Edited' } };
  assert.notEqual(contentHash(described), contentHash(contract));
  assert.deepEqual(variantFingerprints(described), variantFingerprints(contract));
  assert.deepEqual(pendingUpdate(described, ledger, built), []);
  // Once that call is recorded (the ledger at the new Contract, every id kept), the update is done.
  const recorded = { ...ledger, sets: { ...ledger.sets, input: { ...ledger.sets.input, contentHash: contentHash(described) } } };
  assert.equal(pendingUpdate(described, recorded, built), null);
  // A variant with no id in the baseline is sent, as is one whose name is new.
  const names = Object.keys(built.variants);
  const holed = { ...built, variants: { ...built.variants, [names[1]]: [built.variants[names[1]][0], null] } };
  delete holed.variants[names[3]];
  assert.deepEqual(pendingUpdate(described, ledger, holed), [1, 3]);
  // An empty pick is a set-only call; indexes are refused anywhere but a build call into a placed set.
  const { docText } = g;
  const { plan } = setsPlan(contract, docText, ledger, { fileKey: FILE_KEY, mode: 'build', indexes: [], prototype: true, at: AT });
  assert.deepEqual([plan.selection.entries, plan.options.indexes, plan.options.of], [[], 0, 1]);
  const refuses = (opts, pattern, l = ledger) => assert.throws(() => setsPlan(contract, docText, l, { fileKey: FILE_KEY, prototype: true, at: AT, ...opts }), pattern);
  refuses({ mode: 'coverage', indexes: [0] }, /indexes pick a build call's variants themselves/);
  refuses({ mode: 'build', next: true, indexes: [0] }, /indexes pick a build call's variants themselves/);
  refuses({ mode: 'build', batch: 0, indexes: [0] }, /indexes pick a build call's variants themselves/);
  refuses({ mode: 'build', indexes: [expand(contract).length] }, /indexes must be expansion indexes 0\.\.5/);
  refuses({ mode: 'build', indexes: [-1] }, /indexes must be expansion indexes 0\.\.5/);
  refuses({ mode: 'build', indexes: [0] }, /indexes append into a placed set, and the input set is not combined yet/, { ...ledger, sets: { ...ledger.sets, input: undefined } });
  refuses({ mode: 'build', perCall: 4, indexes: [0, 1, 2, 3, 4] }, /5 indexes are above the 4 an append call of input takes: give them in calls of 4/);
});
