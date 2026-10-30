// The Handoff Sign-off lifecycle (#116): review, approve, re-run carry-over and Drift check.
// Sign-off is the owner's and is never simulated: every approval here is a test approval ({test: true}), which
// approve writes only under <repo>/.scratch/ and validateHandoff rejects anywhere else. signed.mjs holds the owner
// answers, test inputs only, and assembles each test's Design System under .scratch/to-handoff-tests/ (removed
// after the run), so nothing committed changes.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proposalContentHash } from '../../contract/scripts/contract.mjs';
import { hasDeps, hasTypescript } from '../scripts/deps.mjs';
import { fixture, shadcnDesignSystem, V0 } from './helpers.mjs';
import { AT, DECISIONS, OWNER, SCRATCH, generated, proposalHash, shown, signed } from './signed.mjs';
import { approve, check, generate, handoffContentHash, loadDesignSystem, review, TEST_APPROVER, validateHandoff } from '../scripts/handoff.mjs';

const CLI = fileURLToPath(new URL('../scripts/handoff.mjs', import.meta.url));
const noDeps = !hasDeps() && 'parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
const noTs = !hasTypescript() && 'TypeScript 6 or parse5 missing; run: node skills/to-handoff/scripts/deps.mjs';
after(() => rmSync(SCRATCH, { recursive: true, force: true }));

const read = p => JSON.parse(readFileSync(p, 'utf8'));
const styles = h => h.screens.flatMap(s => s.regions.flatMap(r => r.styles || []));

test('owner decisions: questions answered or re-addressed, an owner pick marked by:"owner", all recorded by stable key', { skip: noDeps }, async () => {
  const { result } = await generated({ ...DECISIONS, ...OWNER, 'token:background-color:#f4f4f4': { by: 'owner', answer: 'field-01' }, 'recognise:button.btn.btn-outline-secondary': { by: 'owner', answer: { contract: 'button', tuple: { kind: 'secondary', size: 'md' }, via: 'library' } } });
  const h = result.handoff;
  const q = id => h.openQuestions.find(x => x.id === id);
  assert.deepEqual(q('q-font'), { ...q('q-font'), answer: 'Use IBM Plex Sans.', by: 'owner' });
  assert.equal(q('q-state-error').to, 'developer');
  assert.equal(q('q-state-error').by, 'owner');
  assert.equal(q('q-data-invites').answer, null);
  const card = styles(h).find(s => s.raw === '#f4f4f4');
  assert.equal(card.token, 'field-01');
  assert.equal(card.by, 'owner');
  const cancel = h.screens[0].regions.flatMap(r => r.usages).find(u => u.id === 'cancel');
  assert.deepEqual(cancel.tuple, { kind: 'secondary', size: 'md' });
  assert.equal(cancel.match.by, 'owner');
  assert.equal(styles(h).find(s => s.raw === '#161616').by, 'agent');
  assert.equal(h.ownerDecisions['token:background-color:#f4f4f4'], 'field-01');
  assert.deepEqual(h.ownerDecisions['question:q-state-error'], { to: 'developer' });
  assert.deepEqual(result.dropped, []);
});

test('approve refuses while an owner question is open', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated(DECISIONS);
  await assert.rejects(approve({ handoffPath, designSystem: ds, ...shown(ds, handoffPath), at: AT, test: true }), /open question to the owner: q-off-axis-email/);
  assert.ok(!existsSync(join(handoffPath, '../signed.json')));
});

test('a draft Contract the Handoff uses blocks sign-off: review lists it, approve refuses (Q21)', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated(undefined, undefined, { drafts: ['select'] });
  const r = await review({ handoffPath, designSystem: ds });
  assert.deepEqual(r.blocks, ['draft Contract select: the owner approves it before Sign-off']);
  assert.match(r.text, /Blocks sign-off\n  draft Contract select: the owner approves it before Sign-off\n/);
  await assert.rejects(approve({ handoffPath, designSystem: ds, ...shown(ds, handoffPath), at: AT, test: true }), /draft Contract select/);
  assert.equal(read(handoffPath).status, 'pending');
  assert.ok(!existsSync(join(handoffPath, '../signed.json')));
  // Approved, it no longer blocks.
  const all = await generated();
  assert.deepEqual((await review({ handoffPath: all.handoffPath, designSystem: all.ds })).blocks, []);
});

