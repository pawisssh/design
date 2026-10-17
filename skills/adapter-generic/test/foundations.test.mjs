// Tests for the Generic Adapter's foundations step (#118), through its public entry points: `generate()` and the
// CLI, driven by the committed shadcn fixture project. They need the pinned tools in .scratch/adapter-generic/tools
// (gitignored). On a fresh clone, fetch them first: node skills/adapter-generic/scripts/sources.mjs
// Without them every test here is skipped, with that message.
// Run: node --test skills/adapter-generic/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../scripts/foundations.mjs';
import { FIXTURE, hasTools, sha256, snapshotId } from '../scripts/sources.mjs';
import { convert } from '../../contract/scripts/color.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');
const COMMITTED = 'design-systems/shadcn/shadcn.foundations.json';
const CLI = new URL('../scripts/foundations.mjs', import.meta.url).pathname;
const CSS = 'app/globals.css';

const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';
let fixtureRun;
const run = (project = FIXTURE) => {
  if (project !== FIXTURE) return generate({ project, drafts: [] });
  return (fixtureRun = fixtureRun || generate({ project, drafts: [] }));
};

// A copy of the fixture project with its global CSS rewritten by `edit`.
function variant(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-project-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, CSS), edit(readFileSync(join(dir, CSS), 'utf8')));
  return dir;
}

// The custom properties declared in one top-level block of the fixture CSS (`:root`, `.dark`).
function declared(css, selector) {
  const i = css.indexOf(`\n${selector} {`);
  const body = css.slice(i, css.indexOf('\n}', i + 1));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

test('two CLI runs write byte-identical documents', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'generic-foundations-'));
  const out = [1, 2].map(i => {
    const file = join(dir, `run${i}.json`);
    execFileSync('node', [CLI, '-o', file]);
    return readFileSync(file, 'utf8');
  });
  assert.equal(sha256(out[0]), sha256(out[1]));
  assert.equal(out[0], out[1]);
});

test('the committed shadcn foundations document is exactly what this step generates, with the Alert, Button, Card, Label and Textarea Synthesized tokens', { skip }, async () => {
  assert.equal((await generate({ project: FIXTURE, families: ['alert', 'button', 'card', 'label', 'textarea'] })).text, read(COMMITTED));
});

test('light and dark values match the project CSS through the shared converter', { skip }, async () => {
  const { doc } = await run();
  const css = readFileSync(join(FIXTURE, CSS), 'utf8');
  const light = declared(css, ':root'), dark = declared(css, '.dark');
  const colours = Object.keys(light).filter(n => n !== 'radius');
  assert.equal(colours.length, 31);
  for (const name of colours) {
    const v = doc.variables[name];
    assert.ok(v, `${name} is a variable`);
    for (const [mode, text] of [['light', light[name]], ['dark', dark[name] || light[name]]]) {
      const want = convert(text), got = v.values[mode];
      assert.equal(got.raw || got.value, want.hex, `${name}/${mode}`);
      assert.equal(got.alpha === undefined ? 1 : got.alpha, want.alpha, `${name}/${mode} alpha`);
      assert.equal(got.from.css, text, `${name}/${mode} keeps its CSS`);
    }
  }
});

