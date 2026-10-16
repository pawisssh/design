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
  for (const f of ['text-input', 'select'])
    copyFileSync(repo(`skills/contract/test/fixtures/form-controls/${f}.component.json`), join(dir, `contracts/${f}.component.json`));
  copyFileSync(fixture('proposals/avatar-stack.proposal.json'), join(dir, 'proposals/avatar-stack.proposal.json'));
  return dir;
}
