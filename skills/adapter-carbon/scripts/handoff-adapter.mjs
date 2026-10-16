// The Carbon Adapter's side of To-handoff (#112, spec #102 "Adapter interface"). To-handoff never names Carbon:
// it finds this module by convention (skills/adapter-<foundations source.adapter>/scripts/handoff-adapter.mjs)
// and reads only what it exports here.
import { validate } from '../../contract/scripts/contract.mjs';
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

// The Contract-writing procedure To-handoff names for a family the Code Library ships with no Contract yet (#90).
// It is an agent step: follow the guide against the pinned source, then check the Contract.
export const contractProcedure = 'Write the Contract with skills/adapter-carbon/SKILL.md against the pinned Carbon source, then run node skills/contract/scripts/check.mjs';

/** True when the renderer's packages are installed (fetched by node skills/adapter-carbon/scripts/sources.mjs). */
/**
 * The check a Contract written by `contractProcedure` must pass before To-handoff uses it (#115): the shared
 * Contract rules against the Foundations document, and the Carbon pin, which the foundations step also refuses
 * to move per Contract. Returns problem strings; none means it passes.
 */
export function checkContract(contract, foundations) {
  const out = validate(contract, foundations).errors.map(e => `[rule ${e.rule}] ${e.at ? `${e.at}: ` : ''}${e.message}`);
  const pin = foundations.source || {};
  const src = contract.source || {};
  if (src.adapter !== 'carbon') out.push(`source.adapter is ${JSON.stringify(src.adapter)}, not "carbon"`);
  if (src.commit !== pin.commit) out.push(`source.commit ${src.commit} is not the Design System's Carbon pin ${pin.commit}`);
  for (const [name, version] of Object.entries(pin.packages || {}))
    if ((src.packages || {})[name] !== version) out.push(`source.packages ${name} is ${(src.packages || {})[name]}, not the pinned ${version}`);
  return out;
}

export const available = () => hasPreviewPackages();

/** The per-Contract renderer: {stylesheet, modeClass(mode), render(tuple, properties)}. */
export const renderer = contract => previewRenderer(contract);
