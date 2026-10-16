// Packager CLI tests: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGER = new URL('../scripts/package_native_builder.py', import.meta.url).pathname;
const HOOK = new URL('../hooks/use-figma-package.mjs', import.meta.url).pathname;

const CORE = 'async function buildComponentSets(figma, plan, state) { return { ok: true }; }\n';
// The smallest real slice: one icon atom.
const PLAN = {
  schemaVersion: 1,
  slice: 'icons',
  fileKey: 'k',
  page: 'Icons',
  icons: [{ key: 'add', name: 'Add', file: 'svg/16/add.svg', svg: '<svg/>', sha256: 'a'.repeat(64) }],
};

function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-packager-')));
  writeFileSync(join(root, 'core.js'), CORE);
  writeFileSync(join(root, 'plan.json'), JSON.stringify(PLAN));
  return root;
}

function pack(root, out = '.scratch/to-design/pkg', env = { CLAUDE_PROJECT_DIR: root }) {
  const run = spawnSync('python3', [PACKAGER, 'core.js', 'plan.json', out], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { ...run, json: run.stdout ? JSON.parse(run.stdout) : null };
}

test('packages a plan and prints chars, fileSha256 and the stub', () => {
  const root = project();
  const run = pack(root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const bytes = readFileSync(join(root, '.scratch/to-design/pkg/build-components.mcp.js'));
  const sha = createHash('sha256').update(bytes).digest('hex');
  assert.equal(run.json.status, 'packaged');
  assert.equal(run.json.fileSha256, sha);
  assert.equal(run.json.chars, bytes.toString('utf8').length);
  assert.equal(
    run.json.stub,
    `/*@package .scratch/to-design/pkg/build-components.mcp.js sha256=${sha}*/ throw new Error("package not injected");`,
  );
  const manifest = JSON.parse(readFileSync(join(root, '.scratch/to-design/pkg/script-package.json'), 'utf8'));
  assert.equal(manifest.fileSha256, sha);
});

test('re-packaging the same input gives the same sha256', () => {
  const root = project();
  const first = pack(root);
  const second = pack(root);
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(second.json.fileSha256, first.json.fileSha256);
  assert.equal(second.json.stub, first.json.stub);
});

test('the printed stub, sent to the hook, expands to the package file', () => {
  const root = project();
  const { json } = pack(root);
  const run = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'mcp__figma__use_figma', tool_input: { fileKey: 'k', code: json.stub } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const bytes = readFileSync(join(root, '.scratch/to-design/pkg/build-components.mcp.js'));
  assert.ok(Buffer.from(JSON.parse(run.stdout).hookSpecificOutput.updatedInput.code, 'utf8').equals(bytes));
});

test('a plan without a known slice is refused', () => {
  for (const slice of [undefined, 'components']) {
    const root = project();
    writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...PLAN, slice }));
    const run = pack(root);
    assert.equal(run.status, 2, String(slice));
    assert.match(run.json.error, /slice must be one of foundations, icons, base, sets/);
  }
});

test('an icons plan with the same icon twice is refused', () => {
  const root = project();
  writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...PLAN, icons: [PLAN.icons[0], { ...PLAN.icons[0] }] }));
  const run = pack(root);
  assert.equal(run.status, 2);
  assert.match(run.json.error, /unique keys/);
});

test('non-ASCII in the plan is escaped, so the package stays ASCII and chars equals its length', () => {
  const root = project();
  writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...PLAN, note: 'Gray 10 → 🙂' }));
  const run = pack(root);
  assert.equal(run.status, 0, run.stdout);
  const text = readFileSync(join(root, '.scratch/to-design/pkg/build-components.mcp.js'), 'utf8');
  assert.ok(/^[\x00-\x7f]*$/.test(text));
  assert.equal(run.json.chars, text.length);
});

test('compaction drops spaces and comments but keeps strings, a - -b and i < s; a regex literal or a block comment is refused', () => {
  const root = project();
  writeFileSync(join(root, 'core.js'), [
    '// a comment',
    'async function buildComponentSets(figma, plan, state) {',
    "  const s = 'a  b // c', t = `x  ${1 + 2}`; // trailing",
    '  for (let i = 0; i < s.length; i++) if (i - -1 === 2) return { s, t };',
    '}',
    '',
  ].join('\n'));
  const run = pack(root);
  assert.equal(run.status, 0, run.stdout);
  const text = readFileSync(join(root, '.scratch/to-design/pkg/build-components.mcp.js'), 'utf8');
  assert.ok(text.includes("const s='a  b // c',t=`x  ${1 + 2}`;\nfor(let i=0;i< s.length;i++)if(i- -1===2)return{s,t};\n}"), text);
  assert.ok(!text.includes('trailing') && !text.includes('a comment'));
  for (const bad of ["  return 'x'.replace(/ /g, '');", '  return /* no */ 1;']) {
    writeFileSync(join(root, 'core.js'), `async function buildComponentSets(figma, plan, state) {\n${bad}\n}\n`);
    const r = pack(root);
    assert.equal(r.status, 2, bad);
    assert.match(r.json.error, /regex literal|\/\/ comments only/);
  }
});

