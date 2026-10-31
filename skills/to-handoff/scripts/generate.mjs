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
import { basename, dirname, join } from 'node:path';
import { convert, deltaE } from '../../contract/scripts/color.mjs';
import { contentHash as contractHash, proposalContentHash, resolve } from '../../contract/scripts/contract.mjs';
import { computed, splitWords } from './css.mjs';
import { fileHash, handoffContentHash, prototypeFiles, snapshotIdOf, usedHash } from './hash.mjs';
import { COLOR_ROLES, collectionOf, colorText, followCustom, matchComputed, matchDeclaration, matchText, referenceOf, roleOf, sameHex, valueIn } from './match.mjs';
import { loadDesignSystem, stateAxisOf } from './system.mjs';
import { hasRuntime } from './deps.mjs';
import { featureOf, kebab } from './feature-key.mjs';
import { readHtml, walk } from './reader.mjs';
import { readReact } from './react.mjs';
import { STEP_KINDS, run } from './runtime.mjs';
import {
  STANDARD_STATES, atomIn, evaluate, isPlaceholderText, ownDeclarations, parseCondition, standIns, stateOfAtom,
} from './recognise.mjs';
import { procedureFor, recogniseUsages } from './usages.mjs';
import { familySites } from '../../vibe-to-figma/scripts/extract.mjs';

const PROTOTYPE_MODE = 'light';
const LANDMARKS = { header: 'banner', nav: 'navigation', main: 'main', aside: 'complementary', footer: 'contentinfo' };
const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'search', 'form']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Without breakpoints from the Adapter, the runtime reader screenshots one desktop width.
const DEFAULT_BREAKPOINTS = [{ key: 'desktop', width: 1280 }];
// Above this many routes, To-handoff asks whether to split the Prototype (#62).
const MAX_SCREENS = 6;

export { fileHash, handoffContentHash, snapshotIdOf };

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

/** A reader condition's tree: an el.cond entry's {expr} or a ternary's {cond}, as the React reader's AST when it gives one. */
const conditionTree = c => c.ast || parseCondition(c.expr !== undefined ? c.expr : c.cond);

/** The display text of reader parts in `state`: a dynamic value shows as `{expr}` without its first segment. */
function textOf(parts, valueOf) {
  const show = expr => `{${expr.replace(/^[A-Za-z_$][\w$]*\./, '')}}`;
  const branch = b => (b.text !== undefined ? b.text : b.expr !== undefined ? show(b.expr) : '');
  return parts.map(p => {
    if (typeof p === 'string') return p;
    if (p.ternary) return branch(evaluate(conditionTree(p.ternary), valueOf) ? p.ternary.then : p.ternary.else);
    if (p.text !== undefined) return p.text;
    if (p.markup) return '';
    return show(p.expr);
  }).join('').replace(/\s+/g, ' ').trim();
}

/** The first three words of display text as an id, its `{expr}` values left out: `{n} funds to sell now` -> funds-to-sell. */
function firstWords(text) {
  let s = text, was;
  do { was = s; s = s.replace(/\{[^{}]*\}/g, ' '); } while (s !== was);
  return kebab(s.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).slice(0, 3).join(' '));
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
 * scratch copy for screenshots, computed text metrics and a React Prototype's computed colours (#284); when it
 * cannot run, the Handoff is static-only and says why.
 */
