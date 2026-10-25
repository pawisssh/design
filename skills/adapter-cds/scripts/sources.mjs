#!/usr/bin/env node
// Pinned CDS Web sources for the CDS Adapter (#384), and the one place that fetches them.
//   node skills/adapter-cds/scripts/sources.mjs [--dir <dir>]   fetch into .scratch/adapter-cds/sources
//   node skills/adapter-cds/scripts/sources.mjs snapshot <repo path>... [--dir <dir>]
//       fetch a Contract's source files at the pinned commit and print its `source.files` and `snapshotId`
//
// - Evidence files: raw files from the coinbase/cds repository at the pinned commit, each checked against its sha256,
//   plus every file the committed CDS Contracts pin.
// - Packages: the npm tarballs of cds-web, cds-common and cds-icons, each checked against its registry sha512
//   `integrity`. Only the members the `extract` patterns name are extracted with `tar`; nothing from a package is run
//   here (no npm install, no lifecycle scripts). The Foundations step evaluates named compiled modules (ADR 0021).
// The command also installs the preview renderer's packages (preview.mjs) into .scratch/adapter-cds/preview.
// Downloads are untrusted data and live in gitignored scratch.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { download, sha256, snapshotId } from '../../adapter-carbon/scripts/sources.mjs';
import { downloadVerified, installAtomically } from '../../adapter-generic/scripts/sources.mjs';

export { sha256, snapshotId };
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_DIR = join(REPO_ROOT, '.scratch/adapter-cds/sources');
export const CONTRACTS_DIR = join(REPO_ROOT, 'design-systems/cds/contracts');
// d3-color, which getBlendedColor imports: installed from foundations/package-lock.json (#385).
export const FOUNDATIONS_DIR = join(REPO_ROOT, '.scratch/adapter-cds/foundations');
export const FOUNDATIONS_PINNED = fileURLToPath(new URL('../foundations/', import.meta.url));

