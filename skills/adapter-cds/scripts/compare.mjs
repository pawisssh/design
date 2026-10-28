#!/usr/bin/env node
// Render comparison of a CDS Contract against its To-preview catalog page: what the real component computes, tuple by
// tuple and Theme Mode by Mode, beside the Contract resolved through the Foundations document.
//   node skills/adapter-cds/scripts/compare.mjs <contract.json> --nodes <nodes.json> [--foundations <file>] [--out <file>] [--run]
// writes compare.js next to the catalog page (default .scratch/to-preview/<family>/compare.js). With the page open in
// the browser pane (the `to-preview` launch config serves .scratch/to-preview on 8737), the agent runs
//   (await import('./compare.js')).compare()
// which returns {checked, mismatches: ['<tuple> <mode> <layer>.<field>: page <value>, Contract <value>']}.
//
// A layer's element is found by its node map entry inside its parent's element: a `cds-` entry is that static class,
// any other a Linaria literal, found by its compiled class in the family's stylesheet (a Record of literals by any of
// its members' classes). Compared, as the page computes them:
//   fill          background-color, or color on a TEXT layer; not on an <img>, whose fill is its picture;
//   opacity       opacity, 0 on a TEXT layer whose text is visibility: hidden (loading keeps the label's width);
//   stroke        outline color and width when strokeAlign is outside (the focus ring), else border width, and the
//                 border colour when the Contract strokes;
//   padding*, radius (border-top-left-radius), and a numeric width or height (the element's layout box).
// Paint on a path inside a layer (`Start glyph/Vector`), effects and text styles are not compared.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { expand, resolve, tupleKey } from '../../contract/scripts/contract.mjs';
import { convert } from '../../contract/scripts/color.mjs';
import { foundationsPathFor, readJson } from '../../contract/scripts/io.mjs';
import { valueAt } from '../../to-design/scripts/foundations-value.mjs';
import { familyTsx, literalRecords, readContractSources } from './fingerprints.mjs';
import { CDS, DEFAULT_DIR, readSources } from './sources.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A converted colour as both sides write it: "#rrggbb", "#rrggbb@<alpha>" below 1, "none" at alpha 0. */
export const colorKey = ({ hex, alpha }) => (alpha === 0 ? 'none' : alpha < 1 ? `${hex}@${Math.round(alpha * 100) / 100}` : hex);

const WEB = '@coinbase/cds-web';

/**
 * The family's compiled stylesheet in @coinbase/cds-web: its TSX `packages/web/src/<path>.tsx` compiles to
 * `esm/<path>.css` (Button's `esm/buttons/Button.css`).
 */
export function compiledCssPath(contract) {
  const tsx = familyTsx(contract, Object.keys(contract.source.files));
  if (!tsx.startsWith('packages/web/src/')) throw new Error(`${tsx} is not under packages/web/src: ${WEB} compiles no stylesheet for it`);
  return `esm/${tsx.slice('packages/web/src/'.length).replace(/\.tsx$/, '.css')}`;
}

/**
 * {literal: class} of a compiled stylesheet. In #470: a literal's name is no anchor on the page, since another
 * component can name its own literal alike (CDS defines `baseCss` in 20 files), so a literal-keyed layer is found by
 * the one class Linaria compiles it to, `<name>-<hash>` (`.checkboxCss-c198zdvk{…}`). Throws on a name with two.
 */
export function literalClasses(css) {
  const out = {};
  for (const [, cls, name] of css.matchAll(/\.(([A-Za-z_$][\w$]*)-[a-z0-9]+)(?![\w-])/g)) {
    if (out[name] && out[name] !== cls) throw new Error(`${name} has two compiled classes, ${out[name]} and ${cls}`);
    out[name] = cls;
  }
  return out;
}

/**
 * literalClasses of the family's compiled stylesheet, read from the fetched cds-web package with its hashes checked,
 * and each Record of literals in the family's TSX as its members' classes (in #478: Avatar's `borderRadiusCss`, one
 * of `circle-…`, `square-…`, `hexagon-…` per shape).
 */
