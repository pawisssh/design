#!/usr/bin/env node
// Vibe-to-Figma's first step (#176): a React + shadcn + Tailwind Prototype becomes a Design System folder,
// design-systems/<name>/, holding its Foundations document and a draft Contract per Component Family its screens
// use, through the Generic Adapter. It writes no review page, approves nothing and touches no Figma file.
//
//   node skills/vibe-to-figma/scripts/folder.mjs <project> [--all] [--name <name>] [--root <dir>]
//     [--drafts <file>]... [--requests <file>]
//
// A family the Adapter cannot read (sonner's Toaster) is skipped and named in the report with the Adapter's
// reason; the run goes on. While any Drafted value is open, the CLI writes every family's requests to one file
// (default .scratch/vibe-to-figma/<name>.requests.json) and exits 2; the agent answers with a drafts file,
// {"drafts": {"<family>": {"<key>": <value>}}}, and the step runs again with --drafts. The Adapter's own drafts
// form, {"family", "drafts"}, is read too, one file per --drafts.
//
// A Contract in the folder whose family this run has no Contract for (the screens no longer use it, or the Adapter
// now skips it) is set aside in design-systems/<name>/removed/, so contracts/ holds exactly the Foundations closure's
// Contracts and the review, the approve and the build go on without it. When the family comes back, the set-aside copy
// is its prior, as a draft: it carries its Drafted values and the owner's omits back, and is deleted once the family's
// Contract is in contracts/ again.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { applyOmit, asDraft, matches, validate } from '../../contract/scripts/contract.mjs';
import { writeJson } from '../../contract/scripts/io.mjs';
import { generate as contractOf, readFamily } from '../../adapter-generic/scripts/components.mjs';
import { generate as foundationsOf } from '../../adapter-generic/scripts/foundations.mjs';
import { DEFAULT_DIR, REPO_ROOT, fetchTools, hasTools } from '../../adapter-generic/scripts/sources.mjs';
import { choosePath } from './path.mjs';
import { usedFamilies } from './used.mjs';

export const DESIGN_SYSTEMS = join(REPO_ROOT, 'design-systems');
const NAME = /^[a-z0-9][a-z0-9._-]*$/;
const CatalogSelection = createRequire(import.meta.url)('../../to-preview/assets/selection-model.js');

/** Throws the plain message unless `project` takes the shadcn path (#252). Path A is chosen but not built yet. */
export function assertShadcn(project) {
  const route = choosePath(project);
  if (route.path === 'refused') throw new Error(route.message);
  if (route.path === 'A') throw new Error('path A (a React + Tailwind project with no components.json) is chosen, but not built yet: the Extracted Library is a later ticket of #249');
}

