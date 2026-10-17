#!/usr/bin/env node
// The Generic Adapter's foundations step (#118): a shadcn/ui project's Foundations document, read exactly from its
// global CSS. Never edit its output by hand.
//
//   node skills/adapter-generic/scripts/foundations.mjs [--project <dir>] [--tools <dir>] [--family <key>]... [-o <file>]
//
// Defaults: the committed fixture project (sources.mjs FIXTURE), tools in .scratch/adapter-generic/tools (fetched
// on first use), every family with a committed Contract in design-systems/shadcn/contracts, output
// design-systems/shadcn/shadcn.foundations.json. Two runs are byte-identical. The schema is
// skills/contract/references/foundations-schema.md.
//
// One run writes both (#70 §1, #120): after the Code Library tokens, each family's Synthesized tokens are re-derived
// from its source (components.mjs readFamily) and added, its file joins the snapshot, and its Contract is built
// against the result to fill the closure, usedBy and the scope check.
//
// What it reads: `components.json` (which CSS file), that CSS, and `package-lock.json` (which versions the project
// resolves). In the CSS: the custom properties of each mode selector (MODES), then `@theme` / `@theme inline`,
// whose keys give each value its role (ROLES). Every colour goes through the shared converter (color.mjs), and
// every variable's codeSyntax is what Tailwind's own compiler emits for its utility, so the compiled CSS is also
// the cross-check. Generation throws (the CLI exits 1 and writes nothing) on a colour the converter cannot read,
// a non-colour value that differs by mode, a reference no mode declares, a compiled value that disagrees, anything
// the component step refuses for a family, a Synthesized name two families both derive, or a Contract that fails
// validate against the document.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closure } from '../../contract/scripts/contract.mjs';
import { contractFor, readFamily } from './components.mjs';
import { DEFAULT_DIR, FIXTURE, REPO_ROOT, STYLESHEETS, TOOLS, fetchTools, hasTools, sha256, snapshotId, toolDir } from './sources.mjs';
import { build, utilityRule } from './tailwind.mjs';
import { evaluate, isSynthesized, lengthPx, literalForm, round } from './values.mjs';

// Mode selector -> mode. The first is the default; a mode that omits a property inherits the default's value.
const MODES = [[':root', 'light', 'Light'], ['.dark', 'dark', 'Dark']];
const COLLECTIONS = ['theme', 'layout'];
const CONTRACTS = 'design-systems/shadcn/contracts'; // where a family's Contract is committed, for the closure
// Role table: the `@theme` key prefix gives a token its Figma type, group, scopes and the utility that compiles it.
// In Tailwind every theme colour feeds bg-, text-, border-, ring- and shadow- utilities, so a colour may fill,
// stroke or colour an effect.
const ROLES = {
  color: { type: 'COLOR', scopes: ['ALL_FILLS', 'EFFECT_COLOR', 'STROKE_COLOR'], utility: k => `bg-${k}` },
  radius: { type: 'FLOAT', group: 'Radius', scopes: ['CORNER_RADIUS'], utility: k => `rounded-${k}` },
};
// Component tokens: a theme colour whose first name segment is a shadcn component family (schema `family`).
const FAMILIES = new Set(['sidebar', 'chart']);
// Tailwind's classic named spacing scale (#70 §3); a step is `spacing-<n>` with "." written "_".
const SPACING = ['0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16',
  '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96'];

const fail = msg => { throw new Error(msg); };
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const title = s => s.charAt(0).toUpperCase() + s.slice(1);
const isColour = text => /^(#|(rgba?|hsla?|oklab|oklch|color|color-mix)\(|(transparent|black|white)$)/i.test(text);

// ---------- reading CSS ----------

/** Top-level blocks of a stylesheet: [{prelude, decls: {name: value}}], custom properties only, comments removed. */
function blocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let depth = 0, start = 0, open = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ';' && depth === 0) start = i + 1; // a top-level statement such as @import
    else if (ch === '{') { if (depth++ === 0) open = i; }
    else if (ch === '}' && --depth === 0) {
      const body = text.slice(open + 1, i);
      const decls = {};
      if (body.indexOf('{') < 0)
        for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) decls[m[1]] = m[2].trim();
      out.push({ prelude: text.slice(start, open).trim(), decls });
      start = i + 1;
    }
  }
  return out;
}

