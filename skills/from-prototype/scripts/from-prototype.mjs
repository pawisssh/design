#!/usr/bin/env node
// From-Prototype (spec #343): one entry from a Prototype to Component Sets or a Handoff. Its check names the
// Prototype's kind and gives each output's verdict; its hand-over entry writes the publish copy of a signed-off
// Handoff's Rendering, which the agent publishes as a private Artifact.
//   node skills/from-prototype/scripts/from-prototype.mjs check <prototype> [--figma <url>] [--handoff]
//   node skills/from-prototype/scripts/from-prototype.mjs hand-over <handoff.json> [--out <dir under .scratch/>]
//
// check exits 1 when an output it was asked for is refused, else 0. hand-over exits 1 with its reason when it
// refuses, writing nothing.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { handoffContentHash } from '../../to-handoff/scripts/hash.mjs';
import { stampOf } from '../../to-handoff/scripts/render-html.mjs';
import { REPO_ROOT, inScratch } from '../../to-handoff/scripts/system.mjs';
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
  { name: 'mixed', kinds: [PATH_A], effect: 'note', ticket: '#331', test: p => !classStyled(p).length,
    message: p => `its own class-styled stylesheets (${classStyled(p).join(', ')}) are read as path A until #331 decides a React app that mixes them with Tailwind utilities` },
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
  // The own-folder route (#265): closed for path A and plain HTML, and for a kind that can't have Component Sets.
  { name: 'own-folder', kinds: [PATH_A, HTML], effect: 'closes', ticket: '#265',
    message: "To-handoff can't yet recognise its sites through the Family map (#265)" },
  { name: 'own-folder', kinds: [SHADCN, CLASSES, MODULES, HTML_UTILITIES], effect: 'closes', test: p => p.componentSets.verdict !== 'no',
    message: "it can't have Component Sets, so it has no own folder" },
];

// A stylesheet of the Prototype's own, with class rules and no Tailwind import.
const classStyled = p => p.all.filter(f => STYLES.has(extname(f)) && !/\.module\.s?css$/.test(f))
  .filter(f => { const css = p.text(f); return !/tailwindcss/.test(css) && /(?:^|[\s,}])\.[A-Za-z_][\w-]*[^{};]*\{/m.test(css); });

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

/**
 * check(prototype) -> {kind, evidence, verdicts: {componentSets, handoff}, questions, plan}: the Prototype's kind and
 * the files that show it, and each output's verdict ({verdict, reasons: [{row, message, ticket}], notes}) from its
 * gate rows (spec #343 The check), a plain HTML Handoff's with the `page` it reads. `prototype` is a folder, or for
 * plain HTML one HTML file. It reads file names, package.json and text; it writes nothing, fetches nothing and loads
 * no fetched parser.
 */
export function check(prototype) {
  const p = reading(prototype);
  for (const { kind, evidence } of KINDS) {
    const found = evidence(p);
    if (found.length) { p.kind = kind; p.evidence = [...found, ...frameworks(p)]; break; }
  }
  p.componentSets = verdictOf(COMPONENT_SETS, p, p.kind === SHADCN ? 'yes, by the shadcn path' : 'yes, by path A');
  const handoff = verdictOf(HANDOFF, p, 'yes, against its own folder');
  // Plain HTML reaches To-handoff as one HTML file: the folder's one page, found without naming it.
  if ([HTML, HTML_UTILITIES].includes(p.kind) && handoff.verdict !== 'no') handoff.page = htmlFiles(p)[0];
  return {
    kind: p.kind,
    evidence: p.evidence,
    verdicts: { componentSets: p.componentSets, handoff },
    // The outputs question and the plan land with #437.
    questions: [],
    plan: null,
  };
}

// The Design Systems here: committed, and scratch copies under .scratch/design-systems/.
const designSystems = () => [...new Set(['design-systems', '.scratch/design-systems'].map(d => join(REPO_ROOT, d))
  .filter(existsSync).flatMap(d => readdirSync(d).filter(n => !n.startsWith('.') && statSync(join(d, n)).isDirectory())))].sort();

// The check's message (#324 D7): what was found, each output's verdict and reason, what is still possible, and that
// nothing was fetched or written.
function message(prototype, r) {
  const sentence = s => s[0].toUpperCase() + s.slice(1).replace('ADR 0019', `ADR 0019: ${ADR}`) + '.';
  const line = (name, v) => `- ${name}: ${v.verdict}.${[...v.reasons.map(x => x.message), ...v.notes.map(n => `note: ${n}`)].map(s => ' ' + sentence(s)).join('')}`;
  const { componentSets: sets, handoff } = r.verdicts;
  const possible = sets.verdict === 'no' && handoff.verdict !== 'no'
    ? `A Handoff against a Design System your developers already build with is still possible. Here: ${designSystems().map(d => `\`${d}\``).join(', ')}. Run again with \`--handoff\` if one of them is it.`
    : sets.verdict !== 'no' && handoff.verdict === 'no' ? 'Component Sets alone are still possible: run again with `--figma <url>`.'
    : sets.verdict === 'no' ? 'Nothing else is possible for this Prototype today.' : null;
  return [`${prototype}: ${r.kind} (${r.evidence.join(', ')}).`, line('Component Sets', sets), line('Handoff', handoff),
    ...(possible ? [possible] : []), '', 'Nothing was fetched or written.'].join('\n');
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

const USAGE = 'usage: from-prototype.mjs check <prototype> [--figma <url>] [--handoff]\n'
  + '       from-prototype.mjs hand-over <handoff.json> [--out <dir under .scratch/>]';

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true,
      options: { out: { type: 'string' }, figma: { type: 'string' }, handoff: { type: 'boolean' } } });
  } catch (e) { console.error(`${e.message}\n${USAGE}`); return 1; }
  const { positionals, values } = parsed;
  const [command, input] = positionals;
  if (!['check', 'hand-over'].includes(command) || !input) { console.error(USAGE); return 1; }
  if (command === 'check') {
    const r = check(input);
    console.log(message(input, r));
    // An asked output that is refused stops the run (#324 D7); with none asked, the verdicts alone (#437 asks).
    const asked = [values.figma !== undefined && 'componentSets', values.handoff && 'handoff'].filter(Boolean);
    return asked.some(o => r.verdicts[o].verdict === 'no') ? 1 : 0;
  }
  try {
    const r = handOver({ handoffPath: input, out: values.out });
    console.log(`wrote ${r.dir}: index.html and ${r.files.length - 1} screenshot${r.files.length === 2 ? '' : 's'}, ${mb(r.bytes)}`);
    console.log(`publish it as a private Artifact titled "${r.title}", with screens/ as its supporting files`);
    return 0;
  } catch (e) { console.error(e.message); return 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
