// To-handoff generate (#102): a Prototype (one HTML file, or a React app folder, #114) + a Design System + decisions -> a Handoff.
// Generation is pure over (Prototype files, Design System, decisions): no clock, no network, no guess. Every
// pick the agent or the owner makes (what an element is, a tied or near token, a plain condition's default,
// the feature and its acceptance) is a keyed decision. Any unanswered key makes generate return the decision
// requests and write nothing; an answer outside its request's candidates is refused.
//
// Owner decisions (#64 §8) are the owner's words, entered only on the owner's say-so in chat as
// `{"by": "owner", "answer": …}` (or `{"by": "owner", "to": "developer"}` for a question). The Handoff records
// them in `ownerDecisions` by stable key, and a re-run carries them over from the stored handoff.json: they
// win over the agent's answers while their key still exists, and are dropped and listed once it is gone.
// Agent decisions are re-decided every run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { convert, deltaE } from '../../contract/scripts/color.mjs';
import { contentHash as contractHash, proposalContentHash, resolve } from '../../contract/scripts/contract.mjs';
import { computed, splitWords } from './css.mjs';
import { fileHash, handoffContentHash, prototypeFiles, snapshotIdOf, usedHash } from './hash.mjs';
import { COLOR_ROLES, collectionOf, colorText, followCustom, matchDeclaration, matchText, roleOf, sameHex, valueIn } from './match.mjs';
import { REPO_ROOT, loadDesignSystem, stateAxisOf } from './system.mjs';
import { hasRuntime } from './deps.mjs';
import { readHtml, walk } from './reader.mjs';
import { readReact } from './react.mjs';
import { STEP_KINDS, run } from './runtime.mjs';
import {
  CONTENT_PROPS, STANDARD_STATES, atomIn, atomsOf, candidateOf, evaluate, isPlaceholderText, librarySignature, ownDeclarations, parseCondition, standIns, stateOfAtom,
} from './recognise.mjs';

const PROTOTYPE_MODE = 'light';
const LANDMARKS = { header: 'banner', nav: 'navigation', main: 'main', aside: 'complementary', footer: 'contentinfo' };
const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'search', 'form']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Without breakpoints from the Adapter, the runtime reader screenshots one desktop width.
const DEFAULT_BREAKPOINTS = [{ key: 'desktop', width: 1280 }];
// Above this many routes, To-handoff asks whether to split the Prototype (#62).
const MAX_SCREENS = 6;

export { fileHash, handoffContentHash, snapshotIdOf };
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- decisions ----------

const isOwnerEntry = v => v !== null && typeof v === 'object' && !Array.isArray(v) && v.by === 'owner';
const ownerAnswer = (key, v) => {
  if (key.startsWith('question:')) { const { by, ...rest } = v; return rest; }
  return v.answer;
};

/**
 * `decisions` (decisions.json) over `carried` (the stored Handoff's ownerDecisions). An owner answer wins over
 * the agent's; a carried one that no longer passes its check is dropped, a fresh one is refused like any answer.
 */
