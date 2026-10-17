// To-handoff on a v0 shadcn Prototype against the shadcn Design System (#125): the swap test for the Adapter
// interface. The fixture is the v0 sample as source plus lockfile; the Design System is a temp copy of the
// shadcn Foundations document and Button Contract only, so Contracts added later do not move these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTypescript } from '../scripts/deps.mjs';
import { readReact } from '../scripts/react.mjs';
import { walk } from '../scripts/reader.mjs';

const V0 = fileURLToPath(new URL('fixtures/v0-app', import.meta.url));
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
const BUTTON_PACKAGE = '@/components/ui/button';
const elements = (root, pick) => { const out = []; walk(root, el => { if (pick(el)) out.push(el); }); return out; };
const copy = () => { const dir = mkdtempSync(join(tmpdir(), 'to-handoff-v0-')); cpSync(V0, dir, { recursive: true }); return dir; };

test('read: a Code Library import that resolves to a Contract package file is a Design System leaf; other ui imports stay ui', { skip: noTs }, () => {
  const doc = readReact(V0, { packages: [BUTTON_PACKAGE] });
  const leaves = elements(doc.screens[0].root, el => el.component);
  const byExport = name => leaves.filter(el => el.component.export === name).map(el => ({ kind: el.component.kind, module: el.component.module, at: doc.at(el.offset) }));
  assert.deepEqual(byExport('Button'), [
    { kind: 'ds', module: BUTTON_PACKAGE, at: 'app/request-access-form.tsx:48:9' },
    { kind: 'ds', module: BUTTON_PACKAGE, at: 'components/submit-button.tsx:11:5' },
    { kind: 'ds', module: BUTTON_PACKAGE, at: 'app/page.tsx:33:11' },
  ]);
  assert.deepEqual([...new Set(byExport('Input').map(l => `${l.kind} ${l.module}`))], ['ui @/components/ui/input']);
});

test('read: a relative import of the same file is the Contract package too', { skip: noTs }, () => {
  const dir = copy();
  const file = join(dir, 'components/submit-button.tsx');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"@/components/ui/button"', '"./ui/button"'));
  const doc = readReact(dir, { packages: [BUTTON_PACKAGE] });
  const submit = elements(doc.screens[0].root, el => el.component && doc.at(el.offset).startsWith('components/submit-button.tsx'));
  assert.deepEqual(submit.map(el => el.component.module), [BUTTON_PACKAGE]);
});