test('Theme has a Light and a Dark mode, Dark with its selector (Light is :root, the page itself); Layout has one mode', { skip }, async () => {
  const { collections } = (await run()).doc;
  assert.deepEqual(collections, [
    { key: 'theme', name: 'Theme', modes: [{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark', selector: '.dark' }] },
    { key: 'layout', name: 'Layout', modes: [{ key: 'default', label: 'Default' }] },
  ]);
});

test('a colour reads as var(--name), scoped from its @theme role', { skip }, async () => {
  const v = (await run()).doc.variables.primary;
  assert.equal(v.collection, 'theme');
  assert.equal(v.name, 'Color/primary');
  assert.equal(v.type, 'COLOR');
  assert.deepEqual(v.codeSyntax, { WEB: 'var(--primary)' });
  assert.deepEqual(v.scopes, ['ALL_FILLS', 'EFFECT_COLOR', 'STROKE_COLOR']);
  assert.deepEqual(v.values.light, { value: '#171717', resolved: '#171717', from: { css: 'oklch(0.205 0 0)' } });
  assert.deepEqual(v.usedBy, []);
  assert.equal(v.family, undefined);
});

test('a clipped oklch value keeps from.css and carries an info note', { skip }, async () => {
  const v = (await run()).doc.variables.destructive;
  assert.deepEqual(v.values.light, { value: '#e7000b', resolved: '#e7000b', from: { css: 'oklch(0.577 0.245 27.325)' },
    level: 'info', reason: 'outside sRGB, clipped per channel' });
  assert.equal(v.values.dark.level, 'info');
  assert.equal(v.values.primary, undefined);
});

test('a colour with alpha is the raw form, since a Figma colour value carries alpha only there', { skip }, async () => {
  const v = (await run()).doc.variables.border;
  assert.deepEqual(v.values.dark, { raw: '#ffffff', alpha: 0.1, resolved: 'rgba(255, 255, 255, 0.1)', from: { css: 'oklch(1 0 0 / 10%)' } });
  assert.deepEqual(v.values.light, { value: '#e5e5e5', resolved: '#e5e5e5', from: { css: 'oklch(0.922 0 0)' } });
});

test('component tokens carry their family: sidebar and chart', { skip }, async () => {
  const { variables } = (await run()).doc;
  assert.equal(variables.sidebar.family, 'sidebar');
  assert.equal(variables['sidebar-primary-foreground'].family, 'sidebar');
  assert.equal(variables['sidebar-primary-foreground'].name, 'Sidebar/sidebar-primary-foreground');
  assert.equal(variables['chart-3'].family, 'chart');
  assert.equal(variables['chart-3'].name, 'Chart/chart-3');
  assert.equal(variables.card.family, undefined);
});

test('spacing-1_5 is 6 px with the default multiplier, as Tailwind compiles p-1.5', { skip }, async () => {
  const { variables } = (await run()).doc;
  assert.deepEqual(variables['spacing-1_5'], {
    collection: 'layout', name: 'Spacing/spacing-1_5', type: 'FLOAT', source: 'tailwindcss@4.3.3 theme.css --spacing',
    scopes: ['GAP', 'WIDTH_HEIGHT'], codeSyntax: { WEB: 'calc(var(--spacing) * 1.5)' },
    values: { default: { value: 6, from: { multiplier: '--spacing', factor: 1.5 } } }, usedBy: [],
  });
  assert.equal(variables['spacing-px'].values.default.value, 1);
  assert.deepEqual(variables['spacing-px'].codeSyntax, { WEB: '1px' });
  assert.equal(variables['spacing-96'].values.default.value, 384);
  assert.equal(variables.spacing, undefined, 'no variable for the multiplier');
  assert.equal(Object.keys(variables).filter(k => k.startsWith('spacing-')).length, 35);
});

test('a project --spacing changes every step', { skip }, async () => {
  const project = variant(css => css.replace('@theme inline {', '@theme {\n  --spacing: 0.3rem;\n}\n\n@theme inline {'));
  const { variables } = (await run(project)).doc;
  assert.equal(variables['spacing-1_5'].values.default.value, 7.2);
  assert.deepEqual(variables['spacing-1_5'].codeSyntax, { WEB: 'calc(var(--spacing) * 1.5)' });
  assert.equal(variables['spacing-1_5'].source, `${CSS} @theme --spacing`);
  assert.equal(variables['spacing-px'].values.default.value, 1);
});

test('radius steps come from --radius, with the codeSyntax Tailwind compiles', { skip }, async () => {
  const { variables } = (await run()).doc;
  assert.deepEqual(variables['radius-sm'], {
    collection: 'layout', name: 'Radius/radius-sm', type: 'FLOAT', source: `${CSS} @theme inline --radius-sm`,
    scopes: ['CORNER_RADIUS'], codeSyntax: { WEB: 'calc(var(--radius) * 0.6)' },
    values: { default: { value: 6, from: { multiplier: '--radius', factor: 0.6 } } }, usedBy: [],
  });
  assert.equal(variables['radius-lg'].values.default.value, 10);
  assert.deepEqual(variables['radius-lg'].codeSyntax, { WEB: 'var(--radius)' });
  assert.equal(variables['radius-4xl'].values.default.value, 26);
  assert.equal(variables.radius, undefined, 'no variable for the multiplier');
});

test('a colour declared only in :root holds the same value in Dark', { skip }, async () => {
  const project = variant(css => css.replace(/(\.dark \{[\s\S]*?)\n  --chart-1: [^;]+;/, '$1'));
  const v = (await run(project)).doc.variables['chart-1'];
  assert.deepEqual(v.values.dark, v.values.light);
});

test('source pins the project files read, with snapshotId and the versions the project resolves', { skip }, async () => {
  const { source, closure, checks } = (await run()).doc;
  const files = ['app/globals.css', 'components.json', 'package-lock.json'];
  assert.deepEqual(Object.keys(source.files), files);
  for (const f of files) assert.equal(source.files[f], `sha256:${sha256(readFileSync(join(FIXTURE, f)))}`);
  assert.equal(source.snapshotId, snapshotId(source.files));
  assert.equal(source.adapter, 'generic');
  assert.deepEqual(source.packages, { shadcn: '4.22.0', tailwindcss: '4.3.3', 'tw-animate-css': '1.4.0' });
  assert.deepEqual(closure, { contracts: [], tokens: [] });
  assert.deepEqual(Object.keys(checks), ['css', 'compiled'], 'no scope check until a Contract exists');
  assert.equal(checks.compiled.matched, 73); // 31 colours, 7 radius steps and 35 spacing steps
  assert.equal(checks.css.converted, 62); // 31 colours x 2 modes
});

test('relative colour syntax fails, naming the property', { skip }, async () => {
  const project = variant(css => css.replace('--ring: oklch(0.708 0 0);', '--ring: oklch(from var(--primary) l c h);'));
  await assert.rejects(run(project), /--ring.*relative colour syntax/);
});

test('a theme property that refers to another fails, naming it', { skip }, async () => {
  const project = variant(css => css.replace('--sidebar: oklch(0.985 0 0);', '--sidebar: var(--background);'));
  await assert.rejects(run(project), /--sidebar refers to another property/);
});

test('a non-colour value that differs by mode fails, naming the property', { skip }, async () => {
  const project = variant(css => css.replace('.dark {', '.dark {\n  --radius: 0.5rem;'));
  await assert.rejects(run(project), /--radius differs between modes/);
});

test('a project whose lockfile resolves another pinned version is refused, naming both', { skip }, async () => {
  const project = variant(css => css);
  const lock = join(project, 'package-lock.json');
  writeFileSync(lock, readFileSync(lock, 'utf8').replace('"node_modules/shadcn": {\n      "version": "4.22.0"', '"node_modules/shadcn": {\n      "version": "4.21.0"'));
  await assert.rejects(run(project), /resolves shadcn@4\.21\.0, but the Adapter pins shadcn@4\.22\.0/);
});

test('the CLI exits non-zero on a failed check and writes nothing', { skip }, () => {
  const project = variant(css => css.replace('--ring: oklch(0.708 0 0);', '--ring: oklch(from var(--primary) l c h);'));
  const out = join(mkdtempSync(join(tmpdir(), 'generic-out-')), 'out.json');
  assert.throws(() => execFileSync('node', [CLI, '--project', project, '-o', out], { stdio: 'pipe' }), e => e.status === 1 && /FAIL: .*--ring/.test(e.stderr));
  assert.equal(existsSync(out), false);
});
