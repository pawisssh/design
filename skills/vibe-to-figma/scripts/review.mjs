#!/usr/bin/env node
// Vibe-to-Figma's review page (#177): one local page for a Design System folder. Its first tab is Foundations
// (colors, Text Styles; an Extracted Library's folder puts a Families tab before it, #262), then one tab per Contract holding To-preview's own catalog page for it, unchanged, in an
// iframe. Drafted values show read-only; the owner changes them in chat. One export button writes every family's
// ticks to one file, <name>.review.json, which approve.mjs reads. Published as a private Artifact (#178), the page saves
// the ticks in the Artifact's db instead and restores them on a reload (assets/review-store.js).
// Only a draft Contract is on the page (#180): an approved one keeps its approval and is not reviewed again, so after a
// rerun of folder.mjs the page holds the families whose code changed. A Foundations document the owner's last approve
// did not cover (its Foundations approval, <name>.foundations-approval.json) is on the page even with no draft: then
// the page is its Foundations tab alone. With no draft and the Foundations document approved there is nothing to
// review: the CLI says so and writes no page.
//
//   node skills/vibe-to-figma/scripts/review.mjs design-systems/<name> --project <project> [--out <file>]
//
// Specimens render with the Adapter's preview renderer over the project (skills/adapter-<source.adapter>/scripts/
// preview.mjs, as To-preview's catalog finds it). The page defaults to .scratch/vibe-to-figma/<name>/review.html.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { draftedValue, expand, sha256 } from '../../contract/scripts/contract.mjs';
import { readJson } from '../../contract/scripts/io.mjs';
import { REPO_ROOT } from '../../to-handoff/scripts/system.mjs';
import { buildCatalog } from '../../to-preview/scripts/catalog.mjs';

const asset = name => readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8');

/**
 * The folder's Foundations document path (its single <name>.foundations.json), its Foundations approval's path
 * (<name>.foundations-approval.json, which approve.mjs writes) and its Contracts' paths, by family.
 */
export function folderFiles(dir) {
  const found = readdirSync(dir).filter(f => f.endsWith('.foundations.json'));
  if (found.length !== 1) throw new Error(`${dir} has ${found.length} *.foundations.json files; a Design System folder has exactly one`);
  const contracts = {};
  for (const f of readdirSync(join(dir, 'contracts')).filter(f => f.endsWith('.component.json')).sort())
    contracts[f.slice(0, -'.component.json'.length)] = join(dir, 'contracts', f);
  const name = found[0].slice(0, -'.foundations.json'.length);
  return { foundations: join(dir, found[0]), approval: join(dir, `${name}.foundations-approval.json`), contracts };
}

/**
 * The folder's Foundations approval, {designSystem, documentHash, by, at}: the Foundations document the owner's last
 * approve covered, or null when approve has not run since this record was added. The document itself carries no
 * approval (it is a pure function of its inputs), so this record says which one the owner saw.
 */
export const foundationsApproval = dir => {
  const { approval } = folderFiles(dir);
  return existsSync(approval) ? readJson(approval) : null;
};

const lineHeight = l => (l.unit === 'PIXELS' ? `${l.value}px` : l.unit === 'PERCENT' ? `${l.value}%` : 'normal');

/**
 * The Families tab's data (#262): {families: [{family, tag, by, evidence, description, sites: [{file, line, path, tag,
 * snippet}], axes: [{id, key, label, default, values: [{id, key, label, classes, sites: ['file:line']}]}]}], unmatched:
 * [{file, line, path, tag, snippet, reason}], skipped: [{site, tag, snippet, reason}]}, read from the report path A's folder
 * step writes beside the Foundations document (<name>.families-report.json), or null for a folder with none: a shadcn
 * folder has no such tab.
 */
function extractedOf(dir, files) {
  const path = join(dir, `${basename(files.foundations).slice(0, -'.foundations.json'.length)}.families-report.json`);
  if (!existsSync(path)) return null;
  const report = readJson(path);
  return { families: Object.entries(report.families).map(([family, f]) => ({ family, ...f })), unmatched: report.unmatched, skipped: report.skipped };
}

/**
 * reviewModel(dir) -> {designSystem, foundations: {documentHash, approved, colors: {modes, variables}, textStyles},
 * [extracted], families, kept}. `extracted` is the Families tab's data, only for an Extracted Library (extractedOf). `approved` says the folder's Foundations approval covers this document.
 * `colors` is the COLOR variables of the first multi-mode collection (Theme) with each mode's resolved value;
 * `families` lists each draft Contract, the ones on the page: {family, name, description, status, snapshotId, variants,
 * drafted: [{key, value, by}]}. `kept` lists the approved ones, which keep their approval and are not reviewed again.
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
  const families = [], kept = [];
  for (const [family, path] of Object.entries(files.contracts)) {
    const c = readJson(path);
    if (c.family.key !== family) throw new Error(`${relative(dir, path)} holds the ${c.family.key} Contract`);
    if (c.selection.status === 'approved') { kept.push(family); continue; }
    families.push({
      family, name: c.family.name, description: c.family.description, status: c.selection.status, snapshotId: c.source.snapshotId, variants: expand(c).length,
      drafted: Object.entries(c.drafted || {}).map(([key, d]) => ({ key, value: draftedValue(c, key).value, by: d.by })),
    });
  }
  const documentHash = `sha256:${sha256(text)}`;
  const extracted = extractedOf(dir, files);
  const approval = foundationsApproval(dir);
  const approved = !!approval && approval.designSystem === doc.designSystem.key && approval.documentHash === documentHash;
  return { designSystem: doc.designSystem.key, foundations: { documentHash, approved, colors, textStyles }, ...(extracted && { extracted }), families, kept };
}

/**
 * buildReview({dir, renderer}) -> {html, model}, or {html: null, model} when no Contract is a draft and the Foundations
 * document is the approved one (nothing to review). `renderer(contract)` returns (or resolves to) the Adapter's preview renderer for that Contract, which
 * To-preview's buildCatalog takes as it is.
 */
export async function buildReview({ dir, renderer }) {
  const model = reviewModel(dir);
  if (!model.families.length && model.foundations.approved) return { html: null, model };
  const files = folderFiles(dir);
  const foundations = readJson(files.foundations);
  const catalogs = {};
  for (const { family } of model.families) {
    const contract = readJson(files.contracts[family]);
    catalogs[family] = buildCatalog({ contract, foundations, renderer: await renderer(contract) });
  }
  const data = JSON.stringify({ model, tabs: [...(model.extracted ? ['families'] : []), 'foundations', ...Object.keys(catalogs)], catalogs }).replace(/</g, '\\u003c');
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
    if (!html) {
      console.log(`nothing to review: every Contract is approved (${model.kept.join(', ')}) and so is the Foundations document, so no page is written\nOK`);
      process.exit(0);
    }
    const out = resolve(outFlag || join(REPO_ROOT, '.scratch/vibe-to-figma', model.designSystem, 'review.html'));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    const tabs = model.families.length ? `Foundations, then ${model.families.map(f => `${f.family} ${f.variants}`).join(', ')}`
      : 'Foundations only: no approve covers this Foundations document, and every Contract is approved';
    console.log(`${relative(process.cwd(), out)}: ${tabs} (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB)${model.kept.length ? `; kept approved, not reviewed again: ${model.kept.join(', ')}` : ''}`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
