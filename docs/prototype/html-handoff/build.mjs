#!/usr/bin/env node
// PROTOTYPE for #63 (What should the HTML handoff look like?). Throwaway: lives on prototype/html-handoff only.
//   node skills/adapter-carbon/scripts/preview.mjs        (once: fetch the pinned Carbon packages)
//   node docs/prototype/html-handoff/build.mjs            -> out/handoff.html + out/handoff.json
//
// 1. Stand-in matcher (#61 rules) over the sample Handoff's raw style values. Token values come from
//    @carbon/themes / layout / type in the scratch packages, standing in for the whole-theme Foundations
//    document (#59) [assumption]; the committed carbon.foundations.json is still closure-only. Each style
//    entry's `expect` tier is asserted, so the sample really exercises exact / agent pick / near / Off-system.
// 2. Real per-family renders: the Carbon Adapter's previewRenderer is used for its package guard and
//    stylesheet; usages are rendered here with their own labels and authored states, because
//    render(tuple) needs every axis, uses the Contract's default label and always sets the icon.
// 3. The Rendering: one self-contained page laying out out/handoff.json, with three layout variants
//    (?variant=A|B|C). It adds no content the Handoff does not hold.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewRenderer, PREVIEW_DIR } from '../../../skills/adapter-carbon/scripts/preview.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const read = p => readFileSync(join(HERE, p), 'utf8');
const handoff = JSON.parse(read('handoff.sample.json'));
const proposals = { 'avatar-stack': JSON.parse(read('proposals/avatar-stack.proposal.json')) };
// #90: every Contract in the Design System, including Adapter drafts (text-input).
const contracts = Object.fromEntries(readdirSync(join(REPO, 'design-systems/carbon/contracts')).filter(f => f.endsWith('.component.json'))
  .map(f => JSON.parse(readFileSync(join(REPO, 'design-systems/carbon/contracts', f), 'utf8'))).map(c => [c.family.key, c]));
const contract = contracts.button;
const require = createRequire(join(PREVIEW_DIR, 'package.json'));
const themes = require('@carbon/themes'), layout = require('@carbon/layout'), type = require('@carbon/type'), colors = require('@carbon/colors');

// ---------- token tables (White mode; the Prototype is single-mode: source.modes {light: white}) ----------
const kebab = s => s.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([a-zA-Z])(\d)/g, '$1-$2').toLowerCase();
const parseColor = s => {
  s = String(s).trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
};
const colorTokens = {};
for (const [k, v] of Object.entries(themes.white)) { const c = typeof v === 'string' && parseColor(v); if (c) colorTokens[kebab(k)] = { raw: v, c }; }
const primitives = {};
for (const [k, v] of Object.entries(colors)) {
  const m = k.match(/^([a-z]+?)(\d+)(Hover)?$/); const c = typeof v === 'string' && parseColor(v);
  if (m && c) primitives[`${m[1]}.${m[2]}${m[3] || ''}`] = c;
}
const px = v => (String(v).endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v));
const spacing = Object.fromEntries(layout.spacing.map((v, i) => [`spacing-${String(i + 1).padStart(2, '0')}`, px(v)]));
const radius = Object.fromEntries(['00', '02', '04', '08', '16', '24'].map(n => [`border-radius-${n}`, px(layout[`borderRadius${n}`])]));
const DEPRECATED = /^(bodyShort|bodyLong|productive|expressive|fluid)/;
const textStyles = {};
for (const [k, s] of Object.entries(type.styles)) {
  if (DEPRECATED.test(k)) continue;
  const size = px(s.fontSize);
  textStyles[kebab(k)] = { fontSize: size, fontWeight: s.fontWeight, lineHeight: Math.round(s.lineHeight * size), letterSpacing: parseFloat(s.letterSpacing || 0) || 0 };
}

// ---------- OKLab ----------
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const oklab = ([r, g, b]) => {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const deltaE = (a, b) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));

