// Base-first loop (#31), offline: the prototype's saved readbacks (tests/fixtures/base-loop, from
// docs/prototype/base-first-loop on research/skills-split) against a pinned copy of the Button Contract.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approve, contentHash, PROTOTYPE_APPROVER, validate } from '../../contract/scripts/contract.mjs';
import {
  applyEdits, approveReviewed, diff, discardNote, ownerEdits, regenerate, review, RAW_REASON,
} from '../scripts/base-loop.mjs';
import { expectedBase, normalizeReadback } from '../scripts/readback.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIX = join(ROOT, 'skills/to-design/tests/fixtures/base-loop');
const SCRIPT = join(ROOT, 'skills/to-design/scripts/base-loop.mjs');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const CONTRACT = read(join(FIX, 'button.component.json'));
const FOUNDATIONS = read(join(ROOT, 'design-systems/carbon/carbon.foundations.json'));
const OWNER_EDITS = read(join(ROOT, 'skills/contract/test/fixtures/button.owner-edits.component.json'));
const rb = name => read(join(FIX, `readback.${name}.json`))[0];
const AT = '2026-10-16T00:00:00.000Z';

// A readback that reports everything the Base Component should show: the prototype's v0 readback plus the
// fields its readback script did not read (effects, Label visibility, text, the swap).
const complete = (r, c = CONTRACT) => {
  const e = expectedBase(c);
  return { ...r, paint: { ...r.paint, Button: { ...r.paint.Button, effects: [] } }, visible: { ...e.visible, ...r.visible }, text: e.text, swap: e.swap };
};
const kinds = d => d.changes.map(x => `${x.kind} ${x.section}.${x.node}.${x.field}`);

test('the pinned Contract is the committed one, so the fixtures test what ships', () => {
  assert.equal(contentHash(CONTRACT), contentHash(read(join(ROOT, 'design-systems/carbon/contracts/button.component.json'))));
});

test('the v0 readback has no differences; the fields it did not read are listed, not counted as changes', () => {
  const d = diff(CONTRACT, rb('v0'), FOUNDATIONS);
  assert.equal(d.name, 'Kind=Primary, Size=Large, State=Enabled');
  assert.deepEqual(d.changes, []);
  assert.deepEqual(d.unread, ['paint.Button.effects', 'visible.Label', 'text.Label', 'swap.Glyph']);
  const full = diff(CONTRACT, complete(rb('v0')), FOUNDATIONS);
  assert.deepEqual([full.changes, full.unread], [[], []]);
});

test('the tweaked readback shows the token tweak, the raw tweak, the unlinked text style and the uncarried letterSpacing', () => {
  const d = diff(CONTRACT, rb('tweaked'), FOUNDATIONS);
  assert.deepEqual(kinds(d), [
    'token-edit layout.Button.gap', 'raw-edit layout.Button.paddingTop', 'detached layout.Label.textStyle', 'unmapped layout.Label.letterSpacing',
  ]);
  assert.deepEqual(d.changes[0].to, { token: 'spacing-06' });
  assert.deepEqual(d.changes[1].to, { raw: 14 });
  assert.equal(d.changes[3].to, 0.32);
});

test('blast radius: the gap edit lands on the shared rule (150/245), paddingTop on the size rule (105/245)', () => {
  const r = review(CONTRACT, rb('tweaked'), FOUNDATIONS);
  const [gap, top, style, ls] = r.proposals;
  assert.equal(gap.path, 'layout[0].Button.gap');
  assert.deepEqual(gap.ruleMatch, {});
  assert.deepEqual([gap.blast.count, gap.blast.of, gap.shared], [150, 245, true]);
  assert.deepEqual(gap.shields.map(s => s.rule), [8, 9]);
  assert.equal(top.path, 'layout[4].Button.paddingTop');
  assert.deepEqual(top.ruleMatch, { size: ['lg', 'xl', '2xl'] });
  assert.deepEqual([top.blast.count, top.blast.of], [105, 245]);
  assert.equal(style.expressible, false);
  assert.equal(ls.expressible, false);
});

