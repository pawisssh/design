// The runtime reader (#113): the scratch copy's source tagging, screenshots per state x breakpoint, computed
// values for the matcher, and the static-only fallback. Tagging tests need the scratch packages; the runtime
// tests also need a browser (the system Chrome, or the Chromium deps.mjs fetches) and skip without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { DEPS_DIR, hasDeps, hasRuntime, loadTypescript } from '../scripts/deps.mjs';
import { generate, loadDesignSystem, render, validateHandoff } from '../scripts/handoff.mjs';
import { readHtml, walk } from '../scripts/reader.mjs';
import { tagHtml, tagJsx } from '../scripts/tag.mjs';
import { DECISIONS, PROTOTYPE, designSystem } from './helpers.mjs';

const noDeps = !hasDeps() && 'To-handoff packages missing; run: node skills/to-handoff/scripts/deps.mjs';

const elements = doc => { const out = []; walk(doc.root, el => out.push(el)); return out; };

test('tagHtml tags every element the reader finds, scripted markup included, with its own file:line:col', { skip: noDeps }, () => {
  const doc = readHtml(PROTOTYPE, 'index.html');
  const tagged = tagHtml(doc);
  const again = readHtml(PROTOTYPE, 'index.html', { text: tagged });
  const before = elements(doc), after = elements(again);
  assert.equal(after.length, before.length);
  assert.ok(before.some(el => el.cond.length) && before.some(el => el.repeat), 'the fixture has branch and .map markup');
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].tag, before[i].tag);
    assert.equal(after[i].attrs['data-handoff-at'], doc.at(before[i].offset), `${before[i].tag} at ${doc.at(before[i].offset)}`);
  }
  for (const s of again.scripts) assert.doesNotThrow(() => new Function(s.text), 'a tagged script still parses');
});

test('tagJsx: a host element rendered through a {...props} spread carries the chain, outermost site first', { skip: noDeps }, () => {
  const ts = loadTypescript();
  const files = {
    'components/ui/button.tsx': 'export function Button(props: any) {\n  return <button className="btn" {...props} />;\n}\n',
    'app/page.tsx': 'export function Page() {\n  return (\n    <main>\n      <Button kind="primary">Send</Button>\n      <>\n        <p>{"hi"}</p>\n      </>\n    </main>\n  );\n}\n',
  };
  // Run the tagged files with a tiny JSX factory: a function component is called, a host element is kept.
  const h = (type, props, ...children) => (typeof type === 'function' ? type({ ...props, children }) : { type, props: props || {}, children });
  const js = rel => ts.transpileModule(tagJsx(files[rel], rel, ts), { compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: 'h', jsxFragmentFactory: 'Fragment', module: ts.ModuleKind.CommonJS } }).outputText;
  const load = (rel, scope) => { const exports = {}; new Function('exports', 'h', 'Fragment', ...Object.keys(scope), js(rel))(exports, h, 'fragment', ...Object.values(scope)); return exports; };
  const { Button } = load('components/ui/button.tsx', {});
  const { Page } = load('app/page.tsx', { Button });
  const main = Page();
  assert.equal(main.props['data-handoff-at'], 'app/page.tsx:3:5');
  const [button, fragment] = main.children;
  assert.equal(button.type, 'button');
  assert.equal(button.props['data-handoff-at'], 'app/page.tsx:4:7 components/ui/button.tsx:2:10');
  assert.equal(fragment.type, 'fragment');
  assert.equal(fragment.props['data-handoff-at'], undefined, 'a fragment is never tagged');
  assert.equal(fragment.children[0].props['data-handoff-at'], 'app/page.tsx:6:9');
  assert.throws(() => tagJsx('const x = <div>;', 'broken.tsx', ts), /broken\.tsx does not parse/);
});

// ---------- the runtime reader end to end (needs a browser) ----------

const noRuntime = !hasRuntime() && 'runtime reader missing (packages or browser); run: node skills/to-handoff/scripts/deps.mjs';
const CARBON_BREAKPOINTS = { sm: 320, md: 672, lg: 1056, xlg: 1312, max: 1584 };
const pngWidth = file => readFileSync(file).readUInt32BE(16);
function treeHash(dir) {
  const h = createHash('sha256');
  const visit = d => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(d, e.name);
    if (e.isDirectory()) visit(p); else h.update(`${relative(dir, p)}\0`).update(readFileSync(p));
  } };
  visit(dir);
  return h.digest('hex');
}