test('approve refuses after a hash moved, a pending Proposal not shown, or a Proposal it does not use', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated();
  const ok = shown(ds, handoffPath);
  const go = extra => approve({ handoffPath, designSystem: ds, ...ok, at: AT, test: true, ...extra });
  await assert.rejects(go({ contentHash: 'sha256:' + '0'.repeat(64) }), /the Handoff's content hash moved since the review/);
  await assert.rejects(go({ proposals: {} }), /pending Proposal avatar-stack was not shown/);
  await assert.rejects(go({ proposals: { 'avatar-stack': 'sha256:' + '1'.repeat(64) } }), /Proposal avatar-stack's hash moved since the review/);
  await assert.rejects(go({ proposals: { ...ok.proposals, 'promo-banner': 'sha256:' + '2'.repeat(64) } }), /Proposal promo-banner is not used by this Handoff/);
  // An edited Proposal moves its hash and the Handoff's pin: re-run To-handoff first.
  const file = join(ds, 'proposals/avatar-stack.proposal.json');
  const p = read(file);
  p.family.description += ' Edited.';
  writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
  await assert.rejects(go({ proposals: { 'avatar-stack': proposalContentHash(p) } }), /pinned Proposal avatar-stack moved: re-run To-handoff/);
  assert.equal(read(handoffPath).status, 'pending');
  assert.ok(!existsSync(join(handoffPath, '../signed.json')));
});

test('a test approval writes approval and signed.json and approves the shown Proposal; the validator rejects it outside .scratch', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await signed();
  const h = read(handoffPath);
  assert.equal(h.status, 'approved');
  assert.deepEqual(h.approval, { by: TEST_APPROVER, at: AT, revision: 1, contentHash: handoffContentHash(h) });
  assert.equal(readFileSync(join(ds, 'handoffs/invite-teammates/signed.json'), 'utf8'), readFileSync(handoffPath, 'utf8'));
  const p = read(join(ds, 'proposals/avatar-stack.proposal.json'));
  assert.equal(p.status, 'approved');
  assert.deepEqual(p.approval, { by: TEST_APPROVER, at: AT, contentHash: proposalContentHash(p) });
  const system = await loadDesignSystem(ds);
  assert.deepEqual(validateHandoff(h, system).errors, []);
  const elsewhere = validateHandoff(h, { ...system, dir: join(tmpdir(), 'design-systems/carbon') });
  assert.ok(elsewhere.errors.some(e => e.rule === 'approval' && /test approval/.test(e.message)));
  // An approval that no longer matches the content is invalid, as is "approved" without one.
  assert.ok(validateHandoff({ ...h, feature: { ...h.feature, goal: 'Changed.' } }, system).errors.some(e => e.rule === 'approval'));
  assert.ok(validateHandoff({ ...h, approval: null }, system).errors.some(e => e.rule === 'approval'));
  await assert.rejects(approve({ handoffPath, designSystem: ds, ...shown(ds, handoffPath), at: AT, test: true }), /already signed off/);
});

test('approve changes only the approval lines of a hand-formatted Proposal and keeps every other byte', { skip: noDeps }, async () => {
  const { ds } = await signed();
  const before = readFileSync(fixture('proposals/avatar-stack.proposal.json'), 'utf8');
  const after = readFileSync(join(ds, 'proposals/avatar-stack.proposal.json'), 'utf8');
  const cut = before.indexOf('  "status": "pending"');
  assert.ok(cut > 0 && before.includes('{ "key": "sm"'), 'the fixture is hand-formatted');
  assert.equal(after.slice(0, cut), before.slice(0, cut));
  const tail = after.slice(cut).split('\n');
  assert.equal(tail[0], '  "status": "approved",');
  assert.match(tail[1], /^ {2}"approval": /);
  assert.ok(after.endsWith('\n}\n'));
});

test('a test approval is refused outside .scratch', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated(undefined, join(tmpdir(), 'to-handoff-signoff'));
  try {
    await assert.rejects(approve({ handoffPath, designSystem: ds, ...shown(ds, handoffPath), at: AT, test: true }), /a test approval is written only under .*\.scratch/);
  } finally { rmSync(ds, { recursive: true, force: true }); }
});

