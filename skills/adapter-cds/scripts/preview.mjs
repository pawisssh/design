#!/usr/bin/env node
// CDS Web preview renderer for To-preview (#386).
//   node skills/adapter-cds/scripts/preview.mjs [--dir <dir>]   fetch the pinned packages into .scratch/adapter-cds/preview
//
// To-preview finds this module by convention (skills/adapter-<source.adapter>/scripts/preview.mjs) and calls
// previewRenderer(contract), which returns:
//   render(tuple, properties)  the real @coinbase/cds-web component, rendered with react-dom/server to static HTML,
//                      once per Theme Mode: each inside ThemeProvider (defaultTheme, that Mode's activeColorScheme)
//                      and MediaQueryProvider. CDS writes the scheme into the markup itself (ThemeProvider's inline
//                      theme variables, and the hover, pressed and disabled colours Interactable blends in JS), so
//                      a page class can only pick a subtree, not recolour one. A partial tuple takes each missing
//                      axis's default. Without `properties` it is the To-preview specimen (TEXT defaults, the
//                      default icon shown); with them it is a usage (To-handoff), as in the Carbon renderer;
//   stylesheet         CDS's CSS in its `@layer cds` order: global, defaultFont, responsive base/phone/tablet/desktop,
//                      the per-component CSS the bundle imported, then the icon font; with Inter and the
//                      CoinbaseIcons font inlined, and the rules that show one Mode's subtree;
//   modeClass(modeKey) the class that shows one Theme Mode (light -> cds-preview-light).
// A State whose Contract `code` is null (hover, active, focus) renders like enabled: To-preview forces it through
// the State's CSS pseudo-class.
//
// The component is bundled for SSR with esbuild: CDS components import their compiled .css, which Node can't
// load, so a plugin stubs each one and the metafile gives their import order. Packages come from
// preview/package.json and its lockfile, installed with `npm ci --ignore-scripts` into gitignored scratch, so
// nothing from a package runs at install. Downloads are untrusted data; only the bundle runs them, here, to render.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Computed here, not imported from sources.mjs: sources.mjs imports this module for its fetch step.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const PREVIEW_DIR = join(REPO_ROOT, '.scratch/adapter-cds/preview');
const PINNED_DIR = fileURLToPath(new URL('../preview/', import.meta.url));
const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);

/** True when the pinned packages are installed in `dir` from the committed lockfile. */
export function hasPreviewPackages(dir = PREVIEW_DIR) {
  return lockOf(dir) === lockOf(PINNED_DIR) && existsSync(join(dir, 'node_modules/@coinbase/cds-web/package.json'));
}

/** Install the pinned packages into `dir` with `npm ci --ignore-scripts`. Skips when already installed. */
export function fetchPreviewPackages(dir = PREVIEW_DIR) {
  if (hasPreviewPackages(dir)) return dir;
  mkdirSync(dir, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(PINNED_DIR, f), join(dir, f));
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  return dir;
}

// The Theme Modes of the CDS foundations document, each a ThemeProvider activeColorScheme.
const SCHEMES = ['light', 'dark'];
const modeClass = mode => {
  if (!SCHEMES.includes(mode)) throw new Error(`CDS has no colour scheme for the Theme Mode ${mode}; its Modes are ${SCHEMES.join(', ')}`);
  return `cds-preview-${mode}`;
};
// Light shows until a Mode class picks one. The subtrees are display:contents, so the specimen root's box is the
// component's own.
const MODE_CSS = `.cds-preview-scheme{display:contents}.cds-preview-scheme.dark,.cds-preview-dark .cds-preview-scheme.light{display:none}.cds-preview-dark .cds-preview-scheme.dark{display:contents}`;

// The module a Contract's `code.import` names: `import { Button } from '@coinbase/cds-web/buttons';`.
const importSpecifier = contract => {
  const m = /from\s+['"]([^'"]+)['"]/.exec(contract.code.import || '');
  if (!m || (m[1] !== contract.code.package && !m[1].startsWith(`${contract.code.package}/`)))
    throw new Error(`code.import must import from ${contract.code.package} or one of its subpaths, not: ${contract.code.import}`);
  return m[1];
};

const dataUri = (file, type) => `url(data:${type};base64,${readFileSync(file).toString('base64')})`;

// Inter, the font defaultTheme names (`--defaultFont-sans: 'Inter'`), from the pinned variable font: its Latin and
// Latin Extended faces, renamed to the family CDS asks for.
function interCss(dir) {
  const pkg = join(dir, 'node_modules/@fontsource-variable/inter');
  const faces = readFileSync(join(pkg, 'wght.css'), 'utf8').match(/\/\* inter-latin(?:-ext)?-wght-normal \*\/\s*@font-face\s*\{[^}]*\}/g) || [];
  if (faces.length !== 2) throw new Error(`@fontsource-variable/inter: expected the latin and latin-ext faces in wght.css, found ${faces.length}`);
  return faces.map(f => f.replace(/'Inter Variable'/, "'Inter'").replace(/url\(\.\/([^)]+)\)/, (_, p) => dataUri(join(pkg, p), 'font/woff2'))).join('\n');
}

