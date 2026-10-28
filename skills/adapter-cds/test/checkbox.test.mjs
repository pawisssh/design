// The committed CDS Checkbox Contract (#474): its drafts against the pinned sources, its preview with the real
// @coinbase/cds-web Checkbox, and its render comparison. Skips, saying so, until node skills/adapter-cds/scripts/sources.mjs
// has fetched the sources and preview packages; --run also needs Chrome ($CHROME).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareModule, compiledClasses, expectations, missingChrome, runInChrome } from '../scripts/compare.mjs';
import { hasContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING, scheme } from './helpers.mjs';
import { expand, validate } from '../../contract/scripts/contract.mjs';

const path = rel => new URL(rel, import.meta.url).pathname;
const CONTRACT = path('../../../design-systems/cds/contracts/checkbox.component.json');
const NODES = path('../nodes/checkbox.nodes.json');
const load = p => JSON.parse(readFileSync(p, 'utf8'));
const checkbox = load(CONTRACT);
const nodes = load(NODES);
const foundations = load(path('../../../design-systems/cds/cds.foundations.json'));
const noSources = !hasContractSources(checkbox) && SOURCES_MISSING;
const noPreview = !hasPreviewPackages() && PREVIEW_MISSING;

// A specimen's motion wrapper style, and its glyph's name and opacity.
const glyph = html => html.match(/<div data-testid="checkbox-inner" style="([^"]*)">[\s\S]*?data-icon-name="(\w+)"[^>]*style="[^"]*opacity:(\d)"/).slice(1);

test('the committed Checkbox is a valid draft against the Foundations document, awaiting approval', () => {
  assert.deepEqual(validate(checkbox, foundations), { ok: true, errors: [] });
  assert.equal(expand(checkbox).length, checkbox.selection.expectedCount);
  assert.deepEqual([checkbox.selection.status, checkbox.selection.approval], ['draft', null]);
});

// Every committed Contract's drafts are checked against their fingerprints in fingerprints.test.mjs; this runs the CLI.
test('the fingerprint CLI --check passes the Checkbox drafts, their citations included', { skip: noSources }, () => {
  const run = spawnSync(process.execPath, [path('../scripts/fingerprints.mjs'), CONTRACT, '--nodes', NODES, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('the node map anchors the root on cds-Control and the Box on checkboxCss; the glyphs by their icon names', { skip: noSources }, () => {
  const { layers } = expectations({ contract: checkbox, nodes, foundations, classes: compiledClasses(checkbox) });
  assert.deepEqual(layers.map(l => [l.name, l.className.replace(/-[a-z0-9]+$/, m => (l.entry.startsWith('cds-') ? m : '-*')), l.icon, l.drawnInParent]), [
    ['Checkbox', 'cds-Control', undefined, false], ['Control', 'cds-Control-icon', undefined, false], ['Box', 'checkboxCss-*', undefined, false],
    ['Checkmark', 'cds-Icon', 'checkmark', false], ['Minus', 'cds-Icon', 'minus', false], ['Label', 'cds-Control', undefined, true]]);
});

test('the preview renders the real Checkbox: the Box in the Control, the label, and the glyph at the frame it settles on', { skip: noPreview }, async () => {
  const { render } = await previewRenderer(checkbox);
  const off = scheme(render({}), 'light');
  assert.match(off, /^<div class="[^"]*\bcds-Control" [^>]*><label class="[^"]*cds-Control-label"/);
  assert.match(off, /class="[^"]*\bcds-Control-icon"[^>]*><input [^>]*type="checkbox"\/><div class="[^"]*\bcheckboxCss-c198zdvk"/);
  assert.match(off, /<span [^>]*class="[^"]*\bfgMuted-[^"]*"[^>]*>Label<\/span>/);
  // In #474: the motion wrapper renders its animate target (AnimatePresence initial={false}), not its initial frame.
  assert.deepEqual(glyph(off), ['opacity:0;transform:scale(0.9) translateZ(0)', 'minus', '0']);
  assert.deepEqual(glyph(render({ checked: 'on' })), ['opacity:1;transform:none', 'checkmark', '1']);
  assert.deepEqual(glyph(render({ checked: 'indeterminate' })), ['opacity:1;transform:none', 'minus', '1']);
  // Checkbox keeps indeterminate from Control, so its label stays fgMuted (the Contract's note).
  assert.match(render({ checked: 'indeterminate' }), /class="[^"]*\bfgMuted-[^"]*"[^>]*>Label</);
  assert.match(render({ checked: 'on' }), /class="[^"]*\bfg-[^"]*"[^>]*>Label</);
});

test('Disabled marks the Control aria-disabled and the label disabled; forced States render like Enabled', { skip: noPreview }, async () => {
  const { render } = await previewRenderer(checkbox);
  const disabled = render({ state: 'disabled' });
  assert.match(disabled, /class="[^"]*\bcds-Control-icon"[^>]*aria-disabled="true"/);
  assert.match(disabled, /class="[^"]*\bdisabledCss-[^"]*"[^>]*>Label</);
  for (const state of ['hover', 'active', 'focus']) assert.equal(render({ state }), render({}), state);
});

test('--run compares the real Checkbox page in headless Chrome, and names a value the Contract changes', {
  skip: noPreview || noSources || missingChrome() || false,
}, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-checkbox-run-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract: checkbox, foundations, renderer: await previewRenderer(checkbox) }));
  const run = spawnSync(process.execPath, [path('../scripts/compare.mjs'), CONTRACT, '--nodes', NODES, '--out', join(dir, 'compare.js'), '--run'], { encoding: 'utf8' });
  const changed = expectations({ contract: checkbox, nodes, foundations, classes: compiledClasses(checkbox) });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, new RegExp(`^checked ${Object.keys(changed.expected).length * changed.modes.length}, 0 mismatches$`, 'm'));
  changed.expected['off|enabled'].light.Minus.opacity = 1;
  writeFileSync(join(dir, 'compare.js'), compareModule(changed));
  assert.deepEqual((await runInChrome(dir)).mismatches, ['off|enabled light Minus.opacity: page 0, Contract 1']);
});
