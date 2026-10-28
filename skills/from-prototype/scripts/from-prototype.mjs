#!/usr/bin/env node
// From-Prototype (spec #343): one entry from a Prototype to Component Sets or a Handoff. Its check names the
// Prototype's kind and gives each output's verdict; its hand-over entry writes the publish copy of a signed-off
// Handoff's Rendering, which the agent publishes as a private Artifact.
//   node skills/from-prototype/scripts/from-prototype.mjs check <prototype> [--figma <url>] [--handoff] [--ds <ds>]
//        [--name <name>] [--all]
//   node skills/from-prototype/scripts/from-prototype.mjs hand-over <handoff.json> [--out <dir under .scratch/>]
//
// check exits 0 with the plan, 2 with the owner's questions, and 1 when an output it was asked for is refused or none
// is possible. hand-over exits 1 with its reason when it refuses, writing nothing.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, blocks, fontOf } from '../../adapter-generic/scripts/foundations.mjs';
import { cssEntry } from '../../adapter-generic/scripts/sources.mjs';
import { handoffContentHash } from '../../to-handoff/scripts/hash.mjs';
import { stampOf } from '../../to-handoff/scripts/render-html.mjs';
import { REPO_ROOT, inScratch } from '../../to-handoff/scripts/system.mjs';
import { fileKeyOf } from '../../vibe-to-figma/scripts/build.mjs';
import { stylesheets } from '../../vibe-to-figma/scripts/extract.mjs';
import { folderName } from '../../vibe-to-figma/scripts/folder.mjs';
import { files, utilitiesIn } from '../../vibe-to-figma/scripts/path.mjs';

// The Prototype kinds, ADR 0019's.
const SHADCN = 'React + Tailwind + shadcn';
const PATH_A = 'React + Tailwind, no Code Library';
const CLASSES = 'React + CSS or SCSS classes';
const MODULES = 'React + CSS modules or CSS-in-JS';
const HTML = 'plain HTML + CSS classes';
const HTML_UTILITIES = 'plain HTML styled by Tailwind or only style=""';
const OTHER = 'Vue, Svelte or Angular';
const NATIVE = 'native mobile';
const UNKNOWN = 'unknown';
const REACT = [SHADCN, PATH_A, CLASSES, MODULES];
const ADR = 'docs/adr/0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md';
const NOT_SUPPORTED = 'not supported (ADR 0019)';

const CODE = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs']);
const STYLES = new Set(['.css', '.scss', '.sass']);
const UI_FOLDERS = ['components/ui', 'src/components/ui', 'src/app/components/ui'];
const CSS_IN_JS = ['styled-components', '@emotion/styled', '@emotion/react', '@emotion/css', '@stitches/react', '@vanilla-extract/css', '@linaria/core', '@linaria/react', 'goober', 'styled-jsx'];
const MIN_UTILITIES = 3;

// What the check reads of a Prototype: file names, package.json and text, never a parser that has to be fetched.
function reading(prototype) {
  const given = existsSync(prototype) ? statSync(prototype) : null;
  const html = given?.isFile() && extname(prototype) === '.html' ? prototype : null;
  const root = given?.isFile() ? dirname(prototype) : prototype;
  const read = given?.isDirectory() || html; // a file given that is not HTML is read as nothing: unknown
  const all = read ? [...files(root)].map(f => relative(root, f)) : [];
  let pkg = null;
  if (read) try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { /* none, or not JSON */ }
  const declared = new Set(Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies, ...pkg?.peerDependencies }));
  const text = f => readFileSync(join(root, f), 'utf8');
  const code = all.filter(f => CODE.has(extname(f)) && !f.endsWith('.d.ts'));
  const imports = f => [...text(f).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
  return { prototype, given, html, root, all, pkg, declared, text, code, imports, has: (...ext) => all.some(f => ext.includes(extname(f))) };
}

