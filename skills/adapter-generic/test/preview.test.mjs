// The Generic preview renderer (#123): the fixture's own shadcn components, rendered with react-dom/server over the
// project's Tailwind-compiled CSS, then built into To-preview catalogs and measured in a browser against resolve().
// The render tests need the pinned tools and preview packages (node skills/adapter-generic/scripts/sources.mjs);
// the browser tests also need To-handoff's runtime (node skills/to-handoff/scripts/deps.mjs). Without them they skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { buildCatalog } from '../../to-preview/scripts/catalog.mjs';
import { hasRuntime, loadChromium } from '../../to-handoff/scripts/deps.mjs';
import { contractFor, readFamily } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';
import { chipProject } from './chip-project.mjs';

const SHADCN = new URL('../../../design-systems/shadcn/', import.meta.url);
const json = url => JSON.parse(readFileSync(url, 'utf8'));
const contract = family => json(new URL(`contracts/${family}.component.json`, SHADCN));
const foundations = json(new URL('shadcn.foundations.json', SHADCN));
const Selection = createRequire(import.meta.url)('../../to-preview/assets/selection-model.js');

const skip = !hasTools() ? 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs'
  : !hasPreviewPackages() ? 'Generic preview packages missing: run node skills/adapter-generic/scripts/sources.mjs' : false;
const noBrowser = skip || (!hasRuntime() && 'To-handoff runtime or browser missing: run node skills/to-handoff/scripts/deps.mjs');
const renderers = {};
const rendererOf = family => (renderers[family] = renderers[family] || previewRenderer(contract(family)));

// ---------- render ----------

test('the Base Button is the project\'s own <button>, its cva classes merged by cn, its Label the default text, and no icon', { skip }, async () => {
  const { render } = await rendererOf('button');
  const html = render({});
  assert.match(html, /^<button data-slot="button" data-variant="default" data-size="default" class="[^"]*bg-primary[^"]*h-8[^"]*">Button<\/button>$/);
});

