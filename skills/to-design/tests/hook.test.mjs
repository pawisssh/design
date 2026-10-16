// Stdin-JSON tests of the use_figma package hook: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('../hooks/use-figma-package.mjs', import.meta.url).pathname;
const PKG = '.scratch/to-design/pkg/build-components.mcp.js';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stubFor = (path, sha) => `/*@package ${path} sha256=${sha}*/ throw new Error("package not injected");`;

// A project dir holding one package and its manifest, as the packager writes them.
function project(code = '// package\nreturn await buildComponentSets(figma, BUILD_PLAN, BUILD_STATE);\n') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-hook-')));
  const bytes = Buffer.from(code, 'utf8');
  mkdirSync(join(root, '.scratch/to-design/pkg'), { recursive: true });
  writeFileSync(join(root, PKG), bytes);
  writeFileSync(join(root, '.scratch/to-design/pkg/script-package.json'), JSON.stringify({ schemaVersion: 1, fileSha256: sha256(bytes) }));
  return { root, bytes, sha: sha256(bytes) };
}

function runHook(root, code, env = {}) {
  const input = {
    session_id: 's',
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'mcp__plugin_figma_figma__use_figma',
    tool_use_id: 'toolu_1',
    tool_input: { fileKey: 'abc123', description: 'Build Button', code },
  };
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    encoding: 'utf8',
  });
}

test('a good stub is allowed with code byte-identical to the package file', () => {
  const { root, bytes, sha } = project();
  const run = runHook(root, stubFor(PKG, sha));
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'allow');
  assert.ok(Buffer.from(out.updatedInput.code, 'utf8').equals(bytes));
  assert.equal(out.updatedInput.fileKey, 'abc123');
  assert.equal(out.updatedInput.description, 'Build Button');
  assert.deepEqual(Object.keys(out.updatedInput).sort(), ['code', 'description', 'fileKey']);
});

test('a call without the marker passes through with no output', () => {
  const { root } = project();
  const run = runHook(root, 'figma.currentPage.name');
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, '');
});

// A blocked call exits 2 with a single line on stderr, which Claude Code shows as the reason.
function assertBlocked(run, reason) {
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /^use_figma package hook: [^\n]+\n$/);
  assert.match(run.stderr, reason);
}

test('a stub whose sha256 does not match the file is blocked', () => {
  const { root } = project();
  assertBlocked(runHook(root, stubFor(PKG, '0'.repeat(64))), /sha256 mismatch/);
});

test('a package whose manifest fileSha256 does not match the file is blocked', () => {
  const { root, sha } = project();
  writeFileSync(join(root, '.scratch/to-design/pkg/script-package.json'), JSON.stringify({ fileSha256: 'f'.repeat(64) }));
  assertBlocked(runHook(root, stubFor(PKG, sha)), /script-package\.json fileSha256/);
});

test('a package whose manifest is not an object is blocked', () => {
  const { root, sha } = project();
  writeFileSync(join(root, '.scratch/to-design/pkg/script-package.json'), 'null');
  assertBlocked(runHook(root, stubFor(PKG, sha)), /script-package\.json/);
});

test('a stub path escaping the project is blocked', () => {
  // A valid package (file + manifest) that sits outside the project dir.
  const outside = project();
  const root = join(outside.root, 'project');
  mkdirSync(root);
  assertBlocked(runHook(root, stubFor(`../${PKG}`, outside.sha)), /escapes the project/);
});

test('a stub with extra code after it is blocked', () => {
  const { root, sha } = project();
  assertBlocked(runHook(root, `${stubFor(PKG, sha)}\nfigma.root.remove();`), /not exactly the stub/);
});

test('a stub with extra code before it is blocked', () => {
  const { root, sha } = project();
  assertBlocked(runHook(root, `figma.root.remove();\n${stubFor(PKG, sha)}`), /not exactly the stub/);
});

test('a package over 50,000 chars is blocked', () => {
  // Valid sha and manifest, so only the size limit can refuse it.
  const { root, sha } = project('x'.repeat(50001));
  assertBlocked(runHook(root, stubFor(PKG, sha)), /50001 chars, over the 50000/);
});

test('each expansion appends one line to the To-design scratch log, and only expansions do', () => {
  const { root, sha } = project();
  const log = join(root, '.scratch/to-design/use-figma-package.log');
  runHook(root, 'figma.currentPage.name');
  runHook(root, stubFor(PKG, '0'.repeat(64)));
  assert.equal(existsSync(log), false);
  runHook(root, stubFor(PKG, sha));
  runHook(root, stubFor(PKG, sha));
  const lines = readFileSync(log, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].sha256, sha);
  assert.equal(lines[0].path, PKG);
  assert.equal(lines[0].toolUseId, 'toolu_1');
});

test('a package of exactly 50,000 chars is allowed', () => {
  const { root, sha } = project('x'.repeat(50000));
  const run = runHook(root, stubFor(PKG, sha));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).hookSpecificOutput.updatedInput.code.length, 50000);
});

// The project as a git checkout tracking a branch that has `ahead` commits, each writing `file`.
function checkoutBehind(file, ahead = 1) {
  const p = project();
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: p.root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  git('checkout', '-q', '-b', 'up');
  for (let i = 0; i < ahead; i++) {
    mkdirSync(join(p.root, file, '..'), { recursive: true });
    writeFileSync(join(p.root, file), String(i));
    git('add', file);
    git('commit', '-q', '-m', `edit ${i}`);
  }
  git('checkout', '-q', 'main');
  git('branch', '-q', '--set-upstream-to=up');
  return p;
}

test('a checkout behind its upstream on the hook or settings still swaps, and warns the agent and the owner to pull', () => {
  for (const file of ['skills/to-design/hooks/use-figma-package.mjs', '.claude/settings.json']) {
    const { root, bytes, sha } = checkoutBehind(file);
    const run = runHook(root, stubFor(PKG, sha));
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'allow');
    assert.ok(Buffer.from(out.hookSpecificOutput.updatedInput.code, 'utf8').equals(bytes));
    assert.match(out.systemMessage, /1 commit.* pull/);
    assert.match(out.hookSpecificOutput.additionalContext, /stale/);
  }
});

test('a checkout up to date, behind only on other files, outside git, or without git swaps with no warning', () => {
  const stale = checkoutBehind('.claude/settings.json');
  const cases = [[checkoutBehind('.claude/settings.json', 0)], [checkoutBehind('docs/notes.md', 3)], [project()], [stale, { PATH: '' }]];
  for (const [{ root, sha }, env] of cases) {
    const run = runHook(root, stubFor(PKG, sha), env);
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.systemMessage, undefined);
    assert.equal(out.hookSpecificOutput.additionalContext, undefined);
  }
});
