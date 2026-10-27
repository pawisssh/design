// The command line every Adapter's fingerprints.mjs runs (ADR 0010), so each checks and writes a `drafted` table alike:
//   node skills/adapter-<x>/scripts/fingerprints.mjs <contract.json> --nodes <nodes.json> [--check | --write] [--dir <dir>]
// With neither flag it prints {key: fingerprint} for every agent entry of `drafted`.
// --check prints `OK <n> fingerprints`, or names on stderr each entry whose fingerprint moved and each citation
// `draftedEvidence` or `reasonEvidence` refuses, and exits 1. An approved Contract's citations print as `note:` lines
// and pass: its evidence changes at its next re-approval, never by a write that voids the approval.
// --write records the computed fingerprints, writing the Contract as a draft only when one changed, and prints each
// entry whose recorded fingerprint moved: those are the values to re-draft (an entry with none yet is only recorded).
// Then it checks the citations as --check does.
import { parseArgs } from 'node:util';
import { asDraft, draftedEvidence, reasonEvidence } from './contract.mjs';
import { readJson, writeJson } from './io.mjs';

/**
 * Runs the CLI on process.argv. `fingerprints({contract, nodes, files})` and `readContractSources(contract, dir)` are
 * the Adapter's; `normalise` goes to draftedEvidence and reasonEvidence; `dir` is the default sources dir.
 */
export function fingerprintsCli({ fingerprints, readContractSources, normalise, dir }) {
  const usage = 'usage: fingerprints.mjs <contract.json> --nodes <nodes.json> [--check | --write] [--dir <dir>]';
  try {
    const { values: opt, positionals: [path, ...extra] } = parseArgs({ allowPositionals: true, options: {
      nodes: { type: 'string' }, check: { type: 'boolean' }, write: { type: 'boolean' }, dir: { type: 'string', default: dir } } });
    if (!path || extra.length || !opt.nodes || (opt.check && opt.write)) throw new Error(usage);
    const contract = readJson(path);
    const files = readContractSources(contract, opt.dir);
    const fp = fingerprints({ contract, nodes: readJson(opt.nodes), files }).fingerprints;
    if (!opt.check && !opt.write) return console.log(JSON.stringify(fp, null, 2));
    const changed = Object.keys(fp).filter(k => contract.drafted[k].fingerprint !== fp[k]);
    // Still approved after this run: its citations are notes, never a failure.
    let approved = contract.selection && contract.selection.status === 'approved';
    if (opt.write) {
      if (changed.length) {
        const next = structuredClone(contract);
        for (const k of changed) next.drafted[k].fingerprint = fp[k];
        writeJson(path, asDraft(next));
        approved = false;
      }
      changed.filter(k => contract.drafted[k].fingerprint !== undefined)
        .forEach(k => console.log(`${k}: ${contract.drafted[k].fingerprint} -> ${fp[k]}, re-draft it`));
    } else changed.forEach(k => console.error(`${k}: recorded ${contract.drafted[k].fingerprint}, computed ${fp[k]}`));
    const cites = [...draftedEvidence(contract, files, normalise), ...reasonEvidence(contract, files, normalise)];
    if (!approved) cites.forEach(c => console.error(c));
    if ((opt.check && changed.length) || (!approved && cites.length)) process.exitCode = 1;
    else console.log(opt.write ? `OK wrote ${changed.length} of ${Object.keys(fp).length} fingerprints` : `OK ${Object.keys(fp).length} fingerprints`);
    if (approved) cites.forEach(c => console.log(`note: ${c}`));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
