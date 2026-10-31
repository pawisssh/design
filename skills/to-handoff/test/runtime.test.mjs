// The runtime reader (#113): the scratch copy's source tagging, screenshots per state x breakpoint, computed
// values for the matcher, and the static-only fallback. Tagging tests need the scratch packages; the runtime
// tests also need a browser (the system Chrome, or the Chromium deps.mjs fetches) and skip without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPS_DIR, hasDeps, hasRuntime, loadTypescript } from '../scripts/deps.mjs';
import { generate, loadDesignSystem, render, screenshotRendering, validateHandoff } from '../scripts/handoff.mjs';
import { readHtml, walk } from '../scripts/reader.mjs';
import { tagHtml, tagJsx } from '../scripts/tag.mjs';
import { DECISIONS, PROTOTYPE, V0, V0_DECISIONS, decided, designSystem, shadcnDesignSystem, usagesOf, v0Copy } from './helpers.mjs';

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
  // The screenshots show where the media query applies: the question names that, never a missing viewport (#146).
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-breakpoint-max-width-640px').text,
    '@media (max-width: 640px) changes .actions, .actions .btn. In the screenshots it applies at sm (320px), not at md (672px), lg (1056px), xlg (1312px) or max (1584px); 640px falls between sm and md. Which Design System breakpoint is it, and what should change there?');
});

test('runtime: a re-run on the same inputs writes nothing and leaves the screenshots byte for byte', { skip: noRuntime }, async () => {
  const ds = designSystem();
  const first = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS, runtime: true });
  const shot = join(dirname(first.path), first.handoff.screens[0].states.success.screenshots.md);
  const bytes = readFileSync(shot);
  const again = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS, runtime: true });
  assert.equal(again.wrote, false);
  assert.equal(again.contentHash, first.contentHash);
  assert.ok(readFileSync(shot).equals(bytes));
});

