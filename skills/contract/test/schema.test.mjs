// contract.schema.json agrees with the fixtures and with validate(). Run: node --test skills/contract/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as contract from '../scripts/contract.mjs';

const root = new URL('../../../', import.meta.url);
const load = rel => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
const schema = load('skills/contract/contract.schema.json');
const foundations = load('design-systems/carbon/carbon.foundations.json');
const fixtures = {
  button: 'design-systems/carbon/contracts/button.component.json',
  'owner-edits': 'skills/contract/test/fixtures/button.owner-edits.component.json',
  drafted: 'skills/contract/test/fixtures/button.drafted.component.json',
};

// The JSON Schema keywords contract.schema.json uses, and nothing more (the repo takes no dependencies).
function check(s, v, path = '$', errors = []) {
  if (s.$ref) return check(s.$ref.split('/').slice(1).reduce((o, k) => o[k], schema), v, path, errors);
  const typeOf = x => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  const fail = msg => errors.push(`${path}: ${msg}`);
  if (s.type) {
    const types = [].concat(s.type), t = typeOf(v);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return fail(`expected ${types}, got ${t}`), errors;
  }
  if ('const' in s && v !== s.const) fail(`expected ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) fail(`expected one of ${s.enum}`);
  if (s.pattern && typeof v === 'string' && !new RegExp(s.pattern).test(v)) fail(`does not match ${s.pattern}`);
  if (s.minLength && typeof v === 'string' && v.length < s.minLength) fail('too short');
  if ('minimum' in s && typeof v === 'number' && v < s.minimum) fail(`below ${s.minimum}`);
  if (s.minItems && Array.isArray(v) && v.length < s.minItems) fail('too few items');
  if (s.items && Array.isArray(v)) v.forEach((x, i) => check(s.items, x, `${path}[${i}]`, errors));
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of s.required || []) if (!(k in v)) fail(`missing ${k}`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties && s.properties[k]) check(s.properties[k], x, `${path}.${k}`, errors);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(s.additionalProperties, x, `${path}.${k}`, errors);
    }
  }
  if (s.anyOf && !s.anyOf.some(alt => check(alt, v, path).length === 0)) fail('matches no alternative');
  return errors;
}

for (const [name, rel] of Object.entries(fixtures))
  test(`the ${name} Contract satisfies contract.schema.json`, () => {
    assert.deepEqual(check(schema, load(rel)), []);
  });

test('an approved Contract satisfies contract.schema.json', () => {
  assert.deepEqual(check(schema, contract.approve(load(fixtures.button), '2026-10-16T09:00:00Z')), []);
});

test('the schema rejects what validate rejects: a raw value without a reason', () => {
  const c = load(fixtures.button);
  delete c.layout[0].set.Button.maxWidth.reason;
  assert.ok(check(schema, c).some(e => e.startsWith('$.layout[0].set.Button.maxWidth')));
  assert.equal(contract.validate(c, foundations).ok, false);
});

test('every key the schema requires at the top level and in selection is required by validate', () => {
  const cases = [
    ...schema.required.map(k => [k, c => delete c[k]]),
    ...schema.properties.selection.required.map(k => [`selection.${k}`, c => delete c.selection[k]]),
  ];
  for (const [key, drop] of cases) {
    const c = load(fixtures.button);
    drop(c);
    assert.ok(check(schema, c).length > 0, `schema accepts a Contract without ${key}`);
    const { ok, errors } = contract.validate(c, foundations);
    assert.ok(!ok && errors.some(e => e.at === key), `validate accepts a Contract without ${key}`);
  }
});

test('the schema rejects the drafted entry shapes validate rejects; a bad key path is validate rule 9 only', () => {
  const key = 'axes.size.values.lg.label';
  for (const entry of [{ by: 'agent', evidence: [], fingerprint: 'sha256:' + '0'.repeat(64) }, { by: 'agent', evidence: ['x'], fingerprint: 'sha256:abc' },
    { by: 'owner' }, { by: 'designer', was: 'Big' }]) {
    const c = load(fixtures.drafted);
    c.drafted[key] = entry;
    assert.ok(check(schema, c).some(e => e.startsWith(`$.drafted.${key}`)), `schema accepts ${JSON.stringify(entry)}`);
    assert.ok(contract.validate(c, foundations).errors.some(e => e.rule === 9 && e.at === `drafted.${key}`));
  }
  const c = load(fixtures.drafted);
  c.drafted['anatomy.Footer'] = { by: 'owner', was: null };
  assert.deepEqual(check(schema, c), []);
  assert.ok(contract.validate(c, foundations).errors.some(e => e.rule === 9 && e.at === 'drafted.anatomy.Footer'));
});
