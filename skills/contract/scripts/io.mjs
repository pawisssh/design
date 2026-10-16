// Node-side file IO for Contracts, shared by the CLIs (check, base-loop, apply-omit, catalog).
// contract.mjs stays pure and import-free so it can be inlined into a page or the Figma sandbox;
// anything that touches the file system lives here.
//
// Contracts are hand-aligned (small values inline, one rule per line), and the owner reviews them as
// diffs, so a write must not re-stringify the whole file: writeJson splices the changed values into the
// existing text and leaves every untouched byte as it was.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * The foundations document for a Contract: `given` when passed, else the single *.foundations.json in
 * the design-system folder above the contracts folder
 * (design-systems/<ds>/contracts/<family>.component.json -> design-systems/<ds>/<ds>.foundations.json).
 */
export function foundationsPathFor(contractPath, given) {
  if (given) return given;
  const dsDir = resolve(dirname(contractPath), '..');
  const found = readdirSync(dsDir).filter(f => f.endsWith('.foundations.json'));
  if (found.length !== 1) throw new Error(`no single *.foundations.json in ${dsDir}; pass --foundations <file>`);
  return join(dsDir, found[0]);
}

/**
 * Writes `value` to `path`, spliced into the text of `from` (default: `path` itself) when that file exists,
 * else as two-space JSON. Pass `from` to write an edited copy of a Contract elsewhere in its own layout.
 */
export function writeJson(path, value, { from = path } = {}) {
  const text = existsSync(from) ? rewriteJson(readFileSync(from, 'utf8'), value) : JSON.stringify(value, null, 2) + '\n';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

// ---------- formatting-preserving rewrite ----------

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function deepEqual(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return a === b;
}

// A JSON text parsed into spans: {kind, start, end, value} with `members` [{key, start, node}] for an
// object and `items` [node] for an array. `end` is exclusive; a member starts at its key.
function parse(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const fail = what => { throw new Error(`rewriteJson: expected ${what} at offset ${i}`); };
  const string = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (text[i] !== '"') fail('a closing quote');
    i++;
    return { kind: 'scalar', start, end: i };
  };
  const value = () => {
    ws();
    const start = i;
    if (text[i] === '{') {
      i++;
      const members = [];
      ws();
      if (text[i] === '}') { i++; return { kind: 'object', start, end: i, members }; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('a key');
        const k = string();
        ws();
        if (text[i] !== ':') fail('":"');
        i++;
        members.push({ key: JSON.parse(text.slice(k.start, k.end)), start: k.start, node: value() });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return { kind: 'object', start, end: i, members }; }
        fail('"," or "}"');
      }
    }
    if (text[i] === '[') {
      i++;
      const items = [];
      ws();
      if (text[i] === ']') { i++; return { kind: 'array', start, end: i, items }; }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return { kind: 'array', start, end: i, items }; }
        fail('"," or "]"');
      }
    }
    if (text[i] === '"') return string();
    while (i < text.length && !' \t\n\r,]}'.includes(text[i])) i++;
    if (i === start) fail('a value');
    return { kind: 'scalar', start, end: i };
  };
  const root = value();
  ws();
  if (i !== text.length) fail('the end of the document');
  return root;
}

// The leading whitespace of the line that holds offset `at`.
function indentAt(text, at) {
  const line = text.lastIndexOf('\n', at - 1) + 1;
  let j = line;
  while (text[j] === ' ' || text[j] === '\t') j++;
  return text.slice(line, j);
}

const multiline = (text, node) => text.slice(node.start, node.end).includes('\n');

// One line, in the hand style: `{ "k": v }`, `[1, 2]`.
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (isObj(v)) {
    const ks = Object.keys(v);
    return ks.length ? `{ ${ks.map(k => `${JSON.stringify(k)}: ${inline(v[k])}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

// Two-space indented, continuing at `indent`.
const block = (v, indent) => JSON.stringify(v, null, 2).split('\n').join('\n' + indent);

/**
 * Rewrites JSON `text` to hold `value`, changing only the spans whose values changed. A changed value
 * keeps its container's layout: an inline value stays inline, a multi-line one is re-indented in place,
 * and an added member or item follows its last sibling in that sibling's style. Returns `text` unchanged
 * when it already holds `value`.
 */
export function rewriteJson(text, value) {
  const root = parse(text);
  const edits = [];
  const replace = (start, end, insert) => edits.push({ start, end, insert });
  const render = (node, v) => (multiline(text, node) ? block(v, indentAt(text, node.start)) : inline(v));

  function patch(node, old, next) {
    if (deepEqual(old, next)) return;
    if (node.kind === 'object' && isObj(next) && node.members.length) {
      const keys = Object.keys(next);
      const kept = node.members.map((m, i) => (Object.hasOwn(next, m.key) ? i : -1)).filter(i => i >= 0);
      const keptKeys = kept.map(i => node.members[i].key);
      // Re-render when nothing is kept, or the kept keys change order.
      if (kept.length && keptKeys.join('\0') === keys.filter(k => keptKeys.includes(k)).join('\0')) {
        const last = kept[kept.length - 1];
        node.members.forEach((m, i) => {
          if (i > last) return;
          if (Object.hasOwn(next, m.key)) patch(m.node, old[m.key], next[m.key]);
          else replace(m.start, node.members[i + 1].start, '');
        });
        const tail = node.members[node.members.length - 1];
        const lastNode = node.members[last].node;
        const added = keys.filter(k => !keptKeys.includes(k));
        const isMulti = text.slice(node.start, node.members[0].start).includes('\n');
        const sep = isMulti ? ',\n' + indentAt(text, node.members[0].start) : ', ';
        const valueOf = v => (isMulti && multiline(text, lastNode) ? block(v, indentAt(text, node.members[0].start)) : inline(v));
        const insert = added.map(k => `${sep}${JSON.stringify(k)}: ${valueOf(next[k])}`).join('');
        replace(lastNode.end, last === node.members.length - 1 ? lastNode.end : tail.node.end, insert);
        return;
      }
    }
    if (node.kind === 'array' && Array.isArray(next) && node.items.length && next.length) {
      const n = Math.min(node.items.length, next.length);
      for (let i = 0; i < n; i++) patch(node.items[i], old[i], next[i]);
      const lastNode = node.items[n - 1];
      const isMulti = text.slice(node.start, node.items[0].start).includes('\n');
      const sep = isMulti ? ',\n' + indentAt(text, node.items[0].start) : ', ';
      const valueOf = v => (isMulti && multiline(text, lastNode) ? block(v, indentAt(text, node.items[0].start)) : inline(v));
      const insert = next.slice(n).map(v => sep + valueOf(v)).join('');
      replace(lastNode.end, node.items[node.items.length - 1].end, insert);
      return;
    }
    replace(node.start, node.end, render(node, next));
  }

  patch(root, JSON.parse(text), value);
  let out = text;
  for (const e of edits.filter(e => e.start !== e.end || e.insert).sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.insert + out.slice(e.end);
  return out;
}
