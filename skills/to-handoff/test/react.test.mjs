// React Prototypes (#114): the static reader on Next.js App Router and Vite + react-router fixtures, then
// generate over a Prototype folder. Static tests need only the pinned TypeScript 6 and parse5 from deps.mjs:
// no fixture install, no Next or Vite, no browser. The Carbon import is matched by its specifier string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTypescript } from '../scripts/deps.mjs';
import { readReact } from '../scripts/react.mjs';
import { walk } from '../scripts/reader.mjs';

const VITE = fileURLToPath(new URL('fixtures/vite-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
const PACKAGES = ['@carbon/react'];
const project = files => {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-react-'));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return dir;
};
const elements = (root, pick) => { const out = []; walk(root, el => { if (pick(el)) out.push(el); }); return out; };

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
