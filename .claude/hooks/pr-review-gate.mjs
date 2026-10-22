// A PreToolUse Bash hook that asks for /code-review before a PR, which PRs had been opened without: the first
// `gh pr create` from a commit is refused, naming the commit. It is a speed bump, not proof that a review ran.
// Registering it is the owner's step: they add the entry of settings.snippet.json to the PreToolUse list of the
// project's .claude/settings.json, beside the use_figma one. Agents never edit settings.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Where a command starts: the string's start, after a separator or an opening ( or {, or after then/do/else.
const START = String.raw`(?:^|&&?|\|\|?|[;({\n]|\b(?:then|do|else)\s)\s*`;
// gh pr create (or its alias pr new) where a command starts, after any VAR=value, env or timeout prefix, a path to
// gh, or gh's -R/--repo.
const PR_CREATE = new RegExp(`${START}(?:\\w+=\\S*\\s+|(?:env|command)\\s+|timeout\\s+\\S+\\s+)*(?:\\S*/)?gh(?:\\s+(?:-R|--repo)(?:=|\\s+)\\S+)*\\s+pr\\s+(?:create|new)\\b`);
const CD = new RegExp(`${START}cd\\s+("[^"]*"|'[^']*'|[^\\s;&|)]+)`, 'g');

const unquote = s => s.replace(/^(["'])(.*)\1$/, '$2');
// The command with every quoted string's inside blanked to spaces, so text in quotes is never read as a command;
// offsets match the original.
const masked = command => command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, q => q[0] + ' '.repeat(q.length - 2) + q[0]);
// The original text of a match's last group, found in the masked command.
const group = (command, offset, m) => {
  const end = offset + m.index + m[0].length;
  return unquote(command.slice(end - m[1].length, end));
};

// The checkout the PR is opened from: the last `cd <path>` before gh, else the session's cwd.
function checkoutOf(command, mask, at, cwd) {
  const last = [...mask.slice(0, at).matchAll(CD)].at(-1);
  return last ? resolve(cwd, group(command, 0, last).replace(/^~(?=\/|$)/, homedir())) : cwd;
}

// The commit the PR is opened from: gh's own --head/-H <ref> (an `owner:` prefix dropped), else the checkout's HEAD.
function headOf(command, mask, at, dir) {
  const flag = mask.slice(at).match(/^[^;&|\n]*/)[0].match(/\s(?:--head|-H)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/);
  const ref = flag ? group(command, at, flag).replace(/^[^:]+:/, '') : 'HEAD';
  return execFileSync('git', ['-C', dir, 'rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Every Bash call runs this hook: anything it cannot read or resolve passes the call through rather than blocking it.
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);
  const mask = masked(command);
  const at = mask.search(PR_CREATE);
  if (at < 0) process.exit(0);
  const cwd = input.cwd || process.cwd();
  const sha = headOf(command, mask, at, checkoutOf(command, mask, at, cwd));
  // The retry from the same commit passes. A fix commit changes the sha, so the gate asks again for the new one.
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
