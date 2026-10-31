// The static reader for a single-HTML-file Prototype (#62): parse5 gives the document and `file:line:col`;
// markup a script writes with `el.innerHTML = \`…\`` is read too, mounted under the element the script
// looked up with getElementById. Inside a template literal each `${…}` hole is masked with a same-length
// placeholder before parse5 sees it, so every offset maps straight back to the file. A hole is read as:
//   cond ? A : B          a ternary; each branch is a string, a template or an expression;
//   list.map(x => `…`)    a repeated fragment;
//   anything else         a dynamic value, kept as its expression text.
// A branch that holds markup is parsed and mounted where the hole sits, marked with its condition. This is
// a reader for templated markup, not a JavaScript parser: scripts are otherwise scanned as text.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { parseCss, parseInline } from './css.mjs';
import { loadParse5 } from './deps.mjs';

// A private-use character (U+E000) that stands in for a template hole while the HTML is parsed.
const MASK = '\uE000';

/**
 * Read one HTML file (or `text` in its place). `rel` is its path relative to the Prototype root (the `at` prefix).
 * With `linked` (#246), each local `<link rel=stylesheet href>` and `<script src>` is read too, into `rules` and
 * `scripts`: every file read gets a base offset after the one before, so `at` maps an offset back to its own
 * `file:line:col`. `files` lists the files read, {rel, base, text}; a remote, missing or outside one is left out with
 * a `notes` line.
 */
