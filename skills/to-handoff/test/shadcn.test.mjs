// To-handoff on a v0 shadcn Prototype against the shadcn Design System (#125): the swap test for the Adapter
// interface. The fixture is the v0 sample as source plus lockfile; the Design System is a temp copy of the
// shadcn Foundations document and the Alert, Button and Card Contracts, so Contracts added later do not move these tests.
// Input, Label and Textarea are drafted mid-run from v0-app-drafts/, the Generic Adapter's output for the decisions' paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRuntime, hasTypescript } from '../scripts/deps.mjs';
import { contentHash, validate } from '../../contract/scripts/contract.mjs';
import { generate } from '../scripts/generate.mjs';
import { render } from '../scripts/render-html.mjs';
import { readReact } from '../scripts/react.mjs';
import { walk } from '../scripts/reader.mjs';
import { matchComputed } from '../scripts/match.mjs';
import { loadDesignSystem } from '../scripts/system.mjs';
import { validateHandoff } from '../scripts/validate.mjs';
import { repo, shadcnDesignSystem, V0 } from './helpers.mjs';

const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
// The runtime test installs the fixture from its lockfile into the scratch run, so it needs the npm registry too.
const noRuntime = !hasRuntime() && 'the runtime packages or a browser are missing; run: node skills/to-handoff/scripts/deps.mjs';
const BUTTON_PACKAGE = '@/components/ui/button';
const elements = (root, pick) => { const out = []; walk(root, el => { if (pick(el)) out.push(el); }); return out; };
const DECISIONS = JSON.parse(readFileSync(join(V0, 'decisions.json'), 'utf8'));
const noRender = async () => noTs || (!(await loadDesignSystem(shadcnDesignSystem())).adapter.available()
  && 'Generic preview packages missing; run: node skills/adapter-generic/scripts/sources.mjs');

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

test('generate: the font question names the loaded fonts and the font the shadcn Text Styles use (#160)', { skip: noTs }, async () => {
  const { handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-font').text,
    'The Prototype loads Geist from next/font/google (app/layout.tsx:2:10), Geist_Mono from next/font/google (app/layout.tsx:2:17); the Text Styles use Geist. Use Geist?');
});

test('generate: with no Text Styles in the Design System, the font question names the loaded fonts and asks which to use', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  const file = join(ds, 'shadcn.foundations.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.textStyles = {};
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const { handoff } = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-font').text,
    'The Prototype loads Geist from next/font/google (app/layout.tsx:2:10), Geist_Mono from next/font/google (app/layout.tsx:2:17); shadcn has no Text Styles to name a font. Which font should the Text Styles use?');
});

test('generate: a Code Library container with no Contract is walked like a wrapper, noted with its import', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  rmSync(join(ds, 'contracts/card.component.json'));
  const { handoff } = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  const usages = handoff.screens[0].regions.flatMap(r => r.usages);
  assert.equal(usages.find(u => u.raw && u.raw.element === 'Card'), undefined, 'Card is no usage');
  assert.deepEqual(usages.filter(u => u.in), []);
  assert.deepEqual(handoff.source.notes.filter(n => /Card/.test(n.text)), [{ level: 'info', text:
    'Region `main`: `Card` (@/components/ui/card, app/page.tsx:18:7) holds other Code Library usages, so it is read as a wrapper: its parts\' styles and text stay in the region, and the usages inside it are their own.' }]);
  assert.deepEqual(handoff.screens[0].regions.find(r => r.id === 'main').text.map(t => [t.copy, handoff.copy[t.copy].text]).slice(0, 2), [
    ['card-title', 'Request workspace access'],
    ['card-description', 'Tell us who you are and an admin will approve you within a day.'],
  ]);
});

