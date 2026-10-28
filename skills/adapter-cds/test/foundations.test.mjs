// Tests for the CDS Adapter's Foundations step (#385), through `generate()` and the CLI. They read the pinned CDS
// sources from .scratch/adapter-cds/sources and d3-color from .scratch/adapter-cds/foundations. Fetch both first:
//   node skills/adapter-cds/scripts/sources.mjs
// Without them every test here is skipped, with that message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { generate, loadModules, readContracts } from '../scripts/foundations.mjs';
import { CDS, REPO_ROOT, hasFoundationsPackages, hasSources, readSources, sha256 } from '../scripts/sources.mjs';
import { closure } from '../../contract/scripts/contract.mjs';
import { SOURCES_MISSING } from './helpers.mjs';

const read = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');
const COMMITTED = 'design-systems/cds/cds.foundations.json';
const CLI = new URL('../scripts/foundations.mjs', import.meta.url).pathname;
const PATH = 'design-systems/cds/contracts/button.component.json';

const skip = hasSources() && hasFoundationsPackages() ? false : SOURCES_MISSING;
const sources = skip ? null : readSources();
const modules = skip ? null : await loadModules(sources, ['button']);
const run = (opts = {}) => generate({ sources, modules, families: ['button'], ...opts });
const docOnce = skip ? null : (await run()).doc;

const SCHEMES = ['light', 'dark'];
// The theme ThemeProvider.tsx passes for a scheme, written here again on purpose: the check below is independent of
// the step's own copy.
const themeFor = (t, s) => ({ ...t, activeColorScheme: s, spectrum: t[`${s}Spectrum`], color: t[`${s}Color`], illustrationColor: { ...t[`${s}IllustrationColor`] } });
const emitted = skip ? null : Object.fromEntries(SCHEMES.map(s => [s, modules.createThemeCssVars(themeFor(modules.defaultTheme, s))]));
// A colour CDS writes, as [r, g, b, a]: "r,g,b", rgb(), rgba(), #hex or transparent.
const rgba = text => {
  if (text === 'transparent') return [0, 0, 0, 0];
  if (text.startsWith('#')) return [1, 3, 5].map(i => parseInt(text.slice(i, i + 2), 16)).concat(1);
  const n = text.replace(/^rgba?\(|\)$/g, '').split(',').map(Number);
  return n.length === 3 ? n.concat(1) : n;
};
const valueColor = v => rgba(v.raw || v.value || v.resolved).slice(0, 3).concat(v.alpha ?? 1);

/** A minimal Contract for `family` (Button by default) at the pinned commit that paints the root with `fill`. */
const contract = ({ family = 'button', fill = 'button-primary-background', commit = CDS.commit, web = CDS.packages['@coinbase/cds-web'].version } = {}) => ({
  schemaVersion: 1,
  family: { key: family, name: family.charAt(0).toUpperCase() + family.slice(1) },
  source: { codeLibrary: 'CDS Web', adapter: 'cds', repository: CDS.repository, tag: '', commit,
    packages: { '@coinbase/cds-web': web }, files: {}, snapshotId: 'sha256:test' },
  axes: [{ key: 'variant', label: 'Variant', default: 'primary', defaultSource: 'test', values: [{ key: 'primary', label: 'Primary' }] }],
  excluded: [],
  selection: { omit: [], expectedCount: 1, approval: null, status: 'draft' },
  anatomy: { name: 'Root', type: 'FRAME' },
  properties: [], layout: [],
  paint: [{ match: {}, set: { Root: { fill: { token: fill } } } }],
  subComponents: [], dependencies: { families: [] }, figma: {}, code: {},
});
// The modules with createThemeCssVars or a token map changed, for the failure tests.
const withVars = edit => ({ ...modules, createThemeCssVars: t => edit({ ...modules.createThemeCssVars(t) }, t.activeColorScheme) });

test('two CLI runs write byte-identical documents, equal to the committed one', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cds-foundations-'));
  const out = [1, 2].map(i => {
    const file = join(dir, `run${i}.json`);
    execFileSync('node', [CLI, '--family', 'button', '-o', file]);
    return readFileSync(file, 'utf8');
  });
  assert.equal(out[0], out[1]);
  assert.equal(out[0], read(COMMITTED));
});