// ---------- role filter (stand-in for scopes + the property -> group table, #61) ----------
const ROLE_GROUPS = {
  'background-color': n => /^(background|layer|field)(-\d+)?$/.test(n),
  color: n => /^(text|link|icon)-/.test(n),
  'border-color': n => /^border-/.test(n),
};
const values = [];
const report = [];
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function matchColor(entry) {
  const inRole = Object.keys(colorTokens).filter(ROLE_GROUPS[entry.property]);
  if (entry.ref) {
    const name = entry.ref.match(/--cds-([\w-]+)/)?.[1];
    if (!name || !colorTokens[name]) throw new Error(`unknown token ${entry.ref}`);
    return { tier: 'reference', out: { token: name } };
  }
  const raw = parseColor(entry.raw);
  const exact = inRole.filter(n => { const c = colorTokens[n].c; return c.slice(0, 3).every((v, i) => Math.abs(v - raw[i]) <= 1) && Math.abs(c[3] - raw[3]) <= 0.01; });
  if (exact.length === 1) return { tier: 'exact', out: { token: exact[0] } };
  if (exact.length > 1) return { tier: 'exact-agent', out: { token: pick(entry, exact), candidates: exact.filter(n => n !== pick(entry, exact)), by: 'agent' } };
  const ranked = inRole.filter(n => Math.abs(colorTokens[n].c[3] - raw[3]) <= 0.05).map(n => ({ n, d: deltaE(raw, colorTokens[n].c) })).sort((a, b) => a.d - b.d);
  const near = ranked.filter(r => r.d <= 0.02);
  if (near.length) {
    const token = pick(entry, near.map(r => r.n));
    return { tier: 'near', out: { token, match: 'near', raw: entry.raw, delta: round(near.find(r => r.n === token).d), candidates: near.slice(0, 3).map(r => r.n).filter(n => n !== token), by: 'agent' } };
  }
  const primitive = Object.entries(primitives).find(([, c]) => c.slice(0, 3).every((v, i) => Math.abs(v - raw[i]) <= 1))?.[0];
  return { tier: 'off-system', value: { raw: { light: entry.raw }, role: entry.property, nearest: ranked.slice(0, 3).map(r => ({ token: r.n, delta: round(r.d) })), ...(primitive && { primitive }) } };
}
function pick(entry, candidates) {
  const p = entry.pick || candidates[0];
  if (!candidates.includes(p)) throw new Error(`agent pick ${p} is not among ${candidates.join(', ')}`);
  return p;
}
function matchPx(entry) {
  const scale = entry.property === 'border-radius' ? radius : spacing;
  const parts = String(entry.raw).split(/\s+/).map(px);
  const res = parts.map(v => {
    const exact = Object.keys(scale).filter(n => Math.abs(scale[n] - v) <= 0.5);
    if (exact.length) return { tier: 'exact', token: exact[0] };
    const near = Object.keys(scale).filter(n => Math.abs(scale[n] - v) <= 1);
    if (near.length === 1) return { tier: 'near', token: near[0], v };
    const below = Object.keys(scale).filter(n => scale[n] < v).pop(), above = Object.keys(scale).find(n => scale[n] > v);
    return { tier: 'off-system', nearest: [below, above].filter(Boolean).map(n => ({ token: n, px: scale[n] })) };
  });
  if (res.every(r => r.tier === 'exact')) return { tier: 'exact', out: { token: res.length === 1 ? res[0].token : res.map(r => r.token) } };
  if (res.length === 1 && res[0].tier === 'near') return { tier: 'near', out: { token: res[0].token, match: 'near', raw: entry.raw, delta: `${Math.abs(scale[res[0].token] - res[0].v)}px`, candidates: [], by: 'agent' } };
  return { tier: 'off-system', value: { raw: { light: entry.raw }, role: entry.property, nearest: res.flatMap(r => r.nearest || []) } };
}
function matchText(entry) {
  const r = entry.raw;
  const same = Object.keys(textStyles).filter(n => textStyles[n].fontSize === r.fontSize && textStyles[n].fontWeight === r.fontWeight);
  const ok = n => Math.abs(textStyles[n].lineHeight - r.lineHeight) <= 1 && Math.abs(textStyles[n].letterSpacing - r.letterSpacing) <= 0.05;
  const exact = same.filter(ok);
  if (exact.length === 1) return { tier: 'exact', out: { textStyle: exact[0] } };
  if (exact.length > 1) { const p = pick(entry, exact); return { tier: 'exact-agent', out: { textStyle: p, candidates: exact.filter(n => n !== p), by: 'agent' } }; }
  if (same.length) {
    const p = pick(entry, same), t = textStyles[p];
    return { tier: 'near', out: { textStyle: p, match: 'near', raw: r, delta: `line height ${r.lineHeight} vs ${t.lineHeight}px`, candidates: same.filter(n => n !== p).slice(0, 3), by: 'agent' } };
  }
  return { tier: 'off-system', value: { raw: { light: r }, role: 'text-style', nearest: [] } };
}

