#!/usr/bin/env node
// The Carbon Adapter's foundations step (#28): the Carbon foundations document, generated from the pinned
// Carbon sources plus the union of every Contract's token closure. Never edit its output by hand.
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
import { closure, validate } from '../../contract/scripts/contract.mjs';
import { CARBON, DEFAULT_DIR, REPO_ROOT, fetchSources, hasSources, readSources, sha256, snapshotId } from './sources.mjs';

const MODES = [['white', 'White'], ['g10', 'Gray 10'], ['g90', 'Gray 90'], ['g100', 'Gray 100']]; // fixed; DTCG may add keys such as "fallback"
const SINGLE = [['default', 'Default']];
const COLLECTIONS = ['primitives', 'theme', 'layout', 'type'];
const PACKAGES = ['@carbon/colors', '@carbon/layout', '@carbon/styles', '@carbon/themes', '@carbon/type'];
const FILE = {
  colors: 'packages/colors/src/dtcg/colors.json',
  layout: 'packages/layout/src/dtcg/layout.json',
  button: 'packages/themes/src/dtcg/components/button.json',
  themes: 'packages/themes/src/dtcg/themes.json',
  fontFamily: 'packages/type/src/fontFamily.ts',
  fontWeight: 'packages/type/src/fontWeight.ts',
  scale: 'packages/type/src/scale.ts',
  styles: 'packages/type/src/styles.ts',
};
const ALPHA_REASON = 'alpha: a Figma alias cannot carry alpha, so this mode holds the flattened RGBA';

// Layout groups carried whole, regardless of the closure: an owner can only bind a variable that exists, so
// the picker must offer the whole scale (#8 base loop). Colours, Type and Primitives stay closure-only until the
// document carries the whole theme (#108, ADR 0006); the document no longer records this list (#107).
const FULL_SCALES = ['size', 'spacing'];
// DTCG layout group -> [Figma group, scopes]. Figma has no PADDING scope; GAP covers padding and gap (#27).
const LAYOUT_GROUP = {
  spacing: ['Spacing', ['GAP']],
  size: ['Size', ['WIDTH_HEIGHT']],
  'icon-size': ['Icon size', ['WIDTH_HEIGHT']],
  'border-radius': ['Border radius', ['CORNER_RADIUS']],
};
const FONT_STYLE = { 300: 'Light', 400: 'Regular', 600: 'SemiBold' }; // IBM Plex Sans style per weight

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
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith('$')) continue;
    if ('$value' in v) out[k] = v.$value.toLowerCase();
    else for (const [step, node] of Object.entries(v)) if (!step.startsWith('$')) out[`${k}.${step}`] = node.$value.toLowerCase();
  }
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

function layoutPx(node) {
  const v = node.$value;
  const conv = ((node.$extensions || {})['carbon.layout'] || {}).converter;
  let px, how;
  if (conv === 'miniUnits') [px, how] = [v * 8, `${formatG(v)} miniUnits x 8`];
  else if (conv === 'rem') [px, how] = [v, `${formatG(v)}px (rem converter)`];
  else if (typeof v === 'string' && v.endsWith('rem')) [px, how] = [parseFloat(v) * 16, `${v} x 16`];
  else if (typeof v === 'string' && v.endsWith('px')) [px, how] = [parseFloat(v), v];
  else fail(`unknown layout unit ${JSON.stringify(node)}`);
  return [px, how];
}

