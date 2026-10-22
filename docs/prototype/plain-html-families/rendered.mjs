// PROTOTYPE (#322), throwaway: the rendered way. It serves the copy over http, loads it in To-handoff's browser
// (playwright-core, system Chrome), and groups the rendered elements by computed style and structure, the way
// ADR 0015's runtime reader reads values. Class names are recorded as labels for the report and never used to group.
// It also records what the browser itself offers on top: matched CSSOM rules, forced hover and pressed states,
// fonts, network, and text that changes over time.
//   node docs/prototype/plain-html-families/rendered.mjs <page.html> [--shot out.png] [--fa-free]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { loadChromium } from '../../../skills/to-handoff/scripts/deps.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
// The computed properties a family signature compares: paint, box, radius, text.
const STYLE = ['display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'background-color', 'color',
  'border-top-width', 'border-top-color', 'border-top-left-radius', 'box-shadow', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'cursor', 'opacity'];
const FA_FREE = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';

export async function readRendered(page, { width = 390, shot = null, faFree = false, samples = [0, 600, 1500, 3000, 5000] } = {}) {
  const t0 = Date.now();
  const root = dirname(page);
  const server = await serve(root);
  const { chromium, launchOptions, name } = loadChromium();
  const browser = await chromium.launch(launchOptions);
  const timing = {};
  try {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    const network = [];
    pg.on('response', r => network.push({ url: r.url(), status: r.status() }));
    pg.on('requestfailed', r => network.push({ url: r.url(), failed: r.failure()?.errorText }));
    // Experiment only: send the Pro CDN's stylesheets to the Free CDN (a redirect, so relative font URLs resolve there).
    if (faFree) await pg.route(/site-assets\.fontawesome\.com\/.*\.css$/, route => route.fulfill({ status: 302, headers: { location: FA_FREE } }));

    const tLoad = Date.now();
    await pg.goto(`${server.url}/${basename(page)}`, { waitUntil: 'load' });
    await pg.waitForLoadState('networkidle').catch(() => {});
    timing.load = Date.now() - tLoad;

    // Text over time: every element's own text at each moment; an element whose text changes is script-driven.
    const tSamples = Date.now();
    const textSamples = [];
    for (const at of samples) {
      const wait = at - (Date.now() - tSamples);
      if (wait > 0) await pg.waitForTimeout(wait);
      textSamples.push({ at, texts: await pg.evaluate(ownTexts) });
    }
    timing.textSamples = Date.now() - tSamples;

    const tRead = Date.now();
    const elements = await pg.evaluate(readElements, STYLE);
    const fonts = await pg.evaluate(() => [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status })));
    const cssom = await pg.evaluate(readCssom);
    timing.read = Date.now() - tRead;

    // States: hover and press every element whose computed cursor is a pointer, then read what changed.
    const tStates = Date.now();
    const states = {};
    // Only the outermost pointer element with a size: a pointer cursor is inherited by the icons inside.
    const pointer = elements.filter(e => e.style.cursor === 'pointer' && e.rect.w > 0);
    for (const el of pointer.filter(e => !pointer.some(o => o !== e && e.path.startsWith(o.path + ' > ')))) {
      const loc = pg.locator(el.path);
      const before = await loc.evaluate(n => ({ bg: getComputedStyle(n).backgroundColor, transform: getComputedStyle(n).transform }));
      await loc.hover();
      await pg.waitForTimeout(250); // the 0.15s background transition
      const hover = await loc.evaluate(n => ({ bg: getComputedStyle(n).backgroundColor, transform: getComputedStyle(n).transform }));
      await pg.mouse.down();
      await pg.waitForTimeout(50);
      const pressed = await loc.evaluate(n => ({ bg: getComputedStyle(n).backgroundColor, transform: getComputedStyle(n).transform }));
      await pg.mouse.move(0, 0);
      await pg.mouse.up();
      await pg.waitForTimeout(250);
      states[el.path] = { label: el.label, default: before, hover, pressed };
    }
    timing.states = Date.now() - tStates;
    if (shot) await pg.screenshot({ path: shot, fullPage: true });

    // The same page at a device pixel ratio of 2: the resolution media rule's border.
    const ctx2 = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
    const pg2 = await ctx2.newPage();
    await pg2.goto(`${server.url}/${basename(page)}`, { waitUntil: 'load' });
    const dpr2 = await pg2.evaluate(readElements, ['border-top-width']);
    const dprDiff = dpr2.map((e, i) => ({ path: e.path, label: e.label, dpr1: elements[i]?.style['border-top-width'], dpr2: e.style['border-top-width'] }))
      .filter(d => d.dpr1 !== d.dpr2);

    const groups = group(elements, textSamples);
    timing.total = Date.now() - t0;
    return { browser: name, width, timing, network, fonts, textSamples, elements, states, dprDiff, cssom, groups };
  } finally {
    await browser.close();
    await server.close();
  }
}

// ---------- in the page ----------

function ownTexts() {
  const out = {};
  const path = el => { const p = []; for (; el && el !== document.body; el = el.parentElement) p.unshift(`${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`); return 'body > ' + p.join(' > '); };
  for (const el of document.body.querySelectorAll('*')) {
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (t || el.id) out[path(el)] = t;
  }
  return out;
}

