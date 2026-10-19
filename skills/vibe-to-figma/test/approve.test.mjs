// The one approve (#177): "approve" or "approve except <family>" reads the review's combined export, applies each
// family's omit and approves the Contracts against the Foundations document the page showed, in one act, then
// generates that document again from them. Tests approve only under .scratch/ with the test approver; they never
// approve a committed file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { generate } from '../../to-handoff/scripts/generate.mjs';
import { TEST_APPROVER } from '../../to-handoff/scripts/system.mjs';
import { approveFolder, parseApproval } from '../scripts/approve.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { reviewModel } from '../scripts/review.mjs';
import { READABLE, V0, contractPath, read, selections, skip, snapshot, v0Folder } from './helpers.mjs';

const { reviewExport } = createRequire(import.meta.url)('../assets/review-export.js');
const AT = '2026-10-18T00:00:00Z';
// The page's export, in node: every catalog rendered, then the owner's unticks.
const exported = (dir, edits) => reviewExport(reviewModel(dir), selections(dir, edits));

test('the owner\'s message: "approve", or "approve except" one or more families', () => {
  assert.deepEqual(parseApproval('approve', READABLE), { except: [] });
  assert.deepEqual(parseApproval('  Approve ', READABLE), { except: [] });
  assert.deepEqual(parseApproval('approve except select', READABLE), { except: ['select'] });
  assert.deepEqual(parseApproval('approve except select, card and alert', READABLE), { except: ['alert', 'card', 'select'] });
  for (const said of ['', 'looks good', 'approve select', 'approved', 'approve except', 'please approve'])
    assert.throws(() => parseApproval(said, READABLE), /is not "approve" or "approve except <family>"/, said);
  assert.throws(() => parseApproval('approve except sonner', READABLE), /sonner has no Contract here/);
});

test('"approve" applies every family\'s omit, approves every Contract and narrows the Foundations closure to them', { skip }, async () => {
  const { dir } = await v0Folder();
  const before = snapshot(dir);
  const review = exported(dir, { button: m => m.selectMatching({ size: 'xs' }, false) });
  const r = await approveFolder({ dir, project: V0, exported: review, said: 'approve', at: AT, test: true });
  assert.deepEqual(r.approved, READABLE);
  assert.deepEqual(r.drafts, []);
  assert.equal(r.foundations.reviewed, review.documentHash);
  assert.equal(r.foundations.written, true);
  const text = readFileSync(join(dir, 'v0-app.foundations.json'), 'utf8');
  assert.equal(r.foundations.documentHash, `sha256:${contractModule.sha256(text)}`);
  // Only button used text-xs-medium, and only at size xs: the closure is the approved Contracts' own, so it goes.
  const foundations = JSON.parse(text), was = JSON.parse(before['v0-app.foundations.json']);
  const union = new Set(READABLE.flatMap(f => contractModule.closure(read(contractPath(dir, f)))));
  assert.deepEqual(foundations.closure.tokens, [...union].sort());
  assert.ok(was.closure.tokens.includes('text-xs-medium') && !foundations.closure.tokens.includes('text-xs-medium'));
  assert.deepEqual(foundations.textStyles['text-xs-medium'].usedBy, []);
  // Nothing else in the document moves: no approval of its own, the same variables and closure.contracts.
  for (const k of Object.keys(was).filter(k => k !== 'closure' && k !== 'textStyles' && k !== 'variables')) assert.deepEqual(foundations[k], was[k], k);
  assert.deepEqual(foundations.closure.contracts, was.closure.contracts);
  for (const family of READABLE) {
    const c = read(contractPath(dir, family));
    assert.equal(c.selection.status, 'approved', family);
    assert.deepEqual(c.selection.approval, { by: TEST_APPROVER, at: AT, snapshotId: c.source.snapshotId, contentHash: contractModule.contentHash(c) }, family);
    // As the owner's, the same approval passes every rule.
    const owner = structuredClone(c);
    owner.selection.approval.by = 'owner';
    assert.deepEqual(contractModule.validate(owner, foundations).errors, [], family);
    assert.equal(contractModule.expand(c).length, review.families[family].patch.expectedCount, family);
  }
  assert.ok(contractModule.expand(read(contractPath(dir, 'button'))).every(t => t.size !== 'xs'));
  // Only the selection lines change: the rest of each Contract is byte for byte the draft's.
  const label = readFileSync(contractPath(dir, 'label'), 'utf8');
  assert.equal(label.replace(/"selection": \{[\s\S]*?\n  \}/, ''), before['contracts/label.component.json'].replace(/"selection": \{[\s\S]*?\n  \}/, ''));
  // folder.mjs again over the approved folder: its Contracts give the closure, so nothing moves.
  const approvedFolder = snapshot(dir);
  const again = await buildFolder({ project: V0, root: dirname(dir) });
  assert.equal(again.foundations.written, false);
  assert.deepEqual(again.unchanged, READABLE);
  assert.deepEqual(snapshot(dir), approvedFolder);
});

