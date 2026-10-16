// To-handoff generate (#102): one single-HTML-file Prototype + a Design System + decisions -> a Handoff.
// Generation is pure over (Prototype files, Design System, decisions): no clock, no network, no guess. Every
// pick the agent or the owner makes (what an element is, a tied or near token, a plain condition's default,
// the feature and its acceptance) is a keyed decision. Any unanswered key makes generate return the decision
// requests and write nothing; an answer outside its request's candidates is refused.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { convert, deltaE } from '../../contract/scripts/color.mjs';
import { canonical, contentHash as contractHash, proposalContentHash, resolve, sha256 } from '../../contract/scripts/contract.mjs';
import { computed, splitWords } from './css.mjs';
import { COLOR_ROLES, collectionOf, colorText, followCustom, matchDeclaration, matchText, roleOf, sameHex, valueIn } from './match.mjs';
import { REPO_ROOT, stateAxisOf } from './system.mjs';
import { readHtml, walk } from './reader.mjs';
import {
  STANDARD_STATES, atomIn, atomsOf, candidateOf, evaluate, isPlaceholderText, ownDeclarations, parseCondition, standIns, stateOfAtom,
} from './recognise.mjs';
import { loadDesignSystem } from './system.mjs';

const PROTOTYPE_MODE = 'light';
const LANDMARKS = { header: 'banner', nav: 'navigation', main: 'main', aside: 'complementary', footer: 'contentinfo' };
const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'search', 'form']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export const fileHash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clone = o => JSON.parse(JSON.stringify(o));

/** A Handoff's content hash: everything but revision, status and approval (#64). */
export function handoffContentHash(handoff) {
  const h = clone(handoff);
  delete h.revision;
  delete h.status;
  delete h.approval;
  return 'sha256:' + sha256(canonical(h));
}

/**
 * The Prototype's snapshotId: a hash over its sorted file hashes (#64), as for a Code Library snapshot. The same
 * manifest as each Adapter's `snapshotId` in its sources.mjs; To-handoff names no Adapter, so it keeps its own.
 */
export function snapshotIdOf(files) {
  return 'sha256:' + sha256(Object.keys(files).sort().map(p => `${files[p].slice(7)}  ${p}\n`).join(''));
}

// ---------- decisions ----------

function decider(decisions) {
  const requests = [];
  const byKey = new Map();
  return {
    requests,
    /**
     * The answer to `key`, checked by `check` (which throws), or undefined after recording a request. A caller
     * may stand in the first candidate for an undefined answer, only so the pass goes on to collect every
     * request: with any request open, generate returns them and writes nothing.
     */
    ask(key, request, check) {
      if (Object.prototype.hasOwnProperty.call(decisions, key)) {
        const answer = decisions[key];
        if (check) {
          const problem = check(answer);
          if (problem) throw new Error(`decision "${key}": ${problem}`);
        }
        return answer;
      }
      const seen = byKey.get(key);
      if (seen) { for (const a of request.evidence?.at || []) if (!seen.evidence.at.includes(a)) seen.evidence.at.push(a); return undefined; }
      const r = { key, ...request, evidence: { at: [], ...(request.evidence || {}) } };
      byKey.set(key, r);
      requests.push(r);
      return undefined;
    },
  };
}

const among = (candidates, extra = []) => answer =>
  [...candidates, ...extra].includes(answer) ? null : `${JSON.stringify(answer)} is not among its candidates (${[...candidates, ...extra].join(', ')})`;

// ---------- text ----------

/** The display text of reader parts in `state`: a dynamic value shows as `{expr}` without its first segment. */
function textOf(parts, valueOf) {
  const show = expr => `{${expr.replace(/^[A-Za-z_$][\w$]*\./, '')}}`;
  const branch = b => (b.text !== undefined ? b.text : b.expr !== undefined ? show(b.expr) : '');
  return parts.map(p => {
    if (typeof p === 'string') return p;
    if (p.ternary) return branch(evaluate(parseCondition(p.ternary.cond), valueOf) ? p.ternary.then : p.ternary.else);
    if (p.text !== undefined) return p.text;
    if (p.markup) return '';
    return show(p.expr);
  }).join('').replace(/\s+/g, ' ').trim();
}

const textNodes = el => el.children.filter(c => c.type === 'text');
const elementText = (el, valueOf) => {
  const out = [];
  const visit = n => { if (n.type === 'text') out.push(textOf(n.parts, valueOf)); else n.children.forEach(visit); };
  el.children.forEach(visit);
  return out.join(' ').replace(/\s+/g, ' ').trim();
};
const hasTernary = el => {
  let found = false;
  const visit = n => { if (n.type === 'text') { if (n.parts.some(p => p && p.ternary && !p.markup)) found = true; } else n.children.forEach(visit); };
  el.children.forEach(visit);
  return found;
};

// ---------- the generator ----------

/**
 * generate({prototype, designSystem, decisions}) -> {requests, handoff, path, wrote, contentHash}.
 * `prototype` is the HTML file; `designSystem` the design-systems/<ds> folder. With any request open it
 * returns {requests, handoff: undefined, path: null, wrote: false} and writes nothing.
 */
