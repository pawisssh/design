#!/usr/bin/env node
// The Carbon Adapter's foundations step (#28): the Carbon foundations document, generated from the pinned
// Carbon sources. It carries the whole theme (#108, ADR 0006): every themes.json token, the whole palette, every
// layout.json group and every @carbon/type style, plus the component tokens of each family that has a Contract,
// and Carbon's layer sets as the Layer collection (#109, ADR 0012).
// The Contracts' token closure is recorded and checked against it. Never edit its output by hand.
//
//   node skills/adapter-carbon/scripts/foundations.mjs [--contracts <dir>] [--sources <dir>] [-o <file>]
//
// Defaults: every design-systems/carbon/contracts/*.component.json, sources in .scratch/adapter-carbon/sources
// (fetched on first use, see sources.mjs), output design-systems/carbon/carbon.foundations.json.
// The output is a pure function of its inputs: two runs are byte-identical, so the ledger's documentHash is
// stable. The schema is skills/contract/references/foundations-schema.md.
//
// The token closure and the scope check come from the shared Contract module (closure, validate rule 6);
// this file only knows how to read Carbon. Generation throws (the CLI exits 1 and writes nothing) when a token
// is missing from Carbon, a resolved value differs from the compiled CSS, a Sass fallback does not exist, or a
// Contract fails validation rule 6 against the generated document (a token used outside its variable's scopes).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closure, closureContracts, validate } from '../../contract/scripts/contract.mjs';
import { CARBON, DEFAULT_DIR, REPO_ROOT, fetchSources, hasSources, readSources, sha256, snapshotId } from './sources.mjs';

const MODES = [['white', 'White'], ['g10', 'Gray 10'], ['g90', 'Gray 90'], ['g100', 'Gray 100']]; // fixed; DTCG may add keys such as "fallback"
const LAYER_MODES = [['one', 'One'], ['two', 'Two'], ['three', 'Three']]; // Carbon's layer levels, in order (#109)
const SINGLE = [['default', 'Default']];
const COLLECTIONS = ['primitives', 'theme', 'layer', 'layout', 'type'];
// A Mode's selector (ADR 0012): the class that switches a subtree to it in the compiled CSS.
const themeSelector = mode => `.cds--${mode}`;
const layerSelector = mode => `.cds--layer-${mode}`;
const PACKAGES = ['@carbon/colors', '@carbon/layout', '@carbon/styles', '@carbon/themes', '@carbon/type'];
const FILE = {
  colors: 'packages/colors/src/dtcg/colors.json',
  layout: 'packages/layout/src/dtcg/layout.json',
  button: 'packages/themes/src/dtcg/components/button.json',
  layerSets: 'packages/styles/scss/layer/_layer-sets.scss',
  themes: 'packages/themes/src/dtcg/themes.json',
  fontFamily: 'packages/type/src/fontFamily.ts',
  fontWeight: 'packages/type/src/fontWeight.ts',
  scale: 'packages/type/src/scale.ts',
  styles: 'packages/type/src/styles.ts',
};
const ALPHA_REASON = 'alpha: a Figma alias cannot carry alpha, so this mode holds the flattened RGBA';
const HEX_REASON = 'DTCG colour object ({colorSpace, components, hex}), not a palette alias; its hex is kept exact';
const FLUID_REASON = 'viewport-relative: Figma has no vw unit, so this STRING holds the CSS text, for code and matching; it binds to nothing';
const DEPRECATED_REASON = 'deprecated in @carbon/layout ("replaced by the spacing scale, do not use in new work"); scopes [] keep it out of Figma\'s pickers';

// Component token files, by Component Family. A family's tokens are emitted only when the family has a Contract.
const COMPONENTS = { button: FILE.button };
// DTCG layout group -> [Figma group, scopes]. Figma has no PADDING scope; GAP covers padding and gap (#27).
// Fluid spacing is a STRING (no Figma unit for vw), bound by nothing. A deprecated token gets scopes [].
const LAYOUT_GROUP = {
  spacing: ['Spacing', ['GAP']],
  'fluid-spacing': ['Fluid spacing', []],
  container: ['Container', ['WIDTH_HEIGHT']],
  size: ['Size', ['WIDTH_HEIGHT']],
  'icon-size': ['Icon size', ['WIDTH_HEIGHT']],
  'border-radius': ['Border radius', ['CORNER_RADIUS']],
  layout: ['Layout', ['GAP']],
};
const FONT_STYLE = { 300: 'Light', 400: 'Regular', 600: 'SemiBold' }; // IBM Plex Sans, Mono and Serif style per weight
// Where the compiled @carbon/styles CSS, which is what Carbon ships and what codeSyntax names, differs from
// styles.ts at the pinned commit. The document takes the CSS value and says so; any other difference still fails.
const TYPE_CSS_DIFFERS = { 'expressive-heading-01-line-height': '1.42857', 'heading-07-line-height': '1.19' };

