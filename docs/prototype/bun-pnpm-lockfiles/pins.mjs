// PROTOTYPE (#335). `projectPins` (skills/adapter-generic/scripts/sources.mjs) and the preview renderer's FROM_PROJECT read
// (preview.mjs previewLock), each with one change: the resolved packages come from lockView, not package-lock.json.
// Everything else, the rules and their order, is the real function's.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TOOLS } from '../../../skills/adapter-generic/scripts/sources.mjs';

export function projectPinsFrom(project, view) {
  const fail = msg => { throw new Error(msg); };
  const read = rel => (existsSync(join(project, rel)) ? readFileSync(join(project, rel), 'utf8') : fail(`no ${rel}: the Adapter reads resolved versions from it`));
  const cssFile = (JSON.parse(read('components.json')).tailwind || {}).css || fail('components.json names no tailwind.css');
  const resolved = view.packages; // was: JSON.parse(read('package-lock.json')).packages
  const lock = name => resolved[`node_modules/${name}`];

  const tw = lock('tailwindcss') || fail(`${view.file} resolves no tailwindcss`);
  if (!/^4\./.test(tw.version)) fail(`the project resolves tailwindcss@${tw.version}, but the Adapter compiles Tailwind 4 only`);
  if (!/^sha512-/.test(tw.integrity || '')) fail(`${view.file} gives tailwindcss@${tw.version} no sha512 integrity (${tw.integrity || 'none'}), the only one the tools step checks`);
  const known = TOOLS.tailwindcss;
  if (tw.version === known.version && tw.integrity !== known.integrity)
    fail(`tailwindcss@${tw.version}: the lockfile's integrity ${tw.integrity} does not match the Adapter's pin ${known.integrity}`);
  const pins = { typescript: TOOLS.typescript, tailwindcss: { ...known, version: tw.version, integrity: tw.integrity } };

  const imported = new Set();
  const scan = rel => {
    const css = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, id] of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
      if (!id.startsWith('.')) imported.add(id.replace(/^((?:@[^/]+\/)?[^/]+).*$/, '$1'));
      else if (existsSync(join(project, dirname(rel), id))) scan(join(dirname(rel), id));
    }
  };
  scan(cssFile);
  for (const name of Object.keys(TOOLS).filter(n => TOOLS[n].stylesheet && n !== 'tailwindcss').sort()) {
    if (!imported.has(name)) continue;
    const got = (lock(name) || {}).version;
    if (got !== TOOLS[name].version) fail(`the project resolves ${name}@${got}, but the Adapter pins ${name}@${TOOLS[name].version}`);
    pins[name] = TOOLS[name];
  }
  return { pins, imported: [...imported].sort() };
}

/** previewLock's read of the project's lock: react, react-dom and scheduler, each with a sha512 integrity, react === react-dom. */
export function previewFrom(view) {
  const out = {};
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const e = view.packages[`node_modules/${name}`];
    if (!e) throw new Error(`${view.file} resolves no ${name}, which the preview renderer installs`);
    if (!/^sha512-/.test(e.integrity || '')) throw new Error(`${view.file} gives ${name}@${e.version} no sha512 integrity`);
    out[name] = `${e.version} ${e.integrity.slice(0, 19)}…`;
  }
  if (out.react.split(' ')[0] !== out['react-dom'].split(' ')[0]) throw new Error('react and react-dom differ');
  return out;
}