/** A @theme value over one multiplier: var(--m), calc(var(--m) * k) -> {multiplier, factor}; a length -> {css}. */
function scaled(text, at) {
  let m = /^var\((--[\w-]+)\)$/.exec(text);
  if (m) return { multiplier: m[1], factor: 1 };
  m = /^calc\(\s*var\((--[\w-]+)\)\s*\*\s*(\d*\.?\d+)\s*\)$/.exec(text);
  if (m) return { multiplier: m[1], factor: parseFloat(m[2]) };
  lengthPx(text, at);
  return { css: text };
}

// ---------- generate ----------

/**
 * Generate the Foundations document of a shadcn/ui project.
 * @param project  the project folder (components.json at its root).
 * @param families the Component Family keys with a Contract: each adds its Synthesized tokens (#120), and its
 *                 Contract gives the closure, usedBy and the scope check (one run writes both, #70 §1).
 * @param drafts   agent-drafted values: none belong in a Foundations document (ADR 0010), so it must be empty.
 * @param tools    the pinned tools folder (sources.mjs).
 * @returns {doc, text, documentHash, summary}. Throws on any failed check (see the header).
 */
export async function generate({ project, families = [], drafts = [], tools = DEFAULT_DIR }) {
  if (drafts.length) fail('a Foundations document holds no Drafted values (ADR 0010); the component step reads drafts');
  const readText = rel => readFileSync(join(project, rel), 'utf8');
  const config = JSON.parse(readText('components.json'));
  const cssFile = config.tailwind && config.tailwind.css;
  if (!cssFile) fail('components.json names no tailwind.css');
  if (!existsSync(join(project, 'package-lock.json'))) fail('no package-lock.json: the Adapter reads resolved versions from it');
  const lock = JSON.parse(readText('package-lock.json'));
  for (const name of STYLESHEETS) {
    const got = (lock.packages[`node_modules/${name}`] || {}).version;
    if (got !== TOOLS[name].version) fail(`the project resolves ${name}@${got}, but the Adapter pins ${name}@${TOOLS[name].version}`);
  }
  const files = {};
  for (const f of ['components.json', cssFile, 'package-lock.json'].sort(byKey)) files[f] = `sha256:${sha256(readFileSync(join(project, f)))}`;
  const css = readText(cssFile);
  const notes = [];

  // 1. Modes: the custom properties of each mode selector. A later mode inherits what it does not declare.
  const all = blocks(css);
  const mode = MODES.map(([selector]) => Object.assign({}, ...all.filter(b => b.prelude === selector).map(b => b.decls)));
  for (const b of all)
    if (Object.keys(b.decls).length && !/^@theme\b/.test(b.prelude) && !MODES.some(([s]) => s === b.prelude))
      notes.push({ level: 'warning', at: `${cssFile} ${b.prelude}`, message: 'Declares custom properties under a selector that is not a Mode; not read.' });
  const value = (name, i) => (name in mode[i] ? mode[i][name] : mode[0][name]);
  const theme = {}; // @theme key -> {value, at}
  for (const b of all.filter(x => /^@theme\b/.test(x.prelude)))
    for (const [k, v] of Object.entries(b.decls)) theme[k] = { value: v, at: `${cssFile} ${b.prelude} ${k}` };

  MODES.slice(1).forEach(([selector], i) => {
    for (const name of Object.keys(mode[i + 1]).filter(n => !(n in mode[0])).sort(byKey))
      notes.push({ level: 'warning', at: `${cssFile} ${selector} ${name}`, message: `Declared in ${selector} but not in ${MODES[0][0]}; not read.` });
  });
  // Non-colour mode properties hold one value in every mode; they feed @theme steps (`--radius`).
  const env = {};
  for (const name of Object.keys(mode[0]).sort(byKey)) {
    if (MODES.some((_, i) => /^var\(/.test(value(name, i)))) fail(`${name} refers to another property; aliases between theme properties are not read yet`);
    if (isColour(mode[0][name])) continue;
    if (MODES.some((_, i) => value(name, i) !== mode[0][name])) fail(`${name} differs between modes; only colours may change by mode`);
    if (/^-?\d*\.?\d+(rem|px)$/.test(mode[0][name])) env[name] = lengthPx(mode[0][name], name);
    else notes.push({ level: 'warning', at: `${cssFile} ${MODES[0][0]} ${name}`, message: `Not a colour or a length (${mode[0][name]}); not read.` });
  }
  const twTheme = readFileSync(join(toolDir('tailwindcss', tools), 'theme.css'), 'utf8');
  const spacing = theme['--spacing']
    ? { text: theme['--spacing'].value, source: theme['--spacing'].at }
    : { text: /--spacing:\s*([^;]+);/.exec(twTheme)[1].trim(), source: `tailwindcss@${TOOLS.tailwindcss.version} theme.css --spacing` };
  env['--spacing'] = lengthPx(spacing.text, spacing.source);

  // 2. Theme: every colour a mode declares; its @theme role gives the scopes.
  const variables = {};
  const checks = { converted: 0 };
  const roles = {}; // mode property -> its @theme colour key
  for (const [k, t] of Object.entries(theme)) {
    const m = /^--color-([\w-]+)$/.exec(k);
    if (!m) continue;
    const ref = /^var\((--[\w-]+)\)$/.exec(t.value);
    if (!ref) { notes.push({ level: 'warning', at: t.at, message: `A literal @theme colour (${t.value}) is not carried yet.` }); continue; }
    if (!(ref[1] in mode[0])) fail(`${t.at} refers to ${ref[1]}, which no mode declares`);
    roles[ref[1]] = m[1];
  }
  for (const prop of Object.keys(mode[0]).filter(p => isColour(mode[0][p])).sort(byKey)) {
    const name = prop.slice(2);
    const values = {};
    MODES.forEach(([, key], i) => {
      const text = value(prop, i);
      try { values[key] = literalForm(text); } catch (e) { fail(`${prop} (${MODES[i][0]}): ${e.message}`); }
      checks.converted++;
    });
    const head = name.split('-')[0];
    const family = FAMILIES.has(head) ? head : undefined;
    const role = roles[prop];
    if (!role) notes.push({ level: 'info', at: `variables.${name}`, message: `No @theme --color-* refers to ${prop}; scoped as a colour by its value, codeSyntax not compiled.` });
    variables[name] = { collection: 'theme', name: `${family ? title(family) : 'Color'}/${name}`, type: 'COLOR',
      source: `${cssFile} ${MODES.map(m => m[0]).join(' ')} ${prop}`, scopes: ROLES.color.scopes.slice(),
      codeSyntax: { WEB: `var(${prop})` }, values, usedBy: [] };
    if (family) variables[name].family = family;
    if (role) variables[name].utility = ROLES.color.utility(role);
  }

  // 3. Layout: @theme radius steps over --radius, and the spacing scale over --spacing.
  for (const [k, t] of Object.entries(theme).sort(([a], [b]) => byKey(a, b))) {
    const m = /^--radius-([\w-]+)$/.exec(k);
    if (m) {
      const from = scaled(t.value, t.at);
      if (from.multiplier && !(from.multiplier in env)) fail(`${t.at} refers to ${from.multiplier}, which no mode declares as a length`);
      const px = from.multiplier ? round(env[from.multiplier] * from.factor) : lengthPx(from.css, t.at);
      const name = `radius-${m[1]}`;
      variables[name] = { collection: 'layout', name: `${ROLES.radius.group}/${name}`, type: 'FLOAT', source: t.at,
        scopes: ROLES.radius.scopes.slice(), codeSyntax: {}, values: { default: { value: px, from } }, usedBy: [],
        utility: ROLES.radius.utility(m[1]) };
    } else if (/^--font-/.test(k)) {
      notes.push({ level: 'info', at: t.at, message: `Font families are not carried: ${t.value} is set at runtime (next/font), not in the CSS.` });
    } else if (k !== '--spacing' && !/^--color-/.test(k)) {
      notes.push({ level: 'warning', at: t.at, message: 'No role in the skill\'s role table; not carried.' });
    }
  }
  for (const step of SPACING) {
    const name = `spacing-${step.replace('.', '_')}`;
    const factor = step === 'px' ? null : parseFloat(step);
    variables[name] = { collection: 'layout', name: `Spacing/${name}`, type: 'FLOAT', source: spacing.source,
      scopes: ['GAP', 'WIDTH_HEIGHT'], codeSyntax: {},
      values: { default: factor === null ? { value: 1, from: { css: '1px' } } : { value: round(env['--spacing'] * factor), from: { multiplier: '--spacing', factor } } },
      usedBy: [], utility: `p-${step}` };
  }

  // 4. Compile every utility with Tailwind: its declaration is the codeSyntax, and its px must equal the value.
  const compiled = await build(css, Object.values(variables).filter(v => v.utility).map(v => v.utility).sort(byKey), { base: join(project, cssFile, '..'), tools });
  checks.compiled = 0;
  for (const [name, v] of Object.entries(variables)) {
    if (!v.utility) continue;
    const rule = utilityRule(compiled, v.utility);
    const decl = rule && Object.values(rule)[0];
    if (!decl) fail(`${name}: Tailwind compiles no rule for ${v.utility}`);
    if (v.type === 'COLOR') {
      if (decl !== v.codeSyntax.WEB) fail(`${name}: ${v.utility} compiles to ${decl}, not ${v.codeSyntax.WEB}`);
    } else {
      const px = evaluate(decl, env, `${name} (${v.utility})`);
      if (px !== v.values.default.value) fail(`${name}: ${v.utility} compiles to ${decl} = ${px}px, but the document holds ${v.values.default.value}px`);
      v.codeSyntax = { WEB: decl };
    }
    checks.compiled++;
    delete v.utility;
  }

  // uniqueness of Figma names
  const figmaNames = Object.values(variables).map(v => v.name);
  const dupes = figmaNames.filter((n, i) => figmaNames.indexOf(n) !== i);
  if (dupes.length) fail(`duplicate Figma variable names: ${dupes.join(', ')}`);

  const doc = {
    schemaVersion: 1,
    designSystem: { key: 'shadcn', name: 'shadcn/ui' },
    source: {
      codeLibrary: 'shadcn/ui', adapter: 'generic',
      packages: Object.fromEntries(STYLESHEETS.map(n => [n, TOOLS[n].version])),
      files, snapshotId: snapshotId(files),
    },
    closure: { contracts: [], tokens: [] },
    collections: [
      { key: 'theme', name: 'Theme', modes: MODES.map(([selector, key, label]) => ({ key, label, selector })) },
      { key: 'layout', name: 'Layout', modes: [{ key: 'default', label: 'Default' }] },
    ],
    variables: ordered(variables),
    textStyles: {},
    checks: {
      css: { against: cssFile, converted: checks.converted, by: 'skills/contract/scripts/color.mjs convert' },
      compiled: { against: `tailwindcss@${TOOLS.tailwindcss.version} compile() over ${cssFile}`, matched: checks.compiled },
    },
    notes: [...notes,
      { level: 'info', at: 'variables', message: 'Only the project\'s own CSS is read. Tailwind\'s default theme (its colour palette, fonts, shadows) is not carried.' },
      { level: 'info', at: `${cssFile} --spacing --radius`, message: 'Multipliers are not variables: each step records its multiplier and factor in `from` (#70 §3).' },
    ],
  };

  // 5. Each family with a Contract: its Synthesized tokens join the Theme after every Code Library token, its file
  //    joins `source.files`, and its Contract, built against the whole document, gives the closure and usedBy.
  const read = [];
  for (const family of [...new Set(families)].sort(byKey)) {
    const f = await readFamily({ project, family, foundations: doc, tools });
    for (const [k, v] of Object.entries(f.synthesized)) {
      if (variables[k]) fail(`the Synthesized token ${k} of ${family} is also synthesized for ${variables[k].family}`);
      variables[k] = v;
    }
    files[f.file] = f.files[f.file];
    read.push([family, f]);
  }
  if (read.length) {
    doc.source.files = Object.fromEntries(Object.keys(files).sort(byKey).map(f => [f, files[f]]));
    doc.source.snapshotId = snapshotId(doc.source.files);
    doc.variables = ordered(variables);
    const tokens = new Set();
    for (const [family, f] of read) {
      const contract = contractFor(f, family, doc);
      doc.closure.contracts.push({ family, path: `${CONTRACTS}/${family}.component.json`, snapshotId: contract.source.snapshotId });
      for (const t of closure(contract)) {
        tokens.add(t);
        const v = doc.variables[t];
        if (v && !v.usedBy.includes(family)) v.usedBy.push(family); // a Synthesized token already names its family
      }
    }
    doc.closure.tokens = [...tokens].sort(byKey);
    // contractFor() throws on any validate error, rule 6 (scopes) among them, so a written document has none.
    doc.checks.scopes = { by: 'skills/contract/scripts/contract.mjs validate, rule 6', contracts: read.length, errors: 0 };
  }

  const text = JSON.stringify(doc, null, 2) + '\n';
  const counts = {};
  for (const v of Object.values(variables)) counts[v.collection] = (counts[v.collection] || 0) + 1;
  const summary = [
    `variables ${COLLECTIONS.map(c => `${c} ${counts[c] || 0}`).join(', ')}; modes ${MODES.map(m => `${m[1]} (${m[0]})`).join(', ')}`,
    `colours converted ${checks.converted}; utilities compiled and matched ${checks.compiled}`,
    ...read.map(([family, f]) => `${family}: ${Object.keys(f.synthesized).length} Synthesized tokens; closure ${doc.closure.tokens.length} tokens`),
  ];
  return { doc, text, documentHash: `sha256:${sha256(text)}`, summary };
}

/** Variables in document order: by collection; in Theme, Code Library tokens before Synthesized ones; then by name. */
function ordered(variables) {
  return Object.fromEntries(Object.entries(variables).sort(([ka, a], [kb, b]) =>
    COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection) || isSynthesized(a) - isSynthesized(b) || byKey(ka, kb)));
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => (args.includes(flag) ? resolvePath(args[args.indexOf(flag) + 1]) : fallback);
  const project = opt('--project', FIXTURE);
  const tools = opt('--tools', DEFAULT_DIR);
  const out = opt('-o', join(REPO_ROOT, 'design-systems/shadcn/shadcn.foundations.json'));
  // --family <key>, repeatable; by default every family with a committed Contract.
  const families = args.flatMap((a, i) => (a === '--family' ? [args[i + 1]] : []));
  if (!args.includes('--family') && existsSync(join(REPO_ROOT, CONTRACTS)))
    families.push(...readdirSync(join(REPO_ROOT, CONTRACTS)).map(f => /^(.+)\.component\.json$/.exec(f)).filter(Boolean).map(m => m[1]));
  try {
    if (families.some(f => !f || f.startsWith('-'))) throw new Error('--family needs a family key');
    if (!hasTools(tools)) await fetchTools(tools);
    const { text, documentHash, summary } = await generate({ project, families, tools });
    writeFileSync(out, text);
    console.log([...summary, `wrote ${relative(process.cwd(), out)} (${text.length} chars, documentHash ${documentHash})`, 'OK'].join('\n'));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
