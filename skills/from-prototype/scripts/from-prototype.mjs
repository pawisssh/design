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
import { featureOf } from '../../to-handoff/scripts/feature-key.mjs';
import { fileHash, handoffContentHash } from '../../to-handoff/scripts/hash.mjs';
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
const tanstackStart = p => p.declared.has('@tanstack/react-start') && p.all.some(f => f.startsWith(`src${sep}routes${sep}__root.`));
const frameworks = p => [...declaredOf(p, ['next', 'vite']), ...(tanstackStart(p) ? ['TanStack Start'] : [])];

// What To-handoff's React reader takes, as its reactKind and readers find it, with no parser: Next before Vite, React
// outside peerDependencies, the script index.html loads (readVite's regex) and the App Router's root layout. Whether
// that module script renders JSX is left to the reader stage, after the fetch.
const built = (p, name) => !!(p.pkg?.dependencies?.[name] || p.pkg?.devDependencies?.[name]);
const onNext = p => built(p, 'next');
const onVite = p => !onNext(p) && built(p, 'vite');
const peerOnlyReact = p => !!p.pkg?.peerDependencies?.react && !built(p, 'react');
const viteShell = p => p.all.includes('index.html') && /<script\b[^>]*\bsrc=["']\/?[^"']+\.[jt]sx?["']/.test(p.text('index.html'));
const appRouter = p => {
  const app = ['app', `src${sep}app`].find(d => p.all.some(f => f.startsWith(d + sep)));
  return !!app && ['.tsx', '.ts', '.jsx', '.js'].some(e => p.all.includes(join(app, 'layout' + e)));
};
// The routes To-handoff's Vite reader can't read yet: wouter (#350), and a data router it can't follow (#361): one
// built in a file other than the one that renders its RouterProvider, or routes that name a `Component:`.
const wouter = p => p.declared.has('wouter');
const DATA_ROUTER = /\bcreate(?:Browser|Hash|Memory)Router\s*\(/;
const unreadDataRouter = p => p.code.some(f => /<RouterProvider\b/.test(p.text(f)) && !DATA_ROUTER.test(p.text(f)))
  || p.code.some(f => DATA_ROUTER.test(p.text(f)) && /\bComponent\s*:/.test(p.text(f)));

// Each output's gate rows, in order (spec #343 The gate table): name, the kinds it applies to, its test (passes when
// true; a row with none fails for every kind it names), its effect when it fails (a refusal unless `note` or
// `closes`, see verdictOf), its message, and the ticket it waits on. A gate ticket lands by adding or changing its
// own rows.
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
  { name: 'screens', kinds: [SHADCN], effect: 'note', ticket: '#350', test: p => !wouter(p),
    message: 'with wouter the default family list comes from one screen, and `--all` takes every file, until #350' },
  { name: 'screens', kinds: [SHADCN], ticket: '#361', test: p => !unreadDataRouter(p),
    message: "only with `--all`: the screens can't be read until #361 (a data router built in another file, or `Component:` routes)" },
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
  { name: 'peer-react', kinds: REACT, test: p => !peerOnlyReact(p), message: 'not yet: React only in `peerDependencies` (#358)', ticket: '#358' },
  { name: 'vite-shell', kinds: REACT, test: p => !onVite(p) || !tanstackStart(p), ticket: '#348',
    message: "not yet: a TanStack Start build is a Cloudflare Worker, which the run can't serve yet (#348)" },
  { name: 'vite-shell', kinds: REACT, test: p => !onVite(p) || tanstackStart(p) || viteShell(p),
    message: p => p.all.includes('index.html') ? '`index.html` loads no module script: To-handoff reads a Vite app from it'
      : 'no `index.html`: To-handoff reads a Vite app from its `index.html`' },
  { name: 'next-app-router', kinds: REACT, test: p => !onNext(p) || appRouter(p),
    message: 'no `app/` or `src/app/` with a root layout: To-handoff reads only the App Router' },
  { name: 'html-file', kinds: [HTML, HTML_UTILITIES], test: p => htmlFiles(p).length === 1,
    message: p => `name the page: run again with the HTML file's path, one of ${htmlFiles(p).join(', ')}. Several pages are not specified yet (the map's 'Plain HTML beyond one banner')` },
  { name: 'routes', kinds: REACT, effect: 'note', test: p => !onVite(p) || !wouter(p), ticket: '#350',
    message: "reads as one screen, `index`: To-handoff's Vite reader reads react-router routes, and wouter waits on #350" },
  { name: 'routes', kinds: REACT, effect: 'note', test: p => !onVite(p) || !unreadDataRouter(p), ticket: '#361',
    message: 'reads as one screen, `index`: a data router built in another file, or `Component:` routes, wait on #361' },
  { name: 'runtime-lockfile', kinds: [...REACT, HTML, HTML_UTILITIES], effect: 'note', ticket: '#354',
    test: p => !p.all.includes('package.json') || p.all.includes('package-lock.json'),
    message: 'the runtime read runs `npm ci`; without a `package-lock.json` the Handoff is likely static-only, with a `q-runtime` question: run `npm install --package-lock-only --ignore-scripts` in your project (#354)' },
  // The own-folder route (#265): closed for path A and plain HTML, and for a Prototype that can't have Component Sets
  // (a refused Figma link alone leaves it able to).
  { name: 'own-folder', kinds: [PATH_A, HTML], effect: 'closes', ticket: '#265',
    message: "To-handoff can't yet recognise its sites through the Family map (#265)" },
  { name: 'own-folder', kinds: [SHADCN, CLASSES, MODULES, HTML_UTILITIES], effect: 'closes', test: p => p.componentSets.reasons.every(r => r.row === 'figma'),
    message: "it can't have Component Sets, so it has no own folder" },
];

