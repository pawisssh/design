// Component Set slice (#32), through the offline chain: foundations, icons and the Base Component built on a
// mock figma, then Contract -> sets plans (batches) -> package -> core -> ledger, and the read-only modes
// (reconcile, coverage, sample, theme) checked against the Contract by coverage.mjs.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOmit, approve, asDraft, expand, variantName } from '../../contract/scripts/contract.mjs';
import { basePlan, decodeEntries, foundationsPlan, iconsPlan, rehashSets, SET_MODES, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage, checkSample, checkTheme } from '../scripts/coverage.mjs';
import { diff, normalizeBaseResult } from '../scripts/base-loop.mjs';
import { pruneList, recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';
import { pack } from './pack.mjs';
import { BUTTON_CLOSURE_DOC } from './chain.mjs';
import { withSpinner } from '../../contract/test/spinner.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8'));
const DOC_TEXT = readFileSync(BUTTON_CLOSURE_DOC, 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-16T00:00:00.000Z';
const TOTAL = expand(BUTTON).length;

// A file with the foundations, the Button icons and the Base Component built, and its ledger.
async function setup({ withBase = true } = {}) {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  let ledger = null;
  for (const [derive, core] of [
    [() => foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT }), CORE],
    [() => iconsPlan([BUTTON], ICONS_DIR, ledger, { fileKey: FILE_KEY, at: AT }), CORE],
    ...(withBase ? [[() => basePlan(BUTTON, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT }), COMPONENTS_CORE]] : []),
  ]) {
    const { plan, state } = derive();
    const result = await runPackage(pack(plan, state, core).code, mock.figma);
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    ledger = recordResult(ledger, result);
  }
  return { mock, ledger };
}

// One sets call: derive, package, run; records a conflict-free result unless `drop` (a lost connection).
async function sets(env, options = {}, { contract = BUTTON, drop = false } = {}) {
  const { plan, state } = setsPlan(contract, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, ...options });
  const { code, out } = pack(plan, state, COMPONENTS_CORE);
  const from = env.mock.log.length;
  const result = await runPackage(code, env.mock.figma);
  assert.ok(!result.error, JSON.stringify(result));
  if (!drop && result.summary.conflicts === 0 && result.ledger) env.ledger = recordResult(env.ledger, result);
  const switches = env.mock.log.slice(from).filter(([op]) => op === 'setCurrentPage').length;
  return { plan, result, out, switches };
}

// A family's build: the first build step by step (--next: loose batches, the combine, the place calls, #168), or,
// once the set is built, every append batch (a rerun or an update).
async function buildAll(env, contract = BUTTON, options = {}) {
  const runs = [];
  const derive = o => setsPlan(contract, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, ...options, ...o });
  const rec = env.ledger.sets && env.ledger.sets[contract.family.key];
  if (rec && rec.set && rec.placed !== false) {
    const { of } = derive({ batch: 0 }).plan.options;
    for (let batch = 0; batch !== of; batch++) runs.push(await sets(env, { batch, ...options }, { contract }));
  } else while (derive({ next: true })) runs.push(await sets(env, { next: true, ...options }, { contract }));
  return runs;
}

const writes = mock => mock.log.filter(([op]) => !['setCurrentPage', 'loadFont', 'setExplicitVariableMode', 'clearExplicitVariableMode'].includes(op));
const setNode = env => env.mock.figma.getNodeByIdAsync(env.ledger.sets.button.set.id);

// A 539-variant Button (six extra State values), approved as a prototype: the slope Contract (#32).
function slopeContract() {
  const c = asDraft(BUTTON);
  const state = c.axes.find(a => a.key === 'state');
  for (let i = 1; i <= 6; i++) state.values.push({ ...state.values[0], key: `slope-${i}`, label: `Slope ${i}` });
  c.selection.expectedCount = expand(c).length;
  c.family = { ...c.family, key: 'button-slope', name: 'Button slope' };
  c.figma = { ...c.figma, page: 'TEMP slope', componentSetName: 'Button slope' };
  return approve(c, AT, { prototype: true });
}

test('the selection is axis-ordered tuples that decode back to the expansion, from an approved Contract only', async () => {
  const env = await setup();
  const tuples = expand(BUTTON);
  const seen = [];
  const { of } = setsPlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT }).plan.options;
  for (let batch = 0; batch !== of; batch++) {
    const { plan } = setsPlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, batch, at: AT });
    assert.deepEqual(plan.selection.axes, ['kind', 'size', 'state']);
    for (const { index, tuple } of decodeEntries(plan, BUTTON)) { assert.deepEqual(tuple, tuples[index]); seen.push(index); }
  }
  assert.deepEqual(seen, tuples.map((_, i) => i), 'every variant once, in expansion order');
  const { plan } = setsPlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT });
  assert.equal(variantName(BUTTON, tuples[plan.baseIndex]), 'Kind=Primary, Size=Large, State=Enabled');
  assert.deepEqual(plan.props.map(p => [p.name, p.type, p.default]), [['Label', 'TEXT', 'Button'], ['Icon', 'BOOLEAN', false], ['Swap icon', 'INSTANCE_SWAP', 'add']]);
  assert.throws(() => setsPlan(asDraft(BUTTON), DOC_TEXT, env.ledger, { fileKey: FILE_KEY }), /not approved/);
  assert.throws(() => setsPlan(slopeContract(), DOC_TEXT, env.ledger, { fileKey: FILE_KEY }), /approval\.by/);
  assert.throws(() => setsPlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, batch: 99 }), /batch must be/);
  assert.throws(() => setsPlan(BUTTON, DOC_TEXT, { fileKey: FILE_KEY }, { fileKey: FILE_KEY }), /foundations/);
});

