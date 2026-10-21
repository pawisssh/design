// Stdin-JSON tests of the use_figma result hook: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PKG, project, runHook as runHookAt, stubFor, toolInput } from './hook-fixture.mjs';

const HOOK = new URL('../hooks/use-figma-result.mjs', import.meta.url).pathname;
const SNIPPET_HOOKS = JSON.parse(readFileSync(new URL('../hooks/settings.snippet.json', import.meta.url), 'utf8')).hooks;
const RESULT = '.scratch/to-design/pkg/result.json';
const CODE = `// Native build package: ${'b'.repeat(64)}\nasync function buildComponentSets() {}\n`;
const BODY = JSON.stringify({ slice: 'sets', fileKey: 'abc123', summary: { created: 1 } });

// A project holding one package as the packager writes it, with its stub.
function packaged() {
  const p = project(CODE);
  return { ...p, stub: stubFor(PKG, p.sha) };
}

function runHook(root, code, response, id = 'toolu_1') {
  const run = runHookAt(HOOK, root, { hook_event_name: 'PostToolUse', tool_use_id: id, tool_input: toolInput(code), tool_response: response });
  return { ...run, said: run.stdout ? JSON.parse(run.stdout).hookSpecificOutput.additionalContext : '' };
}

// The tool_response as use_figma sends it (the hook's responseText says where that was read).
test('a package call\'s JSON result is saved as result.json beside its package', () => {
  const { root, stub } = packaged();
  const run = runHook(root, stub, [{ type: 'text', text: BODY }]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(join(root, RESULT), 'utf8'), BODY);
  assert.match(run.said, /saved the result to \.scratch\/to-design\/pkg\/result\.json/);
  assert.equal(readFileSync(join(root, '.scratch/to-design/use-figma-result.log'), 'utf8').trim().split('\n').length, 1);
});

test('a result as a list under content, or as a string, is saved too', () => {
  const { root, stub } = packaged();
  for (const response of [{ content: [{ type: 'text', text: BODY }] }, BODY]) {
    const run = runHook(root, stub, response);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(root, RESULT), 'utf8'), BODY);
    assert.match(run.said, /saved the result to \.scratch\/to-design\/pkg\/result\.json/);
  }
  assert.equal(readFileSync(join(root, '.scratch/to-design/use-figma-result.log'), 'utf8').trim().split('\n').length, 2);
});

test('with the swapped code, the package is the one the package hook logged for this call', () => {
  const { root } = packaged();
  writeFileSync(join(root, '.scratch/to-design/use-figma-package.log'), [
    JSON.stringify({ toolUseId: 'toolu_other', path: 'elsewhere/build-components.mcp.js' }),
    JSON.stringify({ toolUseId: 'toolu_7', path: PKG }),
  ].join('\n') + '\n');
  const run = runHook(root, CODE, [{ type: 'text', text: BODY }], 'toolu_7');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(join(root, RESULT), 'utf8'), BODY);
});

test('a call that is no package call is left alone, with no output', () => {
  const { root } = packaged();
  const run = runHook(root, 'return figma.currentPage.name', [{ type: 'text', text: '"Page 1"' }], 'toolu_unlogged');
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  assert.ok(!existsSync(join(root, RESULT)));
});

test('a package call the hook cannot place says why nothing was saved', () => {
  const { root, stub } = packaged();
  const unlogged = runHook(root, CODE, BODY, 'toolu_unlogged');
  assert.equal(unlogged.status, 0);
  assert.match(unlogged.said, /use-figma-package\.log has no line for this package call \(toolu_unlogged\); nothing saved/);

  const loose = runHook(root, `${stub}\nfigma.root.remove();`, BODY);
  assert.equal(loose.status, 0);
  assert.match(loose.said, /carries \/\*@package but is not the stub; nothing saved/);
  assert.ok(!existsSync(join(root, RESULT)));

  const rootless = runHookAt(HOOK, root, { hook_event_name: 'PostToolUse', tool_input: toolInput(stub), tool_response: BODY }, { CLAUDE_PROJECT_DIR: join(root, 'gone') });
  assert.equal(rootless.status, 0);
  assert.match(JSON.parse(rootless.stdout).hookSpecificOutput.additionalContext, /cannot resolve the project: ENOENT; nothing saved/);
});

test('nothing is saved, and the call is never blocked, for a result that is not JSON or a folder that is no package folder', () => {
  const { root, stub } = packaged();
  const error = runHook(root, stub, [{ type: 'text', text: 'Error: package not injected' }]);
  assert.equal(error.status, 0);
  assert.match(error.said, /the result is not JSON \(Error: package not injected\); nothing saved/);
  assert.ok(!existsSync(join(root, RESULT)));

  mkdirSync(join(root, 'loose'));
  writeFileSync(join(root, 'loose/x.js'), '');
  const loose = runHook(root, stubFor('loose/x.js', 'a'.repeat(64)), BODY);
  assert.equal(loose.status, 0);
  assert.match(loose.said, /is in no package folder \(no script-package\.json\); nothing saved/);
  assert.ok(!existsSync(join(root, 'loose/result.json')));
});

test('a package folder outside the project, by an absolute path or by .., is refused', () => {
  const outside = packaged();
  const root = join(outside.root, 'project');
  mkdirSync(root);
  for (const path of [join(outside.root, PKG), `../${PKG}`]) {
    const run = runHook(root, stubFor(path, outside.sha), BODY);
    assert.equal(run.status, 0);
    assert.match(run.said, /escapes the project/);
  }
  assert.ok(!existsSync(join(outside.root, RESULT)));
});

test('a result.json that is a symlink out of the project is replaced, never written through', () => {
  const { root, stub } = packaged();
  const out = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-outside-')));
  writeFileSync(join(out, 'target.json'), 'untouched');
  symlinkSync(join(out, 'target.json'), join(root, RESULT));
  const run = runHook(root, stub, BODY);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(join(out, 'target.json'), 'utf8'), 'untouched');
  assert.ok(lstatSync(join(root, RESULT)).isFile());
  assert.equal(readFileSync(join(root, RESULT), 'utf8'), BODY);
});

test('the settings snippet registers the result hook after each use_figma call, never blocking', () => {
  const hooks = SNIPPET_HOOKS;
  const [entry] = hooks.PostToolUse;
  assert.equal(entry.matcher, 'mcp__.*__use_figma');
  assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PROJECT_DIR}/skills/to-design/hooks/use-figma-result.mjs']);
  assert.ok(!('onFailure' in entry.hooks[0]));
  assert.equal(hooks.PreToolUse[0].hooks[0].onFailure, 'block');
});

// Settings drift (#203): registering the hooks is the owner's step, so a change to the snippet stays red here until
// they commit it to the project's settings on the same branch. Settings may hold more hooks than the snippet.
test('the project settings register every hook the snippet does', () => {
  const settings = JSON.parse(readFileSync(new URL('../../../.claude/settings.json', import.meta.url), 'utf8')).hooks || {};
  for (const [event, entries] of Object.entries(SNIPPET_HOOKS)) {
    for (const { matcher, hooks } of entries) {
      for (const hook of hooks) {
        const registered = (settings[event] || []).some(e => e.matcher === matcher && (e.hooks || []).some(h => isDeepStrictEqual(h, hook)));
        assert.ok(registered, `.claude/settings.json has no ${event} hook for ${matcher} equal to the snippet's ${JSON.stringify(hook)}: the owner pastes hooks/settings.snippet.json into it`);
      }
    }
  }
});
