// The review page as a private Artifact (#178): the ticks persist in the Artifact's db, come back on a reload, and
// approve reads them from there (--ticks) with the same result as the combined export. In a browser, a stand-in
// `window.claude` keeps the db in this process, so a second load of the page is a reload. Without `window.claude`
// the page is the local one of #177, with its export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hasRuntime, loadChromium } from '../../to-handoff/scripts/deps.mjs';
import { approveFolder, storedExport } from '../scripts/approve.mjs';
import { buildReview, reviewModel } from '../scripts/review.mjs';
import { READABLE, V0, selections, skip, v0Folder } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { reviewExport } = require('../assets/review-export.js');
const { DOC, storedTicks, restorable, canonical } = require('../assets/review-store.js');
const AT = '2026-10-18T00:00:00Z';
const snapshot = dir => Object.fromEntries(['', 'contracts'].flatMap(sub => readdirSync(join(dir, sub)).filter(f => f.endsWith('.json')).map(f => [join(sub, f), readFileSync(join(dir, sub, f), 'utf8')])));
const untickXs = { button: m => m.selectMatching({ size: 'xs' }, false), select: m => m.selectMatching({ state: 'disabled' }, false) };

test('the saved ticks are each family\'s omit patch, small enough for one db document', { skip }, async () => {
  const { dir } = await v0Folder();
  const exported = reviewExport(reviewModel(dir), selections(dir, untickXs));
  const stored = storedTicks(exported);
  assert.deepEqual(Object.keys(stored), ['designSystem', 'documentHash', 'families']);
  assert.equal(stored.documentHash, exported.documentHash);
  for (const family of READABLE) assert.deepEqual(stored.families[family], exported.families[family].patch, family);
  // The 3,072-variant Button's checked tuples alone are over 256 KiB; its patch is a few patterns.
  assert.ok(JSON.stringify(exported.families.button.checked).length > 256 * 1024);
  assert.ok(JSON.stringify(stored).length < 4096);
});

test('the saved ticks give back exactly the combined export the page would write', { skip }, async () => {
  const { dir } = await v0Folder();
  for (const edits of [{}, untickXs]) {
    const exported = reviewExport(reviewModel(dir), selections(dir, edits));
    assert.deepEqual(storedExport(dir, storedTicks(exported)), exported);
  }
});

test('the page restores only ticks saved on this version of it, and each family\'s only at its snapshot', { skip }, async () => {
  const { dir } = await v0Folder();
  const model = reviewModel(dir);
  const stored = storedTicks(reviewExport(model, selections(dir, untickXs)));
  assert.deepEqual(restorable(model, null), { patches: {}, stale: [] });
  assert.deepEqual(restorable(model, stored), { patches: stored.families, stale: [] });
  assert.deepEqual(restorable(model, { ...stored, documentHash: 'sha256:0' }), { patches: {}, stale: ['the saved ticks are from another Foundations document'] });
  assert.deepEqual(restorable(model, { ...stored, designSystem: 'other' }), { patches: {}, stale: ['the saved ticks are for another design system'] });
  const old = structuredClone(stored);
  old.families.card.snapshotId = 'sha256:old';
  const { card, ...rest } = stored.families;
  assert.deepEqual(restorable(model, old), { patches: rest, stale: ["card's saved ticks are from another snapshot"] });
});

test('"approve" and "approve except" over the saved ticks write what they write over the export', { skip }, async () => {
  for (const said of ['approve', 'approve except select']) {
    const viaExport = (await v0Folder()).dir, viaTicks = (await v0Folder()).dir;
    const exported = reviewExport(reviewModel(viaExport), selections(viaExport, untickXs));
    const a = await approveFolder({ dir: viaExport, project: V0, exported, said, at: AT, test: true });
    const b = await approveFolder({ dir: viaTicks, project: V0, exported: storedExport(viaTicks, storedTicks(exported)), said, at: AT, test: true });
    assert.deepEqual(b, { ...a, foundations: { ...a.foundations, path: b.foundations.path } }, said);
    assert.deepEqual(snapshot(viaTicks), snapshot(viaExport), said);
  }
});

