// A rerun touches only the components whose code changed (#180). With no code change, folder.mjs writes nothing, the
// review page has nothing to show and the build derives no call. After one component's source changes, only its
// Contract is drafted again, the review page shows only it, the other approvals stay byte-unchanged, and the build
// updates only the variants that changed in its set, leaving the rest of the file (and the owner's edits) alone.
// Built on To-design's mock Figma, with a copy of the v0 project under .scratch/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, expand, tupleKey } from '../../contract/scripts/contract.mjs';
import { setsPlan } from '../../to-design/scripts/build-plan.mjs';
import { approveFolder } from '../scripts/approve.mjs';
import { CORES, baselined, gate, nextStep, pendingUpdate, variantFingerprints } from '../scripts/build.mjs';
import { buildFolder, carryOmits } from '../scripts/folder.mjs';
import { buildReview, reviewModel } from '../scripts/review.mjs';
import { AT, FILE_KEY, RED, builtProject, drafts, drive, exported, fadeDisabled, pack } from './drive.mjs';
import { READABLE, contractPath, read, selections, skip, snapshot, v0Folder } from './helpers.mjs';

const REVIEW = fileURLToPath(new URL('../scripts/review.mjs', import.meta.url));
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
  assert.match(cli.stdout, /^nothing to review: every Contract is approved \(alert, button, card, input, label, select, textarea\) and so is the Foundations document, so no page is written\nOK/);
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

  // The build: one Foundations call (the closure moved with input's snapshot) that writes nothing, a read-only check of
  // the two changed variants (#181), then one call into input's set with only those two, then input's coverage check.
  // No other family is called.
  const { n, ledger: next, record: kept, steps } = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(n.conflicts, []);
  assert.deepEqual(steps.map(s => [s.step, s.family]), [['foundations', null], ['check', 'input'], ['sets', 'input'], ...steps.filter(s => s.step === 'coverage').map(() => ['coverage', 'input'])]);
  assert.ok(steps.some(s => s.step === 'coverage'));
  const { created, updated, orphaned, pruned, conflicts } = steps[0].result.summary;
  assert.deepEqual({ created, updated, orphaned, pruned, conflicts }, { created: 0, updated: 0, orphaned: 0, pruned: 0, conflicts: 0 });
  assert.deepEqual(steps[0].writes, []);
  assert.deepEqual(steps[1].writes, []);
  const update = steps[2];
  assert.equal(update.options.picked, 2);
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

test('a narrowed family drafted again keeps its narrowing: the review page shows it, and approve and the build keep it', { skip }, async () => {
  const { project, root, dir, mock, ledger, record } = await builtProject();
  const approved = read(contractPath(dir, 'button'));
  assert.equal(expand(approved).length, 48);
  const key = t => approved.axes.map(a => t[a.key]).join('|');
  // Button's disabled State at opacity 40 in place of 50: every axis and value stays.
  fadeDisabled(join(project, 'components/ui/button.tsx'));
  const r = await buildFolder({ project, root, drafts });
  assert.deepEqual([r.written, r.foundations.written], [['button'], true]);
  const redrafted = read(contractPath(dir, 'button'));
  assert.equal(redrafted.selection.status, 'draft');
  assert.notEqual(redrafted.source.snapshotId, approved.source.snapshotId);
  assert.deepEqual(expand(redrafted).map(key), expand(approved).map(key));
  assert.equal(redrafted.selection.expectedCount, 48);

  // The review page holds button alone, ticked as approved: the page's export, untouched, is the carried omit.
  assert.deepEqual(reviewModel(dir).families.map(f => f.family), ['button']);
  const page = selections(dir).button;
  assert.equal(page.patch.expectedCount, 48);
  assert.deepEqual(page.patch.omit, redrafted.selection.omit.map(o => o.match));

  // A plain approve keeps 48, and the Foundations document is the one the narrowed Contracts generate.
  const a = await approveFolder({ dir, project, exported: exported(dir), said: 'approve', at: AT, test: true });
  assert.deepEqual(a.approved, ['button']);
  assert.equal(expand(read(contractPath(dir, 'button'))).length, 48);
  const again = await buildFolder({ project, root, drafts });
  assert.deepEqual([again.written, again.foundations.written], [[], false]);

  // The build sends only Button's changed variants, its disabled ones, into the set: none of the omitted come back.
  const { n, ledger: next, record: kept, steps } = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.equal(n.status, 'built', JSON.stringify(n));
  const sets = steps.filter(s => s.step === 'sets');
  assert.ok(sets.length && sets.every(s => s.family === 'button'));
  const tuples = expand(read(contractPath(dir, 'button')));
  const sent = sets.flatMap(s => s.plan.selection.entries.map(e => tuples[e[0]]));
  assert.deepEqual(sent.map(t => t.state), Array(12).fill('disabled'));
  assert.deepEqual(next.sets.button.variants, ledger.sets.button.variants);
  assert.equal(kept.coverage.button.ok, true, JSON.stringify(kept.coverage.button.problems));
});

