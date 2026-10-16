// A small CSS reader for a Prototype's <style> blocks: rules with source offsets, shorthand expansion to the
// longhands the matcher reads, selector matching against the reader's element tree, and a cascade with
// inheritance. It is enough for a single-HTML Prototype, not a CSS engine: @media rules are read but never
// applied (the static reader has no viewport), and a rule whose last compound has a pseudo-class (other than
// :root) is kept apart as `pseudo`, never applied to the default render.

const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']);

/** Parse CSS text that starts at `base` in its file. Returns [{selectors, decls: [{property, value, offset}], media, pseudo, order}]. */
export function parseCss(text, base = 0) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, c => ' '.repeat(c.length));
  const rules = [];
  let order = 0;
  const block = (from, to, media) => {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= to) break;
      const prelude = src.slice(i, open).trim();
      const close = matching(src, open);
      if (prelude.startsWith('@media')) block(open + 1, close, prelude.slice(6).trim());
      else if (!prelude.startsWith('@')) {
        const decls = declarations(src, open + 1, close).map(d => ({ ...d, offset: base + d.offset }));
        for (const selector of splitTop(prelude, ',').map(s => s.trim()).filter(Boolean)) {
          const parsed = parseSelector(selector);
          rules.push({ selector, parsed, specificity: specificity(parsed), decls, media: media || null, pseudo: parsed.pseudo, order: order++ });
        }
      }
      i = close + 1;
    }
  };
  block(0, src.length, null);
  return rules;
}

/** Inline `style` attribute text -> declarations, with offsets from `base`. */
export function parseInline(text, base = 0) {
  return declarations(text, 0, text.length).map(d => ({ ...d, offset: base + d.offset }));
}

function matching(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  return src.length;
}

function splitTop(text, sep) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === sep && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out;
}

// Declarations between `from` and `to`, each expanded to longhands, with the offset of its property name.
function declarations(src, from, to) {
  const out = [];
  let start = from;
  for (const part of splitTop(src.slice(from, to), ';')) {
    const colon = part.indexOf(':');
    const lead = part.length - part.trimStart().length;
    if (colon > 0) {
      const property = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim().replace(/\s*!important$/, '');
      if (property && value) for (const d of expand(property, value)) out.push({ ...d, offset: start + lead });
    }
    start += part.length + 1;
  }
  return out;
}

const COLOR_WORD = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(.*\)|var\(.*\)|transparent|currentcolor|white|black)$/i;
const isColorWord = w => COLOR_WORD.test(w);
// Words a background or border shorthand holds that are not its colour; any other bare word is a named colour,
// left for the matcher (the shared converter reads few names, so the rest become Off-system, never dropped).
const NOT_COLOR = /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset|thin|medium|thick|repeat|repeat-x|repeat-y|no-repeat|space|round|scroll|fixed|local|top|bottom|left|right|center|auto|cover|contain|border-box|padding-box|content-box|text|inherit|initial|unset|revert|revert-layer)$/i;
const colorWordOf = words => words.find(isColorWord) || words.find(w => /^[a-z]+$/i.test(w) && !NOT_COLOR.test(w));

// Shorthand -> the longhands the matcher reads. Unknown shorthands pass through as written.
function expand(property, value) {
  const words = splitWords(value);
  if (property === 'background') {
    const c = colorWordOf(words) || (words.length === 1 && /^none$/i.test(words[0]) ? 'transparent' : null);
    return c ? [{ property: 'background-color', value: c }] : [];
  }
  const border = /^border(-(top|right|bottom|left))?$/.exec(property);
  if (border) {
    if (words.length === 1 && /^(0|none)$/.test(words[0])) return [{ property: `${property}-width`, value: '0' }];
    const out = [];
    const c = colorWordOf(words);
    if (c) out.push({ property: `${property}-color`, value: c });
    const w = words.find(x => /^\d/.test(x));
    if (w) out.push({ property: `${property}-width`, value: w });
    return out;
  }
  return [{ property, value }];
}

