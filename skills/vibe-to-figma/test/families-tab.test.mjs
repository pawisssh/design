// The review page of an Extracted Library (#262, spec #249): a Families tab first, before Foundations, showing each
// family's sites, which site gives which axis value, the elements no family took and the sites skipped. The folder is
// the fixture's, built from the committed answers; a shadcn folder's page has no such tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson } from '../../contract/scripts/io.mjs';
import { buildCatalog } from '../../to-preview/scripts/catalog.mjs';
import { fetchPreviewPackages, previewLock, previewRenderer, PREVIEW_DIR } from '../../adapter-generic/scripts/preview.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { buildReview, reviewModel } from '../scripts/review.mjs';
import { hasRuntime, loadChromium } from '../../to-handoff/scripts/deps.mjs';
import { open } from './browser.mjs';
import { PATH_A_ANSWERS, PATH_A_FAMILIES, embedded, pathAFolder, read, skip, stub, v0Folder } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { reviewExport } = require('../assets/review-export.js');
const { DOC, canonical, storedTicks, restorable } = require('../assets/review-store.js');
/** The line of the first line of the Prototype's App.tsx that holds `text`. */
const lineOf = (proto, text) => readFileSync(join(proto, 'src/App.tsx'), 'utf8').split('\n').findIndex(l => l.includes(text)) + 1;

test('the model of an Extracted Library has the families, each with its sites and the site that gives each axis value', { skip }, async () => {
  const { dir, proto } = await pathAFolder();
  const { extracted } = reviewModel(dir);
  assert.deepEqual(extracted.families.map(f => f.family), PATH_A_FAMILIES);
  const icon = extracted.families.find(f => f.family === 'icon-button');
  assert.equal(icon.tag, 'button');
  assert.equal(icon.by, 'agent');
  assert.equal(icon.description, 'A small square icon button; its tone sets the icon colour and the hover wash.');
  const green = lineOf(proto, 'text-[#16a34a] hover'), red = lineOf(proto, 'text-[#dc2626] hover'), orange = lineOf(proto, 'text-[#ea580c] hover');
  assert.deepEqual(icon.sites.map(s => [s.file, s.line]), [['src/App.tsx', green], ['src/App.tsx', red], ['src/App.tsx', orange]]);
  assert.match(icon.sites[0].snippet, /^<button className="ml-2 inline-flex .*text-\[#16a34a\] hover:bg-\[#f0fdf4\]">$/);
  assert.ok(icon.sites.every(s => /^App:/.test(s.path)));
  const [tone] = icon.axes;
  assert.deepEqual([tone.key, tone.label, tone.default], ['tone', 'Tone', 'positive']);
  assert.deepEqual(tone.values.map(v => [v.key, v.label, v.sites]), [
    ['positive', 'Positive', [`src/App.tsx:${green}`]], ['danger', 'Danger', [`src/App.tsx:${red}`]], ['warning', 'Warning', [`src/App.tsx:${orange}`]]]);
  assert.ok(tone.values.every(v => v.classes.length));

  // A ternary site gives several values of its axis.
  const segment = extracted.families.find(f => f.family === 'segment');
  const [selected] = segment.axes;
  assert.deepEqual(selected.values.map(v => v.key), ['on', 'off']);
  assert.deepEqual(selected.values[0].sites, selected.values[1].sites);
});

test('the elements no family took and the skipped sites are on the model, each with its reason', { skip }, async () => {
  const { dir, proto } = await pathAFolder();
  const { extracted } = reviewModel(dir);
  const note = lineOf(proto, 'bg-[#fef9c3]');
  assert.deepEqual(extracted.unmatched.map(u => [u.file, u.line, u.tag, u.reason]),
    [['src/App.tsx', note, 'div', 'it appears once and has no className ternary']]);
  assert.match(extracted.unmatched[0].snippet, /^<div className="rounded-\[4px\] bg-\[#fef9c3\] p-2">$/);
  assert.equal(extracted.skipped.length, 1);
  assert.equal(extracted.skipped[0].site, `src/App.tsx:${lineOf(proto, 'buttonClass("solid")')}`);
  assert.match(extracted.skipped[0].reason, /buttonClass\("solid"\).*a function call/);
  assert.match(extracted.skipped[0].snippet, /^<button className=\{buttonClass\("solid"\)\}>$/);
});

test('an owner\'s drop and the agent\'s "no family" are named as such among the unmatched', { skip }, async () => {
  const { dir, proto, root } = await pathAFolder();
  const mapPath = join(dir, 'path-a-app.family-map.json');
  const map = read(mapPath);
  map.dropped = [{ ...map.families.segment.sites[0], by: 'owner', evidence: 'owner: drop segment' }];
  map.families.segment.sites = map.families.segment.sites.slice(1);
  delete map.families.segment;
  writeJson(mapPath, map);
  await buildFolder({ project: proto, root, answers: read(PATH_A_ANSWERS) });
  const { extracted } = reviewModel(dir);
  assert.deepEqual(extracted.families.map(f => f.family), PATH_A_FAMILIES.filter(f => f !== 'segment'));
  assert.ok(extracted.unmatched.some(u => u.reason === 'owner: drop segment'));
});

