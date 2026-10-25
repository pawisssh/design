#!/usr/bin/env node
// Drafted-value fingerprints of a CDS Contract (#387, ADR 0010, SKILL.md's Contract steps): the facts each drafted
// value rests on, computed in one place so the agent writing a draft and the tests checking it hash the same thing.
//   node skills/adapter-cds/scripts/fingerprints.mjs <contract.json> --nodes <nodes.json> [--check] [--dir <dir>]
// prints {key: fingerprint} for every agent entry of the Contract's `drafted` table. With --check it prints
// `OK <n> fingerprints`, or names each entry whose recorded fingerprint differs and exits 1. The files are read from
// the sources dir and checked against the Contract's `source.files` pins (`sources.mjs` fetches them).
//
// CDS styles a component with Linaria `css` literals in its own TSX (`const startNodeCss = css\`…\``), so the facts
// of a layer are the literals its element carries, not stylesheet selectors. The node map names each anatomy layer
// by its element's static class (`cds-Button`) or the literals it carries, the one that identifies it first
// ("cds-Button baseCss iconCss", "startNodeCss"). A family's map is kept at skills/adapter-cds/nodes/<family>.nodes.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { canonical, sha256 } from '../../contract/scripts/contract.mjs';
import { CDS, DEFAULT_DIR, hasSources, readSources } from './sources.mjs';

/** The family's own TSX among the Contract's files: `<Family name without spaces>.tsx`. */
function familySource(contract, files) {
  const name = `/${contract.family.name.replace(/\s+/g, '')}.tsx`;
  const path = Object.keys(files).find(p => p.endsWith(name));
  if (!path) throw new Error(`no ${name.slice(1)} among the Contract's source files`);
  return files[path];
}

/**
 * Each `const <name> = css\`<body>\`` of a TSX text, as {name: "<name> { <body> }"}: comments stripped, whitespace
 * collapsed to one space, `${…}` interpolations as written.
 */
function cssLiterals(text) {
  const out = {};
  for (const [, name, body] of text.matchAll(/const\s+(\w+)\s*=\s*css`([^`]*)`/g))
    out[name] = `${name} { ${body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()} }`;
  return out;
}

/**
 * fingerprints({contract, nodes, files, keys}) -> {facts: {key: facts}, fingerprints: {key: "sha256:…"}}.
 * `files` is {path: text} of the Contract's source files; `keys` defaults to the agent entries of `drafted`.
 * Throws on a layer the node map lacks, a literal the family's TSX lacks, and a key with no fingerprint kind.
 */
export function fingerprints({ contract, nodes, files, keys }) {
  const literals = cssLiterals(familySource(contract, files));
  const parts = Object.keys(literals).sort();
  const nodeFacts = layer => {
    if (nodes[layer] === undefined) throw new Error(`no node for layer "${layer}" in the node map`);
    const entries = nodes[layer].split(' ');
    for (const e of entries) if (!e.startsWith('cds-') && !literals[e])
      throw new Error(`layer "${layer}": ${e} is neither a cds- class nor a css literal of ${contract.family.name.replace(/\s+/g, '')}.tsx`);
    return { node: entries[0].replace(/^cds-/, ''), element: entries.join(' '),
      rules: entries.filter(e => literals[e]).map(e => literals[e]).sort() };
  };
  const axes = contract.axes || [];
  const values = a => a.values.map(v => v.key);
  const factsOf = key => {
    const [root, ...rest] = key.split('.');
    const axis = root === 'axes' && axes.find(a => a.key === rest[0]);
    if (axis) return { kind: 'axis', axis: axis.key, values: values(axis) };
    if (['family', 'icons', 'figma', 'code'].includes(root))
      return { kind: 'family', axes: Object.fromEntries(axes.map(a => [a.key, values(a)])), defaults: Object.fromEntries(axes.map(a => [a.key, a.default])), parts };
    if (root === 'anatomy') return { kind: 'node', ...nodeFacts(rest.join('.')), parts };
    const layout = /^layout(\{.*\})?\.([^.]+)\.[^.]+$/.exec(key);
    if (layout) return { kind: 'layout', ...nodeFacts(layout[2]) };
    const p = root === 'properties' && (contract.properties || []).find(q => q.key === rest[0]);
    if (p && p.code && p.code.prop && p.binds && p.binds.length) return { kind: 'property', prop: p.code.prop, ...nodeFacts(p.binds[0].node), parts };
    throw new Error(`no fingerprint kind for "${key}"`);
  };
  const list = keys || Object.entries(contract.drafted || {}).filter(([, e]) => e.by === 'agent').map(([k]) => k);
  const facts = Object.fromEntries(list.map(k => [k, factsOf(k)]));
  return { facts, fingerprints: Object.fromEntries(list.map(k => [k, `sha256:${sha256(canonical(facts[k]))}`])) };
}

// The Contract's own pin, in the shape sources.mjs reads: its files at its commit, no packages.
const contractPin = contract => ({ ...CDS, commit: contract.source.commit, packages: {},
  files: Object.fromEntries(Object.entries(contract.source.files).map(([p, h]) => [p, h.replace(/^sha256:/, '')])) });

/** True when every file the Contract pins is in the sources dir (readContractSources checks their hashes). */
export const hasContractSources = (contract, dir = DEFAULT_DIR) => hasSources(dir, contractPin(contract));

/** {path: text} of the Contract's source files; throws on a missing file or one whose sha256 is not the pin. */
export const readContractSources = (contract, dir = DEFAULT_DIR) => readSources(dir, contractPin(contract)).files;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const usage = 'usage: fingerprints.mjs <contract.json> --nodes <nodes.json> [--check] [--dir <dir>]';
  try {
    const { values: opt, positionals: [path, ...extra] } = parseArgs({ allowPositionals: true,
      options: { nodes: { type: 'string' }, check: { type: 'boolean' }, dir: { type: 'string', default: DEFAULT_DIR } } });
    if (!path || extra.length || !opt.nodes) throw new Error(usage);
    const read = p => JSON.parse(readFileSync(p, 'utf8'));
    const contract = read(path);
    const fp = fingerprints({ contract, nodes: read(opt.nodes), files: readContractSources(contract, opt.dir) }).fingerprints;
    if (!opt.check) console.log(JSON.stringify(fp, null, 2));
    else {
      const stale = Object.entries(fp).filter(([k, v]) => contract.drafted[k].fingerprint !== v);
      stale.forEach(([k, v]) => console.error(`${k}: recorded ${contract.drafted[k].fingerprint}, computed ${v}`));
      if (stale.length) process.exitCode = 1;
      else console.log(`OK ${Object.keys(fp).length} fingerprints`);
    }
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
