// The agent's build loop on To-design's mock Figma (#179), shared by the build and rerun tests: next, the packaged
// call, record, until the build is done or stops. And a copy of the v0 project built on the mock, for the reruns.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockFigma, runPackage } from '../../to-design/tests/mock-figma.mjs';
import { pack } from '../../to-design/tests/pack.mjs';
import { approveFolder } from '../scripts/approve.mjs';
import { nextStep, recordStep } from '../scripts/build.mjs';
import { buildFolder } from '../scripts/folder.mjs';
import { reviewModel } from '../scripts/review.mjs';
import { READABLE, V0, read, scratch, selections } from './helpers.mjs';

export const FILE_KEY = 'MOCKFILEKEY0000000000000';
export const URL_ = `https://www.figma.com/design/${FILE_KEY}/Smoke?node-id=0-1`;
export const AT = '2026-10-18T00:00:00.000Z';
// The owner's review: Button narrowed to 48 variants (every Variant, sizes default and sm, every State), so the
// mock build stays quick; the other families as drafted.
export const NARROW = {
  button: m => {
    for (const [axis, value] of [['invalid', 'invalid'], ['expanded', 'expanded'], ['icon-inline-start', 'icon-inline-start'], ['icon-inline-end', 'icon-inline-end'],
      ...['xs', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'].map(v => ['size', v])]) m.selectMatching({ [axis]: value }, false);
  },
};

/** The agent's loop on the mock: next, use_figma, record, until the build is done or stops, or `until` a step. */
export async function drive({ dir, mock, ledger = null, record = {}, max = 200, until = () => false, ...opts }) {
  const steps = [];
  for (let i = 0; i < max; i++) {
    const n = nextStep({ dir, fileKey: FILE_KEY, ledger, record, at: AT, ...opts });
    record = n.record;
    if (n.status !== 'step') return { n, ledger, record, steps };
    const from = mock.log.length;
    const result = await runPackage(pack(n.plan, n.state, n.core).code, mock.figma);
    // the call's writes: what it logged, but its page switches and font loads
    const writes = mock.log.slice(from).filter(([op]) => !['setCurrentPage', 'loadFont'].includes(op));
    steps.push({ step: n.step, family: n.family, options: n.options, plan: n.plan, result, writes });
    ({ ledger, record } = recordStep({ dir, fileKey: FILE_KEY, ledger, record, result, namespace: opts.namespace, skip: opts.skip, at: AT }));
    if (result.conflicts && result.conflicts.length) return { n: { status: 'conflicts', conflicts: result.conflicts }, ledger, record, steps };
    if (until(steps.at(-1))) return { n: { status: 'stopped' }, ledger, record, steps };
  }
  throw new Error(`no end after ${max} calls`);
}

// The smoke draft as it is: Carbon's Theme and Layout collections and its Templates page, owned by another ledger.
export function smokeDraft() {
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1', 'Templates'] });
  mock.figma.variables.createVariableCollection('Theme');
  mock.figma.variables.createVariableCollection('Layout');
  return mock;
}

const { reviewExport } = createRequire(import.meta.url)('../assets/review-export.js');
const DRAFTS = fileURLToPath(new URL('../../adapter-generic/fixtures/drafts/', import.meta.url));
export const drafts = Object.fromEntries(READABLE.map(f => [f, read(join(DRAFTS, `${f}.json`)).drafts]));
export const RED = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1, visible: true, blendMode: 'NORMAL' }];
/** The page's export, in node, for the families on it. */
export const exported = (dir, edits) => { const model = reviewModel(dir); const all = selections(dir, edits); return reviewExport(model, Object.fromEntries(model.families.map(f => [f.family, all[f.family]]))); };
/** Input's disabled State at another opacity (50 to 40, then to 30): its two disabled variants change (indexes 2 and 5). */
export const fadeDisabled = (file, from = 50, to = 40) => writeFileSync(file, readFileSync(file, 'utf8').replace(`disabled:opacity-${from}`, `disabled:opacity-${to}`));

/** A copy of the v0 project with its folder built, approved (Button narrowed) and built on the mock. */
export async function builtProject() {
  const root = scratch();
  const project = join(root, 'project');
  cpSync(V0, project, { recursive: true });
  const { dir } = await buildFolder({ project, root: join(root, 'ds'), drafts });
  await approveFolder({ dir, project, exported: exported(dir, NARROW), said: 'approve', at: AT, test: true });
  const mock = smokeDraft();
  const first = await drive({ dir, mock, namespace: 'v0-app' });
  assert.equal(first.n.status, 'built', JSON.stringify(first.n));
  return { project, root: join(root, 'ds'), dir, mock, ledger: first.ledger, record: first.record };
}
