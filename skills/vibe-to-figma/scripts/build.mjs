#!/usr/bin/env node
// Vibe-to-Figma's Figma build (#179): after the owner's approve, the approved Contracts of design-systems/<name>/ go
// into the one Figma file the owner linked, through To-design: Foundations first, then each Component Set by B′
// (loose batches, one combine, place calls), then each set's coverage check. It adds no builder: every step is a
// To-design plan, packaged with To-design's packager, sent to use_figma by the agent and recorded here.
//
//   node skills/vibe-to-figma/scripts/build.mjs next design-systems/<name> <figma-file-url> --out <run dir>
//        [--ledger <path>] [--namespace <prefix>] [--skip <family>]...
//   node skills/vibe-to-figma/scripts/build.mjs record design-systems/<name> <figma-file-url> <run dir>/result.json
//        [--ledger <path>] [--namespace <prefix>] [--skip <family>]...
//
// `next` derives one call (or says the build is done) and writes nothing to Figma; only the agent's use_figma call
// does. Nothing is derived before the owner's approve: a folder with no approved Contract is refused. A family whose
// first build would combine more than MAX_COMBINE variants stops the run before any write, for the owner to decide.
// The ledger is the Design System's own, <fileKey>.<name>.ledger.json in the main checkout's .scratch/to-design/, so
// a file that holds another Design System (the smoke draft's Carbon) keeps its ledger untouched. Beside it,
// <fileKey>.<name>.build.json keeps the namespace and the coverage pages and verdicts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { contentHash, expand, icons as iconKeys, PROTOTYPE_APPROVER, sha256, validate } from '../../contract/scripts/contract.mjs';
import { foundationsNext, foundationsPlan, MAX_COMBINE, setsPlan } from '../../to-design/scripts/build-plan.mjs';
import { checkCoverage, mergeCoverage } from '../../to-design/scripts/coverage.mjs';
import { ledgerPath, mainCheckoutOf, readLedger, recordResult } from '../../to-design/scripts/ledger.mjs';
import { REPO_ROOT, TEST_APPROVER, inScratch } from '../../to-handoff/scripts/system.mjs';
import { folderFiles } from './review.mjs';

const TO_DESIGN = join(REPO_ROOT, 'skills/to-design');
export const CORES = { foundations: join(TO_DESIGN, 'assets/builder-core.js'), sets: join(TO_DESIGN, 'assets/builder-core-components.js') };

