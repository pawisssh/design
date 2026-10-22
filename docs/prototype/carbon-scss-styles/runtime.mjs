// PROTOTYPE (#312), throwaway. The runtime way, as To-handoff's runtime reader does it (ADR 0015, runtime.mjs):
// copy, tag every .jsx through TypeScript, `npm ci --ignore-scripts`, `vite build`, `vite preview`, open the page
// in Chrome and read computed styles. runtime.mjs reads text metrics only (ADR 0015's paint, spacing and radius
// are not built yet), so this reads the same PROPS as static.mjs. It also probes the CSSOM, hovers each row, and
// value-matches each computed colour against the :root custom properties.
//
//   node docs/prototype/carbon-scss-styles/runtime.mjs .scratch/carbon-scss-styles/app [label]
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, loadTypescript } from '../../../skills/to-handoff/scripts/deps.mjs';
import { ATTR, tagJsx } from '../../../skills/to-handoff/scripts/tag.mjs';
import { PROPS_LIST as PROPS } from './props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const app = resolve(process.argv[2] || '.scratch/carbon-scss-styles/app');
const label = process.argv[3] || 'runtime';
const OUT = join(HERE, 'out');
const run = join(dirname(app), `run-${label}`);
const copy = join(run, 'copy');
const t = {};
const time = async (k, f) => { const s = performance.now(); const r = await f(); t[k] = Math.round(performance.now() - s); return r; };
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: copy, stdio: 'pipe', env: { ...process.env, CI: '1' } });

rmSync(run, { recursive: true, force: true });
await time('copy', () => cpSync(app, copy, { recursive: true, filter: s => !['node_modules', '.git', 'dist', 'dist-proto'].includes(basename(s)) || s === app }));
await time('tag', () => {
  const ts = loadTypescript();
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.jsx$/.test(e.name)) writeFileSync(p, tagJsx(readFileSync(p, 'utf8'), relative(copy, p).split(sep).join('/'), ts)); } };
  walk(join(copy, 'src'));
});
await time('npmCi', () => sh('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']));
await time('build', () => sh('npx', ['--no-install', 'vite', 'build', '--config', 'proto.vite.config.js']));
const cssFiles = readdirSync(join(copy, 'dist-proto/assets')).filter(f => f.endsWith('.css'));
const builtCss = cssFiles.map(f => readFileSync(join(copy, 'dist-proto/assets', f), 'utf8')).join('\n');