export function compiledClasses(contract, dir = DEFAULT_DIR) {
  const path = `package/${compiledCssPath(contract)}`;
  const web = readSources(dir, { ...CDS, files: {}, packages: { [WEB]: CDS.packages[WEB] } }).packages[WEB];
  if (!web.members.includes(path)) throw new Error(`no ${path} in ${WEB}@${CDS.packages[WEB].version}`);
  const out = literalClasses(readFileSync(join(web.dir, path), 'utf8'));
  const tsx = readContractSources(contract, dir)[familyTsx(contract, Object.keys(contract.source.files))];
  for (const [name, members] of Object.entries(literalRecords(tsx))) {
    const missing = Object.keys(members).filter(m => !out[m]);
    if (missing.length) throw new Error(`${name}: no compiled class for ${missing.join(', ')} in ${path}`);
    out[name] = Object.keys(members).map(m => out[m]);
  }
  return out;
}

/**
 * expectations({contract, nodes, foundations, classes}) -> {collection, modes, layers, expected}: what the probe looks
 * for and what it should find. `classes` is {literal: class, or [class] for a Record}, from compiledClasses. `layers` is
 * [{name, type, parent, entry, className, drawnInParent, nth}] in anatomy order, `className` the class that finds the
 * element (the static class as written, a literal's compiled class, a Record's list of them), `nth` an ELLIPSE's index among its parent's
 * ELLIPSE children; `expected` is
 * {<tuple key>: {<mode>: {<layer>: {<field>: value} | null}}}, a colour as colorKey writes it, a length in px, and
 * null for a layer the tuple hides.
 * The modes are those of the Foundations document's one multi-mode collection (CDS's Theme: light, dark).
 */
