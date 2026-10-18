// The Design System folder a Prototype gets (#176): design-systems/<name>/ with the Foundations document and a
// draft Contract per Component Family it uses, through the Generic Adapter. A family the Adapter cannot read is
// skipped and reported, and the run goes on. The committed fixtures/drafts files stand in for the agent's answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTools } from '../../adapter-generic/scripts/sources.mjs';
import { hasTypescript } from '../../to-handoff/scripts/deps.mjs';
import { buildFolder, readDrafts } from '../scripts/folder.mjs';

const V0 = fileURLToPath(new URL('../../to-handoff/test/fixtures/v0-app', import.meta.url));
const DRAFTS = fileURLToPath(new URL('../../adapter-generic/fixtures/drafts/', import.meta.url));
const skip = (!hasTools() && 'Generic Adapter tools missing; run: node skills/adapter-generic/scripts/sources.mjs')
  || (!hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs');
const READABLE = ['alert', 'button', 'card', 'input', 'label', 'select', 'textarea'];
// The agent's answers, one Adapter drafts file per family: {family: {key: value}}.
const drafts = () => Object.fromEntries(READABLE.map(f => [f, JSON.parse(readFileSync(join(DRAFTS, `${f}.json`), 'utf8')).drafts]));
const tmp = () => mkdtempSync(join(tmpdir(), 'vibe-to-figma-folder-'));
const read = path => JSON.parse(readFileSync(path, 'utf8'));

test('the v0 Prototype gets design-systems/v0-app/ with its Foundations and a draft Contract per family it uses; Toaster is skipped', { skip }, async () => {
  const root = tmp();
  const report = await buildFolder({ project: V0, root, drafts: drafts() });
  const dir = join(root, 'v0-app');
  assert.equal(report.name, 'v0-app');
  assert.equal(report.dir, dir);
  assert.deepEqual(report.families, READABLE);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0].family, 'sonner');
  assert.match(report.skipped[0].reason, /Toaster .*not a flex or grid container/);
  assert.deepEqual(report.requests, {});
  assert.deepEqual(report.written, READABLE);
  assert.deepEqual(report.foundations, { path: join(dir, 'v0-app.foundations.json'), written: true });

  const foundations = read(join(dir, 'v0-app.foundations.json'));
  assert.equal(foundations.source.adapter, 'generic');
  assert.deepEqual(foundations.designSystem, { key: 'v0-app', name: 'v0-app' }); // names the file, folder and ledger section
  assert.deepEqual(foundations.closure.contracts.map(c => c.path).sort(), READABLE.map(f => `design-systems/v0-app/contracts/${f}.component.json`));
  assert.deepEqual(readdirSync(join(dir, 'contracts')).sort(), READABLE.map(f => `${f}.component.json`));
  for (const f of READABLE) {
    const contract = read(join(dir, 'contracts', `${f}.component.json`));
    assert.equal(contract.family.key, f);
    assert.equal(contract.selection.status, 'draft');
    assert.equal(contract.selection.approval, null);
  }
  assert.equal(read(join(dir, 'contracts/label.component.json')).family.description,
    'A short medium-weight text label that names a form control, in one enabled state.');
});

test('with no drafts each family is requested and no Contract is written; a name override names the folder', { skip }, async () => {
  const root = tmp();
  const report = await buildFolder({ project: V0, root, name: 'request-access' });
  const dir = join(root, 'request-access');
  assert.equal(report.dir, dir);
  assert.deepEqual(Object.keys(report.requests).sort(), READABLE);
  assert.ok(report.requests.label.some(r => r.key === 'family.description'));
  assert.deepEqual(report.written, []);
  assert.equal(report.foundations.written, true);
  assert.equal(read(join(dir, 'request-access.foundations.json')).designSystem.key, 'request-access');
  assert.ok(!existsSync(join(dir, 'contracts')));
});

test('a name that is no folder name is refused before anything is read', async () => {
  await assert.rejects(buildFolder({ project: V0, root: tmp(), name: '../shadcn' }), /"\.\.\/shadcn" is not a folder name/);
});

test('a drafts file is the combined form, by family, or the Adapter\'s own form for one family', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'all.json'), JSON.stringify({ drafts: { label: { 'properties.text.default': 'Email' } } }));
  assert.deepEqual(readDrafts(join(dir, 'all.json')), { label: { 'properties.text.default': 'Email' } });
  assert.deepEqual(Object.keys(readDrafts(join(DRAFTS, 'label.json'))), ['label']);
  assert.equal(readDrafts(join(DRAFTS, 'label.json')).label['properties.text.default'], 'Label');
});