test('"approve except select" leaves select a draft, byte-unchanged, and approves the rest', { skip }, async () => {
  const { dir } = await v0Folder();
  const before = snapshot(dir);
  const r = await approveFolder({ dir, project: V0, exported: exported(dir, { select: m => m.selectMatching({ state: 'disabled' }, false) }), said: 'approve except select', at: AT, test: true });
  assert.deepEqual(r.approved, READABLE.filter(f => f !== 'select'));
  assert.deepEqual(r.drafts, ['select']);
  assert.equal(readFileSync(contractPath(dir, 'select'), 'utf8'), before['contracts/select.component.json']);
  for (const family of r.approved) assert.equal(read(contractPath(dir, family)).selection.status, 'approved', family);
});

test('approving again: the same ticks leave every approval as it was; the next page holds none of them, and keeps them all (#180)', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  await approveFolder({ dir, project: V0, exported: review, said: 'approve', at: AT, test: true });
  const once = snapshot(dir);
  const again = await approveFolder({ dir, project: V0, exported: review, said: 'approve', at: '2026-10-19T00:00:00Z', test: true });
  assert.deepEqual([again.approved, again.unchanged, again.kept], [[], READABLE, []]);
  assert.equal(again.foundations.written, false);
  assert.deepEqual(snapshot(dir), once);
  // The page after approval leaves every approved Contract out, so its export has no ticks: each is kept.
  assert.deepEqual(reviewModel(dir).families, []);
  const empty = reviewExport(reviewModel(dir), {});
  assert.deepEqual(empty.families, {});
  const kept = await approveFolder({ dir, project: V0, exported: empty, said: 'approve', at: '2026-10-19T00:00:00Z', test: true });
  assert.deepEqual([kept.approved, kept.unchanged, kept.kept], [[], [], READABLE]);
  assert.deepEqual(snapshot(dir), once);
  // Ticks the page never showed, which would change an approval, are refused, and an approved family is no except.
  // (an export the page cannot give now, as an old one would be: every family's ticks)
  const unshown = { ...empty, families: selections(dir, { select: m => m.selectMatching({ state: 'disabled' }, false) }) };
  await assert.rejects(approveFolder({ dir, project: V0, exported: unshown, said: 'approve', at: AT, test: true }),
    /select: approved already and not on the review page, so these ticks, which would change its approval, were never shown/);
  await assert.rejects(approveFolder({ dir, project: V0, exported: empty, said: 'approve except select', at: AT, test: true }),
    /select is approved already and not on the review page, so there is nothing to except/);
  assert.deepEqual(snapshot(dir), once);
});

