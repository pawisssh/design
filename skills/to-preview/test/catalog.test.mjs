// The catalog generator (#33): one self-contained HTML page per Contract, with specimens rendered by the
// Adapter's preview renderer. A stub renderer keeps these tests offline and Code-Library-neutral.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildCatalog } from '../scripts/catalog.mjs';

const button = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url)));
const foundations = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url)));
const stub = {
  stylesheet: '.lib-button{color:red}',
  modeClass: mode => `theme-${mode}`,
  render: tuple => `<button class="lib-button">${Object.values(tuple).join(' ')}</button>`,
};
// The page embeds its data as JSON in <script type="application/json" id="catalog">.
const embedded = html => JSON.parse(html.match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);

test('the page carries the Contract, one rendered specimen per tuple and the library stylesheet', () => {
  const omitted = JSON.parse(JSON.stringify(button));
  omitted.selection.omit = [{ match: { state: 'focus' } }];
  omitted.selection.expectedCount = 196;
  // An omit edit resets the Contract to draft (asDraft), as apply-omit does.
  omitted.selection.status = 'draft';
  omitted.selection.approval = null;
  const html = buildCatalog({ contract: omitted, foundations, renderer: stub });
  const data = embedded(html);
  assert.deepEqual(data.contract, omitted);
  assert.equal(Object.keys(data.specimens).length, 245, 'omitted tuples are rendered too, so they can be re-included');
  assert.equal(data.specimens['danger|sm|focus'], '<button class="lib-button">danger sm focus</button>');
  assert.ok(html.includes('.lib-button{color:red}'));
  assert.ok(!/<script src=/.test(html), 'self-contained: opens from file://');
});

test('one toggle per multi-mode collection, Theme then Layer, each class from its Mode selector (#109)', () => {
  const data = embedded(buildCatalog({ contract: button, foundations, renderer: stub }));
  assert.deepEqual(data.toggles, [
    { key: 'theme', label: 'Theme', modes: [
      { key: 'white', label: 'White', className: 'cds--white' },
      { key: 'g10', label: 'Gray 10', className: 'cds--g10' },
      { key: 'g90', label: 'Gray 90', className: 'cds--g90' },
      { key: 'g100', label: 'Gray 100', className: 'cds--g100' },
    ] },
    { key: 'layer', label: 'Layer', modes: [
      { key: 'one', label: 'One', className: 'cds--layer-one' },
      { key: 'two', label: 'Two', className: 'cds--layer-two' },
      { key: 'three', label: 'Three', className: 'cds--layer-three' },
    ] },
  ]);
});

test('a Mode with no selector takes the renderer class; a selector that is not one class is refused', () => {
  const plain = JSON.parse(JSON.stringify(foundations));
  for (const c of plain.collections) for (const m of c.modes) delete m.selector;
  assert.deepEqual(embedded(buildCatalog({ contract: button, foundations: plain, renderer: stub })).toggles[0].modes[0],
    { key: 'white', label: 'White', className: 'theme-white' });
  const nested = JSON.parse(JSON.stringify(foundations));
  nested.collections.find(c => c.key === 'layer').modes[1].selector = '.cds--g10 .cds--layer-two';
  assert.throws(() => buildCatalog({ contract: button, foundations: nested, renderer: stub }), /layer\/two.*"\.cds--g10 \.cds--layer-two".*one class/);
});

test('States without code props are forced through their CSS pseudo-class', () => {
  const data = embedded(buildCatalog({ contract: button, foundations, renderer: stub }));
  assert.deepEqual(data.forces, [
    { axis: 'state', value: 'hover', pseudo: ':hover' },
    { axis: 'state', value: 'active', pseudo: ':active' },
    { axis: 'state', value: 'focus', pseudo: ':focus' },
  ]);
});

test('the card footer source is the Code Library package and its pinned version, from the Contract', () => {
  assert.equal(embedded(buildCatalog({ contract: button, foundations, renderer: stub })).sourceLabel, '@carbon/react 1.118.0');
  const bumped = JSON.parse(JSON.stringify(button));
  bumped.source.packages['@carbon/react'] = '9.9.9';
  bumped.selection.status = 'draft';
  bumped.selection.approval = null;
  assert.equal(embedded(buildCatalog({ contract: bumped, foundations, renderer: stub })).sourceLabel, '@carbon/react 9.9.9');
});

test('an invalid Contract gets no catalog', () => {
  const broken = JSON.parse(JSON.stringify(button));
  broken.selection.expectedCount = 7;
  assert.throws(() => buildCatalog({ contract: broken, foundations, renderer: stub }), /rule 4.*expectedCount is 7/);
});

test('the page scripts run the selection model on the inlined Contract module', () => {
  const html = buildCatalog({ contract: button, foundations, renderer: stub });
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m => m[1]);
  const window = {};
  const context = vm.createContext({ window });
  for (const name of ['window.Contract = ', 'class CatalogSelection', 'function catalogCard']) vm.runInContext(scripts.find(s => s.includes(name)), context);
  const model = new context.CatalogSelection(button, window.Contract);
  assert.equal(model.baseId, 'primary|lg|enabled');
  assert.equal(model.specimens.size, 245);
  assert.equal(typeof context.catalogCard, 'function', 'the card builder is inlined too');
});

test('form controls get a catalog whose Hover and Focus are forced through their pseudo-classes (#93)', () => {
  const fixture = file => JSON.parse(readFileSync(new URL(`../../contract/test/fixtures/form-controls/${file}`, import.meta.url)));
  const formFoundations = fixture('carbon.foundations.json');
  const page = name => embedded(buildCatalog({ contract: fixture(`${name}.component.json`), foundations: formFoundations, renderer: stub }));
  const textInput = page('text-input'), select = page('select');
  assert.deepEqual(textInput.forces, [{ axis: 'state', value: 'focus', pseudo: ':focus' }]);
  assert.deepEqual(select.forces, [{ axis: 'state', value: 'hover', pseudo: ':hover' }, { axis: 'state', value: 'focus', pseudo: ':focus' }]);
  assert.equal(Object.keys(textInput.specimens).length, 36);
  assert.equal(Object.keys(select.specimens).length, 52);
});

// The chrome should be the template's own, with a Code Library's custom properties (Carbon's --cds-*) styling only its
// specimens. Known failure (#392): this asserts the Carbon names are still there, so it fails once the fix lands; then
// assert the list is empty.
test('the template chrome reads Carbon custom properties (known: #392)', () => {
  const css = readFileSync(new URL('../assets/catalog-template.html', import.meta.url), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
  const foreign = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]).filter(n => !n.startsWith('--tp-')));
  assert.notDeepEqual([...foreign], [], '#392 no longer fails here: assert the list is empty');
});
