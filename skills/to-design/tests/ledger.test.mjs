// The default ledger path from a git worktree: run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtStatus, defaultLedgerPath, ledgerPath } from '../scripts/ledger.mjs';

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

test('from a linked worktree the default ledger is the main checkout ledger', () => {
  const { main, wt } = repo();
  assert.equal(defaultLedgerPath(FILE_KEY, wt), ledgerPath(FILE_KEY, main));
  assert.equal(defaultLedgerPath(FILE_KEY, main), ledgerPath(FILE_KEY, main));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-noregit-')));
  assert.equal(defaultLedgerPath(FILE_KEY, outside), ledgerPath(FILE_KEY, outside), 'outside a repo the folder itself holds the ledger');
});

test('ledger record in a worktree writes the main checkout ledger, says so, and never the worktree .scratch', () => {
  const { main, wt } = repo();
  const shared = ledgerPath(FILE_KEY, main);
  const run = record(wt);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stderr.includes(`using the main checkout's ledger ${shared}`), run.stderr);
  assert.equal(existsSync(ledgerPath(FILE_KEY, wt)), false);
  assert.equal(JSON.parse(readFileSync(shared, 'utf8')).fileKey, FILE_KEY);
  const elsewhere = join(wt, 'other.ledger.json');
  assert.equal(record(wt, '--ledger', elsewhere).status, 0, '--ledger still wins');
  assert.equal(existsSync(elsewhere), true);
  assert.equal(record(main).status, 0, 'the main checkout keeps its default');
});

test('ledger prune-list writes the owner-named orphans with their preview counts, and refuses a name the preview does not hold', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-prune-')));
  const preview = { slice: 'sets', mode: 'prune-preview', fileKey: FILE_KEY, family: 'button', orphans: { 'Kind=Primary, State=Focus': 2, 'Kind=Ghost, State=Focus': 0 } };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(preview));
  const run = (...names) => spawnSync('node', [SCRIPT, 'prune-list', 'result.json', ...names.flatMap(n => ['--name', n]), '--out', join('run', 'prune.json')], { cwd: dir, encoding: 'utf8' });
  const ok = run('Kind=Primary, State=Focus');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'run', 'prune.json'), 'utf8')), { schemaVersion: 1, fileKey: FILE_KEY, family: 'button', prune: { 'Kind=Primary, State=Focus': 2 } });
  const refused = run('Kind=Primary, State=Enabled');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /not an orphan in the preview/);
});

test('ledger built prints what the ledger records of a family with no Figma call, and exits non-zero for one it does not hold (#239)', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-built-')));
  const ledger = {
    schemaVersion: 1, fileKey: FILE_KEY, foundations: null,
    sets: { button: { page: '1:2', set: { id: '1:3', key: 'k', name: 'Button' }, variants: ['1:4', null, '1:6'], total: 3, contentHash: 'abc', builtAt: '2026-10-20T00:00:00.000Z' } },
    bases: { button: { page: '1:2', id: '1:4', key: 'kb', name: 'Kind=Primary', contentHash: 'abc', builtAt: '2026-10-20T00:00:00.000Z' }, link: { page: '9:9', id: '9:10', contentHash: 'def', builtAt: '2026-10-21T00:00:00.000Z' } },
  };
  writeFileSync(join(dir, 'l.json'), JSON.stringify(ledger));
  const run = family => spawnSync('node', [SCRIPT, 'built', '--file-key', FILE_KEY, '--family', family, '--ledger', join(dir, 'l.json')], { cwd: dir, encoding: 'utf8' });
  const built = run('button');
  assert.equal(built.status, 0, built.stderr);
  assert.deepEqual(JSON.parse(built.stdout), {
    fileKey: FILE_KEY, family: 'button',
    set: { id: '1:3', key: 'k', name: 'Button', page: '1:2', variants: 2, total: 3, contentHash: 'abc', builtAt: '2026-10-20T00:00:00.000Z' },
    base: { id: '1:4', page: '1:2', contentHash: 'abc', builtAt: '2026-10-20T00:00:00.000Z' },
  });
  assert.deepEqual(JSON.parse(run('link').stdout).set, null, 'a Base Component alone is reported, with no set');
  const none = run('text-input');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /text-input is not built in /);
  assert.equal(builtStatus(null, 'button'), null);
  const nofile = spawnSync('node', [SCRIPT, 'built', '--file-key', FILE_KEY, '--family', 'button', '--ledger', join(dir, 'missing.json')], { cwd: dir, encoding: 'utf8' });
  assert.equal(nofile.status, 1);
  assert.match(nofile.stderr, /no ledger at /);
});
