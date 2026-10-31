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

// Every placeholder and file is checked before the first write, so a typo posts nothing.
function check(plan, read) {
  const ids = new Set((plan.new ?? []).map(n => n.id));
  const known = Object.fromEntries([...ids].map(id => [id, 0]));
  const texts = [];
  for (const n of plan.new ?? []) texts.push([n.id, n.bodyFile ? read(n.bodyFile) : n.body ?? '', ...(n.blockedBy ?? []).map(String)]);
  for (const i of plan.issues ?? []) texts.push([`#${i.number}`, i.commentFile ? read(i.commentFile) : i.comment ?? '', ...(i.blockedBy ?? []).map(String)]);
  for (const [name, ...rest] of texts) {
    try { rest.forEach(t => fill(t, known)); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
}

const reason = e => (e.stderr || e.message).trim().split('\n')[0];
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

/** Files the plan's new issues, then posts every unit; resolves to { ok, lines }. Rejects, posting nothing, on a bad plan. */
export async function run(plan, { gh, read, concurrency = 4 }) {
  check(plan, read);
  const repo = plan.repo;
  const numbers = {};
  const lines = [];
  for (const n of plan.new ?? []) {
    if (n.number) { numbers[n.id] = n.number; continue; }
    const args = ['issue', 'create', '-R', repo, '--title', n.title, '--body-file', '-'];
    if (n.labels?.length) args.push('--label', n.labels.join(','));
    const url = await gh(args, fill(n.bodyFile ? read(n.bodyFile) : n.body ?? '', numbers));
    numbers[n.id] = Number(url.trim().split('/').pop());
    lines.push(`filed #${numbers[n.id]} ${n.id}`);
  }
  const blockers = list => (list ?? []).map(b => Number(fill(String(b), numbers).replace('#', '')));
  const units = [
    ...(plan.issues ?? []).map(i => ({
      number: i.number,
      comment: i.commentFile || i.comment ? fill(i.commentFile ? read(i.commentFile) : i.comment, numbers) : undefined,
      add: i.add, remove: i.remove, close: i.close, blockedBy: blockers(i.blockedBy),
    })),
    ...(plan.new ?? []).filter(n => n.blockedBy?.length).map(n => ({ number: numbers[n.id], blockedBy: blockers(n.blockedBy) })),
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
