#!/usr/bin/env node
// Squash-merges a pull request and deletes its branch, once the checks a required status would make have passed.
// pawisssh/design is on GitHub Free, so main has no branch protection and nothing else makes them.
//
//   node scripts/merge.mjs <pr>                        merge if `test` passed on the head and main hasn't moved since
//   node scripts/merge.mjs <pr> --main-moved-checked   merge although main moved, once the two sides are checked apart
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Whether the latest `test` check run on the head passed, from `gh api .../commits/<sha>/check-runs`'s check_runs.
 * -> {ok, why} or {ok, suite}, the run's check suite id
 */
export function testVerdict(runs, sha) {
  const [run] = runs.filter(r => r.name === 'test').sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!run) return { ok: false, why: `no \`test\` run on ${sha}` };
  if (run.status !== 'completed') return { ok: false, why: `\`test\` is ${run.status} on ${sha}` };
  if (run.conclusion !== 'success') return { ok: false, why: `\`test\` ended ${run.conclusion} on ${sha}` };
  return { ok: true, suite: run.check_suite.id };
}

/** The top-level areas a list of paths touches: `skills/<name>`, or the first folder, or the file at the root. */
export const areas = paths => [...new Set(paths.map(p => {
  const [a, b] = p.split('/');
  return a === 'skills' && b ? `skills/${b}` : a;
}))].sort();

const run = (cmd, args, input) => execFileSync(cmd, args, { encoding: 'utf8', input }).trim();
const api = (path, ...args) => JSON.parse(run('gh', ['api', ...args, `repos/{owner}/{repo}/${path}`]));
const git = (...args) => run('git', args);

// The merge tree the squash should equal: both sides fetched fresh, merged with no conflict.
function mergeTree(pr) {
  git('fetch', '--quiet', 'origin', pr.baseRefName, pr.headRefName);
  try {
    return git('merge-tree', '--write-tree', `origin/${pr.baseRefName}`, pr.headRefOid).split('\n')[0];
  } catch (e) {
    throw new Error(`#${pr.number} conflicts with origin/${pr.baseRefName}; merge it into the branch first:\n${e.stdout}`);
  }
}

// A pull request's CI tests its merge with main as main stood when the run was triggered (its check suite's
// creation). A commit on main since then is in no tested tree: unless the two sides touch different skills and
// neither imports the other's files, main is merged into the branch and the PR waits for a fresh run.
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

function merge(number, checked) {
  const pr = JSON.parse(run('gh', ['pr', 'view', number, '--json', 'number,title,state,isDraft,headRefName,headRefOid,baseRefName']));
  if (pr.state !== 'OPEN' || pr.isDraft) throw new Error(`#${pr.number} is ${pr.isDraft ? 'a draft' : pr.state.toLowerCase()}`);
  const verdict = testVerdict(api(`commits/${pr.headRefOid}/check-runs`).check_runs, pr.headRefOid);
  if (!verdict.ok) throw new Error(verdict.why);
  const tree = mergeTree(pr);
  mainMoved(pr, verdict.suite, checked);
  // `sha` is the API's --match-head-commit: a push after these checks fails the merge rather than landing untested
  const merged = api(`pulls/${pr.number}/merge`, '--method', 'PUT', '-f', 'merge_method=squash',
    '-f', `sha=${pr.headRefOid}`, '-f', `commit_title=${pr.title} (#${pr.number})`);
  run('gh', ['api', '--method', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${pr.headRefName}`]);
  git('fetch', '--quiet', 'origin', pr.baseRefName);
  const landed = git('rev-parse', `origin/${pr.baseRefName}^{tree}`);
  console.log(`merged #${pr.number} as ${merged.sha.slice(0, 7)}, branch ${pr.headRefName} deleted`);
  if (landed !== tree) throw new Error(`origin/${pr.baseRefName}'s tree ${landed} is not the checked merge tree ${tree}`);
  console.log(`origin/${pr.baseRefName}'s tree is the checked merge tree`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [number, ...flags] = process.argv.slice(2);
  if (!/^\d+$/.test(number || '') || flags.some(f => f !== '--main-moved-checked')) {
    console.error('usage: node scripts/merge.mjs <pr> [--main-moved-checked]');
    process.exit(2);
  }
  try {
    merge(number, flags.includes('--main-moved-checked'));
  } catch (e) {
    console.error(`merge: ${e.message}`);
    process.exit(1);
  }
}