// A components/ui/ folder counts when a source file outside it imports from it (#338): a relative specifier by path,
// `@/` or `~/` from the root or from src/, as Vite's alias and a tsconfig path map them.
function codeLibraryFolder(p) {
  for (const folder of UI_FOLDERS.filter(f => p.all.some(a => a.startsWith(f + sep)))) {
    const at = join(p.root, folder);
    const inside = path => path === at || path.startsWith(at + sep);
    const targets = (from, spec) => spec.startsWith('.') ? [resolve(dirname(join(p.root, from)), spec)]
      : /^[@~]\//.test(spec) ? [join(p.root, spec.slice(2)), join(p.root, 'src', spec.slice(2))] : [];
    if (p.code.some(f => !inside(join(p.root, f)) && p.imports(f).some(s => targets(f, s).some(inside)))) return folder + '/';
  }
  return null;
}

const tailwindDeclared = p => [...p.declared].some(d => d === 'tailwindcss' || d.startsWith('@tailwindcss/'));
const declaredOf = (p, names) => names.filter(n => p.declared.has(n));
const carbon = p => [...p.declared].filter(d => d.startsWith('@carbon/') || d.startsWith('carbon-components'));
const htmlFiles = p => p.html ? [basename(p.html)] : p.all.filter(f => extname(f) === '.html');

// The kind detector (spec #343 Kind detection): ordered rules, the first that finds evidence names the kind. It never
// refuses; refusing is the gate rows' job.
const KINDS = [
  { kind: NATIVE, evidence: p => [...declaredOf(p, ['react-native', 'expo']), ...p.all.filter(f => f === 'pubspec.yaml' || extname(f) === '.swift').slice(0, 1)] },
  { kind: OTHER, evidence: p => [...declaredOf(p, ['vue', 'nuxt', 'svelte', '@sveltejs/kit', '@angular/core']), ...p.all.filter(f => ['.vue', '.svelte'].includes(extname(f))).slice(0, 1)] },
  { kind: SHADCN, evidence: p => p.html ? [] : p.all.includes('components.json') ? ['components.json'] : [codeLibraryFolder(p)].filter(Boolean) },
  // The mixed kind keeps today's rule until #331: enough utilities make it path A, with a note (the `mixed` row).
  // Carbon first, as choosePath has it: a Carbon app is styled by Carbon's SCSS, whatever else its classNames hold.
  { kind: PATH_A, evidence: p => p.declared.has('react') && tailwindDeclared(p) && !carbon(p).length
    && new Set(p.code.flatMap(f => [...utilitiesIn(p.text(f))])).size >= MIN_UTILITIES ? ['tailwindcss', 'Tailwind utilities in className'] : [] },
  { kind: MODULES, evidence: p => !p.declared.has('react') ? [] : [...p.all.filter(f => /\.module\.s?css$/.test(f)),
    ...CSS_IN_JS.filter(pkg => p.code.some(f => p.imports(f).some(s => s === pkg || s.startsWith(pkg + '/'))))] },
  { kind: CLASSES, evidence: p => !p.declared.has('react') ? [] : [...carbon(p),
    ...p.all.filter(f => STYLES.has(extname(f)))].concat(p.has(...STYLES) ? [] : ['classNames with no Tailwind utilities']) },
  { kind: HTML_UTILITIES, evidence: p => {
    const pages = htmlFiles(p);
    const texts = pages.map(f => p.text(f)).join('\n');
    if (!pages.length || p.declared.has('react')) return [];
    if (/cdn\.tailwindcss\.com|@tailwindcss\/browser/.test(texts)) return [...pages, 'Tailwind from the CDN'];
    if (tailwindDeclared(p)) return [...pages, 'tailwindcss'];
    const styled = /\bstyle="/.test(texts) && !/\bclass="|<style|rel="stylesheet"/.test(texts);
    return styled ? [...pages, 'only style=""'] : [];
  } },
  { kind: HTML, evidence: p => !htmlFiles(p).length || p.declared.has('react') ? [] : [...htmlFiles(p),
    ...p.all.filter(f => STYLES.has(extname(f))), ...(p.pkg ? ['package.json lists no React'] : [])] },
  { kind: UNKNOWN, evidence: p => !p.given ? ['no such file or folder'] : p.given.isFile() && !p.html ? ['a file that is not HTML']
    : !p.all.length ? ['an empty folder']
    : [p.pkg ? 'a package.json with no React, Vue, Svelte or Angular' : 'no package.json and no HTML file'] },
];

