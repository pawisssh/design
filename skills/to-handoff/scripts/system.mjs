// A Design System folder as To-handoff reads it (#102): its Foundations document, Contracts, Proposals and
// the Adapter's handoff module, found by convention (skills/adapter-<source.adapter>/scripts/handoff-adapter.mjs).
// To-handoff never names a Code Library: everything Library-specific comes from that module.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Who a test approval names (#116). Sign-off is the owner's and is never simulated: approve writes this only
 * under <repo>/.scratch/, and validateHandoff rejects it anywhere else.
 */
export const TEST_APPROVER = 'test (.scratch)';

/** Whether `path` lies under <repo>/.scratch/. */
export function inScratch(path) {
  const rel = relative(resolve(REPO_ROOT, '.scratch'), resolve(path));
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/');
}

/** A Contract's or Proposal's State axis (the canonical one), or undefined. */
export const stateAxisOf = def => def.axes.find(a => a.canonical || a.key === 'state');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const jsonIn = (dir, suffix) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(suffix)).sort() : []).map(f => readJson(join(dir, f)));

/**
 * Load `dir` (design-systems/<ds>): {dir, key, foundations, foundationsText, contracts: {key: Contract},
 * proposals: {key: Proposal}, adapter, familyMap}. Exactly one `*.foundations.json` sits at its root. `familyMap` is
 * {text, map} for the Family map an Extracted Library's folder has at its root (#265, ADR 0016), else null.
 */
export async function loadDesignSystem(dir) {
  const found = readdirSync(dir).filter(f => f.endsWith('.foundations.json')).sort();
  if (found.length !== 1) throw new Error(`${dir} has ${found.length} *.foundations.json files; To-handoff needs exactly one`);
  const foundationsText = readFileSync(join(dir, found[0]), 'utf8');
  const foundations = JSON.parse(foundationsText);
  const contracts = Object.fromEntries(jsonIn(join(dir, 'contracts'), '.component.json').map(c => [c.family.key, c]));
  const proposals = Object.fromEntries(jsonIn(join(dir, 'proposals'), '.proposal.json').map(p => [p.family.key, p]));
  const adapterPath = join(REPO_ROOT, 'skills', `adapter-${foundations.source.adapter}`, 'scripts', 'handoff-adapter.mjs');
  if (!existsSync(adapterPath)) throw new Error(`No handoff module for Adapter "${foundations.source.adapter}" at ${adapterPath}`);
  const adapter = await import(pathToFileURL(adapterPath).href);
  const mapFile = readdirSync(dir).find(f => f.endsWith('.family-map.json'));
  const mapText = mapFile && readFileSync(join(dir, mapFile), 'utf8');
  const familyMap = mapText ? { text: mapText, map: JSON.parse(mapText) } : null;
  return { dir, key: foundations.designSystem.key, foundations, foundationsText, contracts, proposals, adapter, familyMap };
}
