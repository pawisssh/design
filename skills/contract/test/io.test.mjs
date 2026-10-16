// Node-side Contract IO: the formatting-preserving writer and the foundations lookup.
// Run with `node --test skills/contract/test/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, asDraft } from '../scripts/contract.mjs';
import { foundationsPathFor, rewriteJson, writeJson } from '../scripts/io.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TEXT = readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8');
const BUTTON = JSON.parse(TEXT);

// The line numbers (1-based) where two texts differ, comparing line by line from the top and from the bottom.
function changedLines(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  let top = 0;
  while (top < x.length && top < y.length && x[top] === y[top]) top++;
  let bottom = 0;
  while (bottom < x.length - top && bottom < y.length - top && x[x.length - 1 - bottom] === y[y.length - 1 - bottom]) bottom++;
  return { from: top + 1, removed: x.length - top - bottom, added: y.length - top - bottom };
}

test('rewriting a document with its own value returns the text unchanged', () => {
  assert.equal(rewriteJson(TEXT, BUTTON), TEXT);
});

test('a draft reset and a re-approval touch only the selection lines, and round-trip to the same text', () => {
  const draft = rewriteJson(TEXT, asDraft(BUTTON));
  assert.deepEqual(JSON.parse(draft), asDraft(BUTTON));
  const selectionLine = TEXT.split('\n').findIndex(l => l.includes('"selection"')) + 1;
  const d = changedLines(TEXT, draft);
  // status (the first line inside the block) through approval (the last): nothing outside `selection`
  assert.deepEqual(d, { from: selectionLine + 1, removed: 4, added: 4 });
  assert.match(draft, /"status": "draft",[\s\S]*"approval": null\n  \}/);
  const again = rewriteJson(draft, approve(asDraft(BUTTON), BUTTON.selection.approval.at));
  assert.equal(again, TEXT);
});

test('an in-place rule edit changes one line and keeps the hand alignment around it', () => {
  const next = structuredClone(BUTTON);
  const rule = next.layout.find(r => r.set.Button && r.set.Button.gap && r.set.Button.gap.token === 'spacing-07');
  rule.set.Button.gap = { token: 'spacing-06', by: 'owner', was: { token: 'spacing-07' } };
  const out = rewriteJson(TEXT, next);
  assert.deepEqual(JSON.parse(out), next);
  const d = changedLines(TEXT, out);
  assert.deepEqual([d.removed, d.added], [1, 1]);
  assert.match(out.split('\n')[d.from - 1], /"gap": \{ "token": "spacing-06", "by": "owner", "was": \{ "token": "spacing-07" \} \}/);
});

test('members and items are added, removed and replaced in the style of their container', () => {
  const text = [
    '{',
    '  "a": 1,',
    '  "inline": { "x": 1, "y": 2 },',
    '  "list": [',
    '    { "k": 1 },',
    '    { "k": 2 }',
    '  ],',
    '  "empty": [],',
    '  "z": null',
    '}',
    '',
  ].join('\n');
  const v = JSON.parse(text);
  const cases = [
    { ...v, b: true },
    (({ a, ...rest }) => rest)(v),
    (({ z, ...rest }) => rest)(v),
    (({ a, inline, ...rest }) => rest)(v),
    { ...v, inline: { y: 2 } },
    { ...v, inline: { x: 1, y: 2, w: [1, 2] } },
    { ...v, inline: {} },
    { ...v, list: [...v.list, { k: 3 }] },
    { ...v, list: [v.list[0]] },
    { ...v, list: [] },
    { ...v, empty: [{ k: 1 }] },
    { ...v, z: { by: 'owner', at: '2026-10-16T00:00:00.000Z', snapshotId: 'sha256:abc', contentHash: 'sha256:def' } },
    { a: 2 },
    {},
  ];
  for (const next of cases) assert.deepEqual(JSON.parse(rewriteJson(text, next)), next, JSON.stringify(next));
  assert.match(rewriteJson(text, { ...v, b: true }), /"z": null,\n  "b": true\n\}/);
  assert.match(rewriteJson(text, { ...v, list: [...v.list, { k: 3 }] }), /\{ "k": 2 \},\n    \{ "k": 3 \}\n  \]/);
  assert.match(rewriteJson(text, { ...v, inline: { x: 1, y: 2, w: [1, 2] } }), /"inline": \{ "x": 1, "y": 2, "w": \[1, 2\] \}/);
  assert.match(rewriteJson(text, (({ a, ...rest }) => rest)(v)), /^\{\n  "inline"/);
});

test('random edits anywhere in the Button Contract always parse back to the new value', () => {
  let seed = 7;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const values = [null, 0, 'x', true, [], {}, [1, { a: 2 }], { token: 'spacing-01' }];
  const keysOf = v => (Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v));
  const isContainer = v => v !== null && typeof v === 'object' && keysOf(v).length > 0;
  const pick = () => structuredClone(values[rand(values.length)]);
  for (let round = 0; round < 300; round++) {
    const next = structuredClone(BUTTON);
    for (let e = 0; e < 1 + rand(3); e++) {
      let parent = next;
      for (let depth = rand(6); depth > 0; depth--) {
        const ks = keysOf(parent).filter(k => isContainer(parent[k]));
        if (!ks.length) break;
        parent = parent[ks[rand(ks.length)]];
      }
      const ks = keysOf(parent);
      const op = rand(3);
      if (op === 0 && ks.length) parent[ks[rand(ks.length)]] = pick();
      else if (op === 1 && ks.length && Array.isArray(parent)) parent.splice(rand(parent.length), 1);
      else if (op === 1 && ks.length) delete parent[ks[rand(ks.length)]];
      else if (Array.isArray(parent)) parent.push(pick());
      else parent[`k${round}`] = pick();
    }
    assert.deepEqual(JSON.parse(rewriteJson(TEXT, next)), next, `round ${round}`);
  }
});

test('writeJson keeps an existing file\'s formatting and writes a new file with two-space indents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-io-'));
  const path = join(dir, 'button.component.json');
  writeFileSync(path, TEXT);
  writeJson(path, asDraft(BUTTON));
  assert.equal(readFileSync(path, 'utf8'), rewriteJson(TEXT, asDraft(BUTTON)));
  const copy = join(dir, 'copy', 'button.component.json');
  writeJson(copy, BUTTON, { from: path });
  assert.equal(readFileSync(copy, 'utf8'), TEXT);
  const fresh = join(dir, 'sub', 'new.json');
  writeJson(fresh, { a: [1] });
  assert.equal(readFileSync(fresh, 'utf8'), '{\n  "a": [\n    1\n  ]\n}\n');
});

test('the foundations document is the one *.foundations.json next to the contracts folder, unless given', () => {
  const contract = join(ROOT, 'design-systems/carbon/contracts/button.component.json');
  assert.equal(foundationsPathFor(contract), join(ROOT, 'design-systems/carbon/carbon.foundations.json'));
  assert.equal(foundationsPathFor(contract, 'x.json'), 'x.json');
  const dir = mkdtempSync(join(tmpdir(), 'contract-io-'));
  mkdirSync(join(dir, 'contracts'));
  assert.throws(() => foundationsPathFor(join(dir, 'contracts', 'a.component.json')), /no single \*\.foundations\.json/);
});