export function readHtml(path, rel, { depsDir, text = readFileSync(path, 'utf8'), linked = false } = {}) {
  const parse5 = loadParse5(depsDir);
  const files = [{ rel, base: 0, text, lines: lineStarts(text) }];
  // Every file read, each at its base: any offset indexes this, as an offset in the HTML file indexes `text`.
  let all = text;
  const at = offset => {
    const f = files.findLast(x => offset >= x.base);
    const local = offset - f.base, l = lineOf(f.lines, local);
    return `${f.rel}:${l + 1}:${local - f.lines[l] + 1}`;
  };
  const doc = parse5.parse(text, { sourceCodeLocationInfo: true });
  const out = { file: rel, text, at, rules: [], scripts: [], root: null, mounts: [], files, notes: [] };

  // A linked stylesheet or script, read into the address space once; null when it is not read, with a note why.
  const readLinked = (ref, offset, what) => {
    const skip = why => { out.notes.push({ level: 'info', text: `The ${what} \`${ref}\` (${at(offset)}) ${why}, so the static reader does not read it.` }); return null; };
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) return skip('is remote');
    let local = ref.split(/[?#]/)[0];
    try { local = decodeURI(local); } catch { /* kept as written */ }
    // A root-relative path is the Prototype folder's, as the runtime reader serves it.
    const dir = dirname(path), abs = resolve(dir, local.replace(/^\/+/, ''));
    const inside = relative(dir, abs);
    if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return skip('is outside the Prototype folder');
    if (!existsSync(abs) || !statSync(abs).isFile()) return skip('is not in the Prototype folder');
    const fileRel = posix.join(posix.dirname(rel), inside.split(sep).join('/'));
    if (files.some(f => f.rel === fileRel)) return null;
    const fileText = readFileSync(abs, 'utf8');
    const f = { rel: fileRel, base: all.length + 1, text: fileText, lines: lineStarts(fileText) };
    all += `\n${fileText}`;
    files.push(f);
    return f;
  };

  const convert = (node, parent, ctx) => {
    if (node.nodeName === '#text') {
      if (!node.value.trim()) return null;
      const loc = node.sourceCodeLocation;
      return { type: 'text', parts: [node.value], offset: ctx.base + loc.startOffset, parent };
    }
    if (!node.tagName) return null;
    const loc = node.sourceCodeLocation || {};
    const el = { type: 'element', tag: node.tagName, attrs: {}, classes: [], children: [], parent, offset: ctx.base + (loc.startOffset || 0), cond: ctx.cond || [], repeat: ctx.repeat || null, attrHoles: [] };
    for (const a of node.attrs) {
      const aloc = loc.attrs && loc.attrs[a.name];
      if (a.name.split('').every(c => c === MASK)) {
        const hole = ctx.holeAt && aloc && ctx.holeAt(aloc.startOffset);
        if (hole) el.attrHoles.push({ ...hole.analysed, offset: ctx.base + aloc.startOffset });
        continue;
      }
      el.attrs[a.name] = a.value.includes(MASK) && ctx.holesIn && aloc
        ? { parts: splitParts(a.value, ctx.holesIn(aloc.startOffset, aloc.endOffset)) } : a.value;
    }
    if (typeof el.attrs.class === 'string') el.classes = el.attrs.class.split(/\s+/).filter(Boolean);
    if (typeof el.attrs.style === 'string' && loc.attrs && loc.attrs.style) {
      const aloc = loc.attrs.style;
      const valueStart = all.indexOf(el.attrs.style, ctx.base + aloc.startOffset);
      el.inline = parseInline(el.attrs.style, valueStart >= 0 ? valueStart : ctx.base + aloc.startOffset);
    }
    if (linked && el.tag === 'link' && /(^|\s)stylesheet(\s|$)/i.test(el.attrs.rel || '') && typeof el.attrs.href === 'string' && el.attrs.href) {
      const f = readLinked(el.attrs.href, el.offset, 'stylesheet');
      if (f) out.rules.push(...parseCss(f.text, f.base));
    }
    if (el.tag === 'style') {
      const t = node.childNodes[0];
      if (t) out.rules.push(...parseCss(t.value, ctx.base + t.sourceCodeLocation.startOffset));
      return null;
    }
    if (el.tag === 'script') {
      const t = node.childNodes[0];
      if (!el.attrs.src) { if (t) out.scripts.push({ text: t.value, offset: ctx.base + t.sourceCodeLocation.startOffset }); }
      else if (linked && typeof el.attrs.src === 'string') {
        const f = readLinked(el.attrs.src, el.offset, 'script');
        if (f) out.scripts.push({ text: f.text, offset: f.base });
      }
      return null;
    }
    const kids = node.tagName === 'template' && node.content ? node.content.childNodes : node.childNodes;
    for (const c of kids) mountChild(el, c, ctx);
    return el;
  };

  // A child node; a masked text node is split around its holes, and a hole holding markup mounts its nodes here.
  const mountChild = (el, c, ctx) => {
    if (c.nodeName === '#text' && c.value.includes(MASK) && ctx.holesIn) {
      const loc = c.sourceCodeLocation;
      const holes = ctx.holesIn(loc.startOffset, loc.endOffset);
      const parts = splitParts(c.value, holes);
      let buffer = [];
      const flush = () => {
        if (buffer.some(p => typeof p !== 'string' || p.trim())) el.children.push({ type: 'text', parts: trimParts(buffer), offset: ctx.base + loc.startOffset, parent: el });
        buffer = [];
      };
      for (const p of parts) {
        if (typeof p === 'string' || !p.markup) { buffer.push(p); continue; }
        flush();
        for (const m of p.markup) {
          const sub = parseFragment(parse5, m.html, m.offset, m.holes);
          const subCtx = { base: m.offset, cond: [...(ctx.cond || []), ...m.cond], repeat: m.repeat || ctx.repeat, holeAt: sub.holeAt, holesIn: sub.holesIn };
          for (const n of sub.fragment.childNodes) mountChild(el, n, subCtx);
        }
      }
      flush();
      return;
    }
    const child = convert(c, el, ctx);
    if (child) el.children.push(child);
  };

  // The document, then each script's innerHTML templates mounted under their getElementById target.
  const html = doc.childNodes.find(n => n.tagName === 'html');
  out.root = convert(html, null, { base: 0 });
  for (const script of out.scripts) {
    for (const t of innerHtmlTemplates(script.text)) {
      const mount = findById(out.root, t.mountId) || findTag(out.root, 'body');
      if (!out.mounts.includes(mount)) out.mounts.push(mount);
      const abs = script.offset + t.start;
      const holes = t.holes.map(h => ({ start: script.offset + h.start, end: script.offset + h.end, expr: h.expr, analysed: analyse(all, script.offset + h.start + 2, script.offset + h.end - 1) }));
      const sub = parseFragment(parse5, all.slice(abs, script.offset + t.end), abs, holes);
      const ctx = { base: abs, holeAt: sub.holeAt, holesIn: sub.holesIn };
      for (const n of sub.fragment.childNodes) mountChild(mount, n, ctx);
    }
  }
  return out;

  // Parse `markup` (which starts at file offset `base`) with its holes (file offsets) masked.
  function parseFragment(p5, markup, base, holes) {
    let masked = markup;
    for (const h of holes) {
      const s = h.start - base, e = h.end - base;
      masked = masked.slice(0, s) + MASK.repeat(e - s) + masked.slice(e);
    }
    const fragment = p5.parseFragment(masked, { sourceCodeLocationInfo: true });
    const rel = h => ({ ...h, s: h.start - base, e: h.end - base });
    const local = holes.map(rel);
    return {
      fragment,
      holeAt: off => local.find(h => h.s === off),
      holesIn: (s, e) => local.filter(h => h.s >= s && h.e <= e),
    };
  }
}

/** Every element under `el` (depth first, document order), `el` included. */
export function walk(el, fn) {
  if (!el || el.type !== 'element') return;
  fn(el);
  for (const c of el.children) walk(c, fn);
}
const findById = (root, id) => { let found = null; walk(root, e => { if (!found && id && e.attrs.id === id) found = e; }); return found; };
const findTag = (root, tag) => { let found = null; walk(root, e => { if (!found && e.tag === tag) found = e; }); return found; };

// Replace each run of mask characters in a node value with its holes, in order (a run may hold several).
function splitParts(value, holes) {
  const parts = [];
  let queue = holes.slice().sort((a, b) => a.s - b.s);
  let i = 0;
  while (i < value.length) {
    const j = value.indexOf(MASK, i);
    if (j < 0) { parts.push(value.slice(i)); break; }
    if (j > i) parts.push(value.slice(i, j));
    let k = j;
    while (k < value.length && value[k] === MASK) k++;
    let len = k - j;
    while (len > 0 && queue.length) { const h = queue.shift(); len -= h.e - h.s; parts.push(h.analysed); }
    i = k;
  }
  return parts;
}

function trimParts(parts) {
  const out = parts.slice();
  if (typeof out[0] === 'string') out[0] = out[0].replace(/^\s+/, '');
  const last = out.length - 1;
  if (typeof out[last] === 'string') out[last] = out[last].replace(/\s+$/, '');
  return out.filter(p => p !== '').map(p => (typeof p === 'string' ? p.replace(/\s+/g, ' ') : p));
}

// ---------- scripts, scanned as text ----------

/** Template literals assigned with `<name>.innerHTML = \`…\``: [{start, end, holes: [{start, end, expr}], mountId}], offsets in the script. */
export function innerHtmlTemplates(src) {
  const out = [];
  const re = /(\w+)\.innerHTML\s*=\s*`/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const tpl = scanTemplate(src, open);
    const lookup = new RegExp(`(?:const|let|var)\\s+${m[1]}\\s*=\\s*document\\.getElementById\\(\\s*['"]([^'"]+)['"]\\s*\\)`).exec(src);
    out.push({ start: open + 1, end: tpl.end - 1, holes: tpl.holes, mountId: lookup ? lookup[1] : null });
    re.lastIndex = tpl.end;
  }
  return out;
}

// From a backtick at `open`: {end (after the closing backtick), holes: [{start ("${"), end (after "}"), expr}]}.
function scanTemplate(src, open) {
  const holes = [];
  let i = open + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return { end: i + 1, holes };
    if (c === '$' && src[i + 1] === '{') {
      const close = skipCode(src, i + 2, '}');
      holes.push({ start: i, end: close + 1, expr: src.slice(i + 2, close).trim() });
      i = close + 1;
      continue;
    }
    i++;
  }
  return { end: src.length, holes };
}

// Skip JavaScript from `i` to the `stop` character at depth 0 (strings, templates and comments skipped). Returns its index.
function skipCode(src, i, stop) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') { i = skipString(src, i) ; continue; }
    if (c === '`') { i = scanTemplate(src, i).end; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); if (end < 0) return src.length; i = end + 2; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0 && c === stop) return i; depth--; }
    i++;
  }
  return src.length;
}
function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) { if (src[i] === '\\') i++; else if (src[i] === q) return i + 1; }
  return i;
}

