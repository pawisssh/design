#!/usr/bin/env node
// Carbon React preview renderer for To-preview (#33).
//   node skills/adapter-carbon/scripts/preview.mjs [--dir <dir>]   fetch the pinned packages into .scratch/adapter-carbon/preview
//
// To-preview finds this module by convention (skills/adapter-<source.adapter>/scripts/preview.mjs) and calls
// previewRenderer(contract), which returns:
//   render(tuple, properties)  the real @carbon/react component, rendered with react-dom/server to static HTML;
//                      a partial tuple takes each missing axis's default. Without `properties` it is the
//                      To-preview specimen (TEXT defaults, the default icon shown); with them it is a usage
//                      (To-handoff): Contract property keys give the content, each missing key takes its
//                      Contract default, and `code.required` props come from `properties[prop]` or a placeholder;
//   stylesheet         the compiled @carbon/styles CSS, its IBM Plex faces embedded (plexCss);
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
import { codeProps, contentProps } from '../../contract/scripts/contract.mjs';
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

// @carbon/styles loads IBM Plex from IBM's CDN, which an Artifact's content security policy blocks (#521). The faces
// of the families Carbon's components set, IBM Plex Sans and Mono, in the Latin1 and Pi subsets (Pi has the arrows,
// ≈ and ✓ a Rendering shows) are embedded from the pinned @ibm/plex-* packages; every other CDN face goes, and its
// text falls back to the system font.
const PLEX_FACES = 24;
const KEPT_FACE = /url\("https:\/\/1\.www\.s81c\.com\/common\/carbon\/plex\/fonts\/IBM-Plex-(Sans|Mono)\/fonts\/split\/woff2\/([\w-]+-(?:Latin1|Pi)\.woff2)"\)/;
function plexCss(css, dir) {
  let kept = 0;
  const out = css.replace(/@font-face \{[^}]*s81c\.com[^}]*\}\n?/g, face => {
    const m = KEPT_FACE.exec(face);
    if (!m) return '';
    kept++;
    const font = readFileSync(join(dir, 'node_modules/@ibm', `plex-${m[1].toLowerCase()}`, 'fonts/split/woff2', m[2]));
    return face.replace(m[0], `url("data:font/woff2;base64,${font.toString('base64')}")`);
  });
  if (kept !== PLEX_FACES) throw new Error(`@carbon/styles: expected ${PLEX_FACES} IBM Plex Sans and Mono Latin1 and Pi faces, found ${kept}`);
  return out;
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

  const iconFor = value => {
    const key = value === 'icon:default' ? contract.icons.default : String(value).replace(/^icon:/, '');
    const Icon = icons[iconExport(key)];
    if (!Icon) throw new Error(`@carbon/icons-react has no icon ${iconExport(key)}`);
    return Icon;
  };
  // Content props for one render (contract.mjs's contentProps). A Repeated child (`code.items`, #93) renders once:
  // each `itemProp` takes its property's value, and a child prop no property shows repeats that text (SelectItem's
  // value).
  const repeated = contract.code.items;
  const Child = repeated && library[repeated.component];
  if (repeated && !Child) throw new Error(`${contract.code.package} has no export ${repeated.component}`);
  const contentFor = (properties, tuple) => {
    const specimen = properties === undefined;
    const { props, children: text, value } = contentProps(contract, properties, iconFor);
    let children = text;
    if (repeated) {
      const childProps = Object.fromEntries(contract.properties.filter(p => p.type === 'TEXT' && p.code && p.code.itemProp)
        .map(p => [p.code.itemProp, value(p)]));
      const text = Object.values(childProps)[0];
      children = React.createElement(Child, Object.fromEntries(repeated.props.map(k => [k, k in childProps ? childProps[k] : text])));
    }
    for (const prop of (contract.code && contract.code.required) || [])
      if (!(prop in props) && !(prop === 'children' && children !== undefined))
        props[prop] = !specimen && prop in properties ? properties[prop] : `${contract.family.key}-${contract.axes.map(a => tuple[a.key]).join('-')}`;
    return { props, children };
  };

  return {
    stylesheet: plexCss(readFileSync(join(dir, 'node_modules/@carbon/styles/css/styles.css'), 'utf8'), dir),
    modeClass: mode => `cds--${mode}`,
    // The catalog chrome's colours (#392), the tokens it always used: the page is --cds-layer-01 (gray in White) and a
    // card the surface Carbon designs components on, which follows the Layer Mode. A Theme class sets each token.
    chrome: {
      page: 'var(--cds-layer-01)', card: 'var(--cds-layer-background, var(--cds-background))', border: 'var(--cds-border-subtle-01)',
      text: 'var(--cds-text-primary)', textSecondary: 'var(--cds-text-secondary)', control: 'var(--cds-field-02)',
      controlBorder: 'var(--cds-border-strong-01)', focus: 'var(--cds-focus)', warning: 'var(--cds-support-warning)', error: 'var(--cds-text-error)',
    },
    render(tuple, properties) {
      const { tuple: full, props: axisProps } = codeProps(contract, tuple);
      const { props, children } = contentFor(properties, full);
      Object.assign(props, axisProps);
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
