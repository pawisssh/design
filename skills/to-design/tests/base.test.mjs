// Base Component slice (#31), through the offline chain: foundations and icons built on a mock figma,
// then Contract -> base plan -> package -> core -> readback -> diff -> in-place edit -> rebuild -> approval.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash } from '../../contract/scripts/contract.mjs';
import { applyEdits, approveReviewed, diff, discardNote, normalizeReadback, review } from '../scripts/base-loop.mjs';
import { basePlan, foundationsPlan, iconsPlan } from '../scripts/build-plan.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8'));
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/carbon/carbon.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
// Foundations and icons run on the foundations core; the base slice on the components core.
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const PACKAGER = join(ROOT, 'skills/to-design/scripts/package_native_builder.py');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-16T00:00:00.000Z';
const SIMULATED = 'owner (simulated in a test)';

function pack(plan, state, core = COMPONENTS_CORE) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-base-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, core, 'plan.json', 'out', '--state', 'state.json'], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return { code: readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8'), out: JSON.parse(run.stdout) };
}

// A file with the foundations and the Button icons built, and its ledger.
async function setup() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  let ledger = null;
  for (const derive of [
    () => foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT }),
    () => iconsPlan([BUTTON], ICONS_DIR, ledger, { fileKey: FILE_KEY, at: AT }),
  ]) {
    const { plan, state } = derive();
    const result = await runPackage(pack(plan, state, CORE).code, mock.figma);
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    ledger = recordResult(ledger, result);
  }
  return { mock, ledger };
}

// One base call: derive, package, run; returns the result, the readback in Contract names and the new ledger.
async function base(env, contract = BUTTON, options = {}) {
  const { plan, state } = basePlan(contract, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, ...options });
  const { code, out } = pack(plan, state);
  const result = await runPackage(code, env.mock.figma);
  assert.ok(!result.error, JSON.stringify(result));
  if (result.summary.conflicts === 0) env.ledger = recordResult(env.ledger, result);
  return { result, out, readback: result.readback && normalizeReadback(result.readback, env.ledger) };
}

const writes = mock => mock.log.filter(([op]) => op !== 'setCurrentPage' && op !== 'loadFont');

test('the Base Component builds from the Contract and reads back with no differences', async () => {
  const env = await setup();
  const before = { foundations: env.ledger.foundations, icons: env.ledger.icons };
  const { result, out, readback } = await base(env);
  assert.equal(result.summary.conflicts, 0);
  assert.deepEqual(result.created, ['page', 'component', 'layers']);
  assert.deepEqual(result.missing, []);
  assert.ok(out.chars < 50000, `package is ${out.chars} chars`);
  assert.equal(env.mock.figma.skipInvisibleInstanceChildren, false, 'the readback sees hidden instance children');
  const d = diff(BUTTON, readback, DOC);
  assert.deepEqual([d.changes, d.unread], [[], []]);
  assert.equal(readback.name, 'Kind=Primary, Size=Large, State=Enabled');
  assert.deepEqual(readback.layout.Button.gap, { token: 'spacing-07' });
  assert.deepEqual(readback.layout.Label.textStyle, { token: 'body-compact-01' });
  assert.deepEqual(readback.paint['Glyph/Vector'].fill, { token: 'text-on-color' });
  assert.deepEqual(readback.swap, { Glyph: 'add' });
  assert.deepEqual(readback.visible, { Label: true, Icon: true, Glyph: true });
  // the ledger gains bases.button and keeps the other sections
  assert.deepEqual({ foundations: env.ledger.foundations, icons: env.ledger.icons }, before);
  const rec = env.ledger.bases.button;
  assert.equal(rec.id, readback.id);
  assert.equal(rec.contentHash, contentHash(BUTTON));
  const page = env.mock.snapshot().pages.find(p => p.name === 'Buttons');
  assert.equal(page.id, rec.page);
  assert.deepEqual(page.children.map(n => n.name), [readback.name]);
});

test('a rerun writes nothing and keeps the component id', async () => {
  const env = await setup();
  const first = await base(env);
  env.mock.log.length = 0;
  const again = await base(env);
  assert.deepEqual(again.result.summary, { created: 0, updated: 0, unchanged: 1, missing: 0, conflicts: 0 });
  assert.deepEqual(writes(env.mock), []);
  assert.equal(again.readback.id, first.readback.id);
});

test('a read-only call writes nothing; an unrecorded component with the target name is a conflict', async () => {
  const env = await setup();
  const ro = await base(env, BUTTON, { readOnly: true });
  assert.deepEqual(ro.result.conflicts, [{ kind: 'base', name: 'Kind=Primary, Size=Large, State=Enabled', reason: 'not-built' }]);
  const page = env.mock.figma.createPage();
  page.name = 'Buttons';
  const stray = await base(env);
  assert.deepEqual(stray.result.conflicts.map(c => [c.kind, c.reason]), [['page', 'unowned']]);
  assert.equal(env.ledger.bases, undefined, 'a conflict records nothing new');
});

