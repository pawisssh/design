// The matcher (#61, #91): a Prototype value -> a Foundations token, by reference first, then by value
// filtered by role. Every colour goes through the shared converter (skills/contract/scripts/color.mjs) and
// nowhere else. Primitives (`hidden`) and component tokens (`family`) never match: a reference to one is an
// Off-system value with its reason, and value matching never offers one as a candidate.
//
// Results (one per distinct (normalised value, role); the caller turns ties and near matches into decisions):
//   {kind: "skip"}                                  no token kind (a width, `auto`, 0, a transparent colour)
//   {kind: "reference", token}                      `var(--…)` naming a theme token in scope
//   {kind: "exact", token} | {kind: "tie", candidates}
//   {kind: "near", candidates: [{token, delta}]}    the nearest 3, ranked by distance
//   {kind: "off-system", reason, nearest, primitive?}
import { chroma, convert, deltaE } from '../../contract/scripts/color.mjs';
import { coversScope } from '../../contract/scripts/contract.mjs';

// CSS role -> the VariableScope a token needs (#61 role filter).
const ROLE_SCOPE = {
  'background-color': 'FRAME_FILL', color: 'TEXT_FILL', 'border-color': 'STROKE_COLOR', 'outline-color': 'STROKE_COLOR',
  gap: 'GAP', padding: 'GAP', margin: 'GAP', 'border-radius': 'CORNER_RADIUS',
  'font-size': 'FONT_SIZE', 'line-height': 'LINE_HEIGHT', 'font-weight': 'FONT_WEIGHT', 'letter-spacing': 'LETTER_SPACING',
};
export const COLOR_ROLES = new Set(['background-color', 'color', 'border-color', 'outline-color']);
const TYPE_ROLES = new Set(['font-size', 'line-height', 'font-weight', 'letter-spacing']);
export const NEAR_DELTA_E = 0.02;
const CHROMA_GUARD = 0.01;

/** The role a CSS property plays for matching, or null when it has no token kind. */
export function roleOf(property) {
  if (/^border(-(top|right|bottom|left))?-color$/.test(property)) return 'border-color';
  if (/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/.test(property)) return property.split('-')[0];
  if (/^(row-|column-)?gap$/.test(property)) return 'gap';
  if (/^border(-(top|bottom)-(left|right))?-radius$/.test(property)) return 'border-radius';
  return ROLE_SCOPE[property] ? property : null;
}

/**
 * A variable's value in `mode` (its resolved colour, or its single-mode number). Given `foundations`, a value
 * that is only an alias is followed in `mode`: a Layer token (`field`) at its first level is that level's Theme
 * token in the Theme mode (#109).
 */
export function valueIn(variable, mode, foundations = null) {
  const v = variable.values[mode] || variable.values.default || Object.values(variable.values)[0];
  if (v && !('resolved' in v) && !('value' in v) && v.alias && foundations && foundations.variables[v.alias])
    return valueIn(foundations.variables[v.alias], mode, foundations);
  return v && ('resolved' in v ? v.resolved : v.value);
}

/** The collection that owns a Foundations mode key (the Theme collection for "white"). */
export const collectionOf = (foundations, mode) => foundations.collections.find(c => c.modes.some(m => m.key === mode));

const group = v => v.name.split('/')[0];
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const px = value => { const m = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value.trim()); return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null; };

// CSS-wide keywords and currentcolor carry no colour of their own.
const CSS_WIDE = /^(inherit|initial|unset|revert|revert-layer|currentcolor)$/i;

/** Two "#rrggbb" colours equal within one byte per channel (the converter's rounding). */
export const sameHex = (a, b) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 1);

/**
 * A value with the Prototype's own custom properties followed (and a `var()` fallback taken when the name is not
 * one of them). A reference to a Foundations token is left as written.
 */
export function followCustom(value, custom) {
  let v = String(value).trim();
  for (let hops = 0; hops < 8; hops++) {
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/.exec(v);
    if (!m) break;
    if (custom[m[1]] !== undefined) v = custom[m[1]];
    else if (m[2]) v = m[2].trim();
    else break;
  }
  return v;
}

/** A colour's text for keys and `raw`: normalised when the converter reads it, else as written, lower-cased. */
export function colorText(value) {
  try { return normaliseColor(value); } catch { return String(value).trim().toLowerCase(); }
}

