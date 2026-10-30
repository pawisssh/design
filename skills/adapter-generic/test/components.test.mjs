// The Generic Adapter's component step (#119), through its public entry points: `readFamily()` (the exact tier),
// `generate()` (the draft Contract) and the CLI, driven by the committed shadcn fixture project or a copy of it.
// Synthesized tokens (#120) have their own tests in synthesized.test.mjs.
// They need the pinned tools (node skills/adapter-generic/scripts/sources.mjs); without them every test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, readFamily } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';
import { expand, resolve, validate, variantName } from '../../contract/scripts/contract.mjs';
import { compiledRules, escapeClass } from '../scripts/cascade.mjs';
import { build } from '../scripts/tailwind.mjs';
import { draftText } from './button-draft.mjs';

const root = new URL('../../../', import.meta.url);
const COMMITTED = new URL('design-systems/shadcn/shadcn.foundations.json', root);
const committed = JSON.parse(readFileSync(COMMITTED, 'utf8'));
const CLI = new URL('../scripts/components.mjs', import.meta.url).pathname;
const BUTTON = 'components/ui/button.tsx';
const DRAFTS = new URL('../fixtures/drafts/button.json', import.meta.url).pathname; // the agent tier's fixed drafts (#122)
const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';

// The Code Library tokens alone, as the foundations step reads them before a family adds its Synthesized tokens:
// a copy of the fixture with button.tsx edited still matches it.
const foundations = skip ? null : (await library({ project: FIXTURE })).doc;
let fixtureRun;
const button = () => (fixtureRun = fixtureRun || readFamily({ project: FIXTURE, family: 'button', foundations }));

// A copy of the fixture project with button.tsx rewritten by `edit`.
function variant(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-components-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, BUTTON), edit(readFileSync(join(dir, BUTTON), 'utf8')));
  return dir;
}

const byKey = axes => Object.fromEntries(axes.map(a => [a.key, a]));
const tok = token => ({ token });

test('Button axes: cva variant and size, the attribute axes, the Slot axes, then the canonical State the CSS defines', { skip }, async () => {
  const { axes } = await button();
  assert.deepEqual(axes.map(a => a.key), ['variant', 'size', 'invalid', 'expanded', 'icon-inline-start', 'icon-inline-end', 'state']);
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
  assert.deepEqual(axes.map(a => a.key), ['variant', 'size', 'invalid', 'expanded', 'icon-inline-start', 'icon-inline-end', 'state']);
  assert.equal(byKey(axes).state.values.find(v => v.key === 'disabled').css, ':disabled, [aria-disabled="true"]');
});

test('the selection omits expanded where no class styles aria-expanded: those variants are their collapsed twins', { skip }, async () => {
  const { expectedCount, omit, notes } = await button();
  assert.deepEqual(omit.map(o => o.match), [{ variant: ['default', 'destructive', 'link'], expanded: 'expanded' }]);
  assert.match(omit[0].reason, /no aria-expanded utility/);
  // the two Slot axes multiply by 4: a filled slot is no twin, even in an icon size, where its frame still shows
  assert.equal(expectedCount, (6 * 8 * 2 * 2 * 4 - 3 * 8 * 2 * 4) * 2 * 2);
  assert.ok(notes.some(n => n.level === 'verify' && /2304 variants/.test(n.message) && /ADR 0004/.test(n.message)), 'past ~600: reported');
});

test('past ADR 0004\'s ~600 variants after the omit, it is reported, not cut', { skip }, async () => {
  // The base styles aria-expanded, so every variant does.
  const project = variant(text => text.replace('"group/button ', '"aria-expanded:bg-muted group/button '));
  const { expectedCount, omit, notes } = await readFamily({ project, family: 'button', foundations });
  assert.deepEqual([expectedCount, omit], [768 * 2 * 2, []]);
  assert.ok(notes.some(n => n.level === 'verify' && /3072 variants/.test(n.message) && /ADR 0004/.test(n.message)));
});

