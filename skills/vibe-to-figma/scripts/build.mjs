#!/usr/bin/env node
// Vibe-to-Figma's Figma build (#179): after the owner's approve, the approved Contracts of design-systems/<name>/ go
// into the one Figma file the owner linked, through To-design: Foundations first, then each Component Set by B′
// (loose batches, one combine, place calls), then each set's coverage check. It adds no builder: every step is a
// To-design plan, packaged with To-design's packager, sent to use_figma by the agent and recorded here.
//
//   node skills/vibe-to-figma/scripts/build.mjs next design-systems/<name> <figma-file-url> --out <run dir>
//        [--ledger <path>] [--namespace <prefix>] [--skip <family>]... [--rebuild <family>]...
//        [--take-code <family>:<variant>]... [--keep-figma <family>:<variant>]...
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
// Figma edits are never overwritten (#181). The baseline keeps the Contract its set was built from; before an update
// writes a variant that is in the set, a read-only `check` call (To-design's sample read) reads it back and diffs it
// against that Contract. A variant that differs, or is gone, was edited in Figma: it is skipped, kept as a conflict in
// the build record and reported on every run until the owner resolves it per variant, --take-code (write the code's
// version over it) or --keep-figma (keep Figma's; the code's change is not built into it).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { canonical, contentHash, expand, icons as iconKeys, PROTOTYPE_APPROVER, resolve as resolveTuple, sha256, validate, variantName } from '../../contract/scripts/contract.mjs';
import { documentHash, foundationsNext, foundationsPlan, MAX_COMBINE, setsPlan } from '../../to-design/scripts/build-plan.mjs';
import { checkCoverage, checkSample, mergeCoverage } from '../../to-design/scripts/coverage.mjs';
import { ledgerPath, mainCheckoutOf, readLedger, recordResult } from '../../to-design/scripts/ledger.mjs';
import { REPO_ROOT, TEST_APPROVER, inScratch } from '../../to-handoff/scripts/system.mjs';
import { folderFiles } from './review.mjs';

const TO_DESIGN = join(REPO_ROOT, 'skills/to-design');
// Variants a check call reads back: a sample read returns each variant's full values, ~1.7 KB for a Button variant.
export const SAMPLE_PER_CALL = 24;
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
// The record's Contracts (`contracts`, by contentHash) are kept as files beside it, one per Contract, not in it.
const contractsDir = recordFile => recordFile.replace(/\.json$/, '.contracts');
const contractFile = (recordFile, hash) => join(contractsDir(recordFile), `${hash.replace(/^sha256:/, '')}.json`);

/** The build record at its path with its Contracts, or {} when there is none. */
export function readRecord(recordFile) {
  if (!existsSync(recordFile)) return {};
  const { contracts: hashes, ...record } = JSON.parse(readFileSync(recordFile, 'utf8'));
  if (!hashes) return record;
  return { ...record, contracts: Object.fromEntries(hashes.map(h => [h, JSON.parse(readFileSync(contractFile(recordFile, h), 'utf8'))])) };
}

/** Writes the build record, its Contracts as files beside it (a Contract no longer kept is removed) and their hashes in it. */
export function writeRecord(recordFile, record) {
  const { contracts = {}, ...rest } = record;
  mkdirSync(contractsDir(recordFile), { recursive: true });
  for (const [h, c] of Object.entries(contracts)) if (!existsSync(contractFile(recordFile, h))) writeFileSync(contractFile(recordFile, h), JSON.stringify(c) + '\n');
  const keep = new Set(Object.keys(contracts).map(h => contractFile(recordFile, h)));
  for (const f of readdirSync(contractsDir(recordFile))) if (!keep.has(join(contractsDir(recordFile), f))) rmSync(join(contractsDir(recordFile), f));
  writeFileSync(recordFile, JSON.stringify({ ...rest, ...(Object.keys(contracts).length ? { contracts: Object.keys(contracts) } : {}) }, null, 2) + '\n');
}

