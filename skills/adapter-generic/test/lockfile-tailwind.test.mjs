// The Tailwind version a project's lockfile resolves (#253, spec #249): the tools step fetches that version's tarball,
// verified against the lockfile's own integrity, and the Foundations document is compiled and cross-checked with it.
// `shadcn` and `tw-animate-css` are needed only when the project's CSS imports them. The 4.2.2 cases fetch from the
// npm registry (once; the tarball stays in .scratch/adapter-generic/tools).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFamily } from '../scripts/components.mjs';
import { generate } from '../scripts/foundations.mjs';
import { DEFAULT_DIR, FIXTURE, TOOLS, fetchTools, hasTools, projectPins, toolDir } from '../scripts/sources.mjs';

const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';
const CSS = 'app/globals.css';
// batch-sell's Tailwind: another 4.x than the Adapter's 4.3.3 pin, and its registry integrity.
const TW422 = { version: '4.2.2', integrity: 'sha512-KWBIxs1Xb6NoLdMVqhbhgwZf2PGBpPEiwOqgI4pFIYbNTfBXiKYyWoTsXgBQ9WFg/OlhnvHaY+AEpW7wSmFo2Q==' };

/**
 * A copy of the fixture project edited by `edit({css, lock})` (the lockfile's `packages` map): the CSS keeps its
 * `@import`s unless the edit drops them.
 */
function variant(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-lock-'));
  cpSync(FIXTURE, dir, { recursive: true });
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
  const state = { css: readFileSync(join(dir, CSS), 'utf8'), lock: lock.packages };
  edit(state);
  writeFileSync(join(dir, CSS), state.css);
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ ...lock, packages: state.lock }, null, 2));
  return dir;
}

// A project like batch-sell: Tailwind 4.2.2, and no `shadcn` or `tw-animate-css` in its CSS or its lockfile.
const bare = () => variant(s => {
  s.css = s.css.replace('@import "tw-animate-css";\n', '').replace('@import "shadcn/tailwind.css";\n', '');
  Object.assign(s.lock['node_modules/tailwindcss'], TW422, { resolved: `https://registry.npmjs.org/tailwindcss/-/tailwindcss-${TW422.version}.tgz` });
  delete s.lock['node_modules/shadcn'];
  delete s.lock['node_modules/tw-animate-css'];
});

test('a project whose lockfile resolves another Tailwind 4.x is fetched, verified and compiled with it', { skip }, async () => {
  const project = bare();
  const pins = projectPins(project);
  assert.deepEqual(Object.keys(pins).sort(), ['tailwindcss', 'typescript'], 'neither shadcn nor tw-animate-css is imported');
  assert.equal(pins.tailwindcss.version, '4.2.2');
  await fetchTools(DEFAULT_DIR, pins);
  assert.ok(existsSync(join(toolDir('tailwindcss', DEFAULT_DIR, pins), 'dist/lib.mjs')));
  assert.ok(existsSync(join(toolDir('tailwindcss', DEFAULT_DIR), 'dist/lib.mjs')), 'the pinned 4.3.3 stays beside it');

  const { doc } = await generate({ project, drafts: [] });
  assert.deepEqual(doc.source.packages, { tailwindcss: '4.2.2' });
  assert.match(doc.checks.compiled.against, /^tailwindcss@4\.2\.2 compile\(\) over app\/globals\.css$/);
  assert.ok(doc.checks.compiled.matched > 0);
  assert.ok(!JSON.stringify(doc).includes('4.3.3'), 'nothing in the document names the Adapter\'s pin');
});

test('the component step reads a family with the project\'s Tailwind', { skip }, async () => {
  const project = bare();
  const { doc } = await generate({ project, drafts: [] });
  const { axes } = await readFamily({ project, family: 'button', foundations: doc });
  assert.deepEqual(axes.map(a => a.key).slice(0, 2), ['variant', 'size']);
});

test('a tampered integrity is refused, naming the package', { skip }, async () => {
  const project = variant(s => {
    Object.assign(s.lock['node_modules/tailwindcss'], TW422, { integrity: 'sha512-' + 'A'.repeat(86) + '==' });
  });
  await assert.rejects(fetchTools(DEFAULT_DIR, projectPins(project)), /tailwindcss@4\.2\.2: integrity .* does not match/);
});

test('a lockfile integrity that disagrees with the Adapter\'s own pin of that version is refused, naming the package', { skip }, () => {
  const project = variant(s => { s.lock['node_modules/tailwindcss'].integrity = TW422.integrity; });
  assert.throws(() => projectPins(project), /tailwindcss@4\.3\.3: the lockfile's integrity .* does not match the Adapter's pin/);
});

test('a project that imports shadcn or tw-animate-css still needs the pinned version of each', { skip }, () => {
  const animate = variant(s => { s.lock['node_modules/tw-animate-css'].version = '1.3.0'; });
  assert.throws(() => projectPins(animate), /resolves tw-animate-css@1\.3\.0, but the Adapter pins tw-animate-css@1\.4\.0/);
  const missing = variant(s => { delete s.lock['node_modules/shadcn']; });
  assert.throws(() => projectPins(missing), /resolves shadcn@undefined, but the Adapter pins shadcn@4\.22\.0/);
  assert.deepEqual(Object.keys(projectPins(FIXTURE)).sort(), ['shadcn', 'tailwindcss', 'tw-animate-css', 'typescript']);
});

test('a project that resolves no Tailwind 4 is refused, naming the version', { skip }, () => {
  const v3 = variant(s => { s.lock['node_modules/tailwindcss'].version = '3.4.17'; });
  assert.throws(() => projectPins(v3), /resolves tailwindcss@3\.4\.17.*Tailwind 4/);
  const none = variant(s => { delete s.lock['node_modules/tailwindcss']; });
  assert.throws(() => projectPins(none), /package-lock\.json resolves no tailwindcss/);
});

test('the shadcn fixture compiles with the pin, as before', { skip }, () => {
  assert.equal(projectPins(FIXTURE).tailwindcss.version, TOOLS.tailwindcss.version);
});
