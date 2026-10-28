// A Prototype's feature key (#431, spec #343 the rerun rule): the name its Handoff lives under, from text alone, so
// generate and From-Prototype's check take it from one function before anything is fetched. It loads Node's own
// modules only: no parse5, no TypeScript.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, posix } from 'node:path';

// A React source file's extensions, in the order the reader tries them.
export const EXTS = ['.tsx', '.ts', '.jsx', '.js'];

export const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function packageOf(root) {
  const file = join(root, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

/**
 * featureOf(prototype) -> {name, key}. An HTML file: its <title>, else its file name. A folder: a Next app's root
 * layout `metadata.title`, any other's index.html <title>, else the package name, else the folder name.
 */
export function featureOf(prototype) {
  if (/\.html?$/i.test(prototype)) {
    const name = htmlTitle(readFileSync(prototype, 'utf8')) || basename(prototype).replace(/\.html?$/, '');
    return { name, key: kebab(name) };
  }
  const pkg = packageOf(prototype);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const text = rel => (rel && existsSync(join(prototype, rel)) ? readFileSync(join(prototype, rel), 'utf8') : '');
  const title = deps.next ? metadataTitle(text(rootLayout(prototype))) : htmlTitle(text('index.html'));
  const name = title || pkg.name || posix.basename(prototype);
  return { name, key: kebab(name) };
}

// The first <title> outside comments, scripts and styles, its entities decoded and trimmed as parse5 gives it. The
// head's comes first, so an inline SVG's later <title> never names the feature.
function htmlTitle(text) {
  const markup = text.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  const m = /<title(?=[\s/>])[^>]*>([\s\S]*?)<\/title\s*>/i.exec(markup);
  return m ? decodeEntities(m[1]).trim() : '';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, dec, hex, named) =>
  dec || hex ? String.fromCodePoint(parseInt(dec || hex, dec ? 10 : 16)) : ENTITIES[named.toLowerCase()] ?? all);

// The root layout, as the reader finds it: in app/, else src/app/.
function rootLayout(root) {
  const app = ['app', 'src/app'].find(d => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory());
  return app && EXTS.map(e => posix.join(app, 'layout' + e)).find(f => existsSync(join(root, f)));
}

// `export const metadata = {title}`: the top-level title's string, or its `default` or `absolute`, as the React
// reader's TypeScript AST gives it. A computed title, a quoted key or generateMetadata gives none.
function metadataTitle(text) {
  const t = tokens(text);
  const at = t.findIndex((k, i) => k.v === 'export' && ['const', 'let', 'var'].includes(t[i + 1]?.v) && t[i + 2]?.v === 'metadata');
  if (at < 0) return null;
  let i = at + 3;
  while (i < t.length && !punct(t[i], '=')) i++;
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