function figmaRefusal(p) {
  if (p.options.figma === undefined) return null;
  try { fileKeyOf(p.options.figma); return null; } catch (e) { return e.message; }
}

// A stylesheet of the Prototype's own, with class rules and no Tailwind import.
const classStyled = p => p.all.filter(f => STYLES.has(extname(f)) && !/\.module\.s?css$/.test(f))
  .filter(f => { const css = p.text(f); return !/tailwindcss/.test(css) && /(?:^|[\s,}])\.[A-Za-z_][\w-]*[^{};]*\{/m.test(css); });

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

// A failing row refuses, unless its effect is `note`, or `closes`: that closes the own-folder route, so the output is
// only against a Design System the owner names.
function verdictOf(table, p, yes) {
  const failing = table.filter(row => row.kinds.includes(p.kind) && !row.test?.(p))
    .map(row => ({ row: row.name, message: typeof row.message === 'function' ? row.message(p) : row.message, ticket: row.ticket, effect: row.effect }));
  const withEffect = wanted => failing.filter(f => f.effect === wanted).map(({ effect, ...r }) => r);
  const refusals = withEffect(undefined), closes = withEffect('closes');
  return { verdict: refusals.length ? 'no' : closes.length ? 'only against a Design System you name' : yes,
    reasons: refusals.length ? refusals : closes, notes: withEffect('note').map(f => f.message) };
}

const OUTPUTS = { componentSets: 'Component Sets', handoff: 'a Handoff' };
// Names as the message writes them: each in backticks, joined.
const ticked = (names, sep = ', ') => names.map(n => `\`${n}\``).join(sep);
const SCRATCH_ROOT = '.scratch/design-systems';

