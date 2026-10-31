#!/usr/bin/env node
// Build-plan deriver (To-design). Derives one slice's build plan from its inputs (the foundations document,
// or the Contracts plus the unpacked icon package), the Design Library file's ledger and the run options,
// and writes plan.json and state.json for the packager. The plan is disposable: re-derive it for every call.
//
//   node skills/to-design/scripts/build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir>
//        [--mode build|diff] [--adopt] [--prune name,name] [--page "Page 1"] [--chunk N] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs icons --contract <component.json> [--contract ...]
//        --icons-dir <unpacked icon package> --file-key <key> --out <dir> [--adopt] [--page Icons] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs base --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir>
//        [--adopt] [--read-only] [--page <name>] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs sets --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir>
//        [--next | --mode build|combine|place|reconcile|coverage|sample|theme|prune-preview|prune] [--batch N] [--per-call N] [--budget ms]
//        [--sample i,j] [--prune-list <prune.json>] [--adopt] [--prototype] [--page <name>] [--ledger <path>]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { baseTuple, contentHash, expand, ICON_KEY, icons as iconKeys, iconName, PROTOTYPE_APPROVER, validate, variantName } from '../../contract/scripts/contract.mjs';
import { baseProps, defaultProps, expectedBase, expectedVariant, iconRef as iconRefKey, norm } from './readback.mjs';
import { defaultLedgerPath, emptyLedger, readLedger } from './ledger.mjs';
import { assertNested, familyNodes, heldIds, loadHeld } from './nested.mjs';
import { assertRecorded, CALL_BUDGET, chunks, chunkState, selectedGroups, selection, subsetDocument } from './foundations-subset.mjs';

// Fields the core never needs, so the package leaves them out: the reviewer's, and a Mode's selector (To-preview and To-handoff read it).
const REVIEW_ONLY = { document: ['source', 'closure', 'checks', 'notes'], entry: ['source', 'usedBy', 'family'], value: ['from', 'reason', 'level', 'resolved'], mode: ['selector'] };
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

/** The foundations document without its review-only fields. */
export function stripReviewFields(doc) {
  return {
    ...omit(doc, REVIEW_ONLY.document),
    collections: doc.collections.map(c => ({ ...c, modes: c.modes.map(m => omit(m, REVIEW_ONLY.mode)) })),
    variables: mapValues(doc.variables, v => ({ ...omit(v, REVIEW_ONLY.entry), values: mapValues(v.values, x => omit(x, REVIEW_ONLY.value)) })),
    textStyles: mapValues(doc.textStyles, s => omit(s, REVIEW_ONLY.entry)),
  };
}

/** sha256 of the document bytes, as the ledger records it. */
export const documentHash = docText => `sha256:${createHash('sha256').update(docText, 'utf8').digest('hex')}`;

// the selected subset of the whole theme (#107), split by group when it needs several calls;
// documentHash stays the whole document's, as later slices check it
function foundationsParts(docText, ledger, budget) {
  const doc = JSON.parse(docText);
  if (doc.schemaVersion !== 1) throw new Error('foundations document schemaVersion must be 1');
  const names = selection(doc, selectedGroups(ledger, doc));
  const stripped = stripReviewFields(doc);
  return { doc, names, parts: chunks(doc, names, (kind, n) => JSON.stringify(stripped[kind][n]).length + 2 * n.length + 36, budget) };
}

/**
 * The foundations chunk to build next for this document (1-based), or null once the ledger records every chunk's
 * names from it. A chunk counts as recorded as `assertRecorded` counts it.
 */
export function foundationsNext(docText, ledger, { budget = CALL_BUDGET } = {}) {
  const { parts } = foundationsParts(docText, ledger, budget);
  const f = ledger && ledger.foundations;
  const hash = documentHash(docText);
  const k = parts.findIndex(p => ['variables', 'textStyles'].some(kind => [...p.owned[kind]].some(n => !f || f.documentHash !== hash || !(f[kind] || {})[n])));
  return k === -1 ? (f && f.documentHash === hash ? null : 1) : k + 1;
}

/**
 * The foundations slice's plan and state.
 * `docText` is the document file's text (its bytes are the documentHash); `ledger` is the file's ledger or null.
 * Options: fileKey (required), adopt, prune (orphan names the owner confirmed for deletion), page, at, strip,
 * chunk (1-based, when the selection needs several calls: `plan.chunk` says how many) and budget (chars per call).
 * `readOnly` makes a diff: the core reports what a build would create and update, writes nothing and carries the
 * ledger unchanged, so any chunk can be read without the earlier ones recorded and no `record` follows it (#241).
 */
export function foundationsPlan(docText, ledger, { fileKey, adopt = false, prune = [], readOnly = false, page = null, at = new Date().toISOString(), strip = true, chunk = 1, budget = CALL_BUDGET } = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (ledger && ledger.fileKey !== fileKey) throw new Error(`ledger is for ${ledger.fileKey}, not ${fileKey}`);
  const { doc, names, parts } = foundationsParts(docText, ledger, budget);
  if (!(chunk >= 1 && chunk <= parts.length)) throw new Error(`there is no chunk ${chunk} of ${parts.length}`);
  if (readOnly && prune.length) throw new Error('a diff takes no prune: it writes nothing');
  if (chunk > 1 && prune.length) throw new Error('prune runs with chunk 1, which carries the whole selection\'s orphans');
  // a diff reads one chunk against whatever the file holds, recorded or not
  if (!readOnly) assertRecorded(ledger, parts, chunk, documentHash(docText));
  const sub = subsetDocument(doc, parts.length > 1 ? parts[chunk - 1].names : names);
  const plan = {
    schemaVersion: 1,
    slice: 'foundations',
    fileKey,
    page,
    at,
    options: { adopt: !!adopt, prune: [...prune], ...(readOnly ? { readOnly: true } : {}) },
    designSystem: doc.designSystem.key,
    snapshotId: doc.source.snapshotId,
    documentHash: documentHash(docText),
    foundations: strip ? stripReviewFields(sub) : sub,
    ...(parts.length > 1 ? { chunk: { index: chunk, of: parts.length, groups: parts[chunk - 1].groups } } : {}),
  };
  // The slice reads only the ledger's foundations, so the file's other records (a built set's every variant id) stay
  // out of the call, where they would count against its budget (#180: a Foundations call after the sets are built).
  const foundationsOnly = l => ({ schemaVersion: l.schemaVersion, fileKey: l.fileKey, ...(l.foundations ? { foundations: l.foundations } : {}) });
  const state = !ledger ? emptyLedger(fileKey) : foundationsOnly(parts.length > 1 ? chunkState(ledger, parts[chunk - 1], chunk === 1 ? names : null) : ledger);
  const chars = JSON.stringify(plan).length + JSON.stringify(state).length;
  if (strip && chars > budget) throw new Error(`the foundations plan and state are ${chars} chars, over the ${budget} a call takes`);
  return { plan, state };
}

