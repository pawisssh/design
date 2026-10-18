// Figma edits are never overwritten (#181). Before an update writes a variant that is in the set, a read-only check
// reads it back against the Contract it was built from. One the owner edited in Figma, or removed, is skipped and
// reported as a conflict, on every run until the owner resolves it per variant (--take-code or --keep-figma). An edit
// to a variant whose code did not change is never read and never reported. Built on To-design's mock Figma, with a
// copy of the v0 project under .scratch/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { contentHash } from '../../contract/scripts/contract.mjs';
import { approveFolder } from '../scripts/approve.mjs';
import { conflictsOf, gate, nextStep, parseResolve, readRecord, settled, variantFingerprints, writeRecord } from '../scripts/build.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { AT, FILE_KEY, RED, builtProject, drafts, drive, exported, fadeDisabled } from './drive.mjs';
import { contractPath, read, scratch, skip } from './helpers.mjs';

/** The built project, with input's source changed and the change approved, and a reader of the mock's nodes. */
async function changed(p, from, to) {
  fadeDisabled(join(p.project, 'components/ui/input.tsx'), from, to);
  await buildFolder({ project: p.project, root: p.root, drafts });
  await approveFolder({ dir: p.dir, project: p.project, exported: exported(p.dir), said: 'approve', at: AT, test: true });
}
const nodeOf = mock => id => mock.figma.getNodeByIdAsync(id);
const sentOf = steps => steps.filter(s => s.step === 'sets').map(s => s.plan.selection.entries.map(e => e[0]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
const readOf = steps => steps.filter(s => s.step === 'check').map(s => s.plan.selection.entries.map(e => e[0]));

test('a variant edited in Figma whose code changed is left as it is and reported; the rest of the update goes in', { skip }, async () => {
  const p = await builtProject();
  const { dir, mock, ledger, record } = p;
  const node = nodeOf(mock);
  const ids = ledger.sets.input.variants;
  const names = variantFingerprints(gate({ dir, fileKey: FILE_KEY, ledger }).contracts.input).map(v => v.name);
  // The owner's edits in Figma: index 2, whose code is about to change; index 0, whose code is not; a label variant.
  for (const id of [ids[2], ids[0], ledger.sets.label.variants[0]]) (await node(id)).fills = RED;
  const was = (await node(ids[2])).opacity;

  await changed(p, 50, 40);
  const r = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.equal(r.n.status, 'built', JSON.stringify(r.n));
  // Both changed variants are read back, nothing written by the read; only index 5 is sent.
  assert.deepEqual(r.steps.map(s => s.step).filter(s => s !== 'coverage'), ['foundations', 'check', 'sets']);
  assert.deepEqual(readOf(r.steps), [[2, 5]]);
  assert.deepEqual(r.steps[1].writes, []);
  assert.deepEqual(sentOf(r.steps), [[5]]);
  assert.deepEqual(r.n.conflicts.map(c => [c.family, c.variant, c.reason]), [['input', names[2], 'edited']]);
  assert.deepEqual(r.n.conflicts[0].changes, ['paint.Input.fill']);
  // The edited variant is as the owner left it, at its old opacity; the unedited one updated; the other edits kept.
  assert.deepEqual((await node(ids[2])).fills, RED);
  assert.equal((await node(ids[2])).opacity, was);
  near((await node(ids[5])).opacity, 0.4);
  assert.deepEqual((await node(ids[0])).fills, RED);
  assert.deepEqual((await node(ledger.sets.label.variants[0])).fills, RED);
  assert.deepEqual(r.ledger.sets.input.variants, ids);
  // The coverage check passes with the conflict in the set as Figma has it; the baseline takes the new Contract but
  // keeps the conflict at its old fingerprint, and the Contract it was built from.
  assert.equal(r.record.coverage.input.ok, true, JSON.stringify(r.record.coverage.input.problems));
  const built = r.record.built.input;
  assert.equal(built.contentHash, contentHash(read(contractPath(dir, 'input'))));
  assert.deepEqual(built.variants[names[2]], record.built.input.variants[names[2]]);
  assert.equal(built.conflicts[names[2]].contract, record.built.input.contract);
  assert.deepEqual(Object.keys(r.record.contracts).sort(), [...new Set(Object.values(r.record.built).flatMap(b => [b.contract, ...Object.values(b.conflicts || {}).map(c => c.contract)]))].sort());

  // A rerun with no change sends nothing and still reports the conflict.
  const writes = mock.log.length;
  const again = await drive({ dir, mock, ledger: r.ledger, record: r.record, namespace: 'v0-app' });
  assert.deepEqual([again.n.status, again.steps], ['built', []]);
  assert.deepEqual(again.n.conflicts, r.n.conflicts);
  assert.equal(mock.log.length, writes);

  // Another change: the conflict is read back against the Contract it was built from, the other against the baseline's.
  // It is still edited, so it stays a conflict; index 5 updates again.
  await changed(p, 40, 30);
  const third = await drive({ dir, mock, ledger: r.ledger, record: r.record, namespace: 'v0-app' });
  assert.equal(third.n.status, 'built', JSON.stringify(third.n));
  assert.deepEqual(readOf(third.steps), [[2], [5]]);
  assert.deepEqual(sentOf(third.steps), [[5]]);
  assert.deepEqual(third.n.conflicts.map(c => c.variant), [names[2]]);
  assert.deepEqual((await node(ids[2])).fills, RED);
  near((await node(ids[5])).opacity, 0.3);

  // The owner takes the code's version of it: it alone is written, and the conflict is gone.
  const said = nextStep({ dir, fileKey: FILE_KEY, ledger: third.ledger, record: third.record, namespace: 'v0-app', at: AT, resolve: parseResolve([`input:${names[2]}`]) });
  assert.deepEqual(said.record.built.input.take, [names[2]]);
  assert.deepEqual(said.plan.selection.entries.map(e => e[0]), [2]);
  const taken = await drive({ dir, mock, ledger: third.ledger, record: said.record, namespace: 'v0-app' });
  assert.equal(taken.n.status, 'built', JSON.stringify(taken.n));
  assert.deepEqual(sentOf(taken.steps), [[2]]);
  assert.deepEqual(readOf(taken.steps), []);
  assert.deepEqual(taken.n.conflicts, []);
  assert.notDeepEqual((await node(ids[2])).fills, RED);
  near((await node(ids[2])).opacity, 0.3);
  assert.deepEqual(taken.ledger.sets.input.variants, ids);
  assert.ok(!('take' in taken.record.built.input) && !('conflicts' in taken.record.built.input));
  assert.deepEqual((await node(ids[0])).fills, RED);
});

test('--keep-figma keeps the edit and builds the code change elsewhere; a variant removed in Figma is a conflict too', { skip }, async () => {
  const p = await builtProject();
  const { dir, mock, ledger, record } = p;
  const node = nodeOf(mock);
  const ids = ledger.sets.input.variants;
  const names = variantFingerprints(gate({ dir, fileKey: FILE_KEY, ledger }).contracts.input).map(v => v.name);
  (await node(ids[2])).fills = RED;
  (await node(ids[5])).remove();

  await changed(p, 50, 40);
  const r = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.equal(r.n.status, 'built', JSON.stringify(r.n));
  // Neither is written: the update is one call for the set alone, and the removed variant is not built again.
  assert.deepEqual(sentOf(r.steps), [[]]);
  assert.deepEqual(r.n.conflicts.map(c => [c.variant, c.reason]), [[names[2], 'edited'], [names[5], 'missing']]);
  assert.equal(await node(ids[5]), null);
  assert.ok(!(await node(ledger.sets.input.set.id)).children.some(k => k.name === names[5]));
  assert.equal(r.record.coverage.input.ok, true, JSON.stringify(r.record.coverage.input.problems));

  const opts = { dir, fileKey: FILE_KEY, ledger: r.ledger, record: r.record, namespace: 'v0-app', at: AT };
  assert.throws(() => nextStep({ ...opts, resolve: parseResolve([], [`input:${names[5]}`]) }), /is gone from the set in Figma: to keep it out, untick it on the review page/);
  assert.throws(() => nextStep({ ...opts, resolve: parseResolve([], [`input:${names[0]}`]) }), /input:Invalid=Valid, State=Enabled is no conflict here \(conflicts: input:Invalid=Valid, State=Disabled; input:Invalid=Invalid, State=Disabled\)/);
  assert.throws(() => parseResolve(['input']), /--take-code input: give <family>:<variant name>/);

  // Kept as Figma has it: the baseline takes the code's fingerprint, so nothing is sent for it now.
  const kept = nextStep({ ...opts, resolve: parseResolve([], [`input:${names[2]}`]) });
  assert.equal(kept.status, 'built');
  assert.deepEqual(kept.conflicts.map(c => c.variant), [names[5]]);
  assert.equal(kept.record.built.input.variants[names[2]][0], variantFingerprints(gate({ dir, fileKey: FILE_KEY, ledger }).contracts.input)[2].fingerprint);
  const writes = mock.log.length;
  const after = await drive({ dir, mock, ledger: r.ledger, record: kept.record, namespace: 'v0-app' });
  assert.deepEqual(after.steps, []);
  assert.equal(mock.log.length, writes);
  assert.deepEqual((await node(ids[2])).fills, RED);

  // Its code changes again: it is read back against today's Contract, still differs from it, and is a conflict again.
  await changed(p, 40, 30);
  const again = await drive({ dir, mock, ledger: after.ledger, record: after.record, namespace: 'v0-app' });
  assert.equal(again.n.status, 'built', JSON.stringify(again.n));
  assert.deepEqual(again.n.conflicts.map(c => [c.variant, c.reason]), [[names[2], 'edited'], [names[5], 'missing']]);
  assert.deepEqual((await node(ids[2])).fills, RED);
});

test('--take-code builds a variant removed in Figma again; a conflict whose code goes back, or that is unticked, is not reported', { skip }, async () => {
  const p = await builtProject();
  const { dir, mock, ledger, record } = p;
  const node = nodeOf(mock);
  const ids = ledger.sets.input.variants;
  const names = variantFingerprints(gate({ dir, fileKey: FILE_KEY, ledger }).contracts.input).map(v => v.name);
  (await node(ids[2])).fills = RED;
  (await node(ids[5])).remove();
  await changed(p, 50, 40);
  const r = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.deepEqual(r.n.conflicts.map(c => [c.variant, c.reason]), [[names[2], 'edited'], [names[5], 'missing']]);

  // The removed variant is made again under a new id, once: the take ends with its write.
  const said = nextStep({ dir, fileKey: FILE_KEY, ledger: r.ledger, record: r.record, namespace: 'v0-app', at: AT, resolve: parseResolve([`input:${names[5]}`]) });
  const taken = await drive({ dir, mock, ledger: r.ledger, record: said.record, namespace: 'v0-app' });
  assert.equal(taken.n.status, 'built', JSON.stringify(taken.n));
  assert.deepEqual(sentOf(taken.steps), [[5]]);
  assert.notEqual(taken.ledger.sets.input.variants[5], ids[5]);
  near((await node(taken.ledger.sets.input.variants[5])).opacity, 0.4);
  assert.equal(taken.record.coverage.input.ok, true, JSON.stringify(taken.record.coverage.input.problems));
  assert.deepEqual(taken.n.conflicts.map(c => c.variant), [names[2]]);
  assert.ok(!('take' in taken.record.built.input));

  // The code goes back to what the edited variant was built from: its edit is one of a variant whose code did not
  // change, so it is neither read nor reported; the other changed variants are updated as ever.
  await changed(p, 40, 50);
  const back = await drive({ dir, mock, ledger: taken.ledger, record: taken.record, namespace: 'v0-app' });
  assert.equal(back.n.status, 'built', JSON.stringify(back.n));
  assert.deepEqual(back.n.conflicts, []);
  assert.ok(!readOf(back.steps).flat().includes(2) && !sentOf(back.steps).flat().includes(2));
  assert.ok(sentOf(back.steps).flat().includes(5));
  assert.deepEqual((await node(ids[2])).fills, RED);

  // A conflict on a variant the Contract no longer expands (unticked on the review page) goes, and so does its take.
  const g = gate({ dir, fileKey: FILE_KEY, ledger: back.ledger });
  const input = { ...back.record.built.input, conflicts: { 'Gone=Yes': { reason: 'edited', fingerprint: 'sha256:00', contract: null, at: AT } }, take: ['Gone=Yes'] };
  const out = settled({ ...back.record, built: { ...back.record.built, input } }, g);
  assert.deepEqual(conflictsOf(out), []);
  assert.ok(!('take' in out.built.input) && !('conflicts' in out.built.input));
});

test('a baseline from before #181 gets its Contract on a run with no change; mid-update, its variants are not written over', { skip }, async () => {
  const p = await builtProject();
  const { dir, mock, ledger, record } = p;
  const node = nodeOf(mock);
  const legacy = { ...record, built: Object.fromEntries(Object.entries(record.built).map(([f, { contract, ...b }]) => [f, b])) };
  delete legacy.contracts;
  const upgraded = nextStep({ dir, fileKey: FILE_KEY, ledger, record: legacy, namespace: 'v0-app', at: AT });
  assert.equal(upgraded.status, 'built');
  assert.deepEqual(upgraded.record.built, record.built);
  assert.deepEqual(upgraded.record.contracts, record.contracts);

  // The code changed before the upgrade: no Contract to read the changed variants against, so neither is written.
  const ids = ledger.sets.input.variants;
  const was = (await node(ids[5])).opacity;
  await changed(p, 50, 40);
  const r = await drive({ dir, mock, ledger, record: legacy, namespace: 'v0-app' });
  assert.equal(r.n.status, 'built', JSON.stringify(r.n));
  assert.deepEqual(readOf(r.steps), []);
  assert.deepEqual(sentOf(r.steps), [[]]);
  assert.deepEqual(r.n.conflicts.map(c => c.reason), ['unchecked', 'unchecked']);
  assert.match(r.n.conflicts[0].changes[0], /keeps no Contract this variant was built from \(built before #181\)/);
  assert.equal((await node(ids[5])).opacity, was);
});

test('the build record keeps its Contracts as files beside it, and drops one no baseline needs', async () => {
  const dir = scratch();
  const file = join(dir, 'X.v0-app.build.json');
  assert.deepEqual(readRecord(file), {});
  const c = { family: { key: 'input' }, n: 1 };
  const record = { namespace: 'v0-app', built: { input: { contract: 'sha256:aa', variants: {} } }, contracts: { 'sha256:aa': c } };
  writeRecord(file, record);
  assert.deepEqual(read(file).contracts, ['sha256:aa']);
  assert.deepEqual(readdirSync(join(dir, 'X.v0-app.build.contracts')), ['aa.json']);
  assert.deepEqual(readRecord(file), record);
  writeRecord(file, { ...record, contracts: { 'sha256:bb': c } });
  assert.deepEqual(readdirSync(join(dir, 'X.v0-app.build.contracts')), ['bb.json']);
  writeRecord(file, { namespace: 'v0-app' });
  assert.ok(!('contracts' in read(file)));
  assert.ok(existsSync(join(dir, 'X.v0-app.build.contracts')));
  assert.deepEqual(readdirSync(join(dir, 'X.v0-app.build.contracts')), []);
});
