// The Generic Adapter's component step (#119), through its public entry points: `readFamily()` (the exact tier),
// `generate()` (the draft Contract) and the CLI, driven by the committed shadcn fixture project or a copy of it.
// They need the pinned tools (node skills/adapter-generic/scripts/sources.mjs); without them every test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, readFamily } from '../scripts/components.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';
import { expand, resolve, validate } from '../../contract/scripts/contract.mjs';

const root = new URL('../../../', import.meta.url);
const foundations = JSON.parse(readFileSync(new URL('design-systems/shadcn/shadcn.foundations.json', root), 'utf8'));
const CLI = new URL('../scripts/components.mjs', import.meta.url).pathname;
const BUTTON = 'components/ui/button.tsx';
const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';

let fixtureRun;
const button = () => (fixtureRun = fixtureRun || readFamily({ project: FIXTURE, family: 'button', foundations }));

// A copy of the fixture project with button.tsx rewritten by `edit`.
function variant(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-components-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, BUTTON), edit(readFileSync(join(dir, BUTTON), 'utf8')));
  return dir;
}
// Each class string in button.tsx keeps only the classes `keep` accepts.
const filterClasses = keep => text => text.replace(/"([^"]*)"/g, (m, s) => `"${s.split(/\s+/).filter(keep).join(' ')}"`);
// The Button with every utility #120 owns removed: opacities (`/n`), `color-mix`, `dark:` and rings
// (`ring-*`, not `border-ring`).
const withoutSynthesized = () => variant(filterClasses(c => !/\/\d|color-mix|dark:|(^|:)ring-/.test(c)));

const byKey = axes => Object.fromEntries(axes.map(a => [a.key, a]));
const tok = token => ({ token });

test('Button axes: cva variant and size, the attribute axes, then the canonical State the CSS defines', { skip }, async () => {
  const { axes } = await button();
  assert.deepEqual(axes.map(a => a.key), ['variant', 'size', 'invalid', 'expanded', 'state']);
  const a = byKey(axes);
  assert.deepEqual(a.variant.values.map(v => [v.key, v.label]), [['default', 'Default'], ['outline', 'Outline'],
    ['secondary', 'Secondary'], ['ghost', 'Ghost'], ['destructive', 'Destructive'], ['link', 'Link']]);
  assert.deepEqual(a.size.values.map(v => v.label), ['Default', 'Xs', 'Sm', 'Lg', 'Icon', 'Icon Xs', 'Icon Sm', 'Icon Lg']);
  assert.deepEqual(a.size.values[1].code, { size: 'xs' });
  assert.equal(a.variant.default, 'default');
  assert.equal(a.size.default, 'default');
  assert.match(a.variant.defaultSource, /button\.tsx defaultVariants\.variant/);
  assert.equal(a.state.canonical, true);
  assert.deepEqual(a.state.values.map(v => [v.key, v.code, v.css]), [
    ['enabled', {}, undefined], ['hover', null, ':hover'], ['focus', null, ':focus-visible'], ['disabled', { disabled: true }, ':disabled']],
  'active only sets translate, which no Contract field carries');
});

test('aria-invalid becomes the invalid axis: state words, absent by default, css and code per value', { skip }, async () => {
  const { invalid, expanded } = byKey((await button()).axes);
  assert.equal(invalid.default, 'valid');
  assert.deepEqual(invalid.values, [
    { key: 'valid', label: 'Valid', code: {}, css: ':not([aria-invalid="true"])' },
    { key: 'invalid', label: 'Invalid', code: { 'aria-invalid': true }, css: '[aria-invalid="true"]' }]);
  assert.deepEqual(expanded.values.map(v => [v.key, v.code]), [['collapsed', {}], ['expanded', { 'aria-expanded': true }]]);
});

test('aria-disabled folds into disabled, with both selectors in css and no new axis', { skip }, async () => {
  const project = variant(t => t.replace('disabled:opacity-50', 'disabled:opacity-50 aria-disabled:opacity-50'));
  const { axes } = await readFamily({ project, family: 'button', foundations });
  assert.deepEqual(axes.map(a => a.key), ['variant', 'size', 'invalid', 'expanded', 'state']);
  assert.equal(byKey(axes).state.values.find(v => v.key === 'disabled').css, ':disabled, [aria-disabled="true"]');
});