test('generate: a Code Library container with a Contract is its Usage by import, and the Usages inside it name it in `in` (#194)', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  const { handoff } = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  assert.deepEqual(validateHandoff(handoff, await loadDesignSystem(ds)).errors, []);
  const main = handoff.screens[0].regions.find(r => r.id === 'main');
  const card = main.usages.find(u => u.contract === 'card');
  assert.deepEqual(card, {
    id: 'card', contract: 'card', tuple: { 'card-footer': 'card-footer' },
    properties: { title: 'copy:card-title', description: 'copy:card-description' },
    match: { by: 'import' },
    offAxis: [{ property: 'CardFooter.className', raw: '"justify-between text-xs text-muted-foreground"', reason: 'CardFooter className is no card axis or property', question: 'q-prop-card' }],
    question: 'q-prop-card',
    at: 'app/page.tsx:18:7',
  });
  assert.deepEqual(handoff.copy['card-title'], { text: 'Request workspace access', at: 'app/page.tsx:22:24' });
  assert.deepEqual(handoff.copy['card-description'], { text: 'Tell us who you are and an admin will approve you within a day.', at: 'app/page.tsx:25:13' });
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-prop-card').text,
    '`CardFooter` at app/page.tsx:31:9 sets className="justify-between text-xs text-muted-foreground", which is no card axis or property. Which value is it, or does the Contract need it?');
  // `usages` stays flat, in reading order: the Card first, then each Usage inside it.
  assert.deepEqual(handoff.screens[0].regions.flatMap(r => r.usages).map(u => [u.id, u.in]), [
    ['card', undefined],
    ['button', 'card'], ['alert', 'card'],
    ['label', 'card'], ['name', 'card'], ['label-2', 'card'], ['email', 'card'],
    ['label-3', 'card'], ['select', 'card'], ['label-4', 'card'], ['reason', 'card'],
    ['button-2', 'card'], ['button-3', 'card'],
    ['toaster', undefined],
  ]);
  // Text in no part the Contract knows stays region text; the Card's own copy leaves it.
  assert.deepEqual(main.text.map(t => [handoff.copy[t.copy].text, t.at]), [
    ['Thanks! Your request is in.', 'app/request-access-form.tsx:47:36'],
    ['Already a member?', 'app/page.tsx:32:17'],
  ]);
  assert.deepEqual(handoff.source.notes.filter(n => /Card/.test(n.text)), []);
  assert.ok('card' in handoff.source.contracts);
  // The states still see the conditional content inside the Card.
  assert.equal(handoff.screens[0].states.error.content, '`status === "error"` is true; conditional content shown: form, alert');
});

test('generate: a Card with no CardFooter has the Slot axis\'s empty value', { skip: noTs }, async () => {
  const dir = copy();
  const page = join(dir, 'app/page.tsx');
  const text = readFileSync(page, 'utf8');
  writeFileSync(page, text.slice(0, text.indexOf('        <CardFooter')) + text.slice(text.indexOf('</CardFooter>\n') + '</CardFooter>\n'.length));
  const { handoff } = await generate({ prototype: dir, designSystem: shadcnDesignSystem(), decisions: DECISIONS });
  const card = handoff.screens[0].regions.flatMap(r => r.usages).find(u => u.contract === 'card');
  assert.deepEqual([card.tuple, card.offAxis], [{ 'card-footer': 'none' }, undefined]);
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
  // Card holds other Code Library usages: a container, its Contract used by import (#194).
  assert.deepEqual(Object.keys(result.handoff.source.contracts), ['alert', 'button', 'card', 'input', 'label', 'select', 'textarea']);
});

test('read: a fetch to an API route the Prototype serves itself is a stub-route Stand-in, with the states its caller sets (#341)', { skip: noTs }, () => {
  const doc = readReact(V0, { packages: [BUTTON_PACKAGE] });
  assert.deepEqual(doc.standIns.stubs.map(f => ({ ...f, offset: undefined, at: doc.at(f.offset) })), [{
    route: '/api/request-access', method: 'POST', file: 'app/api/request-access/route.ts', name: 'onSubmit', offset: undefined, at: 'app/request-access-form.tsx:31:23',
    delay: 800, failures: [500], sets: ['status'], before: ['status === "loading"'], after: ['status === "error"', 'status === "success"'],
  }]);
  // The route is read, so editing the stub is Drift; it is no longer ignored, and its own timer is the stub's latency, not simulated work.
  assert.ok(doc.files.includes('app/api/request-access/route.ts'));
  assert.deepEqual(doc.ignored.filter(x => /API route/.test(x)), []);
  assert.deepEqual(doc.standIns.simulated, []);
});