function decider(decisions, carried = {}) {
  const requests = [];
  const byKey = new Map();
  const owner = new Map(Object.entries(carried).map(([k, v]) => [k, { answer: v, fresh: false }]));
  const agent = {};
  for (const [k, v] of Object.entries(decisions)) {
    if (isOwnerEntry(v)) owner.set(k, { answer: ownerAnswer(k, v), fresh: true });
    else agent[k] = v;
  }
  const used = new Map();
  const dropped = [];
  return {
    requests,
    dropped,
    /** The owner's answers this run used, by key. */
    used,
    isOwner: key => used.has(key),
    /** Mark `target` as decided for `key`: `by: "owner"` when the owner's answer settled it, else `by: "agent"`. */
    mark(target, key) { target.by = used.has(key) ? 'owner' : 'agent'; return target; },
    /** The owner's answer for a key the pass settles itself (questions, acceptance), or undefined. */
    ownerOf(key) { const o = owner.get(key); return o && o.answer; },
    use(key) { used.set(key, owner.get(key).answer); },
    drop(key, reason) { dropped.push({ key, answer: owner.get(key).answer, reason }); owner.delete(key); },
    /** Owner keys this run never reached: their key is gone. */
    unreached() { return [...owner.keys()].filter(k => !used.has(k)).sort(); },
    /**
     * The answer to `key`, checked by `check` (which throws), or undefined after recording a request. A caller
     * may stand in the first candidate for an undefined answer, only so the pass goes on to collect every
     * request: with any request open, generate returns them and writes nothing.
     */
    ask(key, request, check) {
      if (owner.has(key)) {
        const { answer, fresh } = owner.get(key);
        const problem = check ? check(answer) : null;
        if (!problem) { used.set(key, answer); return answer; }
        if (fresh) throw new Error(`owner decision "${key}": ${problem}`);
        this.drop(key, problem);
      }
      if (Object.prototype.hasOwnProperty.call(agent, key)) {
        const answer = agent[key];
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
 * generate({prototype, designSystem, decisions, runtime}) -> {requests, handoff, path, wrote, contentHash}.
 * `prototype` is the HTML file or a React Prototype folder (Next.js App Router or Vite + react-router, #114);
 * `designSystem` the design-systems/<ds> folder. With any request open it returns {requests, handoff:
 * undefined, path: null, wrote: false} and writes nothing. With `runtime`, the runtime reader (#113) renders a
 * scratch copy for screenshots and computed text metrics; when it cannot run, the Handoff is static-only and says why.
 */
export async function generate({ prototype, designSystem, decisions = {}, depsDir, runtime = false } = {}) {
  const system = await loadDesignSystem(designSystem);
  const { foundations, adapter } = system;
  // A Design System package import is recognised by import (#62): the packages its Contracts name.
  const packages = [...new Set(Object.values(system.contracts).map(c => c.code && c.code.package).filter(Boolean))].sort();
  const doc = readPrototype(prototype, { depsDir, packages });
  const { at, rules, title } = doc;
  const featureKey = kebab(title);
  const screenIds = doc.screens.map(s => s.id);
  const multi = doc.screens.length > 1;
  const dir = join(designSystem, 'handoffs', featureKey);
  const stored = existsSync(join(dir, 'handoff.json')) ? JSON.parse(readFileSync(join(dir, 'handoff.json'), 'utf8')) : null;
  const d = decider(decisions, (stored && stored.ownerDecisions) || {});
  const cache = new Map();
  const style = el => computed(rules, el, cache);
  const theme = collectionOf(foundations, Object.values(foundations.collections).find(c => !c.hidden && c.modes.length > 1).modes[0].key);

  // Custom properties the Prototype defines on :root, for references such as var(--border).
  const custom = {};
  for (const r of rules) if (!r.media && /^(:root|html)$/.test(r.selector)) for (const x of r.decls) if (x.property.startsWith('--')) custom[x.property] = x.value;

  // ---- the mode map (#61): page and first container surfaces against the Adapter's surface tokens ----
  const body = findTag(doc.screens[0].root, 'body');
  const mount = doc.screens[0].mount || body;
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

  // ---- feature-level: copy, Off-system values, fonts and questions are shared by every screen ----
  const breakpoints = adapter.breakpoints || DEFAULT_BREAKPOINTS;
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
  const questions = [];
  const question = q => { if (!questions.some(x => x.id === q.id)) questions.push(q); return q.id; };
  const usedContracts = new Set(), usedProposals = new Set();
  const families = [...Object.keys(system.contracts).map(k => `contract:${k}`), ...Object.keys(system.proposals).map(k => `proposal:${k}`)];
  const values = [];
  const fonts = [];
  const sim = doc.standIns;
  const flow = [];

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

  // The Contract a Design System package import names (#62): its module and export are the Contract's code.
  const contractOfImport = c => Object.keys(system.contracts).sort().find(k => {
    const code = system.contracts[k].code || {};
    return code.package === c.module && code.component === c.export;
  });

  // Each screen's states first, so one runtime run (one build) serves every screen; then each screen's pass.
  const allPresent = new Set();
  const plans = doc.screens.map(statesOf);
  const rt = runtime
    ? await runtimeRead({ prototype, breakpoints, depsDir, screens: plans.map(p => ({ screen: p.screen.id, route: p.screen.route, states: p.runtimeStates })) })
    : { screens: {}, reason: 'static-only: generated without the runtime reader' };
  const screens = plans.map(p => screenPass(p, rt.screens[p.screen.id] || { elements: {}, shots: {}, reason: rt.reason }));

  // ---- conditions and the standard states (#62), and how the runtime reader reaches each ----
  function statesOf(screen) {
    const screenId = screen.id;
    const mount = screen.mount || findTag(screen.root, 'body');
    const conds = [];
    walk(screen.root, el => {
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
    for (const s of present) allPresent.add(s);
    const atomsIn = s => atomIn(s, defaults);
    const shownIn = el => {
      if (!el.cond.length) return null;
      const ins = present.filter(s => el.cond.every(c => evaluate(parseCondition(c.expr), atomsIn(s)) === c.value));
      return ins.length === present.length ? null : ins;
    };

    const reach = s => {
      if (s === 'default') return { steps: [] };
      const answer = d.ask(`reach:${screenId}:${s}`, {
        kind: 'reach', question: `How does ${screenId} reach ${s} from first load? Answer {steps: [{fill, value} | {click} | {clock: ms} | {expect}]} (selectors) or {unreachable: reason}.`, candidates: [],
      }, checkReach);
      if (!answer) return { steps: null, reason: `no reach decision for ${s} yet` };
      return answer.unreachable ? { steps: null, reason: answer.unreachable } : answer;
    };
    const expectIn = s => { const out = []; walk(mount, el => { const ins = shownIn(el); if (ins && ins.includes(s) && !ins.includes('default')) out.push(at(el.offset)); }); return out; };
    const runtimeStates = runtime ? present.map(s => ({ state: s, ...reach(s), expect: expectIn(s) })) : null;
    return { screen, mount, atoms, present, stateAtoms, atomsIn, shownIn, runtimeStates };
  }

  // ---- one screen: recognition, regions, text and states, with the runtime reader's values (#113) ----
  function screenPass({ screen, mount, atoms, present, stateAtoms, atomsIn, shownIn }, rt) {
    const screenId = screen.id;
    const live = el => rt.elements[at(el.offset)];

    // ---- recognition: usage candidates, then each one's decision ----
    const consumed = new Set();
    const usageOf = new Map();
    const usageStates = Object.fromEntries(present.map(s => [s, {}]));

    const recognised = [];
    const visit = el => {
      if (el.type !== 'element' || consumed.has(el)) return;
      const contract = el.component && el.component.kind === 'ds' && contractOfImport(el.component);
      // A Design System import is its Contract by import (#62): the tuple is its props through each axis value's code.
      if (contract) {
        const { tuple, unmapped, stray } = importTuple(system.contracts[contract], el);
        recognised.push({ el, cand: { kind: 'element', sig: el.tag }, answer: { contract, tuple }, key: null, byImport: true, unmapped, stray });
      } else {
        // Another library component is decided by its signature, once per signature; a plain element by its own.
        const cand = el.component ? { kind: 'element', sig: librarySignature(el), library: true } : candidateOf(el, rules);
        if (!cand) { for (const c of el.children) visit(c); return; }
        const key = `recognise:${cand.sig}`;
        const answer = resolveDraftAnswer(d.ask(key, {
          kind: 'recognise', question: `What is \`${cand.sig}\` ("${elementText(el, atomsIn('default')).slice(0, 40)}")?`, candidates: families,
          evidence: { at: [at(el.offset)], ...(live(el) ? { rendered: `${live(el).rect.width}x${live(el).rect.height}px` } : {}) },
        }, checkRecognise), key);
        recognised.push({ el, cand, answer, key });
      }
      const { answer } = recognised[recognised.length - 1];
      usageOf.set(el, recognised[recognised.length - 1]);
      walk(el, x => { if (x !== el) consumed.add(x); });
      if (answer && answer.contract) {
        // A label element names the control (<label for>): its text is the Contract's label property.
        const id = typeof el.attrs.id === 'string' ? el.attrs.id : null;
        if (id) walk(screen.root, x => { if (x.tag === 'label' && x.attrs.for === id) consumed.add(x); });
      }
    };
    visit(screen.root);

    const labelFor = id => { let found = null; walk(screen.root, x => { if (!found && x.tag === 'label' && x.attrs.for === id) found = x; }); return found; };
    const usages = new Map();
    for (const { el, cand, answer, key, byImport, unmapped = [], stray = [] } of recognised) {
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
        u.match = byImport ? { by: 'import' }
          : d.mark({ by: undefined, via: answer.via || (cand.library ? 'library' : 'element'), ...(answer.candidates ? { candidates: answer.candidates } : {}) }, key);
        if (answer.contract) {
          const off = offAxis(def, u.tuple, el, id);
          if (off.length) u.offAxis = off;
          recordUsageStates(def, el, u);
        }
        // A prop the tuple cannot carry is kept as an off-axis raw value with a reason and a question (#62).
        const props = [...unmapped.map(p => [p, `maps to no ${answer.contract} axis value`]), ...stray.map(p => [p, `is no ${answer.contract} axis or property`])];
        if (props.length) {
          const qid = `q-prop-${id}`;
          u.offAxis = [...(u.offAxis || []), ...props.map(([p, why]) => ({ property: p, raw: propText(el.attrs[p]), reason: `${p} ${why}`, question: qid }))];
          u.question = question({
            id: qid, kind: 'prop', to: 'owner',
            text: `\`${el.tag}\` at ${at(el.offset)} sets ${props.map(([p, why]) => `${p}=${propText(el.attrs[p])}, which ${why}`).join('; ')}. Which value is it, or does the Contract need it?`,
          });
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

    function addText(r, el, t) {
      const text = textOf(t.parts, atomsIn('default'));
      if (!text) return;
      const raw = live(el) ? liveMetrics(live(el).style) : staticMetrics(el);
      const { fontSize, lineHeight, fontWeight, letterSpacing } = raw;
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
          d.mark(s, tkey);
        }
      } else if (result.kind === 'partial') {
        const m = result.match;
        let token;
        if (m.kind === 'exact') token = { token: m.token };
        else {
          const fkey = `token:font-size:${fontSize}px`;
          const answer = d.ask(fkey, {
            kind: 'token-tie', question: `Font size ${fontSize}px (no whole Text Style matches) is exactly ${m.candidates.join(', ')}: which one?`,
            candidates: m.candidates, evidence: { at: [where] },
          }, among(m.candidates));
          token = d.mark({ token: answer || m.candidates[0], candidates: m.candidates }, fkey);
        }
        s.partial = { fontSize: token };
        s.raw = raw;
      } else s.raw = raw;
      const base = typeof el.attrs.id === 'string' ? el.attrs.id : el.classes[0] || el.tag;
      const entry = { copy: addCopy(kebab(base), text, t.offset).slice(5), at: where };
      const states = shownIn(el);
      if (states) entry.states = states;
      entry.style = s;
      r.text.push(entry);
    }

    // ---- the screen's states: missing ones are owner questions; Stand-ins name their triggers ----
    const screenStates = {};
    const trigger = {};
    // A simulated function belongs to the screen whose conditions read the state it sets.
    const mine = sim.simulated.filter(f => !multi || [...f.before, ...f.after].some(a => atoms.includes(a)));
    for (const f of mine) {
      for (const a of f.before) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${f.name}() sets ${a} (simulated)`;
      for (const a of f.after) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${f.name}() sets ${a} after a ${f.delay}ms timer (simulated)`;
    }
    for (const s of STANDARD_STATES) {
      if (!present.includes(s)) {
        screenStates[s] = { missing: true, question: question({
          id: `q-state-${s}${multi ? `-${screenId}` : ''}`, kind: 'missing-state', to: 'owner',
          text: `${multi ? `The ${screenId} screen (${screen.route})` : 'The Prototype'} has no ${s} state: no condition reads like ${s}. What should the screen show?`,
        }) };
        continue;
      }
      const shows = [];
      walk(mount, el => { if (el.cond.length && !insideUsage(el) && (shownIn(el) || present).includes(s) && !(el.parent && el.parent.cond.length && el.parent.cond.length === el.cond.length)) shows.push(usages.get(el)?.id || firstClass(el)); });
      const on = s === 'default' ? 'every state condition is false' : stateAtoms(s).map(a => `\`${a}\``).join(' or ') + ' is true';
      const entry = { content: `${on}; conditional content shown: ${shows.length ? [...new Set(shows)].join(', ') : 'none'}` };
      if (trigger[s]) entry.trigger = trigger[s];
      else if (s !== 'default') entry.trigger = `${stateAtoms(s).join(' or ')}`;
      if (Object.keys(usageStates[s]).length) entry.usageStates = usageStates[s];
      entry.screenshots = Object.fromEntries(breakpoints.map(b => {
        const shot = rt.shots[s] && rt.shots[s][b.key];
        return [b.key, shot && shot.png ? `screens/${shot.name}` : shot || { missing: true, reason: rt.reason }];
      }));
      screenStates[s] = entry;
    }
    // With more than one screen, a flow names its states as <screen>/<state>.
    const stateRef = s => (multi ? `${screenId}/${s}` : s);
    for (const f of mine) {
      const from = f.before.map(stateOfAtom).find(Boolean), to = f.after.map(stateOfAtom).find(Boolean);
      if (from) flow.push({ from: stateRef('default'), trigger: `${f.name}()`, to: stateRef(from), source: 'simulated' });
      if (from && to) flow.push({ from: stateRef(from), trigger: `${f.delay}ms timer`, to: stateRef(to), source: 'simulated' });
      if (from && !present.includes('error')) flow.push({ from: stateRef(from), trigger: `${f.name}() fails`, to: stateRef('error'), source: 'missing' });
    }

    return { id: screenId, name: screen.name, at: at(screen.offset), breakpoints: breakpoints.map(b => b.key), regions, states: screenStates };
  }

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
          d.mark(s, key);
        }
      } else offSystemValue(s, role, norm, result, where);
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

  // Text metrics from the source alone: a size the cascade does not set reads as 16px.
  function staticMetrics(el) {
    const c = style(el);
    const num = (prop, fallback) => { const v = c[prop] && c[prop].value; if (!v) return fallback; const m = /^(-?\d*\.?\d+)px$/.exec(v); return m ? Number(m[1]) : fallback; };
    const fontSize = num('font-size', 16);
    const lhRaw = c['line-height'] && c['line-height'].value;
    const lineHeight = !lhRaw || lhRaw === 'normal' ? null : /px$/.test(lhRaw) ? parseFloat(lhRaw) : Number.isFinite(Number(lhRaw)) ? Math.round(Number(lhRaw) * fontSize * 100) / 100 : null;
    const fw = c['font-weight'] && c['font-weight'].value;
    const fontWeight = fw ? (fw === 'bold' ? 700 : fw === 'normal' ? 400 : Number(fw)) : HEADINGS.has(el.tag) ? 700 : 400;
    const letterSpacing = num('letter-spacing', 0);
    return { fontSize, lineHeight, fontWeight, letterSpacing };
  }

  // ---- questions the reader raises: font, breakpoints, Stand-ins, routes ----
  if (fonts.length || doc.fonts.length) {
    const families = Object.values(foundations.textStyles).map(s => s.fontFamily);
    const common = families.sort((a, b) => families.filter(x => x === b).length - families.filter(x => x === a).length || (a < b ? -1 : 1))[0];
    const bind = Object.values(foundations.textStyles).find(s => s.fontFamily === common)?.binds?.fontFamily;
    const sets = [
      ...(fonts.length ? [`sets font-family ${[...new Set(fonts.map(f => f.value))].join('; ')} (${[...new Set(fonts.map(f => f.at))].join(', ')})`] : []),
      ...(doc.fonts.length ? [`loads ${doc.fonts.map(f => `${f.name} from ${f.module} (${at(f.offset)})`).join(', ')}`] : []),
    ];
    question({
      id: 'q-font', kind: 'font', to: 'owner',
      text: `The Prototype ${sets.join(' and ')}; the Text Styles use ${common}${bind ? ` (${bind})` : ''}. Use ${common}?`,
    });
  }
  const medias = [...new Set(rules.filter(r => r.media).map(r => r.media))];
  for (const m of medias) {
    const sel = rules.filter(r => r.media === m).map(r => r.selector);
    // A runtime run took a screenshot at every breakpoint: say where the query applies in them (#146).
    const seen = rt.reason ? null : breakpointsSeen(m, breakpoints);
    question({
      id: `q-breakpoint-${kebab(m)}`, kind: 'breakpoint', to: 'owner',
      text: `@media ${m} changes ${sel.join(', ')}${seen ? `. ${seen}` : '; the static reader has no viewport'}. Which Design System breakpoint is it, and what should change there?`,
    });
  }
  const data = [];
  for (const m of sim.mocks) {
    const id = kebab(m.name.replace(/^mock/, ''));
    data.push({ id, source: 'mock', note: `\`${m.name}\` is mock data standing in for the ${id.replace(/-/g, ' ')}`, at: at(m.offset),
      question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text: `Where do the ${id.replace(/-/g, ' ')} come from? \`${m.name}\` stands in for them.` }) });
  }
  for (const f of sim.simulated) {
    const id = kebab(f.name);
    data.push({ id, source: 'simulated', note: `\`${f.name}()\` simulates its work with a ${f.delay}ms setTimeout`, at: at(f.offset),
      question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text: `What does \`${f.name}()\` call, and how does it fail? The Prototype simulates it with a timer.` }) });
  }
  // Above six routes, a Handoff is hard to review in one sitting (#62).
  if (doc.screens.length > MAX_SCREENS) question({
    id: 'q-split', kind: 'split', to: 'owner',
    text: `The Prototype has ${doc.screens.length} routes (${doc.screens.map(s => s.route).join(', ')}). Split it into smaller Handoffs, or keep one?`,
  });

  if (rt.error) question({
    id: 'q-runtime', kind: 'runtime', to: 'owner',
    text: `The runtime reader could not run the Prototype (${rt.error}), so this Handoff is static-only: no screenshots, and text metrics read from the source alone. Fix it and re-run To-handoff?`,
  });
  for (const f of rt.failed || []) question({
    id: `q-untagged-${kebab(f.file)}`, kind: 'runtime', to: 'developer',
    text: `${f.file} does not parse (${f.error}), so the runtime copy left it untagged and its elements join to their caller. Is it meant to build?`,
  });

  // ---- feature and acceptance: the owner's words, as decisions ----
  const feature = d.ask('feature', {
    kind: 'feature', question: `What is "${title}" for? Answer {owner, goal, scope: [..], nonGoals: [..]}.`, candidates: [],
  }, a => (a && typeof a.goal === 'string' && a.goal ? null : 'a feature answer needs a goal'));
  const screenList = screenIds.map(s => `"${s}"`).join(' | ');
  const acceptance = d.ask('acceptance', {
    kind: 'acceptance', question: `Acceptance criteria for ${screenIds.join(', ')}: [{id, screen, state, given, when, then}], one per state at least.`, candidates: STANDARD_STATES.filter(s => allPresent.has(s)),
  }, a => (Array.isArray(a) && a.length && a.every(x => x.id && screenIds.includes(x.screen) && STANDARD_STATES.includes(x.state) && x.given && x.when && x.then) ? null
    : `acceptance is a non-empty list of {id, screen: ${screenList}, state, given, when, then}`));

  // ---- the owner's answers to questions and own acceptance criteria, by question and acceptance id ----
  const criteria = acceptance ? acceptance.map(a => ({ id: a.id, screen: a.screen, state: a.state, given: a.given, when: a.when, then: a.then, by: d.isOwner('acceptance') ? 'owner' : 'agent' })) : [];
  const openQuestions = questions.map(q => ({ ...q, answer: null }));
  for (const key of d.unreached()) {
    const answer = d.ownerOf(key);
    if (key.startsWith('question:')) {
      const q = openQuestions.find(x => x.id === key.slice(9));
      if (!q) { d.drop(key, 'no such question in this run'); continue; }
      const ok = answer && (typeof answer.answer === 'string' && answer.answer.trim() || answer.to === 'developer' || answer.to === 'owner');
      if (!ok) throw new Error(`owner decision "${key}": an answer is {by: "owner", answer: "<text>"} or {by: "owner", to: "developer"}`);
      if (answer.answer !== undefined) q.answer = answer.answer;
      if (answer.to) q.to = answer.to;
      q.by = 'owner';
      d.use(key);
    } else if (key.startsWith('acceptance:')) {
      const id = key.slice(11);
      const a = answer || {};
      const screen = a.screen === undefined && !multi ? screenIds[0] : a.screen;
      if (!(STANDARD_STATES.includes(a.state) && screenIds.includes(screen) && a.given && a.when && a.then)) throw new Error(`owner decision "${key}": an acceptance criterion is {${multi ? 'screen, ' : ''}state, given, when, then}`);
      const item = { id, screen, state: a.state, given: a.given, when: a.when, then: a.then, by: 'owner' };
      const i = criteria.findIndex(x => x.id === id);
      if (i >= 0) criteria[i] = item; else criteria.push(item);
      d.use(key);
    } else d.drop(key, 'its key no longer exists');
  }

  if (d.requests.length) return { requests: d.requests, dropped: d.dropped, handoff: undefined, path: null, wrote: false };

  // A mid-run draft that passed joins contracts/ as the Adapter wrote it, once per family; it never replaces one.
  for (const [family, r] of [...drafts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!r || !r.write) continue;
    mkdirSync(join(designSystem, 'contracts'), { recursive: true });
    writeFileSync(join(designSystem, 'contracts', `${family}.component.json`), r.text);
  }

  // ---- source pins ----
  const files = prototypeFiles(prototype, doc.files);
  const contracts = {};
  for (const k of [...usedContracts].sort()) contracts[k] = { snapshotId: system.contracts[k].source.snapshotId, contentHash: contractHash(system.contracts[k]) };
  const proposals = {};
  for (const k of [...usedProposals].sort()) proposals[k] = proposalContentHash(system.proposals[k]);

  const handoff = {
    schemaVersion: 1,
    revision: 1,
    status: 'pending',
    approval: null,
    feature: { key: featureKey, name: title, ...(feature.owner ? { owner: feature.owner } : {}), goal: feature.goal, ...(feature.scope ? { scope: feature.scope } : {}), ...(feature.nonGoals ? { nonGoals: feature.nonGoals } : {}) },
    source: {
      input: 'prototype',
      kind: doc.kind,
      prototype: { files, snapshotId: snapshotIdOf(files) },
      designSystem: system.key,
      contracts,
      proposals,
      foundations: { documentHash: fileHash(system.foundationsText), usedHash: null },
      modes: { [PROTOTYPE_MODE]: mode },
      notes,
      ...(doc.ignored.length ? { ignored: doc.ignored } : {}),
    },
    screens,
    copy,
    values,
    acceptance: criteria,
    openQuestions,
    flow,
    data,
    ownerDecisions: Object.fromEntries([...d.used.keys()].sort().map(k => [k, d.used.get(k)])),
  };
  handoff.source.foundations.usedHash = usedHash(handoff, foundations);
  const result = { ...store(handoff, dir), dropped: d.dropped };
  for (const { shots } of Object.values(rt.screens)) writeShots(shots, join(dirname(result.path), 'screens'), result.wrote);
  return result;
}

/**
 * The Prototype as one shape for either reader: {kind, title, files, at, rules, standIns, fonts, ignored,
 * screens: [{id, name, route, offset, root, mount}]}. A single HTML file is one screen named by its title.
 */
function readPrototype(prototype, { depsDir, packages }) {
  if (!/\.html?$/i.test(prototype)) return readReact(prototype, { depsDir, packages });
  const rel = basename(prototype);
  const doc = readHtml(prototype, rel, { depsDir });
  const title = doc.title || rel.replace(/\.html?$/, '');
  const mount = doc.mounts[0] || findTag(doc.root, 'body');
  return {
    kind: 'html-file', title, files: [rel], at: doc.at, rules: doc.rules, standIns: standIns(doc.scripts), fonts: [], ignored: [],
    screens: [{ id: kebab(title), name: title, route: '/', offset: mount.offset, root: doc.root, mount }],
  };
}

/**
 * A Design System import's tuple (#62): per axis but State, the value whose `code` its props carry, most
 * keys winning (`size="lg" isExpressive` is lg-expressive). An axis prop that maps to no value is `unmapped`; a
 * styling prop no axis or property names is `stray`.
 */
function importTuple(def, el) {
  const tuple = {}, unmapped = [];
  const stateAxis = stateAxisOf(def);
  const given = k => (el.attrs[k] === '' ? true : el.attrs[k]);
  for (const axis of def.axes) {
    if (axis === stateAxis) continue;
    const fits = axis.values.filter(v => v.code && Object.keys(v.code).length && Object.entries(v.code).every(([k, x]) => given(k) === x));
    const pick = fits.sort((a, b) => Object.keys(b.code).length - Object.keys(a.code).length)[0];
    if (pick) { tuple[axis.key] = pick.key; continue; }
    for (const k of new Set(axis.values.flatMap(v => Object.keys(v.code || {})))) if (el.attrs[k] !== undefined && !unmapped.includes(k)) unmapped.push(k);
  }
  // Any other prop that styles: not an axis value's, not a property's, not content or behaviour.
  const known = new Set([...def.axes.flatMap(a => a.values.flatMap(v => Object.keys((v && v.code) || {}))), ...(def.properties || []).map(p => p.code && p.code.prop).filter(Boolean)]);
  const stray = Object.keys(el.attrs).filter(k => !known.has(k) && !CONTENT_PROPS.test(k) && !/^(children|key|ref|style|on[A-Z]\w*)$/.test(k)).sort();
  return { tuple, unmapped, stray };
}

const propText = v => (typeof v === 'string' ? JSON.stringify(v) : `{${(v.parts || []).map(p => p.expr || p).join('')}}`);

// ---------- media queries at the breakpoints ----------

const listOf = (xs, word) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}` : xs[0]);
const widthOf = b => `${b.key} (${b.width}px)`;

/**
 * What the screenshots show of a media query: the breakpoints it applies at and, for one width threshold, the two it
 * falls between. A query that tests more than px min-/max-width names the breakpoints the screenshots were taken at.
 */
function breakpointsSeen(media, breakpoints) {
  const tests = [];
  for (const part of media.split(/\s+and\s+/i).map(p => p.trim())) {
    if (/^(only\s+)?(screen|all)$/i.test(part)) continue;
    const t = /^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(part);
    if (!t) return `The screenshots were taken at ${listOf(breakpoints.map(widthOf), 'and')}`;
    tests.push({ min: t[1].toLowerCase() === 'min', px: Number(t[2]) });
  }
  const applies = b => tests.every(t => (t.min ? b.width >= t.px : b.width <= t.px));
  const on = breakpoints.filter(applies), off = breakpoints.filter(b => !applies(b));
  const where = !off.length ? `it applies at every breakpoint (${listOf(on.map(widthOf), 'and')})`
    : !on.length ? `it applies at none of ${listOf(off.map(widthOf), 'or')}`
    : `it applies at ${listOf(on.map(widthOf), 'and')}, not at ${listOf(off.map(widthOf), 'or')}`;
  if (tests.length !== 1) return `In the screenshots ${where}`;
  const { px } = tests[0];
  const below = breakpoints.filter(b => b.width < px).pop(), above = breakpoints.find(b => b.width > px);
  const between = breakpoints.some(b => b.width === px) ? `${px}px is ${breakpoints.find(b => b.width === px).key}'s width`
    : below && above ? `${px}px falls between ${below.key} and ${above.key}`
    : above ? `${px}px is below ${above.key}` : `${px}px is above ${below.key}`;
  return `In the screenshots ${where}; ${between}`;
}

