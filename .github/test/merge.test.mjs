// The merge script's checks (scripts/merge.mjs): the latest `test` run on the head must have passed, and the test
// files a moved main makes it run on the merge tree.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areas, sharedTests, testVerdict } from '../../scripts/merge.mjs';

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

const files = ['skills/to-handoff/test/signoff.test.mjs', 'skills/to-handoff/test/helpers.mjs', 'skills/to-handoff/scripts/validate.mjs',
  'skills/adapter-generic/tests/catalog.test.mjs', 'skills/adapter-carbon/test/sources.test.mjs', '.github/test/merge.test.mjs',
  'design-systems/shadcn/handoffs/request-access/handoff.json', 'scripts/merge.mjs', 'package.json', 'GLOSSARY.md'];

test('a moved main runs the tests of every area either side touches, data read by a skill\'s tests included (#373)', () => {
  // #372 re-signed a Handoff under design-systems/ that no file imports and to-handoff's tests read; #371 changed to-handoff
  assert.deepEqual(sharedTests(['design-systems/shadcn/handoffs/request-access/handoff.json'], ['skills/to-handoff/scripts/validate.mjs'], files),
    ['skills/to-handoff/test/signoff.test.mjs']);
  assert.deepEqual(sharedTests(['skills/adapter-generic/scripts/x.mjs'], ['scripts/merge.mjs'], files),
    ['.github/test/merge.test.mjs', 'skills/adapter-generic/tests/catalog.test.mjs']);
});

test('sides with no tests of their own run none, and package.json runs every suite (#373)', () => {
  assert.deepEqual(sharedTests(['GLOSSARY.md'], ['design-systems/shadcn/handoffs/request-access/handoff.json'], files), []);
  assert.deepEqual(sharedTests(['package.json'], ['GLOSSARY.md'], files), ['.github/test/merge.test.mjs', 'skills/adapter-carbon/test/sources.test.mjs',
    'skills/adapter-generic/tests/catalog.test.mjs', 'skills/to-handoff/test/signoff.test.mjs']);
});
