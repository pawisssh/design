// shadcn through the offline chain (#124): the Generic Adapter's Foundations document and its draft Button, Card and
// Alert Contracts, approved as a prototype, built on the mock figma (foundations, then every sets batch), then the
// coverage, sample and theme checks. Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, expand } from '../../contract/scripts/contract.mjs';
import { foundationsPlan, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage, checkSample, checkTheme } from '../scripts/coverage.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';
import { pack } from './pack.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHADCN = join(ROOT, 'design-systems/shadcn');
const DOC_TEXT = readFileSync(join(SHADCN, 'shadcn.foundations.json'), 'utf8');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-17T00:00:00.000Z';
const load = name => JSON.parse(readFileSync(join(SHADCN, 'contracts', `${name}.component.json`), 'utf8'));
const FAMILIES = ['button', 'card', 'alert'].map(name => approve(load(name), AT, { prototype: true }));

async function buildAll() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  let ledger = null;
  const call = async ({ plan, state }, core) => {
    const result = await runPackage(pack(plan, state, core).code, mock.figma);
    assert.ok(!result.error, JSON.stringify(result.error));
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    if (result.ledger) ledger = recordResult(ledger, result);
    return result;
  };
  const first = foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT });
  await call(first, CORE);
  for (let chunk = 2; chunk <= (first.plan.chunk ? first.plan.chunk.of : 1); chunk++)
    await call(foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, chunk }), CORE);
  const coverage = {};
  for (const c of FAMILIES) {
    // the first build step by step (#168): loose batches, the combine, the place calls
    for (let d; (d = setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, next: true, prototype: true }));) await call(d, COMPONENTS_CORE);
    coverage[c.family.key] = await call(setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, mode: 'coverage', prototype: true }), COMPONENTS_CORE);
  }
  return { mock, ledger, coverage, call };
}
// Card's and Alert's roots are width: fill, which a hug grid set has nothing to fill (#236): the one problem they carry.
const ROOT_FILL = { button: false, card: true, alert: true };
const built = buildAll();
built.catch(() => {}); // each test awaits it and reports a failed build itself

for (const [c, count] of FAMILIES.map(c => [c, { button: 624, card: 2, alert: 2 }[c.family.key]]))
  test(`${c.family.name}: ${count} variants build with both cores and pass the coverage check`, async () => {
    const { ledger, coverage } = await built;
    assert.equal(expand(c).length, count);
    assert.equal(ledger.sets[c.family.key].variants.filter(Boolean).length, count);
    assert.deepEqual(checkCoverage(c, coverage[c.family.key], ledger).problems.map(p => p.what), ROOT_FILL[c.family.key] ? ['contract'] : []);
  });

// the text layers no Text Style fits stay raw and unbuilt (#160): Card Title's leading-snug; the sampled Button and Alert layers each bind one
const UNBUILT = { button: [], card: ['layout.Title.textStyle'], alert: [] };
for (const c of FAMILIES)
  test(`${c.family.name}: sampled variants read back as the Contract resolves them, and each paint follows its Mode`, async () => {
    const { call, ledger } = await built;
    const n = expand(c).length;
    const sample = [...new Set([0, Math.floor(n / 2), n - 1])];
    const read = await call(setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, mode: 'sample', sample, prototype: true }), COMPONENTS_CORE);
    const s = checkSample(c, read, ledger, JSON.parse(DOC_TEXT));
    // every sampled variant carries the root fill and nothing else
    assert.deepEqual(s.problems.map(p => [p.what, p.changes.length, p.unread.length, p.problems.map(q => q.what)]),
      ROOT_FILL[c.family.key] ? sample.map(() => ['diff', 0, 0, ['contract']]) : []);
    assert.deepEqual(s.unbuilt, UNBUILT[c.family.key]);
    assert.equal(s.sampled, sample.length);
    const theme = await call(setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, mode: 'theme', sample, prototype: true }), COMPONENTS_CORE);
    const t = checkTheme(c, theme, JSON.parse(DOC_TEXT));
    assert.deepEqual(t.problems, []);
    assert.ok(t.checked > 0, JSON.stringify(t));
  });
