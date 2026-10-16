// The default ledger path from a git worktree: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultLedgerPath, ledgerPath } from '../scripts/ledger.mjs';

const SCRIPT = new URL('../scripts/ledger.mjs', import.meta.url).pathname;
const FILE_KEY = 'abc123';
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};

// A main checkout with one commit and a linked worktree under it, as the desktop app makes them.
function repo() {
  const main = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-ledger-')));
  git(main, 'init', '-q');
  git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const wt = join(main, '.claude', 'worktrees', 'wt');
  git(main, 'worktree', 'add', '-q', wt);
  return { main, wt };
}

function record(cwd, ...extra) {
  writeFileSync(join(cwd, 'result.json'), JSON.stringify({ fileKey: FILE_KEY, slice: 'foundations', ledger: { foundations: { variables: {} } }, summary: {} }));
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync('node', [SCRIPT, 'record', 'result.json', ...extra], { cwd, env, encoding: 'utf8' });
}

test('from a linked worktree the default ledger is refused, naming the main checkout ledger to pass', () => {
  const { main, wt } = repo();
  assert.throws(() => defaultLedgerPath(FILE_KEY, wt), err => err.message.includes(`--ledger ${ledgerPath(FILE_KEY, main)}`));
  assert.equal(defaultLedgerPath(FILE_KEY, main), ledgerPath(FILE_KEY, main));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-noregit-')));
  assert.equal(defaultLedgerPath(FILE_KEY, outside), ledgerPath(FILE_KEY, outside), 'outside a repo the folder itself holds the ledger');
});

test('ledger record in a worktree writes only with --ledger, and never to the worktree .scratch', () => {
  const { main, wt } = repo();
  const refused = record(wt);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /--ledger/);
  assert.equal(existsSync(ledgerPath(FILE_KEY, wt)), false);
  const shared = ledgerPath(FILE_KEY, main);
  const ok = record(wt, '--ledger', shared);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(readFileSync(shared, 'utf8')).fileKey, FILE_KEY);
  assert.equal(record(main).status, 0, 'the main checkout keeps its default');
});

test('ledger prune-list writes the owner-named orphans with their preview counts, and refuses a name the preview does not hold', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-prune-')));
  const preview = { slice: 'sets', mode: 'prune-preview', fileKey: FILE_KEY, family: 'button', orphans: { 'Kind=Primary, State=Focus': 2, 'Kind=Ghost, State=Focus': 0 } };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(preview));
  const run = (...names) => spawnSync('node', [SCRIPT, 'prune-list', 'result.json', ...names.flatMap(n => ['--name', n]), '--out', 'prune.json'], { cwd: dir, encoding: 'utf8' });
  const ok = run('Kind=Primary, State=Focus');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'prune.json'), 'utf8')), { schemaVersion: 1, fileKey: FILE_KEY, family: 'button', prune: { 'Kind=Primary, State=Focus': 2 } });
  const refused = run('Kind=Primary, State=Enabled');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /not an orphan in the preview/);
});
