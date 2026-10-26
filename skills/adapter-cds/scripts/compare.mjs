#!/usr/bin/env node
// Render comparison of a CDS Contract against its To-preview catalog page: what the real component computes, tuple by
// tuple and Theme Mode by Mode, beside the Contract resolved through the Foundations document.
//   node skills/adapter-cds/scripts/compare.mjs <contract.json> --nodes <nodes.json> [--foundations <file>] [--out <file>]
// writes compare.js next to the catalog page (default .scratch/to-preview/<family>/compare.js). With the page open in
// the browser pane (the `to-preview` launch config serves .scratch/to-preview on 8737), the agent runs
//   (await import('./compare.js')).compare()
// which returns {checked, mismatches: ['<tuple> <mode> <layer>.<field>: page <value>, Contract <value>']}.
//
// A layer's element is found by its node map entry inside its parent's element: a `cds-` entry is that static class,
// any other a Linaria literal, whose class is `<name>-<hash>`. Compared, as the page computes them:
//   fill          background-color, or color on a TEXT layer;
//   opacity       opacity, 0 on a TEXT layer whose text is visibility: hidden (loading keeps the label's width);
//   stroke        outline color and width when strokeAlign is outside (the focus ring), else border width and colour;
//   padding*, radius (border-top-left-radius), and a numeric width or height (the element's layout box).
// Paint on a path inside a layer (`Start glyph/Vector`), effects and text styles are not compared.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { expand, resolve, tupleKey } from '../../contract/scripts/contract.mjs';
import { convert } from '../../contract/scripts/color.mjs';
import { foundationsPathFor, readJson } from '../../contract/scripts/io.mjs';
import { valueAt } from '../../to-design/scripts/foundations-value.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A converted colour as both sides write it: "#rrggbb", "#rrggbb@<alpha>" below 1, "none" at alpha 0. */
export const colorKey = ({ hex, alpha }) => (alpha === 0 ? 'none' : alpha < 1 ? `${hex}@${Math.round(alpha * 100) / 100}` : hex);

/**
 * expectations({contract, nodes, foundations}) -> {collection, modes, layers, expected}: what the probe looks for and what it
 * should find. `layers` is [{name, type, parent, entry}] in anatomy order; `expected` is
 * {<tuple key>: {<mode>: {<layer>: {<field>: value}}}}, a colour as colorKey writes it and a length in px.
 * The modes are those of the Foundations document's one multi-mode collection (CDS's Theme: light, dark).
 */
export function expectations({ contract, nodes, foundations }) {
  const multi = foundations.collections.filter(c => c.modes.length > 1);
  if (multi.length !== 1) throw new Error(`the page shows one Theme Mode at a time; the Foundations document has ${multi.length} multi-mode collections`);
  const theme = multi[0];
  const layers = [];
  const walk = (node, parent) => {
    if (nodes[node.name] === undefined) throw new Error(`no node for layer "${node.name}" in the node map`);
    layers.push({ name: node.name, type: node.type, parent, entry: nodes[node.name].split(' ')[0] });
    for (const child of node.children || []) walk(child, node.name);
  };
  walk(contract.anatomy, null);

  const expected = {};
  for (const tuple of expand(contract)) {
    const { layout, paint } = resolve(contract, tuple);
    const byMode = {};
    for (const { key: mode } of theme.modes) {
      const value = v => {
        if (v === 'none') return 'none';
        if (v && v.raw !== undefined) return v.raw;
        if (v && v.token) {
          const at = valueAt(foundations, v.token, { [theme.key]: mode });
          if (at === undefined) throw new Error(`${tupleKey(contract, tuple)}: ${v.token} has no value in ${mode}`);
          return at;
        }
        return undefined;
      };
      const color = v => { const c = value(v); return c === 'none' ? 'none' : typeof c === 'string' ? colorKey(convert(c)) : undefined; };
      const number = v => { const n = value(v); return typeof n === 'number' ? n : undefined; };
      const out = {};
      for (const { name, type } of layers) {
        const l = layout[name] || {}, p = paint[name] || {};
        const want = {
          fill: color(p.fill), opacity: number(p.opacity),
          paddingLeft: number(l.paddingLeft), paddingRight: number(l.paddingRight),
          paddingTop: number(l.paddingTop), paddingBottom: number(l.paddingBottom),
          radius: number(l.radius), width: number(l.width), height: number(l.height),
        };
        if (l.strokeAlign === 'outside') Object.assign(want, { outline: color(p.stroke), outlineWidth: number(l.strokeWeight) });
        else Object.assign(want, { borderWidth: number(l.strokeWeight), border: p.stroke === 'none' ? undefined : color(p.stroke) });
        if (type === 'TEXT') { want.color = want.fill; delete want.fill; }
        for (const k of Object.keys(want)) if (want[k] === undefined) delete want[k];
        if (Object.keys(want).length) out[name] = want;
      }
      byMode[mode] = out;
    }
    expected[tupleKey(contract, tuple)] = byMode;
  }
  return { collection: theme.key, modes: theme.modes.map(m => m.key), layers, expected };
}

