#!/usr/bin/env node
// PreToolUse hook for mcp__*__use_figma (spike, pawisssh/design#16).
// Expands a fail-closed stub `/*@package <path> sha256=<hex>*/ throw ...` into the verified package file
// via updatedInput, so the model never re-types the package. Calls without the marker pass through untouched.
// Any failure on a marked call exits 2 (Claude sees the reason); settings set onFailure: "block" for crashes.
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';

const MAX_CODE = 50000;
const STUB = /^\s*\/\*@package (\S+) sha256=([0-9a-f]{64})\*\/\s*throw new Error\("package not injected"\);?\s*$/;

const fail = reason => { process.stderr.write(`use_figma package hook: ${reason}\n`); process.exit(2); };

const t0 = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
const toolInput = input.tool_input || {};
const code = typeof toolInput.code === 'string' ? toolInput.code : '';
if (!code.trimStart().startsWith('/*@package')) process.exit(0);

const m = code.match(STUB);
if (!m) fail('code starts with /*@package but is not exactly the stub; send only the stub line the packager printed');
const [, relPath, expected] = m;

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const file = resolve(root, relPath);
const rel = relative(root, file);
if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail(`package path escapes the project: ${relPath}`);

let bytes, meta;
try { bytes = readFileSync(file); } catch (e) { fail(`cannot read ${relPath}: ${e.code || e.message}`); }
const actual = createHash('sha256').update(bytes).digest('hex');
if (actual !== expected) fail(`sha256 mismatch for ${relPath}: stub ${expected}, file ${actual}`);
try { meta = JSON.parse(readFileSync(join(dirname(file), 'script-package.json'), 'utf8')); } catch (e) { fail(`cannot read script-package.json next to ${relPath}: ${e.code || e.message}`); }
if (meta.fileSha256 !== actual) fail(`script-package.json fileSha256 ${meta.fileSha256} does not match ${relPath} (${actual})`);
const text = bytes.toString('utf8');
if (text.length > MAX_CODE) fail(`package is ${text.length} chars, over the ${MAX_CODE} use_figma limit`);

const record = { at: new Date().toISOString(), toolUseId: input.tool_use_id, tool: input.tool_name, stubLen: code.length, packageLen: text.length, sha256: actual, path: rel, ms: Date.now() - t0 };
try { appendFileSync(join(root, '.claude', 'hooks', 'use-figma-package.log'), JSON.stringify(record) + '\n'); } catch {}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    // "allow": use_figma does not appear to carry anthropic/requiresUserInteraction (see #16); with it, Claude Code would prompt anyway.
    permissionDecision: 'allow',
    permissionDecisionReason: `@package ${rel} sha256=${actual.slice(0, 12)} expanded to ${text.length} chars`,
    updatedInput: { ...toolInput, code: text },
  },
}));