// @carbon/type has no DTCG file: read the TypeScript exports. Only the forms the body styles use are
// understood (`export const x = <literal or identifier>;`, objects of rem(scaleNN) / identifier / number /
// px(n)); anything else fails rather than being guessed.
function typeSource(files) {
  const consts = text => {
    const out = {};
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^export const (\w+) =\s*([^;]*);/gm)) out[m[1]] = m[2].trim();
    return out;
  };
  const scale = consts(files[FILE.scale]);
  const weight = consts(files[FILE.fontWeight]);
  const styles = consts(files[FILE.styles]);
  const famStack = consts(files[FILE.fontFamily]).sans;
  const fam = famStack && /^"'([^']+)'/.exec(famStack);
  if (!fam) fail(`${FILE.fontFamily}: cannot read the first family of \`sans\``);
  const num = (expr, at) => (/^-?\d+(\.\d+)?$/.test(expr) ? Number(expr) : fail(`${at}: "${expr}" is not a number`));

  function style(token) {
    const id = token.replace(/-(\w)/g, (_, c) => c.toUpperCase()); // body-compact-01 -> bodyCompact01
    if (!styles[id]) return null;
    let target = id;
    if (/^\w+$/.test(styles[id])) target = styles[id]; // bodyCompact01 = bodyShort01
    const body = styles[target] && /^\{([\s\S]*)\}$/.exec(styles[target]);
    if (!body) fail(`${FILE.styles}#${target}: not an object literal`);
    const at = `${FILE.styles}#${target}`;
    const fields = Object.fromEntries(body[1].split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.indexOf(':');
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }));
    const known = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'];
    if (Object.keys(fields).sort().join() !== [...known].sort().join()) fail(`${at}: fields ${Object.keys(fields)} are not ${known}`);
    const size = /^rem\((scale\d+)\)$/.exec(fields.fontSize);
    if (!size || !scale[size[1]]) fail(`${at}: fontSize "${fields.fontSize}" is not rem(scaleNN)`);
    if (!weight[fields.fontWeight]) fail(`${at}: fontWeight "${fields.fontWeight}" is not a fontWeight.ts export`);
    const ls = /^px\((.+)\)$/.exec(fields.letterSpacing);
    return {
      source: `${at}${target === id ? '' : ` (${id} = ${target})`}`,
      fontFamily: fam[1],
      fontSize: num(scale[size[1]], at), fontSizeFrom: `rem(${size[1]}), ${size[1]} = ${scale[size[1]]}`,
      fontWeight: num(weight[fields.fontWeight], at), fontWeightFrom: `fontWeight.ts ${fields.fontWeight}`,
      lineHeight: num(fields.lineHeight, at),
      letterSpacing: ls ? num(ls[1], at) : num(fields.letterSpacing, at),
    };
  }
  return { style };
}

// ---------- compiled CSS ----------

