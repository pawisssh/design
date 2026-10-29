// A copy of the fixture project holding fixtures/compound/chip.tsx (#255): a cva whose compoundVariants paint
// Tone x Selected, its Selected axis boolean. The chip is kept out of the committed fixture, whose families each have
// a committed Contract.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFamily } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { FIXTURE } from '../scripts/sources.mjs';

const CHIP = new URL('../fixtures/compound/chip.tsx', import.meta.url).pathname;

// `edit` rewrites chip.tsx's text.
export function chipProject(edit = text => text) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-chip-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, 'components/ui/chip.tsx'), edit(readFileSync(CHIP, 'utf8')));
  return dir;
}

// The chip project, read once: {project, doc (its Foundations document, with the chip), f (readFamily's result)}.
let run;
export const chipFamily = () => (run = run || (async () => {
  const project = chipProject();
  const doc = (await library({ project, families: ['chip'] })).doc;
  return { project, doc, f: await readFamily({ project, family: 'chip', foundations: doc }) };
})());
