#!/usr/bin/env node
// Vibe-to-Figma's review page (#177): one local page for a Design System folder. Its first tab is Foundations
// (colors, Text Styles), then one tab per Contract holding To-preview's own catalog page for it, unchanged, in an
// iframe. Drafted values show read-only; the owner changes them in chat. One export button writes every family's
// ticks to one file, <name>.review.json, which approve.mjs reads. Published as a private Artifact (#178), the page saves
// the ticks in the Artifact's db instead and restores them on a reload (assets/review-store.js).
//
//   node skills/vibe-to-figma/scripts/review.mjs design-systems/<name> --project <project> [--out <file>]
//
// Specimens render with the Adapter's preview renderer over the project (skills/adapter-<source.adapter>/scripts/
// preview.mjs, as To-preview's catalog finds it). The page defaults to .scratch/vibe-to-figma/<name>/review.html.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { draftedValue, expand, sha256 } from '../../contract/scripts/contract.mjs';
import { readJson } from '../../contract/scripts/io.mjs';
import { REPO_ROOT } from '../../to-handoff/scripts/system.mjs';
import { buildCatalog } from '../../to-preview/scripts/catalog.mjs';

const asset = name => readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8');

/** The folder's Foundations document path (its single *.foundations.json) and its Contracts' paths, by family. */
export function folderFiles(dir) {
  const found = readdirSync(dir).filter(f => f.endsWith('.foundations.json'));
  if (found.length !== 1) throw new Error(`${dir} has ${found.length} *.foundations.json files; a Design System folder has exactly one`);
  const contracts = {};
  for (const f of readdirSync(join(dir, 'contracts')).filter(f => f.endsWith('.component.json')).sort())
    contracts[f.slice(0, -'.component.json'.length)] = join(dir, 'contracts', f);
  return { foundations: join(dir, found[0]), contracts };
}

const lineHeight = l => (l.unit === 'PIXELS' ? `${l.value}px` : l.unit === 'PERCENT' ? `${l.value}%` : 'normal');

/**
 * reviewModel(dir) -> {designSystem, foundations: {documentHash, colors: {modes, variables}, textStyles}, families}.
 * `colors` is the COLOR variables of the first multi-mode collection (Theme) with each mode's resolved value;
 * `families` lists each Contract: {family, name, description, status, snapshotId, variants, drafted: [{key, value, by}]}.
 */
export function reviewModel(dir) {
  const files = folderFiles(dir);
  const text = readFileSync(files.foundations, 'utf8');
  const doc = JSON.parse(text);
  const theme = doc.collections.find(c => c.modes.length > 1) || doc.collections[0];
  const colors = {
    modes: theme.modes.map(m => ({ key: m.key, label: m.label })),
    variables: Object.entries(doc.variables).filter(([, v]) => v.type === 'COLOR' && v.collection === theme.key)
      .map(([key, v]) => ({ key, name: v.name, values: Object.fromEntries(theme.modes.map(m => [m.key, v.values[m.key].resolved])) })),
  };
  const textStyles = Object.entries(doc.textStyles).map(([key, s]) => ({
    key, name: s.name, fontFamily: s.fontFamily, fontStyle: s.fontStyle, fontSize: s.fontSize, lineHeight: lineHeight(s.lineHeight), fontWeight: s.fontWeight,
  }));
  const families = Object.entries(files.contracts).map(([family, path]) => {
    const c = readJson(path);
    if (c.family.key !== family) throw new Error(`${relative(dir, path)} holds the ${c.family.key} Contract`);
    return {
      family, name: c.family.name, description: c.family.description, status: c.selection.status, snapshotId: c.source.snapshotId, variants: expand(c).length,
      drafted: Object.entries(c.drafted || {}).map(([key, d]) => ({ key, value: draftedValue(c, key).value, by: d.by })),
    };
  });
  return { designSystem: doc.designSystem.key, foundations: { documentHash: `sha256:${sha256(text)}`, colors, textStyles }, families };
}

/**
 * buildReview({dir, renderer}) -> {html, model}. `renderer(contract)` returns (or resolves to) the Adapter's preview
 * renderer for that Contract, which To-preview's buildCatalog takes as it is.
 */
export async function buildReview({ dir, renderer }) {
  const model = reviewModel(dir);
  const files = folderFiles(dir);
  const foundations = readJson(files.foundations);
  const catalogs = {};
  for (const [family, path] of Object.entries(files.contracts)) {
    const contract = readJson(path);
    catalogs[family] = buildCatalog({ contract, foundations, renderer: await renderer(contract) });
  }
  const data = JSON.stringify({ model, tabs: ['foundations', ...Object.keys(catalogs)], catalogs }).replace(/</g, '\\u003c');
  const script = text => `<script>\n${text.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  const html = asset('review-template.html')
    .replace('<title>Design System review</title>', () => `<title>${model.designSystem} review</title>`)
    .replace('<!-- review -->', () => `<script type="application/json" id="review">${data}</script>`)
    .replace('<script src="./review-export.js"></script>', () => script(asset('review-export.js')))
    .replace('<script src="./review-store.js"></script>', () => script(asset('review-store.js')));
  return { html, model };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const usage = 'usage: review.mjs design-systems/<name> --project <project> [--out <file>]';
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { project: { type: 'string' }, out: { type: 'string' } } });
  } catch (e) {
    console.error(`${e.message}\n${usage}`);
    process.exit(2);
  }
  const { values: { project, out: outFlag }, positionals: [folder] } = args;
  if (!folder || !project) {
    console.error(usage);
    process.exit(2);
  }
  try {
    const dir = resolve(folder);
    const adapters = {};
    const renderer = async contract => {
      const a = contract.source.adapter;
      adapters[a] ??= await import(pathToFileURL(join(REPO_ROOT, 'skills', `adapter-${a}`, 'scripts', 'preview.mjs')));
      return adapters[a].previewRenderer(contract, { project: resolve(project) });
    };
    const { html, model } = await buildReview({ dir, renderer });
    const out = resolve(outFlag || join(REPO_ROOT, '.scratch/vibe-to-figma', model.designSystem, 'review.html'));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    console.log(`${relative(process.cwd(), out)}: Foundations, then ${model.families.map(f => `${f.family} ${f.variants}`).join(', ')} (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB)`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
