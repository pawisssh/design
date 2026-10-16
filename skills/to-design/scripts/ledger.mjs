#!/usr/bin/env node
// The ledger: one per Design Library file, in gitignored .scratch/to-design/<fileKey>.ledger.json.
// It maps flat names to Figma ids. Each slice returns its own section (`{ledger: {foundations}}`),
// which `record` merges into the file; other sections are kept. `foundationsGroups` is the owner's
// selection (`groups`), which no slice returns.
//
//   node skills/to-design/scripts/ledger.mjs record <result.json> [--ledger <path>]
//   node skills/to-design/scripts/ledger.mjs prune-list <prune-preview result.json> --name <variant name> [--name ...] --out <prune.json>
//   node skills/to-design/scripts/ledger.mjs groups --doc <foundations.json> --file-key <key> [--add <group>] [--remove <group>] [--ledger <path>]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { selectedGroups, selection } from './foundations-subset.mjs';

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
 * unchanged. Sections replace whole, except `foundations`, whose names a chunked build returns a chunk at a time
 * (#107), and `sets` (#32): a sets call returns its one family, with the variant ids
 * of its own entries as {expansion index: id or null}. The other families are kept, and the ids are merged into
 * the family's list of `total` ids, so a call carries no ids beyond its batch.
 */
export function recordResult(ledger, result) {
  if (!result || result.error) throw new Error(`not recording a failed call: ${result && result.error}`);
  if (!result.fileKey || !result.ledger) throw new Error('result has no fileKey or ledger');
  if (ledger && ledger.fileKey !== result.fileKey) throw new Error(`ledger is for ${ledger.fileKey}, result for ${result.fileKey}`);
  const before = ledger || emptyLedger(result.fileKey);
  const out = { ...before, ...result.ledger };
  // a chunk's state holds only its own names (#107), so names the result neither holds nor orphaned are kept;
  // a single call's state holds every name, so this is its result unchanged
  const f = result.slice === 'foundations' && result.ledger.foundations;
  if (f && before.foundations) {
    const keep = kind => Object.fromEntries(Object.entries(before.foundations[kind] || {})
      .filter(([n]) => !(n in (f[kind] || {})) && !((f.orphans || {})[kind] || {})[n]));
    out.foundations = { ...f, variables: { ...f.variables, ...keep('variables') }, textStyles: { ...f.textStyles, ...keep('textStyles') } };
  }
  if (result.slice === 'sets' && result.ledger.sets) {
    out.sets = { ...(before.sets || {}) };
    for (const [family, rec] of Object.entries(result.ledger.sets)) {
      const old = out.sets[family];
      // ids are by expansion index, so a set rebuilt from another Contract starts a fresh list
      const keep = old && Array.isArray(old.variants) && old.variants.length === rec.total && old.contentHash === rec.contentHash;
      const variants = keep ? old.variants.slice() : new Array(rec.total).fill(null);
      for (const [i, id] of Object.entries(rec.variants || {})) variants[Number(i)] = id;
      out.sets[family] = { ...rec, variants, orphans: orphansAfter(old, result, variants, rec.builtAt) };
    }
  }
  return out;
}

/**
 * A family's orphans after a sets result (#67, ADR 0003): the variants the selection dropped, by variant name,
 * as {id, key, droppedAt}. A dropped variant becomes an orphan only when the ledger recorded its id (as a
 * variant or an orphan) before this result; a node it never recorded stays `extra`. An orphan keeps the name
 * and droppedAt it was first recorded with, even if a hand renames its node. It leaves the list when a rebuild
 * records its id as a variant again, when a build or reconcile no longer finds it in the set (they report every
 * node the selection dropped), or when a prune deletes it.
 */
function orphansAfter(old, result, variants, at) {
  const before = (old && old.orphans) || {};
  const known = new Set([...((old && old.variants) || []), ...Object.values(before).map(o => o.id)]);
  const nameOf = new Map(Object.entries(before).map(([name, o]) => [o.id, name]));
  const orphans = Array.isArray(result.dropped) ? {} : { ...before };
  for (const [name, id, key] of result.dropped || []) {
    if (nameOf.has(id)) orphans[nameOf.get(id)] = before[nameOf.get(id)];
    else if (known.has(id) && !orphans[name]) orphans[name] = { id, key, droppedAt: at };
  }
  for (const name of result.pruned || []) delete orphans[name];
  for (const [name, o] of Object.entries(orphans)) if (variants.includes(o.id)) delete orphans[name];
  return orphans;
}

/**
 * The prune list for the orphans the owner named in chat, from a `prune-preview` result (#67): {variant name:
 * instance count the owner saw}. A prune run deletes only these, and refuses any whose count has changed.
 */
export function pruneList(preview, names) {
  if (!preview || preview.slice !== 'sets' || preview.mode !== 'prune-preview' || !preview.orphans) throw new Error('not a prune-preview result');
  if (!names.length) throw new Error('name at least one orphan the owner confirmed');
  const prune = {};
  for (const name of names) {
    if (!(name in preview.orphans)) throw new Error(`${name} is not an orphan in the preview`);
    prune[name] = preview.orphans[name];
  }
  return { schemaVersion: 1, fileKey: preview.fileKey, family: preview.family, prune };
}

/**
 * The ledger with the owner's foundations groups changed (#107, ADR 0006): `foundationsGroups` names the groups the
 * file builds next to the closure (Spacing and Size until the owner changes it). A slice result never carries this
 * section, so recording a build keeps it. A removed group's variables become orphans on the next foundations build.
 */
export function setGroups(ledger, fileKey, doc, { add = [], remove = [] } = {}) {
  if (ledger && ledger.fileKey !== fileKey) throw new Error(`ledger is for ${ledger.fileKey}, not ${fileKey}`);
  const groups = new Set(selectedGroups(ledger, doc));
  const absent = remove.filter(g => !groups.has(g));
  if (absent.length) throw new Error(`${absent.join(', ')} is not a selected group (selected: ${[...groups].join(', ')})`);
  for (const g of remove) groups.delete(g);
  for (const g of add) groups.add(g);
  const foundationsGroups = [...groups].sort();
  selection(doc, foundationsGroups);
  return { ...(ledger || emptyLedger(fileKey)), foundationsGroups };
}

const USAGE = [
  'usage: ledger.mjs record <result.json> [--ledger <path>]',
  '       ledger.mjs prune-list <prune-preview result.json> --name <variant name> [--name ...] --out <prune.json>',
  '       ledger.mjs groups --doc <foundations.json> --file-key <key> [--add <group>] [--remove <group>] [--ledger <path>]',
].join('\n');

function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: {
      ledger: { type: 'string' }, name: { type: 'string', multiple: true }, out: { type: 'string' },
      doc: { type: 'string' }, 'file-key': { type: 'string' }, add: { type: 'string', multiple: true }, remove: { type: 'string', multiple: true },
    } });
  } catch {
    args = { positionals: [], values: {} };
  }
  const [command, resultPath] = args.positionals;
  if (command === 'groups') {
    const { doc, 'file-key': fileKey } = args.values;
    if (!doc || !fileKey) { console.error(USAGE); process.exit(2); }
    const path = args.values.ledger || defaultLedgerPath(fileKey);
    const ledger = setGroups(readLedger(path), fileKey, JSON.parse(readFileSync(doc, 'utf8')), { add: args.values.add || [], remove: args.values.remove || [] });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'written', ledger: path, groups: ledger.foundationsGroups }));
    return;
  }
  if (!['record', 'prune-list'].includes(command) || !resultPath || (command === 'prune-list' && !args.values.out)) {
    console.error(USAGE);
    process.exit(2);
  }
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  if (command === 'prune-list') {
    const list = pruneList(result, args.values.name || []);
    mkdirSync(dirname(args.values.out), { recursive: true });
    writeFileSync(args.values.out, JSON.stringify(list, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'written', out: args.values.out, ...list }));
    return;
  }
  const path = args.values.ledger || defaultLedgerPath(result.fileKey);
  const ledger = recordResult(readLedger(path), result);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
  // a build call's dropped variants: the ones the ledger keeps as orphans, and the ones it never recorded (extra)
  const kept = new Set(Object.values((result.slice === 'sets' && ledger.sets[result.family].orphans) || {}).map(o => o.id));
  const dropped = result.dropped || [];
  const names = tracked => dropped.filter(d => kept.has(d[1]) === tracked).map(d => d[0]);
  const report = dropped.length ? { orphaned: names(true), extra: names(false) } : {};
  console.log(JSON.stringify({ status: 'recorded', ledger: path, slice: result.slice, summary: result.summary, ...report }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`ledger: ${e.message}`); process.exit(1); }
}
