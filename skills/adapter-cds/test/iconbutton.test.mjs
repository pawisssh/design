// The committed CDS IconButton Contract (#471): a draft that validates against the committed Foundations document,
// whose drafts hold their fingerprints, and which the preview renderer draws with the real @coinbase/cds-web
// IconButton. The source and preview tests skip until the fetch has run (node skills/adapter-cds/scripts/sources.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { expand, validate } from '../../contract/scripts/contract.mjs';
import { readJson } from '../../contract/scripts/io.mjs';
import { compiledClasses, expectations } from '../scripts/compare.mjs';
import { hasContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING } from './helpers.mjs';

const path = rel => new URL(rel, import.meta.url).pathname;
const CONTRACT = path('../../../design-systems/cds/contracts/iconbutton.component.json');
const NODES = path('../nodes/iconbutton.nodes.json');
const iconButton = readJson(CONTRACT);
const foundations = readJson(path('../../../design-systems/cds/cds.foundations.json'));
const noSources = !hasContractSources(iconButton) && SOURCES_MISSING;
const noPreview = !hasPreviewPackages() && PREVIEW_MISSING;

test('the IconButton Contract is a valid draft, Secondary at size S its Base Component', () => {
  assert.deepEqual(validate(iconButton, foundations).errors, []);
  assert.equal(expand(iconButton).length, iconButton.selection.expectedCount);
  assert.deepEqual([iconButton.selection.status, iconButton.selection.approval], ['draft', null]);
  assert.deepEqual(Object.fromEntries(iconButton.axes.map(a => [a.key, a.default])),
    { variant: 'secondary', size: 's', fill: 'solid', loading: 'off', state: 'enabled' });
});

test('every IconButton draft has evidence, and the fingerprint --check passes', { skip: noSources }, () => {
  for (const [key, entry] of Object.entries(iconButton.drafted)) assert.ok(entry.evidence.length && entry.fingerprint, key);
  const run = spawnSync(process.execPath, [path('../scripts/fingerprints.mjs'), CONTRACT, '--nodes', NODES, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, `OK ${Object.keys(iconButton.drafted).length} fingerprints\n`);
});

test('compare expects the loading Spinner at the icon size in place of the Icon, dimmed by its container', { skip: noSources }, () => {
  const { expected } = expectations({ contract: iconButton, nodes: readJson(NODES), foundations, classes: compiledClasses(iconButton) });
  const loading = expected['secondary|s|solid|on|enabled'].light;
  assert.equal(loading.Icon, null);
  assert.deepEqual(loading.Spinner, { opacity: 0.82, width: 16, height: 16 });
  assert.equal(loading.Track.width, 16);
  assert.equal(expected['secondary|l|solid|on|enabled'].dark.Arc.width, 24);
  assert.equal(expected['secondary|s|solid|off|enabled'].light.Spinner, null);
});

test('renders the Base Component with the real CDS IconButton: secondary, the gear glyph at size s', { skip: noPreview }, async () => {
  const { render } = await previewRenderer(iconButton);
  const html = render({});
  assert.match(html, /<button class="[^"]*\bcds-IconButton\b[^"]*" style="[^"]*" type="button" data-compact="true" data-variant="secondary">/);
  assert.match(html, /<div class="[^"]*cds-Icon"><span aria-hidden="true" class="iconCss-[^"]+ s-[^"]+ cds-IconButton-icon" data-icon-name="gear"/);
  assert.match(render({}, { icon: 'icon:refresh' }), /data-icon-name="refresh"/);
  assert.notEqual(render({ size: 'xs' }), render({ size: 'm' }), 'size changes the padding and the icon size');
});

test('Loading=On renders the ProgressCircle in place of the Icon, at the icon size', { skip: noPreview }, async () => {
  const { render } = await previewRenderer(iconButton);
  const small = render({ loading: 'on' });
  assert.doesNotMatch(small, /data-icon-name/);
  assert.match(small, /<div class="[^"]*" style="--width:16px;--height:16px"><div [^>]*class="[^"]*cds-IconButton-progressCircle"/,
    'the progress circle sits in its container, the button\'s child');
  assert.match(small, /<circle stroke="var\(--color-bgLine\)" [^>]*r="7" stroke-width="2"/);
  assert.match(render({ loading: 'on', size: 'l' }), /stroke="var\(--color-currentColor\)" [^>]*r="11" stroke-width="2" fill="none" stroke-dashoffset="0.25"/);
});

test('the stylesheet puts IconButton.css after Interactable.css and Pressable.css, the cascade the paint rules follow', { skip: noPreview }, async () => {
  const { stylesheet } = await previewRenderer(iconButton);
  const at = file => stylesheet.indexOf(`/* @coinbase/cds-web/esm/${file} */`);
  const order = ['system/Interactable.css', 'system/Pressable.css', 'visualizations/ProgressCircle.css', 'buttons/IconButton.css'].map(at);
  assert.ok(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])), String(order));
});
