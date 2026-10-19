// A project holding one package, and a run of a use_figma hook on stdin JSON: what the hook tests share.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PKG = '.scratch/to-design/pkg/build-components.mcp.js';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const stubFor = (path, sha) => `/*@package ${path} sha256=${sha}*/ throw new Error("package not injected");`;

// A project dir holding one package and its manifest, as the packager writes them.
export function project(code = '// package\nreturn await buildComponentSets(figma, BUILD_PLAN, BUILD_STATE);\n') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-hook-')));
  const bytes = Buffer.from(code, 'utf8');
  mkdirSync(join(root, '.scratch/to-design/pkg'), { recursive: true });
  writeFileSync(join(root, PKG), bytes);
  writeFileSync(join(root, '.scratch/to-design/pkg/script-package.json'), JSON.stringify({ schemaVersion: 1, fileSha256: sha256(bytes) }));
  return { root, bytes, sha: sha256(bytes) };
}

// One use_figma call's hook input; `input` sets the event and anything else that differs.
export function runHook(hook, root, input, env = {}) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ session_id: 's', cwd: root, tool_name: 'mcp__plugin_figma_figma__use_figma', tool_use_id: 'toolu_1', ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    encoding: 'utf8',
  });
}

export const toolInput = code => ({ fileKey: 'abc123', description: 'Build Button', code });
