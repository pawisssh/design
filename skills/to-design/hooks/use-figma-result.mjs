#!/usr/bin/env node
// PostToolUse hook for mcp__*__use_figma: saves a package call's JSON result as result.json beside its package, the
// path every call cycle records from, so the agent never re-types a result or digs it out of the transcript.
import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { appendLog, logDir, MANIFEST, MARKER, PACKAGE_LOG, projectRoot, readInput, relativeInside, RESULT_LOG, STUB } from './lib.mjs';

// The first line package_native_builder.py writes into every package, which the swapped code starts with.
const PACKAGE_HEADER = /^\/\/ Native build package: [0-9a-f]{64}\n/;

// The hook never blocks the call: each outcome is one line in the call's result, and it exits 0.
const reply = text => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `use_figma result hook: ${text}` } }));
  process.exit(0);
};
// SKILL.md has the agent save the result itself whenever the hook says nothing was saved.
const refuse = why => reply(`${why}; nothing saved, save the result yourself`);

let input;
try { input = readInput(); } catch { process.exit(0); }
const code = typeof input.tool_input?.code === 'string' ? input.tool_input.code : '';
const packageCall = code.includes(MARKER) || PACKAGE_HEADER.test(code);
let root;
try { root = projectRoot(input); } catch (e) { if (packageCall) refuse(`cannot resolve the project: ${e.code || e.message}`); process.exit(0); }

// The newest line the package hook logged for this call, if any.
function loggedPath(id) {
  if (!id) return null;
  let lines;
  try { lines = readFileSync(join(logDir(root), PACKAGE_LOG), 'utf8').trim().split('\n'); } catch { return null; }
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const r = JSON.parse(lines[i]); if (r.toolUseId === id) return r.path; } catch {}
  }
  return null;
}

// The package's path relative to the project, or why a package call can't be placed; null for any other call.
function locate() {
  const stub = code.match(STUB);
  if (stub) return { path: stub[1] };
  if (code.includes(MARKER)) return { why: `the code carries ${MARKER} but is not the stub` };
  // This hook may see the code the package hook swapped in, so that hook's log of the call names the package.
  const logged = loggedPath(input.tool_use_id);
  if (logged) return { path: logged };
  if (PACKAGE_HEADER.test(code)) return { why: `${PACKAGE_LOG} has no line for this package call (${input.tool_use_id})` };
  return null;
}

// The call's text. Live check, 2026-10-20 (the result-hook-live session): use_figma's result reaches the hook as a bare
// list of content blocks, [{type: 'text', text}]. A list under `content`, or a string, is read too.
function responseText(r) {
  if (typeof r === 'string') return r;
  const blocks = Array.isArray(r) ? r : Array.isArray(r?.content) ? r.content : null;
  if (blocks) return blocks.filter(b => b && b.type === 'text').map(b => b.text).join('');
  return r == null ? '' : JSON.stringify(r);
}

const found = locate();
if (!found) process.exit(0); // not a package call: nothing to save
if (found.why) refuse(found.why);
const relPath = found.path;

// Only a package folder inside the project: the folder's real path, so a symlinked folder can't lead out of it.
let dir;
try { dir = realpathSync(dirname(resolve(root, relPath))); } catch (e) { refuse(`cannot resolve the package folder of ${relPath}: ${e.code || e.message}`); }
if (relativeInside(root, dir) === null) refuse(`package folder escapes the project: ${relPath}`);
// A folder without the packager's manifest is no package folder.
if (!existsSync(join(dir, MANIFEST))) refuse(`${relPath} is in no package folder (no ${MANIFEST})`);

// record reads result.json as JSON, so only a result that parses is saved; an error text stays in the transcript.
const text = responseText(input.tool_response);
try { JSON.parse(text); } catch { refuse(`the result is not JSON (${text.slice(0, 120).replace(/\s+/g, ' ')})`); }

// A new file renamed over result.json: a result.json that is a symlink is replaced, never followed out of the folder.
const out = join(dir, 'result.json');
const tmp = `${out}.${process.pid}.tmp`;
let made = false;
try {
  writeFileSync(tmp, text, { flag: 'wx' });
  made = true;
  renameSync(tmp, out);
} catch (e) {
  if (made) try { unlinkSync(tmp); } catch {}
  refuse(`cannot write ${relativeInside(root, out)}: ${e.code || e.message}`);
}
const saved = relativeInside(root, out);
appendLog(root, RESULT_LOG, { at: new Date().toISOString(), toolUseId: input.tool_use_id, path: saved, chars: text.length });
reply(`saved the result to ${saved} (${text.length} chars)`);