test('the committed document is exactly what generate returns for --family button and the committed Contracts', { skip }, async () => {
  assert.equal((await generate({ sources, families: ['button'], contracts: readContracts() })).text, read(COMMITTED));
});

test('collections: hidden Primitives, Theme in Light and Dark without a selector, Layout and Type', { skip }, () => {
  assert.deepEqual(docOnce.collections, [
    { key: 'primitives', name: 'Primitives', modes: [{ key: 'default', label: 'Default' }], hidden: true },
    { key: 'theme', name: 'Theme', modes: [{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }] },
    { key: 'layout', name: 'Layout', modes: [{ key: 'default', label: 'Default' }] },
    { key: 'type', name: 'Type', modes: [{ key: 'default', label: 'Default' }] },
  ]);
  assert.deepEqual(docOnce.designSystem, { key: 'cds', name: 'CDS' });
  assert.equal(docOnce.source.commit, CDS.commit);
  assert.equal(docOnce.source.adapter, 'cds');
  for (const path of ['packages/web/src/themes/defaultTheme.ts', 'packages/web/src/system/Interactable.tsx'])
    assert.match(docOnce.source.files[path], /^sha256:[0-9a-f]{64}$/, path);
});

test('every Primitive, Theme, Layout and Type value equals createThemeCssVars in Light and Dark', { skip }, () => {
  let n = 0;
  for (const [key, v] of Object.entries(docOnce.variables)) {
    if (v.family) continue;
    const prop = v.collection === 'primitives' ? `--${key}` : /^var\((--[\w-]+)\)$/.exec(v.codeSyntax.WEB)[1];
    for (const s of SCHEMES) {
      const got = emitted[s][prop];
      assert.notEqual(got, undefined, `${prop} in ${s}`);
      const value = v.values[s] || v.values.default;
      if (v.type === 'COLOR') assert.deepEqual(valueColor(value), rgba(got), `${key}/${s}`);
      else if (v.collection === 'layout') assert.equal(`${value.value}px`, got, `${key}/${s}`);
      else if (/^font(Size|Weight)|^lineHeight/.test(key)) assert.equal(/rem$/.test(got) ? parseFloat(got) * 16 : Number(got), value.value, `${key}/${s}`);
      else assert.equal(got, 'var(--defaultFont-sans)', key);
      n++;
    }
  }
  assert.equal(n, docOnce.checks.css.matched);
  assert.equal(n, (286 + 42 + 42 + 52) * 2);
});

test('a value that differs from createThemeCssVars fails generation, naming the token and Mode', { skip }, async () => {
  const cases = [
    [(v, s) => (s === 'dark' ? { ...v, '--color-bgPrimary': 'rgb(1,2,3)' } : v), /bgPrimary\/dark/],
    [v => ({ ...v, '--light-blue60': '1,2,3' }), /light-blue60\/light/],
    [v => ({ ...v, '--space-1': '9px' }), /space-1\/light/],
    [v => ({ ...v, '--fontSize-body': '2rem' }), /fontSize-body\/light/],
    [v => { delete v['--borderRadius-1000']; return v; }, /borderRadius-1000: createThemeCssVars emits no --borderRadius-1000/],
  ];
  for (const [edit, error] of cases) await assert.rejects(run({ modules: withVars(edit) }), error);
});