/** The folder name: the override, else package.json `name` without its npm scope. */
export function folderName(project, name) {
  const raw = name ?? JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')).name;
  const key = String(raw ?? '').replace(/^@[^/]+\//, '');
  if (!NAME.test(key)) throw new Error(`"${raw}" is not a folder name: use lowercase letters, digits, ".", "_" or "-" (pass --name)`);
  return key;
}

/**
 * buildFolder({project, name, root, all, drafts, tools, depsDir}) -> {name, dir, foundations, contracts, used,
 * families, skipped, setAside, written, unchanged, requests}. `drafts` maps a family to its agent-drafted values ({key: value}).
 * `families` are the used ones the Adapter reads; `skipped` [{family, reason}] the ones it cannot. `foundations` is
 * {path, written}: the document is written over every readable family unless it is unchanged. `contracts` maps each
 * readable family to its Contract's path; `written` and `unchanged` list the families whose Contract was or was not
 * rewritten, and `requests` maps a family to its open Drafted values, its Contract not written. `setAside`
 * [{family, reason, path}] lists the Contracts moved out of contracts/ into removed/ (`path`): their family is no
 * longer used (`reason` "not used by the screens", or "not in the Code Library" with `all`) or is skipped
 * ("skipped: <the Adapter's reason>").
 */
export async function buildFolder({ project, name, root = DESIGN_SYSTEMS, all = false, drafts = {}, tools = DEFAULT_DIR, depsDir } = {}) {
  assertShadcn(project);
  const key = folderName(project, name);
  const dir = join(root, key);
  const designSystem = { key, name: key };
  const contracts = {};
  const { families: used } = usedFamilies(project, { all, depsDir });
  const skipped = [];
  const skip = (family, e) => skipped.push({ family, reason: e.message });

  // Probe each family against the Code Library tokens alone, so one the Adapter cannot read never sinks the
  // Foundations document every other family's Synthesized tokens go into.
  const { doc: base } = await foundationsOf({ project, families: [], tools, designSystem });
  const readable = [];
  for (const family of used) {
    try { await readFamily({ project, family, foundations: base, tools }); readable.push(family); } catch (e) { skip(family, e); }
  }

  // A Contract already in the folder is the prior: it keeps its Drafted values and, at the same snapshot, its
  // selection, which gives the Foundations closure (an approved omit stays narrowed on a rerun, #177). At a new
  // snapshot, its redraft carries the prior's owner omits (carryOmits). A family set aside in removed/ that is back
  // has that copy as its prior, as a draft (`returning`): the owner reviews it again, and it is written even unchanged.
  const priors = {}, returning = new Set();
  for (const family of readable) {
    const out = join(dir, 'contracts', `${family}.component.json`), aside = join(dir, 'removed', `${family}.component.json`);
    if (existsSync(out)) priors[family] = JSON.parse(readFileSync(out, 'utf8'));
    else if (existsSync(aside)) { priors[family] = asDraft(JSON.parse(readFileSync(aside, 'utf8'))); returning.add(family); }
  }
  // The component step can still refuse a family (its Contract does not validate): drop it and regenerate, so the
  // Foundations closure lists only families with a Contract.
  for (;;) {
    let { doc, text } = await foundationsOf({ project, families: readable, tools, designSystem, contracts: priors });
    const results = {};
    let refused = null;
    for (const family of readable) {
      const out = contracts[family] = join(dir, 'contracts', `${family}.component.json`);
      const prior = priors[family] || null;
      try { results[family] = { out, ...(await contractOf({ project, family, foundations: doc, prior, drafts: drafts[family] || {}, tools })) }; }
      catch (e) { refused = family; skip(family, e); break; }
    }
    if (refused) { readable.splice(readable.indexOf(refused), 1); delete contracts[refused]; continue; }

    // A redraft comes with the Adapter's default ticks: carry the owner's omits over from its prior. The narrowed
    // Contract then gives the Foundations closure, as approve generates it from the Contracts on disk.
    const carried = {};
    for (const family of readable) {
      const r = results[family];
      if (!r.contract || r.unchanged || !priors[family]) continue;
      const narrowed = carryOmits(priors[family], r.contract);
      if (narrowed !== r.contract) carried[family] = r.contract = narrowed;
    }
    if (Object.keys(carried).length) {
      ({ doc, text } = await foundationsOf({ project, families: readable, tools, designSystem, contracts: { ...priors, ...carried } }));
      for (const [family, c] of Object.entries(carried)) {
        const { errors } = validate(c, doc);
        if (errors.length) throw new Error(`${family} with its carried omits does not validate:\n${errors.map(e => `  rule ${e.rule} ${e.at}: ${e.message}`).join('\n')}`);
      }
    }

    const setAside = [];
    const held = join(dir, 'contracts'), removed = join(dir, 'removed');
    for (const file of existsSync(held) ? readdirSync(held).filter(f => f.endsWith('.component.json')).sort() : []) {
      const family = file.slice(0, -'.component.json'.length);
      if (readable.includes(family)) continue;
      const gone = skipped.find(s => s.family === family);
      mkdirSync(removed, { recursive: true });
      renameSync(join(held, file), join(removed, file));
      setAside.push({ family, reason: gone ? `skipped: ${gone.reason}` : all ? 'not in the Code Library' : 'not used by the screens', path: join(removed, file) });
    }

    const path = join(dir, `${key}.foundations.json`);
    const foundations = { path, written: !existsSync(path) || readFileSync(path, 'utf8') !== text };
    if (foundations.written) { mkdirSync(dir, { recursive: true }); writeFileSync(path, text); }
    const written = [], unchanged = [], requests = {};
    for (const family of readable) {
      const r = results[family];
      if (!r.contract) requests[family] = r.requests;
      else if (r.unchanged && !returning.has(family)) unchanged.push(family);
      else { writeJson(r.out, r.contract); written.push(family); rmSync(join(removed, `${family}.component.json`), { force: true }); }
    }
    skipped.sort((a, b) => (a.family < b.family ? -1 : 1));
    return { name: key, dir, foundations, contracts, used, families: readable, skipped, setAside, written, unchanged, requests };
  }
}

/**
 * carryOmits(prior, contract) -> `contract`, a family drafted again, with the owner's omits of `prior` carried over.
 * The owner's omits are the prior's with no `reason`: the Adapter's own (attribute twins) come from the redraft.
 * Each variant is matched to the prior's by axis value: an axis new to the redraft only at its default, an axis it
 * dropped at the prior's default. A variant the prior omitted by an owner's omit is omitted again. One with a value
 * the prior did not have, or that the prior excluded, is new and keeps the Adapter's default tick, as does the Base
 * Component, which is always on. The omit is To-preview's own patch (CatalogSelection), as the review page's export
 * writes it, so the page shows those variants unticked. Returns `contract` itself when nothing carries.
 */
export function carryOmits(prior, contract) {
  const owners = prior.selection.omit.filter(o => !o.reason).map(o => o.match);
  if (!owners.length) return contract;
  const values = Object.fromEntries(prior.axes.map(a => [a.key, a.values.map(v => v.key)]));
  const priorTuple = tuple => {
    if (contract.axes.some(a => !values[a.key] && tuple[a.key] !== a.default)) return null;
    const p = Object.fromEntries(prior.axes.map(a => [a.key, a.key in tuple ? tuple[a.key] : a.default]));
    if (prior.axes.some(a => !values[a.key].includes(p[a.key])) || (prior.excluded || []).some(e => matches(e.match, p))) return null;
    return p;
  };
  const model = new CatalogSelection(contract, contractModule);
  let carried = 0;
  for (const s of model.specimens.values()) {
    model.verify(s.id);
    const p = priorTuple(s.tuple);
    if (p && s.id !== model.baseId && model.selected.has(s.id) && owners.some(m => matches(m, p))) { model.select(s.id, false); carried++; }
  }
  return carried ? applyOmit(contract, model.omitPatch()) : contract;
}

/** One drafts file: {"drafts": {family: {key: value}}}, or the Adapter's {"family", "drafts": {key: value}}. */
export function readDrafts(file) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return typeof json.family === 'string' ? { [json.family]: json.drafts } : json.drafts;
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  try {
    const project = args[0] && !args[0].startsWith('-') ? resolve(args[0]) : null;
    if (!project) throw new Error('usage: folder.mjs <project> [--all] [--name <name>] [--root <dir>] [--drafts <file>]... [--requests <file>]');
    assertShadcn(project);
    if (!hasTools()) await fetchTools();
    const drafts = {};
    args.forEach((a, i) => { if (a === '--drafts') Object.assign(drafts, readDrafts(resolve(args[i + 1]))); });
    const root = opt('--root') ? resolve(opt('--root')) : DESIGN_SYSTEMS;
    const r = await buildFolder({ project, name: opt('--name'), root, all: args.includes('--all'), drafts });
    const rel = p => relative(process.cwd(), p);
    console.log([
      `${r.name}: ${r.used.length} Component Families ${args.includes('--all') ? 'in the Code Library' : 'used by the screens'} (${r.used.join(', ')})`,
      ...r.skipped.map(s => `skipped ${s.family}: ${s.reason}`),
      ...r.setAside.map(s => `set aside ${s.family} (${s.reason}): its Contract is now ${rel(s.path)}; a set built from it stays in Figma, and the build names it orphaned`),
      `${r.foundations.written ? 'wrote' : 'unchanged'} ${rel(r.foundations.path)}`,
      ...r.written.map(f => `wrote ${rel(r.contracts[f])}`),
      ...r.unchanged.map(f => `unchanged ${f}`),
    ].join('\n'));
    const open = Object.keys(r.requests);
    if (open.length) {
      const requestsPath = resolve(opt('--requests') || join(REPO_ROOT, `.scratch/vibe-to-figma/${r.name}.requests.json`));
      writeJson(requestsPath, { name: r.name, requests: r.requests });
      console.log(`${open.reduce((n, f) => n + r.requests[f].length, 0)} Drafted values needed for ${open.join(', ')}: wrote ${rel(requestsPath)}\n`
        + 'Draft each one, then run again with --drafts <file> holding {"drafts": {"<family>": {"<key>": <value>}}}.');
      process.exit(2);
    }
    console.log('OK');
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
