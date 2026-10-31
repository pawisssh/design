// Nested instances in one Design System (#593, ADR 0023): a Card holding two `family:button` nodes, with per-variant
// `instances`, built on the mock figma after its Button. The build order, the plan's Conflicts, the instances the
// card's variants hold, the Coverage and Edit checks, and the fingerprints a Button rebuild leaves alone.
// Run with `node --test skills/to-design/tests/nested.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, contentHash } from '../../contract/scripts/contract.mjs';
import { basePlan, documentHash, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage, checkSample } from '../scripts/coverage.mjs';
import { buildOrder } from '../scripts/nested.mjs';
import { chain, COMPONENTS_CORE, ROOT } from './chain.mjs';
import { mockFigma } from './mock-figma.mjs';

const FIXTURES = join(ROOT, 'skills/to-design/tests/fixtures/nested');
const AT = '2026-11-01T00:00:00.000Z';
const load = key => approve(JSON.parse(readFileSync(join(FIXTURES, `${key}.component.json`), 'utf8')), AT, { prototype: true });
const BUTTON = load('button');
const CARD = load('card');

test('families build in topological order over dependencies.families, and a cycle is refused', () => {
  assert.deepEqual(buildOrder({ card: CARD, button: BUTTON }), ['button', 'card']);
  assert.deepEqual(buildOrder({ button: BUTTON, card: CARD }), ['button', 'card']);
  // with no dependencies, the order given
  assert.deepEqual(buildOrder({ card: { ...CARD, dependencies: { families: [], fonts: [] } }, button: BUTTON }), ['card', 'button']);
  const looped = { ...BUTTON, dependencies: { families: [{ key: 'card', contract: 'card' }], fonts: [] } };
  assert.throws(() => buildOrder({ card: CARD, button: looped }), /cycle: card → button → card/);
});

// The Card's plans against a stand-in ledger whose Button set is recorded as built from `button` (null: not built).
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/shadcn/shadcn.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const FILE_KEY = 'MOCKFILEKEY';
const HELD = { designSystem: 'shadcn', contracts: { button: BUTTON } };
function standIn(button = BUTTON) {
  const anyId = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? 'VariableID:123:4567' : undefined), has: () => true });
  const sets = button ? { button: { page: '1:1', section: '1:2', set: { id: '1:3', key: 'k', name: 'Button' }, props: {}, variants: ['2:1', '2:2', '2:3', '2:4'], total: 4, contentHash: contentHash(button), placed: true } } : {};
  return { schemaVersion: 1, fileKey: FILE_KEY, foundations: { documentHash: documentHash(DOC_TEXT), variables: anyId, textStyles: anyId }, icons: { components: {} }, sets };
}
const cardPlan = (ledger, held = HELD, card = CARD) => setsPlan(card, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, prototype: true, held, batch: 0 });
const conflictsOf = fn => { try { fn(); } catch (e) { return (e.conflicts || [['no conflicts', e.message]]).map(c => [c.node, c.kind]); } return []; };

test('the Card plan resolves each nested instance to a Button variant id through the ledger, by Button\'s expansion order', () => {
  const { plan, state } = cardPlan(standIn());
  // Button expands kind x size: primary|md, primary|sm, secondary|md, secondary|sm
  const swaps = plan.selection.entries.map(e => plan.P[e[plan.selection.axes.length + 1]].swap);
  assert.deepEqual(swaps, [
    { Cancel: 'family:shadcn/button/secondary|md|enabled', Confirm: 'family:shadcn/button/primary|md|enabled' },
    { Cancel: 'family:shadcn/button/secondary|sm|enabled', Confirm: 'family:shadcn/button/primary|sm|enabled' },
  ]);
  assert.deepEqual(state.icons, { 'family:shadcn/button/secondary|md|enabled': { id: '2:3' }, 'family:shadcn/button/primary|md|enabled': { id: '2:1' },
    'family:shadcn/button/secondary|sm|enabled': { id: '2:4' }, 'family:shadcn/button/primary|sm|enabled': { id: '2:2' } });
  // every Button property, at the value the Card writes, else Button's default
  assert.deepEqual(plan.P[0].props, { Cancel: { Label: 'Cancel', Badge: false }, Confirm: { Label: 'Confirm', Badge: true } });
});

