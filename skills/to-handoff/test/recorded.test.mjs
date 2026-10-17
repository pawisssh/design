// A committed recorded Handoff is what generate makes today from its decisions.json: regenerated fresh in a copy of
// its Design System, handoff.json and its Rendering match the committed bytes. A generator change that moves either
// fails here, so a committed Handoff cannot go stale silently. Recorded runs use the runtime reader, so this skips
// without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRuntime } from '../scripts/deps.mjs';
import { generate, render } from '../scripts/handoff.mjs';
import { rewriteJson } from '../../contract/scripts/io.mjs';
import { PROTOTYPE, repo } from './helpers.mjs';

const noRuntime = !hasRuntime() && 'runtime reader missing (packages or browser); run: node skills/to-handoff/scripts/deps.mjs';

// Each recorded Handoff and the Prototype it was made from; the Handoff pins its files, not where they live.
const RECORDED = [
  { ds: 'carbon', feature: 'invite-teammates', prototype: PROTOTYPE },
  { ds: 'shadcn', feature: 'request-access', prototype: fileURLToPath(new URL('fixtures/v0-app', import.meta.url)) },
];

const recordedIn = ds => {
  const dir = repo(`design-systems/${ds}/handoffs`);
  return existsSync(dir) ? readdirSync(dir).filter(f => existsSync(join(dir, f, 'decisions.json'))) : [];
};

test('every committed Handoff with a decisions.json is a recorded run this test regenerates', () => {
  const committed = readdirSync(repo('design-systems')).flatMap(ds => recordedIn(ds).map(f => `${ds}/${f}`));
  assert.deepEqual(committed.sort(), RECORDED.map(r => `${r.ds}/${r.feature}`).sort());
});

for (const { ds, feature, prototype } of RECORDED) {
  test(`${ds}/${feature}: regenerated from its decisions.json, handoff.json and its Rendering are byte-identical`, { skip: noRuntime }, async () => {
    const committed = repo(`design-systems/${ds}/handoffs/${feature}`);
    const tmp = mkdtempSync(join(tmpdir(), 'to-handoff-recorded-'));
    const copy = join(tmp, ds);
    cpSync(repo(`design-systems/${ds}`), copy, { recursive: true });
    rmSync(join(copy, 'handoffs', feature), { recursive: true });
    // A copy of the Prototype too: the runtime reader may install a React app's packages next to it.
    const proto = join(tmp, 'prototype', basename(prototype));
    cpSync(prototype, proto, { recursive: true });
    const decisions = JSON.parse(readFileSync(join(committed, 'decisions.json'), 'utf8'));
    // A Contract the run wrote mid-run from a draft elsewhere (a contract:<family> path) was not there when it started.
    const midRun = Object.entries(decisions).filter(([k, v]) => k.startsWith('contract:')
      && v.path !== `design-systems/${ds}/contracts/${k.slice(9)}.component.json`).map(([k]) => k.slice(9));
    for (const family of midRun) rmSync(join(copy, 'contracts', `${family}.component.json`), { force: true });
    try {
      const result = await generate({ prototype: proto, designSystem: copy, decisions, runtime: true });
      assert.deepEqual(result.requests.map(r => r.key), [], 'the committed decisions answer every request');
      const old = JSON.parse(readFileSync(join(committed, 'handoff.json'), 'utf8'));
      // A fresh run is r1, pending; the stored revision, status and approval are history, outside the content.
      // A Sign-off splices its status and approval into the pending text (io.mjs), so the fresh text gets them the same way.
      const pending = JSON.stringify({ ...result.handoff, revision: old.revision }, null, 2) + '\n';
      const fresh = rewriteJson(pending, { ...result.handoff, revision: old.revision, status: old.status, approval: old.approval });
      assert.equal(fresh, readFileSync(join(committed, 'handoff.json'), 'utf8'),
        `re-run: node skills/to-handoff/scripts/handoff.mjs generate <prototype> --ds design-systems/${ds} --decisions design-systems/${ds}/handoffs/${feature}/decisions.json`);
      // The Rendering stamps the revision, so it renders the fresh content under the stored one.
      writeFileSync(result.path, fresh);
      const page = await render({ handoffPath: result.path, designSystem: copy });
      assert.equal(readFileSync(page, 'utf8'), readFileSync(join(committed, 'renderings/index.html'), 'utf8'));
      for (const family of midRun) {
        const file = `contracts/${family}.component.json`;
        if (existsSync(join(copy, file))) assert.equal(readFileSync(join(copy, file), 'utf8'), readFileSync(repo(`design-systems/${ds}/${file}`), 'utf8'), file);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}
