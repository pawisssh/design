// The To-handoff tracer (#112): one HTML Prototype -> generate -> validateHandoff -> render (static HTML).
// The Design System is assembled in a temp dir from the committed Carbon Foundations document and Button
// Contract, the form-control fixture Contracts and the fixture avatar-stack Proposal, so nothing is written
// under design-systems/. Assertions are properties, not byte goldens: the Foundations document grows (#109).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentHash, validate } from '../../contract/scripts/contract.mjs';
import { generate as carbonFoundations } from '../../adapter-carbon/scripts/foundations.mjs';
import { hasSources, readSources } from '../../adapter-carbon/scripts/sources.mjs';
import { hasDeps } from '../scripts/deps.mjs';
import { generate, loadDesignSystem, render, renderHtml, validateHandoff } from '../scripts/handoff.mjs';
import { parseInline } from '../scripts/css.mjs';
import { matchDeclaration, matchText } from '../scripts/match.mjs';
import { innerHtmlTemplates } from '../scripts/reader.mjs';
import { mediaAtBreakpoints } from '../scripts/generate.mjs';
import { standIns } from '../scripts/recognise.mjs';
import { BUTTON, DECISIONS, PROTOTYPE, designSystem, fixture, repo, usagesOf as usages } from './helpers.mjs';

const BUTTON_BYTES = readFileSync(BUTTON, 'utf8');
// Stands in for the Adapter's agent step: the TextInput Contract an agent wrote under adapter-carbon SKILL.md §2.
const DRAFT = fixture('drafts/text-input.component.json');
// A raw email field keeps its own styles in its region, so they need the token picks a Contract usage doesn't.
const RAW_EMAIL = { 'textStyle:12/16/400/0.32': 'label-01', 'token:border-color:#8d8d8d': 'border-strong-01', 'token:background-color:#ffffff': 'field-02' };
const noDeps = !hasDeps() && 'parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';

let shared;
async function run() {
  if (shared) return shared;
  const ds = designSystem();
  const result = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS });
  shared = { ds, result, handoff: result.handoff, system: await loadDesignSystem(ds) };
  return shared;
}
const usage = (h, id) => usages(h).find(u => u.id === id);
const styles = h => h.screens.flatMap(s => s.regions.flatMap(r => r.styles || []));
const texts = h => h.screens.flatMap(s => s.regions.flatMap(r => r.text || []));
// fn edits a copy of the Handoff; the result is its validation messages, one per line.
const editor = (handoff, system) => fn => { const h = JSON.parse(JSON.stringify(handoff)); fn(h); return validateHandoff(h, system).errors.map(e => e.message).join('\n'); };

