#!/usr/bin/env node
// Build-plan deriver (To-design). Derives one slice's build plan from its inputs (the foundations document,
// or the Contracts plus the unpacked icon package), the Design Library file's ledger and the run options,
// and writes plan.json and state.json for the packager. The plan is disposable: re-derive it for every call.
//
//   node skills/to-design/scripts/build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir>
//        [--adopt] [--prune name,name] [--page "Page 1"] [--chunk N] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs icons --contract <component.json> [--contract ...]
//        --icons-dir <unpacked icon package> --file-key <key> --out <dir> [--adopt] [--page Icons] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs base --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir>
//        [--adopt] [--read-only] [--page <name>] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs sets --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir>
//        [--mode build|reconcile|coverage|sample|theme|prune-preview|prune] [--batch N] [--per-call N] [--sample i,j] [--prune-list <prune.json>]
//        [--adopt] [--prototype] [--page <name>] [--ledger <path>]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { baseTuple, contentHash, expand, icons as iconKeys, iconName, PROTOTYPE_APPROVER, resolve, validate, variantName } from '../../contract/scripts/contract.mjs';
import { anatomyTree, baseProps, defaultProps, expectedBase, expectedVariant, iconRef as iconRefKey, norm } from './readback.mjs';
import { defaultLedgerPath, emptyLedger, readLedger } from './ledger.mjs';
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

/**
 * The foundations slice's plan and state.
 * `docText` is the document file's text (its bytes are the documentHash); `ledger` is the file's ledger or null.
 * Options: fileKey (required), adopt, prune (orphan names the owner confirmed for deletion), page, at, strip,
 * chunk (1-based, when the selection needs several calls: `plan.chunk` says how many) and budget (chars per call).
 */
export function foundationsPlan(docText, ledger, { fileKey, adopt = false, prune = [], page = null, at = new Date().toISOString(), strip = true, chunk = 1, budget = CALL_BUDGET } = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (ledger && ledger.fileKey !== fileKey) throw new Error(`ledger is for ${ledger.fileKey}, not ${fileKey}`);
  const doc = JSON.parse(docText);
  if (doc.schemaVersion !== 1) throw new Error('foundations document schemaVersion must be 1');
  // the selected subset of the whole theme (#107), split by group when it needs several calls;
  // documentHash stays the whole document's, as later slices check it
  const names = selection(doc, selectedGroups(ledger));
  const stripped = stripReviewFields(doc);
  const parts = chunks(doc, names, (kind, n) => JSON.stringify(stripped[kind][n]).length + 2 * n.length + 36, budget);
  if (!(chunk >= 1 && chunk <= parts.length)) throw new Error(`there is no chunk ${chunk} of ${parts.length}`);
  if (chunk > 1 && prune.length) throw new Error('prune runs with chunk 1, which carries the whole selection\'s orphans');
  assertRecorded(ledger, parts, chunk, documentHash(docText));
  const sub = subsetDocument(doc, parts.length > 1 ? parts[chunk - 1].names : names);
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
    foundations: strip ? stripReviewFields(sub) : sub,
    ...(parts.length > 1 ? { chunk: { index: chunk, of: parts.length, groups: parts[chunk - 1].groups } } : {}),
  };
  const state = !ledger ? emptyLedger(fileKey) : parts.length > 1 ? chunkState(ledger, parts[chunk - 1], chunk === 1 ? names : null) : ledger;
  const chars = JSON.stringify(plan).length + JSON.stringify(state).length;
  if (strip && chars > budget) throw new Error(`the foundations plan and state are ${chars} chars, over the ${budget} a call takes`);
  return { plan, state };
}

