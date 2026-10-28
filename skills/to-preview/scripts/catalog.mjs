#!/usr/bin/env node
// To-preview catalog generator (#33): one self-contained HTML page per Contract.
//   node skills/to-preview/scripts/catalog.mjs <component.json> [--foundations <file>] [--out <file>]
//
// - Specimens: the Contract's tuples, axes minus `excluded` (from the selection model, which expands
//   through the shared Contract module). Omitted tuples are rendered too and start unchecked.
// - Rendering: the Adapter's preview renderer, found by convention at
//   skills/adapter-<source.adapter>/scripts/preview.mjs (previewRenderer(contract) -> {render, stylesheet, modeClass, chrome}).
//   To-preview itself knows no Code Library.
// - A State value whose `code` is null is forced in the page through the CSS pseudo-class in its `css`.
// - Cards (#45): see references/interactive-template.md. The footer's sourceLabel is the Contract's Code
//   Library package and its pinned version (`@carbon/react 1.118.0`).
// - Modes (#109): a display-only toggle per multi-mode collection of the foundations document (Theme, Layer),
//   each Mode applied as the one class its `selector` names (else the renderer's modeClass). Each collection's
//   first mode is the default, and export needs only that every checked specimen rendered in the defaults.
// The foundations document defaults to the single *.foundations.json next to the contracts folder; the page
// defaults to .scratch/to-preview/<family>/index.html (gitignored).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as contractModule from '../../contract/scripts/contract.mjs';
import { foundationsPathFor, readJson } from '../../contract/scripts/io.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const asset = name => readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8');
const Selection = createRequire(import.meta.url)('../assets/selection-model.js');

// The chrome's roles (#392), each the page's custom property `--tp-<role>`. The renderer's `chrome` gives each a CSS
// value, normally a var() its own stylesheet sets per Mode class, so the chrome follows the toggles. The first five
// are required; each later role falls back to the one it names.
const CHROME = { page: null, card: null, border: null, text: null, textSecondary: null,
  control: 'card', controlBorder: 'border', focus: 'text', warning: 'textSecondary', error: 'text' };
const property = role => `--tp-${role.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

/**
 * The style block that declares the chrome's custom properties. On every element of the page, not once on <body>, so
 * a var() resolves where it is used: a card's surface is its Layer's, and the Layer class sits inside <body>.
 */
function chromeStyle(chrome) {
  const required = Object.keys(CHROME).filter(role => !CHROME[role]);
  if (chrome === null || typeof chrome !== 'object')
    throw new Error(`the preview renderer returns no chrome: {${required.join(', ')}}, each a CSS value; see references/interactive-template.md`);
  for (const [role, value] of Object.entries(chrome)) {
    if (!(role in CHROME)) throw new Error(`chrome.${role} is not a chrome role; the roles are ${Object.keys(CHROME).join(', ')}`);
    if (typeof value !== 'string' || !value.trim() || /[;{}<>]/.test(value)) throw new Error(`chrome.${role} ${JSON.stringify(value)} is not one CSS value`);
  }
  for (const role of required) if (!(role in chrome)) throw new Error(`chrome.${role} is missing from the preview renderer's chrome`);
  const declarations = Object.entries(CHROME).map(([role, fallback]) => `${property(role)}:${chrome[role] || `var(${property(fallback)})`}`);
  return `<style id="tp-chrome">\n:where(.tp-page,.tp-page *){${declarations.join(';')}}\n</style>`;
}

