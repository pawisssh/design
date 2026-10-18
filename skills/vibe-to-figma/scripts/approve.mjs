#!/usr/bin/env node
// Vibe-to-Figma's one approve (#177). Run it only after the owner's own chat message says "approve" or
// "approve except <family>[, <family>]", and pass that message verbatim as --said. It reads the review page's
// combined export, applies each family's omit (To-preview's omitApplied) and approves every Contract but the
// excepted ones, in one act: every family is applied and checked before any file is written.
//
//   node skills/vibe-to-figma/scripts/approve.mjs design-systems/<name> --project <project> --export <name>.review.json --said "<message>"
//   node skills/vibe-to-figma/scripts/approve.mjs design-systems/<name> --project <project> --ticks <saved review/ticks.json> --said "<message>"
//
// --ticks reads the review page's ticks as the published Artifact saved them (#178, assets/review-store.js) in place
// of the export: storedExport() turns them back into the export the page would write, and the same checks follow.
//
// The Foundations document has no approval of its own (it is a pure function of its inputs): approve checks that it
// is the one the page showed (its documentHash), that its closure lists each Contract at its snapshot and that the
// project still generates it, then generates it again from the approved Contracts, so an omit that drops a token's
// last variant drops the token from the closure. Tests pass `test: true`, which writes the test approver and only
// under <repo>/.scratch/.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { approve, contentHash, sha256, validate } from '../../contract/scripts/contract.mjs';
import { readJson, writeJson } from '../../contract/scripts/io.mjs';
import { generate as foundationsOf } from '../../adapter-generic/scripts/foundations.mjs';
import { DEFAULT_DIR, fetchTools, hasTools } from '../../adapter-generic/scripts/sources.mjs';
import { omitApplied } from '../../to-preview/scripts/apply-omit.mjs';
import { REPO_ROOT, TEST_APPROVER, inScratch } from '../../to-handoff/scripts/system.mjs';
import { folderFiles } from './review.mjs';

const CatalogSelection = createRequire(import.meta.url)('../../to-preview/assets/selection-model.js');

/**
 * storedExport(dir, stored) -> the combined export {designSystem, documentHash, families: {family: {patch, checked}}}
 * that the review page shows for the ticks it saved in the Artifact's db, `stored` = {designSystem, documentHash,
 * families: {family: patch}}. Each family's patch is selected over its Contract and exported as the page's export
 * does it (To-preview's CatalogSelection), so approveFolder gets exactly what the export would give. A patch of
 * another snapshot passes through with no checked tuples, for approveFolder to refuse.
 */
export function storedExport(dir, stored) {
  const { contracts } = folderFiles(dir);
  const families = {};
  for (const [family, patch] of Object.entries(stored.families || {})) {
    if (!contracts[family]) { families[family] = { patch, checked: null }; continue; }
    const model = new CatalogSelection(readJson(contracts[family]), contractModule);
    for (const id of model.specimens.keys()) model.verify(id);
    try { model.selectPatch(patch); }
    catch { families[family] = { patch, checked: { family: patch.family, snapshotId: patch.snapshotId, checked: [] } }; continue; }
    const next = model.omitPatch();
    families[family] = { patch: next, checked: { family, snapshotId: next.snapshotId, checked: model.checkedTuples() } };
  }
  return { designSystem: stored.designSystem, documentHash: stored.documentHash, families };
}

/** The owner's message -> {except: [family]}. Throws on anything but "approve" or "approve except <families>". */
export function parseApproval(said, families) {
  const m = /^approve(?: except (.+))?$/i.exec(String(said ?? '').trim());
  if (!m) throw new Error(`"${said}" is not "approve" or "approve except <family>"; only the owner's own message in chat approves`);
  const except = m[1] ? m[1].split(/\s*(?:,|\band\b)\s*/i).filter(Boolean) : [];
  for (const f of except) if (!families.includes(f)) throw new Error(`${f} has no Contract here (${families.join(', ')})`);
  return { except: [...new Set(except)].sort() };
}

/**
 * approveFolder({dir, project, exported, said, at, test, tools})
 *   -> {approved, unchanged, drafts, foundations: {path, reviewed, documentHash, written}}.
 * `project` is the vibe-coded project the folder was built from; `exported` is the page's combined export
 * {designSystem, documentHash, families: {family: {patch, checked}}}. `approved` lists the Contracts written approved;
 * `unchanged` the ones already approved with these ticks; `drafts` the excepted ones, left byte-unchanged.
 * `foundations.reviewed` is the documentHash the page showed, `documentHash` the regenerated one. Throws, writing
 * nothing, on any refusal.
 */
