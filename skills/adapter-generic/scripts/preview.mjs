#!/usr/bin/env node
// The Generic Adapter's preview renderer for To-preview and To-handoff (#123): the project's own component, rendered
// with react-dom/server, over the project's own CSS compiled by Tailwind.
//   node skills/adapter-generic/scripts/preview.mjs [--dir <dir>]   fetch the pinned packages into .scratch/adapter-generic/preview
//
// To-preview finds this module by convention (skills/adapter-<source.adapter>/scripts/preview.mjs) and calls
// previewRenderer(contract), which resolves to:
//   render(tuple, properties)  the component the Contract names, as static HTML: a partial tuple takes each missing
//                      axis's default, and each axis value's `code` props are set (a State whose `code` is null
//                      renders like Enabled: the page forces it through its CSS pseudo-class). Each anatomy node
//                      the variant shows is a child, in anatomy order: an icon slot an <svg> carrying the attribute
//                      its Slot axis tests (`data-icon="inline-start"`), a part its exported component (CardHeader for
//                      the Header node) holding its layer name, a text layer its TEXT property's text (#166): the
//                      root's own children (Button's Label), a part's children (CardTitle), or the Value export's
//                      placeholder. With no `properties` (a catalog specimen) each text is its default; with them, a
//                      key's value, '' included (a Handoff sends '' for text its Prototype does not show), and the
//                      default only for a key it leaves out. A node the variant hides (`visible: false`) is not
//                      rendered. A provider family (Select, whose Root has no box, #153) renders its Root around its
//                      Trigger, which takes the props and the children, and holds the family's Value export with its
//                      placeholder (the family name where the Contract has no placeholder property);
//   stylesheet         the project's global CSS compiled by the pinned Tailwind over every class of the component
//                      files the render loads, Preflight and the base layer included;
//   modeClass(modeKey) the class for a Mode whose foundations entry has no `selector`: the default Mode (light,
//                      `:root`) is the page itself, so its class (`mode-light`) is inert.
//
// Unlike the reading tier, which executes nothing, this renderer runs code: the project's component files,
// transpiled with the pinned TypeScript, and the packages they import, from preview/package.json and its lockfile,
// installed with `npm ci --ignore-scripts` into gitignored scratch. It refuses when the project's files are not
// the Contract's snapshot, when a pinned package is not the Contract's `source.packages` version, or when any installed
// package's version differs from the one the project's lockfile resolves.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from '../../contract/scripts/contract.mjs';
import { familyRoot, readSource } from './source.mjs';
import { DEFAULT_DIR, FIXTURE, REPO_ROOT, hasTools, sha256, toolDir } from './sources.mjs';
import { build } from './tailwind.mjs';

export const PREVIEW_DIR = join(REPO_ROOT, '.scratch/adapter-generic/preview');
const PINNED_DIR = fileURLToPath(new URL('../preview/', import.meta.url));
const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);
const fail = message => { throw new Error(message); };

/** True when the pinned packages are installed in `dir` from the committed lockfile. */
export function hasPreviewPackages(dir = PREVIEW_DIR) {
  return lockOf(dir) === lockOf(PINNED_DIR) && existsSync(join(dir, 'node_modules/react-dom/package.json'));
}

/** Install the pinned packages into `dir` with `npm ci --ignore-scripts`. Skips when already installed. */
export function fetchPreviewPackages(dir = PREVIEW_DIR) {
  if (hasPreviewPackages(dir)) return dir;
  mkdirSync(dir, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(PINNED_DIR, f), join(dir, f));
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  return dir;
}

// The package an import names: `react/jsx-runtime` -> react, `@radix-ui/react-slot` -> itself.
const packageOf = id => id.split('/').slice(0, id.startsWith('@') ? 2 : 1).join('/');