test('owner tweaks: diff -> in-place edit -> rebuild -> clean readback -> approval bound to what was reviewed', async () => {
  const env = await setup();
  const { readback: built } = await base(env);
  const { figma } = env.mock;
  // Simulated owner tweaks in Figma: bind spacing-06 to the gap, type 14 into paddingTop, change letterSpacing.
  const comp = await figma.getNodeByIdAsync(built.id);
  comp.setBoundVariable('itemSpacing', await figma.variables.getVariableByIdAsync(env.ledger.foundations.variables['spacing-06']));
  comp.paddingTop = 14;
  comp.findOne(n => n.name === 'Label').letterSpacing = { unit: 'PIXELS', value: 0.32 };
  const { readback: tweaked } = await base(env, BUTTON, { readOnly: true });
  const r = review(BUTTON, tweaked, DOC, { by: SIMULATED });
  assert.deepEqual(r.changes.map(x => `${x.kind} ${x.node}.${x.field}`), [
    'token-edit Button.gap', 'raw-edit Button.paddingTop', 'detached Label.textStyle', 'unmapped Label.letterSpacing',
  ]);
  assert.deepEqual(r.unread, []);
  assert.deepEqual(r.proposals.slice(0, 2).map(p => [p.path, p.blast.count]), [['layout[0].Button.gap', 150], ['layout[4].Button.paddingTop', 105]]);
  const { contract: edited } = applyEdits(BUTTON, r.proposals, { confirm: 'all' });
  assert.deepEqual(edited.layout[0].set.Button.gap, { token: 'spacing-06', by: SIMULATED, was: { token: 'spacing-07' } });

  env.mock.log.length = 0;
  const { result, readback: rebuilt } = await base(env, edited);
  assert.deepEqual(result.created, []);
  assert.equal(rebuilt.id, built.id);
  assert.deepEqual(result.updated, { Label: ['textStyle'] }, 'only the detached text style is written back');
  const clean = diff(edited, rebuilt, DOC);
  assert.deepEqual([clean.changes, clean.unread], [[], []]);

  // the letterSpacing tweak is gone from Figma: approval waits until its note is discarded
  const ids = { snapshotId: edited.source.snapshotId, contentHash: contentHash(edited), at: AT };
  assert.throws(() => approveReviewed(edited, rebuilt, DOC, ids), /warning note/);
  const settled = discardNote(edited, 'layout.Label.letterSpacing', rebuilt, DOC);
  assert.throws(() => approveReviewed(settled, rebuilt, DOC, ids), /the Contract changed since the review/);
  const approved = approveReviewed(settled, rebuilt, DOC, { ...ids, contentHash: contentHash(settled) });
  assert.deepEqual(approved.selection.approval, { by: 'owner', at: AT, snapshotId: settled.source.snapshotId, contentHash: contentHash(settled) });
});

test('hidden layers inside the icon instance are still read back (skipInvisibleInstanceChildren = false)', async () => {
  const env = await setup();
  const { readback } = await base(env);
  const comp = await env.mock.figma.getNodeByIdAsync(readback.id);
  comp.findOne(n => n.name === 'Glyph').children[0].visible = false;
  env.mock.figma.skipInvisibleInstanceChildren = true; // Figma's default for a new call
  const { readback: hidden } = await base(env, BUTTON, { readOnly: true });
  assert.deepEqual(hidden.paint['Glyph/Vector'].fill, { token: 'text-on-color' });
  assert.deepEqual(diff(BUTTON, hidden, DOC).unread, []);
});

test('each core serves its own slices: a foundations plan on the components core changes nothing', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY });
  const { plan, state } = foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, at: AT });
  const result = await runPackage(pack(plan, state, COMPONENTS_CORE).code, mock.figma);
  assert.ok(['unknown-slice', 'package-mismatch'].includes(result.error), JSON.stringify(result));
  assert.deepEqual(writes(mock), []);
});

test('both packages fit use_figma: foundations on its core, the base on the components core', async () => {
  const env = await setup();
  const f = foundationsPlan(DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT });
  const b = basePlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT });
  const fChars = pack(f.plan, f.state, CORE).out.chars;
  const bChars = pack(b.plan, b.state).out.chars;
  assert.ok(fChars < 50000 && bChars < 50000, `foundations ${fChars}, base ${bChars}`);
});

test('a drifted package is refused before its first change', async () => {
  const env = await setup();
  const { plan, state } = basePlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT });
  const { code } = pack(plan, state);
  env.mock.log.length = 0;
  const result = await runPackage(code.replace('"paddingTop":{"raw":15}', '"paddingTop":{"raw":16}'), env.mock.figma);
  assert.equal(result.error, 'package-mismatch');
  assert.deepEqual(writes(env.mock), []);
});

test('the base plan refuses a foundations document that changed since the foundations build', async () => {
  const env = await setup();
  assert.throws(() => basePlan(BUTTON, DOC_TEXT + ' ', env.ledger, { fileKey: FILE_KEY }), /changed since the last foundations build/);
  assert.throws(() => basePlan(BUTTON, DOC_TEXT, { ...env.ledger, icons: null }, { fileKey: FILE_KEY }), /icon add is not in the ledger/);
});
