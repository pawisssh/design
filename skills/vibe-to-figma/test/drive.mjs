// The agent's build loop on To-design's mock Figma (#179), shared by the build and rerun tests: next, the packaged
// call, record, until the build is done or stops.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockFigma, runPackage } from '../../to-design/tests/mock-figma.mjs';
import { nextStep, recordStep } from '../scripts/build.mjs';

const PACKAGER = fileURLToPath(new URL('../../to-design/scripts/package_native_builder.py', import.meta.url));
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

export function pack(plan, state, core) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-to-figma-build-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, core, 'plan.json', 'out', '--state', 'state.json'], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8');
}

/** The agent's loop on the mock: next, use_figma, record, until the build is done or stops. */
export async function drive({ dir, mock, ledger = null, record = {}, max = 200, ...opts }) {
  const steps = [];
  for (let i = 0; i < max; i++) {
    const n = nextStep({ dir, fileKey: FILE_KEY, ledger, record, at: AT, ...opts });
    record = n.record;
    if (n.status !== 'step') return { n, ledger, record, steps };
    const from = mock.log.length;
    const result = await runPackage(pack(n.plan, n.state, n.core), mock.figma);
    // the call's writes: what it logged, but its page switches and font loads
    const writes = mock.log.slice(from).filter(([op]) => !['setCurrentPage', 'loadFont'].includes(op));
    steps.push({ step: n.step, family: n.family, options: n.options, plan: n.plan, result, writes });
    ({ ledger, record } = recordStep({ dir, fileKey: FILE_KEY, ledger, record, result, namespace: opts.namespace, skip: opts.skip, at: AT }));
    if (result.conflicts && result.conflicts.length) return { n: { status: 'conflicts', conflicts: result.conflicts }, ledger, record, steps };
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
