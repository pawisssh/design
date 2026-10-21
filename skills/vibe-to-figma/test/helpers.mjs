// The v0 Prototype's Design System folder, built once per test file under <repo>/.scratch/vibe-to-figma-tests/
// (a test approval is written only under .scratch/), with the Adapter's committed fixtures/drafts as the agent's
// answers. Each test takes its own copy; after() removes them all.
import { after } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { REPO_ROOT, hasTools } from '../../adapter-generic/scripts/sources.mjs';
import { mainCheckoutOf } from '../../to-design/scripts/ledger.mjs';
import { hasTypescript } from '../../to-handoff/scripts/deps.mjs';
import { buildFolder } from '../scripts/folder.mjs';

export const V0 = fileURLToPath(new URL('../../to-handoff/test/fixtures/v0-app', import.meta.url));
const DRAFTS = fileURLToPath(new URL('../../adapter-generic/fixtures/drafts/', import.meta.url));
export const READABLE = ['alert', 'button', 'card', 'input', 'label', 'select', 'textarea'];
export const skip = (!hasTools() && 'Generic Adapter tools missing; run: node skills/adapter-generic/scripts/sources.mjs')
  || (!hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs');
// To-design's packager writes a package only inside the main working tree, where the use_figma hook resolves it, so a
// worktree checked out outside it (under /tmp, say) cannot package a call. In a plain clone MAIN is null, and packageSkip
// must still be false: node --test reports `skip: null` as skipped while it runs the test, so a failure would not show.
const MAIN = mainCheckoutOf(REPO_ROOT);
export const packageSkip = skip || (!!MAIN && relative(realpathSync(MAIN), realpathSync(REPO_ROOT)).startsWith('..')
  && `this worktree is outside its main working tree ${MAIN}, where To-design's packager writes packages`);

const SCRATCH = join(REPO_ROOT, '.scratch/vibe-to-figma-tests');
const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
export const scratch = () => { mkdirSync(SCRATCH, { recursive: true }); const dir = mkdtempSync(join(SCRATCH, 'run-')); made.push(dir); return dir; };

let built;
/** A fresh copy of design-systems/v0-app/ under .scratch/: {dir, report}. */
export async function v0Folder() {
  if (!built) {
    const drafts = Object.fromEntries(READABLE.map(f => [f, JSON.parse(readFileSync(join(DRAFTS, `${f}.json`), 'utf8')).drafts]));
    const root = scratch();
    built = { report: await buildFolder({ project: V0, root, drafts }), root };
  }
  const root = scratch();
  cpSync(join(built.root, 'v0-app'), join(root, 'v0-app'), { recursive: true });
  return { dir: join(root, 'v0-app'), report: built.report };
}

export const read = path => JSON.parse(readFileSync(path, 'utf8'));
export const contractPath = (dir, family) => join(dir, 'contracts', `${family}.component.json`);
// Every file of the folder, as text: what a refusal, or a rerun of what did not change, must leave unchanged.
export const snapshot = dir => Object.fromEntries(['', 'contracts'].flatMap(sub => readdirSync(join(dir, sub)).filter(f => f.endsWith('.json')).map(f => [join(sub, f), readFileSync(join(dir, sub, f), 'utf8')])));

const Selection = createRequire(import.meta.url)('../../to-preview/assets/selection-model.js');
/**
 * What the page's export does with each catalog's Catalog.getSelection(), in node, for each family with a Contract in
 * the folder: every specimen rendered, then
 * the owner's edits ({family: model => ...}). -> {family: {patch, checked}}.
 */
export function selections(dir, edits = {}) {
  return Object.fromEntries(READABLE.filter(family => existsSync(contractPath(dir, family))).map(family => {
    const model = new Selection(read(join(dir, 'contracts', `${family}.component.json`)), contractModule);
    for (const id of model.specimens.keys()) model.verify(id);
    if (edits[family]) edits[family](model);
    const patch = model.omitPatch();
    return [family, { patch, checked: { family, snapshotId: patch.snapshotId, checked: model.checkedTuples() } }];
  }));
}

/** Every file under `dir` as text, keyed by its path relative to it. */
export function tree(dir) {
  const out = {};
  (function walk(d) {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(dir, path)] = readFileSync(path, 'utf8');
    }
  })(dir);
  return out;
}

export const PATH_A = fileURLToPath(new URL('./fixtures/path-a-app', import.meta.url));
export const PATH_A_ANSWERS = fileURLToPath(new URL('./fixtures/path-a-app.answers.json', import.meta.url));
export const PATH_A_FAMILIES = ['action-button', 'card', 'icon-button', 'pill-button', 'segment'];

let builtA;
/** A fresh copy of the path A fixture's Prototype and its Design System folder, built from the committed answers: {proto, root, dir, library}. */
export async function pathAFolder() {
  if (!builtA) {
    const root = scratch();
    await buildFolder({ project: PATH_A, root, answers: read(PATH_A_ANSWERS) });
    builtA = root;
  }
  const base = scratch(), proto = join(base, 'proto'), root = join(base, 'out');
  cpSync(PATH_A, proto, { recursive: true });
  cpSync(builtA, root, { recursive: true });
  const dir = join(root, 'path-a-app');
  return { proto, root, dir, library: join(dir, 'library') };
}
