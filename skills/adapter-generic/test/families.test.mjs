// The exact tier on families beyond Button (#123): Card, a family with no cva whose exported parts are its anatomy,
// and Alert, whose root is a one-column grid. Driven through readFamily() and generate() on the committed fixture.
// They need the pinned tools (node skills/adapter-generic/scripts/sources.mjs); without them every test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, readFamily } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';
import { expand, resolve as resolveContract } from '../../contract/scripts/contract.mjs';

const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';
const foundations = skip ? null : (await library({ project: FIXTURE })).doc;
const runs = {};
const read = family => (runs[family] = runs[family] || readFamily({ project: FIXTURE, family, foundations }));
const byKey = axes => Object.fromEntries(axes.map(a => [a.key, a]));
const tok = token => ({ token });
const resolve = (f, t) => resolveContract({ properties: [], ...f }, t);

// A copy of the fixture project with one component file rewritten by `edit`.
function variant(file, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-families-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), 'utf8')));
  return dir;
}

// ---------- Card: no cva, parts as anatomy ----------

test('Card has no cva: its root className is its one variant, with a Slot axis for the footer it holds', { skip }, async () => {
  const card = await read('card');
  assert.deepEqual(card.axes.map(a => a.key), ['card-footer', 'state']);
  const { 'card-footer': footer, state } = byKey(card.axes);
  assert.equal(footer.slot, 'Card Footer');
  assert.deepEqual(footer.values.map(v => [v.key, v.label, v.filled, v.css]), [
    ['none', 'False', false, ':not(:has([data-slot="card-footer"]))'],
    ['card-footer', 'True', true, ':has([data-slot="card-footer"])']]);
  assert.deepEqual(state.values.map(v => v.key), ['enabled'], 'Card styles no state');
  assert.equal(card.expectedCount, 2);
});

test('Card\'s exported parts are FRAME nodes under the root, named by their data-slot, in source order', { skip }, async () => {
  const { anatomy } = await read('card');
  assert.equal(anatomy.name, 'Card');
  assert.deepEqual(anatomy.children, ['Card Header', 'Card Title', 'Card Description', 'Card Action', 'Card Content', 'Card Footer']
    .map(name => ({ name, type: 'FRAME' })));
});

test('Card layout: a block flex column fills across; gap and padding resolve --card-spacing to spacing-4; a filled footer drops the bottom padding', { skip }, async () => {
  const card = await read('card');
  const at = t => resolve(card, { 'card-footer': 'none', state: 'enabled', ...t }).layout;
  const root = at({}).Card;
  assert.equal(root.direction, 'column');
  assert.equal(root.width, 'fill', 'display: flex with no width is block-level: it fills its container');
  assert.equal(root.height, 'hug');
  assert.deepEqual(root.gap, tok('spacing-4'));
  assert.deepEqual([root.paddingTop, root.paddingBottom, root.paddingLeft, root.paddingRight], [tok('spacing-4'), tok('spacing-4'), tok('spacing-0'), tok('spacing-0')]);
  assert.deepEqual(at({ 'card-footer': 'card-footer' }).Card.paddingBottom, tok('spacing-0'));
});

test('each Card part fills the column across and hugs down; Card Action is self-start, so it hugs; the footer shows where filled', { skip }, async () => {
  const card = await read('card');
  const none = resolve(card, { 'card-footer': 'none', state: 'enabled' }).layout;
  const filled = resolve(card, { 'card-footer': 'card-footer', state: 'enabled' }).layout;
  for (const part of ['Card Header', 'Card Title', 'Card Description', 'Card Content', 'Card Footer'])
    assert.deepEqual([none[part].width, none[part].height], ['fill', 'hug'], part);
  assert.deepEqual([none['Card Action'].width, none['Card Action'].height], ['hug', 'hug']);
  assert.equal(none['Card Footer'].visible, false);
  assert.equal(filled['Card Footer'].visible, true);
  assert.equal(none['Card Header'].visible, undefined, 'a part that is no slot always shows');
});

test('Card\'s size prop is read by no axis: its data-[size=sm] utilities are a note, not carried', { skip }, async () => {
  const { notes } = await read('card');
  const note = notes.find(n => /data-\[size=sm\]:\[--card-spacing:--spacing\(3\)\]/.test(n.message));
  assert.ok(note, 'the size sm utility is listed');
  assert.match(note.message, /size "sm"/);
  assert.match(note.message, /no axis/);
});

