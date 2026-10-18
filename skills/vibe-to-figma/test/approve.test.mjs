// The one approve (#177): "approve" or "approve except <family>" reads the review's combined export, applies each
// family's omit and approves the Contracts against the Foundations document the page showed, in one act. Tests
// approve only under .scratch/ with the test approver; they never approve a committed file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { generate } from '../../to-handoff/scripts/generate.mjs';
import { TEST_APPROVER } from '../../to-handoff/scripts/system.mjs';
import { approveFolder, parseApproval } from '../scripts/approve.mjs';
import { reviewModel } from '../scripts/review.mjs';
import { READABLE, V0, read, skip, v0Folder } from './helpers.mjs';

const require = createRequire(import.meta.url);
const Selection = require('../../to-preview/assets/selection-model.js');
const { reviewExport } = require('../assets/review-export.js');
const AT = '2026-10-18T00:00:00Z';
const contractPath = (dir, family) => join(dir, 'contracts', `${family}.component.json`);

// The page's export, in node: every catalog rendered, then the owner's unticks.
function exported(dir, edits = {}) {
  const model = reviewModel(dir);
  return reviewExport(model, Object.fromEntries(READABLE.map(family => {
    const m = new Selection(read(contractPath(dir, family)), contractModule);
    for (const id of m.specimens.keys()) m.verify(id);
    if (edits[family]) edits[family](m);
    const patch = m.omitPatch();
    return [family, { patch, checked: { family, snapshotId: patch.snapshotId, checked: m.checkedTuples() } }];
  })));
}
// Every file of the folder, as text: what a refusal must leave unchanged.
const snapshot = dir => Object.fromEntries(['', 'contracts'].flatMap(sub => readdirSync(join(dir, sub)).filter(f => f.endsWith('.json')).map(f => [join(sub, f), readFileSync(join(dir, sub, f), 'utf8')])));

test('the owner\'s message: "approve", or "approve except" one or more families', () => {
  assert.deepEqual(parseApproval('approve', READABLE), { except: [] });
  assert.deepEqual(parseApproval('  Approve ', READABLE), { except: [] });
  assert.deepEqual(parseApproval('approve except select', READABLE), { except: ['select'] });
  assert.deepEqual(parseApproval('approve except select, card and alert', READABLE), { except: ['alert', 'card', 'select'] });
  for (const said of ['', 'looks good', 'approve select', 'approved', 'approve except', 'please approve'])
    assert.throws(() => parseApproval(said, READABLE), /is not "approve" or "approve except <family>"/, said);
  assert.throws(() => parseApproval('approve except sonner', READABLE), /sonner has no Contract here/);
});

test('"approve" applies every family\'s omit and approves every Contract; the Foundations document is unchanged', { skip }, async () => {
  const { dir } = await v0Folder();
  const before = snapshot(dir);
  const review = exported(dir, { button: m => m.selectMatching({ size: 'xs' }, false) });
  const r = approveFolder({ dir, exported: review, said: 'approve', at: AT, test: true });
  assert.deepEqual(r.approved, READABLE);
  assert.deepEqual(r.drafts, []);
  assert.equal(r.foundations.documentHash, review.documentHash);
  assert.equal(readFileSync(join(dir, 'v0-app.foundations.json'), 'utf8'), before['v0-app.foundations.json']);
  const foundations = read(join(dir, 'v0-app.foundations.json'));
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
});

test('"approve except select" leaves select a draft, byte-unchanged, and approves the rest', { skip }, async () => {
  const { dir } = await v0Folder();
  const before = snapshot(dir);
  const r = approveFolder({ dir, exported: exported(dir, { select: m => m.selectMatching({ state: 'disabled' }, false) }), said: 'approve except select', at: AT, test: true });
  assert.deepEqual(r.approved, READABLE.filter(f => f !== 'select'));
  assert.deepEqual(r.drafts, ['select']);
  assert.equal(readFileSync(contractPath(dir, 'select'), 'utf8'), before['contracts/select.component.json']);
  for (const family of r.approved) assert.equal(read(contractPath(dir, family)).selection.status, 'approved', family);
});

