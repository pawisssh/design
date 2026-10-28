#!/usr/bin/env node
// Pinned tools for the Generic Adapter (#118), and the one place that fetches them.
//   node skills/adapter-generic/scripts/sources.mjs [--dir <dir>]   fetch into .scratch/adapter-generic/tools
// The command also fetches the preview renderer's packages (preview.mjs) into .scratch/adapter-generic/preview.
//
// Each npm tarball is checked against its registry sha512 `integrity`, and only the named members are extracted
// with `tar`. No tool is installed and no lifecycle script runs. The reading tier executes only Tailwind's
// compiler (tailwind.mjs), over the consumer project's CSS. The preview renderer's packages are installed with
// `npm ci --ignore-scripts`, and the renderer runs the project's components (preview.mjs). shadcn and
// tw-animate-css are read as stylesheets only: the fixture's CSS imports them. Downloads are untrusted data and live
// in gitignored scratch.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_DIR = join(REPO_ROOT, '.scratch/adapter-generic/tools');
// The reference project: `shadcn@4.22.0 init --base radix --preset nova`, as source plus lockfile (see its NOTICE).
export const FIXTURE = join(REPO_ROOT, 'skills/adapter-generic/fixtures/radix-nova');

// `stylesheet`: the project resolves it too and its CSS may `@import` it. These are what `sources.mjs` fetches by
// default and the reference project (the fixture) resolves; for another project `tailwindcss` follows its lockfile (projectPins, #253).
export const TOOLS = {
  tailwindcss: {
    version: '4.3.3',
    stylesheet: true,
    integrity: 'sha512-gOhV3P7ufE62QDGg1zVaTgCR+EtPv92k2nIhVcVKcLmxT1sUBsQGhnZj175j+MqRt4zLF7ic+sCYjfhxMxj7YQ==',
    extract: ['package/package.json', 'package/LICENSE', 'package/index.css', 'package/preflight.css', 'package/theme.css',
      'package/utilities.css', 'package/dist'],
  },
  // Read only as a parser by the component step (source.mjs): cva calls and components from the TS AST.
  typescript: {
    version: '6.0.3',
    integrity: 'sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==',
    extract: ['package/package.json', 'package/LICENSE.txt', 'package/lib/typescript.js'],
  },
  // Stylesheets the fixture's CSS imports, at the versions its lockfile resolves.
  shadcn: {
    version: '4.22.0',
    stylesheet: true,
    integrity: 'sha512-QKR3XUnatWlgo8IbZqGHrpsxjgdsfpPSAvJvLntQqAxPEf5U2sNsjDYLAS2xmFrOkC9lpj5UpZbrh/BuHrE2CQ==',
    extract: ['package/package.json', 'package/LICENSE.md', 'package/dist/tailwind.css'],
  },
  'tw-animate-css': {
    version: '1.4.0',
    stylesheet: true,
    integrity: 'sha512-7bziOlRqH0hJx80h/3mbicLW7o8qLsH5+RaLR2t+OHM3D0JlWGODQKQ4cxbK7WlvmUxpcj6Kgu6EKqjrGFe3QQ==',
    extract: ['package/package.json', 'package/LICENSE', 'package/dist'],
  },
};

/**
 * The packages one project is read with (#253): {name: pin}, each pin {version, integrity, extract, stylesheet?}.
 * The project's components.json names its stylesheet; the rules are lockfileRules'. Throws the first rule that fails.
 */
export function projectPins(project) {
  const path = join(project, 'components.json');
  if (!existsSync(path)) throw new Error('no components.json: the Adapter reads resolved versions from it');
  const css = (JSON.parse(readFileSync(path, 'utf8')).tailwind || {}).css;
  if (!css) throw new Error('components.json names no tailwind.css');
  const { pins, failures } = lockfileRules(project, css);
  if (failures.length) throw new Error(failures[0].message);
  return pins;
}

// The folders a project's own files are never in.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out']);

/** Every file under `dir`, in byte order, skipping dot-folders, dot-files and SKIP_DIRS. */
export function* sourceFiles(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    let isDir;
    try { isDir = statSync(path).isDirectory(); } catch { continue; } // a broken symlink is no file of the project
    if (isDir) yield* sourceFiles(path);
    else yield path;
  }
}

