// The merge script's gate (scripts/merge.mjs): the latest `test` run on the head must have passed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areas, testVerdict } from '../../scripts/merge.mjs';

const run = (status, conclusion, started_at, name = 'test') => ({ name, status, conclusion, started_at, check_suite: { id: 7 } });

test('the latest `test` run decides, a re-run included', () => {
  assert.deepEqual(testVerdict([run('completed', 'failure', '2026-10-22T10:00:00Z'), run('completed', 'success', '2026-10-22T11:00:00Z')], 'abc'),
    { ok: true, suite: 7 });
  assert.deepEqual(testVerdict([run('completed', 'success', '2026-10-22T10:00:00Z'), run('completed', 'failure', '2026-10-22T11:00:00Z')], 'abc'),
    { ok: false, why: '`test` ended failure on abc' });
});

test('no `test` run, or one still running, is no pass', () => {
  assert.deepEqual(testVerdict([run('completed', 'success', '2026-10-22T10:00:00Z', 'lint')], 'abc'), { ok: false, why: 'no `test` run on abc' });
  assert.deepEqual(testVerdict([run('in_progress', null, '2026-10-22T10:00:00Z')], 'abc'), { ok: false, why: '`test` is in_progress on abc' });
});

test('areas name each skill apart and every other path by its first folder', () => {
  assert.deepEqual(areas(['skills/to-handoff/a.mjs', 'skills/to-handoff/test/b.mjs', 'skills/adapter-generic/c.mjs', 'docs/adr/0001-x.md', 'GLOSSARY.md']),
    ['GLOSSARY.md', 'docs', 'skills/adapter-generic', 'skills/to-handoff']);
});
