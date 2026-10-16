#!/usr/bin/env node
// Build-plan deriver (To-design). Derives one slice's build plan from its inputs (the foundations document,
// or the Contracts plus the unpacked icon package), the Design Library file's ledger and the run options,
// and writes plan.json and state.json for the packager. The plan is disposable: re-derive it for every call.
//
//   node skills/to-design/scripts/build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir>
//        [--adopt] [--prune name,name] [--page "Page 1"] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs icons --contract <component.json> [--contract ...]
//        --icons-dir <unpacked icon package> --file-key <key> --out <dir> [--adopt] [--page Icons] [--ledger <path>]
//   node skills/to-design/scripts/build-plan.mjs base --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir>
//        [--adopt] [--read-only] [--page <name>] [--ledger <path>]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { contentHash, icons as iconKeys, iconName, validate } from '../../contract/scripts/contract.mjs';
import { expectedBase, norm } from './base-loop.mjs';
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
  const exp = expectedBase(contract);
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

const USAGE = [
  'usage: build-plan.mjs foundations --doc <foundations.json> --file-key <key> --out <dir> [--adopt] [--prune a,b] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs icons --contract <component.json> [--contract ...] --icons-dir <package dir> --file-key <key> --out <dir> [--adopt] [--page <name>] [--ledger <path>]',
  '       build-plan.mjs base --contract <component.json> --doc <foundations.json> --file-key <key> --out <dir> [--adopt] [--read-only] [--page <name>] [--ledger <path>]',
].join('\n');

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      doc: { type: 'string' }, 'file-key': { type: 'string' }, out: { type: 'string' }, ledger: { type: 'string' },
      adopt: { type: 'boolean', default: false }, prune: { type: 'string', default: '' }, page: { type: 'string' },
      contract: { type: 'string', multiple: true }, 'icons-dir': { type: 'string' }, 'read-only': { type: 'boolean', default: false },
    },
  });
  const slice = positionals[0];
  const ok = values['file-key'] && values.out
    && ((slice === 'foundations' && values.doc) || (slice === 'icons' && values.contract && values['icons-dir'])
      || (slice === 'base' && values.doc && values.contract && values.contract.length === 1));
  if (!ok) {
    console.error(USAGE);
    process.exit(2);
  }
  const fileKey = values['file-key'];
  const path = values.ledger || ledgerPath(fileKey);
  const { plan, state } = slice === 'base'
    ? basePlan(JSON.parse(readFileSync(values.contract[0], 'utf8')), readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, adopt: values.adopt, readOnly: values['read-only'], ...(values.page ? { page: values.page } : {}),
    })
    : slice === 'foundations'
    ? foundationsPlan(readFileSync(values.doc, 'utf8'), readLedger(path), {
      fileKey, adopt: values.adopt, prune: values.prune ? values.prune.split(',').map(s => s.trim()).filter(Boolean) : [], page: values.page ?? null,
    })
    : iconsPlan(values.contract.map(p => JSON.parse(readFileSync(p, 'utf8'))), values['icons-dir'], readLedger(path), {
      fileKey, adopt: values.adopt, ...(values.page ? { page: values.page } : {}),
    });
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(join(values.out, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  const detail = slice === 'foundations' ? { documentHash: plan.documentHash }
    : slice === 'base' ? { base: plan.base.name, contentHash: plan.contentHash } : { icons: plan.icons.length };
  console.log(JSON.stringify({ status: 'derived', slice, fileKey, ledger: path, ...detail, options: plan.options, out: values.out }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
