// The Handoff Sign-off lifecycle (#64, #116): review prints the package the owner signs off, approve records
// the owner's one act, check computes Drift on demand.
//
// Sign-off is the owner's. approve runs only after the owner types "approve" in chat, with the hashes the
// review showed, and writes `approval: {by: "owner", …}`. `{test: true}` writes TEST_APPROVER instead, only
// under <repo>/.scratch/; validateHandoff rejects that approver anywhere else. Drift is never stored.
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { contentHash as contractHash, proposalContentHash } from '../../contract/scripts/contract.mjs';
import { writeJson } from '../../contract/scripts/io.mjs';
import { contentOf, handoffContentHash, prototypeFiles, usedHash } from './hash.mjs';
import { REPO_ROOT, TEST_APPROVER, inScratch, loadDesignSystem } from './system.mjs';
import { validateHandoff } from './validate.mjs';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Leaf changes from `a` to `b`: [{path, change: "added" | "removed" | "changed", before?, after?}]. Arrays whose
 * items all carry an `id` are matched by id (`[id=…]`), others by index.
 */
export function diffJson(a, b, path = '') {
  const out = [];
  const isObj = x => x !== null && typeof x === 'object';
  if (a === undefined) return [{ path, change: 'added', after: b }];
  if (b === undefined) return [{ path, change: 'removed', before: a }];
  if (Array.isArray(a) && Array.isArray(b)) {
    const byId = xs => xs.every(x => isObj(x) && typeof x.id === 'string');
    if (byId(a) && byId(b)) {
      const ids = [...new Set([...a.map(x => x.id), ...b.map(x => x.id)])];
      for (const id of ids) out.push(...diffJson(a.find(x => x.id === id), b.find(x => x.id === id), `${path}[id=${id}]`));
    } else for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diffJson(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) out.push(...diffJson(a[k], b[k], path ? `${path}.${k}` : k));
    return out;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path, change: 'changed', before: a, after: b }];
}

/**
 * Drift (#64 §9) of a Handoff against the current Prototype (when its path is given) and Design System:
 * [{kind: "prototype" | "contract" | "proposal" | "foundations", key, change}].
 */
export function driftOf(handoff, system, prototype) {
  const drift = [];
  const src = handoff.source || {};
  if (prototype) {
    const pinned = (src.prototype && src.prototype.files) || {};
    const now = prototypeFiles(prototype, Object.keys(pinned));
    for (const file of [...new Set([...Object.keys(pinned), ...Object.keys(now)])].sort()) {
      if (!(file in now)) drift.push({ kind: 'prototype', key: file, change: 'removed' });
      else if (!(file in pinned)) drift.push({ kind: 'prototype', key: file, change: 'added' });
      else if (pinned[file] !== now[file]) drift.push({ kind: 'prototype', key: file, change: 'changed' });
    }
  }
  for (const [key, pin] of Object.entries(src.contracts || {})) {
    const c = system.contracts[key];
    if (!c) drift.push({ kind: 'contract', key, change: 'gone' });
    else if (contractHash(c) !== pin.contentHash) drift.push({ kind: 'contract', key, change: c.source.snapshotId !== pin.snapshotId ? 'source moved' : 'edited' });
  }
  for (const [key, pin] of Object.entries(src.proposals || {})) {
    const p = system.proposals[key];
    if (!p) drift.push({ kind: 'proposal', key, change: 'gone' });
    else if (proposalContentHash(p) !== pin) drift.push({ kind: 'proposal', key, change: 'changed' });
    else if (handoff.status === 'approved' && p.status === 'pending') drift.push({ kind: 'proposal', key, change: 'back to pending' });
  }
  if (src.foundations && usedHash(handoff, system.foundations) !== src.foundations.usedHash) drift.push({ kind: 'foundations', key: 'usedHash', change: 'changed' });
  return drift;
}

/**
 * What blocks sign-off (#64 §3): validation, an open question to the owner, a draft Contract the Handoff uses
 * (the Handoff takes its look from the Contract, so the owner approves it first), a Design System pin that moved.
 */
