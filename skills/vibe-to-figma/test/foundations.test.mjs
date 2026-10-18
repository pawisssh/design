// A Foundations call goes to Figma only for the Foundations document the owner's approve covered (#175). approve.mjs
// records that document as the folder's Foundations approval. A document no approve covers is on the review page even
// with no draft (its Foundations tab alone), and the build refuses its Foundations call until the owner approves it.
// Built on To-design's mock Figma, with a copy of the v0 project under .scratch/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../contract/scripts/contract.mjs';
import { TEST_APPROVER } from '../../to-handoff/scripts/system.mjs';
import { approveFolder, storedExport } from '../scripts/approve.mjs';
import { nextStep } from '../scripts/build.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { buildReview, folderFiles, foundationsApproval, reviewModel } from '../scripts/review.mjs';
import { AT, FILE_KEY, NARROW, drive, smokeDraft } from './drive.mjs';
import { READABLE, V0, read, scratch, selections, skip } from './helpers.mjs';

const { reviewExport } = createRequire(import.meta.url)('../assets/review-export.js');
const { storedTicks } = createRequire(import.meta.url)('../assets/review-store.js');
const REVIEW = fileURLToPath(new URL('../scripts/review.mjs', import.meta.url));
const DRAFTS = fileURLToPath(new URL('../../adapter-generic/fixtures/drafts/', import.meta.url));
const drafts = Object.fromEntries(READABLE.map(f => [f, read(join(DRAFTS, `${f}.json`)).drafts]));
// The page's export, in node, for the families on it (none, on a Foundations-only page).
const exported = (dir, edits) => { const model = reviewModel(dir); const all = selections(dir, edits); return reviewExport(model, Object.fromEntries(model.families.map(f => [f.family, all[f.family]]))); };
const hashOf = path => `sha256:${sha256(readFileSync(path, 'utf8'))}`;
const pageData = html => JSON.parse(/<script type="application\/json" id="review">(.*?)<\/script>/s.exec(html)[1]);
const noCatalog = () => { throw new Error('no catalog is built'); };

// One project, approved and then built in the tests below, in order.
let project;

test('approve records the Foundations document it leaves as the folder\'s Foundations approval', { skip }, async () => {
  const root = scratch();
  const copy = join(root, 'project');
  cpSync(V0, copy, { recursive: true });
  const { dir } = await buildFolder({ project: copy, root: join(root, 'ds'), drafts });
  const files = folderFiles(dir);
  assert.equal(files.approval, join(dir, 'v0-app.foundations-approval.json'));
  assert.equal(foundationsApproval(dir), null);
  assert.equal(reviewModel(dir).foundations.approved, false);

  // A refusal writes no Foundations approval.
  await assert.rejects(approveFolder({ dir, project: copy, exported: exported(dir, NARROW), said: 'approve please', at: AT, test: true }), /is not "approve"/);
  assert.equal(foundationsApproval(dir), null);

  const a = await approveFolder({ dir, project: copy, exported: exported(dir, NARROW), said: 'approve', at: AT, test: true });
  assert.equal(a.foundations.approval, 'written');
  // The omit narrowed the closure, so the approval names the document approve wrote, not the one the page showed.
  assert.equal(a.foundations.written, true);
  assert.deepEqual(foundationsApproval(dir), { designSystem: 'v0-app', documentHash: hashOf(files.foundations), by: TEST_APPROVER, at: AT });
  assert.equal(reviewModel(dir).foundations.approved, true);

  // Approve again, every Contract approved: the approval is left byte-unchanged.
  const text = readFileSync(files.approval, 'utf8');
  const again = await approveFolder({ dir, project: copy, exported: exported(dir, NARROW), said: 'approve', at: '2026-10-19T00:00:00.000Z', test: true });
  assert.deepEqual([again.approved, again.kept, again.foundations.approval], [[], READABLE, 'unchanged']);
  assert.equal(readFileSync(files.approval, 'utf8'), text);
  project = { project: copy, root: join(root, 'ds'), dir, files };
});