export function expectations({ contract, nodes, foundations, classes }) {
  const multi = foundations.collections.filter(c => c.modes.length > 1);
  if (multi.length !== 1) throw new Error(`the page shows one Theme Mode at a time; the Foundations document has ${multi.length} multi-mode collections`);
  const theme = multi[0];
  const layers = [];
  const walk = (node, parent, nth) => {
    if (nodes[node.name] === undefined) throw new Error(`no node for layer "${node.name}" in the node map`);
    const entry = nodes[node.name].split(' ')[0];
    const className = entry.startsWith('cds-') ? entry : classes[entry];
    if (!className) throw new Error(`layer "${node.name}": no compiled class for ${entry}`);
    // A layer with its parent's entry has no element of its own: it is drawn inside the parent's (Button's Label in
    // Middle, Track and Arc in Spinner).
    const drawnInParent = parent !== null && entry === layers.find(l => l.name === parent).entry;
    // In #474: CDS draws one Icon and names its glyph per state (Checkbox's checkmark or minus), so a fixed-icon
    // INSTANCE (`icon:checkmark`, not the swappable `icon:default`) is that Icon's glyph of that name.
    const icon = node.type === 'INSTANCE' && /^icon:/.test(node.instanceOf || '') && !['icon:default', 'icon:preferred'].includes(node.instanceOf)
      ? node.instanceOf.slice('icon:'.length) : undefined;
    layers.push({ name: node.name, type: node.type, parent, entry, className, drawnInParent, ...(node.type === 'ELLIPSE' ? { nth } : {}), ...(icon ? { icon } : {}) });
    const kids = node.children || [];
    kids.forEach(child => walk(child, node.name, kids.filter(k => k.type === 'ELLIPSE').indexOf(child)));
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
      for (const { name, type, parent } of layers) {
        const l = layout[name] || {}, p = paint[name] || {};
        // null: the tuple hides the layer, or its parent, so the page must have no element for it.
        if (l.visible === false || out[parent] === null) { out[name] = null; continue; }
        const want = {
          fill: color(p.fill), opacity: number(p.opacity),
          paddingLeft: number(l.paddingLeft), paddingRight: number(l.paddingRight),
          paddingTop: number(l.paddingTop), paddingBottom: number(l.paddingBottom),
          radius: number(l.radius), width: number(l.width), height: number(l.height),
        };
        // An ELLIPSE is an SVG <circle>: its stroke is stroke and stroke-width, not a border. The arc's start isn't
        // compared: it is a still frame of CDS's rotation.
        if (type === 'ELLIPSE') Object.assign(want, { stroke: color(p.stroke), strokeWidth: number(l.strokeWeight), sweep: l.arc && l.arc.sweep, strokeCap: l.strokeCap });
        else if (l.strokeAlign === 'outside') Object.assign(want, { outline: color(p.stroke), outlineWidth: number(l.strokeWeight) });
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
  const hasClass = (el, className) => [].concat(className).some(c => classes(el).indexOf(c) >= 0);
  const inside = (el, test) => Array.prototype.find.call(el.querySelectorAll('*'), test);
  const hasText = el => Array.prototype.some.call(el.childNodes, n => n.nodeType === 3 && n.textContent.trim());
  const glyph = (el, name) => (el.getAttribute('data-icon-name') === name ? el : inside(el, e => e.getAttribute('data-icon-name') === name));
  const paintOf = v => (!v || v === 'none' ? 'none' : color(v));
  // in (#472): the elements of the layers beside `layer` in its parent, with everything inside them.
  const siblingElements = (layer, parent) => {
    const out = [];
    spec.layers.forEach(l => {
      if (l === layer || l.parent !== layer.parent || l.drawnInParent) return;
      Array.prototype.forEach.call(parent.querySelectorAll('*'), e => {
        if (classes(e).indexOf(l.className) >= 0) out.push(e, ...Array.prototype.slice.call(e.querySelectorAll('*')));
      });
    });
    return out;
  };
  const read = (el, type) => {
    const cs = style(el);
    // A <circle>'s box is 2r + stroke-width (its stroke inside the box), its sweep the visible share of the path
    // (pathLength, stroke-dasharray, stroke-dashoffset), and stroke-linecap: butt is the Contract's "none".
    // In #475: an unstroked circle (Radio's filled Dot) draws no stroke, so its width is 0, not the 1px default.
    if (type === 'ELLIPSE') {
      const sw = cs.stroke === 'none' ? 0 : parseFloat(cs.strokeWidth), r = parseFloat(el.getAttribute('r'));
      const length = el.getAttribute('pathLength') ? parseFloat(el.getAttribute('pathLength')) : 2 * Math.PI * r;
      const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? Math.min(parseFloat(cs.strokeDasharray), length) : length;
      return { fill: paintOf(cs.fill), stroke: paintOf(cs.stroke), strokeWidth: sw, opacity: parseFloat(cs.opacity),
        width: 2 * r + sw, height: 2 * r + sw, sweep: (dash - (parseFloat(cs.strokeDashoffset) || 0)) / length * 360,
        strokeCap: cs.strokeLinecap === 'butt' ? 'none' : cs.strokeLinecap };
    }
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
      const taken = [];
      spec.layers.forEach(layer => {
        const parent = layer.parent === null ? scope : els[layer.parent];
        // A layer drawn in its parent's element is found by type: a TEXT the element holding the text, an ELLIPSE
        // the parent's n-th <circle>. In #472: two layers can carry one entry (Tag's Start icon and End icon, both
        // nodeCss), so a layer takes the first element no other layer took; and a TEXT skips the text inside a sibling
        // layer's element (the glyph of Tag's Start icon, a font icon, is text too).
        const find = () => {
          // A fixed-icon INSTANCE is the glyph of its name inside its entry's element: the glyph carries its size and opacity.
          if (layer.icon) { const host = inside(parent, e => hasClass(e, layer.className) && glyph(e, layer.icon)); return host && glyph(host, layer.icon); }
          if (!layer.drawnInParent) return inside(parent, e => hasClass(e, layer.className) && taken.indexOf(e) < 0);
          if (layer.type === 'TEXT') {
            const skip = siblingElements(layer, parent);
            return hasText(parent) ? parent : inside(parent, e => hasText(e) && skip.indexOf(e) < 0);
          }
          if (layer.type === 'ELLIPSE') return parent.querySelectorAll('circle')[layer.nth];
        };
        const el = parent && find();
        if (el) taken.push(el);
        const want = spec.expected[key][mode][layer.name];
        if (want === null) { if (el) mismatches.push(key + ' ' + mode + ' ' + layer.name + '.visible: page true, Contract false'); return; }
        if (!el) { if (parent) mismatches.push(key + ' ' + mode + ' ' + layer.name + ': no element ' + layer.entry); return; }
        els[layer.name] = el;
        if (!want) return;
        const got = read(el, layer.type);
        // An <img>'s picture is its fill, and no computed style holds it (Avatar's Image, #478).
        Object.keys(want).filter(field => !(field === 'fill' && el.tagName === 'IMG')).forEach(field => {
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

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Why runInChrome can't run here, or '' when Chrome is at `chrome`. */
export const missingChrome = (chrome = CHROME) => (existsSync(chrome) ? '' : `no Chrome at ${chrome}: set CHROME`);

/**
 * --run (#460): opens `<dir>/index.html` in headless Chrome and resolves with what
 * `(await import('./compare.js')).compare()` returns there. dir is served on a free local port, and the page posts the
 * result back once loaded. Rejects when the page or Chrome is missing, compare() throws, or no result comes within
 * `timeout` ms. The CLI prints `checked <n>, <m> mismatches` and each mismatch, and exits 1 on any.
 */
export async function runInChrome(dir, { chrome = CHROME, timeout = 120000 } = {}) {
  if (missingChrome(chrome)) throw new Error(missingChrome(chrome));
  const page = join(dir, 'index.html');
  if (!existsSync(page)) throw new Error(`no catalog page at ${page}: run skills/to-preview/scripts/catalog.mjs`);
  const runner = `<script type="module">
addEventListener('load', async () => {
  let body;
  try { body = { result: (await import('./compare.js')).compare() }; } catch (e) { body = { error: \`compare() threw: \${e && e.stack || e}\` }; }
  fetch('/result', { method: 'POST', body: JSON.stringify(body) });
});
</script>`;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  let answer;
  const answered = new Promise(r => { answer = r; });
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (req.method === 'POST' && path === '/result') {
      let text = '';
      req.on('data', c => { text += c; });
      return req.on('end', () => { res.end(); answer(JSON.parse(text)); });
    }
    const file = join(dir, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dir) || !existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
    // The catalog page has no </body> (#460): a script after the last element still runs in the body.
    res.end(file === page ? readFileSync(file, 'utf8') + runner : readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = mkdtempSync(join(tmpdir(), 'cds-compare-chrome-'));
  // in (#476): at device pixel ratio 2, a border below 1px reads as written. At 1, Chrome snaps it to one device
  // pixel, so Switch's 0.5px thumb border would read as 1px.
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=2', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/index.html`], { stdio: 'ignore', detached: true });
  const exited = new Promise(r => { browser.on('exit', r); browser.on('error', r); });
  let timer;
  try {
    const { result, error } = await Promise.race([answered,
      exited.then(code => ({ error: `Chrome exited (${code}) before compare() answered` })),
      new Promise(r => { timer = setTimeout(() => r({ error: `no result from compare() within ${timeout} ms` }), timeout); })]);
    if (error) throw new Error(error);
    return result;
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
    // Chrome's helpers share its process group (detached), and its profile goes once they have exited (#460).
    if (browser.exitCode === null && browser.signalCode === null) { process.kill(-browser.pid); await exited; }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { values: opt, positionals: [path, ...extra] } = parseArgs({ allowPositionals: true,
      options: { nodes: { type: 'string' }, foundations: { type: 'string' }, out: { type: 'string' }, run: { type: 'boolean' } } });
    if (!path || extra.length || !opt.nodes) throw new Error('usage: compare.mjs <contract.json> --nodes <nodes.json> [--foundations <file>] [--out <file>] [--run]');
    const contract = readJson(path);
    const spec = expectations({ contract, nodes: readJson(opt.nodes), foundations: readJson(foundationsPathFor(path, opt.foundations)),
      classes: compiledClasses(contract) });
    const out = opt.out || join(REPO_ROOT, '.scratch/to-preview', contract.family.key, 'compare.js');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, compareModule(spec));
    console.log(`${out}: ${Object.keys(spec.expected).length} tuples x ${spec.modes.join(', ')}`);
    if (opt.run) {
      const { checked, mismatches } = await runInChrome(dirname(out));
      console.log(`checked ${checked}, ${mismatches.length} mismatches`);
      mismatches.forEach(m => console.log(m));
      if (mismatches.length) process.exitCode = 1;
    }
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