export async function generate({ prototype, designSystem, decisions = {}, depsDir, runtime = false } = {}) {
  const system = await loadDesignSystem(designSystem);
  const { foundations, adapter } = system;
  // A Design System package import is recognised by import (#62): the packages its Contracts name.
  const packages = [...new Set(Object.values(system.contracts).map(c => c.code && c.code.package).filter(Boolean))].sort();
  // The feature key is To-handoff's and the check's one function (#431), so the two can't name a Handoff apart.
  const { name: title, key: featureKey } = featureOf(prototype);
  const doc = readPrototype(prototype, { depsDir, packages, title });
  const { at, rules } = doc;
  // An Extracted Library's Family map (#265, ADR 0016): read when the files its sites name are this Prototype's, and then
  // each site, found where it is in the code now, is a Usage of its family's Contract. A map naming none of them is
  // another Prototype's and is not read; one naming some is refused, as a map the code no longer gives.
  const mapped = system.familyMap && !/\.html?$/i.test(prototype) ? Object.values(system.familyMap.map.families || {}).flatMap(f => f.sites || []) : [];
  const mapFiles = [...new Set(mapped.map(s => s.file))];
  const missing = mapFiles.filter(f => !existsSync(join(prototype, f)));
  const readsMap = missing.length < mapFiles.length;
  if (readsMap && missing.length) throw new Error(`the Family map names ${missing.join(', ')}, which ${prototype} does not have: run Vibe-to-Figma's folder step again (node skills/vibe-to-figma/scripts/folder.mjs ${prototype}), or name a Design System that is not another Prototype's own folder`);
  const sites = new Map(readsMap ? familySites({ project: prototype, map: system.familyMap.map }).map(s => [`${s.file}:${s.line}:${s.col}`, s]) : []);
  const siteOf = el => sites.get(at(el.offset));
  const screenIds = doc.screens.map(s => s.id);
  const multi = doc.screens.length > 1;
  const dir = join(designSystem, 'handoffs', featureKey);
  const stored = existsSync(join(dir, 'handoff.json')) ? JSON.parse(readFileSync(join(dir, 'handoff.json'), 'utf8')) : null;
  const d = decider(decisions, (stored && stored.ownerDecisions) || {});
  const cache = new Map();
  const style = el => computed(rules, el, cache);
  // In a Tailwind Prototype a utility class names nothing (#216): only a class an authored rule selects names its element.
  const authored = new Set(rules.flatMap(r => r.parsed.parts.flatMap(p => p.compound.classes)));
  const namingClass = el => el.classes.find(c => !doc.tailwind || authored.has(c));
  const firstClass = el => { const c = namingClass(el); return c ? `.${c}` : el.tag; };
  // An element's own name for an id: its id attribute, else its first naming class.
  const nameOf = el => (typeof el.attrs.id === 'string' ? el.attrs.id : namingClass(el)) || null;
  const theme = collectionOf(foundations, Object.values(foundations.collections).find(c => !c.hidden && c.modes.length > 1).modes[0].key);

  // Custom properties the Prototype defines on :root, for references such as var(--border).
  const custom = {};
  for (const r of rules) if (!r.media && /^(:root|html)$/.test(r.selector)) for (const x of r.decls) if (x.property.startsWith('--')) custom[x.property] = x.value;

  // ---- the mode (#61, #228): a theme wrapper's named mode, else the page and first container surfaces against the Adapter's surface tokens ----
  const body = findTag(doc.screens[0].root, 'body');
  const mount = doc.screens[0].mount || body;
  const bg = el => { const v = style(el)['background-color']; if (!v || !v.own) return null; try { const c = convert(followCustom(v.value, custom)); return c.alpha > 0 ? c.hex : null; } catch { return null; } };
  let container = null;
  walk(mount, el => { if (!container && el !== mount && el.children.filter(c => c.type === 'element').length >= 2 && bg(el)) container = el; });
  const pageHex = bg(body) || bg(mount) || '#ffffff';
  // A surface token the Foundations document lacks is not compared: an Extracted Library's colours may all stay raws (#265).
  const surfaceTokens = Object.values(adapter.surfaces).filter(k => foundations.variables[k]);
  const scores = theme.modes.map(m => {
    const against = (hex, k) => (hex && foundations.variables[k] ? deltaE(hex, convert(valueIn(foundations.variables[k], m.key)).hex) : 0);
    const score = against(pageHex, adapter.surfaces.page) + (container ? against(bg(container), adapter.surfaces.layer) : 0);
    return { mode: m, score: Math.round(score * 10000) / 10000 };
  });
  const surfaceBest = scores.slice().sort((a, b) => a.score - b.score || theme.modes.indexOf(a.mode) - theme.modes.indexOf(b.mode))[0].mode;
  const surfaceNote = !surfaceTokens.length
    ? `Single-mode Prototype: ${system.key} has none of the surface tokens (${Object.values(adapter.surfaces).join(', ')}) to compare its page with, so it reads as ${surfaceBest.label}. The other ${theme.name} modes render unverified.`
    : `Single-mode Prototype: its page surface (${pageHex})${container ? ` and first container (${firstClass(container)} ${bg(container)})` : ''} map best to ${surfaceBest.label} `
    + `(${scores.map(s => `${s.mode.label} ΔE ${s.score}`).join(', ')}). The other ${theme.name} modes render unverified.`;
  // A Code Library's theme wrapper that names a mode is the mode (#228); the surfaces above are the fallback. The first wrapper in
  // reading order decides: a Prototype has one mode, so a nested or later wrapper is not read.
  const wrapper = adapter.themeWrapper;
  let wrapped = null;
  if (wrapper) for (const screen of doc.screens) walk(screen.root, el => { if (!wrapped && el.component && el.component.kind === 'ds' && el.component.export === wrapper.component && wrapper.prop in el.attrs) wrapped = el; });
  const value = wrapped && wrapped.attrs[wrapper.prop];
  const named = typeof value === 'string' && Object.hasOwn(wrapper.modes, value) ? wrapper.modes[value] : undefined;
  const wrappedMode = theme.modes.find(m => m.key === named);
  const best = wrappedMode || surfaceBest;
  const mode = best.key;
  const ctx = { system, mode, custom };
  const notes = [{
    level: 'info',
    text: wrappedMode
      ? `\`<${wrapper.component} ${wrapper.prop}="${value}">\` (${at(wrapped.offset)}) sets the Prototype's mode to ${best.label}; the page surfaces are not compared. The other ${theme.name} modes render unverified.`
      : surfaceNote,
  }, ...doc.notes];
  // A wrapper whose value the Adapter has no mode for, or that is not a literal, is the owner's question: the surfaces stand in.
  const wrapperQuestion = wrapped && !wrappedMode ? {
    id: 'q-mode-theme', kind: 'mode-map', to: 'owner',
    text: `\`<${wrapper.component}>\` (${at(wrapped.offset)}) sets ${typeof value === 'string' ? `${wrapper.prop}="${value}"` : `a ${wrapper.prop} that is not a literal`}, `
      + `which is not one of ${system.key}'s ${Object.keys(wrapper.modes).join(', ')}. Which ${theme.name} mode is the Prototype in? The surfaces stand in (${surfaceBest.label}) until you answer.`,
  } : null;
  if (wrapperQuestion) notes.push({ level: 'info', text: surfaceNote });

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
  if (wrapperQuestion) question(wrapperQuestion);
  const usedContracts = new Set(), usedProposals = new Set();
  const values = [];
  const fonts = [];
  const sim = doc.standIns;
  const simulatedBy = f => (f.kind === 'state' ? `the ${f.name} timer` : f.kind === 'timer' ? f.name : `${f.name}()`);
  const flow = [];
  // Mid-run drafts (#90, #115) by family, carried from screen to screen: usages.mjs resolves them; generate notes
  // each one that passed and writes it into contracts/ once nothing is open. A drafted Contract is read from here.
  let drafts = new Map();
  const contractOf = k => system.contracts[k] || drafts.get(k).contract;

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
    // Each atom with its source sites (#213): the React reader's atom offsets, else where the condition first shows.
    const sites = new Map();
    const firstShown = new Map();
    const add = (c, offset) => {
      if (!firstShown.has(c)) firstShown.set(c, offset);
      const visit = n => {
        if (n.atom === undefined) return (n.not ? [n.not] : n.or || n.and).forEach(visit);
        if (!sites.has(n.atom)) sites.set(n.atom, new Set());
        sites.get(n.atom).add(at(n.offset !== undefined ? n.offset : firstShown.get(c)));
      };
      visit(conditionTree(c));
    };
    walk(screen.root, el => {
      for (const c of el.cond) add(c, el.offset);
      for (const h of el.attrHoles) if (h.ternary) add(h.ternary, h.offset);
      for (const t of textNodes(el)) for (const p of t.parts) if (p && p.ternary) add(p.ternary, t.offset);
    });
    const atoms = [...sites.keys()];
    const defaults = {};
    for (const atom of atoms.filter(a => !stateOfAtom(a))) {
      const answer = d.ask(`condition:${atom}`, {
        kind: 'condition', question: `Is \`${atom}\` true or false when the screen first shows?`, candidates: [false, true], evidence: { at: [...sites.get(atom)] },
      }, a => (typeof a === 'boolean' ? null : `${JSON.stringify(a)} is not true or false`));
      defaults[atom] = Boolean(answer);
    }
    const stateAtoms = s => atoms.filter(a => stateOfAtom(a) === s);
    const present = STANDARD_STATES.filter(s => s === 'default' || stateAtoms(s).length);
    for (const s of present) allPresent.add(s);
    const atomsIn = s => atomIn(s, defaults);
    const shownIn = el => {
      if (!el.cond.length) return null;
      const ins = present.filter(s => el.cond.every(c => evaluate(conditionTree(c), atomsIn(s)) === c.value));
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
    // A React Prototype's runtime run paints its regions from the computed colours (#284); an HTML Prototype, and an
    // element the run did not render, keep the source declarations.
    const paintsLive = runtime && !/\.html?$/i.test(prototype);
    // The built stylesheet's custom properties stand in for the source's: the built theme is the one that rendered.
    const liveCtx = { ...ctx, custom: rt.custom || {} };
    const declarationsOf = el => {
      const own = ownDeclarations(rules, el);
      const paint = paintsLive && live(el) && live(el).paint;
      return paint ? [...own.filter(x => !COLOR_ROLES.has(roleOf(x.property))), ...paintDeclarations(paint, el.offset, liveCtx)] : own;
    };

    const usageStates = Object.fromEntries(present.map(s => [s, {}]));

    // ---- recognition (usages.mjs): one record per Usage, and what each element is to its region ----
    const describe = el => ({ text: elementText(el, atomsIn('default')), at: at(el.offset), ...(live(el) ? { rendered: `${live(el).rect.width}x${live(el).rect.height}px` } : {}) });
    const { recognised, claimOf, drafts: now } = recogniseUsages({ root: screen.root, system, rules, decider: d, describe, drafts, siteOf });
    for (const [family, r] of now) {
      if (drafts.has(family) || !r || !r.contract || r.contract.selection.status !== 'draft') continue;
      notes.push({
        level: 'info',
        text: `\`${family}\` is a Contract the Adapter wrote mid-run at status draft (${Object.keys(r.contract.drafted || {}).length} Drafted values); its check passed. `
          + 'The owner approves it through To-design\'s base loop; this Handoff\'s sign-off does not.',
      });
    }
    drafts = now;

    const labelFor = id => { let found = null; walk(screen.root, x => { if (!found && x.tag === 'label' && x.attrs.for === id) found = x; }); return found; };
    const usages = new Map();
    for (const { el, cand, answer, key, byImport, byMap, unmapped = [], stray = [], within, parts } of recognised) {
      const id = uniqueId(usageIds, kebab(nameOf(el) || el.tag));
      const u = { id };
      const states = shownIn(el);
      if (!answer) { usages.set(el, u); continue; }
      if (answer.contract || answer.proposal) {
        const def = answer.contract ? contractOf(answer.contract) : system.proposals[answer.proposal];
        if (answer.contract) { u.contract = answer.contract; usedContracts.add(answer.contract); }
        else { u.proposal = answer.proposal; usedProposals.add(answer.proposal); }
        u.tuple = { ...answer.tuple };
        Object.assign(u, contentOf(def, el, cand, id, parts));
        // A Family map site's switched axes are the values its className ternary picks between (#265).
        u.match = byImport ? { by: 'import' }
          : byMap ? { by: 'family-map', ...(Object.keys(byMap.switches).length ? { switches: byMap.switches } : {}) }
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
        // A className on a container's part is styling its Contract does not carry: off-axis, with a question (#194).
        const styled = (parts || []).filter(x => typeof x.attrs.class === 'string');
        if (styled.length) {
          const qid = `q-prop-${id}`, why = `is no ${answer.contract} axis or property`;
          u.offAxis = [...(u.offAxis || []), ...styled.map(x => ({ property: `${x.component.export}.className`, raw: propText(x.attrs.class), reason: `${x.component.export} className ${why}`, question: qid }))];
          u.question = question({
            id: qid, kind: 'prop', to: 'owner',
            text: `${styled.map(x => `\`${x.tag}\` at ${at(x.offset)} sets className=${propText(x.attrs.class)}, which ${why}`).join('; ')}. Which value is it, or does the Contract need it?`,
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
            text: `\`${cand.sig}\` is ${/^[aeiou]/i.test(answer.noContract) ? 'an' : 'a'} ${answer.noContract} with no Contract in ${system.key} yet${answer.failed ? `, and the Adapter could not write one mid-run: ${answer.failed}` : ''}. ${procedureFor(adapter, answer.noContract)}, then re-run To-handoff.`,
          });
        }
      }
      if (within) u.in = usages.get(within).id;
      if (states) u.states = states;
      u.at = at(el.offset);
      usages.set(el, u);
    }

    function contentOf(def, el, cand, id, parts) {
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
        } else if (c.child) {
          // The text of a child component the usage writes (<AlertTitle>), or one of its props (SelectValue's placeholder), at any depth (#166).
          // A container reads only its own parts: a nested usage's text never moves up to it (#194).
          let kid = null;
          if (parts) kid = parts.find(x => x.component.export === c.child) || null;
          else walk(el, x => { if (!kid && x !== el && x.type === 'element' && (x.tag === c.child || (x.component && x.component.export === c.child))) kid = x; });
          if (kid && c.childProp && typeof kid.attrs[c.childProp] === 'string') props[p.key] = addCopy(`${id}-${kebab(p.key)}`, kid.attrs[c.childProp], kid.offset);
          else if (kid && !c.childProp && textNodes(kid).length) props[p.key] = addCopy(`${id}-${kebab(p.key)}`, elementText(kid, atomsIn('default')), textNodes(kid)[0].offset);
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
          const branch = evaluate(conditionTree(h.ternary), atomsIn(s)) ? h.ternary.then : h.ternary.else;
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
    for (; i < kids.length; i++) groups.push({ id: kebab(nameOf(kids[i]) || kids[i].tag), els: [kids[i]] });

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
      else for (const root of g.els) walk(root, el => { if (claimOf(el).claim !== 'consumed') elements.push(el); });
      for (const el of elements) {
        const { claim } = claimOf(el);
        if (claim === 'wrapper') notes.push({ level: 'info', text: `Region \`${r.id}\`: \`${el.tag}\` (${el.component.module}, ${at(el.offset)}) holds other Code Library usages, so it is read as a wrapper: its parts' styles and text stay in the region, and the usages inside it are their own.` });
        if (claim === 'usage') {
          const u = usages.get(el);
          r.usages.push(u);
          // A raw usage has no Contract to carry its look: its own styles stay in the region, matched like any other.
          if (u.raw) walk(el, x => { for (const decl of declarationsOf(x)) addStyle(r, decl); });
          continue;
        }
        if (insideUsage(el)) continue;
        // A container usage's parts are its Contract's look; their className is off-axis.
        if (claim !== 'part') for (const decl of declarationsOf(el)) addStyle(r, decl);
        if (!shell) for (const t of textNodes(el)) addText(r, el, t);
      }
      return r;
    }

    // Inside a usage that consumes its subtree: a container usage leaves its subtree to the region and the usages inside it.
    function insideUsage(el) { const c = claimOf(el); return c.claim === 'consumed' && c.by === 'usage'; }

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
      // In a Tailwind Prototype, copy with no name of its own takes its component's name, else its first words (#216).
      const base = nameOf(el) || (!el.component && doc.tailwind && firstWords(text)) || el.tag;
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
      for (const a of f.before) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${simulatedBy(f)} sets ${a} (simulated)`;
      for (const a of f.after) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${simulatedBy(f)} sets ${a} after a ${f.delay}ms timer (simulated)`;
    }
    // A stub-route fetch (#341) belongs to the screen whose conditions read a state its function sets.
    const stubs = sim.stubs.filter(f => !multi || f.sets.some(v => atoms.some(a => new RegExp(`\\b${v}\\b`).test(a))));
    for (const f of stubs) {
      const by = f.name ? `${f.name}()` : 'an inline handler';
      for (const a of f.before) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${by} sets ${a} before ${f.method} ${f.route} answers (stub API)`;
      for (const a of f.after) if (stateOfAtom(a)) trigger[stateOfAtom(a)] = `${by} sets ${a} when ${f.method} ${f.route} ${stateOfAtom(a) === 'error' ? 'fails' : 'answers'} (stub API)`;
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
      if (from) flow.push({ from: stateRef('default'), trigger: simulatedBy(f), to: stateRef(from), source: 'simulated' });
      if (from && to) flow.push({ from: stateRef(from), trigger: `${f.delay}ms timer`, to: stateRef(to), source: 'simulated' });
      if (from && !present.includes('error')) flow.push({ from: stateRef(from), trigger: `${simulatedBy(f)} fails`, to: stateRef('error'), source: 'missing' });
    }
    // Two fetches of one route from one state give one row per transition.
    const transition = (from, trigger, to, source) => {
      if (!flow.some(x => x.from === stateRef(from) && x.trigger === trigger && x.to === stateRef(to))) flow.push({ from: stateRef(from), trigger, to: stateRef(to), source });
    };
    for (const f of stubs) {
      const call = `${f.method} ${f.route}`;
      const from = f.before.map(stateOfAtom).find(Boolean) || 'default', after = f.after.map(stateOfAtom);
      if (from !== 'default') transition('default', `${f.name ? `${f.name}()` : 'an inline handler'} calls ${call}`, from, 'simulated');
      if (after.includes('error')) transition(from, `${call} fails`, 'error', 'simulated');
      else if (!present.includes('error')) transition(from, `${call} fails`, 'error', 'missing');
      if (after.includes('success')) transition(from, `${call} answers ok`, 'success', 'simulated');
    }

    return { id: screenId, name: screen.name, at: at(screen.offset), breakpoints: breakpoints.map(b => b.key), regions, states: screenStates };
  }

  function addStyle(r, decl) {
    if (decl.property === 'font-family') { fonts.push({ value: decl.value, at: at(decl.offset) }); return; }
    const role = roleOf(decl.property);
    if (!role) return;
    const words = COLOR_ROLES.has(role) ? [decl.value] : splitWords(decl.value);
    for (const raw of words) {
      const { paint } = decl;
      const result = paint
        ? matchComputed({ property: decl.property, value: paint.value, ref: paint.ref }, paint.ctx)
        : matchDeclaration({ property: decl.property, value: raw }, ctx);
      if (result.kind === 'skip') continue;
      const where = at(decl.offset);
      const existing = r.styles.find(s => s.property === decl.property && s.raw === raw);
      if (existing) { if (!existing.at.includes(where)) existing.at.push(where); continue; }
      const s = { property: decl.property, raw, at: [where] };
      const norm = COLOR_ROLES.has(role) ? colorText(paint ? paint.value : followCustom(raw, custom)) : raw;
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
      text: common
        ? `The Prototype ${sets.join(' and ')}; the Text Styles use ${common}${bind ? ` (${bind})` : ''}. Use ${common}?`
        : `The Prototype ${sets.join(' and ')}; ${system.key} has no Text Styles to name a font. Which font should the Text Styles use?`,
    });
  }
  const medias = [...new Set(rules.filter(r => r.media).map(r => r.media))];
  for (const m of medias) {
    const sel = rules.filter(r => r.media === m).map(r => r.selector);
    // A runtime run rendered at every breakpoint's width: say where the query applies there (#146).
    const seen = rt.reason ? null : mediaAtBreakpoints(m, breakpoints);
    question({
      id: `q-breakpoint-${kebab(m)}`, kind: 'breakpoint', to: 'owner',
      text: `@media ${m} changes ${sel.join(', ')}${seen ? `. ${seen}` : '; the static reader has no viewport'}. Which Design System breakpoint is it, and what should change there?`,
    });
  }
  // Every data id is its own (#352): a page mock and a route mock of one name are two entries, two questions.
  const data = [], dataIds = new Set();
  for (const m of sim.mocks) {
    const what = kebab(m.name.replace(/^mock/, '')), id = uniqueId(dataIds, what);
    data.push({ id, source: 'mock', note: `\`${m.name}\` is mock data standing in for the ${what.replace(/-/g, ' ')}`, at: at(m.offset),
      question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text: `Where do the ${what.replace(/-/g, ' ')} come from? \`${m.name}\` stands in for them.` }) });
  }
  for (const f of sim.simulated) {
    const id = uniqueId(dataIds, kebab(f.name));
    // A timer in a component is named for the state it fills, not the component (#230).
    const [note, text] = f.kind === 'state' ? [`\`${f.name}\` is filled by a ${f.delay}ms setTimeout`, `Where does \`${f.name}\` come from, and how does it fail? The Prototype simulates it with a timer.`]
      : f.kind === 'timer' ? [`\`${f.name}\` is a ${f.delay}ms setTimeout the Prototype simulates work with`, `What does the \`${f.name}\` timer stand in for, and how does it fail?`]
      : [`\`${f.name}()\` simulates its work with a ${f.delay}ms setTimeout`, `What does \`${f.name}()\` call, and how does it fail? The Prototype simulates it with a timer.`];
    data.push({ id, source: 'simulated', note, at: at(f.offset), question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text }) });
  }
  // A route the Prototype serves itself is a stub API (#341): the entry says what it pretends to do, never how.
  // One entry per route; an id another Stand-in has already taken gains `-api` (#352), then a number.
  const stubRoutes = new Set();
  for (const f of sim.stubs) {
    if (stubRoutes.has(f.route)) continue;
    stubRoutes.add(f.route);
    const base = kebab(f.route.replace(/^\/api\//, '')) || 'api';
    const id = uniqueId(dataIds, dataIds.has(base) ? `${base}-api` : base);
    // A failure the reader can't see (a throw, a status in a variable) is still possible: no status means no claim.
    const pretends = [f.delay ? `answers after ${f.delay}ms` : 'answers at once', ...(f.failures.length ? [`can fail with ${f.failures.join(' or ')}`] : [])].join(' and ');
    data.push({ id, source: 'simulated', note: `\`${f.method} ${f.route}\` is a stub API the Prototype serves itself (${f.file}): it ${pretends}`, at: at(f.offset),
      question: question({ id: `q-data-${id}`, kind: 'stand-in', to: 'developer', text: `What does \`${f.method} ${f.route}\` do in the real backend: what does it take and return, and how does it fail? The Prototype serves a stub for it.` }) });
  }
  // Above six routes, a Handoff is hard to review in one sitting (#62).
  if (doc.screens.length > MAX_SCREENS) question({
    id: 'q-split', kind: 'split', to: 'owner',
    text: `The Prototype has ${doc.screens.length} routes (${doc.screens.map(s => s.route).join(', ')}). Split it into smaller Handoffs, or keep one?`,
  });

  if (rt.error) question({
    id: 'q-runtime', kind: 'runtime', to: 'owner',
    text: `The runtime reader could not run the Prototype (${rt.error}), so this Handoff is static-only: no screenshots, and colours and text metrics read from the source alone. Fix it and re-run To-handoff?`,
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
  for (const k of [...usedContracts].sort()) contracts[k] = { snapshotId: contractOf(k).source.snapshotId, contentHash: contractHash(contractOf(k)) };
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
      ...(readsMap ? { familyMap: fileHash(system.familyMap.text) } : {}),
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
  const retake = !stored || stored.source?.prototype?.snapshotId !== handoff.source.prototype.snapshotId;
  const result = { ...store(handoff, dir), dropped: d.dropped };
  for (const { shots } of Object.values(rt.screens)) writeShots(shots, join(dirname(result.path), 'screens'), result.wrote && retake);
  return result;
}

/**
 * The Prototype as one shape for either reader: {kind, files, at, rules, standIns, fonts, notes, ignored,
 * screens: [{id, name, route, offset, root, mount}]}. A single HTML file is one screen named by its feature's `title`.
 */
function readPrototype(prototype, { depsDir, packages, title }) {
  if (!/\.html?$/i.test(prototype)) return readReact(prototype, { depsDir, packages });
  const rel = basename(prototype);
  const doc = readHtml(prototype, rel, { depsDir });
  const mount = doc.mounts[0] || findTag(doc.root, 'body');
  return {
    kind: 'html-file', files: [rel], at: doc.at, rules: doc.rules, standIns: standIns(doc.scripts), fonts: [], notes: [], ignored: [],
    screens: [{ id: kebab(title), name: title, route: '/', offset: mount.offset, root: doc.root, mount }],
  };
}

// A prop's source text: a string as JSON, one hole as {expr}, holes among text as the template literal they read from.
const propText = v => {
  if (typeof v === 'string') return JSON.stringify(v);
  const parts = v.parts || [];
  if (parts.length === 1 && typeof parts[0] !== 'string') return `{${parts[0].expr}}`;
  return `{\`${parts.map(p => (typeof p === 'string' ? p : `\${${p.expr}}`)).join('')}\`}`;
};

// ---------- media queries at the breakpoints ----------

const listOf = (xs, word) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}` : xs[0]);
const labelOf = b => `${b.key} (${b.width}px)`;

/**
 * What the screenshots show of a media query: the breakpoints it applies at and, for one width threshold, the two it
 * falls between. A query that tests more than px min-/max-width names the breakpoints the screenshots were taken at.
 */
export function mediaAtBreakpoints(media, breakpoints) {
  const tests = [];
  for (const part of media.split(/\s+and\s+/i).map(p => p.trim())) {
    if (/^(only\s+)?(screen|all)$/i.test(part)) continue;
    const t = /^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(part);
    if (!t) return `The screenshots were taken at ${listOf(breakpoints.map(labelOf), 'and')}`;
    tests.push({ min: t[1].toLowerCase() === 'min', px: Number(t[2]) });
  }
  const applies = b => tests.every(t => (t.min ? b.width >= t.px : b.width <= t.px));
  const on = breakpoints.filter(applies), off = breakpoints.filter(b => !applies(b));
  const where = !off.length ? 'it applies at every breakpoint'
    : !on.length ? `it applies at none of ${listOf(off.map(labelOf), 'or')}`
    : `it applies at ${listOf(on.map(labelOf), 'and')}, not at ${listOf(off.map(labelOf), 'or')}`;
  if (tests.length !== 1) return `In the screenshots ${where}`;
  const { px } = tests[0];
  const exact = breakpoints.find(b => b.width === px), below = breakpoints.filter(b => b.width < px).pop(), above = breakpoints.find(b => b.width > px);
  const between = exact ? `${px}px is ${exact.key}'s width`
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
      screens[id] = { elements: read.elements, shots, custom: read.custom };
    }
    return { screens, failed: r.failed };
  } finally {
    r.cleanup();
  }
}

