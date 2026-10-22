// Classify each Figma Make bundle (#338): its root, React placement, lockfile, shadcn folder use, router, MUI use.
//   node classify.mjs <dir-of-bundles>...
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
const SKIP = new Set(['node_modules', 'dist', 'build', '.git']);
function* walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n) || n.startsWith('.')) continue; const p = join(d, n); let s; try { s = statSync(p); } catch { continue; } if (s.isDirectory()) yield* walk(p); else yield p; } }
const rootOf = b => { const c = [...walk(b)].filter(f => f.endsWith(`${sep}package.json`) && existsSync(join(dirname(f), 'vite.config.ts'))); return c.length ? dirname(c.sort((x, y) => x.length - y.length)[0]) : b; };
const rows = [];
for (const parent of process.argv.slice(2)) for (const name of readdirSync(parent).sort()) {
  const b = resolve(parent, name); if (!statSync(b).isDirectory()) continue;
  const root = rootOf(b); let pkg = null; try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch {}
  const r = { bundle: name, root: relative(b, root) || '.' };
  if (!pkg) { r.kind = 'invalid package.json'; rows.push(r); continue; }
  r.react = pkg.dependencies?.react ? 'dep' : pkg.peerDependencies?.react ? (pkg.peerDependenciesMeta?.react?.optional ? 'optional-peer' : 'peer') : 'none';
  r.lock = ['package-lock.json', 'bun.lock', 'pnpm-lock.yaml'].filter(l => existsSync(join(root, l))).join('+') || 'none';
  r.workspace = existsSync(join(root, 'pnpm-workspace.yaml'));
  const src = [...walk(root)].filter(f => /\.(tsx|ts|jsx|js)$/.test(f) && !f.endsWith('.d.ts') && !f.includes(`${sep}node_modules${sep}`));
  const uiDir = ['components/ui', 'src/components/ui', 'src/app/components/ui'].map(d => join(root, d)).find(d => existsSync(d));
  r.ui = uiDir ? relative(root, uiDir) : 'none';
  let users = 0, mui = 0, dataRouter = false, jsxRoutes = false;
  for (const f of src) {
    const t = readFileSync(f, 'utf8');
    if (/from\s+['"]@mui\//.test(t)) mui++;
    if (/create(Browser|Hash|Memory)Router/.test(t)) dataRouter = true;
    if (/<Routes[\s>]/.test(t)) jsxRoutes = true;
    if (!uiDir || f.startsWith(uiDir + sep)) continue;
    const hit = [...t.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].some(([, s]) => {
      const p = s.startsWith('.') ? resolve(dirname(f), s) : s.startsWith('@/') ? join(root, 'src', s.slice(2)) : null;
      return p && (p === uiDir || p.startsWith(uiDir + sep));
    });
    if (hit) users++;
  }
  r.uiUsers = users; r.mui = mui; r.router = dataRouter ? 'data' : jsxRoutes ? 'jsx' : 'none';
  r.tsx = src.some(f => /\.(tsx|jsx)$/.test(f));
  r.kind = !r.tsx && r.react === 'none' ? 'plain HTML (+Tailwind build)' : mui ? 'React + CSS-in-JS (MUI)' : users ? 'React + Tailwind + shadcn' : 'React + Tailwind, no Code Library';
  rows.push(r);
}
for (const r of rows) console.log(JSON.stringify(r));
const count = k => Object.entries(rows.reduce((a, r) => (a[r[k]] = (a[r[k]] || 0) + 1, a), {})).map(([v, n]) => `${v}: ${n}`).join(', ');
console.log(`\nbundles ${rows.length}\nkind  ${count('kind')}\nreact ${count('react')}\nlock  ${count('lock')}\nui    ${count('ui')}\nrouter ${count('router')}\nworkspace ${count('workspace')}`);
const shad = rows.filter(r => r.kind === 'React + Tailwind + shadcn');
console.log(`shadcn-kind routers: ${shad.map(r => r.router).join(',')}`);
console.log(`ui present but unused: ${rows.filter(r => r.ui !== 'none' && !r.uiUsers && r.kind !== 'invalid package.json').length}`);
