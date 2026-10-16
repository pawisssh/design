// The To-handoff tracer (#112): one HTML Prototype -> generate -> validateHandoff -> render (static HTML).
// The Design System is assembled in a temp dir from the committed Carbon Foundations document and Button
// Contract, the form-control fixture Contracts and the fixture avatar-stack Proposal, so nothing is written
// under design-systems/. Assertions are properties, not byte goldens: the Foundations document grows (#109).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, validate } from '../../contract/scripts/contract.mjs';
import { hasDeps } from '../scripts/deps.mjs';
import { generate, loadDesignSystem, render, validateHandoff } from '../scripts/handoff.mjs';
import { matchDeclaration } from '../scripts/match.mjs';

const repo = p => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const fixture = p => fileURLToPath(new URL(`fixtures/invite-teammates/${p}`, import.meta.url));
const PROTOTYPE = fixture('index.html');
const DECISIONS = JSON.parse(readFileSync(fixture('decisions.json'), 'utf8'));
const BUTTON = repo('design-systems/carbon/contracts/button.component.json');
const BUTTON_BYTES = readFileSync(BUTTON, 'utf8');
const noDeps = !hasDeps() && 'parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';

function designSystem() {
  const dir = mkdtempSync(join(tmpdir(), 'to-handoff-ds-'));
  mkdirSync(join(dir, 'contracts'));
  mkdirSync(join(dir, 'proposals'));
  copyFileSync(repo('design-systems/carbon/carbon.foundations.json'), join(dir, 'carbon.foundations.json'));
  copyFileSync(BUTTON, join(dir, 'contracts/button.component.json'));
  for (const f of ['text-input', 'select'])
    copyFileSync(repo(`skills/contract/test/fixtures/form-controls/${f}.component.json`), join(dir, `contracts/${f}.component.json`));
  copyFileSync(fixture('proposals/avatar-stack.proposal.json'), join(dir, 'proposals/avatar-stack.proposal.json'));
  return dir;
}

let shared;
async function run() {
  if (shared) return shared;
  const ds = designSystem();
  const result = await generate({ prototype: PROTOTYPE, designSystem: ds, decisions: DECISIONS });
  shared = { ds, result, handoff: result.handoff, system: await loadDesignSystem(ds) };
  return shared;
}
const usages = h => h.screens.flatMap(s => s.regions.flatMap(r => r.usages || []));
const usage = (h, id) => usages(h).find(u => u.id === id);
const styles = h => h.screens.flatMap(s => s.regions.flatMap(r => r.styles || []));

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
  assert.equal(usage(handoff, 'email').contract, 'text-input');
  const toast = usage(handoff, 'toast');
  assert.ok(toast.raw && toast.reason);
  assert.ok(handoff.openQuestions.some(q => q.id === toast.question && q.kind === 'no-contract'));
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
  assert.equal(h1.style.textStyle, 'heading-03');
  assert.equal(h1.style.match, 'near');
  const ref = styles(handoff).find(s => s.property === 'border-color');
  assert.equal(ref.token, 'border-subtle-01');
  assert.ok(handoff.openQuestions.filter(q => q.kind === 'font').length === 1);
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
  const edit = fn => { const h = JSON.parse(JSON.stringify(handoff)); fn(h); return validateHandoff(h, system).errors.map(e => e.message).join('\n'); };
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
  assert.match(html, /<SelectItem value="Viewer" text="Viewer" \/>/);
  assert.match(html, /<Button kind="danger--ghost" size="sm">Remove<\/Button>/);
  for (const [g, word] of [['≠', 'Off-system'], ['≈', 'near'], ['◇', 'agent pick'], ['+', 'Proposal'], ['∅', 'no Contract'], ['↯', 'off-axis'], ['!', 'missing'], ['◌', 'mock']])
    assert.ok(html.includes(`data-g="${g}"`) && html.includes(word), `${g} ${word}`);
  assert.match(html, /missing \(static-only\)/);
  for (const m of system.foundations.collections.find(c => c.key === 'theme').modes) assert.ok(html.includes(`>${m.label}</option>`), m.label);
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
  let code = 0, out = '';
  try { execFileSync(process.execPath, [repo('skills/to-handoff/scripts/handoff.mjs'), 'generate', PROTOTYPE, '--ds', ds, '--decisions', empty], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 2);
  assert.ok(JSON.parse(out).requests.length > 0);
  assert.ok(!existsSync(join(ds, 'handoffs')));
});