// The framework, named beside the kind's own evidence.
const frameworks = p => [...declaredOf(p, ['next', 'vite']),
  ...(p.declared.has('@tanstack/react-start') && p.all.some(f => f.startsWith(`src${sep}routes${sep}__root.`)) ? ['TanStack Start'] : [])];

// Each output's gate rows, in order (spec #343 The gate table): name, the kinds it applies to, its test (passes when
// true; a row with none fails for every kind it names), its effect when it fails (a refusal unless `note`), its
// message, and the ticket it waits on. A gate ticket lands by adding or changing its own rows.
const COMPONENT_SETS = [
  { name: 'reader', kinds: [CLASSES], message: 'not yet: Component Sets for this kind are charted in map #310', ticket: '#310' },
  { name: 'reader', kinds: [HTML], message: 'not yet: there is no reader for plain HTML + CSS classes (spec #339)', ticket: '#339' },
  { name: 'reader', kinds: [HTML_UTILITIES], message: 'not decided yet' },
  { name: 'reader', kinds: [MODULES, OTHER], message: NOT_SUPPORTED },
  { name: 'reader', kinds: [NATIVE], message: 'out of scope' },
  { name: 'reader', kinds: [UNKNOWN], message: 'no reader for what was found' },
  { name: 'peer-react-or-found-library', kinds: [SHADCN, PATH_A], ticket: '#358',
    test: p => !peerOnlyReact(p) && (p.kind !== SHADCN || p.all.includes('components.json')),
    message: 'not yet: the readers need React outside `peerDependencies` and a `components.json` (#358)' },
  { name: 'mixed', kinds: [PATH_A], effect: 'note', ticket: '#331', test: p => !classStyled(p).length,
    message: p => `its own class-styled stylesheets (${classStyled(p).join(', ')}) are read as path A until #331 decides a React app that mixes them with Tailwind utilities` },
  { name: 'shadcn-theme', kinds: [SHADCN, PATH_A], ticket: '#360', test: p => !olderTheme(p).length,
    message: p => `not yet (#360): the Adapter reads shadcn's nova theme; this Prototype has the older form (${olderTheme(p).join('; ')})` },
  { name: 'text-style-font', kinds: [SHADCN, PATH_A], ticket: '#367', test: p => !unreadFont(p).length,
    message: p => `not yet (#367): the Adapter can't read the Prototype's font for its Text Styles (${unreadFont(p).join('; ')})` },
  { name: 'screens', kinds: [SHADCN], effect: 'note', ticket: '#350', test: p => !p.declared.has('wouter'),
    message: 'with wouter the default family list comes from one screen, and `--all` takes every file, until #350' },
  { name: 'screens', kinds: [SHADCN], ticket: '#361', test: p => !unreadRoutes(p).length,
    message: p => `only with \`--all\`: the screens can't be read until #361 (${unreadRoutes(p).join('; ')})` },
  { name: 'screens', kinds: REACT, effect: 'note', ticket: '#349', message: "a form's controls inside a render prop are not counted yet (#349)" },
  // Only when Component Sets are asked (#437). The agent's one read of the file through the owner's Figma connection is the
  // SKILL.md's step after the check: the check fetches nothing.
  { name: 'figma', kinds: KINDS.map(k => k.kind), test: p => !figmaRefusal(p), message: p => `the Figma link is refused: ${figmaRefusal(p)}` },
];
const HANDOFF = [
  { name: 'reader', kinds: [OTHER], message: NOT_SUPPORTED },
  { name: 'reader', kinds: [NATIVE], message: 'out of scope' },
  { name: 'reader', kinds: REACT, test: p => p.declared.has('next') || p.declared.has('vite'),
    message: 'no reader for this React setup: To-handoff reads Next.js App Router or Vite' },
  { name: 'reader', kinds: [UNKNOWN], message: 'no reader for what was found' },
];