const port = await new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const child = spawn('npx', ['--no-install', 'vite', 'preview', '--config', 'proto.vite.config.js', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], { cwd: copy, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-child.pid); } catch { /* gone */ } };
const url = `http://127.0.0.1:${port}/proto.html`;
let browser;
try {
  await time('serve', async () => { for (let i = 0; i < 120; i++) { try { await fetch(url); return; } catch { await new Promise(r => setTimeout(r, 250)); } } throw new Error('preview did not serve'); });
  const { chromium, launchOptions, name } = loadChromium();
  browser = await time('launch', () => chromium.launch(launchOptions));
  const page = await browser.newPage({ viewport: { width: 1584, height: 900 } });
  const requests = [];
  page.on('requestfinished', async r => { const res = await r.response(); requests.push({ host: new URL(r.url()).host, type: r.resourceType(), status: res && res.status() }); });
  page.on('requestfailed', r => requests.push({ host: new URL(r.url()).host, type: r.resourceType(), failed: r.failure() && r.failure().errorText }));
  await time('load', async () => { await page.goto(url, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready); });

  const read = () => page.evaluate(({ ATTR, PROPS }) => {
    const app = chain => (chain ? chain.split(' ').pop() : undefined);
    const fibre = el => { const key = Object.keys(el).find(k => k.startsWith('__reactFiber')); for (let f = key && el[key]; f; f = f.return) { const p = f.memoizedProps; const a = p && typeof p === 'object' && app(p[ATTR]); if (a) return a; } };
    return [...document.querySelectorAll('[data-state]')].map(root => {
      const item = root.firstElementChild;
      const els = [item, ...item.querySelectorAll('*')];
      const pathOf = el => { const p = []; for (let e = el; e !== item; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e)); return p.join('>'); };
      return { state: root.dataset.state, elements: els.map(el => {
        const own = app(el.getAttribute(ATTR)); const viaFibre = !own && fibre(el);
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        const before = getComputedStyle(el, '::before').content;
        return { path: pathOf(el), tag: el.tagName.toLowerCase(), classes: [...el.classList], at: own || viaFibre || null, via: own ? 'own' : viaFibre ? 'fibre' : null,
          props: Object.fromEntries(PROPS.map(p => [p, cs.getPropertyValue(p)])), rect: { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 },
          ...(before && before !== 'none' && before !== 'normal' ? { before } : {}) };
      }) };
    });
  }, { ATTR, PROPS });
  const base = await time('read', read);

  // Hover each row, then its memo button: transitions are 0.2s.
  const hover = {};
  await time('hover', async () => {
    for (const s of base) for (const target of ['.phc-drilldown-item', '.phc-drilldown-overflow-memo']) {
      await page.hover(`[data-state="${s.state}"] ${target}`); await page.waitForTimeout(300);
      const after = (await read()).find(x => x.state === s.state);
      const diff = after.elements.flatMap(e => { const b = s.elements.find(x => x.path === e.path); return Object.entries(e.props).filter(([k, v]) => b.props[k] !== v).map(([k, v]) => ({ path: e.path, prop: k, from: b.props[k], to: v })); });
      (hover[s.state] ||= {})[target] = diff;
    }
    // Off the list (it is 288 wide at the top left), and past Carbon's tooltip close delay.
    await page.mouse.move(1500, 880); await page.waitForTimeout(500);
  });

  // The CSSOM: which sheets can be read, whether var() survives, and the :root custom properties by value.
  const cssom = await time('cssom', () => page.evaluate(() => {
    const sheets = [...document.styleSheets].map(s => { let rules = null, error = null; try { rules = s.cssRules.length; } catch (e) { error = e.name; } return { href: s.href ? new URL(s.href).host + new URL(s.href).pathname.replace(/[^/]+$/, m => m.replace(/-[\w-]{8}\./, '-<hash>.')) : 'inline', crossorigin: s.ownerNode && s.ownerNode.getAttribute('crossorigin'), rules, error }; });
    const custom = new Map();
    const visit = list => { for (const r of list) { if (r.cssRules) visit(r.cssRules); if (r.style && /^:root$|^html$/.test(r.selectorText || '')) for (const n of r.style) if (n.startsWith('--')) custom.set(n, null); } };
    for (const s of document.styleSheets) { try { visit(s.cssRules); } catch { /* cross-origin */ } }
    const probe = document.createElement('div'); document.body.append(probe);
    const tokens = [];
    for (const n of custom.keys()) {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      probe.style.color = ''; probe.style.color = raw;
      if (probe.style.color) tokens.push({ name: n, raw, rgb: getComputedStyle(probe).color });
    }
    probe.remove();
    // Matched rules for the memo icon and the row, from every readable sheet: selectors, and whether var() survives.
    // As in #322, the owner's rule values are not committed; static.json holds the authored values as evidence.
    const matched = sel => { const el = document.querySelector(`[data-state="Ready to Report"] ${sel}`); const out = []; const v = list => { for (const r of list) { if (r instanceof CSSMediaRule) { if (matchMedia(r.conditionText).matches) v(r.cssRules); continue; } if (r.cssRules && !r.selectorText) { v(r.cssRules); continue; } if (!r.selectorText) continue; let m = false; try { m = el.matches(r.selectorText); } catch { /* unsupported */ } if (m) for (const p of ['color', 'background-color', 'background', 'padding', 'border-bottom', 'width', 'font-size']) { const val = r.style.getPropertyValue(p); if (val) out.push({ selector: r.selectorText.slice(0, 120), prop: p, keepsVar: /var\(/.test(val) }); } } }; for (const s of document.styleSheets) { try { v(s.cssRules); } catch { /* cross-origin */ } } return out; };
    return { sheets, tokens, matched: { row: matched('.phc-drilldown-item'), memo: matched('.fa-file-lines'), button: matched('.phc-drilldown-overflow-memo') } };
  }));
  await page.screenshot({ path: join(OUT, `${label}.png`), clip: { x: 0, y: 0, width: 320, height: 300 } });

  const hosts = {}; for (const r of requests) { const k = `${r.host} ${r.type}${r.failed ? ' FAILED ' + r.failed : r.status && r.status >= 400 ? ' ' + r.status : ''}`; hosts[k] = (hosts[k] || 0) + 1; }
  mkdirSync(OUT, { recursive: true });
  const builtCds = (builtCss.match(/var\(--cds-/g) || []).length;
  writeFileSync(join(OUT, `${label}.json`), JSON.stringify({ browser: name, builtCss: { files: cssFiles.length, bytes: builtCss.length, varCds: builtCds }, network: hosts, cssom: { sheets: cssom.sheets, tokenCount: cssom.tokens.length, matched: cssom.matched }, tokens: cssom.tokens, states: base, hover }, null, 1));
  writeFileSync(join(OUT, `${label}.timing.json`), JSON.stringify(t));
  console.log(`${label}: ${name}; timings ms ${JSON.stringify(t)}`);
  console.log('network', JSON.stringify(hosts));
  console.log('sheets', JSON.stringify(cssom.sheets));
  console.log(`tokens on :root ${cssom.tokens.length}; built css ${(builtCss.length / 1024).toFixed(0)} KB, var(--cds- x${builtCds}`);
} finally {
  if (browser) await browser.close();
  stop();
}
