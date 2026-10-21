// React Prototypes (#114): the static reader on Next.js App Router and Vite + react-router fixtures, then
// generate over a Prototype folder. Static tests need only the pinned TypeScript 6 and parse5 from deps.mjs:
// no fixture install, no Next or Vite, no browser. The Carbon import is matched by its specifier string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRuntime, hasTypescript } from '../scripts/deps.mjs';
import { generate } from '../scripts/generate.mjs';
import { readReact } from '../scripts/react.mjs';
import { run } from '../scripts/runtime.mjs';
import { walk } from '../scripts/reader.mjs';
import { loadDesignSystem } from '../scripts/system.mjs';
import { validateHandoff } from '../scripts/validate.mjs';
import { BUTTON, designSystem, repo } from './helpers.mjs';
import { check } from '../scripts/signoff.mjs';

const VITE = fileURLToPath(new URL('fixtures/vite-app', import.meta.url));
const NEXT = fileURLToPath(new URL('fixtures/next-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
const PACKAGES = ['@carbon/react'];
// The runtime tests install each fixture from its lockfile into the scratch run, so they need the npm registry too.
const noRuntime = !hasRuntime() && 'the runtime packages or a browser are missing; run: node skills/to-handoff/scripts/deps.mjs';
const project = files => {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-react-'));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return dir;
};
const elements = (root, pick) => { const out = []; walk(root, el => { if (pick(el)) out.push(el); }); return out; };
const STANDARD = ['default', 'loading', 'empty', 'error', 'success'];
const usagesOf = screen => screen.regions.flatMap(r => r.usages);

const VITE_DECISIONS = JSON.parse(readFileSync(join(VITE, 'decisions.json'), 'utf8'));
const NEXT_DECISIONS = JSON.parse(readFileSync(join(NEXT, 'decisions.json'), 'utf8'));

test('Vite: a @carbon/react Button is a Design System leaf with its props and its own at', { skip: noTs }, () => {
  const doc = readReact(VITE, { packages: PACKAGES });
  assert.equal(doc.kind, 'react-vite');
  assert.equal(doc.title, 'Project members');
  const members = doc.screens.find(s => s.route === '/');
  const buttons = elements(members.root, el => el.component);
  assert.deepEqual(buttons.map(b => ({ component: b.component, props: { kind: b.attrs.kind, size: b.attrs.size, href: b.attrs.href }, at: doc.at(b.offset) })), [
    { component: { module: '@carbon/react', export: 'Button', kind: 'ds' }, props: { kind: 'primary', size: 'md', href: '/invite' }, at: 'src/pages/Members.tsx:21:7' },
  ]);
});

test('Vite: one screen per <Route path>, with its conditions, holes, repeats and Stand-ins', { skip: noTs }, () => {
  const doc = readReact(VITE, { packages: PACKAGES });
  assert.deepEqual(doc.screens.map(s => ({ id: s.id, route: s.route, at: doc.at(s.offset), mount: s.mount.attrs.id })), [
    { id: 'index', route: '/', at: 'src/App.tsx:9:9', mount: 'root' },
    { id: 'invite', route: '/invite', at: 'src/App.tsx:10:9', mount: 'root' },
  ]);
  const [members, invite] = doc.screens;
  const empty = elements(members.root, el => el.classes.includes('empty'))[0];
  assert.deepEqual(empty.cond.map(c => ({ ...c, ast: { atom: c.ast.atom, at: doc.at(c.ast.offset) } })),
    [{ expr: 'members.length === 0', ast: { atom: 'members.length === 0', at: 'src/pages/Members.tsx:9:8' }, value: true }]);
  const item = elements(members.root, el => el.classes.includes('member'))[0];
  assert.deepEqual(item.repeat, { list: 'members', item: 'm' });
  const send = elements(invite.root, el => el.component)[0];
  assert.equal(doc.at(send.offset), 'src/pages/Invite.tsx:22:9');
  const withoutAst = ({ ast, ...ternary }) => ternary;
  assert.deepEqual(send.attrHoles.map(h => withoutAst(h.ternary)), [{ cond: 'isSending', then: { text: 'disabled' }, else: { text: '' } }]);
  assert.deepEqual(withoutAst(send.children[0].parts[0].ternary), { cond: 'isSending', then: { text: 'Sending…' }, else: { text: 'Send invite' } });
  const notice = elements(invite.root, el => el.classes.includes('notice'))[0];
  assert.deepEqual(notice.children[0].parts, ['Invite sent to ', { expr: 'email' }, '.']);
  assert.deepEqual(doc.standIns.mocks.map(m => ({ name: m.name, at: doc.at(m.offset) })), [{ name: 'mockMembers', at: 'src/data/members.ts:3:14' }]);
  assert.deepEqual(doc.standIns.simulated.map(f => ({ name: f.name, delay: f.delay, before: f.before, after: f.after, at: doc.at(f.offset) })), [
    { name: 'sendInvite', delay: 800, before: ['isSending'], after: ['isSent'], at: 'src/pages/Invite.tsx:9:3' },
  ]);
  assert.deepEqual(doc.files, ['index.html', 'src/App.tsx', 'src/data/members.ts', 'src/index.css', 'src/main.tsx', 'src/pages/Invite.tsx', 'src/pages/Members.tsx']);
  assert.ok(doc.rules.some(r => r.selector === '.members'), 'src/index.css, imported by main.tsx, is read');
});

test('Vite: createBrowserRouter entries are screens too, a layout route rendering each child at its <Outlet>', { skip: noTs }, () => {
  const dir = project({
    'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '19.3.1', 'react-router': '7.18.4' }, devDependencies: { vite: '8.3.4' } }),
    'index.html': '<!doctype html><html><head><title>Shop</title></head><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router';
function Layout() { return <div className="frame"><nav>Shop</nav><Outlet /></div>; }
const router = createBrowserRouter([
  { path: '/', element: <Layout />, children: [
    { index: true, element: <p className="home">Home</p> },
    { path: 'cart', element: <p className="cart">Cart</p> },
  ] },
  { path: '*', element: <p>Not found</p> },
]);
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />);
`,
  });
  const doc = readReact(dir, {});
  assert.deepEqual(doc.screens.map(s => s.route), ['/', '/cart']);
  assert.deepEqual(doc.ignored, ['route /* (catch-all)']);
  const [home, cart] = doc.screens;
  assert.equal(home.mount.attrs.id, 'app');
  assert.deepEqual(elements(home.mount, el => el !== home.mount).map(el => el.classes[0] || el.tag), ['frame', 'nav', 'home']);
  assert.deepEqual(elements(cart.mount, el => el !== cart.mount).map(el => el.classes[0] || el.tag), ['frame', 'nav', 'cart']);
});

test('Next: one screen per app/**/page.tsx inside its layouts; loading.tsx is a framework state; API routes are ignored', { skip: noTs }, () => {
  const doc = readReact(NEXT, { packages: PACKAGES });
  assert.equal(doc.kind, 'react-next');
  assert.equal(doc.title, 'Release notes');
  assert.deepEqual(doc.screens.map(s => ({ id: s.id, route: s.route, at: doc.at(s.offset), root: s.root.tag, mount: s.mount.tag })), [
    { id: 'index', route: '/', at: 'app/page.tsx:8:5', root: 'html', mount: 'body' },
    { id: 'subscribe', route: '/subscribe', at: 'app/subscribe/page.tsx:5:5', root: 'html', mount: 'body' },
  ]);
  assert.deepEqual(doc.ignored, ['app/api/subscribe/route.ts (API route)']);
  const [index, subscribe] = doc.screens;
  assert.deepEqual(index.mount.children.map(c => [c.classes[0], c.cond]), [
    ['topbar', []],
    ['loading', [{ expr: 'app/loading.tsx', value: true }]],
    ['page', [{ expr: 'app/loading.tsx', value: false }]],
  ]);
  const problem = elements(subscribe.root, el => el.classes.includes('problem'))[0];
  assert.deepEqual(problem.cond.map(c => ({ expr: c.expr, value: c.value })), [{ expr: 'app/loading.tsx', value: false }, { expr: 'hasError', value: true }]);
  assert.deepEqual(doc.fonts.map(f => ({ module: f.module, name: f.name, at: doc.at(f.offset) })), [{ module: 'geist/font/sans', name: 'GeistSans', at: 'app/layout.tsx:2:10' }]);
  assert.ok(doc.files.includes('lib/releases.ts') && doc.files.includes('app/globals.css') && !doc.files.includes('app/api/subscribe/route.ts'));
  assert.deepEqual(doc.standIns.mocks.map(m => m.name), ['mockReleases']);
  assert.deepEqual(doc.standIns.simulated.map(f => [f.name, f.delay]), [['getReleases', 300]]);
});

test('a setTimeout that only clears a status message after the work is not simulated work (#217)', { skip: noTs }, () => {
  const dir = project({
    'package.json': JSON.stringify({ name: 'slots', dependencies: { react: '19.3.1' }, devDependencies: { vite: '8.3.4' } }),
    'index.html': '<!doctype html><html><head><title>Slots</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
function App() {
  const [msg, setMsg] = useState<string | null>(null);
  const [funds, setFunds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const handleLoadState = () => {
    const raw = localStorage.getItem('save');
    if (!raw) { setMsg('No save found'); setTimeout(() => (setMsg(null)), 2000); return; }
    try { setFunds(JSON.parse(raw).funds); } catch { setMsg('Load failed'); setTimeout(() => { setMsg(''); }, 2000); }
  };
  async function save() {
    setBusy(true);
    await new Promise(r => setTimeout(r, 800));
    setBusy(false);
    setDone(true);
    setTimeout(() => setMsg(undefined), 3000);
  }
  function confirmThenSave() {
    setMsg('Saving…'); setTimeout(() => setMsg(null), 1500);
    setBusy(true); setTimeout(() => { setBusy(false); setDone(true); }, 900);
  }
  // A callback passed by name is not followed: still flagged (a known gap).
  const clear = () => setMsg(null);
  function later() { setTimeout(clear, 2000); }
  return <main><button onClick={handleLoadState}>Load</button><button onClick={save}>Save</button><p>{msg}</p></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
`,
  });
  const doc = readReact(dir, {});
  assert.deepEqual(doc.standIns.simulated.map(f => ({ name: f.name, delay: f.delay, before: f.before, after: f.after })), [
    { name: 'save', delay: 800, before: ['busy'], after: ['done'] },
    { name: 'confirmThenSave', delay: 900, before: ['busy'], after: ['done'] },
    { name: 'later', delay: 2000, before: [], after: [] },
  ]);
});

test('Next: a Code Library component from components.json aliases.ui is a leaf; asChild lifts its only child', { skip: noTs }, () => {
  const doc = readReact(NEXT, { packages: PACKAGES });
  assert.equal(doc.uiDir, 'components/ui/');
  const [index, subscribe] = doc.screens;
  const [cta] = elements(index.root, el => el.component);
  assert.deepEqual({ component: cta.component, attrs: cta.attrs, asChild: cta.asChild.tag, text: cta.children[0].parts, at: doc.at(cta.offset) }, {
    component: { module: '@/components/ui/button', export: 'Button', kind: 'ui', file: 'components/ui/button.tsx' },
    attrs: { size: 'sm', href: '/subscribe' }, asChild: 'a', text: ['Get updates'], at: 'app/page.tsx:16:7',
  });
  const [submit] = elements(subscribe.root, el => el.component);
  assert.deepEqual({ attrs: submit.attrs, holes: submit.attrHoles.map(h => h.ternary.cond), at: doc.at(submit.offset) },
    { attrs: { type: 'submit' }, holes: ['isSubmitting'], at: 'app/subscribe/subscribe-form.tsx:22:7' });
});

test('generate: a Vite Prototype is a valid Handoff with a screen per route; the Carbon Button is its Contract by import', { skip: noTs }, async () => {
  const ds = designSystem();
  const button = readFileSync(join(ds, 'contracts/button.component.json'));
  const result = await generate({ prototype: VITE, designSystem: ds, decisions: VITE_DECISIONS });
  assert.deepEqual(result.requests, []);
  const h = result.handoff;
  assert.deepEqual(validateHandoff(h, await loadDesignSystem(ds)).errors, []);
  assert.equal(h.source.kind, 'react-vite');
  assert.equal(h.feature.key, 'project-members');
  assert.deepEqual(h.screens.map(s => s.id), ['index', 'invite']);
  assert.deepEqual(Object.keys(h.source.prototype.files), ['index.html', 'src/App.tsx', 'src/data/members.ts', 'src/index.css', 'src/main.tsx', 'src/pages/Invite.tsx', 'src/pages/Members.tsx']);

  const [members, invite] = h.screens;
  const [cta] = usagesOf(members).filter(u => u.contract === 'button');
  assert.deepEqual({ tuple: cta.tuple, match: cta.match, at: cta.at, label: h.copy[cta.properties.label.slice(5)].text },
    { tuple: { kind: 'primary', size: 'md' }, match: { by: 'import' }, at: 'src/pages/Members.tsx:21:7', label: 'Invite a member' });

  // disabled={isSending} is the State the loading state sets; the label's text ternary varies with it.
  const [send] = usagesOf(invite).filter(u => u.contract === 'button');
  assert.equal(send.match.by, 'import');
  assert.equal(invite.states.loading.usageStates[send.id].state, 'disabled');

  // The invite screen sends and succeeds but never fails: error is missing, an owner question per screen.
  assert.equal(invite.states.error.missing, true);
  const q = h.openQuestions.find(x => x.id === invite.states.error.question);
  assert.deepEqual({ id: q.id, kind: q.kind, to: q.to }, { id: 'q-state-error-invite', kind: 'missing-state', to: 'owner' });
  assert.ok(h.flow.some(f => f.from === 'invite/loading' && f.to === 'invite/error' && f.source === 'missing'));
  assert.deepEqual(h.data.map(x => [x.id, x.source, x.at]), [['members', 'mock', 'src/data/members.ts:3:14'], ['send-invite', 'simulated', 'src/pages/Invite.tsx:9:3']]);
  assert.ok(readFileSync(ds + '/contracts/button.component.json').equals(button) && readFileSync(BUTTON).equals(button), 'the Button Contract is byte-unchanged');
});

test('generate: a Carbon wrapper holding Carbon components is a container; Theme, Modal and what they hold are walked (#226)', { skip: noTs }, async () => {
  const ds = designSystem();
  copyFileSync(repo('skills/contract/test/fixtures/form-controls/text-input.component.json'), join(ds, 'contracts/text-input.component.json'));
  const dir = project({
    'package.json': JSON.stringify({ name: 'themed', dependencies: { '@carbon/react': '1.118.0', react: '19.3.1' }, devDependencies: { vite: '8.3.4' } }),
    'index.html': '<!doctype html><html><head><title>Themed</title></head><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
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
`,
  });
  const result = await generate({ prototype: dir, designSystem: ds, decisions: { feature: { goal: 'Invite a teammate.' }, acceptance: [{ id: 'invite-opens', screen: 'index', state: 'default', given: 'the page', when: 'it opens', then: 'the invite modal shows' }] } });
  assert.deepEqual(result.requests, []);
  assert.deepEqual(usagesOf(result.handoff.screens[0]).map(u => [u.contract, u.match && u.match.by, u.at]), [
    ['button', 'import', 'src/main.tsx:5:5'],
    ['text-input', 'import', 'src/main.tsx:8:9'],
  ]);
});

test('generate: a Next Prototype is a valid Handoff; a Code Library Button is decided once per signature, via library', { skip: noTs }, async () => {
  const ds = designSystem();
  const result = await generate({ prototype: NEXT, designSystem: ds, decisions: NEXT_DECISIONS });
  assert.deepEqual(result.requests, []);
  const h = result.handoff;
  assert.deepEqual(validateHandoff(h, await loadDesignSystem(ds)).errors, []);
  assert.deepEqual({ kind: h.source.kind, key: h.feature.key, ignored: h.source.ignored, screens: h.screens.map(s => [s.id, s.at]) }, {
    kind: 'react-next', key: 'release-notes', ignored: ['app/api/subscribe/route.ts (API route)'],
    screens: [['index', 'app/page.tsx:8:5'], ['subscribe', 'app/subscribe/page.tsx:5:5']],
  });
  const [index, subscribe] = h.screens;
  // The asChild Button keeps its own at and takes the Link's text; the submit Button is disabled while submitting.
  const [updates] = usagesOf(index).filter(u => u.contract === 'button');
  assert.deepEqual({ tuple: updates.tuple, match: updates.match, at: updates.at, label: h.copy[updates.properties.label.slice(5)].text },
    { tuple: { kind: 'primary', size: 'sm' }, match: { by: 'agent', via: 'library' }, at: 'app/page.tsx:16:7', label: 'Get updates' });
  const [submit] = usagesOf(subscribe).filter(u => u.contract === 'button');
  assert.equal(subscribe.states.loading.usageStates[submit.id].state, 'disabled');
  // app/loading.tsx is the loading state of every page under it; hasError is the subscribe screen's error.
  assert.equal(index.states.loading.missing, undefined);
  assert.match(index.states.loading.content, /app\/loading\.tsx/);
  assert.equal(subscribe.states.error.missing, undefined);
  assert.equal(index.states.error.question, 'q-state-error-index');
  // next/font is a font question with its import site.
  assert.match(h.openQuestions.find(q => q.id === 'q-font').text, /GeistSans from geist\/font\/sans \(app\/layout\.tsx:2:10\)/);
});

test('generate: Next boundary files are states by name: a feature not-found.tsx is empty, error.tsx error; the root not-found is ignored', { skip: noTs }, async () => {
  const page = text => `export default function Page() { return <main><h1>${text}</h1></main>; }`;
  const root = project({
    'package.json': '{"name": "boundaries", "dependencies": {"next": "15.5.28", "react": "19.1.10"}}',
    'app/layout.tsx': `export const metadata = { title: 'Boundaries' };\nexport default function RootLayout({ children }) { return <html><body>{children}</body></html>; }`,
    'app/page.tsx': page('Home'),
    'app/not-found.tsx': 'export default function NotFound() { return <p>Nothing here</p>; }',
    'app/loading-demo/page.tsx': page('Demo'),
    'app/loading-demo/error.tsx': 'export default function Failed() { return <p>Something broke</p>; }',
    'app/loading-demo/not-found.tsx': 'export default function NoRecord() { return <p>No such demo</p>; }',
  });
  const decisions = {
    'token:font-size:16px': 'body-02-font-size', feature: { goal: 'Show the boundaries.' },
    acceptance: [{ id: 'home', screen: 'index', state: 'default', given: 'a visitor', when: 'the page opens', then: 'Home shows' }],
  };
  const result = await generate({ prototype: root, designSystem: designSystem(), decisions });
  assert.deepEqual(result.requests.map(r => r.key), [], 'no condition request for a boundary file');
  const states = Object.fromEntries(result.handoff.screens.map(s => [s.id, STANDARD.filter(x => !s.states[x].missing)]));
  assert.deepEqual(states, { index: ['default'], 'loading-demo': ['default', 'empty', 'error'] });
  assert.ok(result.handoff.source.ignored.includes('app/not-found.tsx (root not-found)'));
});

// #213: the condition shapes of a one-file Vite app, each on its own line of fixtures/conditions-app/src/App.tsx.
const CONDITIONS = fileURLToPath(new URL('fixtures/conditions-app', import.meta.url));
const CONDITIONS_DECISIONS = JSON.parse(readFileSync(join(CONDITIONS, 'decisions.json'), 'utf8'));
const conditionRequests = async () => (await generate({ prototype: CONDITIONS, designSystem: designSystem(), decisions: {} })).requests.filter(r => r.kind === 'condition');
const conditionsScreen = () => readReact(CONDITIONS).screens[0];
const partConds = attr => attr.parts.map(p => (typeof p === 'string' ? p : p.ternary ? p.ternary.cond : p.expr));

test('read: a template-literal className is the class with its ternary as a part; the class string is never a condition', { skip: noTs }, async () => {
  const [tab] = elements(conditionsScreen().root, el => el.tag === 'button');
  assert.deepEqual(tab.attrHoles, []);
  assert.deepEqual(partConds(tab.attrs.class), ['tab ', "mode === 'fixed'"]);
  assert.deepEqual((await conditionRequests()).filter(r => r.key.includes('`')).map(r => r.key), []);
});

test('read: a && inside a template-literal className stays one ternary test, not two broken conditions', { skip: noTs }, async () => {
  const [total] = elements(conditionsScreen().root, el => el.tag === 'p' && el.attrs.class && el.attrs.class.parts);
  assert.deepEqual(partConds(total.attrs.class), ['total ', 'amount > 0 && amount < limit']);
  assert.deepEqual((await conditionRequests()).filter(r => /limit|\$\{/.test(r.key)).map(r => r.key), []);
});

test('read: a style object with a ternary inside is a dynamic style value, not a condition', { skip: noTs }, async () => {
  const [bar] = elements(conditionsScreen().root, el => el.tag === 'div' && el.classes.includes('bar'));
  assert.deepEqual(bar.attrHoles, []);
  assert.deepEqual(partConds(bar.attrs.style), ["{ left: drift < 0 ? '40%' : '50%' }"]);
  assert.deepEqual((await conditionRequests()).filter(r => r.key.startsWith('condition:{')).map(r => r.key), []);
});

test('generate: a && chain keeps each operand whole, a parenthesized comparison with its operator', { skip: noTs }, async () => {
  assert.deepEqual((await conditionRequests()).map(r => r.key), ["condition:mode === 'diy'", 'condition:(amount * (pl / 100)) > 0', 'condition:over']);
});

test('generate: a condition request is evidenced at each of its atom\'s source sites', { skip: noTs }, async () => {
  assert.deepEqual((await conditionRequests()).map(r => [r.key, r.evidence.at]), [
    ["condition:mode === 'diy'", ['src/App.tsx:18:8']],
    ['condition:(amount * (pl / 100)) > 0', ['src/App.tsx:18:26']],
    ['condition:over', ['src/App.tsx:18:56']],
  ]);
});

test('generate: a property named _error reads as the error state, not a condition to decide', { skip: noTs }, async () => {
  assert.equal((await conditionRequests()).find(r => r.key === 'condition:result._error'), undefined);
  const result = await generate({ prototype: CONDITIONS, designSystem: designSystem(), decisions: CONDITIONS_DECISIONS });
  assert.deepEqual(result.requests, []);
  const [screen] = result.handoff.screens;
  assert.equal(screen.states.error.missing, undefined);
  assert.match(screen.states.error.content, /`result\._error` is true/);
});

// #229: a string status compared with an enum-like literal. A copy of the conditions app with its comparisons on line 20.
const statusApp = line => {
  const app = project({});
  cpSync(CONDITIONS, app, { recursive: true });
  const page = join(app, 'src/App.tsx');
  writeFileSync(page, readFileSync(page, 'utf8').replace('    </main>', `${line}\n    </main>`));
  return app;
};
const conditionKeys = async prototype => (await generate({ prototype, designSystem: designSystem(), decisions: {} })).requests.filter(r => r.kind === 'condition').map(r => r.key);

test('generate: a status compared with GENERATING reads as loading and READY as success', { skip: noTs }, async () => {
  const app = statusApp("      {reportStatus === 'GENERATING' && <p>Working</p>}{reportStatus === 'READY' && <p>Done</p>}");
  const keys = await conditionKeys(app);
  assert.deepEqual(keys.filter(k => /reportStatus/.test(k)), []);
  const result = await generate({ prototype: app, designSystem: designSystem(), decisions: CONDITIONS_DECISIONS });
  const [screen] = result.handoff.screens;
  assert.equal(screen.states.loading.missing, undefined);
  assert.equal(screen.states.success.missing, undefined);
  assert.match(screen.states.loading.content, /`reportStatus === 'GENERATING'` is true/);
  assert.match(screen.states.success.content, /`reportStatus === 'READY'` is true/);
  assert.equal(screen.states.loading.trigger, "reportStatus === 'GENERATING'");
  assert.equal(screen.states.success.trigger, "reportStatus === 'READY'");
});

test('generate: a status value it cannot place stays a condition question', { skip: noTs }, async () => {
  const app = statusApp("      {status === 'IDLE' && <p>Idle</p>}{status !== 'READY' && <p>Not ready</p>}");
  assert.deepEqual((await conditionKeys(app)).filter(k => /status/.test(k)), ["condition:status === 'IDLE'", "condition:status !== 'READY'"]);
});

test('read: next/font loaders in a layout are the fonts it loads, each at its binding', { skip: noTs }, () => {
  const root = project({
    'package.json': '{"name": "fonts", "dependencies": {"next": "15.5.28", "react": "19.1.10"}}',
    'app/layout.tsx': `import { Inter } from 'next/font/google';\nimport localFont from 'next/font/local';\nconst inter = Inter({ subsets: ['latin'] });\nconst brand = localFont({ src: './brand.woff2' });\nexport default function RootLayout({ children }) { return <html><body className={inter.className}>{children}</body></html>; }`,
    'app/page.tsx': 'export default function Page() { return <main>Home</main>; }',
  });
  const doc = readReact(root, {});
  assert.deepEqual(doc.fonts.map(f => [f.module, f.name, doc.at(f.offset)]), [
    ['next/font/google', 'Inter', 'app/layout.tsx:1:10'],
    ['next/font/local', 'localFont', 'app/layout.tsx:2:8'],
  ]);
});

test('generate: an import prop that maps to no axis value is a prop question to the owner; the rest of the tuple stands', { skip: noTs }, async () => {
  const app = project({});
  cpSync(VITE, app, { recursive: true });
  const page = join(app, 'src/pages/Members.tsx');
  writeFileSync(page, readFileSync(page, 'utf8').replace('kind="primary" size="md"', 'kind="huge" size="md"'));
  const result = await generate({ prototype: app, designSystem: designSystem(), decisions: VITE_DECISIONS });
  const cta = usagesOf(result.handoff.screens[0]).find(u => u.contract === 'button');
  assert.deepEqual(cta.tuple, { size: 'md' });
  const q = result.handoff.openQuestions.find(x => x.id === cta.question);
  assert.deepEqual({ id: q.id, kind: q.kind, to: q.to }, { id: 'q-prop-button', kind: 'prop', to: 'owner' });
  assert.match(q.text, /kind="huge"/);
  assert.deepEqual(cta.offAxis.map(o => [o.property, o.raw, o.question]), [['kind', '"huge"', 'q-prop-button']]);
});

test('generate: a styling prop no axis or property names is off-axis with a prop question; content props are not', { skip: noTs }, async () => {
  const app = project({});
  cpSync(VITE, app, { recursive: true });
  const page = join(app, 'src/pages/Members.tsx');
  writeFileSync(page, readFileSync(page, 'utf8').replace('kind="primary" size="md"', 'kind="primary" size="md" tone="warm"'));
  const result = await generate({ prototype: app, designSystem: designSystem(), decisions: VITE_DECISIONS });
  const cta = usagesOf(result.handoff.screens[0]).find(u => u.contract === 'button');
  assert.deepEqual(cta.tuple, { kind: 'primary', size: 'md' });
  assert.deepEqual(cta.offAxis.map(o => [o.property, o.raw, o.reason]), [['tone', '"warm"', 'tone is no button axis or property']]);
  assert.match(result.handoff.openQuestions.find(x => x.id === cta.question).text, /tone="warm", which is no button axis or property/);
});

test('check right after generating a React Handoff shows no Drift; editing a read file is Drift', { skip: noTs }, async () => {
  const ds = designSystem();
  const app = project({});
  cpSync(VITE, app, { recursive: true });
  const result = await generate({ prototype: app, designSystem: ds, decisions: VITE_DECISIONS });
  assert.deepEqual((await check({ handoffPath: result.path, designSystem: ds, prototype: app })).drift, []);
  writeFileSync(join(app, 'src/pages/Members.tsx'), readFileSync(join(app, 'src/pages/Members.tsx'), 'utf8').replace('Invite a member', 'Add a member'));
  assert.deepEqual((await check({ handoffPath: result.path, designSystem: ds, prototype: app })).drift, [{ kind: 'prototype', key: 'src/pages/Members.tsx', change: 'changed' }]);
});

test('runtime: one Vite build serves both routes; the Carbon Button host joins to its import site by its own', { skip: noRuntime, timeout: 600000 }, async () => {
  const fill = [{ fill: '#email', value: 'ada@example.com' }, { click: 'button[type=submit]' }];
  const r = await run({
    prototype: VITE, breakpoints: [{ key: 'desktop', width: 1280 }],
    screens: [
      { screen: 'index', route: '/', states: [{ state: 'default', steps: [] }] },
      { screen: 'invite', route: '/invite', states: [{ state: 'default', steps: [] }, { state: 'loading', steps: fill }, { state: 'success', steps: [...fill, { clock: 800 }, { expect: '.notice' }], expect: ['src/pages/Invite.tsx:26:18'] }] },
    ],
  });
  try {
    const shots = Object.fromEntries(Object.entries(r.screens).map(([id, x]) => [id, Object.fromEntries(Object.entries(x.shots).map(([st, b]) => [st, typeof b.desktop === 'string' ? basename(b.desktop) : b.desktop]))]));
    assert.deepEqual(shots, {
      index: { default: 'index.default.desktop.png' },
      invite: { default: 'invite.default.desktop.png', loading: 'invite.loading.desktop.png', success: 'invite.success.desktop.png' },
    });
    // Carbon's ButtonBase spreads the rest props onto its <a>, so the tag the copy wrote reaches the host itself.
    const cta = r.screens.index.elements['src/pages/Members.tsx:21:7'];
    assert.equal(cta.via, 'own');
    assert.ok(cta.rect.width > 0 && cta.rect.height > 0, 'the Button rendered');
    assert.equal(r.screens.invite.elements['src/pages/Invite.tsx:22:9'].via, 'own');
    assert.deepEqual(r.failed, []);
  } finally {
    r.cleanup();
  }
});

test('runtime: generate on the Next fixture takes screenshots for both routes from one build', { skip: noRuntime, timeout: 600000 }, async () => {
  const ds = designSystem();
  const decisions = { ...NEXT_DECISIONS, 'reach:index:loading': { unreachable: 'loading.tsx shows only while the server renders' },
    'reach:subscribe:loading': { unreachable: 'the submit is too quick to catch' }, 'reach:subscribe:error': { unreachable: 'the API route always succeeds' } };
  const result = await generate({ prototype: NEXT, designSystem: ds, decisions, runtime: true });
  assert.deepEqual(result.requests, []);
  const h = result.handoff;
  assert.equal(h.openQuestions.find(q => q.id === 'q-runtime'), undefined, 'the runtime reader ran');
  for (const screen of h.screens) for (const [bp, shot] of Object.entries(screen.states.default.screenshots))
    assert.equal(shot, `screens/${screen.id}.default.${bp}.png`);
  assert.ok(existsSync(join(dirname(result.path), 'screens/subscribe.default.' + h.screens[1].breakpoints[0] + '.png')));
});

// #228: a Code Library's theme wrapper names the mode; the surface comparison is only the fallback.
const themed = wrapper => {
  const ds = designSystem();
  const dir = project({
    'package.json': JSON.stringify({ name: 'themed', dependencies: { '@carbon/react': '1.118.0', react: '19.3.1' }, devDependencies: { vite: '8.3.4' } }),
    'index.html': '<!doctype html><html><head><title>Themed</title></head><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { Theme, Button } from '@carbon/react';
createRoot(document.getElementById('app')!).render(
  ${wrapper('<Button kind="primary" size="md">Save</Button>')}
);
`,
  });
  const decisions = { feature: { goal: 'Save.' }, acceptance: [{ id: 'save', screen: 'index', state: 'default', given: 'the page', when: 'it opens', then: 'Save shows' }] };
  return generate({ prototype: dir, designSystem: ds, decisions }).then(async result => ({ ds, result, check: result.handoff && validateHandoff(result.handoff, await loadDesignSystem(ds)) }));
};
const modeNotes = h => h.source.notes.filter(n => /mode/i.test(n.text));

test('generate: <Theme theme="g10"> is the mode, with no mode question and no surface comparison (#228)', { skip: noTs }, async () => {
  const { result, check } = await themed(inner => `<Theme theme="g10">${inner}</Theme>`);
  assert.deepEqual(result.requests, []);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(result.handoff.source.modes, { light: 'g10' });
  assert.ok(!result.handoff.openQuestions.some(q => q.kind === 'mode-map'));
  assert.match(modeNotes(result.handoff).map(n => n.text).join('\n'), /Theme theme="g10".*Gray 10/);
  assert.ok(!result.handoff.source.notes.some(n => /ΔE/.test(n.text)), 'no surface scores when the wrapper names the mode');
});

test('generate: a Theme the Adapter has no mode for is a question, and the surface comparison still renders (#228)', { skip: noTs }, async () => {
  for (const wrapper of [inner => `<Theme theme="sepia">${inner}</Theme>`, inner => `<Theme theme={dark ? 'g100' : 'g10'}>${inner}</Theme>`]) {
    const { result, check } = await themed(wrapper);
    assert.deepEqual(check.errors, []);
    const [q] = result.handoff.openQuestions.filter(q => q.kind === 'mode-map');
    assert.deepEqual({ id: q.id, to: q.to }, { id: 'q-mode-theme', to: 'owner' });
    assert.match(q.text, /src\/main\.tsx:\d+:\d+/);
    assert.match(q.text, /white, g10, g90, g100/);
    assert.deepEqual(result.handoff.source.modes, { light: 'white' }, 'the surface match is the stand-in until the owner answers');
    assert.ok(result.handoff.source.notes.some(n => /ΔE/.test(n.text)));
  }
});

test('generate: a <Theme> with no theme prop falls back to the surfaces without a question (#228)', { skip: noTs }, async () => {
  const { result, check } = await themed(inner => `<Theme>${inner}</Theme>`);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(result.handoff.source.modes, { light: 'white' });
  assert.ok(!result.handoff.openQuestions.some(q => q.kind === 'mode-map'));
});

test('generate: with no theme wrapper the surfaces still pick the mode (#228)', { skip: noTs }, async () => {
  const { result, check } = await themed(inner => `<div>${inner}</div>`);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(result.handoff.source.modes, { light: 'white' });
  assert.ok(result.handoff.source.notes.some(n => /map best to White/.test(n.text)));
  assert.ok(!result.handoff.openQuestions.some(q => q.kind === 'mode-map'));
});
