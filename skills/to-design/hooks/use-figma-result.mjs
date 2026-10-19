#!/usr/bin/env node
// PostToolUse hook for mcp__*__use_figma: saves a package call's JSON result as result.json beside its package, the
// path every call cycle records from, so the agent never re-types a result or digs it out of the transcript.
// The package is the stub's path, or, when the hook sees the swapped code, the one use-figma-package.mjs logged for
// this tool_use_id. It writes only into a package folder (one holding script-package.json) inside the project, and
// only a result that parses as JSON. It never blocks: whatever it cannot save, it says so and exits 0.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const STUB = /^\s*\/\*@package (\S+) sha256=[0-9a-f]{64}\*\//;

const say = (text, saved) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `use_figma result hook: ${text}` } }));
  if (saved) log(saved);
  process.exit(0);
};

let input, root;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
  root = realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
} catch { process.exit(0); }
const code = typeof input.tool_input?.code === 'string' ? input.tool_input.code : '';
const logDir = join(root, '.scratch', 'to-design');
const log = record => { try { mkdirSync(logDir, { recursive: true }); appendFileSync(join(logDir, 'use-figma-result.log'), JSON.stringify(record) + '\n'); } catch {} };

// The package's path, relative to the project: from the stub, else from the package hook's log of this call.
function packagePath() {
  const stub = code.match(STUB);
  if (stub) return stub[1];
  if (!input.tool_use_id) return null;
  let lines;
  try { lines = readFileSync(join(logDir, 'use-figma-package.log'), 'utf8').trim().split('\n'); } catch { return null; }
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const r = JSON.parse(lines[i]); if (r.toolUseId === input.tool_use_id) return r.path; } catch {}
  }
  return null;
}

// The call's text: an MCP result is a list of content blocks, bare or under `content`.
function responseText(r) {
  if (typeof r === 'string') return r;
  const blocks = Array.isArray(r) ? r : Array.isArray(r?.content) ? r.content : null;
  if (blocks) return blocks.filter(b => b && b.type === 'text').map(b => b.text).join('');
  return r == null ? '' : JSON.stringify(r);
}

const relPath = packagePath();
if (!relPath) process.exit(0); // not a package call: nothing to save
let dir;
try { dir = realpathSync(dirname(resolve(root, relPath))); } catch { say(`cannot resolve the package folder of ${relPath}; save the result yourself`); }
const rel = relative(root, dir);
if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) say(`package folder escapes the project: ${relPath}; nothing saved`);
if (!existsSync(join(dir, 'script-package.json'))) say(`${relPath} is in no package folder (no script-package.json); nothing saved`);
const text = responseText(input.tool_response);
try { JSON.parse(text); } catch { say(`the result is not JSON (${text.slice(0, 120).replace(/\s+/g, ' ')}); nothing saved`); }
const out = join(dir, 'result.json');
try { writeFileSync(out, text); } catch (e) { say(`cannot write ${relative(root, out)}: ${e.code || e.message}; save the result yourself`); }
const saved = relative(root, out).split(sep).join('/');
say(`saved the result to ${saved} (${text.length} chars)`, { at: new Date().toISOString(), toolUseId: input.tool_use_id, path: saved, chars: text.length });
