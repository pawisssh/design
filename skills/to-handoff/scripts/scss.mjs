// The part of Sass a Prototype's imported stylesheet is read through (#227), for css.mjs to lower to the rules the
// matcher reads: `$variables` substituted, nesting flattened, `//` comments blanked so every offset stays the
// file's own. Not a Sass compiler: what it can't resolve offline (a package `@use`, a mixin, a function) is counted
// here and reported as a note, never skipped silently.

const REFERENCE = /(?:([\w-]+)\.)?\$([\w-]+)/g;
const UNRESOLVED = /\$[\w-]|#\{/;
// A module function call (`color.adjust(..)`, `math.div(..)`): the reader has no Sass functions.
const ARITHMETIC = /[*+]|\s[-/]\s/;
const CALL = /\b[a-z][\w-]*\.[a-z][\w-]*\(/;
// Sass at-rules whose blocks or statements the reader doesn't lower.
const UNLOWERED = /^@(mixin|include|function|if|else|each|for|while|extend|at-root|return|content)\b/;
const MODULE = /^@(use|forward|import)\s+(['"])(.+?)\2(?:\s+as\s+([\w*-]+))?/;

/** SCSS source with its `/* *\/` and `//` comments blanked to spaces (a `//` inside a string or parentheses is not one). */
export function blankComments(text) {
  const blank = (from, to) => ' '.repeat(to - from);
  let out = '', quote = null, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const to = end < 0 ? text.length : end + 2;
      out += blank(i, to); i = to - 1; continue;
    } else if (c === '/' && text[i + 1] === '/' && depth <= 0) {
      const end = text.indexOf('\n', i);
      const to = end < 0 ? text.length : end;
      out += blank(i, to); i = to - 1; continue;
    }
    out += c;
  }
  return out;
}

/**
 * One stylesheet's Sass context: its `$variables` (keyed as written, `$gap` or `ns.$gap`) and what it could not read.
 * `read(spec)` follows a `@use`/`@import` to a project partial and returns that partial's variables, or null when the
 * project holds no such file.
 */
export function sassFile(read) {
  return { vars: new Map(), read, unread: [], unresolved: new Set(), dropped: 0, unlowered: new Set() };
}

/** Record every `$name: value;` in `src` (any scope: the nearest later definition wins, as for a flat file). */
export function declareVariables(sass, src) {
  for (const m of src.matchAll(/\$([\w-]+)\s*:\s*([^;{}]+?)\s*;/g)) {
    const name = `$${m[1]}`, value = m[2].replace(/\s*!default$/, '');
    if (value === m[2] || !sass.vars.has(name)) sass.vars.set(name, value);
  }
}

/** `value` with its variables replaced by their values; null when one is undefined here (it is counted in `unresolved`). */
export function substitute(sass, value, depth = 0) {
  const call = depth === 0 && CALL.exec(value);
  if (call) { sass.unresolved.add(`${call[0]}…)`); return null; }
  if (!UNRESOLVED.test(value)) return value;
  if (depth === 0 && value.includes('#{')) sass.unresolved.add('#{…}');
  let missing = false;
  const out = value.replace(REFERENCE, (ref, ns, name) => {
    const found = sass.vars.get(ns ? `${ns}.$${name}` : `$${name}`);
    if (found === undefined || depth > 8) { sass.unresolved.add(ref); missing = true; return ref; }
    const inner = substitute(sass, found, depth + 1);
    if (inner === null) missing = true;
    return inner === null ? found : inner;
  });
  if (missing || /#\{/.test(out)) return null;
  // Sass arithmetic (`$a * 2`) would be evaluated by a compiler; left as text it is a wrong value (#227).
  if (depth === 0 && ARITHMETIC.test(out.replace(/(['"]).*?\1|url\(.*?\)|calc\(.*\)|var\(.*?\)/g, ''))) { sass.unresolved.add(value); return null; }
  return out;
}

/** A statement outside any declaration: `@use`, `@forward` and `@import` bring in variables; other Sass is counted. */
export function statement(sass, head, offset) {
  const m = MODULE.exec(head);
  if (!m) { if (UNLOWERED.test(head)) sass.unlowered.add(head.match(/^@[\w-]+/)[0]); return; }
  const [, rule, , spec, as] = m;
  // A `with (..)` configuration or a comma list isn't followed, so it can't be read as the plain partial (#227).
  const rest = head.slice(m[0].length);
  if (/^\s*with\s*\(/.test(rest)) { sass.unlowered.add(`@${rule} … with`); return; }
  if (/^\s*,/.test(rest)) { sass.unlowered.add(`@${rule} list`); return; }
  const vars = spec.startsWith('sass:') ? null : sass.read(spec);
  if (!vars) { if (!spec.startsWith('sass:')) sass.unread.push({ rule, spec, offset }); return; }
  const bare = rule === 'import' || as === '*';
  const ns = as || spec.split('/').pop().replace(/^_/, '');
  for (const [name, value] of vars) sass.vars.set(bare ? name : `${ns}.${name}`, value);
}

/** The full selectors of a nested `prelude` under `parents` (null at the top): `&` is the parent, else a descendant. */
export function nestSelectors(parents, prelude, splitTop) {
  const own = splitTop(prelude, ',').map(s => s.trim()).filter(Boolean);
  if (!parents) return own;
  return parents.flatMap(parent => own.map(child => (child.includes('&') ? child.replaceAll('&', parent) : `${parent} ${child}`)));
}

/** Whether a body statement is a Sass variable definition or at-rule rather than a declaration. */
export const isDeclaration = head => !head.startsWith('$') && !head.startsWith('@');

/** Count a skipped block that is Sass the reader does not lower: a mixin, a control directive, a nested property. */
export function noteUnlowered(sass, prelude) {
  if (UNLOWERED.test(prelude)) sass.unlowered.add(prelude.match(/^@[\w-]+/)[0]);
  else if (prelude.endsWith(':')) sass.unlowered.add('nested properties');
}

/** The note for one file, or null when everything in it was read. `at` names an offset as file:line:col. */
export function sassNote(file, sass, at) {
  const parts = [
    ...sass.unread.map(u => `\`@${u.rule} '${u.spec}'\` (${at(u.offset)}) is not a file in this project, so the variables, mixins and functions it supplies are unknown`),
    ...(sass.dropped ? [`${sass.dropped} declaration${sass.dropped === 1 ? '' : 's'} using ${[...sass.unresolved].map(r => `\`${r}\``).join(', ')} ${sass.dropped === 1 ? 'is' : 'are'} left out`] : []),
    ...(sass.unlowered.size ? [`${[...sass.unlowered].map(u => `\`${u}\``).join(', ')} ${sass.unlowered.size === 1 ? 'is' : 'are'} not read`] : []),
  ];
  return parts.length ? { level: 'info', text: `${file} is Sass the static reader lowers without a compiler: ${parts.join('; ')}.` } : null;
}
