// The skill-subset test command (scripts/test.mjs): it finds a skill's suite in test/ or tests/ (#450).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs, testFilesOf } from '../../scripts/test.mjs';
import { repoFile } from '../../scripts/merge.mjs';

test('a skill\'s test files are found in test/ and in tests/', () => {
  assert.ok(testFilesOf('contract').includes('skills/contract/test/contract.test.mjs'));
  assert.ok(testFilesOf('to-design').length > 0, 'to-design keeps its suite in tests/');
});

test('an unknown skill, or a path that is not a skill folder, fails, naming it', () => {
  for (const name of ['no-such-skill', 'README.md', '../scripts']) assert.throws(() => testFilesOf(name), new RegExp(`no skill "${name.replace('.', '\\.')}"`));
});

test('package.json and CLAUDE.md name the command', () => {
  assert.match(JSON.parse(repoFile('package.json')).scripts['test:skills'], /^node scripts\/test\.mjs$/);
  assert.ok(repoFile('CLAUDE.md').includes('npm run test:skills -- '));
});

test('--name and --skip become node\'s name-pattern flags, apart from the skills they sit among (#588)', () => {
  assert.deepEqual(parseArgs(['to-handoff', '--name', '#230', 'contract', '--skip', 'runtime']), {
    skills: ['to-handoff', 'contract'], flags: ['--test-name-pattern=#230', '--test-skip-pattern=runtime'],
  });
  assert.throws(() => parseArgs(['contract', '--name']), /--name needs a regex/);
});
