// Render comparison (compare.mjs): the expectations come from the committed Button Contract and Foundations, offline;
// the probe runs on a small fake of the catalog page, and once from compare.js's own text to show it needs nothing
// outside its body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { colorKey, compareModule, expectations, probe } from '../scripts/compare.mjs';
import { convert } from '../../contract/scripts/color.mjs';

const load = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const contract = load('../../../design-systems/cds/contracts/button.component.json');
const foundations = load('../../../design-systems/cds/cds.foundations.json');
const nodes = load('../nodes/button.nodes.json');

test('expectations: every tuple in each Theme Mode, the layers in anatomy order with their parent and entry, and which are drawn inside it', () => {
  const spec = expectations({ contract, nodes, foundations });
  assert.equal(spec.collection, 'theme');
  assert.deepEqual(spec.modes, ['light', 'dark']);
  assert.equal(Object.keys(spec.expected).length, 480);
  assert.deepEqual(spec.layers.map(l => [l.name, l.parent, l.entry, l.inside]), [
    ['Button', null, 'cds-Button', false], ['Start icon', 'Button', 'startNodeCss', false], ['Start glyph', 'Start icon', 'cds-Icon', false],
    ['Middle', 'Button', 'middleNodeCss', false], ['Label', 'Middle', 'middleNodeCss', true],
    ['Spinner', 'Middle', 'spinnerContainerCss', false], ['Track', 'Spinner', 'spinnerContainerCss', true], ['Arc', 'Spinner', 'spinnerContainerCss', true],
    ['End icon', 'Button', 'endNodeCss', false], ['End glyph', 'End icon', 'cds-Icon', false]]);
  assert.deepEqual(spec.layers.filter(l => l.type === 'ELLIPSE').map(l => [l.name, l.nth]), [['Track', 0], ['Arc', 1]]);
});

test('expectations: the spinner while loading, an ELLIPSE by its stroke and arc, and a hidden layer null with its children', () => {
  const { expected } = expectations({ contract, nodes, foundations });
  const loading = expected['primary|l|solid|on|enabled'].light;
  assert.deepEqual(loading.Middle, { opacity: 0.82 }, "Interactable's opacity is on the Button's child, Middle");
  assert.deepEqual(loading.Spinner, { width: 24, height: 24 });
  assert.deepEqual(loading.Track, { fill: 'none', width: 24, height: 24, stroke: '#5b616e@0.2', strokeWidth: 2, sweep: 360 });
  assert.deepEqual(loading.Arc, { fill: 'none', width: 24, height: 24, stroke: '#ffffff', strokeWidth: 2, sweep: 270, strokeCap: 'round' });
  const idle = expected['primary|l|solid|off|hover'].light;
  assert.deepEqual([idle.Spinner, idle.Track, idle.Arc], [null, null, null]);
  assert.deepEqual([idle.Middle.opacity, idle.Label.opacity], [0.88, 1]);
});

test('expectations: colours per Mode, lengths from the layout collection, the stroke by its alignment', () => {
  const { expected } = expectations({ contract, nodes, foundations });
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

// One Button in each Mode's subtree. A subtree has a layout box only while the body carries its Mode's class.
const page = ({ labelHidden = false, padding = '8px', spinner = false, dashoffset = '0.25px' } = {}) => {
  const scheme = mode => new El(`cds-preview-scheme ${mode}`, {}, [
    new El('cds-Button baseCss-a1', { style: { backgroundColor: mode === 'light' ? 'rgb(0, 82, 255)' : 'rgb(87, 139, 250)', paddingLeft: padding, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgb(0, 82, 255)' } }, [
      new El('startNodeCss-b2', { w: 16, h: 16 }),
      new El('middleNodeCss-c3', {}, [
        ...(spinner ? [new El('spinnerContainerCss-e5', { w: 24, h: 24 }, [new El('svgCss-f6', { tag: 'svg' }, [
          circle({}, { stroke: 'rgba(91, 97, 110, 0.2)' }),
          circle({ pathLength: '1' }, { stroke: 'rgb(255, 255, 255)', strokeLinecap: 'round', strokeDasharray: '1px', strokeDashoffset: dashoffset })])])] : []),
        new El('baseCss-g7', {}, [new El('hiddenCss-d4', { text: 'Button', style: { color: 'rgba(255, 255, 255, 0.5)', visibility: labelHidden ? 'hidden' : 'visible' } })])]),
    ]),
  ]);
  const root = new El('', {}, [new El('tp-specimen', { attrs: { 'data-key': 'primary|xs' } }, [scheme('light'), scheme('dark')])]);
  const body = new El('tp-page cds-preview-light');
  const catalog = { toggles: [{ key: 'theme', modes: [{ key: 'light', className: 'cds-preview-light' }, { key: 'dark', className: 'cds-preview-dark' }] }] };
  const doc = { body, getElementById: id => (id === 'catalog' ? { textContent: JSON.stringify(catalog) } : null), querySelectorAll: s => root.querySelectorAll(s) };
  const shown = el => { for (const s of root.querySelectorAll('*')) if (s.cls.startsWith('cds-preview-scheme') && s.querySelectorAll('*').includes(el)) return body.cls.includes(`cds-preview-${s.cls.split(' ')[1]}`); };
  for (const e of root.querySelectorAll('*')) Object.defineProperties(e, { offsetWidth: { get: () => (shown(e) ? e.w : 0) }, offsetHeight: { get: () => (shown(e) ? e.h : 0) } });
  return { doc, style: el => ({ ...BASE, ...el.own }), color: text => colorKey(convert(text)) };
};
const spec = {
  collection: 'theme', modes: ['light', 'dark'],
  layers: [{ name: 'Button', type: 'COMPONENT', parent: null, entry: 'cds-Button' }, { name: 'Start icon', type: 'FRAME', parent: 'Button', entry: 'startNodeCss' },
    { name: 'Middle', type: 'FRAME', parent: 'Button', entry: 'middleNodeCss', inside: false },
    { name: 'Label', type: 'TEXT', parent: 'Middle', entry: 'middleNodeCss', inside: true }],
  expected: { 'primary|xs': {
    light: { Button: { fill: '#0052ff', paddingLeft: 8, outline: '#0052ff', outlineWidth: 2 }, 'Start icon': { width: 16 }, Label: { color: '#ffffff@0.5', opacity: 1 } },
    dark: { Button: { fill: '#578bfa' }, 'Start icon': { height: 16 }, Label: { opacity: 1 } } } },
};
// The same page with the spinner layers: Spinner by its entry, Track and Arc the first and second <circle> in it.
const ring = { fill: 'none', width: 24, height: 24, stroke: '#5b616e@0.2', strokeWidth: 2, sweep: 360 };
const arc = { fill: 'none', width: 24, height: 24, stroke: '#ffffff', strokeWidth: 2, sweep: 270, strokeCap: 'round' };
const withSpinner = (want = { Spinner: { width: 24 }, Track: ring, Arc: arc }) => ({ ...spec,
  layers: [...spec.layers, { name: 'Spinner', type: 'FRAME', parent: 'Middle', entry: 'spinnerContainerCss', inside: false },
    { name: 'Track', type: 'ELLIPSE', parent: 'Spinner', entry: 'spinnerContainerCss', inside: true, nth: 0 },
    { name: 'Arc', type: 'ELLIPSE', parent: 'Spinner', entry: 'spinnerContainerCss', inside: true, nth: 1 }],
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
  const missing = { ...spec, layers: [...spec.layers, { name: 'End icon', type: 'FRAME', parent: 'Button', entry: 'endNodeCss' }],
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