export async function approveFolder({ dir, project, exported, said, at = new Date().toISOString(), test = false, tools = DEFAULT_DIR }) {
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

  const onDisk = Object.fromEntries(families.map(f => [f, readJson(files.contracts[f])]));
  const contracts = { ...onDisk }, approved = [], unchanged = [];
  if (!reasons.length) for (const family of families.filter(f => !except.includes(f))) {
    const ticks = (exported.families || {})[family];
    if (!ticks) { reasons.push(`no ticks for ${family}: export the review again, or open the review Artifact so it saves them`); continue; }
    try {
      const contract = onDisk[family];
      const next = omitApplied({ contract, patch: ticks.patch, checked: ticks.checked, foundations });
      if (contract.selection.status === 'approved' && contentHash(next) === contentHash(contract)) { unchanged.push(family); continue; }
      const approval = approve(next, at);
      const { errors } = validate(approval, foundations);
      if (errors.length) throw new Error(errors.map(e => `[rule ${e.rule}] ${e.message}`).join('; '));
      contracts[family] = approval;
      approved.push(family);
    } catch (e) { reasons.push(`${family}: ${e.message}`); }
  }
  if (reasons.length) throw new Error(`cannot approve ${dir}:\n- ${reasons.join('\n- ')}`);

  // The document the page showed must still be what the project and the Contracts on disk generate; then the
  // approved Contracts generate the one to write, which differs only where an omit narrowed the closure.
  const generate = set => foundationsOf({ project, families, tools, designSystem: foundations.designSystem, contracts: set });
  if ((await generate(onDisk)).text !== text)
    throw new Error(`cannot approve ${dir}:\n- ${project} no longer generates the Foundations document the page showed: run folder.mjs again, then review`);
  const next = await generate(contracts);
  for (const family of approved) {
    const { errors } = validate(contracts[family], next.doc);
    if (errors.length) throw new Error(`cannot approve ${dir}:\n- ${family}: ${errors.map(e => `[rule ${e.rule}] ${e.message}`).join('; ')}`);
  }
  // Spliced into each file's own text, so a diff shows only the selection lines. A test writes the test approver in
  // place of the owner, whose form passed every rule above.
  for (const family of approved) {
    if (test) contracts[family].selection.approval.by = TEST_APPROVER;
    writeJson(files.contracts[family], contracts[family]);
  }
  const written = next.text !== text;
  if (written) writeFileSync(files.foundations, next.text);
  return { approved, unchanged, drafts: except, foundations: { path: files.foundations, reviewed: documentHash, documentHash: next.documentHash, written } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const usage = 'usage: approve.mjs design-systems/<name> --project <project> (--export <name>.review.json | --ticks <saved ticks.json>) --said "<the owner\'s message>"';
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { project: { type: 'string' }, export: { type: 'string' }, ticks: { type: 'string' }, said: { type: 'string' } } });
  } catch (e) {
    console.error(`${e.message}\n${usage}`);
    process.exit(2);
  }
  const { values: { project, export: exportPath, ticks, said }, positionals: [folder] } = args;
  if (!folder || !project || !exportPath === !ticks || said === undefined) {
    console.error(usage);
    process.exit(2);
  }
  try {
    if (!hasTools()) await fetchTools();
    const dir = resolve(folder);
    const exported = ticks ? storedExport(dir, readJson(resolve(ticks))) : readJson(resolve(exportPath));
    const r = await approveFolder({ dir, project: resolve(project), exported, said });
    const rel = p => relative(process.cwd(), p);
    console.log([
      ...r.approved.map(f => `approved ${f}`),
      ...r.unchanged.map(f => `unchanged ${f} (already approved with these ticks)`),
      ...r.drafts.map(f => `left ${f} a draft`),
      r.foundations.written
        ? `Foundations ${rel(r.foundations.path)} generated again from the approved Contracts: ${r.foundations.documentHash} (reviewed ${r.foundations.reviewed})`
        : `Foundations ${rel(r.foundations.path)} ${r.foundations.documentHash}: as reviewed, unchanged`,
      'OK',
    ].join('\n'));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
