// PROTOTYPE (#312), throwaway. The static way: compile the Prototype's Sass with its own sass-embedded and
// Carbon's @use, render the harness's markup in Node (no browser, no build), and cascade the compiled rules
// onto it. Every declaration keeps its authored value (var() kept) and its source line through the source map.
//
//   node docs/prototype/carbon-scss-styles/static.mjs .scratch/carbon-scss-styles/app .scratch/carbon-scss-styles/fa/package
//
// It reuses To-handoff's css.mjs (parseCss, selectorMatches) and adds what css.mjs lacks for a compiled Carbon
// sheet: shorthands read from the raw text (border resets, background), logical properties, !important,
// custom-property inheritance, var(), rem, % and em resolution, blockification, and :hover rules as a state.
// It still guesses at :not()/:where()/:is() and sibling combinators: out/static.json's selectorRisk counts them.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCss, selectorMatches, splitWords } from '../../../skills/to-handoff/scripts/css.mjs';
import { loadParse5, loadTypescript } from '../../../skills/to-handoff/scripts/deps.mjs';
import { PROPS_LIST } from './props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const app = resolve(process.argv[2] || '.scratch/carbon-scss-styles/app');
const fa = resolve(process.argv[3] || '.scratch/carbon-scss-styles/fa/package');
const OUT = join(HERE, 'out');
const req = createRequire(join(app, 'package.json'));
const imp = id => import(pathToFileURL(req.resolve(id)));
const t = {};
const time = async (k, f) => { const s = performance.now(); const r = await f(); t[k] = Math.round(performance.now() - s); return r; };

const PROPS = PROPS_LIST;
const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']);

// ---------- 1. compile every stylesheet the JS imports, in bundle order ----------
const sass = await imp('sass-embedded');
const { SourceMapConsumer } = await imp('source-map-js');
const jsFiles = []; const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name) && !p.includes('__proto')) jsFiles.push(p); } };
walk(join(app, 'src'));
// main.jsx imports App.scss first; App.jsx then imports the components, each importing its own sheet.
const order = ['src/App.scss', ...readFileSync(join(app, 'src/App.jsx'), 'utf8').match(/from '\.\/components\/[^']+'/g).map(m => m.slice(6, -1))]
  .flatMap(m => m.endsWith('.scss') ? [m] : jsFiles.filter(f => relative(app, f).startsWith(m.replace('./', 'src/'))).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/import '(\.\/[^']+\.scss)'/g)].map(x => relative(app, join(dirname(f), x[1])))));
const sheets = [...new Set(order)];
const compiled = await time('compile', () => Promise.all(sheets.map(async rel => {
  const r = await sass.compileAsync(join(app, rel), { loadPaths: [join(app, 'node_modules')], sourceMap: true, quietDeps: true, silenceDeprecations: ['import', 'global-builtin'] });
  return { rel, css: r.css, map: new SourceMapConsumer(r.sourceMap) };
})));
// Font Awesome is a cdnjs <link> in index.html; its rules come from the npm tarball (#313: byte-identical).
const faCss = readFileSync(join(fa, 'css/all.css'), 'utf8');

