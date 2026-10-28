// The Avatar Contract (#478) through the CDS preview renderer and the render comparison: real @coinbase/cds-web
// Avatar markup per tuple, its catalog, and the Contract against that page in headless Chrome. The preview tests skip
// until the packages are fetched, the Chrome one without Chrome (set CHROME), as preview.test.mjs and
// compare.test.mjs do for Button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expand, resolve, tupleKey } from '../../contract/scripts/contract.mjs';
import { compiledClasses, missingChrome } from '../scripts/compare.mjs';
import { hasContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING } from './helpers.mjs';

const path = rel => new URL(rel, import.meta.url).pathname;
const CONTRACT = path('../../../design-systems/cds/contracts/avatar.component.json');
const NODES = path('../nodes/avatar.nodes.json');
const avatar = JSON.parse(readFileSync(CONTRACT, 'utf8'));
const foundations = JSON.parse(readFileSync(path('../../../design-systems/cds/cds.foundations.json'), 'utf8'));
const skip = hasPreviewPackages() ? false : PREVIEW_MISSING;

// The full product of the axes, omitted tuples included.
const all = () => expand({ ...avatar, selection: { ...avatar.selection, omit: [] } });
// What a tuple draws: its resolved layout and paint without the layers it hides, and their children.
const drawn = tuple => {
  const { layout, paint } = resolve(avatar, tuple);
  const hidden = new Set();
  const walk = (node, off) => {
    if (off || (layout[node.name] || {}).visible === false) hidden.add(node.name);
    (node.children || []).forEach(c => walk(c, hidden.has(node.name)));
  };
  walk(avatar.anatomy, false);
  const keep = rules => Object.fromEntries(Object.entries(rules).filter(([n]) => !hidden.has(n)));
  return { layout: keep(layout), paint: keep(paint) };
};
// One specimen's Light subtree.
const light = html => html.match(/<div class="cds-default light cds-preview-scheme"[^>]*>([\s\S]*?)<\/div><div class="cds-default dark/)[1];

test('the omitted combinations are twins: each draws as the same tuple with the default colour scheme', () => {
  const scheme = avatar.axes.find(a => a.key === 'colorScheme');
  const kept = new Set(expand(avatar).map(t => tupleKey(avatar, t)));
  const omitted = all().filter(t => !kept.has(tupleKey(avatar, t)));
  assert.ok(omitted.length, 'the Contract omits some');
  for (const t of omitted) {
    const twin = { ...t, colorScheme: scheme.default };
    assert.ok(kept.has(tupleKey(avatar, twin)), tupleKey(avatar, t));
    assert.deepEqual(drawn(t), drawn(twin), tupleKey(avatar, t));
  }
  // and a selected one is no twin: its ring takes the scheme's colour
  const on = { ...omitted[0], selected: 'on' };
  assert.notDeepEqual(drawn(on), drawn({ ...on, colorScheme: scheme.default }));
});

test('renders the Base Component with the real CDS Avatar: CDS\'s own fallback picture, no initial', { skip }, async () => {
  const { render } = await previewRenderer(avatar);
  const html = light(render({}));
  assert.match(html, /^<div class="[^"]*\bcds-Avatar wrapperCss-[^"]+"[^>]* data-colorscheme="blue">/);
  assert.match(html, /<div class="[^"]*\bavatarCss-[^"]+ circle-[^"]+" style="[^"]*width:var\(--avatarSize-l\);height:var\(--avatarSize-l\)[^"]*"[^>]* data-shape="circle">/);
  assert.match(html, /<img class="[^"]*\bcds-RemoteImage\b[^"]*"[^>]* src="data:image\/jpeg;base64,/);
  assert.doesNotMatch(html, /<p /, 'no initial');
});

test('Content=Initial draws the Initial property\'s letter on the colour scheme; each axis value maps through its code props', { skip }, async () => {
  const { render } = await previewRenderer(avatar);
  const initial = light(render({ content: 'initial', colorScheme: 'teal' }));
  assert.match(initial, /data-colorscheme="teal"/);
  assert.match(initial, /<div class="[^"]*\bcurrentColor-[^"]+[^"]* circle-[^"]+" data-testid="undefined-fallback"[^>]*><p [^>]*>A<\/p><\/div>/);
  assert.doesNotMatch(initial, /cds-RemoteImage/);
  assert.match(light(render({ content: 'initial' }, { initial: 'Bob' })), />B<\/p>/, 'a usage\'s name shows its first letter');
  assert.match(light(render({ shape: 'square', selected: 'on' })), /avatarCss-[^"]+ square-[^"]+"[^>]* data-selected="true" data-shape="square"/);
  assert.match(light(render({ size: 'xxxl' })), /width:var\(--avatarSize-xxxl\)/);
  const title = light(render({ content: 'initial', size: 'xxl' })), body = light(render({ content: 'initial', size: 'xl' }));
  assert.match(title, /<p class="[^"]*\btitle2-/);
  assert.match(body, /<p class="[^"]*\bbody-/);
  // a selected hexagon draws its ring as an offset HexagonBorder beside the Shape, which the Contract notes and doesn't draw
  assert.match(light(render({ shape: 'hexagon', selected: 'on' })), /data-offset="true"/);
});

test('To-preview builds the Avatar catalog: one specimen per tuple, omitted ones too, with Avatar\'s CSS and no forced State', { skip }, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const html = buildCatalog({ contract: avatar, foundations, renderer: await previewRenderer(avatar) });
  const data = JSON.parse(html.match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(data.specimens).length, all().length);
  assert.deepEqual(data.forces, []);
  assert.ok(html.includes('/* @coinbase/cds-web/esm/media/Avatar.css */'));
});

test('compiledClasses: Avatar\'s literals, and its Record borderRadiusCss as one compiled class per shape', { skip: !hasContractSources(avatar) && SOURCES_MISSING }, () => {
  const compiled = compiledClasses(avatar);
  assert.match(compiled.avatarCss, /^avatarCss-[a-z0-9]+$/);
  assert.deepEqual(compiled.borderRadiusCss.map(c => c.split('-')[0]), ['circle', 'square', 'hexagon']);
});

test('--run: the Avatar Contract matches the real Avatar page in headless Chrome, every tuple in both Modes', {
  skip: !hasPreviewPackages() ? PREVIEW_MISSING : missingChrome() || false,
}, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-avatar-run-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract: avatar, foundations, renderer: await previewRenderer(avatar) }));
  const run = spawnSync(process.execPath, [path('../scripts/compare.mjs'), CONTRACT, '--nodes', NODES, '--out', join(dir, 'compare.js'), '--run'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, new RegExp(`^checked ${expand(avatar).length * 2}, 0 mismatches$`, 'm'));
});
