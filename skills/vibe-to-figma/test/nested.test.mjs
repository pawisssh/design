// A holding family's variant fingerprints (#593): they cover each nested instance's family, variant and props as the
// holder's `instances` rules write them, never the held Contract, so a rebuild of the held family after a style edit
// rewrites no holding variant and makes none Held. A Contract without `instances` keeps the fingerprints it had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unbuildable, variantFingerprints } from '../scripts/build.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`../../to-design/tests/fixtures/nested/${name}.component.json`, import.meta.url), 'utf8'));
const BUTTON = fixture('button');
const CARD = fixture('card');
const prints = c => variantFingerprints(c).map(v => v.fingerprint);

test('a held family restyled leaves the holding variants\' fingerprints, and a Contract without instances keeps its own', () => {
  // the fingerprints from before #593, of a Contract without instances
  assert.deepEqual(prints(BUTTON), [
    'sha256:14575ce7519ca29764a57b3d898cb65c32d2a0074e63ee04def6a79f01143b78',
    'sha256:60c9728367744f84e2068e756282f3851560d4bc4f331375cea3c793e546c5e5',
    'sha256:df4d40b9f1f2aa99dbc587602448591b74e41aa7ceb2f39717ccf51d078c2d50',
    'sha256:b6e445ecb0beebc065bc8dcd5ae6debefc13a43f30727aa6907638196281e218',
  ]);
  const card = prints(CARD);
  // Button restyled: its own fingerprints move, the Card's do not (variantFingerprints never reads the held Contract)
  const restyled = { ...BUTTON, paint: [...BUTTON.paint, { match: { kind: 'primary' }, set: { Button: { stroke: { token: 'border' } } } }] };
  assert.notDeepEqual(prints(restyled), prints(BUTTON));
  assert.deepEqual(prints(CARD), card);
  // the Card's own rules for a nested instance are its fingerprints: a written variant or prop moves only the variants it reaches
  const label = { ...CARD, instances: [...CARD.instances, { match: { density: 'compact' }, set: { Confirm: { props: { label: 'OK' } } } }] };
  assert.deepEqual(prints(label).map((f, i) => f === card[i]), [true, false]);
  const kind = { ...CARD, instances: [...CARD.instances, { match: { density: 'comfortable' }, set: { Cancel: { variant: { kind: 'primary' } } } }] };
  assert.deepEqual(prints(kind).map((f, i) => f === card[i]), [false, true]);
});

// #317 Decision 8: a nested instance's fingerprint names the held family, its key and Design System, beside the rules
test('a nested instance\'s fingerprint names the held family and its Design System', () => {
  const card = prints(CARD);
  // the same node and rules, holding another family of the same Design System
  const text = JSON.stringify(CARD).replaceAll('family:button', 'family:action');
  const other = { ...JSON.parse(text), dependencies: { ...CARD.dependencies, families: [{ key: 'action', contract: 'action' }] } };
  assert.deepEqual(prints(other).map((f, i) => f === card[i]), [false, false]);
  // the same key, in another Design System
  const foreign = { ...CARD, dependencies: { ...CARD.dependencies, families: [{ key: 'button', contract: 'button', designSystem: 'carbon' }] } };
  assert.deepEqual(prints(foreign).map((f, i) => f === card[i]), [false, false]);
});

// A holder of a family not built here is refused by name and the rest build (#593): one in another Design System
// (#594), a draft, a --skip'ped family, or one with no approved Contract; a holder of a refused holder goes too.
test('the gate leaves out a holder of a family not built here, by name, and builds the rest', () => {
  const panel = { ...CARD, family: { ...CARD.family, key: 'panel', name: 'Panel' },
    anatomy: { ...CARD.anatomy, children: [{ name: 'Inner', type: 'INSTANCE', instanceOf: 'family:card' }] },
    instances: [], dependencies: { ...CARD.dependencies, families: [{ key: 'card', contract: 'card' }] } };
  assert.deepEqual(unbuildable({ button: BUTTON, card: CARD, panel }), {});
  assert.deepEqual(Object.keys(unbuildable({ card: CARD, panel }, { drafts: ['button'] })), ['card', 'panel']);
  assert.match(unbuildable({ card: CARD }, { drafts: ['button'] }).card, /holds button, a draft/);
  assert.match(unbuildable({ card: CARD }, { skipped: ['button'] }).card, /holds button, which --skip leaves out/);
  assert.match(unbuildable({ card: CARD }).card, /holds button, which has no approved Contract here/);
  const foreign = { ...CARD, dependencies: { ...CARD.dependencies, families: [{ key: 'button', contract: 'button', designSystem: 'carbon' }] } };
  assert.match(unbuildable({ button: BUTTON, card: foreign }).card, /holds button of Design System carbon/);
  assert.match(unbuildable({ card: CARD, panel }, { drafts: ['button'] }).panel, /holds card, which is not built here/);
});
