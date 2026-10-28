// The check (#433, #437, spec #343 The check; Kind detection; the gate rows; Owner questions; The stages): the
// Prototype's kind and the files that show it, each output's verdict from its gate table, the owner's questions and the
// plan, through the check's entry and its CLI. Temp-dir Prototypes are written as the path tests write theirs; the
// committed fixtures are read where they are.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/from-prototype.mjs';
import { DEFAULT_DIR, REPO_ROOT, TOOLS } from '../../adapter-generic/scripts/sources.mjs';

const CLI = fileURLToPath(new URL('../scripts/from-prototype.mjs', import.meta.url));
const vibe = name => fileURLToPath(new URL(`../../vibe-to-figma/test/fixtures/${name}`, import.meta.url));
const handoff = name => fileURLToPath(new URL(`../../to-handoff/test/fixtures/${name}`, import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, 'check', ...args], { encoding: 'utf8' });

// A Prototype in a temp folder: path -> text, a package.json given as an object. A variant passes a committed fixture,
// copied there first, with those files written over it.
function prototype(files, fixture) {
  const dir = mkdtempSync(join(tmpdir(), 'from-prototype-check-'));
  if (fixture) cpSync(fixture, dir, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return dir;
}
const BUTTON_APP = 'import { Button } from "@/app/components/ui/button";\nexport default () => <Button>Hi</Button>;\n';
const SHELL = '<div id="root"></div><script type="module" src="/src/main.tsx"></script>';
const UTILITIES = 'export default () => <div className="flex items-center gap-2 p-4 rounded-md bg-slate-200">Hi</div>;\n';
const reasons = verdict => verdict.reasons.map(r => r.message);
const FIGMA = 'https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/Prototype';
const read = path => readFileSync(path, 'utf8');
const PATH_A_PKG = JSON.parse(read(join(vibe('path-a-app'), 'package.json')));

// Temp variants that live for the whole file: a fixture copied, with `gone` files removed from the copy.
const temps = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
function copied(files, fixture, gone = []) {
  const dir = prototype(files, fixture);
  temps.push(dir);
  for (const f of gone) rmSync(join(dir, f));
  return dir;
}
// path-a-app with no Vite: Component Sets read, a Handoff doesn't.
const BARE = copied({ 'package.json': { ...PATH_A_PKG, scripts: undefined, devDependencies: { ...PATH_A_PKG.devDependencies, vite: undefined } } }, vibe('path-a-app'));

test('the v0 fixture is React + Tailwind + shadcn on Next, and both outputs read', () => {
  const r = check(handoff('v0-app'));
  assert.equal(r.kind, 'React + Tailwind + shadcn');
  assert.ok(r.evidence.includes('components.json') && r.evidence.includes('next'), r.evidence.join(', '));
  assert.equal(r.verdicts.componentSets.verdict, 'yes, by the shadcn path');
  assert.equal(r.verdicts.handoff.verdict, 'yes, against its own folder');
  assert.deepEqual(r.verdicts.handoff.notes, []);
});

test("To-handoff's Next fixture is shadcn on Next: its lockfile resolves no tailwindcss, which closes the own-folder Handoff", () => {
  const r = check(handoff('next-app'));
  assert.equal(r.kind, 'React + Tailwind + shadcn');
  assert.deepEqual(r.verdicts.componentSets.reasons, [{ row: 'tailwind-version', message: 'package-lock.json resolves no tailwindcss', ticket: undefined }]);
  assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
});

test('the path A fixtures take path A; a Handoff reads only on Next or Vite, and only against a Design System you name (#265)', () => {
  for (const dir of [vibe('path-a-app'), handoff('tailwind-app')]) {
    const r = check(dir);
    assert.equal(r.kind, 'React + Tailwind, no Code Library', dir);
    assert.ok(r.evidence.includes('vite'), r.evidence.join(', '));
    assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
    assert.deepEqual(r.verdicts.handoff.reasons, [{ row: 'own-folder', message: "To-handoff can't yet recognise its sites through the Family map (#265)", ticket: '#265' }]);
  }
  assert.equal(check(vibe('path-a-app')).verdicts.componentSets.verdict, 'yes, by path A');
  const bare = check(BARE);
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
  const viteApp = check(handoff('vite-app')).verdicts.handoff;
  assert.equal(viteApp.verdict, 'only against a Design System you name');
  assert.deepEqual(viteApp.reasons, [{ row: 'own-folder', message: "it can't have Component Sets, so it has no own folder", ticket: undefined }]);
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
    const out = run(vue, '--figma', FIGMA).stdout;
    assert.match(out, /docs\/adr\/0019-/);
  } finally { for (const d of [vue, svelte, modules, cssInJs]) rmSync(d, { recursive: true, force: true }); }
});

