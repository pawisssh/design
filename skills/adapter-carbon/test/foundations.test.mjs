// Tests for the Carbon Adapter's foundations step (#28), through its public entry points: `generate()`
// and the CLI. They read the pinned Carbon sources from .scratch/adapter-carbon/sources (gitignored).
// On a fresh clone, fetch them first: node skills/adapter-carbon/scripts/sources.mjs
// Without them every test here is skipped, with that message.
// Run: node --test skills/adapter-carbon/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../scripts/foundations.mjs';
import { hasSources, readSources, sha256 as sha } from '../scripts/sources.mjs';
import { validate, closure } from '../../contract/scripts/contract.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');
const CONTRACT = 'design-systems/carbon/contracts/button.component.json';
const COMMITTED = 'design-systems/carbon/carbon.foundations.json';
const CLI = new URL('../scripts/foundations.mjs', import.meta.url).pathname;
const button = () => JSON.parse(read(CONTRACT));

const skip = hasSources() ? false : 'Carbon sources missing: run node skills/adapter-carbon/scripts/sources.mjs';
const sources = skip ? null : readSources();
const run = (contracts = [{ path: CONTRACT, contract: button() }]) => generate({ sources, contracts });

test('two CLI runs write byte-identical documents (stable documentHash)', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'foundations-'));
  const out = [1, 2].map(i => {
    const file = join(dir, `run${i}.json`);
    execFileSync('node', [CLI, '-o', file]);
    return readFileSync(file, 'utf8');
  });
  assert.equal(sha(out[0]), sha(out[1]));
  assert.equal(out[0], out[1]);
});

test('the committed foundations document is exactly what this step generates', { skip }, () => {
  assert.equal(run().text, read(COMMITTED));
});

test('every resolved value matches the compiled Carbon CSS, and every Sass fallback exists', { skip }, () => {
  const { checks } = run().doc;
  assert.equal(checks.css.sha256, `sha256:${sources.css.sha256}`);
  // Theme (234 themes.json + 15 button.json) x 4 modes = 996; Layout 13 spacing + 4 fluid-spacing = 17;
  // Type 36 styles x 4 properties, less helper-text-01's absent font-weight and the 2 differing line heights = 141,
  // plus the font-family of code-01/02 and fluid-quotation-01/02 = 4;
  // Layer 15 sets x 3 layer classes, each naming the aliased token with its White value as fallback = 45.
  assert.equal(checks.css.matched, 996 + 17 + 141 + 4 + 45);
  assert.deepEqual(checks.css.missing, []);
  assert.deepEqual(checks.css.differs, ['expressive-heading-01-line-height', 'heading-07-line-height']);
  // size 6 + icon-size 2 + border-radius 7 + container 5 + layout 7
  assert.equal(checks.sass.matched, 27);
});

