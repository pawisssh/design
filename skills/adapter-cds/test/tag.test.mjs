// The committed CDS Tag Contract (#472): its drafts against the pinned sources, its specimens rendered with the real
// @coinbase/cds-web Tag, its catalog page, and the render comparison in headless Chrome. Each skips, saying which
// fetch it needs, until node skills/adapter-cds/scripts/sources.mjs has run (and, for --run, until $CHROME is set).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expand, tupleKey } from '../../contract/scripts/contract.mjs';
import { compareModule, compiledClasses, expectations, missingChrome, runInChrome } from '../scripts/compare.mjs';
import { fingerprints, hasContractSources, readContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING } from './helpers.mjs';

const path = rel => new URL(rel, import.meta.url).pathname;
const CONTRACT = path('../../../design-systems/cds/contracts/tag.component.json');
const NODES = path('../nodes/tag.nodes.json');
const tag = JSON.parse(readFileSync(CONTRACT, 'utf8'));
const nodes = JSON.parse(readFileSync(NODES, 'utf8'));
const foundations = JSON.parse(readFileSync(path('../../../design-systems/cds/cds.foundations.json'), 'utf8'));
const noSources = !hasContractSources(tag) && SOURCES_MISSING;
const noPreview = !hasPreviewPackages() && PREVIEW_MISSING;

// A Foundations colour as CDS writes it inline: rgb(r,g,b).
const rgb = (token, mode) => {
  const hex = foundations.variables[token].values[mode].resolved;
  return `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')})`;
};

test('every Tag draft has evidence and the fingerprint the script computes; the CLI --check passes', { skip: noSources }, () => {
  const fp = fingerprints({ contract: tag, nodes, files: readContractSources(tag) }).fingerprints;
  const agent = Object.entries(tag.drafted).filter(([, e]) => e.by === 'agent');
  assert.ok(agent.length > 0);
  for (const [key, entry] of agent) {
    assert.ok(entry.evidence.length > 0, key);
    assert.equal(entry.fingerprint, fp[key], key);
  }
  const cli = spawnSync(process.execPath, [path('../scripts/fingerprints.mjs'), CONTRACT, '--nodes', NODES, '--check'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
});

test('the node map finds each layer: cds-tag first, Start icon and End icon by nodeCss\'s compiled class', { skip: noSources }, () => {
  const { layers } = expectations({ contract: tag, nodes, foundations, classes: compiledClasses(tag) });
  assert.deepEqual(layers.map(l => [l.name, l.className, Boolean(l.drawnInParent)]), [
    ['Tag', 'cds-tag', false], ['Start icon', 'nodeCss-n1hf567u', false], ['Start glyph', 'cds-Icon', false],
    ['Label', 'cds-tag', true], ['End icon', 'nodeCss-n1hf567u', false], ['End glyph', 'cds-Icon', false]]);
});

test('each tuple renders the real Tag with its spectrum colours inline, the scheme\'s Foundations tokens', { skip: noPreview }, async () => {
  const { render } = await previewRenderer(tag);
  for (const tuple of expand(tag)) {
    const html = render(tuple);
    for (const mode of ['light', 'dark']) {
      const subtree = html.split(`cds-default ${mode} cds-preview-scheme`)[1];
      const want = `style="background-color:${rgb(`tag-${tuple.emphasis}-${tuple.colorScheme}-background`, mode)};color:${rgb(`tag-${tuple.emphasis}-${tuple.colorScheme}-color`, mode)}"`;
      assert.ok(subtree.includes(want), `${tupleKey(tag, tuple)} ${mode}: ${want}`);
    }
  }
  const base = render({});
  assert.match(base, /class="[^"]*\bcds-tag" data-testid="cds-tag"/);
  const icon = new RegExp(`<span class="nodeCss-n1hf567u"><div class="[^"]*\\bcds-Icon"><span [^>]*data-icon-name="${tag.icons.default}"`, 'g');
  assert.equal(base.match(icon).length, 4, 'a start and an end icon in each Mode: the specimen shows the default icon');
  const label = tag.properties.find(p => p.key === 'label').default;
  assert.match(render({ intent: 'promotional' }), new RegExp(`class="[^"]*\\bcaption-[^>]*>${label}</span>`), 'promotional sets the label in caption');
});

test('To-preview builds the Tag catalog: one specimen per tuple, no forced States, Tag.css in the stylesheet', { skip: noPreview }, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const html = buildCatalog({ contract: tag, foundations, renderer: await previewRenderer(tag) });
  const data = JSON.parse(html.match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(data.specimens).length, tag.selection.expectedCount);
  assert.deepEqual(data.forces, []);
  assert.ok(html.includes('/* @coinbase/cds-web/esm/tag/Tag.css */'));
});

test('--run: the Tag page matches the Contract in both Modes, and a changed padding is named', {
  skip: noPreview || noSources || missingChrome() || false,
}, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-tag-run-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract: tag, foundations, renderer: await previewRenderer(tag) }));
  const run = spawnSync(process.execPath, [path('../scripts/compare.mjs'), CONTRACT, '--nodes', NODES, '--out', join(dir, 'compare.js'), '--run'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, new RegExp(`^checked ${expand(tag).length * 2}, 0 mismatches$`, 'm'));
  const changed = expectations({ contract: tag, nodes, foundations, classes: compiledClasses(tag) });
  const key = tupleKey(tag, { intent: 'promotional', emphasis: 'high', colorScheme: 'red' });
  changed.expected[key].dark.Tag.paddingLeft = 4;
  writeFileSync(join(dir, 'compare.js'), compareModule(changed));
  assert.deepEqual((await runInChrome(dir)).mismatches, [`${key} dark Tag.paddingLeft: page 8, Contract 4`]);
});
