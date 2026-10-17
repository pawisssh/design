#!/usr/bin/env node
// Drafted-value fingerprints of a Carbon Contract (#144): the one place SKILL.md §2 step 13's facts are computed,
// so the agent writing a draft and the tests checking it hash the same thing (ADR 0010).
//   node skills/adapter-carbon/scripts/fingerprints.mjs <contract.json> --nodes <nodes.json> [--check] [--dir <dir>]
// prints {key: fingerprint} for every agent entry of the Contract's `drafted` table; --check instead exits 1 and
// names each entry whose fingerprint differs. The source files are read from the sources dir and checked against
// the Contract's `source.files` pins (`sources.mjs` fetches them).
//
// The node map names each anatomy layer the drafts key by its element's classes, without `cds--`, its own class
// first, and an optional :<version> ("text-input__field-wrapper", "text-input-wrapper form-item",
// "form-requirement:invalid"), or, for a layer with no element of its own, the layer whose element draws it:
// {"of": "Box"}. A family's map is kept at skills/adapter-carbon/nodes/<family>.nodes.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { canonical, sha256 } from '../../contract/scripts/contract.mjs';
import { DEFAULT_DIR } from './sources.mjs';

const PREFIX = 'cds';
const fingerprint = facts => `sha256:${sha256(canonical(facts))}`;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every `selector { body }` block of an SCSS text, at any depth, as `<selector> { <body> }`: comments stripped,
 * whitespace collapsed to one space, interpolations as written. A block's body keeps its nested blocks.
 */
function scssBlocks(text) {
  const interp = [];
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/#\{[^}]*\}/g, m => `\u0000${interp.push(m) - 1}\u0000`);
  const back = s => s.replace(/\u0000(\d+)\u0000/g, (_, n) => interp[n]).replace(/\s+/g, ' ').trim();
  const out = [];
  const open = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') { open.push({ selector: src.slice(start, i), at: i }); start = i + 1; }
    else if (src[i] === '}') { const b = open.pop(); out.push({ selector: back(b.selector), text: `${back(b.selector)} { ${back(src.slice(b.at + 1, i))} }` }); start = i + 1; }
    else if (src[i] === ';') start = i + 1;
  }
  return out;
}

/**
 * fingerprints({contract, nodes, files, keys}) -> {facts: {key: facts}, fingerprints: {key: "sha256:…"}}.
 * `files` is {path: text} of the Contract's source files; `keys` defaults to the agent entries of `drafted`.
 * Throws on a layer the node map lacks and on a key with no fingerprint kind.
 */
export function fingerprints({ contract, nodes, files, keys }) {
  const family = contract.family.key;
  const react = Object.entries(files).filter(([p]) => /\.[jt]sx?$/.test(p)).map(([, t]) => t).join('\n');
  const parts = [...new Set([...react.matchAll(new RegExp(`\\$\\{prefix\\}--${escape(family)}__([\\w-]+)`, 'g'))].map(m => m[1]))].sort();
  const blocks = Object.entries(files).filter(([p]) => p.endsWith('.scss')).flatMap(([, t]) => scssBlocks(t));

  const own = layer => {
    const spec = nodes[layer];
    if (spec === undefined) throw new Error(`no node for layer "${layer}" in the node map`);
    if (typeof spec === 'object') {
      const drawer = own(spec.of);
      return { node: layer, element: drawer.element, rules: drawer.rules, of: drawer.node };
    }
    const [classes, version] = spec.split(':');
    const [cls, ...more] = classes.split(' ');
    const key = cls.startsWith(`${family}__`) ? cls.slice(family.length + 2) : cls;
    const names = new RegExp(`#\\{\\$prefix\\}--(${[cls, ...more].map(escape).join('|')})(--[\\w-]+)?(?![\\w-])`);
    return { node: version ? `${key}:${version}` : key, element: [cls, ...more].map(c => `${PREFIX}--${c}`).join(' '),
      rules: blocks.filter(b => names.test(b.selector)).map(b => b.text).sort() };
  };
  const axes = contract.axes || [];
  const values = a => a.values.map(v => v.key);
  const factsOf = key => {
    const [root, ...rest] = key.split('.');
    if (root === 'axes') {
      const a = axes.find(x => x.key === rest[0]);
      if (a) return { kind: 'axis', axis: a.key, values: values(a) };
    }
    if (['family', 'icons', 'figma', 'code'].includes(root))
      return { kind: 'family', axes: Object.fromEntries(axes.map(a => [a.key, values(a)])), defaults: Object.fromEntries(axes.map(a => [a.key, a.default])), parts };
    if (root === 'anatomy') return { kind: 'node', ...own(rest.join('.')), parts };
    const layout = /^layout(\{.*\})?\.([^.]+)\.[^.]+$/.exec(key);
    if (layout) return { kind: 'layout', ...own(layout[2]) };
    if (root === 'properties') {
      const props = contract.properties || [];
      const p = props.find(q => q.key === rest[0]) || props.find(q => (q.binds || []).some(b => b.node === rest[0] && b.field === rest[1]));
      if (p && p.code && p.code.prop && p.binds && p.binds.length) return { kind: 'property', prop: p.code.prop, ...own(p.binds[0].node), parts };
    }
    throw new Error(`no fingerprint kind for "${key}"`);
  };
  const list = keys || Object.entries(contract.drafted || {}).filter(([, e]) => e.by === 'agent').map(([k]) => k);
  const facts = Object.fromEntries(list.map(k => [k, factsOf(k)]));
  return { facts, fingerprints: Object.fromEntries(list.map(k => [k, fingerprint(facts[k])])) };
}

/** True when every file the Contract pins is in the sources dir (readContractSources checks their hashes). */
export function hasContractSources(contract, dir = DEFAULT_DIR) {
  return Object.keys(contract.source.files).every(p => existsSync(join(dir, 'carbon', p)));
}

/** {path: text} of the Contract's source files; throws on a missing file or one whose sha256 is not the pin. */
export function readContractSources(contract, dir = DEFAULT_DIR) {
  const out = {};
  for (const [path, pin] of Object.entries(contract.source.files)) {
    const file = join(dir, 'carbon', path);
    if (!existsSync(file)) throw new Error(`${path} missing in ${dir}; run: node skills/adapter-carbon/scripts/sources.mjs`);
    const text = readFileSync(file, 'utf8');
    if (`sha256:${sha256(text)}` !== pin) throw new Error(`${path}: sha256 does not match the Contract's pin ${pin}`);
    out[path] = text;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      nodes: { type: 'string' }, check: { type: 'boolean' }, dir: { type: 'string', default: DEFAULT_DIR } } });
    if (positionals.length !== 1 || !values.nodes) throw new Error('usage: fingerprints.mjs <contract.json> --nodes <nodes.json> [--check] [--dir <dir>]');
    const contract = JSON.parse(readFileSync(positionals[0], 'utf8'));
    const nodes = JSON.parse(readFileSync(values.nodes, 'utf8'));
    const { fingerprints: fp } = fingerprints({ contract, nodes, files: readContractSources(contract, values.dir) });
    if (!values.check) console.log(JSON.stringify(fp, null, 2));
    else {
      const moved = Object.keys(fp).filter(k => contract.drafted[k].fingerprint !== fp[k]);
      for (const k of moved) console.error(`${k}: fingerprint ${contract.drafted[k].fingerprint}, the facts give ${fp[k]}`);
      if (moved.length) process.exitCode = 1;
      else console.log(`OK ${Object.keys(fp).length} fingerprints`);
    }
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