test('runtime: a Handoff rewritten while the Prototype is unchanged keeps its screenshots; a Prototype change retakes them', { skip: noRuntime }, async () => {
  const ds = designSystem();
  const prototype = prototypeCopy();
  const first = await generate({ prototype, designSystem: ds, decisions: DECISIONS, runtime: true });
  const shot = join(dirname(first.path), first.handoff.screens[0].states.success.screenshots.md);
  // The same image with bytes after its end: a retake replaces it, keeping leaves it.
  const kept = Buffer.concat([readFileSync(shot), Buffer.from('kept')]);
  writeFileSync(shot, kept);
  const goal = { ...DECISIONS, feature: { ...DECISIONS.feature, goal: 'Invite teammates by email.' } };
  const reworded = await generate({ prototype, designSystem: ds, decisions: goal, runtime: true });
  assert.equal(reworded.wrote, true);
  assert.ok(readFileSync(shot).equals(kept), 'the Prototype is unchanged: the screenshot is kept');
  writeFileSync(prototype, readFileSync(prototype, 'utf8').replace('</body>', '<!-- edited -->\n</body>'));
  const edited = await generate({ prototype, designSystem: ds, decisions: goal, runtime: true });
  assert.equal(edited.wrote, true);
  assert.ok(!readFileSync(shot).equals(kept), 'the Prototype changed: the screenshot is retaken');
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
// A package.json with only a build script, and its lockfile, so `npm ci` installs nothing.
const packageFiles = build => ({
  'package.json': JSON.stringify({ name: 'prototype', private: true, scripts: { build } }),
  'package-lock.json': JSON.stringify({ name: 'prototype', lockfileVersion: 3, requires: true, packages: { '': { name: 'prototype' } } }),
});
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
  const prototype = prototypeCopy(t => t, packageFiles('echo the build is broken >&2 && exit 1'));
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
  assert.match(handoff.openQuestions.find(x => x.id === 'q-breakpoint-max-width-640px').text, /the static reader has no viewport/, 'a failed runtime run is static-only');
  assert.match(q.text, /npm run build failed \(exit 1\): the build is broken/);
  assert.ok(!existsSync(join(dirname(path), 'screens')), 'no screenshots are written');
  // Other test files run concurrently and keep their own runs: look only for this Prototype's copy.
  const ours = readdirSync(join(DEPS_DIR, 'runs')).filter(run => {
    const pkg = join(DEPS_DIR, 'runs', run, 'copy', 'package.json');
    return existsSync(pkg) && readFileSync(pkg, 'utf8').includes('the build is broken');
  });
  assert.deepEqual(ours, [], 'the scratch run is removed');
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

test('render --screenshot writes a PNG of the Rendering beside index.html; plain render writes none (#243)', { skip: await noRender() }, async () => {
  const ds = designSystem();
  const { path } = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS, runtime: false });
  const png = join(dirname(path), 'renderings/index.png');
  const cli = args => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/handoff.mjs', import.meta.url)), 'render', path, '--ds', ds, ...args], { encoding: 'utf8' });
  const plain = cli([]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(!existsSync(png));
  const shot = cli(['--screenshot']);
  assert.equal(shot.status, 0, shot.stderr);
  const bytes = readFileSync(png);
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR: width, height. A full-page shot of the long Rendering is taller than the 800px viewport.
  assert.equal(bytes.readUInt32BE(16), 1280);
  assert.ok(bytes.readUInt32BE(20) > 800);
  assert.ok(existsSync(join(dirname(path), 'renderings/index.html')));
});

test('screenshotRendering without a browser gives a note and no PNG (#243)', { skip: noDeps }, async () => {
  const html = join(mkdtempSync(join(tmpdir(), 'rendering-')), 'index.html');
  writeFileSync(html, '<p>x</p>');
  const r = await screenshotRendering(html, mkdtempSync(join(tmpdir(), 'no-deps-')));
  assert.match(r.note, /missing/);
  assert.ok(!existsSync(html.replace(/html$/, 'png')));
});

test('runtime: a package.json with neither Next nor Vite is installed, built and its files served', { skip: noRuntime }, async () => {
  const prototype = prototypeCopy(t => t, packageFiles('node -e ""'));
  const { requests, handoff } = await generate({ prototype, designSystem: designSystem(), decisions: DECISIONS, runtime: true });
  assert.deepEqual(requests, []);
  assert.equal(handoff.screens[0].states.default.screenshots.max, 'screens/invite-teammates.default.max.png');
});

test('render: a failed runtime shows its reason in the Rendering', { skip: await noRender() }, async () => {
  const prototype = prototypeCopy(t => t, packageFiles('echo the build is broken >&2 && exit 1'));
  const ds = designSystem();
  const { path } = await generate({ prototype, designSystem: ds, decisions: DECISIONS, runtime: true });
  const html = readFileSync(await render({ handoffPath: path, designSystem: ds }), 'utf8');
  assert.ok(html.includes('screenshot missing · static-only: the runtime reader failed: npm run build failed (exit 1): the build is broken'));
  assert.match(html, /<li id="q-runtime">/);
});

// ---------- computed colours on a React Prototype's runtime run (#284) ----------

const THEMED = fileURLToPath(new URL('fixtures/tailwind-theme-app', import.meta.url));
const colours = region => region.styles.filter(s => /color$/.test(s.property));
const lengths = region => region.styles.filter(s => /^(padding|margin|gap|row-gap|column-gap)|radius$/.test(s.property));

test("runtime: a React Prototype's computed colours fill its styles: a --color-* chain binds its token, a palette colour matches by value (#284)", { skip: noRuntime }, async () => {
  const ds = shadcnDesignSystem();
  const { requests, handoff } = await generate({ prototype: THEMED, designSystem: ds, decisions: decided(), runtime: true });
  assert.deepEqual(requests, []);
  const summary = handoff.screens[0].regions.find(r => r.id === 'summary');
  const badge = handoff.values.find(v => v.at.includes('src/App.jsx:13:7'));
  assert.deepEqual(colours(summary), [
    { property: 'background-color', raw: 'var(--color-card)', at: ['src/App.jsx:8:5'], token: 'card', via: ['--color-card'] },
    // Set once on the section: its heading and paragraph inherit it.
    { property: 'color', raw: 'var(--color-primary)', at: ['src/App.jsx:9:7'], token: 'primary', via: ['--color-primary'] },
    // Tailwind's own palette variable: Foundations doesn't know it, so the computed colour matches by value.
    { property: 'background-color', raw: 'var(--color-blue-500)', at: ['src/App.jsx:13:7'], value: `value:${badge.id}` },
    // Four equal sides are one entry; the global border-color reset draws no border, so it records nothing.
    { property: 'border-color', raw: 'var(--color-primary)', at: ['src/App.jsx:14:7'], token: 'primary', via: ['--color-primary'] },
  ]);
  assert.equal(badge.role, 'background-color');
  assert.equal(badge.raw.light, '#2b7fff');
  assert.match(badge.reason, /No .* token is within ΔE/);
  assert.deepEqual(handoff.screens[0].regions.flatMap(colours).filter(s => s.at.includes('src/App.jsx:8:5') && s.property !== 'background-color'), []);
  const again = await generate({ prototype: THEMED, designSystem: ds, decisions: decided(), runtime: true });
  assert.equal(again.wrote, false, 'a re-run on the same inputs is unchanged');
});

test('runtime: a static run of a React Prototype keeps its colours from the source declarations alone (#284)', { skip: noDeps }, async () => {
  const { handoff } = await generate({ prototype: THEMED, designSystem: shadcnDesignSystem(), decisions: decided() });
  assert.deepEqual(handoff.screens[0].regions.flatMap(colours), [], 'Tailwind utilities declare nothing the static reader reads');
  assert.deepEqual(handoff.values, []);
});

test("runtime: v0's white surfaces bind their own tokens by the built reference, with no token-tie (#284)", { skip: noRuntime }, async () => {
  const { requests, handoff } = await generate({ prototype: V0, designSystem: shadcnDesignSystem(), decisions: V0_DECISIONS, runtime: true });
  assert.deepEqual(requests.filter(r => r.kind === 'token-tie'), []);
  const styles = handoff.screens[0].regions.flatMap(r => r.styles);
  const bg = at => styles.find(s => s.property === 'background-color' && s.at.includes(at));
  assert.equal(bg('app/layout.tsx:28:7').token, 'background', 'the body');
  assert.equal(bg('app/page.tsx:17:5').token, 'muted', 'the page: muted, not its value twins secondary and accent');
  assert.deepEqual(usagesOf(handoff).flatMap(u => (u.offAxis || []).filter(o => o.question.startsWith('q-off-axis-'))), [], "no Usage's computed colours are Off-axis (#286)");
});

// ---------- Off-axis from a Contract Usage's computed colours on a React Prototype's runtime run (#286) ----------

test("runtime: a Contract Usage's stray computed background is Off-axis with its question; an inherited text colour is not (#286)", { skip: noRuntime }, async () => {
  const prototype = v0Copy([
    // The success state's outline Button: a stray background, and a text colour it inherits from a red parent.
    ['app/request-access-form.tsx', 'gap-3 py-6 text-center">', 'gap-3 py-6 text-center text-red-600">'],
    ['app/request-access-form.tsx', '<Button variant="outline" onClick', '<Button variant="outline" className="bg-red-500" onClick'],
  ]);
  const ds = shadcnDesignSystem();
  const { requests, handoff, path } = await generate({ prototype, designSystem: ds, decisions: V0_DECISIONS, runtime: true });
  assert.deepEqual(requests, []);
  const off = usagesOf(handoff).flatMap(u => (u.offAxis || []).filter(o => o.question.startsWith('q-off-axis-')).map(o => ({ id: u.id, at: u.at, ...o })));
  assert.deepEqual(off.map(({ reason, ...o }) => o), [
    { id: 'button', at: 'app/request-access-form.tsx:48:9', property: 'background-color', raw: '#fb2c36', question: 'q-off-axis-button' },
  ], 'the stray bg-red-500 only: the inherited red text is not the Button setting it');
  assert.match(off[0].reason, /^`button` outline .* paints no #fb2c36 in Light$/);
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-off-axis-button').text,
    '`button` (button) sets background-color #fb2c36, which its tuple does not paint. Keep the Contract\'s look, pick another tuple, or record a variant?');
  const html = readFileSync(await render({ handoffPath: path, designSystem: ds }), 'utf8');
  const card = html.slice(html.indexOf('<h3>button</h3>'), html.indexOf('</article>', html.indexOf('<h3>button</h3>')));
  assert.match(card, /↯/, "the Usage's card flags it Off-axis");
  assert.match(card, /paints no #fb2c36/);
});

// ---------- computed spacing and radius on a React Prototype's runtime run (#285) ----------

test("runtime: a React Prototype's computed padding, margin, gap and radius fill its styles: equal sides are one entry, resets, auto and percentages record nothing (#285)", { skip: noRuntime }, async () => {
  const ds = shadcnDesignSystem();
  const { requests, handoff } = await generate({ prototype: THEMED, designSystem: ds, decisions: decided(), runtime: true });
  assert.deepEqual(requests, []);
  assert.deepEqual(handoff.screens[0].regions.flatMap(lengths), [
    // p-4 is calc(var(--spacing) * 4): no single reference, so 16px matches by value.
    { property: 'padding', raw: '16px', at: ['src/App.jsx:9:7'], token: 'spacing-4' },
    { property: 'border-radius', raw: 'var(--radius-lg)', at: ['src/App.jsx:9:7'], token: 'radius-lg', via: ['--radius-lg'] },
    // px-4 py-2: unequal sides stay per side; rounded-full is calc(infinity * 1px), skipped.
    { property: 'padding-top', raw: '8px', at: ['src/App.jsx:13:7'], token: 'spacing-2' },
    { property: 'padding-right', raw: '16px', at: ['src/App.jsx:13:7'], token: 'spacing-4' },
    { property: 'padding-bottom', raw: '8px', at: ['src/App.jsx:13:7'], token: 'spacing-2' },
    { property: 'padding-left', raw: '16px', at: ['src/App.jsx:13:7'], token: 'spacing-4' },
    // A flex container's gap; the block's gap-5 draws nothing.
    { property: 'gap', raw: '12px', at: ['src/App.jsx:15:7'], token: 'spacing-3' },
    // mt-6 beside mx-auto: the auto sides and the reset's zero record nothing.
    { property: 'margin-top', raw: '24px', at: ['src/App.jsx:20:7'], token: 'spacing-6' },
    // margin: 16px auto: the auto sides record nothing, the 16px ones do.
    { property: 'margin-top', raw: '16px', at: ['src/App.jsx:21:7'], token: 'spacing-4' },
    { property: 'margin-bottom', raw: '16px', at: ['src/App.jsx:21:7'], token: 'spacing-4' },
    // mx-auto lg:mx-8 at the widest breakpoint: the lg rule wins, so its 32px records.
    { property: 'margin-right', raw: '32px', at: ['src/App.jsx:22:7'], token: 'spacing-8' },
    { property: 'margin-left', raw: '32px', at: ['src/App.jsx:22:7'], token: 'spacing-8' },
    // p-[10%] m-[5%] compute to px, but a percentage records nothing.
  ]);
});
