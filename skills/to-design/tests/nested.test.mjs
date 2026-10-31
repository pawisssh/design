// Nested instances in one Design System (#593, ADR 0023): a Card holding two `family:button` nodes, with per-variant
// `instances`, built on the mock figma after its Button. The build order, the plan's Conflicts, the instances the
// card's variants hold, the Coverage and Edit checks, and the fingerprints a Button rebuild leaves alone.
// Run with `node --test skills/to-design/tests/nested.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, asDraft, contentHash, expand } from '../../contract/scripts/contract.mjs';
import { normalizeBaseResult, review } from '../scripts/base-loop.mjs';
import { basePlan, documentHash, rehashSets, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage, checkSample } from '../scripts/coverage.mjs';
import { buildOrder } from '../scripts/nested.mjs';
import { defaultProps, expectedVariant, normalizeReadback } from '../scripts/readback.mjs';
import { chain, COMPONENTS_CORE, ROOT } from './chain.mjs';
import { mockFigma } from './mock-figma.mjs';

const FIXTURES = join(ROOT, 'skills/to-design/tests/fixtures/nested');
const AT = '2026-11-01T00:00:00.000Z';
const load = key => approve(JSON.parse(readFileSync(join(FIXTURES, `${key}.component.json`), 'utf8')), AT, { prototype: true });
const BUTTON = load('button');
const CARD = load('card');
const ICON_BUTTON = load('icon-button');
// the Card with its two nested instances holding `key` instead of the Button
const holding = (key, card = CARD) => approve({
  ...card, anatomy: JSON.parse(JSON.stringify(card.anatomy).split('family:button').join(`family:${key}`)),
  dependencies: { ...card.dependencies, families: [{ key, contract: key }] },
}, AT, { prototype: true });

test('families build in topological order over dependencies.families, and a cycle is refused', () => {
  assert.deepEqual(buildOrder({ card: CARD, button: BUTTON }), ['button', 'card']);
  assert.deepEqual(buildOrder({ button: BUTTON, card: CARD }), ['button', 'card']);
  // with no dependencies, the order given
  assert.deepEqual(buildOrder({ card: { ...CARD, dependencies: { families: [], fonts: [] } }, button: BUTTON }), ['card', 'button']);
  const looped = { ...BUTTON, dependencies: { families: [{ key: 'card', contract: 'card' }], fonts: [] } };
  assert.throws(() => buildOrder({ card: CARD, button: looped }), /cycle: card → button → card/);
  // a dependency in another Design System is no family here, even under a local family's key
  const local = { ...BUTTON, dependencies: { families: [{ key: 'card', contract: 'card' }], fonts: [] } };
  const foreign = { ...CARD, dependencies: { ...CARD.dependencies, families: [{ key: 'button', contract: 'button', designSystem: 'carbon' }] } };
  assert.deepEqual(buildOrder({ button: local, card: foreign }), ['card', 'button']);
});

// The Card's plans against a stand-in ledger whose Button set is recorded as built from `button` (null: not built).
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/shadcn/shadcn.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const FILE_KEY = 'MOCKFILEKEY';
const HELD = { designSystem: 'shadcn', contracts: { button: BUTTON } };
function standIn(button = BUTTON, { key = 'button', props = { label: 'Label#9:1', badge: 'Badge#9:2' }, icons = {} } = {}) {
  const anyId = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? 'VariableID:123:4567' : undefined), has: () => true });
  const sets = button ? { [key]: { page: '1:1', section: '1:2', set: { id: '1:3', key: 'k', name: button.family.name }, props, variants: ['2:1', '2:2', '2:3', '2:4'], total: 4, contentHash: contentHash(button), placed: true } } : {};
  return { schemaVersion: 1, fileKey: FILE_KEY, foundations: { documentHash: documentHash(DOC_TEXT), variables: anyId, textStyles: anyId }, icons: { components: icons }, sets };
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
  // only the Button properties the Card writes, by the Figma key the ledger records: one left out keeps Button's default
  assert.deepEqual(plan.P[0].props, { Cancel: { 'Label#9:1': 'Cancel', 'Badge#9:2': false }, Confirm: { 'Label#9:1': 'Confirm' } });
  // a nested instance that writes nothing is still listed, so its properties and overrides are read back
  const quiet = approve({ ...CARD, instances: [{ match: {}, set: { Cancel: { variant: { kind: 'secondary' } } } }] }, AT, { prototype: true });
  assert.deepEqual(cardPlan(standIn(), HELD, quiet).plan.P[0].props, { Cancel: {}, Confirm: {} });
  // the Edit check expects a property left out at the held Contract's default as it is now
  const flipped = approve({ ...BUTTON, properties: BUTTON.properties.map(p => (p.key === 'badge' ? { ...p, default: false } : p)) }, AT, { prototype: true });
  assert.deepEqual(expectedVariant(CARD, expand(CARD)[0], defaultProps(CARD), DOC, { ...HELD, contracts: { button: flipped } }).props.Confirm, { Label: 'Confirm', Badge: false });
});

