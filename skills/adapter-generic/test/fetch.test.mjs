// The fetch commands' install (#219): sources.mjs extracts each tool, and preview.mjs installs its packages, beside the
// folder and renames them into place. A slow fake install stands in for `npm ci`, which takes a minute here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAtomically } from '../scripts/sources.mjs';

const SOURCES = new URL('../scripts/sources.mjs', import.meta.url).href;
const ENTRIES = ['node_modules', 'package-lock.json'];
// Complete once the packages and the pinned lockfile are both there, as hasPreviewPackages checks.
const complete = dir => existsSync(join(dir, 'node_modules/react/package.json'))
  && existsSync(join(dir, 'package-lock.json')) && readFileSync(join(dir, 'package-lock.json'), 'utf8') === 'pinned';
// The lockfile first, then the packages a file at a time, as `npm ci` leaves a folder while it runs.
const SLOW_INSTALL = `
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { installAtomically } from ${JSON.stringify(SOURCES)};
  const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const complete = ${complete.toString()};
  installAtomically(process.argv[1], complete, tmp => {
    writeFileSync(join(tmp, 'package-lock.json'), 'pinned');
    for (const p of ['scheduler', 'react-dom', 'react']) { sleep(150); mkdirSync(join(tmp, 'node_modules', p), { recursive: true }); writeFileSync(join(tmp, 'node_modules', p, 'package.json'), '{}'); }
  }, ${JSON.stringify(ENTRIES)});
`;

test('two installs at once into one folder: both finish, and the folder is never there half-installed (#219)', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'generic-install-'));
  const dir = join(parent, 'preview');
  const run = () => new Promise(resolve => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', SLOW_INSTALL, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => resolve({ code, out }));
  });
  const runs = Promise.all([run(), run()]);
  let done = false, halfSeen = false;
  runs.then(() => { done = true; });
  while (!done) {
    if (existsSync(dir) && !complete(dir)) halfSeen = true;
    await new Promise(r => setTimeout(r, 10));
  }
  for (const { code, out } of await runs) assert.equal(code, 0, out);
  assert.equal(halfSeen, false, 'the folder existed before its packages were installed');
  assert.ok(complete(dir));
  assert.deepEqual(readdirSync(parent), ['preview']);
});

test('an incomplete folder keeps its other files: the entries move in, the lockfile last (#219)', () => {
  const parent = mkdtempSync(join(tmpdir(), 'generic-install-'));
  const dir = join(parent, 'preview');
  mkdirSync(join(dir, 'node_modules/react'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/react/package.json'), '{"version": "old"}');
  writeFileSync(join(dir, 'package-lock.json'), 'old');
  writeFileSync(join(dir, 'keep.txt'), 'kept');
  installAtomically(dir, complete, tmp => {
    writeFileSync(join(tmp, 'package-lock.json'), 'pinned');
    mkdirSync(join(tmp, 'node_modules/react'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules/react/package.json'), '{}');
  }, ENTRIES);
  assert.ok(complete(dir));
  assert.equal(readFileSync(join(dir, 'node_modules/react/package.json'), 'utf8'), '{}');
  assert.equal(readFileSync(join(dir, 'keep.txt'), 'utf8'), 'kept');
  assert.deepEqual(readdirSync(parent), ['preview']);
});

test('an install that leaves the folder incomplete throws, and leaves nothing beside it (#219)', () => {
  const parent = mkdtempSync(join(tmpdir(), 'generic-install-'));
  assert.throws(() => installAtomically(join(parent, 'preview'), complete, () => {}, ENTRIES), /incomplete/);
  assert.deepEqual(readdirSync(parent), []);
});
