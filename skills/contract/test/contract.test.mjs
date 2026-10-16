// Tests for the shared Contract module, through its public functions only, against the committed
// Button Contract and Carbon foundations document. Run: node --test skills/contract/test/*.test.mjs
//
// Fixtures:
// - button.kind-state-paint.lg.json: the research expander's Kind x State table (see its _source).
// - button.owner-edits.component.json: the base-first-loop prototype's contract.v1.json
//   (research/skills-split @ edfde5a), the Button Contract with two owner edits carrying `by` and `was`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as contract from '../scripts/contract.mjs';

const root = new URL('../../../', import.meta.url);
const load = rel => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
const button = () => load('design-systems/carbon/contracts/button.component.json');
const foundations = load('design-systems/carbon/carbon.foundations.json');

test('the Button Contract expands to 245 variants', () => {
  assert.equal(contract.expand(button()).length, 245);
});

test('the Base Component is Primary/Large/Enabled and is selected', () => {
  const c = button();
  const base = contract.baseTuple(c);
  assert.deepEqual(base, { kind: 'primary', size: 'lg', state: 'enabled' });
  assert.equal(contract.variantName(c, base), 'Kind=Primary, Size=Large, State=Enabled');
  assert.ok(contract.expand(c).some(t => contract.variantName(c, t) === contract.variantName(c, base)));
});

test('the resolved Kind x State paint table matches the research expander', () => {
  const c = button();
  const expected = load('skills/contract/test/fixtures/button.kind-state-paint.lg.json');
  const name = v => (v && typeof v === 'object' ? v.token : v);
  const rows = contract.expand(c).filter(t => t.size === expected.size).map(t => {
    const { paint } = contract.resolve(c, t);
    return {
      kind: t.kind, state: t.state,
      fill: name(paint.Button.fill), stroke: name(paint.Button.stroke),
      label: name(paint.Label.fill), icon: name(paint['Glyph/Vector'].fill),
      effects: paint.Button.effects.length,
    };
  });
  assert.deepEqual(rows, expected.rows);
});

test('the Button token closure is the 38 tokens the foundations document was generated from', () => {
  const tokens = contract.closure(button());
  assert.equal(tokens.length, 38);
  assert.deepEqual(tokens, foundations.closure.tokens);
});

test('was is ignored for the closure: an owner edit swaps spacing-07 for spacing-06', () => {
  const tokens = contract.closure(load('skills/contract/test/fixtures/button.owner-edits.component.json'));
  assert.equal(tokens.length, 38);
  assert.ok(tokens.includes('spacing-06'));
  assert.ok(!tokens.includes('spacing-07'));
});

test('omitting every ghost kind drops their tokens from the closure', () => {
  const c = button();
  c.selection.omit = [{ match: { kind: ['ghost', 'danger--ghost'] } }];
  const tokens = contract.closure(c);
  assert.ok(!tokens.includes('link-primary'));
  assert.ok(!tokens.includes('spacing-03'));
});

// Asserts validation fails with an error for `rule` whose message contains every string in `parts`.
function rejects(c, rule, ...parts) {
  const result = contract.validate(c, foundations);
  assert.equal(result.ok, false, 'expected the Contract to be rejected');
  const hit = result.errors.find(e => e.rule === rule && parts.every(p => e.message.includes(p)));
  assert.ok(hit, `no rule ${rule} error containing ${JSON.stringify(parts)}; got:\n${result.errors.map(e => `  [${e.rule}] ${e.message}`).join('\n')}`);
}

test('the committed Button Contract is valid', () => {
  assert.deepEqual(contract.validate(button(), foundations), { ok: true, errors: [] });
});

test('rejects a selected variant that leaves a required field unresolved', () => {
  const c = button();
  const sm = c.layout.find(r => r.match.size === 'sm');
  delete sm.set.Button.minHeight;
  rejects(c, 5, 'layout Button.minHeight', 'unresolved', '35 selected variants', 'Kind=Primary, Size=Small, State=Enabled');
});

test('rejects a required field that no rule sets', () => {
  const c = button();
  delete c.layout[0].set.Label.textStyle;
  delete c.layout.find(r => r.match.size === 'lg-expressive').set.Label;
  rejects(c, 5, 'layout Label.textStyle', 'unresolved', '245 selected variants');
});