test('a refusal writes nothing: no owner message, a test outside .scratch/, another folder, a moved Foundations, missing or stale ticks', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  const before = snapshot(dir);
  const refuses = async (args, pattern) => {
    await assert.rejects(approveFolder({ dir, project: V0, exported: review, said: 'approve', at: AT, test: true, ...args }), pattern);
    assert.deepEqual(snapshot(args.dir || dir), args.dir ? args.before : before);
  };
  await refuses({ said: 'ship it' }, /is not "approve" or "approve except <family>"/);
  const outside = join(mkdtempSync(join(tmpdir(), 'vibe-to-figma-')), 'v0-app');
  cpSync(dir, outside, { recursive: true });
  await refuses({ dir: outside, before: snapshot(outside) }, /a test approval is written only under .*\.scratch/);
  await refuses({ exported: { ...review, designSystem: 'shadcn' } }, /the review is of shadcn, not v0-app/);
  await refuses({ exported: { ...review, documentHash: 'sha256:0' } }, /the Foundations document moved since the review/);
  const { select, ...rest } = review.families;
  await refuses({ exported: { ...review, families: rest } }, /no ticks for select/);
  const stale = structuredClone(review);
  stale.families.card.patch.snapshotId = stale.families.card.checked.snapshotId = 'sha256:old';
  await refuses({ exported: stale }, /card: .*snapshotId/);
  // All or nothing: one family's ticks that do not reproduce its checked tuples stop every family.
  const wrong = structuredClone(review);
  wrong.families.button.checked.checked.pop();
  await refuses({ exported: wrong }, /button: the expansion differs from the checked tuples/);
});

test('a Contract the Foundations document does not list, or lists at another snapshot, is refused', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  const file = join(dir, 'v0-app.foundations.json');
  const doc = read(file);
  doc.closure.contracts = doc.closure.contracts.filter(c => c.family !== 'card');
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const moved = { ...review, documentHash: `sha256:${contractModule.sha256(readFileSync(file, 'utf8'))}` };
  await assert.rejects(approveFolder({ dir, project: V0, exported: moved, said: 'approve', at: AT, test: true }), /card is not in the Foundations document's closure/);
});

test('a Foundations document the project no longer generates is refused, so approve writes only what an omit changes', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  const file = join(dir, 'v0-app.foundations.json');
  const doc = read(file);
  doc.notes.push({ level: 'info', at: 'variables', message: 'edited by hand' });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const before = snapshot(dir);
  const moved = { ...review, documentHash: `sha256:${contractModule.sha256(readFileSync(file, 'utf8'))}` };
  await assert.rejects(approveFolder({ dir, project: V0, exported: moved, said: 'approve', at: AT, test: true }), /no longer generates the Foundations document the page showed/);
  assert.deepEqual(snapshot(dir), before);
});

test('To-handoff generates against the approved folder with no Contract requests and no draft Contract', { skip }, async () => {
  const { dir } = await v0Folder();
  // The fixture's decisions, without the answers that drafted Contracts mid-run: this folder has them all, but Toaster.
  const decisions = Object.fromEntries(Object.entries(read(join(V0, 'decisions.json'))).filter(([k]) => !/^(recognise|contract):/.test(k) || /sonner|Toaster/.test(k)));
  const drafts = r => Object.keys(r.handoff.source.contracts).filter(k => read(contractPath(dir, k)).selection.status !== 'approved');

  const draft = await generate({ prototype: V0, designSystem: dir, decisions });
  assert.deepEqual(drafts(draft), ['alert', 'button', 'card', 'input', 'label', 'select', 'textarea']);

  // An omit that narrows the closure, so To-handoff reads the Foundations document approve wrote.
  const approved = await approveFolder({ dir, project: V0, exported: exported(dir, { button: m => m.selectMatching({ size: 'xs' }, false) }), said: 'approve', at: AT, test: true });
  assert.equal(approved.foundations.written, true);
  const r = await generate({ prototype: V0, designSystem: dir, decisions });
  assert.deepEqual(r.requests, []);
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(drafts(r), []);
  const usages = r.handoff.screens.flatMap(s => s.regions.flatMap(x => x.usages));
  assert.deepEqual([...new Set(usages.filter(u => u.contract).map(u => `${u.contract} ${u.match.by}`))].sort(),
    ['alert import', 'button import', 'card import', 'input import', 'label import', 'select import', 'textarea import']);
  assert.deepEqual(usages.filter(u => u.raw).map(u => u.raw.element), ['Toaster']);
  assert.ok(!r.handoff.source.notes.some(n => /Contract the Adapter wrote mid-run/.test(n.text)));
});