test('245 variants build in batches into one grid set on the Base Component, and every package fits', async () => {
  const env = await setup();
  const base = { ...env.ledger.bases.button };
  const runs = await buildAll(env);
  for (const { result, out, plan, switches } of runs) {
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    assert.ok(switches <= 1, `batch ${plan.options.batch}: ${switches} page switches (at most one per call)`);
    assert.deepEqual(result.missing, []);
    assert.ok(out.chars < 50000, `batch ${plan.options.batch}: ${out.chars} chars`);
    assert.ok(result.outputBytes < 20000, `batch ${plan.options.batch}: ${result.outputBytes} bytes out`);
    assert.deepEqual(decodeEntries(plan, BUTTON).map(d => d.index), plan.selection.entries.map(e => e[0]));
  }
  const rec = env.ledger.sets.button;
  assert.equal(rec.variants.length, TOTAL);
  assert.equal(new Set(rec.variants).size, TOTAL, 'one node per variant');
  assert.equal(rec.variants[runs[0].plan.baseIndex], base.id, 'the Base Component is the default variant, same id');
  const set = await setNode(env);
  assert.equal(set.type, 'COMPONENT_SET');
  assert.equal(set.children.length, TOTAL);
  assert.equal(set.layoutMode, 'GRID');
  assert.deepEqual([set.gridRowCount, set.gridColumnCount], [35, 7]);
  assert.equal((await env.mock.figma.getNodeByIdAsync(base.id)).key, base.key);
  assert.equal(set.defaultVariant.id, base.id);
  assert.equal(set.defaultVariant.name, 'Kind=Primary, Size=Large, State=Enabled');
  // the ledger keeps every other section
  for (const k of ['foundations', 'icons', 'bases']) assert.ok(env.ledger[k], k);
});

test('a rerun updates nothing and creates nothing', async () => {
  const env = await setup();
  await buildAll(env);
  env.mock.log.length = 0;
  const reruns = await buildAll(env);
  for (const { result } of reruns) assert.deepEqual([result.summary.created, result.summary.updated, result.made], [0, 0, []], JSON.stringify(result.updated));
  assert.deepEqual(writes(env.mock), []);
  assert.equal((await setNode(env)).children.length, TOTAL);
});

// Variant ids are recorded by expansion index, so a Contract that expands differently must not reuse them:
// before this, the rebuild renamed variants onto other tuples and never finished placing them.
// The Button without its Focus state: an omit edit that drops 49 variants, approved again.
const withoutFocus = () => approve(applyOmit(BUTTON, { family: 'button', snapshotId: BUTTON.source.snapshotId, omit: [{ state: 'focus' }], expectedCount: TOTAL - 49 }), AT);
const LATER = '2026-10-17T00:00:00.000Z';

// #67 (ADR 0003): a dropped variant follows the rule for tokens dropped from the closure.
test('after an omit edit the rebuild finds every kept variant by name and moves the dropped ones to the ledger orphans, deleting nothing', async () => {
  const env = await setup();
  await buildAll(env);
  const set = await setNode(env);
  const ids = new Map(set.children.map(k => [k.name, k.id]));
  const keys = new Map(set.children.map(k => [k.name, k.key]));
  const omitted = withoutFocus();
  const runs = await buildAll(env, omitted, { at: LATER });
  for (const { result } of runs) {
    assert.deepEqual([result.summary.created, result.summary.updated, result.summary.dropped], [0, 0, 49], JSON.stringify(result.updated));
    assert.ok(result.outputBytes < 20000, `${result.outputBytes} bytes out`);
  }
  const rec = env.ledger.sets.button;
  assert.equal(rec.variants.length, TOTAL - 49);
  assert.deepEqual(rec.variants, expand(omitted).map(t => ids.get(variantName(omitted, t))));
  assert.equal(set.children.length, TOTAL, 'the sets slice never deletes a variant');
  const focus = [...ids.keys()].filter(n => n.endsWith('State=Focus'));
  assert.equal(focus.length, 49);
  assert.deepEqual(rec.orphans, Object.fromEntries(focus.map(n => [n, { id: ids.get(n), key: keys.get(n), droppedAt: LATER }])));
  const report = checkCoverage(omitted, (await sets(env, { mode: 'coverage' }, { contract: omitted })).result, env.ledger);
  assert.deepEqual(report.problems, [], 'an orphan is tracked, not a problem');
  assert.deepEqual(report.orphaned.sort(), focus.sort());
});

// The Button after a Base loop: an owner tweak to the root's max width (320 -> 288) that changes its contentHash but
// not its expansion, approved again.
const reapproved = () => {
  const c = asDraft(BUTTON);
  c.layout[0].set.Button.maxWidth = { ...c.layout[0].set.Button.maxWidth, raw: 288 };
  return approve(c, LATER);
};