test('every axis is fully selected; past ADR 0004\'s ~600 variants it is reported, not cut', { skip }, async () => {
  const { expectedCount, notes } = await button();
  assert.equal(expectedCount, 6 * 8 * 2 * 2 * 4);
  assert.ok(notes.some(n => n.level === 'verify' && /768 variants/.test(n.message) && /ADR 0004/.test(n.message)));
});

test('Button layout per size matches its compiled CSS, the 1px border added to each padding', { skip }, async () => {
  const fam = await button();
  const c = { axes: fam.axes, layout: fam.layout, paint: [], properties: [] };
  const at = size => resolve(c, { variant: 'default', size, invalid: 'valid', expanded: 'collapsed', state: 'enabled' }).layout.Button;
  const raw = n => ({ raw: n, level: 'info' });
  const strip = v => (v && v.raw !== undefined ? { raw: v.raw, level: v.level } : v);
  const expect = {
    default: { height: tok('spacing-8'), width: 'hug', gap: tok('spacing-1_5'), padding: 11, radius: tok('radius-lg') },
    xs: { height: tok('spacing-6'), width: 'hug', gap: tok('spacing-1'), padding: 9, radius: raw(8) },
    sm: { height: tok('spacing-7'), width: 'hug', gap: tok('spacing-1'), padding: 11, radius: raw(8) },
    lg: { height: tok('spacing-9'), width: 'hug', gap: tok('spacing-1_5'), padding: 11, radius: tok('radius-lg') },
    icon: { height: tok('spacing-8'), width: tok('spacing-8'), gap: tok('spacing-0'), padding: 1, radius: tok('radius-lg') },
    'icon-xs': { height: tok('spacing-6'), width: tok('spacing-6'), gap: tok('spacing-0'), padding: 1, radius: raw(8) },
    'icon-sm': { height: tok('spacing-7'), width: tok('spacing-7'), gap: tok('spacing-0'), padding: 1, radius: raw(8) },
    'icon-lg': { height: tok('spacing-9'), width: tok('spacing-9'), gap: tok('spacing-0'), padding: 1, radius: tok('radius-lg') },
  };
  for (const [size, e] of Object.entries(expect)) {
    const l = at(size);
    assert.deepEqual([l.height, l.width, l.gap, strip(l.radius)], [e.height, e.width, e.gap, e.radius], size);
    assert.deepEqual(['paddingLeft', 'paddingRight'].map(f => l[f].raw), [e.padding, e.padding], `${size} padding-inline + border`);
    assert.equal(l.paddingTop.raw, 1, `${size} padding-top is the border only`);
    assert.deepEqual([l.direction, l.alignMain, l.alignCross, l.strokeAlign, l.strokeWeight.raw], ['row', 'center', 'center', 'inside', 1]);
  }
  assert.match(at('xs').radius.reason, /min\(var\(--radius-md\), 10px\)/);
  assert.match(at('default').paddingLeft.reason, /calc\(var\(--spacing\) \* 2\.5\) = 10px \+ 1px border/);
});

test('cn() is modelled: a later class drops an earlier one it covers, and a font size drops a font size', { skip }, async () => {
  const { notes } = await button();
  const cn = notes.find(n => /merged as cn\(\) merges them/.test(n.message));
  assert.match(cn.message, /border-border drops border-transparent/);
  assert.match(cn.message, /text-\[0\.8rem\] drops text-sm/);
});

test('layout is the same in every State, attribute and variant value: the rules hang off size only', { skip }, async () => {
  const { layout } = await button();
  assert.ok(layout.every(r => Object.keys(r.match).every(k => k === 'size')), JSON.stringify(layout.map(r => r.match)));
});

test('paint that differs by mode, carries an opacity or mixes tokens is left for #120, listed with its utilities', { skip }, async () => {
  const { pending } = await button();
  const find = (field, pred) => pending.find(p => p.at === field && pred(p));
  const outline = find('Button.fill', p => p.light === 'bg-background' && p.dark === 'dark:bg-input/30');
  assert.ok(outline, 'outline fill differs by mode');
  assert.equal(outline.reason, 'differs by mode');
  assert.ok(find('Button.fill', p => p.light === 'hover:bg-muted' && p.dark === 'dark:hover:bg-input/50'), 'outline dark hover: dark:hover: beats hover: on specificity');
  assert.ok(find('Button.fill', p => p.light === 'hover:bg-primary/80' && p.reason === 'a token at an opacity'));
  assert.ok(find('Button.fill', p => /color-mix/.test(p.light) && p.reason === 'mixes tokens'));
  assert.ok(find('Button.effects', p => p.light === 'focus-visible:ring-ring/50'));
  assert.ok(pending.every(p => p.lines.length && p.lines.every(l => /^components\/ui\/button\.tsx:\d+$/.test(l)) && p.variants > 0));
});

