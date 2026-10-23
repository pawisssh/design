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
 * The Handoffs that await sign-off, from [{path, revision, status, signedRevision, blocks}]: pending, or approved
 * with signed.json at another revision (null when there is none). -> [{path, revision, signedRevision, blocks}]
 */
export const awaiting = handoffs => handoffs
  .filter(h => h.status !== 'approved' || h.signedRevision !== h.revision)
  .map(({ path, revision, signedRevision, blocks }) => ({ path, revision, signedRevision, blocks }));

export function summary(rows) {
  if (!rows.length) return 'No recorded Handoff awaits sign-off.\n';
  const lines = rows.map(r => `- ${r.path}: r${r.revision}, ${r.signedRevision === null ? 'never signed off' : `last signed off at r${r.signedRevision}`}; `
    + (r.blocks.length ? `blocks: ${r.blocks.join('; ')}` : 'nothing blocks it, so `review` prints its approve command'));
  return `${rows.length} recorded Handoff${rows.length === 1 ? ' awaits' : 's await'} sign-off:\n${lines.join('\n')}\n`;
}

// Every design-systems/<ds>/handoffs/<feature>/handoff.json, read with review's blocks.
async function recorded() {
  const out = [];
  const systems = join(ROOT, 'design-systems');
  for (const ds of readdirSync(systems).sort()) {
    const dir = join(systems, ds, 'handoffs');
    for (const feature of existsSync(dir) ? readdirSync(dir).sort() : []) {
      const path = join(dir, feature, 'handoff.json');
      if (!existsSync(path)) continue;
      const h = JSON.parse(readFileSync(path, 'utf8'));
      const signedPath = join(dir, feature, 'signed.json');
      const signedRevision = existsSync(signedPath) ? JSON.parse(readFileSync(signedPath, 'utf8')).revision : null;
      const blocks = h.status === 'approved' ? [] : (await review({ handoffPath: path, designSystem: join(systems, ds) })).blocks;
      out.push({ path: relative(ROOT, path), revision: h.revision, status: h.status, signedRevision, blocks });
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = awaiting(await recorded());
  const text = summary(rows);
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Sign-off\n\n${text}`);
    for (const r of rows) console.log(`::notice file=${r.path}::${r.path} r${r.revision} awaits the owner's sign-off`);
  }
}
