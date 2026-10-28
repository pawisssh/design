// Render comparison (compare.mjs): the expectations come from the committed Button Contract and Foundations, offline;
// the probe runs on a small fake of the catalog page, and once from compare.js's own text to show it needs nothing
// outside its body. The fixture families of #470 (Tag by its lowercase static class, Checkbox by a Linaria literal)
// go through both. --run takes the real Button page through headless Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { colorKey, compareModule, compiledClasses, compiledCssPath, expectations, literalClasses, missingChrome, probe, runInChrome } from '../scripts/compare.mjs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';
import { hasSources } from '../scripts/sources.mjs';
import { ANCHORS, PREVIEW_MISSING, SOURCES_MISSING, anchorFamily } from './helpers.mjs';
import { convert } from '../../contract/scripts/color.mjs';

const load = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const contract = load('../../../design-systems/cds/contracts/button.component.json');
const foundations = load('../../../design-systems/cds/cds.foundations.json');
const nodes = load('../nodes/button.nodes.json');
// Button's literals as compiled classes; their real hashes are read from the fetched stylesheet in the last tests.
const classes = Object.fromEntries(Object.values(nodes).flatMap(e => e.split(' ')).filter(e => !e.startsWith('cds-')).map(e => [e, `${e}-x`]));

// Button's spinner circles at Loading=On in Light: the bgLine Track and the Arc in the label's colour.
const ring = { fill: 'none', width: 24, height: 24, stroke: '#5b616e@0.2', strokeWidth: 2, sweep: 360 };
const arc = { fill: 'none', width: 24, height: 24, stroke: '#ffffff', strokeWidth: 2, sweep: 270, strokeCap: 'round' };

test('expectations: every tuple in each Theme Mode, the layers in anatomy order with their parent and entry, and which are drawn inside it', () => {
  const spec = expectations({ contract, nodes, foundations, classes });
  assert.equal(spec.collection, 'theme');
  assert.deepEqual(spec.modes, ['light', 'dark']);
  assert.equal(Object.keys(spec.expected).length, 480);
  assert.deepEqual(spec.layers.map(l => [l.name, l.parent, l.entry, l.drawnInParent]), [
    ['Button', null, 'cds-Button', false], ['Start icon', 'Button', 'startNodeCss', false], ['Start glyph', 'Start icon', 'cds-Icon', false],
    ['Middle', 'Button', 'middleNodeCss', false], ['Label', 'Middle', 'middleNodeCss', true],
    ['Spinner', 'Middle', 'spinnerContainerCss', false], ['Track', 'Spinner', 'spinnerContainerCss', true], ['Arc', 'Spinner', 'spinnerContainerCss', true],
    ['End icon', 'Button', 'endNodeCss', false], ['End glyph', 'End icon', 'cds-Icon', false]]);
  assert.deepEqual(spec.layers.slice(0, 3).map(l => l.className), ['cds-Button', 'startNodeCss-x', 'cds-Icon'],
    'a static class is matched as itself, a literal by its compiled class');
  assert.deepEqual(spec.layers.filter(l => l.type === 'ELLIPSE').map(l => [l.name, l.nth]), [['Track', 0], ['Arc', 1]]);
});

test('expectations: the spinner while loading, an ELLIPSE by its stroke and arc, and a hidden layer null with its children', () => {
  const { expected } = expectations({ contract, nodes, foundations, classes });
  const loading = expected['primary|l|solid|on|enabled'].light;
  assert.deepEqual(loading.Middle, { opacity: 0.82 }, "Interactable's opacity is on the Button's child, Middle");
  assert.deepEqual(loading.Spinner, { width: 24, height: 24 });
  assert.deepEqual(loading.Track, ring);
  assert.deepEqual(loading.Arc, arc);
  const idle = expected['primary|l|solid|off|hover'].light;
  assert.deepEqual([idle.Spinner, idle.Track, idle.Arc], [null, null, null]);
  assert.deepEqual([idle.Middle.opacity, idle.Label.opacity], [0.88, 1]);
});

