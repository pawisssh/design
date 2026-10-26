#!/usr/bin/env node
// Fetches every pinned tool the tests read: each skill's scripts/sources.mjs or scripts/deps.mjs, one after another.
// Each verifies its own pins and writes into .scratch/<skill>; without them, the tests that need them skip.
//
//   node scripts/fetch.mjs   run every fetch; stops at the first that fails, naming it
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every fetch script, as {skill, script}, by skill: a new skills/<skill>/scripts/sources.mjs or deps.mjs is one. */
export const FETCHES = readdirSync(join(ROOT, 'skills')).sort().flatMap(skill => ['sources.mjs', 'deps.mjs']
  .map(name => `skills/${skill}/scripts/${name}`).filter(script => existsSync(join(ROOT, script))).map(script => ({ skill, script })));

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  for (const { script } of FETCHES) {
    console.log(`fetch: ${script}`);
    const run = spawnSync(process.execPath, [script], { cwd: ROOT, stdio: 'inherit' });
    if (run.status !== 0) {
      console.error(`fetch: ${script} failed (${run.signal || `exit ${run.status}`})`);
      process.exit(1);
    }
  }
}
