#!/usr/bin/env node
// Carbon React preview renderer for To-preview (#33).
//   node skills/adapter-carbon/scripts/preview.mjs [--dir <dir>]   fetch the pinned packages into .scratch/adapter-carbon/preview
//
// To-preview finds this module by convention (skills/adapter-<source.adapter>/scripts/preview.mjs) and calls
// previewRenderer(contract), which returns:
//   render(tuple)      the real @carbon/react component, rendered with react-dom/server to static HTML;
//   stylesheet         the compiled @carbon/styles CSS;
//   modeClass(modeKey) the Carbon theme class for a foundations Theme mode (white -> cds--white).
// A State whose Contract `code` is null (Hover, Active, Focus) renders like Enabled: To-preview forces it
// through the State's CSS pseudo-class.
//
// Packages come from preview/package.json and its lockfile, installed with `npm ci --ignore-scripts`
// into gitignored scratch: nothing from a package runs at install (@carbon/react has a telemetry
// postinstall). Downloads are untrusted data; only react-dom/server runs them, here, to render markup.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Computed here, not imported from sources.mjs: sources.mjs imports this module for its fetch step.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const PREVIEW_DIR = join(REPO_ROOT, '.scratch/adapter-carbon/preview');
const PINNED_DIR = fileURLToPath(new URL('../preview/', import.meta.url));
const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);

/** True when the pinned packages are installed in `dir` from the committed lockfile. */
export function hasPreviewPackages(dir = PREVIEW_DIR) {
  return lockOf(dir) === lockOf(PINNED_DIR) && existsSync(join(dir, 'node_modules/@carbon/react/package.json'));
}

/** Install the pinned packages into `dir` with `npm ci --ignore-scripts`. Skips when already installed. */
export function fetchPreviewPackages(dir = PREVIEW_DIR) {
  if (hasPreviewPackages(dir)) return dir;
  mkdirSync(dir, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(PINNED_DIR, f), join(dir, f));
  execFileSync('npm', ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  return dir;
}

// Carbon icon key to its @carbon/icons-react export: arrow--right -> ArrowRight.
const iconExport = key => key.split(/-+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');

/** The renderer for one Carbon Contract. Rejects when the installed packages differ from the Contract's pins. */
export async function previewRenderer(contract, { dir = PREVIEW_DIR } = {}) {
  if (!hasPreviewPackages(dir))
    throw new Error(`Carbon preview packages missing in ${dir}; run: node skills/adapter-carbon/scripts/preview.mjs`);
  const require = createRequire(join(dir, 'package.json'));
  const pinned = JSON.parse(readFileSync(join(PINNED_DIR, 'package.json'), 'utf8')).dependencies;
  for (const name of Object.keys(pinned)) {
    const want = contract.source.packages[name];
    const got = JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
    if (want && want !== got) throw new Error(`${name} ${got} is installed but the Contract pins ${want}`);
  }
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const library = require(contract.code.package);
  const icons = require('@carbon/icons-react');
  const Component = library[contract.code.component];
  if (!Component) throw new Error(`${contract.code.package} has no export ${contract.code.component}`);

  // Content properties: TEXT at its default; an icon swap shows the Contract's default icon (non-default
  // BOOLEANs on, as in the base-loop review specimen), so the icon slot is reviewed too. A Repeated child
  // (`code.items`, #93) renders as one item: each `itemProp` takes its property's default, and an item prop no
  // property shows repeats that text (SelectItem's value).
  const content = {};
  const item = {};
  let children;
  for (const p of contract.properties) {
    const code = p.code || {};
    if (p.type === 'TEXT' && code.itemProp) item[code.itemProp] = p.default;
    else if (p.type === 'TEXT' && code.prop === 'children') children = p.default;
    else if (p.type === 'TEXT' && code.prop) content[code.prop] = p.default;
    else if (p.type === 'INSTANCE_SWAP' && code.prop && code.valueFrom === 'icon') {
      const Icon = icons[iconExport(contract.icons.default)];
      if (!Icon) throw new Error(`@carbon/icons-react has no icon ${iconExport(contract.icons.default)}`);
      content[code.prop] = Icon;
    }
  }

  const items = contract.code.items;
  if (items) {
    const Item = library[items.component];
    if (!Item) throw new Error(`${contract.code.package} has no export ${items.component}`);
    const text = Object.values(item)[0] || 'Item';
    children = React.createElement(Item, Object.fromEntries(items.props.map(k => [k, k in item ? item[k] : text])));
  }

  return {
    stylesheet: readFileSync(join(dir, 'node_modules/@carbon/styles/css/styles.css'), 'utf8'),
    modeClass: mode => `cds--${mode}`,
    render(tuple) {
      // A required prop no axis or property sets (`code.required`, #93), such as id, gets a placeholder unique per tuple.
      const id = [contract.family.key, ...contract.axes.map(a => tuple[a.key])].join('-');
      const props = Object.fromEntries((contract.code.required || []).map(k => [k, id]));
      Object.assign(props, content);
      for (const axis of contract.axes) {
        const value = axis.values.find(v => v.key === tuple[axis.key]);
        if (!value) throw new Error(`unknown ${axis.key} value ${tuple[axis.key]}`);
        Object.assign(props, value.code || {});
      }
      return renderToStaticMarkup(React.createElement(Component, props, children));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : PREVIEW_DIR;
  try { fetchPreviewPackages(dir); console.log(`Carbon preview packages OK in ${dir}`); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