// The live text-input rebuild: a set built with no Base Component, then a Base loop that built the base on its page,
// outside the set, and changed the Contract's hash. The rebuild keeps the recorded variants, their ids and so their instances:
// the one under the base's name takes the approved values, and the base is left as it is, named as unused.
test('after a contentHash change with a Base Component outside the set, the rebuild keeps every recorded variant id and duplicates no name', async () => {
  const env = await setup({ withBase: false });
  await buildAll(env);
  const before = [...env.ledger.sets.button.variants];
  const edited = reapproved();
  assert.notEqual(edited.selection.approval.contentHash, BUTTON.selection.approval.contentHash);
  assert.deepEqual(expand(edited).map(t => variantName(edited, t)), expand(BUTTON).map(t => variantName(BUTTON, t)), 'the same expansion');
  const { plan, state } = basePlan(edited, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: LATER, adopt: true });
  const built = await runPackage(pack(plan, state, COMPONENTS_CORE).code, env.mock.figma);
  assert.equal(built.summary.conflicts, 0, JSON.stringify(built.conflicts));
  env.ledger = recordResult(env.ledger, built);
  const base = await env.mock.figma.getNodeByIdAsync(env.ledger.bases.button.id);
  assert.equal(base.parent.type, 'PAGE', 'the Base loop built the base on the page, outside the set');
  assert.ok(!before.includes(base.id));
  // a read-only reconcile finds the set's own variants, the one under the base's name too (checked before any build
  // call: two variants of one name in the set never settle in the grid)
  const at = expand(edited).findIndex(t => variantName(edited, t) === base.name);
  const found = (await sets(env, { mode: 'reconcile' }, { contract: edited, drop: true })).result.ledger.sets.button.variants;
  assert.deepEqual([found[at], Object.values(found)], [before[at], before], 'every recorded variant found, the base not taken');

  const baseIds = new Set([base, ...base.findAll(() => true)].map(n => n.id));
  const from = env.mock.log.length;
  const runs = await buildAll(env, edited, { at: LATER });
  assert.deepEqual(env.mock.log.slice(from).filter(([, ...ids]) => ids.some(id => baseIds.has(id))), [], 'nothing written to the base');
  for (const { result } of runs) {
    assert.equal(result.summary.created, 0, JSON.stringify(result.summary));
    assert.deepEqual(result.unusedBase, { id: base.id, name: base.name }, 'the base is named as unused');
  }
  const set = await setNode(env);
  const names = set.children.map(k => k.name);
  assert.equal(new Set(names).size, names.length, 'no variant name twice');
  assert.equal(set.children.length, TOTAL);
  assert.deepEqual(env.ledger.sets.button.variants, before, 'every recorded variant id kept');
  assert.equal(env.ledger.sets.button.contentHash, edited.selection.approval.contentHash);
  // the recorded variant under the base's name reads back as the approved Contract
  const variant = await env.mock.figma.getNodeByIdAsync(before[at]);
  assert.deepEqual([variant.parent.id, variant.maxWidth], [set.id, 288]);
  const sample = await sets(env, { mode: 'sample', sample: [at] }, { contract: edited });
  const s = checkSample(edited, sample.result, env.ledger, DOC);
  assert.deepEqual([s.problems, s.sampled], [[], 1]);
  // the base is still there, on its page, where the Base loop left it
  assert.equal(await env.mock.figma.getNodeByIdAsync(base.id), base);
  assert.equal(base.parent.type, 'PAGE');
});

// selection.member, the bitset of the whole selection: build-plan writes it, the core decodes it to tell the
// variants dropped. Kind and Size have 7 values; tuples 3|4 and 39|40 sit either side of a hex digit, 244 in the
// last, partial one.
test('the selection bitset a reconcile carries decodes in the core to exactly the selected tuples', async () => {
  const env = await setup();
  await buildAll(env);
  const omit = [
    { kind: 'primary', size: 'xs', state: 'focus' },
    { kind: 'primary', size: 'xs', state: 'disabled' },
    { kind: 'secondary', size: 'xs', state: 'disabled' },
    { kind: 'secondary', size: 'sm', state: 'enabled' },
    { kind: 'danger--ghost', size: '2xl', state: 'disabled' },
  ];
  const picked = approve(applyOmit(BUTTON, { family: 'button', snapshotId: BUTTON.source.snapshotId, omit, expectedCount: TOTAL - 5 }), AT);
  const { plan, result } = await sets(env, { mode: 'reconcile' }, { contract: picked, drop: true });
  assert.equal(plan.selection.member.length, 62);
  assert.deepEqual(result.dropped.map(d => d[0]).sort(), [
    'Kind=Danger Ghost, Size=2XL, State=Disabled',
    'Kind=Primary, Size=Extra Small, State=Disabled',
    'Kind=Primary, Size=Extra Small, State=Focus',
    'Kind=Secondary, Size=Extra Small, State=Disabled',
    'Kind=Secondary, Size=Small, State=Enabled',
  ]);
  assert.deepEqual([result.summary.found, result.summary.absent], [TOTAL - 5, 0]);
});

test('a rebuild whose first call was lost and reconciled still keeps the dropped variants as orphans', async () => {
  const env = await setup();
  await buildAll(env);
  const ids = new Map((await setNode(env)).children.map(k => [k.name, k.id]));
  const omitted = withoutFocus();
  await sets(env, { batch: 0 }, { contract: omitted, drop: true });
  await sets(env, { mode: 'reconcile' }, { contract: omitted });
  await buildAll(env, omitted);
  const orphans = env.ledger.sets.button.orphans;
  assert.equal(Object.keys(orphans).length, 49);
  for (const [name, o] of Object.entries(orphans)) assert.equal(o.id, ids.get(name));
});

test('a node in the set the ledger never recorded stays extra, even under a dropped variant\'s name', async () => {
  const env = await setup();
  const omitted = withoutFocus();
  await buildAll(env, omitted);
  const stray = env.mock.figma.createComponent();
  stray.name = 'Kind=Primary, Size=Large, State=Focus';
  (await setNode(env)).appendChild(stray);
  await buildAll(env, omitted);
  assert.deepEqual(env.ledger.sets.button.orphans, {});
  const report = checkCoverage(omitted, (await sets(env, { mode: 'coverage' }, { contract: omitted })).result, env.ledger);
  assert.deepEqual(report.problems.map(p => [p.what, p.name]), [['extra', stray.name]]);
  assert.deepEqual(report.orphaned, []);
});

test('coverage matches an orphan by its ledger id: renamed by hand it is still orphaned, and a stray under its name after a hand deleted it is extra', async () => {
  const env = await setup();
  await buildAll(env);
  const omitted = withoutFocus();
  await buildAll(env, omitted);
  const orphans = env.ledger.sets.button.orphans;
  const renamed = 'Kind=Secondary, Size=Medium, State=Focus';
  (await env.mock.figma.getNodeByIdAsync(orphans[renamed].id)).name = 'Focus (old)';
  const replaced = 'Kind=Ghost, Size=Small, State=Focus';
  (await env.mock.figma.getNodeByIdAsync(orphans[replaced].id)).remove();
  const stray = env.mock.figma.createComponent();
  stray.name = replaced;
  (await setNode(env)).appendChild(stray);
  const report = checkCoverage(omitted, (await sets(env, { mode: 'coverage' }, { contract: omitted })).result, env.ledger);
  assert.deepEqual(report.problems.map(p => [p.what, p.name]), [['extra', replaced]]);
  assert.equal(report.orphaned.length, 48);
  assert.ok(report.orphaned.includes(renamed), 'listed under the name the ledger keeps');
  assert.ok(!report.orphaned.includes(replaced));
});