/** `--take-code` / `--keep-figma` values, `<family>:<variant name>`, as nextStep's resolve. */
export function parseResolve(takeCode = [], keepFigma = []) {
  const parse = keep => v => {
    const i = v.indexOf(':');
    if (i < 1 || i === v.length - 1) throw new Error(`--${keep === 'code' ? 'take-code' : 'keep-figma'} ${v}: give <family>:<variant name>, as the conflict is reported`);
    return { family: v.slice(0, i), variant: v.slice(i + 1), keep };
  };
  return [...takeCode.map(parse('code')), ...keepFigma.map(parse('figma'))];
}

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
 * The build record with a baseline, `built: {family: {contentHash, set, contract, variants: {name: [fingerprint, id]},
 * conflicts?}}`, for each family whose set passed its coverage check from its Contract as it is now. A rerun compares a
 * changed Contract with it. `contract` is that Contract's contentHash, the Contract itself kept in `record.contracts`:
 * an update's check reads each variant back against it. A conflict keeps its variant's entry from before, so it stays
 * a change of the code until the owner resolves it. A baseline from before #181 gets its Contract here too.
 */
export function baselined(record, g, ledger) {
  const built = { ...(record.built || {}) };
  const contracts = { ...(record.contracts || {}) };
  const checked = { ...(record.checked || {}) };
  let changed = false;
  for (const f of g.families) {
    const verdict = (record.coverage || {})[f];
    const rec = ledger && ledger.sets && ledger.sets[f];
    const hash = contentHash(g.contracts[f]);
    if (!verdict || !verdict.ok || verdict.contentHash !== hash || !rec || !rec.set || rec.set.id !== verdict.set || rec.contentHash !== hash) continue;
    const was = built[f];
    if (was && was.contentHash === hash && was.set === rec.set.id && was.contract === hash && contracts[hash]) continue;
    const conflicts = (was && was.set === rec.set.id && was.conflicts) || {};
    const variants = {};
    variantFingerprints(g.contracts[f]).forEach(({ name, fingerprint }, i) => {
      variants[name] = conflicts[name] ? was.variants[name] || [null, null] : [fingerprint, (rec.variants || [])[i] || null];
    });
    built[f] = { contentHash: hash, set: rec.set.id, contract: hash, variants, ...(Object.keys(conflicts).length ? { conflicts } : {}) };
    contracts[hash] = g.contracts[f];
    delete checked[f];
    changed = true;
  }
  return changed ? { ...record, built, contracts: kept(built, contracts), checked } : record;
}

// The Contracts a baseline or a conflict still reads back against; the others are dropped.
function kept(built, contracts) {
  const used = new Set(Object.values(built).flatMap(b => [b.contract, ...Object.values(b.conflicts || {}).map(c => c.contract)]).filter(Boolean));
  return Object.fromEntries(Object.entries(contracts).filter(([h]) => used.has(h)));
}

// A baseline variant, [fingerprint, id], is in the set as a Contract with this variant fingerprint has it.
const holds = (baseline, fingerprint) => !!baseline && baseline[0] === fingerprint && !!baseline[1];

/**
 * An update's variants still to send, by expansion index: the family's Contract changed since its set's baseline, and
 * these variants are new, changed, or have no id in it. The first call of an update goes out even with none (a change
 * of the set alone). A variant the owner said to take the code's version of (`take`) is sent too. null when the family
 * is no update, or its update is done. A conflict is among them: the build leaves it out (`toSend`).
 */
export function pendingUpdate(contract, ledger, built) {
  const rec = ledger && ledger.sets && ledger.sets[contract.family.key];
  if (!built || !rec || !rec.set || rec.placed === false || rec.set.id !== built.set) return null;
  const hash = contentHash(contract);
  const fps = variantFingerprints(contract);
  const take = new Set(built.take || []);
  const taken = fps.map((v, i) => (take.has(v.name) ? i : -1)).filter(i => i >= 0);
  if (built.contentHash === hash) return taken.length ? taken : null;
  const changed = [];
  fps.forEach(({ name, fingerprint }, i) => { if (!holds(built.variants[name], fingerprint)) changed.push(i); });
  if (rec.contentHash !== hash) return changed;
  const left = [...new Set([...changed.filter(i => !(rec.variants || [])[i]), ...taken])].sort((a, b) => a - b);
  return left.length ? left : null;
}

/**
 * The read-back an update needs before its next write, or null: the pending variants that are in the set (a baseline
 * id) and not yet read back for this Contract, nor a conflict at this fingerprint, nor taken on the owner's word. Each is
 * read against the Contract it was built from (a conflict's own, else the baseline's), one Contract and up to
 * SAMPLE_PER_CALL variants a call -> {hash, contract, names, sample: expansion indexes in that Contract}. A variant with
 * no Contract to read against (a baseline from before #181) is in `unread`.
 */
