// Prepare a simulated copy (#338): a stand-in components.json whose aliases.ui is root-relative (the Adapter maps @/ to the
// root), and the lock's tw-animate-css moved to the Adapter's pin, so the code-library-pins gate is out of the way.
//   node sim-prep.mjs <copy> <repo-worktree> <css-rel>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [copy, repo, css] = process.argv.slice(2);
const { TOOLS } = await import(join(repo, 'skills/adapter-generic/scripts/sources.mjs'));
writeFileSync(join(copy, 'components.json'), JSON.stringify({ tailwind: { css }, aliases: { ui: '@/src/app/components/ui', utils: '@/src/app/components/ui/utils' } }, null, 2));
const lockPath = join(copy, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock.packages['node_modules/tw-animate-css'] = { ...lock.packages['node_modules/tw-animate-css'], version: TOOLS['tw-animate-css'].version, integrity: TOOLS['tw-animate-css'].integrity };
writeFileSync(lockPath, JSON.stringify(lock, null, 2));