/**
 * check(prototype, {figma, handoff, ds, name, all, root}) -> {kind, evidence, verdicts: {componentSets, handoff},
 * questions, refusals, designSystem, designSystems, plan}: the Prototype's kind and the files that show it, each
 * output's verdict ({verdict, reasons: [{row, message, ticket}], notes}) from its gate rows, a plain HTML Handoff's with
 * the `page` it reads, the owner's open questions ({id, question, options?}), what refuses the run beside the verdicts
 * (an unknown `ds`, a name collision), the Handoff's Design System once settled ({name, existing}: `existing` names the
 * Design Systems already holding a Handoff of its feature key), the Design Systems here, and the plan, settled only
 * when no question is open and nothing asked is refused (spec #343 The check; Owner questions; The Handoff's Design
 * System; The stages). `prototype` is a folder, or for plain HTML one HTML file; `figma` (a link) asks for Component
 * Sets and `handoff` for a Handoff against the Design System `ds`. `root` is the repo whose design-systems/ and
 * .scratch/design-systems/ are read (this checkout by default). It reads file names, package.json and text; it writes
 * nothing, fetches nothing and loads no fetched parser.
 */
export function check(prototype, options = {}) {
  const p = reading(prototype);
  p.options = options;
  p.repo = options.root ?? REPO_ROOT;
  for (const { kind, evidence } of KINDS) {
    const found = evidence(p);
    if (found.length) { p.kind = kind; p.evidence = [...found, ...frameworks(p)]; break; }
  }
  p.componentSets = verdictOf(COMPONENT_SETS, p, p.kind === SHADCN ? 'yes, by the shadcn path' : 'yes, by path A');
  const verdicts = { componentSets: p.componentSets, handoff: verdictOf(HANDOFF, p, 'yes, against its own folder') };
  // Plain HTML reaches To-handoff as one HTML file: the folder's one page, found without naming it.
  if ([HTML, HTML_UTILITIES].includes(p.kind) && verdicts.handoff.verdict !== 'no') verdicts.handoff.page = htmlFiles(p)[0];
  const asked = [options.figma !== undefined && 'componentSets', options.handoff && 'handoff'].filter(Boolean);
  const ds = designSystemOf(p, verdicts.handoff);
  if (ds.against) verdicts.handoff.verdict = `yes, against \`${ds.against}\``;
  const refused = asked.some(o => verdicts[o].verdict === 'no');
  const refusals = refused ? [] : refusalsOf(p, asked, ds);
  const questions = refused || refusals.length ? [] : questionsOf(p, asked, verdicts, ds);
  const plan = asked.length && !questions.length && !refused && !refusals.length ? planOf(p, asked, ds) : null;
  return { kind: p.kind, evidence: p.evidence, verdicts, questions, refusals, designSystem: ds.settled, designSystems: ds.here.names, plan };
}

// The owner's questions (spec #343 Owner questions): with no output asked, one question offering only the outputs
// whose verdict is not "no", and the Design System question beside it when a Handoff is among them and its Design System
// is not settled; a Handoff asked with no --ds and no existing Handoff asks its Design System (#438).
function questionsOf(p, asked, verdicts, ds) {
  const designSystem = { id: 'designSystem', question: `Which Design System is the Handoff against?${ds.existing.length > 1
    ? ` This Prototype's Handoff \`${ds.key}\` is already in ${ticked(ds.existing, ' and ')}.` : ''}`,
  options: ds.options, own: ds.own, default: ds.default, imported: ds.imported, ...(ds.existing.length > 1 ? { existing: ds.existing } : {}) };
  if (!asked.length) {
    const possible = Object.keys(OUTPUTS).filter(o => verdicts[o].verdict !== 'no');
    const question = possible.length === 2 ? 'Which outputs should this run make: Component Sets, a Handoff, or both?'
      : `Should this run make ${OUTPUTS[possible[0]]}? It is the only output possible.`;
    return possible.length ? [{ id: 'outputs', question,
      options: possible.map(o => ({ output: o, verdict: verdicts[o].verdict, flag: o === 'handoff' ? '--handoff' : '--figma <url>' })) },
    ...(possible.includes('handoff') && !ds.answer ? [designSystem] : [])] : [];
  }
  const questions = [];
  const own = ownFolder(p);
  if (asked.includes('handoff') && !ds.answer) questions.push(designSystem);
  // The own folder named while Component Sets are "no": Vibe-to-Figma's folder step would refuse it (the own-folder row).
  if (asked.includes('handoff') && ds.ownAnswer && verdicts.componentSets.verdict === 'no') {
    questions.push({ ...designSystem, question: `Which Design System is the Handoff against? Not \`${own.name}\`, this Prototype's own folder: it can't have Component Sets, so its own folder can't be made.` });
  }
  if (own.refused && asked.includes('componentSets')) questions.push({ id: 'name', question: `What is this Prototype's own folder called? ${own.refused}` });
  return questions;
}

