// The cascade over Tailwind's compiled CSS (#119). Pure: it reads the CSS text Tailwind's own compiler wrote and
// never re-derives what a utility means. Each utility rule is sorted by the selector Tailwind compiled for it:
// - a Mode, from `:is(<mode selector> *)` (shadcn's `dark` variant);
// - a canonical state: `:hover` (inside `@media (hover: hover)`), `:focus-visible` and `:focus`, `:active`, and
//   `:disabled` with its other spellings `[aria-disabled="true"]` and `[data-disabled]`;
// - an attribute condition: an attribute the component sets from its own prop (`[data-size="sm"]`) is that prop's
//   value, and any other (`[aria-invalid="true"]`) is kept for the caller to sort;
// - anything a tuple cannot decide is kept apart with its kind (`skip`): an ancestor (`:where(…) .x`), a slot
//   (`:has(…)`), a descendant (`.x svg`), another media query, or another condition (`:not(…)`, two states).
// The winner for a property is the applicable rule with the highest specificity, then the latest in the output.

const SUPPORTS = /^@supports\b/;
const STATES = { hover: 'hover', 'focus-visible': 'focus', focus: 'focus', active: 'active', disabled: 'disabled' };
const DISABLED_ATTRS = ['[aria-disabled="true"]', '[data-disabled]'];

/** Parse CSS into a tree: [{prelude, decls: [[prop, value]], children: [node]}]. Comments are dropped. */
function parse(text) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function block() {
    const node = { decls: [], children: [] };
    let start = i;
    while (i < css.length) {
      const ch = css[i];
      if (ch === '"' || ch === "'") { i = css.indexOf(ch, i + 1) + 1; continue; }
      if (ch === '\\') { i += 2; continue; }
      if (ch === ';' || ch === '}') {
        const decl = css.slice(start, i).trim();
        const k = decl.indexOf(':');
        if (decl && k > 0) node.decls.push([decl.slice(0, k).trim(), decl.slice(k + 1).trim()]);
        i++;
        if (ch === '}') return node;
        start = i;
        continue;
      }
      if (ch === '{') {
        const prelude = css.slice(start, i).trim();
        i++;
        node.children.push({ prelude, ...block() });
        start = i;
        continue;
      }
      i++;
    }
    return node;
  }
  return block().children;
}

/**
 * The rules of Tailwind's utilities layer, in output order: [{selector, at: [at-rule], decls: {prop: value}, order}].
 * An `@supports` branch is merged into the rule it guards, so its declaration replaces the fallback before it.
 */
export function compiledRules(css) {
  const byKey = new Map();
  const visit = (nodes, at, selector) => {
    for (const n of nodes) {
      if (n.prelude.startsWith('@layer')) {
        if (n.prelude === '@layer utilities') visit(n.children, at, null);
        continue;
      }
      const isAt = n.prelude.startsWith('@');
      const nextAt = isAt && !SUPPORTS.test(n.prelude) ? [...at, n.prelude] : at;
      const sel = isAt ? selector : n.prelude;
      if (sel) {
        const key = `${nextAt.join('\n')}\n${sel}`;
        if (!byKey.has(key)) byKey.set(key, { selector: sel, at: nextAt, decls: {}, order: byKey.size });
        const rule = byKey.get(key);
        for (const [p, v] of n.decls) rule.decls[p] = v;
      }
      visit(n.children, nextAt, sel);
    }
  };
  // Only the utilities layer: skip everything outside an @layer.
  visit(parse(css).filter(n => n.prelude.startsWith('@layer')), [], null);
  return [...byKey.values()];
}

const escapeClass = cand => '.' + cand.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);

// Read one balanced `(…)` starting at s[i] === '('; returns the index after the closing paren.
function balanced(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '(') depth++;
    else if (s[j] === ')' && --depth === 0) return j + 1;
  }
  return s.length;
}

