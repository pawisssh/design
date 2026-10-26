#!/usr/bin/env node
// Drafted-value fingerprints of a CDS Contract (#387, ADR 0010, SKILL.md's Contract steps): the facts each drafted
// value rests on, computed in one place so the agent writing a draft and the tests checking it hash the same thing.
//   node skills/adapter-cds/scripts/fingerprints.mjs <contract.json> --nodes <nodes.json> [--check] [--dir <dir>]
// prints {key: fingerprint} for every agent entry of the Contract's `drafted` table. With --check it prints
// `OK <n> fingerprints`, or names each entry whose recorded fingerprint differs and exits 1. The files are read from
// the sources dir and checked against the Contract's `source.files` pins (`sources.mjs` fetches them).
// A family's node map is kept at skills/adapter-cds/nodes/<family>.nodes.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { draftedFingerprints } from '../../contract/scripts/contract.mjs';
import { CDS, DEFAULT_DIR, hasSources, readSources } from './sources.mjs';

/**
 * fingerprints({contract, nodes, files, keys}) -> {facts: {key: facts}, fingerprints: {key: "sha256:…"}}.
 * `files` is {path: text} of the Contract's source files; `keys` defaults to the agent entries of `drafted`.
 * Throws on a family TSX the files lack, a layer the node map lacks, a literal the TSX lacks, and a key with no
 * fingerprint kind.
 */
export function fingerprints({ contract, nodes, files, keys }) {
  // The family's own TSX, `<Family name without spaces>.tsx`, is the only file hashed (#387): CDS styles a component
  // with Linaria `css` literals there (`const startNodeCss = css\`…\``), so a layer's facts are the literals its
  // element carries, not stylesheet selectors.
  const tsx = `${contract.family.name.replace(/\s+/g, '')}.tsx`;
  const path = Object.keys(files).find(p => p.endsWith(`/${tsx}`));
  if (!path) throw new Error(`no ${tsx} among the Contract's source files`);
  // Each literal as `<name> { <body> }`: comments stripped, whitespace collapsed to one space, `${…}` as written.
  const literals = {};
  for (const [, name, body] of files[path].matchAll(/const\s+(\w+)\s*=\s*css`([^`]*)`/g))
    literals[name] = `${name} { ${body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()} }`;
  // The node map names a layer by its element's static class (`cds-Button`) and the literals it carries, the
  // identifying entry first ("cds-Button baseCss iconCss", "startNodeCss"). The node key is that entry, `cds-` dropped.
  const nodeFacts = layer => {
    if (nodes[layer] === undefined) throw new Error(`no node for layer "${layer}" in the node map`);
    const entries = nodes[layer].split(' ');
    for (const e of entries) if (!e.startsWith('cds-') && !literals[e])
      throw new Error(`layer "${layer}": ${e} is neither a cds- class nor a css literal of ${tsx}`);
    return { node: entries[0].replace(/^cds-/, ''), element: entries.join(' '),
      rules: entries.filter(e => literals[e]).map(e => literals[e]).sort() };
  };
  return draftedFingerprints(contract, { nodeFacts, parts: Object.keys(literals).sort(), keys });
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
