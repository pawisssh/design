// CSS value readers the foundations step and the component step share: lengths to px, and a converted colour as a
// Foundations value form (skills/contract/references/foundations-schema.md, value forms).
import { convert } from '../../contract/scripts/color.mjs';

const fail = msg => { throw new Error(msg); };
export const CLIPPED = 'outside sRGB, clipped per channel';
export const round = x => Math.round(x * 1e4) / 1e4; // px to 4 decimals, so 10 x 2.2 is 22, not 22.000000000000004

/** "0.625rem" or "4px" -> px. */
export function lengthPx(text, at) {
  const m = /^(-?\d*\.?\d+)(rem|px)$/.exec(text.trim());
  if (!m) fail(`${at}: "${text}" is not a rem or px length`);
  return round(parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1));
}

/**
 * Evaluate a compiled length (`calc(var(--spacing) * 1.5)`, `var(--radius)`, `min(var(--radius-md), 10px)`, `1px`)
 * to px, given px per property.
 */
export function evaluate(text, env, at) {
  const t = text.trim();
  let m = /^var\((--[\w-]+)\)$/.exec(t);
  if (m) return m[1] in env ? env[m[1]] : fail(`${at}: compiled ${t} names an unknown property`);
  m = /^(min|max)\(([^,]+),([^,]+)\)$/.exec(t);
  if (m) return Math[m[1]](evaluate(m[2], env, at), evaluate(m[3], env, at));
  m = /^calc\((.+)\*(.+)\)$/.exec(t);
  if (m) return round(evaluate(m[1], env, at) * evaluate(m[2], env, at));
  if (/^-?\d*\.?\d+$/.test(t)) return parseFloat(t);
  return lengthPx(t, at);
}

/** A converted colour as `resolved` is written: "#rrggbb", or "rgba(r, g, b, a)" below alpha 1. */
export function resolvedText({ hex, alpha }) {
  return alpha === 1 ? hex : `rgba(${[1, 3, 5].map(j => parseInt(hex.slice(j, j + 2), 16)).join(', ')}, ${alpha})`;
}

/**
 * A literal CSS colour as a Foundations value: {value, resolved, from: {css}}, or the raw form below alpha 1, since
 * the builder writes alpha only from `raw`. A clipped value carries an info reason. Throws what the converter throws.
 */
export function literalForm(text) {
  const c = convert(text);
  const v = c.alpha === 1 ? { value: c.hex, resolved: c.hex, from: { css: text } }
    : { raw: c.hex, alpha: c.alpha, resolved: resolvedText(c), from: { css: text } };
  if (c.clipped) Object.assign(v, { level: 'info', reason: CLIPPED });
  return v;
}