test('edits land in place with by "owner" and a nested was; raws carry a warning', () => {
  const [gap, top] = review(CONTRACT, rb('tweaked'), FOUNDATIONS).proposals;
  assert.deepEqual(gap.newValue, { token: 'spacing-06', by: 'owner', was: { token: 'spacing-07' } });
  assert.deepEqual(top.newValue, { raw: 14, by: 'owner', was: { raw: 15 }, level: 'warning', reason: RAW_REASON });
  const { contract } = applyEdits(CONTRACT, [gap, top], { confirm: 'all' });
  assert.equal(contract.layout.length, CONTRACT.layout.length, 'no rule is added');
  assert.deepEqual(contract.layout[0].set.Button.gap, gap.newValue);
  assert.deepEqual(contract.layout[4].set.Button.paddingTop, top.newValue);
  assert.equal(contract.selection.status, 'draft');
  assert.deepEqual(ownerEdits(contract).map(e => [e.path, e.by, e.blast.count]), [['layout[0].Button.gap', 'owner', 150], ['layout[4].Button.paddingTop', 'owner', 105]]);
});

test('applying the prototype tweaks gives the prototype contract.v1 (same contentHash, without the new verify notes)', () => {
  const r = review(CONTRACT, rb('tweaked'), FOUNDATIONS);
  const { contract } = applyEdits(CONTRACT, r.proposals, { confirm: 'all' });
  const withoutVerify = { ...contract, notes: contract.notes.filter(n => n.level !== 'verify') };
  assert.equal(contentHash(withoutVerify), contentHash(OWNER_EDITS));
  assert.equal(validate(contract, FOUNDATIONS).ok, true, JSON.stringify(validate(contract, FOUNDATIONS).errors));
});

test('an edit to a shared rule is refused until the owner confirms it', () => {
  const [gap, top] = review(CONTRACT, rb('tweaked'), FOUNDATIONS).proposals;
  assert.throws(() => applyEdits(CONTRACT, [gap, top]), /ask the owner first: Button\.gap changes 150\/245.*Button\.paddingTop changes 105\/245/);
  assert.throws(() => applyEdits(CONTRACT, [gap, top], { confirm: ['Button.gap'] }), /Button\.paddingTop/);
  assert.doesNotThrow(() => applyEdits(CONTRACT, [gap, top], { confirm: ['Button.gap', 'Button.paddingTop'] }));
});

test('an uncarried tweak becomes a warning note that blocks approval', () => {
  const r = review(CONTRACT, rb('tweaked'), FOUNDATIONS);
  const { contract, notes } = applyEdits(CONTRACT, r.proposals, { confirm: 'all' });
  const warn = notes.filter(n => n.level === 'warning');
  assert.deepEqual(warn.map(n => n.at), ['layout.Label.letterSpacing']);
  assert.equal(warn[0].message, OWNER_EDITS.notes.find(n => n.at === 'layout.Label.letterSpacing').message);
  assert.throws(() => approve(contract, AT), /warning note/);
});

