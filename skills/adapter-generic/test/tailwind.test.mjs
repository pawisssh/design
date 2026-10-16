// Tailwind's compile() with no bundler (#118): the fixture's CSS imports `tailwindcss`, `tw-animate-css` and
// `shadcn/tailwind.css`, and the plain file loader resolves all three from the pinned tools. Skipped without them
// (node skills/adapter-generic/scripts/sources.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, utilityRule } from '../scripts/tailwind.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';

const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';
const css = () => readFileSync(join(FIXTURE, 'app/globals.css'), 'utf8');
const base = join(FIXTURE, 'app');

test('the fixture CSS, with shadcn/tailwind.css, compiles without a bundler', { skip }, async () => {
  const out = await build(css(), ['bg-primary', 'data-open:bg-accent', 'animate-in', 'p-1.5'], { base });
  assert.deepEqual(utilityRule(out, 'bg-primary'), { 'background-color': 'var(--primary)' });
  assert.deepEqual(utilityRule(out, 'p-1.5'), { padding: 'calc(var(--spacing) * 1.5)' });
  assert.match(out, /\[data-state="open"\]/, 'shadcn/tailwind.css custom variants are applied');
  assert.match(out, /\.animate-in \{/, 'tw-animate-css utilities are applied');
});

test('a @plugin is refused: nothing from a package is executed', { skip }, async () => {
  await assert.rejects(build(`${css()}\n@plugin "@tailwindcss/typography";\n`, ['p-1'], { base }), /executes no package or project code/);
});

test('an @import outside the pinned stylesheet packages is refused', { skip }, async () => {
  await assert.rejects(build('@import "bootstrap/dist/css/bootstrap.css";', ['p-1'], { base }), /not a pinned stylesheet package/);
});
