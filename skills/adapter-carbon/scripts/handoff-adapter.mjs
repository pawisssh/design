// The Carbon Adapter's side of To-handoff (#112, spec #102 "Adapter interface"). To-handoff never names Carbon:
// it finds this module by convention (skills/adapter-<foundations source.adapter>/scripts/handoff-adapter.mjs)
// and reads only what it exports here.
import { hasPreviewPackages, previewRenderer } from './preview.mjs';

// The token groups (the Foundations variable name before "/") a value may match for each CSS role (#61).
// A hard filter: a page background never matches an AI aura or a Button token, whatever its value.
export const roleGroups = {
  'background-color': ['Background', 'Layer', 'Field', 'Support'],
  color: ['Text', 'Link', 'Icon'],
  'border-color': ['Border'],
  'outline-color': ['Focus', 'Border'],
  gap: ['Spacing'],
  padding: ['Spacing'],
  margin: ['Spacing'],
  'border-radius': ['Border radius'],
};

// The tokens the mode map compares a Prototype's surfaces against (#61 "mode map by page surface").
export const surfaces = { page: 'background', layer: 'layer-01' };

// The breakpoints the runtime reader screenshots each state at (#113): `breakpoints` of @carbon/layout 11.61.0
// (the pinned preview package), min-widths in px. The Foundations document carries no breakpoints, so the
// Adapter names them; skills/adapter-carbon/test/preview.test.mjs checks them against the package.
export const breakpoints = [
  { key: 'sm', width: 320 },
  { key: 'md', width: 672 },
  { key: 'lg', width: 1056 },
  { key: 'xlg', width: 1312 },
  { key: 'max', width: 1584 },
];

// The Contract-writing procedure To-handoff names for a family the Code Library ships with no Contract yet (#90).
// It is an agent step: follow the guide against the pinned source, then check the Contract.
export const contractProcedure = 'Write the Contract with skills/adapter-carbon/SKILL.md against the pinned Carbon source, then run node skills/contract/scripts/check.mjs';

/** True when the renderer's packages are installed (fetched by node skills/adapter-carbon/scripts/sources.mjs). */
export const available = () => hasPreviewPackages();

/** The per-Contract renderer: {stylesheet, modeClass(mode), render(tuple, properties)}. */
export const renderer = contract => previewRenderer(contract);
