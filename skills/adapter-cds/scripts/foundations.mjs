#!/usr/bin/env node
// The CDS Adapter's Foundations step (#385): the CDS Foundations document, from CDS Web's `defaultTheme` in Light
// and Dark. It carries the spectrum as Primitives, the semantic colours as the Theme, then each family's component
// tokens and Synthesized tokens (the hover, pressed and disabled blends CDS computes at run time, ADR 0009), the
// Layout groups and the Type variables with Text Styles. Never edit its output by hand.
//
//   node skills/adapter-cds/scripts/foundations.mjs [--family <key>]... [--contracts <dir>] [--sources <dir>] [-o <file>]
//
// Defaults: the families of every design-systems/cds/contracts/*.component.json plus each --family, those Contracts,
// sources in .scratch/adapter-cds/sources (fetched on first use, see sources.mjs), output
// design-systems/cds/cds.foundations.json. `--family button` emits Button's tokens before its Contract exists.
// The output is a pure function of its inputs: two runs are byte-identical.
//
// The values come from evaluating the compiled theme modules of the pinned tarballs (ADR 0021): `defaultTheme`,
// `createThemeCssVars`, `getBlendedColor` and the cds-common token maps, with the modules they import. The theme's
// TypeScript sources are the evidence: each Theme value's alias is read from its `defaultTheme.ts` template. Every
// Primitive, Theme, Layout and Type value must equal the custom property `createThemeCssVars` emits for its Mode,
// and every custom property it emits is either in the document or excluded by name, with a note.
//
// The token closure and the scope check come from the shared Contract module (closure, validate rule 6).
// Generation throws (the CLI exits 1 and writes nothing), naming the token, on an unknown token, an unreadable
// value, a value that differs from createThemeCssVars, a Synthesized name a CDS token already has, a rule 6 scope
// violation, or a Contract pinned to another commit or package version.
import * as nodeModule from 'node:module';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closure, closureContracts, validate } from '../../contract/scripts/contract.mjs';
import {
  CDS, CONTRACTS_DIR, DEFAULT_DIR, FOUNDATIONS_DIR, FOUNDATIONS_PINNED, REPO_ROOT, fetchFoundationsPackages, fetchSources,
  hasFoundationsPackages, hasSources, readSources, sha256, snapshotId,
} from './sources.mjs';

const WEB = '@coinbase/cds-web';
const COMMON = '@coinbase/cds-common';
const COLLECTIONS = ['primitives', 'theme', 'layout', 'type'];
// Mode keys are CDS's colour schemes. Neither has a selector: ThemeProvider sets the custom properties inline on its
// element, so no class switches them (a note says so).
const SCHEMES = [['light', 'Light'], ['dark', 'Dark']];
const SINGLE = [['default', 'Default']];
const FILE = {
  theme: 'packages/web/src/themes/defaultTheme.ts',
  provider: 'packages/web/src/system/ThemeProvider.tsx',
  interactable: 'packages/web/src/system/Interactable.tsx',
  interactableTokens: 'packages/common/src/tokens/interactable.ts',
  interProps: 'packages/web/src/system/interactableCSSProperties.ts',
};
// The compiled modules evaluated, as `<package>/<member>` and the export taken (none: the whole module).
const MODULES = {
  defaultTheme: [WEB, 'package/esm/themes/defaultTheme.js', 'defaultTheme'],
  createThemeCssVars: [WEB, 'package/esm/core/createThemeCssVars.js', 'createThemeCssVars'],
  getBlendedColor: [COMMON, 'package/esm/color/getBlendedColor.js', 'getBlendedColor'],
  button: [COMMON, 'package/esm/tokens/button.js'],
  interactable: [COMMON, 'package/esm/tokens/interactable.js'],
};
const DEFAULT_FONT_CSS = 'package/esm/styles/defaultFont.css';