const fail = msg => { throw new Error(msg); };
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// Group label: first character upper, the rest lower ("icon-size" -> "Icon size", as the schema names it).
const title = s => { const t = s.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); };
// A number in %g style: 6 significant digits, no trailing zeros (0.3, 0.875, 1.28572).
const formatG = x => String(Number(x.toPrecision(6)));

// ---------- reading Carbon ----------

/** themes.json and components/*.json: flat name = path joined with "-" (button > danger-hover). */
function flattenTheme(doc, file) {
  const out = {};
  (function walk(node, path) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    if ('$extensions' in node && path.length) out[path.join('-')] = { node, source: `${file}#/${path.join('/')}`, group: path[0] };
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) walk(v, [...path, k]);
  })(doc, []);
  return out;
}

/** layout.json: the leaf key already carries the full name (spacing > spacing-05). */
function flattenLayout(doc) {
  const out = {};
  for (const [group, members] of Object.entries(doc)) {
    if (group.startsWith('$')) continue;
    for (const [key, node] of Object.entries(members))
      if (!key.startsWith('$') && node && typeof node === 'object' && '$value' in node)
        out[key] = { group, node, source: `${FILE.layout}#/${group}/${key}` };
  }
  return out;
}

/** colors.json: white, blue > 60, blue > 60Hover -> keys white, blue.60, blue.60Hover. */
function palette(doc) {
  const out = {};
  const hex = (key, v) => {
    if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) fail(`palette ${key}: cannot read ${JSON.stringify(v)} as a 6-digit hex`);
    out[key] = v.toLowerCase();
  };
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith('$')) continue;
    if ('$value' in v) hex(k, v.$value);
    else for (const [step, node] of Object.entries(v)) if (!step.startsWith('$')) hex(`${k}.${step}`, node.$value);
  }
  return out;
}

/**
 * _layer-sets.scss: each layer set's Theme tokens, level one first. Level n takes the nth token, so
 * border-subtle, which lists -00 to -03, is border-subtle-00 at level one (as the compiled .cds--layer-one has it).
 */
function layerSets(text) {
  const map = /\$-default-layer-sets:\s*\(([\s\S]*?)\n\);/.exec(text);
  if (!map) fail(`${FILE.layerSets}: cannot find $-default-layer-sets`);
  const out = {};
  for (const m of map[1].matchAll(/^\s*([a-z0-9-]+):\s*\(([^)]*)\)/gm)) {
    const tokens = [...m[2].matchAll(/theme\.\$([a-z0-9-]+)/g)].map(t => t[1]);
    if (tokens.length < LAYER_MODES.length)
      fail(`${FILE.layerSets}: layer set ${m[1]} lists ${tokens.length} Theme tokens, fewer than the ${LAYER_MODES.length} layers`);
    out[m[1]] = tokens;
  }
  if (!Object.keys(out).length) fail(`${FILE.layerSets}: no layer sets read`);
  return out;
}

