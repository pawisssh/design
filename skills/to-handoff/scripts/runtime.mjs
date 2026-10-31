// The runtime reader (#62, #84, #113): render a scratch copy of the Prototype in a headless browser for
// computed styles, rendered sizes and a screenshot per screen x state x breakpoint. The owner's checkout is
// only ever read: the copy lives in gitignored .scratch/to-handoff/runs/ and is removed after the run.
//
//   1. Copy the Prototype root (node_modules, .git and build output left out).
//   2. Tag the copy: the HTML file through the static reader's offsets, every .tsx/.jsx through TypeScript 6.
//   3. With a package.json: `npm ci --ignore-scripts`, then build (Next: `next build --no-lint`, Vite: `vite build`,
//      else its `build` script) and serve (`next start`, `vite preview`); otherwise a static file server.
//   4. Per state and breakpoint: load the page at that width with a fake clock, run the state's steps, check the
//      state was reached, then a full-page screenshot. Computed styles are read at the widest breakpoint.
//
// Any failure of steps 1-3 or of the browser throws: the caller falls back to the static-only Handoff (#62).
// A state whose steps fail only marks its screenshots missing, with the reason.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { DEPS_DIR, loadChromium, loadTypescript } from './deps.mjs';
import { codeLibraryDir } from './react.mjs';
import { readHtml } from './reader.mjs';
import { ATTR, tagHtml, tagJsx } from './tag.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out']);
const VIEWPORT_HEIGHT = 900;
const STEP_TIMEOUT = 5000;
// The computed properties the matcher reads: the text metrics, and the paint an element sets (#284), each with
// the declared var()s that may name its token. Spacing still matches from the source declarations.
const PROPS = ['font-size', 'line-height', 'font-weight', 'letter-spacing'];
const PAINT = ['background-color', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

/**
 * run({prototype, screens, breakpoints, depsDir}) -> {screens: {<screen>: {elements, shots, custom}}, failed, cleanup}.
 * `prototype` is the HTML file (its folder is the Prototype root) or a React app folder, built once for every
 * screen. `screens` is [{screen, route, states}]: a React screen loads at its route. `states` is [{state, steps,
 * expect}], where `steps` is null for a state with no way to reach it (its `reason` says why) and `expect` lists
 * the `at`s that must be on the page once it is reached. `elements` maps an `at` to {style, rect, via, paint} for
 * the first host element that joins to it, `via` naming the join (own, fibre, ancestor or shell), and `paint`
 * mapping each PAINT longhand the element sets to {value, refs: [{ref, resolved}]}: its computed value, and each
 * declared `var()` with that custom property read on the element. `custom` is the built stylesheet's root custom
 * properties, name -> declared value, the shape of the static reader's. `shots` maps
 * state -> breakpoint -> a PNG path inside `dir` or {missing, reason}. The caller copies the PNGs it keeps and
 * calls cleanup().
 */
export async function run({ prototype, screens, breakpoints, depsDir = DEPS_DIR }) {
  const folder = !/\.html?$/i.test(prototype);
  const root = folder ? prototype : dirname(prototype);
  const runs = join(depsDir, 'runs');
  mkdirSync(runs, { recursive: true });
  const dir = mkdtempSync(join(runs, 'run-'));
  const copy = join(dir, 'copy');
  const out = join(dir, 'screens');
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  let server, browser, rel, uiDir;
  // A reason goes into the Handoff: name the copy and the server the same way on every run.
  const scrub = message => { let m = firstLine(message).split(copy).join('<copy>').split(dir).join('<run>'); if (server) m = m.split(server.url).join('<server>'); return m; };
  try {
    cpSync(root, copy, { recursive: true, filter: src => !SKIP_DIRS.has(basename(src)) || src === root });
    mkdirSync(out);
    // The HTML file is tagged at the static reader's offsets: the Prototype itself, or a Vite app's index.html.
    rel = folder ? (existsSync(join(copy, 'index.html')) ? 'index.html' : null) : relative(root, prototype).split(sep).join('/');
    if (rel) writeFileSync(join(copy, rel), tagHtml(readHtml(join(copy, rel), rel, { depsDir })));
    const ts = loadTypescript(depsDir);
    const failed = tagTree(copy, ts);
    uiDir = codeLibraryDir(copy, ts);
    server = existsSync(join(copy, 'package.json')) ? await buildAndServe(copy) : await serveStatic(copy);
    const { chromium, launchOptions } = loadChromium(depsDir);
    browser = await chromium.launch(launchOptions);
    const result = {};
    for (const { screen, route, states } of screens) result[screen] = await readScreen(screen, route, states);
    return { screens: result, failed, cleanup };
  } catch (e) {
    cleanup();
    throw new Error(scrub(e.message));
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }

  async function readScreen(screen, route, states) {
    // A Next or Vite server serves the app at each route; files are served as they are, so the HTML file by path.
    const url = server.url + (server.app ? route || '/' : '/' + rel);
    const elements = {};
    const shots = {};
    let custom = null;
    const widest = breakpoints[breakpoints.length - 1];
    for (const s of states) {
      shots[s.state] = {};
      // A fresh page per breakpoint, opened at its width: a screenshot taken after resizing a page under the fake
      // clock can show a stale frame.
      for (const b of breakpoints) {
        if (!s.steps) { shots[s.state][b.key] = { missing: true, reason: s.reason }; continue; }
        const page = await browser.newPage({ viewport: { width: b.width, height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(STEP_TIMEOUT);
        try {
          await page.clock.install();
          const response = await page.goto(url, { waitUntil: 'load' });
          if (!response.ok()) throw new Error(`GET ${url} returned ${response.status()}`);
          for (const step of s.steps) await perform(page, step);
          const absent = [];
          // A component's site leads the chain its host carries (`<use site> <component file site>`): match any link.
          for (const at of s.expect || []) if (!(await page.$(`[${ATTR}~="${at}"]`))) absent.push(at);
          if (absent.length) { shots[s.state][b.key] = { missing: true, reason: `the steps did not reach ${s.state}: ${absent.join(', ')} not on the page` }; continue; }
          const file = join(out, `${screen}.${s.state}.${b.key}.png`);
          await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
          shots[s.state][b.key] = file;
          if (b === widest) {
            const snap = await page.evaluate(snapshot, { ATTR, PROPS, PAINT, uiDir, shell: rel || '' });
            custom = custom || snap.custom;
            for (const r of snap.elements) if (!elements[r.at]) elements[r.at] = { style: r.style, rect: r.rect, via: r.via, paint: r.paint };
          }
        } catch (e) {
          shots[s.state][b.key] = { missing: true, reason: `the steps for ${s.state} failed: ${scrub(e.message)}` };
        } finally {
          await page.close();
        }
      }
    }
    return { elements, shots, custom: custom || {} };
  }
}

/** The step kinds a `reach` decision may use; perform() runs each. */
export const STEP_KINDS = ['fill', 'click', 'clock', 'expect'];

/** One step of a state's way in: {fill, value} | {click} | {clock: ms} | {expect}. */
async function perform(page, step) {
  if (step.fill !== undefined) await page.fill(step.fill, String(step.value));
  else if (step.click !== undefined) await page.click(step.click);
  else if (step.clock !== undefined) await page.clock.runFor(step.clock);
  else if (step.expect !== undefined) await page.waitForSelector(step.expect, { state: 'attached' });
  else throw new Error(`unknown step ${JSON.stringify(step)}`);
}

// In the page: every host element's `at` by #84's join, with the computed values the matcher reads.
//   1. the innermost site in its own chain outside the copied Code Library (`uiDir`);
//   2. else the first app site up the React fibre tree (memoizedProps);
//   3. else the nearest DOM ancestor with one;
//   4. else the document shell.
// An element sets a paint longhand (#284) when a built rule that matches it, or its inline style, declares it or a
// shorthand of it; `color` only where it differs from the parent's, a border side only where it draws, and an
// outline only where it is drawn. A shorthand holding a var() reads its longhands as '', so the shorthands count.
function snapshot({ ATTR, PROPS, PAINT, uiDir, shell }) {
  // The built style rules that apply at this width: @layer blocks walked, @media and @supports where they hold.
  // Rules nested in a style rule are not: a Tailwind build is flattened (no native nesting).
  const rules = [];
  const collect = list => {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) rules.push(rule);
      else if (rule instanceof CSSMediaRule) { if (matchMedia(rule.media.mediaText).matches) collect(rule.cssRules); }
      else if (rule instanceof CSSSupportsRule) { if (CSS.supports(rule.conditionText)) collect(rule.cssRules); }
      else if (rule instanceof CSSLayerBlockRule) collect(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) { try { collect(sheet.cssRules); } catch { /* a cross-origin sheet */ } }
  const custom = {};
  for (const rule of rules) {
    if (!rule.selectorText.split(',').some(s => /^(:root|html)$/.test(s.trim()))) continue;
    for (const name of rule.style) if (name.startsWith('--')) custom[name] = rule.style.getPropertyValue(name).trim();
  }
  const SHORTHANDS = { 'background-color': ['background'], color: [], 'outline-color': ['outline'] };
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const axis = side === 'top' || side === 'bottom' ? 'block' : 'inline';
    SHORTHANDS[`border-${side}-color`] = ['border-color', 'border', `border-${side}`, `border-${axis}-color`, `border-${axis}`];
  }
  const VAR = /^var\(\s*(--[\w-]+)\s*(,[\s\S]*)?\)$/;
  const drawn = (cs, prop) => {
    const edge = prop.replace(/-color$/, '');
    return cs.getPropertyValue(`${edge}-style`) !== 'none' && parseFloat(cs.getPropertyValue(`${edge}-width`)) > 0;
  };
  const paintOf = (el, cs) => {
    const sources = [...rules.filter(r => { try { return el.matches(r.selectorText); } catch { return false; } }).map(r => r.style), el.style];
    const out = {};
    for (const prop of PAINT) {
      const declared = sources.flatMap(st => [prop, ...SHORTHANDS[prop]].map(n => st.getPropertyValue(n).trim())).filter(Boolean);
      if (!declared.length) continue;
      if (prop === 'color' && el.parentElement && getComputedStyle(el.parentElement).color === cs.color) continue;
      if (prop !== 'color' && prop !== 'background-color' && !drawn(cs, prop)) continue;
      const refs = [...new Set(declared.filter(v => VAR.test(v)))].map(ref => ({ ref, resolved: cs.getPropertyValue(VAR.exec(ref)[1]).trim() }));
      out[prop] = { value: cs.getPropertyValue(prop), refs };
    }
    return out;
  };
  const app = chain => (chain ? chain.split(' ').filter(s => !s.startsWith(uiDir)).pop() : undefined);
  const fibre = el => {
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    for (let f = key && el[key]; f; f = f.return) { const p = f.memoizedProps; const a = p && typeof p === 'object' && app(p[ATTR]); if (a) return a; }
    return undefined;
  };
  const ancestor = el => { for (let a = el.parentElement; a; a = a.parentElement) { const s = app(a.getAttribute(ATTR)); if (s) return s; } return undefined; };
  const out = [];
  for (const el of [document.documentElement, ...document.documentElement.querySelectorAll('*')]) {
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD'].includes(el.tagName)) continue;
    const own = app(el.getAttribute(ATTR)), viaFibre = !own && fibre(el), viaAncestor = !own && !viaFibre && ancestor(el);
    const at = own || viaFibre || viaAncestor || shell;
    const via = own ? 'own' : viaFibre ? 'fibre' : viaAncestor ? 'ancestor' : 'shell';
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.push({ at, via, style: Object.fromEntries(PROPS.map(p => [p, cs.getPropertyValue(p)])), rect: { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 }, paint: paintOf(el, cs) });
  }
  return { custom, elements: out };
}

// Every .tsx/.jsx under the copy, tagged. A file TypeScript cannot parse stays untagged: its elements join
// through the fibre walk to its caller (#84). Returns [{file, error}] for those.
function tagTree(copy, ts) {
  const failed = [];
  const walk = d => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name) || ent.name === 'public') continue;
      const abs = join(d, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (/\.(tsx|jsx)$/.test(ent.name)) {
        const rel = relative(copy, abs).split(sep).join('/');
        try { writeFileSync(abs, tagJsx(readFileSync(abs, 'utf8'), rel, ts)); } catch (e) { failed.push({ file: rel, error: e.message }); }
      }
    }
  };
  walk(copy);
  return failed;
}

