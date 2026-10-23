#!/usr/bin/env node
// Lists each recorded Handoff that awaits the owner's sign-off, with what blocks it, so a pull request that
// re-records a signed Handoff says so in its run. A report, never a failure: a regenerated Handoff lands pending, and
// the Sign-off that follows is the owner's (skills/to-handoff/SKILL.md).
//
//   node .github/signoffs.mjs     prints the list; in CI it also goes to the job summary and a notice per Handoff
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { review } from '../skills/to-handoff/scripts/signoff.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The Handoffs that await sign-off, from [{path, revision, status, signedRevision, signedCopy, blocks}]: pending, or
 * approved with no signed.json byte copy beside it (signedRevision null when there is none).
 */
export const awaiting = handoffs => handoffs.filter(h => h.status !== 'approved' || !h.signedCopy);

const signedOf = r => r.signedRevision === null ? 'never signed off' : `last signed off at r${r.signedRevision}`;
const stateOf = r => r.status === 'approved' ? 'approved, but signed.json is no byte copy of it'
  : r.blocks.length ? `blocks: ${r.blocks.join('; ')}` : 'nothing blocks it, so `review` prints its approve command';

export function summary(rows) {
  if (!rows.length) return 'No recorded Handoff awaits sign-off.\n';
  const lines = rows.map(r => `- ${r.path}: r${r.revision}, ${signedOf(r)}; ${stateOf(r)}`);
  return `${rows.length} recorded Handoff${rows.length === 1 ? ' awaits' : 's await'} sign-off:\n${lines.join('\n')}\n`;
}

// Every recorded Handoff, a design-systems/<ds>/handoffs/<feature>/ with a decisions.json, read with review's blocks.
// One it cannot read is listed with the reason as its block, so the report still never fails.
async function recordedHandoffs() {
  const out = [];
  const systems = join(ROOT, 'design-systems');
  for (const ds of readdirSync(systems).sort()) {
    const dir = join(systems, ds, 'handoffs');
    for (const feature of existsSync(dir) ? readdirSync(dir).sort() : []) {
      const path = join(dir, feature, 'handoff.json');
      if (!existsSync(path) || !existsSync(join(dir, feature, 'decisions.json'))) continue;
      const signedPath = join(dir, feature, 'signed.json');
      const signed = existsSync(signedPath) ? readFileSync(signedPath, 'utf8') : null;
      const row = { path: relative(ROOT, path), revision: '?', status: 'unreadable', signedRevision: null, signedCopy: false, blocks: [] };
      try {
        const text = readFileSync(path, 'utf8');
        const h = JSON.parse(text);
        Object.assign(row, { revision: h.revision, status: h.status, signedCopy: signed === text, signedRevision: signed === null ? null : JSON.parse(signed).revision });
        if (h.status !== 'approved') row.blocks = (await review({ handoffPath: path, designSystem: join(systems, ds) })).blocks;
      } catch (e) { row.blocks = [`could not be read: ${e.message}`]; }
      out.push(row);
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = awaiting(await recordedHandoffs());
  const text = summary(rows);
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Sign-off\n\n${text}`);
    for (const r of rows) console.log(`::notice file=${r.path}::${r.path} r${r.revision} awaits the owner's sign-off`);
  }
}