// "{blue.60Hover}" -> "blue.60Hover"; "{white.default}" -> "white" (themes reference the generated palette).
const paletteKey = ref => ref.replace(/^\{|\}$/g, '').replace(/\.default$/, '');
const primitiveName = key => {
  if (!key.includes('.')) return `Neutral/${title(key)}`;
  const [hue, step] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
  return `${title(hue)}/${step}`;
};
const rgbaCss = (hex, alpha) => {
  const [r, gr, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${gr}, ${b}, ${formatG(alpha)})`;
};

function layoutPx(name, node) {
  const v = node.$value;
  const conv = ((node.$extensions || {})['carbon.layout'] || {}).converter;
  const unit = typeof v === 'string' && /^(\d+(?:\.\d+)?)(rem|px)$/.exec(v);
  if (conv === 'miniUnits' && Number.isFinite(v)) return [v * 8, `${formatG(v)} miniUnits x 8`];
  if (conv === 'rem' && Number.isFinite(v)) return [v, `${formatG(v)}px (rem converter)`];
  if (!conv && unit && unit[2] === 'rem') return [parseFloat(unit[1]) * 16, `${v} x 16`];
  if (!conv && unit) return [parseFloat(unit[1]), v];
  fail(`layout token ${name}: cannot read ${JSON.stringify(v)}${conv ? ` with the ${conv} converter` : ''}`);
}

// @carbon/type has no DTCG file: read the TypeScript exports. Only these forms are understood: `export const
// x = <literal or identifier>;`, and style objects whose top-level fields are fontFamily (a fontFamily.ts
// export), fontSize (rem(scaleNN)), fontWeight (a fontWeight.ts export), lineHeight (a number), letterSpacing
// (a number or px(n)) and breakpoints (ignored: a Figma Text Style has one value per field, so fluid styles keep
// their base values). Anything else fails, naming the export, rather than being guessed.
function typeSource(files) {
  const consts = text => {
    const out = {};
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^export const (\w+) =\s*([^;]*);/gm)) out[m[1]] = m[2].trim();
    return out;
  };
  const scale = consts(files[FILE.scale]);
  const weight = consts(files[FILE.fontWeight]);
  const styles = consts(files[FILE.styles]);
  const stacks = consts(files[FILE.fontFamily]);
  const firstFamily = key => {
    const m = stacks[key] && /^"'([^']+)'/.exec(stacks[key]);
    return m ? m[1] : fail(`${FILE.fontFamily}: cannot read the first family of \`${key}\``);
  };
  const num = (expr, at) => (/^-?\d+(\.\d+)?$/.test(expr) ? Number(expr) : fail(`${at}: "${expr}" is not a number`));
  // bodyCompact01 -> body-compact-01, helperText01 -> helper-text-01
  const kebab = id => id.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([a-zA-Z])(\d)/g, '$1-$2').toLowerCase();
  // An object's top-level `key: value` pairs, split on commas outside nested braces.
  const topFields = body => {
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of body) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return Object.fromEntries(parts.map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.indexOf(':');
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }));
  };

  // A style object is named by the current alias that points at it (bodyCompact01 = bodyShort01), else by itself.
  const current = {};
  for (const [id, expr] of Object.entries(styles)) {
    if (!/^\w+$/.test(expr)) continue;
    if (!(styles[expr] || '').startsWith('{')) fail(`${FILE.styles}#${id}: alias of ${expr}, which is not a style object`);
    if (current[expr]) fail(`${FILE.styles}#${expr}: aliased by both ${current[expr]} and ${id}`);
    current[expr] = id;
  }
  const out = {};
  for (const [target, expr] of Object.entries(styles)) {
    if (/^\w+$/.test(expr)) continue;
    const at = `${FILE.styles}#${target}`;
    const body = /^\{([\s\S]*)\}$/.exec(expr);
    if (!body) fail(`${at}: not an object literal`);
    const fields = topFields(body[1]);
    const unread = Object.keys(fields).filter(k => !['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'breakpoints'].includes(k));
    if (unread.length) fail(`${at}: field ${unread.join(', ')} is not one the Adapter reads`);
    for (const k of ['fontSize', 'lineHeight', 'letterSpacing']) if (!(k in fields)) fail(`${at}: no ${k}`);
    const family = fields.fontFamily || 'sans';
    if (!stacks[family]) fail(`${at}: fontFamily "${family}" is not a fontFamily.ts export`);
    const size = /^rem\((scale\d+)\)$/.exec(fields.fontSize);
    if (!size || !scale[size[1]]) fail(`${at}: fontSize "${fields.fontSize}" is not rem(scaleNN)`);
    // helperText01/02 set no fontWeight: they inherit the form item's regular (#90)
    const inherited = !('fontWeight' in fields);
    const weightKey = inherited ? 'regular' : fields.fontWeight;
    if (!weight[weightKey]) fail(`${at}: fontWeight "${weightKey}" is not a fontWeight.ts export`);
    const ls = /^px\((.+)\)$/.exec(fields.letterSpacing);
    const id = current[target] || target;
    out[kebab(id)] = {
      source: `${at}${target === id ? '' : ` (${id} = ${target})`}`,
      family, fontFamily: firstFamily(family),
      fontSize: num(scale[size[1]], at), fontSizeFrom: `rem(${size[1]}), ${size[1]} = ${scale[size[1]]}`,
      fontWeight: num(weight[weightKey], at), inherited,
      fontWeightFrom: inherited ? 'not set in styles.ts; inherits regular from the form item' : `fontWeight.ts ${weightKey}`,
      lineHeight: num(fields.lineHeight, at),
      letterSpacing: ls ? num(ls[1], at) : num(fields.letterSpacing, at),
      fluid: 'breakpoints' in fields,
    };
  }
  return { styles: out, firstFamily };
}

// ---------- compiled CSS ----------

// `blocks`: the custom properties each Mode selector (.cds--white, .cds--layer-two) declares, by selector.
function cssIndex(css) {
  const blocks = {};
  const selectors = new Set([...MODES.map(([m]) => themeSelector(m)), ...LAYER_MODES.map(([m]) => layerSelector(m))]);
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (selectors.has(sel))
      blocks[sel] = Object.fromEntries([...m[2].matchAll(/--cds-([a-z0-9-]+):\s*([^;]+)/g)].map(p => [p[1], p[2]]));
  }
  const unmatched = [...selectors].filter(s => !blocks[s]);
  if (unmatched.length) fail(`Mode selectors with no rule in the compiled CSS: ${unmatched.join(', ')}`);
  const props = new Set([...css.matchAll(/--cds-([a-z0-9-]+):/g)].map(m => m[1]));
  const first = name => { const m = new RegExp(`--cds-${name}:\\s*([^;]+)`).exec(css); return m ? m[1].trim() : null; };
  return { blocks, props, first };
}

