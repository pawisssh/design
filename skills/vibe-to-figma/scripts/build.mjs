#!/usr/bin/env node
// Vibe-to-Figma's Figma build (#179): after the owner's approve, the approved Contracts of design-systems/<name>/ go
// into the one Figma file the owner linked, through To-design: Foundations first, then each Component Set by B′
// (loose batches, one combine, place calls), then each set's coverage check. It adds no builder: every step is a
// To-design plan, packaged with To-design's packager, sent to use_figma by the agent and recorded here.
//
//   node skills/vibe-to-figma/scripts/build.mjs next design-systems/<name> <figma-file-url> --out <run dir>
//        [--ledger <path>] [--namespace <prefix>] [--skip <family>]... [--rebuild <family>]...
//   node skills/vibe-to-figma/scripts/build.mjs record design-systems/<name> <figma-file-url> <run dir>/result.json
//        [--ledger <path>] [--namespace <prefix>] [--skip <family>]...
//
// `next` derives one call (or says the build is done) and writes nothing to Figma; only the agent's use_figma call
// does. Nothing is derived before the owner's approve: a folder with no approved Contract is refused. A family whose
// first build would combine more than MAX_COMBINE variants stops the run before any write, for the owner to decide.
// The ledger is the Design System's own, <fileKey>.<name>.ledger.json in the main checkout's .scratch/to-design/, so
// a file that holds another Design System (the smoke draft's Carbon) keeps its ledger untouched. Beside it,
// <fileKey>.<name>.build.json keeps the namespace, the coverage pages and verdicts, and any rebuild under way.
// A set that fails its coverage check stops the run; --rebuild <family> then builds its batches again inside the set
// (the builder rebuilds a layer tree unlike the Contract's anatomy and wires it again), and its coverage is read again.
// A rerun touches only what changed (#180). A set that passes its coverage check leaves a baseline in the build record:
// each variant's fingerprint and id. When its Contract changes after that, only the variants whose fingerprint moved
// (or that are new) are appended into the set, the rest keep their ids and are not written; a change of the set alone
// takes one call with no variant in it. A coverage verdict holds across a Foundations build, which writes no set.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { canonical, contentHash, expand, icons as iconKeys, PROTOTYPE_APPROVER, resolve as resolveTuple, sha256, validate, variantName } from '../../contract/scripts/contract.mjs';
import { documentHash, foundationsNext, foundationsPlan, MAX_COMBINE, setsPlan } from '../../to-design/scripts/build-plan.mjs';
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
  return { key, doc, docText, documentHash: documentHash(docText), contracts, families, drafts, skipped: [...skip].sort(), ask };
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
 * Each variant's fingerprint, by expansion index: [{name, fingerprint}]. It covers what a build writes into the variant
 * (the anatomy's layer tree, the resolved layout and paint, and the property wiring), so a variant whose name and
 * fingerprint hold needs no write. Its grid cell is left out: every append call places each child by its name.
 */
export function variantFingerprints(contract) {
  const tree = canonical(contract.anatomy);
  return expand(contract).map(t => {
    const { layout, paint, binds } = resolveTuple(contract, t);
    return { name: variantName(contract, t), fingerprint: `sha256:${sha256(tree + canonical({ layout, paint, binds }))}` };
  });
}

/**
 * The build record with a baseline, `built: {family: {contentHash, set, variants: {name: [fingerprint, id]}}}`, for each
 * family whose set passed its coverage check from its Contract as it is now. A rerun compares a changed Contract with it.
 */
export function baselined(record, g, ledger) {
  const built = { ...(record.built || {}) };
  let changed = false;
  for (const f of g.families) {
    const verdict = (record.coverage || {})[f];
    const rec = ledger && ledger.sets && ledger.sets[f];
    const hash = contentHash(g.contracts[f]);
    if (!verdict || !verdict.ok || verdict.contentHash !== hash || !rec || !rec.set || rec.set.id !== verdict.set || rec.contentHash !== hash) continue;
    if (built[f] && built[f].contentHash === hash && built[f].set === rec.set.id) continue;
    const variants = {};
    variantFingerprints(g.contracts[f]).forEach(({ name, fingerprint }, i) => { variants[name] = [fingerprint, (rec.variants || [])[i] || null]; });
    built[f] = { contentHash: hash, set: rec.set.id, variants };
    changed = true;
  }
  return changed ? { ...record, built } : record;
}

// A baseline variant, [fingerprint, id], is in the set as a Contract with this variant fingerprint has it.
const holds = (baseline, fingerprint) => !!baseline && baseline[0] === fingerprint && !!baseline[1];

/**
 * An update's variants still to send, by expansion index: the family's Contract changed since its set's baseline, and
 * these variants are new, changed, or have no id in it. The first call of an update goes out even with none (a change
 * of the set alone). null when the family is no update, or its update is done.
 */
export function pendingUpdate(contract, ledger, built) {
  const rec = ledger && ledger.sets && ledger.sets[contract.family.key];
  if (!built || !rec || !rec.set || rec.placed === false || rec.set.id !== built.set) return null;
  const hash = contentHash(contract);
  if (built.contentHash === hash) return null;
  const changed = [];
  variantFingerprints(contract).forEach(({ name, fingerprint }, i) => { if (!holds(built.variants[name], fingerprint)) changed.push(i); });
  if (rec.contentHash !== hash) return changed;
  const left = changed.filter(i => !(rec.variants || [])[i]);
  return left.length ? left : null;
}

/** A file built in one namespace is built on in that one; the record takes it from the first call without a conflict. */
function assertNamespace(record, namespace) {
  if ('namespace' in record && record.namespace !== namespace)
    throw new Error(`this file was built with --namespace ${JSON.stringify(record.namespace)}: give the same one (a different one would rename its collections)`);
}

/**
 * The build's next call, from the gate, the ledger and the build record:
 *   {status: 'ask', ask}                                       a set above maxCombine: nothing derived, ask the owner
 *   {status: 'step', step: 'foundations'|'sets'|'coverage', family?, core, plan, state, options}
 *   {status: 'problems', family, problems}                     a coverage check failed: stop and report
 *   {status: 'built', families: [{family, variants, set}], drafts, skipped}
 * Each also carries `record`, the build record with any new baseline (`baselined`), for the CLI to keep.
 * Options: dir, fileKey, ledger, record (the build record), namespace, skip, maxCombine, coveragePerCall, at, and
 * rebuild: families whose failed coverage check starts a rebuild of their set (one already under way goes on anyway).
 */
export function nextStep({ dir, fileKey, ledger = null, record = {}, namespace = null, skip = [], maxCombine = MAX_COMBINE, coveragePerCall, rebuild = [], at = new Date().toISOString() }) {
  const g = gate({ dir, fileKey, ledger, skip, maxCombine });
  const unknown = rebuild.filter(f => !g.families.includes(f));
  if (unknown.length) throw new Error(`--rebuild ${unknown.join(', ')}: not an approved family of ${dir} built here`);
  assertNamespace(record, namespace);
  record = baselined(record, g, ledger);
  const n = nextOf({ g, fileKey, ledger, record, namespace, coveragePerCall, rebuild, at });
  return { ...n, record };
}

function nextOf({ g, fileKey, ledger, record, namespace, coveragePerCall, rebuild, at }) {
  if (g.ask.length) return { status: 'ask', ask: g.ask, drafts: g.drafts };
  const step = (name, family, core, { plan, state }) => ({ status: 'step', step: name, family, core, plan: namespaced(plan, namespace), state, options: plan.options });

  const chunk = foundationsNext(g.docText, ledger);
  if (chunk) return step('foundations', null, CORES.foundations, foundationsPlan(g.docText, ledger, { fileKey, chunk, at }));
  for (const f of g.families) {
    const prototype = prototypeOf(g.contracts[f]);
    // an update after a code change: only the variants that changed, a call's worth at a time
    const pending = pendingUpdate(g.contracts[f], ledger, (record.built || {})[f]);
    if (pending) {
      const { perCall } = setsPlan(g.contracts[f], g.docText, ledger, { fileKey, mode: 'build', batch: 0, prototype, at }).plan.options;
      return step('sets', f, CORES.sets, setsPlan(g.contracts[f], g.docText, ledger, { fileKey, mode: 'build', indexes: pending.slice(0, perCall), prototype, at }));
    }
    const d = setsPlan(g.contracts[f], g.docText, ledger, { fileKey, next: true, prototype, at });
    if (d) return step('sets', f, CORES.sets, d);
  }
  for (const f of g.families) {
    const verdict = (record.coverage || {})[f];
    const set = ledger.sets[f];
    const rebuilt = (record.rebuild || {})[f];
    // coverage reads names, cells and wiring, none of which a Foundations build writes: a verdict outlives one
    const current = verdict && verdict.contentHash === set.contentHash && verdict.set === set.set.id;
    if (rebuilt || (current && !verdict.ok && rebuild.includes(f))) {
      // each build batch again, in the set: the first one recorded drops the failed verdict
      const opts = { fileKey, mode: 'build', prototype: prototypeOf(g.contracts[f]), at };
      const of = setsPlan(g.contracts[f], g.docText, ledger, { ...opts, batch: 0 }).plan.options.of;
      const batch = Array.from({ length: of }, (_, i) => i).find(i => !(rebuilt || []).includes(i));
      return step('sets', f, CORES.sets, setsPlan(g.contracts[f], g.docText, ledger, { ...opts, batch }));
    }
    if (current) {
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
 * coverage check's verdict replaces them. Throws on an error result. A call without a conflict fixes the record's
 * namespace; one that conflicts leaves it open, so the run can go on with --namespace. Options as nextStep's.
 * -> {ledger, record, verdict?}
 */
export function recordStep({ dir, fileKey, ledger = null, record = {}, result, namespace = null, skip = [], at = new Date().toISOString() }) {
  if (!result || result.error) throw new Error(`not recording a failed call: ${JSON.stringify(result && result.error)}`);
  if (result.fileKey !== fileKey) throw new Error(`the result is for ${result.fileKey}, not ${fileKey}`);
  assertNamespace(record, namespace);
  const out = recorded({ dir, fileKey, ledger, record, result, skip, at });
  if (!(result.conflicts || []).length) out.record = { ...out.record, namespace };
  return out;
}

function recorded({ dir, fileKey, ledger, record, result, skip, at }) {
  if (result.slice === 'sets' && result.mode === 'coverage') {
    const family = result.family;
    const pages = { ...((record.pages || {})[family] || {}), [result.batch[0]]: result };
    const next = { ...record, pages: { ...(record.pages || {}), [family]: pages } };
    if (Object.keys(pages).length < result.batch[1]) return { ledger, record: next };
    const g = gate({ dir, fileKey, ledger, skip });
    const contract = g.contracts[family];
    let merged;
    try { merged = mergeCoverage(Object.values(pages)); }
    catch (e) { delete next.pages[family]; throw new Error(`${e.message}: the ${family} pages are dropped, read them again`); }
    const report = checkCoverage(contract, merged, ledger);
    const verdict = { ok: report.ok, expected: report.expected, read: report.read, problems: report.problems.slice(0, 20), orphaned: report.orphaned,
      contentHash: contentHash(contract), documentHash: g.documentHash, set: merged.set.id, at };
    delete next.pages[family];
    return { ledger, record: baselined({ ...next, coverage: { ...(record.coverage || {}), [family]: verdict } }, g, ledger), verdict: { family, ...verdict } };
  }
  const out = { ledger: carried(recordResult(ledger, result), result, record, () => gate({ dir, fileKey, ledger, skip })), record };
  // a write to a set stales its coverage verdict and any page read before it
  if (result.slice === 'sets') {
    const drop = o => Object.fromEntries(Object.entries(o || {}).filter(([f]) => f !== result.family));
    out.record = { ...record, coverage: drop(record.coverage), pages: drop(record.pages) };
    // and its baseline no longer holds the variants it wrote: until the next passing check the family is an update, so
    // a later Contract that has them as the baseline does still sends them again
    const base = (record.built || {})[result.family];
    const wrote = new Set(Object.values(result.ledger.sets[result.family]?.variants || {}).filter(Boolean));
    if (base && wrote.size) {
      const variants = Object.fromEntries(Object.entries(base.variants).filter(([, [, id]]) => !wrote.has(id)));
      out.record.built = { ...record.built, [result.family]: { ...base, contentHash: null, variants } };
    }
    // a rebuild's batch (a build batch into the set, after its current verdict failed) is kept until all of them are in
    const under = (record.rebuild || {})[result.family];
    const failed = (record.coverage || {})[result.family];
    const starts = () => {
      if (!failed || failed.ok || failed.set !== result.ledger.sets[result.family]?.set?.id) return false;
      const g = gate({ dir, fileKey, ledger, skip });
      return failed.contentHash === contentHash(g.contracts[result.family]);
    };
    if (result.mode === 'build' && result.phase === 'append' && (under || starts())) {
      const done = [...new Set([...(under || []), result.batch[0]])];
      const rest = drop(record.rebuild);
      out.record.rebuild = done.length < result.batch[1] ? { ...rest, [result.family]: done } : rest;
    }
  }
  return out;
}

// During an update, the variants whose fingerprint holds keep their baseline ids in the ledger: they are in the set as
// this Contract has them, so no call writes them.
function carried(ledger, result, record, gateOf) {
  const family = result.slice === 'sets' && result.mode === 'build' && result.phase === 'append' ? result.family : null;
  const built = family && (record.built || {})[family];
  const rec = built && ledger.sets[family];
  if (!rec || !rec.set || rec.set.id !== built.set || rec.contentHash === built.contentHash) return ledger;
  const contract = gateOf().contracts[family];
  if (!contract || contentHash(contract) !== rec.contentHash) return ledger;
  const variants = rec.variants.slice();
  variantFingerprints(contract).forEach(({ name, fingerprint }, i) => { if (!variants[i] && holds(built.variants[name], fingerprint)) variants[i] = built.variants[name][1]; });
  return { ...ledger, sets: { ...ledger.sets, [family]: { ...rec, variants } } };
}

const USAGE = [
  'usage: build.mjs next design-systems/<name> <figma-file-url> --out <run dir> [--ledger <path>] [--namespace <prefix>] [--skip <family>]... [--rebuild <family>]...',
  '       build.mjs record design-systems/<name> <figma-file-url> <run dir>/result.json [--ledger <path>] [--namespace <prefix>] [--skip <family>]...',
].join('\n');

function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, ledger: { type: 'string' }, namespace: { type: 'string' }, skip: { type: 'string', multiple: true, default: [] }, rebuild: { type: 'string', multiple: true, default: [] } } });
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
  const writeRecord = r => { mkdirSync(dirname(recordFile), { recursive: true }); writeFileSync(recordFile, JSON.stringify(r, null, 2) + '\n'); };

  if (cmd === 'record') {
    const result = JSON.parse(readFileSync(resolve(resultPath), 'utf8'));
    const r = recordStep({ dir, fileKey, ledger, record, result, namespace, skip: values.skip });
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

  const n = nextStep({ dir, fileKey, ledger, record, namespace, skip: values.skip, rebuild: values.rebuild });
  if (JSON.stringify(n.record) !== JSON.stringify(record)) writeRecord(n.record);
  if (n.status === 'ask') {
    console.error(`ASK THE OWNER: nothing was written to Figma.\n${n.ask.map(a => `- ${a.family} has ${a.total} variants, above MAX_COMBINE (${MAX_COMBINE}): its first build combines them all in one call, which grows with the square of the set and nears the ~2 min call ceiling.`).join('\n')}\nThe owner can untick variants on the review page and approve again, or build the rest without it (--skip <family>, only on the owner's word).`);
    process.exit(3);
  }
  if (n.status === 'problems') {
    console.error(`FAIL: the ${n.family} set does not pass the coverage check:\n${JSON.stringify(n.problems, null, 2)}\nOnce the cause is fixed, --rebuild ${n.family} builds the set's batches again and reads its coverage again.`);
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
