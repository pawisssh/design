// Prototype for #79, offline: a Component Proposal through To-design's unchanged plans and cores on the mock
// Figma, then the two endings for its set when a Contract with the same key arrives:
//   A. no retirement act: today's code builds a second set beside the Proposal's (the hazard the gate closes);
//   B. adoption in place (#80 section 9): the ledger is re-keyed and the Contract rebuilds the same nodes.
// The owner's approval is SIMULATED throughout (by: "orchestrator (prototype)"). Run from the repo root:
//   node prototype/proposal-figma/run-mock.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, asDraft, contentHash, expand, PROTOTYPE_APPROVER, variantName } from '../../skills/contract/scripts/contract.mjs';
import { basePlan, foundationsPlan, iconsPlan, PER_CALL, setsPlan } from '../../skills/to-design/scripts/build-plan.mjs';
import { applyEdits, diff, review } from '../../skills/to-design/scripts/base-loop.mjs';
import { checkCoverage } from '../../skills/to-design/scripts/coverage.mjs';
import { recordResult } from '../../skills/to-design/scripts/ledger.mjs';
import { normalizeReadback } from '../../skills/to-design/scripts/readback.mjs';
import { mockFigma, runPackage } from '../../skills/to-design/tests/mock-figma.mjs';
import { adoptInPlace, buildReady, buildView, ledgerView, LKEY, namespaced, proposalHash } from './proposal-view.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/carbon/carbon.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const BUTTON = JSON.parse(readFileSync(join(ROOT, 'design-systems/carbon/contracts/button.component.json'), 'utf8'));
const PROPOSAL = JSON.parse(readFileSync(join(HERE, 'plan-option.proposal.json'), 'utf8'));
const ICONS_DIR = join(ROOT, 'skills/to-design/tests/fixtures/carbon-icons@11.90.0');
const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
const COMPONENTS = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
const PACKAGER = join(ROOT, 'skills/to-design/scripts/package_native_builder.py');
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-17T00:00:00.000Z';
const LIB = DOC.source.codeLibrary;
const KEY = PROPOSAL.family.key;
const report = {};
const fail = m => { console.error('FAIL', m); process.exitCode = 1; };
const check = (ok, m) => { if (!ok) fail(m); };

function pack(plan, state, core) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'proposal-figma-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, core, 'plan.json', 'out', '--state', 'state.json'], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stdout + run.stderr);
  return { code: readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8'), chars: JSON.parse(run.stdout).chars };
}

async function call(env, derived, core = COMPONENTS) {
  const { plan, state } = derived;
  const { code, chars } = pack(plan, state, core);
  const result = await runPackage(code, env.mock.figma);
  if (result.error) throw new Error(JSON.stringify(result));
  if (result.summary.conflicts === 0 && !plan.options.readOnly && result.ledger) env.ledger = recordResult(env.ledger, result);
  return { result, chars };
}

// The Proposal's calls: the plans see the ledger with its "proposal:<key>" entries under the plain key.
const pBase = (env, view, o = {}) => call(env, namespaced(basePlan(view, DOC_TEXT, ledgerView(env.ledger, KEY), { fileKey: FILE_KEY, at: AT, ...o }), KEY, env.ledger));
const pSets = (env, view, o = {}) => call(env, namespaced(setsPlan(view, DOC_TEXT, ledgerView(env.ledger, KEY), { fileKey: FILE_KEY, at: AT, prototype: true, ...o }), KEY, env.ledger));
const readback = (env, r) => normalizeReadback(r.result.readback, ledgerView(env.ledger, KEY));