test('rejects a wrong expectedCount', () => {
  const c = button();
  c.selection.expectedCount = 240;
  rejects(c, 4, 'expansion gives 245 variants', 'expectedCount is 240');
});

test('rejects a token used outside its variable scopes (rule 6)', () => {
  const c = button();
  c.paint.find(r => r.match.kind === 'primary' && !r.match.state).set.Button.fill = { token: 'text-on-color' };
  rejects(c, 6, '"text-on-color"', 'FRAME_FILL', 'paint[1].Button.fill', '[SHAPE_FILL, TEXT_FILL]');
});

test('padding and gap bind under the GAP scope (rule 6, #27)', () => {
  const c = button();
  c.layout[0].set.Button.paddingLeft = { token: 'size-xs' };
  rejects(c, 6, '"size-xs"', 'GAP', 'layout[0].Button.paddingLeft', '[WIDTH_HEIGHT]');
});

test('rejects a token that is not in the foundations document', () => {
  const c = button();
  c.layout[0].set.Button.gap = { token: 'spacing-99' };
  rejects(c, 6, '"spacing-99"', 'not a variable');
});

test('rejects a raw value without level and reason', () => {
  const c = button();
  delete c.layout[0].set.Button.maxWidth.reason;
  rejects(c, 6, 'layout[0].Button.maxWidth', '`level`', '`reason`');
});

test('was is ignored for raw-value checks: the owner-edited Contract is valid', () => {
  const c = load('skills/contract/test/fixtures/button.owner-edits.component.json');
  assert.deepEqual(contract.validate(c, foundations), { ok: true, errors: [] });
});

test('rejects an unknown axis value in a pattern', () => {
  const c = button();
  c.selection.omit = [{ match: { size: '3xl' } }];
  rejects(c, 3, 'unknown size value "3xl"');
});

test('rejects an omit that removes the Base Component', () => {
  const c = button();
  c.selection.omit = [{ match: { state: 'enabled', size: 'lg' } }];
  c.selection.expectedCount = 238;
  rejects(c, 2, 'Base Component (Kind=Primary, Size=Large, State=Enabled) is not selected');
});

test('rejects a structurally broken Contract before the numbered rules', () => {
  const c = button();
  delete c.paint;
  rejects(c, 'schema', '`paint` is required');
});

test('contentHash matches the base-first-loop prototype and ignores status and approval', () => {
  // Hashes recorded by the prototype in docs/prototype/base-first-loop/out/approval.txt (research/skills-split).
  assert.equal(contract.contentHash(button()), 'sha256:4a9e9f38d7a42ccfd0ea029241862365784bfe49b7f087e48ceee8ee07711bf5');
  const edited = load('skills/contract/test/fixtures/button.owner-edits.component.json');
  assert.equal(contract.contentHash(edited), 'sha256:13b933ccd24187dde686ba721bdc98e976b0f58a9c0ca450fa28a1fe914330b1');
  const c = button();
  c.selection.status = 'approved';
  c.selection.approval = { by: 'owner', at: '2026-10-16T00:00:00Z' };
  assert.equal(contract.contentHash(c), contract.contentHash(button()));
});

test('sha256 agrees with node:crypto on ASCII, multi-byte and block-boundary input', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '(size − 1lh)/2 ≤ 1px × 2', '😀 ' + 'y'.repeat(130)])
    assert.equal(contract.sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s));
});

test('approve records the owner, time, snapshotId and contentHash, and the result is valid', () => {
  const draft = contract.asDraft(button());
  const c = contract.approve(draft, '2026-10-16T09:00:00Z');
  assert.equal(c.selection.status, 'approved');
  assert.deepEqual(c.selection.approval, {
    by: 'owner', at: '2026-10-16T09:00:00Z',
    snapshotId: 'sha256:4c82c3cc7f2af6fa24fba39bb5e159c415b5691800130268c9d8903901164152',
    contentHash: 'sha256:4a9e9f38d7a42ccfd0ea029241862365784bfe49b7f087e48ceee8ee07711bf5',
  });
  assert.deepEqual(contract.validate(c, foundations), { ok: true, errors: [] });
  assert.equal(draft.selection.status, 'draft', 'approve does not mutate its input');
});

