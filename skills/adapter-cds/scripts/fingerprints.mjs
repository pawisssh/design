#!/usr/bin/env node
// Drafted-value fingerprints of a CDS Contract (#387, ADR 0010, SKILL.md's Contract steps): the facts each drafted
// value rests on, computed in one place so the agent writing a draft and the tests checking it hash the same thing.
//   node skills/adapter-cds/scripts/fingerprints.mjs <contract.json> --nodes <nodes.json> [--check | --write] [--dir <dir>]
// runs the shared command line (skills/contract/scripts/fingerprints-cli.mjs). The files are read from the sources
// dir and checked against the Contract's `source.files` pins (`sources.mjs` fetches them).
// A family's node map is kept at skills/adapter-cds/nodes/<family>.nodes.json.
import { fileURLToPath } from 'node:url';
import { draftedFingerprints } from '../../contract/scripts/contract.mjs';
import { fingerprintsCli } from '../../contract/scripts/fingerprints-cli.mjs';
import { CDS, DEFAULT_DIR, hasSources, readSources } from './sources.mjs';

/**
 * The path of the family's own TSX among `paths`: `<Family name without spaces>.tsx`. Its literals are what a layer's
 * facts hash (#387): CDS styles a component with Linaria `css` literals there (`const startNodeCss = css\`…\``), not
 * with stylesheet selectors. Throws when no path is that file.
 */
export function familyTsx(contract, paths) {
  const tsx = `${contract.family.name.replace(/\s+/g, '')}.tsx`;
  const path = paths.find(p => p.endsWith(`/${tsx}`));
  if (!path) throw new Error(`no ${tsx} among the Contract's source files`);
  return path;
}

/**
 * {name: {member: body}} of the Records of `css` literals in a TSX's text. In #478: an element can carry only a member
 * of one (Avatar's fallback Box: `className={borderRadiusCss[shape]}`, `const borderRadiusCss: Record<AvatarShape,
 * LinariaClassName> = { circle: css`…`, … }`), so the node map names it by its Record, `borderRadiusCss`.
 */
export function literalRecords(text) {
  const out = {};
  for (const [, name, body] of text.matchAll(/const\s+(\w+)\s*(?::[^=;]+)?=\s*\{((?:\s*\w+:\s*css`[^`]*`,?)+)\s*\};/g))
    out[name] = Object.fromEntries([...body.matchAll(/(\w+):\s*css`([^`]*)`/g)].map(([, member, rule]) => [member, rule]));
  return out;
}

/**
 * fingerprints({contract, nodes, files, keys}) -> {facts: {key: facts}, fingerprints: {key: "sha256:…"}}.
 * `files` is {path: text} of the Contract's source files; `keys` defaults to the agent entries of `drafted`.
 * Throws on a family TSX the files lack, a layer the node map lacks, a literal the TSX lacks, and a key with no
 * fingerprint kind.
 */
export function fingerprints({ contract, nodes, files, keys }) {
  const path = familyTsx(contract, Object.keys(files));
  const tsx = path.split('/').pop();
  // Each literal as `<name> { <body> }`: comments stripped, whitespace collapsed to one space, `${…}` as written.
  const clean = body => body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  const literals = {};
  for (const [, name, body] of files[path].matchAll(/const\s+(\w+)\s*=\s*css`([^`]*)`/g))
    literals[name] = `${name} { ${clean(body)} }`;
  // A Record of literals as `<name> { <member> { <body> } … }`, its members in source order.
  for (const [name, members] of Object.entries(literalRecords(files[path])))
    literals[name] = `${name} { ${Object.entries(members).map(([m, body]) => `${m} { ${clean(body)} }`).join(' ')} }`;
  // The node map names a layer by its element's static class (`cds-Button`) and the literals it carries, the
  // identifying entry first ("cds-Button baseCss iconCss", "startNodeCss"). The node key is that entry, `cds-` dropped.
  // In #470: a family with no `cds-<Family>` class is keyed by the static class CDS gives the element, in either case
  // (`cds-tag`, `cds-Control`), else by the element's first literal (`checkboxCss`), so a static class comes first.
  const nodeFacts = layer => {
    if (nodes[layer] === undefined) throw new Error(`no node for layer "${layer}" in the node map`);
    const entries = nodes[layer].split(' ');
    for (const e of entries) if (!e.startsWith('cds-') && !literals[e])
      throw new Error(`layer "${layer}": ${e} is neither a cds- class nor a css literal of ${tsx}`);
    const fixed = entries.find(e => e.startsWith('cds-'));
    if (fixed && fixed !== entries[0])
      throw new Error(`layer "${layer}": its static class ${fixed} is the identifying entry, so it comes first`);
    return { node: entries[0].replace(/^cds-/, ''), element: entries.join(' '),
      rules: entries.filter(e => literals[e]).map(e => literals[e]).sort() };
  };
  // A layer drafted from another component's file (Track and Arc from ProgressCircle.tsx) also holds that file's pin:
  // a change there reopens it (#459).
  return draftedFingerprints(contract, { nodeFacts, parts: Object.keys(literals).sort(), keys, cited: p => p !== path });
}

// The Contract's own pin, in the shape sources.mjs reads: its files at its commit, no packages.
const contractPin = contract => ({ ...CDS, commit: contract.source.commit, packages: {},
  files: Object.fromEntries(Object.entries(contract.source.files).map(([p, h]) => [p, h.replace(/^sha256:/, '')])) });

/** True when every file the Contract pins is in the sources dir (readContractSources checks their hashes). */
export const hasContractSources = (contract, dir = DEFAULT_DIR) => hasSources(dir, contractPin(contract));

/** {path: text} of the Contract's source files; throws on a missing file or one whose sha256 is not the pin. */
export const readContractSources = (contract, dir = DEFAULT_DIR) => readSources(dir, contractPin(contract)).files;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  fingerprintsCli({ fingerprints, readContractSources, dir: DEFAULT_DIR });
