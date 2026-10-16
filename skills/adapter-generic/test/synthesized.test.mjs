// Synthesized tokens (#120): paint that differs by Mode, carries an opacity or mixes tokens becomes a per-mode Theme
// token the Contract binds as a plain {token}. Driven through `readFamily()` and `generate()` of the component step,
// on the committed shadcn fixture project or a copy of it. They need the pinned tools
// (node skills/adapter-generic/scripts/sources.mjs); without them every test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate as component, readFamily } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';
import { resolve } from '../../contract/scripts/contract.mjs';

const BUTTON = 'components/ui/button.tsx';
const CSS = 'app/globals.css';
const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';

// The Code Library tokens alone: the Foundations document before any family adds its Synthesized tokens.
let base;
const foundations = async () => (base = base || library({ project: FIXTURE })).then(r => r.doc);
let fixtureRun;
const button = () => (fixtureRun = fixtureRun || foundations().then(doc => readFamily({ project: FIXTURE, family: 'button', foundations: doc })));

// A copy of the fixture project with one file rewritten by `edit`.
function variant(file, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-synthesized-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), 'utf8')));
  return dir;
}

const tok = token => ({ token });
const at = (fam, tuple) => resolve({ axes: fam.axes, layout: [], paint: fam.paint, properties: [] },
  { variant: 'default', size: 'default', invalid: 'valid', expanded: 'collapsed', state: 'enabled', ...tuple }).paint.Button;

test('Button gets #70\'s Synthesized tokens, each bound as a plain {token}', { skip }, async () => {
  const fam = await button();
  const names = Object.keys(fam.synthesized);
  for (const n of ['button-outline-fill', 'button-outline-hover-fill', 'button-outline-stroke', 'button-default-hover-fill',
    'button-destructive-fill', 'button-destructive-focus-effect', 'button-invalid-effect'])
    assert.ok(names.includes(n), `${n} in ${names.join(', ')}`);
  assert.deepEqual(at(fam, { variant: 'outline' }).fill, tok('button-outline-fill'));
  assert.deepEqual(at(fam, { variant: 'outline', state: 'hover' }).fill, tok('button-outline-hover-fill'));
  assert.deepEqual(at(fam, { variant: 'outline' }).stroke, tok('button-outline-stroke'));
  assert.deepEqual(at(fam, { state: 'hover' }).fill, tok('button-default-hover-fill'));
  assert.deepEqual(at(fam, { variant: 'destructive' }).fill, tok('button-destructive-fill'));
  assert.deepEqual(at(fam, { variant: 'destructive', state: 'focus' }).effects[0].color, tok('button-destructive-focus-effect'));
  assert.deepEqual(at(fam, { invalid: 'invalid' }).effects[0].color, tok('button-invalid-effect'));
});