test('re-selecting a dropped variant reuses its orphan id and key, even after a hand renamed it, with no duplicate node', async () => {
  const env = await setup();
  await buildAll(env);
  await buildAll(env, withoutFocus(), { at: LATER });
  const orphans = env.ledger.sets.button.orphans;
  const name = 'Kind=Secondary, Size=Medium, State=Focus';
  const node = await env.mock.figma.getNodeByIdAsync(orphans[name].id);
  node.name = 'Focus (old)';
  const runs = await buildAll(env);
  assert.deepEqual(runs.map(r => r.result.summary.created), runs.map(() => 0));
  const rec = env.ledger.sets.button;
  assert.deepEqual(rec.orphans, {});
  assert.equal(rec.variants[expand(BUTTON).findIndex(t => variantName(BUTTON, t) === name)], orphans[name].id);
  assert.deepEqual([node.name, node.key], [name, orphans[name].key]);
  const set = await setNode(env);
  assert.equal(set.children.length, TOTAL);
  assert.deepEqual(checkCoverage(BUTTON, (await sets(env, { mode: 'coverage' })).result, env.ledger).problems, []);
});

test('coverage takes the set\'s page from the ledger or --page: a set built with --page P passes on P, a set on another page does not (#240)', async () => {
  const env = await setup({ withBase: false });
  await buildAll(env, BUTTON, { page: 'Text inputs' });
  const readback = (await sets(env, { mode: 'coverage', page: 'Text inputs' })).result;
  const pageProblems = (ledger, opts) => checkCoverage(BUTTON, readback, ledger, opts).problems.filter(p => p.what === 'set' && p.field === 'page');
  assert.deepEqual(pageProblems(env.ledger), [], 'the ledger records the page the set is on');
  assert.deepEqual(pageProblems(null, { page: 'Text inputs' }), [], '--page names it without a ledger');
  assert.deepEqual(pageProblems(null).map(p => [p.want, p.got]), [[BUTTON.figma.page, 'Text inputs']], 'no ledger and no --page: the Contract\'s page');
  assert.equal(pageProblems(null, { page: 'Elsewhere' }).length, 1, '--page names another page than the set is on');
  const moved = { ...env.ledger, sets: { button: { ...env.ledger.sets.button, page: '0:99' } } };
  assert.equal(pageProblems(moved).length, 1, 'a set on another page than the recorded one');
  assert.deepEqual(checkCoverage(BUTTON, readback, env.ledger).problems, []);
});

test('an orphan deleted by hand leaves the list, and the variant built again in its place is an orphan when dropped again', async () => {
  const env = await setup();
  await buildAll(env);
  await buildAll(env, withoutFocus());
  const name = 'Kind=Secondary, Size=Medium, State=Focus';
  const gone = env.ledger.sets.button.orphans[name].id;
  (await env.mock.figma.getNodeByIdAsync(gone)).remove();
  await buildAll(env);
  assert.deepEqual(env.ledger.sets.button.orphans, {});
  const made = env.ledger.sets.button.variants[expand(BUTTON).findIndex(t => variantName(BUTTON, t) === name)];
  assert.notEqual(made, gone);
  await buildAll(env, withoutFocus(), { at: LATER });
  assert.deepEqual(env.ledger.sets.button.orphans[name], { id: made, key: (await env.mock.figma.getNodeByIdAsync(made)).key, droppedAt: LATER });
});

test('a dropped variant a hand renamed before the rebuild is still an orphan, under the name it has', async () => {
  const env = await setup();
  await buildAll(env);
  const node = (await setNode(env)).children.find(k => k.name === 'Kind=Tertiary, Size=Small, State=Focus');
  node.name = 'Focus (old)';
  await buildAll(env, withoutFocus());
  const orphans = env.ledger.sets.button.orphans;
  assert.equal(Object.keys(orphans).length, 49);
  assert.equal(orphans['Focus (old)'].id, node.id);
});

// A Button set rebuilt without Focus: 49 orphans, two of them used by instances on another page.
async function orphaned() {
  const env = await setup();
  await buildAll(env);
  const omitted = withoutFocus();
  await buildAll(env, omitted);
  const used = 'Kind=Primary, Size=Large, State=Focus';
  const page = env.mock.figma.createPage();
  page.name = 'Screens';
  const main = await env.mock.figma.getNodeByIdAsync(env.ledger.sets.button.orphans[used].id);
  for (let i = 0; i !== 2; i++) page.appendChild(main.createInstance());
  return { env, omitted, used, page, main };
}

const preview = async (env, omitted) => (await sets(env, { mode: 'prune-preview' }, { contract: omitted })).result;

test('a read-only prune preview lists every orphan with its instance count in this file, and says other files are not counted', async () => {
  const { env, omitted, used } = await orphaned();
  env.mock.log.length = 0;
  const result = await preview(env, omitted);
  assert.deepEqual(writes(env.mock), []);
  const names = Object.keys(env.ledger.sets.button.orphans);
  assert.deepEqual(Object.keys(result.orphans).sort(), names.sort());
  assert.equal(result.orphans[used], 2);
  assert.equal(result.orphans['Kind=Ghost, Size=Small, State=Focus'], 0);
  assert.match(result.scope, /other files are not counted/);
  // the preview needs the rebuild finished: a set still built from another Contract has no settled orphans
  assert.throws(() => setsPlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, mode: 'prune-preview' }), /rebuild every batch/);
});