test('the plan stops on a named Conflict: a tuple outside Button\'s selection, a stale Button contentHash, an unbuilt Button, another Design System', () => {
  assert.deepEqual(conflictsOf(() => cardPlan(standIn())), []);
  // Button omits Secondary Small, which the compact Card's Cancel resolves to
  const narrow = approve({ ...BUTTON, selection: { ...BUTTON.selection, omit: [{ match: { kind: 'secondary', size: 'sm' }, reason: 'test' }], expectedCount: 3 } }, AT, { prototype: true });
  assert.deepEqual(conflictsOf(() => cardPlan(standIn(narrow), { ...HELD, contracts: { button: narrow } })), [['Cancel', 'not-selected']]);
  assert.throws(() => cardPlan(standIn(narrow), { ...HELD, contracts: { button: narrow } }), /Cancel not-selected: Density=Compact.*Kind=Secondary, Size=Small, State=Enabled is not in Button's selection/);
  // the ledger's Button was built from another Contract than the one held
  const edited = approve({ ...BUTTON, paint: [...BUTTON.paint, { match: { size: 'sm' }, set: { Label: { fill: { token: 'muted-foreground' } } } }] }, AT, { prototype: true });
  assert.deepEqual(conflictsOf(() => cardPlan(standIn(BUTTON), { ...HELD, contracts: { button: edited } })), [['Cancel', 'stale'], ['Confirm', 'stale']]);
  assert.deepEqual(conflictsOf(() => cardPlan(standIn(null))), [['Cancel', 'not-built'], ['Confirm', 'not-built']]);
  assert.deepEqual(conflictsOf(() => cardPlan(standIn(), null)), [['Cancel', 'held-contract'], ['Confirm', 'held-contract']]);
  // a props key Button does not have, or of the wrong type
  const wrong = approve({ ...CARD, instances: [...CARD.instances, { match: {}, set: { Confirm: { props: { tone: 'loud', badge: 'yes' } } } }] }, AT, { prototype: true });
  assert.deepEqual(conflictsOf(() => cardPlan(standIn(), HELD, wrong)), [['Confirm', 'property'], ['Confirm', 'property']]);
  // a held family in another Design System is #594
  const carbon = approve({ ...CARD, dependencies: { ...CARD.dependencies, families: [{ key: 'button', contract: 'button', designSystem: 'carbon' }] } }, AT, { prototype: true });
  assert.throws(() => cardPlan(standIn(), HELD, carbon), /Cancel design-system: .*another Design System's ledger is #594/);
  // a holding family is built as a set, never as a Base Component alone
  assert.throws(() => basePlan(CARD, DOC_TEXT, standIn(), { fileKey: FILE_KEY, at: AT }), /card holds other families \(Cancel, Confirm\): .*built as a Component Set/);
});

// Foundations, then the Button set and its Coverage check, then the Card set holding it, on one mock file.
async function buildBoth() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  const env = chain(mock.figma);
  await env.foundations(DOC_TEXT, { fileKey: FILE_KEY, at: AT });
  const order = [];
  const coverage = {};
  for (const key of buildOrder({ card: CARD, button: BUTTON })) {
    const c = { card: CARD, button: BUTTON }[key];
    const opts = { fileKey: FILE_KEY, at: AT, prototype: true, held: HELD };
    for (let d; (d = setsPlan(c, DOC_TEXT, env.ledger(), { ...opts, next: true }));) { order.push(key); await env.call(d, COMPONENTS_CORE); }
    coverage[key] = await env.call(setsPlan(c, DOC_TEXT, env.ledger(), { ...opts, mode: 'coverage' }), COMPONENTS_CORE);
  }
  return { mock, env, order, coverage };
}
const built = buildBoth();
built.catch(() => {}); // each test awaits it and reports a failed build itself

test('Button builds first; the Card\'s variants hold the right Button variants and props, and both pass Coverage', async () => {
  const { mock, env, order, coverage } = await built;
  const ledger = env.ledger();
  assert.deepEqual([...new Set(order)], ['button', 'card']);
  for (const [c, rb] of [[BUTTON, coverage.button], [CARD, coverage.card]]) {
    const report = checkCoverage(c, rb, ledger, { held: HELD });
    assert.deepEqual(report.problems, [], c.family.key);
  }
  const [comfortable, compact] = ledger.sets.card.variants;
  const [primaryMd, primarySm, secondaryMd, secondarySm] = ledger.sets.button.variants;
  for (const [id, cancel, confirm] of [[comfortable, secondaryMd, primaryMd], [compact, secondarySm, primarySm]]) {
    const v = await mock.figma.getNodeByIdAsync(id);
    for (const [name, main, props] of [['Cancel', cancel, { Label: 'Cancel', Badge: false }], ['Confirm', confirm, { Label: 'Confirm', Badge: true }]]) {
      const inst = v.findOne(n => n.name === name);
      assert.equal(inst.type, 'INSTANCE');
      assert.equal((await inst.getMainComponentAsync()).id, main, `${v.name} ${name}`);
      const values = Object.fromEntries(Object.entries(inst.componentProperties).map(([k, p]) => [k.split('#')[0], p.value]));
      assert.deepEqual(values, props, `${v.name} ${name}`);
    }
  }
  // a Coverage read whose nested instance holds another Button variant is a problem
  const v = await mock.figma.getNodeByIdAsync(compact);
  const inst = v.findOne(n => n.name === 'Cancel');
  inst.swapComponent(await mock.figma.getNodeByIdAsync(primaryMd));
  const again = await env.call(setsPlan(CARD, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, prototype: true, held: HELD, mode: 'coverage' }), COMPONENTS_CORE);
  assert.deepEqual(checkCoverage(CARD, again, ledger, { held: HELD }).problems.map(p => [p.what, p.name, p.node, p.got]),
    [['nested', 'Density=Compact, State=Enabled', 'Cancel', 'family:shadcn/button/primary|md|enabled']]);
  inst.swapComponent(await mock.figma.getNodeByIdAsync(secondarySm));
});