test('generate -> validate on the fixture with a fixed decisions.json: no requests, a valid Handoff, stored by feature key', { skip: noDeps }, async () => {
  const { ds, result, handoff, system } = await run();
  assert.deepEqual(result.requests, []);
  assert.equal(result.path, join(ds, 'handoffs/invite-teammates/handoff.json'));
  assert.ok(existsSync(result.path));
  const check = validateHandoff(handoff, system);
  assert.deepEqual(check.errors, []);
  assert.equal(handoff.status, 'pending');
  assert.equal(handoff.approval, null);
  assert.equal(handoff.revision, 1);
  assert.deepEqual(Object.keys(handoff.source.prototype.files), ['index.html']);
  assert.match(handoff.source.prototype.snapshotId, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(handoff.source.modes, { light: 'white' });
  assert.ok(handoff.source.notes.some(n => n.level === 'info' && /single-mode/i.test(n.text)));
  assert.match(handoff.source.foundations.usedHash, /^sha256:/);
});

test('Button usages are Contract usages with tuples, recognised by the agent; the avatar stack is a Proposal usage', { skip: noDeps }, async () => {
  const { handoff } = await run();
  const button = JSON.parse(BUTTON_BYTES);
  assert.deepEqual(handoff.source.contracts.button, { snapshotId: button.source.snapshotId, contentHash: contentHash(button) });
  const send = usage(handoff, 'send');
  assert.equal(send.contract, 'button');
  assert.deepEqual(send.tuple, { kind: 'primary', size: 'md' });
  assert.equal(send.match.by, 'agent');
  assert.equal(send.match.via, 'library');
  assert.equal(handoff.copy[send.properties.label.slice(5)].text, 'Send invites');
  assert.deepEqual(usage(handoff, 'link-danger').tuple, { kind: 'danger--ghost', size: 'sm' });
  assert.equal(usage(handoff, 'link-danger').match.via, 'element');
  const copy = usage(handoff, 'copy');
  assert.deepEqual(copy.offAxis.map(o => [o.property, o.raw]), [['background-color', '#198754']]);
  assert.ok(handoff.openQuestions.some(q => q.id === copy.offAxis[0].question));
  const avatars = usage(handoff, 'avatars');
  assert.equal(avatars.proposal, 'avatar-stack');
  assert.deepEqual(avatars.tuple, { size: 'sm' });
  assert.match(handoff.source.proposals['avatar-stack'], /^sha256:[0-9a-f]{64}$/);
  const role = usage(handoff, 'role');
  assert.equal(role.contract, 'select');
  assert.equal(role.properties.id, 'role');
  assert.deepEqual(role.items.map(i => handoff.copy[i.properties.value.slice(5)].text), ['Viewer', 'Editor', 'Admin']);
  const toast = usage(handoff, 'toast');
  assert.ok(toast.raw && toast.reason);
  assert.ok(handoff.openQuestions.some(q => q.id === toast.question && q.kind === 'no-contract'));
  // Support tokens are in for regions: the toast's #24a148 is exactly support-success, not Off-system.
  assert.equal(styles(handoff).find(s => s.raw === '#24a148').token, 'support-success');
  assert.ok(!handoff.values.some(v => Object.values(v.raw).includes('#24a148')));
});

test('a family with no Contract: the Adapter\'s draft is checked, written into contracts/ at draft, and the usage points at it', { skip: noDeps }, async () => {
  const { ds, handoff } = await run();
  const written = join(ds, 'contracts/text-input.component.json');
  assert.equal(readFileSync(written, 'utf8'), readFileSync(DRAFT, 'utf8'), 'the draft is written once, as the Adapter wrote it');
  const draft = JSON.parse(readFileSync(written, 'utf8'));
  assert.equal(draft.selection.status, 'draft');
  assert.equal(draft.selection.approval, null);
  assert.ok(Object.keys(draft.drafted).length > 0, 'Drafted values from the start');
  const email = usage(handoff, 'email');
  assert.equal(email.contract, 'text-input');
  assert.deepEqual(email.tuple, { size: 'md' });
  assert.deepEqual(email.match, { by: 'agent', via: 'element' });
  assert.equal(email.properties.id, 'email');
  assert.deepEqual(handoff.source.contracts['text-input'], { snapshotId: draft.source.snapshotId, contentHash: contentHash(draft) });
  assert.ok(handoff.source.notes.some(n => /`text-input`.*mid-run at status draft/.test(n.text)));
  assert.ok(!handoff.openQuestions.some(q => q.id === 'q-no-contract-email'));
});

test('a draft that fails the check, can\'t be read, can\'t be written or isn\'t a draft falls back to raw plus a question, and joins no contracts/', { skip: noDeps }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'to-handoff-draft-'));
  const write = (name, edit) => { const c = JSON.parse(readFileSync(DRAFT, 'utf8')); edit(c); const p = join(scratch, name); writeFileSync(p, JSON.stringify(c, null, 2)); return p; };
  const cases = [
    [{ path: write('bad-token.json', c => { c.paint[0].set.Field.fill = { token: 'no-such-token' }; }) }, /fails the Adapter's check: .*no-such-token/],
    [{ path: write('approved.json', c => { c.selection.status = 'approved'; }) }, /stays status draft with approval null/],
    [{ path: write('other-pin.json', c => { c.source.commit = '0'.repeat(40); }) }, /not the Design System's Carbon pin/],
    [{ path: join(scratch, 'missing.json') }, /could not be read/],
    [{ unwritable: 'TextInput needs the Tooltip Contract for its counter, and that one can\'t be written either' }, /Tooltip Contract/],
  ];
  for (const [answer, why] of cases) {
    const ds = designSystem();
    const { handoff, requests } = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: { ...DECISIONS, ...RAW_EMAIL, 'contract:text-input': answer } });
    assert.deepEqual(requests, []);
    const email = usage(handoff, 'email');
    assert.equal(email.contract, undefined);
    assert.deepEqual(email.raw, { element: 'input[type=email]' });
    assert.match(email.reason, /no Contract/);
    const q = handoff.openQuestions.find(x => x.id === email.question);
    assert.equal(q.kind, 'no-contract');
    assert.match(q.text, why);
    assert.equal(handoff.source.contracts['text-input'], undefined);
    assert.ok(!existsSync(join(ds, 'contracts/text-input.component.json')), 'a failed draft is never written');
  }
});

const noCarbon = !hasSources() && 'Carbon sources missing; run: node skills/adapter-carbon/scripts/sources.mjs';
test('a mid-run draft leaves the Foundations document alone; the owner re-generating it for the new family keeps usedHash', { skip: noDeps || noCarbon }, async () => {
  const ds = designSystem();
  const path = join(ds, 'carbon.foundations.json');
  const before = readFileSync(path, 'utf8');
  const first = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS });
  assert.equal(readFileSync(path, 'utf8'), before);
  // The Carbon foundations step, once text-input joins contracts/. The draft's tokens are all in Carbon's whole
  // theme already (ADR 0006), so only closure and usedBy move, and usedHash leaves usedBy out (ADR 0007).
  const read = p => ({ path: p, contract: JSON.parse(readFileSync(p, 'utf8')) });
  const doc = JSON.parse(carbonFoundations({ sources: readSources(), contracts: [read(BUTTON), read(join(ds, 'contracts/text-input.component.json'))] }).text);
  const old = JSON.parse(before);
  assert.deepEqual(doc.collections, old.collections);
  const changed = Object.keys(doc.variables).filter(k => JSON.stringify(doc.variables[k]) !== JSON.stringify(old.variables[k]));
  assert.ok(changed.length);
  for (const k of changed) assert.deepEqual({ ...doc.variables[k], usedBy: [] }, { ...old.variables[k], usedBy: [] }, k);
  for (const k of Object.keys(doc.textStyles)) assert.deepEqual({ ...doc.textStyles[k], usedBy: [] }, { ...old.textStyles[k], usedBy: [] }, k);
  // Some of them are tokens this Handoff uses, so the test would see a usedBy leak into usedHash.
  assert.ok(styles(first.handoff).some(s => changed.includes(s.token)));
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  const again = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS });
  assert.equal(again.handoff.source.foundations.usedHash, first.handoff.source.foundations.usedHash);
  assert.notEqual(again.handoff.source.foundations.documentHash, first.handoff.source.foundations.documentHash);
});