// Shapes that paint nothing: Carbon's two-tone inner path (fill="none", data-icon-path, or opacity="0" in
// 16px status icons such as warning--filled, #93) and its transparent rectangle (style="fill:none"). Code
// never paints them, and a flatten would fill them in: warning--filled would build as a solid disc.
const UNPAINTED = /<(path|rect|circle|ellipse|polygon)\b[^>]*(\bfill="none"|fill:\s*none|\bopacity="0")[^>]*\/>/g;

/**
 * The icons slice's plan and state: one entry per icon the Contracts name (`icons()` of the shared module),
 * read from `iconsDir` (an unpacked icon package) through each Contract's `icons.source` path templates,
 * the first template that exists winning (`path`, else `fallback`).
 * Options: fileKey (required), adopt, page (default "Icons"), at.
 */
export function iconsPlan(contracts, iconsDir, ledger, { fileKey, adopt = false, page = 'Icons', at = new Date().toISOString() } = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (ledger && ledger.fileKey !== fileKey) throw new Error(`ledger is for ${ledger.fileKey}, not ${fileKey}`);
  const withIcons = contracts.filter(c => iconKeys(c).length);
  const sources = [...new Set(withIcons.map(c => JSON.stringify(c.icons.source)))];
  if (sources.length > 1) throw new Error(`Contracts must share one icon package and path templates, got ${sources.join(' and ')}`);
  const source = sources.length ? JSON.parse(sources[0]) : null;
  const icons = [];
  if (source) {
    const pkg = JSON.parse(readFileSync(join(iconsDir, 'package.json'), 'utf8'));
    if (pkg.name !== source.package || pkg.version !== source.version)
      throw new Error(`${iconsDir} holds ${pkg.name}@${pkg.version}, the Contracts pin ${source.package}@${source.version}`);
    const keys = [...new Set(withIcons.flatMap(iconKeys))];
    for (const key of keys) {
      if (!ICON_KEY.test(key)) throw new Error(`icon key "${key}" is not an icon file name`);
      const tried = [source.path, source.fallback].filter(Boolean).map(t => t.replace('{key}', key));
      const file = tried.find(f => existsSync(join(iconsDir, f)));
      if (!file) throw new Error(`icon ${key}: none of ${tried.join(', ')} in ${source.package}@${source.version}`);
      const svg = readFileSync(join(iconsDir, file), 'utf8').trim().replace(UNPAINTED, '');
      icons.push({ key, name: iconName(key), file, svg, sha256: documentHash(svg) });
    }
  }
  const plan = {
    schemaVersion: 1,
    slice: 'icons',
    fileKey,
    page,
    at,
    options: { adopt: !!adopt },
    source: source && { package: source.package, version: source.version },
    icons,
  };
  return { plan, state: { schemaVersion: 1, fileKey, icons: (ledger && ledger.icons) || null } };
}

/**
 * The base slice's plan and state (#31): the Base Component of one Contract, resolved here (the core never
 * matches rules), with values stripped to what Figma shows ({token}, {raw}, keywords, effects with every
 * number). The Contract must validate against the foundations document, and that document must be the one
 * the file's foundations were last built from (ledger documentHash), so every token has a variable. State
 * carries only the ids this plan uses, plus the ledger's `bases` section.
 * Options: fileKey (required), adopt, adoptVariant (take the variant of the family's recorded Component Set at the
 * base index as the Base Component, #235), readOnly, page (default the Contract's figma.page), at.
 */
export function basePlan(contract, docText, ledger, { fileKey, adopt = false, adoptVariant = false, readOnly = false, page = null, at = new Date().toISOString() } = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (!ledger || ledger.fileKey !== fileKey) throw new Error(`no ledger for ${fileKey}: build foundations and icons first`);
  const nested = familyNodes(contract).map(n => n.node);
  if (nested.length) throw new Error(`${contract.family.key} holds other families (${nested.join(', ')}): a holding family is built as a Component Set (#593), not as a Base Component alone`);
  const doc = JSON.parse(docText);
  const v = validate(contract, doc);
  if (!v.ok) throw new Error(`the Contract does not validate: ${v.errors.map(e => `${e.at}: ${e.message}`).join("; ")}`);
  const f = ledger.foundations;
  if (!f) throw new Error('the ledger has no foundations: build them first');
  if (f.documentHash !== documentHash(docText)) throw new Error(`the foundations document changed since the last foundations build (${f.documentHash}); rebuild foundations first`);
  let adopted = null;
  if (adoptVariant) {
    if (adopt) throw new Error('adopt and adoptVariant are alternatives: pass one');
    if (page) throw new Error('adoptVariant builds on the set\'s page: it takes no page');
    if (readOnly) throw new Error('adoptVariant writes the ledger\'s Base Component: it takes no read-only');
    const rec = ledger.sets && ledger.sets[contract.family.key];
    if (!rec || !rec.set) throw new Error(`no Component Set of ${contract.family.key} in the ledger: build the set first, or build the Base Component alone`);
    if (rec.contentHash !== contentHash(contract)) throw new Error(`the ${contract.family.key} set was built from another Contract (${rec.contentHash}): rehash or rebuild it first`);
    const tuples = expand(contract);
    const bt = baseTuple(contract);
    const baseIndex = tuples.findIndex(t => contract.axes.every(a => t[a.key] === bt[a.key]));
    const variantId = (rec.variants || [])[baseIndex];
    if (!variantId) throw new Error(`the ${contract.family.key} set has no variant at the base index ${baseIndex} (${variantName(contract, tuples[baseIndex])}): build the set's variants first`);
    adopted = { id: variantId, page: rec.page };
  }
  // the review specimen while the base stands alone; the property defaults once the family's set holds it
  const exp = expectedBase(contract, baseProps(contract, !!(ledger.sets && ledger.sets[contract.family.key])), doc);
  const strip = sec => Object.fromEntries(Object.entries(sec).map(([n, fields]) => [n, Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, norm(x)]))]));
  const base = { name: exp.name, tree: exp.tree, layout: strip(exp.layout), paint: strip(exp.paint), visible: exp.visible, text: exp.text, swap: exp.swap, fonts: [] };
  const variables = {};
  const textStyles = {};
  const use = (field, x) => {
    if (Array.isArray(x)) return x.forEach(e => Object.entries(e).forEach(([k, y]) => use(k, y)));
    if (!x || typeof x !== 'object' || !('token' in x)) return;
    const [map, have] = field === 'textStyle' ? [textStyles, f.textStyles] : [variables, f.variables];
    if (!have[x.token]) throw new Error(`${x.token} is not in the ledger's foundations`);
    map[x.token] = have[x.token];
  };
  for (const sec of [base.layout, base.paint]) for (const fields of Object.values(sec)) for (const [k, x] of Object.entries(fields)) use(k, x);
  const fonts = new Set((contract.dependencies.fonts || []).flatMap(ft => ft.styles.map(s => JSON.stringify({ family: ft.family, style: s }))));
  for (const t of Object.keys(textStyles)) fonts.add(JSON.stringify({ family: doc.textStyles[t].fontFamily, style: doc.textStyles[t].fontStyle }));
  base.fonts = [...fonts].sort().map(s => JSON.parse(s));
  const comps = (ledger.icons && ledger.icons.components) || {};
  const icons = {};
  for (const key of Object.values(base.swap)) {
    if (!comps[key]) throw new Error(`icon ${key} is not in the ledger: build icons first`);
    icons[key] = comps[key].id;
  }
  const plan = {
    schemaVersion: 1,
    slice: 'base',
    fileKey,
    page: page || contract.figma.page,
    at,
    options: { adopt: !!adopt, readOnly: !!readOnly, ...(adopted ? { adoptVariant: adopted } : {}) },
    family: contract.family.key,
    designSystem: doc.designSystem.key,
    snapshotId: contract.source.snapshotId,
    contentHash: contentHash(contract),
    documentHash: f.documentHash,
    base,
  };
  return { plan, state: { schemaVersion: 1, fileKey, variables, textStyles, icons, bases: ledger.bases || null } };
}

