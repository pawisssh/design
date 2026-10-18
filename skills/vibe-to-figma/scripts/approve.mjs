#!/usr/bin/env node
// Vibe-to-Figma's one approve (#177). Run it only after the owner's own chat message says "approve" or
// "approve except <family>[, <family>]", and pass that message verbatim as --said. It reads the review page's
// combined export, applies each family's omit (To-preview's omitApplied) and approves every Contract but the
// excepted ones, in one act: every family is applied and checked before any file is written.
//
//   node skills/vibe-to-figma/scripts/approve.mjs design-systems/<name> --export <name>.review.json --said "<message>"
//
// The Foundations document has no approval of its own (it is a pure function of its inputs): approve checks that it
// is the one the page showed (its documentHash) and that its closure lists each Contract at its snapshot, and
// writes nothing to it. Tests pass `test: true`, which writes the test approver and only under <repo>/.scratch/.
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { approve, contentHash, sha256, validate } from '../../contract/scripts/contract.mjs';
import { readJson, writeJson } from '../../contract/scripts/io.mjs';
import { omitApplied } from '../../to-preview/scripts/apply-omit.mjs';
import { REPO_ROOT, TEST_APPROVER, inScratch } from '../../to-handoff/scripts/system.mjs';
import { folderFiles } from './review.mjs';

/** The owner's message -> {except: [family]}. Throws on anything but "approve" or "approve except <families>". */
export function parseApproval(said, families) {
  const m = /^approve(?: except (.+))?$/i.exec(String(said ?? '').trim());
  if (!m) throw new Error(`"${said}" is not "approve" or "approve except <family>"; only the owner's own message in chat approves`);
  const except = m[1] ? m[1].split(/\s*(?:,|\band\b)\s*/i).filter(Boolean) : [];
  for (const f of except) if (!families.includes(f)) throw new Error(`${f} has no Contract here (${families.join(', ')})`);
  return { except: [...new Set(except)].sort() };
}

/**
 * approveFolder({dir, exported, said, at, test}) -> {approved, unchanged, drafts, foundations: {path, documentHash}}.
 * `exported` is the page's combined export {designSystem, documentHash, families: {family: {patch, checked}}}.
 * `approved` lists the Contracts written approved; `unchanged` the ones already approved with these ticks;
 * `drafts` the excepted ones, left byte-unchanged. Throws, writing nothing, on any refusal.
 */
export function approveFolder({ dir, exported, said, at = new Date().toISOString(), test = false }) {
  const files = folderFiles(dir);
  const families = Object.keys(files.contracts);
  const { except } = parseApproval(said, families);
  const text = readFileSync(files.foundations, 'utf8');
  const foundations = JSON.parse(text);
  const key = foundations.designSystem.key;
  const documentHash = `sha256:${sha256(text)}`;
  const reasons = [];
  if (test && !inScratch(dir)) reasons.push(`a test approval is written only under ${join(REPO_ROOT, '.scratch')}/`);
  if (exported.designSystem !== key) reasons.push(`the review is of ${exported.designSystem}, not ${key}`);
  if (exported.documentHash !== documentHash)
    reasons.push(`the Foundations document moved since the review (${exported.documentHash} reviewed, ${documentHash} now): build the page again and export`);
  const listed = new Map(foundations.closure.contracts.map(c => [c.family, c.snapshotId]));
  for (const f of families) {
    const snapshotId = readJson(files.contracts[f]).source.snapshotId;
    if (!listed.has(f)) reasons.push(`${f} is not in the Foundations document's closure: run folder.mjs again`);
    else if (listed.get(f) !== snapshotId) reasons.push(`${f} is at ${snapshotId}, but the Foundations document lists ${listed.get(f)}: run folder.mjs again`);
  }
  for (const f of listed.keys()) if (!families.includes(f)) reasons.push(`the Foundations document lists ${f}, which has no Contract here`);
  for (const f of Object.keys(exported.families || {})) if (!families.includes(f)) reasons.push(`the review has ticks for ${f}, which has no Contract here`);

  const writes = [], approved = [], unchanged = [];
  if (!reasons.length) for (const family of families.filter(f => !except.includes(f))) {
    const ticks = (exported.families || {})[family];
    if (!ticks) { reasons.push(`no ticks for ${family}: export the review again`); continue; }
    try {
      const contract = readJson(files.contracts[family]);
      const next = omitApplied({ contract, patch: ticks.patch, checked: ticks.checked, foundations });
      if (contract.selection.status === 'approved' && contentHash(next) === contentHash(contract)) { unchanged.push(family); continue; }
      const owner = approve(next, at);
      const { errors } = validate(owner, foundations);
      if (errors.length) throw new Error(errors.map(e => `[rule ${e.rule}] ${e.message}`).join('; '));
      if (test) owner.selection.approval.by = TEST_APPROVER;
      writes.push([files.contracts[family], owner]);
      approved.push(family);
    } catch (e) { reasons.push(`${family}: ${e.message}`); }
  }
  if (reasons.length) throw new Error(`cannot approve ${dir}:\n- ${reasons.join('\n- ')}`);
  // Spliced into each file's own text, so a diff shows only the selection lines.
  for (const [path, contract] of writes) writeJson(path, contract);
  return { approved, unchanged, drafts: except, foundations: { path: files.foundations, documentHash } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const usage = 'usage: approve.mjs design-systems/<name> --export <name>.review.json --said "<the owner\'s message>"';
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { export: { type: 'string' }, said: { type: 'string' } } });
  } catch (e) {
    console.error(`${e.message}\n${usage}`);
    process.exit(2);
  }
  const { values: { export: exportPath, said }, positionals: [folder] } = args;
  if (!folder || !exportPath || said === undefined) {
    console.error(usage);
    process.exit(2);
  }
  try {
    const r = approveFolder({ dir: resolve(folder), exported: readJson(resolve(exportPath)), said });
    const rel = p => relative(process.cwd(), p);
    console.log([
      ...r.approved.map(f => `approved ${f}`),
      ...r.unchanged.map(f => `unchanged ${f} (already approved with these ticks)`),
      ...r.drafts.map(f => `left ${f} a draft`),
      `Foundations ${rel(r.foundations.path)} ${r.foundations.documentHash}: as reviewed, unchanged`,
      'OK',
    ].join('\n'));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