/** Normalised text of a colour ("#rrggbb", or "rgba(r, g, b, a)" below full alpha), via the shared converter. */
export function normaliseColor(value) {
  const c = convert(value);
  if (c.alpha >= 1) return c.hex;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${c.alpha})`;
}

// Index of `var(--…)` code syntax -> variable key, built once per Foundations document.
const indexes = new WeakMap();
function webIndex(foundations) {
  if (!indexes.has(foundations)) {
    const idx = {};
    for (const [key, v] of Object.entries(foundations.variables)) {
      const web = v.codeSyntax && v.codeSyntax.WEB;
      const name = web && /^var\((--[\w-]+)\)$/.exec(web);
      if (name) idx[name[1]] = key;
    }
    indexes.set(foundations, idx);
  }
  return indexes.get(foundations);
}

/**
 * Match one declaration. `ctx`: {system: {foundations, adapter}, mode, custom: {"--name": value}}.
 * `value` is a single value (the caller splits a shorthand such as `padding: 12px 16px`).
 */
export function matchDeclaration({ property, value }, ctx) {
  const role = roleOf(property);
  if (!role || TYPE_ROLES.has(role)) return { kind: 'skip' };
  // 1. The Prototype's own custom properties, then a reference to a Foundations token by its code syntax.
  const f = follow(value, role, ctx);
  if (f.result) return f.result;
  if (f.unknown) return offSystem(`unknown token \`${f.unknown}\``, []);
  return byValue(f.value, role, ctx);
}

/**
 * Match one computed colour, spacing or radius of a runtime run (#284, #285). `ref` is the declared `var()` that
 * gives `value` (see referenceOf), followed through the built stylesheet's root custom properties (`ctx.custom`)
 * to a Foundations token. A Foundations name is read first at each hop, but only when one of the token's Mode
 * values is `value`: a built theme defines `--card` as its literal too, and a Prototype that redefines
 * `--primary` paints another colour. A name neither knows, or no `ref`, matches the computed value by value.
 */
export function matchComputed({ property, value, ref }, ctx) {
  const role = roleOf(property);
  if (!role || TYPE_ROLES.has(role)) return { kind: 'skip' };
  const f = ref ? follow(ref, role, ctx, value) : {};
  return f.result || byValue(value, role, ctx);
}

/** The one declared `var()` whose custom property, read on the element, gives its computed `value`; else null. */
export function referenceOf(property, value, refs) {
  const same = sameIn(roleOf(property));
  const live = [...new Set(refs.filter(r => same(r.resolved, value)).map(r => r.ref))];
  return live.length === 1 ? live[0] : null;
}

// Two values the same for a role: colours as the shared converter reads them, alpha included; lengths in px.
const sameIn = role => (COLOR_ROLES.has(role) ? sameColour : sameLength);
const sameColour = (a, b) => {
  try { const x = convert(a), y = convert(b); return sameHex(x.hex, y.hex) && Math.abs(x.alpha - y.alpha) < 0.01; } catch { return false; }
};
const sameLength = (a, b) => { const x = px(String(a)), y = px(String(b)); return x !== null && y !== null && Math.abs(x - y) <= 0.01; };

// A var() chain followed through `ctx.custom` and Foundations code syntax: {result} for a token reference or a
// refused one, {unknown} for a name neither knows, else {value} with the literal it ends on. Given the colour the
// page `rendered`, a Foundations name that paints it comes before the custom properties (see matchComputed).
function follow(value, role, ctx, rendered) {
  const { foundations } = ctx.system;
  const need = ROLE_SCOPE[role];
  let v = String(value).trim();
  const via = [];
  for (let hops = 0; hops < 8; hops++) {
    const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/.exec(v);
    if (!ref) break;
    const key = webIndex(foundations)[ref[1]];
    const own = ctx.custom && ctx.custom[ref[1]] !== undefined;
    const variable = key && foundations.variables[key];
    const named = key && (rendered === undefined ? !own : Object.keys(variable.values).some(m => sameIn(role)(valueIn(variable, m, foundations), rendered)));
    if (!named && own) { via.push(ref[1]); v = ctx.custom[ref[1]]; continue; }
    if (!named && ref[2]) { v = ref[2].trim(); continue; }
    if (!named) return { unknown: ref[1] };
    if (variable.hidden) return { result: offSystem(`\`${ref[1]}\` is a hidden Primitive; a region binds theme tokens only`, [], key) };
    if (variable.family) return { result: offSystem(`\`${ref[1]}\` is a component token of \`${variable.family}\`; a region binds theme tokens only`, []) };
    if (!coversScope(variable.scopes, need)) return { result: offSystem(`\`${key}\` is not scoped for ${role} (${need})`, []) };
    return { result: { kind: 'reference', token: key, ...(via.length ? { via } : {}) } };
  }
  return { value: v };
}