test('generate: the stub route is a data Stand-in with a developer question, and the submit flow goes loading, then success or error (#341)', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  const result = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  const h = result.handoff;
  assert.deepEqual(h.data.map(x => [x.id, x.source, x.at, x.question]), [['request-access', 'simulated', 'app/request-access-form.tsx:31:23', 'q-data-request-access']]);
  const q = h.openQuestions.find(x => x.id === 'q-data-request-access');
  assert.deepEqual({ kind: q.kind, to: q.to }, { kind: 'stand-in', to: 'developer' });
  // What the Stand-in pretends to do (a delay, a 500), never how: the route's `includes("fail")` stays out of the Handoff.
  assert.match(h.data[0].note, /POST \/api\/request-access.*800ms.*500/);
  for (const text of [h.data[0].note, q.text]) assert.doesNotMatch(text, /includes|"fail"|email/);
  assert.deepEqual(h.flow, [
    { from: 'default', trigger: 'onSubmit() calls POST /api/request-access', to: 'loading', source: 'simulated' },
    { from: 'loading', trigger: 'POST /api/request-access fails', to: 'error', source: 'simulated' },
    { from: 'loading', trigger: 'POST /api/request-access answers ok', to: 'success', source: 'simulated' },
  ]);
  assert.match(h.screens[0].states.loading.trigger, /onSubmit\(\) sets status === "loading" before POST \/api\/request-access/);
  assert.deepEqual(validateHandoff(h, await loadDesignSystem(ds)).errors, []);
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

test('render: a container Usage\'s card lists the Usages nested in it, indented, and deeper nesting chains the same way (#195)', { skip: await noRender() }, async () => {
  const ds = shadcnDesignSystem();
  const result = await generate({ prototype: V0, designSystem: ds, decisions: DECISIONS });
  const card = (html, id) => html.slice(html.indexOf(`<article class="card" id="usage-${id}">`)).split('</article>')[0];
  const html = readFileSync(await render({ handoffPath: result.path, designSystem: ds }), 'utf8');
  assert.ok(card(html, 'card').endsWith('<p>Nested in card:</p><ul>'
    + '<li><a href="#usage-button">button</a> · <code>button</code> variant=outline</li>'
    + '<li><a href="#usage-alert">alert</a> · <code>alert</code> variant=destructive</li>'
    + '<li><a href="#usage-label">label</a> · <code>label</code></li>'
    + '<li><a href="#usage-name">name</a> · <code>input</code></li>'
    + '<li><a href="#usage-label-2">label-2</a> · <code>label</code></li>'
    + '<li><a href="#usage-email">email</a> · <code>input</code></li>'
    + '<li><a href="#usage-label-3">label-3</a> · <code>label</code></li>'
    + '<li><a href="#usage-select">select</a> · <code>select</code></li>'
    + '<li><a href="#usage-label-4">label-4</a> · <code>label</code></li>'
    + '<li><a href="#usage-reason">reason</a> · <code>textarea</code></li>'
    + '<li><a href="#usage-button-2">button-2</a> · <code>button</code></li>'
    + '<li><a href="#usage-button-3">button-3</a> · <code>button</code> variant=link size=sm</li>'
    + '</ul>\n'), card(html, 'card'));
  // A card nothing names in `in` lists nothing.
  for (const id of ['button', 'alert', 'toaster']) assert.ok(!card(html, id).includes('Nested in'), id);

  // A container inside the container: its Usages list under it in the outer card, and in its own card.
  const h = JSON.parse(readFileSync(result.path, 'utf8'));
  for (const u of h.screens[0].regions.flatMap(r => r.usages)) if (u.id === 'button-2' || u.id === 'button-3') u.in = 'alert';
  writeFileSync(result.path, JSON.stringify(h, null, 2) + '\n');
  const chained = readFileSync(await render({ handoffPath: result.path, designSystem: ds }), 'utf8');
  assert.ok(card(chained, 'card').includes('<li><a href="#usage-alert">alert</a> · <code>alert</code> variant=destructive<ul>'
    + '<li><a href="#usage-button-2">button-2</a> · <code>button</code></li>'
    + '<li><a href="#usage-button-3">button-3</a> · <code>button</code> variant=link size=sm</li>'
    + '</ul></li>'), card(chained, 'card'));
  assert.ok(card(chained, 'card').endsWith('<li><a href="#usage-reason">reason</a> · <code>textarea</code></li></ul>\n'));
  assert.ok(card(chained, 'alert').endsWith('<p>Nested in alert:</p><ul>'
    + '<li><a href="#usage-button-2">button-2</a> · <code>button</code></li>'
    + '<li><a href="#usage-button-3">button-3</a> · <code>button</code> variant=link size=sm</li>'
    + '</ul>\n'), card(chained, 'alert'));
});

test('the committed approved Carbon Button Contract is unchanged since its approval and still validates', () => {
  const button = JSON.parse(readFileSync(repo('design-systems/carbon/contracts/button.component.json'), 'utf8'));
  const carbon = JSON.parse(readFileSync(repo('design-systems/carbon/carbon.foundations.json'), 'utf8'));
  assert.equal(contentHash(button), 'sha256:4a9e9f38d7a42ccfd0ea029241862365784bfe49b7f087e48ceee8ee07711bf5');
  assert.equal(button.selection.approval.contentHash, contentHash(button));
  assert.deepEqual(validate(button, carbon).errors, []);
});

test('runtime: one Next build screenshots each reached state at each Tailwind breakpoint, component sites included; the page maps to Light', { skip: noRuntime, timeout: 600000 }, async () => {
  const { handoff: h } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: DECISIONS, runtime: true });
  assert.equal(h.openQuestions.find(q => q.id === 'q-runtime'), undefined, 'the runtime reader ran');
  const [screen] = h.screens;
  assert.deepEqual(screen.breakpoints, ['sm', 'md', 'lg', 'xl', '2xl']);
  for (const state of ['default', 'loading', 'error', 'success'])
    for (const bp of screen.breakpoints) assert.equal(screen.states[state].screenshots[bp], `screens/index.${state}.${bp}.png`, `${state} at ${bp}`);
  assert.deepEqual(h.source.modes, { light: 'light' });
});

