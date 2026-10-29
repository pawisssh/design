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
import { contentHash, expand, resolve as resolveContract, validate } from '../../contract/scripts/contract.mjs';
import { chipProject } from './chip-project.mjs';

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
  assert.equal(footer.slot, 'Footer');
  assert.deepEqual(footer.values.map(v => [v.key, v.label, v.filled, v.css]), [
    ['none', 'False', false, ':not(:has([data-slot="card-footer"]))'],
    ['card-footer', 'True', true, ':has([data-slot="card-footer"])']]);
  assert.deepEqual(state.values.map(v => v.key), ['enabled'], 'Card styles no state');
  assert.equal(card.expectedCount, 2);
});

test('Card\'s exported parts are nodes under the root, named by their data-slot without the family prefix, in source order; a part that sets its own text style is TEXT (#166)', { skip }, async () => {
  const { anatomy } = await read('card');
  assert.equal(anatomy.name, 'Card');
  const text = ['Title', 'Description'];
  assert.deepEqual(anatomy.children, ['Header', 'Title', 'Description', 'Action', 'Content', 'Footer']
    .map(name => ({ name, type: text.includes(name) ? 'TEXT' : 'FRAME' })));
});

test('Card\'s text parts are TEXT properties mapped to their child component; Description binds its Text Style, Title\'s leading-snug has none (#166, #160)', { skip }, async () => {
  const card = await read('card');
  assert.deepEqual(card.properties.map(p => [p.key, p.type, p.binds, p.code]), [
    ['title', 'TEXT', [{ node: 'Title', field: 'characters' }], { child: 'CardTitle' }],
    ['description', 'TEXT', [{ node: 'Description', field: 'characters' }], { child: 'CardDescription' }]]);
  const { layout } = resolve(card, { 'card-footer': 'none', state: 'enabled' });
  assert.deepEqual(layout.Title.textStyle.raw, { fontSize: 16, lineHeight: 22, fontWeight: 500 });
  assert.equal(layout.Title.textStyle.level, 'warning');
  assert.match(layout.Title.textStyle.reason, /leading-snug line-height 22px.*no Text Style: leading-snug sets a line height off the type scale/);
  assert.doesNotMatch(layout.Title.textStyle.reason, /no Text Styles yet/);
  assert.deepEqual(layout.Description.textStyle, tok('text-sm-normal'));
  assert.equal(layout.Title.textResize, 'height');
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

test('each Card part fills the column across and hugs down; Action is self-start, so it hugs; the footer shows where filled', { skip }, async () => {
  const card = await read('card');
  const none = resolve(card, { 'card-footer': 'none', state: 'enabled' }).layout;
  const filled = resolve(card, { 'card-footer': 'card-footer', state: 'enabled' }).layout;
  for (const part of ['Header', 'Title', 'Description', 'Content', 'Footer'])
    assert.deepEqual([none[part].width, none[part].height], ['fill', 'hug'], part);
  assert.deepEqual([none['Action'].width, none['Action'].height], ['hug', 'hug']);
  assert.equal(none['Footer'].visible, false);
  assert.equal(filled['Footer'].visible, true);
  assert.equal(none['Header'].visible, undefined, 'a part that is no slot always shows');
});

test('a part hugs inside its own Auto Layout: a flex part (CardFooter) is a row, a grid or block part a column (#124)', { skip }, async () => {
  const card = await read('card');
  const { layout } = resolve(card, { 'card-footer': 'card-footer', state: 'enabled' });
  assert.deepEqual(['Header', 'Action', 'Content', 'Footer'].map(p => layout[p].direction), ['column', 'column', 'column', 'row']);
  assert.deepEqual([layout['Title'].direction, layout['Description'].direction], [undefined, undefined], 'a TEXT layer has no Auto Layout');
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

test('the parts note says what of each part is read: its direction and size, and its visibility where it is a slot', { skip }, async () => {
  const { notes } = await read('card');
  assert.ok(notes.some(n => n.at === 'anatomy' && /Header, Title, Description, Action, Content, Footer/.test(n.message)
    && /direction/.test(n.message) && /width and height/.test(n.message)));
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
  assert.deepEqual(alert.anatomy.children, [{ name: 'Title', type: 'TEXT' }, { name: 'Description', type: 'TEXT' }]);
  const { layout } = resolve(alert, { variant: 'default', state: 'enabled' });
  assert.deepEqual([layout['Title'].width, layout['Title'].height], ['fill', 'hug']);
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

test('a family with no cva drafts its description, grid and text defaults only, the family-wide keys evidenced by the root\'s line', { skip }, async () => {
  const doc = (await library({ project: FIXTURE, families: ['card'] })).doc;
  const { contract, requests } = await generate({ project: FIXTURE, family: 'card', foundations: doc });
  assert.equal(contract, null);
  assert.deepEqual(requests.map(r => r.key), ['family.description', 'figma.grid', 'properties.description.default', 'properties.title.default']);
  for (const r of requests.filter(r => !r.key.startsWith('properties.'))) assert.ok(r.evidence.every(e => e.startsWith('components/ui/card.tsx:L4 ')), r.key);
  assert.match(requests.find(r => r.key === 'properties.title.default').evidence[0], /^components\/ui\/card\.tsx:L\d+ exports CardTitle, a part that sets its own text style: the Title layer$/);
  assert.match(requests.find(r => r.key === 'figma.grid').evidence[0], /no cva; the Contract's axes: card-footer \(2\), state \(1\)/);
});

// ---------- a family file with no export named after the family (#154) ----------

test('a family file with no export named after the family is read through its one exported component, which the Contract\'s code names', { skip }, async () => {
  const project = variant('components/ui/label.tsx', t => t.replaceAll('Label(', 'FieldLabel(').replace('export { Label }', 'export { FieldLabel }'));
  const doc = (await library({ project, families: ['label'] })).doc;
  const drafts = JSON.parse(readFileSync(new URL('../fixtures/drafts/label.json', import.meta.url), 'utf8')).drafts;
  // the root is no longer named Label, so its text layer is Label, keyed label, not Text (#166)
  const { contract } = await generate({ project, family: 'label', foundations: doc, drafts: { ...drafts, 'properties.label.default': drafts['properties.text.default'] } });
  assert.equal(contract.family.key, 'label');
  assert.deepEqual(contract.anatomy.children, [{ name: 'Label', type: 'TEXT' }]);
  assert.equal(contract.code.component, 'FieldLabel');
  assert.equal(contract.code.import, 'import { FieldLabel } from "@/components/ui/label"');
  assert.equal(contract.anatomy.name, 'FieldLabel');
  assert.deepEqual([contract.selection.status, contract.selection.approval], ['draft', null]);
});

test('a family file with several exported components and none named after the family fails, naming them', { skip }, async () => {
  const project = variant('components/ui/card.tsx', t => t.replace('function Card(', 'function CardRoot(').replace(/export \{\s*Card,/, 'export {\n  CardRoot,'));
  await assert.rejects(readFamily({ project, family: 'card', foundations }),
    /components\/ui\/card\.tsx exports no Card but 7 components \(CardRoot, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter\)/);
});

test('sonner.tsx exports Toaster alone: --family sonner reads it as the root, past the export check (#154)', { skip }, async () => {
  await assert.rejects(readFamily({ project: FIXTURE, family: 'sonner', foundations }), e => {
    assert.doesNotMatch(e.message, /exports no/);
    assert.match(e.message, /^Toaster \(State=Enabled\) is not a flex or grid container/);
    return true;
  });
});

// ---------- a plain-box root, and a provider read through its Trigger (#153) ----------

const draftsOf = name => JSON.parse(readFileSync(new URL(`../fixtures/drafts/${name}.json`, import.meta.url), 'utf8')).drafts;

test('Input is a plain box (<input>, no display utility): a column Auto Layout with no gap, start-aligned, filling across', { skip }, async () => {
  const input = await read('input');
  const root = resolve(input, { invalid: 'valid', state: 'enabled' }).layout.Input;
  assert.equal(root.direction, 'column');
  assert.equal(root.width, 'fill', 'w-full');
  assert.deepEqual(root.height, tok('spacing-8'), 'h-8');
  assert.deepEqual(root.gap, tok('spacing-0'));
  assert.deepEqual([root.alignMain, root.alignCross], ['start', 'start']);
  assert.deepEqual([root.paddingTop, root.paddingRight].map(p => p.raw), [5, 11], 'py-1 and px-2.5, each plus the 1px border');
  assert.deepEqual(input.anatomy, { name: 'Input', type: 'COMPONENT' });
  assert.ok(input.notes.some(n => n.at === 'Input.layout' && /plain box \(<input>: inline-block\)/.test(n.message)));
});

test('a root whose display utility is block reads as a plain box, its gap utility ignored', { skip }, async () => {
  const project = variant('components/ui/input.tsx', t => t.replace('"h-8 w-full', '"block gap-2 h-8 w-full'));
  const input = await readFamily({ project, family: 'input', foundations });
  const root = resolve(input, { invalid: 'valid', state: 'enabled' }).layout.Input;
  assert.equal(root.direction, 'column');
  assert.deepEqual(root.gap, tok('spacing-0'), 'a block has no gap');
  assert.ok(input.notes.some(n => /plain box \(block: block\)/.test(n.message)));
});

test('an inline root, or an element with no known box, fails: only Auto Layout is read', { skip }, async () => {
  const inline = variant('components/ui/input.tsx', t => t.replace('"h-8 w-full', '"inline h-8 w-full'));
  await assert.rejects(readFamily({ project: inline, family: 'input', foundations }), /not a flex or grid container or a plain box \(display: inline\)/);
  const span = variant('components/ui/input.tsx', t => t.replace('<input', '<span'));
  await assert.rejects(readFamily({ project: span, family: 'input', foundations }), /not a flex or grid container or a plain box \(display: not set, element span\)/);
});

test('Input drafts its invalid label, description and grid; with fixtures/drafts/input.json it writes the committed draft', { skip }, async () => {
  const doc = (await library({ project: FIXTURE, families: ['input'] })).doc;
  const { contract, requests } = await generate({ project: FIXTURE, family: 'input', foundations: doc });
  assert.equal(contract, null);
  assert.deepEqual(requests.map(r => r.key), ['axes.invalid.label', 'family.description', 'figma.grid']);
  const drafted = (await generate({ project: FIXTURE, family: 'input', foundations: doc, drafts: draftsOf('input') })).contract;
  assert.deepEqual(validate(drafted, doc).errors, []);
  assert.deepEqual([drafted.selection.status, drafted.selection.approval], ['draft', null]);
  const committed = JSON.parse(readFileSync(new URL('../../../design-systems/shadcn/contracts/input.component.json', import.meta.url), 'utf8'));
  assert.equal(contentHash(drafted), contentHash(committed));
});

test('Select is a provider with no box: it is read from SelectTrigger, with no parts but its Value text, and says so', { skip }, async () => {
  const doc = (await library({ project: FIXTURE, families: ['select'] })).doc;
  const select = await readFamily({ project: FIXTURE, family: 'select', foundations: doc });
  assert.deepEqual(select.anatomy, { name: 'Select', type: 'COMPONENT', children: [{ name: 'Value', type: 'TEXT' }] },
    'no part: the other exports render inside the Trigger or in its popup; SelectValue\'s placeholder is the Value layer (#166)');
  assert.deepEqual(select.properties.map(p => [p.key, p.binds, p.code]),
    [['placeholder', [{ node: 'Value', field: 'characters' }], { child: 'SelectValue', childProp: 'placeholder' }]]);
  assert.deepEqual(select.axes.map(a => [a.key, a.values.map(v => v.key)]), [['invalid', ['valid', 'invalid']], ['state', ['enabled', 'hover', 'focus', 'disabled']]]);
  assert.deepEqual(select.facts.provider, { line: 8, element: 'SelectPrimitive.Root', root: 'SelectTrigger' });
  const root = resolve(select, { invalid: 'valid', state: 'enabled' }).layout.Select;
  assert.deepEqual([root.direction, root.width, root.alignMain], ['row', 'hug', 'space-between'], 'SelectTrigger: flex w-fit justify-between');
  const verify = select.notes.find(n => n.level === 'verify' && n.at === 'anatomy');
  assert.match(verify.message, /renders SelectPrimitive\.Root, a provider with no box of its own, so this Contract is read from SelectTrigger \(components\/ui\/select\.tsx:33\)/);
  assert.match(verify.message, /code\.component stays Select/);
});

test('Select reaches the Drafted values, evidenced by the provider and its Trigger; with fixtures/drafts/select.json it writes a valid draft', { skip }, async () => {
  const doc = (await library({ project: FIXTURE, families: ['select'] })).doc;
  const { contract, requests } = await generate({ project: FIXTURE, family: 'select', foundations: doc });
  assert.equal(contract, null);
  assert.deepEqual(requests.map(r => r.key), ['axes.invalid.label', 'family.description', 'figma.grid', 'properties.placeholder.default']);
  assert.deepEqual(requests.find(r => r.key === 'family.description').evidence, [
    'components/ui/select.tsx:L8 exports Select, rendered as <SelectPrimitive.Root>, a provider with no box; read from SelectTrigger (L33), rendered as <SelectPrimitive.Trigger>',
    "components/ui/select.tsx:L33 SelectTrigger calls no cva; the Contract's axes: invalid (2), state (4)"]);
  const drafted = (await generate({ project: FIXTURE, family: 'select', foundations: doc, drafts: draftsOf('select') })).contract;
  assert.deepEqual(validate(drafted, doc).errors, []);
  assert.deepEqual([drafted.code.component, drafted.selection.status, drafted.selection.approval, drafted.selection.expectedCount], ['Select', 'draft', null, 8]);
});

// ---------- cva compoundVariants (#255) ----------

let chipRun;
const chip = () => (chipRun = chipRun || (async () => {
  const project = chipProject();
  const doc = (await library({ project, families: ['chip'] })).doc;
  return { project, doc, f: await readFamily({ project, family: 'chip', foundations: doc }) };
})());

test('a compound\'s classes apply where all its matches hold: Chip is Tone x Selected, each variant painted as the code paints it', { skip }, async () => {
  const { f } = await chip();
  assert.deepEqual(f.axes.map(a => [a.key, a.default, a.values.map(v => [v.key, v.code])]), [
    ['tone', 'neutral', [['neutral', { tone: 'neutral' }], ['primary', { tone: 'primary' }]]],
    ['selected', 'false', [['false', { selected: false }], ['true', { selected: true }]]],
    ['state', 'enabled', [['enabled', {}]]]]);
  // [tone, selected]: fill, stroke, the left padding with its 1px border, the label's colour.
  const want = [
    ['neutral', 'false', 'muted', 'border', 11, 'foreground'],
    ['neutral', 'true', 'secondary', 'ring', 13, 'foreground'],
    ['primary', 'false', 'background', 'border', 11, 'primary'],
    ['primary', 'true', 'primary', 'ring', 13, 'primary-foreground']];
  for (const [tone, selected, fill, stroke, padding, ink] of want) {
    const r = resolve(f, { tone, selected, state: 'enabled' });
    assert.deepEqual([r.paint.Chip.fill, r.paint.Chip.stroke, r.layout.Chip.paddingLeft.raw, r.layout.Chip.paddingRight.raw, r.paint.Label.fill],
      [tok(fill), tok(stroke), padding, padding, tok(ink)], `${tone} ${selected}`);
  }
});

test('a compound cva cannot match as the code would fails, naming its line: a key no axis has, a value no axis value, a boolean axis matched by a string', { skip }, async () => {
  const fails = async (from, to, message) => {
    const project = chipProject(text => text.replace(from, to));
    await assert.rejects(library({ project, families: ['chip'] }), message);
  };
  await fails('{ tone: "neutral", selected: true,', '{ tone: "neutral", size: "sm",', /chip\.tsx:19 chipVariants compoundVariants: size is no variant axis of chipVariants/);
  await fails('{ tone: "neutral", selected: true,', '{ tone: "loud", selected: true,', /chip\.tsx:19 .*tone "loud" is no value of the axis \(neutral, primary\)/);
  await fails('{ tone: "neutral", selected: true,', '{ tone: "neutral", selected: "true",', /chip\.tsx:19 .*selected "true": cva matches it only where the prop is given as that string, but a true\/false axis is a boolean prop/);
});
