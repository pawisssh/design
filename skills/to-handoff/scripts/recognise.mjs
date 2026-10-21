// Recogniser rules (#62) for the static reader's tree: which elements are usage candidates and their stable
// signatures, state-shaped conditions -> the standard states, and Stand-ins found by name and shape. Nothing
// here guesses: a candidate's family and a plain condition's default value are decision requests.
import { selectorMatches, matchedRules } from './css.mjs';

export const STANDARD_STATES = ['default', 'loading', 'empty', 'error', 'success'];

// ---------- conditions ----------

/** Parse `a || !b && (c)` into {or|and: [..]} / {not} / {atom}. Atoms are the trimmed leaf expressions. */
export function parseCondition(text) {
  let i = 0;
  const s = text;
  const ws = () => { while (/\s/.test(s[i] || '')) i++; };
  const or = () => { const xs = [and()]; for (ws(); s.startsWith('||', i); ws()) { i += 2; xs.push(and()); } return xs.length > 1 ? { or: xs } : xs[0]; };
  const and = () => { const xs = [not()]; for (ws(); s.startsWith('&&', i); ws()) { i += 2; xs.push(not()); } return xs.length > 1 ? { and: xs } : xs[0]; };
  const not = () => {
    ws();
    if (s[i] === '!' && s[i + 1] !== '=') { i++; return { not: not() }; }
    if (s[i] === '(') { i++; const x = or(); ws(); i++; return x; }
    const start = i;
    let depth = 0;
    while (i < s.length) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { if (!depth) break; depth--; }
      else if (!depth && (s.startsWith('||', i) || s.startsWith('&&', i))) break;
      i++;
    }
    return { atom: s.slice(start, i).trim() };
  };
  return or();
}

export function evaluate(ast, value) {
  if (ast.atom !== undefined) return value(ast.atom);
  if (ast.not) return !evaluate(ast.not, value);
  return ast.or ? ast.or.some(x => evaluate(x, value)) : ast.and.every(x => evaluate(x, value));
}

// Next.js boundary files (#62): the React reader names their condition by file.
const FRAMEWORK_STATES = { loading: 'loading', error: 'error', 'not-found': 'empty' };

