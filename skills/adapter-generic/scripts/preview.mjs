#!/usr/bin/env node
// The Generic Adapter's preview renderer for To-preview and To-handoff (#123): the project's own component, rendered
// with react-dom/server, over the project's own CSS compiled by Tailwind.
//   node skills/adapter-generic/scripts/preview.mjs [--project <dir>] [--dir <dir>]   install the packages for a project into .scratch/adapter-generic/preview
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from '../../contract/scripts/contract.mjs';
import { familyRoot, readSource } from './source.mjs';
import { DEFAULT_DIR, FIXTURE, REPO_ROOT, downloadVerified, hasTools, installAtomically, projectPins, sha256, toolDir } from './sources.mjs';
import { build } from './tailwind.mjs';

export const PREVIEW_DIR = join(REPO_ROOT, '.scratch/adapter-generic/preview');
const PINNED_DIR = fileURLToPath(new URL('../preview/', import.meta.url));
const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);
const fail = message => { throw new Error(message); };

// The packages that follow the project's lockfile (#256): react and react-dom, and the scheduler react-dom depends on.
const FROM_PROJECT = ['react', 'react-dom', 'scheduler'];
const textOf = json => `${JSON.stringify(json, null, 2)}\n`;

/**
 * What the preview renderer installs for `project`: the committed set (preview/), with `react`, `react-dom` and `scheduler`
 * at the versions the project's lockfile resolves, and that lockfile's own `integrity`. `key` names the folder it installs
 * into, `packageJson` and `lock` are what `npm ci` reads there, and `changed` lists the packages whose tarball is not the
 * committed set's, which fetchPreviewPackages verifies itself, and `pruned` says the project lists only some of the pinned packages (below). A package's `resolved` URL is built from the registry, never
 * taken from the lockfile. Throws, naming the package, when the lockfile disagrees.
 */
export function previewLock(project) {
  const read = dir => file => JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const packageJson = read(PINNED_DIR)('package.json');
  const lock = read(PINNED_DIR)('package-lock.json');
  const path = join(project, 'package-lock.json');
  if (!existsSync(path)) fail('no package-lock.json: the preview renderer installs the React it resolves');
  const have = JSON.parse(readFileSync(path, 'utf8')).packages || {};
  const changed = [];
  for (const name of FROM_PROJECT) {
    const entry = have[`node_modules/${name}`] || fail(`package-lock.json resolves no ${name}, which the preview renderer installs`);
    const pin = lock.packages[`node_modules/${name}`];
    if (!/^sha512-/.test(entry.integrity || '')) fail(`package-lock.json gives ${name}@${entry.version} no sha512 integrity (${entry.integrity || 'none'}), the only one the preview step checks`);
    if (entry.version === pin.version && entry.integrity !== pin.integrity)
      fail(`${name}@${entry.version}: the lockfile's integrity ${entry.integrity} does not match the Adapter's pin ${pin.integrity}`);
    if (entry.version !== pin.version) changed.push(name);
    const { version, integrity } = entry;
    lock.packages[`node_modules/${name}`] = { version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity,
      ...Object.fromEntries(['license', 'engines', 'dependencies', 'peerDependencies'].filter(k => k in entry).map(k => [k, entry[k]])) };
  }
  const react = have['node_modules/react'].version;
  const dom = have['node_modules/react-dom'].version;
  if (react !== dom) fail(`the project resolves react-dom@${dom} but react@${react}`);
  for (const deps of [packageJson.dependencies, lock.packages[''].dependencies]) Object.assign(deps, { react, 'react-dom': dom });
  let key = `react@${react}-scheduler@${have['node_modules/scheduler'].version}`;
  // A project whose lockfile lists only some of the pinned packages (an Extracted Library imports react, cva and cn, #262)
  // gets only those and what they depend on, in a folder of their own: its installed versions must all be ones it resolves.
  const wanted = Object.keys(packageJson.dependencies).filter(name => FROM_PROJECT.includes(name) || have[`node_modules/${name}`]);
  const pruned = wanted.length < Object.keys(packageJson.dependencies).length;
  if (pruned) {
    const keep = new Set();
    const visit = name => {
      const path = `node_modules/${name}`;
      if (keep.has(path) || !lock.packages[path]) return;
      keep.add(path);
      const { dependencies, optionalDependencies, peerDependencies } = lock.packages[path];
      for (const dep of Object.keys({ ...dependencies, ...optionalDependencies, ...peerDependencies })) visit(dep);
    };
    wanted.forEach(visit);
    lock.packages = Object.fromEntries(Object.entries(lock.packages).filter(([path]) =>
      path === '' || [...keep].some(k => path === k || path.startsWith(`${k}/node_modules/`))));
    for (const deps of [packageJson.dependencies, lock.packages[''].dependencies])
      for (const name of Object.keys(deps)) if (!wanted.includes(name)) delete deps[name];
    key += `-${sha256(wanted.join()).slice(0, 8)}`;
  }
  return { key, packageJson, lock, changed, pruned };
}

