#!/usr/bin/env node
// To-preview catalog generator (#33): one self-contained HTML page per Contract.
//   node skills/to-preview/scripts/catalog.mjs <component.json> [--foundations <file>] [--out <file>]
//
// - Specimens: the Contract's tuples, axes minus `excluded` (from the selection model, which expands
//   through the shared Contract module). Omitted tuples are rendered too and start unchecked.
// - Rendering: the Adapter's preview renderer, found by convention at
//   skills/adapter-<source.adapter>/scripts/preview.mjs (previewRenderer(contract) -> {render, stylesheet, modeClass}).
//   To-preview itself knows no Code Library.
// - A State value whose `code` is null is forced in the page through the CSS pseudo-class in its `css`.
// - Theme: a display-only toggle over the foundations document's multi-mode collection; the first mode
//   is the default, and export needs only that every checked specimen rendered in it.
// The foundations document defaults to the single *.foundations.json next to the contracts folder; the page
// defaults to .scratch/to-preview/<family>/index.html (gitignored).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as contractModule from '../../contract/scripts/contract.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const asset = name => readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8');
const Selection = createRequire(import.meta.url)('../assets/selection-model.js');

/** The catalog page for one Contract, as HTML text. Throws on an invalid Contract. */
export function buildCatalog({ contract, foundations, renderer }) {
  const { ok, errors } = contractModule.validate(contract, foundations);
  if (!ok) throw new Error(`invalid Contract:\n${errors.map(e => `  [rule ${e.rule}] ${e.message}`).join('\n')}`);

  const themed = foundations.collections.filter(c => c.modes.length > 1);
  if (themed.length > 1) throw new Error(`the theme toggle covers one multi-mode collection; found ${themed.map(c => c.key).join(', ')}`);
  const modes = themed.length ? themed[0].modes.map(m => ({ key: m.key, label: m.label, className: renderer.modeClass(m.key) })) : [];

  const forces = [];
  for (const axis of contract.axes)
    for (const value of axis.values) {
      if (value.code !== null) continue;
      const pseudo = typeof value.css === 'string' && (value.css.match(/^:[\w-]+/) || [])[0];
      if (!pseudo) throw new Error(`${axis.key} ${value.key} has no code props and no CSS pseudo-class to force it`);
      forces.push({ axis: axis.key, value: value.key, pseudo });
    }

  const specimens = {};
  for (const s of new Selection(contract, contractModule).specimens.values()) specimens[s.id] = renderer.render(s.tuple);

  const data = JSON.stringify({ contract, modes, forces, specimens }).replace(/</g, '\\u003c');
  // Inline the shared module as a classic script: strip `export` and expose what the page uses.
  const contractScript = `window.Contract = (function () {\n"use strict";\n${readFileSync(new URL('../../contract/scripts/contract.mjs', import.meta.url), 'utf8').replace(/^export /gm, '')}\nreturn { matches, expand, baseTuple, variantName, applyOmit };\n})();`;
  const script = text => `<script>\n${text.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  const page = asset('component-sheet-template.html')
    .replace('<title>Component preview</title>', () => `<title>${contract.family.name} preview</title>`)
    .replace('<!-- library-styles -->', () => `<style>\n${renderer.stylesheet.replace(/<\/style/gi, '<\\/style')}\n</style>`)
    .replace('<script src="./contract.js"></script>', () => script(contractScript))
    .replace('<script src="./selection-model.js"></script>', () => script(asset('selection-model.js')))
    .replace('<!-- catalog -->', () => `<script type="application/json" id="catalog">${data}</script>\n${script(
      'const catalog = JSON.parse(document.getElementById("catalog").textContent);\n' +
      'ComponentSheet.configure({ catalog, renderSpecimen: (specimen, host) => { host.innerHTML = catalog.specimens[specimen.id]; } });')}`);
  return page;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const contractPath = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!contractPath) {
    console.error('usage: catalog.mjs <component.json> [--foundations <file>] [--out <file>]');
    process.exit(2);
  }
  try {
    let foundationsPath = flag('--foundations');
    if (!foundationsPath) {
      const dsDir = resolve(dirname(contractPath), '..');
      const found = readdirSync(dsDir).filter(f => f.endsWith('.foundations.json'));
      if (found.length !== 1) throw new Error(`no single *.foundations.json in ${dsDir}; pass --foundations <file>`);
      foundationsPath = join(dsDir, found[0]);
    }
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    const foundations = JSON.parse(readFileSync(foundationsPath, 'utf8'));
    const adapter = join(REPO_ROOT, 'skills', `adapter-${contract.source.adapter}`, 'scripts', 'preview.mjs');
    const renderer = await (await import(pathToFileURL(adapter))).previewRenderer(contract);
    const out = flag('--out') || join(REPO_ROOT, '.scratch/to-preview', contract.family.key, 'index.html');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buildCatalog({ contract, foundations, renderer }));
    console.log(`${out}: ${contract.family.name}, ${contractModule.expand(contract).length} checked`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
