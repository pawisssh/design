// The CDS Adapter's side of To-handoff (#388, spec #383 "Handoff Adapter"). To-handoff never names CDS: it finds this
// module by convention (skills/adapter-<foundations source.adapter>/scripts/handoff-adapter.mjs) and reads only what
// it exports here.
import { validate } from '../../contract/scripts/contract.mjs';
import { hasPreviewPackages, previewRenderer } from './preview.mjs';
import { CDS } from './sources.mjs';

// The token groups (the Foundations variable name before "/") a value may match for each CSS role (#61). Every colour
// role takes the Theme collection's semantic colours, which each variable's scopes narrow further; space and radius
// take the Layout collection's. Button's component tokens (group "Button") never match a region.
const THEME = ['Accent', 'Background', 'Elevation', 'Foreground', 'Line', 'Transparent'];
export const roleGroups = {
  'background-color': THEME,
  color: THEME,
  'border-color': THEME,
  'outline-color': THEME,
  gap: ['Spacing'],
  padding: ['Spacing'],
  margin: ['Spacing'],
  'border-radius': ['Border radius'],
};

// The tokens the mode map compares a Prototype's surfaces against (#61 "mode map by page surface").
export const surfaces = { page: 'bg', layer: 'bgAlternate' };

// The wrapper that sets a subtree's Theme mode (#228): `<ThemeProvider activeColorScheme="dark">`. `modes` maps each
// value of its `prop` to a Mode key of the Foundations document's Theme collection.
export const themeWrapper = { component: 'ThemeProvider', prop: 'activeColorScheme', modes: { light: 'light', dark: 'dark' } };

// The breakpoints the runtime reader screenshots each state at (#113): the media queries of the pinned cds-web 9.29.0
// esm/styles/responsive/{phone,tablet,desktop}.css, in px. Tablet and desktop are their query's min-width. Phone's
// query has only a max-width (767px) and starts at 0, so it is that max-width, the widest page CDS lays out as a phone.
// skills/adapter-cds/test/handoff-adapter.test.mjs reads them from the CSS by the same rule.
export const breakpoints = [
  { key: 'phone', width: 767 },
  { key: 'tablet', width: 768 },
  { key: 'desktop', width: 1280 },
];

// The Contract-writing procedure To-handoff names for a family CDS ships with no Contract yet (#90). It is an agent
// step: follow the guide against the pinned source, then check the Contract and its Drafted-value fingerprints.
export const contractProcedure = 'Write the <family> Contract and its node map skills/adapter-cds/nodes/<family>.nodes.json with '
  + 'skills/adapter-cds/SKILL.md §3 against the pinned CDS source, then run node skills/contract/scripts/check.mjs <draft.json> and '
  + 'node skills/adapter-cds/scripts/fingerprints.mjs <draft.json> --nodes skills/adapter-cds/nodes/<family>.nodes.json --check';

/**
 * The check a Contract written by `contractProcedure` must pass before To-handoff uses it (#115): the shared Contract
 * rules against the Foundations document, and the CDS pin's commit and every package it pins (cds-icons too, which the
 * Foundations document does not read). Returns problem strings; none means it passes.
 */
export function checkContract(contract, foundations) {
  const out = validate(contract, foundations).errors.map(e => `[rule ${e.rule}] ${e.at ? `${e.at}: ` : ''}${e.message}`);
  const src = contract.source || {};
  const packages = src.packages || {};
  if (src.adapter !== 'cds') out.push(`source.adapter is ${JSON.stringify(src.adapter)}, not "cds"`);
  if (src.commit !== CDS.commit) out.push(`source.commit ${src.commit} is not the pinned CDS commit ${CDS.commit}`);
  for (const [name, { version }] of Object.entries(CDS.packages))
    if (packages[name] !== version) out.push(`source.packages ${name} is ${packages[name]}, not the pinned ${version}`);
  return out;
}

/** True when the renderer's packages are installed (fetched by node skills/adapter-cds/scripts/sources.mjs). */
export const available = () => hasPreviewPackages();

/** The per-Contract renderer: {stylesheet, modeClass(mode), render(tuple, properties)}. */
export const renderer = contract => previewRenderer(contract);
