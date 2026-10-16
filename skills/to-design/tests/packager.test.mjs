// Packager CLI tests: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGER = new URL('../scripts/package_native_builder.py', import.meta.url).pathname;
const HOOK = new URL('../hooks/use-figma-package.mjs', import.meta.url).pathname;

const CORE = 'async function buildComponentSets(figma, plan, state) { return { ok: true }; }\n';
// No specimenId or themeId on the entries.
const PLAN = {
  schemaVersion: 1,
  snapshotId: 'carbon-react@v11.118.0',
  selection: {
    schemaVersion: 1,
    snapshotId: 'carbon-react@v11.118.0',
    selectedFamilies: ['button'],
    entries: [{ familyId: 'button', properties: { kind: 'primary', size: 'lg' } }],
  },
};

function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-packager-')));
  writeFileSync(join(root, 'core.js'), CORE);
  writeFileSync(join(root, 'plan.json'), JSON.stringify(PLAN));
  return root;
}

function pack(root, out = '.scratch/to-design/pkg') {
  const run = spawnSync('python3', [PACKAGER, 'core.js', 'plan.json', out], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { ...run, json: run.stdout ? JSON.parse(run.stdout) : null };
}

test('packages a selection without specimenId or themeId and prints chars, fileSha256 and the stub', () => {
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

test('a selection with the same entry twice is refused', () => {
  const root = project();
  const entry = PLAN.selection.entries[0];
  writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...PLAN, selection: { ...PLAN.selection, entries: [entry, { ...entry }] } }));
  const run = pack(root);
  assert.equal(run.status, 2);
  assert.match(run.json.error, /entries must be unique/);
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
