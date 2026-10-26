// Every committed Design System through the offline chain: its Foundations document, its Contracts' icons and each
// Contract's Base Component built on a mock figma, read back with no differences. The other tests use Carbon or
// shadcn fixtures, so a Code Library they don't cover (CDS's camelCase icon keys, #403) first failed mid-run in Figma.
// A Contract whose icon package isn't fetched skips; fetch it with its Adapter's sources script.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../../contract/scripts/contract.mjs';
import { diff } from '../scripts/base-loop.mjs';
import { normalizeReadback } from '../scripts/readback.mjs';
import { basePlan, iconsPlan } from '../scripts/build-plan.mjs';
import { CORE, COMPONENTS_CORE, ROOT, chain } from './chain.mjs';
import { mockFigma } from './mock-figma.mjs';

const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-26T00:00:00.000Z';

// Known failures, each with its issue and the error it throws: the subtest asserts that error, so it fails once the
// fix lands and the entry is due for removal.
const ISSUE_407 = { issue: '#407', error: /FILL needs an auto layout parent/ };
const KNOWN = {
  'carbon/select.component.json': ISSUE_407, 'carbon/text-input.component.json': ISSUE_407,
  'shadcn/alert.component.json': ISSUE_407, 'shadcn/card.component.json': ISSUE_407, 'shadcn/input.component.json': ISSUE_407,
  'shadcn/label.component.json': ISSUE_407, 'shadcn/textarea.component.json': ISSUE_407,
};

// Where an Adapter's sources script unpacks an npm package (`.scratch/adapter-<key>/sources/npm/<name>@<version>/package`).
const iconsDir = c => join(ROOT, `.scratch/adapter-${c.source.adapter}/sources/npm/${c.icons.source.package}@${c.icons.source.version}/package`);

for (const ds of readdirSync(join(ROOT, 'design-systems'))) {
  const dir = join(ROOT, 'design-systems', ds);
  const docPath = join(dir, `${ds}.foundations.json`);
  if (!existsSync(docPath) || !existsSync(join(dir, 'contracts'))) continue;
  const docText = readFileSync(docPath, 'utf8');
  const doc = JSON.parse(docText);
  const contracts = readdirSync(join(dir, 'contracts')).filter(f => f.endsWith('.component.json'))
    .map(f => ({ file: f, contract: JSON.parse(readFileSync(join(dir, 'contracts', f), 'utf8')) }));
  const withIcons = contracts.map(({ contract: c }) => c).filter(c => c.icons && c.icons.source);
  const missing = withIcons.filter(c => !existsSync(iconsDir(c)));

  // A merge that changes an approved Contract voids its approval (rule 8), and no other check reads the committed
  // ones (#389's approval went stale under #417). Every invalid file is named, not only the first.
  test(`${ds}: every committed Contract is valid, its approval bound to its content`, () => {
    const invalid = contracts.map(({ file, contract }) => ({ file, errors: validate(contract, doc).errors })).filter(r => r.errors.length);
    assert.deepEqual(invalid, []);
  });

  test(`${ds}: every committed Contract's Base Component builds and reads back with no differences`,
    { skip: missing.length ? `icon package not fetched: ${missing.map(iconsDir).join(', ')}` : false }, async t => {
      const { call, foundations, ledger } = chain(mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] }).figma);
      await foundations(docText, { fileKey: FILE_KEY, at: AT });
      // One icons call per package: Carbon's four families share @carbon/icons.
      const bySource = new Map();
      for (const c of withIcons) {
        const icons = iconsDir(c);
        bySource.set(icons, [...(bySource.get(icons) || []), c]);
      }
      for (const [icons, group] of bySource) await call(iconsPlan(group, icons, ledger(), { fileKey: FILE_KEY, at: AT }), CORE);
      for (const { file, contract } of contracts) {
        const build = async () => {
          const result = await call(basePlan(contract, docText, ledger(), { fileKey: FILE_KEY, at: AT }), COMPONENTS_CORE);
          const d = diff(contract, normalizeReadback(result.readback, ledger()), doc);
          assert.deepEqual([d.changes, d.unread], [[], []]);
        };
        const known = KNOWN[`${ds}/${file}`];
        await t.test(known ? `${file} (known: ${known.issue})` : file, () =>
          known ? assert.rejects(build, known.error, `${known.issue} no longer fails here: remove its KNOWN entry`) : build());
      }
    });
}
