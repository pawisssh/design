// The To-handoff tracer (#112): one HTML Prototype -> generate -> validateHandoff -> render (static HTML).
// The Design System is assembled in a temp dir from the committed Carbon Foundations document and Button
// Contract, the form-control fixture Contracts and the fixture avatar-stack Proposal, so nothing is written
// under design-systems/. Assertions are properties, not byte goldens: the Foundations document grows (#109).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentHash, validate } from '../../contract/scripts/contract.mjs';
import { hasDeps } from '../scripts/deps.mjs';
import { generate, loadDesignSystem, render, renderHtml, validateHandoff } from '../scripts/handoff.mjs';
import { parseInline } from '../scripts/css.mjs';
import { matchDeclaration, matchText } from '../scripts/match.mjs';
import { innerHtmlTemplates } from '../scripts/reader.mjs';
import { BUTTON, DECISIONS, PROTOTYPE, designSystem, fixture, repo } from './helpers.mjs';

const BUTTON_BYTES = readFileSync(BUTTON, 'utf8');
const noDeps = !hasDeps() && 'parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';

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
  // Support tokens are in for regions: the toast's #24a148 is exactly support-success, not Off-system.
  assert.equal(styles(handoff).find(s => s.raw === '#24a148').token, 'support-success');
  assert.ok(!handoff.values.some(v => Object.values(v.raw).includes('#24a148')));
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
  assert.match(html, /<SelectItem value="Viewer" text="Viewer" \/>/);
  assert.match(html, /<Button kind="danger--ghost" size="sm">Remove<\/Button>/);
  for (const [g, word] of [['≠', 'Off-system'], ['≈', 'near'], ['◇', 'agent pick'], ['+', 'Proposal'], ['∅', 'no Contract'], ['↯', 'off-axis'], ['!', 'missing'], ['◌', 'mock'], ['=', 'exact'], ['✓', 'import'], ['?', 'q-state-error']])
    assert.ok(html.includes(`data-g="${g}"`) && html.includes(word), `${g} ${word}`);
  assert.match(html, /<li id="q-state-error">/, 'a "? q-…" flag links to its question');
  assert.match(html, /<p class="counts">.*≠ Off-system<\/span> \d+/, 'Needs a look counts its flags per kind');
  assert.match(html, />Needs a look \(\d+\)<\/a>/);
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
  let code = 0, out = '';
  try { execFileSync(process.execPath, [repo('skills/to-handoff/scripts/handoff.mjs'), 'generate', PROTOTYPE, '--ds', ds, '--decisions', empty, '--static'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 2);
  assert.ok(JSON.parse(out).requests.length > 0);
  assert.ok(!existsSync(join(ds, 'handoffs')));
});