test('approving again with the same ticks leaves every approval as it was', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  approveFolder({ dir, exported: review, said: 'approve', at: AT, test: true });
  const once = snapshot(dir);
  const r = approveFolder({ dir, exported: exported(dir), said: 'approve', at: '2026-10-19T00:00:00Z', test: true });
  assert.deepEqual(r.approved, []);
  assert.deepEqual(r.unchanged, READABLE);
  assert.deepEqual(snapshot(dir), once);
});

test('a refusal writes nothing: no owner message, a test outside .scratch/, another folder, a moved Foundations, missing or stale ticks', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  const before = snapshot(dir);
  const refuses = (args, pattern) => {
    assert.throws(() => approveFolder({ dir, exported: review, said: 'approve', at: AT, test: true, ...args }), pattern);
    assert.deepEqual(snapshot(args.dir || dir), args.dir ? args.before : before);
  };
  refuses({ said: 'ship it' }, /is not "approve" or "approve except <family>"/);
  const outside = join(mkdtempSync(join(tmpdir(), 'vibe-to-figma-')), 'v0-app');
  cpSync(dir, outside, { recursive: true });
  refuses({ dir: outside, before: snapshot(outside) }, /a test approval is written only under .*\.scratch/);
  refuses({ exported: { ...review, designSystem: 'shadcn' } }, /the review is of shadcn, not v0-app/);
  refuses({ exported: { ...review, documentHash: 'sha256:0' } }, /the Foundations document moved since the review/);
  const { select, ...rest } = review.families;
  refuses({ exported: { ...review, families: rest } }, /no ticks for select/);
  const stale = structuredClone(review);
  stale.families.card.patch.snapshotId = stale.families.card.checked.snapshotId = 'sha256:old';
  refuses({ exported: stale }, /card: .*snapshotId/);
  // All or nothing: one family's ticks that do not reproduce its checked tuples stop every family.
  const wrong = structuredClone(review);
  wrong.families.button.checked.checked.pop();
  refuses({ exported: wrong }, /button: the expansion differs from the checked tuples/);
});

test('a Contract the Foundations document does not list, or lists at another snapshot, is refused', { skip }, async () => {
  const { dir } = await v0Folder();
  const review = exported(dir);
  const file = join(dir, 'v0-app.foundations.json');
  const doc = read(file);
  doc.closure.contracts = doc.closure.contracts.filter(c => c.family !== 'card');
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const moved = { ...review, documentHash: `sha256:${contractModule.sha256(readFileSync(file, 'utf8'))}` };
  assert.throws(() => approveFolder({ dir, exported: moved, said: 'approve', at: AT, test: true }), /card is not in the Foundations document's closure/);
});

test('To-handoff generates against the approved folder with no Contract requests and no draft Contract', { skip }, async () => {
  const { dir } = await v0Folder();
  // The fixture's decisions, without the answers that drafted Contracts mid-run: this folder has them all, but Toaster.
  const decisions = Object.fromEntries(Object.entries(read(join(V0, 'decisions.json'))).filter(([k]) => !/^(recognise|contract):/.test(k) || /sonner|Toaster/.test(k)));
  const drafts = r => Object.keys(r.handoff.source.contracts).filter(k => read(contractPath(dir, k)).selection.status !== 'approved');

  const draft = await generate({ prototype: V0, designSystem: dir, decisions });
  assert.deepEqual(drafts(draft), ['alert', 'button', 'input', 'label', 'select', 'textarea']);

  approveFolder({ dir, exported: exported(dir), said: 'approve', at: AT, test: true });
  const r = await generate({ prototype: V0, designSystem: dir, decisions });
  assert.deepEqual(r.requests, []);
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(drafts(r), []);
  const usages = r.handoff.screens.flatMap(s => s.regions.flatMap(x => x.usages));
  assert.deepEqual([...new Set(usages.filter(u => u.contract).map(u => `${u.contract} ${u.match.by}`))].sort(),
    ['alert import', 'button import', 'input import', 'label import', 'select import', 'textarea import']);
  assert.deepEqual(usages.filter(u => u.raw).map(u => u.raw.element), ['Toaster']);
  assert.ok(!r.handoff.source.notes.some(n => /Contract the Adapter wrote mid-run/.test(n.text)));
});