test('an open draft request writes no Contract; an existing, different Contract is never replaced', { skip: noDeps }, async () => {
  const ds = designSystem();
  const { [`contract:text-input`]: _, ...rest } = DECISIONS;
  const open = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: rest });
  assert.ok(open.requests.some(r => r.key === 'contract:text-input'));
  assert.equal(open.path, null);
  assert.match(open.requests[0].question, /skills\/adapter-carbon\/SKILL\.md/);
  assert.ok(!existsSync(join(ds, 'contracts/text-input.component.json')));
  const other = JSON.parse(readFileSync(DRAFT, 'utf8'));
  other.family.description = 'A hand-written TextInput';
  writeFileSync(join(ds, 'contracts/text-input.component.json'), JSON.stringify(other));
  await assert.rejects(generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS }), /another `text-input` Contract/);
  assert.equal(JSON.parse(readFileSync(join(ds, 'contracts/text-input.component.json'), 'utf8')).family.description, 'A hand-written TextInput');
  // Once the owner approves the written draft, a re-run with the same answers keeps the approved Contract.
  const approved = JSON.parse(readFileSync(DRAFT, 'utf8'));
  approved.selection.status = 'approved';
  approved.selection.approval = { by: 'owner', contentHash: contentHash(approved) };
  const bytes = JSON.stringify(approved);
  writeFileSync(join(ds, 'contracts/text-input.component.json'), bytes);
  const after = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS });
  assert.equal(readFileSync(join(ds, 'contracts/text-input.component.json'), 'utf8'), bytes);
  assert.equal(usage(after.handoff, 'email').contract, 'text-input');
  assert.ok(!after.handoff.source.notes.some(n => /mid-run/.test(n.text)));
  assert.doesNotMatch(await renderHtml(after.handoff, await loadDesignSystem(ds)), /<code>text-input<\/code> Contract draft/);
});

test('#edf5ff is Off-system with nearest and its Primitive; a near match and a tied pick are flagged', { skip: noDeps }, async () => {
  const { handoff } = await run();
  const promo = handoff.values.find(v => v.raw.light === '#edf5ff');
  assert.ok(promo, 'an Off-system value for #edf5ff');
  assert.equal(promo.role, 'background-color');
  assert.equal(promo.primitive, 'blue.10');
  for (const t of ['field-01', 'layer-01']) assert.ok(promo.nearest.some(n => n.token === t), t);
  assert.ok(styles(handoff).some(s => s.value === `value:${promo.id}`));
  const tie = styles(handoff).find(s => s.raw === '#f4f4f4' && s.property === 'background-color');
  assert.equal(tie.token, 'layer-01');
  assert.equal(tie.by, 'agent');
  assert.ok(tie.candidates.includes('field-01') && !tie.match);
  const near = styles(handoff).find(s => s.raw === '#fafafa');
  assert.equal(near.match, 'near');
  assert.equal(near.by, 'agent');
  assert.ok(near.delta > 0 && near.delta <= 0.02);
  const h1 = handoff.screens[0].regions.flatMap(r => r.text || []).find(t => handoff.copy[t.copy].text === 'Invite teammates');
  // 20/30 is 2px off heading-03's 20/28, beyond "near" (within 1px): only the font size matches, a tied pick.
  assert.equal(h1.style.textStyle, undefined);
  assert.equal(h1.style.partial.fontSize.token, 'heading-03-font-size');
  assert.equal(h1.style.partial.fontSize.by, 'agent');
  assert.equal(h1.style.value, 'value:text-20-30-400-0');
  const ref = styles(handoff).find(s => s.property === 'border-color');
  assert.equal(ref.token, 'border-subtle-01');
  assert.ok(handoff.openQuestions.filter(q => q.kind === 'font').length === 1);
  // A static run never saw a viewport, and says so (#146).
  assert.equal(handoff.openQuestions.find(q => q.id === 'q-breakpoint-max-width-640px').text,
    '@media (max-width: 640px) changes .actions, .actions .btn; the static reader has no viewport. Which Design System breakpoint is it, and what should change there?');
});

