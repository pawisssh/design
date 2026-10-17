// The Generic Adapter's side of To-handoff (#123, spec #102 "Adapter interface"). To-handoff never names shadcn:
// it finds this module by convention (skills/adapter-<foundations source.adapter>/scripts/handoff-adapter.mjs)
// and reads only what it exports here.
import { validate } from '../../contract/scripts/contract.mjs';
import { hasPreviewPackages, previewRenderer } from './preview.mjs';
import { hasTools } from './sources.mjs';

// The token groups (the Foundations variable name before "/") a value may match for each CSS role (#61).
// A hard filter: a page background never matches a chart colour or a Synthesized Button token, whatever its value.
export const roleGroups = {
  'background-color': ['Color', 'Sidebar'],
  color: ['Color', 'Sidebar'],
  'border-color': ['Color', 'Sidebar'],
  'outline-color': ['Color', 'Sidebar'],
  gap: ['Spacing'],
  padding: ['Spacing'],
  margin: ['Spacing'],
  'border-radius': ['Radius'],
};

// The tokens the mode map compares a Prototype's surfaces against (#61 "mode map by page surface").
export const surfaces = { page: 'background', layer: 'card' };

// The breakpoints the runtime reader screenshots each state at (#113): Tailwind's `--breakpoint-*` theme variables
// in the pinned tailwindcss 4.3.3 theme.css, which the project's CSS imports unchanged, in px (1rem = 16px).
// skills/adapter-generic/test/handoff-adapter.test.mjs checks them against the package.
export const breakpoints = [
  { key: 'sm', width: 640 },
  { key: 'md', width: 768 },
  { key: 'lg', width: 1024 },
  { key: 'xl', width: 1280 },
  { key: '2xl', width: 1536 },
];

// The Contract-writing procedure To-handoff names for a family the project has with no Contract yet (#90): the
// component step, which asks for its Drafted values, then the shared check.
export const contractProcedure = 'Run node skills/adapter-generic/scripts/components.mjs --family <family> and draft the values it requests (skills/adapter-generic/SKILL.md), then run node skills/contract/scripts/check.mjs';

/**
 * The check a Contract written by `contractProcedure` must pass before To-handoff uses it: the shared Contract
 * rules against the Foundations document, and the Design System's pins, the packages and every project file both
 * hash. A family's own component file may be one the Foundations document never read. Returns problem strings.
 */
export function checkContract(contract, foundations) {
  const out = validate(contract, foundations).errors.map(e => `[rule ${e.rule}] ${e.at ? `${e.at}: ` : ''}${e.message}`);
  const pin = foundations.source || {};
  const src = contract.source || {};
  if (src.adapter !== 'generic') out.push(`source.adapter is ${JSON.stringify(src.adapter)}, not "generic"`);
  for (const [name, version] of Object.entries(pin.packages || {}))
    if ((src.packages || {})[name] !== version) out.push(`source.packages ${name} is ${(src.packages || {})[name]}, not the pinned ${version}`);
  for (const [file, hash] of Object.entries(src.files || {}))
    if ((pin.files || {})[file] && pin.files[file] !== hash) out.push(`source.files ${file} is ${hash}, not the Design System's snapshot ${pin.files[file]}`);
  return out;
}

/** True when the renderer's tools and packages are installed (node skills/adapter-generic/scripts/sources.mjs). */
export const available = () => hasTools() && hasPreviewPackages();

/** The per-Contract renderer: {stylesheet, modeClass(mode), render(tuple, properties)}. */
export const renderer = contract => previewRenderer(contract);