// The Prototype's own folder (#320 D4, #324 D5): Vibe-to-Figma's folder name under the scratch root.
function ownFolder(p) {
  try { return { name: folderName(p.root, p.options.name) }; } catch (e) { return { refused: e.message }; }
}

// The ordered stages after the check (spec #343 The stages; Scratch roots), each with its folder and Design System.
// Component Sets always come from the Prototype's own folder; a Handoff runs against the settled Design System, which
// is the own folder when --ds names it. A committed Design System is used through its scratch copy: the Handoff stage
// makes it when it is absent, and one already there is used in place. `notes` are what the owner is told: a --ds that
// makes a new Handoff, and a committed Design System that moved since its copy was made (`moved`).
function planOf(p, asked, { answer: ds, ownAnswer, here, existing, key }) {
  const { name: own } = ownFolder(p);
  const stageAt = (stage, designSystem, extra) => ({ stage, folder: `${SCRATCH_ROOT}/${designSystem}`, designSystem, ...extra });
  const folderStep = asked.includes('componentSets') || ownAnswer;
  const handoff = asked.includes('handoff');
  const throughCopy = handoff && !ownAnswer && here.committed.has(ds);
  const stages = [
    ...(folderStep ? [stageAt('folder', own, p.options.all ? { all: true } : {}), stageAt('review-page', own), stageAt('approve', own, { owner: true })] : []),
    ...(asked.includes('componentSets') ? [stageAt('figma-build', own, { figma: p.options.figma })] : []),
    ...(handoff ? [...(throughCopy && !here.scratch.has(ds) ? [stageAt('scratch-copy', ds)] : []), stageAt('generate', ds), stageAt('review', ds), stageAt('sign-off', ds, { owner: true })] : []),
  ];
  const files = throughCopy && here.scratch.has(ds) ? movedFiles(p.repo, ds) : [];
  const notes = [
    ...(handoff && existing.length && !existing.includes(ds)
      ? [`this Prototype's Handoff \`${key}\` is already in ${ticked(existing, ' and ')}; \`--ds ${ds}\` makes a new Handoff`] : []),
    ...(files.length ? [`the committed Design System \`${ds}\` has moved since its scratch copy was made: ${files.join(', ')}. Refreshing the copy replaces those files and puts the copy's signed Handoffs into Drift, so it is refreshed only when the owner says so in chat, keeping its \`handoffs/\` and any Contract written mid-run`] : []),
  ];
  return { outputs: asked, stages: [...stages, { stage: 'hand-over', outputs: asked }], notes, ...(files.length ? { moved: { designSystem: ds, files } } : {}) };
}

// The Design Systems here (spec #343 The Handoff's Design System): the committed folders and those under
// .scratch/design-systems/, a scratch copy and its committed folder as one name.
function hereOf(repo) {
  const under = d => existsSync(join(repo, d)) ? readdirSync(join(repo, d)).filter(n => !n.startsWith('.') && statSync(join(repo, d, n)).isDirectory()) : [];
  const committed = new Set(under('design-systems')), scratch = new Set(under(SCRATCH_ROOT));
  return { committed, scratch, names: [...new Set([...committed, ...scratch])].sort() };
}
// A Design System's folder: its scratch copy wins over the committed folder of the same name.
const folderOf = (repo, here, ds) => join(repo, here.scratch.has(ds) ? SCRATCH_ROOT : 'design-systems', ds);
const json = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