// ---------- 2. rules, with source and importance ----------
const lineCol = text => { const starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1); return off => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return { line: lo + 1, column: off - starts[lo] }; }; };
const tidy = s => s.replace(/^.*\/node_modules\//, '').replace(/^file:\/\/.*?\/src\//, 'src/').replace(/^.*\/app\/src\//, 'src/');
const allRules = [];
// Logical properties as their physical longhands (horizontal, left-to-right): Carbon writes block-size and inline-size.
const LOGICAL = { 'block-size': 'height', 'inline-size': 'width', 'min-block-size': 'min-height', 'min-inline-size': 'min-width',
  'padding-block-start': 'padding-top', 'padding-block-end': 'padding-bottom', 'padding-inline-start': 'padding-left', 'padding-inline-end': 'padding-right',
  'margin-block-start': 'margin-top', 'margin-block-end': 'margin-bottom', 'margin-inline-start': 'margin-left', 'margin-inline-end': 'margin-right',
  'border-block-end-width': 'border-bottom-width', 'border-block-end-color': 'border-bottom-color', 'border-block-end-style': 'border-bottom-style',
  'border-start-start-radius': 'border-top-left-radius' };
// css.mjs expands a few shorthands itself and drops what it does not read (`border: none` keeps only the width),
// so each declaration is read again from the compiled text at its offset and expanded here.
const rawDecl = (css, off) => {
  let depth = 0, i = off;
  for (; i < css.length; i++) { const ch = css[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if ((ch === ';' || ch === '}') && depth === 0) break; }
  const text = css.slice(off, i); const colon = text.indexOf(':');
  return { property: text.slice(0, colon).trim().toLowerCase(), value: text.slice(colon + 1).trim().replace(/\s*!important$/i, ''), important: /!important\s*$/i.test(text) };
};
const addSheet = (name, css, map, base) => {
  const at = lineCol(css);
  for (const r of parseCss(css)) {
    r.order += base;
    const seen = new Set();
    r.decls = r.decls.flatMap(d => {
      if (seen.has(d.offset)) return [];
      seen.add(d.offset);
      const raw = rawDecl(css, d.offset);
      const pos = at(d.offset);
      let source = `${name}:${pos.line}`;
      if (map) { const o = map.originalPositionFor({ line: pos.line, column: pos.column }); if (o.source) source = `${tidy(o.source)}:${o.line}`; }
      return longhands(raw.property, raw.value).map(([property, value]) => ({ property, value, important: raw.important, source }));
    });
    allRules.push(r);
  }
};
addSheet('fontawesome-free/css/all.css', faCss, null, 0);
compiled.forEach((c, i) => addSheet(c.rel, c.css, c.map, (i + 1) * 1e6));

function longhands(p, v) {
  const w = splitWords(v);
  const box = (pre, suf = '') => { const [a, b = a, c = a, d = b] = w; return [[`${pre}-top${suf}`, a], [`${pre}-right${suf}`, b], [`${pre}-bottom${suf}`, c], [`${pre}-left${suf}`, d]]; };
  if (LOGICAL[p]) return [[LOGICAL[p], v]];
  if (p === 'padding' || p === 'margin') return box(p);
  if (/^(padding|margin)-(block|inline)$/.test(p)) { const [pre, axis] = p.split('-'); const [a, b = a] = w; return axis === 'block' ? [[`${pre}-top`, a], [`${pre}-bottom`, b]] : [[`${pre}-left`, a], [`${pre}-right`, b]]; }
  if (p === 'border-radius') return [['border-top-left-radius', splitWords(v.split(/\s\/\s/)[0])[0]]];
  if (p === 'gap' || p === 'grid-gap') { const [a, b = a] = w; return [['row-gap', a], ['column-gap', b]]; }
  if (p === 'border-width') return box('border', '-width');
  if (p === 'border-color') return box('border', '-color');
  if (p === 'border-style') return box('border', '-style');
  // A border shorthand sets all three: what it leaves out goes back to its initial value.
  if (/^border(-bottom|-block|-block-end)?$/.test(p)) {
    const style = w.find(x => /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(x)) || 'none';
    const width = w.find(x => /^\d|^(thin|medium|thick)$/.test(x)) || 'medium'; const color = w.find(x => x !== style && x !== width) || 'currentcolor';
    return [['border-bottom-width', width], ['border-bottom-style', style], ['border-bottom-color', color]];
  }
  // background sets background-color too: the colour layer, or transparent when it names none.
  if (p === 'background') return [['background-color', w.find(x => /^(#|rgba?\(|hsla?\(|var\(|transparent$|currentcolor$|inherit$)/i.test(x) || (/^[a-z]+$/i.test(x) && !/^(none|no-repeat|repeat(-x|-y)?|space|round|center|left|right|top|bottom|fixed|scroll|local|cover|contain|(border|padding|content)-box|auto)$/i.test(x))) || 'transparent']];
  if (p === 'font' && w.length === 1) return ['font-family', 'font-size', 'font-weight', 'line-height'].map(x => [x, w[0]]);
  return [[p, v]];
}

// ---------- 3. markup: the harness rendered in Node, through Vite's SSR loader ----------
const { createServer } = await imp('vite');
const react = (await imp('@vitejs/plugin-react')).default;
const noCss = { name: 'proto-no-css', enforce: 'pre', resolveId: id => (/\.s?css$/.test(id) ? '\0proto-css' : null), load: id => (id === '\0proto-css' ? 'export default ""' : null) };
const { markup, STATES } = await time('ssr', async () => {
  // Externalised, @carbon/react's named imports in App.jsx arrive as {default} namespaces (CJS interop) and
  // React refuses them: Carbon is bundled for SSR instead.
  const vite = await createServer({ root: app, configFile: false, logLevel: 'silent', appType: 'custom', ssr: { noExternal: [/^@carbon\//] }, server: { middlewareMode: true, hmr: false }, plugins: [noCss, react()] });
  try {
    const mod = await vite.ssrLoadModule('/src/__proto/States.jsx');
    const { renderToStaticMarkup } = await imp('react-dom/server');
    const { createElement } = await imp('react');
    return { markup: renderToStaticMarkup(createElement(mod.default)), STATES: mod.STATES };
  } finally { await vite.close(); }
});

// ---------- 4. the element tree, in css.mjs's shape ----------
const parse5 = loadParse5();
const toEl = (n, parent) => {
  if (!n.tagName) return null;
  const attrs = Object.fromEntries(n.attrs.map(a => [a.name, a.value]));
  const el = { type: 'element', tag: n.tagName, attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean), parent, children: [] };
  el.inline = attrs.style ? attrs.style.split(';').map(s => s.split(':')).filter(x => x[1]).flatMap(([k, v]) => longhands(k.trim(), v.trim()).map(([property, value]) => ({ property, value, important: false, source: 'inline style' }))) : [];
  el.children = (n.childNodes || []).map(c => toEl(c, el)).filter(Boolean);
  el.text = (n.childNodes || []).filter(c => c.nodeName === '#text').map(c => c.value).join('').trim();
  return el;
};
const doc = parse5.parse(`<!doctype html><html lang="en"><head></head><body><div id="root">${markup}</div></body></html>`);
const html = toEl(doc.childNodes.find(n => n.tagName === 'html'), null);

// ---------- 5. cascade ----------
const cache = new Map();
const isHover = r => r.pseudo && r.parsed.parts.at(-1).compound.pseudos.every(p => p === 'hover');
function cascade(el, extra = []) {
  if (!extra.length && cache.has(el)) return cache.get(el);
  const out = {};
  if (el.parent) for (const [k, v] of Object.entries(cascade(el.parent))) if (INHERITED.has(k) || k.startsWith('--')) out[k] = { ...v, inherited: true };
  const matched = allRules.filter(r => !r.media && (!r.pseudo || extra.includes(r)) && selectorMatches(r.parsed, el)).sort((p, q) => p.specificity - q.specificity || p.order - q.order);
  for (const imp of [false, true]) {
    for (const r of matched) for (const d of r.decls) if (d.important === imp) out[d.property] = { value: d.value, source: d.source, selector: r.selector, important: imp };
    if (!imp) for (const d of el.inline) out[d.property] = { value: d.value, source: d.source, selector: 'style=""' };
  }
  for (const [k, v] of Object.entries(out)) if (/^(inherit|unset)$/.test(v.value) && el.parent && (INHERITED.has(k) || v.value === 'inherit')) { const p = cascade(el.parent)[k]; if (p) out[k] = { ...p, inherited: true }; else delete out[k]; }
  if (!extra.length) cache.set(el, out);
  return out;
}
const resolveVars = (value, c, depth = 0) => value.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fb) => {
  const v = c[name]; if (v && depth < 8) return resolveVars(v.value, c, depth + 1); return fb !== undefined ? resolveVars(fb.trim(), c, depth + 1) : '<unset>';
});
const px = v => v.replace(/(-?[\d.]+)rem\b/g, (_, n) => `${+n * 16}px`);
const kindOf = (authored, resolved) => {
  const m = authored.match(/var\((--[\w-]+)/);
  if (m) return m[1].startsWith('--cds-') ? 'cds-token' : m[1].startsWith('--phc-') ? 'phc-var' : m[1].startsWith('--fa') ? 'fa-var' : 'other-var';
  if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(authored)) return 'raw-colour';
  return /^-?[\d.]/.test(authored) ? 'raw-length' : 'keyword';
};
// What getComputedStyle would give for a declared value: font-size in px from %/em, em lengths, a flex or grid
// item's blockified display, and a zero border width under style none. `authored` stays as written.
const fontPx = el => {
  if (!el) return 16;
  const c = cascade(el); const d = c['font-size'];
  if (!d || d.inherited) return fontPx(el.parent);
  const v = px(resolveVars(d.value, c));
  if (/%$/.test(v)) return parseFloat(v) / 100 * fontPx(el.parent);
  if (/em$/.test(v)) return parseFloat(v) * fontPx(el.parent);
  return /px$/.test(v) ? parseFloat(v) : 16;
};
const UA_DISPLAY = { span: 'inline', i: 'inline', a: 'inline', b: 'inline', strong: 'inline', em: 'inline', label: 'inline', button: 'inline-block' };
const BLOCKIFY = { inline: 'block', 'inline-block': 'block', 'inline-flex': 'flex', 'inline-grid': 'grid' };
const readEl = (el, extra) => {
  const c = { ...cascade(el, extra) };
  const parentDisplay = el.parent && cascade(el.parent).display ? px(resolveVars(cascade(el.parent).display.value, cascade(el.parent))) : '';
  // A flex or grid item, or an absolutely positioned box, is blockified: its display becomes block-level.
  const blockified = c => /^(flex|inline-flex|grid|inline-grid)$/.test(parentDisplay) || (c.position && /^(absolute|fixed)$/.test(c.position.value));
  if (!c.display && blockified(c) && BLOCKIFY[UA_DISPLAY[el.tag] || 'block']) c.display = { value: UA_DISPLAY[el.tag], source: 'UA default' };
  return Object.fromEntries(PROPS.filter(p => c[p]).map(p => {
    const d = c[p];
    let resolved = px(resolveVars(d.value, c)).replace(/(-?[\d.]+)em\b/g, (_, n) => `${+n * fontPx(el)}px`);
    if (p === 'font-size') resolved = `${fontPx(el)}px`;
    if (p === 'display' && blockified(c) && BLOCKIFY[resolved]) resolved = BLOCKIFY[resolved];
    if (p === 'border-bottom-width' && c['border-bottom-style'] && /^(none|hidden)$/.test(c['border-bottom-style'].value)) resolved = '0px';
    return [p, { authored: d.value, resolved, kind: kindOf(d.value, resolved), source: d.source, selector: d.selector, inherited: !!d.inherited, ...(d.important ? { important: true } : {}) }];
  }));
};

const all = []; (function each(e) { all.push(e); e.children.forEach(each); })(html);
const pathOf = (el, root) => { const p = []; for (let e = el; e !== root; e = e.parent) p.unshift(e.parent.children.indexOf(e)); return p.join('>'); };
const states = await time('cascade', () => all.filter(e => e.attrs['data-state']).map(root => {
  const items = []; (function each(e) { items.push(e); e.children.forEach(each); })(root.children[0]);
  return {
    state: root.attrs['data-state'],
    elements: items.map(el => {
      const hover = allRules.filter(r => isHover(r) && selectorMatches(r.parsed, el));
      const base = readEl(el, []);
      const hov = hover.length ? readEl(el, hover) : null;
      const hoverDiff = hov && Object.fromEntries(Object.entries(hov).filter(([k, v]) => !base[k] || base[k].resolved !== v.resolved));
      return { path: pathOf(el, root.children[0]), tag: el.tag, classes: el.classes, text: el.text || undefined, props: base, ...(hoverDiff && Object.keys(hoverDiff).length ? { hover: hoverDiff } : {}) };
    }),
  };
}));

// ---------- 6. the axis sources: className ternaries in DrilldownItem's code ----------
const ts = loadTypescript();
const src = readFileSync(join(app, 'src/App.jsx'), 'utf8');
const sf = ts.createSourceFile('App.jsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const axes = [];
(function visit(n) {
  if (ts.isConditionalExpression(n) && ts.isStringLiteral(n.whenTrue) && ts.isStringLiteral(n.whenFalse)) {
    const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    if (line >= 41 && line <= 74) axes.push({ at: `src/App.jsx:${line}`, condition: n.condition.getText(), whenTrue: n.whenTrue.text, whenFalse: n.whenFalse.text });
  }
  ts.forEachChild(n, visit);
})(sf);

// ---------- 7. where the custom properties are declared: Carbon's themes and the :root vars ----------
const declaredOn = {};
for (const r of allRules) for (const d of r.decls) if (d.property.startsWith('--cds-background') || d.property.startsWith('--phc-')) (declaredOn[d.property] ||= new Set()).add(r.selector);
const g10 = Object.fromEntries(allRules.filter(r => r.selector === '.cds--g10').flatMap(r => r.decls).filter(d => d.property.startsWith('--cds-')).map(d => [d.property, d.value]));
const rootVars = Object.fromEntries(allRules.filter(r => r.selector === ':root' && !r.media).flatMap(r => r.decls).filter(d => d.property.startsWith('--')).map(d => [d.property, d.value]));

// ---------- 8. selectors this toy matcher cannot judge ----------
// css.mjs reads :not()/:where()/:is()/:has() as a bare pseudo name (ignored mid-selector, so the rule over-matches;
// in the last compound the rule is kept apart, never applied), and never matches sibling combinators. Count the rules
// that touch a rendered row element and use one of them: each is a match this engine guessed.
const rowEls = all.filter(e => e.attrs['data-state']).flatMap(root => { const out = []; (function each(e) { out.push(e); e.children.forEach(each); })(root.children[0]); return out; });
const FUNC = /:(not|where|is|has)\(/;
const unsure = allRules.filter(r => !r.media && (FUNC.test(r.selector) || /\s[+~]\s/.test(r.selector)) && rowEls.some(e => selectorMatches(r.parsed, e)));
const selectorRisk = { rules: unsure.length, applied: unsure.filter(r => !r.pseudo).length, keptApart: unsure.filter(r => r.pseudo).length,
  examples: [...new Set(unsure.map(r => r.selector))].slice(0, 12) };

mkdirSync(OUT, { recursive: true });
const result = { sheets: compiled.map(c => ({ sheet: c.rel, bytes: c.css.length })), rules: allRules.length, markupBytes: markup.length, axes,
  declaredOn: Object.fromEntries(Object.entries(declaredOn).map(([k, v]) => [k, [...v]])), rootVars: Object.keys(rootVars), g10, selectorRisk, states };
writeFileSync(join(OUT, 'static.json'), JSON.stringify(result, null, 1));
writeFileSync(join(OUT, 'static.timing.json'), JSON.stringify(t));
console.log(`static: ${sheets.length} sheets, ${(compiled.reduce((a, c) => a + c.css.length, 0) / 1024).toFixed(0)} KB compiled, ${allRules.length} rules; timings ms ${JSON.stringify(t)}`);
console.log(`axes: ${axes.map(a => `${a.condition} ? ${a.whenTrue} : ${a.whenFalse}`).join(' | ')}`);
if (process.env.VERBOSE) for (const s of states.slice(0, 1)) for (const e of s.elements) console.log(s.state, e.path, e.tag, e.classes.join('.'), Object.entries(e.props).filter(([, v]) => !v.inherited).map(([k, v]) => `${k}=${v.authored}${v.authored !== v.resolved ? `→${v.resolved}` : ''} [${v.source}]`).join('; ').slice(0, 900));