/** The project's stylesheet that imports Tailwind (`@import "tailwindcss"`), the shallowest first, relative to it; null when none does. */
export function cssEntry(project) {
  const found = [...sourceFiles(project)].filter(f => extname(f) === '.css' && /@import\s+(?:url\(\s*)?["']tailwindcss["']/.test(readFileSync(f, 'utf8')))
    .map(f => relative(project, f)).sort((a, b) => a.split(sep).length - b.split(sep).length || (a < b ? -1 : a > b ? 1 : 0));
  return found[0] ?? null;
}

const LOCKFILES = ['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];

// The lockfiles a project has, relative to it (#432, spec #343's lockfile row): its own, and a pnpm workspace's
// `pnpm-lock.yaml` in a folder above, up to the one that holds `.git`.
function lockfilesOf(project) {
  const found = LOCKFILES.filter(f => existsSync(join(project, f)));
  for (let dir = resolve(project); !existsSync(join(dir, '.git')) && dirname(dir) !== dir;) {
    dir = dirname(dir);
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) { found.push(relative(project, join(dir, 'pnpm-lock.yaml'))); break; }
  }
  return found;
}

/**
 * The Adapter's lockfile rules, applied to one project folder by path (#432): what projectPins refuses, without a
 * components.json, so From-Prototype's gate rows call them rather than copy them (spec #343). Reads only, and
 * returns each rule that fails rather than throwing it (a `project` that is no folder still throws).
 * - `lockfile`: the Adapter reads `package-lock.json` only. `lockfiles` names the ones the project has.
 * - `tailwind-version`: `tailwindcss` is the version the lockfile resolves, with the lockfile's own `integrity`; it
 *   must be a 4.x.
 * - `tailwind-integrity`: that integrity must be a sha512, and for a version the Adapter pins, the pin's.
 * - `code-library-pins`: `shadcn` and `tw-animate-css` are present only when the project's CSS imports them, and the
 *   lockfile must then resolve the pinned version of each. `typescript` is the Adapter's pin.
 * `css` is the project's Tailwind stylesheet, relative to it (cssEntry by default); with none, no import is checked.
 * One it names that isn't there fails `tailwind-stylesheet`.
 * -> {pins (null when a rule fails), lockfiles, css, failures: [{rule, message, ...the values it names}]}, the
 * failures in the order projectPins refuses them.
 */
export function lockfileRules(project, css = cssEntry(project)) {
  const failures = [];
  const fail = (rule, message, values = {}) => failures.push({ rule, message, ...values });
  const lockfiles = lockfilesOf(project);
  let pins = null;
  const out = () => ({ pins: failures.length ? null : pins, lockfiles, css, failures });
  if (!lockfiles.includes('package-lock.json')) {
    fail('lockfile', 'no package-lock.json: the Adapter reads resolved versions from it');
    return out();
  }
  let resolved;
  try { resolved = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8'))?.packages || {}; } catch (e) {
    fail('lockfile', `package-lock.json is not JSON: ${e.message}`);
    return out();
  }
  const lock = name => resolved[`node_modules/${name}`];

  const tw = lock('tailwindcss');
  const known = TOOLS.tailwindcss;
  if (!tw) fail('tailwind-version', 'package-lock.json resolves no tailwindcss');
  else {
    const tailwind4 = /^4\./.test(tw.version);
    if (!tailwind4) fail('tailwind-version', `the project resolves tailwindcss@${tw.version}, but the Adapter compiles Tailwind 4 only`, { version: tw.version });
    if (!/^sha512-/.test(tw.integrity || ''))
      fail('tailwind-integrity', `package-lock.json gives tailwindcss@${tw.version} no sha512 integrity (${tw.integrity || 'none'}), the only one the tools step checks`, { version: tw.version, integrity: tw.integrity });
    else if (tailwind4 && tw.version === known.version && tw.integrity !== known.integrity)
      fail('tailwind-integrity', `tailwindcss@${tw.version}: the lockfile's integrity ${tw.integrity} does not match the Adapter's pin ${known.integrity}`,
        { version: tw.version, integrity: tw.integrity, pinned: known.integrity });
    pins = { typescript: TOOLS.typescript, tailwindcss: { ...known, version: tw.version, integrity: tw.integrity } };
  }

  // The packages the CSS imports, through the relative stylesheets it imports (comments aside).
  const imported = new Set();
  const scan = rel => {
    if (!existsSync(join(project, rel))) { fail('tailwind-stylesheet', `no ${rel}: the Adapter reads resolved versions from it`); return; }
    const text = readFileSync(join(project, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, id] of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
      if (!id.startsWith('.')) imported.add(id.replace(/^((?:@[^/]+\/)?[^/]+).*$/, '$1'));
      else if (existsSync(join(project, dirname(rel), id))) scan(join(dirname(rel), id));
    }
  };
  if (css) scan(css);
  for (const name of Object.keys(TOOLS).filter(n => TOOLS[n].stylesheet && n !== 'tailwindcss').sort()) {
    if (!imported.has(name)) continue;
    const got = (lock(name) || {}).version;
    if (got !== TOOLS[name].version)
      fail('code-library-pins', `the project resolves ${name}@${got}, but the Adapter pins ${name}@${TOOLS[name].version}`, { name, version: got, pinned: TOOLS[name].version });
    else if (pins) pins[name] = TOOLS[name];
  }
  return out();
}

/** The pinned packages of `pins` whose CSS the project imports, by name. */
export const stylesheets = pins => Object.keys(pins).filter(n => pins[n].stylesheet).sort();

/** Hex sha256 of a string or bytes. */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** The extracted `package/` folder of a pinned tool. */
export const toolDir = (name, dir = DEFAULT_DIR, pins = TOOLS) => join(dir, `${name}@${pins[name].version}`, 'package');

/**
 * `source.snapshotId` from a `source.files` map {path: "sha256:<hex>"}: the sha256 of the `shasum -a 256` manifest,
 * one `<hex>  <path>\n` line per file, sorted by path in byte order (the Contract's rule, as Carbon's Adapter computes it).
 */
export function snapshotId(files) {
  const manifest = Object.keys(files).sort().map(p => `${files[p].replace(/^sha256:/, '')}  ${p}\n`).join('');
  return 'sha256:' + sha256(manifest);
}

// (#253) A tool folder holds the integrity it was verified against (`.integrity`), so a lockfile that names another one for the
// same version is checked again and not trusted. A folder from before the marker is trusted for the Adapter's own pins.
const MARK = '.integrity';

/** True when `out` (a tool's `name@version` folder) holds `pin`'s members and the integrity they were verified against. */
const verified = (out, pin) => pin.extract.every(m => existsSync(join(out, m)))
  && existsSync(join(out, MARK)) && readFileSync(join(out, MARK), 'utf8') === pin.integrity;

/** True when `pin` is extracted in `dir`, and was verified against its integrity. */
function hasTool(name, pin, dir, pins) {
  const out = dirname(toolDir(name, dir, pins));
  const known = TOOLS[name] && TOOLS[name].version === pin.version && TOOLS[name].integrity === pin.integrity;
  return known ? pin.extract.every(m => existsSync(join(out, m))) : verified(out, pin);
}

/** True when every tool of `pins` (every pinned tool by default; `projectPins(project)` for a project) is extracted in `dir`. */
export function hasTools(dir = DEFAULT_DIR, pins = TOOLS) {
  return Object.entries(pins).every(([name, pin]) => hasTool(name, pin, dir, pins));
}

/** The registry tarball of `name@version`, as bytes, once its sha512 matches `integrity`. Throws, naming the package, when it does not. */
export async function downloadVerified(name, version, integrity) {
  const url = `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  if (got !== integrity) throw new Error(`${name}@${version}: integrity ${got} does not match the expected ${integrity}`);
  return bytes;
}

/**
 * Download and extract every tool of `pins` into `dir`, verifying each tarball against its pin's `integrity`: the
 * Adapter's for its own pins, the project lockfile's for the Tailwind that follows it (projectPins). Skips tools already
 * present. Nothing is installed and no script runs.
 */
export async function fetchTools(dir = DEFAULT_DIR, pins = TOOLS) {
  for (const [name, pin] of Object.entries(pins)) {
    if (hasTool(name, pin, dir, pins)) continue;
    const out = dirname(toolDir(name, dir, pins));
    const bytes = await downloadVerified(name, pin.version, pin.integrity);
    // Extracted beside its folder, then moved into place: a half-extracted tool never looks valid.
    installAtomically(out, d => verified(d, pin), tmp => {
      writeFileSync(join(tmp, 'package.tgz'), bytes);
      execFileSync('tar', ['-xzf', join(tmp, 'package.tgz'), '-C', tmp, ...pin.extract]);
      rmSync(join(tmp, 'package.tgz'));
      writeFileSync(join(tmp, MARK), pin.integrity);
    }, ['package', MARK]);
  }
  return dir;
}

/**
 * Unless `complete(dir)`, run `install` into a fresh folder beside `dir` and rename it into place, so a run at the same
 * time never sees `dir` half-installed (#219); a run that loses the race drops its copy. A `dir` already there but not
 * complete (an older lockfile) keeps its other files: only `entries` move in, one rename each, in order, so the last
 * one makes `dir` complete. To-handoff's deps.mjs keeps the same function.
 */
export function installAtomically(dir, complete, install, entries) {
  if (complete(dir)) return;
  mkdirSync(dirname(dir), { recursive: true });
  const tmp = mkdtempSync(join(dirname(dir), `.${basename(dir)}.install-`));
  const occupied = e => e.code === 'ENOTEMPTY' || e.code === 'EEXIST';
  try {
    install(tmp);
    if (!complete(tmp)) throw new Error(`the install in ${tmp} is incomplete`);
    try { renameSync(tmp, dir); return; } catch (e) { if (!occupied(e)) throw e; }
    if (complete(dir)) return;
    for (const entry of entries) {
      for (let i = 0; ; i++) {
        try { renameSync(join(tmp, entry), join(dir, entry)); break; } catch (e) { if (!occupied(e) || i === 3) throw e; }
        // Another run may have finished meanwhile: keep its install rather than move it aside.
        if (complete(dir)) return;
        try { renameSync(join(dir, entry), join(tmp, `.old-${i}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({ options: { dir: { type: 'string' } } });
  try {
    const dir = await fetchTools(values.dir || DEFAULT_DIR);
    console.log(`${Object.entries(TOOLS).map(([n, p]) => `${n}@${p.version}`).join(', ')} in ${dir}`);
    console.log('Generic Adapter tools OK');
    // The preview renderer's packages for the reference project (#123), so one fetch step readies every test. A child process:
    // preview.mjs imports this module, so importing it here would wait on itself.
    execFileSync(process.execPath, [fileURLToPath(new URL('./preview.mjs', import.meta.url))], { stdio: 'inherit' });
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