// The packages a Design System's Contracts name as their code (ADR 0005). shadcn's name project files (`@/…`), which
// no package.json depends on, so shadcn is never a default by import.
function packagesOf(dir) {
  const at = join(dir, 'contracts');
  return existsSync(at) ? [...new Set(readdirSync(at).filter(f => f.endsWith('.component.json')).map(f => json(join(at, f))?.code?.package).filter(Boolean))] : [];
}

// The committed Foundations document and Contracts that differ from the scratch copy's files of the same names, or are
// missing from it (Scratch roots: the copy moved).
function movedFiles(repo, ds) {
  const committed = join(repo, 'design-systems', ds), copy = join(repo, SCRATCH_ROOT, ds);
  const contracts = existsSync(join(committed, 'contracts')) ? readdirSync(join(committed, 'contracts')).map(f => `contracts/${f}`) : [];
  return [`${ds}.foundations.json`, ...contracts].filter(f => existsSync(join(committed, f)))
    .filter(f => !existsSync(join(copy, f)) || !readFileSync(join(copy, f)).equals(readFileSync(join(committed, f)))).sort();
}

// A scratch folder is this Prototype's own (Scratch roots: a name collision) when its Family map's sites are this
// Prototype's files, as extract() reads the map back on a rerun, or when every Prototype file its Foundations document
// read (components.json, the stylesheet, package-lock.json, the root layout) is this Prototype's, byte for byte.
function isOwn(p, dir, name) {
  const sites = Object.values(json(join(dir, `${name}.family-map.json`))?.families ?? {}).flatMap(f => f.sites ?? []);
  if (sites.length && sites.every(s => typeof s.file === 'string' && existsSync(join(p.root, s.file)))) return true;
  const read = Object.entries(json(join(dir, `${name}.foundations.json`))?.source?.files ?? {});
  return read.length > 0 && read.every(([f, hash]) => p.all.includes(f) && hash === fileHash(readFileSync(join(p.root, f))));
}

// The Handoff's Design System (spec #343, by #321's order): the list, the own folder while that route is open, the
// default, and the answer: --ds, else the Design System an existing Handoff of this feature key is in (the rerun rule).
// `against` is the Design System whose Code Library the Prototype imports when it has no own folder: its Handoff is
// against it (#321 step 2).
function designSystemOf(p, handoff) {
  const here = hereOf(p.repo);
  const own = ownFolder(p).name;
  const ownOpen = handoff.verdict === 'yes, against its own folder' && !!own;
  const readable = handoff.verdict !== 'no';
  const imported = readable ? here.names.flatMap(n => packagesOf(folderOf(p.repo, here, n)).filter(pkg => built(p, pkg)).slice(0, 1).map(pkg => ({ name: n, package: pkg }))) : [];
  const key = readable ? featureOf(handoff.page ? join(p.root, handoff.page) : p.root).key : null;
  const existing = key ? here.names.filter(n => [join(p.repo, 'design-systems', n), join(p.repo, SCRATCH_ROOT, n)]
    .some(d => existsSync(join(d, 'handoffs', key, 'handoff.json')))) : [];
  const answer = p.options.ds ?? (existing.length === 1 ? existing[0] : null);
  const against = imported.length === 1 && !ownOpen ? imported[0].name : null;
  const byOrder = existing.length > 1 ? null : against ?? (ownOpen && !imported.length ? own : null);
  return { here, key, existing, answer, ownAnswer: !!own && answer === own && !here.committed.has(own),
    settled: answer ? { name: answer, key, existing } : null,
    options: here.names.filter(n => n !== own || here.committed.has(n)), own: ownOpen ? own : undefined, default: byOrder, against,
    imported };
}

