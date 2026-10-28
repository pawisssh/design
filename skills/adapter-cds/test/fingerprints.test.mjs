// Drafted-value fingerprints of a CDS Contract (#387, ADR 0010). The first tests run offline on a small
// hand-written TSX, one per key kind, then on test/fixtures/anchors' families with no cds-<Family> class (#470). The
// last ones check the committed Button drafts against the pinned CDS sources, and skip until
// `node skills/adapter-cds/scripts/sources.mjs` fetched them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asDraft } from '../../contract/scripts/contract.mjs';
import { writeJson } from '../../contract/scripts/io.mjs';
import { fingerprints, hasContractSources, literalRecords, readContractSources } from '../scripts/fingerprints.mjs';
import { ANCHORS, anchorFamily } from './helpers.mjs';

const digest = facts => `sha256:${createHash('sha256').update(JSON.stringify(facts)).digest('hex')}`;

const files = {
  'packages/web/src/chips/Chip Card.tsx': 'const unrelatedCss = css`color: red;`;',
  'packages/web/src/chips/ChipCard.tsx': [
    "import { css } from '@linaria/core';",
    'const rootCss = css`',
    '  /* the outer box */',
    '  display:   inline-flex;',
    '  gap: var(--space-1);',
    '`;',
    'const leadCss = css`',
    '  margin-inline-end: ${space};',
    '`;',
    'const plain = `not a css literal`;',
    'export const ChipCard = () => <div className={cx(COMPONENT_STATIC_CLASSNAME, rootCss)}><span className={leadCss} /></div>;',
  ].join('\n'),
  'packages/common/src/tokens/chipCard.ts': 'export const variants = {};',
};
const contract = {
  family: { key: 'chip-card', name: 'Chip Card' },
  axes: [{ key: 'size', default: 'm', values: [{ key: 's' }, { key: 'm' }] }],
  properties: [{ key: 'lead', code: { prop: 'start' }, binds: [{ node: 'Lead', field: 'visible' }] }],
};
const nodes = { Root: 'cds-ChipCard rootCss', Lead: 'leadCss', Glyph: 'cds-Icon' };
const run = keys => fingerprints({ contract, nodes, files, keys });
const SCRIPT = new URL('../scripts/fingerprints.mjs', import.meta.url).pathname;

const PARTS = ['leadCss', 'rootCss'];
const ROOT = { node: 'ChipCard', element: 'cds-ChipCard rootCss', rules: ['rootCss { display: inline-flex; gap: var(--space-1); }'] };

