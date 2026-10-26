// The offline chain's shared setup: the two cores and a call that runs a plan on a mock figma and records its result.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationsPlan } from '../scripts/build-plan.mjs';
import { recordResult } from '../scripts/ledger.mjs';
import { runPackage } from './mock-figma.mjs';
import { pack } from './pack.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CORE = join(ROOT, 'skills/to-design/assets/builder-core.js');
export const COMPONENTS_CORE = join(ROOT, 'skills/to-design/assets/builder-core-components.js');
// Carbon's Foundations document as it was with a Button-only closure, frozen so these counts and plans stay put
// as Contracts are committed.
export const BUTTON_CLOSURE_DOC = join(ROOT, 'skills/to-design/tests/fixtures/button-closure/carbon.foundations.json');

// -> {call({plan, state}, core) -> result, foundations(docText, options), ledger()}: each call fails on an error or a
// conflict; foundations builds every chunk of the document.
export function chain(figma) {
  let ledger = null;
  const call = async ({ plan, state }, core) => {
    const result = await runPackage(pack(plan, state, core).code, figma);
    assert.ok(!result.error, JSON.stringify(result.error));
    assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
    if (result.ledger) ledger = recordResult(ledger, result);
    return result;
  };
  const foundations = async (docText, options) => {
    const first = foundationsPlan(docText, ledger, options);
    await call(first, CORE);
    for (let chunk = 2; chunk <= (first.plan.chunk ? first.plan.chunk.of : 1); chunk++)
      await call(foundationsPlan(docText, ledger, { ...options, chunk }), CORE);
  };
  return { call, foundations, ledger: () => ledger };
}
