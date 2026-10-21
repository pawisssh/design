// Tests for the Generic Adapter's default-palette colours (#254): a Tailwind palette colour a family uses becomes a
// Foundations COLOR token, through foundations.mjs generate() and components.mjs generate() on a copy of the shadcn
// fixture whose Button uses some. They need the pinned tools (node skills/adapter-generic/scripts/sources.mjs).
// Run: node --test skills/adapter-generic/test/palette.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate as contractFor } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { DEFAULT_DIR, FIXTURE, hasTools, projectPins, toolDir } from '../scripts/sources.mjs';
import { approve, closure } from '../../contract/scripts/contract.mjs';
import { convert } from '../../contract/scripts/color.mjs';

const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';
const BUTTON = 'components/ui/button.tsx';
const BASE_END = `[&_svg:not([class*='size-'])]:size-4",`; // the end of Button's base classes

// A copy of the fixture project with Button's base classes extended by `classes`.
function withClasses(classes) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-palette-'));
  cpSync(FIXTURE, dir, { recursive: true });
  const file = join(dir, BUTTON);
  const text = readFileSync(file, 'utf8');
  const after = text.replace(BASE_END, `[&_svg:not([class*='size-'])]:size-4 ${classes}",`);
  assert.notEqual(after, text, 'the edit applies');
  writeFileSync(file, after);
  return dir;
}

// The value Tailwind's own theme gives a palette colour.
function themeValue(name) {
  const css = readFileSync(join(toolDir('tailwindcss', DEFAULT_DIR, projectPins(FIXTURE)), 'theme.css'), 'utf8');
  return new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css)[1].trim();
}

const drafts = JSON.parse(readFileSync(new URL('../fixtures/drafts/button.json', import.meta.url), 'utf8')).drafts;
const both = async project => {
  const { doc } = await library({ project, families: ['button'] });
  return { doc, ...(await contractFor({ project, family: 'button', foundations: doc, drafts })) };
};
const plain = skip ? null : library({ project: FIXTURE, families: ['button'] });
let used;
const palette = () => (used = used || both(withClasses('bg-slate-900 border-slate-200 hover:bg-orange-50')));

test('a family\'s default-palette colours become Color/<name> tokens, valued from Tailwind\'s theme through the shared converter', { skip }, async () => {
  const { doc } = await palette();
  for (const name of ['slate-900', 'slate-200', 'orange-50']) {
    const v = doc.variables[`color-${name}`];
    assert.ok(v, `${name} is a token`);
    assert.equal(v.name, `Color/${name}`);
    assert.equal(v.type, 'COLOR');
    assert.equal(v.collection, 'theme');
    assert.deepEqual(v.codeSyntax, { WEB: `var(--color-${name})` });
    assert.deepEqual(v.scopes, ['ALL_FILLS', 'EFFECT_COLOR', 'STROKE_COLOR']);
    assert.match(v.source, /^tailwindcss@\S+ theme\.css --color-/);
    const css = themeValue(name);
    for (const mode of ['light', 'dark']) {
      assert.equal(v.values[mode].value, convert(css).hex, `${name}/${mode}`);
      assert.equal(v.values[mode].from.css, css, `${name}/${mode} keeps Tailwind's CSS`);
    }
  }
});

test('only the colours a family uses are carried; they are in the closure and usedBy', { skip }, async () => {
  const { doc } = await palette();
  const carried = Object.keys(doc.variables).filter(k => /^color-/.test(k));
  assert.deepEqual(carried, ['color-orange-50', 'color-slate-200', 'color-slate-900']);
  for (const k of carried) {
    assert.deepEqual(doc.variables[k].usedBy, ['button'], k);
    assert.ok(doc.closure.tokens.includes(k), `${k} is in the closure`);
  }
});

test('Button binds the tokens, not hard-coded colours', { skip }, async () => {
  const { contract } = await palette();
  const bound = new Set(closure(contract));
  for (const k of ['color-slate-900', 'color-slate-200', 'color-orange-50']) assert.ok(bound.has(k), `${k} is bound`);
  assert.doesNotMatch(JSON.stringify(contract.paint), /"raw":"#(0f172b|e2e8f0|fff7ed)"/i);
});

test('the compiled cross-check covers each palette token', { skip }, async () => {
  const { doc } = await palette();
  const base = (await plain).doc;
  assert.equal(doc.checks.compiled.matched, base.checks.compiled.matched + 3);
});

test('an arbitrary colour stays a warning raw and does not block approve', { skip }, async () => {
  const { doc, contract } = await both(withClasses('bg-[#1A1F26]'));
  assert.ok(!Object.keys(doc.variables).some(k => /^color-/.test(k)), 'no token for an arbitrary colour');
  const raws = JSON.stringify(contract.paint).match(/"raw":"#1a1f26"[^}]*"level":"warning"/gi);
  assert.ok(raws, 'the arbitrary colour is a warning raw');
  assert.doesNotThrow(() => approve(contract, '2026-01-01T00:00:00Z'));
});

test('a palette colour with an opacity or a Dark override aliases the palette tokens', { skip }, async () => {
  const { doc, contract } = await both(withClasses('hover:bg-slate-900/50 dark:bg-slate-700'));
  const text = JSON.stringify(doc.variables);
  assert.match(text, /"alias":"color-slate-900"/);
  assert.match(text, /"alias":"color-slate-700"/);
  for (const k of ['color-slate-900', 'color-slate-700']) assert.ok(doc.variables[k], `${k} is in the document`);
  assert.ok(contract);
});

test('a family that uses no palette colour leaves the document without palette tokens', { skip }, async () => {
  const { doc } = await plain;
  assert.ok(!Object.keys(doc.variables).some(k => /^color-/.test(k)));
  assert.match(doc.notes.find(n => n.at === 'variables').message, /Tailwind's default theme \(its colour palette, shadows\) is not carried/);
});

test('a project @theme value for a palette name wins and names the project CSS as its source', { skip }, async () => {
  const project = withClasses('bg-slate-900');
  const css = join(project, 'app/globals.css');
  writeFileSync(css, `${readFileSync(css, 'utf8')}\n@theme {\n  --color-slate-900: #123456;\n}\n`);
  const { doc } = await both(project);
  const v = doc.variables['color-slate-900'];
  assert.equal(v.values.light.value, '#123456');
  assert.equal(v.source, 'app/globals.css @theme --color-slate-900');
});
