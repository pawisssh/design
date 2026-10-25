// The CDS fetch and its `snapshot` subcommand (#384), offline: a stub download serves small files and a tarball
// built here, so every check runs without the network. Run: node --test skills/adapter-cds/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fetchSources, hasSources, packageDir, readSources, sha256, snapshotSources } from '../scripts/sources.mjs';

const scratch = prefix => mkdtempSync(join(tmpdir(), `cds-${prefix}-`));

// A tarball as npm packs one: members under `package/`. Its package.json has install scripts that would leave a
// file behind if anything ran them.
function tarball() {
  const root = scratch('pack');
  const members = {
    'package/package.json': JSON.stringify({ name: '@x/kit', version: '1.0.0', scripts: { preinstall: 'touch ../../RAN', postinstall: 'touch ../../RAN' } }),
    'package/esm/buttons/Button.css': '.cds-Button{}',
    'package/esm/styles/responsive/phone.css': '@media (max-width: 767px){}',
    'package/esm/themes/defaultTheme.js': 'export const defaultTheme = {};',
    'package/esm/index.js': 'throw new Error("ran");',
  };
  for (const [path, text] of Object.entries(members)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync('tar', ['-czf', join(root, 'kit.tgz'), '-C', root, 'package']);
  return readFileSync(join(root, 'kit.tgz'));
}

const TGZ = tarball();
const FILES = { LICENSE: 'Apache-2.0 License\n', 'packages/web/package.json': '{"version":"1.0.0"}\n' };
const PIN = {
  commit: 'c0ffee', tag: '',
  files: Object.fromEntries(Object.entries(FILES).map(([p, t]) => [p, sha256(t)])),
  packages: {
    '@x/kit': {
      version: '1.0.0',
      integrity: 'sha512-' + createHash('sha512').update(TGZ).digest('base64'),
      extract: ['package/package.json', 'package/esm/**/*.css', 'package/esm/themes/*.js'],
    },
  },
};

// Serves FILES and TGZ by URL, counting requests.
function stub(overrides = {}) {
  const served = { ...FILES, ...overrides };
  const calls = [];
  const download = async url => {
    calls.push(url);
    if (url === 'https://registry.npmjs.org/@x/kit/-/kit-1.0.0.tgz') return served.tgz || TGZ;
    const path = url.replace('https://raw.githubusercontent.com/coinbase/cds/c0ffee/', '');
    if (!(path in served)) throw new Error(`GET ${url}: HTTP 404`);
    return Buffer.from(served[path]);
  };
  return { download, calls };
}

test('the fetch extracts only the members the patterns name, and a re-run downloads nothing', async () => {
  const dir = scratch('fetch');
  const first = stub();
  await fetchSources(dir, { pin: PIN, ...first });
  assert.equal(first.calls.length, 3);
  assert.ok(hasSources(dir, PIN));
  const s = readSources(dir, PIN);
  assert.deepEqual(s.packages['@x/kit'].members,
    ['package/esm/buttons/Button.css', 'package/esm/styles/responsive/phone.css', 'package/esm/themes/defaultTheme.js', 'package/package.json']);
  assert.equal(s.files.LICENSE, FILES.LICENSE);
  assert.ok(!existsSync(join(packageDir(dir, '@x/kit', PIN), 'package/esm/index.js')), 'a member no pattern names is left in the tarball');

  const again = stub();
  await fetchSources(dir, { pin: PIN, ...again });
  assert.deepEqual(again.calls, [], 'a re-run with everything intact is a no-op');
});

test('nothing from a package runs: its install scripts leave no file behind', async () => {
  const dir = scratch('scripts');
  await fetchSources(dir, { pin: PIN, ...stub() });
  for (const at of [dir, join(dir, 'npm'), join(dir, '..')]) assert.ok(!existsSync(join(at, 'RAN')), at);
});

test('a file whose sha256 is not the pin fails the fetch, naming the file, and is not written', async () => {
  const dir = scratch('hash');
  await assert.rejects(fetchSources(dir, { pin: PIN, ...stub({ 'packages/web/package.json': '{"version":"1.0.1"}\n' }) }),
    /packages\/web\/package\.json: sha256 [0-9a-f]{64} does not match the pin/);
  assert.ok(!existsSync(join(dir, 'cds/packages/web/package.json')));
});

test('a tarball whose integrity is not the pin fails the fetch, naming the package, and is not extracted', async () => {
  const dir = scratch('integrity');
  const other = Buffer.concat([TGZ, Buffer.from([0])]);
  await assert.rejects(fetchSources(dir, { pin: PIN, ...stub({ tgz: other }) }), /@x\/kit@1\.0\.0: integrity sha512-\S+ does not match the pin/);
  assert.ok(!hasSources(dir, PIN));
});

test('an extract pattern that matches no member fails the fetch, naming the pattern', async () => {
  const pin = { ...PIN, packages: { '@x/kit': { ...PIN.packages['@x/kit'], extract: ['package/package.json', 'package/esm/svgs/*.svg'] } } };
  await assert.rejects(fetchSources(scratch('pattern'), { pin, ...stub() }), /@x\/kit@1\.0\.0: no tarball member matches the extract pattern package\/esm\/svgs\/\*\.svg/);
});

test('a member changed after extraction fails readSources, naming the package, and the next fetch extracts again', async () => {
  const dir = scratch('tamper');
  await fetchSources(dir, { pin: PIN, ...stub() });
  writeFileSync(join(packageDir(dir, '@x/kit', PIN), 'package/esm/themes/defaultTheme.js'), 'export const defaultTheme = {changed: 1};');
  assert.throws(() => readSources(dir, PIN), /@x\/kit@1\.0\.0: extracted from another pin, or a member changed since/);
  const again = stub();
  await fetchSources(dir, { pin: PIN, ...again });
  assert.deepEqual(again.calls, ['https://registry.npmjs.org/@x/kit/-/kit-1.0.0.tgz']);
  assert.doesNotThrow(() => readSources(dir, PIN));
});

test('snapshot prints {files, snapshotId} that the Adapter guide\'s shell recipe recomputes from the fetched files', async () => {
  const dir = scratch('snapshot');
  const paths = ['packages/web/package.json', 'LICENSE', 'packages/web/package.json'];
  const got = await snapshotSources(paths, dir, { pin: PIN, ...stub() });
  assert.deepEqual(Object.keys(got.files), ['LICENSE', 'packages/web/package.json']);
  assert.equal(got.files.LICENSE, `sha256:${PIN.files.LICENSE}`);
  assert.equal(got.commit, 'c0ffee');
  assert.equal(got.tag, '');
  const recipe = "printf '%s\\n' \"$@\" | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256";
  const shell = spawnSync('sh', ['-c', recipe, 'sh', ...Object.keys(got.files)], { cwd: join(dir, 'cds'), encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  assert.equal(got.snapshotId, `sha256:${shell.stdout.split(' ')[0]}`);
  await assert.rejects(snapshotSources(['../LICENSE'], dir, { pin: PIN, ...stub() }), /\.\.\/LICENSE: give a path inside the repository/);
});