test('text that matches no Text Style is one Off-system value per metric, with its nearest Text Styles (#287)', { skip: noDeps }, async () => {
  const { handoff, system } = await run();
  const off = texts(handoff).filter(t => !t.style.textStyle);
  assert.equal(off.length, 5);
  // Each is a partial match: it keeps its font-size token and points at a value instead of a raw metric.
  for (const t of off) {
    assert.equal(t.style.raw, undefined);
    assert.ok(t.style.partial.fontSize.token);
    assert.match(t.style.value, /^value:text-/);
  }
  const values = handoff.values.filter(v => v.role === 'text');
  assert.deepEqual(values.map(v => [v.id, v.raw.light, v.metric, v.at.length]), [
    ['text-20-30-400-0', '20px/30px/400/0px', { fontSize: 20, lineHeight: 30, fontWeight: 400, letterSpacing: 0 }, 1],
    ['text-14-normal-400-0', '14px/normal/400/0px', { fontSize: 14, lineHeight: null, fontWeight: 400, letterSpacing: 0 }, 4],
  ]);
  for (const v of values) {
    assert.deepEqual(off.filter(t => t.style.value === `value:${v.id}`).map(t => t.at), v.at);
    assert.ok(v.nearest.length > 0 && v.nearest.length <= 3);
    for (const n of v.nearest) assert.ok(system.foundations.textStyles[n.token], `${n.token} is a Text Style`);
    assert.equal(v.nearest[0].delta, 0, 'a Text Style of the same font size comes first');
  }
  assert.match(values[0].reason, /heading-03-font-size/);
});

test('an answer of "value" to a text-near request gives a text Off-system value (#287)', { skip: noDeps }, async () => {
  // The lead paragraph at 14/19 is 1px off body-compact-01's 14/18: near, not exact.
  const proto = join(mkdtempSync(join(tmpdir(), 'to-handoff-near-')), 'index.html');
  writeFileSync(proto, readFileSync(PROTOTYPE, 'utf8').replace('line-height: 18px; letter-spacing: 0.16px', 'line-height: 19px; letter-spacing: 0.16px'));
  const ds = designSystem();
  const key = 'textStyle:14/19/400/0.16';
  const request = (await generate({ prototype: proto, designSystem: ds, decisions: DECISIONS })).requests.find(r => r.key === key);
  assert.equal(request.kind, 'text-near');
  assert.match(request.question, /or "value" to keep it Off-system/);
  const { handoff, system } = await generate({ prototype: proto, designSystem: ds, decisions: { ...DECISIONS, [key]: 'value' } }).then(async r => ({ handoff: r.handoff, system: await loadDesignSystem(ds) }));
  const lead = texts(handoff).find(t => t.style.value === 'value:text-14-19-400-0-16');
  assert.ok(lead, 'the lead points at its value');
  assert.equal(lead.style.textStyle, undefined);
  const v = handoff.values.find(x => x.id === 'text-14-19-400-0-16');
  assert.deepEqual([v.role, v.raw.light, v.metric], ['text', '14px/19px/400/0.16px', { fontSize: 14, lineHeight: 19, fontWeight: 400, letterSpacing: 0.16 }]);
  assert.match(v.reason, /The owner kept 14px\/19px\/400\/0.16px Off-system rather than/);
  for (const n of v.nearest) assert.ok(system.foundations.textStyles[n.token], n.token);
  assert.deepEqual(validateHandoff(handoff, system).errors, []);
});

test('states, Stand-ins and the missing error state come from the Prototype', { skip: noDeps }, async () => {
  const { handoff } = await run();
  const states = handoff.screens[0].states;
  for (const k of ['default', 'loading', 'empty', 'error', 'success']) assert.ok(states[k], k);
  assert.equal(states.error.missing, true);
  assert.ok(handoff.openQuestions.some(q => q.id === states.error.question));
  assert.equal(states.loading.usageStates.send.state, 'disabled');
  assert.equal(handoff.copy[states.loading.usageStates.send.properties.label.slice(5)].text, 'Sending…');
  assert.equal(states.default.usageStates.send.state, 'disabled');
  assert.ok(handoff.data.some(d => d.source === 'mock' && /mockInvites/.test(d.note)));
  assert.ok(handoff.data.some(d => d.source === 'simulated'));
  assert.ok(Object.values(handoff.copy).some(c => c.placeholder && /Lorem ipsum/.test(c.text)));
  assert.ok(handoff.acceptance.length > 0 && handoff.acceptance.every(a => a.by === 'agent'));
});

