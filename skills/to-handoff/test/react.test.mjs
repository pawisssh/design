// React Prototypes (#114): the static reader on Next.js App Router and Vite + react-router fixtures, then
// generate over a Prototype folder. Static tests need only the pinned TypeScript 6 and parse5 from deps.mjs:
// no fixture install, no Next or Vite, no browser. The Carbon import is matched by its specifier string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
import { BUTTON, designSystem } from './helpers.mjs';
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
  assert.deepEqual(empty.cond, [{ expr: 'members.length === 0', value: true }]);
  const item = elements(members.root, el => el.classes.includes('member'))[0];
  assert.deepEqual(item.repeat, { list: 'members', item: 'm' });
  const send = elements(invite.root, el => el.component)[0];
  assert.equal(doc.at(send.offset), 'src/pages/Invite.tsx:22:9');
  assert.deepEqual(send.attrHoles.map(h => h.ternary), [{ cond: 'isSending', then: { text: 'disabled' }, else: { text: '' } }]);
  assert.deepEqual(send.children[0].parts[0].ternary, { cond: 'isSending', then: { text: 'Sending…' }, else: { text: 'Send invite' } });
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
  assert.deepEqual(problem.cond, [{ expr: 'app/loading.tsx', value: false }, { expr: 'hasError', value: true }]);
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
    if (!raw) { setMsg('No save found'); setTimeout(() => setMsg(null), 2000); return; }
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
