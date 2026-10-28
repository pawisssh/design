// Tests for Component Proposals (#111): validateProposal, proposalContentHash, asPending and proposal.schema.json.
// Fixture: promo-banner.proposal.json, a promotional banner the Carbon Code Library does not ship, composed with Button.
// Run: node --test skills/contract/test/proposal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as contract from '../scripts/contract.mjs';

const root = new URL('../../../', import.meta.url);
const load = rel => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
const proposal = () => load('skills/contract/test/fixtures/promo-banner.proposal.json');
const button = () => load('design-systems/carbon/contracts/button.component.json');
const foundations = () => load('design-systems/carbon/carbon.foundations.json');
const known = () => ({ contracts: [button()], proposals: [] });
const rules = result => result.errors.map(e => e.rule);

// The JSON Schema keywords the two schemas use; a $ref may name contract.schema.json.
const schemas = { 'proposal.schema.json': load('skills/contract/proposal.schema.json'), 'contract.schema.json': load('skills/contract/contract.schema.json') };
function check(s, v, file = 'proposal.schema.json', path = '$', errors = []) {
  if (s.$ref) {
    const [ref, pointer] = s.$ref.split('#');
    const target = ref || file;
    return check(pointer.split('/').slice(1).reduce((o, k) => o[k], schemas[target]), v, target, path, errors);
  }
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
  if (s.minItems && Array.isArray(v) && v.length < s.minItems) fail('too few items');
  if (s.items && Array.isArray(v)) v.forEach((x, i) => check(s.items, x, file, `${path}[${i}]`, errors));
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of s.required || []) if (!(k in v)) fail(`missing ${k}`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties && s.properties[k]) check(s.properties[k], x, file, `${path}.${k}`, errors);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(s.additionalProperties, x, file, `${path}.${k}`, errors);
    }
  }
  if (s.anyOf && !s.anyOf.some(alt => check(alt, v, file, path).length === 0)) fail('matches no alternative');
  if (s.not && check(s.not, v, file, path).length === 0) fail('matches a forbidden shape');
  return errors;
}

test('a valid Proposal validates, satisfies proposal.schema.json and is not ready to retire', () => {
  const result = contract.validateProposal(proposal(), foundations(), known());
  assert.deepEqual(result, { ok: true, errors: [], readyToRetire: null });
  assert.deepEqual(check(schemas['proposal.schema.json'], proposal()), []);
});

test('a forbidden block or a code mapping fails, naming it', () => {
  for (const key of ['source', 'code', 'selection', 'excluded', 'figma']) {
    const p = Object.assign(proposal(), { [key]: {} });
    const result = contract.validateProposal(p, foundations(), known());
    assert.equal(result.ok, false, key);
    assert.ok(result.errors.some(e => e.rule === 'schema' && e.at === key && e.message.includes(`never has \`${key}\``)), key);
    assert.ok(check(schemas['proposal.schema.json'], p).some(e => e.includes('forbidden')), key);
  }
  const p = proposal();
  p.axes[0].values[0].code = { prop: 'kind', value: 'primary' };
  assert.deepEqual(contract.validateProposal(p, foundations(), known()).errors.map(e => e.at), ['axes[0].values[0].code']);
});

test('a missing required block fails before the numbered rules', () => {
  for (const key of ['family', 'proposal', 'axes', 'anatomy', 'status', 'approval']) {
    const p = proposal();
    delete p[key];
    const result = contract.validateProposal(p, foundations(), known());
    assert.ok(result.errors.some(e => e.rule === 'schema' && e.at === key), key);
    assert.ok(check(schemas['proposal.schema.json'], p).some(e => e.includes(`missing ${key}`)), key);
  }
  const p = proposal();
  p.proposal.home = { where: 'somewhere' };
  assert.deepEqual(contract.validateProposal(p, foundations(), known()).errors.map(e => e.at), ['proposal.home']);
});

test('a component token or a Primitive fails rule 6: a Proposal binds theme tokens only', () => {
  const f = foundations();
  f.variables['button-primary'].family = 'button'; // the Foundations document marks a component token with its family
  const p = proposal();
  p.paint[0].set.Banner.fill = { token: 'button-primary' };
  const result = contract.validateProposal(p, f, known());
  assert.deepEqual(rules(result), [6]);
  assert.match(result.errors[0].message, /"button-primary" is a component token of "button"; a Proposal binds theme tokens only/);

  const primitive = Object.keys(f.variables).find(k => f.variables[k].hidden);
  f.variables[primitive].scopes = ['ALL_FILLS'];
  p.paint[0].set.Banner.fill = { token: primitive };
  assert.match(contract.validateProposal(p, f, known()).errors[0].message, /hidden Primitive/);
});