export function nextCheck(contract, record, pending) {
  const f = contract.family.key;
  const built = (record.built || {})[f];
  if (!built || !pending) return null;
  const hash = contentHash(contract);
  const fps = variantFingerprints(contract);
  const done = (record.checked || {})[f];
  const clean = new Set(done && done.for === hash ? done.clean : []);
  const take = new Set(built.take || []);
  const conflicts = built.conflicts || {};
  const due = pending.map(i => fps[i]).filter(({ name, fingerprint }) =>
    built.variants[name] && built.variants[name][1] && !clean.has(name) && !take.has(name) && !(conflicts[name] && conflicts[name].fingerprint === fingerprint));
  if (!due.length) return null;
  const against = name => (conflicts[name] ? conflicts[name].contract : built.contract);
  const unread = due.filter(v => !(record.contracts || {})[against(v.name)]);
  if (unread.length) return { unread };
  const h = against(due[0].name);
  const old = record.contracts[h];
  const index = new Map(variantFingerprints(old).map((v, i) => [v.name, i]));
  const names = due.filter(v => against(v.name) === h && index.has(v.name)).slice(0, SAMPLE_PER_CALL).map(v => v.name);
  // a name the old Contract does not expand cannot be in the set from it: no read, it is sent as new
  if (!names.length) return null;
  return { hash: h, contract: old, names, sample: names.map(n => index.get(n)) };
}

/** An update's indexes to write: the pending ones but the conflicts at their current fingerprint. */
export function toSend(contract, built, pending) {
  const fps = variantFingerprints(contract);
  const conflicts = (built && built.conflicts) || {};
  return pending.filter(i => !(conflicts[fps[i].name] && conflicts[fps[i].name].fingerprint === fps[i].fingerprint));
}

/** Each family's conflicts, for the report: [{family, variant, reason, changes, at}]. */
export function conflictsOf(record) {
  return Object.entries(record.built || {}).flatMap(([family, b]) =>
    Object.entries(b.conflicts || {}).map(([variant, c]) => ({ family, variant, reason: c.reason, ...(c.changes ? { changes: c.changes } : {}), at: c.at })));
}

/**
 * The build record after the owner's word on conflicts, each {family, variant, keep: 'code'|'figma'}: `code` writes the
 * code's version over the variant on the next call; `figma` keeps the variant as Figma has it and takes the code's
 * fingerprint into the baseline, so the change is not built into it (and a later change of its code is a conflict
 * again). Throws for a variant that is no conflict, and for `figma` on a variant gone from the set.
 */
export function resolved(record, g, resolve = []) {
  if (!resolve.length) return record;
  const built = { ...(record.built || {}) };
  for (const { family, variant, keep } of resolve) {
    const b = built[family];
    const c = b && (b.conflicts || {})[variant];
    if (!c) {
      const listed = conflictsOf(record).map(x => `${x.family}:${x.variant}`);
      throw new Error(`${family}:${variant} is no conflict here (${listed.length ? `conflicts: ${listed.join('; ')}` : 'there are none'})`);
    }
    if (keep === 'figma' && c.reason === 'missing') throw new Error(`${family}:${variant} is gone from the set in Figma: to keep it out, untick it on the review page and approve again, or --take-code to build it again`);
    const { [variant]: _, ...conflicts } = b.conflicts;
    const next = { ...b, conflicts };
    if (!Object.keys(conflicts).length) delete next.conflicts;
    if (keep === 'code') next.take = [...new Set([...(b.take || []), variant])];
    else {
      const fp = (variantFingerprints(g.contracts[family]).find(v => v.name === variant) || {}).fingerprint;
      if (fp) next.variants = { ...b.variants, [variant]: [fp, (b.variants[variant] || [])[1] || null] };
    }
    built[family] = next;
  }
  return { ...record, built };
}

