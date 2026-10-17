// The catalog grid in a browser: cards are 200px wide unless a specimen cannot fit one, as a 288px Toast cannot.
// A stub renderer gives specimens of known widths, and no stylesheet, so a card's border is none and its chrome is
// the 16px padding each side: a 200px card has a 168px specimen host.
// Needs To-handoff's runtime (node skills/to-handoff/scripts/deps.mjs); without it these tests skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasRuntime, loadChromium } from '../../to-handoff/scripts/deps.mjs';
import { buildCatalog } from '../scripts/catalog.mjs';

const button = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url)));
const foundations = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url)));
const skip = hasRuntime() ? false : 'To-handoff runtime or browser missing: run node skills/to-handoff/scripts/deps.mjs';
const stub = render => ({ stylesheet: '', modeClass: mode => `theme-${mode}`, render });

// The page with every specimen rendered: each card's width, and each specimen's width beside its host's.
async function layout(renderer, viewport = { width: 2400, height: 900 }) {
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const tab = await browser.newPage({ viewport });
    await tab.setContent(buildCatalog({ contract: button, foundations, renderer }), { waitUntil: 'load' });
    await tab.waitForFunction(() => !document.getElementById('export').disabled || document.getElementById('error').textContent);
    assert.equal(await tab.evaluate(() => document.getElementById('error').textContent), '');
    return await tab.evaluate(() => ({
      columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length,
      cells: [...document.querySelectorAll('.tp-cell')].map(cell => {
        const host = cell.querySelector('.tp-specimen');
        return { id: cell.dataset.id, cell: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height,
          host: host.clientWidth, specimen: host.firstElementChild.getBoundingClientRect().width };
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
