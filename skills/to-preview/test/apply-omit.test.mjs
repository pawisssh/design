// The agent-side apply step (#33): node skills/to-preview/scripts/apply-omit.mjs applies To-preview's
// omit patch to a Contract, validates it, and asserts the expansion equals the checked tuples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { rewriteJson } from '../../contract/scripts/io.mjs';

const require = createRequire(import.meta.url);
const Selection = require('../assets/selection-model.js');
const CLI = fileURLToPath(new URL('../scripts/apply-omit.mjs', import.meta.url));
const FOUNDATIONS = fileURLToPath(new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url));
const BUTTON_TEXT = readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url), 'utf8');
const button = JSON.parse(BUTTON_TEXT);
const key = t => JSON.stringify(t);

// Writes the Contract (in the committed file's hand layout), the patch and the checked tuples to a temp dir,
// as the agent finds them after export.
function setup(contract, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'apply-omit-'));
  const model = new Selection(contract, contractModule);
  for (const id of model.specimens.keys()) model.verify(id);
  edit(model);
  const files = { contract: join(dir, 'button.component.json'), patch: join(dir, 'patch.json'), checked: join(dir, 'checked.json') };
  const text = rewriteJson(BUTTON_TEXT, contract);
  writeFileSync(files.contract, text);
  writeFileSync(files.patch, JSON.stringify(model.omitPatch()));
  writeFileSync(files.checked, JSON.stringify({ family: 'button', snapshotId: contract.source.snapshotId, checked: model.checkedTuples() }));
  return { files, before: text, checked: model.checkedTuples() };
}
const run = files => execFileSync(process.execPath,
  [CLI, files.patch, '--checked', files.checked, '--contract', files.contract, '--foundations', FOUNDATIONS],
  { encoding: 'utf8', stdio: 'pipe' });

test('apply writes the omit into the Contract: expansion equals the checked tuples, draft, nothing else changed', () => {
  const approved = contractModule.approve(button, '2026-10-16T00:00:00Z');
  const { files, before, checked } = setup(approved, model => {
    model.selectMatching({ state: 'focus' }, false);
    model.select('ghost|xs|hover', false);
  });
  const out = run(files);
  assert.match(out, /195 variants/);
  const written = JSON.parse(readFileSync(files.contract, 'utf8'));
  assert.deepEqual(contractModule.expand(written).map(key).sort(), checked.map(key).sort());
  assert.deepEqual(written.selection, {
    status: 'draft',
    omit: [{ match: { state: 'focus' } }, { match: { kind: 'ghost', size: 'xs', state: 'hover' } }],
    expectedCount: 245 - 49 - 1,
    approval: null,
  });
  const strip = c => ({ ...c, selection: null });
  assert.deepEqual(strip(written), strip(JSON.parse(before)));
  // the write keeps the file's layout: outside the selection block not a byte changed
  const outside = text => text.replace(/\n  "selection": \{[\s\S]*?\n  \},\n/, '');
  assert.equal(outside(readFileSync(files.contract, 'utf8')), outside(before));
  assert.notEqual(outside(before), before);
});

const runFails = (files, pattern) => {
  const before = readFileSync(files.contract, 'utf8');
  assert.throws(() => run(files), e => e.status === 1 && pattern.test(e.stderr));
  assert.equal(readFileSync(files.contract, 'utf8'), before, 'nothing is written on failure');
};

test('a patch whose patterns do not reproduce the checked tuples is refused, even at the right count', () => {
  const { files } = setup(button, model => model.selectMatching({ state: 'focus' }, false));
  const patch = JSON.parse(readFileSync(files.patch, 'utf8'));
  patch.omit = [{ state: 'hover' }]; // same 49 tuples off, but the wrong ones
  writeFileSync(files.patch, JSON.stringify(patch));
  runFails(files, /expansion differs from the checked tuples: 49 checked but omitted/);
});

test('a patch that omits the Base Component is refused', () => {
  const { files } = setup(button, () => {});
  writeFileSync(files.patch, JSON.stringify({ family: 'button', snapshotId: button.source.snapshotId, omit: [{ kind: 'primary', size: 'lg', state: 'enabled' }], expectedCount: 244 }));
  runFails(files, /Base Component \(Kind=Primary, Size=Large, State=Enabled\) is not selected/);
});

test('a patch with extra fields or for another source snapshot is refused', () => {
  const { files } = setup(button, () => {});
  const patch = JSON.parse(readFileSync(files.patch, 'utf8'));
  writeFileSync(files.patch, JSON.stringify({ ...patch, mode: 'white' }));
  runFails(files, /expected exactly family, snapshotId, omit, expectedCount/);
  writeFileSync(files.patch, JSON.stringify({ ...patch, snapshotId: 'sha256:stale' }));
  writeFileSync(files.checked, JSON.stringify({ family: 'button', snapshotId: 'sha256:stale', checked: [] }));
  runFails(files, /snapshotId sha256:stale does not match source.snapshotId/);
});
