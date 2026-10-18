#!/usr/bin/env node
// Agent-side apply step for To-preview's export (#33). Applies the omit patch to the Contract in place.
//   node skills/to-preview/scripts/apply-omit.mjs <omit-patch.json> --checked <checked.json> --contract <component.json> [--foundations <file>]
//
// - <omit-patch.json> is the export, exactly {family, snapshotId, omit, expectedCount}.
// - <checked.json> is the page's companion download {family, snapshotId, checked: [tuple]}: the tuples
//   the owner left checked, so the expansion is compared tuple by tuple, not only by count.
// - The foundations document defaults to the single *.foundations.json next to the contracts folder.
// It applies the patch with the shared module's applyOmit (which resets the Contract to draft with no
// approval), validates, asserts the expanded set equals the checked tuples and that nothing but
// `selection` changed, and only then writes. Exit code 1 and nothing written on any failure.
// Vibe-to-Figma's approve (#177) calls omitApplied() for each family before it writes any of them.
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { applyOmit, expand, tupleKey, validate } from '../../contract/scripts/contract.mjs';
import { foundationsPathFor, readJson, writeJson } from '../../contract/scripts/io.mjs';

/**
 * omitApplied({contract, patch, checked, foundations}) -> the patched Contract (a draft, approval null), writing
 * nothing. Throws when the patch is not exactly {family, snapshotId, omit, expectedCount}, the checked tuples are
 * from another export, the result is invalid, its expansion differs from the checked tuples, or more than
 * `selection` changed.
 */
export function omitApplied({ contract, patch, checked, foundations }) {
  const keys = Object.keys(patch).sort().join(',');
  if (keys !== 'expectedCount,family,omit,snapshotId') throw new Error(`the patch has fields ${keys}; expected exactly family, snapshotId, omit, expectedCount`);
  if (checked.family !== patch.family || checked.snapshotId !== patch.snapshotId)
    throw new Error('the checked tuples are from another export (family or snapshotId differ from the patch)');

  const next = applyOmit(contract, patch);
  const { ok, errors } = validate(next, foundations);
  if (!ok) throw new Error(`the patched Contract is invalid:\n${errors.map(e => `  [rule ${e.rule}] ${e.message}`).join('\n')}`);

  const id = t => tupleKey(next, t);
  const got = new Set(expand(next).map(id));
  const want = new Set(checked.checked.map(id));
  const missing = [...want].filter(k => !got.has(k));
  const extra = [...got].filter(k => !want.has(k));
  if (missing.length || extra.length || want.size !== checked.checked.length)
    throw new Error(`the expansion differs from the checked tuples: ${missing.length} checked but omitted (${missing.slice(0, 3).join(', ')}), ${extra.length} unchecked but kept (${extra.slice(0, 3).join(', ')})`);

  const withoutSelection = c => JSON.stringify({ ...c, selection: null });
  if (withoutSelection(next) !== withoutSelection(contract)) throw new Error('applying the patch changed more than selection');
  return next;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const usage = 'usage: apply-omit.mjs <omit-patch.json> --checked <checked.json> --contract <component.json> [--foundations <file>]';
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { checked: { type: 'string' }, contract: { type: 'string' }, foundations: { type: 'string' } } });
  } catch (e) {
    console.error(`${e.message}\n${usage}`);
    process.exit(2);
  }
  const { values: { checked: checkedPath, contract: contractPath, foundations: foundationsFlag }, positionals: [patchPath] } = args;
  if (!patchPath || !checkedPath || !contractPath) {
    console.error(usage);
    process.exit(2);
  }
  const fail = message => { console.error(`FAIL: ${message}`); process.exit(1); };
  const read = path => { try { return readJson(path); } catch (e) { return fail(e.message); } };

  const contract = read(contractPath);
  const patch = read(patchPath);
  const checked = read(checkedPath);
  let foundationsPath;
  try { foundationsPath = foundationsPathFor(contractPath, foundationsFlag); } catch (e) { fail(e.message); }
  const foundations = read(foundationsPath);

  let next;
  try { next = omitApplied({ contract, patch, checked, foundations }); } catch (e) { fail(e.message); }

  // spliced into the file's own layout, so the owner's diff shows only the selection change
  writeJson(contractPath, next);
  console.log(`${contractPath}: ${expand(next).length} variants, omit ${next.selection.omit.length} pattern(s), status draft, approval cleared`);
}
