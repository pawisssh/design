#!/usr/bin/env node
// PreToolUse hook for mcp__*__use_figma (To-design package delivery, pawisssh/design#25).
// Swaps the packager's fail-closed stub `/*@package <path> sha256=<hex>*/ throw new Error("package not injected");`
// for the verified package file via updatedInput, so the agent never re-types the package.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_CODE = 50000; // use_figma's code limit
const STUB = /^\s*\/\*@package (\S+) sha256=([0-9a-f]{64})\*\/\s*throw new Error\("package not injected"\);?\s*$/;

// Exit 2 blocks the call; Claude Code shows the one-line stderr reason to the agent.
const fail = reason => { process.stderr.write(`use_figma package hook: ${reason}\n`); process.exit(2); };

const startedAt = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
const toolInput = input.tool_input || {};
const code = typeof toolInput.code === 'string' ? toolInput.code : '';
if (!code.includes('/*@package')) process.exit(0);

// Any code carrying the marker is a package call: it must be exactly the stub, or it is blocked.
const stub = code.match(STUB);
if (!stub) fail('code contains /*@package but is not exactly the stub; send only the stub line the packager printed');
const [, relPath, expected] = stub;

// Resolve symlinks on both sides so a link can't point the hook outside the project.
let root, file;
try {
  root = realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  file = realpathSync(resolve(root, relPath));
} catch (e) { fail(`cannot resolve ${relPath}: ${e.code || e.message}`); }
const rel = relative(root, file);
if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`package path escapes the project: ${relPath}`);

let bytes, manifest;
try { bytes = readFileSync(file); } catch (e) { fail(`cannot read ${relPath}: ${e.code || e.message}`); }
const actual = createHash('sha256').update(bytes).digest('hex');
if (actual !== expected) fail(`sha256 mismatch for ${relPath}: stub ${expected}, file ${actual}; re-run the packager and send its new stub`);
try { manifest = JSON.parse(readFileSync(join(dirname(file), 'script-package.json'), 'utf8')); } catch (e) { fail(`cannot read script-package.json next to ${relPath}: ${e.code || e.message}`); }
if (manifest?.fileSha256 !== actual) fail(`script-package.json fileSha256 ${manifest?.fileSha256} does not match ${relPath} (${actual})`);
const text = bytes.toString('utf8');
if (text.length > MAX_CODE) fail(`package is ${text.length} chars, over the ${MAX_CODE} use_figma limit`);

// One line per expansion in gitignored scratch; a failed write never blocks the call.
const record = { at: new Date().toISOString(), toolUseId: input.tool_use_id, tool: input.tool_name, stubLen: code.length, packageLen: text.length, sha256: actual, path: rel.split(sep).join('/'), ms: Date.now() - startedAt };
try {
  const logDir = join(root, '.scratch', 'to-design');
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, 'use-figma-package.log'), JSON.stringify(record) + '\n');
} catch {}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    // "allow": use_figma does not appear to carry anthropic/requiresUserInteraction (#16); if it does, Claude Code prompts anyway.
    permissionDecision: 'allow',
    permissionDecisionReason: `@package ${record.path} sha256=${actual.slice(0, 12)} expanded to ${text.length} chars`,
    updatedInput: { ...toolInput, code: text },
  },
}));