// Complete once the packages and the lockfile they were installed from are both there.
const installedFrom = (lock, folder) => lockOf(folder) === textOf(lock) && existsSync(join(folder, 'node_modules/react-dom/package.json'));

/** True when the packages for `project` are installed in their folder of `dir`, from the lockfile previewLock gives. */
export function hasPreviewPackages(dir = PREVIEW_DIR, project = FIXTURE) {
  const { key, lock } = previewLock(project);
  return installedFrom(lock, join(dir, key));
}

/**
 * Install the packages for `project` into their folder of `dir` with `npm ci --ignore-scripts`, beside it first (#219).
 * The tarballs of the packages that follow the project are verified against its integrity first (#256). Skips when
 * already installed. Resolves to the folder.
 */
export async function fetchPreviewPackages(dir = PREVIEW_DIR, project = FIXTURE) {
  const { key, packageJson, lock, changed } = previewLock(project);
  const out = join(dir, key);
  if (installedFrom(lock, out)) return out;
  for (const name of changed) {
    const { version, integrity } = lock.packages[`node_modules/${name}`];
    await downloadVerified(name, version, integrity);
  }
  installAtomically(out, folder => installedFrom(lock, folder), tmp => {
    writeFileSync(join(tmp, 'package.json'), textOf(packageJson));
    writeFileSync(join(tmp, 'package-lock.json'), textOf(lock));
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: tmp, stdio: 'inherit' });
  }, ['node_modules', 'package.json', 'package-lock.json']);
  return out;
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
 * The renderer for one Generic Adapter Contract, read from `project` (the fixture by default); `dir` is the folder the
 * packages for each React are installed in. Rejects when the packages or tools are missing, the project is not the Contract's snapshot, or a package differs from the project's.
 */
export async function previewRenderer(contract, { project = FIXTURE, dir: base = PREVIEW_DIR, tools = DEFAULT_DIR } = {}) {
  const { key, lock, packageJson, pruned } = previewLock(project);
  const dir = join(base, key);
  if (!installedFrom(lock, dir)) fail(`Generic preview packages missing in ${dir}; run: node skills/adapter-generic/scripts/preview.mjs --project ${project}`);
  const pins = projectPins(project);
  if (!hasTools(tools, pins)) fail(`Generic Adapter tools missing in ${tools}; run: node skills/adapter-generic/scripts/foundations.mjs --project ${project}`);
  for (const [f, hash] of Object.entries(contract.source.files))
    if (`sha256:${sha256(readFileSync(join(project, f)))}` !== hash) fail(`${f} differs from the Contract's snapshot; regenerate the Contract first`);
  const pinned = Object.keys(packageJson.dependencies);
  const installed = JSON.parse(lockOf(dir)).packages;
  for (const name of pinned) {
    const { version } = installed[`node_modules/${name}`];
    if (contract.source.packages[name] !== version) fail(`${name} ${version} is installed but the Contract pins ${contract.source.packages[name] || 'none'}`);
  }
  const projectLock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8')).packages;
  for (const [key, pkg] of Object.entries(installed)) {
    if (!key) continue;
    const want = (projectLock[key] || {}).version;
    if (pruned && want === undefined) continue; // a dependency of what the project lists, at the committed set's version
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
      cv.compound.filter(c => c.classes !== undefined).forEach(add);
    }
    for (const c of components) c.classes.forEach(add);
  }
  const stylesheet = unguard(await build(readFileSync(join(project, cssFile), 'utf8'), [...candidates].sort(), { base: join(project, cssFile, '..'), tools, pins }));

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
    // The catalog chrome's colours (#392): shadcn's theme variables, which the project's CSS sets in :root and again in
    // .dark, so the chrome follows Dark. The page is muted, as Carbon's is its gray layer; shadcn has no warning colour.
    chrome: {
      page: 'var(--muted)', card: 'var(--card)', border: 'var(--border)', text: 'var(--foreground)', textSecondary: 'var(--muted-foreground)',
      controlBorder: 'var(--input)', focus: 'var(--ring)', error: 'var(--destructive)',
    },
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
  const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  try { console.log(`Generic preview packages OK in ${await fetchPreviewPackages(flag('--dir', PREVIEW_DIR), flag('--project', FIXTURE))}`); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
