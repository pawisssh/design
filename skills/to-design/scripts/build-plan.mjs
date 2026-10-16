#!/usr/bin/env node
// Build-plan deriver (To-design). Derives the foundations part of the build plan from the foundations
// document, the Design Library file's ledger and the run options, and writes plan.json and state.json
// for the packager. The plan is disposable: re-derive it for every call.
//
//   node skills/to-design/scripts/build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir>
//        [--adopt] [--prune name,name] [--page "Page 1"] [--ledger <path>]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { emptyLedger, ledgerPath, readLedger } from './ledger.mjs';

// Fields only a reviewer reads. The core never needs them, so the package leaves them out.
const REVIEW_ONLY = { document: ['source', 'closure', 'checks', 'notes'], entry: ['source', 'usedBy'], value: ['from', 'reason', 'level', 'resolved'] };
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

/** The foundations document without its review-only fields. */
export function stripReviewFields(doc) {
  return {
    ...omit(doc, REVIEW_ONLY.document),
    variables: mapValues(doc.variables, v => ({ ...omit(v, REVIEW_ONLY.entry), values: mapValues(v.values, x => omit(x, REVIEW_ONLY.value)) })),
    textStyles: mapValues(doc.textStyles, s => omit(s, REVIEW_ONLY.entry)),
  };
}

/** sha256 of the document bytes, as the ledger records it. */
export const documentHash = docText => `sha256:${createHash('sha256').update(docText, 'utf8').digest('hex')}`;

/**
 * The foundations slice's plan and state.
 * `docText` is the document file's text (its bytes are the documentHash); `ledger` is the file's ledger or null.
 * Options: fileKey (required), adopt, prune (orphan names the owner confirmed for deletion), page, at, strip.
 */
export function foundationsPlan(docText, ledger, { fileKey, adopt = false, prune = [], page = null, at = new Date().toISOString(), strip = true } = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (ledger && ledger.fileKey !== fileKey) throw new Error(`ledger is for ${ledger.fileKey}, not ${fileKey}`);
  const doc = JSON.parse(docText);
  if (doc.schemaVersion !== 1) throw new Error('foundations document schemaVersion must be 1');
  const plan = {
    schemaVersion: 1,
    slice: 'foundations',
    fileKey,
    page,
    at,
    options: { adopt: !!adopt, prune: [...prune] },
    designSystem: doc.designSystem.key,
    snapshotId: doc.source.snapshotId,
    documentHash: documentHash(docText),
    foundations: strip ? stripReviewFields(doc) : doc,
  };
  return { plan, state: ledger || emptyLedger(fileKey) };
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      doc: { type: 'string' }, 'file-key': { type: 'string' }, out: { type: 'string' }, ledger: { type: 'string' },
      adopt: { type: 'boolean', default: false }, prune: { type: 'string', default: '' }, page: { type: 'string' },
    },
  });
  if (positionals[0] !== 'foundations' || !values.doc || !values['file-key'] || !values.out) {
    console.error('usage: build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir> [--adopt] [--prune a,b] [--page <name>] [--ledger <path>]');
    process.exit(2);
  }
  const fileKey = values['file-key'];
  const path = values.ledger || ledgerPath(fileKey);
  const { plan, state } = foundationsPlan(readFileSync(values.doc, 'utf8'), readLedger(path), {
    fileKey, adopt: values.adopt, prune: values.prune ? values.prune.split(',').map(s => s.trim()).filter(Boolean) : [], page: values.page ?? null,
  });
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(join(values.out, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'derived', slice: plan.slice, fileKey, ledger: path, documentHash: plan.documentHash, options: plan.options, out: values.out }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
