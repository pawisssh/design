// The catalog card (#45): an IBM UI Icon Library-style card per specimen. The builder takes a node factory,
// so these tests build plain objects instead of DOM nodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as contractModule from '../../contract/scripts/contract.mjs';

const require = createRequire(import.meta.url);
const catalogCard = require('../assets/catalog-card.js');
const Selection = require('../assets/selection-model.js');
const button = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url)));
const model = new Selection(button, contractModule);

const h = (tag, props, ...children) => ({ tag, props: props || {}, children });
const text = node => (typeof node === 'string' ? node : node.children.map(text).join(''));
const card = id => catalogCard(model.specimen(id), { contract: button, baseId: model.baseId, sourceLabel: '@carbon/react 1.118.0', h });

test('a card is name and checkbox on top, the specimen host, then the footer', () => {
  const { card: node, checkbox, host } = card('danger|xs|hover');
  assert.equal(node.tag, 'section');
  assert.equal(node.props.className, 'tp-cell');
  assert.equal(node.props.dataset.id, 'danger|xs|hover');
  const [head, specimen, footer] = node.children;
  assert.equal(node.children.length, 3);
  assert.equal(head.tag, 'label', 'clicking the name toggles the checkbox');
  assert.equal(head.props.className, 'tp-card-head');
  assert.equal(head.children[1], checkbox, 'the checkbox sits top-right, after the name');
  assert.equal(specimen, host);
  assert.equal(host.props.className, 'tp-specimen');
  assert.equal(host.props.dataset.key, 'danger|xs|hover');
  assert.deepEqual(host.children, [], 'the page renders the specimen into the empty host');
  assert.equal(footer.tag, 'footer');
});

test('the name shows only the axis values in axis order; the full variant name is the tooltip', () => {
  const [name] = card('danger--tertiary|lg-expressive|disabled').card.children[0].children;
  assert.equal(name.props.className, 'tp-card-name');
  assert.equal(text(name), 'Danger Tertiary / Large (Expressive) / Disabled');
  assert.equal(name.props.title, 'Kind=Danger Tertiary, Size=Large (Expressive), State=Disabled');
});

test('the checkbox is named by the full variant name; the Base Component checkbox is locked', () => {
  const { checkbox } = card('primary|xs|enabled');
  assert.equal(checkbox.tag, 'input');
  assert.equal(checkbox.props.type, 'checkbox');
  assert.equal(checkbox.props['aria-label'], 'Kind=Primary, Size=Extra Small, State=Enabled');
  assert.ok(!checkbox.props.disabled);
  const base = card(model.baseId).checkbox;
  assert.equal(base.props.disabled, true);
  assert.equal(base.props.title, 'The Base Component is locked on');
});

test('the footer reads Source and the Code Library package, or Base Component on the base card', () => {
  const footer = id => card(id).card.children[2].children.map(text);
  assert.deepEqual(footer('ghost|md|focus'), ['Source', '@carbon/react 1.118.0']);
  assert.deepEqual(footer(model.baseId), ['Base Component']);
});

test('the card chrome uses Carbon tokens, never raw hex; the grid is 200px-tall cards of one width, at most 6 columns', () => {
  const template = readFileSync(new URL('../assets/catalog-template.html', import.meta.url), 'utf8');
  const css = template.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.doesNotMatch(css, /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i);
  assert.match(css, /#grid\{--tp-cell-width:200px;[^}]*grid-template-columns:repeat\(auto-fill,var\(--tp-cell-width\)\)[^}]*max-width:calc\(6 \* var\(--tp-cell-width\)\)/);
  assert.match(css, /\.tp-cell\{[^}]*width:var\(--tp-cell-width\);height:200px/);
  assert.match(css, /\.tp-specimen\{[^}]*align-items:center;justify-content:center/);
  assert.match(css, /\.tp-omitted \.tp-specimen\{opacity:\.4\}/);
});

test('a drafted label is flagged as drafted on the card; an owner-corrected one is not (#105)', () => {
  const c = JSON.parse(readFileSync(new URL('../../contract/test/fixtures/button.drafted.component.json', import.meta.url)));
  c.drafted['axes.state.values.disabled.label'] = { by: 'owner', was: 'Inactive' };
  const m = new Selection(c, contractModule);
  const name = id => catalogCard(m.specimen(id), { contract: c, baseId: m.baseId, sourceLabel: '', h }).card.children[0].children[0];
  const lg = name('danger|lg|disabled');
  assert.equal(text(lg), 'Danger / Large / Disabled', 'the label text is unchanged');
  const marked = lg.children.filter(n => typeof n !== 'string' && n.props.className === 'tp-drafted');
  assert.deepEqual(marked.map(text), ['Large'], 'only the agent-drafted label is marked');
  assert.match(marked[0].props.title, /^Drafted label/);
  assert.match(lg.props.title, /\(drafted: Size\)$/, 'the tooltip names the drafted axis');
  assert.deepEqual(name('danger|md|disabled').children, ['Danger / Medium / Disabled'], 'a card with no drafted label is unchanged');
  const template = readFileSync(new URL('../assets/catalog-template.html', import.meta.url), 'utf8');
  assert.match(template.match(/<style>([\s\S]*?)<\/style>/)[1], /\.tp-drafted\{[^}]*\}/);
});