test('the page has the Families tab first, before Foundations, and then a tab for each Contract', { skip }, async () => {
  const { dir } = await pathAFolder();
  const { html, model } = await buildReview({ dir, renderer: stub });
  const data = embedded(html);
  assert.deepEqual(data.tabs, ['families', 'foundations', ...PATH_A_FAMILIES]);
  assert.deepEqual(data.model, model);
  assert.deepEqual(Object.keys(data.catalogs), PATH_A_FAMILIES);
});

test('a shadcn folder\'s page has no Families tab and a model without one', { skip }, async () => {
  const { dir } = await v0Folder();
  const { html, model } = await buildReview({ dir, renderer: stub });
  assert.equal('extracted' in model, false);
  assert.equal(embedded(html).tabs[0], 'foundations');
  assert.ok(!embedded(html).tabs.includes('families'));
});

test('one real catalog of an Extracted Library family renders with the React its lockfile resolves', { skip }, async () => {
  const { dir, library } = await pathAFolder();
  // Only react, cva and cn (what the generated components import) and what they depend on: no Radix, no icon package.
  const lock = previewLock(library);
  assert.match(lock.key, /^react@19\.2\.4-scheduler@0\.27\.0-[0-9a-f]{8}$/);
  assert.deepEqual(Object.keys(lock.packageJson.dependencies), ['class-variance-authority', 'cn', 'react', 'react-dom']);
  assert.ok(lock.pruned && !lock.lock.packages['node_modules/radix-ui']);
  const installed = await fetchPreviewPackages(PREVIEW_DIR, library);
  assert.equal(read(join(installed, 'node_modules/react/package.json')).version, '19.2.4');
  assert.equal(read(join(installed, 'node_modules/react-dom/package.json')).version, '19.2.4');
  const contract = read(join(dir, 'contracts/icon-button.component.json'));
  const renderer = await previewRenderer(contract, { project: library });
  const html = buildCatalog({ contract, foundations: read(join(dir, 'path-a-app.foundations.json')), renderer });
  assert.match(html, /text-\[#16a34a\]/);
  assert.match(html, /<button/);
  // The chip's icon Slot axis renders the slot's svg stand-in, from no icon package (#259).
  const chip = read(join(dir, 'contracts/chip.component.json'));
  const chipHtml = buildCatalog({ contract: chip, foundations: read(join(dir, 'path-a-app.foundations.json')), renderer: await previewRenderer(chip, { project: library }) });
  assert.match(chipHtml, /\\u003csvg data-icon=\\"inline-start\\"/, 'a specimen, escaped in the page\'s JSON');
});

test('after an owner merge the rebuilt page shows the merged family, and the untouched families\' ticks restore', { skip }, async () => {
  const { dir, proto, root } = await pathAFolder();
  const before = reviewModel(dir);
  const untick = { 'icon-button': m => m.selectMatching({ tone: 'danger' }, false) };
  const picked = Object.fromEntries(PATH_A_FAMILIES.map(family => {
    const contract = read(join(dir, 'contracts', `${family}.component.json`));
    const Selection = require('../../to-preview/assets/selection-model.js');
    const model = new Selection(contract, require('../../contract/scripts/contract.mjs'));
    for (const id of model.specimens.keys()) model.verify(id);
    if (untick[family]) untick[family](model);
    const patch = model.omitPatch();
    return [family, { patch, checked: { family, snapshotId: patch.snapshotId, checked: model.checkedTuples() } }];
  }));
  const stored = storedTicks(reviewExport(before, picked));
  assert.equal(picked['icon-button'].patch.omit.length, 1);

  // The owner: "merge pill-button into action-button" (references/path-a.md records it in the Family map, then reruns).
  const mapPath = join(dir, 'path-a-app.family-map.json');
  const map = read(mapPath);
  map.families['action-button'] = { ...map.families['action-button'], by: 'owner', evidence: ['owner: merge pill-button into action-button'],
    sites: [...map.families['action-button'].sites, ...map.families['pill-button'].sites] };
  delete map.families['pill-button'];
  writeJson(mapPath, map);
  const asked = await buildFolder({ project: proto, root, answers: {} });
  const [request] = asked.extraction;
  const axes = Object.fromEntries(request.axes.map((a, i) => [a.id, { key: `axis-${i}`, label: `Axis ${i}`,
    values: Object.fromEntries(a.values.map((v, j) => [v.id, { key: `value-${j}`, label: `Value ${j}` }])) }]));
  await buildFolder({ project: proto, root, answers: { groups: { [request.id]: { family: 'action-button', axes, grid: { columns: request.axes.map((a, i) => `axis-${i}`), rows: [] } } } } });

  const after = reviewModel(dir);
  assert.deepEqual(after.extracted.families.map(f => f.family), ['action-button', 'card', 'chip', 'icon-button', 'segment']);
  const merged = after.extracted.families.find(f => f.family === 'action-button');
  assert.equal(merged.by, 'owner');
  assert.equal(merged.sites.length, 2);
  assert.deepEqual(after.families.map(f => f.family), ['action-button', 'card', 'chip', 'icon-button', 'segment']);

  const { patches, stale } = restorable(after, stored);
  assert.deepEqual(Object.keys(patches), ['card', 'chip', 'icon-button', 'segment']);
  assert.deepEqual(patches['icon-button'], picked['icon-button'].patch);
  assert.deepEqual(stale, ["action-button's saved ticks are from another snapshot"]);
});

// ---- In a browser -------------------------------------------------------------------------------------------------
const browserSkip = skip || (!hasRuntime() && 'To-handoff runtime or browser missing: run node skills/to-handoff/scripts/deps.mjs');

test('in a browser the Families tab opens first with the sites, the axis values, the unmatched elements and the skips', { skip: browserSkip }, async () => {
  const { dir, proto } = await pathAFolder();
  const { html } = await buildReview({ dir, renderer: stub });
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const tab = await open(browser, html, { claude: false });
    assert.deepEqual(await tab.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(t => t.textContent)),
      ['Families', 'Foundations', ...PATH_A_FAMILIES.map(f => read(join(dir, 'contracts', `${f}.component.json`)).family.name)]);
    assert.equal(await tab.evaluate(() => document.querySelector('[role=tab]').getAttribute('aria-selected')), 'true');
    const panel = await tab.evaluate(() => document.getElementById('panel-families').innerText);
    const green = lineOf(proto, 'text-[#16a34a] hover');
    assert.match(panel, /6 Component Families found in the Prototype/);
    // The chips' icon slot (#259) is shown as the axis it is, with the classes and sites that fill it.
    const sent = lineOf(proto, 'gap-1 rounded-[10px]');
    assert.match(panel, new RegExp(`Icon Inline Start \\(icon-inline-start\\)\\s+True \\(icon-inline-start\\)\\s+has-data-\\[icon=inline-start\\]:gap-1 \\[&_svg:not\\(\\[class\\*='size-'\\]\\)\\]:size-3\\s+src/App\\.tsx:${sent}`));
    assert.match(panel, /icon-button · 3 sites/);
    assert.ok(panel.includes(`src/App.tsx:${green}`) && panel.includes('text-[#16a34a] hover:bg-[#f0fdf4]'));
    assert.match(panel, /Tone \(tone\)\s+Positive \(positive\) · default/);
    assert.match(panel, /Elements no family took \(1\)/);
    assert.match(panel, /it appears once and has no className ternary/);
    assert.match(panel, /Skipped sites \(1\)[\s\S]*buttonClass\("solid"\)/);
    assert.equal(await tab.evaluate(() => document.getElementById('panel-families').hidden), false);
    await tab.click('#tab-foundations');
    assert.equal(await tab.evaluate(() => document.getElementById('panel-families').hidden), true);
  } finally { await browser.close(); }
});