// Split a compound selector suffix into simple pieces (`:is(.dark *)`, `:hover`, `[a="b"]`), stopping at the first
// combinator. Returns {pieces, rest}.
function pieces(s) {
  const out = [];
  let i = 0;
  while (i < s.length && s[i] !== ' ' && s[i] !== '>' && s[i] !== '+' && s[i] !== '~') {
    let j;
    if (s[i] === '[') j = s.indexOf(']', i) + 1;
    else if (s[i] === ':') {
      j = i + 1;
      if (s[j] === ':') j++;
      while (j < s.length && /[\w-]/.test(s[j])) j++;
      if (s[j] === '(') j = balanced(s, j);
    } else {
      j = i + 1;
      while (j < s.length && !/[\s:[.>+~]/.test(s[j])) j += s[j] === '\\' ? 2 : 1;
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return { pieces: out, rest: s.slice(i) };
}

/**
 * The compiled rules of one utility `candidate`, each with its conditions.
 * `modes` is the Foundations document's Theme modes ([{key, selector}]); `attrs` maps an attribute the component
 * sets from a prop to that prop (`{"data-size": "size"}`).
 * Returns [{candidate, selector, decls, order, specificity, when: {mode, state, attrs, props?}, css, stateCss, skip?}]:
 * `css` is the state and attribute part of the selector, `stateCss` its state part alone; `skip` names why a tuple
 * cannot decide the rule.
 */
export function candidateRules(rules, candidate, { modes = [], attrs = {} } = {}) {
  const cls = escapeClass(candidate);
  const out = [];
  for (const r of rules) {
    const k = r.selector.indexOf(cls);
    if (k < 0 || /[\w\\-]/.test(r.selector[k + cls.length] || '')) continue;
    const prefix = r.selector.slice(0, k);
    const { pieces: ps, rest } = pieces(r.selector.slice(k + cls.length));
    const when = { mode: null, state: null, attrs: {} };
    const props = {};
    const css = [];
    const stateCss = [];
    let skip = prefix ? 'ancestor' : rest ? 'descendant' : null;
    for (const p of ps) {
      const mode = /^:is\((.+) \*\)$/.exec(p);
      const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(p);
      const pseudo = /^:([\w-]+)$/.exec(p);
      let state = null;
      if (mode && modes.some(m => m.selector === mode[1])) when.mode = modes.find(m => m.selector === mode[1]).key;
      else if (DISABLED_ATTRS.includes(p)) state = 'disabled';
      else if (pseudo && STATES[pseudo[1]]) state = STATES[pseudo[1]];
      else if (attr && attrs[attr[1]] && attr[2] !== undefined) props[attrs[attr[1]]] = attr[2];
      else if (attr) { when.attrs[attr[1]] = attr[2] === undefined ? '' : attr[2]; css.push(p); }
      else skip = skip || (p.startsWith(':has(') ? 'slot' : 'condition');
      if (state) {
        if (when.state && when.state !== state) skip = skip || 'condition';
        when.state = state;
        css.push(p);
        stateCss.push(p);
      }
    }
    for (const a of r.at) if (!(a === '@media (hover: hover)' && when.state === 'hover')) skip = skip || 'media';
    if (Object.keys(props).length) when.props = props;
    const rule = { candidate, selector: r.selector, decls: r.decls, order: r.order, specificity: specificity(r.selector), when, css: css.join(''), stateCss: stateCss.join('') };
    if (skip) rule.skip = skip;
    out.push(rule);
  }
  return out;
}

/** Selector specificity [ids, classes + attributes + pseudo-classes, types + pseudo-elements]. */
export function specificity(selector) {
  const sum = [0, 0, 0];
  const add = s => s.forEach((x, i) => { sum[i] += x; });
  const max = args => splitList(args).map(specificity).reduce((a, b) => (cmp(a, b) >= 0 ? a : b), [0, 0, 0]);
  let i = 0;
  const s = selector;
  while (i < s.length) {
    const ch = s[i];
    if (' >+~,*'.includes(ch)) { i++; continue; }
    if (ch === '#' || ch === '.') {
      let j = i + 1;
      while (j < s.length && (/[\w-]/.test(s[j]) || s[j] === '\\')) j += s[j] === '\\' ? 2 : 1;
      add(ch === '#' ? [1, 0, 0] : [0, 1, 0]);
      i = j;
    } else if (ch === '[') {
      add([0, 1, 0]);
      i = s.indexOf(']', i) + 1;
    } else if (ch === ':') {
      let j = i + 1;
      const element = s[j] === ':';
      if (element) j++;
      const start = j;
      while (j < s.length && /[\w-]/.test(s[j])) j++;
      const name = s.slice(start, j);
      if (s[j] === '(') {
        const end = balanced(s, j);
        const args = s.slice(j + 1, end - 1);
        if (['is', 'not', 'has'].includes(name)) add(max(args));
        else if (name !== 'where') add([0, 1, 0]);
        j = end;
      } else add(element ? [0, 0, 1] : [0, 1, 0]);
      i = j;
    } else {
      let j = i;
      while (j < s.length && /[\w-]/.test(s[j])) j++;
      add([0, 0, 1]);
      i = Math.max(j, i + 1);
    }
  }
  return sum;
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// "a, b(c, d)" -> ["a", "b(c, d)"]
function splitList(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  out.push(s.slice(start).trim());
  return out;
}

/**
 * Of `rules` (already known to apply), the one that wins `property`: the highest specificity, then the latest. Or null.
 * `property` may be a list of properties that set the same thing (`["padding-left", "padding-inline", "padding"]`).
 */
export function winner(rules, property) {
  const props = [].concat(property);
  let best = null;
  for (const r of rules) {
    if (!props.some(p => p in r.decls)) continue;
    if (!best || cmp(r.specificity, best.specificity) > 0 || (cmp(r.specificity, best.specificity) === 0 && r.order > best.order)) best = r;
  }
  return best;
}
