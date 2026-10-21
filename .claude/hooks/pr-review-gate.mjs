// A PreToolUse Bash hook: the first `gh pr create` from a commit is refused until the agent confirms /code-review ran
// on it. Four PRs (#193, #194, #200, #203) were opened without the review the repo asks for before every PR.
// The retry from the same commit passes; a fix commit changes the sha, so the gate asks again.
// Every Bash call runs it, so anything unexpected passes the call through rather than blocking it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// `gh pr create` where a command starts: the string's start, or after &&, ||, ;, |, ( or a newline.
const PR_CREATE = /(?:^|&&|\|\||[;|(\n])\s*gh\s+pr\s+create\b/;

// The checkout the PR is opened from: the last `cd <path>` before gh, else the session's cwd.
function checkoutOf(command, cwd) {
  const before = command.slice(0, command.search(PR_CREATE));
  const cds = [...before.matchAll(/(?:^|&&|;|\n)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g)];
  if (!cds.length) return cwd;
  return resolve(cwd, cds.at(-1)[1].replace(/^(["'])(.*)\1$/, '$2'));
}

// The commit the PR is opened from: gh's --head <ref> (an `owner:` prefix dropped), else the checkout's HEAD.
function headOf(command, dir) {
  const ref = command.slice(command.search(PR_CREATE)).match(/\s(?:--head|-H)(?:=|\s+)("[^"]+"|'[^']+'|\S+)/)?.[1].replace(/^(["'])(.*)\1$/, '$2').replace(/^[^:]+:/, '') || 'HEAD';
  return execFileSync('git', ['-C', dir, 'rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !PR_CREATE.test(command)) process.exit(0);
  const cwd = input.cwd || process.cwd();
  const sha = headOf(command, checkoutOf(command, cwd));
  const seen = join(realpathSync(process.env.CLAUDE_PROJECT_DIR || cwd), '.scratch', 'pr-review-gate');
  if (existsSync(join(seen, sha))) process.exit(0);
  mkdirSync(seen, { recursive: true });
  writeFileSync(join(seen, sha), `${new Date().toISOString()}\n`);
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Before a PR, /code-review runs against origin/main on the commit it opens from (${sha}) and what it finds is fixed. If that is done for ${sha.slice(0, 12)}, run the same command again; it passes. If the fixes add a commit, the gate asks again for the new one.`,
    },
  }));
} catch {
  process.exit(0);
}