export const CDS = {
  repository: 'https://github.com/coinbase/cds',
  // 9.29.0 has no git tag and its npm package no gitHead: the commit is "chore: release cds 9.29.0 (#901)" on master,
  // the one that bumped packages/web/package.json from 9.28.0 to 9.29.0 (ADR 0021).
  tag: '',
  commit: '135dc3c64218299bd26f0ce2ccdad628551d63d5',
  note: '@coinbase/cds-web 9.29.0 has no git tag; the commit is the master commit that bumped packages/web/package.json to 9.29.0.',
  // Evidence the Foundations step and the Contracts cite: the license, each package's version at the commit, the
  // TypeScript sources of the theme, its CSS variables and the interactive-state blend, how ThemeProvider builds a
  // colour scheme's theme, and where Button's foregroundMuted variant is deprecated.
  files: {
    LICENSE: '9825303622d8727cd2baa6ca8a92b4db9c417b41c06058083f47561e7b003e5a',
    'packages/common/package.json': 'ca723136b987b232f562549d7984ba56c794c730a261926723f53bce15a2d818',
    'packages/common/src/color/blendColors.ts': 'f6444b3b9c1880d3680a7f20ec2ee2ce80658f4243eb0b4c90edb680b67c25e6',
    'packages/common/src/color/getBlendedColor.ts': '5528f09cde9b3af494aa30a7897d8e115e4864c75f91b45d22170493f73ecf61',
    'packages/common/src/color/getLuminance.ts': '6cc4f3e2fda2efc3ee14cec0fe519751f1c9239f33ba328d8a1603e28c736e4b',
    'packages/common/src/tokens/button.ts': 'cfb9065030d1719e078ab634ea049eb03212a375c6009ac5b7425e8dae63f4b3',
    'packages/common/src/tokens/interactable.ts': '590f7e7a4d688cf4171256b4149b296baa66c591fd1cf587ac84027cdd2ecaf8',
    'packages/common/src/tokens/interactable.ts': '590f7e7a4d688cf4171256b4149b296baa66c591fd1cf587ac84027cdd2ecaf8',
    'packages/common/src/types/ButtonBaseProps.ts': 'f9c843f9f3eb9a8da6b03db85f7f0ec6958de8d1e2c7acf3035f8d4448a02473',
    'packages/icons/package.json': 'f63134b50859dace69cded070957b41aa55f5bd44dbc1781388e39b46d4accc2',
    'packages/web/package.json': 'ca0ecd076b55efe0aee663a5b0ac2cf296119192d4f86cfdf1181f19efb84650',
    'packages/web/src/core/createThemeCssVars.ts': '0c840566943e6fad2fcac3ac9167cc31414acf6247639c7656b1cf5b987127a6',
    'packages/web/src/core/theme.ts': 'b407e32ae791c279fc17591ec94bfd6e429d0da1a78c729cf695cc288697f97c',
    'packages/web/src/system/Interactable.tsx': 'c5088de3daa71967bfd4e957b6f8c35e823dec614a6f90aefebbd305aaf0558f',
    'packages/web/src/system/ThemeProvider.tsx': 'b6b016c03d923fa9a4fe744d2d3a4706d51efefc892eaa306755042524682e24',
    'packages/web/src/system/interactableCSSProperties.ts': 'ef8e01fb2d390d0c1678a89295fc2acc570b4719fb7a97012ac1cf40e13876a0',
    'packages/web/src/themes/defaultTheme.ts': '9dd9058ca1634d722906482b021444175f4ea858371590f04ab20b8a17924e2d',
  },
  // `extract`: tarball member patterns (memberPattern). Each must match at least one member. The compiled .js members
  // are closed under their relative imports.
  packages: {
    '@coinbase/cds-web': {
      version: '9.29.0',
      integrity: 'sha512-8HOCTpnWE47Ew6h8AzxjF1tpIzmz8iXa2HJey1yFF9XcfuDFidD297tIzackpTyiWO2ShiynP9cKF87CqgyvVA==',
      // Every compiled stylesheet: per-component, esm/styles and esm/styles/responsive. Then the themes and the
      // module that turns a theme into its CSS variables, the Foundations step's check.
      extract: ['package/package.json', 'package/esm/**/*.css', 'package/esm/themes/*.js',
        'package/esm/core/createThemeCssVars.js', 'package/esm/core/theme.js'],
    },
    '@coinbase/cds-common': {
      version: '9.29.0',
      integrity: 'sha512-nWIJCVddfWpXDGb4giOztt5xpXjiqVaNR1e8xcVnO1Hs3tEn5OuNtJ1TimUfEyXuBqFpIVOr34m+rcLFYjNkVQ==',
      // The component token maps and getBlendedColor (which imports d3-color, the one package outside these tarballs).
      extract: ['package/package.json', 'package/esm/tokens/*.js', 'package/esm/utils/convertDimensionToSize.js',
        'package/esm/motion/tokens.js', 'package/esm/motion/utils.js', 'package/esm/color/getBlendedColor.js',
        'package/esm/color/blendColors.js', 'package/esm/color/getLuminance.js'],
    },
    // The version cds-web 9.29.0 depends on (^5.26.0), and the one packages/icons/package.json has at the commit.
    '@coinbase/cds-icons': {
      version: '5.26.0',
      integrity: 'sha512-fJGcN3dP0YzBOhYYUHCxD6gjlo9MDdpZAmklOrMMmb495yYCi/WnCM4+322eEJT9ZTtZ+RSyuzU/j6ODahwXWA==',
      extract: ['package/package.json', 'package/esm/svgs/*.svg'],
    },
  },
};

/** The folder a package's members are extracted into: `<dir>/npm/<name>@<version>/package/...`. */
export const packageDir = (dir, name, pin = CDS) => join(dir, 'npm', `${name}@${pin.packages[name].version}`);

// Written last into a package's folder: the pin it was extracted from and the sha256 of each member.
const MANIFEST = '.extracted.json';

// A tarball member pattern as a RegExp: `*` matches within one path segment, and `**/` any number of folders.
const memberPattern = pattern => new RegExp(`^${pattern.split('**/').map(p => p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('(?:[^/]+/)*')}$`);

const rawUrl = (pin, path) => `https://raw.githubusercontent.com/coinbase/cds/${pin.commit}/${path}`;

