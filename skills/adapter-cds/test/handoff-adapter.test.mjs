// The CDS Adapter's To-handoff module (#388): found by To-handoff's own loader from the CDS Foundations document, its
// theme wrapper's values mapped to the Theme Modes, its breakpoints read from the pinned responsive CSS, its Contract
// check over the committed Button Contract, and a small CDS Prototype taken through To-handoff to a Rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasDeps } from '../../to-handoff/scripts/deps.mjs';
import { generate, loadDesignSystem, render, validateHandoff } from '../../to-handoff/scripts/handoff.mjs';
import * as adapter from '../scripts/handoff-adapter.mjs';
import { CDS, CONTRACTS_DIR, DEFAULT_DIR, REPO_ROOT, hasSources, packageDir } from '../scripts/sources.mjs';
import { PREVIEW_MISSING, SOURCES_MISSING } from './helpers.mjs';

const CDS_DS = join(REPO_ROOT, 'design-systems/cds');
const FIXTURE = join(REPO_ROOT, 'skills/adapter-cds/test/fixtures/send-crypto');
const noSources = !hasSources() && SOURCES_MISSING;
const noRun = (!hasDeps() && 'To-handoff packages missing: run node skills/to-handoff/scripts/deps.mjs')
  || (!adapter.available() && PREVIEW_MISSING);
const themeOf = foundations => Object.values(foundations.collections).find(c => !c.hidden && c.modes.length > 1);

test('To-handoff loads the CDS Design System with this module as its Adapter', async () => {
  const system = await loadDesignSystem(CDS_DS);
  assert.equal(system.adapter.contractProcedure, adapter.contractProcedure);
  // Every committed Contract, read from the folder: each family ticket of #469 adds one.
  const committed = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.component.json')).map(f => f.replace('.component.json', ''));
  assert.deepEqual(Object.keys(system.contracts).sort(), committed.sort());
  for (const name of ['roleGroups', 'surfaces', 'themeWrapper', 'breakpoints', 'contractProcedure', 'checkContract', 'available', 'renderer'])
    assert.ok(system.adapter[name], name);
});

test('colour roles take every Theme semantic colour group, space and radius the Layout groups; the surfaces are bg and bgAlternate', async () => {
  const { foundations } = await loadDesignSystem(CDS_DS);
  const groupsIn = collection => [...new Set(Object.values(foundations.variables)
    .filter(v => v.collection === collection && !v.family && !v.hidden).map(v => v.name.split('/')[0]))].sort();
  const theme = themeOf(foundations).key;
  for (const role of ['background-color', 'color', 'border-color', 'outline-color']) assert.deepEqual([...adapter.roleGroups[role]].sort(), groupsIn(theme), role);
  for (const role of ['gap', 'padding', 'margin']) assert.deepEqual(adapter.roleGroups[role], ['Spacing']);
  assert.deepEqual(adapter.roleGroups['border-radius'], ['Border radius']);
  for (const list of Object.values(adapter.roleGroups)) for (const g of list)
    assert.ok(Object.values(foundations.variables).some(v => v.name.split('/')[0] === g), g);
  assert.deepEqual(adapter.surfaces, { page: 'bg', layer: 'bgAlternate' });
  for (const token of Object.values(adapter.surfaces)) assert.equal(foundations.variables[token].collection, theme, token);
});

test('<ThemeProvider activeColorScheme> maps light and dark to the Foundations Theme Modes', async () => {
  const { foundations } = await loadDesignSystem(CDS_DS);
  assert.deepEqual({ component: adapter.themeWrapper.component, prop: adapter.themeWrapper.prop }, { component: 'ThemeProvider', prop: 'activeColorScheme' });
  assert.deepEqual(adapter.themeWrapper.modes, { light: 'light', dark: 'dark' });
  assert.deepEqual(themeOf(foundations).modes.map(m => [m.key, m.label]), [['light', 'Light'], ['dark', 'Dark']]);
});