function cssIndex(css) {
  const blocks = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    for (const [mode] of MODES)
      if (sel === `.cds--${mode}`)
        blocks[mode] = Object.fromEntries([...m[2].matchAll(/--cds-([a-z0-9-]+):\s*([^;]+)/g)].map(p => [p[1], p[2]]));
  }
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
  const comps = flattenTheme(JSON.parse(files[FILE.button]), FILE.button);
  const themes = flattenTheme(JSON.parse(files[FILE.themes]), FILE.themes);
  const layout = flattenLayout(JSON.parse(files[FILE.layout]));
  const pal = palette(JSON.parse(files[FILE.colors]));
  const type = typeSource(files);
  const css = cssIndex(sources.css.text);

  const variables = {};
  const textStyles = {};
  const notes = [];
  const checks = { css: 0, cssMissing: [], sass: 0 };
  const primitives = new Set();

  const codeSyntax = name => {
    if (css.props.has(name)) return { WEB: `var(--cds-${name})` };
    const sass = `$${name}`;
    if (!new RegExp(`^\\$${name}:`, 'm').test(sources.layoutScss.text)) fail(`Sass fallback ${sass} not found in @carbon/layout scss/generated`);
    checks.sass++;
    notes.push({ level: 'info', at: `variables.${name}.codeSyntax`,
      message: `No --cds-${name} custom property in compiled @carbon/styles; codeSyntax uses the Sass name ${sass}.` });
    return { WEB: sass };
  };

  // 2. Theme: theme and component colours in the closure
  const styleTokens = [];
  const unknown = [];
  for (const t of tokens) {
    if (comps[t] || themes[t] || layout[t]) continue;
    if (type.style(t)) styleTokens.push(t);
    else unknown.push(t);
  }
  if (unknown.length) fail(`tokens not found in the Carbon sources: ${unknown.join(', ')}`);

  for (const name of tokens.filter(t => comps[t] || themes[t])) {
    const { node, source, group } = comps[name] || themes[name];
    const mods = (node.$extensions['org.carbon'] || {}).alphaModifiers || {};
    const values = {};
    for (const [mode] of MODES) {
      let v = node.$extensions['carbon.themes'][mode];
      let alpha = mods[mode];
      if (v && typeof v === 'object') [v, alpha] = [v.value, v.alpha];
      if (typeof v !== 'string') fail(`${name}/${mode}: no carbon.themes value in ${source}`);
      if (v.startsWith('{')) {
        const key = paletteKey(v);
        if (!(key in pal)) fail(`${name}/${mode}: palette ${key} missing`);
        if (alpha === undefined) {
          values[mode] = { alias: key, resolved: pal[key] };
          primitives.add(key);
        } else {
          values[mode] = { raw: pal[key], alpha, resolved: rgbaCss(pal[key], alpha), from: { alias: key, alpha }, level: 'info', reason: ALPHA_REASON };
        }
      } else {
        const lit = v.toLowerCase();
        const near = Object.keys(pal).filter(k => Math.abs(parseInt(pal[k].slice(1), 16) - parseInt(lit.slice(1), 16)) <= 2);
        values[mode] = { value: lit, resolved: lit, level: 'info',
          reason: `DTCG literal, not a palette alias; kept exact (nearest primitive ${near.map(k => `${k} ${pal[k]}`).join(', ') || 'none'} differs)` };
      }
      const cssV = (css.blocks[mode] || {})[name];
      if (cssV === undefined) checks.cssMissing.push(`${name}/${mode}`);
      else if (cssV.trim().toLowerCase() !== values[mode].resolved) fail(`CSS mismatch ${name}/${mode}: document ${values[mode].resolved}, CSS ${cssV}`);
      else checks.css++;
    }
    variables[name] = { collection: 'theme', name: `${title(group)}/${name}`, type: 'COLOR', source,
      scopes: themeScopes(group, name), codeSyntax: codeSyntax(name), values, usedBy: users(name) };
  }

  // 3. Layout: full spacing and size scales plus closure tokens
  for (const name of Object.keys(layout).filter(t => usedBy[t] || FULL_SCALES.includes(layout[t].group)).sort(byKey)) {
    const { group, node, source } = layout[name];
    if (!LAYOUT_GROUP[group]) fail(`layout token ${name}: group ${group} has no Figma mapping`);
    const [figGroup, scopes] = LAYOUT_GROUP[group];
    const [px, how] = layoutPx(node);
    const emitted = css.first(name); // spacing-* is emitted as rem; size, icon-size and border-radius are Sass-only
    if (emitted !== null) {
      if (!emitted.endsWith('rem') || parseFloat(emitted) * 16 !== px) fail(`CSS mismatch ${name}: document ${px}px, CSS ${emitted}`);
      checks.css++;
    }
    variables[name] = { collection: 'layout', name: `${figGroup}/${name}`, type: 'FLOAT', source, scopes,
      codeSyntax: codeSyntax(name), values: { default: { value: px, from: how } }, usedBy: users(name) };
  }

  // 4. Primitives: only the palette entries some Theme mode aliases
  for (const key of [...primitives].sort(byKey))
    variables[key] = { collection: 'primitives', name: primitiveName(key), type: 'COLOR',
      source: `${FILE.colors}#/${key.replace('.', '/')}`, scopes: [], hidden: true, values: { default: { value: pal[key] } } };

  // 5. Type variables and Text Styles
  const fam = 'font-family-sans';
  if (styleTokens.length) {
    variables[fam] = { collection: 'type', name: `Font family/${fam}`, type: 'STRING', source: `${FILE.fontFamily}#sans`,
      scopes: ['FONT_FAMILY'], codeSyntax: {},
      values: { default: { value: type.style(styleTokens[0]).fontFamily, from: 'first family of the sans stack' } },
      usedBy: [...new Set(styleTokens.flatMap(users))].sort(byKey) };
    notes.push({ level: 'info', at: `variables.${fam}.codeSyntax`,
      message: 'Carbon emits no font-family custom property for body styles (they inherit); codeSyntax left empty.' });
  }
  for (const s of styleTokens) {
    const t = type.style(s);
    if (!FONT_STYLE[t.fontWeight]) fail(`${s}: no IBM Plex Sans style for weight ${t.fontWeight}`);
    const lhPx = Math.round(t.lineHeight * t.fontSize);
    const fields = [
      ['font-size', 'fontSize', t.fontSize, t.fontSizeFrom, ['FONT_SIZE'], `${formatG(t.fontSize / 16)}rem`],
      ['line-height', 'lineHeight', lhPx, `${t.lineHeight} x ${t.fontSize} = ${(t.lineHeight * t.fontSize).toFixed(4)}, rounded`, ['LINE_HEIGHT'], formatG(t.lineHeight)],
      ['font-weight', 'fontWeight', t.fontWeight, t.fontWeightFrom, ['FONT_WEIGHT'], String(t.fontWeight)],
      ['letter-spacing', 'letterSpacing', t.letterSpacing, 'px', ['LETTER_SPACING'], t.letterSpacing ? `${formatG(t.letterSpacing)}px` : '0'],
    ];
    const binds = { fontFamily: fam };
    const group = title(s.split('-')[0]);
    for (const [suffix, field, value, from, scopes, cssExpect] of fields) {
      const vname = `${s}-${suffix}`;
      const emitted = css.first(vname);
      if (emitted !== cssExpect) fail(`CSS mismatch ${vname}: expected ${cssExpect}, CSS ${emitted}`);
      checks.css++;
      variables[vname] = { collection: 'type', name: `${group}/${vname}`, type: 'FLOAT', source: t.source, scopes,
        codeSyntax: codeSyntax(vname), values: { default: { value, from } }, usedBy: users(s) };
      binds[field] = vname;
    }
    textStyles[s] = { name: `${group}/${s}`, source: t.source, fontFamily: t.fontFamily, fontStyle: FONT_STYLE[t.fontWeight],
      fontSize: t.fontSize, lineHeight: { unit: 'PIXELS', value: lhPx }, fontWeight: t.fontWeight,
      letterSpacing: { unit: 'PIXELS', value: t.letterSpacing }, binds, usedBy: users(s) };
  }

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
      contracts: contracts.map(({ path, contract }) => ({ family: contract.family.key, path, snapshotId: contract.source.snapshotId }))
        .sort((a, b) => byKey(a.family, b.family)),
      tokens,
    },
    collections: [
      { key: 'primitives', name: 'Primitives', modes: SINGLE.map(([key, label]) => ({ key, label })), hidden: true },
      { key: 'theme', name: 'Theme', modes: MODES.map(([key, label]) => ({ key, label })) },
      { key: 'layout', name: 'Layout', modes: SINGLE.map(([key, label]) => ({ key, label })) },
      { key: 'type', name: 'Type', modes: SINGLE.map(([key, label]) => ({ key, label })) },
    ],
    variables: Object.fromEntries(Object.entries(variables).sort(([ka, a], [kb, b]) =>
      COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection) || byKey(ka, kb))),
    textStyles,
    checks: {
      css: { against: `@carbon/styles@${CARBON.packages['@carbon/styles'].version} css/styles.css`,
        sha256: `sha256:${sources.css.sha256}`, matched: checks.css, missing: checks.cssMissing },
      sass: { against: `@carbon/layout@${CARBON.packages['@carbon/layout'].version} scss/generated`, matched: checks.sass },
      scopes: { by: 'skills/contract/scripts/contract.mjs validate, rule 6', contracts: contracts.length, errors: 0 },
    },
    notes: [...notes,
      { level: 'info', at: 'textStyles.*.binds', message: 'Type variables bind onto Text Styles through use_figma (verified in #27): weight 400 selects IBM Plex Sans Regular and px lineHeight and letterSpacing hold, so the text-node fallback is not used. letterSpacing reads back as float32 (0.16 -> 0.1599999964), so compare it with a tolerance.' },
      { level: 'info', at: 'variables.*-line-height', message: 'Carbon line heights are unitless (1.28572); Figma binds lineHeight in px, so the variable holds size x ratio rounded (18, 22). codeSyntax still names the unitless CSS property.' },
    ],
  };

  // 6. validation rule 6 against the generated document: every token exists and is used inside its
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