/** The file key of a Figma Design file link, figma.com/design/<key>/...; any other link is refused. */
export function fileKeyOf(url) {
  const m = /^https:\/\/(?:www\.)?figma\.com\/(?:design|file)\/([0-9a-zA-Z]{22,128})(?:\/([^?#]*))?(?:[?#].*)?$/.exec(String(url ?? '').trim());
  if (!m) throw new Error(`${url} is not a Figma Design file link (https://www.figma.com/design/<fileKey>/...): link the file to build into`);
  if (/^branch\//.test(m[2] || '')) throw new Error(`${url} is a branch of a file: link the file itself`);
  return m[1];
}

/** The Design System's own ledger for the file, in the main checkout (also from a git worktree). */
export const defaultLedger = (fileKey, designSystem) => ledgerPath(fileKey, mainCheckoutOf(REPO_ROOT) || REPO_ROOT, designSystem);
/** The build's own record beside the ledger: {namespace, coverage: {family: verdict}, pages: {family: {batch: result}}}. */
export const buildRecordPath = ledger => ledger.replace(/\.ledger\.json$/, '.build.json');

/**
 * The approval gate, before anything reaches Figma. Loads design-systems/<name>/ and returns {key, doc, docText,
 * documentHash, contracts: {family: Contract as To-design takes it}, families (approved, to build), drafts,
 * skipped, ask: [{family, total}]}. Throws, naming each reason, when nothing is approved, an approved Contract does
 * not validate or is not in the Foundations closure at its snapshot, a Contract names icons, or the ledger is
 * another file's or another Design System's. A Contract approved by the test approver passes only under .scratch/,
 * where it is built as a prototype approval. `ask` lists the families whose first build is above `maxCombine`.
 */
export function gate({ dir, fileKey, ledger = null, skip = [], maxCombine = MAX_COMBINE }) {
  const files = folderFiles(dir);
  const docText = readFileSync(files.foundations, 'utf8');
  const doc = JSON.parse(docText);
  const key = doc.designSystem.key;
  const reasons = [];
  if (ledger && ledger.fileKey !== fileKey) reasons.push(`the ledger is for ${ledger.fileKey}, not ${fileKey}`);
  if (ledger && ledger.foundations && ledger.foundations.designSystem !== key)
    reasons.push(`the ledger holds ${ledger.foundations.designSystem}'s Foundations, not ${key}'s: give ${key} a ledger of its own (--ledger)`);
  const all = Object.fromEntries(Object.entries(files.contracts).map(([f, p]) => [f, JSON.parse(readFileSync(p, 'utf8'))]));
  const drafts = Object.keys(all).filter(f => all[f].selection.status !== 'approved');
  const approved = Object.keys(all).filter(f => !drafts.includes(f));
  if (!approved.length)
    throw new Error(`nothing in ${dir} is approved, so nothing is written to Figma: show the owner the review page, and run approve.mjs after their own "approve" in chat (drafts: ${drafts.join(', ') || 'none'})`);
  for (const f of skip) if (!approved.includes(f)) reasons.push(`--skip ${f}: ${f} is not an approved Contract here`);
  const listed = new Map(doc.closure.contracts.map(c => [c.family, c.snapshotId]));
  const contracts = {};
  for (const f of approved.filter(f => !skip.includes(f))) {
    const c = all[f];
    const test = c.selection.approval && c.selection.approval.by === TEST_APPROVER;
    if (test && !inScratch(dir)) { reasons.push(`${f} is approved by "${TEST_APPROVER}", which builds only under ${join(REPO_ROOT, '.scratch')}/`); continue; }
    const errors = validate(c, doc).errors.filter(e => !(test && e.rule === 8 && e.at === 'selection.approval.by'));
    if (errors.length) { reasons.push(`${f} does not validate: ${errors.map(e => `[rule ${e.rule}] ${e.at}: ${e.message}`).join('; ')}`); continue; }
    if (listed.get(f) !== c.source.snapshotId) { reasons.push(`${f} is at ${c.source.snapshotId}, but the Foundations closure lists ${listed.get(f) || 'no Contract for it'}: run folder.mjs and approve again`); continue; }
    if (iconKeys(c).length) { reasons.push(`${f} names icons (${iconKeys(c).join(', ')}): Vibe-to-Figma builds no icon atoms yet`); continue; }
    // To-design builds an approved Contract; a test approval goes through as its prototype approval, never written
    contracts[f] = test ? { ...c, selection: { ...c.selection, approval: { ...c.selection.approval, by: PROTOTYPE_APPROVER } } } : c;
  }
  if (reasons.length) throw new Error(`cannot build ${dir} into ${fileKey}:\n- ${reasons.join('\n- ')}`);
  const families = Object.keys(contracts);
  const ask = families
    .filter(f => !(ledger && ledger.sets && ledger.sets[f] && ledger.sets[f].set))
    .map(f => ({ family: f, total: expand(contracts[f]).length }))
    .filter(a => a.total > maxCombine);
  return { key, doc, docText, documentHash: `sha256:${sha256(docText)}`, contracts, families, drafts, skipped: [...skip].sort(), ask };
}

/** A plan in the file's namespace: its Variable collections and its Templates page carry the prefix. */
export function namespaced(plan, namespace) {
  if (!namespace) return plan;
  const out = structuredClone(plan);
  if (out.foundations) out.foundations.collections = out.foundations.collections.map(c => ({ ...c, name: `${namespace} ${c.name}` }));
  if (out.templates) out.templates.page = `${namespace} ${out.templates.page}`;
  return out;
}

const prototypeOf = c => c.selection.approval.by === PROTOTYPE_APPROVER;

/**
 * The build's next call, from the gate, the ledger and the build record:
 *   {status: 'ask', ask}                                       a set above maxCombine: nothing derived, ask the owner
 *   {status: 'step', step: 'foundations'|'sets'|'coverage', family?, core, plan, state, options}
 *   {status: 'problems', family, problems}                     a coverage check failed: stop and report
 *   {status: 'built', families: [{family, variants, set}], drafts, skipped}
 * Options: dir, fileKey, ledger, record (the build record), namespace, skip, maxCombine, coveragePerCall, at.
 */
export function nextStep({ dir, fileKey, ledger = null, record = {}, namespace = null, skip = [], maxCombine = MAX_COMBINE, coveragePerCall, at = new Date().toISOString() }) {
  const g = gate({ dir, fileKey, ledger, skip, maxCombine });
  if ('namespace' in record && record.namespace !== namespace)
    throw new Error(`this file was built with --namespace ${JSON.stringify(record.namespace)}: give the same one (a different one would rename its collections)`);
  if (g.ask.length) return { status: 'ask', ask: g.ask, drafts: g.drafts };
  const step = (name, family, core, { plan, state }) => ({ status: 'step', step: name, family, core, plan: namespaced(plan, namespace), state, options: plan.options });

  const chunk = foundationsNext(g.docText, ledger);
  if (chunk) return step('foundations', null, CORES.foundations, foundationsPlan(g.docText, ledger, { fileKey, chunk, at }));
  for (const f of g.families) {
    const d = setsPlan(g.contracts[f], g.docText, ledger, { fileKey, next: true, prototype: prototypeOf(g.contracts[f]), at });
    if (d) return step('sets', f, CORES.sets, d);
  }
  for (const f of g.families) {
    const verdict = (record.coverage || {})[f];
    const set = ledger.sets[f];
    if (verdict && verdict.contentHash === set.contentHash && verdict.documentHash === g.documentHash && verdict.set === set.set.id) {
      if (!verdict.ok) return { status: 'problems', family: f, problems: verdict.problems };
      continue;
    }
    const read = Object.keys((record.pages || {})[f] || {}).map(Number);
    const opts = { fileKey, mode: 'coverage', prototype: prototypeOf(g.contracts[f]), at, ...(coveragePerCall ? { coveragePerCall } : {}) };
    const of = setsPlan(g.contracts[f], g.docText, ledger, { ...opts, batch: 0 }).plan.options.of;
    const batch = Array.from({ length: of }, (_, i) => i).find(i => !read.includes(i));
    return step('coverage', f, CORES.sets, setsPlan(g.contracts[f], g.docText, ledger, { ...opts, batch }));
  }
  return {
    status: 'built',
    families: g.families.map(f => ({ family: f, variants: expand(g.contracts[f]).length, set: ledger.sets[f].set.id, page: g.contracts[f].figma.page })),
    drafts: g.drafts,
    skipped: g.skipped,
  };
}

/**
 * The ledger and build record after a use_figma result: a build result goes into the ledger (To-design's
 * recordResult), a coverage page into the record; once every page of a family is read, the pages merge and the
 * coverage check's verdict replaces them. Throws on an error result. -> {ledger, record, verdict?}
 */
export function recordStep({ dir, fileKey, ledger = null, record = {}, result, at = new Date().toISOString() }) {
  if (!result || result.error) throw new Error(`not recording a failed call: ${JSON.stringify(result && result.error)}`);
  if (result.fileKey !== fileKey) throw new Error(`the result is for ${result.fileKey}, not ${fileKey}`);
  if (result.slice === 'sets' && result.mode === 'coverage') {
    const family = result.family;
    const pages = { ...((record.pages || {})[family] || {}), [result.batch[0]]: result };
    const next = { ...record, pages: { ...(record.pages || {}), [family]: pages } };
    if (Object.keys(pages).length < result.batch[1]) return { ledger, record: next };
    const g = gate({ dir, fileKey, ledger });
    const contract = g.contracts[family];
    let merged;
    try { merged = mergeCoverage(Object.values(pages)); }
    catch (e) { delete next.pages[family]; throw new Error(`${e.message}: the ${family} pages are dropped, read them again`); }
    const report = checkCoverage(contract, merged, ledger);
    const verdict = { ok: report.ok, expected: report.expected, read: report.read, problems: report.problems.slice(0, 20), orphaned: report.orphaned,
      contentHash: contentHash(contract), documentHash: g.documentHash, set: merged.set.id, at };
    delete next.pages[family];
    return { ledger, record: { ...next, coverage: { ...(record.coverage || {}), [family]: verdict } }, verdict: { family, ...verdict } };
  }
  const out = { ledger: recordResult(ledger, result), record };
  // a write to a set stales its coverage verdict and any page read before it
  if (result.slice === 'sets') {
    const drop = o => Object.fromEntries(Object.entries(o || {}).filter(([f]) => f !== result.family));
    out.record = { ...record, coverage: drop(record.coverage), pages: drop(record.pages) };
  }
  return out;
}

const USAGE = [
  'usage: build.mjs next design-systems/<name> <figma-file-url> --out <run dir> [--ledger <path>] [--namespace <prefix>] [--skip <family>]...',
  '       build.mjs record design-systems/<name> <figma-file-url> <run dir>/result.json [--ledger <path>] [--namespace <prefix>] [--skip <family>]...',
].join('\n');

function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, ledger: { type: 'string' }, namespace: { type: 'string' }, skip: { type: 'string', multiple: true, default: [] } } });
  } catch (e) {
    console.error(`${e.message}\n${USAGE}`);
    process.exit(2);
  }
  const { values, positionals: [cmd, folder, url, resultPath] } = args;
  if (!folder || !url || !((cmd === 'next' && values.out) || (cmd === 'record' && resultPath))) {
    console.error(USAGE);
    process.exit(2);
  }
  const dir = resolve(folder);
  const fileKey = fileKeyOf(url);
  const key = JSON.parse(readFileSync(folderFiles(dir).foundations, 'utf8')).designSystem.key;
  const ledgerFile = values.ledger ? resolve(values.ledger) : defaultLedger(fileKey, key);
  const recordFile = buildRecordPath(ledgerFile);
  const ledger = readLedger(ledgerFile);
  const record = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, 'utf8')) : {};
  const namespace = values.namespace ?? null;
  const rel = p => relative(process.cwd(), p);
  const writeRecord = r => { mkdirSync(dirname(recordFile), { recursive: true }); writeFileSync(recordFile, JSON.stringify({ ...r, namespace }, null, 2) + '\n'); };

  if (cmd === 'record') {
    const result = JSON.parse(readFileSync(resolve(resultPath), 'utf8'));
    const r = recordStep({ dir, fileKey, ledger, record, result });
    if (r.ledger !== ledger) { mkdirSync(dirname(ledgerFile), { recursive: true }); writeFileSync(ledgerFile, JSON.stringify(r.ledger, null, 2) + '\n'); }
    writeRecord(r.record);
    const conflicts = result.conflicts || [];
    if (conflicts.length) {
      console.error(`FAIL: ${conflicts.length} conflict(s), nothing changed in Figma for them; the ledger keeps its old section:\n${JSON.stringify(conflicts, null, 2)}`);
      process.exit(1);
    }
    if (r.verdict) {
      console.log(JSON.stringify({ coverage: r.verdict.family, ok: r.verdict.ok, expected: r.verdict.expected, read: r.verdict.read, problems: r.verdict.problems }));
      process.exit(r.verdict.ok ? 0 : 1);
    }
    console.log(`recorded ${result.slice}${result.family ? ` ${result.family}` : ''}${result.mode ? ` ${result.mode}` : ''}${result.batch ? ` ${result.batch[0] + 1}/${result.batch[1]}` : ''} into ${rel(ledgerFile)}`);
    return;
  }

  const n = nextStep({ dir, fileKey, ledger, record, namespace, skip: values.skip });
  if (n.status === 'ask') {
    console.error(`ASK THE OWNER: nothing was written to Figma.\n${n.ask.map(a => `- ${a.family} has ${a.total} variants, above MAX_COMBINE (${MAX_COMBINE}): its first build combines them all in one call, which grows with the square of the set and nears the ~2 min call ceiling.`).join('\n')}\nThe owner can untick variants on the review page and approve again, or build the rest without it (--skip <family>, only on the owner's word).`);
    process.exit(3);
  }
  if (n.status === 'problems') {
    console.error(`FAIL: the ${n.family} set does not pass the coverage check:\n${JSON.stringify(n.problems, null, 2)}`);
    process.exit(1);
  }
  if (n.status === 'built') {
    console.log([
      ...n.families.map(f => `built ${f.family}: ${f.variants} variants on page ${f.page} (set ${f.set}), coverage passed`),
      ...n.drafts.map(f => `not built ${f}: a draft`),
      ...n.skipped.map(f => `not built ${f}: skipped on the owner's word`),
      `https://www.figma.com/design/${fileKey}`,
      'OK',
    ].join('\n'));
    return;
  }
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'plan.json'), JSON.stringify(n.plan, null, 2) + '\n');
  writeFileSync(join(out, 'state.json'), JSON.stringify(n.state, null, 2) + '\n');
  writeRecord(record);
  const packaged = JSON.parse(execFileSync('python3', [join(TO_DESIGN, 'scripts/package_native_builder.py'), n.core, join(out, 'plan.json'), out, '--state', join(out, 'state.json')], { encoding: 'utf8' }).trim().split('\n').pop());
  if (packaged.status !== 'packaged') throw new Error(`the packager refused: ${packaged.error}`);
  console.log(JSON.stringify({
    step: n.step, ...(n.family ? { family: n.family } : {}), options: n.options, fileKey, chars: packaged.chars,
    description: `${key} ${n.step}${n.family ? ` ${n.family}` : ''}${n.options.phase ? ` ${n.options.phase}` : n.options.mode ? ` ${n.options.mode}` : ''}${n.options.batch != null ? ` ${n.options.batch + 1}/${n.options.of}` : ''}${n.plan.chunk ? ` chunk ${n.plan.chunk.index}/${n.plan.chunk.of}` : ''}`,
    stub: packaged.stub, result: rel(join(out, 'result.json')), ledger: ledgerFile,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