test('a token at an opacity multiplies its own alpha per Mode; a plain token is flattened, keeping the alias', { skip }, async () => {
  const v = (await button()).synthesized['button-outline-fill'].values;
  assert.deepEqual(Object.keys(v), ['light', 'dark']);
  const { reason: lr, ...light } = v.light;
  assert.deepEqual(light, { raw: '#ffffff', resolved: '#ffffff', from: { alias: 'background' }, level: 'info' });
  assert.match(lr, /^bg-background: .*flattened.*#124/);
  const { reason: dr, ...dark } = v.dark;
  assert.deepEqual(dark, { raw: '#ffffff', alpha: 0.045, resolved: 'rgba(255, 255, 255, 0.045)', from: { alias: 'input', alpha: 0.3 }, level: 'info' },
    'dark input is 15% white: 0.15 x 0.3 = 0.045');
  assert.match(dr, /^dark:bg-input\/30: input at 30%/);
});

test('a mix of tokens is evaluated per Mode over each token\'s own CSS', { skip }, async () => {
  const { values } = (await button()).synthesized['button-secondary-hover-fill'];
  assert.equal(values.light.resolved, '#e7e7e7');
  assert.equal(values.light.alpha, undefined, 'opaque');
  assert.deepEqual(values.light.from, { mix: 'color-mix(in oklch,var(--secondary),var(--foreground) 5%)' });
  assert.equal(values.dark.level, 'info');
});

test('a value that is the same plain token in every Mode stays {token}', { skip }, async () => {
  const fam = await button();
  assert.deepEqual(at(fam, {}).fill, tok('primary'));
  assert.deepEqual(at(fam, { variant: 'secondary' }).fill, tok('secondary'));
  assert.deepEqual(at(fam, { state: 'focus' }).stroke, tok('ring'));
  assert.equal(at(fam, { variant: 'ghost' }).fill, 'none');
});

test('a Synthesized token is a Theme component token: utilities as codeSyntax, source, and only the scope its use needs', { skip }, async () => {
  const s = (await button()).synthesized;
  const fill = s['button-outline-fill'];
  assert.deepEqual([fill.collection, fill.name, fill.type, fill.family, fill.usedBy], ['theme', 'Button/button-outline-fill', 'COLOR', 'button', ['button']]);
  assert.deepEqual(fill.codeSyntax, { WEB: 'bg-background dark:bg-input/30' });
  assert.match(fill.source, /^synthesized: components\/ui\/button\.tsx:\d+ bg-background dark:bg-input\/30$/);
  assert.deepEqual(fill.scopes, ['FRAME_FILL']);
  assert.deepEqual(s['button-outline-stroke'].scopes, ['STROKE_COLOR']);
  assert.deepEqual(s['button-invalid-effect'].scopes, ['EFFECT_COLOR']);
});

test('a Synthesized name that a Code Library token already has fails, naming both', { skip }, async () => {
  const project = variant(CSS, css => css.replace(':root {', ':root {\n  --button-outline-fill: oklch(1 0 0);'));
  const { doc } = await library({ project });
  await assert.rejects(readFamily({ project, family: 'button', foundations: doc }),
    /Synthesized token button-outline-fill \(bg-background dark:bg-input\/30\) collides with the Code Library token button-outline-fill \(app\/globals\.css .*--button-outline-fill\)/);
});

test('relative colour syntax fails, naming the utility', { skip }, async () => {
  const project = variant(BUTTON, t => t.replace('bg-background', 'bg-[oklch(from_var(--background)_l_c_h)]'));
  await assert.rejects(readFamily({ project, family: 'button', foundations: await foundations() }), /bg-\[oklch\(from_var.*relative colour syntax/);
});

test('a non-colour value that differs by Mode fails, naming the utility: an opacity, a ring width', { skip }, async () => {
  const doc = await foundations();
  const opacity = variant(BUTTON, t => t.replace('disabled:opacity-50', 'disabled:opacity-50 dark:opacity-60'));
  await assert.rejects(readFamily({ project: opacity, family: 'button', foundations: doc }), /Button\.opacity: dark:opacity-60 .*differs by mode/);
  const ring = variant(BUTTON, t => t.replace('focus-visible:ring-3', 'focus-visible:ring-3 dark:focus-visible:ring-2'));
  await assert.rejects(readFamily({ project: ring, family: 'button', foundations: doc }), /Button\.effects: dark:focus-visible:ring-2 .*differs by mode/);
});

// One run writes both (#70 §1): the foundations step re-derives each family's Synthesized tokens from source and
// builds its Contract, for the closure, usedBy and the scope check.
let wholeRun;
const whole = () => (wholeRun = wholeRun || library({ project: FIXTURE, families: ['button'] }));
const committed = rel => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8');

test('the foundations step adds each family\'s Synthesized tokens after every Code Library token', { skip }, async () => {
  const { doc } = await whole();
  const theme = Object.keys(doc.variables).filter(k => doc.variables[k].collection === 'theme');
  const synth = theme.filter(k => /^synthesized: /.test(doc.variables[k].source));
  assert.deepEqual(Object.keys((await button()).synthesized), synth);
  assert.deepEqual(theme.slice(-synth.length), synth, 'after every library token');
  assert.deepEqual(theme.slice(0, -synth.length), Object.keys(doc.variables).filter(k => doc.variables[k].collection === 'theme' && !synth.includes(k)).sort());
  assert.ok(doc.source.files[BUTTON], 'the component file is read, so editing it makes the document stale');
});

test('the foundations step fills the closure, usedBy and the scope check from the Contracts it builds', { skip }, async () => {
  const { doc } = await whole();
  const contract = JSON.parse(committed('design-systems/shadcn/contracts/button.component.json'));
  assert.deepEqual(doc.closure.contracts, [{ family: 'button', path: 'design-systems/shadcn/contracts/button.component.json', snapshotId: contract.source.snapshotId }]);
  for (const t of ['primary', 'ring', 'button-outline-fill', 'button-invalid-effect', 'spacing-8']) assert.ok(doc.closure.tokens.includes(t), t);
  assert.ok(!doc.closure.tokens.includes('sidebar'));
  assert.deepEqual([doc.variables.primary.usedBy, doc.variables.sidebar.usedBy], [['button'], []]);
  assert.deepEqual(doc.checks.scopes, { by: 'skills/contract/scripts/contract.mjs validate, rule 6', contracts: 1, errors: 0 });
});

test('the component step refuses a Foundations document without the family\'s Synthesized tokens, naming the fix', { skip }, async () => {
  await assert.rejects(component({ project: FIXTURE, family: 'button', foundations: await foundations() }),
    /button-outline-fill.*regenerate it with foundations\.mjs --family button/s);
});