// ---------- component sets (#32) ----------

/**
 * Variants per build call, at most. Measured live (#32): see SKILL.md "Component Sets" for the slope and why this
 * ceiling keeps each call well under the connection limit and the package under use_figma's 50,000 chars.
 */
export const PER_CALL = 49;
/**
 * Variants per append call into a set of `total` (#168, ADR 0004): an append costs about 1.8 ms × per call × set
 * size, kept under about 45 s.
 */
export const appendPerCall = total => Math.max(1, Math.min(PER_CALL, Math.floor(45000 / (1.8 * total))));
/**
 * The largest first build (#168): its one combine call measured 46.9 s at 2304 variants and grows about with the
 * square of the set, so about 3,000 variants (≈ 80 s) nears the ~2 min call ceiling.
 */
export const MAX_COMBINE = 3000;
/** A place call's time budget (ms): it stops after the first change past it, and the next place call resumes. */
export const PLACE_BUDGET = 45000;
/**
 * A sets call's plan + state JSON, at most (chars): use_figma's 50,000 less the packaged components core and
 * its wrapper (tests/bprime.test.mjs measures them). 10606 leaves 20 chars under the core since #593 added nested
 * instances' properties, overrides and main components to it.
 */
export const SETS_BUDGET = 10606;
// a reconcile window, at most: its entries carry no fragments
const RECONCILE_PER_CALL = 500;
/**
 * A paged coverage read's window of the set's children, at most: a row is about 32 bytes at 2,304 variants (#168's
 * read came to 74.5KB), so 400 rows and the set's own fields stay well under use_figma's 20KB output.
 */
export const COVERAGE_PER_CALL = 400;
/**
 * A sample or theme read's output, at most (bytes): use_figma's 20KB less a tenth, for an anatomy whose layers carry
 * more fields than the one measured.
 */
export const READ_OUTPUT = 18000;
/**
 * Read output per layer of the anatomy, per variant (bytes). Measured live on the CDS Button (#456), 10 layers with a
 * spinner: a sample read 3.23-3.31KB per variant, a theme read 0.43KB.
 */
export const READ_PER_LAYER = { sample: 340, theme: 45 };
const layersOf = node => 1 + (node.children || []).reduce((m, c) => m + layersOf(c), 0);
/** A sample or theme plan's estimated read output (bytes): its variants × the anatomy's layers × READ_PER_LAYER. */
export const readEstimate = plan => plan.selection.entries.length * layersOf(plan.tree) * READ_PER_LAYER[plan.options.mode];
// The Component Header template every family page's Header is an instance of (one per file):
// TEXT properties with their font style and size.
export const TEMPLATES = {
  page: 'Templates',
  header: { name: 'Component Header', fields: [['Type', 'Regular', 14], ['Title', 'SemiBold', 42], ['Namespace', 'Regular', 14]] },
};
export const SET_MODES = ['build', 'combine', 'place', 'reconcile', 'coverage', 'sample', 'theme', 'prune-preview', 'prune'];

// The approval gate: an approved Contract that validates. `prototype` also lets through the one error a
// prototype approval raises (rule 8, by: PROTOTYPE_APPROVER), and nothing else.
function checkApproved(contract, doc, prototype) {
  const v = validate(contract, doc);
  const approver = contract.selection && contract.selection.approval && contract.selection.approval.by;
  const errors = v.errors.filter(e => !(prototype && e.rule === 8 && e.at === 'selection.approval.by' && approver === PROTOTYPE_APPROVER));
  if (errors.length) throw new Error(`the Contract does not validate: ${errors.map(e => `${e.at}: ${e.message}`).join('; ')}`);
  if (contract.selection.status !== 'approved') throw new Error('the Contract is not approved: approve the Base Component first (base-loop.mjs approve)');
}

const stripFields = fields => Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, norm(x)]));

// The fragments every variant is built from: each (section, node) field group a resolved tuple holds,
// numbered over the whole expansion so a number means the same fragment in every batch; and each distinct
// property wiring ({visible, text, swap, refs} at the property defaults, and a nested instance's props). Returns per tuple its references, and
// the layer tree every variant shares (an ELLIPSE is an arc in every variant or in none, #442).
function fragmentsOf(contract, tuples, doc, held) {
  const frags = new Map();
  const wirings = new Map();
  const props = defaultProps(contract);
  let tree; // one layer tree for the set: validate refuses an ELLIPSE that is an arc in some variants only
  const refs = tuples.map(t => {
    const exp = expectedVariant(contract, t, props, doc, held);
    tree = tree || exp.tree;
    const ids = [];
    for (const sec of ['layout', 'paint'])
      for (const [node, fields] of Object.entries(exp[sec])) {
        const key = JSON.stringify([sec, node, stripFields(fields)]);
        if (!frags.has(key)) frags.set(key, frags.size);
        ids.push(frags.get(key));
      }
    // a nested instance's property values (#593), only where the Contract holds one, so other plans stay as they were
    const w = JSON.stringify({ visible: exp.visible, text: exp.text, swap: exp.swap, refs: exp.refs, ...(Object.keys(exp.props).length ? { props: exp.props } : {}) });
    if (!wirings.has(w)) wirings.set(w, wirings.size);
    return { p: wirings.get(w), frags: ids };
  });
  return { frags: [...frags.keys()].map(k => JSON.parse(k)), wirings: [...wirings.keys()].map(k => JSON.parse(k)), refs, tree };
}

