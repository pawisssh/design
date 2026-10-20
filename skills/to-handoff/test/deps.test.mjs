// The fetch command (#219): two runs at once into one folder both finish, and neither shows the folder half-installed.
// Real installs from npm's cache, so the test skips until deps.mjs has fetched once; it skips without a system Chrome
// too, since each run would download Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBrowser, hasDeps } from '../scripts/deps.mjs';
import { repo } from './helpers.mjs';

const skip = !hasDeps() ? 'packages missing; run: node skills/to-handoff/scripts/deps.mjs'
  : !findBrowser()?.channel && 'no system Chrome: each run would download Chromium';

test('two fetches at once into one folder: both finish, and the folder is never there half-installed (#219)', { skip }, async () => {
  const parent = mkdtempSync(join(tmpdir(), 'to-handoff-deps-'));
  const dir = join(parent, 'deps');
  const run = () => new Promise(resolve => {
    const child = spawn(process.execPath, [repo('skills/to-handoff/scripts/deps.mjs'), '--dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => resolve({ code, out }));
  });
  const runs = Promise.all([run(), run()]);
  let done = false, halfSeen = false;
  runs.then(() => { done = true; });
  while (!done) {
    if (existsSync(dir) && !hasDeps(dir)) halfSeen = true;
    await new Promise(r => setTimeout(r, 20));
  }
  for (const { code, out } of await runs) assert.equal(code, 0, out);
  assert.equal(halfSeen, false, 'the folder existed before its packages were installed');
  assert.ok(hasDeps(dir));
  assert.deepEqual(readdirSync(parent), ['deps']);
});
