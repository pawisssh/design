// Component Set slice (#32), through the offline chain: foundations, icons and the Base Component built on a
// mock figma, then Contract -> sets plans (batches) -> package -> core -> ledger, and the read-only modes
// (reconcile, coverage, sample, theme) checked against the Contract by coverage.mjs.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOmit, approve, asDraft, expand, variantName } from '../../contract/scripts/contract.mjs';
import { basePlan, decodeEntries, foundationsPlan, iconsPlan, PER_CALL, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage, checkSample, checkTheme } from '../scripts/coverage.mjs';
import { diff, normalizeBaseResult } from '../scripts/base-loop.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8'));
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/carbon/carbon.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const PACKAGER = join(ROOT, 'skills/to-design/scripts/package_native_builder.py');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-16T00:00:00.000Z';
const TOTAL = expand(BUTTON).length;

function pack(plan, state, core = COMPONENTS_CORE) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-sets-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, core, 'plan.json', 'out', '--state', 'state.json'], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return { code: readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8'), out: JSON.parse(run.stdout) };
}

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
  const { code, out } = pack(plan, state);
  const from = env.mock.log.length;
  const result = await runPackage(code, env.mock.figma);
  assert.ok(!result.error, JSON.stringify(result));
  if (!drop && result.summary.conflicts === 0 && result.ledger) env.ledger = recordResult(env.ledger, result);
  const switches = env.mock.log.slice(from).filter(([op]) => op === 'setCurrentPage').length;
  return { plan, result, out, switches };
}

async function buildAll(env, contract = BUTTON, options = {}) {
  const runs = [];
  const of = Math.ceil(expand(contract).length / (options.perCall || PER_CALL));
  for (let batch = 0; batch !== of; batch++) runs.push(await sets(env, { batch, ...options }, { contract }));
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
  for (let batch = 0; batch !== Math.ceil(TOTAL / PER_CALL); batch++) {
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
    assert.ok(switches <= 1, `batch ${plan.options.batch}: ${switches} page switches (figma-workflow.md: one per call)`);
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
test('after an omit edit the rebuild finds every kept variant by name and leaves the dropped ones for coverage to report', async () => {
  const env = await setup();
  await buildAll(env);
  const ids = new Map((await setNode(env)).children.map(k => [k.name, k.id]));
  const patch = { family: 'button', snapshotId: BUTTON.source.snapshotId, omit: [{ state: 'focus' }], expectedCount: TOTAL - 49 };
  const omitted = approve(applyOmit(BUTTON, patch), AT);
  const runs = await buildAll(env, omitted);
  for (const { result } of runs) assert.deepEqual([result.summary.created, result.summary.updated], [0, 0], JSON.stringify(result.updated));
  const rec = env.ledger.sets.button;
  assert.equal(rec.variants.length, TOTAL - 49);
  assert.deepEqual(rec.variants, expand(omitted).map(t => ids.get(variantName(omitted, t))));
  assert.equal((await setNode(env)).children.length, TOTAL, 'the sets slice never deletes a variant');
  const report = checkCoverage(omitted, (await sets(env, { mode: 'coverage' }, { contract: omitted })).result);
  assert.deepEqual([...new Set(report.problems.map(p => p.what))], ['extra']);
  assert.equal(report.problems.length, 49);
  assert.ok(report.problems.every(p => p.name.endsWith('State=Focus')));
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
    const result = await runPackage(pack(plan, state).code, env.mock.figma);
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
  await sets(env, { batch: 0 });
  await sets(env, { batch: 1 }, { drop: true }); // committed in the file, result lost
  const lost = env.ledger.sets.button.variants.filter(Boolean).length;
  const { result } = await sets(env, { mode: 'reconcile' });
  assert.equal(result.summary.found, 2 * PER_CALL);
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

test('the first batch holds the Base Component; a first batch lost before its ledger is found again through the base', async () => {
  const env = await setup();
  env.mock.log.length = 0;
  const early = await sets(env, { batch: 1 });
  assert.equal(early.result.summary.conflicts, 1);
  assert.match(early.result.conflicts[0].reason, /base-first/);
  assert.deepEqual(writes(env.mock), [], 'a conflict stops before the first change');
  assert.deepEqual(env.ledger.sets, {});
  await sets(env, { batch: 0 }, { drop: true });
  assert.deepEqual(env.ledger.sets, {}, 'the result was lost');
  const blind = await sets(env, { batch: 0 });
  assert.ok(blind.result.summary.conflicts > 0, 'a retry without the ledger stops on what the lost call made');
  assert.equal(blind.result.summary.created, 0);
  const rec = await sets(env, { mode: 'reconcile' });
  assert.equal(rec.result.summary.found, PER_CALL, JSON.stringify(rec.result));
  const retry = await sets(env, { batch: 0 });
  assert.deepEqual([retry.result.summary.created, retry.result.made], [0, []]);
  assert.equal((await setNode(env)).children.length, PER_CALL);
  const pages = env.mock.figma.root.children.map(p => p.name);
  assert.deepEqual(pages.filter(n => n === 'Buttons').length, 1);
  assert.deepEqual(pages.filter(n => n === 'Templates').length, 1);
});

test('a family without a Base Component (the 539-variant slope set) builds beside the Button, sharing the Header template', async () => {
  const env = await setup();
  await buildAll(env);
  const slope = slopeContract();
  const runs = await buildAll(env, slope, { prototype: true });
  assert.equal(runs.length, Math.ceil(539 / PER_CALL));
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
  assert.deepEqual(runs.map(r => r.result.summary.updated), runs.map((r, i) => (i === Math.floor(index / PER_CALL) ? 1 : 0)));
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
  set.dashPattern = [4, 4]; // and restyles the sheet
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