test('runtime: a screenshot per reached state x Carbon breakpoint, the error state stays missing, the Prototype untouched', { skip: noRuntime }, async () => {
  const before = treeHash(dirname(PROTOTYPE));
  const ds = designSystem();
  const { requests, handoff, path } = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS, runtime: true });
  assert.deepEqual(requests, []);
  assert.equal(treeHash(dirname(PROTOTYPE)), before, 'the Prototype directory is byte-unchanged');
  const screen = handoff.screens[0];
  assert.deepEqual(screen.breakpoints, Object.keys(CARBON_BREAKPOINTS));
  for (const state of ['default', 'loading', 'empty', 'success']) {
    for (const [bp, width] of Object.entries(CARBON_BREAKPOINTS)) {
      const shot = screen.states[state].screenshots[bp];
      assert.equal(shot, `screens/invite-teammates.${state}.${bp}.png`, `${state} at ${bp}`);
      assert.equal(pngWidth(join(dirname(path), shot)), width, `${shot} is ${width}px wide`);
    }
  }
  assert.equal(screen.states.error.missing, true);
  assert.deepEqual(validateHandoff(handoff, await loadDesignSystem(ds)).errors, []);
  assert.ok(!handoff.openQuestions.some(q => q.kind === 'runtime'));
});

test('runtime: a state with no reach answer is a decision request; answered unreachable, its screenshots are missing with the reason', { skip: noRuntime }, async () => {
  const ds = designSystem();
  const { 'reach:invite-teammates:empty': _, ...rest } = DECISIONS;
  const asked = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: rest, runtime: true });
  assert.deepEqual(asked.requests.map(r => r.key), ['reach:invite-teammates:empty']);
  const reason = 'only reachable with an empty workspace';
  const { handoff } = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: { ...rest, 'reach:invite-teammates:empty': { unreachable: reason } }, runtime: true });
  for (const bp of Object.keys(CARBON_BREAKPOINTS)) assert.deepEqual(handoff.screens[0].states.empty.screenshots[bp], { missing: true, reason });
  await assert.rejects(generate({ prototype: PROTOTYPE, designSystem: ds, decisions: { ...rest, 'reach:invite-teammates:empty': { steps: [{ hover: '.x' }] } }, runtime: true }), /reach:invite-teammates:empty/);
});

// A copy of the fixture Prototype in a temp dir, with `edit` applied to its index.html and `extra` files added.
function prototypeCopy(edit = t => t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-proto-'));
  cpSync(dirname(PROTOTYPE), dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), edit(readFileSync(PROTOTYPE, 'utf8')));
  for (const [f, text] of Object.entries(extra)) writeFileSync(join(dir, f), text);
  return join(dir, 'index.html');
}
const leadStyle = handoff => {
  for (const r of handoff.screens[0].regions) for (const t of r.text) if (handoff.copy[t.copy].text.startsWith('Teammates get an email')) return t.style;
  return undefined;
};

test('runtime: computed text metrics feed the matcher; a style a script adds at load changes the match the source alone gives', { skip: noRuntime }, async () => {
  // The script's CSS is a string the static reader never parses: only the rendered page sets .lead to 16/24/0.
  const prototype = prototypeCopy(t => t.replace('</body>', `<script>
  const extra = document.createElement('style');
  extra.textContent = '.lead { font-size: 16px; line-height: 24px; letter-spacing: 0; }';
  document.head.append(extra);
</script>
</body>`));
  const ds = designSystem();
  const statically = await generate({ prototype, designSystem: ds, decisions: DECISIONS });
  assert.equal(leadStyle(statically.handoff).textStyle, 'body-compact-01');
  const live = await generate({ prototype, designSystem: designSystem(), decisions: DECISIONS, runtime: true });
  assert.deepEqual(live.requests, []);
  assert.equal(leadStyle(live.handoff).textStyle, 'body-02');
});

