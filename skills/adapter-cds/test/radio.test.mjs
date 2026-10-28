// The committed Radio Contract (#475): its drafts' fingerprints and citations, the real CDS Radio through the preview
// renderer, and its catalog page against the Contract in headless Chrome. Each part skips until its fetch has run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftedEvidence, expand } from '../../contract/scripts/contract.mjs';
import { readJson } from '../../contract/scripts/io.mjs';
import { compareModule, compiledClasses, expectations, missingChrome, runInChrome } from '../scripts/compare.mjs';
import { fingerprints, hasContractSources, readContractSources } from '../scripts/fingerprints.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING } from './helpers.mjs';

const load = rel => readJson(new URL(rel, import.meta.url).pathname);
const radio = load('../../../design-systems/cds/contracts/radio.component.json');
const foundations = load('../../../design-systems/cds/cds.foundations.json');
const nodes = load('../nodes/radio.nodes.json');
const label = radio.properties.find(p => p.key === 'label').default;
const noSources = !hasContractSources(radio) && SOURCES_MISSING;
const noPreview = !hasPreviewPackages() && PREVIEW_MISSING;

test('every Radio draft has evidence and the fingerprint the script computes, and its citations hold', { skip: noSources }, () => {
  const files = readContractSources(radio);
  const fp = fingerprints({ contract: radio, nodes, files }).fingerprints;
  for (const [key, entry] of Object.entries(radio.drafted)) {
    assert.ok(entry.evidence.length, `${key} has evidence`);
    assert.equal(entry.fingerprint, fp[key], key);
  }
  assert.deepEqual(draftedEvidence(radio, files), []);
});

test('renders the real CDS Radio: the circle in the Control, the label beside it, the dot only when checked', { skip: noPreview }, async () => {
  const { render } = await previewRenderer(radio);
  const base = render({});
  assert.match(base, /<div class="[^"]*cds-Control" style="--width:fit-content"><label [^>]*class="[^"]*cds-Control-label"/);
  assert.match(base, /class="[^"]*cds-Interactable [^"]*transparentWhileInactiveCss-[^"]* interactableCss-[^"]* cds-Control-icon"/);
  assert.match(base, /<input aria-checked="false" [^>]*type="radio"\/><div class="[^"]*bg-[^"]* bgLineHeavy-[^"]* baseCss-[^"]+" style="[^"]*width:20px;height:20px"/);
  assert.ok(base.includes(`>${label}</span>`), `the label ${label}`);
  assert.match(base, /class="[^"]*fgMuted-[^"]*"[^>]*id="trigger-[^"]*">/);
  assert.doesNotMatch(base, /<circle/, 'no dot while unchecked');
  // The dot fades in on mount; the renderer shows where that ends (#475), not its first frame at opacity 0.
  const checked = render({ checked: 'on' });
  assert.match(checked, /data-filled="true" role="presentation"><div style="opacity:1;transform:none"><div class="[^"]*bgPrimary-[^"]*" data-testid="radio-icon">/);
  assert.match(checked, /<circle cx="50%" cy="50%" fill="currentColor" r="6.666666666666667">/);
  assert.match(checked, /class="[^"]*\bfg-[^"]*"[^>]*id="trigger-[^"]*">/);
  const disabled = render({ state: 'disabled' });
  assert.match(disabled, /cds-Control-icon" style="[^"]*" aria-disabled="true"/);
  assert.match(disabled, /disabledCss-[^"]*"[^>]*id="trigger-[^"]*">/);
  for (const state of ['hover', 'active', 'focus']) assert.equal(render({ state }), base, `${state} renders like Enabled`);
});

test("the stylesheet holds Interactable's, Text's, Control's and Radio's CSS, in that order", { skip: noPreview }, async () => {
  const { stylesheet } = await previewRenderer(radio);
  const at = ['system/Interactable.css', 'typography/Text.css', 'controls/Control.css', 'controls/Radio.css']
    .map(p => stylesheet.indexOf(`/* @coinbase/cds-web/esm/${p} */`));
  assert.ok(at.every(i => i >= 0), 'every file is in the stylesheet');
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('the Radio catalog page matches the Contract in headless Chrome, every tuple in both Theme Modes', {
  skip: noSources || noPreview || missingChrome() || false,
}, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-radio-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract: radio, foundations, renderer: await previewRenderer(radio) }));
  const spec = expectations({ contract: radio, nodes, foundations, classes: compiledClasses(radio) });
  writeFileSync(join(dir, 'compare.js'), compareModule(spec));
  assert.deepEqual(await runInChrome(dir), { checked: expand(radio).length * spec.modes.length, mismatches: [] });
});
