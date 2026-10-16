// Tailwind's own compiler over a consumer project's CSS, with no bundler (#118). It runs the pinned `tailwindcss`
// `compile()` from scratch and resolves `@import` with a plain file loader: a relative path inside the project, or
// a pinned stylesheet package (sources.mjs TOOLS) through its `exports` map (the `style` condition, or a plain
// path such as shadcn's "./tailwind.css"). `loadModule` refuses, so a `@plugin` or `@config` fails, naming it:
// nothing from a package or the project is executed.
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_DIR, TOOLS, toolDir } from './sources.mjs';

const STYLESHEETS = ['tailwindcss', 'tw-animate-css', 'shadcn'];

/** A stylesheet id, as an `@import` names it, to a file path. Throws for anything outside the pinned packages. */
function resolveStylesheet(id, base, tools) {
  if (id.startsWith('.')) return join(base, id);
  const m = /^((?:@[^/]+\/)?[^/]+)(\/.+)?$/.exec(id);
  if (!m || STYLESHEETS.indexOf(m[1]) < 0) throw new Error(`@import "${id}": not a pinned stylesheet package (${STYLESHEETS.join(', ')})`);
  const pkg = toolDir(m[1], tools);
  const exports = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).exports || {};
  let target = exports[m[2] ? '.' + m[2] : '.'];
  if (target && typeof target === 'object') target = target.style;
  if (typeof target !== 'string') throw new Error(`@import "${id}": ${m[1]}@${TOOLS[m[1]].version} exports no stylesheet there`);
  const path = join(pkg, target);
  if (relative(pkg, path).split(sep)[0] === '..') throw new Error(`@import "${id}": export leaves the package`);
  return path;
}

/**
 * Compile `css` (the project's global stylesheet, read from `base`) and build `candidates`.
 * Returns the compiled CSS text. Throws when a stylesheet cannot be resolved or the CSS needs a module.
 */
export async function build(css, candidates, { base, tools = DEFAULT_DIR }) {
  const { compile } = await import(pathToFileURL(join(toolDir('tailwindcss', tools), 'dist/lib.mjs')).href);
  const compiler = await compile(css, {
    base,
    loadStylesheet: async (id, from) => {
      const path = resolveStylesheet(id, from, tools);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
    loadModule: async id => { throw new Error(`"${id}" is a @plugin or @config module; the Adapter executes no package or project code`); },
  });
  return compiler.build(candidates);
}

/** The declarations of the rule for one utility `candidate` in compiled CSS: {property: value}, or null. */
export function utilityRule(compiled, candidate) {
  const selector = '.' + candidate.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
  const i = compiled.indexOf(`${selector} {`);
  if (i < 0) return null;
  const body = compiled.slice(i + selector.length + 2, compiled.indexOf('}', i));
  return Object.fromEntries(body.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const k = s.indexOf(':');
    return [s.slice(0, k).trim(), s.slice(k + 1).trim()];
  }));
}