// A variant that cannot be read back against the Contract it was built from is kept as a conflict: what Figma holds
// cannot be told from what was built, so nothing is written over it. Either the record keeps no such Contract (a
// baseline from before #181, mid-update), or To-design refuses to plan a read of it against today's Foundations.
function unverifiable(record, g, ledger, fileKey, at) {
  let out = record;
  for (const f of g.families) {
    for (;;) {
      const built = (out.built || {})[f];
      const check = nextCheck(g.contracts[f], out, pendingUpdate(g.contracts[f], ledger, built));
      if (!check) break;
      let unread = check.unread;
      let why = 'the build record keeps no Contract this variant was built from (built before #181)';
      if (!unread) {
        // a read is planned once the Foundations are built: until then To-design plans no call into a set
        if (foundationsNext(g.docText, ledger)) break;
        try { setsPlan(check.contract, g.docText, ledger, { fileKey, mode: 'sample', sample: check.sample, prototype: prototypeOf(check.contract), at }); break; }
        catch (e) { unread = check.names.map(name => ({ name, fingerprint: variantFingerprints(g.contracts[f]).find(v => v.name === name).fingerprint })); why = `no read back against the Contract it was built from: ${e.message}`; }
      }
      const conflicts = { ...(built.conflicts || {}) };
      for (const { name, fingerprint } of unread) conflicts[name] = { reason: 'unchecked', fingerprint, contract: null, changes: [why], at };
      out = { ...out, built: { ...out.built, [f]: { ...built, conflicts } } };
    }
  }
  return out;
}

/** A file built in one namespace is built on in that one; the record takes it from the first call without a conflict. */
function assertNamespace(record, namespace) {
  if ('namespace' in record && record.namespace !== namespace)
    throw new Error(`this file was built with --namespace ${JSON.stringify(record.namespace)}: give the same one (a different one would rename its collections)`);
}

/**
 * The build's next call, from the gate, the ledger and the build record:
 *   {status: 'ask', ask}                                       a set above maxCombine: nothing derived, ask the owner
 *   {status: 'step', step: 'foundations'|'check'|'sets'|'coverage', family?, core, plan, state, options}
 *   {status: 'problems', family, problems}                     a coverage check failed: stop and report
 *   {status: 'built', families: [{family, variants, set}], drafts, skipped, conflicts}
 * Each also carries `record`, the build record with any new baseline (`baselined`), for the CLI to keep.
 * Options: dir, fileKey, ledger, record (the build record), namespace, skip, maxCombine, coveragePerCall, at,
 * rebuild: families whose failed coverage check starts a rebuild of their set (one already under way goes on anyway),
 * and resolve: the owner's word on conflicts, [{family, variant, keep: 'code'|'figma'}] (`resolved`).
 */