function figmaRefusal(p) {
  if (p.options.figma === undefined) return null;
  try { fileKeyOf(p.options.figma); return null; } catch (e) { return e.message; }
}

// A stylesheet of the Prototype's own, with class rules and no Tailwind import.
const classStyled = p => p.all.filter(f => STYLES.has(extname(f)) && !/\.module\.s?css$/.test(f))
  .filter(f => { const css = p.text(f); return !/tailwindcss/.test(css) && /(?:^|[\s,}])\.[A-Za-z_][\w-]*[^{};]*\{/m.test(css); });

// React declared only in peerDependencies, as a Figma Make bundle declares it (#358).
const peerOnlyReact = p => !!p.pkg?.peerDependencies?.react && !p.pkg?.dependencies?.react && !p.pkg?.devDependencies?.react;

// The CSS entry the Adapter's Foundations read takes today: components.json's tailwind.css, else on path A the
// stylesheet extract.mjs takes. With it, the stylesheets it imports by relative path. None when there is no entry.
function themeSheets(p) {
  let entry;
  try { entry = p.all.includes('components.json') ? JSON.parse(p.text('components.json')).tailwind?.css : cssEntry(p.root); } catch { /* none */ }
  entry = entry && relative(p.root, join(p.root, entry));
  return entry && p.all.includes(entry) ? Object.keys(stylesheets(p.root, entry)) : [];
}

// The older shadcn theme (#360): its tokens only in a stylesheet the entry imports, or its radius scale written as
// `calc(var(--radius) - Npx)`.
function olderTheme(p) {
  const [entry, ...rest] = themeSheets(p);
  const tokens = f => blocks(p.text(f)).some(b => b.prelude === ':root' && Object.keys(b.decls).length);
  const elsewhere = entry && !tokens(entry) ? rest.filter(tokens) : [];
  return [...elsewhere.map(f => `tokens in ${f}, which ${entry} imports`),
    ...[entry, ...rest].filter(Boolean).flatMap(f => [...new Set(p.text(f).match(/calc\(\s*var\(--radius\)\s*[-+]\s*\d*\.?\d+px\s*\)/g) || [])].map(c => `\`${c}\` in ${f}`))];
}

