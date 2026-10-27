// A family's first build (#168, ADR 0004): loose components, then one combine-only call, then grid placement
// and property wiring across calls under a time budget. Re-runs append into the existing set. Every phase is
// resumable. Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, asDraft, expand } from '../../contract/scripts/contract.mjs';
import { appendPerCall, basePlan, documentHash, foundationsPlan, iconsPlan, MAX_COMBINE, PER_CALL, SETS_BUDGET, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage } from '../scripts/coverage.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';
import { BUTTON_CLOSURE_DOC, CORE, COMPONENTS_CORE, ROOT } from './chain.mjs';
import { pack } from './pack.mjs';

const BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8'));
const DOC_TEXT = readFileSync(BUTTON_CLOSURE_DOC, 'utf8');
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const SHADCN_DOC = readFileSync(join(ROOT, 'design-systems/shadcn/shadcn.foundations.json'), 'utf8');
const SHADCN_BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/shadcn/contracts/button.component.json'), 'utf8'));
// The Button set as the Adapter drafted it, before the owner's omit patch: 2304 variants, the large set B′ was measured on.
const SHADCN_2304 = asDraft({ ...SHADCN_BUTTON, selection: { ...SHADCN_BUTTON.selection, omit: SHADCN_BUTTON.selection.omit.slice(0, 1), expectedCount: 2304 } });
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-18T00:00:00.000Z';
const TOTAL = expand(BUTTON).length;

async function setup() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  let ledger = null;
  for (const [derive, core] of [
    [() => foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT }), CORE],
    [() => iconsPlan([BUTTON], ICONS_DIR, ledger, { fileKey: FILE_KEY, at: AT }), CORE],
    [() => basePlan(BUTTON, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT }), COMPONENTS_CORE],
  ]) {
    const { plan, state } = derive();
    const result = await runPackage(pack(plan, state, core).code, mock.figma);
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    ledger = recordResult(ledger, result);
  }
  return { mock, ledger };
}

// One call from a derived plan; records a conflict-free result unless `drop` (a lost response).
async function run(env, derived, { drop = false } = {}) {
  const { plan, state } = derived;
  const { code, out } = pack(plan, state, COMPONENTS_CORE);
  const from = env.mock.log.length;
  const result = await runPackage(code, env.mock.figma);
  assert.ok(!result.error, JSON.stringify(result));
  if (!drop && result.summary.conflicts === 0 && result.ledger) env.ledger = recordResult(env.ledger, result);
  return { plan, result, out, log: env.mock.log.slice(from) };
}
const derive = (env, options = {}, contract = BUTTON) => setsPlan(contract, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, ...options });
const next = (env, options = {}) => derive(env, { next: true, ...options });

// Runs the first build to the end, one --next call at a time.
async function firstBuild(env, options = {}) {
  const runs = [];
  for (let d = next(env, options); d; d = next(env, options)) runs.push(await run(env, d));
  return runs;
}

const writes = log => log.filter(([op]) => !['setCurrentPage', 'loadFont', 'setExplicitVariableMode', 'clearExplicitVariableMode'].includes(op));
const page = env => env.mock.figma.root.children.find(p => p.name === BUTTON.figma.page);
const loose = env => page(env).children.filter(n => n.type === 'COMPONENT');
const setsOn = env => page(env).findAll(n => n.type === 'COMPONENT_SET');
const setNode = env => env.mock.figma.getNodeByIdAsync(env.ledger.sets.button.set.id);
const phaseOf = r => r.plan.options.phase || r.plan.options.mode;
const loosePhase = async env => { const runs = []; for (let d = next(env); d && d.plan.options.mode === 'build'; d = next(env)) runs.push(await run(env, d)); return runs; };