test('Button layout per size matches its compiled CSS, the 1px border added to each padding', { skip }, async () => {
  const fam = await button();
  const c = { axes: fam.axes, layout: fam.layout, paint: [], properties: [] };
  const at = size => resolve(c, { variant: 'default', size, invalid: 'valid', expanded: 'collapsed', 'icon-inline-start': 'none', 'icon-inline-end': 'none', state: 'enabled' }).layout.Button;
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

test('each has-data-[icon=…] slot becomes a Slot axis over a frame the root holds (#121)', { skip }, async () => {
  const { axes, anatomy } = await button();
  assert.deepEqual(axes.map(a => a.key), ['variant', 'size', 'invalid', 'expanded', 'icon-inline-start', 'icon-inline-end', 'state']);
  const start = byKey(axes)['icon-inline-start'];
  assert.deepEqual([start.label, start.slot, start.default], ['Icon Inline Start', 'Icon Inline Start', 'none']);
  assert.deepEqual(start.values, [
    { key: 'none', label: 'False', filled: false, code: {}, css: ':not(:has([data-icon="inline-start"]))' },
    { key: 'icon-inline-start', label: 'True', filled: true, code: {}, css: ':has([data-icon="inline-start"])' }]);
  assert.deepEqual(anatomy, { name: 'Button', type: 'COMPONENT', children: [
    { name: 'Icon Inline Start', type: 'FRAME', role: 'icon' }, { name: 'Label', type: 'TEXT' }, { name: 'Icon Inline End', type: 'FRAME', role: 'icon' }] });
});

test('Button\'s Label binds the Text Style its size and weight utilities name; an arbitrary size stays raw (#160)', { skip }, async () => {
  const f = await button();
  const at = size => resolve({ properties: [], ...f }, { variant: 'default', size, invalid: 'valid', expanded: 'collapsed', 'icon-inline-start': 'none', 'icon-inline-end': 'none', state: 'enabled' }).layout.Label.textStyle;
  assert.deepEqual(at('default'), tok('text-sm-medium'));
  assert.deepEqual(at('xs'), tok('text-xs-medium'));
  const sm = at('sm');
  assert.deepEqual(sm.raw, { fontSize: 12.8, lineHeight: 19.2, fontWeight: 500 });
  assert.equal(sm.level, 'warning');
  assert.match(sm.reason, /no Text Style: text-\[0\.8rem\] is not a step of the type scale/);
});

test('a filled slot sets its padding exactly; the frame is the svg size and shows where its slot is filled', { skip }, async () => {
  const fam = await button();
  const c = { axes: fam.axes, layout: fam.layout, paint: [], properties: [] };
  const at = (size, start = 'none', end = 'none') =>
    resolve(c, { variant: 'default', size, invalid: 'valid', expanded: 'collapsed', 'icon-inline-start': start, 'icon-inline-end': end, state: 'enabled' }).layout;
  const pads = l => [l.Button.paddingLeft.raw, l.Button.paddingRight.raw];
  // [empty, start filled, end filled, both]: CSS padding + the 1px border
  const expect = { default: [11, 9], xs: [9, 7], sm: [11, 7], lg: [11, 9], icon: [1, 1], 'icon-xs': [1, 1], 'icon-sm': [1, 1], 'icon-lg': [1, 1] };
  for (const [size, [empty, filled]] of Object.entries(expect)) {
    assert.deepEqual(pads(at(size)), [empty, empty], `${size} empty`);
    assert.deepEqual(pads(at(size, 'icon-inline-start')), [filled, empty], `${size} inline-start`);
    assert.deepEqual(pads(at(size, 'none', 'icon-inline-end')), [empty, filled], `${size} inline-end`);
    assert.deepEqual(pads(at(size, 'icon-inline-start', 'icon-inline-end')), [filled, filled], `${size} both`);
  }
  assert.match(at('default', 'icon-inline-start').Button.paddingLeft.reason, /has-data-\[icon=inline-start\]:pl-2/);
  const frame = { default: 'spacing-4', xs: 'spacing-3', sm: 'spacing-3_5', lg: 'spacing-4', icon: 'spacing-4', 'icon-xs': 'spacing-3', 'icon-sm': 'spacing-4', 'icon-lg': 'spacing-4' };
  for (const [size, token] of Object.entries(frame)) {
    const l = at(size, 'icon-inline-start');
    assert.deepEqual([l['Icon Inline Start'].width, l['Icon Inline Start'].height], [tok(token), tok(token)], size);
    assert.deepEqual([l['Icon Inline Start'].visible, l['Icon Inline End'].visible], [true, false], size);
  }
});

test('layout is the same in every State, attribute and variant value: the rules hang off size and the Slot axes only', { skip }, async () => {
  const { layout } = await button();
  assert.ok(layout.every(r => Object.keys(r.match).every(k => ['size', 'icon-inline-start', 'icon-inline-end'].includes(k))), JSON.stringify(layout.map(r => r.match)));
});

// ---------- Field provenance (#291) ----------

// A Button variant at size default with no icon, valid and collapsed unless given.
const buttonAt = (variantKey, state, more = {}) =>
  ({ variant: variantKey, size: 'default', invalid: 'valid', expanded: 'collapsed', 'icon-inline-start': 'none', 'icon-inline-end': 'none', state, ...more });
const cls = (name, place, line, prefixes = []) => ({ class: name, place, file: BUTTON, line, prefixes });
const base = { kind: 'base' };
const value = (axis, v) => ({ kind: 'variant', axis, value: v });

test('provenance names, per variant, field and Mode, the class that wins, its cva place, line and prefixes', { skip }, async () => {
  const f = await button();
  const at = t => f.provenance[variantName(f, t)];
  const both = list => ({ light: list, dark: list });
  assert.deepEqual(at(buttonAt('outline', 'enabled')).variant, buttonAt('outline', 'enabled'));
  // A Synthesized token's field: its light class and its dark: class (button-outline-fill).
  assert.deepEqual(at(buttonAt('outline', 'enabled')).paint.Button.fill, {
    light: [cls('bg-background', value('variant', 'outline'), 13)], dark: [cls('dark:bg-input/30', value('variant', 'outline'), 13, ['dark'])] });
  // A derived raw (padding plus the border): the padding class it was derived from.
  assert.deepEqual(at(buttonAt('default', 'enabled')).layout.Button.paddingLeft, both([cls('px-2.5', value('size', 'default'), 24)]));
  assert.deepEqual(at(buttonAt('default', 'enabled')).layout.Button.strokeWeight, both([cls('border', base, 7)]));
  assert.deepEqual(at(buttonAt('default', 'disabled')).paint.Button.opacity, both([cls('disabled:opacity-50', base, 7, ['disabled'])]));
  assert.deepEqual(at(buttonAt('default', 'enabled', { invalid: 'invalid' })).paint.Button.stroke, {
    light: [cls('aria-invalid:border-destructive', base, 7, ['aria-invalid'])],
    dark: [cls('dark:aria-invalid:border-destructive/50', base, 7, ['dark', 'aria-invalid'])] });
  // An effect: the ring's width class, then its colour class.
  assert.deepEqual(at(buttonAt('destructive', 'focus')).paint.Button.effects, {
    light: [cls('focus-visible:ring-3', base, 7, ['focus-visible']), cls('focus-visible:ring-destructive/20', value('variant', 'destructive'), 19, ['focus-visible'])],
    dark: [cls('focus-visible:ring-3', base, 7, ['focus-visible']), cls('dark:focus-visible:ring-destructive/40', value('variant', 'destructive'), 19, ['dark', 'focus-visible'])] });
  assert.deepEqual(at(buttonAt('outline', 'hover')).paint.Label.fill, both([cls('hover:text-foreground', value('variant', 'outline'), 13, ['hover'])]));
  // A prefix holding a colon inside brackets stays one prefix.
  assert.deepEqual(at(buttonAt('default', 'enabled', { 'icon-inline-start': 'icon-inline-start' })).layout['Icon Inline Start'].width,
    both([cls("[&_svg:not([class*='size-'])]:size-4", base, 7, ["[&_svg:not([class*='size-'])]"])]));
  // No class sets a default: the width hugs, the Label shows.
  assert.deepEqual(at(buttonAt('default', 'enabled')).layout.Button.width, both([]));
  assert.deepEqual(at(buttonAt('default', 'enabled')).layout.Label.visible, both([]));
});

test('every selected variant\'s fields name classes that set that field in the compiled CSS, as the variant applies them, a colour\'s to its token', { skip }, async () => {
  const f = await button();
  const contract = { axes: f.axes, excluded: [], selection: { omit: f.omit }, layout: f.layout, paint: f.paint, properties: [] };
  const lines = readFileSync(join(FIXTURE, BUTTON), 'utf8').split('\n');
  const PROPS = { direction: ['flex-direction', 'display'], width: ['width'], height: ['height'], alignMain: ['justify-content', 'align-content'],
    alignCross: ['align-items', 'justify-items'], paddingTop: ['padding-top', 'padding-block', 'padding'], paddingRight: ['padding-right', 'padding-inline', 'padding'],
    paddingBottom: ['padding-bottom', 'padding-block', 'padding'], paddingLeft: ['padding-left', 'padding-inline', 'padding'], gap: ['gap', 'row-gap', 'column-gap'],
    radius: ['border-radius'], strokeWeight: ['border-width'], stroke: ['border-color'], opacity: ['opacity'], effects: ['--tw-ring-shadow', '--tw-ring-color'],
    textStyle: ['font-size', 'line-height', 'font-weight'] };
  const props = (node, field) => (field === 'fill' ? [node === 'Button' ? 'background-color' : 'color'] : PROPS[field]);
  const STATE = { hover: 'hover', 'focus-visible': 'focus', disabled: 'disabled' };
  const used = new Map(); // class -> the CSS properties some field needs it to set
  const colours = new Map(); // class -> {CSS property: the var() a variant's colour token needs it to set there}
  const COLOUR = { fill: 'background-color', stroke: 'border-color', effects: '--tw-ring-color' };
  // The variable a colour value names in a Mode: a Code Library token, or the alias a Synthesized token takes there.
  const named = (v, mode) => (v && v.token ? (f.synthesized[v.token] ? f.synthesized[v.token].values[mode].alias : v.token) : undefined);
  const selected = expand(contract);
  assert.equal(selected.length, f.expectedCount);
  for (const t of selected) {
    const p = f.provenance[variantName(f, t)];
    const r = resolve(contract, t);
    for (const section of ['layout', 'paint'])
      for (const [node, fields] of Object.entries(r[section]))
        for (const [field, v] of Object.entries(fields)) {
          const modes = p[section][node][field];
          assert.deepEqual(Object.keys(modes), ['light', 'dark'], `${node}.${field}`);
          for (const [mode, list] of Object.entries(modes)) {
            const where = `${variantName(f, t)} ${node}.${field} ${mode}`;
            const painted = field === 'effects' ? v.length > 0 : field === 'opacity' ? v.raw !== 1 : ['fill', 'stroke'].includes(field) && v !== 'none';
            if (painted) assert.ok(list.length, `${where}: a painted value names its class`);
            for (const c of list) {
              // No text class colours the link's Label: the base layer's body colour does.
              if (c.place.kind === 'stylesheet') {
                assert.deepEqual([c.class, c.place.selector, c.file], [null, 'body', 'app/globals.css'], where);
                continue;
              }
              assert.ok(lines[c.line - 1].includes(c.class), `${where}: ${c.class} is on line ${c.line}`);
              if (c.place.kind === 'variant') assert.equal(t[c.place.axis], c.place.value, `${where}: ${c.class}'s place applies`);
              for (const pre of c.prefixes) {
                if (pre === 'dark') assert.equal(mode, 'dark', where);
                if (STATE[pre]) assert.equal(t.state, STATE[pre], where);
                if (pre === 'aria-invalid') assert.equal(t.invalid, 'invalid', where);
                if (pre === 'aria-expanded') assert.equal(t.expanded, 'expanded', where);
              }
              if (!used.has(c.class)) used.set(c.class, new Set());
              props(node, field).forEach(q => used.get(c.class).add(q));
            }
            // The class that colours the value (an effect's last, after its ring width) compiles to that value's token.
            const colour = field === 'effects' ? v.length === 1 && named(v[0].color, mode) : section === 'paint' && field !== 'opacity' && named(v, mode);
            const c = list.length && list[list.length - 1].class; // null for the base layer's body colour
            if (colour && c) {
              const prop = node === 'Button' ? COLOUR[field] : 'color';
              if (!colours.has(c)) colours.set(c, {});
              assert.equal(colours.get(c)[prop] ?? `var(--${colour})`, `var(--${colour})`, `${where}: ${c}`);
              colours.get(c)[prop] = `var(--${colour})`;
            }
          }
        }
  }
  const compiled = compiledRules(await build(readFileSync(join(FIXTURE, 'app/globals.css'), 'utf8'), [...used.keys()], { base: join(FIXTURE, 'app') }));
  const rulesOf = c => compiled.filter(r => r.selector.includes(escapeClass(c)));
  for (const [c, want] of used) {
    const set = rulesOf(c).flatMap(r => Object.keys(r.decls));
    assert.ok(set.some(q => want.has(q)), `${c} sets one of ${[...want].join(', ')} (it sets ${set.join(', ')})`);
  }
  assert.ok(colours.size > 10, 'the colour classes were checked');
  for (const [c, want] of colours)
    for (const [prop, text] of Object.entries(want))
      assert.ok(rulesOf(c).some(r => r.decls[prop] === text), `${c} sets ${prop}: ${text}`);
});

test('generate writes the draft Contract against the Foundations document of the same run: it validates', { skip }, async () => {
  const { contract, provenance } = await generate({ project: FIXTURE, family: 'button', foundations: committed, drafts: JSON.parse(readFileSync(DRAFTS, 'utf8')).drafts });
  assert.deepEqual(validate(contract, committed).errors, []);
  assert.equal(Object.keys(provenance).length, expand({ ...contract, selection: { omit: [] } }).length, 'the provenance beside it covers every variant the code renders, omitted ones too');
  assert.deepEqual([contract.selection.status, contract.selection.approval], ['draft', null]);
  assert.equal(expand(contract).length, contract.selection.expectedCount);
  assert.deepEqual(contract.anatomy.children.map(n => [n.name, n.type]), [['Icon Inline Start', 'FRAME'], ['Label', 'TEXT'], ['Icon Inline End', 'FRAME']]);
  assert.equal(contract.source.adapter, 'generic');
  assert.deepEqual(Object.keys(contract.source.files), ['app/globals.css', 'app/layout.tsx', 'components.json', BUTTON, 'package-lock.json']);
  const at = (variantKey, state, invalid = 'valid', expanded = 'collapsed') =>
    resolve(contract, { variant: variantKey, size: 'default', invalid, expanded, 'icon-inline-start': 'none', 'icon-inline-end': 'none', state }).paint.Button;
  assert.deepEqual(at('default', 'enabled').fill, tok('primary'));
  assert.equal(at('ghost', 'enabled').fill, 'none');
  assert.deepEqual(at('ghost', 'enabled', 'valid', 'expanded').fill, tok('muted'));
  assert.equal(at('default', 'enabled').stroke, 'none', 'border-transparent');
  assert.deepEqual(at('default', 'focus').stroke, tok('ring'));
  assert.deepEqual(at('default', 'enabled', 'invalid').stroke, tok('button-invalid-stroke'));
  assert.equal(at('default', 'disabled').opacity.raw, 0.5);
  assert.deepEqual(at('default', 'enabled').opacity, { raw: 1, level: 'info', reason: 'no opacity utility' }, 'a literal is the raw form the core writes (#124)');
});

test('two CLI runs from no prior Contract write byte-identical Contracts through writeJson', { skip }, () => {
  const runs = [1, 2].map(() => {
    const out = join(mkdtempSync(join(tmpdir(), 'generic-contract-')), 'button.component.json');
    execFileSync('node', [CLI, '--family', 'button', '-o', out, '--drafts', DRAFTS]);
    return readFileSync(out, 'utf8');
  });
  assert.equal(runs[0], runs[1]);
  assert.equal(runs[0], draftText, 'the committed Contract as the Adapter drafted it');
});

test('the CLI fails, writing nothing, when the Foundations document lacks the family\'s Synthesized tokens', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'generic-contract-'));
  const stale = join(dir, 'library.json');
  writeFileSync(stale, JSON.stringify(foundations));
  const out = join(dir, 'button.component.json');
  const r = spawnSync('node', [CLI, '--family', 'button', '--foundations', stale, '-o', out], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAIL: .*regenerate it with foundations\.mjs --family button/);
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
