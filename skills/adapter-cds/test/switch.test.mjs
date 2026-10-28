// The CDS Switch Contract (#476): the preview renderer draws each tuple with the real @coinbase/cds-web Switch, and
// the render comparison finds every layer of the node map; fingerprints.test.mjs checks its drafts. Skips until the
// sources and the preview packages are fetched (node skills/adapter-cds/scripts/sources.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expand } from '../../contract/scripts/contract.mjs';
import { readJson } from '../../contract/scripts/io.mjs';
import { compiledClasses, expectations } from '../scripts/compare.mjs';
import { hasContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { REPO_ROOT } from '../scripts/sources.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING } from './helpers.mjs';

const committed = path => readJson(join(REPO_ROOT, 'design-systems/cds', path));
const contract = committed('contracts/switch.component.json');
const nodes = readJson(join(REPO_ROOT, 'skills/adapter-cds/nodes/switch.nodes.json'));
const skip = hasPreviewPackages() ? false : PREVIEW_MISSING;
const noSources = !hasContractSources(contract) && SOURCES_MISSING;

// A specimen's Light and Dark subtrees, in that order; `track` the track's class list.
const modes = html => html.split('<div class="cds-default dark ');
const track = html => html.match(/<div class="([^"]*\bcds-Switch-track\b[^"]*)"/)[1].split(' ');

test('renders the Base Component with the real CDS Switch: off track, thumb at its start, the label', { skip }, async () => {
  const { render } = await previewRenderer(contract);
  const [light] = modes(render({}));
  assert.match(light, /class="[^"]*\bcds-Switch" [^>]*role="presentation"/);
  assert.match(light, /class="[^"]*\bcds-Interactable\b[^"]*\bcds-Control-icon"/);
  assert.match(light, /<input [^>]*type="checkbox" role="switch"\/>/);
  assert.ok(track(light).includes('bgTertiary-b14ye04l'), 'the track is bgTertiary while off');
  assert.match(light, /class="[^"]*\bcds-Switch-thumb" data-testid="switch-thumb" style="transform:none"/);
  assert.match(light, new RegExp(`>${contract.properties.find(p => p.key === 'label').default}</span>`));
});

test('each axis value maps through its Contract code props; forced States render like Enabled', { skip }, async () => {
  const { render } = await previewRenderer(contract);
  const on = variant => modes(render({ variant, checked: 'on' }))[0];
  for (const [variant, colour] of [['primary', 'bgPrimary'], ['positive', 'bgPositive'], ['negative', 'bgNegative']]) {
    assert.ok(track(on(variant)).some(c => c.startsWith(`${colour}-`)), `${variant} paints the checked track ${colour}`);
    assert.ok(track(modes(render({ variant }))[0]).includes('bgTertiary-b14ye04l'), `${variant} is bgTertiary while off`);
  }
  assert.match(on('primary'), /data-filled="true"/);
  assert.match(on('primary'), /style="transform:translateX\(calc\(var\(--controlSize-switchWidth\) - var\(--controlSize-switchHeight\)\)\)/);
  assert.match(render({ state: 'disabled' }), /cds-Control-icon" [^>]*aria-disabled="true"/);
  for (const state of ['hover', 'active', 'focus']) assert.equal(render({ state }), render({}), state);
});

test("the thumb is fgInverse in Light and fg in Dark, as the Synthesized token switch-thumb-background aliases", { skip }, async () => {
  const { render } = await previewRenderer(contract);
  const thumb = html => html.match(/<div class="([^"]*)\bcds-Switch-thumb"/)[1];
  const [light, dark] = modes(render({}));
  assert.match(thumb(light), /\bfgInverse-/);
  assert.match(thumb(dark), /(^| )fg-/);
  const { values } = committed('cds.foundations.json').variables['switch-thumb-background'];
  assert.deepEqual([values.light.alias, values.dark.alias], ['fgInverse', 'fg']);
});

test('To-preview builds a catalog page for the Switch Contract, one specimen per tuple, with Control and Switch CSS', { skip }, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const html = buildCatalog({ contract, foundations: committed('cds.foundations.json'), renderer: await previewRenderer(contract) });
  const data = JSON.parse(html.match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(data.specimens).length, expand(contract).length);
  assert.deepEqual(data.forces.map(f => f.pseudo), [':hover', ':active', ':focus-visible']);
  const at = ['controls/Control.css', 'controls/Switch.css'].map(p => html.indexOf(`/* @coinbase/cds-web/esm/${p} */`));
  assert.ok(at[0] >= 0 && at[1] > at[0], 'Control.css, then Switch.css');
});

test('the render comparison finds each layer by its static class, the Label by its text in the root', { skip: noSources }, () => {
  const { layers } = expectations({ contract, nodes, foundations: committed('cds.foundations.json'), classes: compiledClasses(contract) });
  assert.deepEqual(layers.map(l => [l.name, l.className, l.drawnInParent]), [
    ['Switch', 'cds-Switch', false], ['Control', 'cds-Control-icon', false], ['Track', 'cds-Switch-track', false],
    ['Thumb', 'cds-Switch-thumb', false], ['Label', 'cds-Switch', true]]);
});