function blocksOf(handoff, system) {
  const blocks = [];
  for (const e of validateHandoff(handoff, system).errors) blocks.push(`validation [${e.rule}] ${e.message}`);
  for (const q of handoff.openQuestions || []) if (q.to === 'owner' && !q.answer) blocks.push(`open question to the owner: ${q.id}`);
  for (const k of Object.keys((handoff.source && handoff.source.contracts) || {}))
    if (system.contracts[k] && system.contracts[k].selection.status !== 'approved') blocks.push(`draft Contract ${k}: the owner approves it before Sign-off`);
  for (const d of driftOf(handoff, system)) blocks.push(`pinned ${d.kind === 'contract' ? 'Contract' : d.kind === 'proposal' ? 'Proposal' : 'Foundations'} ${d.key} moved: re-run To-handoff`);
  return blocks;
}

const pendingProposals = (handoff, system) => Object.keys((handoff.source && handoff.source.proposals) || {}).filter(k => system.proposals[k] && system.proposals[k].status === 'pending');

/** Agent marks by kind (#64 §4), each a line with its candidates. */
function agentMarks(handoff) {
  const marks = {};
  const add = (kind, line) => (marks[kind] = marks[kind] || []).push(line);
  for (const screen of handoff.screens || []) for (const r of screen.regions || []) {
    for (const s of r.styles || []) if (s.by === 'agent') add(s.match === 'near' ? 'token near' : 'token tie', `${r.id}: ${s.property} ${s.raw} → ${s.token}${s.delta !== undefined ? ` (ΔE ${s.delta})` : ''} among ${s.candidates.join(', ')}`);
    for (const t of r.text || []) {
      const s = t.style || {};
      const text = `"${((handoff.copy || {})[t.copy] || {}).text}"`;
      if (s.by === 'agent') add(s.match === 'near' ? 'text style near' : 'text style tie', `${r.id}: ${text} → ${s.textStyle} among ${s.candidates.join(', ')}`);
      for (const [prop, m] of Object.entries(s.partial || {})) if (m.by === 'agent') add('token tie', `${r.id}: ${text} ${prop} → ${m.token} among ${m.candidates.join(', ')}`);
    }
    for (const u of r.usages || []) if (u.match && u.match.by === 'agent') {
      const name = u.contract ? `Contract ${u.contract}` : `Proposal ${u.proposal}`;
      add('recognition', `${u.id}: ${name} ${JSON.stringify(u.tuple || {})} via ${u.match.via}${u.match.candidates ? ` among ${u.match.candidates.map(c => JSON.stringify(c)).join(', ')}` : ''}`);
    }
  }
  for (const a of handoff.acceptance || []) if (a.by === 'agent') add('acceptance draft', `${a.id} (${a.state}): given ${a.given}, when ${a.when}, then ${a.then}`);
  for (const x of handoff.data || []) add('stand-in', `${x.id} (${x.source}): ${x.note || ''}`);
  return marks;
}

/**
 * Each container Usage of each screen, with the Usages whose `in` names it indented under it, deeper nesting
 * chained (#195): one line per Usage, none when nothing records `in`.
 */
function nestingOf(handoff) {
  const lines = [];
  const named = u => `${u.contract || (u.proposal ? `Proposal ${u.proposal}` : `raw ${u.raw.element}`)}${Object.entries(u.tuple || {}).map(([k, v]) => ` ${k}=${v}`).join('')}`;
  for (const s of handoff.screens || []) {
    const usages = (s.regions || []).flatMap(r => r.usages || []);
    const put = (u, depth, seen) => {
      lines.push(`${'  '.repeat(depth)}${u.id}: ${named(u)}`);
      for (const x of usages) if (x.in === u.id && !seen.includes(x.id)) put(x, depth + 1, [...seen, x.id]);
    };
    for (const u of usages) if (!usages.some(x => x.id === u.in) && usages.some(x => x.in === u.id)) put(u, 1, [u.id]);
  }
  return lines;
}

/**
 * review({handoffPath, designSystem}) -> {text, diff, signed, blocks, drifts, approveCommand}: the package the
 * owner signs off (#64 §4). `diff` is against signed.json beside handoff.json, empty on a first sign-off.
 */