test('everything createThemeCssVars emits is carried or excluded by name: shadow, avatarSize, illustration colours and the rest', { skip }, async () => {
  const names = Object.keys(docOnce.variables);
  for (const prefix of ['shadow', 'avatarSize', 'illustration', 'textTransform', 'fontFamilyMono', 'lightColor', 'darkColor', 'currentColor'])
    assert.ok(!names.some(k => k.startsWith(prefix)), `no ${prefix} variable`);
  assert.deepEqual(Object.keys(docOnce.checks.css.excluded),
    ['activeColorScheme', 'avatarSize', 'currentColor', 'darkColor', 'fontFamilyMono', 'illustrationColor', 'lightColor', 'shadow', 'spectrum', 'textTransform']);
  const notes = docOnce.notes.map(n => n.message).join('\n');
  for (const said of [/Shadow .* is not carried/, /avatarSize is not carried/, /Illustration colours are not carried/, /Only defaultTheme is carried\. CDS Web's other themes \(coinbaseDenseTheme, .*\) are not/])
    assert.match(notes, said);
  await assert.rejects(run({ modules: withVars(v => ({ ...v, '--elevation-1': '1px' })) }), /emits --elevation-1 in light, which the document neither carries nor excludes/);
});

test('Primitives are both spectrums by CDS\'s names, hidden; each Theme colour aliases the Primitive its template names', { skip }, () => {
  const v = docOnce.variables;
  assert.deepEqual(v['light-blue60'], { collection: 'primitives', name: 'Light/blue60', type: 'COLOR',
    source: 'packages/web/src/themes/defaultTheme.ts#lightSpectrum.blue60', scopes: [], hidden: true, values: { default: { value: '#0052ff' } } });
  assert.equal(Object.values(v).filter(x => x.collection === 'primitives').length,
    Object.keys(modules.defaultTheme.lightSpectrum).length + Object.keys(modules.defaultTheme.darkSpectrum).length);
  assert.deepEqual(v.bgPrimary.values, { light: { alias: 'light-blue60', resolved: '#0052ff' }, dark: { alias: 'dark-blue70', resolved: '#578bfa' } });
  assert.deepEqual(v.bgPrimary.codeSyntax, { WEB: 'var(--color-bgPrimary)' });
  assert.equal(v.bgPrimary.name, 'Background/bgPrimary');
  assert.equal(v.bgLine.name, 'Line/bgLine');
  assert.equal(v.fgMuted.name, 'Foreground/fgMuted');
  assert.deepEqual(v.fgMuted.scopes, ['SHAPE_FILL', 'TEXT_FILL']);
  // an alpha template is flattened, keeping its alias in `from`
  assert.deepEqual(v.bgOverlay.values.light, { raw: '#32353d', alpha: 0.33, resolved: 'rgba(50, 53, 61, 0.33)',
    from: { alias: 'light-gray80', alpha: 0.33 }, level: 'info', reason: 'alpha: a Figma alias cannot carry alpha, so this mode holds the flattened RGBA' });
  assert.equal(v.currentColor, undefined);
  const theme = Object.entries(v).filter(([, x]) => x.collection === 'theme' && !x.family);
  assert.equal(theme.length, Object.keys(modules.defaultTheme.lightColor).length - 1);
  for (const [k, x] of theme) for (const s of SCHEMES) {
    const target = x.values[s].alias || x.values[s].from.alias;
    assert.equal(v[target].collection, 'primitives', `${k}/${s} aliases a Primitive`);
  }
});

test('generation fails, naming the token, on a value or template it cannot read', { skip }, async () => {
  const file = 'packages/web/src/themes/defaultTheme.ts';
  const template = text => ({ ...sources, files: { ...sources.files, [file]: text } });
  const t = sources.files[file];
  const once = (from, to) => { const out = t.replace(from, to); assert.notEqual(out, t); return out; };
  await assert.rejects(run({ sources: template(once('bgPrimary: `rgb(${lightSpectrum.blue60})`', 'bgPrimary: `hsl(${lightSpectrum.blue60})`')) }), /bgPrimary\/light: cannot read the template/);
  await assert.rejects(run({ sources: template(once('bgPrimary: `rgb(${lightSpectrum.blue60})`', 'bgPrimary: `rgb(${lightSpectrum.blue50})`')) }), /bgPrimary\/light: .* reads as #105eff, but defaultTheme\.js is rgb\(0,82,255\)/);
  const theme = modules.defaultTheme;
  await assert.rejects(run({ modules: { ...modules, defaultTheme: { ...theme, space: { ...theme.space, '0.25': 'two' } } } }), /space-0_25: cannot read "two" as a number/);
  await assert.rejects(run({ modules: { ...modules, defaultTheme: { ...theme, lightSpectrum: { ...theme.lightSpectrum, blue60: 'blue' } } } }), /light-blue60: cannot read the spectrum value "blue"/);
  await assert.rejects(run({ modules: { ...modules, defaultTheme: { ...theme, fontSize: { ...theme.fontSize, body: '16px' } } } }), /fontSize-body: cannot read "16px" as rem/);
});

test('Button\'s component tokens alias the Theme colour its token map names, with family', { skip }, () => {
  const v = docOnce.variables;
  const { variants, transparentVariants } = modules.tokens.button;
  const component = Object.entries(v).filter(([, x]) => x.family && !x.source.startsWith('synthesized: '));
  assert.equal(component.length, (Object.keys(variants).length + Object.keys(transparentVariants).length) * 3);
  assert.deepEqual(v['button-primary-background'], { collection: 'theme', name: 'Button/button-primary-background', type: 'COLOR',
    source: 'packages/common/src/tokens/button.ts#variants.primary.background', scopes: ['FRAME_FILL'], codeSyntax: {},
    values: { light: { alias: 'bgPrimary', resolved: '#0052ff' }, dark: { alias: 'bgPrimary', resolved: '#578bfa' } }, usedBy: [], family: 'button' });
  assert.equal(v['button-secondary-transparent-border'].values.light.alias, 'transparent');
  assert.deepEqual(v['button-primary-color'].scopes, ['SHAPE_FILL', 'TEXT_FILL'], 'no Contract strokes it');
  assert.deepEqual(docOnce.checks.css.modules['@coinbase/cds-common/esm/tokens/button.js'], `sha256:${sha256(readFileSync(join(sources.packages['@coinbase/cds-common'].dir, 'package/esm/tokens/button.js')))}`);
  for (const name of ['bg', 'fgMuted', 'space-1', 'light-blue60']) assert.equal(v[name].family, undefined, name);
});

test('a colour token a Contract strokes through sameAs also gets STROKE_COLOR: the Arc strokes sameAs Label.fill', { skip }, () => {
  const v = JSON.parse(read(COMMITTED)).variables;
  const stroked = Object.keys(v).filter(n => v[n].family && n.endsWith('-color') && v[n].scopes.includes('STROKE_COLOR'));
  assert.deepEqual(stroked, Object.keys(v).filter(n => /^button-[a-z]+(-transparent)?-color$/.test(n) && v[n].scopes.length));
  assert.equal(stroked.length, 12);
  assert.deepEqual(v['button-primary-color'].scopes, ['SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR']);
  assert.deepEqual(v['button-foregroundMuted-color'].scopes, [], 'a deprecated variant stays out of the pickers');
  assert.deepEqual(v['button-primary-background'].scopes, ['FRAME_FILL'], 'a token no Contract strokes keeps its scopes');
});

test('every Synthesized token equals getBlendedColor\'s output for its token and opacity in each Mode', { skip }, () => {
  const synth = Object.entries(docOnce.variables).filter(([, x]) => x.source.startsWith('synthesized: '));
  // 7 variants, plain and transparent, x hover, pressed, disabled x background, border
  assert.equal(synth.length, 7 * 2 * 3 * 2);
  assert.equal(docOnce.checks.blend.computed, synth.length * 2);
  const opacity = { hover: 0.88, pressed: 0.82, disabled: 0.75 };
  for (const [name, x] of synth) {
    const [, variant, transparent, state, part] = /^button-(\w+?)(-transparent)?-(hover|pressed|disabled)-(background|border)$/.exec(name);
    const map = modules.tokens.button[transparent ? 'transparentVariants' : 'variants'][variant];
    const token = map[part === 'border' ? 'borderColor' : 'background'];
    assert.equal(x.family, 'button');
    assert.equal(x.name, `Button/${name}`);
    assert.equal(x.source, `synthesized: packages/common/src/tokens/interactable.ts blend(${token}, ${opacity[state]})`);
    assert.deepEqual(x.codeSyntax, {});
    for (const s of SCHEMES) {
      const value = x.values[s];
      const out = modules.getBlendedColor({ overlayColor: modules.defaultTheme[`${s}Color`][token], blendOpacity: opacity[state], colorScheme: s,
        ...(state === 'disabled' ? { skipContrastOptimization: true } : {}) });
      assert.deepEqual(valueColor(value), rgba(out), `${name}/${s}`);
      assert.equal(value.level, 'info');
      assert.ok(value.reason.includes(`= ${out}`), `${name}/${s} reason gives the derivation`);
      assert.equal(value.from.token, token);
      assert.equal(value.from.blendOpacity, opacity[state]);
    }
  }
  assert.deepEqual(docOnce.variables['button-primary-hover-background'].values.light,
    { raw: '#0048e0', resolved: '#0048e0', from: { token: 'bgPrimary', blendOpacity: 0.88, colorScheme: 'light', property: '--inter-hover-bg' },
      level: 'info', reason: 'getBlendedColor(bgPrimary rgb(0,82,255), 0.88) in light = rgb(0, 72, 224); Interactable sets it as --inter-hover-bg while hovered' });
  // a transparent overlay blends to transparent
  assert.deepEqual(docOnce.variables['button-primary-transparent-hover-border'].values.dark.raw, '#000000');
  assert.equal(docOnce.variables['button-primary-transparent-hover-border'].values.dark.alpha, 0);
  // Synthesized tokens follow every Code Library token
  const keys = Object.keys(docOnce.variables);
  const firstSynth = keys.findIndex(k => docOnce.variables[k].source.startsWith('synthesized: '));
  assert.ok(keys.slice(firstSynth).every(k => docOnce.variables[k].source.startsWith('synthesized: ') || docOnce.variables[k].collection !== 'theme'));
});

test('a Synthesized name a CDS token already has fails generation', { skip }, async () => {
  const button = { ...modules.tokens.button, variants: { ...modules.tokens.button.variants, 'primary-hover': modules.tokens.button.variants.primary } };
  await assert.rejects(run({ modules: { ...modules, tokens: { button } } }), /the Synthesized token button-primary-hover-background has the name of a CDS token \(packages\/common\/src\/tokens\/button\.ts#variants\.primary-hover\.background\)/);
});

test('Layout and Type: px values, and Text Styles named by CDS\'s text keys in Inter', { skip }, () => {
  const v = docOnce.variables;
  assert.deepEqual(v['space-0_25'], { collection: 'layout', name: 'Spacing/space-0_25', type: 'FLOAT', source: 'packages/web/src/themes/defaultTheme.ts#space.0.25',
    scopes: ['GAP'], codeSyntax: { WEB: 'var(--space-0_25)' }, values: { default: { value: 2 } }, usedBy: [] });
  for (const [k, group] of [['borderRadius-1000', 'Border radius'], ['borderWidth-100', 'Border width'], ['iconSize-m', 'Icon size'], ['controlSize-checkboxSize', 'Control size']])
    assert.equal(v[k].name, `${group}/${k}`);
  assert.deepEqual(Object.keys(docOnce.textStyles), Object.keys(modules.defaultTheme.fontSize).sort());
  for (const [key, t] of Object.entries(docOnce.textStyles)) {
    assert.equal(t.fontFamily, 'Inter', key);
    assert.deepEqual(t.binds, { fontFamily: `fontFamily-${key}`, fontSize: `fontSize-${key}`, fontWeight: `fontWeight-${key}`, lineHeight: `lineHeight-${key}` });
  }
  assert.deepEqual(docOnce.textStyles.body, { name: 'Body/body', source: 'packages/web/src/themes/defaultTheme.ts#fontSize.body', fontFamily: 'Inter',
    fontStyle: 'Regular', fontSize: 16, lineHeight: { unit: 'PIXELS', value: 24 }, fontWeight: 400, letterSpacing: { unit: 'PIXELS', value: 0 },
    binds: { fontFamily: 'fontFamily-body', fontSize: 'fontSize-body', fontWeight: 'fontWeight-body', lineHeight: 'lineHeight-body' }, usedBy: [] });
  assert.equal(docOnce.textStyles.title1.fontStyle, 'Semi Bold');
  assert.equal(docOnce.textStyles.display1.name, 'Display/display1');
  assert.equal(v['fontFamily-body'].values.default.value, 'Inter');
});

test('a Contract\'s tokens form the closure, through the shared closure(), and it passes rule 6', { skip }, async () => {
  const c = contract();
  const { doc } = await generate({ sources, modules, contracts: [{ path: PATH, contract: c }] });
  assert.deepEqual(doc.closure.tokens, closure(c));
  assert.deepEqual(doc.closure.contracts, [{ family: 'button', path: PATH, snapshotId: 'sha256:test' }]);
  assert.deepEqual(doc.variables['button-primary-background'].usedBy, ['button']);
  assert.ok(doc.variables['button-primary-hover-background'], 'the Contract\'s family emits its tokens without --family');
  assert.equal(doc.checks.scopes.contracts, 1);
});

test('generation fails on an unknown token, a rule 6 scope violation, or a Contract pinned to another commit or version', { skip }, async () => {
  const one = c => run({ contracts: [{ path: PATH, contract: c }] });
  await assert.rejects(one(contract({ fill: 'bgNope' })), /tokens not found in the CDS Foundations: bgNope/);
  await assert.rejects(one(contract({ fill: 'fgMuted' })), /fails validation rule 6[\s\S]*fgMuted/);
  await assert.rejects(one(contract({ commit: '0'.repeat(40) })), /pins commit 0{40} but the sources are commit 135dc3c/);
  await assert.rejects(one(contract({ web: '9.28.0' })), /pins @coinbase\/cds-web@9\.28\.0 but the step reads @coinbase\/cds-web@9\.29\.0/);
});

// in (#396): a family's token map is cds-common's esm/tokens/<family>.js, read from the pinned tarball.
test('a second family with a token map gets its component tokens from cds-common\'s esm/tokens/<family>.js: Banner', { skip }, async () => {
  const path = 'design-systems/cds/contracts/banner.component.json';
  const { doc } = await generate({ sources, contracts: [{ path, contract: contract({ family: 'banner', fill: 'banner-informational-background' }) }] });
  const v = doc.variables;
  assert.deepEqual(v['banner-informational-background'], { collection: 'theme', name: 'Banner/banner-informational-background', type: 'COLOR',
    source: 'packages/common/src/tokens/banner.ts#variants.informational.background', scopes: ['FRAME_FILL'], codeSyntax: {},
    values: { light: { alias: 'bgSecondary', resolved: v.bgSecondary.values.light.resolved }, dark: { alias: 'bgSecondary', resolved: v.bgSecondary.values.dark.resolved } },
    usedBy: ['banner'], family: 'banner' });
  assert.equal(v['banner-error-border'].values.light.alias, 'bgNegative');
  // banner.js has variants only, each with background and borderColor among the roles the step knows
  const component = Object.keys(v).filter(k => v[k].family === 'banner' && !v[k].source.startsWith('synthesized: '));
  assert.deepEqual(component, ['error', 'informational', 'promotional', 'warning'].flatMap(x => [`banner-${x}-background`, `banner-${x}-border`]));
  assert.ok(!Object.keys(v).some(k => k.startsWith('button-')), 'no Button tokens without a Button Contract or --family button');
  assert.ok(doc.checks.css.modules['@coinbase/cds-common/esm/tokens/banner.js']);
  assert.equal(doc.checks.css.modules['@coinbase/cds-common/esm/tokens/button.js'], undefined);
  const roles = doc.notes.find(n => n.at === 'variables.banner-*');
  assert.match(roles.message, /iconColor, textColor, primaryActionColor, secondaryActionColor, iconButtonColor/);
  assert.equal(roles.level, 'info');
});

test('a family with no token map gets no component tokens, only its closure, and an info note: Switch; the run does not fail', { skip }, async () => {
  const path = 'design-systems/cds/contracts/switch.component.json';
  const { doc, summary } = await generate({ sources, contracts: [{ path, contract: contract({ family: 'switch', fill: 'bgPrimary' }) }] });
  assert.ok(!Object.values(doc.variables).some(x => x.family), 'no component or Synthesized tokens');
  assert.deepEqual(doc.closure.tokens, ['bgPrimary']);
  assert.deepEqual(doc.variables.bgPrimary.usedBy, ['switch']);
  assert.deepEqual(doc.notes.filter(n => n.at === 'variables.switch-*'), [{ level: 'info', at: 'variables.switch-*',
    message: 'switch has no component token map: @coinbase/cds-common@9.29.0 has no esm/tokens/switch.js, so the document carries no switch component tokens or state blends from one.' }]);
  assert.match(summary[0], /^families switch;/);
});

// in (#476): Switch.tsx picks the thumb colour by colour scheme, so it is a Synthesized token aliasing each Mode's pick.
const SWITCH_TSX = 'packages/web/src/controls/Switch.tsx';
/** A Switch Contract pinning `text` as Switch.tsx, written into the sources dir `dir` when given. */
const switchPinning = (text, dir) => {
  const c = contract({ family: 'switch', fill: 'switch-thumb-background' });
  if (dir) {
    const file = join(dir, 'cds', SWITCH_TSX);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  c.source.files = { [SWITCH_TSX]: `sha256:${sha256(text)}` };
  return [{ path: 'design-systems/cds/contracts/switch.component.json', contract: c }];
};
const fetched = join(REPO_ROOT, '.scratch/adapter-cds/sources/cds', SWITCH_TSX);

test('a Contract that pins Switch.tsx gets switch-thumb-background, fgInverse in Light and fg in Dark', { skip: skip || (!existsSync(fetched) && SOURCES_MISSING) }, async () => {
  const switchText = readFileSync(fetched, 'utf8');
  const { doc, summary } = await generate({ sources, contracts: switchPinning(switchText) });
  const v = doc.variables;
  assert.deepEqual(v['switch-thumb-background'], { collection: 'theme', name: 'Switch/switch-thumb-background', type: 'COLOR',
    source: `synthesized: ${SWITCH_TSX} defaultControlColor (activeColorScheme === 'dark' ? 'fg' : 'fgInverse')`, scopes: ['FRAME_FILL'], codeSyntax: {},
    values: { light: { alias: 'fgInverse', resolved: '#ffffff' }, dark: { alias: 'fg', resolved: '#ffffff' } }, usedBy: ['switch'], family: 'switch' });
  assert.equal(Object.keys(v).filter(k => v[k].collection === 'theme').at(-1), 'switch-thumb-background', 'Synthesized, so last of the Theme');
  assert.match(doc.notes.find(n => n.at === 'variables.switch-thumb-background').message, /picks defaultControlColor by the active colour scheme, fgInverse in Light and fg in Dark/);
  assert.match(summary[0], /\(1 Synthesized\)/);
  const bare = await generate({ sources, families: ['switch'] });
  assert.ok(!bare.doc.variables['switch-thumb-background'], 'no Contract pins Switch.tsx, so nothing says what it picks');
});

test('generation fails when the pinned Switch.tsx no longer picks the thumb colour by scheme', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cds-switch-'));
  const contracts = switchPinning("const defaultControlColor = 'fgInverse';\n", dir);
  await assert.rejects(generate({ sources, contracts, dir }), /switch-thumb-background: cannot read defaultControlColor in packages\/web\/src\/controls\/Switch\.tsx/);
});

test('--family chip: a cds-common token module with no variants is no token map either', { skip }, async () => {
  const { doc } = await generate({ sources, families: ['chip'] });
  assert.ok(!Object.values(doc.variables).some(x => x.family));
  assert.match(doc.notes.find(n => n.at === 'variables.chip-*').message, /^chip has no component token map: @coinbase\/cds-common@9\.29\.0 esm\/tokens\/chip\.js exports no variants, so/);
});

test('the @deprecated variants come from the props type the Contract pins under packages/common/src/types/', { skip }, async () => {
  const button = readContracts().filter(c => c.contract.family.key === 'button');
  const pinned = (await generate({ sources, contracts: button })).doc;
  // foregroundMuted is deprecated in ButtonBaseProps.ts, which the Button Contract pins: out of the pickers
  assert.ok(button[0].contract.source.files['packages/common/src/types/ButtonBaseProps.ts']);
  for (const name of ['button-foregroundMuted-background', 'button-foregroundMuted-hover-background', 'button-foregroundMuted-transparent-color'])
    assert.deepEqual(pinned.variables[name].scopes, [], name);
  assert.match(pinned.notes.find(n => n.at === 'variables.button-foregroundMuted-*').message, /^foregroundMuted is @deprecated in packages\/common\/src\/types\/ButtonBaseProps\.ts \("Use `secondary` directly\."\)/);
  // a Contract that pins no props type, or no Contract (--family button), deprecates nothing
  for (const opts of [{ contracts: [{ path: PATH, contract: contract() }] }, {}]) {
    const { doc } = await run(opts);
    assert.deepEqual(doc.variables['button-foregroundMuted-background'].scopes, ['FRAME_FILL']);
    assert.ok(!doc.notes.some(n => n.at === 'variables.button-foregroundMuted-*'));
  }
});

test('the step uses the shared closure() and validate(), never a copy', () => {
  const text = readFileSync(new URL('../scripts/foundations.mjs', import.meta.url), 'utf8');
  assert.match(text, /import \{ closure, closureContracts, expand, resolve, validate \} from '\.\.\/\.\.\/contract\/scripts\/contract\.mjs';/);
  assert.doesNotMatch(text, /function (closure|validate|forEachUse)\b/);
});
