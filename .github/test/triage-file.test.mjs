// A triage batch (scripts/triage-file.mjs): new issues filed first, their numbers filled in, then each issue posted as one unit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fill, run } from '../../scripts/triage-file.mjs';

// A fake gh: `issue create` hands out numbers from 600, `api …/issues/<n> --jq .id` answers 9000 + n, and `fail`
// maps a call's leading words to the stderr it throws with.
function fakeGh(fail = {}) {
  const calls = [];
  let next = 600;
  const gh = async (args, input) => {
    calls.push({ args, input });
    const key = Object.keys(fail).find(k => args.join(' ').startsWith(k));
    if (key) throw Object.assign(new Error('gh failed'), { stderr: fail[key] });
    if (args[0] === 'issue' && args[1] === 'create') return `https://github.com/o/r/issues/${next++}\n`;
    if (args[0] === 'api' && args.includes('.id')) return `${9000 + Number(args[1].split('/').pop())}\n`;
    return '';
  };
  return { gh, calls };
}
const read = files => path => {
  if (!(path in files)) throw new Error(`ENOENT: ${path}`);
  return files[path];
};

test('a placeholder becomes the new issue\'s number, and an unknown one is refused', () => {
  assert.equal(fill('Blocked by {{new:a}} and {{new:b}}.', { a: 593, b: 594 }), 'Blocked by #593 and #594.');
  assert.throws(() => fill('see {{new:c}}', { a: 593 }), /no new issue "c"/);
});

test('new issues are filed first, and every body and comment gets their real numbers', async () => {
  const { gh, calls } = fakeGh();
  const plan = {
    repo: 'o/r',
    new: [
      { id: 'split', title: 'Split', body: 'First half.', labels: ['enhancement', 'ready-for-agent'] },
      { id: 'rest', title: 'Rest', bodyFile: 'rest.md', labels: ['enhancement'], blockedBy: ['{{new:split}}'] },
    ],
    issues: [{ number: 354, commentFile: 'b354.md', add: ['ready-for-agent'], remove: ['needs-triage'], blockedBy: [360] }],
  };
  const { ok, lines } = await run(plan, { gh, read: read({ 'rest.md': 'After {{new:split}}.', 'b354.md': 'Split into {{new:split}} and {{new:rest}}.' }) });
  assert.equal(ok, true);
  const creates = calls.filter(c => c.args[1] === 'create');
  assert.deepEqual(creates.map(c => c.input), ['First half.', 'After #600.']);
  assert.ok(calls.indexOf(creates[1]) < calls.findIndex(c => c.args[1] === 'comment'));
  assert.equal(calls.find(c => c.args[1] === 'comment').input, 'Split into #600 and #601.');
  assert.deepEqual(calls.find(c => c.args[1] === 'edit').args, ['issue', 'edit', '354', '-R', 'o/r', '--add-label', 'ready-for-agent', '--remove-label', 'needs-triage']);
  assert.ok(calls.some(c => c.args.join(' ') === 'api --method POST repos/o/r/issues/601/dependencies/blocked_by -F issue_id=9600'));
  assert.deepEqual(lines, ['filed #600 split', 'filed #601 rest', 'ok #354 commented, labels, blocked by #360', 'ok #601 blocked by #600']);
});

test('nothing is posted when a placeholder or a file is wrong', async () => {
  const { gh, calls } = fakeGh();
  await assert.rejects(run({ repo: 'o/r', new: [], issues: [{ number: 1, comment: 'see {{new:x}}' }] }, { gh, read: read({}) }), /#1: no new issue "x"/);
  await assert.rejects(run({ repo: 'o/r', issues: [{ number: 2, commentFile: 'gone.md' }] }, { gh, read: read({}) }), /ENOENT/);
  assert.equal(calls.length, 0);
});

test('a new issue with a number is not filed again, so a re-run after a failure fills the same number', async () => {
  const { gh, calls } = fakeGh();
  const { lines } = await run({ repo: 'o/r', new: [{ id: 'a', number: 593, title: 'A', body: 'x' }], issues: [{ number: 5, comment: 'see {{new:a}}' }] }, { gh, read: read({}) });
  assert.equal(calls.filter(c => c.args[1] === 'create').length, 0);
  assert.equal(calls.find(c => c.args[1] === 'comment').input, 'see #593');
  assert.deepEqual(lines, ['ok #5 commented']);
});

test('an edge that already exists is done, a close carries its reason, and a failed step fails only its issue', async () => {
  const { gh, calls } = fakeGh({
    'api --method POST repos/o/r/issues/364': 'Validation failed: Target issue has already been taken (HTTP 422)',
    'issue edit 8': 'label not found',
  });
  const plan = {
    repo: 'o/r',
    issues: [
      { number: 364, comment: 'c', blockedBy: [360] },
      { number: 277, comment: 'done in #304', close: 'completed' },
      { number: 8, comment: 'c', add: ['nope'], close: 'not planned' },
    ],
  };
  const { ok, lines } = await run(plan, { gh, read: read({}) });
  assert.equal(ok, false);
  assert.deepEqual(lines, ['ok #364 commented, blocked by #360 (already)', 'ok #277 commented, closed', 'FAIL #8 after commented: labels: label not found']);
  assert.deepEqual(calls.find(c => c.args.join(' ').startsWith('issue close 277')).args, ['issue', 'close', '277', '-R', 'o/r', '--reason', 'completed']);
  assert.ok(!calls.some(c => c.args.join(' ').startsWith('issue close 8')));
});

test('at most four issues are posted at once', async () => {
  let live = 0, peak = 0;
  const gh = async () => { peak = Math.max(peak, ++live); await new Promise(r => setTimeout(r, 5)); live--; return ''; };
  const issues = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, comment: 'c' }));
  const { lines } = await run({ repo: 'o/r', issues }, { gh, read: read({}) });
  assert.equal(peak, 4);
  assert.deepEqual(lines, issues.map(i => `ok #${i.number} commented`));
});
