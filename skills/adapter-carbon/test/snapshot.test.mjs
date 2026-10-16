// The snapshotId recipe of a Carbon Contract (offline): the sha256 of the `shasum -a 256` manifest of its
// source.files. Run: node --test skills/adapter-carbon/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { sha256, snapshotId } from '../scripts/sources.mjs';

const button = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url), 'utf8'));

test('the Button Contract\'s snapshotId is the manifest hash of its source.files', () => {
  assert.equal(snapshotId(button.source.files), button.source.snapshotId);
  const moved = { ...button.source.files, 'packages/type/src/styles.ts': `sha256:${'0'.repeat(64)}` };
  assert.notEqual(snapshotId(moved), button.source.snapshotId);
});

test('snapshotId equals the shell recipe: sorted paths through shasum -a 256, then shasum of that manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-'));
  const files = { 'b/z.txt': 'zz\n', 'a/B.txt': 'upper\n', 'a/a.txt': 'lower\n' };
  const map = {};
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
    map[path] = `sha256:${sha256(text)}`;
  }
  const shell = spawnSync('sh', ['-c', "printf '%s\\n' \"$@\" | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256", 'sh', ...Object.keys(files)], { cwd: dir, encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  assert.equal(snapshotId(map), `sha256:${shell.stdout.split(' ')[0]}`);
});