test('prune deletes only the orphans on the owner-confirmed list, and refuses a name that is not an orphan or whose count changed', async () => {
  const { env, omitted, used, page, main } = await orphaned();
  const counts = (await preview(env, omitted)).orphans;
  const quiet = 'Kind=Ghost, Size=Small, State=Focus';
  const prune = list => sets(env, { mode: 'prune', prune: list }, { contract: omitted });

  const kept = 'Kind=Primary, Size=Large, State=Enabled';
  env.mock.log.length = 0;
  const notOrphan = await prune({ [quiet]: counts[quiet], [kept]: 0 });
  assert.deepEqual(notOrphan.result.conflicts, [{ kind: 'prune', name: kept, reason: 'not-orphan' }]);
  assert.deepEqual(writes(env.mock), [], 'a refused prune changes nothing');
  page.appendChild(main.createInstance()); // a third instance since the preview
  env.mock.log.length = 0;
  const stale = await prune({ [quiet]: counts[quiet], [used]: counts[used] });
  assert.deepEqual(stale.result.conflicts, [{ kind: 'prune', name: used, reason: 'stale: 3 instances, the preview counted 2' }]);
  assert.deepEqual(writes(env.mock), [], 'a refused prune changes nothing');

  // the list the owner confirmed, written from the preview so each count is the one they saw
  const fresh = await preview(env, omitted);
  assert.throws(() => pruneList(fresh, [kept]), /not an orphan in the preview/);
  const list = pruneList(fresh, [quiet]);
  assert.deepEqual(list, { schemaVersion: 1, fileKey: FILE_KEY, family: 'button', prune: { [quiet]: 0 } });
  const before = { ...env.ledger.sets.button.orphans };
  const { result } = await prune(list.prune);
  assert.deepEqual([result.pruned, result.summary.pruned], [[quiet], 1]);
  assert.equal(await env.mock.figma.getNodeByIdAsync(before[quiet].id), null);
  const after = env.ledger.sets.button.orphans;
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).filter(n => n !== quiet).sort(), 'only the listed orphan leaves the ledger');
  for (const n of Object.keys(after)) assert.ok(await env.mock.figma.getNodeByIdAsync(after[n].id), `${n} stays`);
  assert.equal(env.ledger.sets.button.variants.length, TOTAL - 49, 'the variant ids are kept');
  for (const { result: r } of await buildAll(env, omitted)) assert.equal(r.summary.created, 0, 'a rebuild does not bring it back');
  assert.deepEqual(checkCoverage(omitted, (await sets(env, { mode: 'coverage' }, { contract: omitted })).result, env.ledger).problems, []);
});

test('a prune whose result was lost can be sent again: an orphan it already deleted is not stale', async () => {
  const { env, omitted } = await orphaned();
  const quiet = 'Kind=Ghost, Size=Small, State=Focus';
  const list = pruneList(await preview(env, omitted), [quiet]);
  await sets(env, { mode: 'prune', prune: list.prune }, { contract: omitted, drop: true });
  const { result } = await sets(env, { mode: 'prune', prune: list.prune }, { contract: omitted });
  assert.deepEqual([result.summary.conflicts, result.pruned], [0, [quiet]]);
  assert.ok(!(quiet in env.ledger.sets.button.orphans));
});

test('an orphan a hand moved out of the set is refused by the preview and the prune, which delete nothing; a reconcile lets it go', async () => {
  const { env, omitted, page } = await orphaned();
  const moved = 'Kind=Ghost, Size=Small, State=Focus';
  const node = await env.mock.figma.getNodeByIdAsync(env.ledger.sets.button.orphans[moved].id);
  page.appendChild(node);
  env.mock.log.length = 0;
  const shown = await preview(env, omitted);
  assert.deepEqual(shown.conflicts, [{ kind: 'prune', name: moved, reason: 'moved out of the set' }]);
  assert.equal(shown.orphans, undefined);
  const { result } = await sets(env, { mode: 'prune', prune: { [moved]: 0 } }, { contract: omitted });
  assert.deepEqual(result.conflicts, [{ kind: 'prune', name: moved, reason: 'moved out of the set' }]);
  assert.deepEqual(writes(env.mock), [], 'a refused prune changes nothing');
  assert.equal(await env.mock.figma.getNodeByIdAsync(node.id), node);
  // the node is no longer the set's, so the next reconcile drops it from the orphans and the preview runs again
  await sets(env, { mode: 'reconcile' }, { contract: omitted });
  assert.ok(!(moved in env.ledger.sets.button.orphans));
  assert.equal((await preview(env, omitted)).summary.orphans, 48);
});

// One rule for the Base Component's property values: the review specimen (every BOOLEAN on) while it stands
// alone, the property defaults once its Component Set holds it, for the build and the readback alike.
test('inside its set the Base Component is built and read at the property defaults: a base rerun writes nothing and diffs clean', async () => {
  const env = await setup();
  const alone = basePlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT }).plan.base.visible;
  assert.deepEqual(alone, { Label: true, Icon: true, Glyph: true }, 'the review specimen: Icon on');
  await buildAll(env);
  for (const readOnly of [false, true]) {
    const { plan, state } = basePlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, readOnly });
    assert.equal(plan.base.visible.Glyph, false, 'in the set: Icon at its default (off)');
    const result = await runPackage(pack(plan, state, COMPONENTS_CORE).code, env.mock.figma);
    assert.deepEqual([result.summary.conflicts, result.summary.created, result.summary.updated], [0, 0, 0], JSON.stringify(result.updated));
    const readback = normalizeBaseResult(result, env.ledger);
    assert.equal(readback.specimen, 'set');
    const d = diff(BUTTON, readback, DOC);
    assert.deepEqual([d.changes, d.unread], [[], []]);
  }
  // the sets rerun after the base rerun still writes nothing: no ping-pong over the Glyph's visibility
  env.mock.log.length = 0;
  for (const { result } of await buildAll(env)) assert.deepEqual([result.summary.created, result.summary.updated], [0, 0]);
});

