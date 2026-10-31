// Drafted-value fingerprints of a Carbon Contract (#144, ADR 0010, SKILL.md §2 step 13).
// The first tests run offline on small hand-written sources. The last ones check the committed TextInput drafts
// against the pinned Carbon sources, and skip until `node skills/adapter-carbon/scripts/sources.mjs` fetched them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprints, readContractSources, hasContractSources } from '../scripts/fingerprints.mjs';

const hex = text => createHash('sha256').update(text).digest('hex');

const TSX = 'packages/react/src/components/TextInput/TextInput.tsx';
const SCSS = 'packages/styles/scss/components/text-input/_text-input.scss';
const files = {
  [TSX]: [
    'const wrapper = cx(`${prefix}--form-item`, `${prefix}--text-input-wrapper`);',
    'const field = cx(`${prefix}--text-input__field-wrapper`, { [`${prefix}--text-input__field-wrapper--warning`]: warn });',
    '<div className={`${prefix}--text-input__field-wrapper`}><input className={`${prefix}--text-input`} /></div>',
  ].join('\n'),
  [SCSS]: [
    '// a line comment',
    '.#{$prefix}--text-input {',
    '  /* a block comment */',
    '  block-size:   $size;',
    '  &:focus { outline: none; }',
    '}',
    '.#{$prefix}--text-input--invalid { color: red; }',
    '.#{$prefix}--text-input__field-wrapper { display: flex; }',
    '.#{$prefix}--text-input-wrapper { inline-size: 100%; }',
    '.#{$prefix}--text-input__field-wrapper .#{$prefix}--text-input { padding: 0; }',
    '.#{$prefix}--form-item { flex-direction: column; }',
  ].join('\n'),
  'packages/themes/src/dtcg/themes.json': '{}',
};
const contract = {
  family: { key: 'text-input' },
  axes: [{ key: 'size', default: 'md', values: [{ key: 'sm' }, { key: 'md' }] }],
  properties: [{ key: 'label', code: { prop: 'labelText' }, binds: [{ node: 'Box', field: 'characters' }] }],
};
const nodes = { Field: 'text-input__field-wrapper', Box: 'text-input', Value: { of: 'Box' } };
const run = keys => fingerprints({ contract, nodes, files, keys });

const PARTS = ['field-wrapper', 'field-wrapper--warning'];
const BOX_RULES = [
  '.#{$prefix}--text-input { block-size: $size; &:focus { outline: none; } }',
  '.#{$prefix}--text-input--invalid { color: red; }',
  '.#{$prefix}--text-input__field-wrapper .#{$prefix}--text-input { padding: 0; }',
];

test('parts is the sorted <element> of every cds--<family>__<element> class in the React source, modifiers kept', () => {
  assert.deepEqual(run(['anatomy.Box']).facts['anatomy.Box'].parts, PARTS);
});

test('a node\'s element is its own class; rules are the sorted SCSS blocks naming it or a modifier of it', () => {
  const box = run(['anatomy.Box']).facts['anatomy.Box'];
  assert.equal(box.node, 'text-input');
  assert.equal(box.element, 'cds--text-input');
  // Comments go, whitespace collapses, interpolations stay as written, a nested block stays inside its parent.
  // `text-input-wrapper` and `text-input__field-wrapper` are other classes, not Box's.
  assert.deepEqual(box.rules, BOX_RULES);
});

test('a node with several classes is keyed by the first; its rules are the blocks naming any of them', () => {
  const root = fingerprints({ contract, files, nodes: { Root: 'text-input-wrapper form-item' }, keys: ['anatomy.Root'] }).facts['anatomy.Root'];
  assert.equal(root.node, 'text-input-wrapper');
  assert.equal(root.element, 'cds--text-input-wrapper cds--form-item');
  assert.deepEqual(root.rules, ['.#{$prefix}--form-item { flex-direction: column; }', '.#{$prefix}--text-input-wrapper { inline-size: 100%; }']);
});

