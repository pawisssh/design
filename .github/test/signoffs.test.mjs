// The sign-off report (.github/signoffs.mjs): each recorded Handoff that is pending, or whose signed.json is behind it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { awaiting, summary } from '../signoffs.mjs';

const handoff = (path, revision, status, signedRevision, blocks = []) => ({ path, revision, status, signedRevision, blocks });

test('a pending Handoff awaits sign-off with its blocks; an approved one whose signed.json matches does not', () => {
  const rows = awaiting([
    handoff('design-systems/shadcn/handoffs/request-access/handoff.json', 11, 'pending', 8, ['open question to the owner: q-prop-card']),
    handoff('design-systems/carbon/handoffs/invite-teammates/handoff.json', 5, 'approved', 5),
  ]);
  assert.deepEqual(rows, [{ path: 'design-systems/shadcn/handoffs/request-access/handoff.json', revision: 11, signedRevision: 8,
    blocks: ['open question to the owner: q-prop-card'] }]);
});

test('a Handoff never signed off awaits its first sign-off; an approved one with signed.json behind it awaits one too', () => {
  const rows = awaiting([handoff('a/handoff.json', 1, 'pending', null), handoff('b/handoff.json', 3, 'approved', 2)]);
  assert.deepEqual(rows.map(r => [r.path, r.signedRevision]), [['a/handoff.json', null], ['b/handoff.json', 2]]);
});

test('the summary names each Handoff, its last sign-off and what blocks it, or says none awaits', () => {
  assert.equal(summary([]), 'No recorded Handoff awaits sign-off.\n');
  assert.equal(summary([{ path: 'x/handoff.json', revision: 11, signedRevision: 8, blocks: ['open question to the owner: q-prop-card'] },
    { path: 'y/handoff.json', revision: 1, signedRevision: null, blocks: [] }]),
  '2 recorded Handoffs await sign-off:\n'
  + '- x/handoff.json: r11, last signed off at r8; blocks: open question to the owner: q-prop-card\n'
  + '- y/handoff.json: r1, never signed off; nothing blocks it, so `review` prints its approve command\n');
});

test('run on the repo, it reads every recorded Handoff and exits 0 whatever awaits', () => {
  const r = spawnSync(process.execPath, [new URL('../signoffs.mjs', import.meta.url).pathname], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^(No recorded Handoff awaits sign-off\.|\d+ recorded Handoffs? awaits? sign-off:)/);
});