export async function generate({ prototype, designSystem, decisions = {}, depsDir } = {}) {
  const system = await loadDesignSystem(designSystem);
  const { foundations, adapter } = system;
  const rel = basename(prototype);
  const doc = readHtml(prototype, rel, { depsDir });
  const { at, rules } = doc;
  const d = decider(decisions);
  const cache = new Map();
  const style = el => computed(rules, el, cache);
  const theme = collectionOf(foundations, Object.values(foundations.collections).find(c => !c.hidden && c.modes.length > 1).modes[0].key);

  // Custom properties the Prototype defines on :root, for references such as var(--border).
  const custom = {};
  for (const r of rules) if (!r.media && /^(:root|html)$/.test(r.selector)) for (const x of r.decls) if (x.property.startsWith('--')) custom[x.property] = x.value;

  // ---- the mode map (#61): page and first container surfaces against the Adapter's surface tokens ----
  const body = findTag(doc.root, 'body');
  const mount = doc.mounts[0] || body;
  const bg = el => { const v = style(el)['background-color']; if (!v || !v.own) return null; try { const c = convert(followCustom(v.value, custom)); return c.alpha > 0 ? c.hex : null; } catch { return null; } };
  let container = null;
  walk(mount, el => { if (!container && el !== mount && el.children.filter(c => c.type === 'element').length >= 2 && bg(el)) container = el; });
  const pageHex = bg(body) || bg(mount) || '#ffffff';
  const scores = theme.modes.map(m => {
    const tokenHex = k => convert(valueIn(foundations.variables[k], m.key)).hex;
    const score = deltaE(pageHex, tokenHex(adapter.surfaces.page)) + (container ? deltaE(bg(container), tokenHex(adapter.surfaces.layer)) : 0);
    return { mode: m, score: Math.round(score * 10000) / 10000 };
  });
  const best = scores.slice().sort((a, b) => a.score - b.score || theme.modes.indexOf(a.mode) - theme.modes.indexOf(b.mode))[0].mode;
  const mode = best.key;
  const ctx = { system, mode, custom };
  const notes = [{
    level: 'info',
    text: `Single-mode Prototype: its page surface (${pageHex})${container ? ` and first container (${firstClass(container)} ${bg(container)})` : ''} map best to ${best.label} `
      + `(${scores.map(s => `${s.mode.label} ΔE ${s.score}`).join(', ')}). The other ${theme.name} modes render unverified.`,
  }];

  // ---- conditions and the standard states (#62) ----
  const conds = [];
  walk(doc.root, el => {
    for (const c of el.cond) conds.push(c.expr);
    for (const h of el.attrHoles) if (h.ternary) conds.push(h.ternary.cond);
    for (const t of textNodes(el)) for (const p of t.parts) if (p && p.ternary) conds.push(p.ternary.cond);
  });
  const atoms = [];
  for (const c of conds) atomsOf(parseCondition(c), atoms);
  const defaults = {};
  for (const atom of atoms.filter(a => !stateOfAtom(a))) {
    const answer = d.ask(`condition:${atom}`, {
      kind: 'condition', question: `Is \`${atom}\` true or false when the screen first shows?`, candidates: [false, true],
    }, a => (typeof a === 'boolean' ? null : `${JSON.stringify(a)} is not true or false`));
    defaults[atom] = Boolean(answer);
  }
  const stateAtoms = s => atoms.filter(a => stateOfAtom(a) === s);
  const present = STANDARD_STATES.filter(s => s === 'default' || stateAtoms(s).length);
  const atomsIn = s => atomIn(s, defaults);
  const shownIn = el => {
    if (!el.cond.length) return null;
    const ins = present.filter(s => el.cond.every(c => evaluate(parseCondition(c.expr), atomsIn(s)) === c.value));
    return ins.length === present.length ? null : ins;
  };

  // ---- recognition: usage candidates, then each one's decision ----
  const copy = {};
  const copyIds = new Set();
  const addCopy = (id, text, offset) => {
    let key = id, n = 2;
    while (copyIds.has(key)) key = `${id}-${n++}`;
    copyIds.add(key);
    copy[key] = { text, ...(isPlaceholderText(text) ? { placeholder: true } : {}), at: at(offset) };
    return `copy:${key}`;
  };
  const usageIds = new Set();
  const uniqueId = (set, id) => { let key = id, n = 2; while (set.has(key)) key = `${id}-${n++}`; set.add(key); return key; };
  const consumed = new Set();
  const usageOf = new Map();
  const questions = [];
  const question = q => { if (!questions.some(x => x.id === q.id)) questions.push(q); return q.id; };
  const usedContracts = new Set(), usedProposals = new Set();
  const usageStates = Object.fromEntries(present.map(s => [s, {}]));
  const families = [...Object.keys(system.contracts).map(k => `contract:${k}`), ...Object.keys(system.proposals).map(k => `proposal:${k}`)];

  const checkRecognise = answer => {
    if (!answer || typeof answer !== 'object') return 'an answer is {contract, tuple, via} | {proposal, tuple, via} | {raw: true, reason} | {noContract, reason}';
    if (answer.contract) {
      const c = system.contracts[answer.contract];
      if (!c) return `no Contract "${answer.contract}" in ${system.key}`;
      return tupleProblem(c, answer.tuple, `\`${answer.contract}\``) || viaProblem(answer.via);
    }
    if (answer.proposal) {
      const p = system.proposals[answer.proposal];
      if (!p) return `no Proposal "${answer.proposal}" in ${system.key}`;
      return tupleProblem(p, answer.tuple, `\`${answer.proposal}\``) || viaProblem(answer.via);
    }
    if (answer.draft) {
      if (!answer.reason) return 'a draft answer needs a reason, the raw usage\'s reason if the draft fails';
      return answer.tuple && typeof answer.tuple === 'object' ? viaProblem(answer.via) : `\`${answer.draft}\` needs a tuple`;
    }
    if (answer.raw === true || answer.noContract) return answer.reason ? null : 'a raw usage needs a reason';
    return 'an answer names a contract, a proposal, a draft, raw or noContract';
  };

  // ---- a family the Code Library ships with no Contract (#90, #115): the Adapter writes it mid-run ----
  // The agent follows the Adapter's procedure for the whole family and answers with the file it wrote. A draft
  // that passes the Adapter's check is used in this run and written into contracts/ once nothing is open; one
  // that fails, can't be read or can't be written falls back to a raw usage plus an open question.
  const drafts = new Map();
  const draftOf = family => {
    if (drafts.has(family)) return drafts.get(family);
    const answer = d.ask(`contract:${family}`, {
      kind: 'contract-draft', candidates: [],
      question: `\`${family}\` has no Contract in ${system.key}. ${adapter.contractProcedure}. Write the whole family at status draft with its Drafted values, then answer {path} with the file, or {unwritable: reason}.`,
    }, a => (a && (typeof a.path === 'string' && a.path || typeof a.unwritable === 'string' && a.unwritable) ? null : 'a draft answer is {path} or {unwritable: reason}'));
    let result = null;
    if (answer && answer.unwritable) result = { failed: answer.unwritable };
    else if (answer) {
      const path = isAbsolute(answer.path) ? answer.path : join(REPO_ROOT, answer.path);
      let text, contract;
      try { text = readFileSync(path, 'utf8'); contract = JSON.parse(text); } catch (e) { result = { failed: `its draft at ${answer.path} could not be read (${e.message})` }; }
      if (!result) {
        const problems = draftProblems(contract, family);
        const existing = system.contracts[family];
        if (problems.length) result = { failed: `its draft at ${answer.path} fails the Adapter's check: ${problems.join('; ')}` };
        else if (existing && contractHash(existing) !== contractHash(contract)) throw new Error(`decision "contract:${family}": ${system.key} has another \`${family}\` Contract; a mid-run draft never replaces one`);
        // A re-run after the write finds the same Contract in contracts/ and keeps it, approved or not.
        else result = existing ? { contract: existing } : { contract, text, write: true };
      }
    }
    drafts.set(family, result);
    if (result && result.contract) {
      system.contracts[family] = result.contract;
      if (result.contract.selection.status === 'draft') notes.push({
        level: 'info',
        text: `\`${family}\` is a Contract the Adapter wrote mid-run at status draft (${Object.keys(result.contract.drafted || {}).length} Drafted values); its check passed. `
          + 'The owner approves it through To-design\'s base loop; this Handoff\'s sign-off does not.',
      });
    }
    return result;
  };
  const draftProblems = (c, family) => {
    if (!c || typeof c !== 'object' || !c.family || !c.selection) return ['it is not a Contract'];
    const out = [];
    if (c.family.key !== family) out.push(`its family is \`${c.family.key}\`, not \`${family}\``);
    if (c.selection.status !== 'draft' || c.selection.approval !== null) out.push('a Contract written mid-run stays status draft with approval null');
    return [...out, ...adapter.checkContract(c, foundations)];
  };
  // A draft answer as the recognise answer it stands for: a Contract usage on a pass, a raw one on a failure.
  const resolveDraftAnswer = (answer, key) => {
    if (!answer || !answer.draft) return answer;
    const r = draftOf(answer.draft);
    if (!r) return undefined;
    if (r.failed) return { noContract: answer.draft, reason: answer.reason, failed: r.failed };
    const problem = tupleProblem(r.contract, answer.tuple, `\`${answer.draft}\``);
    if (problem) throw new Error(`decision "${key}": ${problem}`);
    return { contract: answer.draft, tuple: answer.tuple, via: answer.via };
  };

  const recognised = [];
  const visit = el => {
    if (el.type !== 'element' || consumed.has(el)) return;
    const cand = candidateOf(el, rules);
    if (cand) {
      const key = `recognise:${cand.sig}`;
      const answer = resolveDraftAnswer(d.ask(key, {
        kind: 'recognise', question: `What is \`${cand.sig}\` ("${elementText(el, atomsIn('default')).slice(0, 40)}")?`, candidates: families, evidence: { at: [at(el.offset)] },
      }, checkRecognise), key);
      recognised.push({ el, cand, answer });
      usageOf.set(el, recognised[recognised.length - 1]);
      walk(el, x => { if (x !== el) consumed.add(x); });
      if (answer && answer.contract) {
        // A label element names the control (<label for>): its text is the Contract's label property.
        const id = typeof el.attrs.id === 'string' ? el.attrs.id : null;
        if (id) walk(doc.root, x => { if (x.tag === 'label' && x.attrs.for === id) consumed.add(x); });
      }
      return;
    }
    for (const c of el.children) visit(c);
  };
  visit(doc.root);

  const labelFor = id => { let found = null; walk(doc.root, x => { if (!found && x.tag === 'label' && x.attrs.for === id) found = x; }); return found; };
  const usages = new Map();
  for (const { el, cand, answer } of recognised) {
    const base = typeof el.attrs.id === 'string' ? el.attrs.id : el.classes[0] || el.tag;
    const id = uniqueId(usageIds, kebab(base));
    const u = { id };
    const states = shownIn(el);
    if (!answer) { usages.set(el, u); continue; }
    if (answer.contract || answer.proposal) {
      const def = answer.contract ? system.contracts[answer.contract] : system.proposals[answer.proposal];
      if (answer.contract) { u.contract = answer.contract; usedContracts.add(answer.contract); }
      else { u.proposal = answer.proposal; usedProposals.add(answer.proposal); }
      u.tuple = { ...answer.tuple };
      Object.assign(u, contentOf(def, el, cand, id, answer));
      u.match = { by: 'agent', via: answer.via || 'element', ...(answer.candidates ? { candidates: answer.candidates } : {}) };
      if (answer.contract) {
        const off = offAxis(def, u.tuple, el, id);
        if (off.length) u.offAxis = off;
        recordUsageStates(def, el, u);
      }
    } else {
      u.raw = { element: cand.sig };
      u.reason = answer.reason;
      const text = elementText(el, atomsIn(states ? states[0] : 'default'));
      if (text) u.properties = { text: addCopy(`${id}-text`, text, (textNodes(el)[0] || el).offset) };
      if (answer.noContract) {
        u.question = question({
          id: `q-no-contract-${id}`, kind: 'no-contract', to: 'owner',
          text: `\`${cand.sig}\` is a ${answer.noContract} with no Contract in ${system.key} yet${answer.failed ? `, and the Adapter could not write one mid-run: ${answer.failed}` : ''}. ${adapter.contractProcedure}, then re-run To-handoff.`,
        });
      }
    }
    if (states) u.states = states;
    u.at = at(el.offset);
    usages.set(el, u);
  }

  function contentOf(def, el, cand, id, answer) {
    const out = {};
    const props = {};
    const code = def.code || {};
    const roleOfNode = name => { let r = null; const v = n => { if (n.name === name) r = n.role; (n.children || []).forEach(v); }; v(def.anatomy); return r; };
    const elId = typeof el.attrs.id === 'string' ? el.attrs.id : null;
    if (cand.kind === 'group') {
      const text = (def.properties || []).find(p => p.type === 'TEXT');
      const kids = el.children.filter(c => c.type === 'element');
      if (text) out.items = kids.map((k, n) => ({ properties: { [text.key]: addCopy(`${id}-${kebab(text.key)}-${n + 1}`, elementText(k, atomsIn('default')), k.offset) }, at: at(k.offset) }));
      return out;
    }
    for (const p of def.properties || []) {
      if (p.type !== 'TEXT') continue;
      const c = p.code || {};
      const node = (p.binds || [])[0] && p.binds[0].node;
      if (c.prop === 'children') {
        const t = textNodes(el)[0];
        if (t) props[p.key] = addCopy(`${id}-${kebab(p.key)}`, elementText(el, atomsIn('default')), t.offset);
      } else if (c.prop && typeof el.attrs[c.prop] === 'string') {
        props[p.key] = addCopy(`${id}-${kebab(p.key)}`, el.attrs[c.prop], el.offset);
      } else if (c.itemProp) {
        const options = el.children.filter(x => x.type === 'element' && x.tag === 'option');
        if (options.length) out.items = options.map((o, n) => ({ properties: { [p.key]: addCopy(`${id}-${kebab(p.key)}-${n + 1}`, elementText(o, atomsIn('default')), o.offset) }, at: at(o.offset) }));
      } else if (node && roleOfNode(node) === 'label' && elId) {
        const label = labelFor(elId);
        if (label) props[p.key] = addCopy(`${id}-${kebab(p.key)}`, elementText(label, atomsIn('default')), label.offset);
      }
    }
    for (const prop of code.required || []) if (!(prop in props) && el.attrs[prop] !== undefined && typeof el.attrs[prop] === 'string') props[prop] = el.attrs[prop];
    if (Object.keys(props).length) out.properties = props;
    return out;
  }

  // A State value (its code non-null) an attribute hole sets, and a TEXT property a text ternary varies, per state.
  function recordUsageStates(def, el, u) {
    const stateAxis = stateAxisOf(def);
    const byAttr = {};
    if (stateAxis) for (const v of stateAxis.values) if (v.code) for (const k of Object.keys(v.code)) byAttr[k] = v.key;
    const childrenProp = (def.properties || []).find(p => p.type === 'TEXT' && p.code && p.code.prop === 'children');
    for (const s of present) {
      const entry = {};
      for (const h of el.attrHoles) {
        if (!h.ternary) continue;
        const branch = evaluate(parseCondition(h.ternary.cond), atomsIn(s)) ? h.ternary.then : h.ternary.else;
        const word = branch.text !== undefined ? branch.text.trim() : '';
        if (byAttr[word]) entry.state = byAttr[word];
      }
      if (childrenProp && hasTernary(el) && s !== 'default') {
        const text = elementText(el, atomsIn(s));
        if (text !== elementText(el, atomsIn('default')))
          entry.properties = { [childrenProp.key]: addCopy(`${u.id}-${kebab(childrenProp.key)}-${s}`, text, textNodes(el)[0].offset) };
      }
      if (Object.keys(entry).length) usageStates[s][u.id] = entry;
    }
    for (const [k, v] of Object.entries(byAttr)) if (typeof el.attrs[k] === 'string') u.state = v;
  }

  // Off-axis (#62): a usage's own colour no paint token of its tuple has, in the mapped mode.
  function offAxis(contract, tuple, el, id) {
    const full = { ...Object.fromEntries(contract.axes.map(a => [a.key, a.default])), ...tuple };
    const tokens = new Set();
    const collect = v => { if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') { if (typeof v.token === 'string') tokens.add(v.token); else Object.values(v).forEach(collect); } };
    collect(resolve(contract, full).paint);
    const hexes = [...tokens].filter(t => foundations.variables[t]).map(t => convert(valueIn(foundations.variables[t], mode, foundations)).hex);
    const out = [];
    for (const decl of ownDeclarations(rules, el)) {
      const role = roleOf(decl.property);
      if (!COLOR_ROLES.has(role)) continue;
      let c;
      try { c = convert(followCustom(decl.value, custom)); } catch { continue; }
      if (c.alpha === 0 || hexes.some(h => sameHex(h, c.hex))) continue;
      const raw = colorText(followCustom(decl.value, custom));
      if (out.some(o => o.property === decl.property && o.raw === raw)) continue;
      out.push({ property: decl.property, raw, reason: `\`${contract.family.key}\` ${Object.values(full).join(' ')} paints no ${raw} in ${best.label}`, question: `q-off-axis-${id}` });
    }
    if (out.length) question({
      id: `q-off-axis-${id}`, kind: 'off-axis', to: 'owner',
      text: `\`${id}\` (${contract.family.key}) sets ${out.map(o => `${o.property} ${o.raw}`).join(', ')}, which its tuple does not paint. Keep the Contract's look, pick another tuple, or record a variant?`,
    });
    return out;
  }

  // ---- regions: the mount's children; leading headings and paragraphs merge into "header" ----
  const regionIds = new Set();
  const values = [];
  const fonts = [];
  const usedTokens = new Set(), usedStyles = new Set();
  const regions = [];
  const kids = mount.children.filter(c => c.type === 'element');
  const groups = [];
  let i = 0;
  const lead = [];
  while (i < kids.length && (HEADINGS.has(kids[i].tag) || kids[i].tag === 'p') && !usages.has(kids[i])) lead.push(kids[i++]);
  if (lead.length) groups.push({ id: 'header', els: lead, landmark: null });
  for (; i < kids.length; i++) groups.push({ id: kebab(typeof kids[i].attrs.id === 'string' ? kids[i].attrs.id : kids[i].classes[0] || kids[i].tag), els: [kids[i]] });

  // The shell: html, body and the mount element.
  const shellEls = [];
  for (let p = mount; p; p = p.parent) shellEls.unshift(p);
  regions.push(regionOf({ id: 'shell', els: shellEls, shell: true }, true));
  for (const g of groups) regions.push(regionOf(g, false));

  function regionOf(g, shell) {
    const r = { id: uniqueId(regionIds, g.id) };
    const first = g.els[0];
    r.landmark = shell ? landmarkOf(mount) : g.landmark !== undefined && g.els.length > 1 ? g.landmark : landmarkOf(first);
    if (shell) r.shell = true;
    if (!shell && /^(fixed|absolute)$/.test((style(first).position || {}).value || '')) r.overlay = true;
    const states = shell ? null : shownIn(first);
    if (states) r.states = states;
    r.at = at(first.offset);
    r.styles = [];
    r.text = [];
    r.usages = [];
    const elements = [];
    if (shell) elements.push(...g.els);
    else for (const root of g.els) walk(root, el => { if (!consumed.has(el)) elements.push(el); });
    for (const el of elements) {
      const u = usages.get(el);
      if (u) {
        r.usages.push(u);
        // A raw usage has no Contract to carry its look: its own styles stay in the region, matched like any other.
        if (u.raw) walk(el, x => { for (const decl of ownDeclarations(rules, x)) addStyle(r, decl); });
        continue;
      }
      if (insideUsage(el)) continue;
      for (const decl of ownDeclarations(rules, el)) addStyle(r, decl);
      if (!shell) for (const t of textNodes(el)) addText(r, el, t);
    }
    return r;
  }

  function insideUsage(el) { for (let p = el.parent; p; p = p.parent) if (usages.has(p)) return true; return false; }

  function addStyle(r, decl) {
    if (decl.property === 'font-family') { fonts.push({ value: decl.value, at: at(decl.offset) }); return; }
    const role = roleOf(decl.property);
    if (!role) return;
    const words = COLOR_ROLES.has(role) ? [decl.value] : splitWords(decl.value);
    for (const raw of words) {
      const result = matchDeclaration({ property: decl.property, value: raw }, ctx);
      if (result.kind === 'skip') continue;
      const where = at(decl.offset);
      const existing = r.styles.find(s => s.property === decl.property && s.raw === raw);
      if (existing) { if (!existing.at.includes(where)) existing.at.push(where); continue; }
      const s = { property: decl.property, raw, at: [where] };
      const norm = COLOR_ROLES.has(role) ? colorText(followCustom(raw, custom)) : raw;
      const key = `token:${role}:${norm}`;
      if (result.kind === 'reference' || result.kind === 'exact') {
        s.token = result.token;
        if (result.via) s.via = result.via;
      } else if (result.kind === 'tie' || result.kind === 'near') {
        const cands = result.kind === 'tie' ? result.candidates : result.candidates.map(c => c.token);
        const answer = d.ask(key, {
          kind: result.kind === 'tie' ? 'token-tie' : 'token-near',
          question: result.kind === 'tie' ? `${norm} as ${role} is exactly ${cands.join(', ')}: which one?` : `${norm} as ${role} is near ${result.candidates.map(c => `${c.token} (ΔE ${c.delta})`).join(', ')}: which one, or "value" to keep it Off-system?`,
          candidates: cands, evidence: { at: [where] },
        }, among(cands, ['value']));
        if (answer === 'value') offSystemValue(s, role, norm, { reason: `The owner kept ${norm} Off-system rather than ${cands.join(', ')}`, nearest: result.kind === 'near' ? result.candidates : cands.map(t => ({ token: t, delta: 0 })) }, where);
        else {
          s.token = answer || cands[0];
          if (result.kind === 'near') { s.match = 'near'; s.delta = result.candidates.find(c => c.token === s.token).delta; }
          s.candidates = cands;
          s.by = 'agent';
        }
      } else offSystemValue(s, role, norm, result, where);
      if (s.token) usedTokens.add(s.token);
      r.styles.push(s);
    }
  }

  function offSystemValue(s, role, norm, result, where) {
    const id = kebab(`${role}-${norm.replace(/^#/, '')}`);
    let v = values.find(x => x.id === id);
    if (!v) {
      v = { id, raw: { [PROTOTYPE_MODE]: norm }, role, reason: result.reason, nearest: result.nearest, ...(result.primitive ? { primitive: result.primitive } : {}), at: [] };
      values.push(v);
    }
    if (!v.at.includes(where)) v.at.push(where);
    s.value = `value:${id}`;
  }

  function addText(r, el, t) {
    const text = textOf(t.parts, atomsIn('default'));
    if (!text) return;
    const c = style(el);
    const num = (prop, fallback) => { const v = c[prop] && c[prop].value; if (!v) return fallback; const m = /^(-?\d*\.?\d+)px$/.exec(v); return m ? Number(m[1]) : fallback; };
    const fontSize = num('font-size', 16);
    const lhRaw = c['line-height'] && c['line-height'].value;
    const lineHeight = !lhRaw || lhRaw === 'normal' ? null : /px$/.test(lhRaw) ? parseFloat(lhRaw) : Number.isFinite(Number(lhRaw)) ? Math.round(Number(lhRaw) * fontSize * 100) / 100 : null;
    const fw = c['font-weight'] && c['font-weight'].value;
    const fontWeight = fw ? (fw === 'bold' ? 700 : fw === 'normal' ? 400 : Number(fw)) : HEADINGS.has(el.tag) ? 700 : 400;
    const letterSpacing = num('letter-spacing', 0);
    const raw = { fontSize, lineHeight, fontWeight, letterSpacing };
    const result = matchText(raw, ctx);
    const where = at(t.offset);
    const tkey = `textStyle:${fontSize}/${lineHeight === null ? 'normal' : lineHeight}/${fontWeight}/${letterSpacing}`;
    const s = {};
    if (result.kind === 'exact') s.textStyle = result.token;
    else if (result.kind === 'tie' || result.kind === 'near') {
      const cands = result.kind === 'tie' ? result.candidates : result.candidates.map(x => x.token);
      const answer = d.ask(tkey, {
        kind: result.kind === 'tie' ? 'text-tie' : 'text-near',
        question: `Text ${fontSize}px / ${lineHeight ?? 'normal'} / ${fontWeight} / ${letterSpacing}px is ${result.kind === 'tie' ? 'exactly' : 'near'} ${cands.join(', ')}: which Text Style?`,
        candidates: cands, evidence: { at: [where] },
      }, among(cands, ['value']));
      if (answer === 'value') s.raw = raw;
      else {
        s.textStyle = answer || cands[0];
        if (result.kind === 'near') { s.match = 'near'; s.delta = result.candidates.find(x => x.token === s.textStyle).delta; }
        s.candidates = cands;
        s.by = 'agent';
      }
    } else if (result.kind === 'partial') {
      const m = result.match;
      let token;
      if (m.kind === 'exact') token = { token: m.token };
      else {
        const answer = d.ask(`token:font-size:${fontSize}px`, {
          kind: 'token-tie', question: `Font size ${fontSize}px (no whole Text Style matches) is exactly ${m.candidates.join(', ')}: which one?`,
          candidates: m.candidates, evidence: { at: [where] },
        }, among(m.candidates));
        token = { token: answer || m.candidates[0], candidates: m.candidates, by: 'agent' };
      }
      usedTokens.add(token.token);
      s.partial = { fontSize: token };
      s.raw = raw;
    } else s.raw = raw;
    if (s.textStyle) usedStyles.add(s.textStyle);
    const base = typeof el.attrs.id === 'string' ? el.attrs.id : el.classes[0] || el.tag;
    const entry = { copy: addCopy(kebab(base), text, t.offset).slice(5), at: where };
    const states = shownIn(el);
    if (states) entry.states = states;
    entry.style = s;
    r.text.push(entry);
  }

  // ---- questions the reader raises: font, breakpoints, missing states, Stand-ins ----
  if (fonts.length) {
    const families = Object.values(foundations.textStyles).map(s => s.fontFamily);
    const common = families.sort((a, b) => families.filter(x => x === b).length - families.filter(x => x === a).length || (a < b ? -1 : 1))[0];
    const bind = Object.values(foundations.textStyles).find(s => s.fontFamily === common)?.binds?.fontFamily;
    question({
      id: 'q-font', kind: 'font', to: 'owner',
      text: `The Prototype sets font-family ${[...new Set(fonts.map(f => f.value))].join('; ')} (${fonts.map(f => f.at).join(', ')}); the Text Styles use ${common}${bind ? ` (${bind})` : ''}. Use ${common}?`,
    });
  }
  const medias = [...new Set(rules.filter(r => r.media).map(r => r.media))];
  for (const m of medias) {
    const sel = rules.filter(r => r.media === m).map(r => r.selector);
    question({ id: `q-breakpoint-${kebab(m)}`, kind: 'breakpoint', to: 'owner', text: `@media ${m} changes ${sel.join(', ')}; the static reader has no viewport. Which Design System breakpoint is it, and what should change there?` });
  }
  const screenStates = {};
  const trigger = {};
  const sim = standIns(doc.scripts);
  for (const f of sim.simulated) {
    for (const a of f.before) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${f.name}() sets ${a} (simulated)`;
    for (const a of f.after) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${f.name}() sets ${a} after a ${f.delay}ms timer (simulated)`;
  }
  for (const s of STANDARD_STATES) {
    if (!present.includes(s)) {
      screenStates[s] = { missing: true, question: question({ id: `q-state-${s}`, kind: 'missing-state', to: 'owner', text: `The Prototype has no ${s} state: no condition reads like ${s}. What should the screen show?` }) };
      continue;
    }
    const shows = [];
    walk(mount, el => { if (el.cond.length && !insideUsage(el) && (shownIn(el) || present).includes(s) && !(el.parent && el.parent.cond.length && el.parent.cond.length === el.cond.length)) shows.push(usages.get(el)?.id || firstClass(el)); });
    const on = s === 'default' ? 'every state condition is false' : stateAtoms(s).map(a => `\`${a}\``).join(' or ') + ' is true';
    const entry = { content: `${on}; conditional content shown: ${shows.length ? [...new Set(shows)].join(', ') : 'none'}` };
    if (trigger[s]) entry.trigger = trigger[s];
    else if (s !== 'default') entry.trigger = `${stateAtoms(s).join(' or ')}`;
    if (Object.keys(usageStates[s]).length) entry.usageStates = usageStates[s];
    entry.screenshots = { [PROTOTYPE_MODE]: { missing: true, reason: 'static-only: the tracer reads the Prototype without running it' } };
    screenStates[s] = entry;
  }
  const data = [];
  for (const m of sim.mocks) {
    const id = kebab(m.name.replace(/^mock/, ''));
    data.push({ id, source: 'mock', note: `\`${m.name}\` is mock data standing in for the ${id.replace(/-/g, ' ')}`, at: at(m.offset),
      question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text: `Where do the ${id.replace(/-/g, ' ')} come from? \`${m.name}\` stands in for them.` }) });
  }
  const flow = [];
  for (const f of sim.simulated) {
    const id = kebab(f.name);
    data.push({ id, source: 'simulated', note: `\`${f.name}()\` simulates its work with a ${f.delay}ms setTimeout`, at: at(f.offset),
      question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text: `What does \`${f.name}()\` call, and how does it fail? The Prototype simulates it with a timer.` }) });
    const from = f.before.map(stateOfAtom).find(Boolean), to = f.after.map(stateOfAtom).find(Boolean);
    if (from) flow.push({ from: 'default', trigger: `${f.name}()`, to: from, source: 'simulated' });
    if (from && to) flow.push({ from, trigger: `${f.delay}ms timer`, to, source: 'simulated' });
    if (from && !present.includes('error')) flow.push({ from, trigger: `${f.name}() fails`, to: 'error', source: 'missing' });
  }

  // ---- feature and acceptance: the owner's words, as decisions ----
  const title = doc.title || rel.replace(/\.html?$/, '');
  const feature = d.ask('feature', {
    kind: 'feature', question: `What is "${title}" for? Answer {owner, goal, scope: [..], nonGoals: [..]}.`, candidates: [],
  }, a => (a && typeof a.goal === 'string' && a.goal ? null : 'a feature answer needs a goal'));
  const screenId = kebab(title);
  const acceptance = d.ask('acceptance', {
    kind: 'acceptance', question: `Acceptance criteria for ${screenId}: [{id, screen, state, given, when, then}], one per state at least.`, candidates: present,
  }, a => (Array.isArray(a) && a.length && a.every(x => x.id && x.screen === screenId && STANDARD_STATES.includes(x.state) && x.given && x.when && x.then) ? null
    : `acceptance is a non-empty list of {id, screen: "${screenId}", state, given, when, then}`));

  if (d.requests.length) return { requests: d.requests, handoff: undefined, path: null, wrote: false };

  // A mid-run draft that passed joins contracts/ as the Adapter wrote it, once per family; it never replaces one.
  for (const [family, r] of [...drafts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!r || !r.write) continue;
    mkdirSync(join(designSystem, 'contracts'), { recursive: true });
    writeFileSync(join(designSystem, 'contracts', `${family}.component.json`), r.text);
  }

  // ---- source pins ----
  const files = { [rel]: fileHash(readFileSync(prototype)) };
  const contracts = {};
  for (const k of [...usedContracts].sort()) contracts[k] = { snapshotId: system.contracts[k].source.snapshotId, contentHash: contractHash(system.contracts[k]) };
  const proposals = {};
  for (const k of [...usedProposals].sort()) proposals[k] = proposalContentHash(system.proposals[k]);
  const strip = o => { const c = clone(o); delete c.usedBy; return c; };
  const used = {
    variables: Object.fromEntries([...usedTokens].sort().map(k => [k, strip(foundations.variables[k])])),
    textStyles: Object.fromEntries([...usedStyles].sort().map(k => [k, strip(foundations.textStyles[k])])),
  };

  const handoff = {
    schemaVersion: 1,
    revision: 1,
    status: 'pending',
    approval: null,
    feature: { key: screenId, name: title, ...(feature.owner ? { owner: feature.owner } : {}), goal: feature.goal, ...(feature.scope ? { scope: feature.scope } : {}), ...(feature.nonGoals ? { nonGoals: feature.nonGoals } : {}) },
    source: {
      input: 'prototype',
      kind: 'html-file',
      prototype: { files, snapshotId: snapshotIdOf(files) },
      designSystem: system.key,
      contracts,
      proposals,
      foundations: { documentHash: fileHash(system.foundationsText), usedHash: 'sha256:' + sha256(canonical(used)) },
      modes: { [PROTOTYPE_MODE]: mode },
      notes,
    },
    screens: [{ id: screenId, name: title, at: at(mount.offset), breakpoints: [], regions, states: screenStates }],
    copy,
    values,
    acceptance: acceptance.map(a => ({ id: a.id, screen: a.screen, state: a.state, given: a.given, when: a.when, then: a.then, by: 'agent' })),
    openQuestions: questions.map(q => ({ ...q, answer: null })),
    flow,
    data,
  };
  return store(handoff, join(designSystem, 'handoffs', screenId));
}