// ---------- the runtime reader's results ----------

/**
 * Run the runtime reader and keep what generate needs: {screens: {<screen>: {elements, shots}}, failed}, with each
 * screenshot read into memory ({name, png}) and the scratch run removed. When it cannot run: {screens: {}, error, reason}.
 */
async function runtimeRead(options) {
  const fail = error => ({ screens: {}, error, reason: `static-only: the runtime reader failed: ${error}` });
  if (!hasRuntime(options.depsDir)) return fail('the runtime packages or a browser are missing; run node skills/to-handoff/scripts/deps.mjs');
  let r;
  try { r = await run(options); } catch (e) { return fail(e.message); }
  try {
    const screens = {};
    for (const [id, read] of Object.entries(r.screens)) {
      const shots = {};
      for (const [state, byBp] of Object.entries(read.shots)) {
        shots[state] = {};
        for (const [bp, shot] of Object.entries(byBp)) shots[state][bp] = typeof shot === 'string' ? { name: basename(shot), png: readFileSync(shot) } : shot;
      }
      screens[id] = { elements: read.elements, shots };
    }
    return { screens, failed: r.failed };
  } finally {
    r.cleanup();
  }
}

// Computed text metrics, in the matcher's units: px, unitless weight, `normal` line height as null.
function liveMetrics(cs) {
  const px = v => (/^-?\d*\.?\d+px$/.test(v) ? Math.round(parseFloat(v) * 100) / 100 : null);
  return {
    fontSize: px(cs['font-size']),
    lineHeight: cs['line-height'] === 'normal' ? null : px(cs['line-height']),
    fontWeight: Number(cs['font-weight']),
    letterSpacing: cs['letter-spacing'] === 'normal' ? 0 : px(cs['letter-spacing']) ?? 0,
  };
}