export async function review({ handoffPath, designSystem }) {
  const system = await loadDesignSystem(designSystem);
  const h = readJson(handoffPath);
  const hash = handoffContentHash(h);
  const signedPath = join(dirname(handoffPath), 'signed.json');
  const signed = existsSync(signedPath) ? readJson(signedPath) : null;
  const diff = signed ? diffJson(contentOf(signed), contentOf(h)) : [];
  const blocks = blocksOf(h, system);
  if (h.status === 'approved') blocks.unshift(`already signed off at r${(h.approval || {}).revision}`);
  const pending = pendingProposals(h, system);
  const used = Object.keys(h.source.proposals || {});
  const drifts = [];
  const others = join(system.dir, 'handoffs');
  for (const name of existsSync(others) ? readdirSync(others).sort() : []) {
    const path = join(others, name, 'handoff.json');
    if (path === join(dirname(handoffPath), 'handoff.json') || !existsSync(path)) continue;
    const o = readJson(path);
    if (o.status !== 'approved') continue;
    for (const k of used) if (o.source.proposals && o.source.proposals[k] && system.proposals[k] && o.source.proposals[k] !== proposalContentHash(system.proposals[k])) drifts.push({ handoff: name, proposal: k });
  }
  const approveCommand = `node skills/to-handoff/scripts/handoff.mjs approve ${handoffPath} --ds ${designSystem} --content-hash ${hash}`
    + pending.map(k => ` --proposal ${k}=${proposalContentHash(system.proposals[k])}`).join('');

  const L = [];
  L.push(`Handoff ${h.feature.key} · Revision r${h.revision} · ${hash} · ${h.status === 'approved' ? 'signed off' : 'pending sign-off'}`, '');
  L.push('Pins');
  L.push(`  prototype ${h.source.prototype.snapshotId}`);
  for (const [f, x] of Object.entries(h.source.prototype.files)) L.push(`    ${f} ${x}`);
  for (const [k, x] of Object.entries(h.source.contracts)) L.push(`  contract ${k} ${x.contentHash} (snapshot ${x.snapshotId})`);
  for (const [k, x] of Object.entries(h.source.proposals)) L.push(`  proposal ${k} ${x}`);
  L.push(`  foundations usedHash ${h.source.foundations.usedHash} (document ${h.source.foundations.documentHash})`);
  L.push(`  modes ${Object.entries(h.source.modes).map(([p, f]) => `${p} → ${f}`).join(', ')}`, '');
  if (!signed) L.push('First sign-off: everything below is new.');
  else {
    L.push(`Changes since the last sign-off (r${signed.revision}, ${signed.approval ? signed.approval.contentHash : '?'}):`);
    if (!diff.length) L.push('  none');
    else if (diff.every(d => d.path.startsWith('source.'))) L.push('  only pins moved');
    for (const d of diff) L.push(`  ${d.change === 'added' ? '+' : d.change === 'removed' ? '-' : '~'} ${d.path}: ${d.change === 'added' ? JSON.stringify(d.after) : d.change === 'removed' ? JSON.stringify(d.before) : `${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`}`);
  }
  L.push('', 'Agent marks');
  for (const [kind, lines] of Object.entries(agentMarks(h))) { L.push(`  ${kind} (${lines.length})`); for (const x of lines) L.push(`    ${x}`); }
  L.push('', 'Open questions');
  for (const to of ['owner', 'developer']) {
    L.push(`  To the ${to}`);
    for (const q of h.openQuestions.filter(x => x.to === to)) L.push(`    ${q.id} (${q.kind}): ${q.text}${q.answer ? ` — answered: ${q.answer}` : q.by === 'owner' ? ' — re-addressed by the owner' : ''}`);
  }
  const missing = [];
  for (const s of h.screens) for (const [name, st] of Object.entries(s.states)) {
    if (st && st.missing) missing.push(`${s.id}.${name}: missing state (${st.question})`);
    for (const [mode, shot] of Object.entries((st && st.screenshots) || {})) if (shot && shot.missing) missing.push(`${s.id}.${name} ${mode} screenshot: ${shot.reason}`);
  }
  if (missing.length) { L.push('', 'Missing'); for (const m of missing) L.push(`  ${m}`); }
  L.push('', 'Contracts used');
  for (const k of Object.keys(h.source.contracts)) L.push(`  ${k}: ${system.contracts[k] ? system.contracts[k].selection.status : 'gone'}`);
  const nesting = nestingOf(h);
  if (nesting.length) L.push('', 'Nesting', ...nesting);
  L.push('', 'Pending Proposals (one approve approves each)');
  if (!pending.length) L.push('  none');
  for (const k of pending) { L.push(`  ${k} ${proposalContentHash(system.proposals[k])}`); L.push(...JSON.stringify(system.proposals[k], null, 2).split('\n').map(x => `    ${x}`)); }
  L.push('', 'Signed Handoffs these Proposals put into Drift');
  if (!drifts.length) L.push('  none');
  for (const x of drifts) L.push(`  ${x.handoff}: pinned another ${x.proposal}`);
  L.push('');
  if (blocks.length) { L.push('Blocks sign-off'); for (const b of blocks) L.push(`  ${b}`); L.push(''); }
  L.push('Sign off, only after the owner types "approve" in chat:', `  ${approveCommand}`);
  return { text: L.join('\n') + '\n', diff, signed: Boolean(signed), blocks, drifts, approveCommand };
}

function proposalFile(dir, key) {
  const pdir = join(dir, 'proposals');
  const name = readdirSync(pdir).filter(f => f.endsWith('.proposal.json')).find(f => readJson(join(pdir, f)).family.key === key);
  return join(pdir, name);
}

/**
 * approve({handoffPath, designSystem, contentHash, proposals: {key: hash}, at, test}) -> {handoff, approved, signedPath}.
 * Refuses (throws, writing nothing) on a block (#64 §3), a hash that moved since the review, a pending Proposal
 * the review did not show, or a Proposal the Handoff does not use. Otherwise approves each shown pending
 * Proposal in its own file, writes the Handoff's approval and copies handoff.json to signed.json.
 */
export async function approve({ handoffPath, designSystem, contentHash, proposals = {}, at = new Date().toISOString(), test = false }) {
  const system = await loadDesignSystem(designSystem);
  const h = readJson(handoffPath);
  const hash = handoffContentHash(h);
  const reasons = [];
  if (test && !inScratch(handoffPath)) reasons.push(`a test approval is written only under ${join(REPO_ROOT, '.scratch')}/`);
  if (h.status === 'approved') reasons.push(`the Handoff is already signed off at r${(h.approval || {}).revision}; a change re-runs To-handoff first`);
  reasons.push(...blocksOf(h, system));
  if (contentHash !== hash) reasons.push(`the Handoff's content hash moved since the review: ${contentHash} given, ${hash} now`);
  const used = (h.source && h.source.proposals) || {};
  for (const [k, given] of Object.entries(proposals)) {
    if (!(k in used)) reasons.push(`Proposal ${k} is not used by this Handoff`);
    else if (system.proposals[k] && proposalContentHash(system.proposals[k]) !== given) reasons.push(`Proposal ${k}'s hash moved since the review: ${given} given, ${proposalContentHash(system.proposals[k])} now`);
  }
  for (const k of pendingProposals(h, system)) if (!(k in proposals)) reasons.push(`pending Proposal ${k} was not shown in the review (pass --proposal ${k}=<hash>)`);
  if (reasons.length) throw new Error(`cannot sign off ${handoffPath}:\n- ${reasons.join('\n- ')}`);

  const by = test ? TEST_APPROVER : 'owner';
  const approved = [];
  for (const k of pendingProposals(h, system)) {
    const file = proposalFile(system.dir, k);
    const p = readJson(file);
    p.status = 'approved';
    p.approval = { by, at, contentHash: proposalContentHash(p) };
    writeJson(file, p);
    approved.push(k);
  }
  h.status = 'approved';
  h.approval = { by, at, revision: h.revision, contentHash: hash };
  // Spliced into each file's own text (io.mjs), so a Sign-off changes only the status and approval lines.
  writeJson(handoffPath, h);
  const signedPath = join(dirname(handoffPath), 'signed.json');
  copyFileSync(handoffPath, signedPath);
  return { handoff: h, approved, signedPath };
}

/**
 * check({handoffPath, designSystem, prototype}) -> {drift, verdict, errors, ok}: Drift (#64 §9) plus a re-validation.
 * `verdict` is "no drift", "drifted, still valid" or "drifted, broken" ("no drift, broken" when only validation
 * fails). Without `prototype` the Prototype files are not re-hashed, and `prototypeChecked` is false.
 */
export async function check({ handoffPath, designSystem, prototype }) {
  const system = await loadDesignSystem(designSystem);
  const h = readJson(handoffPath);
  const drift = driftOf(h, system, prototype);
  const { errors } = validateHandoff(h, system);
  const verdict = `${drift.length ? 'drifted' : 'no drift'}${errors.length ? ', broken' : drift.length ? ', still valid' : ''}`;
  return { drift, verdict, errors, ok: !drift.length && !errors.length, prototypeChecked: Boolean(prototype) };
}
