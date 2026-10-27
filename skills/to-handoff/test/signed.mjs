// A Handoff of the "Invite teammates" fixture, generated and signed off with a test approval under a .scratch/
// base, for the Sign-off tests and for the suites that start from a signed Handoff (From-Prototype's hand-over,
// #440). Owner answers here are test inputs, never committed in the fixture's decisions.json. Each call
// assembles its own Design System under `base` and copies the Prototype there, so nothing committed changes.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve as approveContract, proposalContentHash } from '../../contract/scripts/contract.mjs';
import { approve, generate, handoffContentHash } from '../scripts/handoff.mjs';
import { fixture, repo } from './helpers.mjs';

// This Design System already has the form-controls text-input Contract, so the email field is a plain Contract
// usage here rather than the fixture's mid-run draft (#115).
const { 'contract:text-input': _draft, ...SHARED } = JSON.parse(readFileSync(fixture('decisions.json'), 'utf8'));
export const DECISIONS = { ...SHARED, 'recognise:input[type=email]': { contract: 'text-input', tuple: { size: 'md' }, via: 'element' } };
export const AT = '2026-10-17T12:00:00.000Z';

// The owner's answers to every owner question of the fixture: test inputs only.
export const OWNER = {
  'question:q-off-axis-email': { by: 'owner', answer: 'Keep the Contract look.' },
  'question:q-off-axis-role': { by: 'owner', answer: 'Keep the Contract look.' },
  'question:q-off-axis-copy': { by: 'owner', answer: 'Keep the Contract look.' },
  'question:q-no-contract-toast': { by: 'owner', answer: 'Raw for now; write the toast Contract next.' },
  'question:q-font': { by: 'owner', answer: 'Use IBM Plex Sans.' },
  'question:q-breakpoint-max-width-640px': { by: 'owner', answer: 'sm: stack the form fields.' },
  'question:q-state-error': { by: 'owner', to: 'developer' },
};

export const SCRATCH = repo('.scratch/to-handoff-tests');

// The form-controls fixtures are drafts. A draft Contract blocks Sign-off, so by default this Design System holds
// them approved, as test inputs written only under .scratch/; `drafts` keeps the ones it names as drafts.
export function designSystem(base = SCRATCH, { drafts = [] } = {}) {
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'ds-'));
  mkdirSync(join(dir, 'contracts'));
  mkdirSync(join(dir, 'proposals'));
  mkdirSync(join(dir, 'prototype'));
  copyFileSync(repo('design-systems/carbon/carbon.foundations.json'), join(dir, 'carbon.foundations.json'));
  copyFileSync(repo('design-systems/carbon/contracts/button.component.json'), join(dir, 'contracts/button.component.json'));
  for (const f of ['text-input', 'select']) {
    const c = JSON.parse(readFileSync(repo(`skills/contract/test/fixtures/form-controls/${f}.component.json`), 'utf8'));
    writeFileSync(join(dir, `contracts/${f}.component.json`), JSON.stringify(drafts.includes(f) ? c : approveContract(c, AT), null, 2) + '\n');
  }
  copyFileSync(fixture('proposals/avatar-stack.proposal.json'), join(dir, 'proposals/avatar-stack.proposal.json'));
  copyFileSync(fixture('index.html'), join(dir, 'prototype/index.html'));
  return dir;
}

// `runtime` runs the runtime reader, for a Handoff with screenshots under screens/.
export async function generated(decisions = { ...DECISIONS, ...OWNER }, base, { runtime = false, ...options } = {}) {
  const ds = designSystem(base, options);
  const prototype = join(ds, 'prototype/index.html');
  const result = await generate({ prototype, designSystem: ds, decisions, runtime });
  return { ds, prototype, result, handoffPath: result.path };
}

export const proposalHash = ds => proposalContentHash(JSON.parse(readFileSync(join(ds, 'proposals/avatar-stack.proposal.json'), 'utf8')));
export const shown = (ds, handoffPath) => ({ contentHash: handoffContentHash(JSON.parse(readFileSync(handoffPath, 'utf8'))), proposals: { 'avatar-stack': proposalHash(ds) } });

export async function signed(base, options) {
  const g = await generated(undefined, base, options);
  await approve({ handoffPath: g.handoffPath, designSystem: g.ds, ...shown(g.ds, g.handoffPath), at: AT, test: true });
  return g;
}