test('a TEXT property renders the text it is given, an empty string too; the default only where it is not given (#166)', { skip }, async () => {
  const { render } = await rendererOf('button');
  assert.match(render({}, { label: 'Send' }), />Send<\/button>$/);
  assert.match(render({}, { label: '' }), /"><\/button>$/);
  assert.match(render({}, {}), />Button<\/button>$/);
});

test('each axis value sets its code props; a filled icon slot is an <svg> carrying the attribute its Slot axis tests', { skip }, async () => {
  const { render } = await rendererOf('button');
  const html = render({ variant: 'outline', size: 'icon-sm', 'icon-inline-start': 'icon-inline-start', invalid: 'invalid', expanded: 'expanded' });
  assert.match(html, /data-variant="outline" data-size="icon-sm"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /<svg data-icon="inline-start"/);
  assert.doesNotMatch(html, /data-icon="inline-end"/);
  assert.equal(render({ state: 'hover' }), render({}), 'a forced State renders like Enabled');
});

test('a Card renders its exported parts as its anatomy nodes; the footer only where its Slot axis fills it', { skip }, async () => {
  const { render } = await rendererOf('card');
  const none = render({ 'card-footer': 'none' });
  for (const slot of ['card-header', 'card-title', 'card-description', 'card-action', 'card-content'])
    assert.match(none, new RegExp(`data-slot="${slot}"`), slot);
  assert.doesNotMatch(none, /data-slot="card-footer"/);
  assert.match(render({ 'card-footer': 'card-footer' }), /<div data-slot="card-footer"[^>]*>Footer<\/div>/);
  assert.match(none, /<div data-slot="card-title"[^>]*>Card title<\/div>/, 'a text part holds its TEXT property (#166)');
  assert.match(render({ 'card-footer': 'none' }, { description: 'Due Friday' }), /<div data-slot="card-description"[^>]*>Due Friday<\/div>/);
});

test('a provider family renders its Root around its Trigger, which takes the props and holds the Value', { skip }, async () => {
  const { render } = await rendererOf('select');
  const html = render({});
  assert.match(html, /^<button type="button" role="combobox"[^>]*data-slot="select-trigger" data-size="default"[^>]*><span data-slot="select-value"[^>]*>Select an option<\/span><svg[^>]*lucide-chevron-down/);
  assert.doesNotMatch(html, /aria-invalid="/);
  const off = render({ invalid: 'invalid', state: 'disabled' });
  assert.match(off, /aria-invalid="true"/);
  assert.match(off, /<button[^>]*disabled=""/);
});

test('the stylesheet is the compiled project CSS with no @supports guard, the dark Mode its .dark class, light inert', { skip }, async () => {
  const { stylesheet, modeClass } = await rendererOf('button');
  assert.ok(stylesheet.includes('.dark'));
  assert.ok(stylesheet.includes('.bg-primary'));
  assert.doesNotMatch(stylesheet, /@supports \(color: color-mix/);
  assert.equal(modeClass('light'), 'mode-light');
  assert.ok(!stylesheet.includes('mode-light'));
});

test("the catalog chrome is shadcn's colour variables, each set for Light in :root and for Dark in .dark (#392)", { skip }, async () => {
  const { stylesheet, chrome } = await rendererOf('button');
  const names = Object.values(chrome).map(value => value.match(/^var\((--[\w-]+)\)$/)[1]);
  assert.deepEqual(names, ['--muted', '--card', '--border', '--foreground', '--muted-foreground', '--input', '--ring', '--destructive']);
  for (const selector of [':root', '.dark']) {
    const rules = [...stylesheet.matchAll(/(?<=^|\})\s*([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].trim() === selector).map(m => m[2]).join(';');
    for (const name of names) assert.match(rules, new RegExp(`(?:^|[;\\s])${name}:`), `${selector} sets ${name}`);
  }
});

test('refuses a project whose files are not the Contract\'s snapshot', { skip }, async () => {
  const project = mkdtempSync(join(tmpdir(), 'generic-preview-'));
  cpSync(FIXTURE, project, { recursive: true });
  writeFileSync(join(project, 'components/ui/button.tsx'), readFileSync(join(project, 'components/ui/button.tsx'), 'utf8') + '\n');
  await assert.rejects(previewRenderer(contract('button'), { project }), /components\/ui\/button\.tsx differs from the Contract's snapshot/);
});

test('refuses to render when an installed package differs from the Contract pin', { skip }, async () => {
  const moved = contract('button');
  moved.source.packages.react = '19.2.0';
  await assert.rejects(previewRenderer(moved), /react 19\.1\.0 is installed but the Contract pins 19\.2\.0/);
});

// ---------- catalogs, measured ----------

// A token or raw value in px, in the first Mode of its collection.
const px = value => {
  if (value.raw !== undefined) return value.raw;
  const v = foundations.variables[value.token] || assert.fail(`no variable ${value.token}`);
  return Object.values(v.values)[0].value;
};

// The page with every specimen of a committed family rendered, then `measure` evaluated in it.
const inCatalog = async (family, measure, arg) => inPage({ contract: contract(family), foundations, renderer: await rendererOf(family) }, measure, arg);

// As inCatalog, for any Contract with its Foundations document and renderer.
async function inPage({ contract: c, foundations, renderer }, measure, arg) {
  const page = buildCatalog({ contract: c, foundations, renderer });
  const { chromium, launchOptions } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  try {
    const tab = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await tab.setContent(page, { waitUntil: 'load' });
    const count = contractModule.expand({ ...c, selection: { omit: [] } }).length;
    await tab.waitForFunction(n => document.querySelectorAll('.tp-specimen > *').length === n || document.getElementById('error').textContent, count);
    assert.equal(await tab.evaluate(() => document.getElementById('error').textContent), '');
    return await tab.evaluate(measure, arg);
  } finally { await browser.close(); }
}

// The catalog renders every tuple, 3072: the Contract's 2304 checked and the 768 its omit patterns leave unchecked.
test('every shadcn Button specimen\'s computed padding, height, width, gap and icon size equal resolve(), all 3072', { skip: noBrowser, timeout: 120000 }, async () => {
  const c = contract('button');
  const iconOf = Object.fromEntries(c.axes.filter(a => a.slot).map(a => [/data-icon="([^"]*)"/.exec(a.values.find(v => v.filled).css)[1], a.slot]));
  const tuples = Object.fromEntries([...new Selection(c, contractModule).specimens.values()].map(s => [s.id, s.tuple]));
  const measured = await inCatalog('button', () => [...document.querySelectorAll('.tp-specimen')].map(host => {
    const el = host.firstElementChild, cs = getComputedStyle(el), n = p => parseFloat(cs.getPropertyValue(p));
    const box = el.getBoundingClientRect();
    return {
      id: host.dataset.key,
      paddingTop: n('padding-top') + n('border-top-width'), paddingRight: n('padding-right') + n('border-right-width'),
      paddingBottom: n('padding-bottom') + n('border-bottom-width'), paddingLeft: n('padding-left') + n('border-left-width'),
      height: box.height, width: box.width, gap: n('column-gap') || 0,
      icons: [...el.querySelectorAll('svg[data-icon]')].map(svg => { const r = svg.getBoundingClientRect(); return [svg.dataset.icon, r.width, r.height]; }),
    };
  }));
  assert.equal(measured.length, 3072);
  const misses = [];
  for (const m of measured) {
    const { layout } = contractModule.resolve(c, tuples[m.id]);
    const root = layout.Button;
    const want = { paddingTop: px(root.paddingTop), paddingRight: px(root.paddingRight), paddingBottom: px(root.paddingBottom),
      paddingLeft: px(root.paddingLeft), height: px(root.height), gap: px(root.gap) };
    if (typeof root.width === 'object') want.width = px(root.width);
    for (const [field, value] of Object.entries(want))
      if (Math.abs(m[field] - value) > 0.01) misses.push(`${m.id} ${field}: computed ${m[field]}, resolve ${value}`);
    for (const [icon, w, h] of m.icons) {
      const node = layout[iconOf[icon]];
      if (Math.abs(w - px(node.width)) > 0.01 || Math.abs(h - px(node.height)) > 0.01) misses.push(`${m.id} ${iconOf[icon]}: ${w}x${h}`);
    }
    const shown = Object.values(iconOf).filter(name => layout[name].visible).length;
    if (shown !== m.icons.length) misses.push(`${m.id}: ${m.icons.length} icons rendered, ${shown} visible`);
  }
  assert.deepEqual(misses.slice(0, 10), [], `${misses.length} of 3072 specimens differ`);
});

test('the dark Mode toggle puts .dark on an ancestor of every specimen, and the Alert\'s fill follows it', { skip: noBrowser, timeout: 60000 }, async () => {
  const fills = await inCatalog('alert', () => {
    const select = [...document.querySelectorAll('#filters select')].find(s => [...s.options].some(o => o.value === 'dark'));
    const fill = () => getComputedStyle(document.querySelector('.tp-specimen > *')).backgroundColor;
    const light = fill();
    select.value = 'dark'; select.onchange();
    return { light, dark: fill(), inDark: [...document.querySelectorAll('.tp-specimen')].every(s => s.closest('.dark')) };
  });
  assert.equal(fills.inDark, true);
  assert.notEqual(fills.dark, fills.light);
});

test('the Card and Alert catalogs build, each specimen showing its anatomy, and Drafted labels are flagged', { skip: noBrowser, timeout: 60000 }, async () => {
  const card = await inCatalog('card', () => [...document.querySelectorAll('.tp-specimen > *')].map(el => el.querySelectorAll('[data-slot]').length));
  assert.deepEqual(card.sort(), [5, 6]);
  const alert = await inCatalog('alert', () => ({
    parts: [...document.querySelectorAll('.tp-specimen > *')].map(el => [...el.querySelectorAll('[data-slot]')].map(p => p.dataset.slot)),
    drafted: [...document.querySelectorAll('.tp-drafted')].map(d => d.textContent),
  }));
  assert.deepEqual(alert.parts, [['alert-title', 'alert-description'], ['alert-title', 'alert-description']]);
  assert.ok(alert.drafted.includes('Destructive'), 'the agent-drafted value label is flagged');
});

// ---------- cva compoundVariants (#255) ----------

let chipRun;
const chip = () => (chipRun = chipRun || (async () => {
  const project = chipProject();
  const doc = (await library({ project, families: ['chip'] })).doc;
  const c = contractFor(await readFamily({ project, family: 'chip', foundations: doc }), 'chip', doc);
  return { contract: c, foundations: doc, renderer: await previewRenderer(c, { project }) };
})());

test('a compound variant renders as the code does: each axis value\'s code props, a boolean axis as a boolean', { skip }, async () => {
  const { render } = (await chip()).renderer;
  assert.match(render({ tone: 'primary', selected: 'true' }), /class="[^"]*\bbg-primary px-3 text-primary-foreground"/);
  assert.doesNotMatch(render({ tone: 'primary', selected: 'false' }), /px-3|bg-primary\b/);
});

test('every Chip specimen\'s computed fill, border colour, padding and label colour equal resolve()', { skip: noBrowser, timeout: 60000 }, async () => {
  const { contract: c, foundations: doc, renderer } = await chip();
  const tuples = Object.fromEntries([...new Selection(c, contractModule).specimens.values()].map(s => [s.id, s.tuple]));
  const measured = await inPage({ contract: c, foundations: doc, renderer }, () => [...document.querySelectorAll('.tp-specimen')].map(host => {
    const cs = getComputedStyle(host.firstElementChild);
    return { id: host.dataset.key, fill: cs.backgroundColor, stroke: cs.borderTopColor, ink: cs.color,
      paddingLeft: parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) };
  }));
  assert.equal(measured.length, 4);
  const css = value => doc.variables[value.token].values.light.from.css;
  for (const m of measured) {
    const { layout, paint } = contractModule.resolve(c, tuples[m.id]);
    assert.deepEqual(m, { id: m.id, fill: css(paint.Chip.fill), stroke: css(paint.Chip.stroke), ink: css(paint.Label.fill),
      paddingLeft: layout.Chip.paddingLeft.raw }, m.id);
  }
});
