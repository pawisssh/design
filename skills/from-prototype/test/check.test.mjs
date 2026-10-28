// The check (#433, spec #343 The check; Kind detection; the `reader` rows): the Prototype's kind and the files that
// show it, and each output's verdict from its gate table, through the check's entry and its CLI. Temp-dir Prototypes
// are written as the path tests write theirs; the committed fixtures are read where they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/from-prototype.mjs';

const CLI = fileURLToPath(new URL('../scripts/from-prototype.mjs', import.meta.url));
const vibe = name => fileURLToPath(new URL(`../../vibe-to-figma/test/fixtures/${name}`, import.meta.url));
const handoff = name => fileURLToPath(new URL(`../../to-handoff/test/fixtures/${name}`, import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, 'check', ...args], { encoding: 'utf8' });

// A Prototype in a temp folder: path -> text, a package.json given as an object.
function prototype(files) {
  const dir = mkdtempSync(join(tmpdir(), 'from-prototype-check-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return dir;
}
const SHELL = '<div id="root"></div><script type="module" src="/src/main.tsx"></script>';
const UTILITIES = 'export default () => <div className="flex items-center gap-2 p-4 rounded-md bg-slate-200">Hi</div>;\n';
const reasons = verdict => verdict.reasons.map(r => r.message);

test('the v0 fixture is React + Tailwind + shadcn on Next, and both outputs read', () => {
  const r = check(handoff('v0-app'));
  assert.equal(r.kind, 'React + Tailwind + shadcn');
  assert.ok(r.evidence.includes('components.json') && r.evidence.includes('next'), r.evidence.join(', '));
  assert.equal(r.verdicts.componentSets.verdict, 'yes, by the shadcn path');
  assert.equal(r.verdicts.handoff.verdict, 'yes, against its own folder');
  assert.deepEqual(r.verdicts.handoff.notes, []);
});

test("To-handoff's Next fixture is shadcn on Next, and both outputs read", () => {
  const r = check(handoff('next-app'));
  assert.equal(r.kind, 'React + Tailwind + shadcn');
  assert.equal(r.verdicts.componentSets.verdict, 'yes, by the shadcn path');
  assert.equal(r.verdicts.handoff.verdict, 'yes, against its own folder');
});

test('the path A fixtures take path A; a Handoff reads only on Next or Vite, and only against a Design System you name (#265)', () => {
  for (const dir of [vibe('path-a-app'), handoff('tailwind-app')]) {
    const r = check(dir);
    assert.equal(r.kind, 'React + Tailwind, no Code Library', dir);
    assert.ok(r.evidence.includes('vite'), r.evidence.join(', '));
    assert.equal(r.verdicts.componentSets.verdict, 'yes, by path A');
    assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
    assert.deepEqual(r.verdicts.handoff.reasons, [{ row: 'own-folder', message: "To-handoff can't yet recognise its sites through the Family map (#265)", ticket: '#265' }]);
  }
  const bare = check(vibe('tailwind-no-shadcn'));
  assert.equal(bare.verdicts.componentSets.verdict, 'yes, by path A');
  assert.equal(bare.verdicts.handoff.verdict, 'no');
  assert.deepEqual(reasons(bare.verdicts.handoff), ['no reader for this React setup: To-handoff reads Next.js App Router or Vite']);
});

test('a path A app with its own class-styled stylesheets gets a note naming them, linking #331', () => {
  const r = check(handoff('tailwind-app'));
  assert.ok(r.verdicts.componentSets.notes.some(n => n.includes('src/summary.css') && n.includes('#331')), r.verdicts.componentSets.notes.join('\n'));
  assert.deepEqual(check(vibe('path-a-app')).verdicts.componentSets.notes, []);
});

test('the Carbon + SCSS fixtures are React + CSS or SCSS classes: Component Sets not yet (#310)', () => {
  for (const dir of [vibe('carbon-scss-app'), handoff('vite-app')]) {
    const r = check(dir);
    assert.equal(r.kind, 'React + CSS or SCSS classes', dir);
    assert.ok(r.evidence.includes('@carbon/react'), r.evidence.join(', '));
    assert.equal(r.verdicts.componentSets.verdict, 'no');
    assert.deepEqual(reasons(r.verdicts.componentSets), ['not yet: Component Sets for this kind are charted in map #310']);
  }
  // The Vite app's Handoff reads, with no own folder since it can't have Component Sets; the Carbon + SCSS fixture
  // declares neither Next nor Vite.
  const vite = check(handoff('vite-app')).verdicts.handoff;
  assert.equal(vite.verdict, 'only against a Design System you name');
  assert.deepEqual(vite.reasons, [{ row: 'own-folder', message: "it can't have Component Sets, so it has no own folder", ticket: undefined }]);
  assert.equal(check(vibe('carbon-scss-app')).verdicts.handoff.verdict, 'no');
  const plain = check(handoff('conditions-app'));
  assert.equal(plain.kind, 'React + CSS or SCSS classes');
  assert.ok(!plain.evidence.includes('@carbon/react'));
});

test('the plain HTML fixtures, given as a folder or as their HTML file, are plain HTML + CSS classes: not yet (#339)', () => {
  // invite-teammates writes Bootstrap's `p-3` and `text-center` on purpose: they are no Tailwind.
  for (const dir of [vibe('html-app'), handoff('invite-teammates')]) {
    for (const given of [dir, join(dir, 'index.html')]) {
      const r = check(given);
      assert.equal(r.kind, 'plain HTML + CSS classes', given);
      assert.ok(r.evidence.includes('index.html'), r.evidence.join(', '));
      assert.equal(r.verdicts.componentSets.verdict, 'no');
      assert.deepEqual(reasons(r.verdicts.componentSets), ['not yet: there is no reader for plain HTML + CSS classes (spec #339)']);
      assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
      assert.deepEqual(r.verdicts.handoff.reasons.map(x => x.ticket), ['#265']);
      assert.equal(r.verdicts.handoff.page, 'index.html', 'its one page, found without naming it');
    }
  }
});

test('plain HTML with a package.json that lists no React is still plain HTML', () => {
  const dir = prototype({ 'package.json': { devDependencies: { serve: '14.0.0' } }, 'banner-app.html': '<link rel="stylesheet" href="styles.css"><div class="banner">Hi</div>', 'styles.css': '.banner { color: red; }' });
  try {
    const r = check(dir);
    assert.equal(r.kind, 'plain HTML + CSS classes');
    assert.ok(r.evidence.includes('package.json lists no React'), r.evidence.join(', '));
    assert.equal(r.verdicts.handoff.page, 'banner-app.html');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('plain HTML styled by Tailwind from the CDN, or only by style="", is named apart: not decided yet', () => {
  const cdn = prototype({ 'index.html': '<script src="https://cdn.tailwindcss.com"></script><div class="p-4 bg-white">Hi</div>' });
  const inline = prototype({ 'index.html': '<div style="padding: 16px">Hi</div>' });
  try {
    for (const dir of [cdn, inline]) {
      const r = check(dir);
      assert.equal(r.kind, 'plain HTML styled by Tailwind or only style=""', dir);
      assert.deepEqual(reasons(r.verdicts.componentSets), ['not decided yet']);
      assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
      assert.equal(r.verdicts.handoff.page, 'index.html');
    }
  } finally { for (const d of [cdn, inline]) rmSync(d, { recursive: true, force: true }); }
});

test('a Vue package, a Svelte file and CSS modules or CSS-in-JS are refused as not supported, linking ADR 0019', () => {
  const vue = prototype({ 'package.json': { dependencies: { vue: '3.5.0' }, devDependencies: { vite: '7.0.0' } }, 'index.html': '<div id="app"></div>', 'src/App.vue': '<template><p class="x">Hi</p></template>' });
  const svelte = prototype({ 'package.json': { devDependencies: { vite: '7.0.0' } }, 'src/App.svelte': '<p>Hi</p>' });
  const modules = prototype({ 'package.json': { dependencies: { react: '19.2.4' }, devDependencies: { vite: '7.0.0' } }, 'index.html': SHELL, 'src/App.tsx': 'import s from "./App.module.css";\nexport default () => <p className={s.x}>Hi</p>;\n', 'src/App.module.css': '.x { color: red; }' });
  const cssInJs = prototype({ 'package.json': { dependencies: { react: '19.2.4', 'styled-components': '6.1.0' }, devDependencies: { vite: '7.0.0' } }, 'index.html': SHELL, 'src/App.tsx': 'import styled from "styled-components";\nconst P = styled.p`color: red;`;\nexport default () => <P>Hi</P>;\n' });
  try {
    for (const dir of [vue, svelte]) {
      const r = check(dir);
      assert.equal(r.kind, 'Vue, Svelte or Angular', dir);
      for (const v of Object.values(r.verdicts)) assert.deepEqual(reasons(v), ['not supported (ADR 0019)']);
    }
    for (const dir of [modules, cssInJs]) {
      const r = check(dir);
      assert.equal(r.kind, 'React + CSS modules or CSS-in-JS', dir);
      assert.deepEqual(reasons(r.verdicts.componentSets), ['not supported (ADR 0019)']);
      assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
    }
    assert.ok(check(modules).evidence.includes('src/App.module.css'));
    assert.ok(check(cssInJs).evidence.includes('styled-components'));
    const out = run(vue, '--figma', 'https://www.figma.com/design/abc/x').stdout;
    assert.match(out, /docs\/adr\/0019-/);
  } finally { for (const d of [vue, svelte, modules, cssInJs]) rmSync(d, { recursive: true, force: true }); }
});

test('a Figma Make bundle is never plain HTML: React only in peerDependencies still counts', () => {
  const make = { 'package.json': { peerDependencies: { react: '18.3.1', 'react-dom': '18.3.1' }, devDependencies: { vite: '6.3.5', tailwindcss: '4.1.12', '@tailwindcss/vite': '4.1.12' } }, 'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>', 'vite.config.ts': "export default { resolve: { alias: { '@': './src' } } };\n" };
  const used = prototype({ ...make, 'src/app/App.tsx': 'import { Button } from "@/app/components/ui/button";\nexport default () => <Button>Hi</Button>;\n', 'src/app/components/ui/button.tsx': UTILITIES });
  const unused = prototype({ ...make, 'src/app/App.tsx': UTILITIES, 'src/app/components/ui/button.tsx': 'export const Button = () => null;\n' });
  try {
    const u = check(used);
    assert.equal(u.kind, 'React + Tailwind + shadcn');
    assert.ok(u.evidence.includes('src/app/components/ui/'), u.evidence.join(', '));
    assert.equal(check(unused).kind, 'React + Tailwind, no Code Library');
  } finally { for (const d of [used, unused]) rmSync(d, { recursive: true, force: true }); }
});

test('native mobile is out of scope, and a folder with nothing known is unknown, naming what was found', () => {
  const native = prototype({ 'package.json': { dependencies: { react: '19.1.0', 'react-native': '0.80.0' } }, 'App.tsx': 'export default () => null;\n' });
  const empty = prototype({ 'notes.txt': 'hello' });
  try {
    const n = check(native);
    assert.equal(n.kind, 'native mobile');
    for (const v of Object.values(n.verdicts)) assert.deepEqual(reasons(v), ['out of scope']);
    const u = check(empty);
    assert.equal(u.kind, 'unknown');
    for (const v of Object.values(u.verdicts)) assert.equal(v.verdict, 'no');
  } finally { for (const d of [native, empty]) rmSync(d, { recursive: true, force: true }); }
});

test('TanStack Start is named in the evidence', () => {
  const dir = prototype({ 'package.json': { dependencies: { react: '19.2.4', '@tanstack/react-start': '1.130.0' }, devDependencies: { vite: '7.0.0', tailwindcss: '4.2.2' } }, 'components.json': {}, 'src/routes/__root.tsx': UTILITIES });
  try { assert.ok(check(dir).evidence.includes('TanStack Start')); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

// The Handoff rows (#436), one temp-dir variant each, from a React + CSS classes app on Vite: its Handoff is only against a
// Design System you name, since it can't have Component Sets. `reason` is the one refusal or closing reason; `note`
// the one note, with its ticket in its text.
const APP = 'export default () => <p className="title">Hi</p>;\n';
const vite = (extra = {}) => ({ 'package.json': { dependencies: { react: '19.2.4', 'react-dom': '19.2.4', ...extra }, devDependencies: { vite: '7.0.0' } },
  'package-lock.json': {}, 'index.html': SHELL, 'src/main.tsx': 'import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")).render(<App />);\n', 'src/App.tsx': APP, 'src/app.css': '.title { color: red; }' });
const ONLY_AGAINST = 'only against a Design System you name';
const CLOSED = { row: 'own-folder', message: "it can't have Component Sets, so it has no own folder" };
const ROUTES = 'export const router = createBrowserRouter([{ path: "/", element: <App /> }]);\n';
const VARIANTS = [
  { name: 'every row passing', files: vite(), verdict: ONLY_AGAINST, reason: CLOSED, exit: 0 },
  { name: 'TanStack Start with src/routes/__root.tsx and no index.html', exit: 1, verdict: 'no',
    files: { ...vite({ '@tanstack/react-start': '1.130.0' }), 'index.html': undefined, 'src/routes/__root.tsx': APP },
    reason: { row: 'vite-shell', message: "not yet: a TanStack Start build is a Cloudflare Worker, which the run can't serve yet (#348)", ticket: '#348' } },
  { name: 'Vite with no index.html', files: { ...vite(), 'index.html': undefined }, verdict: 'no', exit: 1,
    reason: { row: 'vite-shell', message: 'no `index.html`: To-handoff reads a Vite app from its `index.html`' } },
  { name: 'an index.html that loads no module script', files: { ...vite(), 'index.html': '<div id="root"></div>' }, verdict: 'no', exit: 1,
    reason: { row: 'vite-shell', message: '`index.html` loads no module script: To-handoff reads a Vite app from it' } },
  { name: 'React only in peerDependencies', verdict: 'no', exit: 1,
    files: { ...vite(), 'package.json': { peerDependencies: { react: '18.3.1', 'react-dom': '18.3.1' }, devDependencies: { vite: '6.3.5' } } },
    reason: { row: 'peer-react', message: 'not yet: React only in `peerDependencies` (#358)', ticket: '#358' } },
  { name: 'a Next app with no app/', verdict: 'no', exit: 1,
    files: { 'package.json': { dependencies: { react: '19.2.4', next: '16.0.0' } }, 'package-lock.json': {}, 'pages/index.tsx': APP, 'styles.css': '.title { color: red; }' },
    reason: { row: 'next-app-router', message: 'no `app/` or `src/app/` with a root layout: To-handoff reads only the App Router' } },
  { name: 'a Next app with src/app/ and its root layout', verdict: ONLY_AGAINST, exit: 0, reason: CLOSED,
    files: { 'package.json': { dependencies: { react: '19.2.4', next: '16.0.0' } }, 'package-lock.json': {}, 'src/app/layout.tsx': APP, 'src/app/page.tsx': APP, 'src/app/globals.css': '.title { color: red; }' } },
  { name: 'two HTML files', files: { 'index.html': '<p class="a">Hi</p>', 'about.html': '<p class="a">About</p>', 'style.css': '.a { color: red; }' }, verdict: 'no', exit: 1,
    reason: { row: 'html-file', message: "name the page: run again with the HTML file's path, one of about.html, index.html. Several pages are not specified yet (the map's 'Plain HTML beyond one banner')" } },
  { name: 'wouter', files: vite({ wouter: '3.7.0' }), verdict: ONLY_AGAINST, reason: CLOSED, exit: 0, note: ['reads as one screen, `index`', '#350'] },
  { name: 'a data router defined in another file', verdict: ONLY_AGAINST, reason: CLOSED, exit: 0, note: ['reads as one screen, `index`', '#361'],
    files: { ...vite({ 'react-router': '7.9.0' }), 'src/router.tsx': ROUTES, 'src/App.tsx': 'import { router } from "./router";\nexport default () => <RouterProvider router={router} />;\n' } },
  { name: '`Component:` routes', verdict: ONLY_AGAINST, reason: CLOSED, exit: 0, note: ['reads as one screen, `index`', '#361'],
    files: { ...vite({ 'react-router': '7.9.0' }), 'src/App.tsx': 'const router = createBrowserRouter([{ path: "/", Component: Home }]);\nexport default () => <RouterProvider router={router} />;\n' } },
  { name: 'a data router read where it is rendered', verdict: ONLY_AGAINST, reason: CLOSED, exit: 0,
    files: { ...vite({ 'react-router': '7.9.0' }), 'src/App.tsx': `${ROUTES}export default () => <RouterProvider router={router} />;\n` } },
  { name: 'no package-lock.json', files: { ...vite(), 'package-lock.json': undefined }, verdict: ONLY_AGAINST, reason: CLOSED, exit: 0,
    note: ['without a `package-lock.json` the Handoff is likely static-only, with a `q-runtime` question', 'npm install --package-lock-only --ignore-scripts', '#354'] },
];
const variant = v => prototype(Object.fromEntries(Object.entries(v.files).filter(([, text]) => text !== undefined)));

test('each Handoff row refuses, closes the own folder, or notes, with its reason, its ticket and the exit code', () => {
  for (const v of VARIANTS) {
    const dir = variant(v);
    try {
      const { handoff: h } = check(dir).verdicts;
      assert.equal(h.verdict, v.verdict, v.name);
      assert.deepEqual(h.reasons, [{ ticket: undefined, ...v.reason }], v.name);
      assert.equal(h.notes.length, v.note ? 1 : 0, `${v.name}: ${h.notes.join('\n')}`);
      for (const part of v.note || []) assert.ok(h.notes[0].includes(part), `${v.name}: ${h.notes[0]}`);
      assert.equal(run(dir, '--handoff').status, v.exit, v.name);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the CLI prints what was found, each verdict and what is still possible, and exits 1 only when an asked output is refused', () => {
  const asked = run(vibe('html-app'), '--figma', 'https://www.figma.com/design/abc/x');
  assert.equal(asked.status, 1, asked.stderr);
  const lines = asked.stdout.trim().split('\n');
  assert.match(lines[0], /^.*html-app: plain HTML \+ CSS classes \(.*index\.html.*\)\.$/);
  assert.match(asked.stdout, /- Component Sets: no\. Not yet: there is no reader for plain HTML \+ CSS classes \(spec #339\)\./);
  assert.match(asked.stdout, /- Handoff: only against a Design System you name\. To-handoff can't yet recognise its sites through the Family map \(#265\)\./);
  assert.match(asked.stdout, /Handoff against a Design System your developers already build with.*carbon/s);
  assert.equal(lines.at(-1), 'Nothing was fetched or written.');
  assert.doesNotMatch(asked.stdout + asked.stderr, /\n\s+at /);

  assert.equal(run(vibe('html-app')).status, 0, 'no output asked: the verdicts alone');
  assert.equal(run(vibe('html-app'), '--handoff').status, 0);
  assert.equal(run(handoff('v0-app'), '--figma', 'https://www.figma.com/design/abc/x', '--handoff').status, 0);

  const missing = run(join(tmpdir(), 'from-prototype-no-such-prototype'), '--handoff');
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /no such file or folder/);
  assert.doesNotMatch(missing.stdout + missing.stderr, /\n\s+at /);
});

test('a Carbon app with Tailwind utilities is still Carbon, and a file given that is not HTML is unknown', () => {
  const dir = prototype({ 'package.json': { dependencies: { react: '19.2.4', '@carbon/react': '1.80.0' }, devDependencies: { vite: '7.0.0', tailwindcss: '4.2.2' } }, 'src/App.tsx': UTILITIES, 'src/app.scss': '.x { color: red; }' });
  try {
    assert.equal(check(dir).kind, 'React + CSS or SCSS classes');
    const notHtml = check(join(dir, 'package.json'));
    assert.equal(notHtml.kind, 'unknown');
    assert.deepEqual(notHtml.evidence, ['a file that is not HTML']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every run writes nothing, runs and fetches nothing, leaves the Prototype as it was, and loads no fetched parser', () => {
  // A child process whose fs writes, child processes and fetch are recorded before the check is imported, so the
  // answer doesn't depend on what other test files write meanwhile; its module cache holds only what the check loads.
  const script = `
    import { statSync } from 'node:fs';
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    const require = createRequire(import.meta.url);
    const calls = [];
    const record = (mod, names) => { for (const n of names) { const real = mod[n]; if (real) mod[n] = (...a) => { calls.push(n + ' ' + a[0]); return real(...a); }; } };
    const fs = require('node:fs');
    const writes = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync', 'copyFileSync', 'cpSync', 'symlinkSync'];
    record(fs, writes);
    record(fs, writes.map(n => n.replace(/Sync$/, '')));
    record(fs.promises, ['writeFile', 'appendFile', 'mkdir', 'rm', 'rmdir', 'unlink', 'rename', 'copyFile', 'cp', 'symlink']);
    record(require('node:child_process'), ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
    globalThis.fetch = url => { calls.push('fetch ' + url); throw new Error('no fetch'); };
    syncBuiltinESMExports();
    const { check } = await import(${JSON.stringify(new URL('../scripts/from-prototype.mjs', import.meta.url).href)});
    const { files } = await import(${JSON.stringify(new URL('../../vibe-to-figma/scripts/path.mjs', import.meta.url).href)});
    const prototypes = JSON.parse(process.argv[1]);
    const list = p => statSync(p).isFile() ? [statSync(p).mtimeMs] : [...files(p)].map(f => f + ' ' + statSync(f).mtimeMs);
    const before = prototypes.map(list);
    for (const p of prototypes) check(p);
    const changed = prototypes.filter((p, i) => JSON.stringify(list(p)) !== JSON.stringify(before[i]));
    const loaded = Object.keys(require.cache).filter(k => k.includes('/.scratch/'));
    console.log(JSON.stringify({ calls, changed, loaded }));
  `;
  const prototypes = [handoff('v0-app'), handoff('next-app'), handoff('vite-app'), handoff('tailwind-app'), handoff('conditions-app'),
    handoff('invite-teammates'), vibe('path-a-app'), vibe('tailwind-no-shadcn'), vibe('carbon-scss-app'), vibe('html-app'), join(vibe('html-app'), 'index.html')];
  const made = VARIANTS.map(variant);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([...prototypes, ...made])], { encoding: 'utf8' });
  for (const d of made) rmSync(d, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  const { calls, changed, loaded } = JSON.parse(r.stdout);
  assert.deepEqual(calls, [], 'nothing written, run or fetched');
  assert.deepEqual(changed, [], 'every Prototype is as it was');
  assert.deepEqual(loaded, []);
});
