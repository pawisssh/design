// Which Code Library components a vibe-coded Prototype uses (#176). A component is a family keyed by its file in
// the Code Library folder (components.json `aliases.ui`): `components/ui/select.tsx` is `select`, whichever of its
// exports (Select, SelectTrigger, SelectValue) a screen renders.
import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { loadTypescript } from '../../to-handoff/scripts/deps.mjs';
import { codeLibraryDir, readReact } from '../../to-handoff/scripts/react.mjs';
import { walk } from '../../to-handoff/scripts/reader.mjs';

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * usedFamilies(project, {all, depsDir}) -> {uiDir, families}. By default `families` are the ones the screens render,
 * read with To-handoff's static React reader (a page's tree and the layouts it mounts in, so the root layout's
 * Toaster counts). With `all`, every `.tsx` file in the Code Library folder. Sorted by key.
 */
export function usedFamilies(project, { all = false, depsDir } = {}) {
  if (all) {
    const uiDir = codeLibraryDir(project, loadTypescript(depsDir));
    const families = readdirSync(join(project, uiDir)).filter(f => f.endsWith('.tsx')).map(f => f.slice(0, -4));
    return { uiDir, families: families.sort(byKey) };
  }
  const { uiDir, screens } = readReact(project, { depsDir });
  const families = new Set();
  const visit = el => {
    const file = el.component && el.component.kind === 'ui' && el.component.file;
    if (file && posix.dirname(file) + '/' === uiDir) families.add(posix.basename(file).replace(/\.[jt]sx?$/, ''));
  };
  for (const s of screens) for (const tree of [s.root, s.mount]) if (tree) walk(tree, visit);
  return { uiDir, families: [...families].sort(byKey) };
}