test('stale derived raws get a verify note', () => {
  const r = review(CONTRACT, rb('tweaked'), FOUNDATIONS);
  const { notes } = applyEdits(CONTRACT, r.proposals, { confirm: 'all' });
  assert.deepEqual(notes.filter(n => n.level === 'verify').map(n => n.at), ['layout[8].Button.gap', 'layout[4].Button.paddingBottom']);
  assert.match(notes.find(n => n.at === 'layout[8].Button.gap').message, /^Derived raw 28 \(derived: 64px end space/);
});

test('a typed number that equals a token in scope is offered as that token, never upgraded silently', () => {
  const [gap] = review(CONTRACT, rb('typed24'), FOUNDATIONS).proposals;
  assert.equal(gap.change.kind, 'raw-edit');
  assert.deepEqual(gap.tokenCandidates, ['spacing-06']);
  assert.deepEqual(gap.newValue.raw, 24);
});

test('a binding lost while the value stayed is detached, not an edit', () => {
  const r = complete(rb('v0'));
  r.layout.Button.gap = { raw: 32 };
  assert.deepEqual(kinds(diff(CONTRACT, r, FOUNDATIONS)), ['detached layout.Button.gap']);
});

test('effects are compared in order', () => {
  const focus = { ...CONTRACT, selection: CONTRACT.selection };
  const ruleIdx = focus.paint.findIndex(r => r.match.state === 'focus' && r.set.Button && r.set.Button.effects);
  const effects = focus.paint[ruleIdx].set.Button.effects;
  // Put the focus effects on the Base Component, so its readback must report them.
  const c = JSON.parse(JSON.stringify(CONTRACT));
  c.paint[0].set.Button.effects = effects;
  const r = complete(rb('v0'), c);
  const shown = effects.map(e => ({ type: e.type, color: { token: e.color.token }, spread: { raw: e.spread.raw }, blur: { raw: 0 }, x: { raw: 0 }, y: { raw: 0 } }));
  r.paint.Button.effects = shown;
  assert.deepEqual(diff(c, r, FOUNDATIONS).changes, []);
  r.paint.Button.effects = [shown[1], shown[0]];
  assert.deepEqual(kinds(diff(c, r, FOUNDATIONS)), ['unmapped paint.Button.effects']);
});

test('a readback in Figma ids maps to Contract names through the ledger; unknown ids stay visible', () => {
  const ledger = {
    foundations: { variables: { 'spacing-06': 'VariableID:1:6' }, textStyles: { 'body-compact-01': 'S:abc,' }, orphans: { variables: { old: { id: 'VariableID:9:9' } } } },
    icons: { components: { add: { id: '43:5', key: 'k' } } },
  };
  const raw = { layout: { Button: { gap: { var: 'VariableID:1:6' }, x: { var: 'VariableID:7:7' } }, Label: { textStyle: { style: 'S:abc,' } } }, paint: { Glyph: { fill: { var: 'VariableID:9:9' } } }, swap: { Glyph: '43:5', Other: '1:1' } };
  const n = normalizeReadback(raw, ledger);
  assert.deepEqual(n.layout, { Button: { gap: { token: 'spacing-06' }, x: { token: null, id: 'VariableID:7:7' } }, Label: { textStyle: { token: 'body-compact-01' } } });
  assert.deepEqual(n.paint.Glyph.fill, { token: 'old' });
  assert.deepEqual(n.swap, { Glyph: 'add', Other: 'unknown:1:1' });
});

test('discard: a warning note settles only once a clean readback no longer shows the tweak', () => {
  const r = review(CONTRACT, rb('tweaked'), FOUNDATIONS);
  const { contract } = applyEdits(CONTRACT, r.proposals, { confirm: 'all' });
  assert.throws(() => discardNote(contract, 'layout.Label.letterSpacing', rb('tweaked'), FOUNDATIONS), /still shows layout\.Label\.letterSpacing/);
  const settled = discardNote(contract, 'layout.Label.letterSpacing', rb('v1'), FOUNDATIONS);
  const note = settled.notes.find(n => n.at === 'layout.Label.letterSpacing');
  assert.equal(note.level, 'info');
  assert.match(note.message, /^Discarded \(base loop rebuild\): /);
});

test('discard refuses a readback that is not clean, or that does not report the noted field', () => {
  const r = review(CONTRACT, rb('tweaked'), FOUNDATIONS);
  const { contract } = applyEdits(CONTRACT, r.proposals, { confirm: 'all' });
  const blind = { ...rb('v1'), extras: {} };
  assert.throws(() => discardNote(contract, 'layout.Label.letterSpacing', blind, FOUNDATIONS), /does not report extras\.Label\.letterSpacing/);
  const drifted = JSON.parse(JSON.stringify(rb('v1')));
  drifted.layout.Button.paddingLeft = { raw: 12 };
  assert.throws(() => discardNote(contract, 'layout.Label.letterSpacing', drifted, FOUNDATIONS), /not clean/);
});

test('an edit is by the owner, or a simulated owner named as such', () => {
  const change = review(CONTRACT, rb('tweaked'), FOUNDATIONS).changes.find(c => c.kind === 'token-edit');
  assert.throws(() => review(CONTRACT, rb('tweaked'), FOUNDATIONS, { by: 'orchestrator' }), /by "owner"/);
  assert.equal(review(CONTRACT, rb('tweaked'), FOUNDATIONS, { by: 'owner (simulated, test)' }).proposals.find(p => p.change === change || p.id === `${change.node}.${change.field}`).newValue.by, 'owner (simulated, test)');
});

test('approval: only on a clean readback, bound to the snapshotId and contentHash the owner reviewed', () => {
  const r = complete(rb('v0'));
  const ids = { snapshotId: CONTRACT.source.snapshotId, contentHash: contentHash(CONTRACT), at: AT };
  const approved = approveReviewed(CONTRACT, r, FOUNDATIONS, ids);
  assert.deepEqual(approved.selection.approval, { by: 'owner', at: AT, snapshotId: ids.snapshotId, contentHash: ids.contentHash });
  assert.equal(approved.selection.status, 'approved');
  assert.equal(validate(approved, FOUNDATIONS).ok, true);
  assert.throws(() => approveReviewed(CONTRACT, rb('v0'), FOUNDATIONS, ids), /not clean: 0 difference\(s\), 4 field\(s\) not read/);
  assert.throws(() => approveReviewed(CONTRACT, complete(rb('tweaked')), FOUNDATIONS, ids), /not clean: 4 difference/);
  assert.throws(() => approveReviewed(CONTRACT, r, FOUNDATIONS, { ...ids, contentHash: 'sha256:0' }), /the Contract changed since the review/);
  assert.throws(() => approveReviewed(CONTRACT, r, FOUNDATIONS, { ...ids, snapshotId: 'sha256:0' }), /the source moved/);
  const proto = approveReviewed(CONTRACT, r, FOUNDATIONS, { ...ids, prototype: true });
  assert.equal(proto.selection.approval.by, PROTOTYPE_APPROVER);
  assert.equal(validate(proto, FOUNDATIONS).ok, false, 'a prototype approval never validates as an owner approval');
});

test('the approve CLI writes a prototype approval only under .scratch/', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'base-loop-cli-')));
  writeFileSync(join(root, 'readback.json'), JSON.stringify(complete(rb('v0'))));
  const approveTo = (out, ...extra) => spawnSync('node', [SCRIPT, 'approve', join(FIX, 'button.component.json'), 'readback.json',
    '--foundations', join(ROOT, 'design-systems/carbon/carbon.foundations.json'), '--snapshot-id', CONTRACT.source.snapshotId,
    '--content-hash', contentHash(CONTRACT), '--at', AT, '--out', out, ...extra], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  const outside = approveTo(join(root, 'approved.json'), '--prototype');
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /only under \.scratch\//);
  assert.equal(existsSync(join(root, 'approved.json')), false);
  const inside = approveTo('.scratch/base-loop/approved.json', '--prototype');
  assert.equal(inside.status, 0, inside.stderr);
  assert.deepEqual(read(join(root, '.scratch/base-loop/approved.json')).selection.approval,
    { by: PROTOTYPE_APPROVER, at: AT, snapshotId: CONTRACT.source.snapshotId, contentHash: contentHash(CONTRACT) });
  const stale = approveTo(join(root, 'owner.json'), '--content-hash', 'sha256:0');
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /the Contract changed since the review/);
  assert.equal(existsSync(join(root, 'owner.json')), false);
});

test('regenerating from the saved readbacks reproduces the committed outputs byte for byte', () => {
  const out = regenerate(FIX, CONTRACT, FOUNDATIONS);
  const expected = readdirSync(join(FIX, 'expected')).sort();
  assert.deepEqual(Object.keys(out).sort(), expected);
  for (const name of expected) assert.equal(out[name], readFileSync(join(FIX, 'expected', name), 'utf8'), name);
  assert.deepEqual(regenerate(FIX, CONTRACT, FOUNDATIONS), out);
});