test('a setTimeout that only clears a status message after the work is not simulated work (#217)', () => {
  const text = `
  function sendInvites() {
    state.isSending = true; render();
    setTimeout(() => { state.isSending = false; state.sent = true; render(); }, 800);
  }
  function loadState() {
    const raw = localStorage.getItem('save');
    if (!raw) { state.msg = 'No save found'; render(); setTimeout(() => { state.msg = null; render(); }, 2000); return; }
    try { state.funds = JSON.parse(raw).funds; render(); } catch { state.msg = 'Load failed'; setTimeout(() => { state.msg = ''; render(); }, 2000); }
  }
  function copyLink() { state.msg = 'Copied'; render(); setTimeout(function () { state.msg = \`\`; render(); }, TOAST_MS); }
  function saveAndConfirm() {
    state.isSaving = true; render();
    setTimeout(() => { state.isSaving = false; state.done = true; render(); setTimeout(() => { state.msg = undefined; render(); }, 3000); }, 600);
  }
  function confirmThenSave() {
    state.msg = 'Saving…'; setTimeout(() => { state.msg = null; }, 1500);
    state.isSaving = true; setTimeout(() => { state.isSaving = false; state.saved = true; }, 900);
  }`;
  assert.deepEqual(standIns([{ text, offset: 0 }]).simulated.map(f => ({ name: f.name, delay: f.delay, before: f.before, after: f.after })), [
    { name: 'sendInvites', delay: 800, before: ['state.isSending'], after: ['state.sent'] },
    { name: 'saveAndConfirm', delay: 600, before: ['state.isSaving'], after: ['state.done'] },
    { name: 'confirmThenSave', delay: 900, before: ['state.isSaving'], after: ['state.saved'] },
  ]);
});

test('generate with an empty decisions file returns decision requests and writes nothing', { skip: noDeps }, async () => {
  const ds = designSystem();
  const result = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: {} });
  assert.equal(result.handoff, undefined);
  assert.equal(result.path, null);
  assert.ok(!existsSync(join(ds, 'handoffs')));
  const keys = result.requests.map(r => r.key);
  for (const k of ['recognise:button.btn.btn-primary', 'token:background-color:#f4f4f4', 'token:background-color:#fafafa', 'feature', 'acceptance'])
    assert.ok(keys.includes(k), k);
  assert.deepEqual(keys, [...new Set(keys)], 'one request per stable key');
  const tie = result.requests.find(r => r.key === 'token:background-color:#f4f4f4');
  assert.ok(tie.candidates.includes('layer-01') && tie.candidates.includes('field-01'));
});

test('an answer that is not among its request candidates is refused', { skip: noDeps }, async () => {
  const bad = { ...DECISIONS, 'token:background-color:#f4f4f4': 'button-primary' };
  await assert.rejects(generate({ prototype: PROTOTYPE, designSystem: designSystem(), decisions: bad }), /token:background-color:#f4f4f4.*button-primary/);
  const tuple = { ...DECISIONS, 'recognise:button.btn.btn-primary': { ...DECISIONS['recognise:button.btn.btn-primary'], tuple: { kind: 'success' } } };
  await assert.rejects(generate({ prototype: PROTOTYPE, designSystem: designSystem(), decisions: tuple }), /kind.*success/);
});

test('a re-run is byte-identical and writes nothing; two Design System copies give the same bytes', { skip: noDeps }, async () => {
  const { ds, result } = await run();
  const before = readFileSync(result.path, 'utf8');
  const again = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS });
  assert.equal(again.wrote, false);
  assert.equal(readFileSync(result.path, 'utf8'), before);
  const other = await generate({ prototype: PROTOTYPE, designSystem: designSystem(), decisions: DECISIONS });
  assert.equal(readFileSync(other.path, 'utf8'), before);
});

test('the Button Contract stays byte-unchanged, keeps its approved contentHash and still validates', { skip: noDeps }, async () => {
  await run();
  assert.equal(readFileSync(BUTTON, 'utf8'), BUTTON_BYTES);
  const button = JSON.parse(BUTTON_BYTES);
  assert.equal(contentHash(button), button.selection.approval.contentHash);
  assert.deepEqual(validate(button, JSON.parse(readFileSync(repo('design-systems/carbon/carbon.foundations.json'), 'utf8'))).errors, []);
});

test('validateHandoff refuses a bad tuple, an unknown or non-theme token, a missing copy id and a retired Proposal', { skip: noDeps }, async () => {
  const { handoff, system } = await run();
  const edit = editor(handoff, system);
  assert.match(edit(h => { usages(h).find(u => u.id === 'send').tuple.kind = 'success'; }), /send.*kind.*success/);
  assert.match(edit(h => { styles(h).find(s => s.token === 'layer-01').token = 'layer-99'; }), /unknown token "layer-99"/);
  assert.match(edit(h => { styles(h).find(s => s.token === 'layer-01').token = 'button-primary'; }), /component token/);
  assert.match(edit(h => { styles(h).find(s => s.token === 'layer-01').token = 'blue.10'; }), /Primitive/);
  assert.match(edit(h => { usages(h).find(u => u.id === 'send').properties.label = 'copy:nope'; }), /copy:nope/);
  assert.match(edit(h => { delete h.screens[0].states.empty; }), /empty/);
  const retired = await loadDesignSystem(designSystem());
  retired.proposals['avatar-stack'] = { ...retired.proposals['avatar-stack'], retirement: { contract: 'button', how: 'replaced', map: {}, by: 'owner', at: '2026-10-17' } };
  assert.match(validateHandoff(handoff, retired).errors.map(e => e.message).join('\n'), /`avatar-stack` retired into `button`: migrate/);
});

