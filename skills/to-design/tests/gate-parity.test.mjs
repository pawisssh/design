// The two fixed builder cores (ADR 0001) embed the same integrity gate (#17); this keeps them identical (#68).
// Each core marks its gate with "// gate begin" and "// gate end". Inside it, "// gate per-core begin" and
// "// gate per-core end" mark how that core counts plan entries, the one part that differs by slice
// (as plan_entries() in package_native_builder.py does).
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CORES = ['builder-core.js', 'builder-core-components.js'];
const MARKERS = ['// gate begin', '// gate per-core begin', '// gate per-core end', '// gate end'];

// The gate's text between its markers, with the per-core block replaced by a placeholder.
function gateText(file) {
  const src = readFileSync(join(ROOT, 'skills/to-design/assets', file), 'utf8');
  // The packager requires this name, so the two cores share it and the gate's core hash reads the same.
  assert.match(src, /^async function buildComponentSets\(/m, `${file}: core function is not buildComponentSets`);
  const lines = src.split('\n');
  const markerLines = MARKERS.map(m => {
    const hits = lines.flatMap((l, i) => (l.trim() === m ? [i] : []));
    assert.equal(hits.length, 1, `${file}: "${m}" must be one whole line, found ${hits.length}`);
    return hits[0];
  });
  assert.deepEqual([...markerLines].sort((x, y) => x - y), markerLines, `${file}: markers out of order`);
  const [begin, perBegin, perEnd, end] = markerLines;
  // The per-core block only counts entries; a check moved into it would escape the comparison.
  const perCore = lines.slice(perBegin + 1, perEnd).join('\n');
  assert.match(perCore, /^\s*const entries = /, `${file}: per-core block must start with const entries =`);
  assert.doesNotMatch(perCore, /\breturn\b|;\s*\S/, `${file}: per-core block must hold only the entries count`);
  return [...lines.slice(begin + 1, perBegin), '<per-core entries count>', ...lines.slice(perEnd + 1, end)].join('\n');
}

test('both builder cores embed an identical integrity gate', () => {
  const [first, second] = CORES.map(gateText);
  for (const anchor of ['package-mismatch', 'fnv(buildComponentSets.toString())', "mismatch('entries'", 'wrong-file'])
    assert.ok(first.includes(anchor), `gate lacks ${anchor}`);
  assert.equal(second, first, `${CORES[1]}'s gate differs from ${CORES[0]}'s`);
});