/** The extraction manifest {integrity, extract, members: {path: hex}} in `out`, or null when it is not `pkg`'s or a member changed. */
function intactManifest(out, pkg) {
  let m;
  try { m = JSON.parse(readFileSync(join(out, MANIFEST), 'utf8')); } catch { return null; }
  if (m.integrity !== pkg.integrity || JSON.stringify(m.extract) !== JSON.stringify(pkg.extract)) return null;
  const changed = Object.entries(m.members).some(([p, h]) => !existsSync(join(out, p)) || sha256(readFileSync(join(out, p))) !== h);
  return changed ? null : m;
}

/**
 * Download every pinned source into `dir`, verifying each sha256 and integrity; a file or package already present
 * and intact is not downloaded again. `pin` and `contracts` (the folder of Contracts whose files are fetched too) are
 * for tests: a test's pin reads no committed Contract, since those are at the Adapter's commit, not the test's.
 */
export async function fetchSources(dir = DEFAULT_DIR, { pin = CDS, contracts = pin === CDS ? CONTRACTS_DIR : null } = {}) {
  for (const [path, hash] of pinnedFiles(pin, contracts)) {
    const out = join(dir, 'cds', path);
    if (existsSync(out) && sha256(readFileSync(out)) === hash) continue;
    const bytes = await download(rawUrl(pin, path));
    const got = sha256(bytes);
    if (got !== hash) throw new Error(`${path}: sha256 ${got} does not match the pin ${hash}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
  }
  for (const [name, pkg] of Object.entries(pin.packages)) {
    const out = packageDir(dir, name, pin);
    if (intactManifest(out, pkg)) continue;
    const bytes = await downloadVerified(name, pkg.version, pkg.integrity);
    // tar lists and extracts the members the patterns match, and nothing else; no member is run. The manifest moves
    // into place last, so a half-extracted package never looks intact.
    installAtomically(out, d => intactManifest(d, pkg), tmp => {
      const tgz = join(tmp, '.package.tgz');
      writeFileSync(tgz, bytes);
      const listed = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(m => m && !m.endsWith('/'));
      const members = new Set();
      for (const pattern of pkg.extract) {
        const re = memberPattern(pattern);
        const hits = listed.filter(m => re.test(m));
        if (!hits.length) throw new Error(`${name}@${pkg.version}: no tarball member matches the extract pattern ${pattern}`);
        hits.forEach(m => members.add(m));
      }
      const sorted = [...members].sort();
      // bsdtar reads -T from a file only, not stdin.
      writeFileSync(join(tmp, '.members'), sorted.join('\n') + '\n');
      execFileSync('tar', ['-xzf', tgz, '-C', tmp, '-T', join(tmp, '.members')]);
      rmSync(tgz);
      rmSync(join(tmp, '.members'));
      const hashes = Object.fromEntries(sorted.map(m => [m, sha256(readFileSync(join(tmp, m)))]));
      writeFileSync(join(tmp, MANIFEST), JSON.stringify({ integrity: pkg.integrity, extract: pkg.extract, members: hashes }, null, 2) + '\n');
    }, ['package', MANIFEST]);
  }
  return dir;
}

/**
 * [path, hex sha256] of every raw file to fetch: the evidence files, plus every source file the committed CDS
 * Contracts pin (none until the Button Contract, #387). Every Contract must be at the pinned commit.
 */
function pinnedFiles(pin, contracts) {
  const pins = new Map(Object.entries(pin.files));
  if (!contracts || !existsSync(contracts)) return [...pins];
  for (const f of readdirSync(contracts).filter(n => n.endsWith('.component.json'))) {
    const { source } = JSON.parse(readFileSync(join(contracts, f), 'utf8'));
    if (source.commit !== pin.commit) throw new Error(`${f}: pinned to ${source.commit}, not the Adapter's ${pin.commit}`);
    for (const [path, hash] of Object.entries(source.files)) {
      const want = hash.replace(/^sha256:/, '');
      if (pins.has(path) && pins.get(path) !== want) throw new Error(`${f}: ${path} pinned to ${hash}, not ${pins.get(path)}`);
      pins.set(path, want);
    }
  }
  return [...pins];
}

/**
 * Fetch repository paths at the pinned commit into `dir`/cds, as they are (these are what the Contract pins, so
 * there is nothing to check them against yet). Returns {tag, commit, files, snapshotId}.
 */
export async function snapshotSources(paths, dir = DEFAULT_DIR, { pin = CDS } = {}) {
  const files = {};
  for (const path of [...new Set(paths)].sort()) {
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`${path}: give a path inside the repository`);
    const bytes = await download(rawUrl(pin, path));
    const out = join(dir, 'cds', path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
    files[path] = `sha256:${sha256(bytes)}`;
  }
  return { tag: pin.tag, commit: pin.commit, files, snapshotId: snapshotId(files) };
}

/** True when every pinned file is present in `dir` and every package is extracted from its pin (hashes: readSources). */
export function hasSources(dir = DEFAULT_DIR, pin = CDS) {
  return Object.keys(pin.files).every(p => existsSync(join(dir, 'cds', p)))
    && Object.keys(pin.packages).every(name => existsSync(join(packageDir(dir, name, pin), MANIFEST)));
}

/**
 * Read the pinned sources from `dir`. Throws, naming the file or package, when one is missing, a file's sha256 is
 * not the pin, or a package was extracted from another pin or a member changed since.
 * Returns {commit, files: {path: text}, hashes: {path: hex}, packages: {name: {dir, members: [path]}}}, where each
 * package `dir` holds its members as `package/...` paths.
 */
export function readSources(dir = DEFAULT_DIR, pin = CDS) {
  if (!hasSources(dir, pin))
    throw new Error(`CDS sources missing in ${dir}; run: node skills/adapter-cds/scripts/sources.mjs`);
  const files = {};
  const hashes = {};
  for (const [path, want] of Object.entries(pin.files)) {
    const bytes = readFileSync(join(dir, 'cds', path));
    hashes[path] = sha256(bytes);
    if (hashes[path] !== want) throw new Error(`${path}: sha256 ${hashes[path]} does not match the pin ${want}`);
    files[path] = bytes.toString('utf8');
  }
  const packages = {};
  for (const name of Object.keys(pin.packages)) {
    const m = intactManifest(packageDir(dir, name, pin), pin.packages[name]);
    if (!m) throw new Error(`${name}@${pin.packages[name].version}: extracted from another pin, or a member changed since; run: node skills/adapter-cds/scripts/sources.mjs`);
    packages[name] = { dir: packageDir(dir, name, pin), members: Object.keys(m.members) };
  }
  return { commit: pin.commit, files, hashes, packages };
}

const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);

