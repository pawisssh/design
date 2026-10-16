#!/usr/bin/env node
// The ledger: one per Design Library file, in gitignored .scratch/to-design/<fileKey>.ledger.json.
// It maps flat names to Figma ids. Each slice returns its own section (`{ledger: {foundations}}`),
// which `record` merges into the file; other sections are kept.
//
//   node skills/to-design/scripts/ledger.mjs record <result.json>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ledgerPath = (fileKey, root = process.env.CLAUDE_PROJECT_DIR || process.cwd()) =>
  join(root, '.scratch', 'to-design', `${fileKey}.ledger.json`);

export const emptyLedger = fileKey => ({ schemaVersion: 1, fileKey, foundations: null, sets: {} });

export const readLedger = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

/**
 * The ledger after a slice result. Refuses an error result; a result with conflicts carries the old section back
 * unchanged. Sections replace whole, except `sets` (#32): a sets call returns its one family, with the variant ids
 * of its own entries as {expansion index: id or null}. The other families are kept, and the ids are merged into
 * the family's list of `total` ids, so a call carries no ids beyond its batch.
 */
export function recordResult(ledger, result) {
  if (!result || result.error) throw new Error(`not recording a failed call: ${result && result.error}`);
  if (!result.fileKey || !result.ledger) throw new Error('result has no fileKey or ledger');
  if (ledger && ledger.fileKey !== result.fileKey) throw new Error(`ledger is for ${ledger.fileKey}, result for ${result.fileKey}`);
  const before = ledger || emptyLedger(result.fileKey);
  const out = { ...before, ...result.ledger };
  if (result.slice === 'sets' && result.ledger.sets) {
    out.sets = { ...(before.sets || {}) };
    for (const [family, rec] of Object.entries(result.ledger.sets)) {
      const old = out.sets[family];
      const variants = old && Array.isArray(old.variants) && old.variants.length === rec.total ? old.variants.slice() : new Array(rec.total).fill(null);
      for (const [i, id] of Object.entries(rec.variants || {})) variants[Number(i)] = id;
      out.sets[family] = { ...rec, variants };
    }
  }
  return out;
}

function main() {
  const [command, resultPath] = process.argv.slice(2);
  if (command !== 'record' || !resultPath) {
    console.error('usage: ledger.mjs record <result.json>');
    process.exit(2);
  }
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  const path = ledgerPath(result.fileKey);
  const ledger = recordResult(readLedger(path), result);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'recorded', ledger: path, slice: result.slice, summary: result.summary }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