test('validateHandoff refuses a text value without a metric, a metric on another role and a nearest that is no Text Style (#287)', { skip: noDeps }, async () => {
  const { handoff, system } = await run();
  const edit = editor(handoff, system);
  const textValue = h => h.values.find(v => v.role === 'text');
  assert.equal(edit(() => {}), '');
  assert.match(edit(h => { delete textValue(h).metric; }), /values\[\d+\] \(text-20-30-400-0\): a text value needs a metric/);
  assert.match(edit(h => { h.values.find(v => v.role === 'background-color').metric = textValue(h).metric; }), /values\[\d+\] \(background-color-edf5ff\): only a text value has a metric/);
  assert.match(edit(h => { textValue(h).nearest[0].token = 'heading-03-font-size'; }), /unknown Text Style "heading-03-font-size"/);
  assert.match(edit(h => { texts(h).find(t => t.style.value).style.value = 'value:nope'; }), /text\[\d+\]: unknown value "value:nope"/);
  assert.match(edit(h => { delete texts(h).find(t => t.style.value).style.value; }), /text\[\d+\]: text with no Text Style needs a value/);
  assert.match(edit(h => { texts(h).find(t => t.style.value).style.value = 'value:background-color-edf5ff'; }), /text\[\d+\]: "value:background-color-edf5ff" is not a text value/);
});

test('validateHandoff refuses a usage tuple that a Contract\'s selection.omit leaves out, naming the rule (#245)', { skip: noDeps }, async () => {
  const { handoff, system } = await run();
  // The committed Carbon Button omits nothing, so each case gives it the omit list it needs.
  const withOmit = omit => {
    const button = system.contracts.button;
    return editor(handoff, { ...system, contracts: { ...system.contracts, button: { ...button, selection: { ...button.selection, omit } } } });
  };
  // send is {kind: primary, size: md}.
  assert.match(withOmit([{ match: { kind: 'primary', size: 'md' } }])(() => {}), /send.*{kind: primary, size: md}.*selection\.omit\[0\] of `button`.*"kind":"primary"/);
  assert.equal(withOmit([{ match: { kind: 'danger', size: 'md' } }])(() => {}), '');
  // An axis the tuple leaves out is its default (size lg), as the matcher completes it.
  const noSize = h => { delete usage(h, 'link-danger').tuple.size; };
  assert.equal(withOmit([{ match: { kind: 'danger--ghost', size: 'lg' } }])(() => {}), '');
  assert.match(withOmit([{ match: { kind: 'secondary' } }, { match: { kind: 'danger--ghost', size: 'lg' } }])(noSize), /link-danger.*selection\.omit\[1\]/);
  // State is expanded: a usage with no state is refused only when every State is omitted, one with a state when that one is.
  assert.equal(withOmit([{ match: { kind: 'primary', state: 'disabled' } }])(() => {}), '');
  assert.match(withOmit([{ match: { kind: 'primary', state: 'disabled' } }])(h => { usage(h, 'send').state = 'disabled'; }), /send.*selection\.omit\[0\]/);
  assert.match(withOmit([{ match: { kind: 'primary' } }])(() => {}), /send.*selection\.omit\[0\]/);
  // A Family map site switching an axis (size, default lg) is refused only when every value it switches between is left out.
  const switching = switches => h => { const u = usage(h, 'send'); delete u.tuple.size; u.match = { by: 'family-map', switches }; };
  assert.doesNotMatch(withOmit([{ match: { kind: 'primary', size: 'lg' } }])(switching({ size: ['md', 'sm'] })), /usage `send`/);
  assert.match(withOmit([{ match: { kind: 'primary', size: ['md', 'sm'] } }])(switching({ size: ['md', 'sm'] })), /send.*selection\.omit\[0\]/);
});