export function nextStep({ dir, fileKey, ledger = null, record = {}, namespace = null, skip = [], maxCombine = MAX_COMBINE, coveragePerCall, rebuild = [], resolve = [], at = new Date().toISOString() }) {
  const g = gate({ dir, fileKey, ledger, skip, maxCombine });
  const unknown = rebuild.filter(f => !g.families.includes(f));
  if (unknown.length) throw new Error(`--rebuild ${unknown.join(', ')}: not an approved family of ${dir} built here`);
  assertNamespace(record, namespace);
  record = unverifiable(resolved(baselined(record, g, ledger), g, resolve), g, ledger, fileKey, at);
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
    // an update after a code change: only the variants that changed, a call's worth at a time, each in the set read
    // back first; one edited in Figma is a conflict and is not sent
    const built = (record.built || {})[f];
    const pending = pendingUpdate(g.contracts[f], ledger, built);
    if (pending) {
      const check = nextCheck(g.contracts[f], record, pending);
      if (check) return step('check', f, CORES.sets, setsPlan(check.contract, g.docText, ledger, { fileKey, mode: 'sample', sample: check.sample, prototype: prototypeOf(check.contract), at }));
      const send = toSend(g.contracts[f], built, pending);
      if (send.length || ledger.sets[f].contentHash !== contentHash(g.contracts[f])) {
        const { perCall } = setsPlan(g.contracts[f], g.docText, ledger, { fileKey, mode: 'build', batch: 0, prototype, at }).plan.options;
        return step('sets', f, CORES.sets, setsPlan(g.contracts[f], g.docText, ledger, { fileKey, mode: 'build', indexes: send.slice(0, perCall), prototype, at }));
      }
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
    conflicts: conflictsOf(record),
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
  if (result.slice === 'sets' && result.mode === 'sample') return checkRecorded({ dir, fileKey, ledger, record, result, skip, at });
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
    // a conflict is in the set as Figma has it, not as the Contract does: its variant's problems are the conflict's
    const conflicts = ((record.built || {})[family] || {}).conflicts || {};
    report.problems = report.problems.filter(p => !(p.name && conflicts[p.name]));
    report.ok = !report.problems.length;
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
      // a variant taken on the owner's word is written now
      const take = (base.take || []).filter(n => !wrote.has((base.variants[n] || [])[1]));
      const next = { ...base, contentHash: null, variants, take };
      if (!take.length) delete next.take;
      out.record.built = { ...record.built, [result.family]: next };
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

/**
 * A check call's result: each variant it read back, diffed against the Contract it was built from (`checkSample`, but
 * its grid cell, which every append re-places by name). One that differs, or is not in the set, was edited in Figma and
 * becomes a conflict at the code's fingerprint; the others are clean for this Contract. The read must be the one
 * `next` asked for. -> {ledger, record, check: {family, clean, conflicts}}
 */
function checkRecorded({ dir, fileKey, ledger, record, result, skip, at }) {
  const family = result.family;
  const g = gate({ dir, fileKey, ledger, skip });
  const contract = g.contracts[family];
  const check = contract && nextCheck(contract, record, pendingUpdate(contract, ledger, (record.built || {})[family]));
  const read = Object.keys(result.sample || {});
  if (!check || !check.names || read.length !== check.names.length || check.names.some(n => !read.includes(n)))
    throw new Error(`this ${family} read is not the check the build asked for (${check && check.names ? check.names.join('; ') : 'none'}): run next again`);
  const report = checkSample(check.contract, result, ledger, g.doc);
  const fps = new Map(variantFingerprints(contract).map(v => [v.name, v.fingerprint]));
  const edited = {};
  for (const p of report.problems.filter(p => p.what !== 'cell')) {
    const c = edited[p.name] = edited[p.name] || { reason: p.what === 'missing' ? 'missing' : 'edited', fingerprint: fps.get(p.name), contract: check.hash, at };
    if (p.what === 'diff') c.changes = [...(c.changes || []), ...p.changes.map(x => `${x.section}.${x.node}.${x.field}`), ...p.unread.map(x => `unread ${typeof x === 'string' ? x : JSON.stringify(x)}`)];
    if (p.what === 'wiring') c.changes = [...(c.changes || []), 'wiring'];
  }
  const clean = check.names.filter(n => !edited[n]);
  const built = record.built[family];
  const hash = contentHash(contract);
  const done = (record.checked || {})[family];
  const before = done && done.for === hash ? done.clean : [];
  const conflicts = { ...(built.conflicts || {}) };
  // a conflict read back clean (the owner put it back as built) is one no more
  for (const n of clean) delete conflicts[n];
  Object.assign(conflicts, edited);
  const next = { ...built, conflicts };
  if (!Object.keys(conflicts).length) delete next.conflicts;
  return {
    ledger,
    record: { ...record, built: { ...record.built, [family]: next }, checked: { ...(record.checked || {}), [family]: { for: hash, clean: [...new Set([...before, ...clean])] } } },
    check: { family, clean, conflicts: Object.keys(edited) },
  };
}

// During an update, the variants whose fingerprint holds keep their baseline ids in the ledger: they are in the set as
// this Contract has them, so no call writes them. A conflict keeps its id too: it is in the set as Figma has it.
function carried(ledger, result, record, gateOf) {
  const family = result.slice === 'sets' && result.mode === 'build' && result.phase === 'append' ? result.family : null;
  const built = family && (record.built || {})[family];
  const rec = built && ledger.sets[family];
  if (!rec || !rec.set || rec.set.id !== built.set || rec.contentHash === built.contentHash) return ledger;
  const contract = gateOf().contracts[family];
  if (!contract || contentHash(contract) !== rec.contentHash) return ledger;
  const variants = rec.variants.slice();
  const conflicts = built.conflicts || {};
  variantFingerprints(contract).forEach(({ name, fingerprint }, i) => {
    if (!variants[i] && (holds(built.variants[name], fingerprint) || (conflicts[name] && built.variants[name]))) variants[i] = built.variants[name][1];
  });
  return { ...ledger, sets: { ...ledger.sets, [family]: { ...rec, variants } } };
}

const USAGE = [
  'usage: build.mjs next design-systems/<name> <figma-file-url> --out <run dir> [--ledger <path>] [--namespace <prefix>] [--skip <family>]... [--rebuild <family>]...',
  '                 [--take-code <family>:<variant>]... [--keep-figma <family>:<variant>]...',
  '       build.mjs record design-systems/<name> <figma-file-url> <run dir>/result.json [--ledger <path>] [--namespace <prefix>] [--skip <family>]...',
].join('\n');

function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, ledger: { type: 'string' }, namespace: { type: 'string' }, skip: { type: 'string', multiple: true, default: [] }, rebuild: { type: 'string', multiple: true, default: [] },
      'take-code': { type: 'string', multiple: true, default: [] }, 'keep-figma': { type: 'string', multiple: true, default: [] } } });
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
  const record = readRecord(recordFile);
  const namespace = values.namespace ?? null;
  const rel = p => relative(process.cwd(), p);
  const keepRecord = r => { mkdirSync(dirname(recordFile), { recursive: true }); writeRecord(recordFile, r); };
  const conflictLines = cs => cs.map(c => `CONFLICT ${c.family}:${c.variant}: ${c.reason === 'missing' ? 'gone from the set in Figma' : c.reason === 'unchecked' ? 'not read back' : 'edited in Figma'}, and its code changed; left as Figma has it${c.changes ? ` (${c.changes.join(', ')})` : ''}`);

  if (cmd === 'record') {
    const result = JSON.parse(readFileSync(resolve(resultPath), 'utf8'));
    const r = recordStep({ dir, fileKey, ledger, record, result, namespace, skip: values.skip });
    if (r.ledger !== ledger) { mkdirSync(dirname(ledgerFile), { recursive: true }); writeFileSync(ledgerFile, JSON.stringify(r.ledger, null, 2) + '\n'); }
    keepRecord(r.record);
    const conflicts = result.conflicts || [];
    if (conflicts.length) {
      console.error(`FAIL: ${conflicts.length} conflict(s), nothing changed in Figma for them; the ledger keeps its old section:\n${JSON.stringify(conflicts, null, 2)}`);
      process.exit(1);
    }
    if (r.check) {
      console.log(`checked ${r.check.family}: ${r.check.clean.length} as built${r.check.conflicts.length ? `, ${r.check.conflicts.length} edited in Figma, left as they are: ${r.check.conflicts.join('; ')}` : ''}`);
      return;
    }
    if (r.verdict) {
      console.log(JSON.stringify({ coverage: r.verdict.family, ok: r.verdict.ok, expected: r.verdict.expected, read: r.verdict.read, problems: r.verdict.problems }));
      process.exit(r.verdict.ok ? 0 : 1);
    }
    console.log(`recorded ${result.slice}${result.family ? ` ${result.family}` : ''}${result.mode ? ` ${result.mode}` : ''}${result.batch ? ` ${result.batch[0] + 1}/${result.batch[1]}` : ''} into ${rel(ledgerFile)}`);
    return;
  }

  const n = nextStep({ dir, fileKey, ledger, record, namespace, skip: values.skip, rebuild: values.rebuild, resolve: parseResolve(values['take-code'], values['keep-figma']) });
  if (JSON.stringify(n.record) !== JSON.stringify(record)) keepRecord(n.record);
  if (n.status === 'ask') {
    console.error(`ASK THE OWNER: nothing was written to Figma.\n${n.ask.map(a => `- ${a.family} has ${a.total} variants, above MAX_COMBINE (${MAX_COMBINE}): its first build combines them all in one call, which grows with the square of the set and nears the ~2 min call ceiling.`).join('\n')}\nThe owner can untick variants on the review page and approve again, or build the rest without it (--skip <family>, only on the owner's word).`);
    process.exit(3);
  }
  if (n.status === 'problems') {
    console.error(`FAIL: the ${n.family} set does not pass the coverage check:\n${JSON.stringify(n.problems, null, 2)}\nOnce the cause is fixed, --rebuild ${n.family} builds the set's batches again and reads its coverage again.${conflictsOf(n.record).some(c => c.family === n.family) ? ` It writes over ${n.family}'s conflicts too, the owner's Figma edits: only on the owner's word.` : ''}`);
    process.exit(1);
  }
  if (n.status === 'built') {
    console.log([
      ...n.families.map(f => `built ${f.family}: ${f.variants} variants on page ${f.page} (set ${f.set}), coverage passed`),
      ...n.drafts.map(f => `not built ${f}: a draft`),
      ...n.skipped.map(f => `not built ${f}: skipped on the owner's word`),
      ...conflictLines(n.conflicts),
      ...(n.conflicts.length ? [`Each conflict is the owner's to resolve, per variant: --take-code <family>:<variant> writes the code's version over it, --keep-figma <family>:<variant> keeps Figma's.`] : []),
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
