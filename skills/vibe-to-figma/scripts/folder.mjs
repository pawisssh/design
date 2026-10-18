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
// Contracts and the review, the approve and the build go on without it. When the family comes back, its new Contract
// goes into contracts/ and the set-aside copy is deleted.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../../contract/scripts/io.mjs';
import { generate as contractOf, readFamily } from '../../adapter-generic/scripts/components.mjs';
import { generate as foundationsOf } from '../../adapter-generic/scripts/foundations.mjs';
import { DEFAULT_DIR, REPO_ROOT, fetchTools, hasTools } from '../../adapter-generic/scripts/sources.mjs';
import { usedFamilies } from './used.mjs';

export const DESIGN_SYSTEMS = join(REPO_ROOT, 'design-systems');
const NAME = /^[a-z0-9][a-z0-9._-]*$/;

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
  // selection, which gives the Foundations closure (an approved omit stays narrowed on a rerun, #177).
  const priors = {};
  for (const family of readable) {
    const out = join(dir, 'contracts', `${family}.component.json`);
    if (existsSync(out)) priors[family] = JSON.parse(readFileSync(out, 'utf8'));
  }
  // The component step can still refuse a family (its Contract does not validate): drop it and regenerate, so the
  // Foundations closure lists only families with a Contract.
  for (;;) {
    const { doc, text } = await foundationsOf({ project, families: readable, tools, designSystem, contracts: priors });
    const results = {};
    let refused = null;
    for (const family of readable) {
      const out = contracts[family] = join(dir, 'contracts', `${family}.component.json`);
      const prior = priors[family] || null;
      try { results[family] = { out, ...(await contractOf({ project, family, foundations: doc, prior, drafts: drafts[family] || {}, tools })) }; }
      catch (e) { refused = family; skip(family, e); break; }
    }
    if (refused) { readable.splice(readable.indexOf(refused), 1); delete contracts[refused]; continue; }

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
      else if (r.unchanged) unchanged.push(family);
      else { writeJson(r.out, r.contract); written.push(family); rmSync(join(removed, `${family}.component.json`), { force: true }); }
    }
    skipped.sort((a, b) => (a.family < b.family ? -1 : 1));
    return { name: key, dir, foundations, contracts, used, families: readable, skipped, setAside, written, unchanged, requests };
  }
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