/**
 * The page side: compares `spec` (expectations' result) against `doc`, with `style(el)` the computed style and
 * `color(text)` a computed colour as colorKey writes it. It runs in the browser from its source text, so it uses
 * nothing outside its own body.
 */
export function probe(spec, doc, style, color) {
  const classes = el => String(el.getAttribute('class') || '').split(/\s+/);
  const matches = (el, entry) => classes(el).some(c => (entry.indexOf('cds-') === 0 ? c === entry : c.indexOf(entry + '-') === 0));
  const inside = (el, test) => Array.prototype.find.call(el.querySelectorAll('*'), test);
  const hasText = el => Array.prototype.some.call(el.childNodes, n => n.nodeType === 3 && n.textContent.trim());
  const read = (el, type) => {
    const cs = style(el);
    const outlined = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const text = hasText(el) ? el : inside(el, hasText);
    return {
      fill: color(cs.backgroundColor), color: color(cs.color),
      opacity: type === 'TEXT' && text && style(text).visibility === 'hidden' ? 0 : parseFloat(cs.opacity),
      paddingLeft: parseFloat(cs.paddingLeft), paddingRight: parseFloat(cs.paddingRight),
      paddingTop: parseFloat(cs.paddingTop), paddingBottom: parseFloat(cs.paddingBottom),
      radius: parseFloat(cs.borderTopLeftRadius), width: el.offsetWidth, height: el.offsetHeight,
      outline: outlined ? color(cs.outlineColor) : 'none', outlineWidth: outlined ? parseFloat(cs.outlineWidth) : 0,
      borderWidth: parseFloat(cs.borderTopWidth), border: color(cs.borderTopColor),
    };
  };
  const mismatches = [];
  let checked = 0;
  const pages = {};
  Array.prototype.forEach.call(doc.querySelectorAll('.tp-specimen'), s => { pages[s.getAttribute('data-key')] = s; });
  Object.keys(spec.expected).forEach(key => { if (!pages[key]) mismatches.push(key + ': no specimen on the page'); });
  // A hidden Mode's subtree has no layout box, so each Mode is measured shown: its toggle's class on the body, as the
  // page's own Theme toggle sets it, and the page's classes put back after.
  const toggle = JSON.parse(doc.getElementById('catalog').textContent).toggles.find(t => t.key === spec.collection);
  const classOf = mode => toggle.modes.find(m => m.key === mode).className;
  const before = doc.body.getAttribute('class');
  spec.modes.forEach(mode => {
    spec.modes.forEach(m => doc.body.classList.remove(classOf(m)));
    doc.body.classList.add(classOf(mode));
    Object.keys(spec.expected).forEach(key => {
      if (!pages[key]) return;
      const scope = inside(pages[key], el => classes(el).indexOf('cds-preview-scheme') >= 0 && classes(el).indexOf(mode) >= 0);
      if (!scope) return mismatches.push(key + ' ' + mode + ': no ' + mode + ' subtree');
      const els = {};
      spec.layers.forEach(layer => {
        const parent = layer.parent === null ? scope : els[layer.parent];
        const el = parent && inside(parent, e => matches(e, layer.entry));
        const want = spec.expected[key][mode][layer.name];
        if (!el) { if (parent) mismatches.push(key + ' ' + mode + ' ' + layer.name + ': no element ' + layer.entry); return; }
        els[layer.name] = el;
        if (!want) return;
        const got = read(el, layer.type);
        Object.keys(want).forEach(field => {
          const a = got[field], b = want[field];
          const same = typeof b === 'number' ? Math.abs(a - b) < 0.01 : a === b;
          if (!same) mismatches.push(key + ' ' + mode + ' ' + layer.name + '.' + field + ': page ' + a + ', Contract ' + b);
        });
      });
      checked++;
    });
  });
  doc.body.setAttribute('class', before);
  return { checked, mismatches };
}

/** The module the page imports: the expectations, color.mjs inlined, and the probe, run on its document. */
export const compareModule = spec =>
  `// Written by skills/adapter-cds/scripts/compare.mjs.\nconst spec = ${JSON.stringify(spec)};\n` +
  `${readFileSync(new URL('../../contract/scripts/color.mjs', import.meta.url), 'utf8').replace(/^export /gm, '')}\n` +
  `const colorKey = ${colorKey.toString()};\n` +
  `export function compare() {\n  return (${probe.toString()})(spec, document, el => getComputedStyle(el), text => colorKey(convert(text)));\n}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { values: opt, positionals: [path, ...extra] } = parseArgs({ allowPositionals: true,
      options: { nodes: { type: 'string' }, foundations: { type: 'string' }, out: { type: 'string' } } });
    if (!path || extra.length || !opt.nodes) throw new Error('usage: compare.mjs <contract.json> --nodes <nodes.json> [--foundations <file>] [--out <file>]');
    const contract = readJson(path);
    const spec = expectations({ contract, nodes: readJson(opt.nodes), foundations: readJson(foundationsPathFor(path, opt.foundations)) });
    const out = opt.out || join(REPO_ROOT, '.scratch/to-preview', contract.family.key, 'compare.js');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, compareModule(spec));
    console.log(`${out}: ${Object.keys(spec.expected).length} tuples x ${spec.modes.join(', ')}`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
