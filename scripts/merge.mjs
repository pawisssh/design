#!/usr/bin/env node
// Squash-merges a pull request and deletes its branch once its `test` run passed and its merge tree is checked.
//
//   node scripts/merge.mjs <pr> [--head <sha> [--wait]] [--dry-run]   merge if `test` passed on the head, and if main
//                                                                      moved since, the tests of both sides pass on
//                                                                      the merge tree
//     --head <sha>   the head you reviewed: refuse if the branch has moved past it
//     --wait         with --head: wait for a missing or running `test` run to finish, then merge or refuse
//     --dry-run      every check, the merge-tree tests included, and no merge
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

const repoFile = path => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

// npm test's globs (package.json), read rather than copied (#376); they use only `*`, one folder name or file name each
const TEST_GLOBS = JSON.parse(repoFile('package.json')).scripts.test.split(' ').filter(w => w.endsWith('.test.mjs'))
  .map(g => new RegExp(`^${g.replaceAll('.', '\\.').replaceAll('*', '[^/]+')}$`));
export const isTestFile = path => TEST_GLOBS.some(g => g.test(path));
// The folder whose tests an area's change can break: a skill's own, `.github/test` for the CI scripts, all of them
// ('') for package.json. Data and docs (design-systems/, docs/) have none of their own: the skills' tests that read
// them are run with the other side's (#373: #372's re-signed Handoff, read by the to-handoff tests #371 changed).
const suiteOf = area => {
  if (area.startsWith('skills/')) return `${area}/`;
  if (area === 'scripts' || area === '.github') return '.github/test/';
  return area === 'package.json' ? '' : null;
};

/**
 * The test files, of a tree's `files`, a moved main runs on the merge tree: those of every area either side touches,
 * and of every skill that `readers` says reads a touched skill's files (vibe-to-figma's tests read to-handoff's fixtures).
 */
export function mergeTreeTests(theirs, ours, files, readers = {}) {
  const suites = areas([...theirs, ...ours]).flatMap(a => [a, ...(readers[a] || [])]).map(suiteOf).filter(s => s !== null);
  return files.filter(f => isTestFile(f) && suites.some(s => f.startsWith(s))).sort();
}

