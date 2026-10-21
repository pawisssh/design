// The ADR check (scripts/adr.mjs): every ADR number is unique, and every reference names an ADR that is there.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { nextNumber, numbersIn, problems } from '../../scripts/adr.mjs';

test('the repo has no duplicate ADR number and no reference to a missing ADR', () => {
  assert.deepEqual(problems(), []);
});

// The missing numbers are written as `ADR ${'9998'}`, so the repo-wide scan does not read this file as citing them.
test('a duplicate number, a missing number and a broken link are each reported', t => {
  const root = mkdtempSync(join(tmpdir(), 'adr-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  mkdirSync(join(root, 'skills/x'), { recursive: true });
  writeFileSync(join(root, 'docs/adr/0001-one.md'), '# One\n');
  writeFileSync(join(root, 'docs/adr/0002-two.md'), '# Two, see [0001](0001-one.md)\n');
  writeFileSync(join(root, 'docs/adr/0002-also-two.md'), '# Also two\n');
  writeFileSync(join(root, 'skills/x/SKILL.md'), `ADR 0001 holds; ADR ${'9998'} does not. [gone](../../docs/adr/0003-gone.md), [other](../y/0004-not-an-adr.md)\n`);
  writeFileSync(join(root, 'skills/x/a.mjs'), `// ADR-0002 and ADR ${'9999'}\n`);
  const found = problems(root, ['docs/adr/0002-two.md', 'skills/x/SKILL.md', 'skills/x/a.mjs']);
  assert.deepEqual(found, [
    { what: 'duplicate number', file: 'docs/adr/0002-two.md', ref: 'docs/adr/0002-also-two.md' },
    { what: 'no such ADR', file: 'skills/x/SKILL.md', ref: `ADR ${'9998'}` },
    { what: 'broken ADR link', file: 'skills/x/SKILL.md', ref: '../../docs/adr/0003-gone.md' },
    { what: 'no such ADR', file: 'skills/x/a.mjs', ref: `ADR ${'9999'}` },
  ]);
});

test('the next number is one past the highest one taken, here or in an open PR', () => {
  assert.deepEqual(numbersIn(['docs/adr/0014-a.md', 'docs/adr/README.md', 'GLOSSARY.md', 'skills/x/docs/adr/0099-b.md']), [14]);
  assert.equal(nextNumber([13, 17, 14]), '0018');
  assert.equal(nextNumber([]), '0001');
});
