// (b): carry a Tailwind 3 config and stylesheet into a Tailwind 4 stylesheet, read statically (readconfig.mjs).
// compat=false: the config only. compat=true: also a Tailwind 3.4 defaults layer, its values read from the v3 package's
// own default theme and palette (deps3), so a class kept as written keeps its v3 meaning.
import { createRequire } from 'node:module';
import { join } from 'node:path';
const flat = (o, pre, out = {}) => { for (const [k, v] of Object.entries(o)) { const key = k === 'DEFAULT' ? pre : `${pre}-${k}`; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = v; } return out; };
const fontList = v => (Array.isArray(v) ? v : [v]).map(f => (/[\s]/.test(f) && !/^["']|^var\(/.test(f) ? `"${f}"` : f)).join(', ');
const NAMESPACE = { colors: '--color', borderRadius: '--radius', fontFamily: '--font', animation: '--animate', boxShadow: '--shadow', spacing: '--spacing', blur: '--blur', dropShadow: '--drop-shadow', screens: '--breakpoint' };
const DEPRECATED = new Set(['lightBlue', 'warmGray', 'trueGray', 'coolGray', 'blueGray']);

export function carry({ config, css, compat, deps3 }) {
  const out = ['@import "tailwindcss";'];
  const plugins = (config.plugins || []).map(p => p.plugin);
  if (plugins.includes('tailwindcss-animate')) out.push('@import "tw-animate-css";');
  const dark = config.darkMode;
  if (dark === 'class' || (Array.isArray(dark) && dark[0] === 'class')) out.push('@custom-variant dark (&:is(.dark *));');
  if (compat) {
    const req = createRequire(join(deps3, 'package.json'));
    const colors = req('tailwindcss/colors'), theme = req('tailwindcss/defaultTheme');
    const pal = {};
    for (const k of Object.keys(colors)) if (!DEPRECATED.has(k) && typeof colors[k] === 'object') for (const [n, v] of Object.entries(colors[k])) pal[`--color-${k}-${n}`] = v;
    const t = [];
    for (const [k, v] of Object.entries(pal)) t.push(`  ${k}: ${v};`);
    for (const key of ['boxShadow', 'borderRadius', 'blur', 'dropShadow']) for (const [k, v] of Object.entries(flat(theme[key], NAMESPACE[key]))) t.push(`  ${k}: ${Array.isArray(v) ? v.join(', ') : v};`);
    for (const k of ['sans', 'serif', 'mono']) t.push(`  --font-${k}: ${fontList(theme.fontFamily[k])};`);
    t.push('  --default-ring-width: 3px;', '  --default-outline-width: 3px;', '  --default-ring-color: rgb(59 130 246 / 0.5);');
    out.push(`@theme {\n${t.join('\n')}\n}`);
    // Tailwind's own v3 compatibility base rules (its upgrade guide): border colour, placeholder, button cursor.
    out.push(`@layer base {\n  *, ::after, ::before, ::backdrop, ::file-selector-button { border-color: var(--color-gray-200, currentcolor); }\n  input::placeholder, textarea::placeholder { color: var(--color-gray-400); opacity: 1; }\n  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }\n}`);
    out.push('@utility outline-none {\n  outline: 2px solid transparent;\n  outline-offset: 2px;\n}');
  }
  const ext = (config.theme && config.theme.extend) || {};
  const lines = [], kf = [];
  for (const [key, ns] of Object.entries(NAMESPACE)) {
    if (!ext[key]) continue;
    for (const [k, v] of Object.entries(flat(ext[key], ns))) lines.push(`  ${k}: ${key === 'fontFamily' ? fontList(v) : v};`);
  }
  for (const [name, frames] of Object.entries(ext.keyframes || {}))
    kf.push(`  @keyframes ${name} {\n${Object.entries(frames).map(([at, d]) => `    ${at} { ${Object.entries(d).map(([p, v]) => `${p.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}: ${v};`).join(' ')} }`).join('\n')}\n  }`);
  if (lines.length || kf.length) out.push(`@theme inline {\n${[...lines, ...kf].join('\n')}\n}`);
  const c = config.theme && config.theme.container;
  if (c) out.push(`@utility container {\n${c.center ? '  margin-inline: auto;\n' : ''}${c.padding ? `  padding-inline: ${c.padding};\n` : ''}${Object.entries(c.screens || {}).map(([, w]) => `  @media (width >= ${w}) { max-width: ${w}; }`).join('\n')}\n}`);
  out.push(css.replace(/@tailwind\s+[\w-]+\s*;/g, ''));
  return out.join('\n');
}