test('every themes.json token is emitted in four modes; the 3 colour objects are read from their hex', { skip }, () => {
  const { doc } = run();
  const themes = Object.values(doc.variables).filter(v => v.collection === 'theme' && v.source.startsWith('packages/themes/src/dtcg/themes.json'));
  assert.equal(themes.length, 234);
  for (const v of themes) assert.deepEqual(Object.keys(v.values), ['white', 'g10', 'g90', 'g100'], v.name);
  for (const name of ['ai-popover-caret-bottom-background', 'ai-popover-caret-bottom-background-actions', 'ai-popover-caret-center']) {
    const v = doc.variables[name];
    for (const m of Object.values(v.values)) {
      assert.match(m.value, /^#[0-9a-f]{6}$/, `${name} reads the colour object's hex`);
      assert.equal(m.resolved, m.value);
      assert.equal(m.level, 'info');
      assert.match(m.reason, /colour object/);
    }
  }
  assert.equal(doc.variables['ai-popover-caret-center'].values.white.value, '#a0c3ff');
  assert.equal(doc.variables['ai-popover-caret-center'].values.g100.value, '#4870b5');
});

test('generation fails, naming the token, on a Theme value it cannot read', { skip }, () => {
  const file = 'packages/themes/src/dtcg/themes.json';
  const broken = JSON.parse(sources.files[file]);
  broken.ai.popover.caret.center.$extensions['carbon.themes'].g10 = { colorSpace: 'srgb', components: [0, 0, 0] };
  const bad = { ...sources, files: { ...sources.files, [file]: JSON.stringify(broken) } };
  assert.throws(() => generate({ sources: bad, contracts: [{ path: CONTRACT, contract: button() }] }), /ai-popover-caret-center\/g10/);
});

const withFile = (file, edit) => {
  const text = edit(sources.files[file]);
  assert.notEqual(text, sources.files[file], `${file} edit applied`);
  return () => generate({ sources: { ...sources, files: { ...sources.files, [file]: text } }, contracts: [{ path: CONTRACT, contract: button() }] });
};
const editJson = edit => text => { const json = JSON.parse(text); edit(json); return JSON.stringify(json); };

test('generation fails, naming the token, on a Layout or palette value it cannot read', { skip }, () => {
  assert.throws(withFile('packages/layout/src/dtcg/layout.json', editJson(j => { j.spacing['spacing-05'].$value = 'two'; })), /spacing-05/);
  assert.throws(withFile('packages/layout/src/dtcg/layout.json', editJson(j => { j.container['container-01'].$value = '3em'; })), /container-01/);
  assert.throws(withFile('packages/colors/src/dtcg/colors.json', editJson(j => { j.blue['60'].$value = 42; })), /blue\.60/);
  assert.throws(withFile('packages/colors/src/dtcg/colors.json', editJson(j => { j.blue['60'].$value = 'blue'; })), /blue\.60/);
});

test('generation fails when a listed styles.ts/CSS difference no longer holds', { skip }, () => {
  const fixed = withFile('packages/type/src/styles.ts', t => t.replace(/(export const productiveHeading07 = \{[^}]*lineHeight: )1\.199/, '$11.19'));
  assert.throws(fixed, /heading-07-line-height: the recorded CSS difference \(1\.19\) no longer holds/);
});

test('collections: Primitives (hidden), Theme with four modes, Layer after Theme, Layout and Type', { skip }, () => {
  const { collections } = run().doc;
  assert.deepEqual(collections.map(c => [c.key, c.name]),
    [['primitives', 'Primitives'], ['theme', 'Theme'], ['layer', 'Layer'], ['layout', 'Layout'], ['type', 'Type']]);
  assert.equal(collections[0].hidden, true);
  assert.deepEqual(collections[1].modes, [
    { key: 'white', label: 'White', selector: '.cds--white' }, { key: 'g10', label: 'Gray 10', selector: '.cds--g10' },
    { key: 'g90', label: 'Gray 90', selector: '.cds--g90' }, { key: 'g100', label: 'Gray 100', selector: '.cds--g100' }]);
  assert.deepEqual(collections[2].modes, [
    { key: 'one', label: 'One', selector: '.cds--layer-one' }, { key: 'two', label: 'Two', selector: '.cds--layer-two' },
    { key: 'three', label: 'Three', selector: '.cds--layer-three' }]);
  for (const c of [collections[0], collections[3], collections[4]]) assert.deepEqual(c.modes, [{ key: 'default', label: 'Default' }]);
});

test('Layer holds Carbon\'s 15 layer sets, each mode aliasing the Theme token of its level (#109)', { skip }, () => {
  const { doc } = run();
  const layer = Object.entries(doc.variables).filter(([, v]) => v.collection === 'layer').map(([k]) => k);
  assert.deepEqual(layer, ['border-strong', 'border-subtle', 'border-subtle-selected', 'border-tile', 'field', 'field-hover',
    'layer', 'layer-accent', 'layer-accent-active', 'layer-accent-hover', 'layer-active', 'layer-background', 'layer-hover',
    'layer-selected', 'layer-selected-hover']);
  const field = doc.variables.field;
  assert.deepEqual(field.values, { one: { alias: 'field-01' }, two: { alias: 'field-02' }, three: { alias: 'field-03' } });
  assert.equal(field.name, 'Field/field');
  assert.equal(field.type, 'COLOR');
  assert.equal(field.source, 'packages/styles/scss/layer/_layer-sets.scss#field');
  assert.deepEqual(field.codeSyntax, { WEB: 'var(--cds-field)' });
  assert.deepEqual(field.scopes, doc.variables['field-01'].scopes);
  // border-subtle lists four tokens (-00 to -03); level n takes the nth, so level one is -00
  assert.deepEqual(doc.variables['border-subtle'].values,
    { one: { alias: 'border-subtle-00' }, two: { alias: 'border-subtle-01' }, three: { alias: 'border-subtle-02' } });
  assert.equal(doc.variables.layer.name, 'Layer/layer');
  for (const k of layer)
    for (const m of Object.values(doc.variables[k].values)) assert.equal(doc.variables[m.alias].collection, 'theme', `${k} aliases a Theme token`);
  assert.ok(Object.keys(doc.source.files).includes('packages/styles/scss/layer/_layer-sets.scss'));
});

test('generation fails when a compiled layer class maps a set to another token than the layer sets do', { skip }, () => {
  const text = sources.css.text.replace('--cds-field: var(--cds-field-02, #ffffff)', () => '--cds-field: var(--cds-field-03, #ffffff)');
  assert.notEqual(text, sources.css.text);
  assert.throws(() => generate({ sources: { ...sources, css: { ...sources.css, text } }, contracts: [{ path: CONTRACT, contract: button() }] }),
    /field\/two: .*field-02.*CSS .*field-03/);
});

test('generation fails when a layer set lists fewer than three Theme tokens', { skip }, () => {
  assert.throws(withFile('packages/styles/scss/layer/_layer-sets.scss', t => t.replace('    theme.$field-03,\n', () => '')), /layer set field/);
});

test('a Contract may bind a Layer name: it joins the closure and passes rule 6', { skip }, () => {
  const c = button();
  c.paint.push({ match: { kind: 'primary' }, set: { Button: { fill: { token: 'field' } } } });
  const { doc } = run([{ path: CONTRACT, contract: c }]);
  assert.ok(doc.closure.tokens.includes('field'));
  assert.deepEqual(doc.variables.field.usedBy, ['button']);
});

test('Primitives hold the whole palette, hidden, and every Theme alias targets one', { skip }, () => {
  const { variables } = run().doc;
  const aliased = new Set(Object.values(variables).filter(v => v.collection === 'theme').flatMap(v => Object.values(v.values).map(m => m.alias).filter(Boolean)));
  const primitives = Object.entries(variables).filter(([, v]) => v.collection === 'primitives');
  assert.equal(primitives.length, 244);
  for (const a of aliased) assert.equal(variables[a].collection, 'primitives', `${a} is a Primitive`);
  assert.ok(primitives.length > aliased.size, 'palette entries no Theme mode aliases are emitted too');
  for (const [, v] of primitives) {
    assert.deepEqual(v.scopes, []);
    assert.equal(v.hidden, true);
    assert.equal(v.codeSyntax, undefined);
  }
  assert.equal(variables['blue.60Hover'].name, 'Blue/60Hover');
  assert.equal(variables.white.name, 'Neutral/White');
});

test('Theme holds every themes.json token and the button tokens; the closure is only a record', { skip }, () => {
  const { doc } = run();
  const tokens = closure(button());
  const inCollection = key => Object.keys(doc.variables).filter(k => doc.variables[k].collection === key);
  assert.deepEqual(doc.closure.tokens, tokens);
  assert.deepEqual(Object.keys(doc.closure), ['contracts', 'tokens'], 'closure is a record of what Contracts use; fullScales is dropped (#107)');
  assert.equal(inCollection('theme').length, 234 + 15);
  for (const t of tokens) assert.ok(doc.variables[t] || doc.textStyles[t], `closure token ${t} is emitted`);
  assert.deepEqual(doc.variables['layer-01'].usedBy, [], 'a token no Contract uses is emitted with an empty usedBy');
  assert.deepEqual(doc.variables['button-primary'].usedBy, ['button']);
  assert.equal(doc.closure.contracts.length, 1);
  assert.deepEqual(doc.closure.contracts[0], { family: 'button', path: CONTRACT, snapshotId: button().source.snapshotId });
});

test('component tokens carry their family, theme tokens do not, and button-separator is emitted though no Contract uses it', { skip }, () => {
  const { variables } = run().doc;
  const families = Object.entries(variables).filter(([, v]) => v.family).map(([k, v]) => [k, v.family]);
  assert.equal(families.length, 15);
  for (const [k, f] of families) {
    assert.equal(f, 'button');
    assert.match(k, /^button-/);
  }
  assert.equal(variables['button-primary'].family, 'button');
  assert.deepEqual(variables['button-separator'].usedBy, []);
  assert.equal(variables['button-separator'].family, 'button');
  for (const name of ['background', 'text-on-color', 'focus', 'layer-01']) assert.equal(variables[name].family, undefined, name);
});

test('Layout holds every layout.json group: spacing, fluid spacing, container, size, icon size, border radius, layout', { skip }, () => {
  const { variables } = run().doc;
  const layout = Object.entries(variables).filter(([, v]) => v.collection === 'layout');
  const groups = {};
  for (const [, v] of layout) groups[v.name.split('/')[0]] = (groups[v.name.split('/')[0]] || 0) + 1;
  assert.deepEqual(groups, { 'Border radius': 7, Container: 5, 'Fluid spacing': 4, 'Icon size': 2, Layout: 7, Size: 6, Spacing: 13 });
  assert.deepEqual(variables['container-01'].values.default, { value: 24, from: '3 miniUnits x 8' });
  assert.deepEqual(variables['container-01'].scopes, ['WIDTH_HEIGHT']);
  assert.equal(variables['border-radius-max'].values.default.value, 999999);
});

test('fluid spacing is a STRING holding the exact CSS text, scoped to no picker', { skip }, () => {
  const { variables } = run().doc;
  const values = ['01', '02', '03', '04'].map(n => variables[`fluid-spacing-${n}`]);
  assert.deepEqual(values.map(v => v.values.default.value), ['0', '2vw', '5vw', '10vw']);
  for (const v of values) {
    assert.equal(v.type, 'STRING');
    assert.deepEqual(v.scopes, []);
    assert.equal(v.values.default.level, 'info');
    assert.match(v.values.default.reason, /viewport/);
  }
  assert.equal(variables['fluid-spacing-02'].codeSyntax.WEB, 'var(--cds-fluid-spacing-02)');
});

test('the deprecated layout-* scale is emitted, scoped to no picker, with the deprecation as its reason', { skip }, () => {
  const { variables } = run().doc;
  const v = variables['layout-01'];
  assert.equal(v.type, 'FLOAT');
  assert.deepEqual(v.scopes, []);
  assert.equal(v.values.default.value, 16);
  assert.equal(v.values.default.level, 'info');
  assert.match(v.values.default.reason, /deprecated/i);
  assert.equal(v.codeSyntax.WEB, '$layout-01');
});

test('mode values keep the alias and always the resolved value; alpha and button-danger-hover are raw with a reason', { skip }, () => {
  const { variables } = run().doc;
  assert.deepEqual(variables['button-primary'].values.white, { alias: 'blue.60', resolved: '#0f62fe' });
  const g90 = variables['button-disabled'].values.g90;
  assert.equal(g90.resolved, 'rgba(141, 141, 141, 0.3)');
  assert.deepEqual(g90.from, { alias: 'gray.50', alpha: 0.3 });
  assert.equal(g90.level, 'info');
  assert.ok(g90.reason);
  for (const v of Object.values(variables['button-danger-hover'].values)) {
    assert.equal(v.value, '#b81921');
    assert.equal(v.resolved, '#b81921');
    assert.equal(v.level, 'info');
    assert.match(v.reason, /red\.60Hover #b81922/);
  }
  for (const v of Object.values(variables).filter(v => v.collection === 'theme'))
    for (const m of Object.values(v.values)) {
      assert.ok(m.resolved, `${v.name} has a resolved value in every mode`);
      if (!m.alias) assert.ok(m.level && m.reason, `${v.name}: a non-alias Theme value carries level and reason`);
    }
});

test('names are <Group>/<flat-name>; scopes include the widenings and spacing stays GAP', { skip }, () => {
  const { variables } = run().doc;
  const scopes = name => variables[name].scopes;
  assert.equal(variables['button-primary'].name, 'Button/button-primary');
  assert.equal(variables['icon-size-01'].name, 'Icon size/icon-size-01');
  assert.equal(variables['body-compact-01-font-size'].name, 'Body/body-compact-01-font-size');
  assert.deepEqual(scopes('text-on-color'), ['SHAPE_FILL', 'TEXT_FILL']);
  assert.deepEqual(scopes('focus'), ['EFFECT_COLOR', 'STROKE_COLOR']);
  assert.deepEqual(scopes('background'), ['ALL_FILLS', 'EFFECT_COLOR', 'STROKE_COLOR']);
  assert.deepEqual(scopes('button-primary'), ['ALL_FILLS', 'STROKE_COLOR']);
  assert.deepEqual(scopes('spacing-05'), ['GAP']);
  assert.deepEqual(scopes('size-lg'), ['WIDTH_HEIGHT']);
  assert.deepEqual(scopes('border-radius-00'), ['CORNER_RADIUS']);
  const figmaNames = Object.values(variables).map(v => v.name);
  assert.equal(new Set(figmaNames).size, figmaNames.length);
});

test('codeSyntax is var(--cds-*) where the compiled CSS has it, else the Sass name with an info note', { skip }, () => {
  const { doc } = run();
  const web = name => doc.variables[name].codeSyntax.WEB;
  assert.equal(web('button-primary'), 'var(--cds-button-primary)');
  assert.equal(web('spacing-05'), 'var(--cds-spacing-05)');
  assert.equal(web('body-compact-01-line-height'), 'var(--cds-body-compact-01-line-height)');
  for (const name of ['size-lg', 'icon-size-01', 'border-radius-00', 'container-01', 'layout-07']) {
    assert.equal(web(name), `$${name}`);
    assert.ok(doc.notes.some(n => n.level === 'info' && n.at === `variables.${name}.codeSyntax`));
  }
  for (const f of ['sans', 'mono', 'serif']) assert.deepEqual(doc.variables[`font-family-${f}`].codeSyntax, {});
});

test('Text Styles: all 36 Carbon styles, named by their current alias, in key order', { skip }, () => {
  const { doc } = run();
  const keys = Object.keys(doc.textStyles);
  assert.equal(keys.length, 36);
  assert.deepEqual(keys, [...keys].sort());
  for (const k of ['body-compact-01', 'body-01', 'heading-compact-01', 'heading-07', 'fluid-heading-03', 'fluid-paragraph-01',
    'fluid-quotation-02', 'fluid-display-04', 'caption-01', 'label-02', 'helper-text-01', 'code-02', 'heading-01', 'expressive-heading-02', 'legal-01'])
    assert.ok(doc.textStyles[k], k);
  for (const legacy of ['body-short-01', 'productive-heading-01', 'expressive-heading-03', 'quotation-01', 'display-01'])
    assert.equal(doc.textStyles[legacy], undefined, `${legacy} is the alias target, emitted under its current name`);
  assert.match(doc.textStyles['heading-07'].source, /productiveHeading07 \(heading07 = productiveHeading07\)/);
});

test('fluid styles keep their base values; breakpoints are ignored with a note', { skip }, () => {
  const { doc } = run();
  const s = doc.textStyles['fluid-heading-05'];
  assert.deepEqual([s.fontSize, s.fontWeight, s.lineHeight.value, s.letterSpacing.value], [32, 400, 40, 0]);
  assert.ok(doc.notes.some(n => n.at === 'textStyles' && /breakpoints/.test(n.message)));
});

test('helper-text-01 inherits Regular 400 and has no font-weight variable; helper-text-02 binds the one Carbon emits', { skip }, () => {
  const { doc } = run();
  const one = doc.textStyles['helper-text-01'];
  assert.deepEqual([one.fontWeight, one.fontStyle], [400, 'Regular']);
  assert.equal(one.binds.fontWeight, undefined);
  assert.equal(doc.variables['helper-text-01-font-weight'], undefined);
  assert.ok(doc.notes.some(n => n.level === 'info' && n.at === 'textStyles.helper-text-01.fontWeight' && /inherit/.test(n.message)));
  const two = doc.variables['helper-text-02-font-weight'];
  assert.equal(doc.textStyles['helper-text-02'].binds.fontWeight, 'helper-text-02-font-weight');
  assert.equal(two.values.default.value, 400);
  assert.equal(two.values.default.level, 'info');
  assert.match(two.values.default.reason, /inherit/);
});

test('where styles.ts and the compiled CSS differ, the document takes the CSS line height and says so', { skip }, () => {
  const { doc } = run();
  const lh = name => doc.variables[`${name}-line-height`].values.default;
  assert.equal(lh('heading-07').value, 64); // CSS 1.19 x 54; styles.ts 1.199 would round to 65
  assert.equal(lh('expressive-heading-01').value, 20); // CSS 1.42857 x 14; styles.ts 1.25 would be 18
  assert.equal(doc.textStyles['heading-07'].lineHeight.value, 64);
  assert.equal(doc.textStyles['expressive-heading-01'].lineHeight.value, 20);
  for (const name of ['heading-07', 'expressive-heading-01']) {
    assert.equal(lh(name).level, 'warning');
    assert.match(lh(name).reason, /styles\.ts/);
  }
  assert.equal(lh('heading-06').value, 50, 'heading-06 agrees with the CSS (1.199 x 42 = 50.358)');
  assert.equal(lh('heading-06').level, undefined);
});

test('code styles bind Plex Mono and quotation styles Plex Serif', { skip }, () => {
  const { doc } = run();
  assert.deepEqual(['sans', 'mono', 'serif'].map(f => doc.variables[`font-family-${f}`].values.default.value), ['IBM Plex Sans', 'IBM Plex Mono', 'IBM Plex Serif']);
  for (const f of ['sans', 'mono', 'serif']) assert.equal(doc.variables[`font-family-${f}`].type, 'STRING');
  assert.deepEqual([doc.textStyles['code-01'].fontFamily, doc.textStyles['code-01'].binds.fontFamily], ['IBM Plex Mono', 'font-family-mono']);
  assert.deepEqual([doc.textStyles['fluid-quotation-01'].fontFamily, doc.textStyles['fluid-quotation-01'].binds.fontFamily], ['IBM Plex Serif', 'font-family-serif']);
  assert.equal(doc.textStyles['body-01'].binds.fontFamily, 'font-family-sans');
});

test('generation fails, naming the style, on a Type field it cannot read', { skip }, () => {
  const file = 'packages/type/src/styles.ts';
  const bad = { ...sources, files: { ...sources.files, [file]: sources.files[file].replace('export const legal01 = {', 'export const legal01 = {\n  textTransform: upper,') } };
  assert.throws(() => generate({ sources: bad, contracts: [{ path: CONTRACT, contract: button() }] }), /legal01.*textTransform/);
});

test('textStyles are keyed by the Contract name and bind the Type variables', { skip }, () => {
  const { doc } = run();
  const s = doc.textStyles['body-compact-01'];
  assert.equal(s.name, 'Body/body-compact-01');
  assert.deepEqual([s.fontFamily, s.fontStyle, s.fontSize, s.lineHeight, s.fontWeight, s.letterSpacing],
    ['IBM Plex Sans', 'Regular', 14, { unit: 'PIXELS', value: 18 }, 400, { unit: 'PIXELS', value: 0.16 }]);
  for (const v of Object.values(s.binds)) assert.equal(doc.variables[v].collection, 'type');
  assert.equal(doc.variables['font-family-sans'].type, 'STRING');
  assert.equal(doc.textStyles['body-compact-02'].lineHeight.value, 22);
});

test('the Button Contract validates against the generated document', { skip }, () => {
  assert.deepEqual(validate(button(), run().doc).errors, []);
});

test('generation fails when a Contract uses a token outside its variable scopes', { skip }, () => {
  const c = button();
  c.paint.push({ match: { kind: 'primary' }, set: { Button: { fill: { token: 'text-on-color' } } } }); // FRAME_FILL, text-only scopes
  assert.throws(() => run([{ path: CONTRACT, contract: c }]),
    /rule 6.*token "text-on-color" is used as FRAME_FILL.*scoped \[SHAPE_FILL, TEXT_FILL\]/);
});

test('the CLI exits non-zero on an out-of-scope use and writes nothing', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'foundations-'));
  mkdirSync(join(dir, 'contracts'));
  const c = button();
  c.layout.push({ match: { size: 'lg' }, set: { Button: { gap: { token: 'size-lg' } } } }); // GAP, scoped WIDTH_HEIGHT
  writeFileSync(join(dir, 'contracts/button.component.json'), JSON.stringify(c, null, 2));
  const out = join(dir, 'out.json');
  const r = spawnSync('node', [CLI, '--contracts', join(dir, 'contracts'), '-o', out], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rule 6.*token "size-lg" is used as GAP/);
  assert.throws(() => readFileSync(out));
});

test('generation fails on a token Carbon does not define', { skip }, () => {
  const c = button();
  c.paint.push({ match: { kind: 'primary' }, set: { Button: { fill: { token: 'no-such-token' } } } });
  assert.throws(() => run([{ path: CONTRACT, contract: c }]), /not found in the Carbon sources: no-such-token/);
});

test('generation fails when Contracts pin a commit other than the sources', { skip }, () => {
  const c = button();
  c.source.commit = '0000000';
  assert.throws(() => run([{ path: CONTRACT, contract: c }]), /commit/);
});

test('generation fails when Contracts pin a package version other than the one the checks read', { skip }, () => {
  const c = button();
  c.source.packages['@carbon/styles'] = '1.0.0';
  assert.throws(() => run([{ path: CONTRACT, contract: c }]), /@carbon\/styles@1\.0\.0 but the checks read @carbon\/styles@1\.117\.0/);
});

test('only rule 6 blocks generation: a Contract error outside it (a stale expectedCount) does not', { skip }, () => {
  const c = button();
  c.selection.expectedCount = 1;
  assert.equal(run([{ path: CONTRACT, contract: c }]).text, read(COMMITTED));
});
