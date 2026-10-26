// The one fetch command (scripts/fetch.mjs): every skill's pinned fetch is run, and CI keeps what each one writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FETCHES } from '../../scripts/fetch.mjs';
import { PINNED } from '../../scripts/merge.mjs';

const repoFile = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('each fetch script writes into its own skill\'s .scratch folder', () => {
  assert.ok(FETCHES.some(f => f.script === 'skills/adapter-carbon/scripts/sources.mjs'), 'the fetch scripts are found');
  for (const { skill, script } of FETCHES) assert.ok(repoFile(script).includes(`.scratch/${skill}`), `${script} names .scratch/${skill}`);
});

test('CI\'s clean step keeps exactly the .scratch folders the fetch scripts write', () => {
  assert.deepEqual(PINNED, [...new Set(FETCHES.map(f => f.skill))]);
});

test('CI and CLAUDE.md run the one fetch command, not a skill\'s own', () => {
  const workflow = repoFile('.github/workflows/test.yml');
  assert.match(workflow, /^\s*- run: node scripts\/fetch\.mjs$/m);
  assert.doesNotMatch(workflow, /run: node skills\//);
  assert.ok(repoFile('CLAUDE.md').includes('node scripts/fetch.mjs'));
});