test('matchComputed: a Foundations name binds only where one of its Mode values is the rendered colour; redefined, it matches by value (#284)', async () => {
  const system = await loadDesignSystem(shadcnDesignSystem());
  // A built shadcn theme defines its tokens' own names as literals, and this Prototype redefines --primary.
  const ctx = { system, mode: 'light', custom: { '--background': 'oklch(1 0 0)', '--primary': 'oklch(0.6 0.2 30)' } };
  assert.deepEqual(matchComputed({ property: 'background-color', value: 'oklch(1 0 0)', ref: 'var(--background)' }, ctx), { kind: 'reference', token: 'background' });
  const redefined = matchComputed({ property: 'background-color', value: 'oklch(0.6 0.2 30)', ref: 'var(--primary)' }, ctx);
  assert.equal(redefined.kind, 'off-system', 'not primary by name: Foundations primary is #171717 or #e5e5e5');
  assert.equal(matchComputed({ property: 'background-color', value: 'oklch(0.205 0 0)', ref: 'var(--primary)' }, ctx).token, 'primary', 'a name that paints its own value still binds');
});

test('matchComputed: a length binds a Foundations name only where the token is the rendered length; redefined, it matches by value (#285)', async () => {
  const system = await loadDesignSystem(shadcnDesignSystem());
  const ctx = { system, mode: 'light', custom: { '--radius': '0.75rem' } };
  assert.deepEqual(matchComputed({ property: 'border-top-left-radius', value: '10px', ref: 'var(--radius)' }, ctx), { kind: 'reference', token: 'radius-lg' });
  const redefined = matchComputed({ property: 'border-top-left-radius', value: '12px', ref: 'var(--radius)' }, ctx);
  assert.notEqual(redefined.kind, 'reference', 'not radius-lg by name: Foundations radius-lg is 10');
  assert.equal(matchComputed({ property: 'padding-top', value: '16px' }, ctx).token, 'spacing-4');
  assert.equal(matchComputed({ property: 'margin-left', value: '0px' }, ctx).kind, 'skip');
  assert.equal(matchComputed({ property: 'font-size', value: '16px' }, ctx).kind, 'skip', 'text metrics match as Text Styles, not here');
});
