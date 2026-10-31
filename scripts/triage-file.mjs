#!/usr/bin/env node
// A triage batch, posted from one plan file (docs/agents/issue-tracker.md):
//
//   node scripts/triage-file.mjs <plan.json>
//
// The plan is { repo, new: [...], issues: [...] }. A `new` entry, { id, title, body | bodyFile, labels, blockedBy },
// is filed first; any body or comment can then cite it as {{new:<id>}}, and gets its real number. One that already
// has a `number` is not filed again, so after a failure the plan, with the printed numbers added, can run again. An
// `issues` entry, { number, comment | commentFile, add, remove, close: "completed" | "not planned", blockedBy }, is
// posted as one unit: the comment, then the label swap, then the close, then the blocked-by edges. Four post at
// once; each prints one line, and the script exits 1 when any failed. Files are read relative to the plan.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const PLACEHOLDER = /\{\{new:([\w-]+)\}\}/g;

/** The text with each {{new:<id>}} as #<number>. */
export function fill(text, numbers) {
  return text.replace(PLACEHOLDER, (_, id) => {
    if (!(id in numbers)) throw new Error(`no new issue "${id}" in the plan`);
    return `#${numbers[id]}`;
  });
}

const BLOCKER = /^(\d+|\{\{new:[\w-]+\}\})$/;
const CLOSE_REASONS = ['completed', 'not planned'];

// The plan with every file read, so each entry carries its text. Each placeholder, blocker and close reason is
// checked before the first write, so a typo posts nothing; a new issue's body cites only the new issues before it,
// which are filed first.
function readPlan(plan, read) {
  const text = (file, inline) => (file ? read(file) : inline ?? '');
  const known = {};
  const checked = (name, entry, body) => {
    try {
      fill(body, known);
      for (const b of entry.blockedBy ?? []) {
        if (!BLOCKER.test(String(b))) throw new Error(`blocker "${b}" is neither a number nor {{new:<id>}}`);
        fill(String(b), known);
      }
      if (entry.close && !CLOSE_REASONS.includes(entry.close)) throw new Error(`close is "${entry.close}", not ${CLOSE_REASONS.join(' or ')}`);
    } catch (e) { throw new Error(`${name}: ${e.message}`); }
    return { ...entry, text: body };
  };
  const created = (plan.new ?? []).map(n => { const c = checked(n.id, n, text(n.bodyFile, n.body)); known[n.id] = 0; return c; });
  return { repo: plan.repo, new: created, issues: (plan.issues ?? []).map(i => checked(`#${i.number}`, i, text(i.commentFile, i.comment))) };
}

const reason = e => (e.stderr || e.message).trim().split('\n')[0];
// What GitHub answers, with HTTP 422, to an edge that already exists: #364's edges from #360 and #367 at the
// 2026-11-01 triage (#595).
const EDGE_EXISTS = /already been taken/;

// One issue's comment, labels, close and edges, in that order; the first failure stops the rest of its unit.
async function post(gh, repo, unit) {
  const done = [];
  const step = async (name, fn) => {
    try { return await fn(); } catch (e) { throw new Error(`${name}: ${reason(e)}`); }
  };
  const n = String(unit.number);
  try {
    if (unit.comment) { await step('comment', () => gh(['issue', 'comment', n, '-R', repo, '--body-file', '-'], unit.comment)); done.push('commented'); }
    if (unit.add?.length || unit.remove?.length) {
      const args = ['issue', 'edit', n, '-R', repo];
      if (unit.add?.length) args.push('--add-label', unit.add.join(','));
      if (unit.remove?.length) args.push('--remove-label', unit.remove.join(','));
      await step('labels', () => gh(args));
      done.push('labels');
    }
    if (unit.close) { await step('close', () => gh(['issue', 'close', n, '-R', repo, '--reason', unit.close])); done.push('closed'); }
    const edges = [];
    for (const b of unit.blockedBy ?? []) {
      const id = (await step(`id of #${b}`, () => gh(['api', `repos/${repo}/issues/${b}`, '--jq', '.id']))).trim();
      try {
        await gh(['api', '--method', 'POST', `repos/${repo}/issues/${n}/dependencies/blocked_by`, '-F', `issue_id=${id}`]);
        edges.push(`#${b}`);
      } catch (e) {
        if (!EDGE_EXISTS.test(reason(e))) throw new Error(`blocked by #${b}: ${reason(e)}`);
        edges.push(`#${b} (already)`);
      }
    }
    if (edges.length) done.push(`blocked by ${edges.join(', ')}`);
    return { ok: true, line: `ok #${n} ${done.join(', ')}` };
  } catch (e) {
    return { ok: false, line: `FAIL #${n}${done.length ? ` after ${done.join(', ')}` : ''}: ${e.message}` };
  }
}

/**
 * Files the plan's new issues, then posts every unit; resolves to { ok, lines }. Rejects, posting nothing, on a bad
 * plan. A filing that fails stops the run there, after printing the numbers already filed.
 */
export async function run(input, { gh, read, concurrency = 4 }) {
  const plan = readPlan(input, read);
  const { repo } = plan;
  const numbers = {};
  const lines = [];
  for (const n of plan.new) {
    if (n.number) { numbers[n.id] = n.number; continue; }
    const args = ['issue', 'create', '-R', repo, '--title', n.title, '--body-file', '-'];
    if (n.labels?.length) args.push('--label', n.labels.join(','));
    try {
      numbers[n.id] = Number((await gh(args, fill(n.text, numbers))).trim().split('/').pop());
    } catch (e) {
      return { ok: false, lines: [...lines, `FAIL filing ${n.id}: ${reason(e)}`] };
    }
    lines.push(`filed #${numbers[n.id]} ${n.id}`);
  }
  const blockers = list => (list ?? []).map(b => Number(fill(String(b), numbers).replace('#', '')));
  const units = [
    ...plan.issues.map(i => ({
      number: i.number, comment: i.text && fill(i.text, numbers),
      add: i.add, remove: i.remove, close: i.close, blockedBy: blockers(i.blockedBy),
    })),
    ...plan.new.filter(n => n.blockedBy?.length).map(n => ({ number: numbers[n.id], blockedBy: blockers(n.blockedBy) })),
  ];
  const results = new Array(units.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, async () => {
    while (next < units.length) { const i = next++; results[i] = await post(gh, repo, units[i]); }
  }));
  lines.push(...results.map(r => r.line));
  return { ok: results.every(r => r.ok), lines };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const path = process.argv[2];
  if (!path) { console.error('usage: node scripts/triage-file.mjs <plan.json>'); process.exit(2); }
  const exec = promisify(execFile);
  const gh = (args, input) => {
    const child = exec('gh', args, { encoding: 'utf8' });
    child.child.stdin.end(input ?? '');
    return child.then(r => r.stdout);
  };
  const read = file => readFileSync(resolve(dirname(path), file), 'utf8');
  try {
    const { ok, lines } = await run(JSON.parse(readFileSync(path, 'utf8')), { gh, read });
    lines.forEach(l => console.log(l));
    if (!ok) process.exit(1);
  } catch (e) {
    console.error(`triage-file: ${e.message}`);
    process.exit(1);
  }
}