// ---------- generate ----------

/**
 * Generate the Carbon foundations document.
 * @param sources   readSources() output: the pinned Carbon files and the compiled CSS / layout Sass.
 * @param contracts [{path, contract}]: every Contract of the Design System; `path` is relative to the repo root.
 * @returns {doc, text, documentHash, summary}. Throws on any failed check (see the header).
 */
export function generate({ sources, contracts }) {
  if (!contracts.length) fail('no Contracts: the foundations document is derived from at least one Contract');
  for (const { path, contract } of contracts) {
    const structural = validate(contract, { variables: {}, textStyles: {} }).errors.filter(e => e.rule === 'schema' || e.rule === 3);
    if (structural.length) fail(`Contract ${path}: ${structural.map(e => `rule ${e.rule} at ${e.at}: ${e.message}`).join('; ')}`);
  }
  const commits = [...new Set(contracts.map(c => c.contract.source.commit))];
  if (commits.length !== 1) fail(`Contracts pin different commits ${commits.join(', ')}; one Code Library version per foundations document`);
  if (commits[0] !== sources.commit) fail(`Contracts pin commit ${commits[0]} but the sources are commit ${sources.commit}`);
  const src0 = contracts[0].contract.source;
  for (const [name, pin] of Object.entries(CARBON.packages))
    if (src0.packages[name] !== pin.version) fail(`Contracts pin ${name}@${src0.packages[name]} but the checks read ${name}@${pin.version}`);

  // 1. the token union, from the shared module's closure
  const usedBy = {};
  for (const { contract } of contracts)
    for (const t of closure(contract)) (usedBy[t] = usedBy[t] || new Set()).add(contract.family.key);
  const tokens = Object.keys(usedBy).sort(byKey);
  const users = t => [...(usedBy[t] || [])].sort(byKey);

  const files = sources.files;
  const families = new Set(contracts.map(c => c.contract.family.key));
  const comps = {};
  for (const [family, file] of Object.entries(COMPONENTS)) {
    if (!families.has(family)) continue;
    for (const [k, e] of Object.entries(flattenTheme(JSON.parse(files[file]), file))) comps[k] = { ...e, family };
  }
  const themes = flattenTheme(JSON.parse(files[FILE.themes]), FILE.themes);
  const definedTwice = Object.keys(comps).filter(k => k in themes);
  if (definedTwice.length) fail(`tokens in both themes.json and a component file: ${definedTwice.join(', ')}`);
  const layout = flattenLayout(JSON.parse(files[FILE.layout]));
  const pal = palette(JSON.parse(files[FILE.colors]));
  const sets = layerSets(files[FILE.layerSets]);
  const type = typeSource(files);
  const css = cssIndex(sources.css.text);

  const variables = {};
  const textStyles = {};
  const notes = [];
  const checks = { css: 0, cssMissing: [], cssDiffers: [], sass: 0 };

  const codeSyntax = name => {
    if (css.props.has(name)) return { WEB: `var(--cds-${name})` };
    const sass = `$${name}`;
    if (!new RegExp(`^\\$${name}:`, 'm').test(sources.layoutScss.text)) fail(`Sass fallback ${sass} not found in @carbon/layout scss/generated`);
    checks.sass++;
    notes.push({ level: 'info', at: `variables.${name}.codeSyntax`,
      message: `No --cds-${name} custom property in compiled @carbon/styles; codeSyntax uses the Sass name ${sass}.` });
    return { WEB: sass };
  };

  // every closure token must be something Carbon defines
  const unknown = tokens.filter(t => !comps[t] && !themes[t] && !sets[t] && !layout[t] && !type.styles[t]);
  if (unknown.length) fail(`tokens not found in the Carbon sources: ${unknown.join(', ')}`);

  // 2. Theme: every themes.json token, and the component tokens of each family that has a Contract
  for (const name of [...Object.keys(themes), ...Object.keys(comps)].sort(byKey)) {
    const { node, source, group, family } = comps[name] || themes[name];
    const mods = (node.$extensions['org.carbon'] || {}).alphaModifiers || {};
    const values = {};
    for (const [mode] of MODES) {
      let v = (node.$extensions['carbon.themes'] || {})[mode];
      let alpha = mods[mode];
      if (v && typeof v === 'object' && 'hex' in v) {
        if (typeof v.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.hex)) fail(`${name}/${mode}: cannot read the colour object ${JSON.stringify(v)} in ${source}`);
        const hex = v.hex.toLowerCase();
        values[mode] = { value: hex, resolved: hex, level: 'info', reason: HEX_REASON };
      } else {
        if (v && typeof v === 'object') [v, alpha] = [v.value, v.alpha];
        if (typeof v !== 'string') fail(`${name}/${mode}: cannot read the carbon.themes value ${JSON.stringify((node.$extensions['carbon.themes'] || {})[mode])} in ${source}`);
        if (v.startsWith('{')) {
          const key = paletteKey(v);
          if (!(key in pal)) fail(`${name}/${mode}: palette ${key} missing`);
          if (alpha === undefined) values[mode] = { alias: key, resolved: pal[key] };
          else values[mode] = { raw: pal[key], alpha, resolved: rgbaCss(pal[key], alpha), from: { alias: key, alpha }, level: 'info', reason: ALPHA_REASON };
        } else {
          if (!/^#[0-9a-f]{6}$/i.test(v)) fail(`${name}/${mode}: cannot read the literal "${v}" in ${source}`);
          const lit = v.toLowerCase();
          const near = Object.keys(pal).filter(k => Math.abs(parseInt(pal[k].slice(1), 16) - parseInt(lit.slice(1), 16)) <= 2);
          values[mode] = { value: lit, resolved: lit, level: 'info',
            reason: `DTCG literal, not a palette alias; kept exact (nearest primitive ${near.map(k => `${k} ${pal[k]}`).join(', ') || 'none'} differs)` };
        }
      }
      const cssV = css.blocks[themeSelector(mode)][name];
      if (cssV === undefined) checks.cssMissing.push(`${name}/${mode}`);
      else if (cssV.trim().toLowerCase() !== values[mode].resolved) fail(`CSS mismatch ${name}/${mode}: document ${values[mode].resolved}, CSS ${cssV}`);
      else checks.css++;
    }
    variables[name] = { collection: 'theme', name: `${title(group)}/${name}`, type: 'COLOR', source,
      scopes: themeScopes(group, name), codeSyntax: codeSyntax(name), values, usedBy: users(name), ...(family ? { family } : {}) };
  }

  // 3. Layer (#109): one variable per layer set, named as Carbon's CSS names it (field, not field-01). Each mode
  // aliases the Theme token of its level, so the value follows the Theme mode too; there is no single resolved
  // value. The compiled .cds--layer-<mode> rule must point --cds-<set> at the same token, with its White value
  // as the fallback.
  for (const name of Object.keys(sets).sort(byKey)) {
    const values = {};
    LAYER_MODES.forEach(([mode], level) => {
      const target = sets[name][level];
      const t = variables[target];
      if (!t || t.collection !== 'theme') fail(`layer set ${name}/${mode}: ${target} is not a Theme token`);
      const decl = (css.blocks[layerSelector(mode)][name] || '').trim();
      const m = /^var\(--cds-([a-z0-9-]+),\s*(.+)\)$/.exec(decl);
      if (!m || m[1] !== target || m[2].trim().toLowerCase() !== t.values.white.resolved)
        fail(`CSS mismatch ${name}/${mode}: document ${target} (white ${t.values.white.resolved}), CSS ${decl || 'none'}`);
      checks.css++;
      values[mode] = { alias: target };
    });
    const first = variables[sets[name][0]];
    variables[name] = { collection: 'layer', name: `${first.name.split('/')[0]}/${name}`, type: 'COLOR', source: `${FILE.layerSets}#${name}`,
      scopes: first.scopes, codeSyntax: codeSyntax(name), values, usedBy: users(name) };
  }

  // 4. Layout: every layout.json group
  for (const name of Object.keys(layout).sort(byKey)) {
    const { group, node, source } = layout[name];
    if (!LAYOUT_GROUP[group]) fail(`layout token ${name}: group ${group} has no Figma mapping`);
    const [figGroup, groupScopes] = LAYOUT_GROUP[group];
    const emitted = css.first(name); // spacing-* and fluid-spacing-* are emitted; the other groups are Sass-only
    if (group === 'fluid-spacing') {
      const v = node.$value;
      if (typeof v !== 'string' || !/^(0|\d+(\.\d+)?vw)$/.test(v)) fail(`layout token ${name}: cannot read the fluid value ${JSON.stringify(v)}`);
      if (emitted !== v) fail(`CSS mismatch ${name}: document ${v}, CSS ${emitted}`);
      checks.css++;
      variables[name] = { collection: 'layout', name: `${figGroup}/${name}`, type: 'STRING', source, scopes: groupScopes,
        codeSyntax: codeSyntax(name), values: { default: { value: v, from: 'layout.json $value, as CSS', level: 'info', reason: FLUID_REASON } }, usedBy: users(name) };
      continue;
    }
    const [px, how] = layoutPx(name, node);
    if (emitted !== null) {
      if (!emitted.endsWith('rem') || parseFloat(emitted) * 16 !== px) fail(`CSS mismatch ${name}: document ${px}px, CSS ${emitted}`);
      checks.css++;
    }
    const deprecated = ((node.$extensions || {})['carbon.layout'] || {}).deprecated === true;
    variables[name] = { collection: 'layout', name: `${figGroup}/${name}`, type: 'FLOAT', source, scopes: deprecated ? [] : groupScopes,
      codeSyntax: codeSyntax(name), values: { default: { value: px, from: how, ...(deprecated ? { level: 'info', reason: DEPRECATED_REASON } : {}) } }, usedBy: users(name) };
  }

  // 5. Primitives: the whole palette
  for (const key of Object.keys(pal).sort(byKey))
    variables[key] = { collection: 'primitives', name: primitiveName(key), type: 'COLOR',
      source: `${FILE.colors}#/${key.replace('.', '/')}`, scopes: [], hidden: true, values: { default: { value: pal[key] } } };

  // 6. Type variables and Text Styles: every style, one font-family variable per family they use
  const styleNames = Object.keys(type.styles).sort(byKey);
  for (const family of [...new Set(styleNames.map(s => type.styles[s].family))].sort(byKey)) {
    const fam = `font-family-${family}`;
    const familyStyles = styleNames.filter(s => type.styles[s].family === family);
    variables[fam] = { collection: 'type', name: `Font family/${fam}`, type: 'STRING', source: `${FILE.fontFamily}#${family}`,
      scopes: ['FONT_FAMILY'], codeSyntax: {},
      values: { default: { value: type.firstFamily(family), from: `first family of the ${family} stack` } },
      usedBy: [...new Set(familyStyles.flatMap(users))].sort(byKey) };
    notes.push({ level: 'info', at: `variables.${fam}.codeSyntax`, message: family === 'sans'
      ? 'Carbon emits no font-family custom property for body styles (they inherit); codeSyntax left empty.'
      : `Carbon emits the family per style (--cds-${familyStyles[0]}-font-family), not as one custom property; codeSyntax left empty.` });
  }
  for (const s of styleNames) {
    const t = type.styles[s];
    if (!FONT_STYLE[t.fontWeight]) fail(`${s}: no IBM Plex style for weight ${t.fontWeight}`);
    const fam = `font-family-${t.family}`;
    const famCss = css.first(`${s}-font-family`);
    if (famCss !== null) {
      const first = /^'([^']+)'/.exec(famCss);
      if (!first || first[1] !== t.fontFamily) fail(`CSS mismatch ${s}-font-family: document ${t.fontFamily}, CSS ${famCss}`);
      checks.css++;
    } else if (t.family !== 'sans') fail(`${s}: no --cds-${s}-font-family in the compiled CSS for its ${t.family} family`);

    let ratio = t.lineHeight;
    const lhName = `${s}-line-height`;
    if (lhName in TYPE_CSS_DIFFERS) {
      const lhCss = css.first(lhName);
      if (lhCss !== TYPE_CSS_DIFFERS[lhName] || lhCss === formatG(t.lineHeight))
        fail(`${lhName}: the recorded CSS difference (${TYPE_CSS_DIFFERS[lhName]}) no longer holds: CSS ${lhCss}, styles.ts ${t.lineHeight}`);
      ratio = Number(lhCss);
      checks.cssDiffers.push(lhName);
      notes.push({ level: 'warning', at: `variables.${lhName}`,
        message: `styles.ts (${t.source}) has lineHeight ${t.lineHeight}, but the compiled CSS emits ${lhCss}; the document takes the CSS.` });
    }
    const lhPx = Math.round(ratio * t.fontSize);
    const fields = [
      ['font-size', 'fontSize', t.fontSize, t.fontSizeFrom, ['FONT_SIZE'], `${formatG(t.fontSize / 16)}rem`],
      ['line-height', 'lineHeight', lhPx, `${ratio} x ${t.fontSize} = ${(ratio * t.fontSize).toFixed(4)}, rounded`, ['LINE_HEIGHT'], formatG(ratio)],
      ['font-weight', 'fontWeight', t.fontWeight, t.fontWeightFrom, ['FONT_WEIGHT'], String(t.fontWeight)],
      ['letter-spacing', 'letterSpacing', t.letterSpacing, 'px', ['LETTER_SPACING'], t.letterSpacing ? `${formatG(t.letterSpacing)}px` : '0'],
    ];
    const binds = { fontFamily: fam };
    const group = title(s.split('-')[0]);
    for (const [suffix, field, value, from, scopes, cssExpect] of fields) {
      const vname = `${s}-${suffix}`;
      const emitted = css.first(vname);
      if (field === 'fontWeight' && t.inherited && emitted === null) {
        notes.push({ level: 'info', at: `textStyles.${s}.fontWeight`,
          message: `styles.ts sets no fontWeight and the compiled CSS emits no --cds-${vname}: the style inherits regular (${t.fontWeight}) from the form item, so it has no font-weight variable.` });
        continue;
      }
      if (emitted !== cssExpect) fail(`CSS mismatch ${vname}: expected ${cssExpect}, CSS ${emitted}`);
      const differs = checks.cssDiffers.includes(vname);
      if (!differs) checks.css++;
      const extra = differs ? { level: 'warning', reason: `styles.ts has ${t.lineHeight}; the compiled CSS, which codeSyntax names, emits ${ratio}` }
        : field === 'fontWeight' && t.inherited ? { level: 'info', reason: `styles.ts sets no fontWeight; the style inherits regular, and the compiled CSS emits ${emitted}` } : {};
      variables[vname] = { collection: 'type', name: `${group}/${vname}`, type: 'FLOAT', source: t.source, scopes,
        codeSyntax: codeSyntax(vname), values: { default: { value, from, ...extra } }, usedBy: users(s) };
      binds[field] = vname;
    }
    textStyles[s] = { name: `${group}/${s}`, source: t.source, fontFamily: t.fontFamily, fontStyle: FONT_STYLE[t.fontWeight],
      fontSize: t.fontSize, lineHeight: { unit: 'PIXELS', value: lhPx }, fontWeight: t.fontWeight,
      letterSpacing: { unit: 'PIXELS', value: t.letterSpacing }, binds, usedBy: users(s) };
  }
  const fluid = styleNames.filter(s => type.styles[s].fluid);
  notes.push({ level: 'info', at: 'textStyles',
    message: `${fluid.length} fluid styles (${fluid.join(', ')}) carry their base values; their styles.ts breakpoints are ignored, because a Text Style has one value per field. The compiled CSS custom properties hold the same base values.` });

  // uniqueness: one flat-name namespace across variables and Text Styles; unique Figma names
  const clash = Object.keys(variables).filter(k => k in textStyles);
  if (clash.length) fail(`names used by both a variable and a Text Style: ${clash.join(', ')}`);
  const figmaNames = Object.values(variables).map(v => v.name);
  const dupes = figmaNames.filter((n, i) => figmaNames.indexOf(n) !== i);
  if (dupes.length) fail(`duplicate Figma variable names: ${dupes.join(', ')}`);

  const fileHashes = Object.fromEntries(Object.keys(sources.hashes).sort(byKey).map(p => [p, `sha256:${sources.hashes[p]}`]));
  const doc = {
    schemaVersion: 1,
    designSystem: { key: 'carbon', name: 'Carbon' },
    source: {
      codeLibrary: src0.codeLibrary, adapter: src0.adapter, repository: CARBON.repository, tag: CARBON.tag, commit: CARBON.commit,
      packages: Object.fromEntries(PACKAGES.map(p => [p, src0.packages[p]])),
      files: fileHashes,
      snapshotId: snapshotId(fileHashes),
    },
    closure: {
      contracts: closureContracts(contracts),
      tokens,
    },
    collections: [
      { key: 'primitives', name: 'Primitives', modes: SINGLE.map(([key, label]) => ({ key, label })), hidden: true },
      { key: 'theme', name: 'Theme', modes: MODES.map(([key, label]) => ({ key, label, selector: themeSelector(key) })) },
      { key: 'layer', name: 'Layer', modes: LAYER_MODES.map(([key, label]) => ({ key, label, selector: layerSelector(key) })) },
      { key: 'layout', name: 'Layout', modes: SINGLE.map(([key, label]) => ({ key, label })) },
      { key: 'type', name: 'Type', modes: SINGLE.map(([key, label]) => ({ key, label })) },
    ],
    variables: Object.fromEntries(Object.entries(variables).sort(([ka, a], [kb, b]) =>
      COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection) || byKey(ka, kb))),
    textStyles: Object.fromEntries(Object.entries(textStyles).sort(([a], [b]) => byKey(a, b))),
    checks: {
      css: { against: `@carbon/styles@${CARBON.packages['@carbon/styles'].version} css/styles.css`,
        sha256: `sha256:${sources.css.sha256}`, matched: checks.css, missing: checks.cssMissing, differs: [...checks.cssDiffers].sort(byKey) },
      sass: { against: `@carbon/layout@${CARBON.packages['@carbon/layout'].version} scss/generated`, matched: checks.sass },
      scopes: { by: 'skills/contract/scripts/contract.mjs validate, rule 6', contracts: contracts.length, errors: 0 },
    },
    notes: [...notes,
      { level: 'info', at: 'textStyles.*.binds', message: 'Type variables bind onto Text Styles through use_figma (verified in #27): weight 400 selects IBM Plex Sans Regular and px lineHeight and letterSpacing hold, so the text-node fallback is not used. letterSpacing reads back as float32 (0.16 -> 0.1599999964), so compare it with a tolerance.' },
      { level: 'info', at: 'variables.*-line-height', message: 'Carbon line heights are unitless (1.28572); Figma binds lineHeight in px, so the variable holds size x ratio rounded (18, 22). codeSyntax still names the unitless CSS property.' },
    ],
  };

  // 7. validation rule 6 against the generated document: every token exists and is used inside its
  // variable's scopes. Other rules (expectedCount, approval) are the Contract's business, not this step's.
  for (const { path, contract } of contracts) {
    const errors = validate(contract, doc).errors.filter(e => e.rule === 6 || e.rule === 'schema');
    if (errors.length) fail(`Contract ${path} fails validation rule 6 against the generated foundations:\n${errors.map(e => `  rule ${e.rule} at ${e.at}: ${e.message}`).join('\n')}`);
  }

  const text = JSON.stringify(doc, null, 2) + '\n';
  const counts = {};
  for (const v of Object.values(variables)) counts[v.collection] = (counts[v.collection] || 0) + 1;
  const summary = [
    `closure ${tokens.length} tokens from ${contracts.length} Contract(s); variables ${COLLECTIONS.map(c => `${c} ${counts[c] || 0}`).join(', ')}; text styles ${Object.keys(textStyles).length}`,
    `css matched ${checks.css}, missing ${checks.cssMissing.length}; sass fallbacks ${checks.sass}; every Contract passes rule 6 (tokens exist, used inside their scopes)`,
  ];
  return { doc, text, documentHash: `sha256:${sha256(text)}`, summary };
}

