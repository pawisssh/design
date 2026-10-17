// The Generic Adapter's side of To-handoff (#125, spec #102 "Adapter interface"). To-handoff never names shadcn:
// it finds this module by convention (skills/adapter-<foundations source.adapter>/scripts/handoff-adapter.mjs)
// and reads only what it exports here.
import { validate } from '../../contract/scripts/contract.mjs';

// The token groups (the Foundations variable name before "/") a value may match for each CSS role (#61). The
// Theme collection is one Color group, so every colour role pools it; Chart, Sidebar and family tokens never match.
export const roleGroups = {
  'background-color': ['Color'],
  color: ['Color'],
  'border-color': ['Color'],
  'outline-color': ['Color'],
  gap: ['Spacing'],
  padding: ['Spacing'],
  margin: ['Spacing'],
  'border-radius': ['Radius'],
};

// The tokens the mode map compares a Prototype's surfaces against (#61 "mode map by page surface").
export const surfaces = { page: 'background', layer: 'card' };

// The breakpoints the runtime reader screenshots each state at (#113): the `--breakpoint-*` of the pinned
// tailwindcss 4.3.3 theme.css, min-widths in px. The Foundations document carries no Tailwind defaults, so the
// Adapter names them; test/handoff-adapter.test.mjs checks them against the package.
export const breakpoints = [
  { key: 'sm', width: 640 },
  { key: 'md', width: 768 },
  { key: 'lg', width: 1024 },
  { key: 'xl', width: 1280 },
  { key: '2xl', width: 1536 },
];

/**
 * The check a Contract written mid-run must pass before To-handoff uses it (#115): the shared Contract rules
 * against the Foundations document, and the snapshot the component step pins (SKILL.md "Component step"): the
 * document's adapter, Code Library and packages, every file it read outside the Code Library folder at the same
 * hash, and the family's own component file. Returns problem strings; none means it passes.
 */
export function checkContract(contract, foundations) {
  const out = validate(contract, foundations).errors.map(e => `[rule ${e.rule}] ${e.at ? `${e.at}: ` : ''}${e.message}`);
  const pin = foundations.source || {};
  const src = contract.source || {};
  const files = src.files || {};
  if (src.adapter !== 'generic') out.push(`source.adapter is ${JSON.stringify(src.adapter)}, not "generic"`);
  if (src.codeLibrary !== pin.codeLibrary) out.push(`source.codeLibrary is ${JSON.stringify(src.codeLibrary)}, not ${JSON.stringify(pin.codeLibrary)}`);
  for (const [name, version] of Object.entries(pin.packages || {}))
    if ((src.packages || {})[name] !== version) out.push(`source.packages ${name} is ${(src.packages || {})[name]}, not the pinned ${version}`);
  // `@/components/ui/button` is components/ui/button.tsx, in the Code Library folder components/ui/.
  const own = /^@\//.test((contract.code || {}).package || '') ? `${contract.code.package.slice(2)}.tsx` : null;
  const uiDir = own && own.slice(0, own.lastIndexOf('/') + 1);
  for (const [file, hash] of Object.entries(pin.files || {})) {
    if (uiDir && file.startsWith(uiDir) && file !== own) continue;
    if (!(file in files)) out.push(`source.files has no ${file}; the snapshot pins it`);
    else if (files[file] !== hash) out.push(`source.files ${file} is not the snapshot's ${hash}`);
  }
  if (!own) out.push(`code.package ${JSON.stringify((contract.code || {}).package)} is not a project file under "@/"`);
  else if (!(own in files)) out.push(`source.files has no ${own}, the family's own component file`);
  return out;
}

// ---------- the renderer (#123) ----------

// The Contract-writing procedure To-handoff names for a family the Code Library ships with no Contract yet (#90).
// It is an agent step: run the component step against the pinned project, then check the Contract.
export const contractProcedure = 'Write the Contract with the component step of skills/adapter-generic/SKILL.md (node skills/adapter-generic/scripts/components.mjs --family <key>), then run node skills/contract/scripts/check.mjs';

/** True when the renderer can run. The shadcn renderer is #123's; until it lands To-handoff renders nothing. */
export const available = () => false;

/** The per-Contract renderer: {stylesheet, modeClass(mode), render(tuple, properties)}. */
export const renderer = () => { throw new Error('the shadcn renderer is not built yet (#123)'); };