test('validateHandoff refuses a duplicate data id and a duplicate question id (#370)', { skip: noDeps }, async () => {
  const { handoff, system } = await run();
  const edit = editor(handoff, system);
  assert.match(edit(h => { h.data[1].id = h.data[0].id; }), /data\[1\]: duplicate data id "invites"/);
  assert.match(edit(h => { h.openQuestions.push({ ...h.openQuestions[0] }); }), /openQuestions\[\d+\]: duplicate question id "q-/);
});

test('validateHandoff checks each usage\'s in (#193): a Contract usage on the same screen, and no cycle', { skip: noDeps }, async () => {
  const { handoff, system } = await run();
  const edit = editor(handoff, system);
  const set = (h, id, target) => { usage(h, id).in = target; };
  assert.equal(edit(h => { set(h, 'send', 'cancel'); set(h, 'cancel', 'copy'); }), '');
  assert.match(edit(h => set(h, 'send', 'nope')), /`send`: in "nope" names no usage on this screen/);
  assert.match(edit(h => {
    const other = JSON.parse(JSON.stringify(h.screens[0]));
    other.id = 'other';
    other.regions[0].usages.push({ ...usage(h, 'cancel'), id: 'elsewhere' });
    h.screens.push(other);
    set(h, 'send', 'elsewhere');
  }), /screens\[0\].*`send`: in "elsewhere" names no usage on this screen/);
  assert.match(edit(h => set(h, 'send', 'toast')), /`send`: in "toast" names a usage with no Contract/);
  assert.match(edit(h => set(h, 'send', 'avatars')), /`send`: in "avatars" names a usage with no Contract/);
  assert.match(edit(h => set(h, 'send', 'send')), /`send`: in forms a cycle: send -> send/);
  const two = edit(h => { set(h, 'send', 'cancel'); set(h, 'cancel', 'send'); });
  assert.match(two, /`send`: in forms a cycle: send -> cancel -> send/);
  assert.match(two, /`cancel`: in forms a cycle: cancel -> send -> cancel/);
});

test('the matcher never lets a Primitive or a component token match a region, even by reference', { skip: noDeps }, async () => {
  const { system } = await run();
  const ctx = { system, mode: 'white' };
  const family = matchDeclaration({ property: 'background-color', value: 'var(--cds-button-primary)' }, ctx);
  assert.equal(family.kind, 'off-system');
  assert.match(family.reason, /component token/);
  const unknown = matchDeclaration({ property: 'background-color', value: 'var(--cds-nope)' }, ctx);
  assert.equal(unknown.kind, 'off-system');
  assert.match(unknown.reason, /unknown token `--cds-nope`/);
  const primary = matchDeclaration({ property: 'background-color', value: '#0f62fe' }, ctx);
  assert.ok(![primary.token, ...(primary.candidates || []), ...(primary.nearest || []).map(n => n.token)].some(t => t && system.foundations.variables[t] && (system.foundations.variables[t].family || system.foundations.variables[t].hidden)));
});

test('edge values: a named colour is Off-system, never dropped; a var() fallback is matched; text "near" is within 1px', { skip: noDeps }, async () => {
  const { system } = await run();
  const ctx = { system, mode: 'white' };
  assert.deepEqual(parseInline('border: 1px solid gray; background: red').map(d => `${d.property} ${d.value}`),
    ['border-color gray', 'border-width 1px', 'background-color red']);
  const named = matchDeclaration({ property: 'background-color', value: 'red' }, ctx);
  assert.equal(named.kind, 'off-system');
  assert.match(named.reason, /`red` is not a colour the shared converter reads/);
  assert.equal(matchDeclaration({ property: 'color', value: 'inherit' }, ctx).kind, 'skip');
  assert.deepEqual(matchDeclaration({ property: 'color', value: 'var(--nope, #161616)' }, ctx), { kind: 'tie', candidates: ['icon-primary', 'text-primary'] });
  const style = { fontSize: 14, fontWeight: 400, letterSpacing: 0.16 };
  assert.equal(matchText({ ...style, lineHeight: 18 }, ctx).kind, 'tie');
  assert.equal(matchText({ ...style, lineHeight: 19 }, ctx).kind, 'near');
  assert.equal(matchText({ ...style, lineHeight: 30 }, ctx).kind, 'partial');
});

test('an unclosed comment in a template hole ends the scan instead of looping', () => {
  assert.ok(Array.isArray(innerHtmlTemplates('app.innerHTML = `<p>${a /* never closed`;')));
});

const noRender = async () => {
  if (noDeps) return noDeps;
  const { adapter } = await loadDesignSystem(designSystem());
  return !adapter.available() && 'Code Library preview packages missing; run: node skills/adapter-carbon/scripts/sources.mjs';
};

test('render writes the static HTML Rendering: real renders, flags, mode toggle, stamp, Not specified, missing screenshots', { skip: await noRender() }, async () => {
  const { ds, result, handoff, system } = await run();
  const out = await render({ handoffPath: result.path, designSystem: ds });
  assert.equal(out, join(ds, 'handoffs/invite-teammates/renderings/index.html'));
  const html = readFileSync(out, 'utf8');
  assert.match(html, /class="[^"]*cds--btn--primary/);
  assert.match(html, /class="[^"]*cds--btn--danger--ghost/);
  assert.match(html, /cds--text-input/);
  // A usage of a draft Contract says so on its card, and Needs a look lists the Contract with its Drafted values.
  const card = id => html.slice(html.indexOf(`<article class="card" id="usage-${id}">`)).split('</article>')[0];
  assert.match(card('email'), /Contract draft, not approved/);
  assert.doesNotMatch(card('send'), /Contract draft/);
  const drafted = Object.keys(JSON.parse(readFileSync(DRAFT, 'utf8')).drafted).length;
  assert.match(html, new RegExp(`<code>text-input</code> Contract draft, not approved.*${drafted} Drafted values`));
  assert.match(html, /<SelectItem value="Viewer" text="Viewer" \/>/);
  assert.match(html, /<Button kind="danger--ghost" size="sm">Remove<\/Button>/);
  for (const [g, word] of [['≠', 'Off-system'], ['≈', 'near'], ['◇', 'agent pick'], ['+', 'Proposal'], ['∅', 'no Contract'], ['↯', 'off-axis'], ['!', 'missing'], ['◌', 'mock'], ['=', 'exact'], ['✓', 'import'], ['?', 'q-state-error']])
    assert.ok(html.includes(`data-g="${g}"`) && html.includes(word), `${g} ${word}`);
  assert.match(html, /<li id="q-state-error">/, 'a "? q-…" flag links to its question');
  assert.match(html, /<p class="counts">.*≠ Off-system<\/span> \d+/, 'Needs a look counts its flags per kind');
  assert.match(html, />Needs a look \(\d+\)<\/a>/);
  // A text value (#287): ≠ in its region's text row, and no swatch in the values table.
  assert.match(html.match(/<tr><td>header<\/td><td>“Invite teammates”<\/td>.*?<\/tr>/)[0], /<code>value:text-20-30-400-0<\/code>.*data-g="≠"/);
  assert.doesNotMatch(html.match(/<tr><td><code>text-20-30-400-0<\/code><\/td>.*?<\/tr>/)[0], /swatch/);
  assert.match(html, /<code>20px\/30px\/400\/0px<\/code> as text/);
  assert.match(html, /screenshot missing · static-only: generated without the runtime reader/);
  const themeModes = system.foundations.collections.find(c => c.key === 'theme').modes;
  for (const m of themeModes) {
    assert.ok(html.includes(`>${m.label}</option>`), m.label);
    assert.ok(m.selector && html.includes(`data-class="${m.selector.slice(1)}"`), `${m.key} applies as its selector's class`);
  }
  // A Mode with no selector falls back to the Adapter renderer's class.
  const bare = { ...system, foundations: { ...system.foundations, collections: system.foundations.collections.map(c => (c.key === 'theme' ? { ...c, modes: c.modes.map(({ selector, ...m }) => m) } : c)) } };
  const fallback = await renderHtml(handoff, bare);
  const renderer = await system.adapter.renderer(system.contracts.button);
  for (const m of themeModes) assert.ok(fallback.includes(`data-class="${renderer.modeClass(m.key)}"`), `${m.key} falls back to modeClass`);
  assert.ok(html.includes(handoff.revision ? `r${handoff.revision}` : 'r?'));
  assert.ok(html.includes(result.contentHash.slice(7, 19)));
  assert.match(html, /pending sign-off/);
  assert.match(html, /Not specified · this Handoff has no <code>interactions<\/code>/);
  assert.match(html, /Needs a look/);
  const again = await render({ handoffPath: result.path, designSystem: ds });
  assert.equal(readFileSync(again, 'utf8'), html);
});

