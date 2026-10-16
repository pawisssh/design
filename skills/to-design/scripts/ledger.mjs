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

/** The ledger after a slice result. Refuses an error result; a result with conflicts carries the old section back unchanged. */
export function recordResult(ledger, result) {
  if (!result || result.error) throw new Error(`not recording a failed call: ${result && result.error}`);
  if (!result.fileKey || !result.ledger) throw new Error('result has no fileKey or ledger');
  if (ledger && ledger.fileKey !== result.fileKey) throw new Error(`ledger is for ${ledger.fileKey}, result for ${result.fileKey}`);
  return { ...(ledger || emptyLedger(result.fileKey)), ...result.ledger };
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
