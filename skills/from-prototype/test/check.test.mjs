// The check (#433, #437, spec #343 The check; Kind detection; the gate rows; Owner questions; The stages): the
// Prototype's kind and the files that show it, each output's verdict from its gate table, the owner's questions and the
// plan, through the check's entry and its CLI. Temp-dir Prototypes are written as the path tests write theirs; the
// committed fixtures are read where they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/from-prototype.mjs';
import { fileHash } from '../../to-handoff/scripts/hash.mjs';
import { REPO_ROOT as REPO } from '../../to-handoff/scripts/system.mjs';

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
// A repo root in a temp folder (#438): the committed carbon and shadcn folders' Foundations documents and Contracts,
// a scratch copy of each Design System in `copies`, and the files given, so a test never touches the real
// design-systems/ or .scratch/.
function repoRoot(files = {}, copies = []) {
  const dir = prototype(files);
  const copy = (ds, to) => { for (const f of [`${ds}.foundations.json`, 'contracts']) cpSync(join(REPO, 'design-systems', ds, f), join(dir, to, ds, f), { recursive: true }); };
  for (const ds of ['carbon', 'shadcn']) copy(ds, 'design-systems');
  for (const ds of copies) copy(ds, '.scratch/design-systems');
  return dir;
}
function withRoot(files, body, copies) {
  const root = repoRoot(files, copies);
  try { body(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const SHELL = '<div id="root"></div><script type="module" src="/src/main.tsx"></script>';
const UTILITIES = 'export default () => <div className="flex items-center gap-2 p-4 rounded-md bg-slate-200">Hi</div>;\n';
const reasons = verdict => verdict.reasons.map(r => r.message);
const FIGMA = 'https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/Prototype';

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
    assert.equal(r.verdicts.handoff.verdict, 'only against a Design System you name');
    assert.deepEqual(r.verdicts.handoff.reasons, [{ row: 'own-folder', message: "To-handoff can't yet recognise its sites through the Family map (#265)", ticket: '#265' }]);
  }
  assert.equal(check(vibe('path-a-app')).verdicts.componentSets.verdict, 'yes, by path A');
  // tailwind-app's stylesheet names no font (the text-style-font row, #367).
  assert.deepEqual(check(handoff('tailwind-app')).verdicts.componentSets.reasons.map(r => r.row), ['text-style-font']);
  const bare = check(vibe('tailwind-no-shadcn'));
  assert.equal(bare.verdicts.componentSets.verdict, 'yes, by path A');
  assert.equal(bare.verdicts.handoff.verdict, 'no');
  assert.deepEqual(reasons(bare.verdicts.handoff), ['no reader for this React setup: To-handoff reads Next.js App Router or Vite']);
});

test('a path A app with its own class-styled stylesheets gets a note naming them, linking #331', () => {
  const r = check(handoff('tailwind-app'));
  assert.ok(r.verdicts.componentSets.notes.some(n => n.includes('src/summary.css') && n.includes('#331')), r.verdicts.componentSets.notes.join('\n'));
  assert.ok(!check(vibe('path-a-app')).verdicts.componentSets.notes.some(n => n.includes('#331')));
});

