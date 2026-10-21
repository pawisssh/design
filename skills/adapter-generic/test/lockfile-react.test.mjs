// The React a project's lockfile resolves (#256, spec #249): the preview renderer installs react, react-dom and the scheduler
// react-dom needs at those versions, each verified against the lockfile's `integrity`, with `npm ci --ignore-scripts`, in a
// folder keyed by them. The other packages stay at the Adapter's pins. The lock and key cases are offline; the 19.2.4 cases
// fetch from the npm registry (once; the install stays in .scratch/adapter-generic/preview).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_DIR, fetchPreviewPackages, hasPreviewPackages, previewLock, previewRenderer } from '../scripts/preview.mjs';
import { FIXTURE, hasTools, sha256 } from '../scripts/sources.mjs';

const SHADCN = new URL('../../../design-systems/shadcn/', import.meta.url);
const COMMITTED = fileURLToPath(new URL('../preview/', import.meta.url));
const skip = !hasTools() ? 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs' : false;
// batch-sell's React: another 19.x than the v0 fixture's 19.1.0, and its registry integrities.
const R19 = {
  react: { version: '19.2.4', integrity: 'sha512-9nfp2hYpCwOjAN+8TZFGhtWEwgvWHXqESH8qT89AT/lWklpLON22Lc8pEtnpsZz7VmawabSU0gCjnj8aC0euHQ==' },
  'react-dom': { version: '19.2.4', integrity: 'sha512-AXJdLo8kgMbimY95O2aKQqsz2iWi9jMgKJhRBAxECE4IFxfcazB2LmzloIoibJI3C12IlY20+KFaLv+71bUJeQ==',
    dependencies: { scheduler: '^0.27.0' }, peerDependencies: { react: '^19.2.4' } },
  scheduler: { version: '0.27.0', integrity: 'sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==' },
};
const KEY = 'react@19.2.4-scheduler@0.27.0';
const buttonContract = () => JSON.parse(readFileSync(new URL('contracts/button.component.json', SHADCN), 'utf8'));

/** A copy of the fixture project whose lockfile's `packages` map is edited by `edit`. */
function variant(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-react-'));
  cpSync(FIXTURE, dir, { recursive: true });
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
  edit(lock.packages);
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2));
  return dir;
}
const react19 = () => variant(p => {
  for (const [name, pin] of Object.entries(R19)) Object.assign(p[`node_modules/${name}`], pin, { resolved: `https://example.test/${name}.tgz` });
});

test('the fixture\'s React is the committed set: the lock and package.json are the committed ones, byte for byte', () => {
  const { key, packageJson, lock } = previewLock(FIXTURE);
  assert.equal(key, 'react@19.1.0-scheduler@0.26.0');
  assert.equal(JSON.stringify(lock, null, 2) + '\n', readFileSync(join(COMMITTED, 'package-lock.json'), 'utf8'));
  assert.equal(JSON.stringify(packageJson, null, 2) + '\n', readFileSync(join(COMMITTED, 'package.json'), 'utf8'));
});

test('a lockfile that resolves another React 19.x gives a lock at its versions, from the registry, and the other packages unchanged', () => {
  const { key, packageJson, lock } = previewLock(react19());
  const committed = JSON.parse(readFileSync(join(COMMITTED, 'package-lock.json'), 'utf8'));
  assert.equal(key, KEY);
  assert.equal(packageJson.dependencies.react, '19.2.4');
  assert.equal(packageJson.dependencies['react-dom'], '19.2.4');
  assert.equal(packageJson.dependencies['radix-ui'], '1.8.1');
  assert.equal(lock.packages[''].dependencies.react, '19.2.4');
  for (const [name, pin] of Object.entries(R19)) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.equal(entry.version, pin.version, name);
    assert.equal(entry.integrity, pin.integrity, name);
    assert.equal(entry.resolved, `https://registry.npmjs.org/${name}/-/${name}-${pin.version}.tgz`, `${name} comes from the registry, not the lockfile's resolved URL`);
  }
  assert.deepEqual(lock.packages['node_modules/react-dom'].dependencies, { scheduler: '^0.27.0' });
  for (const path of Object.keys(committed.packages).filter(k => !['', ...Object.keys(R19).map(n => `node_modules/${n}`)].includes(k)))
    assert.deepEqual(lock.packages[path], committed.packages[path], path);
});