test('the family TSX is <name without spaces>.tsx; parts is its sorted css literal names', () => {
  assert.deepEqual(run(['anatomy.Root']).facts['anatomy.Root'].parts, PARTS);
  assert.throws(() => fingerprints({ contract: { ...contract, family: { name: 'Toggle' } }, nodes, files, keys: ['anatomy.Root'] }),
    /no Toggle\.tsx among the Contract's source files/);
});

test('a literal\'s rule is `<name> { <body> }`, comments gone, whitespace collapsed, interpolations as written', () => {
  assert.deepEqual(run(['anatomy.Lead']).facts['anatomy.Lead'].rules, ['leadCss { margin-inline-end: ${space}; }']);
});

test('axes.<axis>.*: the axis and its value keys', () => {
  const { facts, fingerprints: fp } = run(['axes.size.label', 'axes.size.values.s.label']);
  const axis = { axis: 'size', kind: 'axis', values: ['s', 'm'] };
  assert.deepEqual(facts['axes.size.label'], axis);
  assert.equal(fp['axes.size.label'], digest(axis));
  assert.equal(fp['axes.size.values.s.label'], fp['axes.size.label']);
});

test('family, icons, figma and code: every axis\'s values and default, and the parts', () => {
  const { facts, fingerprints: fp } = run(['family.description', 'icons.default', 'figma.grid', 'code.alwaysEmit']);
  const family = { axes: { size: ['s', 'm'] }, defaults: { size: 'm' }, kind: 'family', parts: PARTS };
  assert.deepEqual(facts['icons.default'], family);
  for (const k of Object.keys(fp)) assert.equal(fp[k], digest(family), k);
});

test('anatomy.<layer>: the node keyed by its first entry, cds- dropped, its literals\' rules and the parts', () => {
  const { facts, fingerprints: fp } = run(['anatomy.Root', 'anatomy.Glyph']);
  assert.deepEqual(facts['anatomy.Root'], { kind: 'node', ...ROOT, parts: PARTS });
  assert.equal(fp['anatomy.Root'], digest({ element: ROOT.element, kind: 'node', node: 'ChipCard', parts: PARTS, rules: ROOT.rules }));
  // A static class alone (the Icon a layer renders) has no literal of the family's: no rules.
  assert.deepEqual(facts['anatomy.Glyph'], { kind: 'node', node: 'Icon', element: 'cds-Icon', rules: [], parts: PARTS });
});

test('layout[<match>].<node>.<field>: the node\'s facts, the same under any match', () => {
  const { facts, fingerprints: fp } = run(['layout.Root.gap', 'layout{"size":"s"}.Root.gap']);
  assert.deepEqual(facts['layout.Root.gap'], { kind: 'layout', ...ROOT });
  assert.equal(fp['layout{"size":"s"}.Root.gap'], fp['layout.Root.gap']);
});

test('properties.<key>.*: the code prop and the first bound node\'s facts', () => {
  const lead = run(['properties.lead.default']).facts['properties.lead.default'];
  assert.deepEqual(lead, { kind: 'property', prop: 'start', node: 'leadCss', element: 'leadCss', rules: ['leadCss { margin-inline-end: ${space}; }'], parts: PARTS });
});

test('a node, layout or property key also holds the pin of each other file its evidence cites (#459)', () => {
  const pinned = { ...contract, source: { files: {
    'packages/web/src/chips/ChipCard.tsx': 'sha256:1', 'packages/common/src/tokens/chipCard.ts': 'sha256:2', 'packages/web/src/chips/Chip Card.tsx': 'sha256:3' } },
  drafted: {
    'anatomy.Lead': { by: 'agent', evidence: ['ChipCard.tsx:L7 leadCss', 'chipCard.ts:L1 variants'] },
    'layout.Root.gap': { by: 'agent', evidence: ['packages/common/src/tokens/chipCard.ts:L1 variants'] },
    'properties.lead.default': { by: 'agent', evidence: ['ChipCard.tsx:L11 start'] },
    'axes.size.label': { by: 'agent', evidence: ['chipCard.ts:L1 variants'] } } };
  const { facts } = fingerprints({ contract: pinned, nodes, files });
  // the family TSX's literals are its facts already, so its pin is not
  const cited = { cited: { 'packages/common/src/tokens/chipCard.ts': 'sha256:2' } };
  assert.deepEqual(facts['anatomy.Lead'], { kind: 'node', node: 'leadCss', element: 'leadCss', rules: ['leadCss { margin-inline-end: ${space}; }'], parts: PARTS, ...cited });
  assert.deepEqual(facts['layout.Root.gap'], { kind: 'layout', ...ROOT, ...cited });
  assert.equal('cited' in facts['properties.lead.default'], false);
  assert.equal('cited' in facts['axes.size.label'], false, 'an axis key is drafted from the axis, not from a file');
});

test('keys default to the agent entries of drafted', () => {
  const drafted = { 'anatomy.Lead': { by: 'agent', evidence: ['ChipCard.tsx:L7 leadCss'], fingerprint: 'sha256:0' }, 'axes.size.label': { by: 'owner', was: 'Size' } };
  assert.deepEqual(Object.keys(fingerprints({ contract: { ...contract, drafted }, nodes, files }).fingerprints), ['anatomy.Lead']);
});

test('an unmapped layer, an entry that is no literal, and a key of no kind are refused', () => {
  assert.throws(() => run(['anatomy.Badge']), /no node for layer "Badge"/);
  assert.throws(() => fingerprints({ contract, files, nodes: { Root: 'rootCss tailCss' }, keys: ['anatomy.Root'] }),
    /layer "Root": tailCss is neither a cds- class nor a css literal of ChipCard\.tsx/);
  assert.throws(() => run(['paint.Root.fill']), /no fingerprint kind for "paint\.Root\.fill"/);
  assert.throws(() => run(['axes.tone.label']), /no fingerprint kind for "axes\.tone\.label"/);
});

test('a static class comes before the literals on its element: it is the identifying entry (#470)', () => {
  assert.throws(() => fingerprints({ contract, files, nodes: { Root: 'rootCss cds-ChipCard' }, keys: ['anatomy.Root'] }),
    /layer "Root": its static class cds-ChipCard is the identifying entry, so it comes first/);
});

// ---------- families with no cds-<Family> class (#470), from test/fixtures/anchors ----------
// in (#478): Avatar's fallback Box carries only `borderRadiusCss[shape]`, a member of a Record of literals.
test('a Record of literals is one entry, named by the Record: its rule lists each member\'s, in source order', () => {
  const tsx = [
    "const borderRadiusCss: Record<AvatarShape, LinariaClassName> = {",
    '  circle: css`',
    '    border-radius: 100%; /* round */',
    '  `,',
    '  square: css`border-radius: 4px;`,',
    '};',
    'const sizes = { s: 16 };',
  ].join('\n');
  assert.deepEqual(literalRecords(tsx), { borderRadiusCss: { circle: '\n    border-radius: 100%; /* round */\n  ', square: 'border-radius: 4px;' } });
  const withRecord = { ...files, 'packages/web/src/chips/ChipCard.tsx': `${files['packages/web/src/chips/ChipCard.tsx']}\n${tsx}` };
  const facts = fingerprints({ contract, nodes: { ...nodes, Lead: 'borderRadiusCss' }, files: withRecord, keys: ['anatomy.Lead'] }).facts['anatomy.Lead'];
  assert.deepEqual([facts.node, facts.element, facts.rules], ['borderRadiusCss', 'borderRadiusCss',
    ['borderRadiusCss { circle { border-radius: 100%; } square { border-radius: 4px; } }']]);
  assert.deepEqual(facts.parts, ['borderRadiusCss', ...PARTS]);
});

const anchored = key => {
  const { contract: c, nodes: n } = anchorFamily(key);
  return fingerprints({ contract: c, nodes: n, files: readContractSources(c, join(ANCHORS, 'sources')) }).facts;
};

test('Tag is keyed by its lowercase static class: the node is `tag`, and the Label drawn in it takes that entry', () => {
  const facts = anchored('tag');
  assert.deepEqual([facts['anatomy.Label'].node, facts['anatomy.Label'].element, facts['anatomy.Label'].rules], ['tag', 'cds-tag', []]);
  assert.deepEqual(facts['anatomy.Start'].rules, ['nodeCss { display: flex; align-items: center; }']);
});

test('Checkbox is keyed by its first Linaria literal: the node is the literal\'s name', () => {
  const facts = anchored('checkbox');
  assert.deepEqual([facts['anatomy.Mark'].node, facts['anatomy.Mark'].element], ['markCss', 'markCss']);
  assert.deepEqual(facts['anatomy.Mark'].parts, ['checkboxCss', 'markCss']);
});

test('the CLI --check passes both fixture families', () => {
  for (const [key, n] of [['tag', 3], ['checkbox', 2]]) {
    const { path, nodesPath } = anchorFamily(key);
    const run = spawnSync(process.execPath, [SCRIPT, path, '--nodes', nodesPath, '--dir', join(ANCHORS, 'sources'), '--check'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, `OK ${n} fingerprints\n`, key);
  }
});

// ---------- the committed Button drafts, against the pinned sources ----------
const NODES = new URL('../nodes/button.nodes.json', import.meta.url).pathname;
const BUTTON = new URL('../../../design-systems/cds/contracts/button.component.json', import.meta.url).pathname;
const button = JSON.parse(readFileSync(BUTTON, 'utf8'));
const skip = !hasContractSources(button) && 'run: node skills/adapter-cds/scripts/sources.mjs';
const cli = path => spawnSync(process.execPath, [SCRIPT, path, '--nodes', NODES, '--check'], { encoding: 'utf8' });

test('every Button draft has evidence and the fingerprint the script computes', { skip }, () => {
  const fp = fingerprints({ contract: button, nodes: JSON.parse(readFileSync(NODES, 'utf8')), files: readContractSources(button) }).fingerprints;
  const agent = Object.entries(button.drafted).filter(([, e]) => e.by === 'agent');
  assert.ok(agent.length > 0);
  for (const [key, entry] of agent) {
    assert.ok(entry.evidence.length > 0, key);
    assert.equal(entry.fingerprint, fp[key], key);
  }
});

test('the CLI --check passes the Button drafts, and fails naming only the entry whose fingerprint moved', { skip }, () => {
  const ok = cli(BUTTON);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(`^OK ${Object.keys(button.drafted).length} fingerprints`));
  const moved = structuredClone(button);
  moved.drafted['layout.Button.alignMain'].fingerprint = `sha256:${'f'.repeat(64)}`;
  const path = join(mkdtempSync(join(tmpdir(), 'cds-fingerprints-')), 'button.component.json');
  writeFileSync(path, JSON.stringify(moved));
  const bad = cli(path);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^layout\.Button\.alignMain: recorded sha256:f{64}, computed sha256:/);
  assert.equal(bad.stderr.trim().split('\n').length, 1, bad.stderr);
});

