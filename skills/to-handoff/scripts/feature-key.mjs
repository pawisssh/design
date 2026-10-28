// A Prototype's feature key (spec #343, the rerun rule): the name its Handoff lives under, which To-handoff's generate
// and From-Prototype's check both take from here. Node's own modules only: no parse5, no TypeScript.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, posix } from 'node:path';

// A React source file's extensions, in the order the reader tries them.
export const EXTS = ['.tsx', '.ts', '.jsx', '.js'];

export const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function packageOf(root) {
  const file = join(root, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

/** 'react-next' or 'react-vite' for a React project folder (by its package.json), else null. */
export function reactKind(root) {
  const pkg = packageOf(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.react) return null;
  return deps.next ? 'react-next' : deps.vite ? 'react-vite' : null;
}

// A Next app's App Router folder: app/, else src/app/.
export function appDirOf(root) {
  return ['app', 'src/app'].find(d => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory()) || null;
}

/**
 * featureOf(prototype) -> {name, key}, read as text so it loads no parser that has to be fetched (#431). An HTML
 * file: its <title>, else its file name. A folder: a Next app's root layout `metadata.title`, any other's
 * index.html <title>, else the package name, else the folder name. It never refuses: which Prototypes reach a
 * Handoff is the check's gate rows' call.
 */
export function featureOf(prototype) {
  if (/\.html?$/i.test(prototype)) {
    const name = htmlTitle(readFileSync(prototype, 'utf8')) || basename(prototype).replace(/\.html?$/, '');
    return { name, key: kebab(name) };
  }
  const text = rel => (rel && existsSync(join(prototype, rel)) ? readFileSync(join(prototype, rel), 'utf8') : '');
  const app = reactKind(prototype) === 'react-next' && appDirOf(prototype);
  const layout = app && EXTS.map(e => posix.join(app, 'layout' + e)).find(f => existsSync(join(prototype, f)));
  const title = app ? metadataTitle(text(layout)) : htmlTitle(text('index.html'));
  const name = title || packageOf(prototype).name || posix.basename(prototype);
  return { name, key: kebab(name) };
}

// The first <title> outside comments and raw-text elements, CRLF as LF, its entities decoded and trimmed (#431).
// Where parse5 let the last one win, the head's now does, so an inline SVG's <title> never names the feature.
const RAW_TEXT = /<(script|style|textarea|template|noscript|iframe|xmp)\b[\s\S]*?<\/\1\s*>/gi;
function htmlTitle(text) {
  const markup = text.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?(?:--!?>|$)/g, '').replace(RAW_TEXT, '');
  const m = /<title(?=[\s/>])[^>]*>([\s\S]*?)<\/title\s*>/i.exec(markup);
  return m ? decodeEntities(m[1]).trim() : '';
}

// The named entities a title is likely to hold; any other stays as written. A code point HTML forbids is U+FFFD.
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', laquo: '\u00ab', raquo: '\u00bb', middot: '\u00b7',
  bull: '\u2022', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', times: '\u00d7', rarr: '\u2192', larr: '\u2190',
};
const codePoint = n => (n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? '\ufffd' : String.fromCodePoint(n));
const decodeEntities = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, dec, hex, named) =>
  dec || hex ? codePoint(parseInt(dec || hex, dec ? 10 : 16)) : ENTITIES[named] ?? all);

// `export const metadata = {title}` in a layout or page, from its text (#431): the top-level title's string or
// template without holes, or its `default` or `absolute`. A computed title, a quoted key or generateMetadata gives none.
export function metadataTitle(text) {
  const t = tokens(text);
  const at = t.findIndex((k, i) => k.v === 'export' && ['const', 'let', 'var'].includes(t[i + 1]?.v) && t[i + 2]?.v === 'metadata');
  if (at < 0) return null;
  let i = at + 3;
  while (i < t.length && !(punct(t[i], '=') && !punct(t[i + 1], '>'))) i++;
  const value = stringAt(t, props(t, i + 1).get('title'));
  if (typeof value === 'string' || !value) return value || null;
  const inner = [...props(t, value.object)].find(([k]) => k === 'default' || k === 'absolute');
  const v = inner && stringAt(t, inner[1]);
  return typeof v === 'string' ? v : null;
}

const punct = (k, v) => k?.type === 'punct' && k.v === v;

// JavaScript as tokens, comments and whitespace dropped: strings and plain templates with their text, names, and
// single punctuation characters. A template with a ${} hole is a `hole`, never a title.
function tokens(text) {
  const re = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(['"])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1|`((?:\\[\s\S]|[^\\`])*)`|([A-Za-z_$][\w$]*)|([\s\S])/g;
  const out = [];
  for (const m of text.matchAll(re)) {
    if (m[1]) out.push({ type: 'string', v: unescape(m[2]) });
    else if (m[3] !== undefined) out.push(m[3].includes('${') ? { type: 'hole' } : { type: 'string', v: unescape(m[3]) });
    else if (m[4]) out.push({ type: 'name', v: m[4] });
    else if (m[5]) out.push({ type: 'punct', v: m[5] });
  }
  return out;
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '', '\r': '', '\r\n': '' };
const unescape = s => s.replace(/\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|(\r\n|[\s\S]))/gi, (all, cp, u, x, c) =>
  cp || u || x ? String.fromCodePoint(parseInt(cp || u || x, 16)) : ESCAPES[c] ?? c);

// The object literal at t[i], behind any parens: Map(top-level plain name -> index of its value), first one kept.
function props(t, i) {
  const out = new Map();
  while (punct(t[i], '(')) i++;
  if (!punct(t[i], '{')) return out;
  for (let depth = 0, j = i; j < t.length; j++) {
    if (['{', '[', '('].some(p => punct(t[j], p))) depth++;
    else if (['}', ']', ')'].some(p => punct(t[j], p))) { if (--depth === 0) break; }
    else if (depth === 1 && t[j].type === 'name' && punct(t[j + 1], ':') && (punct(t[j - 1], '{') || punct(t[j - 1], ',')) && !out.has(t[j].v)) out.set(t[j].v, j + 2);
  }
  return out;
}

// The value at t[i]: a string literal alone (behind parens, `as` or `satisfies`), {object: i} for an object, else null.
function stringAt(t, i) {
  if (i === undefined) return undefined;
  let open = 0;
  while (punct(t[i + open], '(')) open++;
  const k = t[i + open];
  if (punct(k, '{')) return { object: i };
  if (k?.type !== 'string') return null;
  let j = i + open + 1;
  for (let n = 0; n < open; n++, j++) if (!punct(t[j], ')')) return null;
  return punct(t[j], ',') || punct(t[j], '}') || ['as', 'satisfies'].includes(t[j]?.v) ? k.v : null;
}
