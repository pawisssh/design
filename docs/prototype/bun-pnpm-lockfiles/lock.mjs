// PROTOTYPE (#335). Throwaway, never merged. One reader for a Prototype's lockfile, whichever package manager wrote it:
// `package-lock.json`, `bun.lock`, or a pnpm workspace's `pnpm-lock.yaml` at or above the app folder.
//
// lockView(app, top) -> {file, kind, importer, packages, catalog, notes}
//   `packages` is package-lock v3's own shape, {'node_modules/<name>': {version, integrity, dependencies, ...}}, so every
//   reader that reads `JSON.parse(package-lock.json).packages` today can read it unchanged.
//   - npm: the file's own `packages`.
//   - bun: bun's keys are already the hoisted install paths (`a`, `a/b` = a's nested b), so the map is 1:1.
//   - pnpm: a flat view of what the app sees: its importer's direct deps, then their dependencies breadth first, the
//     first version of a name winning. Enough for the Adapter's readers, which read top-level names only.
//   `catalog` lists each direct dep whose package.json says `catalog:`, with the version the lock resolves for it.
//
// No parser is fetched: bun.lock is JSON with trailing commas, and pnpm-lock.yaml is read by a small YAML subset reader.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const fail = msg => { throw new Error(msg); };
// Nearest folder first; inside one folder, package-lock.json first (a v0 export has it beside a pnpm-lock.yaml).
const LOCKS = [['package-lock.json', 'npm'], ['bun.lock', 'bun'], ['pnpm-lock.yaml', 'pnpm']];
const UNREAD = [['bun.lockb', 'bun.lockb, bun\'s binary lockfile'], ['yarn.lock', 'yarn.lock']];

/**
 * The lockfile that governs `app`: walk up from `app` to `top` (the Prototype's top folder, never past it).
 * Returns {dir, file, kind, importer} or {missing: [what was seen instead]}.
 */
export function findLock(app, top) {
  const seen = [];
  const stop = resolve(top);
  for (let dir = resolve(app); ; dir = dirname(dir)) {
    for (const [file, kind] of LOCKS)
      if (existsSync(join(dir, file))) return { dir, file: join(dir, file), kind, importer: relative(dir, resolve(app)).split(sep).join('/') };
    for (const [file, what] of UNREAD) if (existsSync(join(dir, file))) seen.push(`${what} at ${relative(resolve(app), join(dir, file)) || file}`);
    if (dir === stop || dir === dirname(dir)) return { missing: seen };
  }
}

export function lockView(app, top) {
  const found = findLock(app, top);
  if (found.missing) fail(found.missing.length ? `no lockfile the reader takes: only ${found.missing.join(', ')}` : 'this Prototype has no lockfile');
  const text = readFileSync(found.file, 'utf8');
  const rel = relative(resolve(app), found.file).split(sep).join('/');
  const view = found.kind === 'npm' ? npmView(text, found.importer) : found.kind === 'bun' ? bunView(text, found.importer, app) : pnpmView(text, found.importer);
  return { file: rel, kind: found.kind, importer: found.importer || '.', ...view };
}

// ---------- npm ----------

function npmView(text, importer) {
  if (importer) fail(`package-lock.json sits above the app (${importer}): npm workspaces are not read by this prototype`);
  return { packages: JSON.parse(text).packages || {}, catalog: [], notes: [] };
}

// ---------- bun ----------

const DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

/** bun.lock's packages key -> package names along the install path: `@a/b/c` -> ['@a/b', 'c']. */
export function bunKeyNames(key) {
  const parts = key.split('/'), names = [];
  for (let i = 0; i < parts.length; i++) names.push(parts[i].startsWith('@') ? `${parts[i]}/${parts[++i]}` : parts[i]);
  return names;
}

export function parseBunLock(text) {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
}

