// To-handoff on a v0 shadcn Prototype against the shadcn Design System (#125): the swap test for the Adapter
// interface. The fixture is the v0 sample as source plus lockfile; the Design System is a temp copy of the
// shadcn Foundations document and Button Contract only, so Contracts added later do not move these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRuntime, hasTypescript } from '../scripts/deps.mjs';
import { contentHash, validate } from '../../contract/scripts/contract.mjs';
import { generate } from '../scripts/generate.mjs';
import { readReact } from '../scripts/react.mjs';
import { walk } from '../scripts/reader.mjs';
import { loadDesignSystem } from '../scripts/system.mjs';
import { validateHandoff } from '../scripts/validate.mjs';
import { repo } from './helpers.mjs';

const V0 = fileURLToPath(new URL('fixtures/v0-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
// The runtime test installs the fixture from its lockfile into the scratch run, so it needs the npm registry too.
const noRuntime = !hasRuntime() && 'the runtime packages or a browser are missing; run: node skills/to-handoff/scripts/deps.mjs';
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

test('generate: a Code Library component holding another library\'s usages is walked like a wrapper, noted with its import', { skip: noTs }, async () => {
  const { handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  const usages = handoff.screens[0].regions.flatMap(r => r.usages);
  assert.equal(usages.find(u => u.raw && u.raw.element === 'Card'), undefined, 'Card is no usage');
  assert.deepEqual(handoff.source.notes.filter(n => /Card/.test(n.text)), [{ level: 'info', text:
    'Region `flex`: `Card` (@/components/ui/card, app/page.tsx:18:7) holds other Code Library usages, so it is read as a wrapper: its parts\' styles and text stay in the region, and the usages inside it are their own.' }]);
});

test('generate: the v0 Prototype is a valid Handoff; each shadcn Button is its Contract by import, its tuple from its props', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  const result = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  assert.deepEqual(result.requests, []);
  assert.deepEqual(validateHandoff(result.handoff, await loadDesignSystem(ds)).errors, []);
  const buttons = result.handoff.screens[0].regions.flatMap(r => r.usages).filter(u => u.contract === 'button');
  assert.deepEqual(buttons.map(u => [u.at, u.match.by, u.tuple]), [
    ['app/request-access-form.tsx:48:9', 'import', { variant: 'outline' }],
    ['components/submit-button.tsx:11:5', 'import', {}],
    ['app/page.tsx:33:11', 'import', { variant: 'link', size: 'sm' }],
  ]);
  assert.deepEqual(Object.keys(result.handoff.source.contracts), ['button']);
});

test('generate: a family the Generic Adapter cannot write mid-run is raw, with a question that says why', { skip: noTs }, async () => {
  const { handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  const usages = handoff.screens[0].regions.flatMap(r => r.usages);
  for (const [element, why] of [['Input[required]', 'Input calls no cva'], ['Select', 'Select calls no cva'], ['Toaster', 'exports no Sonner']]) {
    const u = usages.find(x => x.raw && x.raw.element === element);
    assert.ok(u, element);
    const q = handoff.openQuestions.find(x => x.id === u.question);
    assert.equal(q.kind, 'no-contract');
    assert.match(q.text, new RegExp(`could not write one mid-run: .*${why}`), element);
  }
});

test('the committed approved Carbon Button Contract is unchanged since its approval and still validates', () => {
  const button = JSON.parse(readFileSync(repo('design-systems/carbon/contracts/button.component.json'), 'utf8'));
  const carbon = JSON.parse(readFileSync(repo('design-systems/carbon/carbon.foundations.json'), 'utf8'));
  assert.equal(contentHash(button), 'sha256:4a9e9f38d7a42ccfd0ea029241862365784bfe49b7f087e48ceee8ee07711bf5');
  assert.equal(button.selection.approval.contentHash, contentHash(button));
  assert.deepEqual(validate(button, carbon).errors, []);
});

test('runtime: one Next build screenshots each reached state at each Tailwind breakpoint, component sites included; the page maps to Light', { skip: noRuntime, timeout: 300000 }, async () => {
  const { handoff: h } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS, runtime: true });
  assert.equal(h.openQuestions.find(q => q.id === 'q-runtime'), undefined, 'the runtime reader ran');
  const [screen] = h.screens;
  assert.deepEqual(screen.breakpoints, ['sm', 'md', 'lg', 'xl', '2xl']);
  for (const state of ['default', 'loading', 'error', 'success'])
    for (const bp of screen.breakpoints) assert.equal(screen.states[state].screenshots[bp], `screens/index.${state}.${bp}.png`, `${state} at ${bp}`);
  assert.deepEqual(h.source.modes, { light: 'light' });
});