function byValue(value, role, ctx) {
  const { adapter } = ctx.system;
  const groups = (adapter.roleGroups && adapter.roleGroups[role]) || [];
  if (COLOR_ROLES.has(role)) return matchColor(value, role, ROLE_SCOPE[role], groups, ctx);
  return matchLength(value, role, ROLE_SCOPE[role], groups, ctx);
}

function offSystem(reason, nearest, primitive) {
  return primitive ? { kind: 'off-system', reason, nearest, primitive } : { kind: 'off-system', reason, nearest };
}

// Candidates for a role: in scope, in the role's groups, never hidden or a component token.
function pool(foundations, need, groups, collections, type) {
  return Object.entries(foundations.variables)
    .filter(([, x]) => x.type === type && !x.hidden && !x.family && collections.includes(x.collection)
      && coversScope(x.scopes || [], need) && groups.includes(group(x)))
    .map(([key, x]) => ({ key, variable: x }));
}

function matchColor(value, role, need, groups, ctx) {
  let raw;
  try { raw = convert(value); } catch {
    if (CSS_WIDE.test(value.trim())) return { kind: 'skip' };
    return offSystem(`\`${value.trim()}\` is not a colour the shared converter reads; write it as hex, rgb() or a token`, []);
  }
  if (raw.alpha === 0) return { kind: 'skip' };
  const { foundations } = ctx.system;
  const collection = collectionOf(foundations, ctx.mode);
  const modeLabel = collection.modes.find(m => m.key === ctx.mode).label;
  const rawChroma = chroma(raw.hex);
  const scored = pool(foundations, need, groups, [collection.key], 'COLOR').map(c => {
    const t = convert(valueIn(c.variable, ctx.mode));
    return { token: c.key, hex: t.hex, alpha: t.alpha, delta: deltaE(raw.hex, t.hex) };
  });
  const exact = scored.filter(c => sameHex(c.hex, raw.hex) && Math.abs(c.alpha - raw.alpha) <= 0.01);
  if (exact.length === 1) return { kind: 'exact', token: exact[0].token };
  if (exact.length > 1) return { kind: 'tie', candidates: exact.map(c => c.token).sort() };
  const rank = (a, b) => a.delta - b.delta || (a.token < b.token ? -1 : 1);
  const close = scored.filter(c => c.delta <= NEAR_DELTA_E && Math.abs(c.alpha - raw.alpha) <= 0.05);
  // The chroma guard (#91): a tinted colour never snaps to a grey token.
  const guarded = close.filter(c => !(rawChroma >= CHROMA_GUARD && chroma(c.hex) < CHROMA_GUARD));
  if (guarded.length) return { kind: 'near', candidates: guarded.sort(rank).slice(0, 3).map(c => ({ token: c.token, delta: round(c.delta) })) };
  const nearest = scored.sort(rank).slice(0, 3).map(c => ({ token: c.token, delta: round(c.delta) }));
  const dropped = close.length - guarded.length;
  const reason = `No ${groups.join(', ')} token is within ΔE ${NEAR_DELTA_E} of ${normaliseColor(value)} in ${modeLabel}`
    + (dropped ? `; the chroma guard dropped ${dropped} grey candidate${dropped > 1 ? 's' : ''} for a tinted colour` : '');
  const primitive = Object.keys(foundations.variables).sort().find(k => {
    const x = foundations.variables[k];
    return x.hidden && x.type === 'COLOR' && convert(valueIn(x, 'default')).hex === raw.hex;
  });
  return offSystem(reason, nearest, primitive);
}

