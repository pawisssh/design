#!/usr/bin/env node
// Pinned Carbon sources for the foundations step (#28) and the icon atoms (#30), and the one place that fetches them.
//   node skills/adapter-carbon/scripts/sources.mjs [--dir <dir>]   fetch into .scratch/adapter-carbon/sources
//
// - Value files: raw files from the Carbon repository at the pinned commit, each checked against its sha256.
// - Check inputs: the compiled `@carbon/styles` CSS and `@carbon/layout` scss/generated, from the npm tarballs,
//   each tarball checked against its registry sha512 `integrity`. Only the named members are extracted
//   with `tar`; nothing from a package is ever run (no npm install, no lifecycle scripts).
// Downloads are untrusted data and live in gitignored scratch.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_DIR = join(REPO_ROOT, '.scratch/adapter-carbon/sources');

export const CARBON = {
  repository: 'https://github.com/carbon-design-system/carbon',
  tag: 'v11.118.0',
  commit: '44f90d8d6b24889af06cee1422ceb37f58e40bed',
  // Every file the foundations values come from (source.files of the document).
  files: {
    'packages/colors/src/dtcg/colors.json': 'af0c7d35f8a20d64332fb3e895c0522b0684b75a06d9da484ab05b21818d6674',
    'packages/layout/src/dtcg/layout.json': 'b337e0e6c8ee8be4845f0a8b2fa0320930bd2999ffbd53c83748afb12723e821',
    'packages/themes/src/dtcg/components/button.json': '56d85c6538f45449901b98da4358169c7b01a2d5b2e6f6f496ac268a1831ea36',
    'packages/themes/src/dtcg/themes.json': '7f1febe786830b88b26db78e3e573b1cfe2ca9af546ecac54708719df1330ac8',
    'packages/type/src/fontFamily.ts': '433150c88e95926de09b5f82865a1dba49476e18be7349a0792ef1d54fe9ef0a',
    'packages/type/src/fontWeight.ts': '69ab0e6a58e327013648c0ba67b9619d73f5820a33fada229170f52c832af63b',
    'packages/type/src/scale.ts': 'c379f62d305ff79158d73a28d2460512cc3232de13812a3baf3dd19f20ced070',
    'packages/type/src/styles.ts': 'c6a491d1233ad3af8cfc08681a86780f2a1a2b1865cdac5eb9375dcb556fbbdf',
  },
  // npm packages read only by the generation checks (compiled CSS, Sass fallback names).
  packages: {
    '@carbon/styles': {
      version: '1.117.0',
      integrity: 'sha512-1m/UH8aeSbDQ4PVIZ8no4QxvGhCswVV0tzMxdAaIrnRRtea6aMj6xQ3bKc1SR+F2SvpF2LJyut0Yd7hVQ4uoyQ==',
      extract: ['package/css/styles.css'],
    },
    '@carbon/layout': {
      version: '11.61.0',
      integrity: 'sha512-+j3wKiGe4XaJyub31TUhDXDL8py2cCg/ZqQ1y0BWp3/yi5IvlbH5lXhBjV/iJwpMgtbiGJuKkKBCKMgqDlf8tQ==',
      extract: ['package/scss/generated'],
    },
    // Icon atoms (#30): the SVGs To-design builds, read through the Contract's `icons.source` templates.
    '@carbon/icons': {
      version: '11.90.0',
      integrity: 'sha512-lTCB5fPb8xaaOjFmLlHv7dZsAvDmMYoxdQGtgRxLc+0uKEvad0749YcOkTcuozEgTB48ki3RaxvL63DIOXj6fw==',
      extract: ['package/package.json', 'package/svg/16', 'package/svg/32'],
    },
  },
};

/** Hex sha256 of a string or bytes. */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pkgDir = (dir, name) => join(dir, 'npm', `${name}@${CARBON.packages[name].version}`);

/** Download every pinned source into `dir`, verifying each hash. Skips files already present and valid. */
export async function fetchSources(dir = DEFAULT_DIR) {
  for (const [path, want] of Object.entries(CARBON.files)) {
    const out = join(dir, 'carbon', path);
    if (existsSync(out) && sha256(readFileSync(out)) === want) continue;
    const url = `https://raw.githubusercontent.com/carbon-design-system/carbon/${CARBON.commit}/${path}`;
    const bytes = await download(url);
    const got = sha256(bytes);
    if (got !== want) throw new Error(`${path}: sha256 ${got} does not match the pin ${want}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
  }
  for (const [name, pin] of Object.entries(CARBON.packages)) {
    const out = pkgDir(dir, name);
    if (pin.extract.every(m => existsSync(join(out, m)))) continue;
    const url = `https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-${pin.version}.tgz`;
    const bytes = await download(url);
    const got = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    if (got !== pin.integrity) throw new Error(`${name}@${pin.version}: integrity ${got} does not match the pin ${pin.integrity}`);
    // Extract into a fresh empty directory, then move it into place: a half-extracted package never looks valid.
    mkdirSync(dirname(out), { recursive: true });
    const tmp = mkdtempSync(join(dirname(out), '.extract-'));
    writeFileSync(join(tmp, 'package.tgz'), bytes);
    execFileSync('tar', ['-xzf', join(tmp, 'package.tgz'), '-C', tmp, ...pin.extract]);
    rmSync(join(tmp, 'package.tgz'));
    rmSync(out, { recursive: true, force: true });
    execFileSync('mv', [tmp, out]);
  }
  return dir;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** True when every pinned source is present in `dir` (hashes are checked by readSources). */
export function hasSources(dir = DEFAULT_DIR) {
  return Object.keys(CARBON.files).every(p => existsSync(join(dir, 'carbon', p)))
    && Object.entries(CARBON.packages).every(([name, pin]) => pin.extract.every(m => existsSync(join(pkgDir(dir, name), m))));
}

/**
 * Read the pinned sources from `dir`. Throws when one is missing or a value file's sha256 is not the pin.
 * Returns {commit, files: {path: text}, hashes: {path: hex}, css: {text, sha256}, layoutScss: {text, sha256}}.
 * `layoutScss.text` is every scss/generated file, concatenated in name order.
 */
export function readSources(dir = DEFAULT_DIR) {
  if (!hasSources(dir))
    throw new Error(`Carbon sources missing in ${dir}; run: node skills/adapter-carbon/scripts/sources.mjs`);
  const files = {};
  const hashes = {};
  for (const [path, want] of Object.entries(CARBON.files)) {
    const bytes = readFileSync(join(dir, 'carbon', path));
    hashes[path] = sha256(bytes);
    if (hashes[path] !== want) throw new Error(`${path}: sha256 ${hashes[path]} does not match the pin ${want}`);
    files[path] = bytes.toString('utf8');
  }
  const css = readFileSync(join(pkgDir(dir, '@carbon/styles'), 'package/css/styles.css'));
  const scssDir = join(pkgDir(dir, '@carbon/layout'), 'package/scss/generated');
  const scss = Buffer.concat(readdirSync(scssDir).filter(f => f.endsWith('.scss')).sort()
    .map(f => readFileSync(join(scssDir, f))));
  return {
    commit: CARBON.commit,
    files,
    hashes,
    css: { text: css.toString('utf8'), sha256: sha256(css) },
    layoutScss: { text: scss.toString('utf8'), sha256: sha256(scss) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : DEFAULT_DIR;
  fetchSources(dir).then(
    d => { readSources(d); console.log(`Carbon ${CARBON.tag} sources OK in ${d}`); },
    e => { console.error(`FAIL: ${e.message}`); process.exit(1); });
}