test('after a lost connection the ledger is reconciled before the retry, and nothing duplicates', async () => {
  const env = await setup();
  const { plan } = await sets(env, { batch: 0 });
  await sets(env, { batch: 1 }, { drop: true }); // committed in the file, result lost
  const lost = env.ledger.sets.button.variants.filter(Boolean).length;
  const { result } = await sets(env, { mode: 'reconcile' });
  assert.equal(result.summary.found, 2 * plan.options.perCall, 'the loose variants, found by name on the page');
  assert.ok(env.ledger.sets.button.variants.filter(Boolean).length > lost);
  const retry = await sets(env, { batch: 1 });
  assert.equal(retry.result.summary.created, 0);
  const runs = await buildAll(env);
  assert.equal((await setNode(env)).children.length, TOTAL);
  assert.equal(new Set(env.ledger.sets.button.variants).size, TOTAL);
  assert.ok(runs.length > 2);
});

test('the coverage check matches every Prop=Value label, cell and wiring; a sampled value diff and the Theme modes pass', async () => {
  const env = await setup();
  await buildAll(env);
  const cov = await sets(env, { mode: 'coverage' });
  assert.ok(cov.result.outputBytes < 20000, `coverage readback is ${cov.result.outputBytes} bytes`);
  const report = checkCoverage(BUTTON, cov.result);
  assert.deepEqual(report.problems, []);
  assert.equal(report.read, TOTAL);
  const sample = await sets(env, { mode: 'sample', sample: [0, 37, 120, 244] });
  const s = checkSample(BUTTON, sample.result, env.ledger, DOC);
  assert.deepEqual(s.problems, []);
  assert.equal(s.sampled, 4);
  env.mock.log.length = 0;
  const theme = await sets(env, { mode: 'theme', sample: [0, 120] });
  const t = checkTheme(BUTTON, theme.result, DOC);
  assert.deepEqual(t.problems, []);
  assert.ok(t.checked > 0 && t.switching > 0, JSON.stringify(t));
  assert.deepEqual(writes(env.mock), [], 'the theme read restores the modes and writes nothing else');
  assert.deepEqual((await setNode(env)).parent.parent.explicitVariableModes, {});
});

// The Button with a CDS-style spinner (#442), stroked with a token the closure document's foundations build has.
const spinnerContract = edit => approve(withSpinner(BUTTON, (layout, paint) => { paint.Track.stroke = { token: 'focus' }; edit(layout, paint); }), AT, { prototype: true });

test('a spinner set packages and fits; coverage finds an absolute node off its centre past the half pixel, and a sample diffs clean', async () => {
  const env = await setup({ withBase: false });
  const spinner = spinnerContract(() => {});
  const runs = await buildAll(env, spinner, { prototype: true });
  for (const { out } of runs) assert.ok(out.chars <= 50000, `${out.chars} chars`);
  assert.deepEqual(runs[0].plan.tree.children.find(c => c.name === 'Spinner').children.map(c => c.type), ['ELLIPSE', 'VECTOR']);
  // every variant's fresh Arc keeps its round cap after one build pass (#455: 479 of 480 lost it live)
  const caps = (await setNode(env)).children.map(v => v.findOne(x => x.name === 'Arc').strokeCap);
  assert.deepEqual([caps.length, [...new Set(caps)]], [TOTAL, ['ROUND']]);
  const cover = async () => (await sets(env, { mode: 'coverage', prototype: true }, { contract: spinner })).result;
  assert.deepEqual(checkCoverage(spinner, await cover()).problems, []);
  const sample = await sets(env, { mode: 'sample', sample: [0, 120, TOTAL - 1], prototype: true }, { contract: spinner });
  assert.deepEqual(checkSample(spinner, sample.result, env.ledger, DOC).problems, []);
  // the VECTOR's stroke is bound like any other layer's, so the theme read resolves it per mode
  env.mock.log.length = 0;
  const read = (await sets(env, { mode: 'theme', sample: [0, 120], prototype: true }, { contract: spinner })).result;
  const theme = checkTheme(spinner, read, DOC);
  assert.deepEqual(theme.problems, []);
  assert.ok(Object.values(read.theme).every(colours => colours['Arc.stroke']), JSON.stringify(read.theme));
  assert.deepEqual(writes(env.mock), [], 'the theme read writes nothing');
  const variant = (await setNode(env)).children[3];
  variant.findOne(x => x.name === 'Spinner').x += 0.6;
  const off = await cover();
  assert.deepEqual(checkCoverage(spinner, off).problems.map(p => ({ ...p, px: Math.round(p.px * 1e3) / 1e3 })),
    [{ what: 'off-centre', name: variant.name, node: 'Spinner', px: 0.1 }]);
  const { offCentre, ...unread } = off;
  assert.deepEqual(checkCoverage(spinner, unread).problems, [{ what: 'off-centre', reason: 'unread' }]);
  // an ELLIPSE drawn as an arc in some variants and a full circle in others has no one layer tree for the set
  const mixed = spinnerContract(layout => { layout.Arc.arc = { start: 0, sweep: 360 }; });
  mixed.layout.push({ match: { size: 'sm' }, set: { Arc: { arc: { start: 0, sweep: 270 } } } });
  assert.throws(() => setsPlan(approve(asDraft(mixed), AT, { prototype: true }), DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, prototype: true, batch: 0 }), /the ELLIPSE Arc is an arc in some selected variants and a full circle in others/);
});

