// To-handoff on a v0 shadcn Prototype against the shadcn Design System (#125): the swap test for the Adapter
// interface. The fixture is the v0 sample as source plus lockfile; the Design System is a temp copy of the
// shadcn Foundations document and the Alert, Button and Card Contracts, so Contracts added later do not move these tests.
// Input, Label and Textarea are drafted mid-run from v0-app-drafts/, the Generic Adapter's output for the decisions' paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRuntime, hasTypescript } from '../scripts/deps.mjs';
import { contentHash, validate } from '../../contract/scripts/contract.mjs';
import { generate } from '../scripts/generate.mjs';
import { render } from '../scripts/render-html.mjs';
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
const noRender = async () => noTs || (!(await loadDesignSystem(shadcnDesignSystem())).adapter.available()
  && 'Generic preview packages missing; run: node skills/adapter-generic/scripts/sources.mjs');

// The committed shadcn Foundations document and Contracts, named one by one, in a temp Design System.
function shadcnDesignSystem() {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-shadcn-'));
  mkdirSync(join(dir, 'contracts'));
  copyFileSync(repo('design-systems/shadcn/shadcn.foundations.json'), join(dir, 'shadcn.foundations.json'));
  for (const family of ['alert', 'button', 'card'])
    copyFileSync(repo(`design-systems/shadcn/contracts/${family}.component.json`), join(dir, `contracts/${family}.component.json`));
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

test('generate: a Code Library component holding another module\'s components is walked like a wrapper, noted with its import', { skip: noTs }, async () => {
  const { handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  const usages = handoff.screens[0].regions.flatMap(r => r.usages);
  assert.equal(usages.find(u => u.raw && u.raw.element === 'Card'), undefined, 'Card is no usage');
  assert.deepEqual(handoff.source.notes.filter(n => /Card/.test(n.text)), [{ level: 'info', text:
    'Region `flex`: `Card` (@/components/ui/card, app/page.tsx:18:7) holds other Code Library usages, so it is read as a wrapper: its parts\' styles and text stay in the region, and the usages inside it are their own.' }]);
});

test('generate: the v0 Prototype is a valid Handoff; each shadcn Button and the Alert is its Contract by import, its tuple from its props', { skip: noTs }, async () => {
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
  const alerts = result.handoff.screens[0].regions.flatMap(r => r.usages).filter(u => u.contract === 'alert');
  assert.deepEqual(alerts.map(u => [u.at, u.match.by, u.tuple]), [['app/request-access-form.tsx:58:9', 'import', { variant: 'destructive' }]]);
  // Card holds other Code Library usages, so it is descended and its Contract goes unused (#151).
  assert.deepEqual(Object.keys(result.handoff.source.contracts), ['alert', 'button', 'input', 'label', 'select', 'textarea']);
});

test('generate: a family with no Contract is drafted mid-run by the Generic procedure, used, and written into contracts/ as the Adapter wrote it', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  const { handoff } = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  const usages = handoff.screens[0].regions.flatMap(r => r.usages);
  assert.deepEqual(usages.filter(u => ['input', 'label', 'select', 'textarea'].includes(u.contract)).map(u => [u.contract, u.at, u.match.by]), [
    ['label', 'app/request-access-form.tsx:65:9', 'agent'],
    ['input', 'app/request-access-form.tsx:66:9', 'agent'],
    ['label', 'app/request-access-form.tsx:69:9', 'agent'],
    ['input', 'app/request-access-form.tsx:70:9', 'agent'],
    ['label', 'app/request-access-form.tsx:73:9', 'agent'],
    ['select', 'app/request-access-form.tsx:74:9', 'agent'],
    ['label', 'app/request-access-form.tsx:86:9', 'agent'],
    ['textarea', 'app/request-access-form.tsx:87:9', 'agent'],
  ]);
  for (const [family, drafted] of [['input', 3], ['label', 3], ['select', 4], ['textarea', 3]]) {
    const draft = fileURLToPath(new URL(`fixtures/v0-app-drafts/${family}.component.json`, import.meta.url));
    assert.equal(readFileSync(join(ds, `contracts/${family}.component.json`), 'utf8'), readFileSync(draft, 'utf8'), family);
    assert.ok(handoff.source.notes.some(n => n.text.startsWith(`\`${family}\` is a Contract the Adapter wrote mid-run at status draft (${drafted} Drafted values); its check passed.`)), family);
  }
});

test('generate: a family the Generic Adapter cannot write mid-run is raw, with a question that says why', { skip: noTs }, async () => {
  const { handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  const usages = handoff.screens[0].regions.flatMap(r => r.usages);
  for (const [element, family, why] of [['Toaster', 'sonner', 'Toaster .* is not a flex or grid container']]) {
    const u = usages.find(x => x.raw && x.raw.element === element);
    assert.ok(u, element);
    const q = handoff.openQuestions.find(x => x.id === u.question);
    assert.equal(q.kind, 'no-contract');
    assert.match(q.text, new RegExp(`could not write one mid-run: .*${why}`), element);
    assert.ok(!q.text.includes('<family>') && q.text.includes(`and for ${family}; run node skills/adapter-generic/scripts/components.mjs --family ${family} `), element);
  }
});

test('render: the Rendering shows each Contract usage as the project\'s own component, raw ones flagged, pending sign-off', { skip: await noRender() }, async () => {
  const ds = shadcnDesignSystem();
  const result = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  const out = await render({ handoffPath: result.path, designSystem: ds });
  const html = readFileSync(out, 'utf8');
  const card = id => html.slice(html.indexOf(`<article class="card" id="usage-${id}">`)).split('</article>')[0];
  assert.match(card('button'), /<button data-slot="button" data-variant="outline" data-size="default"/);
  assert.match(card('button-3'), /<button data-slot="button" data-variant="link" data-size="sm"/);
  assert.match(card('alert'), /<div data-slot="alert" role="alert" class="[^"]*text-destructive/);
  assert.match(card('label'), /<label data-slot="label"/);
  assert.match(card('reason'), /<textarea data-slot="textarea"/);
  for (const id of ['name', 'email']) assert.match(card(id), /<input data-slot="input"/, id);
  // A provider family renders its Root around the Trigger (#153).
  assert.match(card('select'), /<button type="button" role="combobox"[^>]*data-slot="select-trigger"/);
  assert.match(card('toaster'), /data-g="∅"/);
  assert.match(html, /<option value="dark" data-class="dark">Dark<\/option>/, 'Dark applies as its selector\'s class');
  assert.ok(html.includes(result.contentHash.slice(7, 19)));
  assert.match(html, /pending sign-off/);
  assert.equal(readFileSync(await render({ handoffPath: result.path, designSystem: ds }), 'utf8'), html);
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
