// Sample and theme reads split by the plan (#456): the CDS Button's 11 verify indexes (#442 ticket 5) were refused as
// one call above SETS_BUDGET, and a 6-variant sample read already neared use_figma's 20KB output. The plan splits
// `sample` into calls (`batch` of `of`), each within the budget and the output estimate.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, asDraft, contentHash, expand, icons } from '../../contract/scripts/contract.mjs';
import { documentHash, READ_OUTPUT, readEstimate, SETS_BUDGET, setsPlan } from '../scripts/build-plan.mjs';
import { px } from '../../contract/test/spinner.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/cds/cds.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const AT = '2026-10-28T00:00:00.000Z';
const FILE_KEY = 'MOCKFILEKEY';
const cdsButton = () => JSON.parse(readFileSync(join(ROOT, 'design-systems/cds/contracts/button.component.json'), 'utf8'));
const BUTTON = approve(cdsButton(), AT, { prototype: true });
// the indexes #442 ticket 5 picked: the base, one per kind and the extreme sizes and states
const ISSUE = [5, 60, 65, 69, 96, 141, 212, 268, 339, 400, 474];

// A ledger as the live file's holds it: the foundations and icons built, and the set placed with every variant id,
// each id as long as Figma's.
function ledgerFor(contract) {
  let n = 0;
  const id = () => `${1000 + n}:${10000 + n++}`;
  return {
    schemaVersion: 1, fileKey: FILE_KEY,
    foundations: { documentHash: documentHash(DOC_TEXT),
      variables: Object.fromEntries(Object.keys(DOC.variables).map(k => [k, `VariableID:${id()}`])),
      textStyles: Object.fromEntries(Object.keys(DOC.textStyles).map(k => [k, `S:${'a'.repeat(40)},${id()}`])) },
    icons: { components: Object.fromEntries(icons(contract).map(k => [k, { id: id(), key: 'k'.repeat(40) }])) },
    sets: { [contract.family.key]: { page: id(), section: id(), set: { id: id(), key: 'k'.repeat(40), name: contract.figma.componentSetName },
      props: {}, variants: expand(contract).map(id), total: expand(contract).length, snapshotId: contract.source.snapshotId,
      contentHash: contentHash(contract), documentHash: documentHash(DOC_TEXT), builtAt: AT, placed: true } },
  };
}
const LEDGER = ledgerFor(BUTTON);
const derive = (options, contract = BUTTON, ledger = LEDGER) =>
  setsPlan(contract, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, prototype: true, ...options });
const chars = ({ plan, state }) => JSON.stringify(plan).length + JSON.stringify(state).length;

for (const mode of ['sample', 'theme'])
  test(`the issue's 11 ${mode} indexes split into calls that each fit SETS_BUDGET and the read output`, () => {
    assert.equal(expand(BUTTON).length, 480);
    assert.throws(() => derive({ mode, sample: ISSUE }), e => /takes \d+ calls: give --batch 0\.\.\d+/.test(e.message) && !/--per-call/.test(e.message));
    const { of } = derive({ mode, sample: ISSUE, batch: 0 }).plan.options;
    assert.ok(of > 1, `${of} call`);
    const read = [];
    for (let batch = 0; batch !== of; batch++) {
      const call = derive({ mode, sample: ISSUE, batch });
      assert.deepEqual([call.plan.options.batch, call.plan.options.of], [batch, of]);
      assert.ok(chars(call) <= SETS_BUDGET, `call ${batch}: ${chars(call)} chars`);
      assert.ok(readEstimate(call.plan) <= READ_OUTPUT, `call ${batch}: about ${readEstimate(call.plan)} bytes out`);
      read.push(...call.plan.selection.entries.map(e => e[0]));
    }
    assert.deepEqual(read, ISSUE, 'every index once, in the order given');
    assert.throws(() => derive({ mode, sample: ISSUE, batch: of }), /batch must be 0\.\./);
  });

test('the read estimate covers what the CDS Button read live, and stays under the 20KB output', () => {
  // #456: 3,312 bytes for one sample variant, 19,380 for six; a theme read 2,566 bytes for six
  const one = derive({ mode: 'sample', sample: [474] }).plan;
  assert.ok(readEstimate(one) >= 3312, `${readEstimate(one)} bytes`);
  assert.ok(readEstimate(derive({ mode: 'theme', sample: ISSUE.slice(0, 6) }).plan) >= 2566);
  assert.ok(READ_OUTPUT < 20000);
  // a sample that fits one call takes no --batch, as before
  const small = derive({ mode: 'sample', sample: [5, 60] });
  assert.equal(small.plan.options.of, undefined);
  assert.deepEqual(small.plan.selection.entries.map(e => e[0]), [5, 60]);
});

test('a variant too large for any call alone is refused naming --sample, never --per-call', () => {
  // the CDS Button with sixty more layers, each its own size: one variant's read is past the output alone
  const big = asDraft(cdsButton());
  const set = {};
  for (let i = 0; i !== 60; i++) { big.anatomy.children.push({ name: `Extra ${i}`, type: 'FRAME' }); set[`Extra ${i}`] = { width: px(i + 1), height: px(i + 1) }; }
  big.layout.push({ match: {}, set });
  const approved = approve(big, AT, { prototype: true });
  for (const mode of ['sample', 'theme'])
    assert.throws(() => derive({ mode, sample: [5] }, approved, ledgerFor(approved)),
      e => /--sample/.test(e.message) && /index 5/.test(e.message) && !/--per-call/.test(e.message), mode);
});