test('the Edit check reads a nested instance\'s main component, props and overrides: an owner override is an edit, a held field is not read', async () => {
  const { mock, env } = await built;
  const ledger = env.ledger();
  const read = async () => (await env.call(setsPlan(CARD, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, prototype: true, held: HELD, mode: 'sample', sample: [0, 1] }), COMPONENTS_CORE));
  const edits = report => report.problems.flatMap(p => (p.changes || []).map(c => [p.name, c.reason, c.node, c.field]));
  const clean = await read();
  assert.deepEqual(checkSample(CARD, clean, ledger, DOC, HELD).problems, []);
  // only the Card's own layers are read: nothing inside a nested instance
  const sample = Object.values(clean.sample)[0];
  assert.deepEqual(Object.keys(sample.paint).filter(n => n.includes('/')), []);
  assert.deepEqual(sample.props, { Cancel: { Label: 'Cancel', Badge: false }, Confirm: { Label: 'Confirm', Badge: true } });

  // a held field the Card does not override is Button's: a Button restyle reaches the instances and is no Card edit
  const primaryMd = await mock.figma.getNodeByIdAsync(ledger.sets.button.variants[0]);
  primaryMd.findOne(n => n.name === 'Label').fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  assert.deepEqual(checkSample(CARD, await read(), ledger, DOC, HELD).problems, []);

  // the owner's override inside the instance, and a property value the Card does not write, are edits
  const comfortable = await mock.figma.getNodeByIdAsync(ledger.sets.card.variants[0]);
  const confirm = comfortable.findOne(n => n.name === 'Confirm');
  confirm.findOne(n => n.name === 'Label').fills = [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }];
  confirm.setProperties({ [Object.keys(confirm.componentProperties).find(k => k.startsWith('Badge#'))]: false });
  assert.deepEqual(edits(checkSample(CARD, await read(), ledger, DOC, HELD)), [
    ['Density=Comfortable, State=Enabled', 'nested', 'Confirm', 'Badge'],
    ['Density=Comfortable, State=Enabled', 'override', 'Confirm/Label', 'fills'],
  ]);
});