// Where the Adapter's Foundations font read fails (#367): the entry's @theme has no --font-sans, or a --font-* `var()`
// that fontOf can't follow. Its next/font loaders are read as text, a `variable:` string each, since their parser is
// fetched; a loader names a family only when the layout imports next/font/google.
function unreadFont(p) {
  const [entry] = themeSheets(p);
  if (!entry) return [];
  const theme = {};
  for (const b of blocks(p.text(entry)).filter(x => /^@theme\b/.test(x.prelude)))
    for (const [k, value] of Object.entries(b.decls)) theme[k] = { value, at: `${entry} ${b.prelude} ${k}` };
  const layout = LAYOUTS.find(f => p.all.includes(f));
  const loaders = layout && /from\s*["']next\/font\//.test(p.text(layout)) ? [...p.text(layout).matchAll(/\bvariable\s*:\s*["'](--[\w-]+)["']/g)]
    .map(m => ({ variable: m[1], family: /from\s*["']next\/font\/google["']/.test(p.text(layout)) || null })) : [];
  const unread = k => { try { fontOf(k, theme, loaders, layout, entry, []); return null; } catch (e) { return e.message; } };
  return [...('--font-sans' in theme ? [] : [`${entry} declares no @theme --font-sans`]),
    ...Object.keys(theme).filter(k => /^--font-(?!weight-)[\w-]+$/.test(k)).map(unread).filter(Boolean)];
}

// The data routers the screens reader can't read yet (#361): a router a file renders but another file defines, and
// route objects that give `Component:`.
function unreadRoutes(p) {
  const routed = p.code.filter(f => p.imports(f).some(s => /^react-router(-dom|\/dom)?$/.test(s)));
  return [...routed.filter(f => /<RouterProvider\b/.test(p.text(f)) && !/\bcreate\w*Router\s*\(/.test(p.text(f))).map(f => `${f} renders a data router defined in another file`),
    ...routed.filter(f => /\bComponent\s*:\s*[A-Z]/.test(p.text(f))).map(f => `${f} gives \`Component:\` routes`)];
}

function verdictOf(table, p, yes) {
  const failing = table.filter(row => row.kinds.includes(p.kind) && !row.test?.(p))
    .map(row => ({ row: row.name, message: typeof row.message === 'function' ? row.message(p) : row.message, ticket: row.ticket, note: row.effect === 'note' }));
  const reasons = failing.filter(f => !f.note).map(({ note, ...r }) => r);
  return { verdict: reasons.length ? 'no' : yes, reasons, notes: failing.filter(f => f.note).map(f => f.message) };
}

const OUTPUTS = { componentSets: 'Component Sets', handoff: 'a Handoff' };
const SCRATCH_ROOT = '.scratch/design-systems';

/**
 * check(prototype, {figma, handoff, ds, name, all}) -> {kind, evidence, verdicts: {componentSets, handoff}, questions,
 * plan}: the Prototype's kind and the files that show it, each output's verdict ({verdict, reasons: [{row, message,
 * ticket}], notes}) from its gate rows, the owner's open questions ({id, question, options?}), and the plan, settled
 * only when no question is open and nothing asked is refused (spec #343 The check; Owner questions; The stages).
 * `prototype` is a folder, or for plain HTML one HTML file; `figma` (a link) asks for Component Sets and `handoff` for
 * a Handoff against the Design System `ds`. It reads file names, package.json and text; it writes nothing, fetches
 * nothing and loads no fetched parser.
 */
export function check(prototype, options = {}) {
  const p = reading(prototype);
  p.options = options;
  for (const { kind, evidence } of KINDS) {
    const found = evidence(p);
    if (found.length) { p.kind = kind; p.evidence = [...found, ...frameworks(p)]; break; }
  }
  const verdicts = {
    componentSets: verdictOf(COMPONENT_SETS, p, p.kind === SHADCN ? 'yes, by the shadcn path' : 'yes, by path A'),
    handoff: verdictOf(HANDOFF, p, 'yes'),
  };
  const asked = [options.figma !== undefined && 'componentSets', options.handoff && 'handoff'].filter(Boolean);
  const refused = asked.some(o => verdicts[o].verdict === 'no');
  const questions = refused ? [] : questionsOf(p, asked, verdicts);
  const plan = asked.length && !questions.length && !refused ? planOf(p, asked) : null;
  return { kind: p.kind, evidence: p.evidence, verdicts, questions, plan };
}

// The owner's questions (spec #343 Owner questions): with no output asked, one question offering only the outputs
// whose verdict is not "no", and the Design System question beside it when a Handoff is among them; a Handoff asked
// with no --ds asks its Design System. The Design System's default, the own-folder answer and the rerun rule are #438's.
function questionsOf(p, asked, verdicts) {
  const designSystem = { id: 'designSystem', question: 'Which Design System is the Handoff against?', options: designSystems() };
  if (!asked.length) {
    const possible = Object.keys(OUTPUTS).filter(o => verdicts[o].verdict !== 'no');
    const question = possible.length === 2 ? 'Which outputs should this run make: Component Sets, a Handoff, or both?'
      : `Should this run make ${OUTPUTS[possible[0]]}? It is the only output possible.`;
    return possible.length ? [{ id: 'outputs', question,
      options: possible.map(o => ({ output: o, verdict: verdicts[o].verdict, flag: o === 'handoff' ? '--handoff' : '--figma <url>' })) },
    ...(possible.includes('handoff') ? [designSystem] : [])] : [];
  }
  const questions = [];
  const own = ownFolder(p);
  if (asked.includes('handoff') && !p.options.ds) questions.push(designSystem);
  // The own folder named while Component Sets are "no": Vibe-to-Figma's folder step would refuse it (the own-folder row).
  if (asked.includes('handoff') && p.options.ds === own.name && verdicts.componentSets.verdict === 'no') {
    questions.push({ ...designSystem, question: `Which Design System is the Handoff against? Not \`${own.name}\`, this Prototype's own folder: it can't have Component Sets, so its own folder can't be made.` });
  }
  if (own.refused && asked.includes('componentSets')) questions.push({ id: 'name', question: `What is this Prototype's own folder called? ${own.refused}` });
  return questions;
}

// The Prototype's own folder (#320 D4, #324 D5): Vibe-to-Figma's folder name under the scratch root.
function ownFolder(p) {
  try { return { name: folderName(p.root, p.options.name) }; } catch (e) { return { refused: e.message }; }
}

// The ordered stages after the check (spec #343 The stages), each with its folder and Design System. Component Sets
// always come from the Prototype's own folder; a Handoff runs against --ds, which is the own folder when it names it.
function planOf(p, asked) {
  const { name: own } = ownFolder(p);
  const ds = p.options.ds;
  const stageAt = (stage, designSystem, extra) => ({ stage, folder: `${SCRATCH_ROOT}/${designSystem}`, designSystem, ...extra });
  const folderStep = asked.includes('componentSets') || ds === own;
  const stages = [
    ...(folderStep ? [stageAt('folder', own, p.options.all ? { all: true } : {}), stageAt('review-page', own), stageAt('approve', own, { owner: true })] : []),
    ...(asked.includes('componentSets') ? [stageAt('figma-build', own, { figma: p.options.figma })] : []),
    ...(asked.includes('handoff') ? [...(ds === own ? [] : [stageAt('scratch-copy', ds)]), stageAt('generate', ds), stageAt('review', ds), stageAt('sign-off', ds, { owner: true })] : []),
  ];
  return { outputs: asked, stages: [...stages, { stage: 'hand-over', outputs: asked }] };
}

// The Design Systems here: committed, and scratch copies under .scratch/design-systems/.
const designSystems = () => [...new Set(['design-systems', '.scratch/design-systems'].map(d => join(REPO_ROOT, d))
  .filter(existsSync).flatMap(d => readdirSync(d).filter(n => !n.startsWith('.') && statSync(join(d, n)).isDirectory())))].sort();

const STAGES = { folder: "Vibe-to-Figma's folder step", 'review-page': "Vibe-to-Figma's review page", approve: "the owner's approve",
  'figma-build': 'the Figma build', 'scratch-copy': "the Design System's scratch copy", generate: "To-handoff's generate",
  review: "To-handoff's `review`", 'sign-off': "the owner's Sign-off", 'hand-over': 'the hand-over' };

// The check's message (#324 D7): what was found, each output's verdict and reason, what is still possible, the owner's
// questions or the plan, and that nothing was fetched or written.
function message(prototype, r, options = {}) {
  const command = o => `\`node skills/from-prototype/scripts/from-prototype.mjs check ${prototype} ${o === 'handoff'
    ? `--handoff${options.ds ? ` --ds ${options.ds}` : ''}`
    : `--figma ${options.figma ?? '<url>'}${options.name ? ` --name ${options.name}` : ''}${options.all ? ' --all' : ''}`}\``;
  const sentence = s => s[0].toUpperCase() + s.slice(1).replace('ADR 0019', `ADR 0019: ${ADR}`) + '.';
  const line = (name, v) => `- ${name}: ${v.verdict}.${[...v.reasons.map(x => x.message), ...v.notes.map(n => `note: ${n}`)].map(s => ' ' + sentence(s)).join('')}`;
  const { componentSets: sets, handoff } = r.verdicts;
  // Component Sets refused only for their link (#437): the Prototype can still have them, and a Handoff can run alone.
  const linkOnly = sets.reasons.every(x => x.row === 'figma');
  const possible = r.plan ? null : sets.verdict === 'no' && handoff.verdict !== 'no'
    ? linkOnly ? `A Handoff can run alone: ${command('handoff')}.`
      : `A Handoff against a Design System your developers already build with is still possible. Here: ${designSystems().map(d => `\`${d}\``).join(', ')}. Run ${command('handoff')} if one of them is it.`
    : sets.verdict !== 'no' && handoff.verdict === 'no' ? `Component Sets alone are still possible: ${command('componentSets')}.`
    : sets.verdict === 'no' ? 'Nothing else is possible for this Prototype today.' : null;
  const questions = r.questions.flatMap(q => [`Owner question: ${q.question}`, ...q.id === 'outputs'
    ? q.options.map(o => `- ${OUTPUTS[o.output]} (${o.verdict}): run again with \`${o.flag}\``)
    : q.id === 'designSystem' ? [`- here: ${q.options.map(d => `\`${d}\``).join(', ')}. Run again with \`--ds <design-system>\`.`] : []]);
  const plan = r.plan ? ['Plan:', ...r.plan.stages.map((s, i) => `${i + 1}. ${STAGES[s.stage]}${s.stage === 'hand-over'
    ? ` of ${s.outputs.map(o => OUTPUTS[o]).join(' and ')}` : `: ${s.folder} (Design System \`${s.designSystem}\`)${s.figma ? ` into ${s.figma}` : ''}${s.all ? ', `--all`' : ''}`}`)] : [];
  return [`${prototype}: ${r.kind} (${r.evidence.join(', ')}).`, line('Component Sets', sets), line('Handoff', handoff),
    ...(possible ? [possible] : []), ...questions, ...plan, '', 'Nothing was fetched or written.'].join('\n');
}

// An Artifact's limits, as the Artifact tool states them: the page and each text file at most 16 MB, each binary
// file at most 15 MB, and a version at most 511 files and 256 MB in all. Past 255 files the agent publishes in
// batches to the same URL, which is no limit of the copy.
const MB = 1000 * 1000;
const LIMITS = { page: 16 * MB, file: 15 * MB, files: 511, total: 256 * MB };
const mb = bytes => `${(bytes / MB).toFixed(1)} MB`;
const unescape = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * handOver({handoffPath, out}) -> {dir, title, files, bytes}: the publish copy of a signed-off Handoff's Rendering
 * (#440, spec #343 The hand-over), written to `out` (default .scratch/from-prototype/<feature-key>/): the stamped
 * page as index.html, titled `<feature-key> handoff`, every screenshot it refers to beside it under screens/, and
 * its links rewritten from ../screens/ to screens/. `files` lists the copy's paths, the page first; `title` is the
 * Artifact's.
 * Refuses (throws, writing nothing) a Handoff not signed off, one whose signed.json doesn't match handoff.json, a
 * Rendering whose stamp isn't the signed Handoff's, a link that leaves the copy, and a copy over an Artifact's
 * limits. A copy already at `out` is replaced: its index.html and screens/ go, nothing else there.
 */
export function handOver({ handoffPath, out }) {
  const dir = dirname(handoffPath);
  const text = readFileSync(handoffPath, 'utf8');
  const h = JSON.parse(text);
  const at = out || join(REPO_ROOT, '.scratch/from-prototype', h.feature.key);
  const refuse = reason => { throw new Error(`cannot hand over ${handoffPath}: ${reason}`); };
  if (!inScratch(at)) refuse(`the copy is written only under ${join(REPO_ROOT, '.scratch')}/, not ${at}`);
  if (h.status !== 'approved') refuse(`it is not signed off (${h.status}): nothing is published before Sign-off`);
  const signedPath = join(dir, 'signed.json');
  if (!existsSync(signedPath)) refuse('there is no signed.json beside it: sign it off again');
  if (readFileSync(signedPath, 'utf8') !== text) refuse("its signed.json doesn't match handoff.json: re-run To-handoff and sign it off again");
  if (handoffContentHash(h) !== (h.approval || {}).contentHash) refuse('its content changed after Sign-off: re-run To-handoff and sign it off again');

  const pagePath = join(dir, 'renderings', 'index.html');
  if (!existsSync(pagePath)) refuse(`it has no Rendering at ${pagePath}: render it`);
  const page = readFileSync(pagePath, 'utf8');
  const stamp = (page.match(/<p class="stamp">([^<]*)<\/p>/) || [])[1];
  if (stamp !== stampOf(h)) refuse(`its Rendering's stamp reads "${stamp}", not "${stampOf(h)}": render it again`);

  // A screenshot path is relative to handoff.json and the Rendering sits in renderings/, so its links climb one
  // folder (render-html.mjs); the copy puts the page beside screens/. An Artifact takes its title from the page's
  // first <title>, so the copy's names the feature key and a later Sign-off finds the same Artifact by it.
  const title = `${h.feature.key} handoff`;
  const copy = page.replace(/((?:src|href)=")\.\.\/screens\//g, '$1screens/').replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  const leaving = [...copy.matchAll(/(?:src|href)="([^"]*\.\.\/[^"]*)"/g)].map(m => m[1]);
  if (leaving.length) refuse(`its Rendering links outside the copy: ${[...new Set(leaving)].join(', ')}`);
  const shots = [...new Set([...copy.matchAll(/(?:src|href)="(screens\/[^"]+)"/g)].map(m => unescape(m[1])))].sort();
  const absent = shots.filter(s => !existsSync(join(dir, s)));
  if (absent.length) refuse(`its Rendering refers to screenshots that aren't there: ${absent.join(', ')}`);

  const pageBytes = Buffer.byteLength(copy);
  const sizes = shots.map(s => [s, statSync(join(dir, s)).size]);
  const bytes = sizes.reduce((sum, [, n]) => sum + n, pageBytes);
  const over = [];
  if (pageBytes > LIMITS.page) over.push(`the page is ${mb(pageBytes)} (at most ${mb(LIMITS.page)})`);
  for (const [s, n] of sizes) if (n > LIMITS.file) over.push(`${s} is ${mb(n)} (at most ${mb(LIMITS.file)} a file)`);
  if (shots.length + 1 > LIMITS.files) over.push(`the copy is ${shots.length + 1} files (at most ${LIMITS.files})`);
  if (bytes > LIMITS.total) over.push(`the copy is ${mb(bytes)} in all (at most ${mb(LIMITS.total)})`);
  if (over.length) refuse(`the copy is over an Artifact's limits: ${over.join('; ')}`);

  rmSync(join(at, 'index.html'), { force: true });
  rmSync(join(at, 'screens'), { recursive: true, force: true });
  mkdirSync(join(at, 'screens'), { recursive: true });
  writeFileSync(join(at, 'index.html'), copy);
  for (const s of shots) writeFileSync(join(at, s), readFileSync(join(dir, s)));
  return { dir: at, title, files: ['index.html', ...shots], bytes };
}

const USAGE = 'usage: from-prototype.mjs check <prototype> [--figma <url>] [--handoff] [--ds <ds>] [--name <name>] [--all]\n'
  + '       from-prototype.mjs hand-over <handoff.json> [--out <dir under .scratch/>]';

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true,
      options: { out: { type: 'string' }, figma: { type: 'string' }, handoff: { type: 'boolean' }, ds: { type: 'string' },
        name: { type: 'string' }, all: { type: 'boolean' } } });
  } catch (e) { console.error(`${e.message}\n${USAGE}`); return 1; }
  const { positionals, values } = parsed;
  const [command, input] = positionals;
  if (!['check', 'hand-over'].includes(command) || !input) { console.error(USAGE); return 1; }
  if (command === 'check') {
    const { figma, handoff, ds, name, all } = values;
    const options = { figma, handoff, ds, name, all };
    const r = check(input, options);
    console.log(message(input, r, options));
    // 0 with the plan, 2 with the owner's questions, 1 when an asked output is refused or none is possible (#324 D7).
    return r.plan ? 0 : r.questions.length ? 2 : 1;
  }
  try {
    const r = handOver({ handoffPath: input, out: values.out });
    console.log(`wrote ${r.dir}: index.html and ${r.files.length - 1} screenshot${r.files.length === 2 ? '' : 's'}, ${mb(r.bytes)}`);
    console.log(`publish it as a private Artifact titled "${r.title}", with screens/ as its supporting files`);
    return 0;
  } catch (e) { console.error(e.message); return 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
