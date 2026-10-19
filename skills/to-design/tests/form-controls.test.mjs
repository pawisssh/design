// Form-control families (#93, #106, ADR 0013) through the offline chain: the TextInput (36) and Select (52) fixture
// Contracts, approved as a prototype, built with both unchanged builder cores on the mock figma (foundations,
// icons, every sets batch), then the coverage check and each variant's layers read back against the Contract.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, expand, resolve, variantName } from '../../contract/scripts/contract.mjs';
import { foundationsPlan, iconsPlan, setsPlan } from '../scripts/build-plan.mjs';
import { checkCoverage, checkTheme } from '../scripts/coverage.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { defaultProps, expectedVariant } from '../scripts/readback.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';
import { pack } from './pack.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = join(ROOT, 'skills/contract/test/fixtures/form-controls');
const DOC_TEXT = readFileSync(join(FIXTURES, 'carbon.foundations.json'), 'utf8');
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-17T00:00:00.000Z';
const load = name => JSON.parse(readFileSync(join(FIXTURES, `${name}.component.json`), 'utf8'));
const asApproved = c => approve({ ...c, selection: { ...c.selection, status: 'approved' } }, AT, { prototype: true });
const TEXT_INPUT = asApproved(load('text-input'));
const SELECT = asApproved(load('select'));
const STATUS_ICONS = { 'Invalid icon': 'Warning--filled', 'Warn icon': 'Warning--alt--filled' };

// One file with the foundations and both families' icons built, then every sets batch of each family.
async function buildBoth() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  let ledger = null;
  const call = async ({ plan, state }, core) => {
    const result = await runPackage(pack(plan, state, core).code, mock.figma);
    assert.ok(!result.error, JSON.stringify(result.error));
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    if (result.ledger) ledger = recordResult(ledger, result);
    return result;
  };
  // the default subset of the whole theme can take more than one call (#107)
  const first = foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT });
  await call(first, CORE);
  for (let chunk = 2; chunk <= (first.plan.chunk ? first.plan.chunk.of : 1); chunk++)
    await call(foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, chunk }), CORE);
  await call(iconsPlan([TEXT_INPUT, SELECT], ICONS_DIR, ledger, { fileKey: FILE_KEY, at: AT }), CORE);
  const coverage = {};
  for (const c of [TEXT_INPUT, SELECT]) {
    // the first build step by step (#168): loose batches, the combine, the place calls
    for (let d; (d = setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, next: true, prototype: true }));) await call(d, COMPONENTS_CORE);
    coverage[c.family.key] = await call(setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, mode: 'coverage', prototype: true }), COMPONENTS_CORE);
  }
  return { mock, ledger, coverage, call };
}
const built = buildBoth();
built.catch(() => {}); // each test awaits it and reports a failed build itself

test('readback moves a `visible` layout rule into the variant wiring: layout fragments never see it', () => {
  const tuple = { size: 'md', validation: 'warn', readOnly: 'editable', state: 'enabled' };
  const exp = expectedVariant(TEXT_INPUT, tuple, defaultProps(TEXT_INPUT));
  for (const [node, fields] of Object.entries(exp.layout)) assert.ok(!('visible' in fields), `${node} keeps visible in its layout`);
  assert.deepEqual(['Helper', 'Invalid icon', 'Invalid text', 'Warn icon', 'Warn text'].map(n => exp.visible[n]), [false, false, false, true, true]);
  assert.equal(exp.swap['Warn icon'], 'warning--alt--filled', 'a fixed icon instance swaps to its own icon');
  assert.ok('visible' in resolve(TEXT_INPUT, tuple).layout['Warn icon'], 'resolve() itself is left unchanged');
});

test('the status and chevron icons the anatomy names are built once for both families', async () => {
  const { ledger } = await built;
  assert.deepEqual(Object.keys(ledger.icons.components).sort(), ['chevron--down', 'warning--alt--filled', 'warning--filled']);
});

for (const [c, count] of [[TEXT_INPUT, 36], [SELECT, 52]])
  test(`${c.family.name}: ${count} variants build with both unchanged cores and pass the coverage check`, async () => {
    const { ledger, coverage } = await built;
    assert.equal(expand(c).length, count);
    assert.equal(ledger.sets[c.family.key].variants.filter(Boolean).length, count);
    assert.deepEqual(checkCoverage(c, coverage[c.family.key], ledger).problems, []);
  });

for (const c of [TEXT_INPUT, SELECT])
  test(`${c.family.name}: every node a rule shows or hides reads back so, and each status icon is an instance of its own icon`, async () => {
    const { mock, ledger } = await built;
    const set = await mock.figma.getNodeByIdAsync(ledger.sets[c.family.key].set.id);
    const wrong = [];
    for (const t of expand(c)) {
      const name = variantName(c, t);
      const variant = set.children.find(k => k.name === name);
      if (!variant) { wrong.push(`${name}: not built`); continue; }
      for (const [node, fields] of Object.entries(resolve(c, t).layout)) {
        if (!('visible' in fields)) continue;
        const layer = variant.findOne(n => n.name === node);
        if (!layer) wrong.push(`${name}: ${node} missing`);
        else if (layer.visible !== fields.visible) wrong.push(`${name}: ${node} is ${layer.visible ? 'shown' : 'hidden'}, the Contract says ${fields.visible ? 'shown' : 'hidden'}`);
      }
      for (const [node, icon] of Object.entries(STATUS_ICONS)) {
        const main = await variant.findOne(n => n.name === node).getMainComponentAsync();
        if (!main || main.name !== icon) wrong.push(`${name}: ${node} is an instance of ${main && main.name}, not ${icon}`);
      }
    }
    assert.deepEqual(wrong, []);
  });

test('Text Input binds the Layer name `field`: the theme check follows each Layer mode to its Theme token (#109)', async () => {
  const { call, ledger } = await built;
  const name = variantName(TEXT_INPUT, expand(TEXT_INPUT)[0]);
  const theme = await call(setsPlan(TEXT_INPUT, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, mode: 'theme', sample: [0], prototype: true }), COMPONENTS_CORE);
  // field-01, -02, -03 in White (Carbon's themes.json): the core switches the Layer collection, Theme at its default
  assert.deepEqual(theme.theme[name]['Field.fill'], { One: '#f4f4f4', Two: '#ffffff', Three: '#f4f4f4' });
  const doc = JSON.parse(DOC_TEXT);
  const t = checkTheme(TEXT_INPUT, theme, doc);
  assert.deepEqual(t.problems, []);
  assert.ok(t.checked > 0 && t.switching > 0, JSON.stringify(t));
  // a Layer level aliased to the wrong Theme token is caught in that mode
  doc.variables.field.values.two = { alias: 'field-01' };
  assert.deepEqual(checkTheme(TEXT_INPUT, theme, doc).problems.map(p => [p.what, p.at, p.mode, p.want, p.got]),
    [['colour', 'Field.fill', 'Two', '#f4f4f4', '#ffffff']]);
});