test('the Contract rules 1, 2, 3, 6 and 7 apply; rule 5 does not', () => {
  const dupLabel = proposal();
  dupLabel.axes[0].values[1].label = 'High';
  assert.deepEqual(rules(contract.validateProposal(dupLabel, foundations(), known())), [1]);

  const badDefault = proposal();
  badDefault.axes[0].default = 'medium';
  assert.deepEqual(rules(contract.validateProposal(badDefault, foundations(), known())), [2]);

  const badPattern = proposal();
  badPattern.paint[1].match = { emphasis: 'none' };
  assert.deepEqual(rules(contract.validateProposal(badPattern, foundations(), known())), [3]);

  const rawNoReason = proposal();
  delete rawNoReason.paint[1].set.Banner.stroke.reason;
  assert.deepEqual(rules(contract.validateProposal(rawNoReason, foundations(), known())), [6]);

  const wrongScope = proposal();
  wrongScope.layout[0].set.Banner.gap = { token: 'size-md' };
  assert.deepEqual(rules(contract.validateProposal(wrongScope, foundations(), known())), [6]);

  for (const direction of ['HORIZONTAL', 'VERTICAL', 'row', 'column', 'none']) { // Figma's names fail (#448)
    const p = proposal();
    p.layout[0].set.Banner.direction = direction;
    assert.deepEqual(rules(contract.validateProposal(p, foundations(), known())), /^[A-Z]/.test(direction) ? [3] : [], direction);
  }

  const undeclared = proposal();
  undeclared.dependencies.families = [];
  assert.deepEqual(rules(contract.validateProposal(undeclared, foundations(), known())), [7]);

  const unresolved = proposal(); // Low then resolves no fill, which rule 5 rejects in a Contract
  unresolved.paint.pop();
  assert.equal(contract.validateProposal(unresolved, foundations(), known()).ok, true);
});

test('family dependencies name a Contract or a Proposal, and Proposals never compose in a cycle', () => {
  const other = proposal();
  other.family = { key: 'plan-card', name: 'Plan card' };
  other.dependencies.families = [{ key: 'promo-banner', proposal: 'promo-banner' }];
  const p = proposal();
  p.dependencies.families.push({ key: 'plan-card', proposal: 'plan-card' });
  const result = contract.validateProposal(p, foundations(), { contracts: [button()], proposals: [other] });
  assert.deepEqual(rules(result), ['cycle']);
  assert.match(result.errors[0].message, /promo-banner → plan-card → promo-banner/);

  const missing = proposal();
  missing.dependencies.families.push({ key: 'tile', contract: 'tile' });
  assert.match(contract.validateProposal(missing, foundations(), known()).errors[0].message, /"tile" is neither a Contract nor a Proposal/);
});

test('every considered family is an existing Contract', () => {
  const p = proposal();
  p.proposal.considered.push({ contract: 'inline-notification', whyNot: 'status, not promotion' });
  const result = contract.validateProposal(p, foundations(), known());
  assert.deepEqual(rules(result), ['considered']);
  assert.match(result.errors[0].message, /"inline-notification" does not exist/);
  assert.equal(contract.validateProposal(p, foundations()).ok, true); // skipped when the Contracts are not given
});

test('a Contract key collision is reported as ready to retire, not as an error', () => {
  const p = proposal();
  p.family.key = 'button';
  p.dependencies.families = [];
  p.anatomy.children.pop();
  const result = contract.validateProposal(p, foundations(), [button()]);
  assert.equal(result.ok, true);
  assert.equal(result.readyToRetire, 'button');
});

