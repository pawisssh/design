// A holding family's variant fingerprints (#593): they cover each nested instance's family, variant and props as the
// holder's `instances` rules write them, never the held Contract, so a rebuild of the held family after a style edit
// rewrites no holding variant and makes none Held. A Contract without `instances` keeps the fingerprints it had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { variantFingerprints } from '../scripts/build.mjs';

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