/** The catalog page for one Contract, as HTML text. Throws on an invalid Contract. */
export function buildCatalog({ contract, foundations, renderer }) {
  const { ok, errors } = contractModule.validate(contract, foundations);
  if (!ok) throw new Error(`invalid Contract:\n${errors.map(e => `  [rule ${e.rule}] ${e.message}`).join('\n')}`);
  const chrome = chromeStyle(renderer.chrome);

  // One toggle per multi-mode collection, in document order (Theme, then Layer). A Mode applies as one class,
  // its `selector`; a Mode with none takes the renderer's class for its key.
  const classOf = (c, m) => {
    if (m.selector === undefined) return renderer.modeClass(m.key);
    if (!/^\.[A-Za-z_][\w-]*$/.test(m.selector)) throw new Error(`${c.key}/${m.key}: selector "${m.selector}" is not one class, and the page applies a Mode as one class`);
    return m.selector.slice(1);
  };
  const toggles = foundations.collections.filter(c => c.modes.length > 1)
    .map(c => ({ key: c.key, label: c.name, modes: c.modes.map(m => ({ key: m.key, label: m.label, className: classOf(c, m) })) }));

  const forces = [];
  for (const axis of contract.axes)
    for (const value of axis.values) {
      if (value.code !== null) continue;
      const pseudo = typeof value.css === 'string' && (value.css.match(/^:[\w-]+/) || [])[0];
      if (!pseudo) throw new Error(`${axis.key} ${value.key} has no code props and no CSS pseudo-class to force it`);
      forces.push({ axis: axis.key, value: value.key, pseudo });
    }

  const version = contract.source.packages[contract.code.package];
  if (!version) throw new Error(`source.packages pins no version of ${contract.code.package}`);
  const sourceLabel = `${contract.code.package} ${version}`;

  const specimens = {};
  for (const s of new Selection(contract, contractModule).specimens.values()) specimens[s.id] = renderer.render(s.tuple);

  const data = JSON.stringify({ contract, toggles, forces, sourceLabel, specimens }).replace(/</g, '\\u003c');
  // Inline the shared module as a classic script: strip `export` and expose what the page uses.
  const contractScript = `window.Contract = (function () {\n"use strict";\n${readFileSync(new URL('../../contract/scripts/contract.mjs', import.meta.url), 'utf8').replace(/^export /gm, '')}\nreturn { matches, expand, baseTuple, tupleKey, variantName, applyOmit, resolve };\n})();`;
  const script = text => `<script>\n${text.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  const page = asset('catalog-template.html')
    .replace('<title>Component preview</title>', () => `<title>${contract.family.name} preview</title>`)
    .replace('<!-- library-styles -->', () => `<style>\n${renderer.stylesheet.replace(/<\/style/gi, '<\\/style')}\n</style>`)
    .replace('<!-- chrome -->', () => chrome)
    .replace('<script src="./contract.js"></script>', () => script(contractScript))
    .replace('<script src="./selection-model.js"></script>', () => script(asset('selection-model.js')))
    .replace('<script src="./catalog-card.js"></script>', () => script(asset('catalog-card.js')))
    .replace('<!-- catalog -->', () => `<script type="application/json" id="catalog">${data}</script>\n${script(
      'const catalog = JSON.parse(document.getElementById("catalog").textContent);\n' +
      'Catalog.configure({ catalog, renderSpecimen: (specimen, host) => { host.innerHTML = catalog.specimens[specimen.id]; } });')}`);
  return page;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const usage = 'usage: catalog.mjs <component.json> [--foundations <file>] [--out <file>]';
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { foundations: { type: 'string' }, out: { type: 'string' } } });
  } catch (e) {
    console.error(`${e.message}\n${usage}`);
    process.exit(2);
  }
  const { values: { foundations: foundationsFlag, out: outFlag }, positionals: [contractPath] } = args;
  if (!contractPath) {
    console.error(usage);
    process.exit(2);
  }
  try {
    const contract = readJson(contractPath);
    const foundations = readJson(foundationsPathFor(contractPath, foundationsFlag));
    const adapter = join(REPO_ROOT, 'skills', `adapter-${contract.source.adapter}`, 'scripts', 'preview.mjs');
    const renderer = await (await import(pathToFileURL(adapter))).previewRenderer(contract);
    const out = outFlag || join(REPO_ROOT, '.scratch/to-preview', contract.family.key, 'index.html');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buildCatalog({ contract, foundations, renderer }));
    console.log(`${out}: ${contract.family.name}, ${contractModule.expand(contract).length} checked`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