test('a held INSTANCE_SWAP the holder leaves out keeps its default: icon:default is the held family\'s icons.default', () => {
  const holder = holding('icon-button');
  const held = { designSystem: 'shadcn', contracts: { 'icon-button': ICON_BUTTON } };
  const ledger = standIn(ICON_BUTTON, { key: 'icon-button', props: { label: 'Label#9:1', badge: 'Badge#9:2', icon: 'Icon#9:3' }, icons: { add: { id: '5:1' }, close: { id: '5:2' } } });
  assert.deepEqual(conflictsOf(() => cardPlan(ledger, held, holder)), []);
  assert.deepEqual(cardPlan(ledger, held, holder).plan.P[0].props, { Cancel: { 'Label#9:1': 'Cancel', 'Badge#9:2': false }, Confirm: { 'Label#9:1': 'Confirm' } });
  assert.deepEqual(expectedVariant(holder, expand(holder)[0], defaultProps(holder), DOC, held).props.Confirm, { Label: 'Confirm', Badge: true, Icon: { icon: 'add' } });
  // a swap the holder writes is set, by the icon's component id
  const swapped = approve({ ...holder, instances: [...holder.instances, { match: {}, set: { Confirm: { props: { icon: 'icon:close' } } } }] }, AT, { prototype: true });
  assert.deepEqual(cardPlan(ledger, held, swapped).plan.P[0].props.Confirm, { 'Label#9:1': 'Confirm', 'Icon#9:3': '5:2' });
  // a default icon the ledger lacks is the icon Conflict (#313)
  assert.deepEqual(conflictsOf(() => cardPlan({ ...ledger, icons: { components: { close: { id: '5:2' } } } }, held, holder)), [['Cancel', 'icon'], ['Confirm', 'icon']]);
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
  // a holding family's Base Component is refused by the same Conflicts while its held set is not built
  const draft = asDraft(CARD);
  assert.deepEqual(conflictsOf(() => basePlan(draft, DOC_TEXT, standIn(null), { fileKey: FILE_KEY, at: AT, held: HELD })), [['Cancel', 'not-built'], ['Confirm', 'not-built']]);
  assert.deepEqual(conflictsOf(() => basePlan(draft, DOC_TEXT, standIn(), { fileKey: FILE_KEY, at: AT })), [['Cancel', 'held-contract'], ['Confirm', 'held-contract']]);
});

