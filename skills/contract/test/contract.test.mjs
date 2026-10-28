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
import { withSpinner, px } from './spinner.mjs';

const root = new URL('../../../', import.meta.url);
const load = rel => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
const button = () => load('design-systems/carbon/contracts/button.component.json');
const foundations = load('design-systems/carbon/carbon.foundations.json');

test('the Button Contract expands to 245 variants', () => {
  assert.equal(contract.expand(button()).length, 245);
});

test('codeProps fills missing axes from their defaults and merges each value\'s code; contentProps maps the properties', () => {
  const c = button();
  assert.deepEqual(contract.codeProps(c, { kind: 'secondary' }), { tuple: { kind: 'secondary', size: 'lg', state: 'enabled' }, props: { kind: 'secondary', size: 'lg' } });
  assert.throws(() => contract.codeProps(c, { kind: 'success' }), /unknown kind value success/);
  const icon = v => `<${v}>`;
  // The specimen turns the non-default BOOLEAN on, so the default icon shows.
  assert.deepEqual((({ props, children }) => ({ props, children }))(contract.contentProps(c, undefined, icon)), { props: { renderIcon: '<icon:default>' }, children: 'Button' });
  // A usage takes its own values; the gate off hides the swap, and whenFalse: "omit" drops the BOOLEAN's prop.
  assert.deepEqual(contract.contentProps(c, { label: 'Save', swapIcon: 'icon:save' }, icon).props, {});
  assert.deepEqual(contract.contentProps(c, { label: 'Save', icon: true, swapIcon: 'icon:save' }, icon).props, { renderIcon: '<icon:save>' });
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

test('the Button token closure is 38 tokens, each in the closure the foundations document was generated from', () => {
  const tokens = contract.closure(button());
  assert.equal(tokens.length, 38);
  assert.deepEqual(tokens.filter(t => !foundations.closure.tokens.includes(t)), []);
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

test('rejects a raw size that is not a number, on every size field (rule 6, #458)', () => {
  for (const field of ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'gap', 'radius', 'strokeWeight']) {
    const c = button();
    c.layout[0].set.Button[field] = { raw: 'hug', level: 'info', reason: 'test size' };
    rejects(c, 6, `the raw value at layout[0].Button.${field} is "hug", not a number`);
  }
  // a colour stays a string
  const c = button();
  c.paint[0].set.Button.fill = { raw: '#0f62fe', level: 'warning', reason: 'test colour' };
  assert.ok(!contract.validate(c, foundations).errors.some(e => e.rule === 6), 'a raw colour is not a size');
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
  assert.equal(contract.iconName('forwardArrow'), 'ForwardArrow');
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

// ---------- form-control families (#93, ADR 0013), on the TextInput and Select fixtures ----------
// fixtures/form-controls/: the TextInput (36) and Select (52) draft Contracts, first from prototype/form-schema @
// 85dcfd7 and since rebound to Carbon's contextual Layer names (`field`, ADR 0012), and the Foundations document the Carbon Adapter
// generates over Button, TextInput and Select.
const formFoundations = load('skills/contract/test/fixtures/form-controls/carbon.foundations.json');
const textInput = () => load('skills/contract/test/fixtures/form-controls/text-input.component.json');
const select = () => load('skills/contract/test/fixtures/form-controls/select.component.json');
const formRejects = (c, rule, ...parts) => {
  const result = contract.validate(c, formFoundations);
  assert.equal(result.ok, false, 'expected the Contract to be rejected');
  assert.ok(result.errors.some(e => e.rule === rule && parts.every(p => `${e.at} ${e.message}`.includes(p))),
    `no rule ${rule} error containing ${JSON.stringify(parts)}; got:\n${result.errors.map(e => `  [${e.rule}] ${e.message}`).join('\n')}`);
};

test('the TextInput and Select fixtures are valid and expand to 36 and 52 variants', () => {
  assert.deepEqual(contract.validate(textInput(), formFoundations), { ok: true, errors: [] });
  assert.deepEqual(contract.validate(select(), formFoundations), { ok: true, errors: [] });
  assert.equal(contract.expand(textInput()).length, 36);
  assert.equal(contract.expand(select()).length, 52);
});

test('a `visible` layout rule on any axis shows one version of the content: the warn icon and text only when warned', () => {
  const c = textInput();
  const shown = validation => {
    const { layout } = contract.resolve(c, { size: 'md', validation, readOnly: 'editable', state: 'enabled' });
    return ['Helper', 'Invalid icon', 'Invalid text', 'Warn icon', 'Warn text'].filter(n => layout[n].visible);
  };
  assert.deepEqual(shown('none'), ['Helper']);
  assert.deepEqual(shown('invalid'), ['Invalid icon', 'Invalid text']);
  assert.deepEqual(shown('warn'), ['Warn icon', 'Warn text']);
});

test('rejects a `visible` that is not true or false, is on the root, or is set by a paint rule', () => {
  const a = textInput();
  a.layout[1].set['Invalid icon'].visible = 'yes';
  formRejects(a, 3, 'layout[1].set', '"Invalid icon"', '`visible` is true or false');
  const b = textInput();
  b.layout[0].set[b.anatomy.name] = { ...b.layout[0].set[b.anatomy.name], visible: true };
  formRejects(b, 3, 'the root', 'cannot be hidden');
  const d = textInput();
  d.paint[0].set.Helper = { ...d.paint[0].set.Helper, visible: false };
  formRejects(d, 3, 'paint[0].set', '`visible` is a layout field');
});

test('a node a rule shows or hides needs `visible` in every variant (rule 5)', () => {
  const c = textInput();
  delete c.layout[0].set['Warn text'].visible;
  formRejects(c, 5, 'layout Warn text.visible is unresolved');
});

test('rejects a node whose `visible` is set by a rule and also bound to a BOOLEAN property (rule 5)', () => {
  const c = textInput();
  c.properties.push({ key: 'showHelper', label: 'Show helper', type: 'BOOLEAN', default: true, binds: [{ node: 'Helper', field: 'visible' }] });
  formRejects(c, 5, 'Helper.visible is set by a rule and bound to property showHelper');
});

test('`code.required` names props no axis value or property sets', () => {
  assert.deepEqual(textInput().code.required, ['id']);
  const c = textInput();
  c.code.required = ['id', 'labelText'];
  formRejects(c, 3, 'code.required', 'required prop "labelText" is already set by an axis value or a property');
  const d = textInput();
  d.code.required = 'id';
  formRejects(d, 3, '`code.required` is a list of prop names');
});

test('`code.items` names a Repeated child, and an `itemProp` property shows one of its props', () => {
  const s = select();
  assert.deepEqual(s.code.items, { component: 'SelectItem', props: ['value', 'text'] });
  assert.deepEqual(s.properties.filter(p => p.code && p.code.itemProp).map(p => [p.key, p.type, p.code.itemProp]), [['value', 'TEXT', 'text']]);
  const a = select();
  a.code.items = { component: 'SelectItem', props: [] };
  formRejects(a, 3, '`code.items` needs `component` and a non-empty `props` list');
  const b = select();
  b.properties.find(p => p.code && p.code.itemProp).code.itemProp = 'label';
  formRejects(b, 3, '"label" is not one of code.items.props');
  const d = textInput();
  d.properties[0].code = { itemProp: 'text' };
  formRejects(d, 3, 'properties.label.code.itemProp', '"text" is not one of code.items.props');
  const e = select();
  e.properties.push({ key: 'open', label: 'Open', type: 'BOOLEAN', default: false, binds: [{ node: 'Chevron', field: 'visible' }], code: { itemProp: 'text' } });
  formRejects(e, 3, 'only a TEXT property can show a Repeated child prop');
});

test('a TEXT `code.child` names a child component, with an optional `childProp`, and no `prop` or `itemProp` (#166)', () => {
  const ok = textInput();
  ok.properties[0].code = { child: 'FormLabel' };
  assert.deepEqual(contract.validate(ok, formFoundations).errors.filter(e => e.rule === 3), []);
  ok.properties[0].code = { child: 'FormLabel', childProp: 'text' };
  assert.deepEqual(contract.validate(ok, formFoundations).errors.filter(e => e.rule === 3), []);
  const a = textInput();
  a.properties[0].code = { child: '' };
  formRejects(a, 3, 'properties.label.code.child', '`code.child` names the child component');
  const b = textInput();
  b.properties[0].code = { child: 'FormLabel', childProp: 3 };
  formRejects(b, 3, '`code.childProp` names one prop of the child');
  const c = textInput();
  c.properties[0].code = { child: 'FormLabel', prop: 'labelText' };
  formRejects(c, 3, 'not two of them');
});

test('the icon list adds every fixed `icon:<key>` an INSTANCE names, after default and preferred, each once', () => {
  assert.deepEqual(contract.icons(textInput()), ['warning--filled', 'warning--alt--filled']);
  assert.deepEqual(contract.icons(select()), ['chevron--down', 'warning--filled', 'warning--alt--filled']);
  const c = button();
  c.anatomy.children.push({ name: 'Status icon', type: 'INSTANCE', instanceOf: 'icon:warning--filled' }, { name: 'Again', type: 'INSTANCE', instanceOf: 'icon:add' });
  assert.deepEqual(contract.icons(c).slice(-2), ['close', 'warning--filled']);
});

test('a family whose icons are all fixed still declares icons.default (rule 7)', () => {
  const c = textInput();
  delete c.icons;
  formRejects(c, 7, 'instance target "icon:warning--filled" is not declared');
});

test('every icon key is a file name: camelCase and kebab-case pass, path-unsafe keys fail (rule 7, #403)', () => {
  const c = button();
  c.icons.preferred = [...c.icons.preferred, 'forwardArrow', 'arrow--right'];
  const rule7 = x => contract.validate(x, foundations).errors.filter(e => e.rule === 7).map(e => e.message);
  assert.deepEqual(rule7(c), []);
  for (const bad of ['../add', 'a/b', 'forward Arrow', 'add.svg', '-add']) {
    const b = button();
    b.icons.preferred = [...b.icons.preferred, bad];
    assert.deepEqual(rule7(b), [`icon key "${bad}" is not an icon file name`], bad);
  }
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

// ---------- Slot axis (#121, ADR 0011), on the shadcn Button of the #88 prototype (prototype/slot-styling) ----------
const slotButton = () => load('skills/contract/test/fixtures/slot-axis/button.component.json');
const slotFoundations = load('skills/contract/test/fixtures/slot-axis/shadcn.foundations.json');
const slotRejects = (c, rule, ...parts) => {
  const result = contract.validate(c, slotFoundations);
  assert.equal(result.ok, false, 'expected the Contract to be rejected');
  assert.ok(result.errors.some(e => e.rule === rule && parts.every(p => e.message.includes(p))),
    `no rule ${rule} error containing ${JSON.stringify(parts)}; got:\n${result.errors.map(e => `  [${e.rule}] ${e.message}`).join('\n')}`);
};

test('a shadcn Button with an Icon Slot axis is valid and expands to 72 variants', () => {
  assert.deepEqual(contract.validate(slotButton(), slotFoundations), { ok: true, errors: [] });
  assert.equal(contract.expand(slotButton()).length, 72);
});

test('the Slot axis value picks the padding: Default size is 16 empty, 12 filled', () => {
  const c = slotButton();
  const at = icon => contract.resolve(c, { variant: 'default', size: 'default', icon, state: 'enabled' }).layout;
  assert.deepEqual([at('none').Button.paddingLeft.token, at('none').Icon.visible], ['spacing-4', false]);
  assert.deepEqual([at('icon').Button.paddingLeft.token, at('icon').Icon.visible], ['spacing-3', true]);
});

test('rejects a Slot axis whose slot is not a non-root anatomy node (rule 3)', () => {
  for (const slot of ['Button', 'Glyph']) {
    const c = slotButton();
    c.axes.find(a => a.key === 'icon').slot = slot;
    slotRejects(c, 3, `slot "${slot}" is not a non-root anatomy node`);
  }
});

test('rejects a Slot axis without one filled and one empty value (rule 3)', () => {
  const both = slotButton();
  both.axes.find(a => a.key === 'icon').values[0].filled = true;
  slotRejects(both, 3, 'needs one filled and one empty value');
  const unmarked = slotButton();
  delete unmarked.axes.find(a => a.key === 'icon').values[1].filled;
  slotRejects(unmarked, 3, 'every value of a Slot axis says whether it is `filled`');
  const three = slotButton();
  three.axes.find(a => a.key === 'icon').values.push({ key: 'two', label: 'Two', filled: true, code: {} });
  slotRejects(three, 3, 'needs one filled and one empty value');
});

test('rejects `filled` on a value of an axis that names no slot (rule 3)', () => {
  const c = slotButton();
  c.axes.find(a => a.key === 'variant').values[0].filled = true;
  slotRejects(c, 3, '`filled` is for a Slot axis, and variant names no `slot`');
});

test('rejects a canonical Slot axis (rule 3)', () => {
  const c = slotButton();
  c.axes.find(a => a.key === 'icon').canonical = true;
  slotRejects(c, 3, 'icon is canonical; a Slot axis never is');
});

test('rejects a slot whose visible rule disagrees with the Slot axis (rule 5)', () => {
  const c = slotButton();
  c.layout = c.layout.filter(r => r.match.icon !== 'none');
  slotRejects(c, 5, 'layout Icon.visible must be false where icon is none', 'in 24 selected variants');
});

test('rejects a BOOLEAN bound to a slot the Slot axis already shows and hides (rule 5)', () => {
  const c = slotButton();
  c.properties.push({ key: 'showIcon', label: 'Show icon', type: 'BOOLEAN', default: true, binds: [{ node: 'Icon', field: 'visible' }] });
  slotRejects(c, 5, 'Icon.visible is set by a rule and bound to property showIcon');
});

test('an INSTANCE_SWAP visibleWhen names a Slot axis whose slot is the swapped node (rule 3)', () => {
  const swap = c => c.properties.find(p => p.key === 'swapIcon');
  const unknown = slotButton();
  swap(unknown).code.visibleWhen = { axis: 'icons' };
  slotRejects(unknown, 3, 'visibleWhen names "icons", which is not a Slot axis');
  const plain = slotButton();
  swap(plain).code.visibleWhen = { axis: 'size' };
  slotRejects(plain, 3, 'visibleWhen names "size", which is not a Slot axis');
  const other = slotButton();
  other.anatomy.children.push({ name: 'End', type: 'INSTANCE', instanceOf: 'icon:default' });
  other.layout[0].set.End = { visible: true };
  swap(other).binds = [{ node: 'End', field: 'mainComponent' }];
  slotRejects(other, 3, 'Slot axis icon shows "Icon", not "End"');
});

// ---------- absolute nodes and the ELLIPSE (#442), on the Carbon Button with a spinner (spinner.mjs) ----------
const spinner = edit => withSpinner(button(), edit);

test('an absolute node centred with a fixed size, in a parent with Auto Layout, is valid; so are its full circle and arc', () => {
  assert.deepEqual(contract.validate(spinner(), foundations), { ok: true, errors: [] });
});

test('rejects an absolute root, and constraints on the root (rule 3)', () => {
  rejects(spinner(L => { L.Button = { position: 'absolute' }; }), 3, '"Button" is the root, which cannot be absolute');
  rejects(spinner(L => { L.Button = { constraints: { horizontal: 'center', vertical: 'center' } }; }), 3, '"Button" is the root');
});

test('rejects an absolute node whose parent has no Auto Layout in a selected variant (rule 5)', () => {
  const c = spinner(L => { L.Track.position = 'absolute'; L.Track.constraints = { horizontal: 'center', vertical: 'center' }; });
  rejects(c, 5, 'absolute Track needs a parent with Auto Layout', '245 selected variants');
  // the root of a Button whose small size drops its Auto Layout: only those variants fail
  const sm = spinner();
  sm.layout.find(r => r.match.size === 'sm').set.Button.direction = 'none';
  rejects(sm, 5, 'absolute Spinner needs a parent with Auto Layout, but Button', '35 selected variants');
});

test('rejects an absolute node without a fixed width and height (rule 5)', () => {
  rejects(spinner(L => { L.Spinner.width = 'hug'; }), 5, 'absolute Spinner needs a fixed width and height');
  rejects(spinner(L => { L.Spinner.height = 'fixed'; }), 5, 'absolute Spinner needs a fixed width and height');
});

// Asserts validate's rule 5 error for a non-fixed size names the node and the field, at and in its message.
const rejectsSize = (c, who, field) => {
  rejects(c, 5, `${who} needs a fixed width and height (a token or a number); its ${field} is not`);
  const { errors } = contract.validate(c, foundations);
  assert.ok(errors.some(e => e.rule === 5 && e.at === `layout ${who.split(' ').pop()}.${field}`), JSON.stringify(errors));
};
// A fixed size of an absolute node or an ELLIPSE whose `raw` is not a number reaches the builder as no size (#458).
for (const v of ['hug', 'fill', '12px'])
  test(`rejects an absolute node or an ELLIPSE sized {raw: ${JSON.stringify(v)}} (rule 5, #458)`, () => {
    rejectsSize(spinner(L => { L.Spinner.width = px(v); }), 'absolute Spinner', 'width');
    rejectsSize(spinner(L => { L.Spinner.height = px(v); }), 'absolute Spinner', 'height');
    rejectsSize(spinner(L => { L.Track.width = px(v); }), 'the ELLIPSE Track', 'width');
    rejectsSize(spinner(L => { L.Track.height = px(v); }), 'the ELLIPSE Track', 'height');
  });

test('an absolute node and an ELLIPSE sized by a token or {raw: 24} are valid (rule 5, #458)', () => {
  // spinner() sizes every node {raw: 24}; size-xs is a WIDTH_HEIGHT variable
  assert.deepEqual(contract.validate(spinner(), foundations), { ok: true, errors: [] });
  const token = spinner(L => { for (const n of ['Spinner', 'Track', 'Arc']) Object.assign(L[n], { width: { token: 'size-xs' }, height: { token: 'size-xs' } }); });
  assert.deepEqual(contract.validate(token, foundations), { ok: true, errors: [] });
});

test('rejects a constraint other than center (rule 3), and constraints without position or position without constraints (rule 5)', () => {
  for (const constraints of [{ horizontal: 'start', vertical: 'center' }, { horizontal: 'center' }, { horizontal: 'center', vertical: 'center', x: 1 }, 'center'])
    rejects(spinner(L => { L.Spinner.constraints = constraints; }), 3, '`constraints` is {horizontal: "center", vertical: "center"}');
  rejects(spinner(L => { delete L.Spinner.position; }), 5, 'Spinner has constraints but is not absolute');
  rejects(spinner(L => { delete L.Spinner.constraints; }), 5, 'absolute Spinner needs constraints');
  rejects(spinner(L => { L.Spinner.position = 'relative'; }), 3, '`position` is "absolute"');
});

test('rejects an ELLIPSE missing arc, or another of its required fields (rule 5)', () => {
  rejects(spinner(L => { delete L.Arc.arc; }), 5, 'layout Arc.arc is unresolved', '245 selected variants');
  rejects(spinner(L => { delete L.Track.strokeWeight; }), 5, 'layout Track.strokeWeight is unresolved');
  rejects(spinner((L, P) => { delete P.Track; }), 5, 'paint Track.stroke is unresolved');
});

test('rejects an ELLIPSE whose width or height is not fixed, in any selected variant (rule 5)', () => {
  rejects(spinner(L => { L.Track.width = 'hug'; }), 5, 'the ELLIPSE Track needs a fixed width and height', '245 selected variants');
  rejects(spinner(L => { L.Arc.height = 'fill'; }), 5, 'the ELLIPSE Arc needs a fixed width and height');
  rejects(spinner(L => { L.Arc.width = 'fixed'; }), 5, 'the ELLIPSE Arc needs a fixed width and height');
  const small = spinner();
  small.layout.push({ match: { size: 'sm' }, set: { Track: { height: 'hug' } } });
  rejects(small, 5, 'the ELLIPSE Track needs a fixed width and height', '35 selected variants');
});

test('rejects strokeAlign on an ELLIPSE from any layout rule: the builder derives it (rule 3)', () => {
  rejects(spinner(L => { L.Arc.strokeAlign = 'center'; }), 3, '"Arc": `strokeAlign` is derived on an ELLIPSE');
  const other = spinner();
  other.layout[0].set.Track = { strokeAlign: 'inside' };
  rejects(other, 3, '"Track": `strokeAlign` is derived on an ELLIPSE');
});

test('rejects a bad arc or strokeCap, either one off an ELLIPSE, and a geometry field in a paint rule (rule 3)', () => {
  for (const arc of [{ start: 0, sweep: 0 }, { start: 0, sweep: 400 }, { start: 0 }, { sameAs: 'Track.arc' }])
    rejects(spinner(L => { L.Arc.arc = arc; }), 3, '`arc` is {start, sweep}');
  rejects(spinner(L => { L.Arc.strokeCap = 'square'; }), 3, '`strokeCap` is "round" or "none"');
  rejects(spinner(L => { L.Spinner.arc = { start: 0, sweep: 360 }; }), 3, '"Spinner": `arc` is set on ELLIPSE nodes only');
  rejects(spinner((L, P) => { P.Arc.strokeCap = 'round'; }), 3, '"Arc": `strokeCap` is a layout field, not a paint field');
});

test('rejects a field the builder draws, set by any rule (rule 3)', () => {
  for (const [field, value] of [['path', { d: ['M', 0, 0] }], ['dashPattern', [4, 4]], ['x', 0], ['y', 0], ['offCentre', 0], ['clipsContent', true]])
    rejects(spinner(L => { L.Spinner[field] = value; }), 3, `"Spinner": \`${field}\` is drawn by the builder from the Contract, never set`);
});

test('rejects a field the schema does not list, and a field set in the other section (rule 3, #459)', () => {
  const c = button();
  c.layout[0].set.Button.rotation = 90;
  c.paint[0].set.Button.blendMode = 'MULTIPLY';
  rejects(c, 3, '"Button": `rotation` is not a layout field');
  rejects(c, 3, '"Button": `blendMode` is not a paint field');
  const swapped = button();
  swapped.paint[0].set.Button.gap = { token: 'spacing-05' };
  swapped.layout[0].set.Button.fill = 'none';
  rejects(swapped, 3, '"Button": `gap` is a layout field, not a paint field');
  rejects(swapped, 3, '"Button": `fill` is a paint field, not a layout field');
  // one error per field: a drawn field is refused as drawn only
  const drawn = contract.validate(spinner(L => { L.Spinner.x = 0; }), foundations);
  assert.deepEqual(drawn.errors.map(e => e.message), ['"Spinner": `x` is drawn by the builder from the Contract, never set']);
});

test('rejects an arc whose width and height differ, and an ELLIPSE that is an arc in some variants only (rule 5)', () => {
  rejects(spinner(L => { L.Arc.height = { raw: 20, level: 'info', reason: 'test' }; }), 5, 'the arc Arc needs the same width and height', '245 selected variants');
  // a full circle may be an oval
  assert.deepEqual(contract.validate(spinner(L => { L.Track.height = { raw: 20, level: 'info', reason: 'test' }; }), foundations), { ok: true, errors: [] });
  const mixed = spinner();
  mixed.layout.push({ match: { size: 'sm' }, set: { Arc: { arc: { start: 0, sweep: 360 } } } });
  rejects(mixed, 5, 'the ELLIPSE Arc is an arc in some selected variants and a full circle in others');
});

test('rejects an ELLIPSE as the root or with children (rule 3)', () => {
  const root = spinner();
  root.anatomy.type = 'ELLIPSE';
  rejects(root, 3, '"Button" is an ELLIPSE, which cannot be the root');
  const parent = spinner();
  parent.anatomy.children[2].children[0].children = [{ name: 'Dot', type: 'FRAME' }];
  rejects(parent, 3, '"Track" is an ELLIPSE, which has no children');
});

test('rejects an arc stroke sameAs a token without STROKE_COLOR (rule 6), and an ELLIPSE fill binds SHAPE_FILL', () => {
  rejects(spinner((L, P) => { P.Arc.stroke = { sameAs: 'Label.fill' }; }), 6, `"text-on-color" is used as STROKE_COLOR at paint[${spinner().paint.length - 1}].Arc.stroke`, '[SHAPE_FILL, TEXT_FILL]');
  assert.equal(contract.scopeFor(spinner(), 'Track', 'fill'), 'SHAPE_FILL');
});

test('Spinner stacks its Track and Arc without Auto Layout: an arc needs a FRAME parent whose direction is none (rule 5, #442)', () => {
  // a FRAME without direction has no Auto Layout either
  assert.deepEqual(contract.validate(spinner(L => { delete L.Spinner.direction; }), foundations), { ok: true, errors: [] });
  // with Auto Layout the arc's Figma box would sit in the flow; the full circle Track is fine there
  const row = contract.validate(spinner(L => { L.Spinner.direction = 'row'; }), foundations);
  assert.deepEqual(row.errors.map(e => [e.rule, e.at]), [[5, 'layout Arc.arc']]);
  assert.match(row.errors[0].message, /the arc Arc needs a FRAME parent without Auto Layout \(direction "none"\), not Spinner in 245 selected variants/);
  // a direction other than none is not none, even one the builder would read as none (#448)
  rejects(spinner(L => { L.Spinner.direction = 'HORIZONTAL'; }), 5, 'the arc Arc needs a FRAME parent without Auto Layout');
  // an arc directly under the root COMPONENT, or absolute itself, fails too
  const atRoot = spinner();
  atRoot.anatomy.children.push(atRoot.anatomy.children[2].children.pop());
  rejects(atRoot, 5, 'the arc Arc needs a FRAME parent without Auto Layout', 'not Button');
  const absolute = spinner(L => { Object.assign(L.Arc, { position: 'absolute', constraints: { horizontal: 'center', vertical: 'center' } }); });
  rejects(absolute, 5, 'absolute Arc needs a parent with Auto Layout');
});