function resolve(entry, where, matcher) {
  const { expect, pick: _p, valueId, reason, at, note, ...rest } = entry;
  const res = matcher(entry);
  report.push(`${res.tier === expect ? 'ok  ' : 'FAIL'} ${where.padEnd(34)} ${JSON.stringify(entry.raw ?? entry.ref)} -> ${res.tier}${res.out ? ' ' + JSON.stringify(res.out.token ?? res.out.textStyle) : ''}${res.out?.delta !== undefined ? ' ΔE/Δ ' + res.out.delta : ''}`);
  if (res.tier !== expect) throw new Error(`${where}: expected ${expect}, got ${res.tier}\n${report.join('\n')}`);
  if (res.tier === 'off-system') {
    if (!valueId || !reason) throw new Error(`${where}: an Off-system value needs valueId and reason`);
    const ats = [].concat(at);
    const existing = values.find(v => v.id === valueId);
    if (existing) existing.at.push(...ats); else values.push({ id: valueId, ...res.value, reason, at: ats });
    return { ...(rest.property && { property: rest.property }), value: `value:${valueId}`, ...(note && { note }) };
  }
  return { ...(rest.property && { property: rest.property }), ...res.out, ...(note && { note }), at };
}

for (const screen of handoff.screens)
  for (const region of screen.regions) {
    region.styles = (region.styles || []).map((s, i) => resolve(s, `${region.id}.styles[${i}] ${s.property}`, s.property.endsWith('color') ? matchColor : matchPx));
    for (const t of region.text || []) if (t.style?.textStyle) t.style = { ...resolve(t.style.textStyle, `${region.id} copy:${t.copy}`, matchText), at: t.at };
  }
handoff.values = values;
delete handoff.$comment;
console.log(report.join('\n'));

