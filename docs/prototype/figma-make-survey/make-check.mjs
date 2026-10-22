// Throwaway check (#338): run the repo's own path choice, static React reader and used-families on a Figma Make bundle,
// as is and with the two gaps simulated in a scratch copy: React moved from peerDependencies to dependencies, and a
// stand-in components.json naming Make's Code Library folder. Reads the bundle; writes only the copy.
//   node make-check.mjs <repo-worktree> <deps-dir> <bundle> <copy-dir>
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const [repo, depsDir, bundle, copy] = process.argv.slice(2);
const { choosePath } = await import(join(repo, 'skills/vibe-to-figma/scripts/path.mjs'));
const { reactKind, readReact, codeLibraryDir } = await import(join(repo, 'skills/to-handoff/scripts/react.mjs'));
const { usedFamilies } = await import(join(repo, 'skills/vibe-to-figma/scripts/used.mjs'));
const { projectPins } = await import(join(repo, 'skills/adapter-generic/scripts/sources.mjs'));
const { loadTypescript } = await import(join(repo, 'skills/to-handoff/scripts/deps.mjs'));
const tryIt = f => { try { return f(); } catch (e) { return `THROWS: ${e.message.split('\n')[0]}`; } };

console.log('as is   choosePath:', JSON.stringify(choosePath(bundle)));
console.log('as is   reactKind :', reactKind(bundle));

rmSync(copy, { recursive: true, force: true });
cpSync(bundle, copy, { recursive: true, filter: s => !s.includes('/.git') && !s.includes('/node_modules') });
const pkgPath = join(copy, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies = { ...pkg.dependencies, ...pkg.peerDependencies };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('peer->deps choosePath:', JSON.stringify(choosePath(copy)));
console.log('peer->deps reactKind :', reactKind(copy));
console.log('peer->deps codeLibraryDir (no components.json):', codeLibraryDir(copy, loadTypescript(depsDir)));
const r1 = tryIt(() => readReact(copy, { depsDir }));
console.log('peer->deps readReact screens:', typeof r1 === 'string' ? r1 : r1.screens.map(s => s.id).join(', '));

writeFileSync(join(copy, 'components.json'), JSON.stringify({ tailwind: { css: 'src/styles/index.css' }, aliases: { ui: '@/app/components/ui', utils: '@/app/components/ui/utils' } }));
console.log('+components.json codeLibraryDir:', codeLibraryDir(copy, loadTypescript(depsDir)));
console.log('+components.json choosePath:', JSON.stringify(choosePath(copy)));
const u = tryIt(() => usedFamilies(copy, { depsDir }));
console.log('+components.json usedFamilies:', typeof u === 'string' ? u : `${u.uiDir} -> [${u.families.join(', ')}]`);
const ua = tryIt(() => usedFamilies(copy, { depsDir, all: true }));
console.log('+components.json usedFamilies --all:', typeof ua === 'string' ? ua : `${ua.families.length} families`);
console.log('+components.json projectPins:', tryIt(() => JSON.stringify(Object.fromEntries(Object.entries(projectPins(copy)).map(([k, v]) => [k, v.version])))));
