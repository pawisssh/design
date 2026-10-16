#!/usr/bin/env node
// Pinned tools for the Generic Adapter (#118), and the one place that fetches them.
//   node skills/adapter-generic/scripts/sources.mjs [--dir <dir>]   fetch into .scratch/adapter-generic/tools
//
// Each npm tarball is checked against its registry sha512 `integrity`, and only the named members are extracted
// with `tar`. Nothing is installed and no lifecycle script runs. The one thing ever executed is Tailwind's
// compiler (tailwind.mjs), over the consumer project's CSS. shadcn and tw-animate-css are read as stylesheets only:
// the fixture's CSS imports them. Downloads are untrusted data and live in gitignored scratch.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_DIR = join(REPO_ROOT, '.scratch/adapter-generic/tools');
// The reference project: `shadcn@4.22.0 init --base radix --preset nova`, as source plus lockfile (see its NOTICE).
export const FIXTURE = join(REPO_ROOT, 'skills/adapter-generic/fixtures/radix-nova');

// `stylesheet`: the project resolves it too (its lockfile must agree) and its CSS may `@import` it.
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

/** The pinned packages the project itself resolves and imports, by name. */
export const STYLESHEETS = Object.keys(TOOLS).filter(n => TOOLS[n].stylesheet).sort();

/** Hex sha256 of a string or bytes. */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** The extracted `package/` folder of a pinned tool. */
export const toolDir = (name, dir = DEFAULT_DIR) => join(dir, `${name}@${TOOLS[name].version}`, 'package');

/**
 * `source.snapshotId` from a `source.files` map {path: "sha256:<hex>"}: the sha256 of the `shasum -a 256` manifest,
 * one `<hex>  <path>\n` line per file, sorted by path in byte order (the Contract's rule, as Carbon's Adapter computes it).
 */
export function snapshotId(files) {
  const manifest = Object.keys(files).sort().map(p => `${files[p].replace(/^sha256:/, '')}  ${p}\n`).join('');
  return 'sha256:' + sha256(manifest);
}

/** True when every pinned tool is extracted in `dir`. */
export function hasTools(dir = DEFAULT_DIR) {
  return Object.entries(TOOLS).every(([name, pin]) => pin.extract.every(m => existsSync(join(dirname(toolDir(name, dir)), m))));
}

/** Download and extract every pinned tool into `dir`, verifying each tarball. Skips tools already present. */
export async function fetchTools(dir = DEFAULT_DIR) {
  for (const [name, pin] of Object.entries(TOOLS)) {
    const out = dirname(toolDir(name, dir));
    if (pin.extract.every(m => existsSync(join(out, m)))) continue;
    const url = `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${pin.version}.tgz`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    if (got !== pin.integrity) throw new Error(`${name}@${pin.version}: integrity ${got} does not match the pin ${pin.integrity}`);
    // Extract into a fresh empty directory, then move it into place: a half-extracted tool never looks valid.
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

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({ options: { dir: { type: 'string' } } });
  try {
    const dir = await fetchTools(values.dir || DEFAULT_DIR);
    console.log(`${Object.entries(TOOLS).map(([n, p]) => `${n}@${p.version}`).join(', ')} in ${dir}`);
    console.log('Generic Adapter tools OK');
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