// What refuses a run beside the verdicts (spec #343 The Handoff's Design System; Scratch roots): an unknown --ds, and
// the own folder's name taken by a committed Design System or a scratch folder that isn't this Prototype's own.
function refusalsOf(p, asked, ds) {
  const { here } = ds;
  const own = ownFolder(p).name;
  const unknown = p.options.ds && !here.names.includes(p.options.ds) && p.options.ds !== own;
  const inPlay = own && (asked.includes('componentSets') || (asked.includes('handoff') && ds.ownAnswer));
  const taken = !inPlay ? null : here.committed.has(own) ? `the committed Design System \`${own}\`'s copy`
    : here.scratch.has(own) && !isOwn(p, join(p.repo, SCRATCH_ROOT, own), own) ? 'a folder that is not this Prototype\'s own' : null;
  return [
    ...(unknown ? [`\`--ds ${p.options.ds}\` names no Design System here: ${ticked(here.names)}`] : []),
    ...(taken ? [`this Prototype's own folder, \`${SCRATCH_ROOT}/${own}\`, is taken by ${taken}: pass \`--name\``] : []),
  ];
}

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
  const possible = r.plan || r.refusals.length ? null : sets.verdict === 'no' && handoff.verdict !== 'no'
    ? linkOnly ? `A Handoff can run alone: ${command('handoff')}.`
      : `A Handoff against a Design System your developers already build with is still possible. Here: ${ticked(r.designSystems)}. Run ${command('handoff')} if one of them is it.`
    : sets.verdict !== 'no' && handoff.verdict === 'no' ? `Component Sets alone are still possible: ${command('componentSets')}.`
    : sets.verdict === 'no' ? 'Nothing else is possible for this Prototype today.' : null;
  const questions = r.questions.flatMap(q => [`Owner question: ${q.question}`, ...q.id === 'outputs'
    ? q.options.map(o => `- ${OUTPUTS[o.output]} (${o.verdict}): run again with \`${o.flag}\``)
    : q.id === 'designSystem' ? designSystemLines(q) : []]);
  const settled = r.designSystem && !options.ds && r.designSystem.existing.includes(r.designSystem.name)
    ? [`The Handoff's Design System: \`${r.designSystem.name}\`, where this Prototype's Handoff \`${r.designSystem.key}\` already is.`] : [];
  const plan = r.plan ? ['Plan:', ...r.plan.stages.map((s, i) => `${i + 1}. ${STAGES[s.stage]}${s.stage === 'hand-over'
    ? ` of ${s.outputs.map(o => OUTPUTS[o]).join(' and ')}` : `: ${s.folder} (Design System \`${s.designSystem}\`)${s.figma ? ` into ${s.figma}` : ''}${s.all ? ', `--all`' : ''}`}`)] : [];
  return [`${prototype}: ${r.kind} (${r.evidence.join(', ')}).`, line('Component Sets', sets), line('Handoff', handoff),
    ...r.refusals.map(x => `- ${x}.`), ...(possible ? [possible] : []), ...questions, ...settled, ...plan,
    ...(r.plan?.notes ?? []).map(n => `Note: ${n}.`), '', 'Nothing was fetched or written.'].join('\n');
}

// The Design System question's options (spec #343): the Design Systems here, worded by what the developers build with,
// never by look; the own folder while that route is open; and the default #321's order gives, or why there is none.
function designSystemLines(q) {
  return [`- if your developers build with one of these: ${ticked(q.options)}. Run again with \`--ds <design-system>\`.`,
    ...(q.own ? [`- None: this Prototype's own folder, \`${q.own}\`. Run again with \`--ds ${q.own}\`.`] : []),
    q.default && q.default === q.own ? `- default: \`${q.own}\`, this Prototype's own folder.`
      : q.default ? `- default: \`${q.default}\`, whose Contracts' package \`${q.imported.find(i => i.name === q.default).package}\` this Prototype depends on.`
      : q.own && q.imported.length ? `- no default: this Prototype has its own folder and imports ${ticked(q.imported.map(i => i.name))}'s Code Library (#321 D6).`
      : '- no default: name the one your developers build with.'];
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