test('a re-run keeps the owner answers, re-decides agent picks, resets to pending and reviews against signed.json', { skip: noDeps }, async () => {
  const { ds, prototype, handoffPath } = await signed();
  const signedBytes = readFileSync(join(ds, 'handoffs/invite-teammates/signed.json'), 'utf8');
  // The agent's decisions.json no longer carries the owner's words, and one agent pick changed.
  const result = await generate({ prototype, designSystem: ds, decisions: { ...DECISIONS, 'token:background-color:#f4f4f4': 'layer-03' } });
  const h = result.handoff;
  assert.equal(result.wrote, true);
  assert.equal(h.status, 'pending');
  assert.equal(h.approval, null);
  assert.equal(h.revision, 2);
  assert.equal(h.openQuestions.find(q => q.id === 'q-font').answer, 'Use IBM Plex Sans.');
  assert.equal(h.openQuestions.find(q => q.id === 'q-state-error').to, 'developer');
  assert.equal(styles(h).find(s => s.raw === '#f4f4f4').token, 'layer-03');
  assert.equal(readFileSync(join(ds, 'handoffs/invite-teammates/signed.json'), 'utf8'), signedBytes);
  const { diff, text } = await review({ handoffPath, designSystem: ds });
  assert.ok(diff.length > 0);
  assert.ok(diff.some(d => /#f4f4f4|layer-03/.test(d.path + JSON.stringify(d.after))), JSON.stringify(diff));
  assert.ok(!diff.some(d => /openQuestions|ownerDecisions|status|approval|revision/.test(d.path)), JSON.stringify(diff));
  assert.match(text, /since the last sign-off \(r1, sha256:/);
});

test('an owner decision whose key disappeared is dropped and listed', { skip: noDeps }, async () => {
  const { result } = await generated({ ...DECISIONS, ...OWNER, 'token:color:#123456': { by: 'owner', answer: 'text-primary' }, 'question:q-gone': { by: 'owner', answer: 'x' } });
  assert.deepEqual(result.dropped.map(d => d.key).sort(), ['question:q-gone', 'token:color:#123456']);
  assert.ok(!('token:color:#123456' in result.handoff.ownerDecisions));
});

test('review prints the revision, hash, pins, agent marks, questions by addressee, Contracts, pending Proposals and the approve command', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated(undefined, undefined, { drafts: ['text-input'] });
  // Another signed Handoff that pinned an older avatar-stack hash: this run's Proposal puts it into Drift.
  const other = read(handoffPath);
  other.feature.key = 'members';
  other.source.proposals['avatar-stack'] = 'sha256:' + '3'.repeat(64);
  other.status = 'approved';
  mkdirSync(join(ds, 'handoffs/members'), { recursive: true });
  writeFileSync(join(ds, 'handoffs/members/handoff.json'), JSON.stringify(other, null, 2) + '\n');
  const h = read(handoffPath);
  const r = await review({ handoffPath, designSystem: ds });
  assert.match(r.text, /Revision r1/);
  assert.ok(r.text.includes(handoffContentHash(h)));
  assert.ok(r.text.includes(h.source.prototype.snapshotId));
  assert.ok(r.text.includes(h.source.foundations.usedHash));
  assert.match(r.text, /First sign-off/);
  assert.match(r.text, /Agent marks/);
  assert.match(r.text, /token tie.*#f4f4f4.*layer-01/s);
  assert.match(r.text, /To the developer[\s\S]*q-data-invites/);
  assert.match(r.text, /button.*approved/);
  assert.match(r.text, /text-input.*draft/);
  assert.ok(r.text.includes(proposalHash(ds)));
  assert.ok(r.text.includes('"reason": "Carbon ships no avatar or avatar group'));
  assert.match(r.text, /members.*avatar-stack/);
  assert.deepEqual(r.drifts, [{ handoff: 'members', proposal: 'avatar-stack' }]);
  assert.equal(r.approveCommand, `node skills/to-handoff/scripts/handoff.mjs approve ${handoffPath} --ds ${ds} --content-hash ${handoffContentHash(h)} --proposal avatar-stack=${proposalHash(ds)}`);
  assert.ok(r.text.includes(r.approveCommand));
  assert.deepEqual(r.blocks, ['draft Contract text-input: the owner approves it before Sign-off']);
  const open = await generated(DECISIONS);
  assert.ok((await review({ handoffPath: open.handoffPath, designSystem: open.ds })).blocks.some(b => /q-font/.test(b)));
});

test('review lists every Off-system value with its nearest tokens; they do not block, and approve covers them (#283)', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated();
  // The values come from the generated Handoff, not Carbon's numbers today; the line format is the literal.
  const values = read(handoffPath).values;
  assert.ok(values.length > 0 && values.every(v => v.at.length === 1));
  const { text, blocks } = await review({ handoffPath, designSystem: ds });
  const section = text.slice(text.indexOf('\nOff-system values'), text.indexOf('\nOpen questions'));
  assert.ok(text.indexOf('\nAgent marks') < text.indexOf('\nOff-system values'));
  const near = n => `${n.token} (${n.delta === undefined ? n.value : `ΔE ${n.delta}`})`;
  assert.equal(section, [
    '',
    `Off-system values (${values.length})`,
    ...values.flatMap(v => [
      `  ${v.id}: ${v.role} light ${v.raw.light}, 1 site`,
      `    reason: ${v.reason}`,
      `    nearest: ${v.nearest.map(near).join(', ')}`,
      ...(v.primitive ? [`    primitive: ${v.primitive}`] : []),
    ]),
    '  These do not block Sign-off; approving covers them.',
    '',
  ].join('\n'));
  assert.deepEqual(blocks, []);
  assert.ok(!/Blocks sign-off/.test(text));
  await approve({ handoffPath, designSystem: ds, ...shown(ds, handoffPath), at: AT, test: true });
  assert.equal(read(handoffPath).status, 'approved');
});

test('review of a Handoff with no Off-system values prints the section as none (#283)', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated();
  const h = read(handoffPath);
  h.values = [];
  writeFileSync(handoffPath, JSON.stringify(h, null, 2) + '\n');
  const { text } = await review({ handoffPath, designSystem: ds });
  assert.match(text, /\nOff-system values \(0\)\n  none\n\nOpen questions/);
});

test('review shows each container Usage with the Usages nested in it indented under it, deeper nesting chained (#195)', { skip: noTs }, async () => {
  const ds = shadcnDesignSystem();
  const decisions = read(join(V0, 'decisions.json'));
  const { path: handoffPath } = await generate({ prototype: V0, designSystem: ds, decisions });
  const nesting = text => text.slice(text.indexOf('\nNesting\n') + 1, text.indexOf('\nPending Proposals'));
  assert.equal(nesting((await review({ handoffPath, designSystem: ds })).text), [
    'Nesting',
    '  card: card card-footer=card-footer',
    '    button: button variant=outline',
    '    alert: alert variant=destructive',
    '    label: label',
    '    name: input',
    '    label-2: label',
    '    email: input',
    '    label-3: label',
    '    select: select',
    '    label-4: label',
    '    reason: textarea',
    '    button-2: button',
    '    button-3: button variant=link size=sm',
    '',
  ].join('\n'));
  const h = read(handoffPath);
  for (const u of h.screens[0].regions.flatMap(r => r.usages)) if (u.id === 'button-2' || u.id === 'button-3') u.in = 'alert';
  writeFileSync(handoffPath, JSON.stringify(h, null, 2) + '\n');
  assert.ok(nesting((await review({ handoffPath, designSystem: ds })).text).includes([
    '    alert: alert variant=destructive',
    '      button-2: button',
    '      button-3: button variant=link size=sm',
    '    label: label',
  ].join('\n')));
});

test('review of a Handoff with no `in` has no Nesting section', { skip: noDeps }, async () => {
  const { ds, handoffPath } = await generated();
  const { text } = await review({ handoffPath, designSystem: ds });
  assert.ok(!text.includes('Nesting'));
  assert.match(text, /\nContracts used\n(  .*\n)+\nPending Proposals/);
});

test('check: no Drift when unchanged or after an unrelated family\'s Contract is added; Drift after a Prototype file changes', { skip: noDeps }, async () => {
  const { ds, prototype, handoffPath } = await signed();
  assert.deepEqual((await check({ handoffPath, designSystem: ds, prototype })).drift, []);
  // Another family's Contract lands, and the Foundations document records it (usedBy): documentHash moves, no Drift.
  const c = read(join(ds, 'contracts/select.component.json'));
  c.family.key = 'dropdown';
  c.family.name = 'Dropdown';
  writeFileSync(join(ds, 'contracts/dropdown.component.json'), JSON.stringify(c, null, 2) + '\n');
  const fpath = join(ds, 'carbon.foundations.json');
  const f = read(fpath);
  const used = styles(read(handoffPath)).find(s => s.token).token;
  f.variables[used].usedBy = [...(f.variables[used].usedBy || []), 'dropdown'];
  writeFileSync(fpath, JSON.stringify(f, null, 2) + '\n');
  const quiet = await check({ handoffPath, designSystem: ds, prototype });
  assert.deepEqual(quiet.drift, []);
  assert.equal(quiet.verdict, 'no drift');
  // A Prototype file changes.
  writeFileSync(prototype, readFileSync(prototype, 'utf8') + '<!-- edited -->\n');
  const moved = await check({ handoffPath, designSystem: ds, prototype });
  assert.deepEqual(moved.drift, [{ kind: 'prototype', key: 'index.html', change: 'changed' }]);
  assert.equal(moved.verdict, 'drifted, still valid');
  // A used Contract is gone: Drift, and the Handoff no longer validates.
  rmSync(join(ds, 'contracts/text-input.component.json'));
  const broken = await check({ handoffPath, designSystem: ds, prototype });
  assert.ok(broken.drift.some(d => d.kind === 'contract' && d.key === 'text-input' && d.change === 'gone'));
  assert.equal(broken.verdict, 'drifted, broken');
  assert.ok(broken.errors.length > 0);
});

test('check: a moved Contract hash, Proposal hash or usedHash is Drift', { skip: noDeps }, async () => {
  const { ds, prototype, handoffPath } = await signed();
  const bpath = join(ds, 'contracts/button.component.json');
  const b = read(bpath);
  b.family.description = (b.family.description || '') + ' Edited.';
  writeFileSync(bpath, JSON.stringify(b, null, 2) + '\n');
  const ppath = join(ds, 'proposals/avatar-stack.proposal.json');
  const p = read(ppath);
  p.family.description += ' Edited.';
  writeFileSync(ppath, JSON.stringify(p, null, 2) + '\n');
  const fpath = join(ds, 'carbon.foundations.json');
  const f = read(fpath);
  const used = styles(read(handoffPath)).find(s => s.token).token;
  f.variables[used].description = 'Edited.';
  writeFileSync(fpath, JSON.stringify(f, null, 2) + '\n');
  const r = await check({ handoffPath, designSystem: ds, prototype });
  assert.deepEqual(r.drift.map(d => `${d.kind}:${d.key}:${d.change}`).sort(), ['contract:button:edited', 'foundations:usedHash:changed', 'proposal:avatar-stack:changed']);
});

test('the CLI: approve refuses with exit 1 and its reasons; check exits 1 on Drift and 0 without', { skip: noDeps }, async () => {
  const { ds, prototype, handoffPath } = await signed();
  const cli = args => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  const ok = cli(['check', handoffPath, '--ds', ds, '--prototype', prototype]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /no drift/);
  writeFileSync(prototype, readFileSync(prototype, 'utf8') + '<!-- edited -->\n');
  const drift = cli(['check', handoffPath, '--ds', ds, '--prototype', prototype]);
  assert.equal(drift.status, 1);
  assert.match(drift.stdout, /drifted, still valid/);
  assert.match(drift.stdout, /index\.html/);
  const open = await generated(DECISIONS);
  const refused = cli(['approve', open.handoffPath, '--ds', open.ds, '--content-hash', 'sha256:' + '0'.repeat(64)]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /cannot sign off/);
  assert.equal(cli(['check', handoffPath, '--ds', ds]).status, 1);
  assert.match(refused.stderr, /q-font/);
  assert.equal(read(open.handoffPath).status, 'pending');
  const r = cli(['review', open.handoffPath, '--ds', open.ds]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /handoff\.mjs approve/);
});
