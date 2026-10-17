// The catalog grid in a browser: cards are 200×200 unless a specimen cannot fit one, as a 288px Toast or a tall Card
// cannot, and a card's text stays inside it.
// A stub renderer gives specimens of known widths, and no stylesheet, so a card's border is none and its chrome is
// the 16px padding each side: a 200px card has a 168px specimen host.
// Needs To-handoff's runtime (node skills/to-handoff/scripts/deps.mjs); without it these tests skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasRuntime, loadChromium } from '../../to-handoff/scripts/deps.mjs';
import { buildCatalog } from '../scripts/catalog.mjs';

const json = path => JSON.parse(readFileSync(new URL(`../../../design-systems/${path}`, import.meta.url)));
const button = json('carbon/contracts/button.component.json'), foundations = json('carbon/carbon.foundations.json');
// The shadcn Card: its root width is fill, and its footer source is a long package path and hash.
const card = json('shadcn/contracts/card.component.json'), shadcnButton = json('shadcn/contracts/button.component.json'), shadcnFoundations = json('shadcn/shadcn.foundations.json');
const skip = hasRuntime() ? false : 'To-handoff runtime or browser missing: run node skills/to-handoff/scripts/deps.mjs';
const stub = render => ({ stylesheet: '', modeClass: mode => `theme-${mode}`, render });

// The page with every specimen rendered: each card's width, and each specimen's width beside its host's.
async function layout(renderer, { contract = button, system = foundations, viewport = { width: 2400, height: 900 } } = {}) {
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const tab = await browser.newPage({ viewport });
    await tab.setContent(buildCatalog({ contract, foundations: system, renderer }), { waitUntil: 'load' });
    await tab.waitForFunction(() => !document.getElementById('export').disabled || document.getElementById('error').textContent);
    assert.equal(await tab.evaluate(() => document.getElementById('error').textContent), '');
    return await tab.evaluate(() => ({
      columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length,
      cells: [...document.querySelectorAll('.tp-cell')].map(cell => {
        const host = cell.querySelector('.tp-specimen'), box = cell.getBoundingClientRect();
        const inside = el => { const r = el.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom; };
        const source = cell.querySelector('.tp-card-foot > span:last-child');
        return { id: cell.dataset.id, cell: box.width, height: box.height,
          host: host.clientWidth, specimen: host.firstElementChild.getBoundingClientRect().width,
          specimenHeight: host.firstElementChild.getBoundingClientRect().height,
          textInside: [...cell.querySelectorAll('.tp-card-head, .tp-card-foot > span')].every(inside), specimenInside: inside(host.firstElementChild),
          source: { text: source.textContent, title: source.title, clipped: source.scrollWidth > source.clientWidth } };
      }),
    }));
  } finally { await browser.close(); }
}

test('specimens that fit keep 200×200 cards, a fluid one filling its host; at most 6 columns', { skip }, async () => {
  const { columns, cells } = await layout(stub(t => t.kind === 'primary' ? '<div style="width:100%;height:40px"></div>' : '<div style="width:120px;height:40px"></div>'));
  assert.equal(columns, 6);
  assert.deepEqual([...new Set(cells.map(c => `${c.cell}×${c.height}`))], ['200×200']);
  for (const c of cells) assert.equal(c.host, 168, c.id);
  for (const c of cells) assert.equal(c.specimen, c.id.startsWith('primary|') ? 168 : 120, c.id);
});

test('a specimen wider than a card widens every card to fit it at its own width; still at most 6 columns', { skip }, async () => {
  const { columns, cells } = await layout(stub(t => t.kind === 'tertiary' ? '<div style="width:288px;height:48px"></div>' : '<div style="width:100%;height:40px"></div>'));
  assert.equal(columns, 6);
  // 288 + 32: the host grows exactly to the widest specimen, and every card takes that width.
  assert.deepEqual([...new Set(cells.map(c => `${c.cell}×${c.height}`))], ['320×200']);
  for (const c of cells) assert.equal(c.host, 288, c.id);
  for (const c of cells) assert.equal(c.specimen, 288, c.id.startsWith('tertiary|') ? `${c.id} renders at its own width, not shrunk` : `${c.id}: a fluid specimen fills its host`);
});

test('a long source label stays on one line inside its card, cut with an ellipsis, the full text in its tooltip', { skip }, async () => {
  const { cells } = await layout(stub(() => '<div style="width:120px;height:40px"></div>'), { contract: card, system: shadcnFoundations });
  const source = cells.find(c => c.source.text.startsWith('@/components/ui/card sha256:'));
  assert.ok(source, 'a card footer reads the package and its hash');
  assert.equal(source.source.title, source.source.text);
  assert.ok(source.source.clipped, 'the hash is cut');
  for (const c of cells) assert.ok(c.textInside, `${c.id}: the label and footer stay inside the card`);
  assert.deepEqual([...new Set(cells.map(c => `${c.cell}×${c.height}`))], ['200×200']);
});

test('a seven-axis tuple label wraps inside its 200px card', { skip, timeout: 120000 }, async () => {
  const { cells } = await layout(stub(() => '<div style="width:40px;height:32px"></div>'), { contract: shadcnButton, system: shadcnFoundations });
  assert.equal(cells.length, 3072);
  for (const c of cells) assert.ok(c.textInside, `${c.id}: the label and footer stay inside the card`);
  for (const c of cells) assert.equal(c.cell, 200, c.id);
});

test('a specimen taller than a card makes every card tall enough to hold it below its label', { skip }, async () => {
  const { cells } = await layout(stub(t => t.kind === 'secondary' ? '<div style="width:120px;height:240px"></div>' : '<div style="width:120px;height:40px"></div>'));
  assert.equal(new Set(cells.map(c => c.height)).size, 1, 'one card height per catalog');
  assert.ok(cells[0].height > 240 + 32, 'taller than the specimen and its padding');
  for (const c of cells) assert.equal(c.cell, 200, c.id);
  for (const c of cells) assert.ok(c.specimenInside && c.textInside, `${c.id}: the specimen, label and footer stay inside the card`);
});

test('a specimen whose Contract root width is fill fills its card; a hug one keeps its own width', { skip }, async () => {
  const block = () => '<div style="height:20px">Title</div>';
  const fill = await layout(stub(block), { contract: card, system: shadcnFoundations });
  for (const c of fill.cells) assert.equal(c.specimen, c.host, `${c.id}: the Card fills its card`);
  const hug = await layout(stub(block));
  for (const c of hug.cells) assert.ok(c.specimen < c.host, `${c.id}: the Button keeps its own width`);
});