// Component token maps, by Component Family: the cds-common module, its source, and the props type whose
// `@deprecated` variants get scopes []. A family's tokens are emitted only when the family is asked for (--family) or
// has a Contract.
const COMPONENTS = { button: { module: 'button', source: 'packages/common/src/tokens/button.ts', props: 'packages/common/src/types/ButtonBaseProps.ts' } };
// A component token's role in the map -> its name suffix and scopes.
const ROLE = { color: ['color', ['SHAPE_FILL', 'TEXT_FILL']], background: ['background', ['FRAME_FILL']], borderColor: ['border', ['STROKE_COLOR']] };
// The roles Interactable blends per state: it leaves the text colour as it is.
const BLENDED = ['background', 'borderColor'];
// Interactable's states, as Interactable.tsx names them -> the Synthesized name's state.
const STATES = [['Hovered', 'hover'], ['Pressed', 'pressed'], ['Disabled', 'disabled']];
// Theme colours: Figma group by name prefix, longest first.
const THEME_GROUP = [['bgLine', 'Line'], ['bgElevation', 'Elevation'], ['bg', 'Background'], ['fg', 'Foreground'], ['accent', 'Accent'], ['transparent', 'Transparent']];
// Layout groups of the theme -> Figma group and scopes. Figma has no PADDING scope; GAP covers padding and gap (#27).
const LAYOUT_GROUP = {
  space: ['Spacing', ['GAP']],
  borderRadius: ['Border radius', ['CORNER_RADIUS']],
  borderWidth: ['Border width', ['STROKE_FLOAT']],
  iconSize: ['Icon size', ['WIDTH_HEIGHT']],
  controlSize: ['Control size', ['WIDTH_HEIGHT']],
};
// Type groups, which are also the Text Style fields -> Figma group, scope and type.
const TYPE_GROUP = {
  fontFamily: ['Font family', 'FONT_FAMILY', 'STRING'],
  fontSize: ['Font size', 'FONT_SIZE', 'FLOAT'],
  fontWeight: ['Font weight', 'FONT_WEIGHT', 'FLOAT'],
  lineHeight: ['Line height', 'LINE_HEIGHT', 'FLOAT'],
};
const FONT_STYLE = { 400: 'Regular', 600: 'Semi Bold' }; // Inter's Figma style per weight
// What createThemeCssVars emits that the document leaves out, by custom-property prefix, and why (a note each).
const EXCLUDED = [
  ['--shadow-', 'shadow', 'Shadow (elevation1, elevation2) is not carried: the Foundations document holds variables and Text Styles, not effect styles.'],
  ['--avatarSize-', 'avatarSize', 'avatarSize is not carried: Avatar is not a family this document serves.'],
  ['--illustration-', 'illustrationColor', 'Illustration colours are not carried: they paint CDS\'s themeable SVG illustrations, not components.'],
  ['--textTransform-', 'textTransform', 'textTransform is not carried: a Text Style has no text case. CDS sets caption to uppercase; the caption Text Style is not.'],
  ['--fontFamilyMono-', 'fontFamilyMono', 'fontFamilyMono is not carried: the Text Styles are CDS\'s sans styles (fontFamily).'],
  ['--lightColor-', 'lightColor', 'The scheme-fixed copies --lightColor-* and --darkColor-* are not carried: the Theme\'s Light and Dark Modes hold the same values, under --color-*.'],
  ['--darkColor-', 'darkColor', null],
];
const ALPHA_REASON = 'alpha: a Figma alias cannot carry alpha, so this mode holds the flattened RGBA';

const fail = msg => { throw new Error(msg); };
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const formatG = x => String(Number(x.toPrecision(6)));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- colours ----------

