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

test('expectations: every tuple in each Theme Mode, the layers in anatomy order with their parent and entry', () => {
  const spec = expectations({ contract, nodes, foundations });
  assert.equal(spec.collection, 'theme');
  assert.deepEqual(spec.modes, ['light', 'dark']);
  assert.equal(Object.keys(spec.expected).length, 480);
  assert.deepEqual(spec.layers.map(l => [l.name, l.parent, l.entry]), [
    ['Button', null, 'cds-Button'], ['Start icon', 'Button', 'startNodeCss'], ['Start glyph', 'Start icon', 'cds-Icon'],
    ['Label', 'Button', 'middleNodeCss'], ['End icon', 'Button', 'endNodeCss'], ['End glyph', 'End icon', 'cds-Icon']]);
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
    Object.assign(this, { cls, attrs: opts.attrs || {}, own: opts.style || {}, text: opts.text, kids, w: opts.w || 0, h: opts.h || 0 });
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
    return sel === '*' ? all : all.filter(e => e.cls.split(' ').includes(sel.slice(1)));
  }
}
const BASE = { backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', opacity: '1', visibility: 'visible', paddingLeft: '0px',
  paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopLeftRadius: '0px', outlineStyle: 'none', outlineWidth: '0px',
  outlineColor: 'rgb(0, 0, 0)', borderTopWidth: '0px', borderTopColor: 'rgb(0, 0, 0)' };

// One Button in each Mode's subtree. A subtree has a layout box only while the body carries its Mode's class.
const page = ({ labelHidden = false, padding = '8px' } = {}) => {
  const scheme = mode => new El(`cds-preview-scheme ${mode}`, {}, [
    new El('cds-Button baseCss-a1', { style: { backgroundColor: mode === 'light' ? 'rgb(0, 82, 255)' : 'rgb(87, 139, 250)', paddingLeft: padding, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgb(0, 82, 255)' } }, [
      new El('startNodeCss-b2', { w: 16, h: 16 }),
      new El('middleNodeCss-c3', { style: { color: 'rgba(255, 255, 255, 0.5)' } }, [new El('hiddenCss-d4', { text: 'Button', style: { visibility: labelHidden ? 'hidden' : 'visible' } })]),
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
    { name: 'Label', type: 'TEXT', parent: 'Button', entry: 'middleNodeCss' }],
  expected: { 'primary|xs': {
    light: { Button: { fill: '#0052ff', paddingLeft: 8, outline: '#0052ff', outlineWidth: 2 }, 'Start icon': { width: 16 }, Label: { color: '#ffffff@0.5', opacity: 1 } },
    dark: { Button: { fill: '#578bfa' }, 'Start icon': { height: 16 }, Label: { opacity: 1 } } } },
};

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