// CDS's stylesheet: what a CDS app loads before its components (cds-web's globalStyles and defaultFontStyles,
// then the responsive style props), the per-component CSS in import order, then the icon font.
function cdsCss(dir, componentCss) {
  const web = join(dir, 'node_modules/@coinbase/cds-web/esm');
  const first = ['styles/global.css', 'styles/defaultFont.css', ...['base', 'phone', 'tablet', 'desktop'].map(b => `styles/responsive/${b}.css`)].map(p => join(web, p));
  const iconFont = join(dir, 'node_modules/@coinbase/cds-icons/esm/fonts/web/icon-font.css');
  const fontCss = readFileSync(iconFont, 'utf8').replace(/url\('\.\/([^']+)'\)/g, (_, p) => dataUri(join(dirname(iconFont), p), 'font/woff2'));
  return [...first, ...componentCss.filter(f => !first.includes(f))]
    .map(f => `/* ${relative(join(dir, 'node_modules'), f)} */\n${readFileSync(f, 'utf8')}`)
    .concat(`/* @coinbase/cds-icons/esm/fonts/web/icon-font.css */\n${fontCss}`).join('\n');
}

/**
 * Bundle the Contract's import with React, react-dom/server and CDS's providers, for Node, every `.css` import
 * stubbed. Returns the loaded bundle and the stubbed `.css` files in import order (a post-order walk of the
 * metafile, whose imports are in source order, so a module's dependencies' CSS comes before its own).
 */
async function bundle(dir, specifier, component) {
  if (!/^[A-Za-z_$][\w$]*$/.test(component)) throw new Error(`code.component ${component} is not an export name`);
  const require = createRequire(join(dir, 'package.json'));
  const esbuild = require('esbuild');
  const entry = [
    "import * as React from 'react';",
    "export { React };",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { MediaQueryProvider, ThemeContext, ThemeProvider } from '@coinbase/cds-web/system';",
    "export { createThemeCssVars } from '@coinbase/cds-web/core/createThemeCssVars';",
    "export { defaultTheme } from '@coinbase/cds-web/themes/defaultTheme';",
    "export { glyphMap } from '@coinbase/cds-icons/glyphMap';",
    // The one export, so the bundle (and so the CSS) holds only what the component imports.
    `export { ${component} as Component } from ${JSON.stringify(specifier)};`,
  ].join('\n');
  const stubCss = {
    name: 'stub-css',
    setup(build) {
      build.onResolve({ filter: /\.css$/ }, args => ({ path: join(args.resolveDir, args.path), namespace: 'cds-css', sideEffects: true }));
      build.onLoad({ filter: /.*/, namespace: 'cds-css' }, () => ({ contents: '', loader: 'js' }));
    },
  };
  const outfile = join(dir, '.bundle', `${specifier.replace(/[^\w]+/g, '_')}.cjs`);
  const { metafile } = await esbuild.build({
    stdin: { contents: entry, resolveDir: dir, sourcefile: 'cds-preview-entry.js' }, absWorkingDir: dir,
    bundle: true, platform: 'node', format: 'cjs', outfile, metafile: true, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' }, plugins: [stubCss],
  });
  // Only the CSS of modules the bundle kept: a tree-shaken module's CSS is not loaded, as in an app's bundler. The
  // walk still passes through modules that only re-export (`buttons/index.js`), which the output does not list.
  const kept = Object.values(metafile.outputs)[0].inputs;
  const css = [];
  const seen = new Set();
  const visit = key => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const { path, external } of metafile.inputs[key].imports)
      if (external) continue;
      else if (!path.startsWith('cds-css:')) visit(path);
      else if (key in kept && !css.includes(path.slice('cds-css:'.length))) css.push(path.slice('cds-css:'.length));
  };
  visit('cds-preview-entry.js');
  delete require.cache[outfile];
  return { lib: require(outfile), css };
}