test('rehash takes the held Contracts: a holder\'s set moves to an edit the builder never reads', () => {
  const card = approve(asDraft(CARD), AT);
  const ledger = standIn();
  ledger.sets.card = { page: '1:1', section: '1:4', set: { id: '1:5', key: 'k2', name: 'Card' }, props: { title: 'Title#9:4' }, variants: ['3:1', '3:2'], total: 2, contentHash: contentHash(card), placed: true, builtAt: AT };
  const evidence = approve({ ...asDraft(card), axes: card.axes.map((a, i) => (i ? a : { ...a, defaultSource: `${a.defaultSource} (re-cited)` })) }, AT);
  const moved = rehashSets(card, evidence, DOC_TEXT, ledger, { fileKey: FILE_KEY, held: HELD });
  assert.equal(moved.sets.card.contentHash, contentHash(evidence));
  assert.throws(() => rehashSets(card, evidence, DOC_TEXT, ledger, { fileKey: FILE_KEY }), /held-contract/);
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

test('a holding family\'s Base Component holds the held variants and props its base tuple resolves to, and reviews clean', async () => {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  const env = chain(mock.figma);
  await env.foundations(DOC_TEXT, { fileKey: FILE_KEY, at: AT });
  const opts = { fileKey: FILE_KEY, at: AT, prototype: true, held: HELD };
  for (let d; (d = setsPlan(BUTTON, DOC_TEXT, env.ledger(), { ...opts, next: true }));) await env.call(d, COMPONENTS_CORE);
  const draft = asDraft(CARD);
  const result = await env.call(basePlan(draft, DOC_TEXT, env.ledger(), { fileKey: FILE_KEY, at: AT, held: HELD }), COMPONENTS_CORE);
  const ledger = env.ledger();
  const base = await mock.figma.getNodeByIdAsync(ledger.bases.card.id);
  const [primaryMd, , secondaryMd] = ledger.sets.button.variants;
  for (const [name, main, props] of [['Cancel', secondaryMd, { Label: 'Cancel', Badge: false }], ['Confirm', primaryMd, { Label: 'Confirm', Badge: true }]]) {
    const inst = base.findOne(n => n.name === name);
    assert.equal((await inst.getMainComponentAsync()).id, main, name);
    assert.deepEqual(Object.fromEntries(Object.entries(inst.componentProperties).map(([k, p]) => [k.split('#')[0], p.value])), props, name);
  }
  const r = review(draft, normalizeBaseResult(result, ledger, HELD), DOC, { held: HELD });
  assert.deepEqual([r.changes, r.unread], [[], []]);
  // the owner's Badge on the Confirm instance is a change the review shows
  const confirm = base.findOne(n => n.name === 'Confirm');
  confirm.setProperties({ [Object.keys(confirm.componentProperties).find(k => k.startsWith('Badge#'))]: false });
  const again = await env.call(basePlan(draft, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, held: HELD, readOnly: true }), COMPONENTS_CORE);
  assert.deepEqual(review(draft, normalizeBaseResult(again, ledger, HELD), DOC, { held: HELD }).changes.map(c => [c.reason, c.node, c.field]), [['nested', 'Confirm', 'Badge']]);
});

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
  assert.deepEqual(normalizeReadback(sample, ledger, HELD).props, { Cancel: { Label: 'Cancel', Badge: false }, Confirm: { Label: 'Confirm', Badge: true } });

  // a held field the Card does not override is Button's: a Button restyle reaches the instances and is no Card edit
  const primaryMd = await mock.figma.getNodeByIdAsync(ledger.sets.button.variants[0]);
  primaryMd.findOne(n => n.name === 'Label').fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  assert.deepEqual(checkSample(CARD, await read(), ledger, DOC, HELD).problems, []);

  // the owner's override inside the instance, and a property value the Card does not write, are edits
  const comfortable = await mock.figma.getNodeByIdAsync(ledger.sets.card.variants[0]);
  const confirm = comfortable.findOne(n => n.name === 'Confirm');
  confirm.findOne(n => n.name === 'Label').fills = [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }];
  confirm.setProperties({ [Object.keys(confirm.componentProperties).find(k => k.startsWith('Badge#'))]: false });
  const owned = [
    ['Density=Comfortable, State=Enabled', 'nested', 'Confirm', 'Badge'],
    ['Density=Comfortable, State=Enabled', 'override', 'Confirm/Label', 'fills'],
  ];
  assert.deepEqual(edits(checkSample(CARD, await read(), ledger, DOC, HELD)), owned);
  // a rerun writes only what the Card writes: the owner's Badge stays, and is still an edit
  const opts = { fileKey: FILE_KEY, at: AT, prototype: true, held: HELD };
  const { of } = setsPlan(CARD, DOC_TEXT, env.ledger(), { ...opts, batch: 0 }).plan.options;
  for (let batch = 0; batch !== of; batch++) await env.call(setsPlan(CARD, DOC_TEXT, env.ledger(), { ...opts, batch }), COMPONENTS_CORE);
  assert.equal(confirm.componentProperties[Object.keys(confirm.componentProperties).find(k => k.startsWith('Badge#'))].value, false);
  assert.deepEqual(edits(checkSample(CARD, await read(), ledger, DOC, HELD)), owned);
});
