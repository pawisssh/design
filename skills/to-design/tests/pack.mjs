// Packages a plan with the real packager, for the tests that then run it on the mock figma (mock-figma.mjs).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGER = fileURLToPath(new URL('../scripts/package_native_builder.py', import.meta.url));

// Packages a plan and state onto `core` in a fresh project dir; returns the package code and the packager's stdout.
export function pack(plan, state, core) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-pack-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, core, 'plan.json', 'out', '--state', 'state.json'], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return { code: readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8'), out: JSON.parse(run.stdout) };
}
