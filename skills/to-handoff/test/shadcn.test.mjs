// To-handoff on a v0 shadcn Prototype against the shadcn Design System (#125): the swap test for the Adapter
// interface. The fixture is the v0 sample as source plus lockfile; the Design System is a temp copy of the
// shadcn Foundations document and Button Contract only, so Contracts added later do not move these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTypescript } from '../scripts/deps.mjs';
import { generate } from '../scripts/generate.mjs';
import { readReact } from '../scripts/react.mjs';
import { walk } from '../scripts/reader.mjs';
import { repo } from './helpers.mjs';

const V0 = fileURLToPath(new URL('fixtures/v0-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
const BUTTON_PACKAGE = '@/components/ui/button';
const elements = (root, pick) => { const out = []; walk(root, el => { if (pick(el)) out.push(el); }); return out; };
const DECISIONS = JSON.parse(readFileSync(join(V0, 'decisions.json'), 'utf8'));

// The committed shadcn Foundations document and Button Contract, named one by one, in a temp Design System.
function shadcnDesignSystem() {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-shadcn-'));
  mkdirSync(join(dir, 'contracts'));
  copyFileSync(repo('design-systems/shadcn/shadcn.foundations.json'), join(dir, 'shadcn.foundations.json'));
  copyFileSync(repo('design-systems/shadcn/contracts/button.component.json'), join(dir, 'contracts/button.component.json'));
  return dir;
}
const copy = () => { const dir = mkdtempSync(join(tmpdir(), 'to-handoff-v0-')); cpSync(V0, dir, { recursive: true }); return dir; };

test('read: a Code Library import that resolves to a Contract package file is a Design System leaf; other ui imports stay ui', { skip: noTs }, () => {
  const doc = readReact(V0, { packages: [BUTTON_PACKAGE] });
  const leaves = elements(doc.screens[0].root, el => el.component);
  const byExport = name => leaves.filter(el => el.component.export === name).map(el => ({ kind: el.component.kind, module: el.component.module, at: doc.at(el.offset) }));
  assert.deepEqual(byExport('Button'), [
    { kind: 'ds', module: BUTTON_PACKAGE, at: 'app/request-access-form.tsx:48:9' },
    { kind: 'ds', module: BUTTON_PACKAGE, at: 'components/submit-button.tsx:11:5' },
    { kind: 'ds', module: BUTTON_PACKAGE, at: 'app/page.tsx:33:11' },
  ]);
  assert.deepEqual([...new Set(byExport('Input').map(l => `${l.kind} ${l.module}`))], ['ui @/components/ui/input']);
});

test('read: a relative import of the same file is the Contract package too', { skip: noTs }, () => {
  const dir = copy();
  const file = join(dir, 'components/submit-button.tsx');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"@/components/ui/button"', '"./ui/button"'));
  const doc = readReact(dir, { packages: [BUTTON_PACKAGE] });
  const submit = elements(doc.screens[0].root, el => el.component && doc.at(el.offset).startsWith('components/submit-button.tsx'));
  assert.deepEqual(submit.map(el => el.component.module), [BUTTON_PACKAGE]);
});

test('generate: with no Text Styles in the Design System, the font question names the loaded fonts and asks which to use', { skip: noTs }, async () => {
  const { handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-font').text,
    'The Prototype loads Geist from next/font/google (app/layout.tsx:2:10), Geist_Mono from next/font/google (app/layout.tsx:2:17); shadcn has no Text Styles to name a font. Which font should the Text Styles use?');
});