/** The renderer for one CDS Contract. Rejects when the installed packages differ from the Contract's pins. */
export async function previewRenderer(contract, { dir = PREVIEW_DIR } = {}) {
  if (!hasPreviewPackages(dir))
    throw new Error(`CDS preview packages missing in ${dir}; run: node skills/adapter-cds/scripts/preview.mjs`);
  const pinned = JSON.parse(readFileSync(join(PINNED_DIR, 'package.json'), 'utf8')).dependencies;
  for (const name of Object.keys(pinned)) {
    const want = contract.source.packages[name];
    const got = JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
    if (want && want !== got) throw new Error(`${name} ${got} is installed but the Contract pins ${want}`);
  }
  const specifier = importSpecifier(contract);
  const { lib, css } = await bundle(dir, specifier, contract.code.component);
  const { React, renderToStaticMarkup, ThemeContext, ThemeProvider, MediaQueryProvider, createThemeCssVars, defaultTheme, glyphMap, Component } = lib;
  if (!Component) throw new Error(`${specifier} has no export ${contract.code.component}`);

  // A CDS icon is a name (`startIcon="add"`), drawn from the CoinbaseIcons font.
  const iconFor = value => {
    const key = value === 'icon:default' ? contract.icons.default : String(value).replace(/^icon:/, '');
    if (!glyphMap[`${key}-16-inactive`] && !glyphMap[`${key}-24-inactive`]) throw new Error(`@coinbase/cds-icons has no icon ${key}`);
    return key;
  };
  // Content props for one render, as in the Carbon renderer. The specimen (no `properties`) shows TEXT defaults and
  // the Contract's default icon (non-default BOOLEANs on), so the icon slot is reviewed too. A usage takes each
  // property from `properties` by key, else its Contract default: a BOOLEAN that gates a swap (`visibleWhen`) hides
  // it when false, and `whenFalse: "omit"` drops the prop.
  const contentFor = (properties, tuple) => {
    const specimen = properties === undefined;
    const value = p => (specimen ? (p.type === 'BOOLEAN' ? !p.default : p.default) : p.key in properties ? properties[p.key] : p.default);
    const props = {};
    let children;
    const swapProps = contract.properties.filter(p => p.type === 'INSTANCE_SWAP' && p.code && p.code.prop).map(p => p.code.prop);
    for (const p of contract.properties) {
      const code = p.code || {};
      if (!code.prop) continue;
      const v = value(p);
      if (p.type === 'TEXT') {
        if (code.prop === 'children') children = v;
        else props[code.prop] = v;
      } else if (p.type === 'INSTANCE_SWAP' && code.valueFrom === 'icon') {
        const gate = code.visibleWhen && contract.properties.find(x => x.key === code.visibleWhen);
        if ((specimen || !gate || value(gate)) && v) props[code.prop] = iconFor(v);
      } else if (p.type === 'BOOLEAN' && swapProps.indexOf(code.prop) < 0) {
        if (v || code.whenFalse !== 'omit') props[code.prop] = v;
      }
    }
    for (const prop of (contract.code && contract.code.required) || [])
      if (!(prop in props) && !(prop === 'children' && children !== undefined))
        props[prop] = !specimen && prop in properties ? properties[prop] : `${contract.family.key}-${contract.axes.map(a => tuple[a.key]).join('-')}`;
    return { props, children };
  };

  const h = React.createElement;
  // Each scheme's theme as ThemeProvider builds it (read back from ThemeContext), and the theme variables it would
  // write inline, as one rule. A specimen's ThemeProvider sits in a ThemeContext holding that same theme, so
  // it writes only what differs (`--activeColorScheme`): one copy of the ~12 KB of variables per page, not two per
  // specimen.
  const themes = {};
  for (const scheme of SCHEMES) {
    const Capture = () => void (themes[scheme] = React.useContext(ThemeContext)) || null;
    renderToStaticMarkup(h(ThemeProvider, { theme: defaultTheme, activeColorScheme: scheme }, h(Capture)));
  }
  const themeCss = SCHEMES.map(scheme =>
    `.cds-preview-scheme.${scheme}{${Object.entries(createThemeCssVars(themes[scheme])).map(([k, v]) => `${k}:${v}`).join(';')}}`).join('\n');
  return {
    stylesheet: [interCss(dir), cdsCss(dir, css), themeCss, MODE_CSS].join('\n'),
    modeClass,
    render(tuple, properties) {
      const full = {};
      for (const axis of contract.axes) full[axis.key] = tuple[axis.key] === undefined ? axis.default : tuple[axis.key];
      const { props, children } = contentFor(properties, full);
      for (const axis of contract.axes) {
        const value = axis.values.find(v => v.key === full[axis.key]);
        if (!value) throw new Error(`unknown ${axis.key} value ${full[axis.key]}`);
        Object.assign(props, value.code || {});
      }
      const schemes = SCHEMES.map(scheme => h(ThemeContext.Provider, { key: scheme, value: themes[scheme] },
        h(ThemeProvider, { theme: defaultTheme, activeColorScheme: scheme, className: 'cds-preview-scheme' },
          h(MediaQueryProvider, null, h(Component, props, children)))));
      return renderToStaticMarkup(h('div', { className: 'cds-preview' }, schemes));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : PREVIEW_DIR;
  try { fetchPreviewPackages(dir); console.log(`CDS preview packages OK in ${dir}`); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