test('a lockfile integrity that disagrees with the Adapter\'s own pin of that version is refused, naming the package', () => {
  const project = variant(p => { p['node_modules/react'].integrity = R19.react.integrity; });
  assert.throws(() => previewLock(project), /react@19\.1\.0: the lockfile's integrity .* does not match the Adapter's pin/);
});

test('a lockfile that gives no sha512 integrity, no scheduler, or two Reacts is refused, naming the package', () => {
  assert.throws(() => previewLock(variant(p => { p['node_modules/react-dom'].integrity = 'sha1-abc='; })), /react-dom@19\.1\.0 no sha512 integrity/);
  assert.throws(() => previewLock(variant(p => { delete p['node_modules/scheduler']; })), /resolves no scheduler/);
  assert.throws(() => previewLock(variant(p => { p['node_modules/react-dom'].version = '19.1.1'; })), /react-dom@19\.1\.1 but react@19\.1\.0/);
});

test('missing packages are refused with the command that installs them for this project', { skip }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'generic-react-'));
  assert.equal(hasPreviewPackages(base), false);
  await assert.rejects(previewRenderer(buttonContract(), { dir: base }), /packages missing in .*react@19\.1\.0-scheduler@0\.26\.0; run: node .*preview\.mjs --project /);
});

test('a tampered integrity is refused before anything is installed, naming the package', { skip }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'generic-react-'));
  const project = variant(p => {
    for (const [name, pin] of Object.entries(R19)) Object.assign(p[`node_modules/${name}`], pin);
    p['node_modules/react'].integrity = 'sha512-' + 'A'.repeat(86) + '==';
  });
  await assert.rejects(fetchPreviewPackages(base, project), /react@19\.2\.4: integrity .* does not match/);
  assert.equal(existsSync(join(base, KEY)), false);
});

test('the Adapter\'s other pins still hold: a project that resolves class-variance-authority or cn differently is refused, naming the package', { skip }, async () => {
  for (const [name, version] of [['class-variance-authority', '0.7.2'], ['cn', '0.5.1']]) {
    const project = variant(p => { p[`node_modules/${name}`].version = version; });
    const contract = buttonContract();
    contract.source.files['package-lock.json'] = `sha256:${sha256(readFileSync(join(project, 'package-lock.json')))}`;
    await assert.rejects(previewRenderer(contract, { project }), new RegExp(`${name} 0\\.\\d+\\.\\d+ is installed, but the project resolves ${version.replace(/\./g, '\\.')}`));
  }
});

test('a project that resolves another React 19.x renders with it, and the v0 fixture still renders with 19.1.0', { skip, timeout: 600000 }, async () => {
  const project = react19();
  const lockfile = readFileSync(join(project, 'package-lock.json'));
  const contract = buttonContract();
  Object.assign(contract.source.packages, { react: '19.2.4', 'react-dom': '19.2.4' });
  contract.source.files['package-lock.json'] = `sha256:${sha256(lockfile)}`;
  await fetchPreviewPackages(PREVIEW_DIR, project);
  assert.ok(hasPreviewPackages(PREVIEW_DIR, project));
  const version = (key, name) => JSON.parse(readFileSync(join(PREVIEW_DIR, key, 'node_modules', name, 'package.json'), 'utf8')).version;
  assert.equal(version(KEY, 'react'), '19.2.4');
  assert.equal(version(KEY, 'react-dom'), '19.2.4');
  assert.equal(version(KEY, 'scheduler'), '0.27.0');
  const { render } = await previewRenderer(contract, { project });
  assert.match(render({}), /^<button data-slot="button"/);

  assert.ok(hasPreviewPackages(PREVIEW_DIR, FIXTURE), 'the fixture\'s set is a folder of its own');
  assert.equal(version('react@19.1.0-scheduler@0.26.0', 'react'), '19.1.0');
  const v0 = await previewRenderer(buttonContract());
  assert.match(v0.render({}), /^<button data-slot="button"/);
});
