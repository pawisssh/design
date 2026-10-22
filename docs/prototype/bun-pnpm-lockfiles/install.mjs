#!/usr/bin/env node
// PROTOTYPE (#335), point 2: can the runtime reader install the Prototype's resolved versions?
//   node docs/prototype/bun-pnpm-lockfiles/install.mjs <app> --top <top> --work <scratch dir> --way own|npm
//        [--bun <bun binary>] [--pnpm <pnpm.cjs>] [--no-overrides]
//
// --way own: the Prototype's own package manager, frozen to its lock, scripts off.
//   bun:  a copy of the app, `bun install --frozen-lockfile --ignore-scripts`.
//   pnpm: a copy of the whole workspace (the lock lists every importer), `pnpm install --frozen-lockfile --ignore-scripts
//         --filter <app>`.
// --way npm: npm, from the versions the lock resolves, in a copy of the app folder only (as runtime.mjs:54 copies it).
//   bun:  bun.lock -> package-lock.json v3 (bun's keys are npm's install paths), then `npm ci --ignore-scripts`.
//   pnpm: package.json pinned to the importer's resolved versions (catalog: resolved), every name the app's closure
//         resolves to one version pinned by `overrides` (unless --no-overrides), `npm install --package-lock-only`, then
//         `npm ci`.
//
// Then, for every way: the installed tree against the lock, the darwin-arm64 native packages a Vite + Tailwind 4 build
// loads, whether the app's tsconfig `extends` chain is in the copy, and a smoke build of a two-file page of ours (never the sample's own config or source) with the installed vite
// and @tailwindcss/vite. Every cache lives under --work. Prints a JSON report.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findLock, lockView, pnpmRef } from './lock.mjs';

const { values: o, positionals: [appArg] } = parseArgs({ allowPositionals: true, options: {
  top: { type: 'string' }, work: { type: 'string' }, way: { type: 'string' }, bun: { type: 'string' }, pnpm: { type: 'string' },
  'no-overrides': { type: 'boolean' } } });
const app = resolve(appArg), top = resolve(o.top || appArg), work = resolve(o.work);
const view = lockView(app, top);
const found = findLock(app, top);
const report = { app: basename(app), lock: view.file, kind: view.kind, way: o.way };

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const SKIP = new Set(['node_modules', '.git']);
const copyOf = (from, to) => cpSync(from, to, { recursive: true, filter: src => !SKIP.has(basename(src)) || src === from });
const env = { ...process.env, CI: '1', npm_config_cache: join(work, 'npm-cache'), npm_config_userconfig: join(work, 'npmrc'),
  npm_config_update_notifier: 'false', BUN_INSTALL: join(work, 'bun-home'), BUN_INSTALL_CACHE_DIR: join(work, 'bun-cache'),
  XDG_CACHE_HOME: join(work, 'xdg/cache'), XDG_DATA_HOME: join(work, 'xdg/data'), XDG_STATE_HOME: join(work, 'xdg/state'), XDG_CONFIG_HOME: join(work, 'xdg/config') };
writeFileSync(env.npm_config_userconfig, '');
const sh = (cmd, args, cwd) => {
  const t = Date.now();
  try { const out = execFileSync(cmd, args, { cwd, env, stdio: 'pipe', maxBuffer: 1 << 28 }).toString(); return { ok: true, seconds: Math.round((Date.now() - t) / 1000), tail: out.trim().split('\n').slice(-3) }; }
  catch (e) { return { ok: false, seconds: Math.round((Date.now() - t) / 1000), exit: e.status, tail: String(e.stderr || e.stdout).trim().split('\n').slice(-8) }; }
};

