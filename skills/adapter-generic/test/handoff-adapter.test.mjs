// The Generic Adapter's side of To-handoff (#125): what To-handoff reads from handoff-adapter.mjs, checked against
// the committed shadcn Design System and the pinned Tailwind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { breakpoints, checkContract, roleGroups, surfaces } from '../scripts/handoff-adapter.mjs';
import { hasTools, toolDir } from '../scripts/sources.mjs';

const read = p => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));
const foundations = read('design-systems/shadcn/shadcn.foundations.json');
const button = read('design-systems/shadcn/contracts/button.component.json');
const clone = x => JSON.parse(JSON.stringify(x));
const noTools = !hasTools() && 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';

test('checkContract: the committed shadcn Button Contract passes', () => {
  assert.deepEqual(checkContract(button, foundations), []);
});

test('checkContract: a Contract off the Design System pin fails, naming each field', () => {
  const moved = clone(button);
  moved.source.adapter = 'carbon';
  moved.source.packages.tailwindcss = '4.3.4';
  moved.source.files['app/globals.css'] = 'sha256:00';
  assert.deepEqual(checkContract(moved, foundations), [
    'source.adapter is "carbon", not "generic"',
    'source.packages tailwindcss is 4.3.4, not the pinned 4.3.3',
    'source.files app/globals.css is not the snapshot\'s sha256:15fd52bd462719c6469cb5978ece7a907e9558ac22050005abe8b865524e05e1',
  ]);
});

test('checkContract: a family\'s own component file is its own; a file of the snapshot it drops is not', () => {
  const card = clone(button);
  card.code.package = '@/components/ui/card';
  delete card.source.files['components/ui/button.tsx'];
  card.source.files['components/ui/card.tsx'] = 'sha256:ab';
  assert.deepEqual(checkContract(card, foundations), []);
  delete card.source.files['package-lock.json'];
  assert.deepEqual(checkContract(card, foundations), ['source.files has no package-lock.json; the snapshot pins it']);
});

test('the role groups and surfaces name groups and theme tokens of the shadcn Foundations document', () => {
  const groups = new Set(Object.values(foundations.variables).filter(v => !v.family && !v.hidden).map(v => v.name.split('/')[0]));
  assert.deepEqual([...new Set(Object.values(roleGroups).flat())].filter(g => !groups.has(g)), []);
  for (const key of Object.values(surfaces)) assert.equal(foundations.variables[key].collection, 'theme', key);
});

test('the breakpoints are the pinned Tailwind theme\'s --breakpoint-*, in px, narrowest first', { skip: noTools }, () => {
  const theme = readFileSync(join(toolDir('tailwindcss'), 'theme.css'), 'utf8');
  const tailwind = [...theme.matchAll(/--breakpoint-([\w-]+):\s*([\d.]+)rem;/g)].map(m => ({ key: m[1], width: parseFloat(m[2]) * 16 }));
  assert.equal(tailwind.length, 5);
  assert.deepEqual(breakpoints, tailwind);
});