// A status kept as a string (#229): the values of `status === 'GENERATING'`, lowercased with separators dropped.
const STATUS_VALUES = {
  loading: ['loading', 'generating', 'pending', 'processing', 'inprogress', 'fetching', 'saving', 'submitting', 'sending'],
  success: ['ready', 'done', 'success', 'succeeded', 'complete', 'completed', 'saved', 'sent', 'submitted'],
  error: ['failed', 'failure', 'error'],
};
// `status === 'READY'` or `'READY' === status`, as {name, value}; `!==` and other operators are not a state.
const STATUS_COMPARE = /^(?:(?<q>['"`])(?<value>\w[\w -]*)\k<q>\s*={2,3}\s*(?<name>[\w.?]+)|(?<name2>[\w.?]+)\s*={2,3}\s*(?<q2>['"`])(?<value2>\w[\w -]*)\k<q2>)$/;
const STATUS_NAME = /(?:^|[.?])(?:status|state|\w*(?:Status|State))$/;

/** The standard state a status string stands for (#229), or null when it can't be placed. */
function stateOfStatusValue(value) {
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  return Object.keys(STATUS_VALUES).find(s => STATUS_VALUES[s].includes(key)) || null;
}

const statusCompare = atom => {
  const g = STATUS_COMPARE.exec(atom)?.groups;
  return g && (g.name ? { name: g.name, value: g.value } : { name: g.name2, value: g.value2 });
};

/** The standard state a state-shaped atom stands for (#62), or null for a plain condition. */
export function stateOfAtom(atom) {
  const file = /(?:^|\/)(loading|error|not-found)\.[jt]sx?$/.exec(atom);
  if (file) return FRAMEWORK_STATES[file[1]];
  // A status kept as a string (#229); a value it can't place falls through to the word rules below.
  const compare = statusCompare(atom);
  const placed = compare && STATUS_NAME.test(compare.name) && stateOfStatusValue(compare.value);
  if (placed) return placed;
  if (/(\.length\s*===?\s*0\b|^!\s*[\w.]+\.length$|\bisEmpty\b)/.test(atom)) return 'empty';
  if (/\b(is)?(Loading|Sending|Submitting|Fetching|Pending|Saving)\b|\b(loading|sending|submitting|fetching|pending|saving)\b/.test(atom)) return 'loading';
  // An `_error` property (`result._error`) is the error state too (#213).
  if (/\b(is)?(Error|Failed)\b|\b_?(error|failed|hasError)\b/.test(atom)) return 'error';
  if (/\b(is)?(Submitted|Sent|Success|Done|Saved)\b|\b(submitted|sent|success|done|saved)\b/.test(atom)) return 'success';
  return null;
}

/** An atom's value in a standard state: state-shaped atoms are true in their own state only; plain ones take `defaults[atom]`. */
export const atomIn = (state, defaults) => atom => {
  const s = stateOfAtom(atom);
  return s ? s === state : Boolean(defaults[atom]);
};

// ---------- usage candidates ----------

const SEMANTIC = new Set(['button', 'input', 'select', 'textarea']);
const ROLES = new Set(['status', 'alert', 'alertdialog', 'dialog', 'tab', 'tablist', 'switch', 'checkbox', 'radio', 'menu', 'menuitem', 'progressbar', 'tooltip', 'navigation', 'search']);

/** The stable signature of an element: tag, sorted classes (a template literal's static ones, #216), then [type] and [role]. */
export function signature(el) {
  const classes = [...el.classes, ...(el.staticClasses || [])].sort().map(c => `.${c}`).join('');
  const type = el.tag === 'input' && typeof el.attrs.type === 'string' ? `[type=${el.attrs.type}]` : '';
  const role = typeof el.attrs.role === 'string' ? `[role=${el.attrs.role}]` : '';
  return `${el.tag}${classes}${type}${role}`;
}

// Props that carry content or behaviour, not a variant: left out of a library component's signature.
export const CONTENT_PROPS = /^(class|id|href|src|alt|title|name|value|placeholder|for|type|role|target|rel|tabIndex|aria-.*|data-.*)$/;

/** A library component's signature (#62 tier 2): its name, then its sorted literal variant props, `Button[size=sm]`. */
export function librarySignature(el) {
  const props = Object.keys(el.attrs).filter(k => typeof el.attrs[k] === 'string' && !CONTENT_PROPS.test(k)).sort();
  return `${el.tag}${props.map(k => (el.attrs[k] === '' ? `[${k}]` : `[${k}=${el.attrs[k]}]`)).join('')}`;
}

/**
 * Whether `el` is a usage candidate: {kind: "element"} for a semantic element or ARIA role, {kind: "group"} for an
 * element whose repeated same-tag children a descendant rule styles (`.avatars span`), else null.
 */
export function candidateOf(el, rules) {
  if (SEMANTIC.has(el.tag) && !(el.tag === 'input' && el.attrs.type === 'hidden')) return { kind: 'element', sig: signature(el) };
  if (el.tag === 'a' && 'href' in el.attrs) return { kind: 'element', sig: signature(el) };
  if (typeof el.attrs.role === 'string' && ROLES.has(el.attrs.role)) return { kind: 'element', sig: signature(el) };
  const kids = el.children.filter(c => c.type === 'element');
  if (kids.length >= 2 && kids.every(k => k.tag === kids[0].tag) && !kids[0].repeat) {
    const styled = rules.some(r => !r.media && r.parsed.parts.length > 1 && r.parsed.parts[r.parsed.parts.length - 1].compound.tag === kids[0].tag
      && selectorMatches(r.parsed, kids[0]) && r.parsed.parts.slice(0, -1).some(p => p.compound.classes.some(c => el.classes.includes(c)) || (p.compound.id && p.compound.id === el.attrs.id)));
    if (styled) return { kind: 'group', sig: `${signature(el)}>${kids[0].tag}` };
  }
  return null;
}

/** The element's own declarations from rules that match it (not inherited), in cascade order. */
export function ownDeclarations(rules, el) {
  const out = [];
  for (const r of matchedRules(rules, el)) for (const d of r.decls) out.push(d);
  for (const d of el.inline || []) out.push(d);
  return out;
}

// ---------- Stand-ins (#62): by name and shape ----------

/**
 * Mock data (`const mock… =`) and simulated work (`setTimeout` in a function) in the scripts.
 * Returns {mocks: [{name, offset}], simulated: [{name, delay, offset, before: [atom], after: [atom]}]}:
 * `before` are the `state.x = true` writes before the timer, `after` the ones inside its callback. A timer that
 * only clears state after the work, `setTimeout(() => { state.msg = null; render(); }, 2000)`, is not simulated work.
 */
export function standIns(scripts) {
  const mocks = [], simulated = [];
  for (const s of scripts) {
    for (const m of s.text.matchAll(/\b(?:const|let|var)\s+(mock[A-Z]\w*)\s*=/g)) mocks.push({ name: m[1], offset: s.offset + m.index + m[0].indexOf(m[1]) });
    for (const m of s.text.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
      const body = blockAt(s.text, m.index + m[0].length - 1);
      const timer = [...body.matchAll(/setTimeout\(/g)].map(x => ({ at: x.index, args: blockAt(body, x.index + x[0].length - 1).slice(1, -1) })).find(x => !clears(x.args));
      if (!timer) continue;
      const t = timer.at, delay = /,\s*(\d+)\s*$/.exec(timer.args);
      const trues = text => [...text.matchAll(/(state\.\w+)\s*=\s*true\b/g)].map(x => x[1]);
      simulated.push({ name: m[1], delay: delay ? Number(delay[1]) : null, offset: s.offset + m.index, before: trues(body.slice(0, t)), after: trues(body.slice(t)) });
    }
  }
  return { mocks, simulated };
}

// A setTimeout's arguments whose callback only resets state to null, undefined or '' (and re-renders) (#217).
function clears(args) {
  const cb = /^\s*(?:\(\s*\)\s*=>|function\s*\(\s*\))\s*(?:\{([^{}]*)\}|([^{};]*?))\s*(?:,\s*[\w.]+\s*)?$/.exec(args);
  if (!cb) return false;
  const statements = (cb[1] ?? cb[2]).split(';').map(x => x.trim()).filter(Boolean);
  return statements.some(x => x !== 'render()') && statements.every(x => x === 'render()' || /^state\.\w+\s*=\s*(null|undefined|''|""|``)$/.test(x));
}

/** The text from the bracket at `open` (`{` or `(`) to its matching close. */
function blockAt(src, open) {
  const [o, c] = src[open] === '(' ? '()' : '{}';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++;
    else if (src[i] === c && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** Copy that is a Stand-in (#62): lorem ipsum, example.com addresses, sample names. */
export const isPlaceholderText = text => /lorem ipsum|\bexample\.(com|org|net)\b|\b(john|jane) doe\b/i.test(text);