/** The tuples a sets plan's entries stand for, in entry order: [{index, tuple}]. */
export function decodeEntries(plan, contract) {
  const keys = plan.selection.axes;
  return plan.selection.entries.map(e => ({
    index: e[0],
    tuple: Object.fromEntries(keys.map((k, a) => [k, contract.axes.find(x => x.key === k).values[e[a + 1]].key])),
  }));
}

/** What one entry builds, read from the plan alone: {layout, paint} by node, and its property wiring. */
export function entrySpec(plan, entry) {
  const n = plan.selection.axes.length;
  const out = { layout: {}, paint: {}, wiring: plan.P[entry[n + 1]] };
  for (const id of entry.slice(n + 2)) { const [sec, node, fields] = plan.frags[id]; out[sec][node] = fields; }
  return out;
}

/**
 * A sets slice's plan and state (#32): one call for a family's Component Set, from the approved Contract.
 * A family's first build (#168, ADR 0004) runs `build` batches in the loose phase (each variant a loose component
 * on the page), then one `combine` call (combineAsVariants over them all, nothing else), then `place` calls (the
 * set's grid, properties and every variant's cell and property wiring, under a time budget, each resuming where
 * the last stopped). Once placed, `build` batches append into the set (re-runs and updates). `next` derives the
 * family's next step from the ledger, or returns null when it is built.
 * Other modes read only: `reconcile` (the ledger section rebuilt from what the file holds, after a lost
 * connection; windowed by `batch`), `coverage` (every variant's name, grid cell and property wiring), `sample` and
 * `theme` (full values, or the resolved colours per mode, of the variants at the expansion indexes `sample`, split into
 * as many calls as SETS_BUDGET and READ_OUTPUT need and then read by `batch`, #456),
 * `prune-preview` (every ledger orphan with its instance count in the file); `prune` deletes the orphans on
 * `prune`, the owner-confirmed list {variant name: instance count from the preview} (#67).
 * Per call: loose batches take up to PER_CALL (flat in set size); appends take appendPerCall(total), or up to
 * PER_CALL when every variant in the window has a recorded id (an update-free re-run); both shrink until every
 * window's plan and state fit SETS_BUDGET.
 * Entries are axis-ordered tuples [index, value positions..., wiring, fragments...]. The plan asserts they
 * decode back to the expansion and resolve to what the Contract resolves; the core never matches rules.
 * A `coverage` read with `batch` reads one window of `coveragePerCall` of the set's children (the last window is
 * open-ended); `coverage.mjs` merges the pages (`mergeCoverage`). Without `batch` it reads the whole set.
 * `indexes` (expansion indexes, at most one append call's worth) makes a `build` call into a placed set append exactly
 * those variants, in place of a batch window: an update that leaves every other variant as it is (#180). It may be
 * empty: the call then updates only the set itself (its name, description, properties and grid) and re-places its
 * children.
 * A family that holds another (#593) is planned with `held` ({designSystem, contracts}, see nested.mjs): each nested
 * instance swaps to its held variant, whose id the state carries under its ref (`family:<ds>/<key>/<tupleKey>`) beside
 * the icons, and is refused with named Conflicts (assertNested) unless the held set is built from the held Contract
 * and holds every resolved tuple. A coverage read lists the nested instances (`nested`), whose main components it reads.
 * Options: fileKey (required), mode, next, batch, indexes, perCall, coveragePerCall, budget, sample, prune, adopt,
 * prototype, page, at, held.
 */
