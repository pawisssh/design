// PROTOTYPE (#65): PROJECTED (not measured) churn if anatomy layer names followed a naming rule and
// properties.code were derived from the exact tier. Drops those two fields, then recounts unstable keys.
// usage: node residual.mjs <run.json>...
import { readFileSync } from 'node:fs';
const runs = process.argv.slice(2).map(p => JSON.parse(readFileSync(p, 'utf8')));
const canon = v => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const drop = (k, v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const c = { ...v };
  if (/\.anatomy\./.test(k)) delete c.name;
  if (/\.properties\./.test(k)) delete c.code;
  return c;
};
const keys = [...new Set(runs.flatMap(r => Object.keys(r)))].filter(k => !/\.family\.description$/.test(k)).sort();
const unstable = keys.filter(k => {
  if (!runs.every(r => k in r)) return true;
  const s = runs.map(r => JSON.stringify(canon(drop(k, r[k].value))));
  return !s.every(x => x === s[0]);
});
console.log(`projected: ${keys.length} keys, unstable ${unstable.length} (${(100 * unstable.length / keys.length).toFixed(0)}%)`);
for (const k of unstable) console.log('  ', k);
