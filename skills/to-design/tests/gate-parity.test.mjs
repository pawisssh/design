// The two fixed builder cores (ADR 0001) embed the same integrity gate (#17); this keeps them identical (#68).
// Each core marks its gate with "// gate begin" and "// gate end". Inside it, "// gate per-core begin" and
// "// gate per-core end" mark how that core counts plan entries, the one part that differs by slice.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CORES = ['builder-core.js', 'builder-core-components.js'];
const MARKERS = ['// gate begin', '// gate per-core begin', '// gate per-core end', '// gate end'];

// The gate's lines between its markers, with the per-core block and the core function's name replaced.
function gate(file) {
  const src = readFileSync(join(ROOT, 'skills/to-design/assets', file), 'utf8');
  const lines = src.split('\n');
  const at = MARKERS.map(m => {
    const hits = lines.flatMap((l, i) => (l.trim() === m ? [i] : []));
    assert.equal(hits.length, 1, `${file}: "${m}" must be one whole line, found ${hits.length}`);
    return hits[0];
  });
  assert.deepEqual([...at].sort((a, b) => a - b), at, `${file}: markers out of order`);
  const [begin, perBegin, perEnd, end] = at;
  assert.ok(perEnd - perBegin > 1, `${file}: per-core block is empty`);
  const name = src.match(/async\s+function\s+(\w+)\s*\(/)[1];
  return [...lines.slice(begin + 1, perBegin), '<per-core entries count>', ...lines.slice(perEnd + 1, end)]
    .join('\n').replaceAll(name, '<core>');
}

test('both builder cores embed an identical integrity gate', () => {
  const [a, b] = CORES.map(gate);
  for (const anchor of ['package-mismatch', 'fnv(<core>.toString())', "mismatch('entries'", 'wrong-file'])
    assert.ok(a.includes(anchor), `gate lacks ${anchor}`);
  assert.equal(b, a, `${CORES[1]}'s gate differs from ${CORES[0]}'s`);
});