// Adapter rule (#9, widened by #19): Figma scopes for a Theme colour.
function themeScopes(group, name) {
  if (group === 'text') return ['SHAPE_FILL', 'TEXT_FILL']; // icons take currentColor = the text colour
  if (name === 'focus') return ['EFFECT_COLOR', 'STROKE_COLOR']; // focus ring inner shadow (#7)
  if (name === 'background') return ['ALL_FILLS', 'EFFECT_COLOR', 'STROKE_COLOR']; // gap-ring shadow (#7)
  return ['ALL_FILLS', 'STROKE_COLOR'];
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => (args.includes(flag) ? resolvePath(args[args.indexOf(flag) + 1]) : fallback);
  const contractsDir = opt('--contracts', join(REPO_ROOT, 'design-systems/carbon/contracts'));
  const sourcesDir = opt('--sources', DEFAULT_DIR);
  const out = opt('-o', join(REPO_ROOT, 'design-systems/carbon/carbon.foundations.json'));
  try {
    if (!hasSources(sourcesDir)) await fetchSources(sourcesDir);
    const contracts = readdirSync(contractsDir).filter(f => f.endsWith('.component.json')).sort(byKey).map(f => {
      const file = join(contractsDir, f);
      return { path: relative(REPO_ROOT, file).split('\\').join('/'), contract: JSON.parse(readFileSync(file, 'utf8')) };
    });
    const { text, documentHash, summary } = generate({ sources: readSources(sourcesDir), contracts });
    writeFileSync(out, text);
    console.log([...summary, `wrote ${relative(process.cwd(), out)} (${text.length} chars, documentHash ${documentHash})`, 'OK'].join('\n'));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
