// The Design System folder a vibe-coded project gets (#176): design-systems/<name>/ with the Foundations document
// and a draft Contract per used component, through the Generic Adapter. A component the Adapter cannot read is
// skipped and reported, and the run goes on. The committed fixtures/drafts files stand in for the agent's answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTools } from '../../adapter-generic/scripts/sources.mjs';
import { hasTypescript } from '../../to-handoff/scripts/deps.mjs';
import { buildFolder } from '../scripts/folder.mjs';

const V0 = fileURLToPath(new URL('../../to-handoff/test/fixtures/v0-app', import.meta.url));
const DRAFTS = fileURLToPath(new URL('../../adapter-generic/fixtures/drafts/', import.meta.url));
const skip = (!hasTools() && 'Generic Adapter tools missing; run: node skills/adapter-generic/scripts/sources.mjs')
  || (!hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs');
const READABLE = ['alert', 'button', 'card', 'input', 'label', 'select', 'textarea'];
// The agent's answers, one Adapter drafts file per family: {family: {key: value}}.
const drafts = () => Object.fromEntries(READABLE.map(f => [f, JSON.parse(readFileSync(join(DRAFTS, `${f}.json`), 'utf8')).drafts]));
const tmp = () => mkdtempSync(join(tmpdir(), 'vibe-to-figma-folder-'));
const read = path => JSON.parse(readFileSync(path, 'utf8'));

test('the v0 project gets design-systems/v0-app/ with its Foundations and a draft Contract per used component; Toaster is skipped', { skip }, async () => {
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

  const foundations = read(join(dir, 'v0-app.foundations.json'));
  assert.equal(foundations.source.adapter, 'generic');
  assert.deepEqual(foundations.designSystem, { key: 'v0-app', name: 'v0-app' }); // names the file, folder and ledger section
  assert.deepEqual(foundations.closure.contracts.map(c => c.family).sort(), READABLE);
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
  assert.deepEqual(report.written, ['foundations']);
  assert.equal(read(join(dir, 'request-access.foundations.json')).designSystem.key, 'request-access');
  assert.ok(!existsSync(join(dir, 'contracts')));
});

test('a name that is no folder name is refused before anything is read', async () => {
  await assert.rejects(buildFolder({ project: V0, root: tmp(), name: '../shadcn' }), /"\.\.\/shadcn" is not a folder name/);
});
