// The CDS Chip Contract (#473) through the preview renderer: the real @coinbase/cds-web Chip, pressable (its
// code.required onClick) so Interactable styles its states, with Icon elements in its start and end slots; then its
// To-preview catalog, and with $CHROME the render comparison. Skips until the packages are fetched
// (node skills/adapter-cds/scripts/sources.mjs fetches them with the sources).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expand } from '../../contract/scripts/contract.mjs';
import { missingChrome } from '../scripts/compare.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, scheme } from './helpers.mjs';

const at = rel => new URL(rel, import.meta.url).pathname;
const CHIP = at('../../../design-systems/cds/contracts/chip.component.json');
const chip = JSON.parse(readFileSync(CHIP, 'utf8'));
const foundations = JSON.parse(readFileSync(at('../../../design-systems/cds/cds.foundations.json'), 'utf8'));
const skip = hasPreviewPackages() ? false : PREVIEW_MISSING;

const light = html => scheme(html, 'light');
const openTag = html => html.match(/^<(\w+) [^>]*>/)[0];

test('renders the Base Component as a pressable Chip: an Interactable <button>, the content HStack, the label between two Icons', { skip }, async () => {
  const { render } = await previewRenderer(chip);
  const html = light(render({}));
  assert.match(openTag(html), /^<button class="[^"]*\bcds-Interactable\b[^"]*\btransitionCss-[a-z0-9]+" style="[^"]*--inter-bg:var\(--color-bgSecondary\);[^"]*" type="button">$/);
  const content = html.match(/^<button [^>]*><div [^>]*>([\s\S]*)<\/div><\/button>$/)[1];
  const icons = [...content.matchAll(/<div class="[^"]*\bfgPrimary-[^"]*\bcds-Icon"><span aria-hidden="true" class="[^"]*" data-icon-name="(\w+)"/g)];
  assert.deepEqual(icons.map(m => m[1]), [chip.icons.default, chip.icons.default], 'the specimen shows both slots, each <Icon name> in fgPrimary');
  assert.match(content, new RegExp(`<\\/div><span [^>]*>${chip.properties.find(p => p.key === 'label').default}</span><div `));
});

test('each axis value maps through its Contract code props; forced States render like Enabled', { skip }, async () => {
  const { render } = await previewRenderer(chip);
  assert.match(openTag(light(render({ state: 'disabled' }))), / data-disabled="true" disabled="" type="button">$/);
  assert.notEqual(render({ size: 'xs' }), render({ size: 's' }), 'size changes the padding classes and the text style');
  for (const state of ['hover', 'active', 'focus']) assert.equal(render({ state }), render({}));
  assert.throws(() => render({ size: 'compact' }), /unknown size value compact/);
});

test('a usage is pressable too, and renders its own label and icons; the icons are off by default', { skip }, async () => {
  const { render } = await previewRenderer(chip);
  const plain = light(render({}, { label: 'Category' }));
  assert.match(openTag(plain), /^<button /, 'onClick is always passed');
  assert.match(plain, /<span [^>]*>Category<\/span><\/div><\/button>$/);
  assert.doesNotMatch(plain, /cds-Icon/);
  const withEnd = light(render({}, { label: 'Category', endIcon: true, swapEndIcon: 'icon:caretDown' }));
  assert.match(withEnd, /Category<\/span><div class="[^"]*cds-Icon"><span [^>]*data-icon-name="caretDown"/);
  assert.throws(() => render({}, { startIcon: true, swapStartIcon: 'icon:notAnIcon' }), /@coinbase\/cds-icons has no icon notAnIcon/);
});

test('To-preview builds the Chip catalog, one specimen per tuple, with Chip.css', { skip }, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const html = buildCatalog({ contract: chip, foundations, renderer: await previewRenderer(chip) });
  const data = JSON.parse(html.match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(data.specimens).length, expand(chip).length);
  assert.ok(html.includes('/* @coinbase/cds-web/esm/chips/Chip.css */'));
  assert.ok(html.includes('/* @coinbase/cds-web/esm/system/Pressable.css */'));
});

test('--run: the Chip page matches the Contract in both Modes', { skip: skip || missingChrome() || false }, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-chip-run-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract: chip, foundations, renderer: await previewRenderer(chip) }));
  const run = spawnSync(process.execPath, [at('../scripts/compare.mjs'), CHIP, '--nodes', at('../nodes/chip.nodes.json'),
    '--out', join(dir, 'compare.js'), '--run'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, new RegExp(`^checked ${expand(chip).length * 2}, 0 mismatches$`, 'm'));
});