test('a first build runs loose batches, one combine-only call, then placement, and every property is wired', async () => {
  const env = await setup();
  const base = { ...env.ledger.bases.button };
  const runs = [];
  for (let d = next(env); d; d = next(env)) {
    const r = await run(env, d);
    runs.push(r);
    assert.equal(r.result.summary.conflicts, 0, JSON.stringify(r.result.conflicts));
    assert.ok(r.out.chars < 50000, `${phaseOf(r)}: ${r.out.chars} chars`);
    assert.ok(r.result.outputBytes < 20000, `${phaseOf(r)}: ${r.result.outputBytes} bytes out`);
    if (phaseOf(r) === 'loose') assert.deepEqual(setsOn(env), [], 'no set while the loose phase runs');
  }
  const phases = runs.map(phaseOf);
  const of = runs[0].plan.options.of;
  assert.deepEqual(phases, [...Array(of).fill('loose'), 'combine', 'place']);
  assert.equal(runs.slice(0, of).reduce((m, r) => m + r.plan.selection.entries.length, 0), TOTAL);

  // the combine call only combines and moves the set into Content: no styling, placement or property
  const combine = runs[of];
  const ops = writes(combine.log).map(([op]) => op);
  assert.equal(ops.filter(op => op === 'combineAsVariants').length, 1);
  for (const op of ['setGridChildPosition', 'node.layoutMode', 'addComponentProperty', 'createComponent', 'node.componentPropertyReferences'])
    assert.ok(!ops.includes(op), `the combine call ran ${op}`);
  assert.equal(combine.result.summary.idsKept, true, 'combineAsVariants keeps the loose components\' ids');
  assert.equal(combine.result.summary.variants, TOTAL);

  const set = await setNode(env);
  assert.deepEqual([set.parent.name, set.parent.parent.name], ['Content', 'Components']);
  assert.equal(set.children.length, TOTAL);
  assert.deepEqual(loose(env), [], 'every loose component joined the set');
  const rec = env.ledger.sets.button;
  assert.equal(rec.placed, true);
  assert.equal(new Set(rec.variants).size, TOTAL);
  assert.deepEqual(rec.variants.slice().sort(), set.children.map(k => k.id).sort(), 'the ledger ids are the set\'s');
  assert.equal(set.defaultVariant.id, base.id, 'the Base Component keeps its id and sits top-left');
  assert.equal(set.defaultVariant.key, base.key);
  const cov = await run(env, derive(env, { mode: 'coverage' }));
  assert.deepEqual(checkCoverage(BUTTON, cov.result, env.ledger).problems, []);
  assert.equal(next(env), null, 'the first build is done');
});

test('a re-run appends into the existing set and writes nothing', async () => {
  const env = await setup();
  await firstBuild(env);
  env.mock.log.length = 0;
  const first = derive(env, { batch: 0 });
  assert.equal(first.plan.options.phase, 'append');
  for (let batch = 0; batch !== first.plan.options.of; batch++) {
    const { result } = await run(env, derive(env, { batch }));
    assert.deepEqual([result.summary.created, result.summary.updated, result.made], [0, 0, []], JSON.stringify(result.updated));
  }
  assert.deepEqual(writes(env.mock.log), []);
});

test('a loose batch run again finds its components by name on the page and creates none', async () => {
  const env = await setup();
  await run(env, next(env));
  const before = loose(env).length;
  // the ledger lost the batch's ids: the retry finds the components by name
  env.ledger.sets.button.variants = env.ledger.sets.button.variants.map(() => null);
  const again = await run(env, derive(env, { batch: 0 }));
  assert.equal(again.plan.options.phase, 'loose');
  assert.deepEqual([again.result.summary.created, again.result.summary.updated], [0, 0], JSON.stringify(again.result.updated));
  assert.equal(loose(env).length, before);
});

test('a combine that rolled back is sent again and adopts the loose components by name; a lost combine result adopts the set', async () => {
  const env = await setup();
  await loosePhase(env);
  const looseIds = loose(env).map(n => n.id).sort();
  assert.equal(looseIds.length, TOTAL);
  // a rolled-back combine leaves the file and the ledger as they were: the next derive is the combine again
  const d = next(env);
  assert.equal(d.plan.options.mode, 'combine');
  assert.equal(d.plan.selection.entries.length, 0, 'the combine call carries no per-variant data');
  const lost = await run(env, d, { drop: true });
  assert.equal(lost.result.summary.variants, TOTAL);
  const set = setsOn(env)[0];
  assert.deepEqual(set.children.map(k => k.id).sort(), looseIds, 'combined by name, each loose component once');
  // the result was lost: the combine is sent again and adopts the set it made
  const again = await run(env, next(env));
  assert.deepEqual(again.result.made, []);
  assert.ok(!writes(again.log).some(([op]) => op === 'combineAsVariants' || op === 'createComponent'));
  assert.equal(env.ledger.sets.button.set.id, set.id);
  assert.equal(setsOn(env).length, 1);
  await firstBuild(env);
  assert.deepEqual(checkCoverage(BUTTON, (await run(env, derive(env, { mode: 'coverage' }))).result, env.ledger).problems, []);
});