/** True when the Foundations step's packages are installed in `dir` from the committed lockfile. */
export function hasFoundationsPackages(dir = FOUNDATIONS_DIR) {
  return lockOf(dir) === lockOf(FOUNDATIONS_PINNED) && existsSync(join(dir, 'node_modules/d3-color/package.json'));
}

/**
 * Install the Foundations step's packages into `dir` with `npm ci --ignore-scripts`. Skips when already installed.
 * (#385) The one package is d3-color, which getBlendedColor imports and no CDS tarball holds. npm ci checks it
 * against the committed lockfile's integrity, and no lifecycle script runs.
 */
export function fetchFoundationsPackages(dir = FOUNDATIONS_DIR) {
  installAtomically(dir, hasFoundationsPackages, tmp => {
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(FOUNDATIONS_PINNED, f), join(tmp, f));
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: tmp, stdio: 'inherit' });
  }, ['node_modules', 'package.json', 'package-lock.json']);
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { dir: { type: 'string', default: DEFAULT_DIR } } });
  const fail = e => { console.error(`FAIL: ${e.message}`); process.exit(1); };
  if (positionals[0] === 'snapshot') {
    if (positionals.length < 2) fail(new Error('usage: sources.mjs snapshot <repo path>... [--dir <dir>]'));
    snapshotSources(positionals.slice(1), values.dir).then(r => console.log(JSON.stringify(r, null, 2)), fail);
  } else {
    fetchSources(values.dir).then(async d => {
      readSources(d);
      console.log(`CDS Foundations packages OK in ${fetchFoundationsPackages()}`);
      console.log(`CDS Web ${CDS.packages['@coinbase/cds-web'].version} (commit ${CDS.commit.slice(0, 7)}, ${CDS.tag || 'untagged'}) sources OK in ${d}`);
      // The preview renderer's pinned packages (#386), so one fetch step readies every test.
      const { PREVIEW_DIR, fetchPreviewPackages } = await import('./preview.mjs');
      console.log(`CDS preview packages OK in ${fetchPreviewPackages(PREVIEW_DIR)}`);
    }).catch(fail);
  }
}