// ---------- store (#64): handoffs/<feature-key>/handoff.json; a write only when the content changes ----------

function store(handoff, dir) {
  const path = join(dir, 'handoff.json');
  const hash = handoffContentHash(handoff);
  if (existsSync(path)) {
    const old = JSON.parse(readFileSync(path, 'utf8'));
    if (handoffContentHash(old) === hash) return { requests: [], handoff: old, path, wrote: false, contentHash: hash };
    handoff.revision = (old.revision || 0) + 1;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(handoff, null, 2) + '\n');
  return { requests: [], handoff, path, wrote: true, contentHash: hash };
}

// ---------- helpers ----------

function tupleProblem(def, tuple, name) {
  if (!tuple || typeof tuple !== 'object') return `${name} needs a tuple`;
  for (const [k, v] of Object.entries(tuple)) {
    const axis = def.axes.find(a => a.key === k);
    if (!axis) return `tuple axis ${k} is not an axis of ${name}`;
    if (axis === stateAxisOf(def)) return `tuple axis ${k} is the State axis; a State comes from the Prototype's conditions`;
    if (!axis.values.some(x => x.key === v)) return `tuple ${k} "${v}" is not a ${axis.label} value of ${name} (${axis.values.map(x => x.key).join(', ')})`;
  }
  return null;
}
const viaProblem = via => (via === undefined || via === 'library' || via === 'element' ? null : `via "${via}" is not library or element`);
const firstClass = el => (el.classes[0] ? `.${el.classes[0]}` : el.tag);
function landmarkOf(el) {
  if (typeof el.attrs.role === 'string' && LANDMARK_ROLES.has(el.attrs.role)) return el.attrs.role;
  return LANDMARKS[el.tag] || null;
}
function findTag(root, tag) { let found = null; walk(root, e => { if (!found && e.tag === tag) found = e; }); return found; }