let appCopy;
if (o.way === 'own' && view.kind === 'bun') {
  appCopy = join(work, 'copy');
  copyOf(app, appCopy);
  report.install = sh(o.bun, ['install', '--frozen-lockfile', '--ignore-scripts'], appCopy);
  report.lockfilesAfter = { 'bun.lock': hash(join(appCopy, 'bun.lock')) === hash(join(app, 'bun.lock')) ? 'unchanged' : 'changed',
    ...(existsSync(join(app, 'bun.lockb')) && { 'bun.lockb': hash(join(appCopy, 'bun.lockb')) === hash(join(app, 'bun.lockb')) ? 'unchanged' : 'changed' }) };
} else if (o.way === 'own' && view.kind === 'pnpm') {
  const root = join(work, 'copy');
  copyOf(found.dir, root);
  appCopy = join(root, found.importer);
  const name = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).name;
  report.install = sh(process.execPath, [o.pnpm, 'install', '--frozen-lockfile', '--ignore-scripts', '--filter', name, '--store-dir', join(work, 'pnpm-store')], root);
  report.lockfilesAfter = { 'pnpm-lock.yaml': hash(join(root, 'pnpm-lock.yaml')) === hash(found.file) ? 'unchanged' : 'changed' };
} else if (o.way === 'npm' && view.kind === 'bun') {
  appCopy = join(work, 'copy');
  copyOf(app, appCopy);
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  const lock = toPackageLock(manifest, view.packages);
  report.converted = { packages: Object.keys(lock.packages).length - 1, optional: Object.values(lock.packages).filter(p => p.optional).length };
  writeFileSync(join(appCopy, 'package-lock.json'), JSON.stringify(lock, null, 2));
  report.install = sh('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], appCopy);
} else if (o.way === 'npm' && view.kind === 'pnpm') {
  appCopy = join(work, 'copy');
  copyOf(app, appCopy);
  const imp = view.lock.importers[view.importer];
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  for (const f of ['dependencies', 'devDependencies', 'optionalDependencies'])
    for (const n of Object.keys(manifest[f] || {})) {
      const r = pnpmRef(n, imp[f][n].version);
      if (r.link) throw new Error(`${n} is a workspace link (${r.link}): npm in the app folder alone can't install it`);
      manifest[f][n] = r.name === n ? r.version : `npm:${r.name}@${r.version}`;
    }
  if (!o['no-overrides']) {
    const versions = view.closure; // the app's own closure, not the whole workspace's lock: a name another app pins differently still gets its override
    const direct = new Set(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(f => Object.keys(manifest[f] || {})));
    manifest.overrides = Object.fromEntries(Object.entries(versions).filter(([n, v]) => v.size === 1 && !direct.has(n)).map(([n, v]) => [n, [...v][0]]).sort());
    report.overrides = Object.keys(manifest.overrides).length;
  }
  writeFileSync(join(appCopy, 'package.json'), JSON.stringify(manifest, null, 2));
  report.resolve = sh('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], appCopy);
  if (report.resolve.ok) {
    const npmLock = JSON.parse(readFileSync(join(appCopy, 'package-lock.json'), 'utf8')).packages;
    const pnpmSet = new Set(Object.keys(view.lock.packages));
    const drift = [], same = [], integrityDiffers = [];
    for (const [k, p] of Object.entries(npmLock)) {
      if (!k || p.inBundle) continue; // a bundled copy ships inside its parent's tarball: npm records no integrity for it
      const name = p.name || k.replace(/^.*node_modules\//, '');
      const id = `${name}@${p.version}`;
      if (pnpmSet.has(id)) { same.push(id); const want = view.lock.packages[id].resolution.integrity; if (want && p.integrity !== want) integrityDiffers.push(id); }
      else drift.push(`${id}${p.optional ? ' (optional)' : ''}${p.peer ? ' (peer)' : ''}`);
    }
    report.againstPnpmLock = { npmTree: same.length + drift.length, inPnpmLock: same.length, notInPnpmLock: drift.length, integrityDiffers, notInPnpmLockList: [...new Set(drift)].sort() };
    report.install = sh('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], appCopy);
  }
} else throw new Error('--way own|npm');

if (report.install && report.install.ok) {
  for (const [k, fn] of [['tree', compareTree], ['native', nativeCheck], ['tsconfigExtends', tsconfigExtends], ['smokeBuild', smokeBuild]])
    try { report[k] = fn(); } catch (e) { report[k] = { error: e.message }; }
}
console.log(JSON.stringify(report, null, 2));

// ---------- helpers ----------

function hash(file) { return existsSync(file) ? execFileSync('shasum', ['-a', '256', file]).toString().split(' ')[0] : null; }

/** bun.lock's view -> package-lock.json v3. `optional` marks a package reached only through optional edges, as npm does. */
function toPackageLock(manifest, packages) {
  const root = Object.fromEntries(['name', 'version', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].filter(k => manifest[k]).map(k => [k, manifest[k]]));
  const lookup = (from, name) => {
    for (let p = from; ; p = p.replace(/(^|\/)node_modules\/(@[^/]+\/)?[^/]+$/, '')) {
      const k = `${p ? `${p}/` : ''}node_modules/${name}`;
      if (packages[k]) return k;
      if (!p) return null;
    }
  };
  const required = new Set(), queue = [['', root]];
  while (queue.length) {
    const [at, p] = queue.shift();
    const peers = Object.keys(p.peerDependencies || {}).filter(n => !((p.peerDependenciesMeta || {})[n] || {}).optional);
    for (const n of [...Object.keys(p.dependencies || {}), ...(at ? [] : Object.keys(p.devDependencies || {})), ...peers]) {
      const k = lookup(at, n);
      if (k && !required.has(k)) { required.add(k); queue.push([k, packages[k]]); }
    }
  }
  const out = { '': root };
  for (const [k, p] of Object.entries(packages)) {
    const name = p.name || k.replace(/^.*node_modules\//, '');
    out[k] = { ...p, resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${p.version}.tgz`, ...(!required.has(k) && { optional: true }) };
  }
  return { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: out };
}

/** Every package.json under node_modules, as name@version, following pnpm's links once. */
function installedSet(dir) {
  const ids = new Set(), seen = new Set();
  const walk = nm => {
    if (!existsSync(nm)) return;
    for (const e of readdirSync(nm)) {
      if (e === '.bin' || e === '.cache' || e === '.package-lock.json' || e === '.modules.yaml') continue;
      const p = join(nm, e);
      if (e.startsWith('@')) { for (const s of readdirSync(p)) visit(join(p, s)); }
      else if (e === '.pnpm') { for (const s of readdirSync(p)) if (s !== 'node_modules' && s !== 'lock.yaml') walk(join(p, s, 'node_modules')); }
      else visit(p);
    }
  };
  const visit = p => {
    let real; try { real = realpathSync(p); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    const pj = join(real, 'package.json');
    if (existsSync(pj)) { const m = JSON.parse(readFileSync(pj, 'utf8')); if (m.name && m.version) ids.add(`${m.name}@${m.version}`); }
    walk(join(real, 'node_modules'));
  };
  walk(join(dir, 'node_modules'));
  return ids;
}

/** The installed tree against the lock: for bun, path by path; for pnpm, as name@version sets; and the app's direct deps. */
function compareTree() {
  const out = {};
  const direct = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  const directWrong = [];
  for (const f of ['dependencies', 'devDependencies']) for (const n of Object.keys(direct[f] || {})) {
    const pj = join(appCopy, 'node_modules', n, 'package.json');
    const got = existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')).version : 'missing';
    const want = (view.packages[`node_modules/${n}`] || {}).version;
    if (got !== want) directWrong.push(`${n}: installed ${got}, lock ${want}`);
  }
  out.directDeps = { count: Object.keys({ ...direct.dependencies, ...direct.devDependencies }).length, wrong: directWrong };
  if (view.kind === 'bun') {
    const wrong = [], missing = [];
    for (const [k, p] of Object.entries(view.packages)) {
      const pj = join(appCopy, k, 'package.json');
      if (!existsSync(pj)) { missing.push(k.replace(/^node_modules\//, '') + (p.os || p.cpu ? ` (${p.os || ''}/${p.cpu || ''})` : '')); continue; }
      const v = JSON.parse(readFileSync(pj, 'utf8')).version;
      if (v !== p.version) wrong.push(`${k}: ${v} != ${p.version}`);
    }
    const otherPlatform = missing.filter(m => / \(/.test(m)).length;
    out.byPath = { lockPaths: Object.keys(view.packages).length, wrongVersion: wrong, missing: missing.length, missingOtherPlatform: otherPlatform, missingElse: missing.filter(m => !/ \(/.test(m)) };
  }
  if (view.kind === 'pnpm') {
    const installed = installedSet(appCopy.includes(`${join(work, 'copy')}/`) ? join(work, 'copy') : appCopy);
    const lockIds = new Set(Object.keys(view.lock.packages));
    const extra = [...installed].filter(id => !lockIds.has(id)).sort();
    out.bySet = { installed: installed.size, notInLock: extra.length, notInLockList: extra.slice(0, 40) };
  }
  return out;
}

/** The darwin-arm64 packages a Vite + Tailwind 4 build loads, found the way Node finds them from each parent that loads them. */
function nativeCheck() {
  // Node's lookup by hand: the first node_modules/<name> walking up from `from`, through pnpm's links.
  const pkgDir = (from, name) => {
    for (let d = from; ; d = dirname(d)) {
      const p = join(d, 'node_modules', name);
      if (existsSync(join(p, 'package.json'))) return realpathSync(p);
      if (d === dirname(d)) return null;
    }
  };
  const version = d => (d ? JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version : 'MISSING');
  const vite = pkgDir(appCopy, 'vite'), twVite = pkgDir(appCopy, '@tailwindcss/vite');
  const twNode = twVite && pkgDir(twVite, '@tailwindcss/node');
  const parents = { esbuild: [vite, '@esbuild/darwin-arm64'], rollup: [vite, '@rollup/rollup-darwin-arm64'],
    lightningcss: [twNode, 'lightningcss-darwin-arm64'], '@tailwindcss/oxide': [twVite, '@tailwindcss/oxide-darwin-arm64'] };
  const out = {};
  for (const [parent, [from, native]] of Object.entries(parents)) {
    const p = from && pkgDir(from, parent);
    out[native] = `${p ? version(pkgDir(p, native)) : 'no parent'} (for ${parent}@${version(p)})`;
  }
  return out;
}

/** The app's tsconfig.json `extends` chain, as found in the copy: vite's TS transform reads it, so a missing link fails the app's own build. */
function tsconfigExtends() {
  const out = [];
  for (let file = join(appCopy, 'tsconfig.json'); existsSync(file);) {
    const jsonc = readFileSync(file, 'utf8').replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '$1').replace(/,(\s*[}\]])/g, '$1');
    const ext = JSON.parse(jsonc).extends;
    if (!ext) break;
    const next = resolve(dirname(file), ext);
    out.push(`${ext}: ${existsSync(next) ? 'in the copy' : 'MISSING from the copy'}`);
    file = next;
  }
  return out.length ? out : 'no extends';
}

/** Vite + @tailwindcss/vite, as installed, building a page of ours placed inside the copy so it resolves the copy's packages.
 *  The page has its own empty tsconfig.json, so the app's (checked above) is not read. */
function smokeBuild() {
  const dir = join(appCopy, '.smoke-335');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><div class="p-4 text-red-500">x</div><script type="module" src="./main.ts"></script></body></html>\n');
  writeFileSync(join(dir, 'tsconfig.json'), '{}\n');
  writeFileSync(join(dir, 'style.css'), '@import "tailwindcss";\n');
  writeFileSync(join(dir, 'main.ts'), 'const n: number = 1;\ndocument.body.dataset.n = String(n);\n');
  writeFileSync(join(dir, 'build.mjs'), `import { build } from 'vite';\nimport tailwind from '@tailwindcss/vite';\n` +
    `await build({ root: import.meta.dirname, configFile: false, logLevel: 'error', plugins: [tailwind()], build: { outDir: 'dist', emptyOutDir: true } });\n`);
  const r = sh(process.execPath, [join(dir, 'build.mjs')], dir);
  if (r.ok) {
    const css = readdirSync(join(dir, 'dist/assets')).find(f => f.endsWith('.css'));
    r.css = css && /\.p-4\s*\{/.test(readFileSync(join(dir, 'dist/assets', css), 'utf8')) ? 'compiled .p-4' : 'no .p-4 in the CSS';
  }
  return r;
}
