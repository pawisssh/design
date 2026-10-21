// Stdin-JSON tests of the gh pr create review gate: run with `node --test .claude/hooks/test/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('../pr-review-gate.mjs', import.meta.url).pathname;
const SNIPPET_HOOKS = JSON.parse(readFileSync(new URL('../settings.snippet.json', import.meta.url), 'utf8')).hooks;

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

// A project with one commit, and a second checkout of it in `other` on its own commit.
function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pr-gate-')));
  const commit = (dir, msg) => { git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', msg); return git(dir, 'rev-parse', 'HEAD'); };
  git(root, 'init', '-q');
  const head = commit(root, 'one');
  const other = join(root, 'other');
  git(root, 'worktree', 'add', '-q', '-b', 'side', other);
  const side = commit(other, 'two');
  return { root, head, other, side, commit: () => commit(root, 'more') };
}

function runHook(root, command, { cwd = root, stdin } = {}) {
  const run = spawnSync('node', [HOOK], {
    input: stdin ?? JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  return { ...run, out: run.stdout ? JSON.parse(run.stdout).hookSpecificOutput : null };
}

test('the first gh pr create from a commit is refused, naming the commit; the retry passes', () => {
  const { root, head } = project();
  const first = runHook(root, 'gh pr create --title t --body b');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.out.permissionDecision, 'deny');
  assert.match(first.out.permissionDecisionReason, new RegExp(`/code-review runs against origin/main on the commit it opens from \\(${head}\\)`));
  const retry = runHook(root, 'gh pr create --title t --body b');
  assert.equal(retry.stdout, '');
});

test('a new commit is refused again', () => {
  const { root, commit } = project();
  runHook(root, 'gh pr create');
  const sha = commit();
  const run = runHook(root, 'gh pr create');
  assert.equal(run.out.permissionDecision, 'deny');
  assert.match(run.out.permissionDecisionReason, new RegExp(sha));
});

test('the commit is the one the command opens the PR from: a cd before gh, or --head', () => {
  const { root, head, other, side } = project();
  for (const [command, sha] of [
    [`cd ${other} && gh pr create --fill`, side],
    [`cd "${other}"; gh pr create`, side],
    [`cd ${other} && git push && cd ${root} && gh pr create`, head],
    ['gh pr create --head side', side],
    ['gh pr create --head=owner:side', side],
    ['gh pr create -H side', side],
  ]) {
    const run = runHook(mkdtempSync(join(tmpdir(), 'pr-gate-seen-')), command, { cwd: root });
    assert.equal(run.out?.permissionDecision, 'deny', command);
    assert.match(run.out.permissionDecisionReason, new RegExp(`\\(${sha}\\)`), command);
  }
});

test('gh pr create only where a command starts is gated', () => {
  const { root } = project();
  for (const command of ['git push && gh pr create', 'true; gh pr create', 'false || gh pr create', '(gh pr create)', 'ls\ngh pr create']) {
    const run = runHook(mkdtempSync(join(tmpdir(), 'pr-gate-seen-')), command, { cwd: root });
    assert.equal(run.out?.permissionDecision, 'deny', command);
  }
  for (const command of ['gh pr view', 'gh pr list', "grep -n 'gh pr create' notes.md", 'git commit -m "gate gh pr create"', 'echo gh pr create']) {
    const run = runHook(root, command);
    assert.equal(run.status, 0, command);
    assert.equal(run.stdout, '', command);
  }
});

test('anything the gate cannot read passes the call through, silently', () => {
  const { root } = project();
  const notGit = realpathSync(mkdtempSync(join(tmpdir(), 'pr-gate-nogit-')));
  mkdirSync(join(notGit, 'x'));
  for (const run of [
    runHook(root, '', { stdin: 'not json' }),
    runHook(root, '', { stdin: JSON.stringify({ tool_input: {} }) }),
    runHook(notGit, 'gh pr create', { cwd: notGit }),
    runHook(root, 'gh pr create --head no-such-branch'),
  ]) {
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '');
  }
});

test('the settings snippet runs the gate on Bash, and a failed run does not block the call', () => {
  const [entry] = SNIPPET_HOOKS.PreToolUse.filter(e => e.hooks.some(h => h.args?.some(a => a.endsWith('/pr-review-gate.mjs'))));
  assert.equal(entry.matcher, 'Bash');
  assert.deepEqual(entry.hooks, [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/pr-review-gate.mjs'], timeout: 5 }]);
});
