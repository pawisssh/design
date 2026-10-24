// Usage recognition (#379): which elements of one screen are Usages, and of what. It walks the screen, tells a
// leaf from a Container and collects a Container's parts, finds a Contract by import or asks for one by signature,
// builds the import tuple and Slot axes, resolves mid-run drafts and sets `in`. Building each Usage from its record
// (copy, off-axis values, states and questions) stays in generate.mjs. The part rules stay here, not in the Adapter (ADR 0020).
import { selectorMatches } from './css.mjs';
import { stateAxisOf } from './system.mjs';

// ---------- usage candidates ----------

const SEMANTIC = new Set(['button', 'input', 'select', 'textarea']);
const ROLES = new Set(['status', 'alert', 'alertdialog', 'dialog', 'tab', 'tablist', 'switch', 'checkbox', 'radio', 'menu', 'menuitem', 'progressbar', 'tooltip', 'navigation', 'search']);

/** The stable signature of an element: tag, sorted classes (a template literal's static ones, #216), then [type] and [role]. */
export function signature(el) {
  const classes = [...el.classes, ...(el.staticClasses || [])].sort().map(c => `.${c}`).join('');
  const type = el.tag === 'input' && typeof el.attrs.type === 'string' ? `[type=${el.attrs.type}]` : '';
  const role = typeof el.attrs.role === 'string' ? `[role=${el.attrs.role}]` : '';
  return `${el.tag}${classes}${type}${role}`;
}

// Props that carry content or behaviour, not a variant: left out of a library component's signature.
export const CONTENT_PROPS = /^(class|id|href|src|alt|title|name|value|placeholder|for|type|role|target|rel|tabIndex|aria-.*|data-.*)$/;

/** A library component's signature (#62 tier 2): its name, then its sorted literal variant props, `Button[size=sm]`. */
export function librarySignature(el) {
  const props = Object.keys(el.attrs).filter(k => typeof el.attrs[k] === 'string' && !CONTENT_PROPS.test(k)).sort();
  return `${el.tag}${props.map(k => (el.attrs[k] === '' ? `[${k}]` : `[${k}=${el.attrs[k]}]`)).join('')}`;
}

/**
 * Whether `el` is a usage candidate: {kind: "element"} for a semantic element or ARIA role, {kind: "group"} for an
 * element whose repeated same-tag children a descendant rule styles (`.avatars span`), else null.
 */
export function candidateOf(el, rules) {
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

// ---------- tuples and parts ----------

/**
 * A Design System import's tuple (#62): per axis but State, the value whose `code` its props carry, most
 * keys winning (`size="lg" isExpressive` is lg-expressive). An axis prop that maps to no value is `unmapped`; a
 * styling prop no axis or property names is `stray`.
 */
export function importTuple(def, el) {
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
export function isPart(outer, x) {
  const a = outer.component, b = x.component;
  return a.module === b.module && (a.kind !== 'ds' || b.export.startsWith(a.export));
}

/** A container's own parts: the components `isPart` accepts, reached without entering a component that is not one. */
export function partsOf(el) {
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
export function slotTuple(def, own) {
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

export function tupleProblem(def, tuple, name) {
  if (!tuple || typeof tuple !== 'object') return `${name} needs a tuple`;
  for (const [k, v] of Object.entries(tuple)) {
    const axis = def.axes.find(a => a.key === k);
    if (!axis) return `tuple axis ${k} is not an axis of ${name}`;
    if (axis === stateAxisOf(def)) return `tuple axis ${k} is the State axis; a State comes from the Prototype's conditions`;
    if (!axis.values.some(x => x.key === v)) return `tuple ${k} "${v}" is not a ${axis.label} value of ${name} (${axis.values.map(x => x.key).join(', ')})`;
  }
  return null;
}
export const viaProblem = via => (via === undefined || via === 'library' || via === 'element' ? null : `via "${via}" is not library or element`);