// Tailwind guards each colour-mix() behind `@supports (color: color-mix(…))`, after a fallback. Every browser the
// page targets has color-mix(), so the guard is dropped and its rules follow the fallback unguarded: To-preview's
// state forcing copies a rule only where it can read it (#109), and it does not read inside an `@supports`.
function unguard(css) {
  const guard = '@supports (color: color-mix(in lab, red, red)) {';
  let out = css;
  for (let i = out.indexOf(guard); i >= 0; i = out.indexOf(guard, i)) {
    let depth = 1, j = i + guard.length;
    for (; j < out.length && depth; j++) {
      if (out[j] === '{') depth++;
      else if (out[j] === '}') depth--;
    }
    out = out.slice(0, i) + out.slice(i + guard.length, j - 1) + out.slice(j);
  }
  return out;
}

/**
 * The renderer for one Generic Adapter Contract, read from `project` (the fixture by default). Rejects when the
 * packages or tools are missing, the project is not the Contract's snapshot, or a package differs from the project's.
 */
export async function previewRenderer(contract, { project = FIXTURE, dir = PREVIEW_DIR, tools = DEFAULT_DIR } = {}) {
  if (!hasPreviewPackages(dir)) fail(`Generic preview packages missing in ${dir}; run: node skills/adapter-generic/scripts/preview.mjs`);
  if (!hasTools(tools)) fail(`Generic Adapter tools missing in ${tools}; run: node skills/adapter-generic/scripts/sources.mjs`);
  for (const [f, hash] of Object.entries(contract.source.files))
    if (`sha256:${sha256(readFileSync(join(project, f)))}` !== hash) fail(`${f} differs from the Contract's snapshot; regenerate the Contract first`);
  const pinned = Object.keys(JSON.parse(readFileSync(join(PINNED_DIR, 'package.json'), 'utf8')).dependencies);
  const installed = JSON.parse(lockOf(dir)).packages;
  for (const name of pinned) {
    const { version } = installed[`node_modules/${name}`];
    if (contract.source.packages[name] !== version) fail(`${name} ${version} is installed but the Contract pins ${contract.source.packages[name] || 'none'}`);
  }
  const projectLock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8')).packages;
  for (const [key, pkg] of Object.entries(installed)) {
    if (!key) continue;
    const want = (projectLock[key] || {}).version;
    if (want !== pkg.version) fail(`${key.replace(/^node_modules\//, '')} ${pkg.version} is installed, but the project resolves ${want || 'none'}`);
  }
  const req = createRequire(join(dir, 'package.json'));
  const ts = createRequire(import.meta.url)(join(toolDir('typescript', tools), 'lib/typescript.js'));

  // The project's modules, transpiled to CommonJS: `@/` and relative imports from the project, packages from `dir`.
  const loaded = new Map();
  const fileOf = path => ['', '.tsx', '.ts', '/index.tsx', '/index.ts'].map(x => path + x).find(p => existsSync(p) && !p.endsWith('/'))
    || fail(`no project module at ${relative(project, path)}`);
  const load = file => {
    if (loaded.has(file)) return loaded.get(file).exports;
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    const module = { exports: {} };
    loaded.set(file, module);
    const requireHere = id => {
      if (id.startsWith('@/')) return load(fileOf(join(project, id.slice(2))));
      if (id.startsWith('.')) return load(fileOf(join(dirname(file), id)));
      if (!pinned.includes(packageOf(id))) fail(`${relative(project, file)} imports ${id}, which preview/package.json does not pin`);
      return req(id);
    };
    new Function('exports', 'require', 'module', outputText)(module.exports, requireHere, module);
    return module.exports;
  };
  const alias = contract.code.package;
  if (!alias.startsWith('@/')) fail(`code.package "${alias}" is not a project module (@/…)`);
  const componentFile = fileOf(join(project, alias.slice(2)));
  const library = load(componentFile);
  const Component = library[contract.code.component] || fail(`${alias} has no export ${contract.code.component}`);
  // A provider (Select: SelectPrimitive.Root, no box) is rendered around the Trigger the Contract was read from.
  const { provider, root } = familyRoot(readSource(readFileSync(componentFile, 'utf8'), relative(project, componentFile), { tools }).components,
    contract.code.component, relative(project, componentFile));
  const Trigger = provider && (library[root.name] || fail(`${alias} has no export ${root.name}`));
  const Value = provider && library[`${contract.code.component}Value`];
  const React = req('react');
  const { renderToStaticMarkup } = req('react-dom/server');

  // The stylesheet: one build over every class in the component files the render loaded.
  const config = JSON.parse(readFileSync(join(project, 'components.json'), 'utf8'));
  const cssFile = config.tailwind.css;
  const candidates = new Set();
  for (const file of loaded.keys()) {
    if (!file.endsWith('.tsx')) continue;
    const rel = relative(project, file);
    const { cvas, components } = readSource(readFileSync(file, 'utf8'), rel, { tools });
    const add = list => list.classes.split(/\s+/).filter(Boolean).forEach(c => candidates.add(c));
    for (const cv of Object.values(cvas)) {
      add(cv.base);
      for (const values of Object.values(cv.variants)) Object.values(values).forEach(add);
    }
    for (const c of components) c.classes.forEach(add);
  }
  const stylesheet = unguard(await build(readFileSync(join(project, cssFile), 'utf8'), [...candidates].sort(), { base: join(project, cssFile, '..'), tools }));

  // Each anatomy child as an element: an icon slot an <svg> with its Slot axis's attribute, a part its component, a
  // text layer its text.
  const slotAxis = node => contract.axes.find(a => a.slot === node);
  const textProp = node => (contract.properties || []).find(p => p.type === 'TEXT' && (p.binds || []).some(b => b.node === node && b.field === 'characters'));
  const child = (node, key, text) => {
    const tp = node.type === 'TEXT' && textProp(node.name);
    if (tp && tp.code && tp.code.prop === 'children') return text(tp);
    if (tp && tp.code && tp.code.childProp) return null; // the Value export's prop, set where the provider renders it
    if (tp && tp.code && tp.code.child) {
      const Part = library[tp.code.child] || fail(`${alias} has no export ${tp.code.child} for the ${node.name} node`);
      return React.createElement(Part, { key }, text(tp));
    }
    const axis = slotAxis(node.name);
    if (node.role === 'icon') {
      const css = axis && axis.values.find(v => v.filled).css;
      const m = /^:has\(\[([\w-]+)="([^"]*)"\]\)$/.exec(css || '') || fail(`${node.name}: no Slot axis names the attribute its svg carries`);
      return React.createElement('svg', { key, [m[1]]: m[2], xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
        React.createElement('circle', { cx: 12, cy: 12, r: 9 }));
    }
    // A part's layer name is its data-slot without the family prefix (Footer), so its export is the root's name plus it.
    const name = contract.code.component + node.name.replace(/\s+/g, '');
    const Part = library[name] || fail(`${alias} exports no part ${name} for the ${node.name} node`);
    return React.createElement(Part, { key }, node.name);
  };

  return {
    stylesheet,
    modeClass: mode => `mode-${mode}`,
    render(tuple, properties) {
      const text = p => (properties && properties[p.key] !== undefined ? properties[p.key] : p.default);
      const full = {};
      for (const axis of contract.axes) full[axis.key] = tuple[axis.key] === undefined ? axis.default : tuple[axis.key];
      const props = {};
      for (const axis of contract.axes) {
        const value = axis.values.find(v => v.key === full[axis.key]) || fail(`unknown ${axis.key} value ${full[axis.key]}`);
        Object.assign(props, value.code || {});
      }
      const { layout } = resolve(contract, full);
      const children = (contract.anatomy.children || []).filter(n => !layout[n.name] || layout[n.name].visible !== false)
        .map((n, i) => child(n, i, text)).filter(c => c !== null);
      if (!provider) return renderToStaticMarkup(React.createElement(Component, props, ...children));
      const placeholder = (contract.properties || []).find(p => p.type === 'TEXT' && p.code && p.code.childProp === 'placeholder');
      const value = Value ? [React.createElement(Value, { key: 'value', placeholder: placeholder ? text(placeholder) : contract.family.name })] : [];
      return renderToStaticMarkup(React.createElement(Component, null, React.createElement(Trigger, props, ...value, ...children)));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : PREVIEW_DIR;
  try { fetchPreviewPackages(dir); console.log(`Generic preview packages OK in ${dir}`); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