test('the combine refuses, before any change, a loose variant missing from the page or a duplicate name', async () => {
  const env = await setup();
  await loosePhase(env);
  const victim = loose(env)[7];
  const name = victim.name;
  const twin = env.mock.figma.createComponent();
  page(env).appendChild(twin);
  twin.name = name;
  env.mock.log.length = 0;
  const dup = await run(env, next(env));
  assert.equal(dup.result.summary.conflicts, 1);
  assert.match(dup.result.conflicts[0].reason, /duplicate/);
  assert.deepEqual(writes(dup.log), []);
  twin.remove();
  victim.remove();
  const miss = await run(env, next(env));
  assert.match(miss.result.conflicts[0].reason, /1 of 245 .*not on the page/);
  assert.deepEqual(writes(miss.log), []);
  assert.deepEqual(setsOn(env), []);
  // a loose id the ledger never recorded (a lost loose result) holds the combine back in the plan
  env.ledger.sets.button.variants[3] = null;
  const step = next(env);
  assert.deepEqual([step.plan.options.mode, step.plan.options.batch], ['build', 0], 'the next step re-runs the batch that holds it');
  assert.throws(() => derive(env, { mode: 'combine' }), /not recorded/);
});

test('placement resumes across calls under a time budget, and build batches wait for it', async () => {
  const env = await setup();
  await loosePhase(env);
  await run(env, next(env)); // combine
  assert.equal(env.ledger.sets.button.placed, false);
  assert.throws(() => derive(env, { batch: 0 }), /--mode place/);
  const lefts = [];
  for (let i = 0; i !== 3; i++) {
    const d = next(env, { budget: 0 });
    assert.equal(d.plan.options.mode, 'place');
    const { result } = await run(env, d);
    assert.equal(result.summary.placed, false);
    lefts.push(result.summary.left);
  }
  assert.ok(lefts[0] > lefts[1] && lefts[1] > lefts[2], `each cut call still places: ${lefts}`);
  assert.equal(env.ledger.sets.button.placed, false);
  const runs = await firstBuild(env);
  assert.deepEqual(runs.map(phaseOf), ['place']);
  assert.equal(runs[0].result.summary.placed, true);
  assert.equal(env.ledger.sets.button.placed, true);
  assert.deepEqual(checkCoverage(BUTTON, (await run(env, derive(env, { mode: 'coverage' }))).result, env.ledger).problems, []);
});

test('combineAsVariants ids: a combine that changed them clears the ledger ids, and the re-run finds the variants by name', () => {
  const rec = { page: '1:1', section: '1:2', set: null, props: {}, variants: { 0: '9:1', 1: '9:2' }, total: 2, contentHash: 'h', placed: false };
  let ledger = recordResult(null, { slice: 'sets', fileKey: 'K', family: 'f', mode: 'build', ledger: { sets: { f: rec } } });
  assert.deepEqual(ledger.sets.f.variants, ['9:1', '9:2']);
  const combined = { ...rec, set: { id: '5:5' }, variants: {} };
  const kept = recordResult(ledger, { slice: 'sets', fileKey: 'K', family: 'f', mode: 'combine', summary: { idsKept: true }, ledger: { sets: { f: combined } } });
  assert.deepEqual(kept.sets.f.variants, ['9:1', '9:2']);
  const moved = recordResult(ledger, { slice: 'sets', fileKey: 'K', family: 'f', mode: 'combine', summary: { idsKept: false }, ledger: { sets: { f: combined } } });
  assert.deepEqual(moved.sets.f.variants, [null, null]);
});

// shadcn's Button with a stand-in ledger: plans only.
function shadcnLedger(contract, rec) {
  const anyId = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? 'VariableID:123:4567' : undefined), has: () => true });
  return { schemaVersion: 1, fileKey: FILE_KEY, foundations: { documentHash: documentHash(SHADCN_DOC), variables: anyId, textStyles: anyId }, icons: { components: {} }, sets: rec ? { [contract.family.key]: rec } : {} };
}