/** A CSS colour CDS writes ("r,g,b" spectrum, rgb(), rgba(), #hex, transparent) as [r, g, b, a], or null. */
function parseColor(text) {
  const s = String(text).trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = /^(?:rgba?\(\s*)?(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?(\)?)$/.exec(s);
  if (!m || /^rgba?\(/.test(s) !== (m[5] === ')')) return null;
  const c = [1, 2, 3].map(i => Number(m[i])).concat(m[4] === undefined ? 1 : Number(m[4]));
  return c.slice(0, 3).every(x => x <= 255) && c[3] <= 1 ? c : null;
}
const hex = c => `#${c.slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join('')}`;
const css = c => (c[3] === 1 ? hex(c) : `rgba(${c.slice(0, 3).join(', ')}, ${formatG(c[3])})`);
const sameColor = (a, b) => a && b && a.every((x, i) => x === b[i]);
/** A colour value form: opaque `{value-ish}` is built by the caller; this is the raw form with alpha when below 1. */
const rawForm = (c, extra) => ({ raw: hex(c), ...(c[3] === 1 ? {} : { alpha: c[3] }), resolved: css(c), ...extra });

// ---------- loading the compiled modules ----------

// The compiled ESM imports its siblings without extensions ('./theme') and getBlendedColor imports d3-color. One
// resolve hook, registered once per process, adds `.js` inside each extracted package folder and maps d3-color to
// its pinned install; any other specifier from there fails. Nothing else is resolved by it.
const roots = new Map(); // npm folder URL -> d3-color entry URL
function hook() {
  if (roots.size) return;
  if (typeof nodeModule.registerHooks !== 'function')
    fail(`Node ${process.version} has no module.registerHooks; the CDS Foundations step needs Node 22.15 or later`);
  nodeModule.registerHooks({
    resolve(spec, ctx, next) {
      const root = ctx.parentURL && [...roots.keys()].find(r => ctx.parentURL.startsWith(r));
      if (!root) return next(spec, ctx);
      if (spec === 'd3-color') return { url: roots.get(root), format: 'module', shortCircuit: true };
      if (/^\.\.?\//.test(spec)) return { url: new URL(/\.js$/.test(spec) ? spec : `${spec}.js`, ctx.parentURL).href, format: 'module', shortCircuit: true };
      throw new Error(`${ctx.parentURL}: imports ${spec}, which the CDS Foundations step does not provide`);
    },
  });
}

/**
 * Import the named compiled modules from the extracted tarballs in `sources` (readSources output), with d3-color
 * from `depsDir`. Returns {defaultTheme, createThemeCssVars, getBlendedColor, button, interactable, hashes}.
 */
export async function loadModules(sources, depsDir = FOUNDATIONS_DIR) {
  if (!hasFoundationsPackages(depsDir))
    fail(`d3-color missing in ${depsDir}; run: node skills/adapter-cds/scripts/sources.mjs`);
  const npm = pathToFileURL(join(sources.packages[WEB].dir, '..') + '/').href;
  hook();
  roots.set(npm, pathToFileURL(join(depsDir, 'node_modules/d3-color/src/index.js')).href);
  const out = { hashes: {} };
  for (const [name, [pkg, member, exported]] of Object.entries(MODULES)) {
    const file = join(sources.packages[pkg].dir, member);
    if (!existsSync(file)) fail(`${pkg}: ${member} is not extracted; run: node skills/adapter-cds/scripts/sources.mjs`);
    out.hashes[`${pkg}/${member.replace(/^package\//, '')}`] = `sha256:${sha256(readFileSync(file))}`;
    const mod = await import(pathToFileURL(file).href);
    out[name] = exported ? mod[exported] : mod;
    if (!out[name]) fail(`${pkg}/${member} has no ${name} export`);
  }
  return out;
}

// ---------- reading the TypeScript evidence ----------

/** defaultTheme.ts: each colour's template in lightColor and darkColor, `{scheme: {token: template text}}`. */
function themeTemplates(text) {
  const out = {};
  for (const [scheme] of SCHEMES) {
    const block = new RegExp(`^  ${scheme}Color: \\{\\n([\\s\\S]*?)\\n  \\},`, 'm').exec(text);
    if (!block) fail(`${FILE.theme}: cannot find ${scheme}Color`);
    out[scheme] = {};
    for (const line of block[1].split('\n')) {
      if (/^\s*(\/\/.*)?$/.test(line)) continue;
      const m = /^\s*(\w+): (.+),$/.exec(line);
      if (!m) fail(`${FILE.theme} ${scheme}Color: cannot read the line ${JSON.stringify(line.trim())}`);
      out[scheme][m[1]] = m[2];
    }
  }
  return out;
}

/** A Theme template as {spectrum, key, alpha}: `rgb(${lightSpectrum.blue60})` or `rgba(${darkSpectrum.gray60},0.2)`. */
function readTemplate(template) {
  const m = /^`rgba?\(\$\{(light|dark)Spectrum\.(\w+)\}(?:,\s*(\d*\.?\d+))?\)`$/.exec(template);
  if (!m || (template.startsWith('`rgba(') !== (m[3] !== undefined))) return null;
  return { spectrum: m[1], key: m[2], alpha: m[3] === undefined ? 1 : Number(m[3]) };
}

/**
 * Interactable.tsx: for each state, the blend `getInteractableStyles` sets: its opacity (the cds-common constant it
 * defaults to) and whether it skips contrast optimisation. interactableCSSProperties.ts: the custom property each
 * sets. Returns [{state, figmaState, opacity, skip, property: {background, border}}].
 */
function interactableBlends(files, interactable) {
  const text = files[FILE.interactable];
  const props = Object.fromEntries([...files[FILE.interProps].matchAll(/^export const (interactable\w+) = '(--[\w-]+)';$/gm)].map(m => [m[1], m[2]]));
  return STATES.map(([state, figmaState]) => {
    const lower = state.charAt(0).toLowerCase() + state.slice(1);
    const def = new RegExp(`const ${lower}Opacity = blendStyles\\?\\.${lower}Opacity \\?\\? (\\w+);`).exec(text);
    if (!def || typeof interactable[def[1]] !== 'number') fail(`${FILE.interactable}: cannot read the ${lower} opacity`);
    const property = {};
    let skip = null;
    for (const [part, role, overlay] of [['Background', 'background', 'backgroundColor'], ['BorderColor', 'border', 'borderColorValue']]) {
      const name = `interactable${state}${part}`;
      const m = new RegExp(`\\[${name}\\]: getBlendedColor\\(\\{([^}]*)\\}\\)`).exec(text);
      const body = m ? m[1] : '';
      if (!new RegExp(`overlayColor: blendStyles\\?\\.\\w+ \\?\\? ${overlay},`).test(body) || !body.includes(`blendOpacity: ${lower}Opacity,`)
        || !body.includes('colorScheme: theme.activeColorScheme,'))
        fail(`${FILE.interactable}: cannot read the ${name} blend`);
      const s = /skipContrastOptimization: true/.test(body);
      if (skip !== null && s !== skip) fail(`${FILE.interactable}: the ${lower} background and border blends differ in skipContrastOptimization`);
      skip = s;
      if (!props[name]) fail(`${FILE.interProps}: no ${name}`);
      property[role] = props[name];
    }
    return { state, figmaState, opacity: interactable[def[1]], skip, property };
  });
}

/** The first family of `--defaultFont-sans` in cds-web's defaultFont.css: Inter. */
function defaultFont(sources) {
  const file = join(sources.packages[WEB].dir, DEFAULT_FONT_CSS);
  const m = existsSync(file) && /--defaultFont-sans:\s*'([^']+)'/.exec(readFileSync(file, 'utf8'));
  return m ? m[1] : fail(`${WEB}: cannot read --defaultFont-sans in ${DEFAULT_FONT_CSS}`);
}

// ---------- generate ----------

/** The theme ThemeProvider passes to createThemeCssVars for `scheme` (ThemeProvider.tsx, themeApi). */
const themeFor = (theme, scheme) => ({
  ...theme,
  activeColorScheme: scheme,
  spectrum: theme[`${scheme}Spectrum`],
  color: theme[`${scheme}Color`],
  illustrationColor: theme[`${scheme}IllustrationColor`] ? { ...theme[`${scheme}IllustrationColor`] } : undefined,
});

/**
 * Generate the CDS Foundations document.
 * @param sources   readSources() output.
 * @param contracts [{path, contract}]: the Contracts of the Design System; `path` is relative to the repo root.
 * @param families  Component Family keys whose tokens to emit besides the Contracts' families (`--family`).
 * @param modules   loadModules() output; tests pass an altered copy. Loaded from `sources` when omitted.
 * @returns {doc, text, documentHash, summary}. Throws on any failed check (see the header).
 */
export async function generate({ sources, contracts = [], families = [], modules }) {
  for (const { path, contract } of contracts) {
    const structural = validate(contract, { variables: {}, textStyles: {} }).errors.filter(e => e.rule === 'schema' || e.rule === 3);
    if (structural.length) fail(`Contract ${path}: ${structural.map(e => `rule ${e.rule} at ${e.at}: ${e.message}`).join('; ')}`);
    const src = contract.source;
    if (src.commit !== sources.commit) fail(`Contract ${path} pins commit ${src.commit} but the sources are commit ${sources.commit}`);
    for (const [name, version] of Object.entries(src.packages || {}))
      if (CDS.packages[name] && version !== CDS.packages[name].version)
        fail(`Contract ${path} pins ${name}@${version} but the step reads ${name}@${CDS.packages[name].version}`);
  }
  const mods = modules || await loadModules(sources);
  const files = sources.files;
  const theme = mods.defaultTheme;

  // 1. the token union, from the shared module's closure; the families to emit
  const usedBy = {};
  for (const { contract } of contracts)
    for (const t of closure(contract)) (usedBy[t] = usedBy[t] || new Set()).add(contract.family.key);
  const tokens = Object.keys(usedBy).sort(byKey);
  const users = t => [...(usedBy[t] || [])].sort(byKey);
  const emitFamilies = [...new Set([...families, ...contracts.map(c => c.contract.family.key)])].sort(byKey);
  const unknownFamily = emitFamilies.filter(f => !COMPONENTS[f]);
  if (unknownFamily.length) fail(`no CDS component token map for family ${unknownFamily.join(', ')}`);

  const variables = {};
  const textStyles = {};
  const notes = [];
  const cssOf = {}; // custom property -> the flat name it was checked for
  const checks = { css: 0, blend: 0 };
  const emitted = Object.fromEntries(SCHEMES.map(([s]) => [s, mods.createThemeCssVars(themeFor(theme, s))]));
  // Every Mode's createThemeCssVars output must hold `prop` with a value equal to `want` (by `same`).
  const check = (token, prop, want, same) => {
    for (const [s] of SCHEMES) {
      const got = emitted[s][prop];
      if (got === undefined) fail(`${token}: createThemeCssVars emits no ${prop} in ${s}`);
      if (!same(got, s)) fail(`${token}/${s}: the document has ${typeof want === 'function' ? want(s) : want}, createThemeCssVars emits ${prop}: ${got}`);
      checks.css++;
    }
    cssOf[prop] = token;
  };
  const num = (v, at) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`${at}: cannot read ${JSON.stringify(v)} as a number`));
  const remPx = (v, at) => { const r = /^(\d*\.?\d+)rem$/.exec(v); return r ? Number(r[1]) * 16 : fail(`${at}: cannot read ${JSON.stringify(v)} as rem`); };

  // 2. Primitives: both spectrums, hidden
  for (const [s, label] of SCHEMES) {
    const spectrum = theme[`${s}Spectrum`] || fail(`defaultTheme has no ${s}Spectrum`);
    for (const key of Object.keys(spectrum).sort(byKey)) {
      const name = `${s}-${key}`;
      const c = parseColor(spectrum[key]);
      if (!c || c[3] !== 1 || /^(rgb|#|transparent)/.test(spectrum[key])) fail(`${name}: cannot read the spectrum value ${JSON.stringify(spectrum[key])}`);
      check(name, `--${name}`, hex(c), got => sameColor(parseColor(got), c));
      variables[name] = { collection: 'primitives', name: `${label}/${key}`, type: 'COLOR', source: `${FILE.theme}#${s}Spectrum.${key}`,
        scopes: [], hidden: true, values: { default: { value: hex(c) } } };
    }
  }

  // 3. Theme: every semantic colour, aliasing the Primitive its template names
  const templates = themeTemplates(files[FILE.theme]);
  const themeColor = {}; // token -> {scheme: [r, g, b, a]}
  const lightKeys = Object.keys(theme.lightColor || {});
  for (const [s] of SCHEMES) {
    const keys = Object.keys(theme[`${s}Color`] || {});
    const diff = [...keys.filter(k => !(k in templates[s])), ...Object.keys(templates[s]).filter(k => !keys.includes(k))];
    if (diff.length) fail(`${s}Color: defaultTheme.js and ${FILE.theme} differ in ${diff.sort(byKey).join(', ')}`);
    if (keys.length !== lightKeys.length || keys.some(k => !lightKeys.includes(k))) fail(`lightColor and darkColor name different tokens`);
  }
  for (const name of lightKeys.filter(k => k !== 'currentColor').sort(byKey)) {
    const group = THEME_GROUP.find(([p]) => name === p || (name.startsWith(p) && /[A-Z0-9]/.test(name.charAt(p.length))));
    if (!group) fail(`${name}: no Figma group for a Theme colour named so`);
    const values = {};
    themeColor[name] = {};
    for (const [s] of SCHEMES) {
      const t = readTemplate(templates[s][name]);
      if (!t) fail(`${name}/${s}: cannot read the template ${templates[s][name]} in ${FILE.theme}`);
      const target = `${t.spectrum}-${t.key}`;
      if (!variables[target]) fail(`${name}/${s}: ${t.spectrum}Spectrum.${t.key} is not a Primitive`);
      const c = parseColor(variables[target].values.default.value).slice(0, 3).concat(t.alpha);
      const evaluated = theme[`${s}Color`][name];
      if (!sameColor(parseColor(evaluated), c)) fail(`${name}/${s}: ${FILE.theme} reads as ${css(c)}, but defaultTheme.js is ${evaluated}`);
      themeColor[name][s] = c;
      values[s] = c[3] === 1 ? { alias: target, resolved: hex(c) }
        : rawForm(c, { from: { alias: target, alpha: c[3] }, level: 'info', reason: ALPHA_REASON });
    }
    check(name, `--color-${name}`, s => values[s].resolved, (got, s) => sameColor(parseColor(got), themeColor[name][s]));
    variables[name] = { collection: 'theme', name: `${group[1]}/${name}`, type: 'COLOR', source: `${FILE.theme}#lightColor.${name}, darkColor.${name}`,
      scopes: name.startsWith('fg') ? ['SHAPE_FILL', 'TEXT_FILL'] : ['ALL_FILLS', 'STROKE_COLOR'],
      codeSyntax: { WEB: `var(--color-${name})` }, values, usedBy: users(name) };
  }
  notes.push({ level: 'info', at: 'variables.currentColor',
    message: 'currentColor (--color-currentColor) is not carried: it is the CSS keyword, not a colour, in both schemes.' });

  // 4. Each family's component tokens, aliasing the Theme colour its token map names, then its Synthesized tokens
  const synthesized = {};
  if (emitFamilies.length) {
    const blends = interactableBlends(files, mods.interactable);
    for (const family of emitFamilies) {
      const map = mods[COMPONENTS[family].module];
      const deprecated = new Map([...files[COMPONENTS[family].props].matchAll(/@deprecated ([^.\n]*\.)[^\n]*\n\s*\*\/\s*\n\s*\|\s*'(\w+)'/g)].map(d => [d[2], d[1]]));
      for (const [mapKey, suffix] of [['variants', ''], ['transparentVariants', '-transparent']]) {
        if (!map[mapKey]) fail(`${COMPONENTS[family].source}: no ${mapKey}`);
        for (const variant of Object.keys(map[mapKey]).sort(byKey)) {
          const roles = map[mapKey][variant];
          const base = `${family}-${variant}${suffix}`;
          const scopesFor = scopes => (deprecated.has(variant) ? [] : scopes);
          for (const [role, [part, scopes]] of Object.entries(ROLE)) {
            const target = roles[role];
            if (!variables[target] || variables[target].collection !== 'theme') fail(`${base}-${part}: ${target} is not a Theme colour`);
            const name = `${base}-${part}`;
            variables[name] = { collection: 'theme', name: `${cap(family)}/${name}`, type: 'COLOR',
              source: `${COMPONENTS[family].source}#${mapKey}.${variant}.${role}`, scopes: scopesFor(scopes), codeSyntax: {},
              values: Object.fromEntries(SCHEMES.map(([s]) => [s, { alias: target, resolved: variables[target].values[s].resolved }])),
              usedBy: users(name), family };
          }
          for (const b of blends) {
            for (const [role, [part]] of BLENDED.map(r => [r, ROLE[r]])) {
              const name = `${base}-${b.figmaState}-${part}`;
              const target = roles[role];
              const values = {};
              for (const [s] of SCHEMES) {
                const args = { overlayColor: theme[`${s}Color`][target], blendOpacity: b.opacity, colorScheme: s, ...(b.skip ? { skipContrastOptimization: true } : {}) };
                const out = mods.getBlendedColor(args);
                const c = parseColor(out);
                if (!c) fail(`${name}/${s}: cannot read getBlendedColor's output ${JSON.stringify(out)}`);
                values[s] = rawForm(c, {
                  from: { token: target, blendOpacity: b.opacity, colorScheme: s, ...(b.skip ? { skipContrastOptimization: true } : {}), property: b.property[part] },
                  level: 'info',
                  reason: `getBlendedColor(${target} ${args.overlayColor}, ${b.opacity}${b.skip ? ', skipContrastOptimization' : ''}) in ${s} = ${out}; Interactable sets it as ${b.property[part]} while ${b.figmaState === 'hover' ? 'hovered' : b.figmaState}`,
                });
                checks.blend++;
              }
              synthesized[name] = { collection: 'theme', name: `${cap(family)}/${name}`, type: 'COLOR',
                source: `synthesized: ${FILE.interactableTokens} blend(${target}, ${b.opacity})`,
                scopes: scopesFor(part === 'background' ? ['FRAME_FILL'] : ['STROKE_COLOR']), codeSyntax: {}, values, usedBy: users(name), family };
            }
          }
        }
      }
      for (const [variant, says] of deprecated)
        notes.push({ level: 'info', at: `variables.${family}-${variant}-*`, message: `${variant} is @deprecated in ${COMPONENTS[family].props} ("${says}"); its tokens, plain and transparent, have scopes [], which keep them out of Figma's pickers.` });
      const props = blends.flatMap(b => [b.property.background, b.property.border]).join(', ');
      notes.push(
        { level: 'info', at: `variables.${family}-*.codeSyntax`, message: `CDS emits no custom property for a ${cap(family)} token: ${cap(family)} paints var(--color-<token>), the Theme colour each one aliases, so codeSyntax is empty and a reference by that custom property matches the Theme colour.` },
        { level: 'info', at: `variables.${family}-*-{${STATES.map(s => s[1]).join(',')}}-*`, message: `Synthesized tokens (ADR 0009): Interactable computes each state's colour per element with getBlendedColor and sets it inline as ${props}. Those properties hold a different colour on every element, so codeSyntax is empty. Disabled also sets opacity 0.5 on the whole element (accessibleOpacityDisabled), which no colour token carries.` },
      );
    }
  }
  for (const name of Object.keys(synthesized).sort(byKey)) {
    if (variables[name]) fail(`the Synthesized token ${name} has the name of a CDS token (${variables[name].source})`);
    variables[name] = synthesized[name];
  }

  // 5. Layout: space, borderRadius, borderWidth, iconSize, controlSize, in px
  for (const [group, [figGroup, scopes]] of Object.entries(LAYOUT_GROUP)) {
    const values = theme[group] || fail(`defaultTheme has no ${group}`);
    for (const key of Object.keys(values).sort((a, b) => Number(a) - Number(b) || byKey(a, b))) {
      const name = `${group}-${key.replace(/\./g, '_')}`;
      if (variables[name]) fail(`${name} has the name of another CDS token (${variables[name].source})`);
      const px = num(values[key], name);
      check(name, `--${name}`, `${px}px`, got => got === `${px}px`);
      variables[name] = { collection: 'layout', name: `${figGroup}/${name}`, type: 'FLOAT', source: `${FILE.theme}#${group}.${key}`,
        scopes, codeSyntax: { WEB: `var(--${name})` }, values: { default: { value: px } }, usedBy: users(name) };
    }
  }
  notes.push({ level: 'info', at: 'variables.iconSize-*', message: 'The schema has no Icon size or Control size group for CDS; they take the Size scope WIDTH_HEIGHT, as Carbon\'s Icon size does.' });

  // 6. Type: a variable per text key for each group, and a Text Style per key, in the sans font
  const font = defaultFont(sources);
  const textKeys = Object.keys(theme.fontSize || fail('defaultTheme has no fontSize'));
  for (const group of Object.keys(TYPE_GROUP)) {
    const keys = Object.keys(theme[group] || {});
    if (keys.length !== textKeys.length || keys.some(k => !textKeys.includes(k))) fail(`${group} and fontSize name different text keys`);
  }
  for (const key of [...textKeys].sort(byKey)) {
    const binds = {};
    const style = {};
    for (const [group, [figGroup, scope, type]] of Object.entries(TYPE_GROUP)) {
      const name = `${group}-${key}`;
      if (variables[name]) fail(`${name} has the name of another CDS token (${variables[name].source})`);
      const raw = theme[group][key];
      let value, from;
      if (group === 'fontFamily') {
        if (raw !== 'var(--defaultFont-sans)') fail(`${name}: cannot read ${JSON.stringify(raw)}; only var(--defaultFont-sans) is understood`);
        [value, from] = [font, `${raw}, the first family of --defaultFont-sans in ${WEB} ${DEFAULT_FONT_CSS.replace(/^package\//, '')}`];
      } else if (group === 'fontWeight') {
        if (!/^\d+$/.test(raw)) fail(`${name}: cannot read ${JSON.stringify(raw)} as a weight`);
        [value, from] = [Number(raw), undefined];
      } else [value, from] = [remPx(raw, name), `${raw} x 16`];
      check(name, `--${name}`, raw, got => got === raw);
      variables[name] = { collection: 'type', name: `${figGroup}/${name}`, type, source: `${FILE.theme}#${group}.${key}`, scopes: [scope],
        codeSyntax: { WEB: `var(--${name})` }, values: { default: { value, ...(from ? { from } : {}) } }, usedBy: users(key) };
      binds[group] = name;
      style[group] = value;
    }
    if (!FONT_STYLE[style.fontWeight]) fail(`${key}: no ${font} style for weight ${style.fontWeight}`);
    textStyles[key] = { name: `${cap(key.replace(/\d+$/, ''))}/${key}`, source: `${FILE.theme}#fontSize.${key}`, fontFamily: font,
      fontStyle: FONT_STYLE[style.fontWeight], fontSize: style.fontSize, lineHeight: { unit: 'PIXELS', value: style.lineHeight }, fontWeight: style.fontWeight,
      letterSpacing: { unit: 'PIXELS', value: 0 }, binds, usedBy: users(key) };
  }

  // 7. Everything createThemeCssVars emits is in the document or excluded by name
  const spectrumKeys = new Set(SCHEMES.flatMap(([s]) => Object.keys(theme[`${s}Spectrum`])));
  const excluded = {};
  for (const [s] of SCHEMES) {
    for (const prop of Object.keys(emitted[s])) {
      if (cssOf[prop]) continue;
      const why = prop === '--activeColorScheme' ? 'activeColorScheme' : prop === '--color-currentColor' ? 'currentColor'
        : spectrumKeys.has(prop.slice(2)) ? 'spectrum' : (EXCLUDED.find(([p]) => prop.startsWith(p)) || [])[1];
      if (!why) fail(`createThemeCssVars emits ${prop} in ${s}, which the document neither carries nor excludes`);
      (excluded[why] = excluded[why] || new Set()).add(prop);
    }
  }
  for (const [, , message] of EXCLUDED) if (message) notes.push({ level: 'info', at: 'variables', message });
  notes.push({ level: 'info', at: 'variables', message: 'The unprefixed spectrum (--blue60) is the active scheme\'s copy of --light-blue60 or --dark-blue60; the Primitives carry both schemes by those names. Primitives have no codeSyntax: they are hidden, and CDS emits them as "r,g,b" triplets, not colours.' });
  const themes = readdirSync(join(sources.packages[WEB].dir, 'package/esm/themes')).filter(f => f.endsWith('.js') && f !== 'defaultTheme.js').map(f => f.replace(/\.js$/, '')).sort(byKey);
  notes.push({ level: 'info', at: 'collections', message: `Only defaultTheme is carried. CDS Web's other themes (${themes.join(', ')}) are not.` });

  // 8. the closure: every token a Contract references is in the document
  const unknown = tokens.filter(t => !variables[t] && !textStyles[t]);
  if (unknown.length) fail(`tokens not found in the CDS Foundations: ${unknown.join(', ')}`);

  // uniqueness: one flat-name namespace across variables and Text Styles; unique Figma names
  const clash = Object.keys(variables).filter(k => k in textStyles);
  if (clash.length) fail(`names used by both a variable and a Text Style: ${clash.join(', ')}`);
  for (const names of [Object.values(variables).map(v => v.name), Object.values(textStyles).map(t => t.name)]) {
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) fail(`duplicate Figma names: ${dupes.join(', ')}`);
  }

  const fileHashes = Object.fromEntries(Object.keys(sources.hashes).sort(byKey).map(p => [p, `sha256:${sources.hashes[p]}`]));
  const isSynth = v => /^synthesized: /.test(v.source);
  const doc = {
    schemaVersion: 1,
    designSystem: { key: 'cds', name: 'CDS' },
    source: {
      codeLibrary: 'CDS Web', adapter: 'cds', repository: CDS.repository, tag: CDS.tag, commit: CDS.commit,
      packages: { [COMMON]: CDS.packages[COMMON].version, [WEB]: CDS.packages[WEB].version, 'd3-color': d3Version() },
      files: fileHashes,
      snapshotId: snapshotId(fileHashes),
    },
    closure: {
      contracts: closureContracts(contracts),
      tokens,
    },
    collections: [
      { key: 'primitives', name: 'Primitives', modes: SINGLE.map(([key, label]) => ({ key, label })), hidden: true },
      { key: 'theme', name: 'Theme', modes: SCHEMES.map(([key, label]) => ({ key, label })) },
      { key: 'layout', name: 'Layout', modes: SINGLE.map(([key, label]) => ({ key, label })) },
      { key: 'type', name: 'Type', modes: SINGLE.map(([key, label]) => ({ key, label })) },
    ],
    variables: Object.fromEntries(Object.entries(variables).sort(([ka, a], [kb, b]) =>
      COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection) || isSynth(a) - isSynth(b) || byKey(ka, kb))),
    textStyles: Object.fromEntries(Object.entries(textStyles).sort(([a], [b]) => byKey(a, b))),
    checks: {
      css: { against: `${WEB}@${CDS.packages[WEB].version} createThemeCssVars(defaultTheme), as ThemeProvider builds it for each Mode`,
        modules: mods.hashes, matched: checks.css, missing: [], differs: [],
        excluded: Object.fromEntries(Object.keys(excluded).sort(byKey).map(k => [k, excluded[k].size])) },
      blend: { by: `${COMMON}@${CDS.packages[COMMON].version} getBlendedColor`, computed: checks.blend },
      scopes: { by: 'skills/contract/scripts/contract.mjs validate, rule 6', contracts: contracts.length, errors: 0 },
    },
    notes: [...notes,
      { level: 'info', at: 'collections.theme.modes', message: 'Light and Dark have no selector: ThemeProvider sets the custom properties inline on its element for its activeColorScheme, and no class switches them. A preview shows a Mode by its key.' },
      { level: 'info', at: 'textStyles', message: `Text Styles are named by CDS's text keys and use ${font}, the first family of --defaultFont-sans. CDS sets no letter spacing, so it is 0.` },
      { level: 'verify', at: 'textStyles', message: `fontStyle is the Figma style each weight is named by (${Object.values(FONT_STYLE).join(', ')}); not yet checked against the ${font} styles Figma offers.` },
    ],
  };

  // 9. validation rule 6 against the generated document: every token exists and is used inside its scopes
  for (const { path, contract } of contracts) {
    const errors = validate(contract, doc).errors.filter(e => e.rule === 6 || e.rule === 'schema');
    if (errors.length) fail(`Contract ${path} fails validation rule 6 against the generated foundations:\n${errors.map(e => `  rule ${e.rule} at ${e.at}: ${e.message}`).join('\n')}`);
  }

  const text = JSON.stringify(doc, null, 2) + '\n';
  const counts = {};
  for (const v of Object.values(variables)) counts[v.collection] = (counts[v.collection] || 0) + 1;
  const summary = [
    `families ${emitFamilies.join(', ') || 'none'}; closure ${tokens.length} tokens from ${contracts.length} Contract(s); variables ${COLLECTIONS.map(c => `${c} ${counts[c] || 0}`).join(', ')} (${Object.keys(synthesized).length} Synthesized); text styles ${Object.keys(textStyles).length}`,
    `createThemeCssVars matched ${checks.css}; getBlendedColor computed ${checks.blend}; every Contract passes rule 6`,
  ];
  return { doc, text, documentHash: `sha256:${sha256(text)}`, summary };
}