function bunView(text, importer, app) {
  const lock = parseBunLock(text);
  if (lock.lockfileVersion !== 1) fail(`bun.lock lockfileVersion ${lock.lockfileVersion}: this prototype reads version 1`);
  const ws = (lock.workspaces || {})[importer] || fail(`bun.lock lists no workspace "${importer}"`);
  if (importer) fail('a bun workspace app is not read by this prototype: its nested keys start with the workspace name');
  const packages = {}, notes = [];
  for (const [key, value] of Object.entries(lock.packages)) {
    const [ident, , meta = {}, integrity] = value;
    const at = ident.lastIndexOf('@');
    const name = ident.slice(0, at), spec = ident.slice(at + 1);
    const names = bunKeyNames(key);
    if (!/^\d/.test(spec)) { notes.push(`${key}: ${spec} is not a registry version`); continue; }
    const entry = { version: spec, integrity, ...(name !== names.at(-1) && { name }) };
    for (const f of [...DEP_FIELDS, 'os', 'cpu', 'bin']) if (meta[f]) entry[f] = meta[f];
    if (meta.optionalPeers) entry.peerDependenciesMeta = Object.fromEntries(meta.optionalPeers.map(n => [n, { optional: true }]));
    packages[`node_modules/${names.join('/node_modules/')}`] = entry;
  }
  // bun writes no `catalog:` for a single app; a bun workspace can, through `catalog` in bun.lock.
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  const catalog = [];
  for (const f of ['dependencies', 'devDependencies'])
    for (const [n, s] of Object.entries(manifest[f] || {})) if (String(s).startsWith('catalog:')) catalog.push({ name: n, specifier: s, version: (packages[`node_modules/${n}`] || {}).version });
  if (JSON.stringify(ws.dependencies || {}) !== JSON.stringify(manifest.dependencies || {})) notes.push('bun.lock\'s workspace dependencies differ from package.json: the lock is stale');
  return { packages, catalog, notes };
}

// ---------- pnpm ----------

/**
 * The YAML pnpm-lock.yaml uses: block maps by indentation, `key: scalar`, single- or double-quoted keys and scalars,
 * one-line flow maps and lists (`{integrity: sha512-...}`, `[darwin]`), and block lists of scalars. Scalars stay strings;
 * true/false are booleans. Throws on anything else (a multi-line scalar, a list of maps), so a lock it can't read is never read wrong.
 */
export function parseYamlSubset(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    while (stack.at(-1).indent >= indent) stack.pop();
    if (body.startsWith('- ')) {
      // A block list of scalars (bundledDependencies, transitivePeerDependencies): its key opened an empty map.
      const top = stack.at(-1);
      if (!Array.isArray(top.obj)) {
        if (!top.parent || Object.keys(top.obj).length) fail(`pnpm-lock.yaml:${i + 1}: a list item outside a list`);
        top.obj = top.parent[top.key] = [];
      }
      top.obj.push(value(body.slice(2).trim(), i));
      return;
    }
    const m = body.match(/^('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^'"][^:]*?):(?:\s+(.*))?$/) || fail(`pnpm-lock.yaml:${i + 1}: cannot read "${body}"`);
    const key = scalar(m[1]);
    if (m[2] === undefined) { const parent = stack.at(-1).obj, child = {}; parent[key] = child; stack.push({ indent, obj: child, parent, key }); }
    else stack.at(-1).obj[key] = value(m[2], i);
  });
  return root;
}

function scalar(s) {
  if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"')) return JSON.parse(s);
  return s === 'true' ? true : s === 'false' ? false : s;
}