export function setsPlan(contract, docText, ledger, {
  fileKey, mode = 'build', next = false, batch, indexes = null, perCall, coveragePerCall = COVERAGE_PER_CALL, budget = PLACE_BUDGET, sample = [], prune = null, adopt = false,
  prototype = false, page = null, at = new Date().toISOString(), held = null,
} = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (!SET_MODES.includes(mode)) throw new Error(`mode must be one of ${SET_MODES.join(', ')}`);
  if ((mode === 'prune') !== !!prune) throw new Error('prune takes a prune list (--prune-list), and only the prune mode does');
  if (indexes != null && (mode !== 'build' || next || batch != null)) throw new Error('indexes pick a build call\'s variants themselves: give them with mode build and no next or batch');
  if (!ledger || ledger.fileKey !== fileKey) throw new Error(`no ledger for ${fileKey}: build foundations and icons first`);
  if (perCall != null && (!Number.isInteger(perCall) || perCall < 1 || perCall > PER_CALL)) throw new Error(`--per-call takes 1..${PER_CALL}: at most ${PER_CALL} per call`);
  const doc = JSON.parse(docText);
  checkApproved(contract, doc, prototype);
  const f = ledger.foundations;
  if (!f) throw new Error('the ledger has no foundations: build them first');
  if (f.documentHash !== documentHash(docText)) throw new Error(`the foundations document changed since the last foundations build (${f.documentHash}); rebuild foundations first`);
  assertNested(contract, held, ledger);
  const nested = familyNodes(contract).map(n => n.node);
  const family = contract.family.key;
  const tuples = expand(contract);
  const total = tuples.length;
  const axes = contract.axes.map(a => a.key);
  const base = baseTuple(contract);
  const hash = contentHash(contract);

  // The family's phase, from its ledger record: no set yet (the first build), combined but not placed, or built.
  const rec = ledger.sets && ledger.sets[family];
  const ids = rec && rec.contentHash === hash && Array.isArray(rec.variants) && rec.variants.length === total ? rec.variants : [];
  const combined = !!(rec && rec.set);
  const unplaced = combined && rec.placed === false;
  if (!combined && (next || mode === 'build' || mode === 'combine') && total > MAX_COMBINE)
    throw new Error(`a first build of ${family} combines its ${total} variants in one call, above MAX_COMBINE (${MAX_COMBINE}): the combine measured 46.9 s at 2304 and grows with the square (about ${Math.round(46.9 * (total / 2304) ** 2)} s here), near the ~2 min call ceiling`);
  const { frags, wirings, refs, tree } = fragmentsOf(contract, tuples, doc, held);
  const ax = k => contract.axes.findIndex(a => a.key === k);
  const pos = (t, k) => contract.axes.find(a => a.key === k).values.findIndex(v => v.key === t[k]);
  // a tuple's index in the axis-value product, in Contract order
  const productIndex = t => contract.axes.reduce((m, a) => m * a.values.length + a.values.findIndex(v => v.key === t[a.key]), 0);
  const product = contract.axes.reduce((m, a) => m * a.values.length, 1);
  const fontFamily = ((contract.dependencies.fonts || [])[0] || {}).family || 'Inter';
  const props = contract.properties.map(p => {
    const o = { key: p.key, name: p.label, type: p.type, default: p.default };
    if (p.type === 'INSTANCE_SWAP') {
      o.default = iconRefKey(contract, p.default);
      o.preferred = p.preferred === 'icon:preferred' ? [...contract.icons.preferred] : [].concat(p.preferred || []).map(r => iconRefKey(contract, r));
    }
    return o;
  });
  const comps = (ledger.icons && ledger.icons.components) || {};
  const icons = {};
  for (const key of iconKeys(contract)) {
    if (!comps[key]) throw new Error(`icon ${key} is not in the ledger: build icons first`);
    icons[key] = { id: comps[key].id, key: comps[key].key };
  }

  // The plan and state for the picked expansion indexes, but the state's ledger record (`sets`), which is added last.
  function assemble(picked, mode, options) {
    const full = mode !== 'reconcile';
    const entries = picked.map(i => [i, ...axes.map(k => pos(tuples[i], k)), ...(full ? [refs[i].p, ...refs[i].frags] : [])]);
    const P = {};
    const usedFrags = {};
    if (full) for (const i of picked) { P[refs[i].p] = wirings[refs[i].p]; for (const id of refs[i].frags) usedFrags[id] = frags[id]; }
    // tokens -> ids, only those the picked fragments use
    const variables = {};
    const textStyles = {};
    const use = (field, x) => {
      if (Array.isArray(x)) return x.forEach(e => Object.entries(e).forEach(([k, y]) => use(k, y)));
      if (!x || typeof x !== 'object' || !('token' in x)) return;
      const [map, have] = field === 'textStyle' ? [textStyles, f.textStyles] : [variables, f.variables];
      if (!have[x.token]) throw new Error(`${x.token} is not in the ledger's foundations`);
      map[x.token] = have[x.token];
    };
    for (const [, , fields] of Object.values(usedFrags)) for (const [k, x] of Object.entries(fields)) use(k, x);
    const fonts = new Set((contract.dependencies.fonts || []).flatMap(ft => ft.styles.map(s => JSON.stringify({ family: ft.family, style: s }))));
    for (const t of Object.keys(textStyles)) fonts.add(JSON.stringify({ family: doc.textStyles[t].fontFamily, style: doc.textStyles[t].fontStyle }));
    for (const [, style] of TEMPLATES.header.fields) fonts.add(JSON.stringify({ family: fontFamily, style }));
    // The whole selection, for a call to tell the variants it dropped (#67) and the combine to find every loose
    // variant: bit i (hex, 4 per digit) is tuple i of the axis-value product, in Contract order.
    let member = null;
    if (['build', 'reconcile', 'combine', 'place'].includes(mode)) {
      const bits = new Array(Math.ceil(product / 4)).fill(0);
      for (const t of tuples) { const i = productIndex(t); bits[i >> 2] |= 1 << (i & 3); }
      member = bits.map(b => b.toString(16)).join('');
    }
    const plan = {
      schemaVersion: 1,
      slice: 'sets',
      fileKey,
      page: page || contract.figma.page,
      at,
      options: { mode, adopt: !!adopt, ...options, ...(prune ? { prune } : {}) },
      family,
      designSystem: doc.designSystem.key,
      snapshotId: contract.source.snapshotId,
      contentHash: hash,
      documentHash: f.documentHash,
      total,
      baseIndex: tuples.findIndex(t => axes.every(k => t[k] === base[k])),
      set: {
        name: contract.figma.componentSetName,
        description: contract.figma.description,
        header: contract.figma.header,
        // value labels in Contract order; `order` lists value positions default first, so the default variant sits top-left
        axes: contract.axes.map(a => {
          const d = a.values.findIndex(v => v.key === a.default);
          return { label: a.label, values: a.values.map(v => v.label), order: [d, ...a.values.map((_, i) => i).filter(i => i !== d)] };
        }),
        grid: { columns: contract.figma.grid.columns.map(ax), rows: contract.figma.grid.rows.map(ax) },
      },
      templates: { page: TEMPLATES.page, fontFamily, header: TEMPLATES.header },
      tree,
      fonts: [...fonts].sort().map(x => JSON.parse(x)),
      props,
      P,
      frags: usedFrags,
      selection: { schemaVersion: 1, axes, entries, ...(member ? { member } : {}) },
      ...(mode === 'coverage' && nested.length ? { nested } : {}),
    };
    // A place call settles every variant: its property wiring, and its root's `fill` sizing (a loose component on the
    // page has no auto layout parent to fill). Per product index, a base-36 index into the distinct kinds, '-' unselected.
    if (mode === 'place') {
      const kinds = [];
      const seen = new Map();
      const cells = new Array(product).fill('-');
      tuples.forEach((t, i) => {
        const root = {};
        for (const id of refs[i].frags) {
          const [sec, node, fields] = frags[id];
          if (sec === 'layout' && node === plan.tree.name) for (const k of ['width', 'height']) if (fields[k] === 'fill') root[k] = 'fill';
        }
        const kind = { refs: wirings[refs[i].p].refs, root };
        const k = JSON.stringify(kind);
        if (!seen.has(k)) { seen.set(k, kinds.length); kinds.push(kind); }
        cells[productIndex(t)] = seen.get(k).toString(36);
      });
      if (kinds.length > 36) throw new Error(`${family} has ${kinds.length} distinct wirings and root sizes: a place plan holds at most 36`);
      plan.settle = { kinds, at: cells.join('') };
    }
    const bases = ledger.bases && ledger.bases[family] ? { [family]: ledger.bases[family] } : {};
    // the held variants the picked entries swap to, beside the icons (#593)
    const heldVariants = nested.length ? heldIds([...new Set(Object.values(P).flatMap(w => Object.values(w.swap).filter(k => /^family:/.test(k))))], held, ledger) : {};
    return { plan, state: { schemaVersion: 1, fileKey, variables, textStyles, icons: { ...icons, ...heldVariants }, bases, sets: {}, templates: ledger.templates || null } };
  }

  // The family's ledger record, with the variant ids of the picked entries only: a call carries no other ids.
  function addRecord(picked, state) {
    if (!rec) return;
    // Ids are recorded by expansion index, and another Contract may expand differently (an omit edit shifts the
    // indexes), so they are carried only for the Contract the set was built from; otherwise the core finds each
    // variant by name in the set (or loose on the page).
    const carried = {};
    for (const i of picked) if (ids[i]) carried[i] = ids[i];
    // A tuple the selection takes back reuses its orphan's id (#67). The other orphans stay in the ledger:
    // a build package carries none of them.
    const { orphans = {}, ...kept } = rec;
    for (const i of picked) { const o = orphans[variantName(contract, tuples[i])]; if (o && !carried[i]) carried[i] = o.id; }
    state.sets[family] = { ...kept, variants: carried };
    // the prune modes read the orphans, by name, and work only on a set every batch was rebuilt from this Contract;
    // coverage reads their ids, to tell an orphan from a node under its name
    if (mode.startsWith('prune') || mode === 'coverage') state.sets[family].orphans = Object.fromEntries(Object.entries(orphans).map(([n, o]) => [n, o.id]));
  }
  const callChars = (picked, mode, options) => {
    const { plan, state } = assemble(picked, mode, options);
    addRecord(picked, state);
    return { plan, size: JSON.stringify(plan).length + JSON.stringify(state).length };
  };

  // A sample or theme read's calls (#456): the indexes in the order given, each call taking the next while its plan and
  // state fit SETS_BUDGET and its read stays under READ_OUTPUT. Counted at the largest batch and of, so calls never move.
  function readCalls(indexes, mode) {
    const bound = { batch: indexes.length, of: indexes.length };
    const calls = [];
    for (const i of indexes) {
      const last = calls[calls.length - 1];
      const fits = w => { const { plan, size } = callChars(w, mode, bound); return size <= SETS_BUDGET && readEstimate(plan) <= READ_OUTPUT; };
      if (last && fits([...last, i])) { last.push(i); continue; }
      if (!fits([i])) {
        const { plan, size } = callChars([i], mode, bound);
        throw new Error(`the ${mode} read of index ${i} alone takes ${size} chars (SETS_BUDGET ${SETS_BUDGET} next to the core) and reads about ${readEstimate(plan)} bytes (READ_OUTPUT ${READ_OUTPUT}): no --sample split fits it, so leave it out of --sample`);
      }
      calls.push([i]);
    }
    return calls;
  }

  // Per call: the largest n up to `start` whose every window fits SETS_BUDGET, counting the family's ledger record and
  // the header template at their largest (ids of 11 chars, 20 per variant id), so batch boundaries never move as the
  // ledger fills.
  const ID = '00000:00000';
  const recordBound = JSON.stringify({ [family]: { page: ID, section: ID, set: { id: ID, key: 'k'.repeat(40), name: contract.figma.componentSetName },
    props: Object.fromEntries(props.map(p => [p.key, `${p.name}#${ID}`])), variants: {}, total, snapshotId: contract.source.snapshotId, contentHash: hash,
    documentHash: f.documentHash, builtAt: at, placed: false } }).length + JSON.stringify({ header: { page: ID, id: ID, key: 'k'.repeat(40) } }).length;
  const windows = n => Array.from({ length: Math.ceil(total / n) }, (_, b) => tuples.map((_, i) => i).slice(b * n, (b + 1) * n));
  const fits = (n, m = 'build') => windows(n).every(w => {
    const { plan, state } = assemble(w, m, { phase: 'loose', batch: 0, of: 0, perCall: n });
    return JSON.stringify(plan).length + JSON.stringify(state).length - JSON.stringify(state.templates).length + recordBound + 20 * w.length <= SETS_BUDGET;
  });
  const sized = {};
  const perCallFor = phase => {
    if (sized[phase]) return sized[phase];
    let n = phase === 'append' ? appendPerCall(total) : phase === 'reconcile' ? RECONCILE_PER_CALL : PER_CALL;
    while (n > 1 && !fits(n, phase === 'reconcile' ? 'reconcile' : 'build')) n = phase === 'reconcile' ? Math.floor(n * 0.9) : n - 1;
    return (sized[phase] = n);
  };
  // an explicit per call is never shrunk: it is refused when a window would not fit
  const checkFits = (n, m) => {
    if (!fits(n, m)) throw new Error(`--per-call ${n} does not fit every ${m} window in SETS_BUDGET (${SETS_BUDGET} chars next to the core): at most ${perCallFor(m === 'reconcile' ? 'reconcile' : 'loose')}`);
  };
  const firstGap = n => windows(n).findIndex(w => w.some(i => !ids[i]));

  if (next) {
    if (mode !== 'build') throw new Error('--next derives the next step itself: give it no --mode');
    if (!combined) {
      const b = firstGap(perCall || perCallFor('loose'));
      if (b === -1) mode = 'combine'; else batch = b;
    } else if (unplaced) mode = 'place';
    else {
      const b = firstGap(perCall || perCallFor('append'));
      if (b === -1) return null;
      batch = b;
    }
  }
  if (mode === 'combine') {
    if (combined) throw new Error(`the ${family} set is combined already: place it (--mode place) or build batches`);
    const gap = tuples.filter((_, i) => !ids[i]).length;
    if (gap) throw new Error(`combine: ${gap} of ${total} loose variants are not recorded in the ledger: build their batches first (--next)`);
  }
  if (mode === 'place' && !combined) throw new Error(`the ${family} set is not combined yet: build its loose batches and the combine first (--next)`);
  if (indexes != null && (!combined || unplaced)) throw new Error(`indexes append into a placed set, and the ${family} set is not ${combined ? 'placed' : 'combined'} yet: build it first (--next)`);

  let picked;
  let options = {};
  if (mode === 'build') {
    if (unplaced) throw new Error(`the ${family} set is combined but not placed: run --mode place (or --next) until it reports placed, then build batches`);
    const phase = combined ? 'append' : 'loose';
    if (perCall) checkFits(perCall, 'build');
    const n = perCall || perCallFor(phase);
    if (indexes != null) {
      picked = [...new Set(indexes)].sort((a, b) => a - b);
      if (picked.some(i => !Number.isInteger(i) || i < 0 || i >= total)) throw new Error(`indexes must be expansion indexes 0..${total - 1}`);
      if (picked.length > n) throw new Error(`${picked.length} indexes are above the ${n} an append call of ${family} takes: give them in calls of ${n}`);
    }
    const of = indexes != null ? 1 : Math.ceil(total / n);
    if (batch == null) batch = 0;
    if (!Number.isInteger(batch) || batch < 0 || batch >= of) throw new Error(`batch must be 0..${of - 1} (${total} variants, ${n} per call)`);
    if (indexes == null) picked = windows(n)[batch];
    // above appendPerCall, only an update-free re-run: every variant in the window is in the set already
    const cap = appendPerCall(total);
    if (phase === 'append' && n > cap) {
      const miss = picked.filter(i => !ids[i]).length;
      if (miss) throw new Error(`--per-call ${n} is above ${cap} for a set of ${total}, which only an update-free re-run may take: ${miss} of its ${picked.length} variants ${miss === 1 ? 'has' : 'have'} no recorded id`);
    }
    options = { phase, batch, of, perCall: n, ...(indexes != null ? { picked: picked.length } : {}) };
  } else if (mode === 'reconcile') {
    // the whole family in one call when it fits, else by --batch
    picked = tuples.map((_, i) => i);
    const n = perCall || perCallFor('reconcile');
    if (perCall) checkFits(perCall, 'reconcile');
    const of = Math.ceil(total / n);
    if (batch == null && of > 1) throw new Error(`a reconcile of ${total} variants takes ${of} calls: give --batch 0..${of - 1}`);
    if (batch != null) {
      if (!Number.isInteger(batch) || batch < 0 || batch >= of) throw new Error(`batch must be 0..${of - 1} (${total} variants, ${n} per reconcile call)`);
      picked = windows(n)[batch];
      options = { batch, of, perCall: n };
    }
  } else if (['combine', 'place', 'coverage'].includes(mode) || mode.startsWith('prune')) {
    picked = [];
    if (mode === 'place') options = { budget };
    if (mode === 'coverage' && batch != null) {
      const of = Math.ceil(total / coveragePerCall);
      if (!Number.isInteger(batch) || batch < 0 || batch >= of) throw new Error(`batch must be 0..${of - 1} (${total} variants, ${coveragePerCall} per coverage read)`);
      options = { batch, of, rows: [batch * coveragePerCall, batch === of - 1 ? null : (batch + 1) * coveragePerCall] };
    }
  } else {
    if (!sample.length || sample.some(i => !Number.isInteger(i) || i < 0 || i >= total)) throw new Error(`sample must list expansion indexes 0..${total - 1}`);
    // in one call when it fits, else by --batch, as a reconcile
    const unique = [...new Set(sample)];
    const calls = readCalls(unique, mode);
    const of = calls.length;
    if (batch == null && of > 1) throw new Error(`a ${mode} read of these ${unique.length} indexes takes ${of} calls: give --batch 0..${of - 1} with the same --sample`);
    if (batch != null && (!Number.isInteger(batch) || batch < 0 || batch >= of)) throw new Error(`batch must be 0..${of - 1} (${of} ${mode} calls for --sample)`);
    picked = calls[batch || 0];
    if (batch != null) options = { batch, of };
  }
  const { plan, state } = assemble(picked, mode, options);
  const { entries } = plan.selection;
  // The entries decode back to the expansion, and each resolves to what the Contract resolves.
  const decoded = decodeEntries(plan, contract);
  decoded.forEach(({ index, tuple }) => {
    if (axes.some(k => tuple[k] !== tuples[index][k])) throw new Error(`entry ${index} decodes to ${variantName(contract, tuple)}, not ${variantName(contract, tuples[index])}`);
  });
  if (mode !== 'reconcile')
    entries.forEach((e, n) => {
      // with the fields the builder draws (#442); `visible` is property wiring, not a layout fragment (#93)
      const r = expectedVariant(contract, decoded[n].tuple, defaultProps(contract), doc, held);
      const spec = entrySpec(plan, e);
      for (const sec of ['layout', 'paint'])
        if (JSON.stringify(spec[sec]) !== JSON.stringify(Object.fromEntries(Object.entries(r[sec]).map(([node, fl]) => [node, stripFields(fl)]))))
          throw new Error(`entry ${e[0]} does not resolve to the Contract's ${sec}`);
    });
  addRecord(picked, state);
  if (mode.startsWith('prune') && (!rec || rec.contentHash !== plan.contentHash || !(rec.variants || [null]).every(Boolean)))
    throw new Error(`the ${family} set is not built from this Contract yet: rebuild every batch first, then preview or prune its orphans`);
  const size = JSON.stringify(plan).length + JSON.stringify(state).length;
  if (size > SETS_BUDGET)
    throw new Error(`the ${mode} plan and state take ${size} chars, above SETS_BUDGET (${SETS_BUDGET}) next to the core: ${mode === 'reconcile' ? 'reconcile by --batch' : ['sample', 'theme'].includes(mode) ? 'give fewer --sample indexes' : 'lower --per-call'}`);
  return { plan, state };
}

