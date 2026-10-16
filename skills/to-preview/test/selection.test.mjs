// To-preview selection model (#33): specimens from the Contract, the locked Base Component and the
// omit patch round trip. Run: node --test skills/to-preview/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as contractModule from '../../contract/scripts/contract.mjs';

const require = createRequire(import.meta.url);
const Selection = require('../assets/selection-model.js');
const button = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url)));
const copy = o => JSON.parse(JSON.stringify(o));
const key = t => JSON.stringify(t);

// The Button Contract with one source-proven exclusion (Ghost 2XL, 5 tuples) and one owner omit (Focus).
function fixture() {
  const c = copy(button);
  c.excluded = [{ match: { kind: 'ghost', size: '2xl' }, reason: 'test exclusion', evidence: ['test'] }];
  c.selection.omit = [{ match: { state: 'focus' }, reason: 'owner: focus is reviewed on the Base Component' }];
  c.selection.expectedCount = 192; // 245 - 5 excluded - 48 focus (49 focus tuples, one of them excluded)
  return c;
}

test('specimens are the axes minus excluded; omitted tuples are present but unchecked', () => {
  const model = new Selection(fixture(), contractModule);
  const specimens = [...model.specimens.values()];
  assert.equal(specimens.length, 240);
  assert.ok(!specimens.some(s => s.tuple.kind === 'ghost' && s.tuple.size === '2xl'));
  assert.equal(model.selected.size, 192);
  const focus = specimens.filter(s => s.tuple.state === 'focus');
  assert.equal(focus.length, 48);
  assert.ok(focus.every(s => !model.selected.has(s.id)));
  assert.deepEqual(specimens[0].tuple, { kind: 'primary', size: 'xs', state: 'enabled' });
  assert.equal(specimens[0].name, 'Kind=Primary, Size=Extra Small, State=Enabled');
});

test('the Base Component is locked on: select, select all and clear visible never uncheck it', () => {
  const model = new Selection(fixture(), contractModule);
  const base = 'primary|lg|enabled';
  assert.equal(model.baseId, base);
  assert.throws(() => model.select(base, false), /Base Component.*locked/);
  model.selectAll(false);
  assert.deepEqual([...model.selected], [base]);
  model.selectAll(true);
  assert.equal(model.selected.size, 240);
  model.selectMatching({ kind: 'primary' }, false);
  assert.equal(model.selected.size, 240 - 35 + 1);
  assert.ok(model.selected.has(base));
});

const verifyAll = model => { for (const id of model.specimens.keys()) model.verify(id); };

test('omitPatch() is exactly {family, snapshotId, omit, expectedCount}, with whole-value patterns', () => {
  const c = fixture();
  const model = new Selection(c, contractModule);
  verifyAll(model);
  model.selectMatching({ state: 'hover' }, false);
  model.select('danger|sm|active', false);
  const patch = model.omitPatch();
  assert.deepEqual(Object.keys(patch).sort(), ['expectedCount', 'family', 'omit', 'snapshotId']);
  assert.deepEqual(patch, {
    family: 'button',
    snapshotId: c.source.snapshotId,
    omit: [{ state: 'focus' }, { state: 'hover' }, { kind: 'danger', size: 'sm', state: 'active' }],
    expectedCount: 192 - 48 - 1,
  });
});

test('round trip: omitPatch() applied to the Contract expands to exactly the checked tuples', () => {
  const c = fixture();
  const model = new Selection(c, contractModule);
  verifyAll(model);
  model.selectMatching({ kind: 'ghost' }, false);
  model.selectMatching({ size: 'xs', state: 'active' }, false);
  model.select('primary|md|focus', true); // re-include one omitted tuple
  const checked = model.checkedTuples();
  const applied = contractModule.applyOmit(c, model.omitPatch());
  assert.deepEqual(contractModule.expand(applied).map(key).sort(), checked.map(key).sort());
  assert.equal(applied.selection.status, 'draft');
  assert.equal(applied.selection.approval, null);
});

test('an unchanged selection exports the Contract omit list unchanged', () => {
  const c = fixture();
  const model = new Selection(c, contractModule);
  verifyAll(model);
  assert.deepEqual(model.omitPatch().omit, c.selection.omit.map(o => o.match));
});

test('a Contract pattern swallowed by a whole value now off is dropped, not repeated', () => {
  const c = copy(button);
  c.selection.omit = [{ match: { kind: 'ghost', state: 'focus' }, reason: 'owner' }];
  c.selection.expectedCount = 238;
  const model = new Selection(c, contractModule);
  model.selectMatching({ kind: 'ghost' }, false);
  verifyAll(model);
  const patch = model.omitPatch();
  assert.deepEqual(patch.omit, [{ kind: 'ghost' }]);
  assert.equal(patch.expectedCount, 210);
});

test('export needs every checked specimen rendered', () => {
  const model = new Selection(fixture(), contractModule);
  for (const id of model.specimens.keys()) if (id !== 'secondary|sm|hover') model.verify(id);
  assert.throws(() => model.omitPatch(), /not rendered.*Kind=Secondary, Size=Small, State=Hover/);
  model.select('secondary|sm|hover', false);
  assert.equal(model.omitPatch().expectedCount, 191);
});