test('expectations: colours per Mode, lengths from the layout collection, the stroke by its alignment', () => {
  const { expected } = expectations({ contract, nodes, foundations, classes });
  const focus = expected['primary|l|solid|off|focus'];
  assert.deepEqual(focus.light.Button, { fill: '#0052ff', opacity: 1, paddingLeft: 32, paddingRight: 32, paddingTop: 16,
    paddingBottom: 16, radius: 56, outline: '#0052ff', outlineWidth: 2 });
  assert.equal(focus.dark.Button.outline, '#578bfa');
  assert.deepEqual(focus.light.Label, { opacity: 1, color: '#ffffff' }, 'a TEXT fill is its color');
  assert.deepEqual(focus.light['Start icon'], { opacity: 1, width: 24, height: 24 });
  assert.equal(focus.light['Start glyph'], undefined, 'fill and hug sizes, and paint on a path, are not compared');
  const disabled = expected['secondary|s|transparent|off|disabled'].light.Button;
  assert.equal(disabled.fill, 'none');
  assert.equal(disabled.opacity, 0.5);
  assert.equal(disabled.borderWidth, 0);
  assert.equal(disabled.border, undefined, 'no stroke, no border colour');
  assert.equal(expected['primary|l|solid|on|enabled'].dark.Label.opacity, 0);
});