/**
 * The ledger with a built family's set (and its Base Component's record) moved from `from`'s contentHash to
 * `contract`'s, when both derive the same sets plans: every build window and the place plan, `contentHash` aside
 * (#389). An edit the builder never reads, such as a drafted value's evidence, still moves the hash; this spares the
 * update-free re-run of every batch it would otherwise take. Refuses a set not recorded as built and placed from
 * `from` with every variant id, and a pair whose plans differ.
 */
export function rehashSets(from, contract, docText, ledger, { fileKey }) {
  const family = contract.family.key;
  if (from.family.key !== family) throw new Error(`--from is ${from.family.key}, the Contract ${family}`);
  const rec = ledger && ledger.sets && ledger.sets[family];
  const old = contentHash(from);
  const hash = contentHash(contract);
  if (!rec || rec.contentHash !== old) throw new Error(`the ${family} set is not recorded as built from --from (ledger ${rec ? rec.contentHash : 'has no record'}, --from ${old})`);
  if (!rec.set || rec.placed === false || !(rec.variants || [null]).every(Boolean)) throw new Error(`the ${family} set is not placed with every variant id recorded: finish its build first (sets --next)`);
  const plans = c => {
    const derive = (mode, batch) => {
      const { plan } = setsPlan(c, docText, ledger, { fileKey, mode, ...(batch != null ? { batch } : {}), at: rec.builtAt });
      delete plan.contentHash;
      return plan;
    };
    const first = derive('build', 0);
    return [first, ...Array.from({ length: first.options.of - 1 }, (_, b) => derive('build', b + 1)), derive('place')].map(p => JSON.stringify(p));
  };
  const [a, b] = [plans(from), plans(contract)];
  const differs = b.findIndex((p, i) => p !== a[i]);
  let what = null;
  if (a.length !== b.length) what = 'batch count';
  else if (differs === b.length - 1) what = 'place plan';
  else if (differs !== -1) what = `build batch ${differs}`;
  if (what) throw new Error(`${family}: the ${what} differs between the two Contracts, so the set needs its batches rebuilt (sets --next)`);
  const out = { ...ledger, sets: { ...ledger.sets, [family]: { ...rec, contentHash: hash } } };
  const base = ledger.bases && ledger.bases[family];
  if (base && base.contentHash === old) out.bases = { ...ledger.bases, [family]: { ...base, contentHash: hash } };
  return out;
}

