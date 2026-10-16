// A Design System folder as To-handoff reads it (#102): its Foundations document, Contracts, Proposals and
// the Adapter's handoff module, found by convention (skills/adapter-<source.adapter>/scripts/handoff-adapter.mjs).
// To-handoff never names a Code Library: everything Library-specific comes from that module.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A Contract's or Proposal's State axis (the canonical one), or undefined. */
export const stateAxisOf = def => def.axes.find(a => a.canonical || a.key === 'state');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const jsonIn = (dir, suffix) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(suffix)).sort() : []).map(f => readJson(join(dir, f)));

/**
 * Load `dir` (design-systems/<ds>): {dir, key, foundations, foundationsText, contracts: {key: Contract},
 * proposals: {key: Proposal}, adapter}. Exactly one `*.foundations.json` sits at its root.
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
  return { dir, key: foundations.designSystem.key, foundations, foundationsText, contracts, proposals, adapter };
}
