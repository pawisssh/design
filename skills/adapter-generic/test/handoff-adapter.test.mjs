// The Generic Adapter's To-handoff module (#123): found by To-handoff's own loader from the shadcn Foundations
// document, its breakpoints read from the pinned Tailwind, and its Contract check over the committed Contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDesignSystem } from '../../to-handoff/scripts/system.mjs';
import * as adapter from '../scripts/handoff-adapter.mjs';
import { hasTools, toolDir } from '../scripts/sources.mjs';

const SHADCN = fileURLToPath(new URL('../../../design-systems/shadcn/', import.meta.url));
const noTools = !hasTools() && 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';

test('To-handoff loads the shadcn Design System with this module as its Adapter, and all five Contracts', async () => {
  const system = await loadDesignSystem(SHADCN);
  assert.equal(system.adapter.contractProcedure, adapter.contractProcedure);
  assert.deepEqual(Object.keys(system.contracts).sort(), ['alert', 'button', 'card', 'label', 'textarea']);
  for (const name of ['roleGroups', 'surfaces', 'breakpoints', 'contractProcedure', 'checkContract', 'available', 'renderer'])
    assert.ok(system.adapter[name], name);
});

test('each role group and surface names Foundations variables that exist', async () => {
  const { foundations } = await loadDesignSystem(SHADCN);
  const groups = new Set(Object.values(foundations.variables).map(v => v.name.split('/')[0]));
  for (const [role, list] of Object.entries(adapter.roleGroups)) for (const g of list) assert.ok(groups.has(g), `${role}: ${g}`);
  for (const token of Object.values(adapter.surfaces)) assert.equal(foundations.variables[token].name.split('/')[0], 'Color', token);
});

test('the breakpoints are the pinned Tailwind theme\'s --breakpoint-* variables, in px', { skip: noTools }, () => {
  const theme = readFileSync(join(toolDir('tailwindcss'), 'theme.css'), 'utf8');
  const declared = [...theme.matchAll(/--breakpoint-([\w-]+):\s*([\d.]+)rem;/g)].map(([, key, rem]) => ({ key, width: Number(rem) * 16 }));
  assert.deepEqual(adapter.breakpoints, declared);
});

test('the committed Contracts pass checkContract; a moved package pin or file hash does not', async () => {
  const { foundations, contracts } = await loadDesignSystem(SHADCN);
  for (const [key, c] of Object.entries(contracts)) assert.deepEqual(adapter.checkContract(c, foundations), [], key);
  const button = JSON.parse(JSON.stringify(contracts.button));
  button.source.packages.tailwindcss = '4.4.0';
  button.source.files['app/globals.css'] = 'sha256:00';
  const problems = adapter.checkContract(button, foundations);
  assert.ok(problems.some(p => /source\.packages tailwindcss is 4\.4\.0, not the pinned 4\.3\.3/.test(p)));
  assert.ok(problems.some(p => /source\.files app\/globals\.css is sha256:00/.test(p)));
});