test('a nested block counts for the class its resolved selector names, unless a block around it already counts', () => {
  const nested = { [SCSS]: [
    '@mixin text-input {',
    '  .#{$prefix}--text-input {',
    '    &:focus { outline: none; }',
    '    &-wrapper svg[hidden] { display: none; }',
    '    @if enabled(\'flag\') { .#{$prefix}--form-item & { margin: 0; } }',
    '  }',
    '}',
  ].join('\n') };
  const r = fingerprints({ contract, files: nested, nodes: { Root: 'text-input-wrapper form-item', Box: 'text-input' },
    keys: ['anatomy.Root', 'anatomy.Box'] }).facts;
  // `&-wrapper` resolves to .#{$prefix}--text-input-wrapper; `.#{$prefix}--form-item &` names form-item. Both keep
  // their own selector as written. Box takes the outer block only: `&:focus` is inside it already.
  assert.deepEqual(r['anatomy.Root'].rules, [
    '&-wrapper svg[hidden] { display: none; }',
    '.#{$prefix}--form-item & { margin: 0; }',
  ]);
  assert.deepEqual(r['anatomy.Box'].rules, [
    '.#{$prefix}--text-input { &:focus { outline: none; } &-wrapper svg[hidden] { display: none; } @if enabled(\'flag\') { .#{$prefix}--form-item & { margin: 0; } } }',
  ]);
});

test('strings and url() keep their braces, quotes and slashes; a line comment may hold /* */', () => {
  const tricky = { [SCSS]: [
    '// see /* the note',
    '.#{$prefix}--text-input { content: "}//{"; background: url(//cdn.example/a.png); } // done',
    '.#{$prefix}--text-input--invalid { content: \'/* not a comment */\'; }',
  ].join('\n') };
  assert.deepEqual(fingerprints({ contract, files: tricky, nodes, keys: ['anatomy.Box'] }).facts['anatomy.Box'].rules, [
    '.#{$prefix}--text-input { content: "}//{"; background: url(//cdn.example/a.png); }',
    '.#{$prefix}--text-input--invalid { content: \'/* not a comment */\'; }',
  ]);
});

test('unbalanced SCSS braces and an `of` cycle in the node map are refused', () => {
  assert.throws(() => fingerprints({ contract, files: { [SCSS]: '.a { color: red; } }' }, nodes, keys: ['anatomy.Box'] }), /unbalanced `}`/);
  assert.throws(() => fingerprints({ contract, files: { [SCSS]: '.a { color: red;' }, nodes, keys: ['anatomy.Box'] }), /unclosed `{`/);
  assert.throws(() => fingerprints({ contract, files, nodes: { A: { of: 'B' }, B: { of: 'A' } }, keys: ['anatomy.A'] }), /`of` cycle: A → B → A/);
});

test('a class of the family\'s own block is keyed by its element; a version adds :<version>', () => {
  const r = fingerprints({ contract, files, nodes: { Field: 'text-input__field-wrapper', Warn: 'text-input__field-wrapper:warn' },
    keys: ['anatomy.Field', 'anatomy.Warn'] }).facts;
  assert.equal(r['anatomy.Field'].node, 'field-wrapper');
  assert.equal(r['anatomy.Warn'].node, 'field-wrapper:warn');
  assert.equal(r['anatomy.Warn'].element, 'cds--text-input__field-wrapper');
  assert.deepEqual(r['anatomy.Warn'].rules, [
    '.#{$prefix}--text-input__field-wrapper .#{$prefix}--text-input { padding: 0; }',
    '.#{$prefix}--text-input__field-wrapper { display: flex; }',
  ]);
});

test('a layer with no element takes the facts of the node that draws it, plus of: that node\'s key', () => {
  const value = run(['anatomy.Value']).facts['anatomy.Value'];
  assert.deepEqual(value, { kind: 'node', node: 'Value', element: 'cds--text-input', rules: BOX_RULES, of: 'text-input', parts: PARTS });
});