test('carryOmits matches by axis value: variants new to the redraft keep the Adapter\'s default ticks', { skip }, async () => {
  const { dir } = await v0Folder();
  const redraft = read(contractPath(dir, 'button'));
  const defaults = new Set(expand(redraft).map(t => tupleKey(redraft, t)));
  // The prior had no link Variant and no Expanded axis, and the owner omitted sizes xs and lg.
  const prior = structuredClone(redraft);
  prior.axes = prior.axes.filter(a => a.key !== 'expanded');
  prior.axes.find(a => a.key === 'variant').values = prior.axes.find(a => a.key === 'variant').values.filter(v => v.key !== 'link');
  prior.selection.omit = [{ match: { size: ['xs', 'lg'] } }];
  const carried = carryOmits(prior, redraft);
  assert.equal(carried.selection.status, 'draft');
  const kept = new Set(expand(carried).map(t => tupleKey(redraft, t)));
  for (const t of expand({ ...redraft, selection: { ...redraft.selection, omit: [] } })) {
    const id = tupleKey(redraft, t);
    const known = t.variant !== 'link' && t.expanded === 'collapsed';
    assert.equal(kept.has(id), defaults.has(id) && !(known && ['xs', 'lg'].includes(t.size)), id);
  }
  // The Adapter's own omits keep their reasons; a prior with only the Adapter's omits carries nothing.
  assert.ok(carried.selection.omit.some(o => o.reason));
  assert.equal(carryOmits(redraft, redraft), redraft);
});

test('a change undone before its update is checked is sent again: the update\'s writes leave the baseline', { skip }, async () => {
  const { project, root, dir, mock, ledger, record } = await builtProject();
  const file = join(project, 'components/ui/input.tsx');
  const source = readFileSync(file, 'utf8');
  const ids = ledger.sets.input.variants;
  const opacity = async () => (await mock.figma.getNodeByIdAsync(ids[2])).opacity;
  const was = await opacity();
  const rerun = async () => {
    await buildFolder({ project, root, drafts });
    await approveFolder({ dir, project, exported: exported(dir), said: 'approve', at: AT, test: true });
  };
  fadeDisabled(file);
  await rerun();
  // The update call is in, its coverage check not yet: the owner puts the code back.
  const half = await drive({ dir, mock, ledger, record, namespace: 'v0-app', until: s => s.step === 'sets' });
  assert.deepEqual(half.steps.at(-1).plan.selection.entries.map(e => e[0]), [2, 5]);
  assert.notEqual(await opacity(), was);
  writeFileSync(file, source);
  await rerun();
  const { n, ledger: next, record: kept, steps } = await drive({ dir, mock, ledger: half.ledger, record: half.record, namespace: 'v0-app' });
  assert.equal(n.status, 'built', JSON.stringify(n));
  const sent = steps.filter(s => s.step === 'sets');
  assert.deepEqual(sent.map(s => s.plan.selection.entries.map(e => e[0])), [[2, 5]]);
  assert.equal(await opacity(), was);
  assert.deepEqual(next.sets.input.variants, ids);
  assert.equal(kept.coverage.input.ok, true);
  assert.equal(kept.built.input.contentHash, contentHash(read(contractPath(dir, 'input'))));
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
  const { plan, state } = setsPlan(contract, docText, ledger, { fileKey: FILE_KEY, mode: 'build', indexes: [], prototype: true, at: AT });
  assert.deepEqual([plan.selection.entries, plan.options.picked, plan.options.of], [[], 0, 1]);
  // and To-design's packager takes it (it refuses any other plan that picks no variant)
  assert.match(pack(plan, state, CORES.sets), /build-components|figma/);
  const refuses = (opts, pattern, l = ledger) => assert.throws(() => setsPlan(contract, docText, l, { fileKey: FILE_KEY, prototype: true, at: AT, ...opts }), pattern);
  refuses({ mode: 'coverage', indexes: [0] }, /indexes pick a build call's variants themselves/);
  refuses({ mode: 'build', next: true, indexes: [0] }, /indexes pick a build call's variants themselves/);
  refuses({ mode: 'build', batch: 0, indexes: [0] }, /indexes pick a build call's variants themselves/);
  refuses({ mode: 'build', indexes: [expand(contract).length] }, /indexes must be expansion indexes 0\.\.5/);
  refuses({ mode: 'build', indexes: [-1] }, /indexes must be expansion indexes 0\.\.5/);
  refuses({ mode: 'build', indexes: [0] }, /indexes append into a placed set, and the input set is not combined yet/, { ...ledger, sets: { ...ledger.sets, input: undefined } });
  refuses({ mode: 'build', perCall: 4, indexes: [0, 1, 2, 3, 4] }, /5 indexes are above the 4 an append call of input takes: give them in calls of 4/);
});
