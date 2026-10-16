// PROTOTYPE (#65): measure how many drafted values change between independent draft runs.
// usage: node diff.mjs ../out/run-1.json ../out/run-2.json [...]
// Writes ../out/churn.json and prints a per-kind table.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2); const outName = args[0] === '--out' ? (args.shift(), args.shift()) : 'churn.json';
const runs = args.map(p => JSON.parse(readFileSync(p, 'utf8')));
const OUT = new URL('../out/', import.meta.url).pathname;

const canon = v => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]))
  : typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export function kindOf(key) {
  const [, area, ...rest] = key.split('.');
  if (area === 'family') return `family.${rest[0]}`;
  if (area === 'axes') return rest.includes('values') && rest.at(-1) === 'label' ? 'axes.valueLabel'
    : rest.at(-1) === 'label' ? 'axes.axisLabel' : rest[0] === 'state' ? 'axes.state' : 'axes.attrAxis';
  if (area === 'figma') return `figma.${rest[0]}`;
  return area; // anatomy, properties, textStyles, layout, excluded, icons
}

const keys = [...new Set(runs.flatMap(r => Object.keys(r)))].sort();
const rows = [];
for (const key of keys) {
  const present = runs.map(r => key in r);
  const vals = runs.map(r => r[key] && r[key].value);
  const conf = runs.map(r => r[key] && r[key].confidence);
  let pairs = 0, differ = 0;
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    pairs++;
    if (!present[i] || !present[j] || !same(vals[i], vals[j])) differ++;
  }
  rows.push({ key, kind: kindOf(key), inAll: present.every(Boolean), stable: differ === 0, pairs, differ, conf });
}

const byKind = {};
for (const r of rows) {
  const k = byKind[r.kind] ||= { keys: 0, inAll: 0, stable: 0, pairDiffer: 0, pairs: 0 };
  k.keys++; k.inAll += r.inAll; k.stable += r.stable; k.pairDiffer += r.differ; k.pairs += r.pairs;
}
// Does the drafter's own confidence predict churn? (per run-key observation)
const byConf = {};
for (const r of rows) r.conf.forEach(c => { if (!c) return; const b = byConf[c] ||= { n: 0, unstable: 0 }; b.n++; b.unstable += !r.stable; });

const PROSE = /\.family\.description$/;
const judged = rows.filter(r => !PROSE.test(r.key));
const judgedStable = judged.filter(r => r.stable).length;
const judgedPair = judged.reduce((s, r) => s + r.differ, 0) / judged.reduce((s, r) => s + r.pairs, 0);
const total = rows.length, stable = rows.filter(r => r.stable).length;
const pairTotal = rows.reduce((s, r) => s + r.pairs, 0), pairDiffer = rows.reduce((s, r) => s + r.differ, 0);
const keyCounts = runs.map(r => Object.keys(r).length);
const summary = { runs: runs.length, keyCounts, unionKeys: total, keysInAllRuns: rows.filter(r => r.inAll).length,
  stableKeys: stable, unstableKeys: total - stable, pairwiseChangeRate: +(pairDiffer / pairTotal).toFixed(3), byKind, byConf };
writeFileSync(join(OUT, outName), JSON.stringify({ summary, rows }, null, 1) + '\n');

console.log(`runs ${runs.length}, keys per run ${keyCounts.join('/')}, union ${total}, in all ${summary.keysInAllRuns}, stable ${stable} (${(100 * stable / total).toFixed(0)}%), pairwise change ${(100 * summary.pairwiseChangeRate).toFixed(0)}%`);
console.log(`excluding prose (family.description): keys ${judged.length}, stable ${judgedStable} (${(100 * judgedStable / judged.length).toFixed(0)}%), pairwise change ${(100 * judgedPair).toFixed(0)}%`);
console.log('kind'.padEnd(20), 'keys', 'inAll', 'stable', 'pairDiff');
for (const [k, v] of Object.entries(byKind).sort()) console.log(k.padEnd(20), String(v.keys).padStart(4), String(v.inAll).padStart(5), String(v.stable).padStart(6), `${v.pairDiffer}/${v.pairs}`);
console.log('confidence → share of observations on an unstable key');
for (const [c, v] of Object.entries(byConf)) console.log(' ', c.padEnd(7), `${v.unstable}/${v.n}`, (100 * v.unstable / v.n).toFixed(0) + '%');
