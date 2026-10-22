// PROTOTYPE (#322), throwaway: the static way. It reads the HTML with To-handoff's static reader, the linked local
// stylesheets with its CSS parser and cascade, and the scripts as text. It groups elements by their authored
// classes, then proposes families, axes, states and parts. Nothing runs in a browser.
//   node docs/prototype/plain-html-families/static.mjs <page.html>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { matchedRules, parseCss, selectorMatches } from '../../../skills/to-handoff/scripts/css.mjs';
import { readHtml, walk } from '../../../skills/to-handoff/scripts/reader.mjs';

const INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea']);
const PAINT = /^(background-color|border(-\w+)?-color|box-shadow|outline-color)$/;
const TEXT = /^(font-|line-height|letter-spacing|text-|white-space|color$)/;
const STATE_NAMES = { hover: 'hover', active: 'pressed', focus: 'focus', 'focus-visible': 'focus', disabled: 'disabled' };
const FA_STYLES = new Set(['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands', 'fa-sharp', 'fa-sharp-duotone']);

export function readStatic(page) {
  const root = dirname(page);
  const text = readFileSync(page, 'utf8');
  const doc = readHtml(page, relative(root, page), { text });
  const all = [];
  walk(doc.root, el => all.push(el));

  // Stylesheets: <style> blocks (the reader already has them), then each linked one. A remote sheet is not read.
  const sheets = [];
  let rules = [...doc.rules];
  let order = rules.length;
  for (const el of all.filter(e => e.tag === 'link' && /stylesheet/.test(e.attrs.rel || ''))) {
    const href = el.attrs.href;
    if (/^https?:/.test(href)) { sheets.push({ href, read: false, why: 'remote' }); continue; }
    const css = parseCss(readFileSync(join(root, href), 'utf8')).map(r => ({ ...r, order: order++, file: href }));
    sheets.push({ href, read: true, rules: css.length });
    rules = rules.concat(css);
  }
  const tokens = {};
  for (const r of rules) if (r.selector === ':root') for (const d of r.decls) if (d.property.startsWith('--')) tokens[d.property] = d.value;

  // Scripts as text: classes toggled, inline styles written, text a library writes.
  const scriptSrcs = [...text.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  const scripts = scriptSrcs.map(src => ({ src, local: !/^https?:/.test(src) }));
  const js = doc.scripts.map(s => s.text).concat(scripts.filter(s => s.local).map(s => readFileSync(join(root, s.src), 'utf8'))).join('\n');
  const script = scanScript(js);

  const body = all.find(e => e.tag === 'body');
  const els = [];
  walk(body, el => { if (el !== body) els.push(el); });
  const info = new Map();
  const scriptTargets = new Set(script.text.map(t => t.target));
  for (const el of els) info.set(el, describe(el, rules, tokens, doc, scriptTargets));

  // Naive grouping: one group per authored class list, the analogue of a similarity grouping by repetition.
  const naive = new Map();
  for (const el of els) {
    const key = el.classes.length ? '.' + el.classes.join('.') : el.tag;
    naive.set(key, (naive.get(key) || 0) + 1);
  }

  // Candidates: interactive, or with paint of their own, or with state rules of their own.
  const candidates = els.filter(el => {
    const i = info.get(el);
    return i.kind !== 'icon' && i.kind !== 'image' && (INTERACTIVE.has(el.tag) || i.paint.length || Object.keys(i.states).length);
  });
  const ancestorCandidate = el => { for (let p = el.parent; p; p = p.parent) if (candidates.includes(p)) return p; return null; };
  const families = [];
  const parts = [];
  for (const el of candidates) {
    const outer = ancestorCandidate(el);
    // A painted, non-interactive element inside a candidate is a part of that candidate's family.
    if (outer && !INTERACTIVE.has(el.tag)) { parts.push({ part: cls(el), of: cls(outer), at: doc.at(el.offset) }); continue; }
    families.push({ family: cls(el), sites: [doc.at(el.offset)], el });
  }
  // Slots: a family whose subtree holds another family.
  for (const f of families) {
    f.slots = families.filter(g => g !== f && contains(f.el, g.el)).map(g => g.family);
    f.parts = parts.filter(p => p.of === f.family).map(p => p.part);
    f.states = Object.keys(info.get(f.el).states);
    f.icons = [];
    walk(f.el, e => { const i = info.get(e); if (i && (i.kind === 'icon' || i.kind === 'image')) f.icons.push(i.icon || i.image); });
    f.text = [];
    walk(f.el, e => { const t = ownText(e); if (t) f.text.push(t); });
    const sw = script.text.find(s => f.el && walkFind(f.el, e => e.attrs.id && s.target === '#' + e.attrs.id));
    if (sw) f.scriptText = sw;
  }

  // Merge proposals: pairs of families with similar own declarations; the axes are the values that differ.
  const merges = [];
  for (let i = 0; i < families.length; i++) for (let j = i + 1; j < families.length; j++) {
    const a = info.get(families[i].el), b = info.get(families[j].el);
    const pa = Object.keys(a.own), pb = Object.keys(b.own);
    const shared = pa.filter(p => pb.includes(p));
    const jaccard = shared.length / new Set([...pa, ...pb]).size;
    const samePaintToken = a.paint.some(p => b.paint.some(q => q.token && q.token === p.token));
    const sameStates = JSON.stringify(a.states) === JSON.stringify(b.states) && Object.keys(a.states).length > 0;
    if (jaccard < 0.4 && !samePaintToken) continue;
    const differ = shared.filter(p => a.own[p].value !== b.own[p].value)
      .map(p => ({ property: p, values: [families[i].family + ': ' + a.own[p].value, families[j].family + ': ' + b.own[p].value] }));
    merges.push({ families: [families[i].family, families[j].family], jaccard: +jaccard.toFixed(2), samePaintToken, sameStates, differ });
  }

  // Axis names from tokens: values that are var(--prefix-name) with a shared prefix name the axis values.
  const tokenAxes = axesFromTokens(Object.keys(tokens));

  const textSites = els.filter(el => info.get(el).kind === 'text').map(el => ({ class: cls(el), at: doc.at(el.offset), text: ownText(el), style: info.get(el).textStyle }));
  const icons = els.map(el => info.get(el)).filter(i => i.kind === 'icon').map(i => i.icon);
  const images = els.map(el => info.get(el)).filter(i => i.kind === 'image').map(i => i.image);
  const layout = els.filter(el => info.get(el).kind === 'layout').map(cls);
  const referenced = text + js + rules.map(r => r.decls.map(d => d.value).join(' ')).join(' ');
  const unusedAssets = listFiles(root).filter(f => /\.(svg|png|jpe?g|gif|webp)$/i.test(f) && !referenced.includes(f));
  const media = [...new Set(rules.filter(r => r.media).map(r => r.media))].map(m => ({
    media: m, selectors: rules.filter(r => r.media === m).map(r => r.selector),
    props: [...new Set(rules.filter(r => r.media === m).flatMap(r => r.decls.map(d => `${d.property}: ${d.value}`)))],
  }));

  return {
    sheets, scripts, tokens: Object.keys(tokens).length,
    counts: { elements: els.length, naiveGroups: naive.size, candidates: candidates.length, families: families.length, parts: parts.length },
    naive: Object.fromEntries(naive),
    families: families.map(({ el, ...f }) => ({ ...f, own: Object.fromEntries(Object.entries(info.get(el).own).map(([k, v]) => [k, v.value + (v.resolved ? ` → ${v.resolved}` : '')])), stateRules: info.get(el).states })),
    parts, merges, tokenAxes, text: textSites, icons, images, layout, unusedAssets, media, script,
  };
}

function describe(el, rules, tokens, doc, scriptTargets) {
  const matched = matchedRules(rules, el);
  const own = {};
  const owner = r => r.parsed.parts.at(-1).compound.classes.some(c => el.classes.includes(c)) || r.parsed.parts.at(-1).compound.id === el.attrs.id;
  for (const r of matched) for (const d of r.decls) {
    if (d.property.startsWith('--')) continue;
    own[d.property] = { value: d.value, rule: r.selector, owned: owner(r), resolved: resolve(d.value, tokens) };
  }
  const paint = Object.entries(own).filter(([p, v]) => PAINT.test(p) && v.owned && !/^(transparent|none|0)$/.test(v.value))
    .map(([p, v]) => ({ property: p, value: v.value, token: (/var\((--[\w-]+)/.exec(v.value) || [])[1] || null }));
  // State rules: a rule whose last compound has a state pseudo-class, matching this element once it is dropped.
  const states = {};
  for (const r of rules.filter(r => r.pseudo)) {
    const tail = r.parsed.parts.at(-1).compound;
    const state = tail.pseudos.map(p => STATE_NAMES[p]).find(Boolean);
    if (!state) continue;
    const plain = { ...r.parsed, parts: [...r.parsed.parts.slice(0, -1), { ...r.parsed.parts.at(-1), compound: { ...tail, pseudos: [] } }] };
    if (selectorMatches(plain, el)) states[state] = Object.fromEntries(r.decls.map(d => [d.property, d.value]));
  }
  if (el.tag === 'i' && el.classes.some(c => c.startsWith('fa-'))) {
    const style = el.classes.filter(c => FA_STYLES.has(c)).map(c => c.slice(3)).join(' ');
    const name = el.classes.filter(c => c.startsWith('fa-') && !FA_STYLES.has(c)).map(c => c.slice(3)).join(' ');
    return { kind: 'icon', icon: { set: 'Font Awesome', style, name, at: doc.at(el.offset), size: own['font-size']?.value || null }, own, paint, states };
  }
  if (el.tag === 'img' || el.tag === 'svg') {
    return { kind: 'image', image: { src: el.attrs.src || 'inline svg', alt: el.attrs.alt || null, at: doc.at(el.offset) }, own, paint, states };
  }
  const ownProps = Object.entries(own).filter(([, v]) => v.owned).map(([p]) => p);
  const textOnly = ownProps.length && ownProps.every(p => TEXT.test(p) || /^(width|overflow|display)$/.test(p)) && (ownText(el) || scriptTargets.has('#' + el.attrs.id));
  const kind = paint.length || INTERACTIVE.has(el.tag) || Object.keys(states).length ? 'candidate' : textOnly ? 'text' : 'layout';
  const textStyle = kind === 'text' ? [...new Set(ownProps.map(p => (/var\(--([\w]+-\d+)-/.exec(own[p].value) || [])[1]).filter(Boolean))] : null;
  return { kind, own: Object.fromEntries(Object.entries(own).filter(([, v]) => v.owned)), paint, states, textStyle };
}

function scanScript(js) {
  const toggled = [...js.matchAll(/classList\.(add|remove|toggle|replace)\(([^)]*)\)/g)].map(m => ({ op: m[1], args: m[2] }));
  const className = [...js.matchAll(/\.className\s*=\s*([^;\n]+)/g)].map(m => m[1]);
  const vars = Object.fromEntries([...js.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*document\.querySelector\(\s*'([^']+)'\s*\)/g)].map(m => [m[1], m[2]]));
  const inlineStyle = [...js.matchAll(/(\w+)\.addEventListener\(\s*'(\w+)'\s*,\s*function\s*\(\)\s*\{\s*this\.style\.(\w+)\s*=\s*'([^']*)'/g)]
    .map(m => ({ target: vars[m[1]] || m[1], event: m[2], property: m[3], value: m[4] }));
  const text = [...js.matchAll(/new\s+Typed\(\s*'([^']+)'\s*,\s*\{[\s\S]*?strings:\s*\[([\s\S]*?)\]/g)]
    .map(m => ({ library: 'typed.js', target: m[1], strings: [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map(s => s[1] ?? s[2]) }));
  return { toggled, className, inlineStyle, text };
}

// Token names that share a prefix and differ in one word: --button-primary / --button-secondary -> button: primary | secondary.
function axesFromTokens(names) {
  const groups = {};
  for (const n of names) {
    const m = /^--([a-z]+)-([a-z]+)(?:-(.*))?$/.exec(n);
    if (m) (groups[m[1]] ||= new Set()).add(m[2] + (m[3] ? '' : ''));
  }
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.size > 1).map(([k, v]) => [k, [...v]]));
}

const resolve = (value, tokens) => {
  if (!/var\(/.test(value)) return null;
  return value.replace(/var\((--[\w-]+)\)/g, (_, n) => tokens[n] ?? `?${n}`);
};
const cls = el => (el.classes.length ? el.classes.join('.') : el.tag);
const contains = (a, b) => { for (let p = b.parent; p; p = p.parent) if (p === a) return true; return false; };
const walkFind = (el, fn) => { let hit = false; walk(el, e => { if (fn(e)) hit = true; }); return hit; };
const ownText = el => el.children.filter(c => c.type === 'text').map(c => c.parts.join('')).join(' ').replace(/\s+/g, ' ').trim();
const listFiles = (dir, base = dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  if (n.startsWith('.') || n === 'node_modules') return [];
  return statSync(p).isDirectory() ? listFiles(p, base) : [relative(base, p)];
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const page = process.argv[2];
  if (!page || !existsSync(page)) { console.error('usage: static.mjs <page.html>'); process.exit(2); }
  console.log(JSON.stringify(readStatic(page), null, 2));
}