const d3Version = () => JSON.parse(readFileSync(join(FOUNDATIONS_PINNED, 'package.json'), 'utf8')).dependencies['d3-color'];

/** The Contracts in `dir`: [{path, contract}], `path` relative to the repo root. */
export function readContracts(dir = CONTRACTS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.component.json')).sort(byKey).map(f => {
    const file = join(dir, f);
    return { path: relative(REPO_ROOT, file).split('\\').join('/'), contract: JSON.parse(readFileSync(file, 'utf8')) };
  });
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => (args.includes(flag) ? resolvePath(args[args.indexOf(flag) + 1]) : fallback);
  try {
    const families = args.flatMap((a, i) => (a === '--family' ? [args[i + 1]] : []));
    if (families.some(f => !f || f.startsWith('-'))) throw new Error('--family needs a family key');
    const sourcesDir = opt('--sources', DEFAULT_DIR);
    const out = opt('-o', join(REPO_ROOT, 'design-systems/cds/cds.foundations.json'));
    if (!hasSources(sourcesDir)) await fetchSources(sourcesDir);
    if (!hasFoundationsPackages()) fetchFoundationsPackages();
    const contracts = readContracts(opt('--contracts', CONTRACTS_DIR));
    const { text, documentHash, summary } = await generate({ sources: readSources(sourcesDir), contracts, families });
    writeFileSync(out, text);
    console.log([...summary, `wrote ${relative(process.cwd(), out)} (${text.length} chars, documentHash ${documentHash})`, 'OK'].join('\n'));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