test('the CLI refuses with decision requests and exit code 2 when decisions are missing', { skip: noDeps }, async () => {
  const { execFileSync } = await import('node:child_process');
  const ds = designSystem();
  const empty = join(ds, 'decisions.json');
  writeFileSync(empty, '{}');
  let code = 0, out = '', err = '';
  try { execFileSync(process.execPath, [repo('skills/to-handoff/scripts/handoff.mjs'), 'generate', PROTOTYPE, '--ds', ds, '--decisions', empty, '--static'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { code = e.status; out = e.stdout; err = e.stderr; }
  assert.equal(code, 2);
  const { requests } = JSON.parse(out);
  assert.ok(requests.length > 1);
  assert.ok(!existsSync(join(ds, 'handoffs')));
  // stderr's first line counts the requests by kind (#219): every kind once, most first, a tie in the order first asked.
  const [, total, list] = err.split('\n')[0].match(/^(\d+) requests: (.+)$/);
  assert.equal(Number(total), requests.length);
  const listed = list.split(', ').map(x => x.match(/^(\d+) (\S+)$/)).map(([, n, kind]) => ({ n: Number(n), kind }));
  for (const { n, kind } of listed) assert.equal(n, requests.filter(r => r.kind === kind).length, kind);
  assert.deepEqual(listed.map(x => x.kind).sort(), [...new Set(requests.map(r => r.kind))].sort());
  const first = kind => requests.findIndex(r => r.kind === kind);
  for (let i = 1; i < listed.length; i++) {
    const [a, b] = [listed[i - 1], listed[i]];
    assert.ok(a.n > b.n || (a.n === b.n && first(a.kind) < first(b.kind)), `${a.kind} before ${b.kind}`);
  }
});

test('a media query at the breakpoints: where it applies, the two a px width falls between, else the widths seen (#146)', () => {
  const carbon = [['sm', 320], ['md', 672], ['lg', 1056], ['xlg', 1312], ['max', 1584]].map(([key, width]) => ({ key, width }));
  assert.equal(mediaAtBreakpoints('(min-width: 672px)', carbon), 'In the screenshots it applies at md (672px), lg (1056px), xlg (1312px) and max (1584px), not at sm (320px); 672px is md\'s width');
  assert.equal(mediaAtBreakpoints('screen and (min-width: 400px) and (max-width: 1100px)', carbon), 'In the screenshots it applies at md (672px) and lg (1056px), not at sm (320px), xlg (1312px) or max (1584px)');
  assert.equal(mediaAtBreakpoints('(max-width: 2000px)', carbon), 'In the screenshots it applies at every breakpoint; 2000px is above max');
  assert.equal(mediaAtBreakpoints('(max-width: 200px)', carbon), 'In the screenshots it applies at none of sm (320px), md (672px), lg (1056px), xlg (1312px) or max (1584px); 200px is below sm');
  assert.equal(mediaAtBreakpoints('(prefers-color-scheme: dark)', [{ key: 'desktop', width: 1280 }]), 'The screenshots were taken at desktop (1280px)');
});
