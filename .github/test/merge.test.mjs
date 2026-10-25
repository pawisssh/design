// The merge script's checks (scripts/merge.mjs): the latest `test` run on the head must have passed, the test files a
// moved main makes it run on the merge tree, and the test files and pinned tools it reads from package.json and test.yml.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areas, isTestFile, mergeTreeTests, PINNED, runVerdict, testVerdict } from '../../scripts/merge.mjs';

const run = (status, conclusion, started_at, name = 'test') => ({ name, status, conclusion, started_at, check_suite: { id: 7 } });

test('the latest `test` run decides, a re-run included', () => {
  assert.deepEqual(testVerdict([run('completed', 'failure', '2026-10-22T10:00:00Z'), run('completed', 'success', '2026-10-22T11:00:00Z')], 'abc'),
    { ok: true, suite: 7 });
  assert.deepEqual(testVerdict([run('completed', 'success', '2026-10-22T10:00:00Z'), run('completed', 'failure', '2026-10-22T11:00:00Z')], 'abc'),
    { ok: false, why: '`test` ended failure on abc' });
});

test('--wait waits on a missing or running `test` run, never on a finished one', () => {
  assert.equal(testVerdict([], 'abc').pending, true);
  assert.equal(testVerdict([run('queued', null, '2026-10-22T10:00:00Z')], 'abc').pending, true);
  assert.equal(testVerdict([run('completed', 'failure', '2026-10-22T10:00:00Z')], 'abc').pending, undefined);
});

test('no `test` run, or one still running, is no pass', () => {
  assert.deepEqual(testVerdict([run('completed', 'success', '2026-10-22T10:00:00Z', 'lint')], 'abc'), { ok: false, pending: true, why: 'no `test` run on abc' });
  assert.deepEqual(testVerdict([run('in_progress', null, '2026-10-22T10:00:00Z')], 'abc'), { ok: false, pending: true, why: '`test` is in_progress on abc' });
});

test('areas name each skill apart and every other path by its first folder', () => {
  assert.deepEqual(areas(['skills/to-handoff/a.mjs', 'skills/to-handoff/test/b.mjs', 'skills/adapter-generic/c.mjs', 'docs/adr/0001-x.md', 'GLOSSARY.md']),
    ['GLOSSARY.md', 'docs', 'skills/adapter-generic', 'skills/to-handoff']);
});

const files = ['skills/to-handoff/test/signoff.test.mjs', 'skills/to-handoff/test/helpers.mjs', 'skills/vibe-to-figma/test/used.test.mjs', 'skills/to-handoff/scripts/validate.mjs',
  'skills/adapter-generic/tests/catalog.test.mjs', 'skills/adapter-carbon/test/sources.test.mjs', '.github/test/merge.test.mjs',
  'design-systems/shadcn/handoffs/request-access/handoff.json', 'scripts/merge.mjs', 'package.json', 'GLOSSARY.md'];

test('a moved main runs the tests of every area either side touches, data and docs having none of their own', () => {
  // #372 re-signed a Handoff under design-systems/ that no file imports and to-handoff's tests read; #371 changed to-handoff
  assert.deepEqual(mergeTreeTests(['design-systems/shadcn/handoffs/request-access/handoff.json'], ['skills/to-handoff/scripts/validate.mjs'], files),
    ['skills/to-handoff/test/signoff.test.mjs']);
  assert.deepEqual(mergeTreeTests(['skills/adapter-generic/scripts/x.mjs'], ['scripts/merge.mjs'], files),
    ['.github/test/merge.test.mjs', 'skills/adapter-generic/tests/catalog.test.mjs']);
});

test('sides with no tests of their own run none, and package.json runs every suite', () => {
  assert.deepEqual(mergeTreeTests(['GLOSSARY.md'], ['design-systems/shadcn/handoffs/request-access/handoff.json'], files), []);
  assert.deepEqual(mergeTreeTests(['package.json'], ['GLOSSARY.md'], files), ['.github/test/merge.test.mjs', 'skills/adapter-carbon/test/sources.test.mjs',
    'skills/adapter-generic/tests/catalog.test.mjs', 'skills/to-handoff/test/signoff.test.mjs', 'skills/vibe-to-figma/test/used.test.mjs']);
});

test('a skill whose files name a touched skill\'s paths runs its tests too', () => {
  // vibe-to-figma's tests import to-handoff's deps.mjs and read its fixtures: no area of either side's own
  assert.deepEqual(mergeTreeTests(['skills/to-handoff/test/fixtures/v0-app/page.tsx'], ['GLOSSARY.md'], files,
    { 'skills/to-handoff': ['skills/vibe-to-figma'] }), ['skills/to-handoff/test/signoff.test.mjs', 'skills/vibe-to-figma/test/used.test.mjs']);
});

test('a run passes only with exit 0 and nothing skipped', () => {
  assert.deepEqual(runVerdict(0, 'ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\n'), { ok: true });
  assert.match(runVerdict(0, 'ℹ tests 3\nℹ pass 1\nℹ skipped 2\n').why, /^2 test\(s\) skipped/);
  assert.match(runVerdict(1, '  ✖ signs the Handoff (3ms)\nℹ fail 1\nℹ skipped 0\n').why, /failed on the merge tree.*\n  ✖ signs the Handoff/s);
  assert.deepEqual(runVerdict(0, ''), { ok: false, why: 'the test run printed no summary' });
});

test('the test files are npm test\'s globs: a skill\'s test or tests folder and .github/test, not a fixture under them', () => {
  for (const f of ['skills/to-handoff/test/a.test.mjs', 'skills/to-design/tests/a.test.mjs', '.github/test/a.test.mjs']) assert.ok(isTestFile(f), f);
  for (const f of ['skills/to-handoff/test/fixtures/a.test.mjs', 'skills/to-handoff/test/helpers.mjs', 'scripts/a.test.mjs']) assert.ok(!isTestFile(f), f);
});

test('the pinned tools are the .scratch folders CI keeps', () => {
  assert.deepEqual(PINNED, ['adapter-carbon', 'adapter-cds', 'adapter-generic', 'to-handoff']);
});
