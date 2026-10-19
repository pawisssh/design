#!/usr/bin/env node
// PreToolUse hook for mcp__*__use_figma (To-design package delivery, pawisssh/design#25).
// Swaps the packager's fail-closed stub `/*@package <path> sha256=<hex>*/ throw new Error("package not injected");`
// for the verified package file via updatedInput, so the agent never re-types the package.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { appendLog, MARKER, PACKAGE_LOG, projectRoot, readInput, STUB, within } from './lib.mjs';

const MAX_CODE = 50000; // use_figma's code limit

// Exit 2 blocks the call; Claude Code shows the one-line stderr reason to the agent.
const fail = reason => { process.stderr.write(`use_figma package hook: ${reason}\n`); process.exit(2); };

const startedAt = Date.now();
const input = readInput();
const toolInput = input.tool_input || {};
const code = typeof toolInput.code === 'string' ? toolInput.code : '';
if (!code.includes(MARKER)) process.exit(0);

// Any code carrying the marker is a package call: it must be exactly the stub, or it is blocked.
const stub = code.match(STUB);
if (!stub) fail('code contains /*@package but is not exactly the stub; send only the stub line the packager printed');
const [, relPath, expected] = stub;

// Resolve symlinks on both sides so a link can't point the hook outside the project.
let root, file;
try {
  root = projectRoot(input);
  file = realpathSync(resolve(root, relPath));
} catch (e) { fail(`cannot resolve ${relPath}: ${e.code || e.message}`); }
const rel = within(root, file);
if (!rel) fail(`package path escapes the project: ${relPath}`);

let bytes, manifest;
try { bytes = readFileSync(file); } catch (e) { fail(`cannot read ${relPath}: ${e.code || e.message}`); }
const actual = createHash('sha256').update(bytes).digest('hex');
if (actual !== expected) fail(`sha256 mismatch for ${relPath}: stub ${expected}, file ${actual}; re-run the packager and send its new stub`);
try { manifest = JSON.parse(readFileSync(join(dirname(file), 'script-package.json'), 'utf8')); } catch (e) { fail(`cannot read script-package.json next to ${relPath}: ${e.code || e.message}`); }
if (manifest?.fileSha256 !== actual) fail(`script-package.json fileSha256 ${manifest?.fileSha256} does not match ${relPath} (${actual})`);
const text = bytes.toString('utf8');
if (text.length > MAX_CODE) fail(`package is ${text.length} chars, over the ${MAX_CODE} use_figma limit`);

// One line per expansion; the result hook finds a swapped call's package by its toolUseId here.
const record = { at: new Date().toISOString(), toolUseId: input.tool_use_id, tool: input.tool_name, stubLen: code.length, packageLen: text.length, sha256: actual, path: rel.split(sep).join('/'), ms: Date.now() - startedAt };
appendLog(root, PACKAGE_LOG, record);

// This hook and its settings load from the main checkout, so a checkout behind its upstream on them runs an old
// hook. Local refs only (no fetch, the hook has 10s); any git failure skips the warning and never blocks the call.
let behind = 0;
try {
  const r = spawnSync('git', ['rev-list', '--count', 'HEAD..@{upstream}', '--', ':/skills/to-design/hooks', ':/.claude/settings.json'], { cwd: root, encoding: 'utf8', timeout: 2000 });
  if (r.status === 0) behind = Number(r.stdout.trim()) || 0;
} catch {}
const stale = behind
  ? `the main checkout ${root} is ${behind} commit(s) behind its upstream on the use_figma hook or .claude/settings.json`
  : null;

process.stdout.write(JSON.stringify({
  ...(stale && { systemMessage: `To-design: ${stale}; pull it and start a new session.` }),
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    // "allow": use_figma does not appear to carry anthropic/requiresUserInteraction (#16); if it does, Claude Code prompts anyway.
    permissionDecision: 'allow',
    permissionDecisionReason: `@package ${record.path} sha256=${actual.slice(0, 12)} expanded to ${text.length} chars`,
    updatedInput: { ...toolInput, code: text },
    ...(stale && { additionalContext: `This package was swapped by a stale hook: ${stale}. Tell the owner to pull the main checkout and start a new session.` }),
  },
}));