const USAGE = [
  'usage: build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir> [--mode build|diff] [--adopt] [--prune a,b] [--page <name>] [--chunk N] [--ledger <path>]',
  '       build-plan.mjs icons --contract <component.json> [--contract ...] --icons-dir <package dir> --file-key <key> --out <dir> [--adopt] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs base --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir> [--adopt | --adopt-variant] [--read-only] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs sets --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir>',
  '                      [--next | --mode build|combine|place|reconcile|coverage|sample|theme|prune-preview|prune] [--batch N] [--per-call N] [--budget ms (mode place)]',
  '                      [--sample i,j (modes sample and theme; --batch N when it takes several calls)] [--prune-list <prune.json> (mode prune)] [--adopt] [--prototype (a Contract under .scratch only)] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs rehash --from <component.json the set was built from> --contract <component.json> --doc <foundations.json> --file-key <key> [--ledger <path>]',
].join('\n');

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      doc: { type: 'string' }, 'file-key': { type: 'string' }, out: { type: 'string' }, ledger: { type: 'string' },
      adopt: { type: 'boolean', default: false }, 'adopt-variant': { type: 'boolean', default: false }, prune: { type: 'string', default: '' }, page: { type: 'string' },
      contract: { type: 'string', multiple: true }, 'icons-dir': { type: 'string' }, 'read-only': { type: 'boolean', default: false },
      mode: { type: 'string', default: 'build' }, batch: { type: 'string' }, 'per-call': { type: 'string' }, sample: { type: 'string', default: '' },
      next: { type: 'boolean', default: false }, budget: { type: 'string' },
      prototype: { type: 'boolean', default: false }, 'prune-list': { type: 'string' }, chunk: { type: 'string', default: '1' },
      from: { type: 'string' },
    },
  });
  const slice = positionals[0];
  if (slice === 'foundations' && !['build', 'diff'].includes(values.mode)) { console.error(`foundations --mode takes build or diff, not ${values.mode}`); process.exit(2); }
  if (slice === 'rehash') {
    if (!values.from || !values.contract || values.contract.length !== 1 || !values.doc || !values['file-key']) { console.error(USAGE); process.exit(2); }
    const path = values.ledger || defaultLedgerPath(values['file-key']);
    const read = p => JSON.parse(readFileSync(p, 'utf8'));
    const contract = read(values.contract[0]);
    const ledger = rehashSets(read(values.from), contract, readFileSync(values.doc, 'utf8'), readLedger(path), { fileKey: values['file-key'] });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'rehashed', family: contract.family.key, contentHash: ledger.sets[contract.family.key].contentHash, ledger: path }));
    return;
  }
  const ok = values['file-key'] && values.out
    && ((slice === 'foundations' && values.doc) || (slice === 'icons' && values.contract && values['icons-dir'])
      || ((slice === 'base' || slice === 'sets') && values.doc && values.contract && values.contract.length === 1));
  if (!ok) {
    console.error(USAGE);
    process.exit(2);
  }
  const fileKey = values['file-key'];
  const path = values.ledger || defaultLedgerPath(fileKey);
  // A prototype approval never reaches a committed Contract: --prototype takes a Contract under .scratch only.
  if (values.prototype && (slice !== 'sets' || !resolvePath(values.contract[0]).split(sep).includes('.scratch'))) {
    console.error('--prototype takes a Contract under .scratch only (a prototype approval is never committed)');
    process.exit(2);
  }
  // the owner-confirmed prune list (ledger.mjs prune-list), for this file and family only
  const pruneFile = values['prune-list'] ? JSON.parse(readFileSync(values['prune-list'], 'utf8')) : null;
  if (pruneFile && (slice !== 'sets' || pruneFile.fileKey !== fileKey || pruneFile.family !== JSON.parse(readFileSync(values.contract[0], 'utf8')).family.key)) {
    console.error(`--prune-list is for ${pruneFile.family} in ${pruneFile.fileKey}: a sets prune of that family and file only`);
    process.exit(2);
  }
  // the Contracts a holding family's nested instances hold, from beside its own (#593)
  const heldOf = () => {
    const contract = JSON.parse(readFileSync(values.contract[0], 'utf8'));
    return familyNodes(contract).length ? loadHeld(values.contract[0], contract, JSON.parse(readFileSync(values.doc, 'utf8')).designSystem.key) : null;
  };
  const derived = slice === 'sets'
    ? setsPlan(JSON.parse(readFileSync(values.contract[0], 'utf8')), readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, mode: values.mode, held: heldOf(), next: values.next, adopt: values.adopt, prototype: values.prototype, prune: pruneFile && pruneFile.prune,
      sample: values.sample ? values.sample.split(',').map(Number) : [], ...(values.batch != null ? { batch: Number(values.batch) } : {}),
      ...(values['per-call'] ? { perCall: Number(values['per-call']) } : {}), ...(values.budget != null ? { budget: Number(values.budget) } : {}),
      ...(values.page ? { page: values.page } : {}),
    })
    : slice === 'base'
    ? basePlan(JSON.parse(readFileSync(values.contract[0], 'utf8')), readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, adopt: values.adopt, adoptVariant: values['adopt-variant'], readOnly: values['read-only'], ...(values.page ? { page: values.page } : {}),
    })
    : slice === 'foundations'
    ? foundationsPlan(readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, adopt: values.adopt, readOnly: values.mode === 'diff', prune: values.prune ? values.prune.split(',').map(s => s.trim()).filter(Boolean) : [], page: values.page ?? null, chunk: Number(values.chunk),
    })
    : iconsPlan(values.contract.map(p => JSON.parse(readFileSync(p, 'utf8'))), values['icons-dir'], readLedger(path), {
      fileKey, adopt: values.adopt, ...(values.page ? { page: values.page } : {}),
    });
  // --next on a family whose set is built and every id recorded: nothing to derive
  if (!derived) { console.log(JSON.stringify({ status: 'built', slice, fileKey, ledger: path })); return; }
  const { plan, state } = derived;
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(join(values.out, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  const detail = slice === 'foundations' ? { documentHash: plan.documentHash, chunk: { index: plan.chunk ? plan.chunk.index : 1, of: plan.chunk ? plan.chunk.of : 1 } }
    : slice === 'base' ? { base: plan.base.name, contentHash: plan.contentHash }
    : slice === 'sets' ? { family: plan.family, entries: plan.selection.entries.length, total: plan.total, contentHash: plan.contentHash }
    : { icons: plan.icons.length };
  console.log(JSON.stringify({ status: 'derived', slice, fileKey, ledger: path, ...detail, options: plan.options, out: values.out }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`build-plan: ${e.message}`); process.exit(1); }
}