test('as an Artifact, a republished page restores the untouched families\' saved ticks and saves the new Foundations document with them', { skip: browserSkip }, async () => {
  const { dir } = await pathAFolder();
  const { html, model } = await buildReview({ dir, renderer: stub });
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    // The ticks were saved against the page before a rerun moved the Foundations document.
    const saved = { designSystem: 'path-a-app', documentHash: 'sha256:0', families: {} };
    const Selection = require('../../to-preview/assets/selection-model.js');
    const contract = read(join(dir, 'contracts/icon-button.component.json'));
    const picker = new Selection(contract, require('../../contract/scripts/contract.mjs'));
    for (const id of picker.specimens.keys()) picker.verify(id);
    picker.selectMatching({ tone: 'danger' }, false);
    saved.families['icon-button'] = picker.omitPatch();
    const db = { [DOC]: saved };
    const tab = await open(browser, html, { db });
    await tab.waitForFunction(() => /Restored the saved ticks of 1 of 6 families/.test(document.getElementById('status').textContent));
    await tab.waitForFunction(() => /Ticks save as you go/.test(document.getElementById('status').textContent));
    const unchecked = await tab.evaluate(() => {
      const f = document.querySelector('iframe[data-family="icon-button"]');
      return [...f.contentDocument.querySelectorAll('.tp-cell')].filter(c => !c.querySelector('input').checked).length;
    });
    assert.ok(unchecked > 0, 'the saved untick is restored');
    // The page saves its own state once, so approve reads the new document, not the old hash.
    for (let i = 0; i < 40 && db[DOC].documentHash === 'sha256:0'; i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(db[DOC].documentHash, model.foundations.documentHash);
    assert.deepEqual(db[DOC].families['icon-button'], JSON.parse(canonical(saved.families['icon-button'])));
    assert.deepEqual(Object.keys(db[DOC].families).sort(), PATH_A_FAMILIES);
  } finally { await browser.close(); }
});