/** Split a value on top-level whitespace (spaces inside parentheses stay). */
export function splitWords(value) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of value.trim()) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (/\s/.test(c) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- selectors ----------

// "a > b.c:hover" -> {parts: [{compound, combinator}], pseudo}; a compound is {tag, id, classes, attrs, pseudos}.
function parseSelector(selector) {
  const parts = [];
  const re = /\s*([>+~])\s*|\s+/g;
  let last = 0, combinator = ' ', m;
  const tokens = [];
  while ((m = re.exec(selector))) {
    tokens.push({ text: selector.slice(last, m.index), combinator });
    combinator = m[1] || ' ';
    last = re.lastIndex;
  }
  tokens.push({ text: selector.slice(last), combinator });
  for (const t of tokens) if (t.text) parts.push({ compound: compound(t.text), combinator: t.combinator });
  const tail = parts.length ? parts[parts.length - 1].compound : { pseudos: [] };
  return { parts, pseudo: tail.pseudos.some(p => p !== 'root') };
}

function compound(text) {
  const c = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
  const re = /([#.]?)(-?[_a-zA-Z][\w-]*)|\*|\[([^\]=]+)(?:=["']?([^"'\]]*)["']?)?\]|::?([\w-]+)(\([^)]*\))?/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[5]) c.pseudos.push(m[5]);
    else if (m[3]) c.attrs.push({ name: m[3].trim(), value: m[4] });
    else if (m[0] === '*') continue;
    else if (m[1] === '#') c.id = m[2];
    else if (m[1] === '.') c.classes.push(m[2]);
    else c.tag = m[2].toLowerCase();
  }
  return c;
}

function specificity(parsed) {
  let a = 0, b = 0, c = 0;
  for (const { compound: x } of parsed.parts) {
    if (x.id) a++;
    b += x.classes.length + x.attrs.length + x.pseudos.filter(p => p !== 'root').length;
    if (x.pseudos.includes('root')) b++;
    if (x.tag) c++;
  }
  return a * 10000 + b * 100 + c;
}

function matchesCompound(x, el) {
  if (!el || el.type !== 'element') return false;
  if (x.pseudos.includes('root') && el.tag !== 'html') return false;
  if (x.tag && x.tag !== el.tag) return false;
  if (x.id && el.attrs.id !== x.id) return false;
  for (const cls of x.classes) if (!el.classes.includes(cls)) return false;
  for (const a of x.attrs) if (!(a.name in el.attrs) || (a.value !== undefined && el.attrs[a.name] !== a.value)) return false;
  return true;
}

/** Whether a parsed selector matches the element (pseudo-classes other than :root are ignored here). */
export function selectorMatches(parsed, el) {
  const parts = parsed.parts;
  const at = (i, node) => {
    if (!matchesCompound(parts[i].compound, node)) return false;
    if (i === 0) return true;
    const comb = parts[i].combinator;
    if (comb === '>') return at(i - 1, node.parent);
    if (comb === ' ') { for (let p = node.parent; p; p = p.parent) if (at(i - 1, p)) return true; return false; }
    return false; // sibling combinators are not read
  };
  return parts.length > 0 && at(parts.length - 1, el);
}

/** The rules (no @media, no pseudo) that match `el`, in cascade order (lowest first). */
export function matchedRules(rules, el) {
  return rules.filter(r => !r.media && !r.pseudo && selectorMatches(r.parsed, el))
    .sort((p, q) => p.specificity - q.specificity || p.order - q.order);
}

/**
 * The cascaded declarations of `el`: {property: {value, offset, own}} where `own` is false for a value
 * inherited from an ancestor. Inline `style` wins over rules.
 */
export function computed(rules, el, cache = new Map()) {
  if (cache.has(el)) return cache.get(el);
  const out = {};
  if (el.parent && el.parent.type === 'element') {
    const parent = computed(rules, el.parent, cache);
    for (const [k, v] of Object.entries(parent)) if (INHERITED.has(k)) out[k] = { ...v, own: false };
  }
  for (const r of matchedRules(rules, el)) for (const d of r.decls) out[d.property] = { value: d.value, offset: d.offset, own: true, rule: r };
  for (const d of el.inline || []) out[d.property] = { value: d.value, offset: d.offset, own: true, rule: null };
  for (const [k, v] of Object.entries(out)) if (v.value === 'inherit' && el.parent) {
    const p = computed(rules, el.parent, cache)[k];
    if (p) out[k] = { ...p, own: false }; else delete out[k];
  }
  cache.set(el, out);
  return out;
}
