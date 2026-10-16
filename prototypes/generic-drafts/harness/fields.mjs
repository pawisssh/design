// PROTOTYPE (#65): which fields of an object-valued draft differ between runs?
// usage: node fields.mjs <run.json>...   prints, per key kind, a count of differing fields.
import { readFileSync } from 'node:fs';
const kindOf = k => { const [, a, ...r] = k.split('.'); return a === 'family' || a === 'figma' ? a + '.' + r[0] : a; };

const runs = process.argv.slice(2).map(p => JSON.parse(readFileSync(p, 'utf8')));
const keys = [...new Set(runs.flatMap(r => Object.keys(r)))].sort();
const tally = {}, examples = {};
for (const key of keys) {
  if (!runs.every(r => key in r)) continue;
  const vals = runs.map(r => r[key].value);
  if (!vals.every(v => v && typeof v === 'object' && !Array.isArray(v))) continue;
  const fields = new Set(vals.flatMap(v => Object.keys(v)));
  for (const f of fields) {
    const s = vals.map(v => JSON.stringify(v[f]));
    if (s.every(x => x === s[0])) continue;
    const t = `${kindOf(key)}.${f}`;
    tally[t] = (tally[t] || 0) + 1;
    (examples[t] ||= []).length < 3 && examples[t].push(`${key}: ${s.join(' | ')}`);
  }
}
for (const [t, n] of Object.entries(tally).sort()) console.log(String(n).padStart(3), t, '\n      ' + examples[t].join('\n      '));
