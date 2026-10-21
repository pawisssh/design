// Which path /vibe-to-figma takes, decided before it reads a component or fetches a tool (#252, spec #249):
// a project with `components.json` takes the shadcn path; a React project with none, whose JSX/TSX carries Tailwind
// utilities in className, takes path A (an Extracted Library, ADR 0016); anything else is refused in one message.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage']);
const JSX = new Set(['.tsx', '.jsx']);
const STYLES = new Set(['.scss', '.sass', '.css']);
const NEEDS = 'Vibe-to-Figma needs a React project with a components.json (shadcn), or Tailwind utilities in its JSX className';

// A Tailwind utility as written in className: a hyphenated utility with a scale or colour, or a keyword one.
const UTILITY = new RegExp('^(?:-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|max-w|min-h|max-h'
  + '|top|left|right|bottom|inset|z|basis|grow|shrink|order|col-span|row-span|grid-cols|grid-rows|leading|tracking|opacity|duration|delay)-(?:\\d+(?:\\.\\d+)?|px|auto|full|screen|min|max|fit|\\[[^\\]]+\\])'
  + '|(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via|shadow|accent|caret|decoration)-(?:[a-z]+-\\d{2,3}|white|black|transparent|current|\\[[^\\]]+\\]|xs|sm|base|lg|[2-9]?xl|md|inner|none)'
  + '|rounded(?:-(?:none|sm|md|lg|xl|[23]xl|full|\\[[^\\]]+\\]))?|border(?:-[xytblr])?(?:-\\d+)?|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono)'
  + '|items-(?:start|end|center|baseline|stretch)|justify-(?:start|end|center|between|around|evenly)|self-(?:auto|start|end|center|stretch)'
  + '|flex-(?:row|col|wrap|1|auto|none)|grid-flow-\\w+|overflow-\\w+|cursor-\\w+|transition(?:-\\w+)?|truncate|uppercase|lowercase|capitalize|underline|italic'
  + '|(?:hover|focus|active|disabled|focus-visible|dark|sm|md|lg|xl|group-hover|peer-\\w+|aria-\\w+|data-\\[[^\\]]+\\]|has-\\[[^\\]]+\\]):[\\w\\[\\]\\-./:#%]+)$');
const MIN_UTILITIES = 3;

function* files(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

function classNameTokens(source) {
  const tokens = new Set();
  for (const m of source.matchAll(/className\s*=\s*(\{[\s\S]{0,800}?\}(?!\s*\))|"[^"]*"|'[^']*')/g)) {
    for (const t of m[1].split(/[\s"'`{}()?:&|,]+(?![^\[]*\])/)) if (t && UTILITY.test(t)) tokens.add(t);
  }
  return tokens;
}

/**
 * choosePath(project) -> {path: 'shadcn'} | {path: 'A'} | {path: 'refused', message}. Reads only the project's file
 * names, its package.json and its JSX/TSX text; nothing is written and no tool is fetched.
 */
export function choosePath(project) {
  const refuse = found => ({ path: 'refused', message: `${found}. ${NEEDS}.` });
  if (!existsSync(project) || !statSync(project).isDirectory()) return refuse(`${project}: no such directory`);
  if (existsSync(join(project, 'components.json'))) return { path: 'shadcn' };

  let pkg = {};
  try { pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')); } catch { /* no usable package.json */ }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const all = [...files(project)];
  const ext = set => all.some(f => set.has(extname(f)));

  if (Object.keys(deps).some(d => d.startsWith('@carbon/') || d === 'carbon-components-react' || d === 'carbon-components')) {
    return refuse('a Carbon app (styled by its SCSS and Carbon components). Use the Carbon Adapter for it');
  }
  if (!deps.react) {
    return refuse(all.some(f => extname(f) === '.html') ? 'plain HTML with no React' : 'no React in package.json and no components.json');
  }
  const tokens = new Set();
  for (const f of all) if (JSX.has(extname(f))) for (const t of classNameTokens(readFileSync(f, 'utf8'))) tokens.add(t);
  if (tokens.size >= MIN_UTILITIES) return { path: 'A' };
  return refuse(ext(new Set(['.scss', '.sass'])) || ext(STYLES)
    ? 'a React project styled by SCSS or CSS classes, with no Tailwind utilities in className'
    : 'a React project with no Tailwind utilities in className');
}