// ---------- a fake catalog page ----------
class El {
  constructor(cls, opts = {}, kids = []) {
    Object.assign(this, { cls, tag: opts.tag, attrs: opts.attrs || {}, own: opts.style || {}, text: opts.text, kids, w: opts.w || 0, h: opts.h || 0 });
  }
  getAttribute(n) { return n === 'class' ? this.cls : n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { if (n === 'class') this.cls = v; }
  get classList() {
    const set = list => { this.cls = list.join(' '); };
    return { add: c => set([...this.cls.split(' ').filter(x => x && x !== c), c]), remove: c => set(this.cls.split(' ').filter(x => x && x !== c)) };
  }
  get childNodes() { return [...(this.text ? [{ nodeType: 3, textContent: this.text }] : []), ...this.kids]; }
  querySelectorAll(sel) {
    const all = [];
    const walk = e => e.kids.forEach(k => { all.push(k); walk(k); });
    walk(this);
    return sel === '*' ? all : sel[0] === '.' ? all.filter(e => e.cls.split(' ').includes(sel.slice(1))) : all.filter(e => e.tag === sel);
  }
}
const BASE = { backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', opacity: '1', visibility: 'visible', paddingLeft: '0px',
  paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopLeftRadius: '0px', outlineStyle: 'none', outlineWidth: '0px',
  outlineColor: 'rgb(0, 0, 0)', borderTopWidth: '0px', borderTopColor: 'rgb(0, 0, 0)' };

const circle = (attrs, style) => new El('', { tag: 'circle', attrs: { r: '11', ...attrs },
  style: { fill: 'none', strokeWidth: '2px', strokeLinecap: 'butt', strokeDasharray: 'none', strokeDashoffset: '0px', ...style } });

// A catalog page with a specimen per key, `draw(mode)` its component in each Mode's subtree. A subtree has a layout box
// only while the body carries its Mode's class.
const fakePage = specimens => {
  const root = new El('', {}, Object.entries(specimens).map(([key, draw]) => new El('tp-specimen', { attrs: { 'data-key': key } },
    ['light', 'dark'].map(mode => new El(`cds-preview-scheme ${mode}`, {}, [draw(mode)])))));
  const body = new El('tp-page cds-preview-light');
  const catalog = { toggles: [{ key: 'theme', modes: [{ key: 'light', className: 'cds-preview-light' }, { key: 'dark', className: 'cds-preview-dark' }] }] };
  const doc = { body, getElementById: id => (id === 'catalog' ? { textContent: JSON.stringify(catalog) } : null), querySelectorAll: s => root.querySelectorAll(s) };
  const shown = el => { for (const s of root.querySelectorAll('*')) if (s.cls.startsWith('cds-preview-scheme') && s.querySelectorAll('*').includes(el)) return body.cls.includes(`cds-preview-${s.cls.split(' ')[1]}`); };
  for (const e of root.querySelectorAll('*')) Object.defineProperties(e, { offsetWidth: { get: () => (shown(e) ? e.w : 0) }, offsetHeight: { get: () => (shown(e) ? e.h : 0) } });
  return { doc, style: el => ({ ...BASE, ...el.own }), color: text => colorKey(convert(text)) };
};

// One Button.
const page = ({ labelHidden = false, padding = '8px', spinner = false, dashoffset = '0.25px' } = {}) => fakePage({
  'primary|xs': mode =>
    new El('cds-Button baseCss-a1', { style: { backgroundColor: mode === 'light' ? 'rgb(0, 82, 255)' : 'rgb(87, 139, 250)', paddingLeft: padding, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgb(0, 82, 255)' } }, [
      new El('startNodeCss-b2', { w: 16, h: 16 }),
      new El('middleNodeCss-c3', {}, [
        ...(spinner ? [new El('spinnerContainerCss-e5', { w: 24, h: 24 }, [new El('svgCss-f6', { tag: 'svg' }, [
          circle({}, { stroke: 'rgba(91, 97, 110, 0.2)' }),
          circle({ pathLength: '1' }, { stroke: 'rgb(255, 255, 255)', strokeLinecap: 'round', strokeDasharray: '1px', strokeDashoffset: dashoffset })])])] : []),
        new El('baseCss-g7', {}, [new El('hiddenCss-d4', { text: 'Button', style: { color: 'rgba(255, 255, 255, 0.5)', visibility: labelHidden ? 'hidden' : 'visible' } })])]),
    ]),
});
const spec = {
  collection: 'theme', modes: ['light', 'dark'],
  layers: [{ name: 'Button', type: 'COMPONENT', parent: null, entry: 'cds-Button', className: 'cds-Button' },
    { name: 'Start icon', type: 'FRAME', parent: 'Button', entry: 'startNodeCss', className: 'startNodeCss-b2' },
    { name: 'Middle', type: 'FRAME', parent: 'Button', entry: 'middleNodeCss', className: 'middleNodeCss-c3', drawnInParent: false },
    { name: 'Label', type: 'TEXT', parent: 'Middle', entry: 'middleNodeCss', className: 'middleNodeCss-c3', drawnInParent: true }],
  expected: { 'primary|xs': {
    light: { Button: { fill: '#0052ff', paddingLeft: 8, outline: '#0052ff', outlineWidth: 2 }, 'Start icon': { width: 16 }, Label: { color: '#ffffff@0.5', opacity: 1 } },
    dark: { Button: { fill: '#578bfa' }, 'Start icon': { height: 16 }, Label: { opacity: 1 } } } },
};
// The same page with the spinner layers: Spinner by its entry, Track and Arc the first and second <circle> in it.
const withSpinner = (want = { Spinner: { width: 24 }, Track: ring, Arc: arc }) => ({ ...spec,
  layers: [...spec.layers, { name: 'Spinner', type: 'FRAME', parent: 'Middle', entry: 'spinnerContainerCss', className: 'spinnerContainerCss-e5', drawnInParent: false },
    { name: 'Track', type: 'ELLIPSE', parent: 'Spinner', entry: 'spinnerContainerCss', className: 'spinnerContainerCss-e5', drawnInParent: true, nth: 0 },
    { name: 'Arc', type: 'ELLIPSE', parent: 'Spinner', entry: 'spinnerContainerCss', className: 'spinnerContainerCss-e5', drawnInParent: true, nth: 1 }],
  expected: { 'primary|xs': { light: { ...spec.expected['primary|xs'].light, ...want }, dark: { ...spec.expected['primary|xs'].dark, ...want } } } });

test('probe: each layer found by its entry inside its parent, each Mode measured with its class on the body', () => {
  const { doc, style, color } = page();
  assert.deepEqual(probe(spec, doc, style, color), { checked: 2, mismatches: [] });
  assert.equal(doc.body.cls, 'tp-page cds-preview-light', 'the page\'s classes are put back');
});

test('probe: names the tuple, Mode, layer and field of each value the page computes otherwise', () => {
  const { doc, style, color } = page({ labelHidden: true, padding: '12px' });
  assert.deepEqual(probe(spec, doc, style, color).mismatches, [
    'primary|xs light Button.paddingLeft: page 12, Contract 8',
    'primary|xs light Label.opacity: page 0, Contract 1',
    'primary|xs dark Label.opacity: page 0, Contract 1',
  ]);
  const missing = { ...spec, layers: [...spec.layers, { name: 'End icon', type: 'FRAME', parent: 'Button', entry: 'endNodeCss', className: 'endNodeCss-h8' }],
    expected: { ...spec.expected, 'secondary|xs': spec.expected['primary|xs'] } };
  assert.deepEqual(probe(missing, ...Object.values(page())).mismatches, [
    'secondary|xs: no specimen on the page', 'primary|xs light End icon: no element endNodeCss', 'primary|xs dark End icon: no element endNodeCss']);
});

test('probe: Track and Arc are the n-th <circle> in the Spinner, read by stroke, size 2r + stroke width, sweep and cap', () => {
  assert.deepEqual(probe(withSpinner(), ...Object.values(page({ spinner: true }))), { checked: 2, mismatches: [] });
  assert.deepEqual(probe(withSpinner(), ...Object.values(page({ spinner: true, dashoffset: '0.5px' }))).mismatches, [
    'primary|xs light Arc.sweep: page 180, Contract 270', 'primary|xs dark Arc.sweep: page 180, Contract 270']);
});

test('probe: a layer the Contract hides must have no element, and its children are not looked for', () => {
  const hidden = withSpinner({ Spinner: null, Track: null, Arc: null });
  assert.deepEqual(probe(hidden, ...Object.values(page())), { checked: 2, mismatches: [] });
  assert.deepEqual(probe(hidden, ...Object.values(page({ spinner: true }))).mismatches, [
    'primary|xs light Spinner.visible: page true, Contract false', 'primary|xs dark Spinner.visible: page true, Contract false']);
  assert.deepEqual(probe(withSpinner(), ...Object.values(page())).mismatches, [
    'primary|xs light Spinner: no element spinnerContainerCss', 'primary|xs dark Spinner: no element spinnerContainerCss']);
});

test('probe: a filled <circle> with no stroke is 2r wide, its 1px default stroke-width unpainted (#475)', () => {
  const dotPage = stroke => fakePage({ on: () => new El('baseCss-r1', { w: 20, h: 20 }, [new El('', { tag: 'svg' }, [
    circle({ r: '6.666666666666667' }, { fill: 'rgb(0, 82, 255)', stroke, strokeWidth: '1px' })])]) });
  const dot = { fill: '#0052ff', stroke: 'none', strokeWidth: 0, width: 13.333, height: 13.333, sweep: 360 };
  const spec = { collection: 'theme', modes: ['light'],
    layers: [{ name: 'Circle', type: 'COMPONENT', parent: null, entry: 'baseCss', className: 'baseCss-r1' },
      { name: 'Dot', type: 'ELLIPSE', parent: 'Circle', entry: 'baseCss', className: 'baseCss-r1', drawnInParent: true, nth: 0 }],
    expected: { on: { light: { Circle: { width: 20 }, Dot: dot } } } };
  assert.deepEqual(probe(spec, ...Object.values(dotPage('none'))), { checked: 1, mismatches: [] });
  assert.deepEqual(probe(spec, ...Object.values(dotPage('rgb(0, 82, 255)'))).mismatches, [
    'on light Dot.stroke: page #0052ff, Contract none', 'on light Dot.strokeWidth: page 1, Contract 0',
    'on light Dot.width: page 14.333333333333334, Contract 13.333', 'on light Dot.height: page 14.333333333333334, Contract 13.333']);
});

// ---------- families with no cds-<Family> class (#470) ----------
const anchored = key => {
  const { contract: c, nodes: n } = anchorFamily(key);
  return expectations({ contract: c, nodes: n, foundations, classes: literalClasses(readFileSync(join(ANCHORS, compiledCssPath(c)), 'utf8')) });
};
// Tag, keyed by cds-tag: its Start in nodeCss, its Label the Text inside it.
const tagPage = () => fakePage(Object.fromEntries(Object.entries({
  informational: { light: ['#f5fffb', '#098551'], dark: ['#001f12', '#27ad75'] },
  promotional: { light: ['#098551', '#ffffff'], dark: ['#27ad75', '#0a0b0d'] },
}).map(([intent, colors]) => [intent, mode => new El('cds-tag', { style: { backgroundColor: colors[mode][0], paddingLeft: '8px', paddingRight: '8px', borderTopLeftRadius: '8px' } }, [
  new El('nodeCss-n1hf567u'), new El('baseCss-t1', { text: 'New', style: { color: colors[mode][1] } })])])));
// Checkbox, keyed by checkboxCss. Before its Mark sits another component's literal of the same name (CDS defines
// baseCss in 20 files), opaque where the Mark is not: a match on the name alone would take it.
const checkboxPage = ({ mark = true } = {}) => fakePage(Object.fromEntries(Object.entries({
  off: { light: ['#ffffff', 'rgba(91, 97, 110, 0.66)'], dark: ['#0a0b0d', 'rgba(138, 145, 158, 0.66)'], opacity: '0' },
  on: { light: ['#0052ff', '#0052ff'], dark: ['#578bfa', '#578bfa'], opacity: '1' },
}).map(([checked, at]) => [checked, mode => new El('checkboxCss-c198zdvk', {
  style: { backgroundColor: at[mode][0], borderTopColor: at[mode][1], borderTopWidth: '1px', borderTopLeftRadius: '4px' } }, [
  new El('markCss-d3coy'), ...(mark ? [new El('markCss-m3k2x9', { style: { opacity: at.opacity } })] : [])])])));

test('literalClasses: each Linaria literal\'s hashed class in a compiled stylesheet', () => {
  assert.deepEqual(literalClasses('@layer cds{.checkboxCss-c198zdvk{position:relative;}.checkboxCss-c198zdvk:focus-visible{outline:none;}.markCss-m3k2x9 > *{opacity:0;}}'),
    { checkboxCss: 'checkboxCss-c198zdvk', markCss: 'markCss-m3k2x9' });
  assert.throws(() => literalClasses('.markCss-a1{}.markCss-b2{}'), /markCss has two compiled classes, markCss-a1 and markCss-b2/);
});

test('expectations: a static class is matched as written, in either case, and a literal by its compiled class', () => {
  assert.deepEqual(anchored('tag').layers.map(l => [l.name, l.className, l.drawnInParent]),
    [['Tag', 'cds-tag', false], ['Start', 'nodeCss-n1hf567u', false], ['Label', 'cds-tag', true]]);
  assert.deepEqual(anchored('checkbox').layers.map(l => [l.name, l.className]), [['Checkbox', 'checkboxCss-c198zdvk'], ['Mark', 'markCss-m3k2x9']]);
  const { contract: c, nodes: n } = anchorFamily('checkbox');
  assert.throws(() => expectations({ contract: c, nodes: n, foundations, classes: {} }), /layer "Checkbox": no compiled class for checkboxCss/);
});

test('probe: Tag and Checkbox pass on their pages, a literal found by its compiled class and not by its name', () => {
  assert.deepEqual(probe(anchored('tag'), ...Object.values(tagPage())), { checked: 4, mismatches: [] });
  assert.deepEqual(probe(anchored('checkbox'), ...Object.values(checkboxPage())), { checked: 4, mismatches: [] });
  assert.deepEqual(probe(anchored('checkbox'), ...Object.values(checkboxPage({ mark: false }))).mismatches,
    ['off light Mark: no element markCss', 'on light Mark: no element markCss', 'off dark Mark: no element markCss', 'on dark Mark: no element markCss']);
});

test('compare.js runs the probe from its own text, on the page\'s document', async () => {
  const { doc, style } = page({ padding: '12px' });
  const path = join(mkdtempSync(join(tmpdir(), 'cds-compare-')), 'compare.mjs');
  writeFileSync(path, compareModule(spec));
  Object.assign(globalThis, { document: doc, getComputedStyle: style });
  try {
    const { compare } = await import(pathToFileURL(path));
    assert.deepEqual(compare().mismatches, ['primary|xs light Button.paddingLeft: page 12, Contract 8']);
  } finally {
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  }
});

test('compiledClasses: Button\'s literals from the fetched cds-web stylesheet', { skip: !hasSources() && SOURCES_MISSING }, () => {
  const compiled = compiledClasses(contract);
  assert.equal(compiled.startNodeCss, 'startNodeCss-s2x7iw5');
  for (const e of Object.keys(classes)) assert.match(compiled[e], new RegExp(`^${e}-[a-z0-9]+$`), e);
});

test('--run compares the real Button page in headless Chrome, and names a value the Contract changes', {
  skip: !hasPreviewPackages() ? PREVIEW_MISSING : missingChrome() || false,
}, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cds-compare-run-'));
  writeFileSync(join(dir, 'index.html'), buildCatalog({ contract, foundations, renderer: await previewRenderer(contract) }));
  const path = rel => new URL(rel, import.meta.url).pathname;
  const run = spawnSync(process.execPath, [path('../scripts/compare.mjs'), path('../../../design-systems/cds/contracts/button.component.json'),
    '--nodes', path('../nodes/button.nodes.json'), '--out', join(dir, 'compare.js'), '--run'], { encoding: 'utf8' });
  const changed = expectations({ contract, nodes, foundations, classes: compiledClasses(contract) });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, new RegExp(`^checked ${Object.keys(changed.expected).length * changed.modes.length}, 0 mismatches$`, 'm'));
  const loading = Object.keys(changed.expected).find(k => changed.expected[k].light.Arc);
  changed.expected[loading].light.Arc.sweep = 180;
  writeFileSync(join(dir, 'compare.js'), compareModule(changed));
  assert.deepEqual((await runInChrome(dir)).mismatches, [`${loading} light Arc.sweep: page 270, Contract 180`]);
});

test('--run opens the page at device pixel ratio 2, where a border below 1px reads as written (#476)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cds-compare-dpr-'));
  writeFileSync(join(dir, 'index.html'), '');
  const chrome = join(dir, 'chrome');
  writeFileSync(chrome, `#!/bin/sh\necho "$@" > '${join(dir, 'args')}'\n`, { mode: 0o755 });
  await assert.rejects(runInChrome(dir, { chrome }), /Chrome exited \(0\) before compare\(\) answered/);
  assert.match(readFileSync(join(dir, 'args'), 'utf8'), /(^| )--force-device-scale-factor=2 /);
});