test('a Foundations document no approve covers: the build refuses its call, the page shows it alone, and "approve" lets it go', { skip }, async () => {
  assert.ok(project, 'the approve test ran first');
  const { project: copy, root, dir, files } = project;
  // A folder approved before the Foundations approval was recorded: every Contract approved, no record.
  rmSync(files.approval);
  const mock = smokeDraft();
  const writes = mock.log.length;
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, at: AT, namespace: 'v0-app' }),
    /cannot build the Foundations of v0-app into MOCKFILEKEY0000000000000: no approve covers the Foundations document sha256:[0-9a-f]{64}, so nothing is written to Figma: build the review page/);
  assert.equal(mock.log.length, writes);

  // The review page is its Foundations tab alone; no catalog is built.
  const model = reviewModel(dir);
  assert.deepEqual([model.families, model.kept, model.foundations.approved], [[], READABLE, false]);
  const { html } = await buildReview({ dir, renderer: noCatalog });
  const page = pageData(html);
  assert.deepEqual([page.tabs, page.catalogs], [['foundations'], {}]);
  assert.match(html, /is not the one the last approve covered/);
  const cli = spawnSync(process.execPath, [REVIEW, dir, '--project', copy, '--out', join(root, 'review.html')], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /review\.html: Foundations only: no approve covers this Foundations document, and every Contract is approved \(.* MB\); kept approved, not reviewed again: alert, button, card, input, label, select, textarea\n/);

  // There is no family to except on it, and the ticks the Artifact saves for it give back the export.
  const review = reviewExport(model, {});
  assert.deepEqual(review, { designSystem: 'v0-app', documentHash: model.foundations.documentHash, families: {} });
  assert.deepEqual(storedExport(dir, storedTicks(review)), review);
  await assert.rejects(approveFolder({ dir, project: copy, exported: review, said: 'approve except button', at: AT, test: true }), /button is approved already and not on the review page/);
  assert.equal(foundationsApproval(dir), null);

  const a = await approveFolder({ dir, project: copy, exported: review, said: 'approve', at: AT, test: true });
  assert.deepEqual([a.approved, a.kept, a.foundations.written, a.foundations.approval], [[], READABLE, false, 'written']);
  assert.equal(foundationsApproval(dir).documentHash, model.foundations.documentHash);
  assert.equal((await buildReview({ dir, renderer: noCatalog })).html, null);

  const built = await drive({ dir, mock, namespace: 'v0-app' });
  assert.equal(built.n.status, 'built', JSON.stringify(built.n));
  assert.equal(built.steps[0].step, 'foundations');
  Object.assign(project, { mock, ledger: built.ledger, record: built.record });
});

test('a Foundations document the ledger holds already needs no call, so a folder with no approval of it still builds', { skip }, async () => {
  assert.ok(project && project.ledger, 'the build test ran first');
  const { dir, files, mock, ledger, record } = project;
  const text = readFileSync(files.approval, 'utf8');
  rmSync(files.approval);
  const writes = mock.log.length;
  const again = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.deepEqual([again.n.status, again.steps], ['built', []]);
  assert.equal(mock.log.length, writes);
  writeFileSync(files.approval, text);
});

test('a Foundations document that changes with no Contract is refused and shown, and approved only as the project generates it', { skip }, async () => {
  assert.ok(project && project.ledger, 'the build test ran first');
  const { project: copy, root, dir, files, mock, ledger, record } = project;
  const approved = readFileSync(files.foundations, 'utf8');
  // As an Adapter rule change would: a Theme color no Contract uses takes another value, and every Contract holds.
  const doc = JSON.parse(approved);
  assert.deepEqual(doc.variables.accent.usedBy, []);
  doc.variables.accent.values.light = { ...doc.variables.accent.values.light, value: '#f4f4f4', resolved: '#f4f4f4' };
  writeFileSync(files.foundations, JSON.stringify(doc, null, 2) + '\n');
  const writes = mock.log.length;
  assert.throws(() => nextStep({ dir, fileKey: FILE_KEY, ledger, record, at: AT, namespace: 'v0-app' }),
    /no approve covers the Foundations document sha256:[0-9a-f]{64} \(the last approve covered sha256:[0-9a-f]{64}\)/);
  assert.equal(mock.log.length, writes);

  const model = reviewModel(dir);
  assert.deepEqual([model.families, model.foundations.approved], [[], false]);
  assert.deepEqual(pageData((await buildReview({ dir, renderer: noCatalog })).html).tabs, ['foundations']);
  // The owner's approve covers only a document the project and the Contracts generate.
  const before = readFileSync(files.approval, 'utf8');
  await assert.rejects(approveFolder({ dir, project: copy, exported: reviewExport(model, {}), said: 'approve', at: AT, test: true }), /no longer generates the Foundations document the page showed/);
  assert.equal(readFileSync(files.approval, 'utf8'), before);

  // folder.mjs writes the document the project generates, which is the approved one: nothing to review, no call.
  const r = await buildFolder({ project: copy, root, drafts });
  assert.deepEqual([r.foundations.written, r.written], [true, []]);
  assert.equal(readFileSync(files.foundations, 'utf8'), approved);
  assert.equal((await buildReview({ dir, renderer: noCatalog })).html, null);
  const again = await drive({ dir, mock, ledger, record, namespace: 'v0-app' });
  assert.deepEqual([again.n.status, again.steps], ['built', []]);
  assert.equal(mock.log.length, writes);
});
