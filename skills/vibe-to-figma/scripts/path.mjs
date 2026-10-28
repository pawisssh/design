// Which path /vibe-to-figma takes, decided before it reads a component or fetches a tool (#252, spec #249):
// a project with `components.json` takes the shadcn path; a React project with none, whose JSX/TSX carries Tailwind
// utilities in className, takes path A (an Extracted Library, ADR 0016); anything else is refused in one message.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out']);
const CODE = new Set(['.tsx', '.jsx', '.ts', '.js']);
const STYLES = new Set(['.scss', '.sass', '.css']);
const NEEDS = 'Vibe-to-Figma needs a React project with a components.json (shadcn), or Tailwind utilities in its JSX className';

// A Tailwind utility as written in a class string: a hyphenated utility with a scale, fraction or colour, behind any
// variants (`hover:`, `md:`, `data-[x=y]:`), `!`, and an opacity (`/50`). A bare word such as `border` or `flex` is
// not one: plain CSS classes use those too.
const SCALE = String.raw`(?:\d+(?:\.\d+)?(?:/\d+)?|px|auto|full|screen|min|max|fit|\[[^\]]+\])`;
const UTILITY = new RegExp(String.raw`^(?:[\w\[\]=.*&-]+:)*!?-?(?:`
  + String.raw`(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|max-w|min-h|max-h|top|left|right|bottom|inset|z|basis|leading|tracking|opacity|duration|delay|col-span|row-span|grid-cols|grid-rows)-${SCALE}`
  + String.raw`|(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via|shadow|accent|caret|decoration)-[a-z][a-z0-9-]*|(?:bg|text|border|ring|fill|stroke|outline|shadow)-\[[^\]]+\]`
  + String.raw`|rounded-[a-z0-9\[][\w\[\]#%.-]*|border-[xytblr]-?\d*|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono)`
  + String.raw`|items-(?:start|end|center|baseline|stretch)|justify-(?:start|end|center|between|around|evenly)|self-(?:auto|start|end|center|stretch)|text-(?:left|center|right)`
  + String.raw`|flex-(?:row|col|wrap|1|auto|none)|overflow-[a-z]+|cursor-[a-z-]+|transition-[a-z]+)(?:/(?:\d+|\[[^\]]+\]))?$`);
const MIN_UTILITIES = 3;

export function* files(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    let isDir;
    try { isDir = statSync(path).isDirectory(); } catch { continue; } // a broken symlink is no file of the project
    if (isDir) yield* files(path);
    else yield path;
  }
}

// Every string and template literal of a source file is searched, not just the className attribute's, so a class
// string held in a constant or a cva() call counts, as does a template with ${} parts.
export function utilitiesIn(source) {
  const found = new Set();
  for (const m of source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    for (const t of (m[1] ?? m[2] ?? m[3]).split(/[\s"'`{}()$,;]+/)) if (t && UTILITY.test(t)) found.add(t);
  }
  return found;
}

/**
 * choosePath(project) -> {path: 'shadcn'} | {path: 'A'} | {path: 'refused', message}. Reads only the project's file
 * names, its package.json and its source text; nothing is written and no tool is fetched.
 */
export function choosePath(project) {
  const refuse = found => ({ path: 'refused', message: `${found}. ${NEEDS}.` });
  if (!existsSync(project) || !statSync(project).isDirectory()) return refuse(`${project}: no such directory`);
  if (existsSync(join(project, 'components.json'))) return { path: 'shadcn' };

  const all = [...files(project)];
  const has = (...exts) => all.some(f => exts.includes(extname(f)));
  const manifest = join(project, 'package.json');
  let pkg;
  try { pkg = JSON.parse(readFileSync(manifest, 'utf8')); }
  catch (e) { if (existsSync(manifest)) return refuse('a package.json that is not valid JSON'); }
  if (!pkg) return refuse(has('.html') ? 'plain HTML, with no package.json' : 'no package.json and no components.json');

  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  // Carbon first: a Carbon app is React too, and its styling is Carbon's own SCSS, whatever else its classNames hold.
  if (deps.some(d => d.startsWith('@carbon/') || d === 'carbon-components-react' || d === 'carbon-components')) {
    return refuse('a Carbon app (styled by its SCSS and Carbon components). Use the Carbon Adapter for it');
  }
  if (!deps.includes('react')) return refuse(has('.html') ? 'plain HTML, with no React' : 'no React in package.json');

  // Bootstrap and the like write `p-3` and `text-center` too: Tailwind's own package says it is Tailwind.
  const tailwind = deps.some(d => d === 'tailwindcss' || d.startsWith('@tailwindcss/'));
  if (!tailwind) return refuse('a React project with no tailwindcss in package.json');
  const utilities = new Set();
  for (const f of all) {
    if (!CODE.has(extname(f)) || f.endsWith('.d.ts')) continue;
    for (const t of utilitiesIn(readFileSync(f, 'utf8'))) utilities.add(t);
  }
  if (utilities.size >= MIN_UTILITIES) return { path: 'A' };
  return refuse(has(...STYLES)
    ? 'a React project styled by SCSS or CSS classes, with no Tailwind utilities in className'
    : 'a React project with no Tailwind utilities in className');
}