test('generate fails clearly on the fixture Button: every value #120 owns is named', { skip }, async () => {
  await assert.rejects(generate({ project: FIXTURE, family: 'button', foundations }), e => {
    assert.match(e.message, /Synthesized tokens \(#120/);
    assert.match(e.message, /Button\.fill .*bg-background .*dark:bg-input\/30/);
    return true;
  });
});

test('without #120\'s utilities, generate writes a draft Contract that validates and keeps every plain token', { skip }, async () => {
  const { contract } = await generate({ project: withoutSynthesized(), family: 'button', foundations });
  const v = validate(contract, foundations);
  assert.deepEqual(v.errors, []);
  assert.equal(contract.selection.status, 'draft');
  assert.equal(expand(contract).length, contract.selection.expectedCount);
  assert.deepEqual(contract.anatomy, { name: 'Button', type: 'COMPONENT' });
  assert.equal(contract.source.adapter, 'generic');
  assert.ok(contract.source.files[BUTTON]);
  const at = (variantKey, state, invalid = 'valid', expanded = 'collapsed') =>
    resolve(contract, { variant: variantKey, size: 'default', invalid, expanded, state }).paint.Button;
  assert.deepEqual(at('default', 'enabled').fill, tok('primary'));
  assert.equal(at('ghost', 'enabled').fill, 'none');
  assert.deepEqual(at('ghost', 'hover').fill, tok('muted'));
  assert.deepEqual(at('outline', 'enabled', 'valid', 'expanded').fill, tok('muted'));
  assert.equal(at('default', 'enabled').stroke, 'none', 'border-transparent');
  assert.deepEqual(at('default', 'focus').stroke, tok('ring'));
  assert.deepEqual(at('default', 'enabled', 'invalid').stroke, tok('destructive'));
  assert.equal(at('default', 'disabled').opacity, 0.5);
});

test('two CLI runs write byte-identical Contracts through writeJson', { skip }, () => {
  const project = withoutSynthesized();
  const dir = mkdtempSync(join(tmpdir(), 'generic-contract-'));
  const out = join(dir, 'button.component.json');
  const runs = [1, 2].map(() => {
    execFileSync('node', [CLI, '--project', project, '--family', 'button', '-o', out]);
    return readFileSync(out, 'utf8');
  });
  assert.equal(runs[0], runs[1]);
  assert.deepEqual(validate(JSON.parse(runs[0]), foundations).errors, []);
});

test('the CLI fails, writing nothing, when #120 owns a value', { skip }, () => {
  const out = join(mkdtempSync(join(tmpdir(), 'generic-contract-')), 'button.component.json');
  const r = spawnSync('node', [CLI, '--family', 'button', '-o', out], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAIL: .*#120/);
  assert.throws(() => readFileSync(out));
});

test('a layout value that differs by mode fails, naming the utility', { skip }, async () => {
  const project = variant(t => t.replace('h-8 gap-1.5', 'h-8 dark:h-10 gap-1.5'));
  await assert.rejects(readFamily({ project, family: 'button', foundations }), /dark:h-10.*differs by mode|differs by mode.*dark:h-10/);
});

test('an attribute state with no known state words fails, naming the utility', { skip }, async () => {
  const project = variant(t => t.replace('select-none', 'select-none aria-busy:bg-muted'));
  await assert.rejects(readFamily({ project, family: 'button', foundations }), /aria-busy:bg-muted/);
});

test('a Foundations document from another snapshot is refused', { skip }, async () => {
  const project = variant(t => t);
  writeFileSync(join(project, 'app/globals.css'), readFileSync(join(project, 'app/globals.css'), 'utf8') + '\n');
  await assert.rejects(readFamily({ project, family: 'button', foundations }), /another snapshot/);
});