test('rejects an approval whose snapshotId does not match the source', () => {
  const c = contract.approve(button(), '2026-10-16T09:00:00Z');
  c.selection.approval.snapshotId = 'sha256:' + '0'.repeat(64);
  rejects(c, 8, 'approval.snapshotId', 'does not match source.snapshotId');
});

test('rejects an approval whose contentHash no longer matches (an edit after approval)', () => {
  const c = contract.approve(button(), '2026-10-16T09:00:00Z');
  c.layout[0].set.Button.gap = { token: 'spacing-06', by: 'owner', was: { token: 'spacing-07' } };
  rejects(c, 8, 'approval.contentHash', 'does not match', 'changed since approval');
});

test('rejects an approval by anyone but the owner, and a draft that carries an approval', () => {
  const c = contract.approve(button(), '2026-10-16T09:00:00Z');
  c.selection.approval.by = 'orchestrator';
  rejects(c, 8, 'only the owner approves');
  const d = contract.approve(button(), '2026-10-16T09:00:00Z');
  d.selection.status = 'draft';
  rejects(d, 8, 'a draft Contract has `approval: null`');
});

test('applyOmit replaces the omit list, resets the approval, and the result validates', () => {
  const approved = contract.approve(button(), '2026-10-16T09:00:00Z');
  const snapshotId = approved.source.snapshotId;
  const c = contract.applyOmit(approved, { family: 'button', snapshotId, omit: [{ state: 'focus' }], expectedCount: 196 });
  assert.deepEqual(c.selection, { status: 'draft', omit: [{ match: { state: 'focus' } }], expectedCount: 196, approval: null });
  assert.equal(contract.expand(c).length, 196);
  assert.ok(contract.expand(c).every(t => t.state !== 'focus'));
  assert.deepEqual(contract.validate(c, foundations), { ok: true, errors: [] });
  // a later patch re-includes focus: the patch is the whole omit list, not an addition
  const back = contract.applyOmit(c, { family: 'button', snapshotId, omit: [], expectedCount: 245 });
  assert.equal(contract.expand(back).length, 245);
  assert.equal(approved.selection.status, 'approved', 'applyOmit does not mutate its input');
});

test('an uncarried owner tweak (a warning note) blocks approval', () => {
  // The owner-edits fixture carries the prototype's warning note for an uncarried letterSpacing tweak.
  const edited = load('skills/contract/test/fixtures/button.owner-edits.component.json');
  assert.throws(() => contract.approve(edited, '2026-10-16T09:00:00Z'), /layout\.Label\.letterSpacing/);
  const forced = contract.approve(button(), '2026-10-16T09:00:00Z');
  forced.notes = edited.notes;
  forced.selection.approval.contentHash = contract.contentHash(forced);
  rejects(forced, 8, 'warning note', 'layout.Label.letterSpacing', 'blocks approval');
});

test('a prototype approval names the orchestrator and never validates (rule 8)', () => {
  const p = contract.approve(button(), '2026-10-16T09:00:00Z', { prototype: true });
  assert.equal(p.selection.approval.by, contract.PROTOTYPE_APPROVER);
  assert.equal(p.selection.approval.contentHash, contract.contentHash(button()));
  rejects(p, 8, 'only the owner approves');
  assert.equal(contract.approve(button(), '2026-10-16T09:00:00Z').selection.approval.by, 'owner');
});

test('scopeFor names the scope a field binds under, and coversScope reads ALL_SCOPES and ALL_FILLS', () => {
  const c = button();
  assert.equal(contract.scopeFor(c, 'Button', 'gap'), 'GAP');
  assert.equal(contract.scopeFor(c, 'Button', 'direction'), undefined);
  assert.ok(contract.coversScope(['ALL_FILLS'], 'FRAME_FILL'));
  assert.ok(contract.coversScope(['ALL_SCOPES'], 'GAP'));
  assert.ok(!contract.coversScope(['ALL_FILLS'], 'GAP'));
});

