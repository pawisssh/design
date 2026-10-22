// How far (a) Tailwind 3 over the config, and (b) the carry compiled by Tailwind 4 (with and without the v3 defaults
// layer), agree on one sample: the computed style of every utility the sample uses, and of every class string in its
// source, rendered in Chrome. Usage: node compare.mjs <deps3> <tools4> <sample> <out.json>
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { readConfig } from './readconfig.mjs';
import { carry } from './carry.mjs';
const [deps3, tools4, sample, outFile] = process.argv.slice(2);
const req = createRequire(join(deps3, 'package.json'));
const postcss = req('postcss'), tw3 = req('tailwindcss');
const { defaultExtractor } = req('tailwindcss/lib/lib/defaultExtractor');
const ts = createRequire(import.meta.url)(join(tools4, 'typescript@6.0.3/package/lib/typescript.js'));

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); } else if (/\.(jsx?|tsx?)$/.test(f)) files.push(p); } })(join(sample, 'src'));
if (existsSync(join(sample, 'index.html'))) files.push(join(sample, 'index.html'));
const cssPath = JSON.parse(existsSync(join(sample, 'components.json')) ? readFileSync(join(sample, 'components.json'), 'utf8') : '{"tailwind":{"css":"src/index.css"}}').tailwind.css;
const css = readFileSync(join(sample, cssPath), 'utf8');
const { config, refused } = readConfig(readdirSync(sample).filter(f => /^tailwind\.config\./.test(f)).map(f => join(sample, f))[0]);
if (refused.length) throw new Error('config not literal: ' + refused.join('; '));

// (a) Tailwind 3 over the same config, its one plugin loaded from deps3. Content is the sample's own files.
const cfg3 = { ...config, content: files.map(f => ({ raw: readFileSync(f, 'utf8'), extension: extname(f).slice(1) })),
  plugins: (config.plugins || []).map(p => req(p.plugin)) };
const cssA = (await postcss([tw3(cfg3)]).process(css, { from: join(sample, cssPath) })).css;

// Candidates for Tailwind 4: the same extractor over the same files.
const candidates = new Set();
const ctx = { tailwindConfig: { separator: ':', prefix: '' } };
for (const f of files) for (const c of defaultExtractor(ctx)(readFileSync(f, 'utf8'))) candidates.add(c);
const { compile } = await import(pathToFileURL(join(tools4, 'tailwindcss@4.3.3/package/dist/lib.mjs')).href);
const pkg = n => join(tools4, n === 'tailwindcss' ? 'tailwindcss@4.3.3' : 'tw-animate-css@1.4.0', 'package');
const loadStylesheet = async (id, base) => {
  const p = id === 'tailwindcss' ? join(pkg(id), 'index.css') : id === 'tw-animate-css' ? join(pkg(id), 'dist/tw-animate.css') : id.startsWith('tailwindcss/') ? join(pkg('tailwindcss'), id.slice(12)) : join(base, id);
  return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') };
};
const v4 = async compat => (await compile(carry({ config, css, compat, deps3 }), { base: dirname(join(sample, cssPath)), loadStylesheet, loadModule: async id => { throw new Error('module ' + id); } })).build([...candidates]);
const cssB0 = await v4(false), cssB1 = await v4(true);
const viaConfig = carry({ config: { plugins: config.plugins, darkMode: undefined }, css, compat: true, deps3 }).replace('@import "tailwindcss";', '@import "tailwindcss";\n@config "./__config__";');
const literal = { ...config, plugins: [] };
let cssB2, b2error = null;
try { cssB2 = (await compile(viaConfig, { base: dirname(join(sample, cssPath)), loadStylesheet, loadModule: async (id, base, hint) => { if (id === './__config__') return { path: join(base, id), base, module: literal }; throw new Error('module ' + id); } })).build([...candidates]); } catch (e) { b2error = e.message; cssB2 = cssB1; }

// The utilities each compiler generated, by class selector.
const generated = text => new Set([...text.matchAll(/\.((?:\\.|[\w-])+)/g)].map(m => m[1].replace(/\\(.)/g, '$1')));
const genA = generated(cssA), genB = generated(cssB1);
const tokens = [...candidates].filter(c => genA.has(c) || genB.has(c)).sort();
const onlyA = tokens.filter(t => genA.has(t) && !genB.has(t)), onlyB = tokens.filter(t => !genA.has(t) && genB.has(t));