// Split JavaScript on a top-level character (outside strings, templates and brackets): [{text, start}].
function splitTopLevel(src, from, to, ch) {
  const out = [];
  let depth = 0, start = from;
  for (let i = from; i < to; i++) {
    const c = src[i];
    if (c === "'" || c === '"') { i = skipString(src, i) - 1; continue; }
    if (c === '`') { i = scanTemplate(src, i).end - 1; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === ch && !(ch === '?' && (src[i + 1] === '.' || src[i + 1] === '?' || src[i - 1] === '?'))) { out.push({ start, end: i }); start = i + 1; }
  }
  out.push({ start, end: to });
  return out;
}

/**
 * A hole's expression (file text between `${` and `}`): {expr} for a value, {ternary: {cond, then, else}} with
 * each branch {text} | {markup} | {expr}, or {markup} for a bare template. `markup` lists fragments to parse:
 * [{html, offset, holes, cond: [{expr, value}], repeat}].
 */
export function analyse(text, from, to) {
  const expr = text.slice(from, to).trim();
  const q = splitTopLevel(text, from, to, '?');
  if (q.length === 2) {
    const c = splitTopLevel(text, q[1].start, q[1].end, ':');
    if (c.length === 2) {
      const cond = text.slice(q[0].start, q[0].end).trim();
      const branch = (s, value) => branchOf(text, s.start, s.end, [{ expr: cond, value }]);
      const then = branch(c[0], true), other = branch(c[1], false);
      const markup = [...(then.markup || []), ...(other.markup || [])];
      return markup.length ? { expr, markup, ternary: { cond, then, else: other } } : { expr, ternary: { cond, then, else: other } };
    }
  }
  const b = branchOf(text, from, to, []);
  return b.markup ? { expr, markup: b.markup } : b.text !== undefined ? { expr, text: b.text } : { expr };
}

function branchOf(text, from, to, cond) {
  const raw = text.slice(from, to);
  const lead = raw.length - raw.trimStart().length;
  const body = raw.trim();
  const start = from + lead;
  if (/^(['"])[\s\S]*\1$/.test(body) && skipString(text, start) === start + body.length) {
    const value = body.slice(1, -1);
    return value.includes('<') ? { markup: [{ html: value, offset: start + 1, holes: [], cond }] } : { text: value };
  }
  const tick = text.indexOf('`', start);
  if (tick >= 0 && tick < from + raw.length) {
    const tpl = scanTemplate(text, tick);
    const holes = tpl.holes.map(h => ({ start: h.start, end: h.end, expr: h.expr, analysed: analyse(text, h.start + 2, h.end - 1) }));
    const map = /^([\w.$]+)\.map\(\s*\(?\s*(\w+)/.exec(body);
    const repeat = map ? { list: map[1], item: map[2] } : null;
    return { markup: [{ html: text.slice(tick + 1, tpl.end - 1), offset: tick + 1, holes, cond, repeat }] };
  }
  return { expr: body };
}

// ---------- line index ----------

export function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}
export function lineOf(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return lo;
}
