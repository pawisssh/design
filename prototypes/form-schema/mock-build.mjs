#!/usr/bin/env node
// #93 prototype: build the TextInput and Select Component Sets on To-design's mock Figma with the unchanged
// builder cores, then read every variant back.
//   node prototypes/form-schema/mock-build.mjs
//
// Chain, as in skills/to-design/tests/sets.test.mjs: foundations, icons (the real @carbon/icons package in
// .scratch, so the opacity="0" strip runs on warning--filled), then every sets batch per family under a
// prototype approval (never committed). Checks per family: To-design's coverage check has no problems, and in
// every variant each node the Contract hides is hidden in the built component and each node it shows is shown,
// and each status icon is an instance of its own icon. Exits 1 on any problem.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, expand, resolve, variantName } from '../../skills/contract/scripts/contract.mjs';
import { foundationsPlan, iconsPlan, PER_CALL, setsPlan } from '../../skills/to-design/scripts/build-plan.mjs';
import { checkCoverage } from '../../skills/to-design/scripts/coverage.mjs';
import { recordResult } from '../../skills/to-design/scripts/ledger.mjs';
import { mockFigma, runPackage } from '../../skills/to-design/tests/mock-figma.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/carbon/carbon.foundations.json'), 'utf8');
const ICONS_DIR = join(ROOT, '.scratch/adapter-carbon/sources/npm/@carbon/icons@11.90.0/package');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const PACKAGER = join(ROOT, 'skills/to-design/scripts/package_native_builder.py');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-17T00:00:00.000Z';
const load = f => JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts', f), 'utf8'));
const contracts = ['text-input.component.json', 'select.component.json'].map(load)
  .map(c => approve({ ...c, selection: { ...c.selection, status: 'approved' } }, AT, { prototype: true }));

function pack(plan, state, core) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'form-schema-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, core, 'plan.json', 'out', '--state', 'state.json'], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stdout + run.stderr);
  return readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8');
}
const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
let ledger = null;
async function call({ plan, state }, core) {
  const result = await runPackage(pack(plan, state, core), mock.figma);
  if (result.error || result.summary.conflicts) throw new Error(JSON.stringify(result.error || result.conflicts));
  if (result.ledger) ledger = recordResult(ledger, result);
  return result;
}

await call(foundationsPlan(DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT }), CORE);
await call(iconsPlan(contracts, ICONS_DIR, ledger, { fileKey: FILE_KEY, at: AT }), CORE);
console.log(`icons built: ${Object.keys(ledger.icons.components).join(', ')}`);

let problems = 0;
for (const c of contracts) {
  const total = expand(c).length;
  for (let batch = 0; batch * PER_CALL < total; batch++)
    await call(setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, batch, prototype: true }), COMPONENTS_CORE);
  const cov = await call(setsPlan(c, DOC_TEXT, ledger, { fileKey: FILE_KEY, at: AT, mode: 'coverage', prototype: true }), COMPONENTS_CORE);
  const report = checkCoverage(c, cov, ledger);
  const set = await mock.figma.getNodeByIdAsync(ledger.sets[c.family.key].set.id);
  const wrong = [];
  for (const t of expand(c)) {
    const name = variantName(c, t);
    const variant = set.children.find(k => k.name === name);
    if (!variant) { wrong.push(`${name}: not built`); continue; }
    const layout = resolve(c, t).layout;
    for (const [node, fields] of Object.entries(layout)) {
      if (!('visible' in fields)) continue;
      const built = variant.findOne(n => n.name === node);
      if (!built) wrong.push(`${name}: ${node} missing`);
      else if (built.visible !== fields.visible) wrong.push(`${name}: ${node} is ${built.visible ? 'shown' : 'hidden'}, the Contract says ${fields.visible ? 'shown' : 'hidden'}`);
    }
    for (const node of ['Invalid icon', 'Warn icon']) {
      const inst = variant.findOne(n => n.name === node);
      const main = inst && (await inst.getMainComponentAsync())?.name;
      const want = node === 'Invalid icon' ? 'Warning--filled' : 'Warning--alt--filled';
      if (main !== want) wrong.push(`${name}: ${node} is an instance of ${main}, not ${want}`);
    }
  }
  console.log(`${c.family.name}: ${set.children.length}/${total} variants built, coverage problems ${report.problems.length}, visibility/icon problems ${wrong.length}`);
  report.problems.slice(0, 10).forEach(p => console.log('  coverage:', JSON.stringify(p)));
  wrong.slice(0, 10).forEach(w => console.log('  ', w));
  problems += report.problems.length + wrong.length;
}
process.exit(problems ? 1 : 0);