test('Card paint: the card fill and a 1px foreground/10 ring, a Synthesized token', { skip }, async () => {
  const card = await read('card');
  const { paint } = resolve(card, { 'card-footer': 'none', state: 'enabled' });
  assert.deepEqual(paint.Card.fill, tok('card'));
  assert.equal(paint.Card.effects[0].spread.raw, 1);
  assert.deepEqual(paint.Card.effects[0].color, tok('card-effect'));
  assert.ok(card.synthesized['card-effect']);
});

test('the parts note says what of each part is read: its size, and its visibility where it is a slot', { skip }, async () => {
  const { notes } = await read('card');
  assert.ok(notes.some(n => n.at === 'anatomy' && /Card Header, Card Title, Card Description, Card Action, Card Content, Card Footer/.test(n.message)
    && /width and height/.test(n.message)));
});

// ---------- Alert: a one-column grid root ----------

test('Alert: the cva variant axis and the State; its icon column (has-[>svg]) is a note', { skip }, async () => {
  const alert = await read('alert');
  assert.deepEqual(alert.axes.map(a => a.key), ['variant', 'state']);
  assert.deepEqual(byKey(alert.axes).variant.values.map(v => v.key), ['default', 'destructive']);
  assert.ok(alert.notes.some(n => /has-\[>svg\]:grid-cols-\[auto_1fr\]/.test(n.message)));
});

test('Alert\'s grid with no columns is a column Auto Layout: row gap, width 100% fills, the border added to each padding', { skip }, async () => {
  const alert = await read('alert');
  const { Alert: root } = resolve(alert, { variant: 'default', state: 'enabled' }).layout;
  assert.equal(root.direction, 'column');
  assert.equal(root.width, 'fill');
  assert.equal(root.height, 'hug');
  assert.deepEqual(root.gap, tok('spacing-0_5'));
  assert.deepEqual([root.paddingTop.raw, root.paddingRight.raw, root.paddingBottom.raw, root.paddingLeft.raw], [9, 11, 9, 11]);
  assert.deepEqual(root.radius, tok('radius-lg'));
});

test('Alert\'s border colour comes from the project\'s base layer (* { border-border })', { skip }, async () => {
  const alert = await read('alert');
  for (const variant of ['default', 'destructive'])
    assert.deepEqual(resolve(alert, { variant, state: 'enabled' }).paint.Alert.stroke, tok('border'), variant);
});

test('Alert\'s parts: Title and Description fill the grid\'s one column; the absolute Alert Action is left out, with its slot utilities', { skip }, async () => {
  const alert = await read('alert');
  assert.deepEqual(alert.anatomy.children, [{ name: 'Alert Title', type: 'FRAME' }, { name: 'Alert Description', type: 'FRAME' }]);
  const { layout } = resolve(alert, { variant: 'default', state: 'enabled' });
  assert.deepEqual([layout['Alert Title'].width, layout['Alert Title'].height], ['fill', 'hug']);
  const note = alert.notes.find(n => /AlertAction/.test(n.message) && /absolute/.test(n.message));
  assert.ok(note, 'the absolute part is named');
  assert.ok(alert.notes.some(n => /has-data-\[slot=alert-action\]:pr-18/.test(n.message)), 'its slot utilities are listed, not an axis');
});

test('a grid with explicit columns fails, naming the utility', { skip }, async () => {
  const project = variant('components/ui/alert.tsx', t => t.replace('relative grid w-full', 'relative grid grid-cols-2 w-full'));
  await assert.rejects(readFamily({ project, family: 'alert', foundations }), /grid-cols-2.*columns/);
});

test('the Card and Alert variants each resolve every part', { skip }, async () => {
  for (const family of ['card', 'alert']) {
    const f = await read(family);
    for (const t of expand({ axes: f.axes, excluded: [], selection: { omit: f.omit } })) {
      const { layout } = resolve(f, t);
      for (const n of f.anatomy.children) assert.ok(layout[n.name].width && layout[n.name].height, `${family} ${n.name}`);
    }
  }
});

// ---------- the agent tier on a family with no cva ----------

test('a family with no cva drafts its description and grid only, evidenced by the root\'s line', { skip }, async () => {
  const doc = (await library({ project: FIXTURE, families: ['card'] })).doc;
  const { contract, requests } = await generate({ project: FIXTURE, family: 'card', foundations: doc });
  assert.equal(contract, null);
  assert.deepEqual(requests.map(r => r.key), ['family.description', 'figma.grid']);
  for (const r of requests) assert.ok(r.evidence.every(e => e.startsWith('components/ui/card.tsx:L4 ')), r.key);
  assert.match(requests.find(r => r.key === 'figma.grid').evidence[0], /no cva; the Contract's axes: card-footer \(2\), state \(1\)/);
});
