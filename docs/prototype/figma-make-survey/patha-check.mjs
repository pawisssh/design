// Throwaway check (#338): path A's extract on a Make bundle copy, first run (no answers): where do its candidate groups
// come from, the Prototype's own files or Make's src/app/components/ui/ boilerplate?
//   node patha-check.mjs <repo-worktree> <copy> <deps-dir>
import { join } from 'node:path';
const [repo, copy, depsDir] = process.argv.slice(2);
process.env.TO_HANDOFF_DEPS = depsDir;
const deps = await import(join(repo, 'skills/to-handoff/scripts/deps.mjs'));
const { extract } = await import(join(repo, 'skills/vibe-to-figma/scripts/extract.mjs'));
let r;
try { r = extract({ project: copy }); } catch (e) { console.log('THROWS:', e.message); process.exit(0); }
const inUi = f => f.includes('components/ui/');
const sitesOf = req => (req.sites || req.members || []).map(s => s.at || s.file || s.site || '');
const reqs = r.requests || [];
let ui = 0, own = 0;
for (const q of reqs) { const at = JSON.stringify(q); if (/components\/ui\//.test(at)) ui++; else own++; }
console.log(`requests ${reqs.length}: touching components/ui ${ui}, only the Prototype's own files ${own}; skipped ${r.skipped.length} (in ui: ${r.skipped.filter(s => inUi(String(s.site))).length})`);
console.log('first request keys:', reqs[0] && Object.keys(reqs[0]).join(','));