// ---------- serving ----------

function serveStatic(root) {
  return new Promise((resolveServer, reject) => {
    const server = createServer((req, res) => {
      const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(readFileSync(path));
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) }));
  });
}

/** Install, build and serve a copy with a package.json. Throws with the failing command and its last output line. */
async function buildAndServe(copy) {
  const pkg = JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const sh = (cmd, args) => {
    try { execFileSync(cmd, args, { cwd: copy, stdio: 'pipe', env: { ...process.env, CI: '1' } }); }
    catch (e) { throw new Error(`${[cmd, ...args].join(' ')} failed (exit ${e.status}): ${lastLine(String(e.stderr || '').trim() ? e.stderr : e.stdout)}`); }
  };
  sh('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  const port = await freePort();
  if (deps.next) { sh('npx', ['--no-install', 'next', 'build', '--no-lint']); return { ...(await serveCommand(copy, 'npx', ['--no-install', 'next', 'start', '-p', port, '-H', '127.0.0.1'], port)), app: true }; }
  if (deps.vite) { sh('npx', ['--no-install', 'vite', 'build']); return { ...(await serveCommand(copy, 'npx', ['--no-install', 'vite', 'preview', '--port', port, '--host', '127.0.0.1', '--strictPort'], port)), app: true }; }
  if (pkg.scripts && pkg.scripts.build) sh('npm', ['run', 'build']);
  return serveStatic(copy);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolvePort(String(port))); });
  });
}

async function serveCommand(copy, cmd, args, port) {
  const child = spawn(cmd, args, { cwd: copy, stdio: 'ignore', detached: true });
  const url = `http://127.0.0.1:${port}`;
  const close = async () => { try { process.kill(-child.pid); } catch { /* already gone */ } };
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`${cmd} ${args.join(' ')} exited ${child.exitCode} before serving`);
    try { await fetch(url); return { url, close }; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  await close();
  throw new Error(`${cmd} ${args.join(' ')} did not serve ${url} within 30 s`);
}

const firstLine = s => String(s).split('\n').find(l => l.trim()) || String(s);
const lastLine = s => String(s).split('\n').map(l => l.trim()).filter(Boolean).pop() || 'no output';