test('a retired Proposal skips the collision report and its map names real keys', () => {
  const p = proposal();
  p.retirement = {
    contract: 'button', how: 'replaced', by: 'owner', at: '2026-10-17T10:00:00Z',
    map: { values: { 'emphasis.high': { axis: 'kind', value: 'primary' }, 'emphasis.low': null }, properties: { title: 'label' } },
  };
  const b = button();
  const labelKey = b.properties.find(x => x.type === 'TEXT').key;
  p.retirement.map.properties.title = labelKey;
  assert.deepEqual(contract.validateProposal(p, foundations(), known()), { ok: true, errors: [], readyToRetire: null });
  assert.deepEqual(check(schemas['proposal.schema.json'], p), []);

  p.retirement.map.values['emphasis.high'] = { axis: 'kind', value: 'success' };
  p.retirement.map.properties.subtitle = null;
  const result = contract.validateProposal(p, foundations(), known());
  assert.deepEqual(result.errors.map(e => e.at), ['retirement.map.values.emphasis.high', 'retirement.map.properties.subtitle']);

  p.retirement.contract = 'tile';
  assert.match(contract.validateProposal(p, foundations(), known()).errors[0].message, /Contract "tile", which does not exist/);
});

test('retirement and built do not change contentHash, so an approval survives them', () => {
  const p = proposal();
  const hash = contract.proposalContentHash(p);
  assert.match(hash, /^sha256:[0-9a-f]{64}$/);
  const approved = Object.assign(p, { status: 'approved', approval: { by: 'owner', at: '2026-10-17T09:00:00Z', contentHash: hash } });
  assert.equal(contract.validateProposal(approved, foundations(), known()).ok, true);
  assert.deepEqual(check(schemas['proposal.schema.json'], approved), []);

  approved.built = { ref: 'github.com/example/shop@0123456:src/components/promo-banner/index.tsx', export: 'PromoBanner', by: 'owner', at: '2026-10-18T09:00:00Z' };
  approved.retirement = { contract: 'button', how: 'built', map: { values: {}, properties: {} }, by: 'owner', at: '2026-10-19T09:00:00Z' };
  assert.equal(contract.proposalContentHash(approved), hash);
  assert.equal(contract.validateProposal(approved, foundations(), known()).ok, true);
});

test('an approval fails once the Proposal changes, and asPending resets status and approval', () => {
  const p = proposal();
  const approved = Object.assign(p, { status: 'approved', approval: { by: 'owner', at: '2026-10-17T09:00:00Z', contentHash: contract.proposalContentHash(p) } });
  approved.proposal.reason += ' Edited.';
  const result = contract.validateProposal(approved, foundations(), known());
  assert.deepEqual(result.errors.map(e => e.at), ['approval.contentHash']);
  const pending = contract.asPending(approved);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.approval, null);
  assert.equal(approved.status, 'approved'); // input unchanged
  assert.equal(contract.validateProposal(pending, foundations(), known()).ok, true);

  const byAgent = Object.assign(contract.asPending(proposal()), { status: 'approved' });
  byAgent.approval = { by: contract.PROTOTYPE_APPROVER, at: 'x', contentHash: contract.proposalContentHash(byAgent) };
  assert.deepEqual(contract.validateProposal(byAgent, foundations(), known()).errors.map(e => e.at), ['approval.by']);
});

test('built is only for a Proposal whose home is the app', () => {
  const p = proposal();
  p.proposal.home = { where: 'code-library', package: '@carbon/react' };
  p.built = { ref: 'github.com/carbon-design-system/carbon@abc:packages/react/src/components/PromoBanner', export: 'PromoBanner', by: 'owner', at: '2026-10-18T09:00:00Z' };
  assert.deepEqual(rules(contract.validateProposal(p, foundations(), known())), ['built']);
});

test('the approved Button Contract still validates with its recorded contentHash', () => {
  const b = button();
  assert.equal(contract.contentHash(b), b.selection.approval.contentHash);
  assert.deepEqual(contract.validate(b, foundations()), { ok: true, errors: [] });
});

test('check.mjs validates a .proposal.json against the Design System beside it', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const ds = join(mkdtempSync(join(tmpdir(), 'proposal-')), 'carbon');
  mkdirSync(join(ds, 'contracts'), { recursive: true });
  mkdirSync(join(ds, 'proposals'));
  writeFileSync(join(ds, 'carbon.foundations.json'), JSON.stringify(foundations()));
  writeFileSync(join(ds, 'contracts', 'button.component.json'), JSON.stringify(button()));
  const p = proposal();
  p.family.key = 'button';
  p.dependencies.families = [];
  p.anatomy.children.pop();
  writeFileSync(join(ds, 'proposals', 'button.proposal.json'), JSON.stringify(p));
  const run = spawnSync(process.execPath, [new URL('../scripts/check.mjs', import.meta.url).pathname, join(ds, 'proposals', 'button.proposal.json')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /ready to retire: Contract "button"/);
  assert.match(run.stdout, /OK \(Proposal button, status pending\)/);
});