function value(s, i) {
  if (s === '{}') return {};
  if (s === '[]') return [];
  if (s.startsWith('{') || s.startsWith('[')) {
    const inner = s.slice(1, -1), items = [];
    let depth = 0, q = null, start = 0;
    for (let j = 0; j <= inner.length; j++) {
      const c = inner[j];
      if (q) { if (c === q) q = null; continue; }
      if (c === "'" || c === '"') q = c;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      else if ((c === ',' && depth === 0) || j === inner.length) { items.push(inner.slice(start, j).trim()); start = j + 1; }
    }
    if (s.startsWith('[')) return items.filter(Boolean).map(x => value(x, i));
    return Object.fromEntries(items.filter(Boolean).map(x => {
      const m = x.match(/^('(?:[^']|'')*'|"[^"]*"|[^:]+?):\s+(.*)$/) || fail(`pnpm-lock.yaml:${i + 1}: cannot read "${x}"`);
      return [scalar(m[1]), value(m[2], i)];
    }));
  }
  if (/^[|>]/.test(s)) fail(`pnpm-lock.yaml:${i + 1}: a multi-line scalar, which this reader does not take`);
  return scalar(s);
}

/** pnpm's dependency reference -> {name, version, snapshot}: `19.1.0(react@19.1.0)`, or an alias `tsx@4.21.0`. */
export function pnpmRef(name, ref) {
  if (ref.startsWith('link:') || ref.startsWith('file:')) return { name, link: ref };
  const alias = ref.match(/^(@?[^@(]+)@(.+)$/);
  const [real, full] = alias ? [alias[1], alias[2]] : [name, ref];
  return { name: real, version: full.replace(/\(.*$/, ''), snapshot: `${real}@${full}` };
}

export const parsePnpmLock = text => parseYamlSubset(text);

function pnpmView(text, importer) {
  const lock = parsePnpmLock(text);
  if (!/^9\./.test(lock.lockfileVersion)) fail(`pnpm-lock.yaml lockfileVersion ${lock.lockfileVersion}: this prototype reads 9.x`);
  const key = importer || '.';
  const imp = (lock.importers || {})[key] || fail(`pnpm-lock.yaml at the workspace root lists no importer "${key}": the folder given is not one of its apps`);
  const packages = {}, notes = [], catalog = [], links = [], closure = {}; // closure: every version the importer reaches, by name
  const queue = [];
  const place = (name, ref) => {
    const r = pnpmRef(name, ref);
    if (r.link) { links.push(`${name} -> ${r.link}`); return; }
    (closure[r.name] ||= new Set()).add(r.version);
    const at = `node_modules/${name}`;
    if (packages[at]) { if (packages[at].version !== r.version) notes.push(`${name}: ${r.version} is also resolved, under another package (only ${packages[at].version} is in the flat view)`); return; }
    const meta = (lock.packages || {})[`${r.name}@${r.version}`] || fail(`pnpm-lock.yaml resolves ${r.name}@${r.version} but has no packages entry for it`);
    const snap = (lock.snapshots || {})[r.snapshot] || {};
    const entry = { version: r.version, integrity: (meta.resolution || {}).integrity, ...(r.name !== name && { name: r.name }) };
    for (const f of ['dependencies', 'optionalDependencies']) if (snap[f]) entry[f] = Object.fromEntries(Object.entries(snap[f]).map(([n, v]) => [n, pnpmRef(n, v).version || v]));
    for (const f of ['peerDependencies', 'peerDependenciesMeta', 'os', 'cpu', 'engines']) if (meta[f]) entry[f] = meta[f];
    packages[at] = entry;
    queue.push(snap);
  };
  const direct = { ...imp.dependencies, ...imp.devDependencies, ...imp.optionalDependencies };
  for (const [name, { specifier, version }] of Object.entries(direct)) {
    place(name, version);
    if (String(specifier).startsWith('catalog:')) {
      const book = specifier.slice('catalog:'.length) || 'default';
      const c = ((lock.catalogs || {})[book] || {})[name];
      const got = pnpmRef(name, version).version;
      catalog.push({ name, specifier, catalogRange: c && c.specifier, version: got, agrees: !!c && c.version === got });
    }
  }
  while (queue.length) {
    const snap = queue.shift();
    for (const f of ['dependencies', 'optionalDependencies']) for (const [n, v] of Object.entries(snap[f] || {})) place(n, v);
  }
  if (links.length) notes.push(`workspace links, not registry packages: ${links.join(', ')}`);
  return { packages, catalog, notes, lock, closure };
}