function matchLength(value, role, need, groups, ctx) {
  const n = px(value);
  if (n === null || n <= 0) return { kind: 'skip' };
  const { foundations } = ctx.system;
  const single = foundations.collections.filter(c => c.modes.length === 1 && !c.hidden).map(c => c.key);
  const steps = pool(foundations, need, groups, single, 'FLOAT').map(c => ({ token: c.key, value: Number(valueIn(c.variable, 'default')) }))
    .filter(s => Number.isFinite(s.value)).sort((a, b) => a.value - b.value || (a.token < b.token ? -1 : 1));
  if (!steps.length) return { kind: 'skip' };
  const exact = steps.filter(s => Math.abs(s.value - n) <= 0.5);
  if (exact.length === 1) return { kind: 'exact', token: exact[0].token };
  if (exact.length > 1) return { kind: 'tie', candidates: exact.map(s => s.token).sort() };
  const close = steps.filter(s => Math.abs(s.value - n) <= 1);
  if (close.length === 1) return { kind: 'near', candidates: [{ token: close[0].token, delta: round(Math.abs(close[0].value - n), 2) }] };
  const below = steps.filter(s => s.value < n).pop(), above = steps.find(s => s.value > n);
  const nearest = [below, above].filter(Boolean).map(s => ({ token: s.token, value: s.value }));
  return offSystem(`${n}px is between ${nearest.map(s => `${s.token} (${s.value})`).join(' and ') || 'no steps'}; no ${groups.join(', ')} step within 1px`, nearest);
}

// A Text Style's line height and letter spacing in px: a line height in another unit is none, a letter spacing 0.
const lineHeightOf = s => (s.lineHeight && s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : null);
const letterSpacingOf = s => (s.letterSpacing && s.letterSpacing.unit === 'PIXELS' ? s.letterSpacing.value : 0);

/**
 * The Text Styles nearest a text tuple that matches none (#287), at most three: ranked by font-size, then weight,
 * line-height and letter-spacing difference, then key. Two line heights of none are equal; one of none is farthest.
 * Each is {token, delta: the font-size difference in px}.
 */
export function nearestText(t, system) {
  const apart = (a, b) => (a === b ? 0 : a === null || b === null ? Infinity : Math.abs(a - b));
  return Object.entries(system.foundations.textStyles)
    .map(([token, s]) => ({ token, by: [Math.abs(s.fontSize - t.fontSize), Math.abs(s.fontWeight - t.fontWeight), apart(lineHeightOf(s), t.lineHeight), Math.abs(letterSpacingOf(s) - t.letterSpacing)] }))
    .sort((a, b) => a.by.reduce((r, x, i) => r || (x === b.by[i] ? 0 : x - b.by[i]), 0) || (a.token < b.token ? -1 : 1))
    .slice(0, 3).map(x => ({ token: x.token, delta: round(x.by[0], 2) }));
}

/**
 * Match a text tuple {fontSize, lineHeight|null, fontWeight, letterSpacing} against the Text Styles (#61 Type):
 * exact | tie | near (size and weight equal, line height within 1px) | partial (the font size against the Type variables) | off-system.
 */
export function matchText(t, ctx) {
  const styles = Object.entries(ctx.system.foundations.textStyles);
  const base = styles.filter(([, s]) => s.fontSize === t.fontSize && s.fontWeight === t.fontWeight);
  if (t.lineHeight !== null) {
    const exact = base.filter(([, s]) => lineHeightOf(s) !== null && Math.abs(lineHeightOf(s) - t.lineHeight) <= 0.5 && Math.abs(letterSpacingOf(s) - t.letterSpacing) <= 0.05);
    if (exact.length === 1) return { kind: 'exact', token: exact[0][0] };
    if (exact.length > 1) return { kind: 'tie', candidates: exact.map(([k]) => k).sort() };
    const close = base.filter(([, s]) => lineHeightOf(s) !== null && Math.abs(lineHeightOf(s) - t.lineHeight) <= 1);
    if (close.length) {
      const dist = s => Math.abs((lineHeightOf(s) ?? 0) - t.lineHeight) + Math.abs(letterSpacingOf(s) - t.letterSpacing);
      const ranked = close.map(([k, s]) => ({ token: k, delta: round(dist(s), 2) })).sort((a, b) => a.delta - b.delta || (a.token < b.token ? -1 : 1));
      return { kind: 'near', candidates: ranked.slice(0, 3) };
    }
  }
  // Partial: no whole-style match; the font size alone against the Type variables.
  const sizes = Object.entries(ctx.system.foundations.variables)
    .filter(([, x]) => x.type === 'FLOAT' && !x.hidden && !x.family && coversScope(x.scopes || [], 'FONT_SIZE') && Number(valueIn(x, 'default')) === t.fontSize)
    .map(([k]) => k).sort();
  if (sizes.length === 1) return { kind: 'partial', property: 'fontSize', match: { kind: 'exact', token: sizes[0] } };
  if (sizes.length > 1) return { kind: 'partial', property: 'fontSize', match: { kind: 'tie', candidates: sizes } };
  return offSystem(`No Text Style or font-size token is ${t.fontSize}px`, []);
}