test('saved ticks approve refuses as the export does: another Foundations document, another snapshot, an unknown family, a document that is not ticks', { skip }, async () => {
  const { dir } = await v0Folder();
  const before = snapshot(dir);
  const stored = storedTicks(reviewExport(reviewModel(dir), selections(dir)));
  const refuses = async (ticks, pattern) => {
    await assert.rejects(async () => approveFolder({ dir, project: V0, exported: storedExport(dir, ticks), said: 'approve', at: AT, test: true }), pattern);
    assert.deepEqual(snapshot(dir), before);
  };
  await refuses({ ...stored, documentHash: 'sha256:0' }, /the Foundations document moved since the review/);
  const old = structuredClone(stored);
  old.families.card.snapshotId = 'sha256:old';
  await refuses(old, /card: .*snapshotId/);
  await refuses({ ...stored, families: { ...stored.families, sonner: stored.families.label } }, /the review has ticks for sonner, which has no Contract here/);
  const { select, ...rest } = stored.families;
  await refuses({ ...stored, families: rest }, /no ticks for select/);
  await refuses({ ...stored, families: { ...stored.families, card: null } }, /card's saved ticks are not an omit patch/);
});

// ---- In a browser -------------------------------------------------------------------------------------------------
const browserSkip = skip || (!hasRuntime() && 'To-handoff runtime or browser missing: run node skills/to-handoff/scripts/deps.mjs');
const stub = () => ({ stylesheet: '', modeClass: m => `mode-${m}`, render: t => `<div>${Object.values(t).join(' ')}</div>` });

// The page served at a URL, so that a reload is a real one. `db` is this process's store: {path: document}, each kept
// with its keys sorted as the Artifact's db hands them back; `written` counts its sets. `claude: false` loads it with
// no runtime.
const written = new WeakMap();
async function open(browser, html, { db, owner = true, claude = true }) {
  const tab = await browser.newPage();
  await tab.route('http://review.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  if (claude) {
    await tab.exposeFunction('dbGet', path => (path in db ? db[path] : null));
    await tab.exposeFunction('dbSet', (path, data) => { db[path] = JSON.parse(canonical(data)); written.set(db, (written.get(db) || 0) + 1); });
    await tab.addInitScript(isOwner => {
      // As the Artifact's db does, a set takes only plain JSON data of this window: an object made in a catalog's
      // iframe is refused.
      const plain = v => v === null || ['string', 'number', 'boolean'].includes(typeof v)
        || (Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.every(plain))
        || (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));
      const set = async (path, data) => {
        if (!plain(data)) throw Object.assign(new Error('arguments must be plain JSON data'), { code: 'invalid_argument' });
        return window.dbSet(path, data);
      };
      const doc = path => ({ get: async () => { const d = await window.dbGet(path); return { exists: d !== null, data: () => d }; }, set: data => set(path, data) });
      window.claude = { use: async name => (name === 'db' ? { doc } : name === 'user' ? { isOwner: async () => isOwner } : null) };
    }, owner);
  }
  await tab.goto('http://review.test/', { waitUntil: 'load' });
  return tab;
}
const status = tab => tab.evaluate(() => document.getElementById('status').textContent);
async function catalog(tab, family) {
  for (const f of tab.frames()) if (f !== tab.mainFrame() && await (await f.frameElement()).getAttribute('data-family') === family) return f;
  throw new Error(`no ${family} catalog`);
}
const checked = f => f.evaluate(() => [...document.querySelectorAll('.tp-cell')].filter(c => c.querySelector('input').checked).map(c => c.dataset.id));