test('each key kind hashes its own facts: sha256 of their canonical JSON', () => {
  const { facts, fingerprints: fp } = run([
    'axes.size.label', 'axes.size.values.sm.label', 'family.description', 'figma.grid', 'code.alwaysEmit',
    'layout.Box.height', 'layout{"size":"sm"}.Box.height', 'properties.label.default',
  ]);
  const axis = '{"axis":"size","kind":"axis","values":["sm","md"]}';
  assert.equal(fp['axes.size.label'], `sha256:${hex(axis)}`);
  assert.equal(fp['axes.size.values.sm.label'], `sha256:${hex(axis)}`);
  const family = '{"axes":{"size":["sm","md"]},"defaults":{"size":"md"},"kind":"family","parts":["field-wrapper","field-wrapper--warning"]}';
  for (const k of ['family.description', 'figma.grid', 'code.alwaysEmit']) assert.equal(fp[k], `sha256:${hex(family)}`, k);
  assert.deepEqual(facts['layout.Box.height'], { kind: 'layout', node: 'text-input', element: 'cds--text-input', rules: BOX_RULES });
  assert.equal(fp['layout{"size":"sm"}.Box.height'], fp['layout.Box.height'], 'a rule\'s match is not a fact');
  assert.deepEqual(facts['properties.label.default'], { kind: 'property', prop: 'labelText', node: 'text-input', element: 'cds--text-input', rules: BOX_RULES, parts: PARTS });
});

test('keys default to the agent entries of the Contract\'s drafted table', () => {
  const drafted = { 'anatomy.Box': { by: 'agent', evidence: ['x:L1 y'], fingerprint: 'sha256:0' }, 'axes.size.label': { by: 'owner', was: 'S' } };
  assert.deepEqual(Object.keys(fingerprints({ contract: { ...contract, drafted }, nodes, files }).fingerprints), ['anatomy.Box']);
});

test('a layer the node map lacks, or a key with no fingerprint kind, is refused', () => {
  assert.throws(() => run(['anatomy.Helper']), /no node for layer "Helper"/);
  assert.throws(() => run(['paint.Box.fill']), /no fingerprint kind for "paint.Box.fill"/);
});

// A Box value whose evidence cites the TSX, which Carbon's SCSS facts never read (#463).
const pin = c => `sha256:${c.repeat(64)}`;
const citing = (status, fingerprint) => ({ ...contract, selection: { status },
  source: { files: { [TSX]: pin('a'), [SCSS]: pin('b') } },
  drafted: { 'anatomy.Box': { by: 'agent', evidence: ['TextInput.tsx:L3 and _text-input.scss:L2 the input'], fingerprint } } });
const moveTsx = c => ({ ...c, source: { files: { ...c.source.files, [TSX]: pin('c') } } });
const box = c => fingerprints({ contract: c, nodes, files }).fingerprints['anatomy.Box'];

test('a draft\'s fingerprints hold the pin of each file its evidence cites, other than the SCSS the facts read', () => {
  const c = citing('draft');
  assert.deepEqual(fingerprints({ contract: c, nodes, files }).facts['anatomy.Box'].cited, { [TSX]: pin('a') });
  assert.notEqual(box(moveTsx(c)), box(c), 'a change in the cited TSX reopens the value');
});

test('an approval given before the opt-in keeps its fingerprints until the Contract is drafted again', () => {
  const before = fingerprints({ contract: { ...contract, drafted: { 'anatomy.Box': { by: 'agent' } } }, nodes, files }).fingerprints['anatomy.Box'];
  const c = citing('approved', before);
  assert.equal(box(c), before);
  assert.equal(box(moveTsx(c)), before, 'the cited TSX waits for the next draft');
  assert.notEqual(box(citing('draft', before)), before, 'drafted again, it takes the cited pins');
});

test('an approval given after the opt-in keeps the cited pins: a change in the cited TSX reopens it', () => {
  const c = citing('approved', box(citing('draft')));
  assert.equal(box(c), c.drafted['anatomy.Box'].fingerprint);
  assert.notEqual(box(moveTsx(c)), c.drafted['anatomy.Box'].fingerprint);
});