// Class strings: string literals whose tokens are mostly utilities either side generates.
const strings = new Set();
for (const f of files.filter(f => /\.(jsx?|tsx?)$/.test(f))) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  (function visit(n) {
    if (ts.isStringLiteralLike(n)) { const ws = n.text.trim().split(/\s+/).filter(Boolean); if (ws.length >= 2 && ws.filter(w => tokens.includes(w)).length / ws.length >= 0.6) strings.add(ws.join(' ')); }
    ts.forEachChild(n, visit);
  })(sf);
}
const subjects = [...tokens.map(t => ({ kind: 'token', cls: t })), ...[...strings].map(s => ({ kind: 'string', cls: s }))];
const page = sheet => `<!doctype html><html><head><meta charset=utf-8><style>${sheet}</style></head><body><div style="width:600px">${subjects.map((s, i) => `<div id="e${i}" class="${s.cls.replace(/"/g, '&quot;')}"><span>Ab</span><span>Cd</span><input placeholder="x"></div><div id="s${i}" class="${s.cls.replace(/"/g, '&quot;')}"><div>a</div><div>b</div><div>c</div></div>`).join('')}</div></body></html>`;

const { chromium } = req('playwright-core');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const read = async sheet => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.setContent(page(sheet));
  const r = await p.evaluate(n => {
    const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const col = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#010203'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return `rgba(${d[0]},${d[1]},${d[2]},${(d[3] / 255).toFixed(2)})`; };
    const norm = v => v.replace(/(#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^()]*\)|\btransparent\b|\bcurrentcolor\b)/gi, m => col(m));
    const props = ['color','background-color','background-image','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-color','border-left-color','border-top-style','border-top-left-radius','border-bottom-right-radius','box-shadow','outline-style','outline-width','outline-color','outline-offset','padding-top','padding-left','margin-top','margin-left','width','height','min-width','max-width','min-height','font-size','line-height','font-weight','font-family','letter-spacing','text-align','text-transform','text-decoration-line','opacity','display','position','top','left','z-index','gap','row-gap','column-gap','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','align-items','justify-content','grid-template-columns','overflow-x','overflow-y','transform','translate','scale','rotate','filter','backdrop-filter','transition-property','transition-duration','transition-timing-function','animation-name','animation-duration','cursor','pointer-events','white-space','text-overflow','visibility','object-fit','aspect-ratio','inset'];
    const out = [], geos = [];
    for (let i = 0; i < n; i++) {
      const el = document.getElementById('e' + i), kids = [el, el.children[0], el.children[1], el.children[2]];
      const geo = r => { const b = r.getBoundingClientRect(); return [...r.children].map(c => { const x = c.getBoundingClientRect(); return [x.left - b.left, x.top - b.top, x.width, x.height].map(Math.round).join(','); }).concat([[b.width, b.height].map(Math.round).join(',')]).join(' '); };
      const own = el.getBoundingClientRect(), par = el.parentElement.getBoundingClientRect();
      geos.push({ e: geo(el), s: geo(document.getElementById('s' + i)), x: Math.round(own.left - par.left) });
      out.push(kids.map((k, j) => { const s = getComputedStyle(k); const o = {}; for (const p of (j ? ['margin-left','margin-top','border-left-width','border-top-width','border-top-color','color','font-size','font-family','line-height'] : props)) o[p] = norm(s.getPropertyValue(p)); if (j === 3) o['placeholder-color'] = norm(getComputedStyle(k, '::placeholder').color); return o; }));
    }
    return { out, geos };
  }, subjects.length);
  await p.close(); return r;
};
const [gA, gB0, gB1, gB2] = [await read(cssA), await read(cssB0), await read(cssB1), await read(cssB2)];
const [rA, rB0, rB1] = [gA.out, gB0.out, gB1.out];
await browser.close();
const nums = s => s.match(/-?\d*\.?\d+/g) || [];
const same = (x, y) => { if (x === y) return true; const a = nums(x), b = nums(y); return x.replace(/-?\d*\.?\d+/g, '#') === y.replace(/-?\d*\.?\d+/g, '#') && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= (Math.abs(v) > 2 ? 1.01 : 0.02)); };
const diff = (A, B) => { const d = []; A.forEach((el, j) => { for (const p of Object.keys(el)) if (!same(el[p], B[j][p])) d.push(`${['', 'child1.', 'child2.', 'input.'][j]}${p}: ${el[p]} -> ${B[j][p]}`); }); return d; };
const rB2 = gB2.out;
const report = { b2error, sample, tailwind3: req('tailwindcss/package.json').version, candidates: candidates.size, tokens: tokens.length, strings: strings.size, onlyA, onlyB, b0: {}, b1: {}, b2: {} };
for (const [key, R] of [['b0', rB0], ['b1', rB1], ['b2', rB2]]) {
  const byProp = {}, diffs = [];
  subjects.forEach((s, i) => { const d = diff(rA[i], R[i]); if (d.length) { diffs.push({ ...s, d }); for (const x of d) { const p = x.split(':')[0]; byProp[p] = (byProp[p] || 0) + 1; } } });
  report[key] = { tokensDiffer: diffs.filter(x => x.kind === 'token').length, stringsDiffer: diffs.filter(x => x.kind === 'string').length,
    byProp: Object.fromEntries(Object.entries(byProp).sort((a, b) => b[1] - a[1])), tokens: diffs.filter(x => x.kind === 'token').map(x => `${x.cls} | ${x.d.join(' ; ')}`) };
}
const layers = v => v.split(/,(?![^(]*\))/).map(x => x.trim()).filter(x => !/^rgba\(\d+,\d+,\d+,[\d.]+\) 0px 0px 0px 0px$/.test(x) && !/^rgba\(\d+,\d+,\d+,0\.00\)/.test(x)).sort().join(', ');
const repr = (line, geo) => { const [p, rest] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]; const [a, b] = rest.split(' -> ');
  if (p === 'box-shadow') return layers(a) === layers(b);
  if (p === 'transition-property') { const B = b.split(', '); return a.split(', ').every(x => B.includes(x)); }
  if (['transform', 'translate', 'rotate', 'scale', 'top', 'inset'].includes(p)) return geo.e;
  if (p === 'height' || /^(child\d|input)\.(margin|border-\w+-width)/.test(p)) return geo.s;
  if (['animation-name', 'animation-duration', 'opacity'].includes(p) && /animate-/.test(line)) return false;
  return false; };
const subjB1 = subjects.map((s, i) => ({ s, i })).filter(({ i }) => diff(rA[i], rB1[i]).length);
const visible = subjB1.map(({ s, i }) => { const g = gA.geos[i], h = gB1.geos[i]; const geo = { s: g.s === h.s, e: g.e === h.e }; const d = diff(rA[i], rB1[i]).filter(l => !repr(l, geo)).filter(l => !(/^transform: matrix/.test(l) && /animate-(spin|ping|bounce)/.test(s.cls))); return { ...s, d }; }).filter(x => x.d.length);
report.b1visible = { tokensDiffer: visible.filter(x => x.kind === 'token').length, stringsDiffer: visible.filter(x => x.kind === 'string').length, tokens: visible.filter(x => x.kind === 'token').map(x => `${x.cls} | ${x.d.join(' ; ')}`), strings: visible.filter(x => x.kind === 'string').map(x => `${x.cls} | ${x.d.join(' ; ')}`.slice(0, 300)) };
writeFileSync(outFile, JSON.stringify(report, null, 1));
writeFileSync(outFile.replace(/\.json$/, '.carried.css'), carry({ config, css, compat: true, deps3 }));
console.log(sample.split('/').pop(), 'candidates', candidates.size, 'utilities', tokens.length, 'class strings', strings.size, 'onlyA', onlyA.length, 'onlyB', onlyB.length);
console.log(' b1 visible: utilities', report.b1visible.tokensDiffer, 'class strings', report.b1visible.stringsDiffer);
if (b2error) console.log(' b2 error', b2error);
for (const k of ['b0', 'b1', 'b2']) console.log(` ${k}: utilities differ ${report[k].tokensDiffer}/${tokens.length}, class strings differ ${report[k].stringsDiffer}/${strings.size}; top props`, JSON.stringify(Object.entries(report[k].byProp).slice(0, 8)));