test('per call scales with set size for appends; a larger --per-call needs its whole window recorded; loose calls stay at the char cap', () => {
  assert.equal(appendPerCall(245), 49);
  assert.equal(appendPerCall(539), 46);
  assert.equal(appendPerCall(2304), 10, '1.8 ms × 10 × 2304 ≈ 41 s');
  assert.ok(1.8 * appendPerCall(2304) * 2304 < 45000);
  const c = approve(SHADCN_2304, AT, { prototype: true });
  assert.equal(expand(c).length, 2304);
  const opts = { fileKey: FILE_KEY, at: AT, prototype: true };
  const fresh = setsPlan(c, SHADCN_DOC, shadcnLedger(c, null), { ...opts, batch: 0 }).plan.options;
  assert.equal(fresh.phase, 'loose');
  assert.ok(fresh.perCall > 30 && fresh.perCall <= PER_CALL, `loose calls are flat in set size, at the char cap: ${fresh.perCall}`);
  const { plan } = setsPlan(c, SHADCN_DOC, shadcnLedger(c, null), { ...opts, batch: 0 });
  const ids = Array.from({ length: 2304 }, (_, i) => `1:${i + 10}`);
  const rec = variants => ({ page: '1:1', section: '1:2', set: { id: '1:3', key: 'k', name: 'Button' }, props: {}, variants, total: 2304, contentHash: plan.contentHash, placed: true });
  const append = setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, batch: 0 }).plan.options;
  assert.deepEqual([append.phase, append.perCall, append.of], ['append', 10, 231]);
  // an update-free re-run may take up to the char cap per call: every variant in the window has a recorded id, so it
  // appends none
  const top = fresh.perCall;
  const wide = setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, batch: 3, perCall: top }).plan;
  assert.deepEqual(wide.selection.entries.map(e => e[0]), Array.from({ length: top }, (_, i) => 3 * top + i));
  const hole = ids.slice();
  hole[3 * top + 2] = null;
  assert.throws(() => setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(hole)), { ...opts, batch: 3, perCall: top }), new RegExp(`per-call ${top} .* 1 of its ${top} variants`));
  assert.throws(() => setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, batch: 0, perCall: 50 }), /at most 49/);
  if (top < PER_CALL) assert.throws(() => setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, batch: 0, perCall: PER_CALL }), /does not fit/);
  // a reconcile of the whole set goes by windows that fit, each carrying its ids
  const r0 = setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, mode: 'reconcile', batch: 0 }).plan.options;
  assert.ok(r0.of > 1 && r0.perCall * r0.of >= 2304, JSON.stringify(r0));
  for (let batch = 0; batch !== r0.of; batch++) setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, mode: 'reconcile', batch });
  assert.throws(() => setsPlan(c, SHADCN_DOC, shadcnLedger(c, rec(ids)), { ...opts, mode: 'reconcile' }), /give --batch/);
});

test('a first build above MAX_COMBINE variants is refused: its one combine call would near the call ceiling', () => {
  const c = asDraft(SHADCN_2304);
  const state = c.axes.find(a => a.key === 'state');
  for (let i = 1; i <= 2; i++) state.values.push({ ...state.values[0], key: `extra-${i}`, label: `Extra ${i}` });
  c.selection.expectedCount = expand(c).length;
  assert.ok(expand(c).length > MAX_COMBINE);
  const big = approve(c, AT, { prototype: true });
  assert.throws(() => setsPlan(big, SHADCN_DOC, shadcnLedger(big, null), { fileKey: FILE_KEY, at: AT, prototype: true, batch: 0 }), new RegExp(`3456 variants.*${MAX_COMBINE}`));
});

test('every sets package keeps the core and the plan under 50,000 chars: the plan budget leaves room for the core', t => {
  const c = approve(SHADCN_BUTTON, AT, { prototype: true });
  const { plan, state } = setsPlan(c, SHADCN_DOC, shadcnLedger(c, null), { fileKey: FILE_KEY, at: AT, prototype: true, batch: 0 });
  const { out } = pack(plan, state, COMPONENTS_CORE);
  const overhead = out.chars - JSON.stringify(plan).length - JSON.stringify(state).length;
  // On every run, so the next core edit knows its room before it fails (#459).
  t.diagnostic(`core overhead ${overhead}, headroom ${50000 - overhead - SETS_BUDGET}`);
  assert.ok(overhead + SETS_BUDGET <= 50000, `core overhead ${overhead} + plan budget ${SETS_BUDGET} leaves ${50000 - overhead - SETS_BUDGET}: the core grew, so lower SETS_BUDGET in scripts/build-plan.mjs to ${50000 - overhead} or less, then lower the fresh.perCall > 30 floor in the per-call test above to match`);
});
