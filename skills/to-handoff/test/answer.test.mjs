// handoff.mjs answer: the owner's answer to an open owner question, added to decisions.json as written, nothing else.
// The answers here are test inputs in a temp folder, never committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuestion } from '../scripts/handoff.mjs';

const CLI = fileURLToPath(new URL('../scripts/handoff.mjs', import.meta.url));
const HANDOFF = { openQuestions: [
  { id: 'q-prop-card', kind: 'prop', to: 'owner', text: 'Which value is it?', answer: null },
  { id: 'q-font', kind: 'font', to: 'owner', text: 'Use Geist?', answer: 'Geist', by: 'owner' },
  { id: 'q-data-x', kind: 'stand-in', to: 'developer', text: 'What does it do?', answer: null },
] };
// As the recorded files are: two-space indent, an escaped \u2026 the answer must leave as it is.
const DECISIONS_TEXT = '{\n  "acceptance": [\n    {\n      "then": "Sending\\u2026"\n    }\n  ],\n  "question:q-font": {\n    "by": "owner",\n    "answer": "Geist"\n  }\n}\n';

function folder(decisions = DECISIONS_TEXT) {
  const dir = mkdtempSync(join(tmpdir(), 'answer-'));
  writeFileSync(join(dir, 'handoff.json'), JSON.stringify(HANDOFF));
  writeFileSync(join(dir, 'decisions.json'), decisions);
  return { handoffPath: join(dir, 'handoff.json'), decisionsPath: join(dir, 'decisions.json') };
}

test('answer adds the owner entry at the end, leaving every other byte as it was', () => {
  const paths = folder();
  answerQuestion({ ...paths, id: 'q-prop-card', answer: 'Code-only: the footer’s layout.' });
  assert.equal(readFileSync(paths.decisionsPath, 'utf8'), DECISIONS_TEXT.replace(/\n}\n$/,
    ',\n  "question:q-prop-card": {\n    "by": "owner",\n    "answer": "Code-only: the footer’s layout."\n  }\n}\n'));
});

test('answer into an empty decisions file writes the one entry', () => {
  const paths = folder('{}\n');
  answerQuestion({ ...paths, id: 'q-prop-card', answer: 'Code-only.' });
  assert.deepEqual(JSON.parse(readFileSync(paths.decisionsPath, 'utf8')), { 'question:q-prop-card': { by: 'owner', answer: 'Code-only.' } });
});

test('answer refuses a question that is no open owner question, or one decisions.json already answers', () => {
  const paths = folder();
  assert.throws(() => answerQuestion({ ...paths, id: 'q-typo', answer: 'x' }), /q-typo is no question in .*handoff\.json/);
  assert.throws(() => answerQuestion({ ...paths, id: 'q-data-x', answer: 'x' }), /q-data-x is to the developer, not the owner/);
  assert.throws(() => answerQuestion({ ...paths, id: 'q-font', answer: 'x' }), /q-font is already answered in .*handoff\.json/);
  assert.equal(readFileSync(paths.decisionsPath, 'utf8'), DECISIONS_TEXT);
  const unanswered = folder('{\n  "question:q-prop-card": {\n    "by": "owner",\n    "to": "developer"\n  }\n}\n');
  assert.throws(() => answerQuestion({ ...unanswered, id: 'q-prop-card', answer: 'x' }), /question:q-prop-card is already in .*decisions\.json/);
  assert.throws(() => answerQuestion({ ...folder('[]\n'), id: 'q-prop-card', answer: 'x' }), /decisions\.json is no JSON object/);
});

test('the CLI answers with --decisions, --question and --answer', () => {
  const paths = folder();
  const r = spawnSync(process.execPath, [CLI, 'answer', paths.handoffPath, '--decisions', paths.decisionsPath, '--question', 'q-prop-card', '--answer', 'Code-only.'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^answered question:q-prop-card in .*decisions\.json; re-run generate with it/);
  assert.equal(JSON.parse(readFileSync(paths.decisionsPath, 'utf8'))['question:q-prop-card'].answer, 'Code-only.');
});