function readElements(props) {
  const path = el => { const p = []; for (; el && el !== document.body; el = el.parentElement) p.unshift(`${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`); return 'body > ' + p.join(' > '); };
  return [...document.body.querySelectorAll('*')].filter(el => el.tagName !== 'SCRIPT').map(el => {
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, '::before');
    const r = el.getBoundingClientRect();
    return {
      path: path(el),
      tag: el.tagName.toLowerCase(),
      label: el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase(),
      depth: path(el).split('>').length - 1,
      children: [...el.children].map(c => c.tagName.toLowerCase()),
      rect: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
      style: Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)])),
      before: before.content && before.content !== 'none' ? { content: before.content, fontFamily: before.fontFamily, fontWeight: before.fontWeight } : null,
      img: el.tagName === 'IMG' ? { src: el.getAttribute('src'), natural: [el.naturalWidth, el.naturalHeight], complete: el.complete } : null,
      text: [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(),
    };
  });
}

// What the browser's CSSOM gives: per element, the authored rules that match it, with var() kept.
function readCssom() {
  const sheets = [];
  const rules = [];
  for (const s of document.styleSheets) {
    try {
      const walkRules = (list, media) => {
        for (const r of list) {
          if (r.type === 1) rules.push({ selector: r.selectorText, text: r.style.cssText, media, sheet: s.href });
          else if (r.media) walkRules(r.cssRules, r.media.mediaText);
        }
      };
      walkRules(s.cssRules, null);
      sheets.push({ href: s.href, rules: s.cssRules.length });
    } catch (e) { sheets.push({ href: s.href, blocked: e.name }); }
  }
  const STATE = /:(hover|active|focus|focus-visible)\b/g;
  const out = {};
  for (const el of document.body.querySelectorAll('*')) {
    const label = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase();
    const matched = [];
    for (const r of rules) {
      for (const sel of r.selector.split(',').map(x => x.trim())) {
        const plain = sel.replace(STATE, '');
        const state = sel !== plain ? (sel.match(STATE) || []).join('') : null;
        if (/::/.test(plain) || plain === '*') continue;
        let hit = false;
        try { hit = el.matches(plain); } catch {}
        if (hit && (!r.media || matchMedia(r.media).matches || state)) matched.push({ selector: sel, state, media: r.media, text: r.text });
      }
    }
    if (matched.length) out[label] = matched;
  }
  return { sheets, matched: out };
}

// ---------- grouping, outside the page ----------

function group(elements, textSamples) {
  const sig = e => e.tag + '|' + STYLE.map(p => e.style[p]).join('|') + '|' + e.children.join(',');
  // 1. Naive: identical computed signature.
  const naive = new Map();
  for (const e of elements) (naive.get(sig(e)) || naive.set(sig(e), []).get(sig(e))).push(e.label);
  const repeated = [...naive.values()].filter(v => v.length > 1);
  // 2. Similarity: single linkage, two elements alike when at most a quarter of the compared properties differ.
  const distance = (a, b) => (a.tag !== b.tag ? 1 : STYLE.filter(p => a.style[p] !== b.style[p]).length / STYLE.length);
  const cluster = (list, threshold) => {
    const parent = list.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (distance(list[i], list[j]) <= threshold) parent[find(i)] = find(j);
    const out = new Map();
    list.forEach((e, i) => (out.get(find(i)) || out.set(find(i), []).get(find(i))).push(e.label));
    return [...out.values()];
  };
  const similar = cluster(elements, 0.25);
  // 3. Filtered: only painted or pointer elements are candidates, then the same similarity.
  const painted = e => !/rgba\(0, 0, 0, 0\)|transparent/.test(e.style['background-color']) || parseFloat(e.style['border-top-width']) > 0
    || e.style['box-shadow'] !== 'none' || e.style.cursor === 'pointer';
  const candidates = elements.filter(e => painted(e) && e.tag !== 'i' && e.tag !== 'img');
  const filtered = cluster(candidates, 0.25);
  const loose = cluster(candidates, 0.4);
  // Script-driven text: an element whose own text differs between samples.
  const first = textSamples[0].texts;
  const changing = Object.keys(Object.assign({}, ...textSamples.map(s => s.texts)))
    .filter(p => new Set(textSamples.map(s => s.texts[p] ?? '')).size > 1)
    .map(p => ({ path: p, label: elements.find(e => e.path === p)?.label, seen: textSamples.map(s => s.texts[p] ?? '') }));
  return {
    counts: { elements: elements.length, naiveGroups: naive.size, repeatedGroups: repeated.length, similarGroups: similar.length, candidates: candidates.length, filteredGroups: filtered.length, looseGroups: loose.length },
    repeated, similar, filtered, loose, changingText: changing, firstFrameEmpty: Object.entries(first).filter(([, t]) => !t).map(([p]) => p),
  };
}

function serve(root) {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) }));
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [page, ...rest] = process.argv.slice(2);
  if (!page || !existsSync(page)) { console.error('usage: rendered.mjs <page.html> [--shot out.png] [--fa-free]'); process.exit(2); }
  const shot = rest.includes('--shot') ? rest[rest.indexOf('--shot') + 1] : null;
  console.log(JSON.stringify(await readRendered(page, { shot, faFree: rest.includes('--fa-free') }), null, 2));
}
