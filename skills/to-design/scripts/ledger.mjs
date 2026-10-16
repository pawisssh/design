#!/usr/bin/env node
// The ledger: one per Design Library file, in gitignored .scratch/to-design/<fileKey>.ledger.json.
// It maps flat names to Figma ids. Each slice returns its own section (`{ledger: {foundations}}`),
// which `record` merges into the file; other sections are kept.
//
//   node skills/to-design/scripts/ledger.mjs record <result.json> [--ledger <path>]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const ledgerPath = (fileKey, root = process.env.CLAUDE_PROJECT_DIR || process.cwd()) =>
  join(root, '.scratch', 'to-design', `${fileKey}.ledger.json`);

// The main checkout's folder when `dir` is in a linked git worktree; null in the main checkout, outside a repo, or without git.
function mainCheckoutOf(dir) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], { cwd: dir, encoding: 'utf8' });
  const lines = r.status === 0 ? r.stdout.trim().split('\n') : [];
  // a git without --path-format echoes the flag back: anything but two absolute paths is not a verdict
  if (lines.length !== 2 || !lines.every(l => isAbsolute(l))) return null;
  const [gitDir, commonDir] = lines;
  return gitDir !== commonDir ? dirname(commonDir) : null;
}

/**
 * The ledger path for a CLI given no `--ledger`. Refused from a linked worktree: its own `.scratch` would
 * fork the ledger away from the main checkout's, which every other session reads.
 */
export function defaultLedgerPath(fileKey, root = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const main = mainCheckoutOf(root);
  if (main) throw new Error(`${root} is a git worktree, so its .scratch is not the shared ledger: pass --ledger ${ledgerPath(fileKey, main)}`);
  return ledgerPath(fileKey, root);
}

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
      // ids are by expansion index, so a set rebuilt from another Contract starts a fresh list
      const keep = old && Array.isArray(old.variants) && old.variants.length === rec.total && old.contentHash === rec.contentHash;
      const variants = keep ? old.variants.slice() : new Array(rec.total).fill(null);
      for (const [i, id] of Object.entries(rec.variants || {})) variants[Number(i)] = id;
      out.sets[family] = { ...rec, variants };
    }
  }
  return out;
}

function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { ledger: { type: 'string' } } });
  } catch {
    args = { positionals: [], values: {} };
  }
  const [command, resultPath] = args.positionals;
  if (command !== 'record' || !resultPath) {
    console.error('usage: ledger.mjs record <result.json> [--ledger <path>]');
    process.exit(2);
  }
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  const path = args.values.ledger || defaultLedgerPath(result.fileKey);
  const ledger = recordResult(readLedger(path), result);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'recorded', ledger: path, slice: result.slice, summary: result.summary }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`ledger: ${e.message}`); process.exit(1); }
}