test('a Figma Make bundle is never plain HTML: React only in peerDependencies still counts', () => {
  const make = { 'package.json': { peerDependencies: { react: '18.3.1', 'react-dom': '18.3.1' }, devDependencies: { vite: '6.3.5', tailwindcss: '4.1.12', '@tailwindcss/vite': '4.1.12' } }, 'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>', 'vite.config.ts': "export default { resolve: { alias: { '@': './src' } } };\n" };
  const used = prototype({ ...make, 'src/app/App.tsx': BUTTON_APP, 'src/app/components/ui/button.tsx': UTILITIES });
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
      assert.equal(run(dir, '--handoff', '--ds', 'shadcn').status, v.exit, v.name);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('a refused Figma link alone leaves the own folder open', () => {
  const r = check(handoff('v0-app'), { figma: 'https://example.com/not-figma', handoff: true });
  assert.equal(r.verdicts.componentSets.verdict, 'no');
  assert.equal(r.verdicts.handoff.verdict, 'yes, against its own folder');
});

test('the CLI prints what was found, each verdict and what is still possible, and exits 1 when an asked output is refused', () => {
  const asked = run(vibe('html-app'), '--figma', FIGMA);
  assert.equal(asked.status, 1, asked.stderr);
  const lines = asked.stdout.trim().split('\n');
  assert.match(lines[0], /^.*html-app: plain HTML \+ CSS classes \(.*index\.html.*\)\.$/);
  assert.match(asked.stdout, /- Component Sets: no\. Not yet: there is no reader for plain HTML \+ CSS classes \(spec #339\)\./);
  assert.match(asked.stdout, /- Handoff: only against a Design System you name\. To-handoff can't yet recognise its sites through the Family map \(#265\)\./);
  assert.match(asked.stdout, /Handoff against a Design System your developers already build with.*carbon/s);
  assert.equal(lines.at(-1), 'Nothing was fetched or written.');
  assert.doesNotMatch(asked.stdout + asked.stderr, /\n\s+at /);

  assert.equal(run(vibe('html-app'), '--handoff', '--ds', 'carbon').status, 0);
  assert.equal(run(handoff('v0-app'), '--figma', FIGMA, '--handoff', '--ds', 'carbon').status, 0);

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

test('no output asked: exit 2 with one question offering only the outputs whose verdict is not "no", and the Design System question beside a Handoff', () => {
  const both = run(handoff('v0-app'));
  assert.equal(both.status, 2, both.stderr);
  assert.match(both.stdout, /Owner question: Which outputs should this run make: Component Sets, a Handoff, or both\?\n- Component Sets \(yes, by the shadcn path\): run again with `--figma <url>`\n- a Handoff \(yes, against its own folder\): run again with `--handoff`\nOwner question: Which Design System is the Handoff against\?\n/);
  assert.equal(both.stdout.trim().split('\n').at(-1), 'Nothing was fetched or written.');

  const html = check(vibe('html-app'));
  assert.deepEqual(html.questions.map(q => q.id), ['outputs', 'designSystem']);
  assert.deepEqual(html.questions[0].options.map(o => o.output), ['handoff']);
  // Component Sets alone possible: no Design System question.
  assert.deepEqual(check(BARE).questions.map(q => q.id), ['outputs']);
  assert.equal(html.plan, null);
  const out = run(vibe('html-app'));
  assert.equal(out.status, 2);
  assert.match(out.stdout, /Owner question: Should this run make a Handoff\? It is the only output possible\.\n- a Handoff \(only against a Design System you name\): run again with `--handoff`/);
  assert.doesNotMatch(out.stdout, /run again with `--figma/);

  // Nothing possible: no question to ask, a refusal.
  const vue = prototype({ 'package.json': { dependencies: { vue: '3.5.0' } }, 'src/App.vue': '<template><p>Hi</p></template>' });
  try {
    assert.deepEqual(check(vue).questions, []);
    const r = run(vue);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Nothing else is possible for this Prototype today\./);
    assert.doesNotMatch(r.stdout, /Owner question/);
  } finally { rmSync(vue, { recursive: true, force: true }); }
});

test('both asked with one refused: exit 1, no plan, and the message names the command for the other', () => {
  const html = run(vibe('html-app'), '--figma', FIGMA, '--handoff', '--ds', 'carbon');
  assert.equal(html.status, 1, html.stderr);
  assert.ok(html.stdout.includes(`Run \`node skills/from-prototype/scripts/from-prototype.mjs check ${vibe('html-app')} --handoff --ds carbon\` if one of them is it.`), html.stdout);
  assert.doesNotMatch(html.stdout, /Plan:/);
  assert.equal(check(vibe('html-app'), { figma: FIGMA, handoff: true, ds: 'carbon' }).plan, null);

  const bare = run(BARE, '--figma', FIGMA, '--handoff', '--ds', 'carbon');
  assert.equal(bare.status, 1);
  assert.ok(bare.stdout.includes(`Component Sets alone are still possible: \`node skills/from-prototype/scripts/from-prototype.mjs check ${BARE} --figma ${FIGMA}\`.`), bare.stdout);
});

test('a Figma link that is not a Design file link is refused before anything is fetched, and only when Component Sets are asked', () => {
  for (const link of ['https://www.figma.com/design/abc/x', 'https://www.figma.com/board/AbCdEfGhIjKlMnOpQrStUv/x', `${FIGMA.replace('/Prototype', '')}/branch/XyZ/x`, 'figma']) {
    const r = check(handoff('v0-app'), { figma: link });
    assert.equal(r.verdicts.componentSets.verdict, 'no', link);
    assert.deepEqual(r.verdicts.componentSets.reasons.map(x => x.row), ['figma']);
    assert.match(reasons(r.verdicts.componentSets)[0], /^the Figma link is refused: .*(not a Figma Design file link|a branch of a file)/);
    assert.equal(r.plan, null);
  }
  assert.equal(check(handoff('v0-app'), { handoff: true, ds: 'carbon' }).verdicts.componentSets.verdict, 'yes, by the shadcn path');
  assert.equal(check(handoff('v0-app'), { figma: FIGMA.replace('/design/', '/file/') }).verdicts.componentSets.verdict, 'yes, by the shadcn path');

  const bad = run(handoff('v0-app'), '--figma', 'https://www.figma.com/design/abc/x', '--handoff', '--ds', 'carbon');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /- Component Sets: no\. The Figma link is refused: https:\/\/www\.figma\.com\/design\/abc\/x is not a Figma Design file link/);
  assert.ok(bad.stdout.includes(`A Handoff can run alone: \`node skills/from-prototype/scripts/from-prototype.mjs check ${handoff('v0-app')} --handoff --ds carbon\`.`), bad.stdout);
  assert.doesNotMatch(bad.stdout + bad.stderr, /\n\s+at /);
});

const stagesOf = r => r.plan.stages.map(s => [s.stage, s.designSystem].filter(Boolean).join(' '));

test('a settled run exits 0 with the stages, each with its folder and Design System', () => {
  const sets = check(handoff('v0-app'), { figma: FIGMA });
  assert.deepEqual(sets.questions, []);
  assert.deepEqual(stagesOf(sets), ['folder v0-app', 'review-page v0-app', 'approve v0-app', 'figma-build v0-app', 'hand-over']);
  assert.equal(sets.plan.stages[0].folder, '.scratch/design-systems/v0-app');
  assert.deepEqual(sets.plan.stages.filter(s => s.owner).map(s => s.stage), ['approve']);
  assert.equal(sets.plan.stages[3].figma, FIGMA);

  const named = check(handoff('vite-app'), { handoff: true, ds: 'carbon' });
  assert.deepEqual(stagesOf(named), ['scratch-copy carbon', 'generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']);
  assert.ok(named.plan.stages.slice(0, -1).every(s => s.folder === '.scratch/design-systems/carbon'));

  // The own folder named with --ds: the folder step and its approve, with no Figma link, then To-handoff against it.
  assert.deepEqual(stagesOf(check(handoff('v0-app'), { handoff: true, ds: 'v0-app' })),
    ['folder v0-app', 'review-page v0-app', 'approve v0-app', 'generate v0-app', 'review v0-app', 'sign-off v0-app', 'hand-over']);

  // Both: the folder step and its approve once, the Figma build, then the Handoff against the settled Design System.
  const both = check(handoff('v0-app'), { figma: FIGMA, handoff: true, ds: 'carbon' });
  assert.deepEqual(stagesOf(both), ['folder v0-app', 'review-page v0-app', 'approve v0-app', 'figma-build v0-app',
    'scratch-copy carbon', 'generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']);
  assert.deepEqual(both.plan.stages.at(-1).outputs, ['componentSets', 'handoff']);

  // --name and --all pass to the folder step.
  const renamed = check(handoff('v0-app'), { figma: FIGMA, name: 'mine', all: true });
  assert.deepEqual(renamed.plan.stages[0], { stage: 'folder', folder: '.scratch/design-systems/mine', designSystem: 'mine', all: true });
  const refusedHandoff = run(BARE, '--figma', FIGMA, '--name', 'mine', '--all', '--handoff', '--ds', 'carbon');
  assert.ok(refusedHandoff.stdout.includes(`--figma ${FIGMA} --name mine --all\``), refusedHandoff.stdout);

  const out = run(handoff('v0-app'), '--figma', FIGMA, '--handoff', '--ds', 'carbon');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Plan:\n1\. Vibe-to-Figma's folder step: \.scratch\/design-systems\/v0-app \(Design System `v0-app`\)\n/);
  assert.ok(out.stdout.includes(`4. the Figma build: .scratch/design-systems/v0-app (Design System \`v0-app\`) into ${FIGMA}\n`), out.stdout);
  assert.match(out.stdout, /5\. the Design System's scratch copy: \.scratch\/design-systems\/carbon \(Design System `carbon`\)\n/);
  assert.match(out.stdout, /9\. the hand-over of Component Sets and a Handoff\n\nNothing was fetched or written\.\n$/);
});

test('a Handoff asked with no --ds, or Component Sets with no folder name, is an owner question: exit 2, no plan', () => {
  const r = run(handoff('vite-app'), '--handoff');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /Owner question: Which Design System is the Handoff against\?\n- here: .*`carbon`.*\. Run again with `--ds <design-system>`\./);
  assert.equal(check(handoff('vite-app'), { handoff: true }).plan, null);

  const unnamed = prototype({ 'package.json': { ...PATH_A_PKG, name: undefined } }, vibe('path-a-app'));
  try {
    const u = check(unnamed, { figma: FIGMA });
    assert.deepEqual(u.questions.map(q => q.id), ['name']);
    assert.match(u.questions[0].question, /pass --name/);
    assert.equal(run(unnamed, '--figma', FIGMA).status, 2);
    assert.equal(run(unnamed, '--figma', FIGMA, '--name', 'unnamed').status, 0);
  } finally { rmSync(unnamed, { recursive: true, force: true }); }

  // The own folder named for a Prototype that can't have Component Sets: Vibe-to-Figma's folder step would refuse it.
  const scss = check(handoff('vite-app'), { handoff: true, ds: 'project-members' });
  assert.deepEqual(scss.questions.map(q => q.id), ['designSystem']);
  assert.match(scss.questions[0].question, /Not `project-members`, this Prototype's own folder: it can't have Component Sets/);
  assert.equal(scss.plan, null);
});

// The lockfile and Tailwind rows (#434, spec #343 Component Sets rows): one variant per row, a committed fixture copied
// and changed, with every row it fails as {row, message, ticket}, in the table's order. A ticket is named only where
// it lifts the refusal.
const NO_LOCKFILE = { row: 'lockfile', message: 'this Prototype has no lockfile: run `npm install --package-lock-only --ignore-scripts` in your project', ticket: undefined };
const NO_STYLESHEET = { row: 'tailwind-stylesheet', message: 'no stylesheet imports `tailwindcss`', ticket: '#364' };
const NOT_YET_LOCK = { row: 'lockfile', message: 'not yet: the reader needs a `package-lock.json`', ticket: '#354' };
const lockWith = (fixture, name, change) => {
  const lock = JSON.parse(read(join(fixture, 'package-lock.json')));
  Object.assign(lock.packages[`node_modules/${name}`], change);
  return lock;
};
// A pnpm workspace whose lockfile sits at its root, two folders above the app.
const workspaceApp = () => {
  const root = copied({ 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n", 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n" });
  cpSync(vibe('path-a-app'), join(root, 'apps/web'), { recursive: true });
  rmSync(join(root, 'apps/web/package-lock.json'));
  return join(root, 'apps/web');
};
// Figma Make's package.json: React only as an optional peer. Once #435's peer-react-or-found-library row lands, the
// bundle fails that row too.
const MAKE_BUNDLE = { 'package.json': { name: 'make-app', private: true, type: 'module', peerDependencies: { react: '19.2.4', 'react-dom': '19.2.4' },
  peerDependenciesMeta: { react: { optional: true }, 'react-dom': { optional: true } }, devDependencies: PATH_A_PKG.devDependencies },
'src/app/components/ui/button.tsx': UTILITIES, 'src/App.tsx': BUTTON_APP };
const { version: SHADCN_PIN } = TOOLS.shadcn;
const { version: TAILWIND_PIN, integrity: TAILWIND_INTEGRITY } = TOOLS.tailwindcss;
const OTHER_SHA512 = 'sha512-' + 'A'.repeat(86) + '==';
const LOCK_VARIANTS = {
  'only a bun.lock': [copied({ 'bun.lock': '{ "lockfileVersion": 1 }\n' }, vibe('path-a-app'), ['package-lock.json']), [NOT_YET_LOCK]],
  'only a bun.lockb': [copied({ 'bun.lockb': 'bun binary' }, vibe('path-a-app'), ['package-lock.json']),
    [{ row: 'lockfile', message: "not supported: the reader takes `bun.lock`, not bun's binary `bun.lockb`", ticket: undefined }]],
  'a pnpm-lock.yaml at a workspace root above the app': [workspaceApp(), [NOT_YET_LOCK]],
  'only a yarn.lock': [copied({ 'yarn.lock': '# yarn lockfile v1\n' }, vibe('path-a-app'), ['package-lock.json']),
    [{ row: 'lockfile', message: 'not supported: no tool writes yarn by default (ADR 0019)', ticket: undefined }]],
  'no lockfile': [copied({}, vibe('path-a-app'), ['package-lock.json']), [NO_LOCKFILE]],
  // Tailwind 3 is written with @tailwind directives: both rows fail, and both are listed.
  'tailwindcss 3.x': [copied({ 'package-lock.json': lockWith(vibe('path-a-app'), 'tailwindcss', { version: '3.4.17' }),
    'src/index.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' }, vibe('path-a-app')),
  [{ row: 'tailwind-version', message: 'not yet: the reader compiles Tailwind 4; this project resolves tailwindcss@3.4.17', ticket: '#364' }, NO_STYLESHEET]],
  'no sha512 integrity': [copied({ 'package-lock.json': lockWith(vibe('path-a-app'), 'tailwindcss', { integrity: 'sha1-K3tQ6lJm9nK1ZQ0x4P2y7r8sT1o=' }) }, vibe('path-a-app')),
    [{ row: 'tailwind-integrity', message: 'package-lock.json gives tailwindcss@4.2.2 no sha512 integrity (sha1-K3tQ6lJm9nK1ZQ0x4P2y7r8sT1o=), the only one the tools step checks', ticket: undefined }]],
  'an integrity that contradicts the pin': [copied({ 'package-lock.json': lockWith(handoff('v0-app'), 'tailwindcss', { integrity: OTHER_SHA512 }) }, handoff('v0-app')),
    [{ row: 'tailwind-integrity', message: `tailwindcss@${TAILWIND_PIN}: the lockfile's integrity ${OTHER_SHA512} does not match the Adapter's pin ${TAILWIND_INTEGRITY}`, ticket: undefined }]],
  'no stylesheet that imports tailwindcss': [copied({ 'src/index.css': 'body { margin: 0; }\n' }, vibe('path-a-app')), [NO_STYLESHEET]],
  'a shadcn pin mismatch': [copied({ 'package-lock.json': lockWith(handoff('v0-app'), 'shadcn', { version: '4.21.0' }) }, handoff('v0-app')),
    [{ row: 'code-library-pins', message: `the project resolves shadcn@4.21.0, but the Adapter pins shadcn@${SHADCN_PIN}`, ticket: '#359' }]],
  'a Figma Make bundle with no lockfile': [copied(MAKE_BUNDLE, vibe('path-a-app'), ['package-lock.json']), [NO_LOCKFILE]],
};

test('each lockfile and Tailwind row refuses Component Sets with its reason and ticket, and the CLI exits 1', () => {
  for (const [name, [dir, reasons]] of Object.entries(LOCK_VARIANTS)) {
    const r = check(dir, { figma: FIGMA });
    assert.equal(r.verdicts.componentSets.verdict, 'no', name);
    assert.deepEqual(r.verdicts.componentSets.reasons, reasons, name);
    const out = run(dir, '--figma', FIGMA);
    assert.equal(out.status, 1, `${name}: ${out.stderr}`);
    // The CLI prints each reason as a sentence, ADR 0019 with its path.
    for (const { message } of reasons) assert.ok(out.stdout.includes(message.slice(1).replace(/ \(ADR 0019\)$/, '')), `${name}: ${out.stdout}`);
  }
  assert.equal(check(LOCK_VARIANTS['a Figma Make bundle with no lockfile'][0]).kind, 'React + Tailwind + shadcn');
});

test("the shadcn path's pins are checked in the stylesheet components.json names, as the Adapter reads it", () => {
  // A shallower stylesheet imports shadcn at a version the Adapter doesn't pin; components.json names one that doesn't.
  const v0 = handoff('v0-app');
  const dir = copied({ 'package-lock.json': lockWith(v0, 'shadcn', { version: '4.21.0' }), 'extra.css': '@import "tailwindcss";\n@import "shadcn/tailwind.css";\n',
    'app/globals.css': read(join(v0, 'app/globals.css')).replace('@import "shadcn/tailwind.css";\n', '') }, v0);
  assert.equal(check(dir).verdicts.componentSets.verdict, 'yes, by the shadcn path');
  assert.equal(check(v0).verdicts.componentSets.verdict, 'yes, by the shadcn path');
});

test('every failing row is listed, not only the first, and a Handoff against a named Design System is not refused by them', () => {
  const bare = check(vibe('tailwind-no-shadcn'));
  assert.deepEqual(bare.verdicts.componentSets.reasons, [NO_LOCKFILE, NO_STYLESHEET]);
  const app = check(handoff('tailwind-app'));
  assert.deepEqual(app.verdicts.componentSets.reasons, [NO_LOCKFILE]);
  assert.equal(app.verdicts.handoff.verdict, 'only against a Design System you name');
});

const OPTION_SETS = [{}, { figma: FIGMA }, { figma: 'https://www.figma.com/design/abc/x', handoff: true, ds: 'carbon' }, { figma: FIGMA, handoff: true, ds: 'carbon' }, { handoff: true }];

test('every run writes nothing, runs and fetches nothing, leaves the Prototype as it was, and loads no fetched parser', () => {
  // A child process whose fs writes, child processes and fetch are recorded before the check is imported, so the
  // answer doesn't depend on what other test files write meanwhile; its module cache holds only what the check loads.
  const script = `
    import { existsSync, readdirSync, statSync } from 'node:fs';
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
    const [prototypes, tools] = JSON.parse(process.argv[1]);
    const list = p => statSync(p).isFile() ? [statSync(p).mtimeMs] : [...files(p)].map(f => f + ' ' + statSync(f).mtimeMs);
    const listTools = p => existsSync(p) ? readdirSync(p).map(n => n + ' ' + statSync(p + '/' + n).mtimeMs) : [];
    const listed = [...prototypes.map(p => [p, list]), ...tools.map(p => [p, listTools])];
    const before = listed.map(([p, of]) => JSON.stringify(of(p)));
    for (const p of prototypes) for (const options of ${JSON.stringify(OPTION_SETS)}) check(p, options);
    const changed = listed.filter(([p, of], i) => JSON.stringify(of(p)) !== before[i]).map(([p]) => p);
    const loaded = Object.keys(require.cache).filter(k => k.includes('/.scratch/'));
    console.log(JSON.stringify({ calls, changed, loaded }));
  `;
  const fixtures = [handoff('v0-app'), handoff('next-app'), handoff('vite-app'), handoff('tailwind-app'), handoff('conditions-app'),
    handoff('invite-teammates'), vibe('path-a-app'), vibe('tailwind-no-shadcn'), vibe('carbon-scss-app'), vibe('html-app'), join(vibe('html-app'), 'index.html')];
  // The Handoff rows' variants (#436) and the lockfile and Tailwind rows' (#434), and the tools folders the readers fetch into.
  const made = VARIANTS.map(variant);
  const variants = [BARE, ...Object.values(LOCK_VARIANTS).map(([dir]) => dir)];
  const tools = [DEFAULT_DIR, join(REPO_ROOT, '.scratch/to-handoff')];
  let r;
  try { r = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([[...fixtures, ...made, ...variants], tools])], { encoding: 'utf8' }); }
  finally { for (const d of made) rmSync(d, { recursive: true, force: true }); }
  assert.equal(r.status, 0, r.stderr);
  const { calls, changed, loaded } = JSON.parse(r.stdout);
  assert.deepEqual(calls, [], 'nothing written, run or fetched');
  assert.deepEqual(changed, [], 'every Prototype and tools folder is as it was');
  assert.deepEqual(loaded, []);
});
