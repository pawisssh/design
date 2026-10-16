#!/usr/bin/env node
// PROTOTYPE (#88): render the shadcn/ui Button Contract through To-preview, with its Slot axis.
//   node prototypes/slot-styling/run.mjs
// Installs the pinned packages into .scratch/prototype-slot-styling (npm ci --ignore-scripts), validates the
// Contract, writes the catalog to .scratch/to-preview/button-shadcn-prototype/index.html and inlines
// window.__expected: per specimen, what resolve() says the Button measures, for the in-page check (check.js).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expand, resolve, tupleKey } from '../../skills/contract/scripts/contract.mjs';
import { buildCatalog } from '../../skills/to-preview/scripts/catalog.mjs';
import { PREVIEW_DIR, previewRenderer } from './preview.mjs';

const here = f => fileURLToPath(new URL(f, import.meta.url));
const REPO_ROOT = here('../../');
if (!existsSync(join(PREVIEW_DIR, 'node_modules/tailwindcss'))) {
  mkdirSync(PREVIEW_DIR, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(here(`./preview/${f}`), join(PREVIEW_DIR, f));
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: PREVIEW_DIR, stdio: 'inherit' });
}

const contract = JSON.parse(readFileSync(here('./button.component.json'), 'utf8'));
const foundations = JSON.parse(readFileSync(here('./shadcn.foundations.json'), 'utf8'));
const renderer = previewRenderer(contract);
let page = buildCatalog({ contract, foundations, renderer });

const px = v => (v && v.token !== undefined ? foundations.variables[v.token].values.default.value : v);
const expected = {};
for (const t of expand({ ...contract, selection: { ...contract.selection, omit: [] } })) {
  const { layout } = resolve(contract, t);
  const b = layout.Button;
  expected[tupleKey(contract, t)] = {
    paddingLeft: px(b.paddingLeft), paddingRight: px(b.paddingRight), height: px(b.height), width: px(b.width), gap: px(b.gap),
    icon: layout.Icon.visible, label: layout.Label.visible, iconSize: px(layout.Icon.width),
  };
}
page += (`<script>window.__expected = ${JSON.stringify(expected)};</script>\n<script>\n${readFileSync(here('./check.js'), 'utf8')}\n</script>\n`);
const out = join(REPO_ROOT, '.scratch/to-preview/button-shadcn-prototype/index.html');
mkdirSync(join(out, '..'), { recursive: true });
writeFileSync(out, page);
console.log(`${Object.keys(expected).length} specimens (omitted included); wrote ${out}`);
