#!/usr/bin/env node
// A wayfinder map's Decisions-so-far (docs/agents/issue-tracker.md): one line per closed ticket, linked.
//
//   node scripts/map.mjs decide <map> <ticket> "<gist>"   add the closed ticket's line, then check the map
//   node scripts/map.mjs check <map>                      closed tickets the map lists nowhere; exits 1 on any
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DECISIONS = '## Decisions so far';
const OUT_OF_SCOPE = '## Out of scope';

// A section's line range, from its heading to the next `## ` heading; null when the body has no such heading.
function section(lines, heading) {
  const start = lines.findIndex(l => l.trimEnd() === heading);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return { start, end: end < 0 ? lines.length : end };
}

// Ticket N's own item: a list item whose leading link goes to /issues/N. A link inside another ticket's gist is not
// one: on map #318, #337's line links #362 in its gist.
const ITEM = /^\s*[-*] \[.*?\]\(([^)\s]*)\)/;
const itemFor = (line, number) => ITEM.exec(line)?.[1].endsWith(`/issues/${number}`) ?? false;

// Whether the map lists ticket N in Decisions so far or in Out of scope, where a ticket ruled out of scope goes.
function listed(body, number) {
  const lines = body.split('\n');
  return [DECISIONS, OUT_OF_SCOPE].some(heading => {
    const at = section(lines, heading);
    return at && lines.slice(at.start, at.end).some(l => itemFor(l, number));
  });
}

/** A ticket's line, `- [<title>](<url>): <gist>`, from the ticket as `gh api .../issues/<n>` returns it. */
export function decisionLine({ title, html_url }, gist) {
  if (/[\r\n]/.test(gist)) throw new Error('the gist is one line');
  return `- [${title.replace(/[[\]]/g, '\\$&')}](${html_url}): ${gist.trim()}`;
}

/**
 * The map body with the line as the last item under Decisions so far. A body that already lists the ticket, there
 * or under Out of scope, comes back as it is. The rest of the body, its line endings included, is kept byte for byte.
 */
export function withDecision(body, line, number) {
  const lines = body.split('\n');
  const cr = lines[0].endsWith('\r') ? '\r' : '';
  const at = section(lines, DECISIONS);
  if (!at) throw new Error(`the map has no "${DECISIONS}" heading`);
  if (listed(body, number)) return body;
  const { start, end } = at;
  let last = end - 1;
  while (last > start && !lines[last].trim()) last--;
  // after a list item or its indented continuation the line joins the list; after the heading or the
  // template's comment it starts one, a blank line apart
  const inList = last > start && /^(\s*[-*] |\s{2,}\S)/.test(lines[last]);
  lines.splice(last + 1, 0, ...(inList ? [] : [cr]), line + cr);
  return lines.join('\n');
}

/** The closed children the map lists nowhere, as `gh api .../sub_issues` lists them. A duplicate needs no line. */
export const unlinked = (body, kids) =>
  kids.filter(c => c.state === 'closed' && c.state_reason !== 'duplicate' && !listed(body, c.number));

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input });
const issue = n => JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}`]));
const subIssues = n => JSON.parse(gh(['api', '--paginate', '--slurp', `repos/{owner}/{repo}/issues/${n}/sub_issues`])).flat();

function check(map) {
  const missing = unlinked(issue(map).body, subIssues(map));
  for (const c of missing) console.log(`#${c.number} is closed, and map #${map} lists it nowhere: ${c.title}`);
  return missing.length === 0;
}

// The 2026-10-22 retro of map #318's sessions: each edited the map body by hand, and #338's, #362's and #317's edits
// went wrong. Sessions resolving tickets in parallel each rewrite the whole body, and `gh issue edit` has no
// precondition, so a write based on a body that has since changed drops the other session's line. The body is read again just
// before the write, and the write is checked after it; a line lost to a write that landed in between is a closed
// ticket the map no longer lists, which `check` reports at the end.
function decide(map, number, gist) {
  const ticket = issue(number);
  if (ticket.state !== 'closed') throw new Error(`#${number} is open: post the resolution and close it first`);
  if (ticket.state_reason === 'not_planned') throw new Error(`#${number} was closed as not planned: list it under "${OUT_OF_SCOPE}" instead`);
  const line = decisionLine(ticket, gist);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const base = issue(map).body;
    const body = withDecision(base, line, ticket.number);
    if (body === base) { console.log(`map #${map} already lists #${number}`); return; }
    if (issue(map).body !== base) continue;
    gh(['api', '--method', 'PATCH', `repos/{owner}/{repo}/issues/${map}`, '--input', '-'], JSON.stringify({ body }));
    const after = issue(map).body;
    if (after === body) { console.log(`added to map #${map}: ${line}`); return; }
    if (after.includes(line)) { console.log(`added to map #${map}, which another write changed too: ${line}`); return; }
  }
  throw new Error(`map #${map} kept changing over three tries; add the line by hand:\n${line}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, map, ticket, gist] = process.argv.slice(2);
  try {
    if (cmd === 'decide' && map && ticket && gist) {
      decide(map, ticket, gist);
      if (!check(map)) process.exit(1);
    } else if (cmd === 'check' && map) {
      if (!check(map)) process.exit(1);
      console.log('OK');
    } else {
      console.error('usage: node scripts/map.mjs decide <map> <ticket> "<gist>" | check <map>');
      process.exit(2);
    }
  } catch (e) {
    console.error(`map: ${e.message}`);
    process.exit(1);
  }
}
