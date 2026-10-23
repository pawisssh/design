#!/usr/bin/env node
// Squash-merges a pull request and deletes its branch once its `test` run passed and its merge tree is checked.
//
//   node scripts/merge.mjs <pr> [--head <sha>]   merge if `test` passed on the head, and if main moved since, the
//                                                 tests of both sides pass on the merge tree
//     --head <sha>   the head you reviewed: refuse if the branch has moved past it
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Whether the latest `test` check run on the head passed, from `gh api .../commits/<sha>/check-runs`'s check_runs.
 * -> {ok, why} or {ok, suite}, the run's check suite id
 */
export function testVerdict(runs, sha) {
  const [latest] = runs.filter(r => r.name === 'test').sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!latest) return { ok: false, why: `no \`test\` run on ${sha}` };
  if (latest.status !== 'completed') return { ok: false, why: `\`test\` is ${latest.status} on ${sha}` };
  if (latest.conclusion !== 'success') return { ok: false, why: `\`test\` ended ${latest.conclusion} on ${sha}` };
  return { ok: true, suite: latest.check_suite.id };
}

/** The top-level areas a list of paths touches: `skills/<name>`, or the first folder, or the file at the root. */
export const areas = paths => [...new Set(paths.map(p => {
  const [a, b] = p.split('/');
  return a === 'skills' && b ? `skills/${b}` : a;
}))].sort();

const TEST_FILE = /^(skills\/[^/]+\/tests?|\.github\/test)\/[^/]+\.test\.mjs$/;
// The tests an area's change can break: a skill's own, `.github/test` for the CI scripts, every suite for package.json.
// Data and docs (design-systems/, docs/) have none of their own: the skills' tests that read them are run with the
// other side's (#373: #372's re-signed Handoff, read by the to-handoff tests #371 changed).
const suiteOf = path => {
  const [a, b] = path.split('/');
  if (a === 'skills' && b) return `skills/${b}/`;
  if (a === 'scripts' || a === '.github') return '.github/test/';
  return path === 'package.json' ? '' : null;
};

/** The test files, of a tree's `files`, a moved main runs on the merge tree: those of every area either side touches. */
export function sharedTests(theirs, ours, files) {
  const suites = [...theirs, ...ours].map(suiteOf).filter(s => s !== null);
  return files.filter(f => TEST_FILE.test(f) && suites.some(s => f.startsWith(s))).sort();
}

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

// The pinned tools CI keeps in .scratch (.github/workflows/test.yml): without them, the tests that need them skip.
const PINNED = ['adapter-carbon', 'adapter-generic', 'to-handoff'];

// Runs `files` in a scratch worktree of the merge tree, with this checkout's pinned tools cloned in (`cp -c` clones on
// APFS, so 1.5 GB costs nothing); a failure or a skip refuses the merge.
function runOnTree(pr, tree, files) {
  const commit = git('commit-tree', tree, '-p', `origin/${pr.baseRefName}`, '-m', `#${pr.number}'s merge tree`);
  const dir = mkdtempSync(join(tmpdir(), `merge-${pr.number}-`));
  try {
    git('worktree', 'add', '--quiet', '--detach', dir, commit);
    const root = git('rev-parse', '--show-toplevel');
    mkdirSync(join(dir, '.scratch'), { recursive: true });
    for (const d of PINNED) {
      if (existsSync(join(root, '.scratch', d))) execFileSync('cp', ['-Rc', join(root, '.scratch', d), join(dir, '.scratch', d)]);
    }
    console.log(`  running ${files.length} test file(s) on the merge tree`);
    // --test-concurrency=4 as npm test: at the default, the shadcn Next-build runtime test times out
    const { NODE_OPTIONS, ...env } = process.env;
    const run = spawnSync(process.execPath, ['--test', '--test-concurrency=4', '--test-reporter=spec', ...files],
      { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 28 });
    const lines = run.stdout.split('\n');
    const summary = lines.filter(l => /^ℹ (tests|pass|fail|skipped) /.test(l));
    console.log(summary.map(l => `  ${l}`).join('\n'));
    const skipped = Number(summary.find(l => l.startsWith('ℹ skipped '))?.split(' ')[2]);
    if (run.status !== 0) {
      const failed = lines.filter(l => /^\s*✖/.test(l)).slice(0, 20).join('\n');
      throw new Error(`the tests failed on the merge tree: merge main into the branch and wait for a fresh \`test\` run\n${failed}`);
    }
    if (skipped !== 0) throw new Error(`${skipped} test(s) skipped on the merge tree: run the setup scripts in CLAUDE.md here first`);
  } finally {
    try { git('worktree', 'remove', '--force', dir); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

// A pull_request run checks out refs/pull/<n>/merge, the merge with main as main stood when the run was triggered
// (GitHub docs, "Events that trigger workflows": pull_request), so as of its check suite's creation. A commit on
// main since then is in no tested tree, so the tests of both sides run on the merge tree: a file one side changes can
// be read by the other's tests with no import between them.
function mainMoved(pr, suite, tree) {
  const since = api(`check-suites/${suite}`).created_at;
  const commits = git('rev-list', `--since=${since}`, `origin/${pr.baseRefName}`).split('\n').filter(Boolean);
  if (!commits.length) return;
  const theirs = commits.flatMap(c => git('diff-tree', '--no-commit-id', '--name-only', '-r', c).split('\n'));
  const ours = git('diff', '--name-only', `origin/${pr.baseRefName}...${pr.headRefOid}`).split('\n');
  console.log(`origin/${pr.baseRefName} moved since #${pr.number}'s \`test\` run (${since}): ${commits.length} commit(s)`);
  console.log(`  they touch: ${areas(theirs).join(', ')}`);
  console.log(`  #${pr.number} touches: ${areas(ours).join(', ')}`);
  const files = sharedTests(theirs, ours, git('ls-tree', '-r', '--name-only', tree).split('\n'));
  if (files.length) runOnTree(pr, tree, files);
  else console.log('  neither side has tests of its own');
}

// pawisssh/design is a private repository on GitHub Free, where branch protection is not available (GitHub docs,
// "About protected branches"), so no required check holds main: this script makes the one a required `test` status
// would, the self-hosted runner's run from #275.
function merge(number, { head }) {
  const pr = JSON.parse(exec('gh', ['pr', 'view', number, '--json', 'number,title,state,isDraft,headRefName,headRefOid,baseRefName']));
  if (pr.state !== 'OPEN' || pr.isDraft) throw new Error(`#${pr.number} is ${pr.isDraft ? 'a draft' : pr.state.toLowerCase()}`);
  if (head && !pr.headRefOid.startsWith(head)) throw new Error(`#${pr.number}'s head is ${pr.headRefOid}, not the reviewed ${head}`);
  const verdict = testVerdict(api(`commits/${pr.headRefOid}/check-runs`).check_runs, pr.headRefOid);
  if (!verdict.ok) throw new Error(verdict.why);
  const tree = mergeTree(pr);
  mainMoved(pr, verdict.suite, tree);
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
  const opts = { head: null };
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--head' && /^[0-9a-f]{7,40}$/.test(flags[i + 1] || '')) opts.head = flags[++i];
    else opts.bad = true;
  }
  if (!/^\d+$/.test(number || '') || opts.bad) {
    console.error('usage: node scripts/merge.mjs <pr> [--head <sha>]');
    process.exit(2);
  }
  try {
    merge(number, opts);
  } catch (e) {
    console.error(`merge: ${e.message}`);
    process.exit(1);
  }
}
