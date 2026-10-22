// A wayfinder map's Decisions-so-far (scripts/map.mjs): one line per closed ticket, added without touching the rest.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionLine, unlinked, withDecision } from '../../scripts/map.mjs';

const url = n => `https://github.com/o/r/issues/${n}`;
const map = decisions => `## Destination\n\nA spec.\n\n## Decisions so far\n\n<!-- the index -->\n${decisions}\n## Not yet specified\n\n- fog\n`;

test('the line goes last in the Decisions list, and nothing else changes', () => {
  const body = map(`\n- [One](${url(1)}): first\n  continued\n- [Two](${url(2)}): second\n`);
  const line = decisionLine({ title: 'Three', html_url: url(3) }, 'third');
  assert.equal(withDecision(body, line, 3), map(`\n- [One](${url(1)}): first\n  continued\n- [Two](${url(2)}): second\n${line}\n`));
});

test('the first line starts the list a blank line after the template comment', () => {
  const line = decisionLine({ title: 'One', html_url: url(1) }, 'first');
  assert.equal(withDecision(map(''), line, 1), map(`\n${line}\n`));
});

test('a map that already links the ticket comes back as it is', () => {
  const body = map(`\n- [Thirty-one](${url(31)}): done\n`);
  assert.equal(withDecision(body, decisionLine({ title: 'Thirty-one', html_url: url(31) }, 'again'), 31), body);
  assert.notEqual(withDecision(body, decisionLine({ title: 'Three', html_url: url(3) }, 'new'), 3), body);
});

test('CRLF line endings are kept, and a body with no Decisions heading is refused', () => {
  const body = map(`\n- [One](${url(1)}): first\n`).replaceAll('\n', '\r\n');
  const out = withDecision(body, decisionLine({ title: 'Two', html_url: url(2) }, 'second'), 2);
  assert.equal(out, map(`\n- [One](${url(1)}): first\n- [Two](${url(2)}): second\n`).replaceAll('\n', '\r\n'));
  assert.throws(() => withDecision('## Destination\n', '- x', 1), /no "## Decisions so far" heading/);
});

test('a title\'s brackets are escaped, and a gist is one line', () => {
  assert.equal(decisionLine({ title: 'Read [x] files', html_url: url(5) }, ' gist '), `- [Read \\[x\\] files](${url(5)}): gist`);
  assert.throws(() => decisionLine({ title: 'T', html_url: url(5) }, 'two\nlines'), /one line/);
});

test('a closed ticket the map links nowhere is reported, unless it was a duplicate', () => {
  const body = map(`\n- [One](${url(1)}): first\n`) + `\n## Out of scope\n\n- [Four](${url(4)}): past the destination\n`;
  const kids = [
    { number: 1, state: 'closed', state_reason: 'completed' },
    { number: 2, state: 'closed', state_reason: 'completed' },
    { number: 3, state: 'open', state_reason: null },
    { number: 4, state: 'closed', state_reason: 'not_planned' },
    { number: 5, state: 'closed', state_reason: 'duplicate' },
  ];
  assert.deepEqual(unlinked(body, kids).map(c => c.number), [2]);
});

test('a link in another ticket\'s gist is not the ticket\'s own line', () => {
  const body = map(`\n- [Seven](${url(7)}): settled; implement in [Nine](${url(9)})\n`);
  const line = decisionLine({ title: 'Nine', html_url: url(9) }, 'ninth');
  assert.equal(withDecision(body, line, 9), map(`\n- [Seven](${url(7)}): settled; implement in [Nine](${url(9)})\n${line}\n`));
  assert.deepEqual(unlinked(body, [{ number: 9, state: 'closed', state_reason: 'completed' }]).map(c => c.number), [9]);
});

test('a ticket listed under Out of scope gets no Decisions line, and a link under Not yet specified lists nothing', () => {
  const body = map('') + `\n## Out of scope\n\n- [Four](${url(4)}): past the destination\n`;
  assert.equal(withDecision(body, decisionLine({ title: 'Four', html_url: url(4) }, 'again'), 4), body);
  const fog = map('').replace('- fog', `- [Six](${url(6)}) may graduate`);
  assert.deepEqual(unlinked(fog, [{ number: 6, state: 'closed', state_reason: 'completed' }]).map(c => c.number), [6]);
});
