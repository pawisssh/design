#!/usr/bin/env node
// A wayfinder map's Decisions-so-far (docs/agents/issue-tracker.md): one line per closed ticket, linked.
//
//   node scripts/map.mjs decide <map> <ticket> "<gist>"   add the closed ticket's line, then check the map
//   node scripts/map.mjs check <map>                      closed tickets the map links nowhere; exits 1 on any
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADING = '## Decisions so far';

/** A ticket's line, `- [<title>](<url>): <gist>`, from the ticket as `gh api .../issues/<n>` returns it. */
export function decisionLine({ title, html_url }, gist) {
  if (/[\r\n]/.test(gist)) throw new Error('the gist is one line');
  return `- [${title.replace(/[[\]]/g, '\\$&')}](${html_url}): ${gist.trim()}`;
}

/**
 * The map body with the line as the last item under Decisions so far. A body whose section already links the
 * ticket comes back as it is. The rest of the body, its line endings included, is kept byte for byte.
 */
export function withDecision(body, line, number) {
  const lines = body.split('\n');
  const cr = lines[0].endsWith('\r') ? '\r' : '';
  const start = lines.findIndex(l => l.trimEnd() === HEADING);
  if (start < 0) throw new Error(`the map has no "${HEADING}" heading`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  if (lines.slice(start, end).some(l => l.includes(`/issues/${number})`))) return body;
  let last = end - 1;
  while (last > start && !lines[last].trim()) last--;
  // after a list item or its indented continuation the line joins the list; after the heading or the
  // template's comment it starts one, a blank line apart
  const inList = last > start && /^(\s*[-*] |\s{2,}\S)/.test(lines[last]);
  lines.splice(last + 1, 0, ...(inList ? [] : [cr]), line + cr);
  return lines.join('\n');
}

/** The closed children no link in the map body names, as `gh api .../sub_issues` lists them. A duplicate needs none. */
export const unlinked = (body, children) =>
  children.filter(c => c.state === 'closed' && c.state_reason !== 'duplicate' && !body.includes(`/issues/${c.number})`));

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input });
const issue = n => JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}`]));
const children = n => JSON.parse(gh(['api', '--paginate', '--slurp', `repos/{owner}/{repo}/issues/${n}/sub_issues`])).flat();

function check(map) {
  const missing = unlinked(issue(map).body, children(map));
  for (const c of missing) console.log(`#${c.number} is closed, and map #${map} links it nowhere: ${c.title}`);
  return missing.length === 0;
}

// Sessions resolving tickets in parallel each rewrite the whole body, and `gh issue edit` has no precondition, so
// a write based on a body that has since changed drops the other session's line. The body is read again just
// before the write, and the write is checked after it; a line lost to a write that landed in between is a closed
// ticket the map no longer links, which `check` reports at the end.
function decide(map, number, gist) {
  const ticket = issue(number);
  if (ticket.state !== 'closed') throw new Error(`#${number} is open: post the resolution and close it first`);
  const line = decisionLine(ticket, gist);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const base = issue(map).body;
    const body = withDecision(base, line, ticket.number);
    if (body === base) { console.log(`map #${map} already links #${number}`); return; }
    if (issue(map).body !== base) continue;
    gh(['api', '--method', 'PATCH', `repos/{owner}/{repo}/issues/${map}`, '--input', '-'], JSON.stringify({ body }));
    if (issue(map).body.includes(line)) { console.log(`added to map #${map}: ${line}`); return; }
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
