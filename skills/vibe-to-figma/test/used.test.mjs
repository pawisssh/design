// Which Code Library components a vibe-coded Prototype uses (#176): by default the ones its screens render, read
// with To-handoff's static React reader; with `all`, every component file in the Code Library folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTypescript } from '../../to-handoff/scripts/deps.mjs';
import { usedFamilies } from '../scripts/used.mjs';

const V0 = fileURLToPath(new URL('../../to-handoff/test/fixtures/v0-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';

// The v0 fixture with one Code Library component no screen imports.
const withUnused = () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-to-figma-used-'));
  cpSync(V0, dir, { recursive: true });
  writeFileSync(join(dir, 'components/ui/badge.tsx'), 'export function Badge() { return <span data-slot="badge" /> }\n');
  return dir;
};

test('the v0 screens use every family in components/ui, the Toaster through the root layout', { skip: noTs }, () => {
  const used = usedFamilies(V0);
  assert.equal(used.uiDir, 'components/ui/');
  assert.deepEqual(used.families, ['alert', 'button', 'card', 'input', 'label', 'select', 'sonner', 'textarea']);
});

test('a Code Library component no screen renders is left out by default and taken with all', { skip: noTs }, () => {
  const dir = withUnused();
  assert.ok(!usedFamilies(dir).families.includes('badge'));
  assert.deepEqual(usedFamilies(dir, { all: true }).families,
    ['alert', 'badge', 'button', 'card', 'input', 'label', 'select', 'sonner', 'textarea']);
});