test('a set whose absolute node is an ELLIPSE itself packages, fits and covers clean', async () => {
  const env = await setup({ withBase: false });
  const draft = withSpinner(BUTTON, (layout, paint) => {
    paint.Track.stroke = { token: 'focus' };
    Object.assign(layout.Track, { position: 'absolute', constraints: { horizontal: 'center', vertical: 'center' } });
  });
  // the Track leaves the Spinner for the root, which has Auto Layout
  draft.anatomy.children.push(draft.anatomy.children.find(c => c.name === 'Spinner').children.shift());
  const ring = approve(draft, AT, { prototype: true });
  const runs = await buildAll(env, ring, { prototype: true });
  for (const { out } of runs) assert.ok(out.chars <= 50000, `${out.chars} chars`);
  assert.equal(runs[0].plan.tree.children.find(c => c.name === 'Track').type, 'ELLIPSE');
  const cover = (await sets(env, { mode: 'coverage', prototype: true }, { contract: ring })).result;
  assert.deepEqual(checkCoverage(ring, cover).problems, []);
  assert.deepEqual(cover.offCentre, []);
});

test('a first loose batch lost before its ledger is found again by a reconcile, and the retry creates nothing', async () => {
  const env = await setup();
  const base = env.ledger.bases.button.id;
  const lost = await sets(env, { batch: 1 }, { drop: true }); // any batch may go first: the Base Component waits on the page
  assert.deepEqual(env.ledger.sets, {}, 'the result was lost');
  const per = lost.plan.options.perCall;
  const loose = () => env.mock.figma.root.children.find(p => p.name === 'Buttons').children.filter(n => n.type === 'COMPONENT');
  assert.equal(loose().length, per + 1, 'the batch and the Base Component, loose on the page');
  env.mock.log.length = 0;
  const blind = await sets(env, { batch: 1 });
  assert.ok(blind.result.summary.conflicts > 0, 'a retry without the ledger stops on what the lost call made');
  assert.deepEqual(writes(env.mock), [], 'a conflict stops before the first change');
  const rec = await sets(env, { mode: 'reconcile' });
  assert.equal(rec.result.summary.found, per + 1, JSON.stringify(rec.result));
  const retry = await sets(env, { batch: 1 });
  assert.deepEqual([retry.result.summary.created, retry.result.made], [0, []]);
  assert.equal(loose().length, per + 1);
  await buildAll(env);
  assert.equal((await setNode(env)).defaultVariant.id, base);
  const pages = env.mock.figma.root.children.map(p => p.name);
  assert.deepEqual(pages.filter(n => n === 'Buttons').length, 1);
  assert.deepEqual(pages.filter(n => n === 'Templates').length, 1);
});

test('a family without a Base Component (the 539-variant slope set) builds beside the Button, sharing the Header template', async () => {
  const env = await setup();
  await buildAll(env);
  const slope = slopeContract();
  const runs = await buildAll(env, slope, { prototype: true });
  const of = runs[0].plan.options.of;
  assert.deepEqual(runs.map(r => r.plan.options.phase || r.plan.options.mode), [...Array(of).fill('loose'), 'combine', 'place']);
  for (const { out } of runs) assert.ok(out.chars < 50000, `${out.chars} chars`);
  assert.equal(env.ledger.sets['button-slope'].variants.filter(Boolean).length, 539);
  assert.equal(env.ledger.sets.button.variants.length, TOTAL, 'the Button section is kept');
  const cov = await sets(env, { mode: 'coverage', prototype: true }, { contract: slope });
  assert.deepEqual(checkCoverage(slope, cov.result).problems, []);
  assert.ok(cov.result.outputBytes < 20000, `${cov.result.outputBytes} bytes`);
  const pages = env.mock.figma.root.children.map(p => p.name);
  assert.deepEqual(pages.filter(n => n === 'Templates').length, 1);
  assert.ok(pages.includes('TEMP slope'));
});

test('every token-backed value is bound: a fill typed raw by hand fails the theme check, and the rerun rebinds it alone', async () => {
  const env = await setup();
  await buildAll(env);
  const set = await setNode(env);
  const victim = set.children.find(k => k.name === 'Kind=Tertiary, Size=Medium, State=Hover');
  const index = expand(BUTTON).findIndex(t => variantName(BUTTON, t) === victim.name);
  const colour = victim.fills[0].color;
  victim.fills = [{ type: 'SOLID', color: { ...colour } }]; // same colour, no variable
  const t = checkTheme(BUTTON, (await sets(env, { mode: 'theme', sample: [index] })).result, DOC);
  assert.deepEqual(t.problems.map(p => [p.what, p.at]), [['unbound', 'Button.fill']]);
  const runs = await buildAll(env);
  assert.deepEqual(runs.map(r => r.result.summary.updated), runs.map((r, i) => (i === Math.floor(index / r.plan.options.perCall) ? 1 : 0)));
  assert.deepEqual((await buildAll(env)).map(r => r.result.summary.updated), runs.map(() => 0));
  assert.deepEqual(checkTheme(BUTTON, (await sets(env, { mode: 'theme', sample: [index] })).result, DOC).problems, []);
});

test('the coverage check catches a renamed, a moved and a deleted variant, and a rerun repairs them', async () => {
  const env = await setup();
  await buildAll(env);
  const set = await setNode(env);
  const [a, b, c] = [set.children[3], set.children[50], set.children[100]];
  const lost = c.name;
  a.name = 'Kind=Primary, Size=Huge, State=Enabled';
  set.gridRowCount = 36; // a hand drags a variant below the grid
  b.setGridChildPosition(35, 0);
  c.remove();
  set.dashPattern = [4, 4]; // and restyles the grid
  set.parent.itemSpacing = 40;
  const report = checkCoverage(BUTTON, (await sets(env, { mode: 'coverage' })).result);
  const kinds = report.problems.map(p => p.what);
  for (const k of ['label', 'extra', 'missing', 'cell']) assert.ok(kinds.includes(k), `${k} in ${kinds}`);
  assert.ok(report.problems.some(p => p.what === 'set' && p.field === 'dash'), JSON.stringify(report.problems.filter(p => p.what === 'set')));
  assert.ok(report.problems.some(p => p.what === 'content' && p.field === 'gap'));
  assert.ok(report.problems.some(p => p.what === 'missing' && p.name === lost));
  await buildAll(env);
  assert.deepEqual(checkCoverage(BUTTON, (await sets(env, { mode: 'coverage' })).result).problems, []);
  assert.equal(set.children.length, TOTAL);
});

