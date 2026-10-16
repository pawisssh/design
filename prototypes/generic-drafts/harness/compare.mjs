// PROTOTYPE (#65): after an upgrade, how many re-drafted values differ from the approved ones?
// usage: node compare.mjs <approved.json> <redraft.json> [keys.json]
//   keys.json (optional): a JSON list of keys to restrict the count to (for example the fine-reopened set)
import { readFileSync } from 'node:fs';
const [approvedPath, redraftPath, keysPath] = process.argv.slice(2);
const approved = JSON.parse(readFileSync(approvedPath, 'utf8'));
const redraft = JSON.parse(readFileSync(redraftPath, 'utf8'));
const only = keysPath ? new Set(JSON.parse(readFileSync(keysPath, 'utf8'))) : null;
const canon = v => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]))
  : typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
const PROSE = /\.family\.description$/;
let kept = 0, changed = [], fresh = [], prose = 0;
for (const [k, d] of Object.entries(redraft)) {
  if (only && !only.has(k) && k in approved) continue;
  if (!(k in approved)) { fresh.push(k); continue; }
  if (PROSE.test(k)) { prose++; continue; }
  if (JSON.stringify(canon(d.value)) === JSON.stringify(canon(approved[k].value))) kept++; else changed.push(k);
}
const n = kept + changed.length;
console.log(`re-drafted ${n} (prose excluded: ${prose}), kept ${kept}, changed ${changed.length} (${(100 * changed.length / n).toFixed(0)}%), new ${fresh.length}`);
for (const k of changed) console.log('  changed', k, '\n    was', JSON.stringify(approved[k].value), '\n    now', JSON.stringify(redraft[k].value));
for (const k of fresh) console.log('  new', k, JSON.stringify(redraft[k].value));
