// The committed TextInput Contract (#477): its drafts against the pinned sources, its specimens rendered with the real
// @coinbase/cds-web TextInput, and its render comparison. Each part skips until the fetch it needs has run
// (node skills/adapter-cds/scripts/sources.mjs fetches the sources and the preview packages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseTuple, draftedEvidence, expand, resolve, tupleKey, validate } from '../../contract/scripts/contract.mjs';
import { compiledClasses, expectations, missingChrome } from '../scripts/compare.mjs';
import { fingerprints, hasContractSources, readContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING, scheme } from './helpers.mjs';

const path = rel => new URL(rel, import.meta.url).pathname;
const CONTRACT = path('../../../design-systems/cds/contracts/textinput.component.json');
const NODES = path('../nodes/textinput.nodes.json');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const contract = read(CONTRACT);
const nodes = read(NODES);
const foundations = read(path('../../../design-systems/cds/cds.foundations.json'));
const sourcesSkip = !hasContractSources(contract) && SOURCES_MISSING;
const previewSkip = !hasPreviewPackages() && PREVIEW_MISSING;

const light = html => scheme(html, 'light');

test('the Contract validates against the Foundations document, and its Base Component is the outside label at size l', () => {
  assert.deepEqual(validate(contract, foundations).errors, []);
  const base = baseTuple(contract);
  assert.equal(base.labelVariant, 'outside');
  assert.equal(base.size, 'l');
  assert.equal(expand(contract).length, contract.selection.expectedCount);
});

test('every TextInput draft has evidence, a fingerprint the script computes, and citations that hold', { skip: sourcesSkip }, () => {
  const files = readContractSources(contract);
  const fp = fingerprints({ contract, nodes, files }).fingerprints;
  const agent = Object.entries(contract.drafted).filter(([, e]) => e.by === 'agent');
  assert.ok(agent.length > 0);
  for (const [key, entry] of agent) {
    assert.ok(entry.evidence.length > 0, key);
    assert.equal(entry.fingerprint, fp[key], key);
  }
  assert.deepEqual(draftedEvidence(contract, files), []);
});

test('the node map anchors each layer the page has: the root and the start and end nodes have no anchor of their own', { skip: sourcesSkip }, () => {
  const { layers } = expectations({ contract, nodes, foundations, classes: compiledClasses(contract) });
  const unanchored = layers.filter(l => l.className === null).map(l => l.name);
  assert.deepEqual(unanchored, Object.keys(nodes).filter(n => nodes[n] === ''));
  assert.equal(layers.find(l => l.name === 'Input').className.split('-')[0], 'nativeInputContainerCss');
  assert.ok(layers.find(l => l.name === 'Placeholder').drawnInParent, 'the placeholder is the input\'s text');
});

test('renders the Base Component with the real CDS TextInput: label, field, placeholder and helper text', { skip: previewSkip }, async () => {
  const { render } = await previewRenderer(contract);
  const html = light(render(baseTuple(contract)));
  assert.match(html, /<label class="[^"]*" [^>]*for="cds-textinput-label-[^"]+">Label<\/label>/);
  assert.match(html, /class="[^"]*cds-Interactable[^"]*" data-testid="input-interactable-area"/);
  assert.match(html, /<input [^>]*class="[^"]*nativeInputContainerCss-[^"]*"[^>]*data-labelvariant="outside" data-size="l" data-start="false"[^>]*placeholder="Placeholder"\/>/);
  assert.match(html, /id="cds-textinput-description-[^"]+">Helper text<\/span>/);
  assert.equal([...html.matchAll(/data-icon-name="search"/g)].length, 1, 'the end icon, which the specimen shows; the start slot is empty');
});

test('an inside label stacks at size l and sits in the start node at s and m; a start icon sets data-start', { skip: previewSkip }, async () => {
  const { render } = await previewRenderer(contract);
  const stacked = light(render({ labelVariant: 'inside', size: 'l', start: 'start' }));
  assert.match(stacked, /<label class="[^"]*insideLabelCss-[^"]* insideLabelCssStartCss-[^"]*"/);
  assert.match(stacked, /data-labelvariant="inside" data-size="l" data-start="true"/);
  const inline = light(render({ labelVariant: 'inside', size: 's' }));
  assert.doesNotMatch(inline, /insideLabelCss/);
  assert.match(inline, /data-inlinelabel="true" data-labelvariant="outside" data-size="s"/);
  assert.match(light(render({ variant: 'negative' })), /cds-Icon"[^>]*><span [^>]*data-icon-name="info"/, 'a negative helper text starts with the info icon');
});

test('the comparison expects each value the Contract resolves, through the Foundations document', { skip: sourcesSkip }, () => {
  const { expected } = expectations({ contract, nodes, foundations, classes: compiledClasses(contract) });
  const base = baseTuple(contract);
  const { layout } = resolve(contract, base);
  const want = expected[tupleKey(contract, base)].light;
  assert.equal(want.Input.paddingLeft, foundations.variables[layout.Input.paddingLeft.token].values.default.value);
  assert.equal(want['Stacked label'], null, 'the stacked label is hidden with an outside label');
  assert.equal(want.Start, null, 'no start node without a start icon or an inline label');
});

test('--run: the real catalog page matches the Contract but for the field fills Interactable blends and the focus ring', {
  skip: previewSkip || sourcesSkip || missingChrome() || false,
}, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-textinput-run-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract, foundations, renderer: await previewRenderer(contract) }));
  const run = spawnSync(process.execPath, [path('../scripts/compare.mjs'), CONTRACT, '--nodes', NODES, '--out', join(dir, 'compare.js'), '--run'], { encoding: 'utf8' });
  const lines = run.stdout.trim().split('\n').slice(2);
  // The notes at paint.Field.fill and layout[state=focus].Field.strokeWeight say why these differ.
  assert.deepEqual([...new Set(lines.map(l => `${l.split(' ')[0].split('|').at(-1)} ${l.split(' ')[2]}`))].sort(),
    ['active Field.fill:', 'disabled Field.fill:', 'focus Field.borderWidth:', 'hover Field.fill:']);
  assert.ok(!lines.some(l => l.includes('|enabled ')), 'every Enabled tuple matches');
});