// One element's computed paint as declarations for addStyle (#284): `value` is the declared var() that gives the
// colour (referenceOf), else the computed colour, and `paint` carries what matchComputed reads. Four equal
// border sides are one `border-color`.
function paintDeclarations(paint, offset, ctx) {
  const decls = Object.entries(paint).map(([property, { value, refs }]) => {
    const ref = referenceOf(value, refs);
    return { property, value: ref || colorText(value), offset, paint: { value, ref, ctx } };
  });
  const sides = decls.filter(x => /^border-\w+-color$/.test(x.property));
  if (sides.length < 4 || sides.some(x => x.value !== sides[0].value || x.paint.value !== sides[0].paint.value)) return decls;
  return decls.flatMap(x => (x === sides[0] ? [{ ...x, property: 'border-color' }] : sides.includes(x) ? [] : [x]));
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

// The screenshots next to handoff.json, as screens/<screen>.<state>.<breakpoint>.png: retaken when a rewritten
// Handoff pins a changed Prototype, else written only where one is absent. Two renders of the same page differ by
// a few anti-aliased pixels, so a Handoff rewritten for any other reason keeps its screenshots byte for byte.
function writeShots(shots, dir, retake) {
  for (const byBp of Object.values(shots)) for (const shot of Object.values(byBp)) {
    if (!shot.png) continue;
    const file = join(dir, shot.name);
    if (!retake && existsSync(file)) continue;
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

function landmarkOf(el) {
  if (typeof el.attrs.role === 'string' && LANDMARK_ROLES.has(el.attrs.role)) return el.attrs.role;
  return LANDMARKS[el.tag] || null;
}
function findTag(root, tag) { let found = null; walk(root, e => { if (!found && e.tag === tag) found = e; }); return found; }
