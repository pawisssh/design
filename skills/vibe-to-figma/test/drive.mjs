// The agent's build loop on To-design's mock Figma (#179), shared by the build, Foundations, rerun and held tests: next,
// the packaged call, record, until the build is done or stops. And a copy of the v0 project built on the mock, for the
// reruns and the held variants.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The packager's output depends only on its inputs, and the tests drive the same calls over and over: package each once.
const packed = new Map();
function packedCode(plan, state, core) {
  const key = JSON.stringify([plan, state, core]);
  if (!packed.has(key)) packed.set(key, pack(plan, state, core).code);
  return packed.get(key);
}

/** The agent's loop on the mock: next, use_figma, record, until the build is done or stops, or `until` a step. */
export async function drive({ dir, mock, ledger = null, record = {}, max = 200, until = () => false, ...opts }) {
  const steps = [];
  for (let i = 0; i < max; i++) {
    const n = nextStep({ dir, fileKey: FILE_KEY, ledger, record, at: AT, ...opts });
    record = n.record;
    if (n.status !== 'step') return { n, ledger, record, steps };
    const from = mock.log.length;
    const result = await runPackage(packedCode(n.plan, n.state, n.core), mock.figma);
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

// The v0 project and its folder depend only on the opacities input's disabled State went through since the first
// build (`fades`, from 50), and a build on the mock writes nothing into them. So each state is built and approved once
// per test file, under .scratch/, as {project, ds} under a root never written after; the tests copy it. The first
// state starts from the v0 project's folder as first built, before any approve.
let first;
const firstBuilt = () => (first ??= (async () => {
  const root = scratch();
  cpSync(V0, join(root, 'project'), { recursive: true });
  await buildFolder({ project: join(root, 'project'), root: join(root, 'ds'), drafts });
  return root;
})());

/** A copy of the v0 project with its folder built and not approved: {project, root, dir}. */
export async function draftedProject() {
  const root = scratch();
  cpSync(await firstBuilt(), root, { recursive: true });
  return { project: join(root, 'project'), root: join(root, 'ds'), dir: join(root, 'ds/v0-app') };
}

const states = new Map();
function stateAfter(fades) {
  const key = fades.join(' ');
  if (!states.has(key)) states.set(key, (async () => {
    const root = scratch();
    const project = join(root, 'project');
    if (fades.length) {
      cpSync(await stateAfter(fades.slice(0, -1)), root, { recursive: true });
      fadeDisabled(join(project, 'components/ui/input.tsx'), fades.at(-2) ?? 50, fades.at(-1));
      await buildFolder({ project, root: join(root, 'ds'), drafts });
    } else cpSync(await firstBuilt(), root, { recursive: true });
    const dir = join(root, 'ds/v0-app');
    // The first review narrows Button; a change's review exports the page as the folder now stands.
    await approveFolder({ dir, project, exported: exported(dir, fades.length ? {} : NARROW), said: 'approve', at: AT, test: true });
    return root;
  })());
  return states.get(key);
}

/** A copy of the v0 project with its folder built, approved (Button narrowed) and built on the mock. */
export async function builtProject() {
  const root = scratch();
  cpSync(await stateAfter([]), root, { recursive: true });
  const dir = join(root, 'ds/v0-app');
  const mock = smokeDraft();
  const first = await drive({ dir, mock, namespace: 'v0-app' });
  assert.equal(first.n.status, 'built', JSON.stringify(first.n));
  return { project: join(root, 'project'), root: join(root, 'ds'), dir, fades: [], mock, ledger: first.ledger, record: first.record };
}

/** builtProject's `p` with input's disabled opacity changed from `from` to `to`, and the change approved. */
export async function inputFaded(p, from, to) {
  assert.equal(from, p.fades.at(-1) ?? 50);
  p.fades = [...p.fades, to];
  const state = await stateAfter(p.fades);
  for (const [sub, at] of [['project', p.project], ['ds', p.root]]) {
    rmSync(at, { recursive: true });
    cpSync(join(state, sub), at, { recursive: true });
  }
}