test('as an Artifact: ticks save to the db as the owner ticks, and survive a reload', { skip: browserSkip }, async () => {
  const { dir } = await v0Folder();
  const { html } = await buildReview({ dir, renderer: stub });
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const db = {};
    const first = await open(browser, html, { db });
    await first.waitForFunction(() => /Ticks save as you go/.test(document.getElementById('status').textContent));
    assert.equal(await first.evaluate(() => document.getElementById('export').hidden), true, 'an Artifact cannot download: the export goes');
    // A first open saves the page's state, so approve reads what it shows.
    const model = reviewModel(dir);
    await waitFor(() => db[DOC]);
    assert.deepEqual(db[DOC], storedTicks(reviewExport(model, selections(dir))));

    // The owner unticks every xs Button with the catalog's own controls, and one Select card by hand.
    const button = await catalog(first, 'button'), select = await catalog(first, 'select');
    await button.evaluate(() => {
      const size = [...document.querySelectorAll('#filters select')].find(s => [...s.options].some(o => o.value === 'xs'));
      size.value = 'xs'; size.dispatchEvent(new Event('change'));
      [...document.querySelectorAll('#filters button')].find(b => b.textContent === 'Uncheck visible').click();
    });
    await select.evaluate(() => document.querySelector('.tp-cell input:not(:disabled)').click());
    const want = storedTicks(reviewExport(model, selections(dir, { button: untickXs.button, select: m => m.select([...m.specimens.keys()].find(id => id !== m.baseId), false) })));
    await waitFor(() => canonical(db[DOC]) === canonical(want));
    await first.waitForFunction(() => /^Ticks saved/.test(document.getElementById('status').textContent));
    const ticked = { button: await checked(button), select: await checked(select) };

    const again = first, writes = written.get(db);
    await again.reload({ waitUntil: 'load' });
    await again.waitForFunction(() => /Restored the saved ticks of 7 of 7 families/.test(document.getElementById('status').textContent));
    assert.deepEqual(await checked(await catalog(again, 'button')), ticked.button);
    assert.deepEqual(await checked(await catalog(again, 'select')), ticked.select);
    // A reload restores without writing.
    await again.evaluate(() => new Promise(r => setTimeout(r, 600)));
    assert.equal(written.get(db), writes);
    // Approve over what the reloaded page holds is approve over what the owner ticked.
    const shown = await again.evaluate(() => {
      const frames = [...document.querySelectorAll('iframe')];
      return Object.fromEntries(frames.map(f => [f.dataset.family, f.contentWindow.Catalog.getSelection()]));
    });
    assert.deepEqual(storedExport(dir, db[DOC]), reviewExport(model, shown));

    // A tick waits 400 ms to save, but leaving the page for the chat saves it at once.
    const before = written.get(db);
    await (await catalog(again, 'card')).evaluate(() => document.querySelector('.tp-cell input:not(:disabled)').click());
    assert.match(await status(again), /^Saving the ticks/);
    await again.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => written.get(db) > before, 300);
    assert.equal(db[DOC].families.card.omit.length, 1);
    await again.close();
  } finally { await browser.close(); }
});

test('as an Artifact: ticks saved on another version of the page are not restored; a viewer who is not the owner saves nothing', { skip: browserSkip }, async () => {
  const { dir } = await v0Folder();
  const { html } = await buildReview({ dir, renderer: stub });
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const model = reviewModel(dir);
    const old = { ...storedTicks(reviewExport(model, selections(dir, untickXs))), documentHash: 'sha256:0' };
    const db = { [DOC]: old };
    const tab = await open(browser, html, { db, owner: false });
    await tab.waitForFunction(() => /only the owner's are/.test(document.getElementById('status').textContent));
    assert.match(await status(tab), /from another Foundations document/);
    assert.equal((await checked(await catalog(tab, 'button'))).length, model.families.find(f => f.family === 'button').variants);
    await (await catalog(tab, 'select')).evaluate(() => document.querySelector('.tp-cell input:not(:disabled)').click());
    await tab.evaluate(() => new Promise(r => setTimeout(r, 600)));
    assert.deepEqual(db, { [DOC]: old });
  } finally { await browser.close(); }
});

test('without the Artifact runtime the page is the local one: no db, and the combined export', { skip: browserSkip }, async () => {
  const { dir } = await v0Folder();
  const { html } = await buildReview({ dir, renderer: stub });
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const tab = await open(browser, html, { claude: false });
    await tab.waitForFunction(() => !document.getElementById('export').disabled);
    assert.equal(await tab.evaluate(() => document.getElementById('export').hidden), false);
    await tab.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => !f.contentDocument.getElementById('export').disabled));
    const exported = await tab.evaluate(() => new Promise(resolve => {
      window.addEventListener('vibe-to-figma:review', e => resolve(e.detail), { once: true });
      document.getElementById('export').click();
    }));
    assert.deepEqual(exported, reviewExport(reviewModel(dir), selections(dir)));
  } finally { await browser.close(); }
});

async function waitFor(ok, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 50));
  }
}