test('a core that is not ASCII is refused, since its hash must match in the packager and in Figma', () => {
  const root = project();
  writeFileSync(join(root, 'core.js'), `${CORE.replace('{ return', '{ /* → */ return')}`);
  const run = pack(root);
  assert.equal(run.status, 2);
  assert.match(run.json.error, /Core must be ASCII/);
});

test('code outside buildComponentSets is refused, since the core hash would not cover it', () => {
  const root = project();
  writeFileSync(join(root, 'core.js'), `const helper = 1;\n${CORE}`);
  const run = pack(root);
  assert.equal(run.status, 2);
  assert.match(run.json.error, /Only \/\/ comment lines may precede/);
});

test('plan text with a backtick or ${ is refused, since String.raw could not carry it', () => {
  for (const bad of ['a `tick`', 'a ${x}']) {
    const root = project();
    writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...PLAN, note: bad }));
    const run = pack(root);
    assert.equal(run.status, 2, bad);
    assert.match(run.json.error, /must not contain a backtick/);
  }
});

// use_figma transpiles scripts whose strings hold markup-like text, which reformats the core's toString() (#30).
test('a "<" in plan text is rebuilt at run time with String.fromCharCode(60), never spelled in the package', () => {
  const root = project();
  const note = '<svg a="1">x</svg> and i < 2';
  writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...PLAN, note }));
  const run = pack(root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const text = readFileSync(join(root, '.scratch/to-design/pkg/build-components.mcp.js'), 'utf8');
  assert.ok(!text.slice(CORE.length).includes('<'), 'no "<" outside the core');
  const planExpr = text.match(/^const PLAN_SRC = (.*);$/m)[1];
  const planSrc = new Function(`return ${planExpr};`)();
  assert.equal(JSON.parse(planSrc).note, note);
  assert.equal(planSrc.length, run.json.check.planLen);
});

test('a core that spells markup-like text is refused, since use_figma would rewrite it', () => {
  for (const bad of ['// <svg> in a comment', "const s = '\\u003cp';"]) {
    const root = project();
    writeFileSync(join(root, 'core.js'), CORE.replace('{ return', `{\n  ${bad}\n  return`));
    const run = pack(root);
    assert.equal(run.status, 2, bad);
    assert.match(run.json.error, /markup-like text/);
  }
});

test('a package written outside the project dir is refused, since the hook could never expand it', () => {
  const root = project();
  const run = pack(root, '../elsewhere');
  assert.equal(run.status, 2);
  assert.equal(run.json.status, 'invalid-input');
  assert.match(run.json.error, /inside the project dir/);
});

// The desktop host sets CLAUDE_PROJECT_DIR to the main working tree, also for a session in a git worktree (#26),
// so the stub names the package relative to the main working tree.
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

function worktreeProject() {
  const main = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-main-')));
  assert.equal(git(main, 'init', '-q').status, 0);
  assert.equal(git(main, 'commit', '-q', '--allow-empty', '-m', 'init').status, 0);
  assert.equal(git(main, 'worktree', 'add', '-q', '.claude/worktrees/wt').status, 0);
  const wt = join(main, '.claude/worktrees/wt');
  writeFileSync(join(wt, 'core.js'), CORE);
  writeFileSync(join(wt, 'plan.json'), JSON.stringify(PLAN));
  return { main, wt };
}

test('from a git worktree the stub path is relative to the main working tree, and the hook there expands it', () => {
  const { main, wt } = worktreeProject();
  // whatever the session's own project dir says, the stub follows the main working tree
  const run = pack(wt, '.scratch/to-design/run', { CLAUDE_PROJECT_DIR: wt });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const bytes = readFileSync(join(wt, '.scratch/to-design/run/build-components.mcp.js'));
  const sha = createHash('sha256').update(bytes).digest('hex');
  assert.equal(run.json.stub, `/*@package .claude/worktrees/wt/.scratch/to-design/run/build-components.mcp.js sha256=${sha}*/ throw new Error("package not injected");`);
  const hook = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'mcp__figma__use_figma', tool_input: { fileKey: 'k', code: run.json.stub } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: main },
    encoding: 'utf8',
  });
  assert.equal(hook.status, 0, hook.stderr);
  assert.ok(Buffer.from(JSON.parse(hook.stdout).hookSpecificOutput.updatedInput.code, 'utf8').equals(bytes));
});

test('in the main working tree the stub path is the same as before', () => {
  const { main } = worktreeProject();
  writeFileSync(join(main, 'core.js'), CORE);
  writeFileSync(join(main, 'plan.json'), JSON.stringify(PLAN));
  const run = pack(main, '.scratch/to-design/run', { CLAUDE_PROJECT_DIR: '' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.json.stub, /^\/\*@package \.scratch\/to-design\/run\/build-components\.mcp\.js sha256=/);
});

test('a worktree outside the main working tree is refused, since the hook could never expand its package', () => {
  const { main } = worktreeProject();
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-outside-')));
  rmSync(outside, { recursive: true });
  assert.equal(git(main, 'worktree', 'add', '-q', outside).status, 0);
  writeFileSync(join(outside, 'core.js'), CORE);
  writeFileSync(join(outside, 'plan.json'), JSON.stringify(PLAN));
  const run = pack(outside, '.scratch/to-design/run', { CLAUDE_PROJECT_DIR: outside });
  assert.equal(run.status, 2);
  assert.match(run.json.error, /inside the main working tree .*write the package there/);
});