// The screenshots next to handoff.json, as screens/<screen>.<state>.<breakpoint>.png: rewritten with the Handoff,
// else only where one is absent, so an unchanged Handoff keeps its screenshots byte for byte.
function writeShots(shots, dir, wrote) {
  for (const byBp of Object.values(shots)) for (const shot of Object.values(byBp)) {
    if (!shot.png) continue;
    const file = join(dir, shot.name);
    if (!wrote && existsSync(file)) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, shot.png);
  }
}

function checkReach(answer) {
  if (!answer || typeof answer !== 'object') return 'an answer is {steps: [..]} or {unreachable: reason}';
  if (answer.unreachable !== undefined) return typeof answer.unreachable === 'string' && answer.unreachable ? null : 'unreachable needs a reason';
  if (!Array.isArray(answer.steps)) return 'an answer is {steps: [..]} or {unreachable: reason}';
  for (const step of answer.steps) {
    const keys = step && typeof step === 'object' ? Object.keys(step).filter(k => STEP_KINDS.includes(k)) : [];
    if (keys.length !== 1) return `${JSON.stringify(step)} is not one of {fill, value} | {click} | {clock: ms} | {expect}`;
    if (keys[0] === 'clock' ? !(Number.isFinite(step.clock) && step.clock >= 0) : typeof step[keys[0]] !== 'string') return `${JSON.stringify(step)} has a bad ${keys[0]}`;
    if (keys[0] === 'fill' && step.value === undefined) return `${JSON.stringify(step)} needs a value`;
  }
  return null;
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
