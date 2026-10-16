// The component source reader (#119): cva calls and function components, read from the TypeScript AST of the
// fixture project's components. Skipped without the pinned tools (node skills/adapter-generic/scripts/sources.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSource } from '../scripts/source.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';

const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';
const read = (file, text) => readSource(text === undefined ? readFileSync(join(FIXTURE, file), 'utf8') : text, file);

test('Button: cva variants, values, defaults and the line of each class list', { skip }, () => {
  const { cvas } = read('components/ui/button.tsx');
  const v = cvas.buttonVariants;
  assert.equal(v.base.line, 7);
  assert.match(v.base.classes, /^group\/button inline-flex /);
  assert.deepEqual(Object.keys(v.variants), ['variant', 'size']);
  assert.deepEqual(Object.keys(v.variants.variant), ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link']);
  assert.deepEqual(Object.keys(v.variants.size), ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg']);
  assert.equal(v.variants.size['icon-lg'].classes, 'size-9');
  assert.equal(v.variants.variant.outline.line, 13, 'the line of the string, not of its key');
  assert.deepEqual(v.defaults, { variant: 'default', size: 'default' });
  assert.deepEqual(v.compound, []);
});

test('Button: the exported root, its element, data-slot, prop-driven attributes and defaults', { skip }, () => {
  const { components } = read('components/ui/button.tsx');
  assert.deepEqual(components.map(c => c.name), ['Button']);
  const b = components[0];
  assert.equal(b.exported, true);
  assert.equal(b.element, 'button', 'Comp resolves to the literal branch of `asChild ? Slot.Root : "button"`');
  assert.equal(b.slot, 'button');
  assert.equal(b.cva, 'buttonVariants');
  assert.deepEqual(b.attrs, { 'data-variant': { prop: 'variant' }, 'data-size': { prop: 'size' } });
  assert.deepEqual(b.defaults, { variant: 'default', size: 'default', asChild: false });
});

test('Card: literal prop unions, class strings and every exported part', { skip }, () => {
  const { cvas, components } = read('components/ui/card.tsx');
  assert.deepEqual(cvas, {});
  assert.deepEqual(components.map(c => [c.name, c.slot, c.element]), [
    ['Card', 'card', 'div'], ['CardHeader', 'card-header', 'div'], ['CardTitle', 'card-title', 'div'],
    ['CardDescription', 'card-description', 'div'], ['CardAction', 'card-action', 'div'],
    ['CardContent', 'card-content', 'div'], ['CardFooter', 'card-footer', 'div']]);
  const card = components[0];
  assert.deepEqual(card.unions, { size: ['default', 'sm'] });
  assert.deepEqual(card.defaults, { size: 'default' });
  assert.match(card.classes[0].classes, /^group\/card flex flex-col /);
  assert.ok(components.every(c => c.exported));
});

test('a cva with compoundVariants is read, not dropped', { skip }, () => {
  const text = `import { cva } from "class-variance-authority"
const v = cva("p-1", { variants: { tone: { a: "bg-primary", b: "bg-secondary" } },
  compoundVariants: [{ tone: "a", className: "p-2" }], defaultVariants: { tone: "a" } })`;
  assert.deepEqual(read('x.tsx', text).cvas.v.compound, [{ match: { tone: 'a' }, classes: 'p-2', line: 3 }]);
});
