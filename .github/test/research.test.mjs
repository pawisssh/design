// The research-note check (scripts/research.mjs): every source prefix is defined and cited, and every relative link resolves.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { anchors, problems } from '../../scripts/research.mjs';

test('the research notes cite only defined prefixes, cite every one, and link only to what is there', () => {
  assert.deepEqual(problems(), []);
});

test('an undefined prefix, an unused prefix, a broken link and a broken anchor are each reported', t => {
  const root = mkdtempSync(join(tmpdir(), 'research-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/research'), { recursive: true });
  writeFileSync(join(root, 'docs/research/other.md'), '# Other\n\n## Part two\n');
  writeFileSync(join(root, 'docs/research/a.md'), [
    '# A', '', '## Sources', '',
    '- `C4-CTX` = https://c4model.com/diagrams/system-context',
    '- `GH` = https://github.com/x/y',
    '- `UML` = https://www.omg.org/spec/UML',
    '', '## Findings', '',
    'Context first (`C4-CTX`), then `C4-CON`. — GH `src/a.ts`. `LICENSE` and `VECTOR` are not prefixes.',
    '[ok](other.md#part-two), [self](#findings), [web](https://example.com/x#y),',
    '[gone](missing.md), [lost](other.md#part-three), [here](#nowhere).',
    '', '```', '`FENCED-OUT` in a fence is code, [not](a/link.md)', '```', '',
  ].join('\n'));
  assert.deepEqual(problems(root, ['docs/research/a.md']), [
    { what: 'undefined prefix', file: 'docs/research/a.md', ref: 'C4-CON' },
    { what: 'unused prefix', file: 'docs/research/a.md', ref: 'UML' },
    { what: 'broken link', file: 'docs/research/a.md', ref: 'missing.md' },
    { what: 'broken anchor', file: 'docs/research/a.md', ref: 'other.md#part-three' },
    { what: 'broken anchor', file: 'docs/research/a.md', ref: '#nowhere' },
  ]);
});

test('a heading anchor drops punctuation and code ticks, and a repeat gets a number', () => {
  const text = '## 1.2 Source location (`sourceFile`)\n### Licence\n### Licence\n```\n# not a heading\n```\n';
  assert.deepEqual([...anchors(text)], ['12-source-location-sourcefile', 'licence', 'licence-1']);
});
