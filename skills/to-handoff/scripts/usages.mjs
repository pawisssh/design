// Usage recognition (#379): which elements of one screen are Usages, and of what. It walks the screen, tells a
// leaf from a Container and collects a Container's parts, finds a Contract by import or through the Family map (#265),
// or asks for one by signature, builds the import tuple and Slot axes, resolves mid-run drafts and sets `in`. Building
// each Usage from its record (copy, off-axis values, states and questions) stays in generate.mjs. The part rules stay
// here, not in the Adapter (ADR 0020).
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { contentHash } from '../../contract/scripts/contract.mjs';
import { selectorMatches } from './css.mjs';
import { walk } from './reader.mjs';
import { REPO_ROOT, stateAxisOf } from './system.mjs';

// ---------- usage candidates ----------

const SEMANTIC = new Set(['button', 'input', 'select', 'textarea']);
const ROLES = new Set(['status', 'alert', 'alertdialog', 'dialog', 'tab', 'tablist', 'switch', 'checkbox', 'radio', 'menu', 'menuitem', 'progressbar', 'tooltip', 'navigation', 'search']);

/** The stable signature of an element: tag, sorted classes (a template literal's static ones, #216), then [type] and [role]. */
function signature(el) {
  const classes = [...el.classes, ...(el.staticClasses || [])].sort().map(c => `.${c}`).join('');
  const type = el.tag === 'input' && typeof el.attrs.type === 'string' ? `[type=${el.attrs.type}]` : '';
  const role = typeof el.attrs.role === 'string' ? `[role=${el.attrs.role}]` : '';
  return `${el.tag}${classes}${type}${role}`;
}

// Props that carry content or behaviour, not a variant: left out of a library component's signature.
const CONTENT_PROPS = /^(class|id|href|src|alt|title|name|value|placeholder|for|type|role|target|rel|tabIndex|aria-.*|data-.*)$/;

/** A library component's signature (#62 tier 2): its name, then its sorted literal variant props, `Button[size=sm]`. */
function librarySignature(el) {
  const props = Object.keys(el.attrs).filter(k => typeof el.attrs[k] === 'string' && !CONTENT_PROPS.test(k)).sort();
  return `${el.tag}${props.map(k => (el.attrs[k] === '' ? `[${k}]` : `[${k}=${el.attrs[k]}]`)).join('')}`;
}

/**
 * Whether `el` is a usage candidate: {kind: "element"} for a semantic element or ARIA role, {kind: "group"} for an
 * element whose repeated same-tag children a descendant rule styles (`.avatars span`), else null.
 */
function candidateOf(el, rules) {
  if (SEMANTIC.has(el.tag) && !(el.tag === 'input' && el.attrs.type === 'hidden')) return { kind: 'element', sig: signature(el) };
  if (el.tag === 'a' && 'href' in el.attrs) return { kind: 'element', sig: signature(el) };
  if (typeof el.attrs.role === 'string' && ROLES.has(el.attrs.role)) return { kind: 'element', sig: signature(el) };
  const kids = el.children.filter(c => c.type === 'element');
  if (kids.length >= 2 && kids.every(k => k.tag === kids[0].tag) && !kids[0].repeat) {
    const styled = rules.some(r => !r.media && r.parsed.parts.length > 1 && r.parsed.parts[r.parsed.parts.length - 1].compound.tag === kids[0].tag
      && selectorMatches(r.parsed, kids[0]) && r.parsed.parts.slice(0, -1).some(p => p.compound.classes.some(c => el.classes.includes(c)) || (p.compound.id && p.compound.id === el.attrs.id)));
    if (styled) return { kind: 'group', sig: `${signature(el)}>${kids[0].tag}` };
  }
  return null;
}

// ---------- one screen's Usages ----------

/**
 * recogniseUsages({root, system, rules, decider, describe, drafts, siteOf}) -> {recognised, claimOf, drafts}.
 * `root` is one screen's tree; `decider` asks keyed decisions (`ask`); `describe(el)` is what generate knows of an
 * element for the `recognise:` question, {text, at, rendered}: its default-state text, its source location and its
 * runtime size when the runtime reader ran. `drafts` carries the earlier screens' mid-run drafts, by family.
 * `siteOf(el)` is the Family map's site at the element, {family, values: {<axis>: [<value>]}}, or undefined.
 *
 * `recognised` is one record per Usage, in reading order: {el, cand, answer, key, byImport, byMap, unmapped, stray,
 * within, parts}. `byMap` is {switches} for a Usage the Family map recognised. `answer` is the recognise answer (a draft
 * resolved to the Contract or raw usage it stands for), undefined while its decision is open; `within` is the Container
 * element the Usage sits in (`in`, #194); `parts` are a Container's own parts. `claimOf(el)` is what one element is to its region. `drafts` is every draft so far, by
 * family: {contract, text, write} for one that passed, {failed} for one that fell back, null while open.
 * `system.contracts` is never changed: a Contract drafted mid-run is in `drafts`.
 */
