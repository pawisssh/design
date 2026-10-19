// Shared test setup: the "Invite teammates" fixture and a Design System assembled in a temp dir from the
// committed Carbon Foundations document and Button Contract, the form-control fixture Contracts and the fixture
// avatar-stack Proposal, so no test writes under design-systems/.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = p => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export const fixture = p => fileURLToPath(new URL(`fixtures/invite-teammates/${p}`, import.meta.url));
export const PROTOTYPE = fixture('index.html');
export const DECISIONS = JSON.parse(readFileSync(fixture('decisions.json'), 'utf8'));
export const BUTTON = repo('design-systems/carbon/contracts/button.component.json');

export function designSystem() {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-ds-'));
  mkdirSync(join(dir, 'contracts'));
  mkdirSync(join(dir, 'proposals'));
  copyFileSync(repo('design-systems/carbon/carbon.foundations.json'), join(dir, 'carbon.foundations.json'));
  copyFileSync(BUTTON, join(dir, 'contracts/button.component.json'));
  // No text-input: the fixture's email field is a family with no Contract, which the Adapter drafts mid-run (#115).
  copyFileSync(repo('skills/contract/test/fixtures/form-controls/select.component.json'), join(dir, 'contracts/select.component.json'));
  copyFileSync(fixture('proposals/avatar-stack.proposal.json'), join(dir, 'proposals/avatar-stack.proposal.json'));
  return dir;
}

// The v0 request-access Prototype, and the committed shadcn Foundations document and Contracts, named one by one,
// in a temp Design System.
export const V0 = fileURLToPath(new URL('fixtures/v0-app', import.meta.url));
export function shadcnDesignSystem() {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-shadcn-'));
  mkdirSync(join(dir, 'contracts'));
  copyFileSync(repo('design-systems/shadcn/shadcn.foundations.json'), join(dir, 'shadcn.foundations.json'));
  for (const family of ['alert', 'button', 'card'])
    copyFileSync(repo(`design-systems/shadcn/contracts/${family}.component.json`), join(dir, `contracts/${family}.component.json`));
  return dir;
}