async function proposalSet() {
  const env = { mock: mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] }), ledger: null };
  let p = JSON.parse(JSON.stringify(PROPOSAL));
  let view = buildView(p, LIB);
  await call(env, foundationsPlan(DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT }), CORE);
  await call(env, iconsPlan([BUTTON, view], ICONS_DIR, env.ledger, { fileKey: FILE_KEY, at: AT }), CORE);

  // 3. base loop: build, owner tweak (simulated), apply into the Proposal, rebuild until clean
  const built = await pBase(env, view);
  const comp = await env.mock.figma.getNodeByIdAsync(built.result.readback.id);
  comp.setBoundVariable('itemSpacing', await env.mock.figma.variables.getVariableByIdAsync(env.ledger.foundations.variables['spacing-04']));
  const tweaked = readback(env, await pBase(env, view, { readOnly: true }));
  const r = review(view, tweaked, DOC, { by: 'owner (simulated, prototype #79)' });
  const { contract: edited } = applyEdits(view, r.proposals, { confirm: 'all' });
  // A Proposal keeps no per-value by/was (#60): the edit lands in place as a plain value.
  const strip = rules => JSON.parse(JSON.stringify(rules), (k, v) => (v && typeof v === 'object' && 'by' in v && 'was' in v ? (({ by, was, ...rest }) => rest)(v) : v));
  const before = proposalHash(p);
  p = { ...p, layout: strip(edited.layout), paint: strip(edited.paint), status: 'pending', approval: null };
  view = buildView(p, LIB);
  const rebuilt = readback(env, await pBase(env, view));
  const clean = diff(view, rebuilt, DOC);
  check(!clean.changes.length && !clean.unread.length, 'base reads back clean after the edit');
  // 4. approval (SIMULATED) and the per-file "base reviewed" mark the sets gate needs
  p = { ...p, status: 'approved', approval: { by: PROTOTYPE_APPROVER, at: AT, contentHash: proposalHash(p) } };
  view = buildView(p, LIB);
  env.ledger.bases[LKEY(KEY)].reviewed = { contentHash: proposalHash(p), at: AT };
  const gate = env.ledger.bases[LKEY(KEY)].reviewed.contentHash === p.approval.contentHash;
  // 5. batch build and coverage
  const total = expand(view).length;
  const runs = [];
  for (let batch = 0; batch < Math.ceil(total / PER_CALL); batch++) runs.push(await pSets(env, view, { batch }));
  const cov = await pSets(env, view, { mode: 'coverage' });
  const coverage = checkCoverage(view, cov.result, ledgerView(env.ledger, KEY));
  return { env, p, view, base: { review: r.changes.map(c => `${c.kind} ${c.node}.${c.field}`), hashMoved: before !== proposalHash(p), cleanAfterRebuild: !clean.changes.length, setsGate: gate }, runs, total, coverage };
}

// The Contract an Adapter later reads for the same family (simulated): axis "selected" became "checked" off/on,
// and code has an Active state the Proposal lacked. Code-anchored: its own source, code and figma.
function arrivingContract(view) {
  const c = JSON.parse(JSON.stringify(view));
  const ren = m => Object.fromEntries(Object.entries(m).map(([k, v]) => (k === 'selected' ? ['checked', v === 'true' ? 'on' : 'off'] : [k, v])));
  c.axes[0] = { key: 'checked', label: 'Checked', default: 'off', defaultSource: 'plan-option.tsx default', values: [{ key: 'off', label: 'Off', code: {} }, { key: 'on', label: 'On', code: { checked: true } }] };
  c.axes[1].values.splice(2, 0, { key: 'active', label: 'Active', code: null, css: ':active' });
  for (const sec of ['layout', 'paint']) c[sec] = c[sec].map(rule => ({ ...rule, match: ren(rule.match) }));
  c.paint.push({ match: { checked: 'off', state: 'active' }, set: { 'Plan option': { fill: { token: 'background-active' } } } });
  c.source = { codeLibrary: LIB, adapter: 'simulated', repository: 'https://example.invalid/app', tag: 'v0', commit: 'a'.repeat(40), packages: {}, files: {}, snapshotId: 'sha256:' + 'b'.repeat(64) };
  c.code = { framework: 'react', package: 'app', component: 'PlanOption', import: "import { PlanOption } from '@/components/plan-option';", alwaysEmit: [] };
  c.figma = { page: 'Plan options', componentSetName: 'Plan option', description: 'PlanOption (app).', header: { type: 'Component', title: 'Plan option', namespace: 'app' }, grid: { columns: ['checked'], rows: ['state'] } };
  c.selection = { status: 'draft', omit: [], expectedCount: 0, approval: null };
  c.selection.expectedCount = expand(c).length;
  return approve(c, AT, { prototype: true });
}
const retirementMap = t => ({ checked: t.selected === 'true' ? 'on' : 'off', state: t.state });