test('applyOmit keeps the reason of an omit pattern the patch carries again', () => {
  const c = button();
  c.selection.omit = [{ match: { size: '2xl', kind: 'danger--ghost' }, reason: 'owner: not used' }];
  c.selection.expectedCount = 240;
  const patched = contract.applyOmit(c, {
    family: 'button', snapshotId: c.source.snapshotId, expectedCount: 230,
    omit: [{ kind: 'danger--ghost', size: '2xl' }, { size: 'xs', kind: 'ghost' }],
  });
  assert.deepEqual(patched.selection.omit, [
    { match: { kind: 'danger--ghost', size: '2xl' }, reason: 'owner: not used' },
    { match: { size: 'xs', kind: 'ghost' } },
  ]);
});

test('applyOmit refuses a patch for another family or another source snapshot', () => {
  const c = button();
  assert.throws(() => contract.applyOmit(c, { family: 'tag', snapshotId: c.source.snapshotId, omit: [], expectedCount: 245 }), /family/);
  assert.throws(() => contract.applyOmit(c, { family: 'button', snapshotId: 'sha256:old', omit: [], expectedCount: 245 }), /snapshotId/);
});

test('resolve reports the rule that last set each field', () => {
  const c = button();
  const r = contract.resolve(c, { kind: 'ghost', size: 'lg', state: 'enabled' });
  assert.deepEqual(r.layout.Button.gap, { token: 'spacing-03' });
  assert.equal(r.from['layout.Button.gap'], c.layout.length - 1);
  assert.equal(r.from['layout.Button.paddingLeft'], 0);
  assert.deepEqual(r.binds.icon, [{ node: 'Icon', field: 'visible' }]);
  assert.deepEqual(r.binds.label, [{ node: 'Label', field: 'characters' }]);
});

test('the icon list is the default icon plus the preferred icons, each once, with kit-style names', () => {
  const c = button();
  assert.deepEqual(contract.icons(c), ['add', 'arrow--right', 'launch', 'download', 'save', 'edit', 'filter', 'trash-can', 'close']);
  assert.deepEqual(contract.icons({ ...c, icons: { ...c.icons, default: 'zoom-in', preferred: ['add', 'add'] } }), ['zoom-in', 'add']);
  assert.deepEqual(contract.icons({ ...c, icons: undefined }), []);
  assert.equal(contract.iconName('arrow--right'), 'Arrow--right');
  assert.equal(contract.iconName('trash-can'), 'Trash-can');
});

test('the module runs inlined, without export, in a bare context (no TextEncoder, crypto, structuredClone)', () => {
  const src = readFileSync(new URL('skills/contract/scripts/contract.mjs', root), 'utf8').replace(/^export /gm, '');
  const out = vm.runInNewContext(`${src}
    ;(function () {
      var c = JSON.parse(C), f = JSON.parse(F);
      return JSON.stringify({ ok: validate(c, f).ok, variants: expand(c).length, tokens: closure(c).length,
        hash: contentHash(c), bare: [typeof TextEncoder, typeof crypto, typeof structuredClone, typeof require, typeof process] });
    })()`, {
    C: JSON.stringify(button()),
    F: JSON.stringify(foundations),
  });
  assert.deepEqual(JSON.parse(out), {
    ok: true, variants: 245, tokens: 38,
    hash: contract.contentHash(button()),
    bare: ['undefined', 'undefined', 'undefined', 'undefined', 'undefined'],
  });
});

// ---------- the `drafted` side table (#105, ADR 0010) ----------
// button.drafted.component.json is the committed Button as a draft plus a `drafted` table. Its evidence lines
// and fingerprints are illustrative: validate checks their shape, not their content.
const drafted = () => load('skills/contract/test/fixtures/button.drafted.component.json');
const agentEntry = { by: 'agent', evidence: ['ButtonBase.tsx:L1 what it shows'], fingerprint: `sha256:${'0'.repeat(64)}` };

test('a Contract with a good drafted table is valid, and the table is inside contentHash', () => {
  const c = drafted();
  assert.deepEqual(contract.validate(c, foundations), { ok: true, errors: [] });
  const without = drafted();
  delete without.drafted;
  assert.notEqual(contract.contentHash(c), contract.contentHash(without));
  c.drafted['figma.grid'] = { by: 'owner', was: { columns: ['kind'], rows: ['size', 'state'] } };
  assert.notEqual(contract.contentHash(c), contract.contentHash(drafted()), 'an owner correction changes the hash');
  assert.deepEqual(contract.validate(c, foundations).errors, []);
});

