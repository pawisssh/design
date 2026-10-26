// A layer whose Contract width is fill is built wider than 0 px, and one stuck at 0 px reads back as its size (#224).
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diff } from '../scripts/base-loop.mjs';
import { normalizeReadback } from '../scripts/readback.mjs';
import { basePlan, iconsPlan } from '../scripts/build-plan.mjs';
import { CORE, COMPONENTS_CORE, ROOT, chain } from './chain.mjs';
import { mockFigma } from './mock-figma.mjs';

const FIXTURES = join(ROOT, 'skills/contract/test/fixtures/form-controls');
const DOC_TEXT = readFileSync(join(FIXTURES, 'carbon.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-20T00:00:00.000Z';

// The fixture's root fills its parent, which a loose Base Component does not have: give it the width the live
// Base loop drafted.
const TEXT_INPUT = JSON.parse(readFileSync(join(FIXTURES, 'text-input.component.json'), 'utf8'));
TEXT_INPUT.layout[0].set['Text input'].width = { raw: 288, level: 'warning', reason: 'a loose Base Component has no parent to fill' };
const FILL_TEXTS = ['Value', 'Helper', 'Invalid text', 'Warn text'];

async function setup() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  const { call, foundations, ledger } = chain(mock.figma);
  await foundations(DOC_TEXT, { fileKey: FILE_KEY, at: AT });
  await call(iconsPlan([TEXT_INPUT], ICONS_DIR, ledger(), { fileKey: FILE_KEY, at: AT }), CORE);
  const base = async (options = {}) => {
    const result = await call(basePlan(TEXT_INPUT, DOC_TEXT, ledger(), { fileKey: FILE_KEY, at: AT, ...options }), COMPONENTS_CORE);
    return { result, readback: normalizeReadback(result.readback, ledger()) };
  };
  return { mock, base };
}

// Probed live: Figma keeps a 0 px node at 0 px under FILL (FILL again, or FIXED then FILL, stay 0 px), and a new
// text layer starts 0 px wide; a resize to any nonzero width, then FILL, takes the parent's width. The mock lays
// nothing out, so a 0 px node keeps 0 px under FILL there too.
const textsOf = async (mock, id) => (await mock.figma.getNodeByIdAsync(id)).findAll(n => n.type === 'TEXT');

test('every text layer the Contract fills is built wider than 0 px', async () => {
  const { mock, base } = await setup();
  const { result } = await base();
  const widths = Object.fromEntries((await textsOf(mock, result.readback.id)).map(t => [t.name, t.width]));
  for (const name of FILL_TEXTS) assert.ok(widths[name] > 0, `${name} is ${widths[name]} px wide`);
});

test('a fill text that measures 0 px reads back as 0 px, not fill, and the next build repairs it', async () => {
  const { mock, base } = await setup();
  const { result } = await base();
  // a layer the builder made before the fix: FILL is set, the width stayed 0 px
  for (const t of await textsOf(mock, result.readback.id)) if (FILL_TEXTS.includes(t.name)) t.width = 0;

  const stale = await base({ readOnly: true });
  const found = diff(TEXT_INPUT, stale.readback, DOC);
  assert.deepEqual(found.changes.map(c => `${c.node}.${c.field}`).sort(), FILL_TEXTS.map(n => `${n}.width`).sort());
  assert.deepEqual(stale.readback.layout.Value.width, { raw: 0 });

  const fixed = await base();
  assert.deepEqual(fixed.result.updated, Object.fromEntries(FILL_TEXTS.map(n => [n, ['width']])));
  assert.deepEqual(diff(TEXT_INPUT, fixed.readback, DOC).changes, []);
  for (const t of await textsOf(mock, result.readback.id)) if (FILL_TEXTS.includes(t.name)) assert.ok(t.width > 0, `${t.name} is still 0 px`);
});
