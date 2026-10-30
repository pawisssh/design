// Usage recognition through its interface (#379): small reader-shaped trees against the committed Carbon and shadcn
// Design Systems, loaded once, with a decider stub instead of a generate run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTypescript } from '../scripts/deps.mjs';
import { readReact } from '../scripts/react.mjs';
import { loadDesignSystem } from '../scripts/system.mjs';
import { recogniseUsages } from '../scripts/usages.mjs';
import { repo } from './helpers.mjs';

const carbon = await loadDesignSystem(repo('design-systems/carbon'));
const shadcn = await loadDesignSystem(repo('design-systems/shadcn'));
const DRAFTS = 'skills/to-handoff/test/fixtures/v0-app-drafts';
const TAILWIND = fileURLToPath(new URL('fixtures/tailwind-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';

// A reader element: a component's tag is its export; text children are text nodes; every child knows its parent.
let offset = 0;
const el = (tag, { component, attrs = {} } = {}, ...children) => {
  const node = { type: 'element', tag, attrs, classes: [], children: [], cond: [], component, offset: offset++ };
  for (const c of children) {
    if (typeof c === 'string') node.children.push({ type: 'text', parts: [c] });
    else { c.parent = node; node.children.push(c); }
  }
  return node;
};
// A component of `module`, shipped as a package (ds) or as a local ui/ file (ui).
const from = (module, kind = 'ds') => (name, attrs, ...children) => el(name, { component: { kind, module, export: name }, attrs }, ...children);
const card = from('@/components/ui/card');
const button = from('@/components/ui/button');
const alert = from('@/components/ui/alert');
const carbonReact = from('@carbon/react');

// A decider that answers from `answers` and records every question it was asked.
const decider = (answers = {}) => ({
  asked: [],
  ask(key, request, check) {
    this.asked.push({ key, ...request });
    if (!Object.hasOwn(answers, key)) return undefined;
    const problem = check && check(answers[key]);
    if (problem) throw new Error(problem);
    return answers[key];
  },
});
const recognise = (root, { system = shadcn, answers, drafts, at = x => `at:${x.offset}` } = {}) => {
  const d = decider(answers);
  return { ...recogniseUsages({ root, system, rules: [], decider: d, describe: x => ({ text: 'Pick one', at: at(x) }), drafts }), d };
};
const named = ({ recognised }) => recognised.map(r => [r.el.tag, r.answer && (r.answer.contract || r.answer.noContract), r.within && r.within.tag]);

test('a component holding another component is a Container with its parts; one holding none is a leaf', () => {
  const footer = card('CardFooter', {}, 'Already a member?');
  const save = button('Button', { variant: 'outline' }, el('span', {}, 'Save'));
  const { recognised } = recognise(el('div', {}, card('Card', {}, card('CardContent', {}, save), footer)));
  const [container, leaf] = recognised;
  assert.deepEqual([container.el.tag, container.byImport, container.parts.map(p => p.tag)], ['Card', true, ['CardContent', 'CardFooter']]);
  assert.deepEqual([leaf.el, leaf.parts, leaf.within], [save, undefined, container.el]);
  // A Card with only its own parts holds no other component: it is a leaf, its parts its content.
  const alone = recognise(el('div', {}, card('Card', {}, card('CardTitle', {}, 'Hi'))));
  assert.deepEqual(alone.recognised.map(r => [r.el.tag, r.parts]), [['Card', undefined]]);
});

test('a package\'s part is named after its Container; a local ui/ file\'s part is anything from its module (ADR 0020)', () => {
  // @carbon/react holds every component: ModalBody is Modal's part, the Button beside it is its own Usage.
  const modal = carbonReact('Modal', {}, carbonReact('ModalBody', {}, carbonReact('Button', { kind: 'primary', size: 'md' }, 'Save')), carbonReact('Button', { kind: 'ghost', size: 'md' }, 'Cancel'));
  const pkg = recognise(el('div', {}, modal), { system: carbon });
  assert.deepEqual(named(pkg), [['Button', 'button', null], ['Button', 'button', null]]);
  assert.equal(pkg.claimOf(modal.children[0]).claim, 'open');
  // A local file is one family: its Hint is Field's part, walked with it, though not named after it.
  const field = from('@/components/ui/field', 'ui');
  const local = recognise(el('div', {}, field('Field', {}, field('Hint', {}, 'Required'), button('Button', {}, 'Go'))));
  assert.deepEqual(named(local), [['Button', 'button', null]]);
  assert.deepEqual(local.d.asked, []);
});

test('a Container\'s Slot axis is filled when its part is rendered, empty when it is not (#194)', () => {
  const tuple = (...kids) => recognise(el('div', {}, card('Card', {}, button('Button', {}, 'Go'), ...kids))).recognised[0].answer.tuple;
  assert.deepEqual(tuple(card('CardFooter', {}, 'Footnote')), { 'card-footer': 'card-footer' });
  assert.deepEqual(tuple(), { 'card-footer': 'none' });
});

test('an import\'s tuple comes from its props; an axis prop with no value is unmapped, a styling prop no axis names is stray (#62)', () => {
  const { recognised } = recognise(el('div', {}, carbonReact('Button', { kind: 'danger', size: 'huge', tooltipPosition: 'top', id: 'go', onClick: { parts: [] } }, 'Go')), { system: carbon });
  assert.deepEqual(recognised.map(({ answer, byImport, unmapped, stray }) => ({ answer, byImport, unmapped, stray })), [
    { answer: { contract: 'button', tuple: { kind: 'danger' } }, byImport: true, unmapped: ['size'], stray: ['tooltipPosition'] },
  ]);
});

test('a draft that passes the Adapter\'s check is the Contract it drafted, without changing the Design System; one that fails is a raw usage (#115)', () => {
  const { select, ...contracts } = shadcn.contracts;
  const system = { ...shadcn, contracts };
  const pick = () => el('div', {}, from('@/components/ui/select')('Select', {}, 'Team'));
  const answer = { draft: 'select', tuple: {}, via: 'library', reason: 'shadcn ships Select, with no Contract' };
  const passed = recognise(pick(), { system, answers: { 'recognise:Select': answer, 'contract:select': { path: `${DRAFTS}/select.component.json` } } });
  assert.deepEqual(passed.recognised.map(r => [r.key, r.answer]), [['recognise:Select', { contract: 'select', tuple: {}, via: 'library' }]]);
  assert.deepEqual(passed.d.asked.map(q => [q.key, q.candidates.includes('contract:select')]), [['recognise:Select', false], ['contract:select', false]]);
  // The question shows what `describe` gave; with no runtime size, its evidence has no `rendered`.
  const [asked] = passed.d.asked;
  assert.deepEqual([asked.question, asked.evidence], ['What is `Select` ("Pick one")?', { at: [`at:${passed.recognised[0].el.offset}`] }]);
  const drafted = passed.drafts.get('select');
  assert.deepEqual([drafted.contract.selection.status, drafted.write, typeof drafted.text], ['draft', true, 'string']);
  assert.deepEqual(Object.keys(system.contracts), Object.keys(contracts), 'system.contracts is not changed');
  // A later screen given the drafts finds the drafted Contract by import, with no question.
  const later = recognise(pick(), { system, drafts: passed.drafts });
  assert.deepEqual(later.recognised.map(r => [r.answer, r.byImport]), [[{ contract: 'select', tuple: {} }, true]]);
  assert.deepEqual(later.d.asked, []);

  const failed = recognise(pick(), { system, answers: { 'recognise:Select': answer, 'contract:select': { path: `${DRAFTS}/input.component.json` } } });
  assert.deepEqual(failed.recognised.map(r => r.answer), [{
    noContract: 'select', reason: answer.reason, failed: `its draft at ${DRAFTS}/input.component.json fails the Adapter's check: its family is \`input\`, not \`select\``,
  }]);
  assert.deepEqual(failed.drafts.get('select'), { failed: failed.recognised[0].answer.failed });
});

test('a Usage inside a Container names it in `within`, and a Container inside one names the outer (#194)', () => {
  const { recognised } = recognise(el('div', {}, card('Card', {}, alert('Alert', { variant: 'destructive' }, alert('AlertTitle', {}, 'Failed'), button('Button', {}, 'Retry')), button('Button', {}, 'Send'))));
  assert.deepEqual(named({ recognised }), [['Card', 'card', null], ['Alert', 'alert', 'Card'], ['Button', 'button', 'Alert'], ['Button', 'button', 'Card']]);
});

test('each element claims one of usage, part, consumed (by a leaf usage, a part\'s known text or a <label for>), wrapper or open', () => {
  const inside = el('span', {}, 'Send');
  const send = button('Button', {}, inside);
  const title = card('CardTitle', {}, el('strong', {}, 'Request access'));
  const footer = card('CardFooter', {}, 'Already a member?');
  const label = el('label', { attrs: { for: 'email' } }, 'Email');
  const email = from('@/components/ui/input')('Input', { id: 'email' });
  const box = el('div', {}, label, email);
  const theme = carbonReact('Theme', {}, carbonReact('Button', { kind: 'primary', size: 'md' }, 'Go'));
  const cardEl = card('Card', {}, card('CardHeader', {}, title), box, send, footer);
  const { claimOf } = recognise(el('main', {}, cardEl));
  assert.deepEqual([cardEl, send, footer, title, title.children[0], inside, label, box].map(claimOf), [
    { claim: 'usage' }, { claim: 'usage' }, { claim: 'part' },
    { claim: 'consumed', by: 'text' }, { claim: 'consumed', by: 'text' }, { claim: 'consumed', by: 'usage' }, { claim: 'consumed', by: 'label' },
    { claim: 'open' },
  ]);
  // A Container with no Contract is a wrapper; Carbon has no Theme Contract.
  assert.deepEqual(recognise(el('div', {}, theme), { system: carbon }).claimOf(theme), { claim: 'wrapper' });
});

// #216 (moved from react.test.mjs): a Tailwind app's template-literal classNames, one shape per line of fixtures/tailwind-app/src/App.tsx.
test('a template-literal className signs by its static classes; a token touching a hole is left out (#216)', { skip: noTs }, () => {
  const doc = readReact(TAILWIND, {});
  const { d } = recognise(doc.screens[0].root, { at: x => doc.at(x.offset) });
  // One question per signature, as the real Decider asks it: the stub records every ask, so sites sharing a key group here.
  const bySignature = new Map();
  for (const r of d.asked) bySignature.set(r.key, [...(bySignature.get(r.key) || []), ...r.evidence.at]);
  assert.deepEqual([...bySignature], [
    ['recognise:button.flex-1.py-1.5.rounded-lg', ['src/App.tsx:13:7', 'src/App.tsx:14:7']],
    ['recognise:button.border.px-2.rounded-md.shrink-0', ['src/App.tsx:15:7']],
    ['recognise:button.ml-auto.p-1', ['src/App.tsx:16:7']],
    ['recognise:button.px-2.text-xs', ['src/App.tsx:17:7']],
    ['recognise:input.text-right.w-14[type=text]', ['src/App.tsx:18:7']],
    ['recognise:input.text-right.w-8[type=text]', ['src/App.tsx:19:7']],
  ]);
});

// #226 (moved from react.test.mjs): a Carbon wrapper holding Carbon components is a Container; Theme and Modal are walked, ModalBody is a part.
test('a package\'s Container is walked: the components inside Theme, Modal and its part are Usages by import (#226)', { skip: noTs }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'usages-carbon-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'themed', dependencies: { '@carbon/react': '1.118.0', react: '19.3.1' }, devDependencies: { vite: '8.3.4' } }));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>Themed</title></head><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>');
  writeFileSync(join(dir, 'src/main.tsx'), `import { createRoot } from 'react-dom/client';
import { Theme, Button, Modal, ModalBody, TextInput } from '@carbon/react';
createRoot(document.getElementById('app')!).render(
  <Theme theme="g10">
    <Button kind="primary" size="md">Save</Button>
    <Modal open modalHeading="Invite">
      <ModalBody>
        <TextInput id="email" labelText="Email" />
      </ModalBody>
    </Modal>
  </Theme>
);
`);
  const doc = readReact(dir, { packages: ['@carbon/react'] });
  const { recognised, d } = recognise(doc.screens[0].root, { system: carbon });
  assert.deepEqual(recognised.map(r => [r.answer.contract, r.byImport, doc.at(r.el.offset)]), [
    ['button', true, 'src/main.tsx:5:5'],
    ['text-input', true, 'src/main.tsx:8:9'],
  ]);
  assert.deepEqual(d.asked, []);
});