export function recogniseUsages({ root, system, rules, decider: d, describe, drafts: earlier = new Map(), siteOf = () => undefined }) {
  const { adapter, foundations } = system;
  const drafts = new Map(earlier);
  // The Contracts this run reads: the Design System's, and each one drafted mid-run so far.
  const contracts = { ...system.contracts };
  for (const [family, r] of drafts) if (r && r.contract) contracts[family] = r.contract;
  // A recognise question's candidates are the Design System's families, as they were before any draft.
  const families = [...Object.keys(system.contracts).map(k => `contract:${k}`), ...Object.keys(system.proposals).map(k => `proposal:${k}`)];

  const checkRecognise = answer => {
    if (!answer || typeof answer !== 'object') return 'an answer is {contract, tuple, via} | {proposal, tuple, via} | {raw: true, reason} | {noContract, reason}';
    if (answer.contract) {
      const c = contracts[answer.contract];
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
  const draftOf = family => {
    if (drafts.has(family)) return drafts.get(family);
    const answer = d.ask(`contract:${family}`, {
      kind: 'contract-draft', candidates: [],
      question: `\`${family}\` has no Contract in ${system.key}. ${procedureFor(adapter, family)}. Write the whole family at status draft with its Drafted values, then answer {path} with the file, or {unwritable: reason}.`,
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
        else if (existing && contentHash(existing) !== contentHash(contract)) throw new Error(`decision "contract:${family}": ${system.key} has another \`${family}\` Contract; a mid-run draft never replaces one`);
        // A re-run after the write finds the same Contract in contracts/ and keeps it, approved or not.
        else result = existing ? { contract: existing } : { contract, text, write: true };
      }
    }
    drafts.set(family, result);
    if (result && result.contract) contracts[family] = result.contract;
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
  const contractOfImport = c => Object.keys(contracts).sort().find(k => {
    const code = contracts[k].code || {};
    return code.package === c.module && code.component === c.export;
  });

  // ---- usage candidates, then each one's decision ----
  // Each consumed element and what consumed it: a leaf usage it is under, a Container part's known text child, or a
  // control's <label for>. An element under a leaf usage stays the usage's, whatever else consumes it too.
  const consumed = new Map();
  const consume = (x, by) => { if (consumed.get(x) !== 'usage') consumed.set(x, by); };
  const usageEls = new Set();
  const recognised = [];
  // A container: a Code Library component holding components that are not its parts (a Card around a form, a
  // Carbon Theme around its Buttons, #226). It is walked with its own parts, so the usages inside it are their
  // own. With a Contract it is that Contract by import, and each usage inside names it in `in` (#194); without
  // one it is a wrapper whose look stays in the region, and a note names it (#125).
  const wrappers = new Set();
  const parts = new Set();
  const holdsOtherComponent = el => { let found = false; walk(el, x => { if (x !== el && x.component && !isPart(el, x)) found = true; }); return found; };
  const holdsMapped = el => { let found = false; walk(el, x => { if (x !== el && x.type === 'element' && siteOf(x)) found = true; }); return found; };
  const visit = (el, through = [], within = null) => {
    if (el.type !== 'element' || consumed.has(el)) return;
    // A site the Family map records (#265, ADR 0016): a Usage of its family's Contract, never a decision. Its tuple is
    // each axis's one value at the site; an axis a className ternary there switches between values stays out of it.
    // It is a leaf when its Contract takes its children as text and no other site sits inside it, else a Container
    // walked like a Card: the Usages inside it name it in `in`, and the rest of its subtree stays the region's.
    const site = siteOf(el);
    if (site && contracts[site.family]) {
      const def = contracts[site.family];
      const tuple = {}, switches = {};
      const order = axis => ((def.axes || []).find(a => a.key === axis) || { values: [] }).values.map(v => v.key);
      for (const [axis, values] of Object.entries(site.values))
        if (values.length === 1) tuple[axis] = values[0];
        else switches[axis] = values.slice().sort((a, b) => order(axis).indexOf(a) - order(axis).indexOf(b));
      const problem = tupleProblem(def, tuple, `\`${site.family}\``);
      if (problem) throw new Error(`the Family map's ${site.family} site at ${describe(el).at}: ${problem}`);
      recognised.push({ el, cand: { kind: 'element', sig: el.tag }, answer: { contract: site.family, tuple }, key: null, byMap: { switches }, within });
      usageEls.add(el);
      const leaf = !holdsMapped(el) && (def.properties || []).some(p => p.type === 'TEXT' && p.code && p.code.prop === 'children');
      if (leaf) walk(el, x => { if (x !== el) consume(x, 'usage'); });
      else for (const c of el.children) visit(c, through, el);
      return;
    }
    const isPartOfOuter = el.component && through.some(outer => isPart(outer, el));
    if (el.component && (isPartOfOuter || holdsOtherComponent(el))) {
      let inner = within;
      if (!isPartOfOuter) {
        const contract = el.component.kind === 'ds' && contractOfImport(el.component);
        if (contract) {
          const def = contracts[contract];
          const own = partsOf(el);
          const known = new Set((def.properties || []).map(p => p.type === 'TEXT' && p.code && p.code.child).filter(Boolean));
          recognised.push({ el, cand: { kind: 'element', sig: el.tag }, answer: { contract, tuple: slotTuple(def, own) }, key: null, byImport: true, within, parts: own });
          usageEls.add(el);
          for (const x of own) parts.add(x);
          // The Card's own copy leaves the region; the rest of its subtree stays the region's or the usages' inside it.
          for (const x of own) if (known.has(x.component.export)) walk(x, y => consume(y, 'text'));
          inner = el;
        } else wrappers.add(el);
      }
      for (const c of el.children) visit(c, [...through, el], inner);
      return;
    }
    const contract = el.component && el.component.kind === 'ds' && contractOfImport(el.component);
    // A Design System import is its Contract by import (#62): the tuple is its props through each axis value's code.
    if (contract) {
      const { tuple, unmapped, stray } = importTuple(contracts[contract], el);
      recognised.push({ el, cand: { kind: 'element', sig: el.tag }, answer: { contract, tuple }, key: null, byImport: true, unmapped, stray, within });
    } else {
      // Another library component is decided by its signature, once per signature; a plain element by its own.
      const cand = el.component ? { kind: 'element', sig: librarySignature(el), library: true } : candidateOf(el, rules);
      if (!cand) { for (const c of el.children) visit(c, through, within); return; }
      const key = `recognise:${cand.sig}`;
      const { text, at, rendered } = describe(el);
      const answer = resolveDraftAnswer(d.ask(key, {
        kind: 'recognise', question: `What is \`${cand.sig}\` ("${text.slice(0, 40)}")?`, candidates: families,
        evidence: { at: [at], ...(rendered ? { rendered } : {}) },
      }, checkRecognise), key);
      recognised.push({ el, cand, answer, key, within });
    }
    const { answer } = recognised[recognised.length - 1];
    usageEls.add(el);
    walk(el, x => { if (x !== el) consume(x, 'usage'); });
    if (answer && answer.contract) {
      // A label element names the control (<label for>): its text is the Contract's label property.
      const id = typeof el.attrs.id === 'string' ? el.attrs.id : null;
      if (id) walk(root, x => { if (x.tag === 'label' && x.attrs.for === id) consume(x, 'label'); });
    }
  };
  visit(root);

  /**
   * What `el` is to its region (#379), the first that holds: {claim: "consumed", by} (by: usage, text or label), a
   * usage's own element, a part of a Container with a Contract (its styles are the Contract's look), a wrapper (a
   * Container with no Contract, which the region notes), else open.
   */
  const claimOf = el => {
    if (consumed.has(el)) return { claim: 'consumed', by: consumed.get(el) };
    if (usageEls.has(el)) return { claim: 'usage' };
    if (parts.has(el)) return { claim: 'part' };
    return { claim: wrappers.has(el) ? 'wrapper' : 'open' };
  };
  return { recognised, claimOf, drafts };
}

/** An Adapter's procedure for writing a family's Contract, which may name the family as `<family>`. */
export const procedureFor = (adapter, family) => adapter.contractProcedure.replaceAll('<family>', family);

// ---------- tuples and parts ----------

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

/**
 * Whether component `x` is a part of the container `outer` (a CardFooter in a Card) rather than a component of its
 * own (a Button in a Card). A local ui file is one module per family, so its module is the family. A package's
 * module holds every component (all of @carbon/react), so there a part is named after its container (ModalBody in Modal) (#226).
 */
function isPart(outer, x) {
  const a = outer.component, b = x.component;
  return a.module === b.module && (a.kind !== 'ds' || b.export.startsWith(a.export));
}

/** A container's own parts: the components `isPart` accepts, reached without entering a component that is not one. */
function partsOf(el) {
  const out = [];
  const visit = x => {
    if (x.type !== 'element') return;
    if (x !== el && x.component) { if (!isPart(el, x)) return; out.push(x); }
    x.children.forEach(visit);
  };
  visit(el);
  return out;
}

/**
 * A container's tuple (#194): each Slot axis from whether its part is rendered, filled or empty. A Slot axis's
 * part is the export named by the Contract's component and the slot's anatomy node (Card + Footer: CardFooter).
 */
function slotTuple(def, own) {
  const tuple = {};
  for (const axis of def.axes) {
    if (!axis.slot) continue;
    const filled = own.some(x => x.component.export === `${def.code.component}${axis.slot}`);
    const value = axis.values.find(v => v.filled === filled);
    if (value) tuple[axis.key] = value.key;
  }
  return tuple;
}

// ---------- answer checks ----------

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
