// A Slot axis (#121, ADR 0011) reads back through the `visible` wiring (#93): the slot node's visibility is the
// tuple's `filled`, carried as variant wiring for the unchanged cores, never as a layout fragment.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expand } from '../../contract/scripts/contract.mjs';
import { defaultProps, expectedVariant } from '../scripts/readback.mjs';

const BUTTON = JSON.parse(readFileSync(new URL('../../contract/test/fixtures/slot-axis/button.component.json', import.meta.url), 'utf8'));

test('readback shows the slot exactly where the Slot axis fills it, as wiring, not layout', () => {
  const props = defaultProps(BUTTON);
  const wirings = new Set();
  for (const t of expand(BUTTON)) {
    const exp = expectedVariant(BUTTON, t, props);
    const filled = BUTTON.axes.find(a => a.key === 'icon').values.find(v => v.key === t.icon).filled;
    assert.equal(exp.visible.Icon, filled, exp.name);
    for (const [node, fields] of Object.entries(exp.layout)) assert.ok(!('visible' in fields), `${exp.name}: ${node} keeps visible in its layout`);
    assert.equal(exp.refs.Icon.mainComponent, 'swapIcon', `${exp.name}: the swap still binds the slot`);
    wirings.add(JSON.stringify(exp.visible));
  }
  // empty slot; filled slot with the label; an icon-only size (filled, no label)
  assert.equal(wirings.size, 3);
});

test('the generated shadcn Button reads back its two slot frames the same way', () => {
  const shadcn = JSON.parse(readFileSync(new URL('../../../design-systems/shadcn/contracts/button.component.json', import.meta.url), 'utf8'));
  const slots = shadcn.axes.filter(a => a.slot);
  assert.deepEqual(slots.map(a => a.slot), ['Icon Inline Start', 'Icon Inline End']);
  const props = defaultProps(shadcn);
  for (const t of expand(shadcn)) {
    const exp = expectedVariant(shadcn, t, props);
    for (const a of slots) assert.equal(exp.visible[a.slot], a.values.find(v => v.key === t[a.key]).filled, exp.name);
    for (const [node, fields] of Object.entries(exp.layout)) assert.ok(!('visible' in fields), `${exp.name}: ${node} keeps visible in its layout`);
  }
});
