// PROTOTYPE (#65): why did unstable keys change? key naming, prose only, or a real judgement.
// usage: node causes.mjs <churn.json> <run.json>...
import { readFileSync } from 'node:fs';
const [churnPath, ...runPaths] = process.argv.slice(2);
const { rows } = JSON.parse(readFileSync(churnPath, 'utf8'));
const runs = runPaths.map(p => JSON.parse(readFileSync(p, 'utf8')));
const PROSE_FIELDS = new Set(['reason', 'role', 'description']);
const strip = v => Array.isArray(v) ? v.map(strip)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => !PROSE_FIELDS.has(k)).map(k => [k, strip(v[k])])) : v;
const causes = { keyNaming: [], proseOnly: [], judgement: [] };
for (const r of rows.filter(r => !r.stable)) {
  if (!r.inAll) { causes.keyNaming.push(r.key); continue; }
  const vals = runs.map(x => JSON.stringify(strip(x[r.key].value)));
  if (/\.family\.description$/.test(r.key) || vals.every(v => v === vals[0])) causes.proseOnly.push(r.key);
  else causes.judgement.push(r.key);
}
for (const [c, ks] of Object.entries(causes)) console.log(c, ks.length, '\n  ' + ks.join('\n  '));
