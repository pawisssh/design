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
  assert.equal(checks.css.matched, 117); // 24 Theme tokens x 4 modes + 13 spacing + 8 type
  assert.deepEqual(checks.css.missing, []);
  assert.equal(checks.sass.matched, 9);
});

test('collections: Primitives (hidden), Theme with four modes, Layout and Type', { skip }, () => {
  const { collections } = run().doc;
  assert.deepEqual(collections.map(c => [c.key, c.name]),
    [['primitives', 'Primitives'], ['theme', 'Theme'], ['layout', 'Layout'], ['type', 'Type']]);
  assert.equal(collections[0].hidden, true);
  assert.deepEqual(collections[1].modes, [
    { key: 'white', label: 'White' }, { key: 'g10', label: 'Gray 10' },
    { key: 'g90', label: 'Gray 90' }, { key: 'g100', label: 'Gray 100' }]);
  for (const c of [collections[0], collections[2], collections[3]]) assert.deepEqual(c.modes, [{ key: 'default', label: 'Default' }]);
});

test('Primitives hold only the palette entries some Theme mode aliases', { skip }, () => {
  const { variables } = run().doc;
  const aliased = new Set(Object.values(variables).flatMap(v => Object.values(v.values).map(m => m.alias).filter(Boolean)));
  const primitives = Object.entries(variables).filter(([, v]) => v.collection === 'primitives');
  assert.deepEqual(primitives.map(([k]) => k).sort(), [...aliased].sort());
  for (const [, v] of primitives) {
    assert.deepEqual(v.scopes, []);
    assert.equal(v.hidden, true);
    assert.equal(v.codeSyntax, undefined);
  }
  assert.equal(variables['blue.60Hover'].name, 'Blue/60Hover');
  assert.equal(variables.white.name, 'Neutral/White');
});

test('Theme holds exactly the closure colour tokens; Layout adds the full spacing and size scales', { skip }, () => {
  const { doc } = run();
  const tokens = closure(button());
  const inCollection = key => Object.keys(doc.variables).filter(k => doc.variables[k].collection === key).sort();
  assert.deepEqual(doc.closure.tokens, tokens);
  assert.deepEqual(doc.closure.fullScales, ['size', 'spacing']);
  const spacing = Array.from({ length: 13 }, (_, i) => `spacing-${String(i + 1).padStart(2, '0')}`);
  const size = ['size-xs', 'size-sm', 'size-md', 'size-lg', 'size-xl', 'size-2xl'];
  assert.deepEqual(inCollection('layout'), [...new Set([...spacing, ...size, ...tokens.filter(t => /^(icon-size|border-radius|spacing|size)-/.test(t))])].sort());
  assert.ok(inCollection('layout').includes('icon-size-01') && inCollection('layout').includes('border-radius-00'));
  assert.deepEqual(doc.variables['spacing-01'].usedBy, []);
  assert.deepEqual(inCollection('theme'), tokens.filter(t => doc.variables[t] && doc.variables[t].type === 'COLOR'));
  assert.equal(doc.closure.contracts.length, 1);
  assert.deepEqual(doc.closure.contracts[0], { family: 'button', path: CONTRACT, snapshotId: button().source.snapshotId });
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
  for (const name of ['size-lg', 'icon-size-01', 'border-radius-00']) {
    assert.equal(web(name), `$${name}`);
    assert.ok(doc.notes.some(n => n.level === 'info' && n.at === `variables.${name}.codeSyntax`));
  }
  assert.deepEqual(doc.variables['font-family-sans'].codeSyntax, {});
});

test('textStyles are keyed by the Contract name and bind the Type variables', { skip }, () => {
  const { doc } = run();
  assert.deepEqual(Object.keys(doc.textStyles), ['body-compact-01', 'body-compact-02']);
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