/** Whether a `node --test --test-reporter=spec` run passed with nothing skipped, from its exit status and stdout. */
export function runVerdict(status, stdout) {
  const lines = stdout.split('\n');
  if (status !== 0) {
    const failed = lines.filter(l => /^\s*✖/.test(l)).slice(0, 20).join('\n');
    return { ok: false, why: `the tests failed on the merge tree: merge main into the branch and wait for a fresh \`test\` run\n${failed}` };
  }
  const skipped = lines.find(l => l.startsWith('ℹ skipped '));
  if (!skipped) return { ok: false, why: 'the test run printed no summary' };
  if (skipped !== 'ℹ skipped 0') {
    return { ok: false, why: `${skipped.split(' ')[2]} test(s) skipped on the merge tree: run the setup scripts in CLAUDE.md here first` };
  }
  return { ok: true };
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

// The pinned tools CI keeps in .scratch, read from its clean step's `! -name`s (.github/workflows/test.yml, #376):
// without them, the tests that need them skip.
export const PINNED = [...repoFile('.github/workflows/test.yml').matchAll(/! -name (\S+)/g)].map(m => m[1]);

// Runs `files` in a scratch worktree of the merge tree, with this checkout's pinned tools cloned in (macOS cp(1): `-c`
// copies with clonefile(2), so 1.5 GB on APFS costs nothing); a failure or a skip refuses the merge. The worktree sits
// in the main working tree's .scratch, not $TMPDIR: To-design's packager writes packages only inside the main working
// tree, so a worktree outside it skips Vibe-to-Figma's packaging test (#416).
function runOnTree(pr, tree, files) {
  const commit = git('commit-tree', tree, '-p', `origin/${pr.baseRefName}`, '-m', `#${pr.number}'s merge tree`);
  const parent = join(resolve(git('rev-parse', '--path-format=absolute', '--git-common-dir'), '..'), '.scratch');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, `merge-${pr.number}-`));
  try {
    git('worktree', 'add', '--quiet', '--detach', dir, commit);
    const root = git('rev-parse', '--show-toplevel');
    mkdirSync(join(dir, '.scratch'), { recursive: true });
    for (const d of PINNED) {
      if (existsSync(join(root, '.scratch', d))) execFileSync('cp', ['-Rc', join(root, '.scratch', d), join(dir, '.scratch', d)]);
    }
    console.log(`  running ${files.length} test file(s) on the merge tree`);
    // the concurrency of npm test, whose default of 4 keeps the shadcn runtime test from timing out (#247)
    const { NODE_OPTIONS, ...env } = process.env;
    const run = spawnSync(process.execPath, [`--test-concurrency=${env.TEST_CONCURRENCY || 4}`, '--test', '--test-reporter=spec', ...files],
      { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 28 });
    console.log(run.stdout.split('\n').filter(l => /^ℹ (tests|pass|fail|skipped) /.test(l)).map(l => `  ${l}`).join('\n'));
    const verdict = runVerdict(run.status, run.stdout);
    if (!verdict.ok) throw new Error(verdict.why);
  } finally {
    // a worktree that failed to be added has nothing to remove; rmSync takes the folder either way
    try { git('worktree', 'remove', '--force', dir); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

// For each touched skill, the other skills whose code or tests name a path in it (`../to-handoff/`), on the merge tree.
function readersOf(tree, touched) {
  return Object.fromEntries(touched.filter(a => a.startsWith('skills/')).map(a => {
    let hits = '';
    try { hits = git('grep', '-l', '-F', `/${a.slice(7)}/`, tree, '--', ':(glob)skills/**/*.mjs'); } catch {} // exit 1: no match
    return [a, areas(hits.split('\n').filter(Boolean).map(h => h.slice(tree.length + 1))).filter(r => r !== a)];
  }));
}

// A pull_request run checks out refs/pull/<n>/merge, the merge with main as main stood when the run was triggered
// (GitHub docs, "Events that trigger workflows": pull_request), so as of its check suite's creation. A commit on
// main since then is in no tested tree, so the tests of both sides run on the merge tree: a file one side changes can
// be read by the other's tests with no import between them.
function mainMoved(pr, suite, tree) {
  const since = api(`check-suites/${suite}`).created_at;
  const commits = git('rev-list', `--since=${since}`, `origin/${pr.baseRefName}`).split('\n').filter(Boolean);
  if (!commits.length) return console.log(`origin/${pr.baseRefName} has not moved since #${pr.number}'s \`test\` run: no merge-tree tests`);
  const theirs = commits.flatMap(c => git('diff-tree', '--no-commit-id', '--name-only', '-r', c).split('\n'));
  const ours = git('diff', '--name-only', `origin/${pr.baseRefName}...${pr.headRefOid}`).split('\n');
  console.log(`origin/${pr.baseRefName} moved since #${pr.number}'s \`test\` run (${since}): ${commits.length} commit(s)`);
  console.log(`  they touch: ${areas(theirs).join(', ')}`);
  console.log(`  #${pr.number} touches: ${areas(ours).join(', ')}`);
  const files = mergeTreeTests(theirs, ours, git('ls-tree', '-r', '--name-only', tree).split('\n'), readersOf(tree, areas([...theirs, ...ours])));
  if (files.length) runOnTree(pr, tree, files);
  else console.log('  neither side has tests of its own');
}

// pawisssh/design is a private repository on GitHub Free, where branch protection is not available (GitHub docs,
// "About protected branches"), so no required check holds main: this script makes the one a required `test` status
// would, the self-hosted runner's run from #275.
function merge(number, { head, wait, dryRun }) {
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
  const minutes = Number(repoFile('.github/workflows/test.yml').match(/timeout-minutes: (\d+)/)[1]);
  for (const until = Date.now() + minutes * 60_000; wait && verdict.pending && Date.now() < until; read()) {
    console.log(`waiting: ${verdict.why}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
  if (wait && verdict.pending) throw new Error(`gave up after ${minutes} minutes: ${verdict.why}`);
  if (!verdict.ok) throw new Error(verdict.why);
  const tree = mergeTree(pr);
  mainMoved(pr, verdict.suite, tree);
  if (dryRun) {
    console.log(`dry run: #${pr.number} would merge as tree ${tree}`);
    return;
  }
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
  const opts = { head: null, wait: false, dryRun: false };
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--wait') opts.wait = true;
    else if (flags[i] === '--dry-run') opts.dryRun = true;
    else if (flags[i] === '--head' && /^[0-9a-f]{7,40}$/.test(flags[i + 1] || '')) opts.head = flags[++i];
    else opts.bad = true;
  }
  if (!/^\d+$/.test(number || '') || opts.bad || (opts.wait && !opts.head)) {
    console.error('usage: node scripts/merge.mjs <pr> [--head <sha> [--wait]] [--dry-run]');
    process.exit(2);
  }
  try {
    merge(number, opts);
  } catch (e) {
    console.error(`merge: ${e.message}`);
    process.exit(1);
  }
}