test('the Carbon + SCSS fixtures are React + CSS or SCSS classes: Component Sets not yet (#310)', () => {
  for (const dir of [vibe('carbon-scss-app'), handoff('vite-app')]) {
    const r = check(dir);
    assert.equal(r.kind, 'React + CSS or SCSS classes', dir);
    assert.ok(r.evidence.includes('@carbon/react'), r.evidence.join(', '));
    assert.equal(r.verdicts.componentSets.verdict, 'no');
    assert.deepEqual(reasons(r.verdicts.componentSets), ['not yet: Component Sets for this kind are charted in map #310']);
  }
  // The Vite app's Handoff reads, against `carbon` by import (#321 step 2), with no own folder since it can't have
  // Component Sets; the Carbon + SCSS fixture declares neither Next nor Vite.
  const viteApp = check(handoff('vite-app')).verdicts.handoff;
  assert.equal(viteApp.verdict, 'yes, against `carbon`');
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
  // The v0 fixture's Handoff, `request-access`, is committed in shadcn: the rerun rule answers its Design System.
  const both = run(handoff('v0-app'));
  assert.equal(both.status, 2, both.stderr);
  assert.match(both.stdout, /Owner question: Which outputs should this run make: Component Sets, a Handoff, or both\?\n- Component Sets \(yes, by the shadcn path\): run again with `--figma <url>`\n- a Handoff \(yes, against its own folder\): run again with `--handoff`\nThe Handoff's Design System: `shadcn`, where this Prototype's Handoff `request-access` already is\.\n/);
  assert.deepEqual(check(handoff('v0-app')).questions.map(q => q.id), ['outputs']);
  assert.equal(both.stdout.trim().split('\n').at(-1), 'Nothing was fetched or written.');

  const html = check(vibe('html-app'));
  assert.deepEqual(html.questions.map(q => q.id), ['outputs', 'designSystem']);
  assert.deepEqual(html.questions[0].options.map(o => o.output), ['handoff']);
  // Component Sets alone possible: no Design System question.
  assert.deepEqual(check(vibe('tailwind-no-shadcn')).questions.map(q => q.id), ['outputs']);
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

  const bare = run(vibe('tailwind-no-shadcn'), '--figma', FIGMA, '--handoff', '--ds', 'carbon');
  assert.equal(bare.status, 1);
  assert.ok(bare.stdout.includes(`Component Sets alone are still possible: \`node skills/from-prototype/scripts/from-prototype.mjs check ${vibe('tailwind-no-shadcn')} --figma ${FIGMA}\`.`), bare.stdout);
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

  withRoot({}, root => {
    const named = check(handoff('vite-app'), { handoff: true, ds: 'carbon', root });
    assert.deepEqual(stagesOf(named), ['scratch-copy carbon', 'generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']);
    assert.ok(named.plan.stages.slice(0, -1).every(s => s.folder === '.scratch/design-systems/carbon'));
  });

  // The own folder named with --ds: the folder step and its approve, with no Figma link, then To-handoff against it.
  assert.deepEqual(stagesOf(check(handoff('v0-app'), { handoff: true, ds: 'v0-app' })),
    ['folder v0-app', 'review-page v0-app', 'approve v0-app', 'generate v0-app', 'review v0-app', 'sign-off v0-app', 'hand-over']);

  // Both: the folder step and its approve once, the Figma build, then the Handoff against the settled Design System.
  withRoot({}, root => {
    const both = check(handoff('v0-app'), { figma: FIGMA, handoff: true, ds: 'carbon', root });
    assert.deepEqual(stagesOf(both), ['folder v0-app', 'review-page v0-app', 'approve v0-app', 'figma-build v0-app',
      'scratch-copy carbon', 'generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']);
    assert.deepEqual(both.plan.stages.at(-1).outputs, ['componentSets', 'handoff']);
  });

  // --name and --all pass to the folder step.
  const renamed = check(handoff('v0-app'), { figma: FIGMA, name: 'mine', all: true });
  assert.deepEqual(renamed.plan.stages[0], { stage: 'folder', folder: '.scratch/design-systems/mine', designSystem: 'mine', all: true });
  const refusedHandoff = run(vibe('tailwind-no-shadcn'), '--figma', FIGMA, '--name', 'mine', '--all', '--handoff', '--ds', 'carbon');
  assert.ok(refusedHandoff.stdout.includes(`--figma ${FIGMA} --name mine --all\``), refusedHandoff.stdout);

  const out = run(handoff('v0-app'), '--figma', FIGMA, '--handoff', '--ds', 'carbon');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Plan:\n1\. Vibe-to-Figma's folder step: \.scratch\/design-systems\/v0-app \(Design System `v0-app`\)\n/);
  assert.ok(out.stdout.includes(`4. the Figma build: .scratch/design-systems/v0-app (Design System \`v0-app\`) into ${FIGMA}\n`), out.stdout);
  // --ds naming another Design System than the committed `request-access` Handoff's: the plan says it makes a new one.
  assert.match(out.stdout, /\d\. the hand-over of Component Sets and a Handoff\nNote: this Prototype's Handoff `request-access` is already in `shadcn`; `--ds carbon` makes a new Handoff\.\n\nNothing was fetched or written\.\n$/);
});

test('a Handoff asked with no --ds, or Component Sets with no folder name, is an owner question: exit 2, no plan', () => {
  const r = run(handoff('vite-app'), '--handoff');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /Owner question: Which Design System is the Handoff against\?\n- if your developers build with one of these: .*`carbon`.*\. Run again with `--ds <design-system>`\./);
  assert.equal(check(handoff('vite-app'), { handoff: true }).plan, null);

  const unnamed = prototype({ 'package.json': { dependencies: { react: '19.2.4' }, devDependencies: { vite: '7.0.0', tailwindcss: '4.2.2' } }, 'src/App.tsx': UTILITIES });
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

const OPTION_SETS = [{}, { figma: FIGMA }, { figma: 'https://www.figma.com/design/abc/x', handoff: true, ds: 'carbon' }, { figma: FIGMA, handoff: true, ds: 'carbon' }, { handoff: true }];

// Component Sets rows #435 adds (spec #343 The gate table). Each variant is a committed fixture with a lockfile,
// changed in one way; the owner sees the verdict, the failing row's reason and ticket, and the CLI's exit code.
const read = path => readFileSync(path, 'utf8');
const V0_CSS = read(join(handoff('v0-app'), 'app/globals.css'));
const V0_PKG = JSON.parse(read(join(handoff('v0-app'), 'package.json')));
const PATH_A_PKG = JSON.parse(read(join(vibe('path-a-app'), 'package.json')));
// Figma Make's package.json: React only as an optional peer.
const MAKE_PKG = { name: 'make-app', private: true, type: 'module', peerDependencies: { react: '19.2.4', 'react-dom': '19.2.4' },
  peerDependenciesMeta: { react: { optional: true }, 'react-dom': { optional: true } }, devDependencies: PATH_A_PKG.devDependencies };
const [V0_HEAD, V0_TOKENS] = [V0_CSS.slice(0, V0_CSS.indexOf('\n:root {')), V0_CSS.slice(V0_CSS.indexOf('\n:root {') + 1)];
const USES_BUTTON = { 'src/app/components/ui/button.tsx': UTILITIES, 'src/App.tsx': 'import { Button } from "@/app/components/ui/button";\nexport default () => <Button>Hi</Button>;\n' };
const V0_ROUTER_PKG = { ...V0_PKG, dependencies: { ...V0_PKG.dependencies, 'react-router': '7.9.0' } };
const SETS_ROUTES = 'import { createBrowserRouter } from "react-router";\nimport Page from "./page";\nexport const router = createBrowserRouter([{ path: "/", element: <Page /> }]);\n';
const SETS_VARIANTS = {
  makeUsed: () => prototype({ 'package.json': MAKE_PKG, ...USES_BUTTON }, vibe('path-a-app')),
  // A found folder with no components.json, React in dependencies.
  foundFolder: () => prototype(USES_BUTTON, vibe('path-a-app')),
  makeUnused: () => prototype({ 'package.json': MAKE_PKG, 'src/app/components/ui/button.tsx': 'export const Button = () => null;\n' }, vibe('path-a-app')),
  tokensImported: () => prototype({ 'app/globals.css': V0_HEAD.replace('@import "shadcn/tailwind.css";\n', '$&@import "./theme.css";\n'), 'app/theme.css': V0_TOKENS }, handoff('v0-app')),
  radiusMinus: () => prototype({ 'app/globals.css': V0_CSS.replace('calc(var(--radius) * 0.8)', 'calc(var(--radius) - 2px)') }, handoff('v0-app')),
  noFont: () => prototype({ 'src/index.css': '@import "tailwindcss";\n' }, vibe('path-a-app')),
  fontUnfollowed: () => prototype({ 'app/globals.css': V0_CSS.replace('var(--font-geist-mono)', 'var(--font-code)') }, handoff('v0-app')),
  wouter: () => prototype({ 'package.json': { ...V0_PKG, dependencies: { ...V0_PKG.dependencies, wouter: '3.7.1' } } }, handoff('v0-app')),
  routerElsewhere: () => prototype({ 'package.json': V0_ROUTER_PKG,
    'app/routes.tsx': SETS_ROUTES, 'app/router.tsx': 'import { RouterProvider } from "react-router/dom";\nimport { router } from "./routes";\nexport default () => <RouterProvider router={router} />;\n' }, handoff('v0-app')),
  componentRoutes: () => prototype({ 'package.json': V0_ROUTER_PKG,
    'app/router.tsx': 'import { createBrowserRouter, RouterProvider } from "react-router";\nimport Page from "./page";\nconst router = createBrowserRouter([{ path: "/", Component: Page }]);\nexport default () => <RouterProvider router={router} />;\n' }, handoff('v0-app')),
};
// Each variant's one refusal: its row, its ticket, the message, and the CLI's exit 1 with the reason printed.
function refusedBy(dir, row, ticket, ...says) {
  const sets = check(dir).verdicts.componentSets;
  assert.equal(sets.verdict, 'no', dir);
  const reason = sets.reasons.find(r => r.row === row);
  assert.ok(reason, `${dir}: no ${row} reason in ${JSON.stringify(sets.reasons)}`);
  assert.equal(reason.ticket, ticket);
  for (const text of says) assert.ok(reason.message.includes(text), `${reason.message} names ${text}`);
  const out = run(dir, '--figma', FIGMA);
  assert.equal(out.status, 1, out.stderr);
  assert.ok(out.stdout.includes(reason.message.slice(1)), out.stdout);
}
const withVariants = (names, body) => {
  const dirs = names.map(n => SETS_VARIANTS[n]());
  try { body(...dirs); } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
};

test('two Figma Make shapes, React only as an optional peer and no components.json, are refused until #358', () => {
  withVariants(['makeUsed', 'makeUnused', 'foundFolder'], (used, unused, found) => {
    assert.equal(check(used).kind, 'React + Tailwind + shadcn');
    assert.equal(check(unused).kind, 'React + Tailwind, no Code Library');
    for (const dir of [used, unused])
      refusedBy(dir, 'peer-react-or-found-library', '#358', 'not yet: the readers need React outside `peerDependencies` and a `components.json` (#358)');
    // A found folder with no components.json is refused with React in dependencies too.
    refusedBy(found, 'peer-react-or-found-library', '#358');
  });
});

test("the older shadcn theme is refused until #360, naming which form it has", () => {
  withVariants(['tokensImported', 'radiusMinus'], (tokens, radius) => {
    refusedBy(tokens, 'shadcn-theme', '#360', "not yet (#360): the Adapter reads shadcn's nova theme; this Prototype has the older form",
      'tokens in app/theme.css, which app/globals.css imports');
    refusedBy(radius, 'shadcn-theme', '#360', '`calc(var(--radius) - 2px)` in app/globals.css');
  });
});

test("a stylesheet with no @theme --font-sans, or a font var() the Adapter can't follow, is refused until #367", () => {
  withVariants(['noFont', 'fontUnfollowed'], (none, unfollowed) => {
    refusedBy(none, 'text-style-font', '#367', "not yet (#367): the Adapter can't read the Prototype's font for its Text Styles",
      'src/index.css declares no @theme --font-sans');
    refusedBy(unfollowed, 'text-style-font', '#367', '--font-mono refers to --font-code, which no next/font loader in app/layout.tsx sets');
  });
});

test('wouter gets a note until #350; a data router defined in another file, or Component: routes, need --all until #361', () => {
  withVariants(['wouter', 'routerElsewhere', 'componentRoutes'], (wouter, elsewhere, component) => {
    const sets = check(wouter).verdicts.componentSets;
    assert.equal(sets.verdict, 'yes, by the shadcn path');
    assert.ok(sets.notes.some(n => n.includes('wouter') && n.includes('`--all`') && n.includes('#350')), sets.notes.join('\n'));
    const out = run(wouter, '--figma', FIGMA);
    assert.equal(out.status, 0, out.stdout);
    assert.match(out.stdout, /Note: with wouter the default family list comes from one screen/);
    for (const dir of [elsewhere, component])
      refusedBy(dir, 'screens', '#361', "only with `--all`: the screens can't be read until #361 (a data router built in another file, or `Component:` routes)");
  });
});

test("every React kind's Component Sets verdict notes that a form's controls inside a render prop are not counted (#349)", () => {
  const modules = prototype({ 'package.json': { dependencies: { react: '19.2.4' }, devDependencies: { vite: '7.0.0' } }, 'src/App.tsx': 'import s from "./App.module.css";\nexport default () => <p className={s.x}>Hi</p>;\n', 'src/App.module.css': '.x { color: red; }' });
  try {
    for (const dir of [handoff('v0-app'), vibe('path-a-app'), handoff('vite-app'), modules]) {
      const notes = check(dir).verdicts.componentSets.notes;
      assert.ok(notes.includes("a form's controls inside a render prop are not counted yet (#349)"), `${dir}: ${notes.join('\n')}`);
    }
    assert.deepEqual(check(vibe('html-app')).verdicts.componentSets.notes, []);
  } finally { rmSync(modules, { recursive: true, force: true }); }
});

// The Handoff's Design System (#438, spec #343 The Handoff's Design System; Scratch roots).
const handoffAt = (ds, key) => ({ [`.scratch/design-systems/${ds}/handoffs/${key}/handoff.json`]: '{}' });
const dsQuestion = r => r.questions.find(q => q.id === 'designSystem');

test('--handoff alone on the Carbon fixture: exit 2 with the Design System question, `carbon` its default by import', () => {
  const r = run(handoff('vite-app'), '--handoff');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /- Handoff: yes, against `carbon`\./);
  assert.match(r.stdout, /\n- if your developers build with one of these: .*`carbon`.*\. Run again with `--ds <design-system>`\.\n- default: `carbon`, whose Contracts' package `@carbon\/react` this Prototype depends on\.\n/);
  assert.doesNotMatch(r.stdout, /None: this Prototype's own folder/);
  assert.equal(dsQuestion(check(handoff('vite-app'), { handoff: true })).default, 'carbon');
});

test("the list shows a scratch copy and its committed folder as one, and the own folder only while that route is open", () => {
  withRoot({ '.scratch/design-systems/mine/mine.foundations.json': '{}' }, root => {
    const v0 = dsQuestion(check(handoff('v0-app'), { handoff: true, root }));
    assert.deepEqual(v0.options, ['carbon', 'mine', 'shadcn']);
    assert.equal(v0.own, 'v0-app');
    // Path A's own-folder route is closed until #265, and the Carbon app can't have Component Sets.
    for (const dir of [vibe('path-a-app'), handoff('vite-app'), vibe('html-app')]) {
      const q = dsQuestion(check(dir, { handoff: true, root }));
      assert.deepEqual(q.options, ['carbon', 'mine', 'shadcn'], dir);
      assert.equal(q.own, undefined, dir);
    }
  }, ['carbon']);
});

test('the default: a Design System whose Contracts\' package the Prototype depends on, else the own folder, else none; never shadcn by import', () => {
  const carbonV0 = prototype({ 'package.json': { ...V0_PKG, dependencies: { ...V0_PKG.dependencies, '@carbon/react': '1.90.0' } } }, handoff('v0-app'));
  try {
    withRoot({}, root => {
      assert.equal(dsQuestion(check(handoff('vite-app'), { handoff: true, root })).default, 'carbon');
      // The v0 fixture names shadcn's Code Library, yet shadcn's Contracts name project files: its own folder.
      assert.equal(dsQuestion(check(handoff('v0-app'), { handoff: true, root })).default, 'v0-app');
      assert.equal(check(handoff('v0-app'), { root }).verdicts.handoff.verdict, 'yes, against its own folder');
      // Both its own folder and an imported Design System: no default (#321 D6).
      const both = check(carbonV0, { handoff: true, root });
      assert.equal(dsQuestion(both).default, null);
      assert.equal(both.verdicts.handoff.verdict, 'yes, against its own folder');
      for (const dir of [vibe('path-a-app'), vibe('html-app')]) assert.equal(dsQuestion(check(dir, { handoff: true, root })).default, null, dir);
    });
  } finally { rmSync(carbonV0, { recursive: true, force: true }); }
});

test('the rerun rule: an existing Handoff of the feature key is the answer; --ds naming another makes a new Handoff', () => {
  withRoot(handoffAt('carbon', 'project-members'), root => {
    const r = check(handoff('vite-app'), { handoff: true, root });
    assert.deepEqual(r.questions, []);
    assert.deepEqual(r.designSystem, { name: 'carbon', key: 'project-members', existing: ['carbon'] });
    assert.deepEqual(stagesOf(r), ['generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']);
    assert.deepEqual(r.plan.notes, []);
    // No output asked: the outputs question alone.
    assert.deepEqual(check(handoff('vite-app'), { root }).questions.map(q => q.id), ['outputs']);
    const other = check(handoff('vite-app'), { handoff: true, ds: 'shadcn', root });
    assert.deepEqual(stagesOf(other), ['scratch-copy shadcn', 'generate shadcn', 'review shadcn', 'sign-off shadcn', 'hand-over']);
    assert.deepEqual(other.plan.notes, ["this Prototype's Handoff `project-members` is already in `carbon`; `--ds shadcn` makes a new Handoff"]);
    assert.deepEqual(check(handoff('vite-app'), { handoff: true, ds: 'carbon', root }).plan.notes, []);
  }, ['carbon']);
  // In two Design Systems: the owner names one of them.
  withRoot({ ...handoffAt('carbon', 'project-members'), ...handoffAt('shadcn', 'project-members') }, root => {
    const q = dsQuestion(check(handoff('vite-app'), { handoff: true, root }));
    assert.deepEqual(q.existing, ['carbon', 'shadcn']);
    assert.equal(q.default, null);
  }, ['carbon', 'shadcn']);
});

test('an unknown --ds is refused, listing the Design Systems here', () => {
  withRoot({}, root => {
    const r = check(handoff('vite-app'), { handoff: true, ds: 'nope', root });
    assert.deepEqual(r.refusals, ['`--ds nope` names no Design System here: `carbon`, `shadcn`']);
    assert.deepEqual(r.questions, []);
    assert.equal(r.plan, null);
  });
  // With no output asked too: a bad --ds never stands in for the owner's answer.
  withRoot({}, root => assert.equal(check(handoff('vite-app'), { ds: 'nope', root }).refusals.length, 1));
  const out = run(handoff('vite-app'), '--handoff', '--ds', 'nope');
  assert.equal(out.status, 1, out.stderr);
  assert.match(out.stdout, /\n- `--ds nope` names no Design System here: .*`carbon`.*\.\n/);
  assert.doesNotMatch(out.stdout, /still possible/);
});

test('a scratch copy is used in place: the plan names the committed files that moved, and the check never copies', () => {
  withRoot({}, root => {
    check(handoff('vite-app'), { handoff: true, ds: 'carbon', root });
    assert.equal(existsSync(join(root, '.scratch/design-systems/carbon')), false);
  });
  withRoot({}, root => {
    assert.deepEqual(check(handoff('vite-app'), { handoff: true, ds: 'carbon', root }).plan.notes, []);
    const copy = join(root, '.scratch/design-systems/carbon');
    writeFileSync(join(copy, 'carbon.foundations.json'), '{}');
    const gone = `contracts/${readdirSync(join(copy, 'contracts')).sort()[0]}`;
    rmSync(join(copy, gone));
    writeFileSync(join(copy, 'contracts/written-mid-run.component.json'), '{}');
    const r = check(handoff('vite-app'), { handoff: true, ds: 'carbon', root });
    assert.deepEqual(stagesOf(r), ['generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']);
    assert.deepEqual(r.plan.moved, { designSystem: 'carbon', files: ['carbon.foundations.json', gone] });
    assert.equal(r.plan.notes.length, 1);
    for (const part of [`the committed Design System \`carbon\` has moved since its scratch copy was made: carbon.foundations.json, ${gone}`,
      "puts the copy's signed Handoffs into Drift", 'only when the owner says so in chat', '`handoffs/`'])
      assert.ok(r.plan.notes[0].includes(part), r.plan.notes[0]);
  }, ['carbon']);
});

test('a name collision with a committed Design System or another scratch folder is refused until --name is passed', () => {
  const named = name => prototype({ 'package.json': { ...PATH_A_PKG, name } }, vibe('path-a-app'));
  const carbonApp = named('carbon');
  try {
    withRoot({ '.scratch/design-systems/path-a-app/path-a-app.foundations.json': '{}' }, root => {
      for (const [dir, name] of [[carbonApp, 'carbon'], [vibe('path-a-app'), 'path-a-app']]) {
        const r = check(dir, { figma: FIGMA, root });
        assert.equal(r.refusals.length, 1, dir);
        assert.match(r.refusals[0], new RegExp(`^this Prototype's own folder, \`\\.scratch/design-systems/${name}\`, is taken by .*: pass \`--name\`$`));
        assert.equal(r.plan, null);
        assert.deepEqual(r.questions, []);
        assert.deepEqual(check(dir, { figma: FIGMA, name: 'mine', root }).refusals, []);
      }
      // Its own folder is not in play: no collision when the Handoff is against another Design System, or against the
      // committed one its name collides with.
      assert.ok(check(carbonApp, { handoff: true, ds: 'shadcn', root }).plan);
      const carbonVite = prototype({ 'package.json': { ...JSON.parse(read(join(handoff('vite-app'), 'package.json'))), name: 'carbon' } }, handoff('vite-app'));
      try { assert.deepEqual(stagesOf(check(carbonVite, { handoff: true, ds: 'carbon', root })), ['scratch-copy carbon', 'generate carbon', 'review carbon', 'sign-off carbon', 'hand-over']); }
      finally { rmSync(carbonVite, { recursive: true, force: true }); }
    });
    // A scratch folder is this Prototype's own when its Family map's sites are this Prototype's files, or its Foundations
    // document read this Prototype's components.json.
    const map = JSON.stringify({ families: { card: { by: 'agent', sites: [{ file: 'src/App.tsx', path: 'App>div' }] } } });
    const v0Read = Object.fromEntries(['components.json', 'app/globals.css'].map(f => [f, fileHash(readFileSync(join(handoff('v0-app'), f)))]));
    const v0Foundations = files => ({ '.scratch/design-systems/v0-app/v0-app.foundations.json': JSON.stringify({ source: { files } }) });
    withRoot({ '.scratch/design-systems/path-a-app/path-a-app.family-map.json': map, ...v0Foundations(v0Read) }, root => {
      assert.deepEqual(check(vibe('path-a-app'), { figma: FIGMA, root }).refusals, []);
      assert.deepEqual(stagesOf(check(handoff('v0-app'), { figma: FIGMA, root })), ['folder v0-app', 'review-page v0-app', 'approve v0-app', 'figma-build v0-app', 'hand-over']);
    });
    // Another project's stylesheet beside the same components.json: not this Prototype's own.
    withRoot(v0Foundations({ ...v0Read, 'app/globals.css': fileHash('.other {}') }), root =>
      assert.equal(check(handoff('v0-app'), { figma: FIGMA, root }).refusals.length, 1));
    const out = run(carbonApp, '--figma', FIGMA);
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stdout, /pass `--name`/);
  } finally { rmSync(carbonApp, { recursive: true, force: true }); }
});

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
  // Each Handoff row's variant, each Component Sets row's (#435), and the tools folders the readers fetch into.
  const variants = [...VARIANTS.map(variant), ...Object.values(SETS_VARIANTS).map(make => make())];
  const tools = ['.scratch/adapter-generic/tools', '.scratch/to-handoff'].map(d => join(REPO, d));
  let r;
  try { r = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([[...fixtures, ...variants], tools])], { encoding: 'utf8' }); }
  finally { for (const d of variants) rmSync(d, { recursive: true, force: true }); }
  assert.equal(r.status, 0, r.stderr);
  const { calls, changed, loaded } = JSON.parse(r.stdout);
  assert.deepEqual(calls, [], 'nothing written, run or fetched');
  assert.deepEqual(changed, [], 'every Prototype and tools folder is as it was');
  assert.deepEqual(loaded, []);
});