// ---------- the committed TextInput drafts, against the pinned sources ----------
const NODES = new URL('../nodes/text-input.nodes.json', import.meta.url).pathname;
const LIVE = new URL('../../../design-systems/carbon/contracts/text-input.component.json', import.meta.url).pathname;
const FIXTURE = new URL('../../to-handoff/test/fixtures/invite-teammates/drafts/text-input.component.json', import.meta.url).pathname;
const load = p => JSON.parse(readFileSync(p, 'utf8'));
const skip = !hasContractSources(load(LIVE)) && 'run: node skills/adapter-carbon/scripts/sources.mjs';

// Each committed Contract, the Select and ToastNotification ones too: opting in to cited files (#463) moves no
// approved fingerprint, since only the owner re-approves.
const committed = family => [new URL(`../../../design-systems/carbon/contracts/${family}.component.json`, import.meta.url).pathname,
  new URL(`../nodes/${family}.nodes.json`, import.meta.url).pathname];
for (const [name, [path, map]] of [['live TextInput', [LIVE, NODES]], ['#115 fixture TextInput', [FIXTURE, NODES]],
  ['live Select', committed('select')], ['live ToastNotification', committed('toast-notification')]]) {
  test(`the ${name} Contract carries the fingerprints the script computes`, { skip }, () => {
    const c = load(path);
    const { fingerprints: fp } = fingerprints({ contract: c, nodes: load(map), files: readContractSources(c) });
    for (const [key, entry] of Object.entries(c.drafted)) if (entry.by === 'agent') assert.equal(entry.fingerprint, fp[key], key);
  });
}

test('the CLI --check passes a draft whose fingerprints agree, and names each entry that does not', { skip }, () => {
  const script = new URL('../scripts/fingerprints.mjs', import.meta.url).pathname;
  const ok = spawnSync(process.execPath, [script, LIVE, '--nodes', NODES, '--check'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const c = load(LIVE);
  c.drafted['anatomy.Box'].fingerprint = `sha256:${'0'.repeat(64)}`;
  const moved = join(mkdtempSync(join(tmpdir(), 'fingerprints-')), 'text-input.component.json');
  writeFileSync(moved, JSON.stringify(c));
  const bad = spawnSync(process.execPath, [script, moved, '--nodes', NODES, '--check'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /anatomy\.Box/);
  assert.doesNotMatch(bad.stderr, /anatomy\.Field\b/);
});

test('the CLI --write leaves an approved Contract whose fingerprints agree untouched, and notes its citations', { skip }, () => {
  const script = new URL('../scripts/fingerprints.mjs', import.meta.url).pathname;
  // The live TextInput is a draft until the owner re-approves it (#462): a copy stands in approved, as `citing` does.
  const c = { ...load(LIVE), selection: { status: 'approved', approval: { by: 'owner', at: '2026-10-31T00:00:00Z' } } };
  const text = `${JSON.stringify(c, null, 2)}\n`;
  const path = join(mkdtempSync(join(tmpdir(), 'fingerprints-')), 'text-input.component.json');
  writeFileSync(path, text);
  const write = spawnSync(process.execPath, [script, path, '--nodes', NODES, '--write'], { encoding: 'utf8' });
  assert.equal(write.status, 0, write.stderr);
  assert.match(write.stdout, /^OK wrote 0 of \d+ fingerprints$/m);
  assert.equal(readFileSync(path, 'utf8'), text);
  // A line off, in the file it cited: its fingerprint holds the same cited pins, so only the citation fails.
  c.drafted['anatomy.Box'].evidence = ['TextInput.tsx:L1 the input.cds--text-input'];
  writeFileSync(path, JSON.stringify(c));
  const check = spawnSync(process.execPath, [script, path, '--nodes', NODES, '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /^OK \d+ fingerprints\nnote: anatomy\.Box: "TextInput\.tsx:L1 the input\.cds--text-input": the cited lines show none of input, cds--text-input\n$/);
});

for (const family of ['text-input', 'select', 'toast-notification']) {
  test(`the CLI --check passes the live ${family} Contract with no citation flagged, as a note or a failure (#462)`, { skip }, () => {
    const [path, map] = committed(family);
    const r = spawnSync(process.execPath, [new URL('../scripts/fingerprints.mjs', import.meta.url).pathname, path, '--nodes', map, '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^OK \d+ fingerprints\n$/);
    assert.equal(r.stderr, '');
  });
}