test('runtime: a build that fails gives a valid static-only Handoff with the reason in every screenshot and a runtime question', { skip: noRuntime }, async () => {
  const prototype = prototypeCopy(t => t, {
    'package.json': JSON.stringify({ name: 'broken-prototype', private: true, scripts: { build: 'echo the build is broken >&2 && exit 1' } }),
    'package-lock.json': JSON.stringify({ name: 'broken-prototype', lockfileVersion: 3, requires: true, packages: { '': { name: 'broken-prototype' } } }),
  });
  const before = treeHash(dirname(prototype));
  const ds = designSystem();
  const { requests, handoff, path } = await generate({ prototype, designSystem: ds, decisions: DECISIONS, runtime: true });
  assert.deepEqual(requests, []);
  assert.equal(treeHash(dirname(prototype)), before, 'the Prototype directory is byte-unchanged');
  assert.deepEqual(validateHandoff(handoff, await loadDesignSystem(ds)).errors, []);
  const reason = 'static-only: the runtime reader failed: npm run build failed (exit 1): the build is broken';
  for (const [state, s] of Object.entries(handoff.screens[0].states)) if (!s.missing)
    for (const bp of Object.keys(CARBON_BREAKPOINTS)) assert.deepEqual(s.screenshots[bp], { missing: true, reason }, `${state} at ${bp}`);
  const q = handoff.openQuestions.find(x => x.id === 'q-runtime');
  assert.equal(q.kind, 'runtime');
  assert.match(q.text, /npm run build failed \(exit 1\): the build is broken/);
  assert.ok(!existsSync(join(dirname(path), 'screens')), 'no screenshots are written');
  assert.deepEqual(readdirSync(join(DEPS_DIR, 'runs')), [], 'the scratch run is removed');
});

const noRender = async () => noRuntime || (!(await loadDesignSystem(designSystem())).adapter.available() && 'Code Library preview packages missing; run: node skills/adapter-carbon/scripts/sources.mjs');

test('render: the states x breakpoints matrix and the state tabs show the screenshots; a missing one shows its reason', { skip: await noRender() }, async () => {
  const ds = designSystem();
  const { path } = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: { ...DECISIONS, 'reach:invite-teammates:empty': { unreachable: 'only with an empty workspace' } }, runtime: true });
  const html = readFileSync(await render({ handoffPath: path, designSystem: ds }), 'utf8');
  const matrix = html.slice(html.indexOf('<table class="matrix">'), html.indexOf('</table>', html.indexOf('<table class="matrix">')));
  assert.match(matrix, /<tr><th>state<\/th><th>sm<\/th><th>md<\/th><th>lg<\/th><th>xlg<\/th><th>max<\/th><\/tr>/);
  for (const state of ['default', 'loading', 'success'])
    for (const bp of Object.keys(CARBON_BREAKPOINTS)) {
      const src = `../screens/invite-teammates.${state}.${bp}.png`;
      assert.ok(matrix.includes(`<img src="${src}"`), `matrix ${state} ${bp}`);
      assert.ok(existsSync(join(dirname(path), 'renderings', src)), `${src} resolves from the Rendering`);
    }
  assert.equal(matrix.split('screenshot missing · only with an empty workspace').length - 1, 5, 'the unreachable state shows its reason per breakpoint');
  assert.match(matrix, /<tr><th>error<\/th><td class="hatch" colspan="5">/);
  const panel = /data-panel="success"[\s\S]*?<\/div><\/div>/.exec(html)[0];
  for (const bp of Object.keys(CARBON_BREAKPOINTS)) assert.ok(panel.includes(`<img src="../screens/invite-teammates.success.${bp}.png"`), `the success tab shows ${bp}`);
});

test('render: a failed runtime shows its reason in the Rendering', { skip: await noRender() }, async () => {
  const prototype = prototypeCopy(t => t, {
    'package.json': JSON.stringify({ name: 'broken-prototype', private: true, scripts: { build: 'echo the build is broken >&2 && exit 1' } }),
    'package-lock.json': JSON.stringify({ name: 'broken-prototype', lockfileVersion: 3, requires: true, packages: { '': { name: 'broken-prototype' } } }),
  });
  const ds = designSystem();
  const { path } = await generate({ prototype, designSystem: ds, decisions: DECISIONS, runtime: true });
  const html = readFileSync(await render({ handoffPath: path, designSystem: ds }), 'utf8');
  assert.ok(html.includes('screenshot missing · static-only: the runtime reader failed: npm run build failed (exit 1): the build is broken'));
  assert.match(html, /<li id="q-runtime">/);
});