test('the CLI --write records the computed fingerprints and names each entry it moved', { skip }, () => {
  // A draft copy in the committed layout: --write writes a draft, so an approved Contract's text would not come back.
  const path = join(mkdtempSync(join(tmpdir(), 'cds-fingerprints-')), 'button.component.json');
  writeJson(path, asDraft(button), { from: BUTTON });
  const text = readFileSync(path, 'utf8');
  const zero = `sha256:${'0'.repeat(64)}`;
  writeFileSync(path, text.replace(/("fingerprint": )"sha256:[0-9a-f]{64}"/g, `$1"${zero}"`));
  const run = spawnSync(process.execPath, [SCRIPT, path, '--nodes', NODES, '--write'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const n = Object.keys(button.drafted).length;
  assert.match(run.stdout, new RegExp(`^layout\\.Button\\.alignMain: ${zero} -> sha256:[0-9a-f]{64}, re-draft it$`, 'm'));
  assert.match(run.stdout, new RegExp(`^OK wrote ${n} of ${n} fingerprints$`, 'm'));
  assert.equal(readFileSync(path, 'utf8'), text, 'the formatting is kept');
  const again = spawnSync(process.execPath, [SCRIPT, path, '--nodes', NODES, '--write'], { encoding: 'utf8' });
  assert.equal(again.stdout, `OK wrote 0 of ${n} fingerprints\n`);
  const fresh = structuredClone(button);
  delete fresh.drafted['icons.default'].fingerprint;
  writeFileSync(path, JSON.stringify(fresh));
  const first = spawnSync(process.execPath, [SCRIPT, path, '--nodes', NODES, '--write'], { encoding: 'utf8' });
  assert.equal(first.stdout, `OK wrote 1 of ${n} fingerprints\n`, 'an entry with no fingerprint yet is recorded, not re-drafted');
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).drafted['icons.default'].fingerprint, button.drafted['icons.default'].fingerprint);
});

test('the CLI fails a draft whose evidence cites lines that do not show its claim (#387\'s L231)', { skip }, () => {
  // A draft: an approved Contract's citations are only notes.
  const bad = asDraft(button);
  const ev = bad.drafted['icons.preferred'].evidence;
  ev[ev.length - 1] = '_webExamples.mdx:L231 startIcon="wallet" with endIcon="forwardArrow"';
  const path = join(mkdtempSync(join(tmpdir(), 'cds-fingerprints-')), 'button.component.json');
  writeFileSync(path, JSON.stringify(bad));
  const run = cli(path);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, `icons.preferred: "${ev[ev.length - 1]}": the cited lines show none of startIcon, wallet, endIcon, forwardArrow\n`);
});
