// The sign-off report (.github/signoffs.mjs): each recorded Handoff that is pending, or has no signed.json byte copy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { awaiting, summary } from '../signoffs.mjs';

const handoff = (path, revision, status, signedRevision, signedCopy, blocks = []) => ({ path, revision, status, signedRevision, signedCopy, blocks });

test('a pending Handoff awaits sign-off with its blocks; an approved one with its signed.json copy does not', () => {
  const pending = handoff('design-systems/shadcn/handoffs/request-access/handoff.json', 11, 'pending', 8, false, ['open question to the owner: q-prop-card']);
  assert.deepEqual(awaiting([pending, handoff('design-systems/carbon/handoffs/invite-teammates/handoff.json', 5, 'approved', 5, true)]), [pending]);
});

test('a Handoff never signed off awaits its first sign-off; an approved one whose signed.json differs awaits one too', () => {
  const rows = awaiting([handoff('a/handoff.json', 1, 'pending', null, false), handoff('b/handoff.json', 3, 'approved', 3, false)]);
  assert.deepEqual(rows.map(r => r.path), ['a/handoff.json', 'b/handoff.json']);
});

test('the summary names each Handoff, its last sign-off and what blocks it, or says none awaits', () => {
  assert.equal(summary([]), 'No recorded Handoff awaits sign-off.\n');
  assert.equal(summary([handoff('x/handoff.json', 11, 'pending', 8, false, ['open question to the owner: q-prop-card']),
    handoff('y/handoff.json', 1, 'pending', null, false), handoff('z/handoff.json', 3, 'approved', 2, false)]),
  '3 recorded Handoffs await sign-off:\n'
  + '- x/handoff.json: r11, last signed off at r8; blocks: open question to the owner: q-prop-card\n'
  + '- y/handoff.json: r1, never signed off; nothing blocks it, so `review` prints its approve command\n'
  + '- z/handoff.json: r3, last signed off at r2; approved, but signed.json is no byte copy of it\n');
});

test('run on the repo, it reads every recorded Handoff and exits 0 whatever awaits', () => {
  const r = spawnSync(process.execPath, [new URL('../signoffs.mjs', import.meta.url).pathname], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^(No recorded Handoff awaits sign-off\.|\d+ recorded Handoffs? awaits? sign-off:)/);
});
