// Prototype for #79, live on the smoke draft only: derive the Proposal's base or sets plan through the shim,
// namespaced under "proposal:<key>", for the normal packager -> use_figma -> ledger.mjs record cycle.
// Uses its own ledger copy (--ledger), never the main checkout's ledger.
//   node prototype/proposal-figma/live.mjs base|base-read|approve|sets|coverage|check-coverage --ledger <copy> --out <run> [--batch N]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOTYPE_APPROVER } from '../../skills/contract/scripts/contract.mjs';
import { basePlan, setsPlan } from '../../skills/to-design/scripts/build-plan.mjs';
import { diff, normalizeBaseResult } from '../../skills/to-design/scripts/base-loop.mjs';
import { checkCoverage } from '../../skills/to-design/scripts/coverage.mjs';
import { buildReady, buildView, ledgerView, LKEY, namespaced, proposalHash } from './proposal-view.mjs';

const FILE_KEY = 'Alpt8YsrzDVu6DnwsrF26h';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const DOC_TEXT = readFileSync(join(ROOT, 'design-systems/carbon/carbon.foundations.json'), 'utf8');
const DOC = JSON.parse(DOC_TEXT);
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const step = process.argv[2];
const ledgerPath = arg('--ledger');
const out = arg('--out');
if (!ledgerPath || !out) throw new Error('--ledger and --out are required');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
const approvedPath = join(HERE, 'live/plan-option.approved-simulated.proposal.json');
let p = JSON.parse(readFileSync(join(HERE, 'plan-option.proposal.json'), 'utf8'));
try { p = JSON.parse(readFileSync(approvedPath, 'utf8')); } catch {}
const key = p.family.key;
const view = buildView(p, DOC.source.codeLibrary);
const at = new Date().toISOString();
mkdirSync(out, { recursive: true });
const write = d => { writeFileSync(join(out, 'plan.json'), JSON.stringify(d.plan)); writeFileSync(join(out, 'state.json'), JSON.stringify(d.state)); console.log(JSON.stringify({ ok: true, family: d.plan.family, page: d.plan.page })); };

const gate = buildReady(p, DOC);
if (!gate.ok) throw new Error(gate.errors.join('; '));
if (step === 'base' || step === 'base-read')
  write(namespaced(basePlan(view, DOC_TEXT, ledgerView(ledger, key), { fileKey: FILE_KEY, at, readOnly: step === 'base-read' }), key, ledger));
else if (step === 'diff') {
  const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
  console.log(JSON.stringify(diff(view, normalizeBaseResult({ ...result, family: key }, ledgerView(ledger, key)), DOC), null, 1));
} else if (step === 'approve') {
  // SIMULATED owner approval (prototype only) and the per-file "base reviewed" mark in the ledger copy
  const hash = proposalHash(p);
  writeFileSync(approvedPath, JSON.stringify({ ...p, status: 'approved', approval: { by: PROTOTYPE_APPROVER, at, contentHash: hash } }, null, 2));
  ledger.bases[LKEY(key)].reviewed = { contentHash: hash, at, simulated: true };
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(JSON.stringify({ approved: hash }));
} else if (step === 'sets' || step === 'coverage') {
  const r = ledger.bases[LKEY(key)] && ledger.bases[LKEY(key)].reviewed;
  if (!r || p.status !== 'approved' || r.contentHash !== p.approval.contentHash) throw new Error('sets gate: the owner has not approved this Proposal at its base in this file');
  write(namespaced(setsPlan(view, DOC_TEXT, ledgerView(ledger, key), { fileKey: FILE_KEY, at, prototype: true, ...(step === 'coverage' ? { mode: 'coverage' } : { batch: Number(arg('--batch') || 0) }) }), key, ledger));
} else if (step === 'check-coverage') {
  const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
  console.log(JSON.stringify(checkCoverage(view, { ...result, family: key }, ledgerView(ledger, key)), null, 1));
} else throw new Error(`unknown step ${step}`);