test('the approved Button carries no drafted table, and gaining one voids its approval (rule 8)', () => {
  const c = button();
  assert.equal(c.drafted, undefined);
  c.drafted = { 'icons.default': agentEntry };
  rejects(c, 8, 'contentHash');
});

test('every drafted key resolves to a value in the Contract (rule 9)', () => {
  const resolves = key => contract.draftedValue(drafted(), key).found;
  for (const key of ['axes.size.values.lg.label', 'axes.kind.label', 'family.description', 'anatomy.Label', 'properties.label.default',
    'properties.Label.characters', 'properties.Glyph.mainComponent', 'properties.Icon.visible', 'icons.default', 'icons.preferred', 'figma.grid',
    'code.alwaysEmit', 'layout.Button.width', 'paint.Button.fill', 'layout{"size":["lg","xl","2xl"]}.Button.paddingTop', 'layout{"size":"lg"}.Button.minHeight'])
    assert.ok(resolves(key), `${key} should resolve`);
  assert.equal(contract.draftedValue(drafted(), 'axes.size.values.lg.label').value, 'Large');
  assert.equal(contract.draftedValue(drafted(), 'layout{"kind":["ghost","danger--ghost"]}.Button.gap').value.token, 'spacing-03');
  for (const key of [
    'axes.size.values.huge.label', // no such value
    'anatomy.Footer', // no such node
    'properties.Label.visible', // no property binds Label.visible
    'layout.Button.minHeight', // the base rule does not set it; a size rule does, keyed with its match
    'layout{}.Button.width', // the base rule has no match in its key
    'layout{"size":"sm"}.Button.gap', // no rule with exactly that match sets it
    'layout{ "size": "lg" }.Button.minHeight', // the match is canonical JSON
    'layout.Button', // a layout key names node and field
    'selection.status', 'source.tag', 'notes', 'schemaVersion', // not values an Adapter's agent drafts
    'excluded', // no key form for excluded combinations yet
  ]) {
    const c = drafted();
    c.drafted[key] = agentEntry;
    rejects(c, 9, key);
  }
});

test('a drafted entry is {by: "agent", evidence, fingerprint} or {by: "owner", was} (rule 9)', () => {
  const bad = [
    [{ by: 'agent', fingerprint: agentEntry.fingerprint }, 'evidence'],
    [{ by: 'agent', evidence: [], fingerprint: agentEntry.fingerprint }, 'evidence'],
    [{ by: 'agent', evidence: [3], fingerprint: agentEntry.fingerprint }, 'evidence'],
    [{ by: 'agent', evidence: agentEntry.evidence }, 'fingerprint'],
    [{ by: 'agent', evidence: agentEntry.evidence, fingerprint: 'sha256:abc' }, 'fingerprint'],
    [{ by: 'owner' }, 'was'],
    [{ by: 'designer', was: 'Big' }, 'by'],
    ['agent', 'object'],
  ];
  for (const [entry, word] of bad) {
    const c = drafted();
    c.drafted['axes.size.values.lg.label'] = entry;
    rejects(c, 9, 'axes.size.values.lg.label', word);
  }
  const c = drafted();
  c.drafted = [];
  rejects(c, 9, 'object');
  const ok = drafted();
  ok.drafted['axes.size.values.lg.label'] = { by: 'owner', was: 'Lg' };
  ok.drafted['icons.default'] = { by: 'owner (simulated, prototype)', was: 'add' };
  assert.deepEqual(contract.validate(ok, foundations).errors, []);
});

test('draftedKey writes the key a value at section, match, node and field is drafted under', () => {
  assert.equal(contract.draftedKey('layout', {}, 'Button', 'width'), 'layout.Button.width');
  assert.equal(contract.draftedKey('layout', { size: ['lg', 'xl', '2xl'] }, 'Button', 'paddingTop'), 'layout{"size":["lg","xl","2xl"]}.Button.paddingTop');
  assert.equal(contract.draftedKey('paint', { state: 'hover', kind: 'ghost' }, 'Button', 'fill'), 'paint{"kind":"ghost","state":"hover"}.Button.fill');
});
