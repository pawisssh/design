#!/usr/bin/env node
// For each fetched bundle (fetch.sh's output), does it name a font? Reads the stylesheets, index.html and package.json
// as data (src/ and index.html only) and prints one line per bundle: the families it names and how, or "none".
//   node count.mjs <dir>
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const GENERIC = /^(ui-sans-serif|ui-serif|ui-monospace|system-ui|sans-serif|serif|monospace|cursive|fantasy|-apple-system|BlinkMacSystemFont|inherit|initial|unset)$/i;
const first = v => v.split(',')[0].trim().replace(/^(['"])(.*)\1$/, '$2');
const dir = process.argv[2];
let none = 0, named = 0, skipped = 0;
for (const b of readdirSync(dir).sort()) {
  const root = join(dir, b);
  const files = existsSync(join(root, '.files')) ? readFileSync(join(root, '.files'), 'utf8').split('\n').filter(Boolean) : [];
  // The bundle's root is the folder holding src/ (some repos nest it, as frontend/ or FIGMA-MAKE/).
  const base = files.map(f => /^(.*?)src\//.exec(f)?.[1]).find(x => x !== undefined);
  if (base === undefined) { console.log(`${b}: skipped (no src/)`); skipped++; continue; }
  const read = f => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '');
  // Custom properties defined anywhere fetched, to follow `font-family: var(--x)` one step.
  const props = {};
  for (const f of files) for (const m of read(f).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) props[m[1]] ??= m[2];
  const hits = [];
  for (const f of files.filter(f => f.startsWith(`${base}src/`) || f === `${base}index.html`)) {
    const text = read(f);
    for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"':)]+)/g)) hits.push(`${decodeURIComponent(m[1]).replace(/\+/g, ' ')} (Google Fonts, ${f})`);
    for (const m of text.matchAll(/@font-face\s*{[^}]*font-family:\s*([^;]+);/g)) hits.push(`${first(m[1])} (@font-face, ${f})`);
    for (const m of text.matchAll(/(?:^|[;{\s])(--font-sans|font-family)\s*:\s*([^;}]+)/g)) {
      const v = /^var\((--[\w-]+)/.exec(m[2].trim());
      const fam = first(v && props[v[1]] ? props[v[1]] : m[2]);
      if (!GENERIC.test(fam) && !fam.startsWith('var(')) hits.push(`${fam} (${m[1]}${v ? ` via ${v[1]}` : ''}, ${f})`);
    }
  }
  const pkg = join(root, 'package.json'); // the repo root's; fetch.sh fetches only that one
  if (existsSync(pkg)) {
    let deps = [];
    try { deps = Object.keys({ ...JSON.parse(readFileSync(pkg, 'utf8')).dependencies }); } catch { /* not JSON: read as naming no font package */ }
    for (const d of deps.filter(d => /^@fontsource|^geist$|^@next\/font/.test(d))) hits.push(`${d} (package.json)`);
  }
  const fams = [...new Set(hits.map(h => h.replace(/ \(.*$/, '')))];
  if (fams.length) named++; else none++;
  console.log(`${b}: ${fams.length ? `${fams.slice(0, 4).join(', ')}${fams.length > 4 ? `, +${fams.length - 4}` : ''} (${[...new Set(hits.map(h => /\(([^,)]+)/.exec(h)?.[1]))].join(', ')})` : 'none'}`);
}
console.log(`\nnames a font: ${named}, names none: ${none}, skipped: ${skipped}`);