// ---------- real per-family renders ----------
const renderer = await previewRenderer(contract); // package guard + stylesheet
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const copyText = ref => (typeof ref === 'string' && ref.startsWith('copy:') ? handoff.copy[ref.slice(5)].text : ref);
// #90 finding: TextInput requires `id`, a prop no Contract axis or property carries; the usage id stands in.
const REQUIRED = { 'text-input': u => ({ id: u.id }) };
function propsFor(usage, override = {}) {
  const contract = contracts[usage.contract];
  const props = { ...(REQUIRED[usage.contract]?.(usage) || {}) };
  const tuple = { ...usage.tuple, ...(override.state && { state: override.state }) };
  for (const axis of contract.axes) {
    const key = tuple[axis.key] ?? axis.default;
    const value = axis.values.find(v => v.key === key);
    if (!value) throw new Error(`${usage.id}: unknown ${axis.key} ${key}`);
    Object.assign(props, value.code || {});
  }
  const properties = { ...usage.properties, ...override.properties };
  let children;
  for (const p of contract.properties) {
    if (properties[p.key] === undefined) continue;
    if (p.code?.prop === 'children') children = copyText(properties[p.key]);
    else if (p.type === 'TEXT' && p.code?.prop) props[p.code.prop] = copyText(properties[p.key]);
  }
  return { props, children };
}
function snippet(usage, override) {
  const contract = contracts[usage.contract];
  const { props, children } = propsFor(usage, override);
  const emit = Object.entries(props).filter(([k, v]) => {
    if (!contract.axes.some(a => a.values.some(x => x.code && k in x.code))) return true; // property or required prop
    const axis = contract.axes.find(a => a.values.some(x => x.code && k in x.code));
    if (contract.code.alwaysEmit.includes(axis?.key)) return true;
    const def = axis?.values.find(x => x.key === axis.default)?.code || {};
    return def[k] !== v;
  });
  const attrs = emit.map(([k, v]) => (v === true ? k : `${k}="${v}"`)).join(' ');
  const tag = contract.code.component;
  return `${contract.code.import}\n\n<${tag}${attrs ? ' ' + attrs : ''}${children === undefined ? ' />' : `>${children}</${tag}>`}`;
}
const renders = {}, snippets = {};
for (const screen of handoff.screens)
  for (const region of screen.regions)
    for (const u of region.usages || []) {
      if (!u.contract) continue;
      const c = contracts[u.contract];
      const { [c.code.component]: Component } = require(c.code.package);
      const variants = [['', {}], ...Object.entries(screen.states).filter(([, s]) => s.usageStates?.[u.id]).map(([k, s]) => [`@${k}`, s.usageStates[u.id]])];
      for (const [suffix, ov] of variants) {
        const { props, children } = propsFor(u, ov);
        renders[u.id + suffix] = renderToStaticMarkup(React.createElement(Component, props, children));
        snippets[u.id + suffix] = snippet(u, ov);
      }
    }

// ---------- Prototype per state (srcdoc). Forcing a state stands in for #62's interaction script. ----------
const proto = read('sample-prototype/index.html');
const protoByState = {};
for (const [k, s] of Object.entries(handoff.screens[0].states))
  if (s.force) protoByState[k] = proto.replace('</body>', `<script>/* Rendering stand-in: forces state "${k}" */Object.assign(state, ${JSON.stringify(s.force)}); render();</script>\n</body>`);

// ---------- swatches: every colour token the page shows, White + Gray 100 ----------
const swatches = {};
for (const [k, v] of Object.entries(themes.white)) if (typeof v === 'string' && parseColor(v)) swatches[kebab(k)] = { white: v, g100: themes.g100[k] };

const data = {
  handoff, proposals, renders, snippets, protoByState, swatches, textStyles,
  contracts: Object.fromEntries(Object.entries(contracts).map(([k, c]) => [k, { name: c.family.name, axes: c.axes.map(a => ({ key: a.key, label: a.label, default: a.default, values: a.values.map(v => ({ key: v.key, label: v.label })) })), package: `${c.code.package} ${c.source.packages[c.code.package]}`, snapshotId: c.source.snapshotId, status: c.selection.status }])),
  spacing, radius,
};
const page = read('page.html')
  .replace('/* carbon-styles */', () => renderer.stylesheet.replace(/<\/style/gi, '<\\/style'))
  .replace('/* page-css */', () => read('page.css'))
  .replace('/* page-js */', () => read('page.js').replace(/<\/script/gi, '<\\/script'))
  .replace('/* handoff-data */', () => JSON.stringify(data).replace(/</g, '\\u003c'));
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out/handoff.json'), JSON.stringify(handoff, null, 2) + '\n');
writeFileSync(join(HERE, 'out/handoff.html'), page);
console.log(`out/handoff.html (${Math.round(page.length / 1024)} KB), ${Object.keys(renders).length} real renders, ${values.length} Off-system values`);