// Shapes that paint nothing: Carbon's two-tone inner path (fill="none", data-icon-path) and its
// transparent rectangle (style="fill:none"). Code never paints them, and a flatten would fill them in.
const UNPAINTED = /<(path|rect|circle|ellipse|polygon)\b[^>]*(\bfill="none"|fill:\s*none)[^>]*\/>/g;

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
      if (!/^[a-z0-9]+(-{1,2}[a-z0-9]+)*$/.test(key)) throw new Error(`icon key "${key}" is not an icon file name`);
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
 * Options: fileKey (required), adopt, readOnly, page (default the Contract's figma.page), at.
 */
export function basePlan(contract, docText, ledger, { fileKey, adopt = false, readOnly = false, page = null, at = new Date().toISOString() } = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (!ledger || ledger.fileKey !== fileKey) throw new Error(`no ledger for ${fileKey}: build foundations and icons first`);
  const doc = JSON.parse(docText);
  const v = validate(contract, doc);
  if (!v.ok) throw new Error(`the Contract does not validate: ${v.errors.map(e => `${e.at}: ${e.message}`).join("; ")}`);
  const f = ledger.foundations;
  if (!f) throw new Error('the ledger has no foundations: build them first');
  if (f.documentHash !== documentHash(docText)) throw new Error(`the foundations document changed since the last foundations build (${f.documentHash}); rebuild foundations first`);
  // the review specimen while the base stands alone; the property defaults once the family's set holds it
  const exp = expectedBase(contract, baseProps(contract, !!(ledger.sets && ledger.sets[contract.family.key])));
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
    options: { adopt: !!adopt, readOnly: !!readOnly },
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
 * Variants per build call. Measured live (#32): see SKILL.md "Component Sets" for the slope and why this
 * ceiling keeps each call well under the connection limit and the package under use_figma's 50,000 chars.
 */
export const PER_CALL = 49;
// The Component Header template every family page's Header is an instance of (one per file):
// TEXT properties with their font style and size.
export const TEMPLATES = {
  page: 'Templates',
  header: { name: 'Component Header', fields: [['Type', 'Regular', 14], ['Title', 'SemiBold', 42], ['Namespace', 'Regular', 14]] },
};
const SET_MODES = ['build', 'reconcile', 'coverage', 'sample', 'theme', 'prune-preview', 'prune'];

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
// property wiring ({visible, text, swap, refs} at the property defaults). Returns per tuple its references.
function fragmentsOf(contract, tuples) {
  const frags = new Map();
  const wirings = new Map();
  const props = defaultProps(contract);
  const refs = tuples.map(t => {
    const exp = expectedVariant(contract, t, props);
    const ids = [];
    for (const sec of ['layout', 'paint'])
      for (const [node, fields] of Object.entries(exp[sec])) {
        const key = JSON.stringify([sec, node, stripFields(fields)]);
        if (!frags.has(key)) frags.set(key, frags.size);
        ids.push(frags.get(key));
      }
    const w = JSON.stringify({ visible: exp.visible, text: exp.text, swap: exp.swap, refs: exp.refs });
    if (!wirings.has(w)) wirings.set(w, wirings.size);
    return { p: wirings.get(w), frags: ids };
  });
  return { frags: [...frags.keys()].map(k => JSON.parse(k)), wirings: [...wirings.keys()].map(k => JSON.parse(k)), refs };
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
 * Modes: `build` (batch `batch` of `perCall` variants, in expansion order), `reconcile` (read only: the
 * ledger section rebuilt from what the file holds, after a lost connection), `coverage` (read only: every
 * variant's name, grid cell and property wiring), `sample` and `theme` (read only: full values, or the
 * resolved colours per mode, of the variants at the expansion indexes `sample`), `prune-preview` (read only:
 * every ledger orphan with its instance count in the file) and `prune` (deletes the orphans on `prune`, the
 * owner-confirmed list {variant name: instance count from the preview}; #67).
 * Entries are axis-ordered tuples [index, value positions..., wiring, fragments...]. The plan asserts they
 * decode back to the expansion and resolve to what the Contract resolves; the core never matches rules.
 * Options: fileKey (required), mode, batch, perCall, sample, prune, adopt, prototype, page, at.
 */
export function setsPlan(contract, docText, ledger, {
  fileKey, mode = 'build', batch = 0, perCall = PER_CALL, sample = [], prune = null, adopt = false, prototype = false, page = null, at = new Date().toISOString(),
} = {}) {
  if (!fileKey) throw new Error('fileKey is required');
  if (!SET_MODES.includes(mode)) throw new Error(`mode must be one of ${SET_MODES.join(', ')}`);
  if ((mode === 'prune') !== !!prune) throw new Error('prune takes a prune list (--prune-list), and only the prune mode does');
  if (!ledger || ledger.fileKey !== fileKey) throw new Error(`no ledger for ${fileKey}: build foundations and icons first`);
  const doc = JSON.parse(docText);
  checkApproved(contract, doc, prototype);
  const f = ledger.foundations;
  if (!f) throw new Error('the ledger has no foundations: build them first');
  if (f.documentHash !== documentHash(docText)) throw new Error(`the foundations document changed since the last foundations build (${f.documentHash}); rebuild foundations first`);
  const family = contract.family.key;
  const tuples = expand(contract);
  const axes = contract.axes.map(a => a.key);
  const base = baseTuple(contract);
  const { frags, wirings, refs } = fragmentsOf(contract, tuples);

  const of = Math.ceil(tuples.length / perCall);
  let picked;
  if (mode === 'build') {
    if (!Number.isInteger(batch) || batch < 0 || batch >= of) throw new Error(`batch must be 0..${of - 1} (${tuples.length} variants, ${perCall} per call)`);
    picked = tuples.map((_, i) => i).slice(batch * perCall, (batch + 1) * perCall);
  } else if (mode === 'reconcile') picked = tuples.map((_, i) => i);
  else if (mode === 'coverage' || mode.startsWith('prune')) picked = [];
  else {
    if (!sample.length || sample.some(i => !Number.isInteger(i) || i < 0 || i >= tuples.length)) throw new Error(`sample must list expansion indexes 0..${tuples.length - 1}`);
    picked = [...new Set(sample)];
  }
  const full = mode !== 'reconcile';
  const pos = (t, k) => contract.axes.find(a => a.key === k).values.findIndex(v => v.key === t[k]);
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
  const fontFamily = ((contract.dependencies.fonts || [])[0] || {}).family || 'Inter';
  const fonts = new Set((contract.dependencies.fonts || []).flatMap(ft => ft.styles.map(s => JSON.stringify({ family: ft.family, style: s }))));
  for (const t of Object.keys(textStyles)) fonts.add(JSON.stringify({ family: doc.textStyles[t].fontFamily, style: doc.textStyles[t].fontStyle }));
  for (const [, style] of TEMPLATES.header.fields) fonts.add(JSON.stringify({ family: fontFamily, style }));

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
  const ax = k => contract.axes.findIndex(a => a.key === k);
  // The whole selection, for a build or reconcile call to tell the variants it dropped (#67): bit i (hex, 4 per digit) is
  // tuple i of the axis-value product, in Contract order.
  const bits = new Array(Math.ceil(contract.axes.reduce((m, a) => m * a.values.length, 1) / 4)).fill(0);
  for (const t of tuples) { const i = contract.axes.reduce((m, a) => m * a.values.length + a.values.findIndex(v => v.key === t[a.key]), 0); bits[i >> 2] |= 1 << (i & 3); }
  const plan = {
    schemaVersion: 1,
    slice: 'sets',
    fileKey,
    page: page || contract.figma.page,
    at,
    options: { mode, adopt: !!adopt, ...(mode === 'build' ? { batch, of, perCall } : {}), ...(prune ? { prune } : {}) },
    family,
    designSystem: doc.designSystem.key,
    snapshotId: contract.source.snapshotId,
    contentHash: contentHash(contract),
    documentHash: f.documentHash,
    total: tuples.length,
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
    tree: anatomyTree(contract.anatomy),
    fonts: [...fonts].sort().map(x => JSON.parse(x)),
    props,
    P,
    frags: usedFrags,
    selection: { schemaVersion: 1, axes, entries, ...(mode === 'build' || mode === 'reconcile' ? { member: bits.map(b => b.toString(16)).join('') } : {}) },
  };
  // The entries decode back to the expansion, and each resolves to what the Contract resolves.
  const decoded = decodeEntries(plan, contract);
  decoded.forEach(({ index, tuple }) => {
    if (axes.some(k => tuple[k] !== tuples[index][k])) throw new Error(`entry ${index} decodes to ${variantName(contract, tuple)}, not ${variantName(contract, tuples[index])}`);
  });
  if (full)
    entries.forEach((e, n) => {
      const r = resolve(contract, decoded[n].tuple);
      const spec = entrySpec(plan, e);
      for (const sec of ['layout', 'paint'])
        if (JSON.stringify(spec[sec]) !== JSON.stringify(Object.fromEntries(Object.entries(r[sec]).map(([node, fl]) => [node, stripFields(fl)]))))
          throw new Error(`entry ${e[0]} does not resolve to the Contract's ${sec}`);
    });
  const bases = ledger.bases && ledger.bases[family] ? { [family]: ledger.bases[family] } : {};
  // The family's ledger record, with the variant ids of this call's entries only: a call carries no other ids.
  const rec = ledger.sets && ledger.sets[family];
  const sets = {};
  if (rec) {
    // Ids are recorded by expansion index, and another Contract may expand differently (an omit edit shifts the
    // indexes), so they are carried only for the Contract the set was built from; otherwise the core finds each
    // variant by name in the set.
    const ids = {};
    if (rec.contentHash === plan.contentHash) for (const i of picked) if (rec.variants && rec.variants[i]) ids[i] = rec.variants[i];
    // A tuple the selection takes back reuses its orphan's id (#67). The other orphans stay in the ledger:
    // a build package carries none of them.
    const { orphans = {}, ...kept } = rec;
    for (const i of picked) { const o = orphans[variantName(contract, tuples[i])]; if (o && !ids[i]) ids[i] = o.id; }
    sets[family] = { ...kept, variants: ids };
    // the prune modes read the orphans, by name, and work only on a set every batch was rebuilt from this Contract;
    // coverage reads their ids, to tell an orphan from a node under its name
    if (mode.startsWith('prune') || mode === 'coverage') sets[family].orphans = Object.fromEntries(Object.entries(orphans).map(([n, o]) => [n, o.id]));
  }
  if (mode.startsWith('prune') && (!rec || rec.contentHash !== plan.contentHash || !(rec.variants || [null]).every(Boolean)))
    throw new Error(`the ${family} set is not built from this Contract yet: rebuild every batch first, then preview or prune its orphans`);
  return { plan, state: { schemaVersion: 1, fileKey, variables, textStyles, icons, bases, sets, templates: ledger.templates || null } };
}

const USAGE = [
  'usage: build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir> [--adopt] [--prune a,b] [--page <name>] [--chunk N] [--ledger <path>]',
  '       build-plan.mjs icons --contract <component.json> [--contract ...] --icons-dir <package dir> --file-key <key> --out <dir> [--adopt] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs base --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir> [--adopt] [--read-only] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs sets --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir> [--mode build|reconcile|coverage|sample|theme|prune-preview|prune]',
  '                      [--batch N] [--per-call N] [--sample i,j] [--prune-list <prune.json> (mode prune)] [--adopt] [--prototype (a Contract under .scratch only)] [--page <name>] [--ledger <path>]',
].join('\n');

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      doc: { type: 'string' }, 'file-key': { type: 'string' }, out: { type: 'string' }, ledger: { type: 'string' },
      adopt: { type: 'boolean', default: false }, prune: { type: 'string', default: '' }, page: { type: 'string' },
      contract: { type: 'string', multiple: true }, 'icons-dir': { type: 'string' }, 'read-only': { type: 'boolean', default: false },
      mode: { type: 'string', default: 'build' }, batch: { type: 'string', default: '0' }, 'per-call': { type: 'string' }, sample: { type: 'string', default: '' },
      prototype: { type: 'boolean', default: false }, 'prune-list': { type: 'string' }, chunk: { type: 'string', default: '1' },
    },
  });
  const slice = positionals[0];
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
  const { plan, state } = slice === 'sets'
    ? setsPlan(JSON.parse(readFileSync(values.contract[0], 'utf8')), readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, mode: values.mode, batch: Number(values.batch), adopt: values.adopt, prototype: values.prototype, prune: pruneFile && pruneFile.prune,
      sample: values.sample ? values.sample.split(',').map(Number) : [],
      ...(values['per-call'] ? { perCall: Number(values['per-call']) } : {}), ...(values.page ? { page: values.page } : {}),
    })
    : slice === 'base'
    ? basePlan(JSON.parse(readFileSync(values.contract[0], 'utf8')), readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, adopt: values.adopt, readOnly: values['read-only'], ...(values.page ? { page: values.page } : {}),
    })
    : slice === 'foundations'
    ? foundationsPlan(readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, adopt: values.adopt, prune: values.prune ? values.prune.split(',').map(s => s.trim()).filter(Boolean) : [], page: values.page ?? null, chunk: Number(values.chunk),
    })
    : iconsPlan(values.contract.map(p => JSON.parse(readFileSync(p, 'utf8'))), values['icons-dir'], readLedger(path), {
      fileKey, adopt: values.adopt, ...(values.page ? { page: values.page } : {}),
    });
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