test("the breakpoints are the pinned responsive CSS's media queries, narrowest first, in px", { skip: noSources }, () => {
  const dir = join(packageDir(DEFAULT_DIR, '@coinbase/cds-web'), 'package/esm/styles/responsive');
  const read = key => {
    const queries = [...new Set([...readFileSync(join(dir, `${key}.css`), 'utf8').matchAll(/@media\s*([^{]+)\{/g)].map(m => m[1].trim()))];
    assert.equal(queries.length, 1, `${key}.css has one media query`);
    const px = name => { const m = new RegExp(`\\(${name}:\\s*(\\d+)px\\)`).exec(queries[0]); return m && Number(m[1]); };
    // The query's min-width; phone's has none (it starts at 0), so its max-width.
    return { key, width: px('min-width') ?? px('max-width') };
  };
  assert.deepEqual(adapter.breakpoints, ['phone', 'tablet', 'desktop'].map(read));
  assert.deepEqual(adapter.breakpoints.map(b => b.width), [767, 768, 1280]);
});

test('checkContract passes the committed Button Contract and fails one pinned to another commit or version', async () => {
  const { foundations, contracts } = await loadDesignSystem(CDS_DS);
  assert.deepEqual(adapter.checkContract(contracts.button, foundations), []);
  const moved = edit => { const c = JSON.parse(JSON.stringify(contracts.button)); edit(c.source); return adapter.checkContract(c, foundations); };
  assert.ok(moved(s => { s.commit = '0'.repeat(40); }).some(p => p === `source.commit ${'0'.repeat(40)} is not the pinned CDS commit ${CDS.commit}`));
  assert.ok(moved(s => { s.packages['@coinbase/cds-web'] = '9.30.0'; }).some(p => p === 'source.packages @coinbase/cds-web is 9.30.0, not the pinned 9.29.0'));
  // cds-icons is in the CDS pin but not in the Foundations document's packages.
  assert.ok(moved(s => { s.packages['@coinbase/cds-icons'] = '5.27.0'; }).some(p => p === 'source.packages @coinbase/cds-icons is 5.27.0, not the pinned 5.26.0'));
  assert.ok(moved(s => { s.adapter = 'carbon'; }).some(p => p === 'source.adapter is "carbon", not "cds"'));
});

test('a small CDS Prototype runs through To-handoff to a validated Handoff whose Rendering shows the real CDS Button', { skip: noRun }, async t => {
  const ds = mkdtempSync(join(tmpdir(), 'cds-handoff-'));
  t.after(() => rmSync(ds, { recursive: true, force: true }));
  mkdirSync(join(ds, 'contracts'));
  copyFileSync(join(CDS_DS, 'cds.foundations.json'), join(ds, 'cds.foundations.json'));
  copyFileSync(join(CONTRACTS_DIR, 'button.component.json'), join(ds, 'contracts/button.component.json'));
  const decisions = JSON.parse(readFileSync(join(FIXTURE, 'decisions.json'), 'utf8'));
  const result = await generate({ prototype: join(FIXTURE, 'index.html'), designSystem: ds, decisions });
  assert.deepEqual(result.requests, []);
  const { handoff } = result;
  const system = await loadDesignSystem(ds);
  assert.deepEqual(validateHandoff(handoff, system).errors, []);
  assert.deepEqual(handoff.source.modes, { light: 'light' });
  assert.deepEqual(handoff.screens.map(s => s.breakpoints), [['phone', 'tablet', 'desktop']]);
  const regions = handoff.screens.flatMap(s => s.regions);
  const usages = regions.flatMap(r => r.usages || []);
  assert.deepEqual(usages.map(u => [u.contract, u.tuple.variant, handoff.copy[u.properties.label.slice(5)].text]), [['button', 'secondary', 'Cancel'], ['button', 'primary', 'Send']]);
  const tokens = Object.fromEntries(regions.flatMap(r => r.styles || []).filter(s => s.raw.startsWith('var(')).map(s => [s.raw, s.token]));
  assert.deepEqual(tokens, { 'var(--color-bg)': 'bg', 'var(--color-fg)': 'fg', 'var(--color-fgMuted)': 'fgMuted', 'var(--color-bgAlternate)': 'bgAlternate' });

  const html = readFileSync(await render({ handoffPath: result.path, designSystem: ds }), 'utf8');
  for (const [variant, label] of [['secondary', 'Cancel'], ['primary', 'Send']])
    assert.match(html, new RegExp(`<button class="[^"]*\\bcds-Interactable\\b[^"]*\\bcds-Button\\b[^"]*" style="[^"]*" type="button" data-variant="${variant}">.*?<span class="">${label}</span>`));
  assert.match(html, /\.cds-preview-scheme\.light,\.cds-preview-light\{[^}]*--color-bgPrimary:rgb\(0,82,255\)/);
});