// Every plan shape the build emits, through the real packager: pack() fails on a refusal, with its reason. #180's
// set-only append was refused (the guard came in #190), and only the live check caught it. The shapes are To-design's
// own steps and the ones Vibe-to-Figma's nextOf derives from setsPlan: an update's `indexes` append, the set-only
// call (`indexes` []), a coverage or rebuild batch and a check's sample. Vibe-to-Figma packages namespaced(plan),
// which renames only the collections and the templates page, none of which the packager checks.
function shapeOf(plan) {
  if (plan.slice === 'foundations') return plan.chunk ? `foundations chunk ${plan.chunk.index === 1 ? 'first' : 'later'}` : 'foundations';
  if (plan.slice === 'base') return plan.options.readOnly ? 'base read-only' : 'base';
  if (plan.slice !== 'sets') return plan.slice;
  const { mode = 'build', phase, picked } = plan.options;
  if (mode !== 'build') return mode;
  return `build ${phase}${picked === 0 ? ' set-only' : picked != null ? ' indexes' : ''}`;
}

test('every plan shape the build emits is accepted by the packager, set-only append included', async () => {
  const shapes = new Set();
  const seen = ({ plan }) => shapes.add(shapeOf(plan));
  const packed = ({ plan, state }, core) => { seen({ plan }); return pack(plan, state, core).code; };

  // foundations from scratch, in one call and chunked (a small budget, as foundations-subset.test does: a later
  // chunk carries only its own part of the ledger), and the icons
  packed(foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, at: AT }), CORE);
  const budget = 14000;
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  const first = await runPackage(packed(foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, at: AT, budget }), CORE), mock.figma);
  packed(foundationsPlan(DOC_TEXT, recordResult(null, first), { fileKey: FILE_KEY, at: AT, budget, chunk: 2 }), CORE);
  packed(iconsPlan([BUTTON], ICONS_DIR, null, { fileKey: FILE_KEY, at: AT }), CORE);
  const env = await setup();
  packed(basePlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT }), COMPONENTS_CORE);
  // a first set build: loose batches, one combine, then the place calls (#168)
  for (const run of await buildAll(env)) seen(run);
  // once the set is built: foundations alone (#180 sends the ledger's foundations only), the base read and rerun
  packed(foundationsPlan(DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT }), CORE);
  packed(basePlan(BUTTON, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, readOnly: true }), COMPONENTS_CORE);
  // a rerun or rebuild batch, an update's changed variants (#180), and the set-only call: a rerun whose Foundations
  // need no call and whose update picks no variant, so it sends the set's name, properties and grid alone
  seen(await sets(env, { batch: 1 }));
  seen(await sets(env, { mode: 'build', indexes: [3, 40] }));
  const setOnly = await sets(env, { mode: 'build', indexes: [] });
  assert.deepEqual([setOnly.plan.selection.entries, setOnly.result.summary.conflicts], [[], 0]);
  seen(setOnly);
  // the read-only modes, whole and by batch as Vibe-to-Figma's coverage and To-design's reconcile take them
  for (const options of [{ mode: 'reconcile' }, { mode: 'reconcile', batch: 0 }, { mode: 'coverage' }, { mode: 'coverage', batch: 0, coveragePerCall: 100 },
    { mode: 'sample', sample: [0, 37] }, { mode: 'theme', sample: [0, 120] }]) seen(await sets(env, options));
  // a rebuild after an omit edit leaves orphans: the prune preview, then a prune of one the owner listed
  const omitted = withoutFocus();
  for (const run of await buildAll(env, omitted)) seen(run);
  const shown = await sets(env, { mode: 'prune-preview' }, { contract: omitted });
  seen(shown);
  const quiet = 'Kind=Ghost, Size=Small, State=Focus';
  seen(await sets(env, { mode: 'prune', prune: pruneList(shown.result, [quiet]).prune }, { contract: omitted }));

  // every slice, build phase and mode: a mode added to SET_MODES, or a shape added here, without the other fails
  const builds = ['build loose', 'build append', 'build append indexes', 'build append set-only'];
  assert.deepEqual([...shapes].sort(), ['foundations', 'foundations chunk first', 'foundations chunk later', 'icons', 'base', 'base read-only',
    ...builds, ...SET_MODES.filter(m => m !== 'build')].sort());
});

test('rehash moves a built set to an edit the builder never reads, and refuses one it reads (#389)', async () => {
  const env = await setup();
  await buildAll(env);
  const edited = edit => { const c = asDraft(BUTTON); edit(c); return approve(c, AT); };
  const evidence = edited(c => { c.axes[0].defaultSource += ' (re-cited)'; });
  const opts = { fileKey: FILE_KEY, at: AT };
  assert.ok(setsPlan(evidence, DOC_TEXT, env.ledger, { ...opts, next: true }), 'without a rehash the moved hash asks for every batch again');
  const ledger = rehashSets(BUTTON, evidence, DOC_TEXT, env.ledger, { fileKey: FILE_KEY });
  assert.equal(setsPlan(evidence, DOC_TEXT, ledger, { ...opts, next: true }), null, 'built: nothing to re-run');
  assert.deepEqual(ledger.sets.button.variants, env.ledger.sets.button.variants);
  assert.equal(ledger.bases.button.contentHash, ledger.sets.button.contentHash, 'the Base record moves with the set');
  const layout = edited(c => { c.layout[0].set.Button.alignMain = 'center'; });
  assert.throws(() => rehashSets(BUTTON, layout, DOC_TEXT, env.ledger, { fileKey: FILE_KEY }), /build batch 0 differs .* needs its batches rebuilt/);
  assert.throws(() => rehashSets(evidence, layout, DOC_TEXT, env.ledger, { fileKey: FILE_KEY }), /not recorded as built from --from/);
});
