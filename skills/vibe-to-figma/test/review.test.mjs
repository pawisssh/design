// The review page (#177): a Foundations tab, then one To-preview catalog tab per Contract of the folder, and one
// combined export of every family's ticks. A stub renderer keeps these tests off the preview packages; the
// catalogs are To-preview's own pages, byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { buildCatalog } from '../../to-preview/scripts/catalog.mjs';
import { buildReview, reviewModel } from '../scripts/review.mjs';
import { READABLE, read, selections, skip, v0Folder } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { reviewExport } = require('../assets/review-export.js');
const stub = () => ({ stylesheet: '.lib{color:red}', modeClass: m => `mode-${m}`, render: t => `<div class="lib">${Object.values(t).join(' ')}</div>` });
const embedded = html => JSON.parse(html.match(/<script type="application\/json" id="review">([\s\S]*?)<\/script>/)[1]);

test('the model: Foundations colors and Text Styles, then each Contract with its drafted values, read-only', { skip }, async () => {
  const { dir } = await v0Folder();
  const model = reviewModel(dir);
  const foundations = read(join(dir, 'v0-app.foundations.json'));
  assert.equal(model.designSystem, 'v0-app');
  assert.equal(model.foundations.documentHash, `sha256:${contractModule.sha256(readFileSync(join(dir, 'v0-app.foundations.json'), 'utf8'))}`);
  assert.deepEqual(model.foundations.colors.modes, [{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]);
  const background = model.foundations.colors.variables.find(v => v.key === 'background');
  assert.deepEqual(background, { key: 'background', name: 'Color/background', values: { light: '#ffffff', dark: '#0a0a0a' } });
  assert.equal(model.foundations.colors.variables.length, Object.values(foundations.variables).filter(v => v.type === 'COLOR').length);
  assert.equal(model.foundations.textStyles.length, Object.keys(foundations.textStyles).length);
  assert.deepEqual(model.foundations.textStyles.find(s => s.key === 'text-sm-medium'),
    { key: 'text-sm-medium', name: 'Text/text-sm-medium', fontFamily: 'Geist', fontStyle: 'Medium', fontSize: 14, lineHeight: '20px', fontWeight: 500 });

  assert.deepEqual(model.families.map(f => f.family), READABLE);
  const label = model.families.find(f => f.family === 'label');
  assert.equal(label.name, 'Label');
  assert.equal(label.status, 'draft');
  assert.equal(label.variants, 1);
  assert.deepEqual(label.drafted.map(d => d.key), ['family.description', 'figma.grid', 'properties.text.default']);
  assert.deepEqual(label.drafted[0], { key: 'family.description', by: 'agent',
    value: 'A short medium-weight text label that names a form control, in one enabled state.' });
});

test('the page: the Foundations tab first, then one tab per Contract holding To-preview\'s own catalog for it', { skip }, async () => {
  const { dir } = await v0Folder();
  const { html } = await buildReview({ dir, renderer: stub });
  const data = embedded(html);
  assert.deepEqual(data.tabs, ['foundations', ...READABLE]);
  const foundations = read(join(dir, 'v0-app.foundations.json'));
  for (const family of READABLE) {
    const contract = read(join(dir, 'contracts', `${family}.component.json`));
    assert.equal(data.catalogs[family], buildCatalog({ contract, foundations, renderer: stub() }), family);
  }
  assert.deepEqual(data.model, reviewModel(dir));
  assert.ok(!/<script src=/.test(html), 'self-contained: opens from file://');
  assert.match(html, /<title>v0-app review<\/title>/);
});

test('one export holds every family\'s ticks, with the Foundations document it was reviewed against', { skip }, async () => {
  const { dir } = await v0Folder();
  const model = reviewModel(dir);
  const picked = selections(dir, { button: m => m.selectMatching({ size: 'xs' }, false) });
  const exported = reviewExport(model, picked);
  assert.equal(exported.designSystem, 'v0-app');
  assert.equal(exported.documentHash, model.foundations.documentHash);
  assert.deepEqual(Object.keys(exported.families), READABLE);
  assert.deepEqual(exported.families.button, picked.button);
  assert.ok(exported.families.button.patch.omit.some(p => p.size === 'xs'));
});

test('the export refuses a missing or unknown family, or ticks from another family', { skip }, async () => {
  const { dir } = await v0Folder();
  const model = reviewModel(dir);
  const picked = selections(dir);
  const { select, ...rest } = picked;
  assert.throws(() => reviewExport(model, rest), /no ticks for select/);
  assert.throws(() => reviewExport(model, { ...picked, sonner: picked.label }), /sonner has no Contract in v0-app/);
  assert.throws(() => reviewExport(model, { ...picked, select: picked.label }), /select's ticks are label's/);
  // An approved family is not on the page (#180): its ticks are refused, and the rest export without it.
  const { label, ...unapproved } = picked;
  const keptLabel = { ...model, families: model.families.filter(f => f.family !== 'label'), kept: ['label'] };
  assert.throws(() => reviewExport(keptLabel, picked), /label is approved and not on the review page/);
  assert.deepEqual(Object.keys(reviewExport(keptLabel, unapproved).families), READABLE.filter(f => f !== 'label'));
});