async function contractBuild(env, contract) {
  const cBase = await call(env, basePlan(asDraft(contract), DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT }));
  const runs = [];
  for (let batch = 0; batch < Math.ceil(expand(contract).length / PER_CALL); batch++)
    runs.push(await call(env, setsPlan(contract, DOC_TEXT, env.ledger, { fileKey: FILE_KEY, at: AT, prototype: true, batch })));
  const sets = env.mock.figma.root.children.flatMap(pg => pg.findAll(n => n.type === 'COMPONENT_SET' && n.name === 'Plan option').map(s => ({ page: pg.name, id: s.id, children: s.children.length, description: s.description })));
  return { cBase, runs, sets };
}

// --- the gate on a description-only Proposal and on the full one
const descOnly = { ...PROPOSAL, layout: [], paint: [] };
report.gate = {
  descriptionOnly: buildReady(descOnly, DOC).errors,
  full: buildReady(PROPOSAL, DOC),
  sameKeyContract: buildReady(PROPOSAL, DOC, { contracts: [{ family: { key: KEY } }] }).errors,
};
check(report.gate.full.ok, 'the sample Proposal passes the build gate (rule 5 over every combination)');

// --- the Proposal set
const P = await proposalSet();
const pRec = P.env.ledger.sets[LKEY(KEY)];
report.proposalSet = {
  ledgerKeys: { bases: Object.keys(P.env.ledger.bases), sets: Object.keys(P.env.ledger.sets) },
  derivedFigma: P.view.figma,
  baseLoop: P.base,
  variants: P.total,
  built: P.runs.map(x => ({ summary: x.result.summary, chars: x.chars })),
  coverage: { ok: P.coverage.ok, problems: P.coverage.problems },
  snapshotIdInLedger: pRec.snapshotId,
};
check(P.coverage.ok, 'coverage passes on the Proposal set');

// --- A. a same-key Contract built with no retirement act
const A = await proposalSet();
const contractA = arrivingContract(A.view);
const hazard = await contractBuild(A.env, contractA);
report.noRetirement = { setsNamedPlanOption: hazard.sets, ledgerKeys: Object.keys(A.env.ledger.sets) };
check(hazard.sets.length === 2, 'expected the hazard: two sets');

// --- B. adoption in place
const B = await proposalSet();
const contractB = arrivingContract(B.view);
const oldRec = B.env.ledger.sets[LKEY(KEY)];
const oldIds = Object.fromEntries(expand(B.view).map((t, i) => [variantName(B.view, t), oldRec.variants[i]]));
B.env.ledger = adoptInPlace(B.env.ledger, B.view, contractB, retirementMap, AT);
const adopted = await contractBuild(B.env, contractB);
const newRec = B.env.ledger.sets[KEY];
const kept = expand(B.view).filter((t, i) => {
  const j = expand(contractB).findIndex(u => JSON.stringify(u) === JSON.stringify(retirementMap(t)));
  return newRec.variants[j] === oldRec.variants[i];
}).length;
const setNode = await B.env.mock.figma.getNodeByIdAsync(newRec.set.id);
const header = setNode.parent.parent.children.find(n => n.name === 'Header');
report.adoptInPlace = {
  sameSetNode: newRec.set.id === oldRec.set.id,
  variantsKeptById: `${kept}/${expand(B.view).length}`,
  variantsNow: `${setNode.children.length} (Contract expects ${expand(contractB).length})`,
  created: adopted.runs.map(x => x.result.summary),
  setsNamedPlanOption: adopted.sets,
  headerType: header && header.componentProperties && Object.entries(header.componentProperties).filter(([k]) => k.startsWith('Type')).map(([, v]) => v.value)[0],
  pageName: B.env.mock.figma.root.children.find(pg => pg.id === newRec.page).name,
  ledgerKeys: { bases: Object.keys(B.env.ledger.bases), sets: Object.keys(B.env.ledger.sets) },
  orphans: newRec.orphans,
  sampleIds: Object.entries(oldIds).slice(0, 2),
};
check(report.adoptInPlace.sameSetNode, 'adoption keeps the set node');

console.log(JSON.stringify(report, null, 2));
