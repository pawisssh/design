// Stdin-JSON tests of the use_figma result hook: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('../hooks/use-figma-result.mjs', import.meta.url).pathname;
const SNIPPET = new URL('../hooks/settings.snippet.json', import.meta.url).pathname;
const PKG = '.scratch/to-design/pkg/build-components.mcp.js';
const RESULT = '.scratch/to-design/pkg/result.json';
const stub = path => `/*@package ${path} sha256=${'a'.repeat(64)}*/ throw new Error("package not injected");`;
const BODY = JSON.stringify({ slice: 'sets', fileKey: 'abc123', summary: { created: 1 } });

// A project dir holding one package folder, as the packager writes it.
function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-result-hook-')));
  mkdirSync(join(root, '.scratch/to-design/pkg'), { recursive: true });
  writeFileSync(join(root, PKG), '// package\n');
  writeFileSync(join(root, '.scratch/to-design/pkg/script-package.json'), JSON.stringify({ schemaVersion: 1 }));
  return root;
}

function runHook(root, code, response, id = 'toolu_1') {
  const input = {
    session_id: 's',
    cwd: root,
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__plugin_figma_figma__use_figma',
    tool_use_id: id,
    tool_input: { fileKey: 'abc123', description: 'Build Button', code },
    tool_response: response,
  };
  const run = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  return { ...run, said: run.stdout ? JSON.parse(run.stdout).hookSpecificOutput.additionalContext : '' };
}

test('a package call\'s JSON result is saved as result.json beside its package', () => {
  const root = project();
  for (const response of [[{ type: 'text', text: BODY }], { content: [{ type: 'text', text: BODY }] }, BODY]) {
    const run = runHook(root, stub(PKG), response);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(root, RESULT), 'utf8'), BODY);
    assert.match(run.said, /saved the result to \.scratch\/to-design\/pkg\/result\.json/);
  }
  assert.equal(readFileSync(join(root, '.scratch/to-design/use-figma-result.log'), 'utf8').trim().split('\n').length, 3);
});

test('with the swapped code, the package is the one the package hook logged for this call', () => {
  const root = project();
  writeFileSync(join(root, '.scratch/to-design/use-figma-package.log'), [
    JSON.stringify({ toolUseId: 'toolu_other', path: 'elsewhere/build-components.mcp.js' }),
    JSON.stringify({ toolUseId: 'toolu_7', path: PKG }),
  ].join('\n') + '\n');
  const run = runHook(root, '// package\n', [{ type: 'text', text: BODY }], 'toolu_7');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(join(root, RESULT), 'utf8'), BODY);
});

test('a call that is no package call is left alone, with no output', () => {
  const root = project();
  const run = runHook(root, 'return figma.currentPage.name', [{ type: 'text', text: '"Page 1"' }], 'toolu_unlogged');
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  assert.ok(!existsSync(join(root, RESULT)));
});

test('nothing is saved, and the call is never blocked, for a result that is not JSON or a folder that is no package folder', () => {
  const root = project();
  const error = runHook(root, stub(PKG), [{ type: 'text', text: 'Error: package not injected' }]);
  assert.equal(error.status, 0);
  assert.match(error.said, /the result is not JSON \(Error: package not injected\); nothing saved/);
  assert.ok(!existsSync(join(root, RESULT)));

  mkdirSync(join(root, 'loose'));
  writeFileSync(join(root, 'loose/x.js'), '');
  const loose = runHook(root, stub('loose/x.js'), BODY);
  assert.equal(loose.status, 0);
  assert.match(loose.said, /is in no package folder \(no script-package\.json\); nothing saved/);
  assert.ok(!existsSync(join(root, 'loose/result.json')));

  const out = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-outside-')));
  writeFileSync(join(out, 'script-package.json'), '{}');
  const escape = runHook(root, stub(join(out, 'x.js')), BODY);
  assert.equal(escape.status, 0);
  assert.match(escape.said, /escapes the project/);
  assert.ok(!existsSync(join(out, 'result.json')));
});

test('the settings snippet registers the result hook after each use_figma call, never blocking', () => {
  const { hooks } = JSON.parse(readFileSync(SNIPPET, 'utf8'));
  const [entry] = hooks.PostToolUse;
  assert.equal(entry.matcher, 'mcp__.*__use_figma');
  assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PROJECT_DIR}/skills/to-design/hooks/use-figma-result.mjs']);
  assert.ok(!('onFailure' in entry.hooks[0]));
  assert.equal(hooks.PreToolUse[0].hooks[0].onFailure, 'block');
});
