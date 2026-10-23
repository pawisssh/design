#!/usr/bin/env node
// Squash-merges a pull request and deletes its branch once its `test` run passed and its merge tree is checked.
//
//   node scripts/merge.mjs <pr> [--head <sha> [--wait]]   merge if `test` passed on the head and main hasn't moved since
//     --head <sha>            the head you reviewed: refuse if the branch has moved past it
//     --main-moved-checked    merge although main moved, once the two sides are checked apart
//     --wait                  with --head: wait for a missing or running `test` run to finish, then merge or refuse
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Whether the latest `test` check run on the head passed, from `gh api .../commits/<sha>/check-runs`'s check_runs.
 * -> {ok, why} or {ok, suite}, the run's check suite id; `pending` when no run has finished yet, which --wait waits on
 */
export function testVerdict(runs, sha) {
  const [latest] = runs.filter(r => r.name === 'test').sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!latest) return { ok: false, pending: true, why: `no \`test\` run on ${sha}` };
  if (latest.status !== 'completed') return { ok: false, pending: true, why: `\`test\` is ${latest.status} on ${sha}` };
  if (latest.conclusion !== 'success') return { ok: false, why: `\`test\` ended ${latest.conclusion} on ${sha}` };
  return { ok: true, suite: latest.check_suite.id };
}

/** The top-level areas a list of paths touches: `skills/<name>`, or the first folder, or the file at the root. */
export const areas = paths => [...new Set(paths.map(p => {
  const [a, b] = p.split('/');
  return a === 'skills' && b ? `skills/${b}` : a;
}))].sort();

const exec = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const api = (path, ...args) => JSON.parse(exec('gh', ['api', ...args, `repos/{owner}/{repo}/${path}`]));
const git = (...args) => exec('git', args);

// The merge tree the squash should equal: both sides fetched fresh, merged with no conflict.
function mergeTree(pr) {
  git('fetch', '--quiet', 'origin', pr.baseRefName, pr.headRefName);
  try {
    return git('merge-tree', '--write-tree', `origin/${pr.baseRefName}`, pr.headRefOid).split('\n')[0];
  } catch (e) {
    throw new Error(`#${pr.number} conflicts with origin/${pr.baseRefName}; merge it into the branch first:\n${e.stdout}`);
  }
}

// A pull_request run checks out refs/pull/<n>/merge, the merge with main as main stood when the run was triggered
// (GitHub docs, "Events that trigger workflows": pull_request), so as of its check suite's creation. A commit on
// main since then is in no tested tree: unless the two sides touch different skills and neither imports the other's
// files, main is merged into the branch and the PR waits for a fresh run.
function mainMoved(pr, suite, checked) {
  const since = api(`check-suites/${suite}`).created_at;
  const commits = git('rev-list', `--since=${since}`, `origin/${pr.baseRefName}`).split('\n').filter(Boolean);
  if (!commits.length) return;
  const theirs = commits.flatMap(c => git('diff-tree', '--no-commit-id', '--name-only', '-r', c).split('\n'));
  const ours = git('diff', '--name-only', `origin/${pr.baseRefName}...${pr.headRefOid}`).split('\n');
  console.log(`origin/${pr.baseRefName} moved since #${pr.number}'s \`test\` run (${since}): ${commits.length} commit(s)`);
  console.log(`  they touch: ${areas(theirs).join(', ')}`);
  console.log(`  #${pr.number} touches: ${areas(ours).join(', ')}`);
  if (!checked) {
    throw new Error('check that the two sides touch different skills and neither imports the other\'s files, then run '
      + 'again with --main-moved-checked; otherwise merge main into the branch and wait for a fresh `test` run');
  }
}

// pawisssh/design is a private repository on GitHub Free, where branch protection is not available (GitHub docs,
// "About protected branches"), so no required check holds main: this script makes the one a required `test` status
// would, the self-hosted runner's run from #275.
function merge(number, { checked, head, wait }) {
  const view = () => {
    const pr = JSON.parse(exec('gh', ['pr', 'view', number, '--json', 'number,title,state,isDraft,headRefName,headRefOid,baseRefName']));
    if (pr.state !== 'OPEN' || pr.isDraft) throw new Error(`#${pr.number} is ${pr.isDraft ? 'a draft' : pr.state.toLowerCase()}`);
    if (head && !pr.headRefOid.startsWith(head)) throw new Error(`#${pr.number}'s head is ${pr.headRefOid}, not the reviewed ${head}`);
    return pr;
  };
  let pr, verdict;
  const read = () => { pr = view(); verdict = testVerdict(api(`commits/${pr.headRefOid}/check-runs`).check_runs, pr.headRefOid); };
  read();
  // --wait (retro, 2026-10-24): "merge once `test` passes" in one command, with no CI polling in the session. It
  // re-reads the head each time, so a push while waiting refuses, and gives up after the workflow's timeout-minutes
  // counted from now: a run still queued behind another job on the one runner can outlast it, so run it again then.
  const minutes = Number(readFileSync(fileURLToPath(new URL('../.github/workflows/test.yml', import.meta.url)), 'utf8').match(/timeout-minutes: (\d+)/)[1]);
  for (const until = Date.now() + minutes * 60_000; wait && verdict.pending && Date.now() < until; read()) {
    console.log(`waiting: ${verdict.why}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
  if (wait && verdict.pending) throw new Error(`gave up after ${minutes} minutes: ${verdict.why}`);
  if (!verdict.ok) throw new Error(verdict.why);
  const tree = mergeTree(pr);
  mainMoved(pr, verdict.suite, checked);
  // `sha` is the head the merge must match (REST "Merge a pull request"; `gh pr merge --match-head-commit`): a push
  // after these checks fails the merge rather than landing untested
  const merged = api(`pulls/${pr.number}/merge`, '--method', 'PUT', '-f', 'merge_method=squash',
    '-f', `sha=${pr.headRefOid}`, '-f', `commit_title=${pr.title} (#${pr.number})`);
  console.log(`merged #${pr.number} as ${merged.sha.slice(0, 7)}`);
  git('fetch', '--quiet', 'origin', pr.baseRefName);
  const landed = git('rev-parse', `origin/${pr.baseRefName}^{tree}`);
  if (landed !== tree) throw new Error(`origin/${pr.baseRefName}'s tree ${landed} is not the checked merge tree ${tree}`);
  console.log(`origin/${pr.baseRefName}'s tree is the checked merge tree`);
  exec('gh', ['api', '--method', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${pr.headRefName}`]);
  console.log(`branch ${pr.headRefName} deleted`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [number, ...flags] = process.argv.slice(2);
  const opts = { checked: false, head: null, wait: false };
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--main-moved-checked') opts.checked = true;
    else if (flags[i] === '--wait') opts.wait = true;
    else if (flags[i] === '--head' && /^[0-9a-f]{7,40}$/.test(flags[i + 1] || '')) opts.head = flags[++i];
    else opts.bad = true;
  }
  if (!/^\d+$/.test(number || '') || opts.bad || (opts.wait && !opts.head)) {
    console.error('usage: node scripts/merge.mjs <pr> [--head <sha> [--wait]] [--main-moved-checked]');
    process.exit(2);
  }
  try {
    merge(number, opts);
  } catch (e) {
    console.error(`merge: ${e.message}`);
    process.exit(1);
  }
}
