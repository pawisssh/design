#!/usr/bin/env node
// The Generic Adapter's component step (#119): a shadcn/ui component family's draft Contract, read from its source
// (source.mjs) and Tailwind's compiled CSS (cascade.mjs), with the agent tier's Drafted values (drafts.mjs, #122).
// Never edit its output by hand.
//
//   node skills/adapter-generic/scripts/components.mjs --family <key> [--project <dir>] [--foundations <file>]
//     [--tools <dir>] [-o <file>] [--drafts <file>] [--requests <file>] [--rewrite]
//
// The Contract at -o, when there is one, is the prior: its Drafted values are carried while their fingerprints hold.
// A reopened or missing one is taken from --drafts ({"family", "drafts": {key: value}}); while one has no value, the
// CLI writes the requests (default .scratch/adapter-generic/drafts/<family>.requests.json), no Contract, and exits 2.
// On the prior's snapshot with every Drafted value settled it writes nothing, so an approval stands; --rewrite
// writes anyway, to apply a change of the Adapter's own rules.
//
// Defaults: the committed fixture project (sources.mjs FIXTURE), its Foundations document
// design-systems/shadcn/shadcn.foundations.json, output design-systems/shadcn/contracts/<family>.component.json.
// The Contract is checked with contract.mjs validate and written with io.mjs writeJson; two runs from the same
// drafts are byte-identical.
//
// What it reads, for the family's root component (the export named after the family, else the file's one exported
// component, #154; or that export's Trigger when it renders a primitive's Root with no classes, as Select does, #153):
// - axes: each cva variant axis, then an axis per attribute state the CSS styles (ATTR_AXES), then the canonical
//   State from the CSS pseudo-classes. Every axis is fully selected. A root with no cva (Card) is one variant, its
//   own className; a prop it sets an attribute from that no axis reads (`data-size={size}`) keeps its default, and
//   the utilities under its other values are a note (#123).
// - Slot axes (#121, ADR 0011): a slot whose presence (`has-data-[icon=inline-start]:pl-2`, compiled to
//   `:has([data-icon="inline-start"])`) changes the root is an axis over a FRAME the root holds, shown where the slot
//   is filled and sized by the svg size utilities (`[&_svg:not([class*='size-'])]:size-4`). A `data-slot` naming a
//   part (`has-data-[slot=card-footer]:pb-0`) is an axis over that part's frame.
// - parts (#123): the other exported components (CardHeader), each a FRAME under the root in source order, named by
//   its data-slot and sized by its own width and height utilities or by how the root lays it out. A part positioned
//   out of the flow (`absolute`) is left out, with a note.
// - layout and paint of the root node, per variant: the cva classes each variant renders, merged as `cn()` merges
//   them, then the CSS cascade over their compiled rules (specificity, then output order). A flex root, a grid
//   with no columns read as a column (#123), or a plain box (block or inline-block, #153) read as a column with no gap
//   or alignment; a custom property a utility sets is resolved where a length reads it;
//   a border with no colour utility takes its colour from the base layer's `*` rule.
// - paint that differs by Mode, carries an opacity or mixes tokens (#120): a Synthesized token, a per-mode Theme
//   component token the Contract binds as a plain {token}. The foundations step re-derives the same tokens through
//   readFamily() and writes them into the Foundations document, which this step then requires to hold them.
// - text layers (#166): a TEXT node with a TEXT property where the source says what the text is: the children of a
//   root that sets its own text style (Button's Label), a provider's Value export's placeholder (SelectValue), or a
//   part that sets its own text style and no layout (CardTitle). Each layer binds the Text Style its size and weight
//   utilities name where its values are that style's (#160), else is raw, and reads its colour through the same paint
//   rules; the default text is a Drafted value.
// What it leaves to later tickets, each in a note: the icon each slot frame stands for, each part's own layout and
// paint (later agent-tier keys), any other `:has(…)` condition, and styling set by an ancestor (ADR 0012).
// Generation throws (the CLI exits 1 and writes nothing) on anything it cannot read exactly: compound variants, an
// attribute state with no known state words, layout other than flex, a one-column grid or a plain box, an opacity or an effect's
// shape that differs by Mode, relative colour syntax, a Synthesized name a Code Library token already has, or a
// Foundations document from another snapshot or without the family's Synthesized tokens.
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert } from '../../contract/scripts/color.mjs';
import { contentHash, expand, resolve, scopeFor, validate, variantName } from '../../contract/scripts/contract.mjs';
import { writeJson } from '../../contract/scripts/io.mjs';
import { candidateRules, compiledRules, winner } from './cascade.mjs';
import { mergeDrafts, subjects } from './drafts.mjs';
import { familyRoot, readSource } from './source.mjs';
import { DEFAULT_DIR, FIXTURE, REPO_ROOT, fetchTools, projectPins, sha256, snapshotId } from './sources.mjs';
import { build } from './tailwind.mjs';
import { CLIPPED, evaluate, isSynthesized, lengthPx, literalForm, resolvedText, round } from './values.mjs';

// Attribute states with known state words: the attribute becomes an axis, absent by default (#119).
const ATTR_AXES = {
  'aria-invalid': { key: 'invalid', label: 'Invalid', off: 'valid', on: 'invalid' },
  'aria-expanded': { key: 'expanded', label: 'Expanded', off: 'collapsed', on: 'expanded' },
};
const STATES = ['hover', 'active', 'focus', 'disabled'];
const STATE_CSS = [':hover', ':active', ':focus-visible', ':focus', ':disabled', '[aria-disabled="true"]', '[data-disabled]'];
const NATIVE_DISABLED = new Set(['button', 'input', 'select', 'textarea', 'fieldset']);
// The display of a root element no display utility sets, when it is a plain box (#153): the form controls are
// inline-block, the block elements block. Any other element (a component, an inline element) is not read.
const BOX_DISPLAY = { ...Object.fromEntries(['button', 'input', 'select', 'textarea'].map(e => [e, 'inline-block'])),
  ...Object.fromEntries(['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'form', 'fieldset', 'ul', 'ol', 'li', 'p']
    .map(e => [e, 'block'])) };
const VARIANT_LIMIT = 600; // ADR 0004
// The content of a slot a Contract carries: an svg, sized unless the consumer sizes it (#121).
const SLOT_CONTENT = /^svg(:not\(\[class\*='size-'\]\))?$/;
const SIZE_FIELDS = ['width', 'height'];
const FRAME_FIELDS = [...SIZE_FIELDS, 'visible'];
// A part hugs or fills inside its own Auto Layout, so it carries a direction too (#124).
const PART_FIELDS = ['direction', ...SIZE_FIELDS];
const SLOT_PART_FIELDS = ['direction', ...FRAME_FIELDS];
// Logical sides, start before end, order a family's slot frames; any other slot follows them by key.
const SIDES = ['inline-start', 'inline-end'];
// CSS properties a Contract field carries; any other utility is reported, not carried.
const LAYOUT_PROPS = ['display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'width', 'height', 'border-radius',
  'border-width', 'padding', 'padding-inline', 'padding-block', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'grid-template-columns', 'grid-auto-flow', 'row-gap', 'column-gap', 'justify-items', 'align-content'];
// A custom property a utility sets (`[--card-spacing:--spacing(4)]`), not one of Tailwind's own: carried, so a length
// that reads it (`gap-(--card-spacing)`) resolves to what the variant sets it to.
const isVar = prop => /^--(?!tw-)/.test(prop);
// A part's own utilities that size it in its parent's Auto Layout or give its own direction; the rest is not read yet.
const PART_PROPS = ['width', 'height', 'align-self', 'justify-self', 'flex-grow', 'position', 'display', 'flex-direction'];
const PAINT_PROPS = ['background-color', 'border-color', 'opacity', '--tw-ring-shadow', '--tw-ring-color'];
const TEXT_PROPS = ['color', 'font-family', 'font-size', 'line-height', 'font-weight', '--tw-font-weight', '--tw-leading', 'letter-spacing',
  '--tw-tracking', 'text-align', 'text-decoration-line', 'text-underline-offset', 'white-space'];
// What a text layer reads (#166): its text style and colour, its own or inherited from the root.
const FONT_PROPS = ['font-family', 'font-size', 'line-height', 'font-weight', '--tw-leading', 'color'];
// Elements whose children are no text a designer types: a form control shows its value or placeholder.
const NO_TEXT = new Set(['input', 'textarea', 'select', 'img', 'hr', 'br']);
const TEXT_FIELDS = ['textStyle', 'textResize', 'visible'];
const TEXT_PART_FIELDS = [...SIZE_FIELDS, 'textStyle', 'textResize'];
const PADDING = {
  paddingTop: ['padding-top', 'padding-block', 'padding'], paddingRight: ['padding-right', 'padding-inline', 'padding'],
  paddingBottom: ['padding-bottom', 'padding-block', 'padding'], paddingLeft: ['padding-left', 'padding-inline', 'padding'],
};
const SCOPE = { width: 'WIDTH_HEIGHT', height: 'WIDTH_HEIGHT', gap: 'GAP', radius: 'CORNER_RADIUS',
  paddingTop: 'GAP', paddingRight: 'GAP', paddingBottom: 'GAP', paddingLeft: 'GAP' };
const ALIGN = { normal: 'start', stretch: 'start', start: 'start', 'flex-start': 'start', center: 'center', end: 'end',
  'flex-end': 'end', 'space-between': 'space-between', baseline: 'baseline' };
const LAYOUT_FIELDS = ['direction', 'width', 'height', 'alignMain', 'alignCross', 'paddingTop', 'paddingRight', 'paddingBottom',
  'paddingLeft', 'gap', 'radius', 'strokeWeight', 'strokeAlign'];
const PAINT_FIELDS = ['fill', 'stroke', 'opacity', 'effects'];
// The CSS property behind each colour a Synthesized token can carry.
const COLOUR_PROP = { fill: 'background-color', stroke: 'border-color', effects: '--tw-ring-color' };

const fail = msg => { throw new Error(msg); };
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const PREVIEW_PACKAGES = fileURLToPath(new URL('../preview/package.json', import.meta.url));
const words = s => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
const title = s => words(s).join(' ');
const pascal = s => words(s).join('');
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const camel = s => s.replace(/\s+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, c => c.toLowerCase());
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (rule, props) => props.some(p => p in rule.decls);
const declOf = (rule, props) => rule.decls[props.find(p => p in rule.decls)];

// "a b(c d)" -> ["a", "b(c d)"]: the space-separated parts of a value, outside parentheses.
function spaced(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ' ' || ch === undefined) && depth === 0) { if (i > start) out.push(text.slice(start, i)); start = i + 1; }
  }
  return out;
}

// A utility's variants (`dark:hover:bg-x` -> "dark:hover"), sorted, outside brackets.
function variantsOf(candidate) {
  const segs = [];
  let depth = 0, start = 0;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) { segs.push(candidate.slice(start, i)); start = i + 1; }
  }
  return segs.sort(byKey).join(':');
}

/**
 * Read one family at the exact tier. Returns {name, file, files, axes, anatomy, layout, paint, synthesized, notes, omit,
 * expectedCount}: `synthesized` maps each Synthesized token's flat name to its Foundations variable, by name, and
 * `paint` binds it as {token}. `foundations` need only hold the Code Library tokens. Throws on anything it cannot
 * read exactly (see the header).
 */
export async function readFamily({ project, family, foundations, tools = DEFAULT_DIR }) {
  const readText = rel => readFileSync(join(project, rel), 'utf8');
  const config = JSON.parse(readText('components.json'));
  const cssFile = config.tailwind && config.tailwind.css;
  const pins = projectPins(project);
  await fetchTools(tools, pins);
  const ui = (config.aliases && config.aliases.ui) || '@/components/ui';
  if (!ui.startsWith('@/')) fail(`components.json aliases.ui "${ui}" is not under "@/"`);
  const file = `${ui.slice(2)}/${family}.tsx`;

  // 0. The Foundations document must come from this snapshot of the project. The Contract pins the project files
  //    the document read, other than component files (a family it synthesized tokens for), and its own file.
  if (!foundations.source || foundations.source.adapter !== 'generic') fail('the Foundations document was not written by the Generic Adapter');
  const files = {};
  for (const [f, hash] of Object.entries(foundations.source.files)) {
    const now = `sha256:${sha256(readFileSync(join(project, f)))}`;
    if (now !== hash) fail(`${f} differs from the one the Foundations document was read from: it is from another snapshot; regenerate it (foundations.mjs) first`);
    if (!f.startsWith(`${ui.slice(2)}/`)) files[f] = now;
  }
  files[file] = `sha256:${sha256(readFileSync(join(project, file)))}`;
  const sortedFiles = Object.fromEntries(Object.keys(files).sort(byKey).map(f => [f, files[f]]));
  // The packages the preview renderer runs the component with, at the versions the project's lockfile resolves.
  const lock = JSON.parse(readText('package-lock.json')).packages;
  const renderer = Object.fromEntries(Object.keys(JSON.parse(readFileSync(PREVIEW_PACKAGES, 'utf8')).dependencies)
    .map(name => [name, (lock[`node_modules/${name}`] || fail(`package-lock.json resolves no ${name}, which the preview renderer pins`)).version]));

  // 1. Source: the root component and its cva call. A root with no cva (Card) is one variant: its own className.
  //    The root is the export named after the family; a file with none and one exported component (sonner.tsx's
  //    Toaster) is read through that one (#154).
  const { cvas, components } = readSource(readText(file), file, { tools });
  // A provider with no box of its own (Select renders SelectPrimitive.Root) is read through its Trigger (#153); the
  // other exports render inside the Trigger or in the popup it opens, so none is a part.
  const { named, provider, root } = familyRoot(components, pascal(family), file);
  const Name = named.name;
  const cv = root.cva ? cvas[root.cva] : { base: { classes: '', line: root.line }, variants: {}, keys: {}, defaults: {}, compound: [] };
  if (cv.compound.length) fail(`${file}:${cv.compound[0].line} ${root.cva}: compoundVariants are not read yet`);
  // A prop the root sets an attribute from that no axis reads (Card's `data-size={size}`) keeps its default.
  const fixed = Object.fromEntries(Object.values(root.attrs).filter(a => a.prop && !cv.variants[a.prop]).map(a => [a.prop, root.defaults[a.prop]]));
  // The other exported components are the parts (CardHeader), each a FRAME under the root, named by rule (#103): the
  // Title Case of its data-slot without the family prefix (card-header -> Header).
  const parts = components.filter(c => c.exported && !provider && c !== root).map(c => ({ name: c.name, line: c.line, slot: c.slot || kebab(c.name),
    node: title((c.slot || kebab(c.name)).replace(new RegExp(`^${family}-`), '')), entries: c.classes.flatMap(l => l.classes.split(/\s+/).filter(Boolean).map(candidate => ({ candidate, line: l.line }))) }));
  const entries = []; // every class occurrence: {candidate, line, axis?, value?}, in the order cva emits them
  const add = (list, origin) => list.classes.split(/\s+/).filter(Boolean).forEach(c => entries.push({ candidate: c, line: list.line, ...origin }));
  add(cv.base, {});
  for (const [axis, values] of Object.entries(cv.variants))
    for (const [value, list] of Object.entries(values)) add(list, { axis, value });
  root.classes.forEach(list => add(list, {}));

  // 2. Compile every utility and sort its rules by condition.
  const candidates = [...new Set(entries.map(e => e.candidate))].sort(byKey);
  const partCandidates = parts.flatMap(p => p.entries.map(e => e.candidate));
  const compiled = await build(readText(cssFile), [...new Set([...candidates, ...partCandidates])].sort(byKey), { base: join(project, cssFile, '..'), tools, pins });
  const rules = compiledRules(compiled);
  // The project's base layer gives a border with no colour utility its colour (`* { @apply border-border }`).
  const baseBorder = compiledRules(compiled, 'base').filter(r => r.selector === '*' && 'border-color' in r.decls).pop();
  const modes = foundations.collections.find(c => c.key === 'theme').modes;
  const propAttrs = Object.fromEntries(Object.entries(root.attrs).filter(([, a]) => a.prop).map(([k, a]) => [k, a.prop]));
  const ruleOf = {};
  for (const c of new Set([...candidates, ...partCandidates])) ruleOf[c] = candidateRules(rules, c, { modes, attrs: propAttrs });
  const propsOf = c => new Set(ruleOf[c].flatMap(r => Object.keys(r.decls)));
  const at = e => (e.base ? `${cssFile} @layer base` : `${file}:${e.line}`);

  // A part positioned out of the flow (AlertAction: `absolute`) is no Auto Layout child: it is left out, with a note.
  // A part is read only by the utilities that apply whatever the variant: no condition, state, Mode or slot.
  const plain = r => !r.skip && !r.when.slot && !r.when.state && !r.when.mode && !r.when.props && !Object.keys(r.when.attrs).length;
  for (const p of parts) {
    p.rules = p.entries.flatMap(e => ruleOf[e.candidate].filter(r => plain(r) && PART_PROPS.some(q => q in r.decls)).map(r => ({ ...r, entry: e })));
    p.position = winner(p.rules, ['position']);
  }
  const outOfFlow = p => p.position && /^(absolute|fixed)$/.test(p.position.decls.position);
  const placed = parts.filter(p => !outOfFlow(p));

  // 3. Sort the utilities: carried, or reported in a note. A utility only under a value of a fixed prop never applies;
  //    one styled by the presence of a part the anatomy leaves out has nothing to show it.
  const report = { none: [], fixed: [], text: [], other: [], slot: [], absent: [], ancestor: [], descendant: [], media: [], condition: [] };
  const offFixed = r => r.when.props && Object.entries(r.when.props).some(([p, v]) => p in fixed && fixed[p] !== v);
  const absentPart = r => {
    const m = r.when.slot && /^\[data-slot="([^"]*)"\]$/.exec(r.when.slot);
    return Boolean(m) && !placed.some(p => p.slot === m[1]);
  };
  const carried = new Set();
  for (const c of candidates) {
    const props = [...propsOf(c)];
    const skip = ruleOf[c].map(r => r.skip).find(Boolean);
    if (!props.length) report.none.push(c);
    else if (ruleOf[c].every(offFixed)) report.fixed.push(c);
    else if (skip) report[skip].push(c);
    else if (ruleOf[c].some(absentPart)) report.absent.push(c);
    else if (props.some(p => LAYOUT_PROPS.includes(p) || PAINT_PROPS.includes(p) || isVar(p))) carried.add(c);
    else report[props.some(p => TEXT_PROPS.includes(p)) ? 'text' : 'other'].push(c);
  }
  const list = cs => cs.join(', ');
  const ruled = carry => entries.filter(e => carry.has(e.candidate)).flatMap(e => ruleOf[e.candidate].map(r => ({ ...r, entry: e })));
  const live = ruled(carried);
  // A slot whose presence changes the root is a Slot axis over a frame the root holds (#121, ADR 0011); the svg size
  // utilities size each icon slot's frame, and any other descendant utility stays a note. A `data-slot` naming a part
  // (`has-data-[slot=card-footer]:pb-0`) is a Slot axis over that part's frame, keyed by the slot.
  const side = s => (SIDES.includes(s.value) ? SIDES.indexOf(s.value) : SIDES.length);
  const slots = [...new Set(live.map(r => r.when.slot).filter(Boolean))].map(sel => {
    const [, attr, value] = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
    const utilities = [...new Set(live.filter(r => r.when.slot === sel).map(r => r.candidate))];
    if (!value) fail(`${list(utilities)}: :has(${sel}) names no slot value`);
    const part = attr === 'data-slot' ? placed.find(p => p.slot === value) : null;
    const key = part ? value : `${attr.replace(/^data-/, '')}-${value}`;
    return { sel, key, value, node: part ? part.node : title(key), utilities, part };
  }).sort((a, b) => side(a) - side(b) || byKey(a.key, b.key));
  const icons = slots.filter(s => !s.part);
  const slotOf = Object.fromEntries(slots.map(s => [s.sel, s.key]));
  const sizing = new Set(icons.length ? report.descendant.filter(c => ruleOf[c].every(r => SLOT_CONTENT.test(r.target))
    && [...propsOf(c)].every(p => SIZE_FIELDS.includes(p))) : []);
  report.descendant = report.descendant.filter(c => !sizing.has(c));
  const content = ruled(sizing);

  // 3b. Text layers (#166): each text a designer types is a TEXT node with a TEXT property, where the source says
  //     what the text is: the children of a root that sets a text style itself (Button's Label), a provider's Value
  //     export's placeholder (SelectValue), or a part that sets its own text style or colour and no layout of its own
  //     (CardTitle). They are read in a pass of their own, never carried as the root's layout or paint, so no text
  //     utility adds an axis or a state. Each node's text style and colour are its own rules, then what it inherits
  //     from the root, then the page (the base layer's html and body rules).
  const fontRule = r => FONT_PROPS.some(p => p in r.decls);
  const rootFont = entries.flatMap(e => ruleOf[e.candidate].filter(r => !r.skip && fontRule(r)).map(r => ({ ...r, entry: e })));
  // A rule the root writes for one of its parts (`*:data-[slot=alert-description]:text-destructive/90`), compiled to
  // `:is(.x > *)[data-slot="…"]`: it matches the part itself, so it competes with the part's own rules.
  const childSlot = r => { const m = /^:is\(\S+ > \*\)\[data-slot="([^"]+)"\]$/.exec(r.selector); return m && m[1]; };
  const forPart = entries.flatMap(e => ruleOf[e.candidate].filter(r => r.skip === 'ancestor' && fontRule(r) && childSlot(r))
    .map(r => ({ ...r, entry: e, slot: childSlot(r) })));
  const ownFont = p => p.entries.flatMap(e => ruleOf[e.candidate].filter(r => !r.skip && !r.when.slot && !r.when.state && !r.when.props
    && !Object.keys(r.when.attrs).length && fontRule(r)).map(r => ({ ...r, entry: e, own: true })));
  const boxed = p => p.entries.some(e => ruleOf[e.candidate].some(r => LAYOUT_PROPS.some(q => q in r.decls)));
  const texts = [];
  const valueExport = provider && components.find(c => c.exported && c.name === `${Name}Value`);
  if (valueExport)
    texts.push({ node: 'Value', key: 'placeholder', label: 'Placeholder', kind: 'placeholder', name: valueExport.name, line: valueExport.line,
      code: { child: valueExport.name, childProp: 'placeholder' }, own: [], rootAttrs: { 'data-placeholder': '' } });
  else if (!provider && !placed.length && !NO_TEXT.has(root.element) && rootFont.some(r => 'font-size' in r.decls || 'font-weight' in r.decls)) {
    // Named Label, or Text where the root is itself Label: rules address nodes by name.
    const node = Name === 'Label' ? 'Text' : 'Label';
    texts.push({ node, key: camel(node), label: node, kind: 'children', name: Name, line: root.line, code: { prop: 'children' }, own: [], rootAttrs: {} });
  }
  for (const p of placed) {
    const own = ownFont(p);
    if (!own.length || boxed(p) || slots.some(s => s.part === p)) continue;
    texts.push({ node: p.node, key: camel(p.node), label: p.node, kind: 'part', name: p.name, line: p.line, code: { child: p.name },
      own: [...own, ...forPart.filter(r => r.slot === p.slot)], rootAttrs: {}, part: p });
  }
  const textOf = Object.fromEntries(texts.map(n => [n.node, n]));
  // A root rule for a text part's slot in a form the pass does not read is no silent default: it is a verify note.
  const unreadText = texts.filter(n => n.part).flatMap(n => entries.flatMap(e => ruleOf[e.candidate]
    .filter(r => fontRule(r) && r.selector.includes(`[data-slot="${n.part.slot}"]`) && !(r.skip === 'ancestor' && childSlot(r)))
    .map(r => `${r.candidate} (${n.node})`)));
  const baseRules = compiledRules(compiled, 'base');
  const pageLine = baseRules.filter(r => /(^|,\s*)html(\s*,|$)/.test(r.selector) && 'line-height' in r.decls).pop();
  const bodyColour = baseRules.filter(r => r.selector === 'body' && 'color' in r.decls).pop();
  const theme = Object.assign({}, ...compiledRules(compiled, 'theme').map(r => r.decls));
  // A text length or ratio (`var(--text-sm)`, `calc(1.25 / 0.875)`, `0.8rem`, `1.5`): each var() from `vars` (the
  // custom properties in effect), else the theme layer, else its fallback. {px} or {ratio}.
  function fontValue(text, vars, where) {
    const t = text.trim();
    const v = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(t);
    if (v) {
      const got = vars[v[1]] !== undefined ? vars[v[1]] : theme[v[1]];
      return got !== undefined ? fontValue(got, vars, where) : v[2] !== undefined ? fontValue(v[2], vars, where) : fail(`${where}: ${t} names no value`);
    }
    const div = /^calc\((.+)\/(.+)\)$/.exec(t);
    if (div) {
      const [a, b] = [fontValue(div[1], vars, where), fontValue(div[2], vars, where)];
      if (a.ratio === undefined || b.ratio === undefined) fail(`${where}: ${t} divides a length; not read yet`);
      return { ratio: a.ratio / b.ratio };
    }
    return /^-?\d*\.?\d+$/.test(t) ? { ratio: parseFloat(t) } : { px: lengthPx(t, where) };
  }

  // 4. Axes: cva axes, attribute axes, the canonical State.
  const attrsUsed = new Set();
  const stateCss = {};
  for (const r of live) {
    for (const [a, v] of Object.entries(r.when.attrs)) {
      if (!ATTR_AXES[a] || v !== 'true')
        fail(`${r.candidate} (${at(r.entry)}): [${a}${v ? `="${v}"` : ''}] is an attribute state with no known state words (known: ${Object.keys(ATTR_AXES).map(k => `${k}="true"`).join(', ')})`);
      attrsUsed.add(a);
    }
    if (r.when.state) (stateCss[r.when.state] = stateCss[r.when.state] || new Set()).add(r.stateCss);
  }
  const axes = Object.keys(cv.variants).map(axis => {
    const fromCva = axis in cv.defaults;
    const def = fromCva ? cv.defaults[axis] : root.defaults[axis];
    if (def === undefined) fail(`${file} ${root.cva}: axis ${axis} has no default`);
    return { key: axis, label: title(axis), default: def,
      defaultSource: fromCva ? `${file} defaultVariants.${axis}` : `${file} ${Name} destructured default ${axis}`,
      values: Object.keys(cv.variants[axis]).map(k => ({ key: k, label: title(k), code: { [axis]: k } })) };
  });
  for (const [attr, ax] of Object.entries(ATTR_AXES))
    if (attrsUsed.has(attr))
      axes.push({ key: ax.key, label: ax.label, default: ax.off, defaultSource: `${attr} absent: ${Name} renders without it`, values: [
        { key: ax.off, label: title(ax.off), code: {}, css: `:not([${attr}="true"])` },
        { key: ax.on, label: title(ax.on), code: { [attr]: true }, css: `[${attr}="true"]` }] });
  for (const s of slots)
    axes.push({ key: s.key, label: s.node, slot: s.node, default: 'none',
      defaultSource: `${Name} renders the children it is given; with no ${s.sel} child, none of ${list(s.utilities)} applies`, values: [
        { key: 'none', label: 'False', filled: false, code: {}, css: `:not(:has(${s.sel}))` },
        { key: s.key, label: 'True', filled: true, code: {}, css: `:has(${s.sel})` }] });
  const stateValue = key => {
    const css = [...stateCss[key]].sort((a, b) => STATE_CSS.indexOf(a) - STATE_CSS.indexOf(b));
    let code = null;
    if (key === 'disabled')
      code = (NATIVE_DISABLED.has(root.element) || provider) && css.includes(':disabled') ? { disabled: true }
        : css.includes('[aria-disabled="true"]') ? { 'aria-disabled': true } : { 'data-disabled': true };
    return { key, label: title(key), code, css: css.join(', ') };
  };
  axes.push({ key: 'state', label: 'State', canonical: true, default: 'enabled', defaultSource: 'canonical State axis (#6)',
    values: [{ key: 'enabled', label: 'Enabled', code: {} }, ...STATES.filter(s => stateCss[s]).map(stateValue)] });
  let tuples = [{}];
  for (const a of axes) tuples = tuples.flatMap(t => a.values.map(v => ({ ...t, [a.key]: v.key })));
  // An attribute axis changes only the variants whose classes style that attribute. Elsewhere its `on` value is a
  // twin of `off`, so the selection omits it: the cva values that style it are read from the source, never listed.
  const omit = [];
  for (const [attr, ax] of Object.entries(ATTR_AXES)) {
    const using = live.filter(r => attr in r.when.attrs).map(r => r.entry);
    if (!using.length || using.some(e => !e.axis)) continue;
    const match = {};
    for (const axis of Object.keys(cv.variants).filter(a => using.some(e => e.axis === a))) {
      const without = Object.keys(cv.variants[axis]).filter(v => !using.some(e => e.axis === axis && e.value === v));
      match[axis] = without.length === 1 ? without[0] : without;
    }
    if (Object.values(match).some(v => !v.length)) continue;
    match[ax.key] = ax.on;
    const named = Object.entries(match).filter(([k]) => k !== ax.key).map(([k, v]) => `${k} ${[].concat(v).join(', ')}`);
    omit.push({ match, reason: `${ax.on} is the twin of ${ax.off}: no ${attr} utility in ${named.join('; ')}` });
  }

  // 5. Per variant: the classes `cn()` keeps, then the cascade per Mode.
  const merged = new Map(); // cva combo -> Set of surviving entries
  const drops = new Set();
  const survivors = t => {
    const key = Object.keys(cv.variants).map(a => t[a]).join('\0');
    if (!merged.has(key)) {
      const list = entries.filter(e => !e.axis || t[e.axis] === e.value);
      const keep = new Set(list);
      for (let i = list.length - 1; i >= 0; i--)
        for (let j = 0; j < i; j++) {
          const [a, b] = [list[j], list[i]];
          if (!keep.has(a) || !keep.has(b) || variantsOf(a.candidate) !== variantsOf(b.candidate)) continue;
          const pa = propsOf(a.candidate), pb = propsOf(b.candidate);
          // tailwind-merge's font-size group: `text-[0.8rem]` drops `text-sm` though it leaves line-height unset.
          if (pa.size && ([...pa].every(p => pb.has(p)) || (pa.has('font-size') && pb.has('font-size')))) { keep.delete(a); if (a.candidate !== b.candidate) drops.add(`${b.candidate} drops ${a.candidate}`); }
        }
      merged.set(key, keep);
    }
    return merged.get(key);
  };
  const applies = (r, t, mode, keep) => {
    const w = r.when;
    if (!keep.has(r.entry) || (w.mode && w.mode !== mode) || (w.state && w.state !== t.state)) return false;
    if (Object.keys(w.attrs).some(a => t[ATTR_AXES[a].key] !== ATTR_AXES[a].on)) return false;
    if (w.slot && t[slotOf[w.slot]] === 'none') return false;
    return !w.props || Object.entries(w.props).every(([p, v]) => (p in fixed ? fixed[p] : t[p]) === v);
  };
  // As applies(), for a text rule: an attribute with no axis applies only where the node's root carries it (a
  // Trigger's `data-placeholder` while the Value shows its placeholder); a part's own rule is no cva class.
  const textApplies = (r, t, mode, keep, attrs = {}) => {
    const w = r.when;
    if ((!r.own && !keep.has(r.entry)) || (w.mode && w.mode !== mode) || (w.state && w.state !== t.state)) return false;
    for (const [a, v] of Object.entries(w.attrs))
      if (ATTR_AXES[a] ? v !== 'true' || t[ATTR_AXES[a].key] !== ATTR_AXES[a].on : attrs[a] !== v) return false;
    if (w.slot && (!(w.slot in slotOf) || t[slotOf[w.slot]] === 'none')) return false;
    return !w.props || Object.entries(w.props).every(([p, v]) => (p in fixed ? fixed[p] : t[p]) === v);
  };

  const env = {};
  for (const [k, v] of Object.entries(foundations.variables)) {
    const d = v.values.default;
    if (d && d.from && d.from.multiplier && d.from.factor) env[d.from.multiplier] = round(d.value / d.from.factor);
    if (/^radius-/.test(k)) env[`--${k}`] = d.value;
  }
  const variableKeys = Object.keys(foundations.variables).sort(byKey);
  const tokenFor = (text, scope) => variableKeys.find(k => {
    const v = foundations.variables[k];
    return v.codeSyntax && v.codeSyntax.WEB === text && (v.scopes || []).includes(scope);
  });
  // `sub` replaces each carried custom property with what the variant sets it to.
  const length = (field, r, props, sub = x => x) => {
    const text = sub(declOf(r, props));
    if (spaced(text).length > 1) fail(`${r.candidate} (${at(r.entry)}): ${text} sets more than one side; not read yet`);
    const px = evaluate(text, env, r.candidate);
    const token = tokenFor(text, SCOPE[field]);
    return { px, text, prop: props.find(p => p in r.decls), value: token ? { token }
      : { raw: px, level: 'info', reason: `${r.candidate}: ${text} = ${px}px; no Foundations variable compiles to it` } };
  };
  const colour = (text, r) => {
    if (text === 'transparent') return 'none';
    const v = /^var\(--([\w-]+)\)$/.exec(text);
    if (v) return foundations.variables[v[1]] && foundations.variables[v[1]].type === 'COLOR' ? { token: v[1] }
      : fail(`${r.candidate} (${at(r.entry)}): ${text} is not a Foundations colour`);
    if (/^color-mix\(/.test(text)) return { mix: text }; // a Synthesized token's, whatever the Modes do (step 6)
    if (/^currentcolor$/i.test(text)) fail(`${r.candidate} (${at(r.entry)}): currentcolor is not read yet`);
    let c;
    try { c = convert(text); } catch (e) { fail(`${r.candidate} (${at(r.entry)}): ${e.message}`); }
    const out = { raw: c.hex, level: 'warning', reason: `${r.candidate}: the literal colour ${text} has no Foundations variable` };
    if (c.alpha !== 1) out.alpha = c.alpha;
    return out;
  };

  const usesBorder = live.some(r => 'border-width' in r.decls);
  const usesRadius = live.some(r => 'border-radius' in r.decls);
  const baseStroke = baseBorder && { candidate: '* (border-color)', decls: baseBorder.decls, entry: { base: true } };
  const bodyText = bodyColour && { candidate: 'body (color)', decls: bodyColour.decls, entry: { base: true } };
  let strokeFromBase = false;
  const boxes = new Set(); // what gives each variant read as a plain box its display
  // Layout and paint of one variant in one Mode: {layout, paint, by: {field: winning rule}, frames: {node: {field}}}.
  function render(t, mode) {
    const keep = survivors(t);
    const here = live.filter(r => applies(r, t, mode, keep));
    const win = props => winner(here, props);
    const sub = text => text.replace(/var\((--[\w-]+)\)/g, (m, name) => {
      const r = isVar(name) && win([name]);
      return r ? sub(r.decls[name]) : m;
    });
    // `width: 100%` fills the parent, `fit-content` (SelectTrigger's `w-fit`) hugs; any other width is a length.
    const size = (field, r) => (r.decls[field] === '100%' ? 'fill' : r.decls[field] === 'fit-content' ? 'hug' : length(field, r, [field], sub).value);
    const layout = {}, paint = {}, by = {};
    const display = win(['display']);
    const shown = display ? display.decls.display : 'not set';
    // A plain box (#153): no display utility, or block or inline-block, stacks its children as a column with no gap
    // and no alignment; its element gives the display when no utility does (Input's <input> is inline-block).
    const box = display ? /^(inline-)?block$/.test(shown) && shown : root.element in BOX_DISPLAY && BOX_DISPLAY[root.element];
    if (!box && !/^(inline-)?(flex|grid)$/.test(shown))
      fail(`${Name} (${variantName({ axes }, t)}) is not a flex or grid container or a plain box (display: ${shown}${display ? '' : `, element ${root.element}`}); only Auto Layout is read`);
    // A grid with no columns stacks its children: a column, its row gap the gap, its justify-items the cross alignment.
    const grid = /grid$/.test(shown);
    if (box) { layout.direction = 'column'; boxes.add(display ? `${display.candidate}: ${box}` : `<${root.element}>: ${box}`); }
    else if (grid) {
      const cols = win(['grid-template-columns']);
      if (cols && cols.decls['grid-template-columns'] !== 'none')
        fail(`${cols.candidate} (${at(cols.entry)}): grid-template-columns ${cols.decls['grid-template-columns']}: a grid with columns has no Auto Layout; only a grid of one column is read, as a column`);
      const flow = win(['grid-auto-flow']);
      if (flow && /column/.test(flow.decls['grid-auto-flow']))
        fail(`${flow.candidate} (${at(flow.entry)}): grid-auto-flow ${flow.decls['grid-auto-flow']} adds columns; only a grid of one column is read, as a column`);
      layout.direction = 'column';
    } else {
      const dir = win(['flex-direction']);
      layout.direction = dir && /^column/.test(dir.decls['flex-direction']) ? 'column' : 'row';
    }
    // With no width, a block-level container (flex, grid) fills its parent and an inline one hugs its content.
    for (const field of SIZE_FIELDS) {
      const r = win([field]);
      layout[field] = r ? size(field, r) : field === 'width' && !/^inline-/.test(box || shown) ? 'fill' : 'hug';
      if (r) by[field] = r;
    }
    const [mainProp, crossProp] = grid ? ['align-content', 'justify-items'] : ['justify-content', 'align-items'];
    // A plain box has no alignment or gap: justify-, align- and gap utilities do nothing there, and its children
    // stretch across it.
    for (const [field, prop] of [['alignMain', mainProp], ['alignCross', crossProp]]) {
      const r = !box && win([prop]);
      const v = r ? r.decls[prop] : 'normal';
      layout[field] = ALIGN[v] || fail(`${r.candidate} (${at(r.entry)}): ${prop}: ${v} has no Auto Layout alignment`);
    }
    const cross = !box && win([crossProp]);
    const stretches = !cross || ['normal', 'stretch'].includes(cross.decls[crossProp]);
    const border = win(['border-width']);
    const bw = border ? evaluate(border.decls['border-width'], env, border.candidate) : 0;
    for (const [field, props] of Object.entries(PADDING)) {
      const r = win(props);
      if (r) by[field] = r;
      if (!bw) { layout[field] = r ? length(field, r, props, sub).value : { token: 'spacing-0' }; continue; }
      const p = r ? length(field, r, props, sub) : null;
      layout[field] = { raw: round((p ? p.px : 0) + bw), level: 'info', reason: p
        ? `derived: ${r.candidate} ${p.prop} ${p.text} = ${p.px}px + ${bw}px border (an inside stroke takes no layout space)`
        : `derived: no padding + ${bw}px border (an inside stroke takes no layout space)` };
    }
    const gapProps = layout.direction === 'column' ? ['row-gap', 'gap'] : ['column-gap', 'gap'];
    const gap = !box && win(gapProps);
    layout.gap = gap ? length('gap', gap, gapProps, sub).value : { token: 'spacing-0' };
    if (gap) by.gap = gap;
    if (usesRadius) {
      const r = win(['border-radius']);
      layout.radius = r ? length('radius', r, ['border-radius'], sub).value : { raw: 0, level: 'info', reason: 'no border-radius utility' };
      if (r) by.radius = r;
    }
    if (usesBorder) {
      layout.strokeWeight = { raw: bw, level: 'info', reason: border
        ? `${border.candidate}: border-width ${border.decls['border-width']}; the Foundations document has no stroke-width variable` : 'no border' };
      layout.strokeAlign = 'inside';
    }

    const fill = win(['background-color']);
    paint.fill = fill ? colour(fill.decls['background-color'], fill) : 'none';
    if (fill) by.fill = fill;
    if (bw) {
      const r = win(['border-color']) || baseStroke;
      if (!r) fail(`${Name} (${variantName({ axes }, t)}): a ${bw}px border with no border-color utility, and no border-color on * in ${cssFile}'s base layer`);
      if (r === baseStroke) strokeFromBase = true;
      paint.stroke = colour(r.decls['border-color'], r);
      by.stroke = r;
    } else paint.stroke = 'none';
    const op = win(['opacity']);
    // A literal, as the Contract's raw form: the core writes `raw`, so a bare number would write nothing (#124).
    paint.opacity = op ? { raw: round(/%$/.test(op.decls.opacity) ? parseFloat(op.decls.opacity) / 100 : parseFloat(op.decls.opacity)), level: 'info',
      reason: `${op.candidate}: opacity ${op.decls.opacity}; the Foundations document has no opacity variable` } : { raw: 1, level: 'info', reason: 'no opacity utility' };
    const ring = win(['--tw-ring-shadow']);
    paint.effects = [];
    if (ring) {
      const m = /calc\((\d*\.?\d+)px \+ var\(--tw-ring-offset-width\)\)/.exec(ring.decls['--tw-ring-shadow']);
      if (!m) fail(`${ring.candidate} (${at(ring.entry)}): ring ${ring.decls['--tw-ring-shadow']} is not read`);
      const rc = win(['--tw-ring-color']);
      if (!rc) fail(`${ring.candidate} (${at(ring.entry)}): a ring with no ring colour is currentcolor, which is not read yet`);
      paint.effects = [{ type: 'drop-shadow',
        spread: { raw: parseFloat(m[1]), level: 'info', reason: `${ring.candidate}: a ${m[1]}px ring (box-shadow 0 0 0 ${m[1]}px); no effect-spread variable` },
        color: colour(rc.decls['--tw-ring-color'], rc) }];
      by.effects = rc;
      by.ring = ring;
    }
    if (op) by.opacity = op;
    const frames = {};
    const sizes = content.filter(r => applies(r, t, mode, keep));
    for (const s of icons) {
      const f = frames[s.node] = {};
      for (const field of SIZE_FIELDS) {
        const r = winner(sizes, [field]);
        f[field] = r ? length(field, r, [field]).value : fail(`${Name} (${variantName({ axes }, t)}): no svg size utility sizes the ${s.node} slot`);
      }
      f.visible = t[s.key] !== 'none';
    }
    // A part's size: its own width or height utility; else, across the root, fill where the root stretches it and
    // its self-alignment leaves it so, and along the root, fill where it grows in a flex root; else hug. A frame that
    // hugs is an Auto Layout in Figma, so a part has a direction (#124): a flex part's flex-direction (row unless it
    // says column), else a column, as a grid with no columns or a block stacks its children.
    for (const p of placed) {
      const display = winner(p.rules, ['display']);
      const flex = display && /flex$/.test(display.decls.display);
      const dir = flex && winner(p.rules, ['flex-direction']);
      const f = frames[p.node] = { direction: flex && !(dir && /^column/.test(dir.decls['flex-direction'])) ? 'row' : 'column' };
      const self = !box && winner(p.rules, [grid ? 'justify-self' : 'align-self']);
      const selfValue = self ? self.decls[grid ? 'justify-self' : 'align-self'] : 'auto';
      const across = selfValue === 'stretch' || (['auto', 'normal'].includes(selfValue) && stretches) ? 'fill' : 'hug';
      const grow = !grid && !box && winner(p.rules, ['flex-grow']);
      const along = grow && parseFloat(grow.decls['flex-grow']) > 0 ? 'fill' : 'hug';
      const [w, h] = layout.direction === 'column' ? [across, along] : [along, across];
      for (const [field, fallback] of [['width', w], ['height', h]]) {
        const r = winner(p.rules, [field]);
        f[field] = r ? size(field, r) : fallback;
      }
      const slot = slots.find(s => s.part === p);
      if (slot) f.visible = t[slot.key] !== 'none';
    }
    // Each text layer: the Text Style its size and weight utilities name (#160), or a raw value where none holds its
    // values, and its colour. A part keeps its size and wraps where it fills; the root's own text hugs, and is hidden where the root
    // has a fixed width (an icon size: the box is sized for its icon, not for text).
    const inks = {};
    for (const n of Object.values(textOf)) {
      const own = n.own.filter(r => textApplies(r, t, mode, keep));
      const up = rootFont.filter(r => textApplies(r, t, mode, keep, n.rootAttrs));
      const pick = prop => winner(own, [prop]) || winner(up, [prop]);
      const lead = rs => { const r = winner(rs, ['--tw-leading']); return r ? { '--tw-leading': r.decls['--tw-leading'] } : {}; };
      const where = r => `${r.candidate} (${at(r.entry)})`;
      const sizeRule = pick('font-size');
      const size = sizeRule ? fontValue(sizeRule.decls['font-size'], {}, where(sizeRule)) : { px: 16 };
      if (size.px === undefined) fail(`${where(sizeRule)}: font-size ${sizeRule.decls['font-size']} is not a length`);
      // A line-height is computed where it is set (with the --tw-leading in effect there) and inherited as a ratio or a length.
      const ownLine = winner(own, ['line-height']);
      const lineRule = ownLine || winner(up, ['line-height']);
      const line = lineRule ? fontValue(lineRule.decls['line-height'], ownLine ? { ...lead(up), ...lead(own) } : lead(up), where(lineRule))
        : pageLine ? fontValue(pageLine.decls['line-height'], {}, `${cssFile} @layer base ${pageLine.selector}`) : { ratio: 1.2 };
      const lineHeight = round(line.px !== undefined ? line.px : line.ratio * size.px);
      const weightRule = pick('font-weight');
      const weight = weightRule ? fontValue(weightRule.decls['font-weight'], {}, where(weightRule)).ratio : 400;
      const said = [
        sizeRule ? `${sizeRule.candidate} font-size ${size.px}px` : 'font-size 16px (no utility: the browser default)',
        lineRule ? `${lineRule.candidate} line-height ${lineHeight}px` : `line-height ${lineHeight}px (${pageLine ? `${pageLine.selector} line-height ${pageLine.decls['line-height']}` : 'no utility'})`,
        weightRule ? `${weightRule.candidate} font-weight ${weight}` : 'font-weight 400 (no utility)',
      ];
      const f = frames[n.node] = n.part ? { width: frames[n.node].width, height: frames[n.node].height } : {};
      const familyRule = pick('font-family');
      const step = sizeRule && /^text-([a-z0-9]+)$/.exec(sizeRule.candidate);
      const weightKey = weightRule ? (/^font-([a-z]+)$/.exec(weightRule.candidate) || [])[1] : 'normal';
      const key = step && weightKey && `text-${step[1]}-${weightKey}`;
      const style = key && foundations.textStyles[key];
      const why = !sizeRule ? 'no font-size utility names a step of the type scale'
        : !step || !Object.keys(foundations.textStyles).some(k => k.startsWith(`text-${step[1]}-`)) ? `${sizeRule.candidate} is not a step of the type scale`
          : !style ? `${weightRule.candidate} is not a font weight of the theme`
            : familyRule && familyRule.decls['font-family'] !== 'var(--font-sans)' ? `${familyRule.candidate} sets another font family than the Text Styles' ${style.fontFamily}`
              : style.lineHeight.value !== lineHeight ? `${lineRule ? lineRule.candidate : 'the base layer'} sets a line height off the type scale (${step[0]} is ${style.lineHeight.value}px)`
                : style.fontSize !== size.px || style.fontWeight !== weight ? `${key} holds ${style.fontSize}px at ${style.fontWeight}` : null;
      f.textStyle = why === null ? { token: key } : { raw: { fontSize: size.px, lineHeight, fontWeight: weight }, level: 'warning',
        reason: `${said.join('; ')}; no Text Style: ${why}` };
      f.textResize = f.width === 'fill' ? 'height' : 'width-and-height';
      if (n.kind === 'children') f.visible = !isObj(layout.width);
      const r = winner(own, ['color']) || winner(up, ['color']) || bodyText
        || fail(`${Name} (${variantName({ axes }, t)}): no colour for the ${n.node} text, and no color on body in ${cssFile}'s base layer`);
      inks[n.node] = { fill: colour(r.decls.color, r), by: r };
    }
    return { layout, paint, by, frames, texts: inks };
  }

  // One Mode's value of a Synthesized token, as a Foundations value form: what the winning rule `r` sets there.
  // A Theme token is an alias to it in the same collection, which the builder core binds one hop deep (#124). An
  // opacity or a mix is evaluated over each token's own CSS in that Mode, so a token's alpha multiplies
  // (0.15 x 0.3 = 0.045), and flattened to RGBA, since a Figma alias cannot carry alpha.
  const cssOf = (name, r, mode) => {
    const v = foundations.variables[name];
    if (!v || v.type !== 'COLOR') fail(`${r.candidate} (${at(r.entry)}): var(--${name}) is not a Foundations colour`);
    return v.values[mode].from.css;
  };
  const evaluated = (text, r) => {
    try { return convert(text); } catch (e) { fail(`${r.candidate} (${at(r.entry)}): ${e.message}`); }
  };
  function modeForm(value, r, prop, mode) {
    if (value === 'none') return literalForm('transparent');
    const text = r.decls[prop];
    let m = /^var\(--([\w-]+)\)$/.exec(text);
    if (m) return { alias: m[1], resolved: foundations.variables[m[1]].values[mode].resolved };
    m = /^color-mix\(in (\w+), var\(--([\w-]+)\) (\d*\.?\d+)%, transparent\)$/.exec(text);
    const c = evaluated(text.replace(/var\(--([\w-]+)\)/g, (_, name) => cssOf(name, r, mode)), r);
    const clipped = c.clipped ? `; ${CLIPPED}` : '';
    if (m) return { raw: c.hex, alpha: c.alpha, resolved: resolvedText(c), from: { alias: m[2], alpha: round(parseFloat(m[3]) / 100) },
      level: 'info', reason: `${r.candidate}: ${m[2]} at ${m[3]}%, flattened to RGBA since a Figma alias cannot carry alpha${clipped}` };
    if (/^color-mix\(/.test(text)) return { raw: c.hex, ...(c.alpha !== 1 && { alpha: c.alpha }), resolved: resolvedText(c), from: { mix: text },
      level: 'info', reason: `${r.candidate}: the mix evaluated in this Mode${clipped}` };
    return literalForm(text);
  }

  // 6. Every variant in every Mode. Layout and every non-colour paint field must not differ by Mode. A colour that
  //    does, or that carries an opacity or mixes tokens, takes a Synthesized token: until the rules are known it is a
  //    placeholder {synth: {mode: form}}, so two variants share a rule exactly when their values agree in every Mode.
  const values = { layout: {}, paint: {} };
  LAYOUT_FIELDS.forEach(f => { values.layout[f] = []; });
  PAINT_FIELDS.forEach(f => { values.paint[f] = []; });
  // The root's children in anatomy order: a provider's Value, the icon slots at the start, the root's own text, the
  // other icon slots, then the parts, each a FRAME or a text layer. A frame per icon slot and per part; a part that is
  // no slot always shows, so it has no visibility.
  const rootTexts = texts.filter(n => !n.part);
  const order = [...rootTexts.filter(n => n.kind === 'placeholder').map(n => n.node), ...icons.filter(s => side(s) === 0).map(s => s.node),
    ...rootTexts.filter(n => n.kind === 'children').map(n => n.node), ...icons.filter(s => side(s) !== 0).map(s => s.node), ...placed.map(p => p.node)];
  const fieldsOf = node => {
    const n = textOf[node];
    if (n) return n.part ? TEXT_PART_FIELDS : TEXT_FIELDS;
    if (icons.some(s => s.node === node)) return FRAME_FIELDS;
    return slots.some(s => s.part && s.part.node === node) ? SLOT_PART_FIELDS : PART_FIELDS;
  };
  const frameFields = Object.fromEntries(order.map(n => [n, fieldsOf(n)]));
  const textPaint = Object.fromEntries(texts.map(n => [n.node, { fill: [] }]));
  const frameValues = Object.fromEntries(Object.entries(frameFields).map(([n, fs]) => [n, Object.fromEntries(fs.map(f => [f, []]))]));
  const uses = new Map(); // placeholder JSON -> the rules that set it, per Mode
  const json = v => JSON.stringify(v);
  const modeDiffers = (field, r, i) =>
    fail(`${Name}.${field}: ${r ? `${r.candidate} (${at(r.entry)})` : 'a value'} differs by mode (${modes[i].key}); only a colour may differ by Mode`);
  // `by` gives each rendering's winning rule and `prop` the CSS property it sets: a text colour is `color`.
  const colourValue = (field, rendered, get, by = x => x.by[field], prop = COLOUR_PROP[field]) => {
    const vals = rendered.map(get);
    if (!vals.some(v => v && v.mix) && vals.every(v => json(v) === json(vals[0]))) return vals[0];
    const synth = Object.fromEntries(modes.map((m, i) => [m.key, modeForm(vals[i], by(rendered[i]), prop, m.key)]));
    const key = json(synth);
    if (!uses.has(key)) uses.set(key, new Set());
    rendered.forEach(x => { if (by(x)) uses.get(key).add(by(x)); });
    return { synth };
  };
  for (const t of tuples) {
    const rendered = modes.map(m => render(t, m.key));
    const [light] = rendered;
    rendered.forEach((o, i) => {
      for (const f of LAYOUT_FIELDS)
        if (json(o.layout[f]) !== json(light.layout[f])) {
          const r = o.by[f] || light.by[f];
          fail(`${Name}.${f}: ${r ? `${r.candidate} (${at(r.entry)})` : 'a value'} differs by mode (${modes[i].key}); layout is the same in every Mode`);
        }
      if (o.paint.opacity.raw !== light.paint.opacity.raw) modeDiffers('opacity', o.by.opacity || light.by.opacity, i);
      if (json(o.frames) !== json(light.frames))
        fail(`${Name}: a frame's size differs by mode (${modes[i].key}); layout is the same in every Mode`);
      const shape = x => json(x.paint.effects.map(({ color, ...e }) => e));
      if (shape(o) !== shape(light)) modeDiffers('effects', o.by.ring || light.by.ring, i);
    });
    for (const f of LAYOUT_FIELDS) values.layout[f].push(light.layout[f]);
    for (const [n, fs] of Object.entries(frameFields)) for (const f of fs) frameValues[n][f].push(light.frames[n][f]);
    values.paint.fill.push(colourValue('fill', rendered, x => x.paint.fill));
    values.paint.stroke.push(colourValue('stroke', rendered, x => x.paint.stroke));
    values.paint.opacity.push(light.paint.opacity);
    values.paint.effects.push(light.paint.effects.map((e, n) => ({ ...e, color: colourValue('effects', rendered, x => x.paint.effects[n].color) })));
    for (const n of texts) textPaint[n.node].fill.push(colourValue('fill', rendered, x => x.texts[n.node].fill, x => x.texts[n.node].by, 'color'));
  }
  // A text layer every variant shows has no visibility.
  for (const n of texts) if (frameValues[n.node].visible && frameValues[n.node].visible.every(v => v === true || v === undefined)) delete frameValues[n.node].visible;
  for (const f of LAYOUT_FIELDS) if (values.layout[f].every(v => v === undefined)) delete values.layout[f];

  // 7. Rules: per field, the fewest axes it depends on; the commonest value in `{}`, the rest as exceptions.
  const byNode = { layout: { [Name]: values.layout, ...frameValues }, paint: { [Name]: values.paint, ...textPaint } };
  const layout = compress(axes, tuples, byNode.layout);
  const paint = compress(axes, tuples, byNode.paint);
  const check = { axes, layout, paint, properties: [] };
  tuples.forEach((t, i) => {
    const r = resolve(check, t);
    for (const section of ['layout', 'paint'])
      for (const [node, fields] of Object.entries(byNode[section]))
        for (const [f, vs] of Object.entries(fields))
          if (json(r[section][node][f]) !== json(vs[i]))
            fail(`internal: the ${section} rules do not reproduce ${node}.${f} at ${variantName(check, t)}`);
  });
  const children = order.map(node => (textOf[node] ? { name: node, type: 'TEXT' }
    : icons.some(s => s.node === node) ? { name: node, type: 'FRAME', role: 'icon' } : { name: node, type: 'FRAME' }));
  const anatomy = { name: Name, type: 'COMPONENT', ...(children.length && { children }) };

  // Each placeholder becomes a Synthesized token named by its rule (#70 §1): the family, the match's value keys in
  // axis order (an array's joined by "+"), the node unless it is the root, and the field.
  const synthesized = {};
  const valueOrder = Object.fromEntries(axes.map(a => [a.key, a.values.map(v => v.key)]));
  const entryOrder = new Map(entries.map((e, i) => [e, i]));
  const scopeAnatomy = { anatomy };
  for (const rule of paint)
    for (const [node, fields] of Object.entries(rule.set))
      for (const [field, value] of Object.entries(fields)) {
        const keys = axes.filter(a => a.key in rule.match)
          .map(a => [].concat(rule.match[a.key]).sort((x, y) => valueOrder[a.key].indexOf(x) - valueOrder[a.key].indexOf(y)).join('+'));
        const name = n => [family, ...keys, ...(node === Name ? [] : [node.toLowerCase().replace(/\s+/g, '-')]), n].join('-');
        const bind = (v, n, scope) => {
          if (!v || !v.synth) return v;
          const flat = name(n);
          if (synthesized[flat]) fail(`internal: two rules name the Synthesized token ${flat}`);
          const index = r => (entryOrder.has(r.entry) ? entryOrder.get(r.entry) : entries.length);
          const rules = [...uses.get(json(v.synth))].sort((x, y) => index(x) - index(y));
          const utilities = [...new Set(rules.map(r => r.candidate))].join(' ');
          const own = foundations.variables[flat];
          if (own && !isSynthesized(own))
            fail(`the Synthesized token ${flat} (${utilities}) collides with the Code Library token ${flat} (${own.source}); rename one`);
          const lines = [...new Set(rules.map(r => r.entry.line).filter(Boolean))].sort((x, y) => x - y).join(',');
          synthesized[flat] = { collection: 'theme', name: `${Name}/${flat}`, type: 'COLOR', source: `synthesized: ${file}:${lines} ${utilities}`,
            scopes: [scope], codeSyntax: { WEB: utilities }, values: v.synth, usedBy: [family], family };
          return { token: flat };
        };
        if (field === 'effects')
          fields[field] = value.map((e, n) => ({ ...e, color: bind(e.color, value.length > 1 ? `effect-${n + 1}` : 'effect', scopeFor(scopeAnatomy, node, field, 'color')) }));
        else fields[field] = bind(value, field, scopeFor(scopeAnatomy, node, field));
      }

  // 8. Notes.
  const expectedCount = expand({ axes, excluded: [], selection: { omit } }).length;
  const notes = [];
  if (drops.size)
    notes.push({ level: 'info', at: `${file} ${root.cva || Name}`, message: `Each variant's classes are merged as cn() merges them, modelled (no package code runs): a later class drops an earlier one with the same variants whose CSS properties it covers, or that also sets font-size. Here: ${list([...drops].sort(byKey))}.` });
  const why = {
    slot: 'Styled by what the component holds, in a :has() form other than :has([attr="value"]), the only one read as a Slot axis (#121). Not carried.',
    absent: 'Styled by whether the component holds a part the anatomy leaves out (see the anatomy notes). Not carried.',
    ancestor: 'Styled by an ancestor; that is a Mode or the parent\'s Contract (ADR 0012). Not carried.',
    descendant: 'Styles a descendant other than a slot frame or a part; the anatomy below them is not drafted yet (agent tier). Not carried.',
    media: 'Under a media query no tuple decides. Not carried.',
    condition: 'Under a condition no tuple decides (a negation, or two states at once). Not carried.',
    text: texts.length ? 'Text utilities: read only into the text layers\' textStyle and fill (see the anatomy notes), not carried on the root.'
      : 'Text utilities; text styles, the label and the anatomy beyond the root are not drafted yet (agent tier). Not carried.',
    other: 'No Contract field carries these properties. Not carried.',
    none: 'Compiles to no CSS (a group or peer marker).',
  };
  if (icons.length)
    notes.push({ level: 'info', at: 'anatomy', message: `${list(icons.map(s => s.node))}: a frame per Slot axis (#121, ADR 0011), shown where its slot is filled and sized by ${list([...sizing].sort(byKey))}. A consumer size-* class on the svg overrides that size, off-axis (#62). Each frame stands in for the slot's icon, an INSTANCE with an INSTANCE_SWAP whose code.visibleWhen names its axis, which the agent tier does not draft yet.` });
  if (placed.length)
    notes.push({ level: 'info', at: 'anatomy', message: `${list(placed.map(p => p.node))}: the exported parts (${list(placed.map(p => p.name))}), each a FRAME under ${Name} in source order, whatever nesting a consumer gives them. Of each part only its direction (a flex part's own, else a column), its width and height (its own width or height utility; else fill where ${Name} stretches it, hug otherwise) are read, and its visibility where ${Name} styles its presence (a Slot axis). Its own padding, gap, alignment, paint and text are not drafted yet.` });
  for (const p of parts.filter(outOfFlow))
    notes.push({ level: 'info', at: 'anatomy', message: `${p.name} (${file}:${p.line}): position ${p.position.decls.position} (${p.position.candidate}) takes it out of the flow Auto Layout lays out, so the anatomy leaves it out.` });
  if (texts.length) {
    const how = n => (n.kind === 'children' ? `${n.node}: ${Name}'s children (code.prop children)`
      : n.kind === 'placeholder' ? `${n.node}: ${n.name}'s placeholder (code.child ${n.name}, childProp placeholder), coloured as ${Name}'s data-placeholder rules colour it, since the Trigger carries data-placeholder while no value is picked`
      : `${n.node}: ${n.name}'s children (code.child ${n.name})`);
    notes.push({ level: 'info', at: 'anatomy', message: `Text layers (#166), each a TEXT node with a TEXT property: ${texts.map(how).join('; ')}. Each one's text style (font-size, line-height, font-weight) and colour are its own utilities, then what it inherits from ${Name}, then ${cssFile}'s base layer (html line-height, body color). Each binds the Text Style its size and weight utilities name where it holds those values, else its text style is raw, saying why (#160); the default text is a Drafted value.${texts.some(n => n.kind === 'children') ? ` The ${texts.find(n => n.kind === 'children').node} layer is hidden where ${Name} has a fixed width (an icon size), which is sized for its icon.` : ''}` });
  }
  if (unreadText.length)
    notes.push({ level: 'verify', at: 'anatomy', message: `${list([...new Set(unreadText)])}: ${Name} styles a text part's text in a form the text pass does not read; check that part's textStyle and fill.` });
  if (boxes.size)
    notes.push({ level: 'info', at: `${Name}.layout`, message: `${root.name} is a plain box (${[...boxes].sort(byKey).join('; ')}), not a flex or grid container: read as a column Auto Layout with no gap, start-aligned, as a block stacks its children (#153). Its justify-, align-, gap and self-alignment utilities do nothing there.` });
  if (provider)
    notes.push({ level: 'verify', at: 'anatomy', message: `${Name} (${file}:${provider.line}) renders ${provider.element}, a provider with no box of its own, so this Contract is read from ${root.name} (${file}:${root.line}), the box a designer sees; code.component stays ${Name}. In code, ${list(axes.filter(a => !a.canonical).map(a => a.key))} ${axes.filter(a => !a.canonical).length === 1 ? 'is' : 'are'} styled on ${root.name}, not on ${Name}. The other exports (${list(components.filter(c => c.exported && c !== provider && c !== root).map(c => c.name))}) render inside ${root.name} or in the popup it opens, so none is a part, and the options a Usage lists (code.items, ADR 0013) are not drafted.` });
  if (strokeFromBase)
    notes.push({ level: 'info', at: `${Name}.stroke`, message: `No border-color utility colours ${Name}'s border, so it takes its colour from ${cssFile}'s base layer: * { border-color: ${baseBorder.decls['border-color']} }.` });
  const offs = {};
  for (const c of report.fixed)
    for (const r of ruleOf[c]) for (const [prop, v] of Object.entries(r.when.props)) if (prop in fixed && fixed[prop] !== v) (offs[`${prop}\0${v}`] = offs[`${prop}\0${v}`] || new Set()).add(c);
  for (const [k, cs] of Object.entries(offs)) {
    const [prop, v] = k.split('\0');
    notes.push({ level: 'info', at: file, message: `${list([...cs])}: under ${prop} "${v}". ${prop} is a prop of ${root.name} that no axis reads (only a cva variant is an axis), so every variant renders its default${fixed[prop] === undefined ? ' (none)' : ` "${fixed[prop]}"`}. Not carried.` });
  }
  for (const kind of ['slot', 'absent', 'ancestor', 'descendant', 'media', 'condition', 'text', 'other', 'none'])
    if (report[kind].length) notes.push({ level: 'info', at: file, message: `${list(report[kind])}: ${why[kind]}` });
  const exportedParts = parts.map(p => p.name);
  if (expectedCount > VARIANT_LIMIT)
    notes.push({ level: 'verify', at: 'selection', message: `${expectedCount} variants: past ADR 0004's ~${VARIANT_LIMIT}. Only attribute twins are omitted and nothing else is cut; probe the build cost before building it, or narrow it with selection.omit.` });

  // The source facts the agent tier's evidence and fingerprints are drawn from (drafts.mjs).
  // An attribute axis is evidenced by its first utility and pinned by its utilities' variant prefixes (`aria-invalid`,
  // `dark:aria-invalid`), the set #65 names for state and attribute axes.
  const attributes = {};
  for (const [attr, ax] of Object.entries(ATTR_AXES)) {
    if (!attrsUsed.has(attr)) continue;
    const using = entries.filter(e => e.candidate.split(':').slice(0, -1).some(v => v === attr || v.startsWith(`${attr}=`)));
    attributes[ax.key] = { attr, line: using[0].line, candidate: using[0].candidate,
      prefixes: [...new Set(using.map(e => e.candidate.split(':').slice(0, -1).join(':')))].sort(byKey) };
  }
  const facts = { line: root.line, cva: root.cva, parts: exportedParts, variants: cv.keys, attributes,
    texts: texts.map(n => ({ node: n.node, key: n.key, kind: n.kind, name: n.name, line: n.line, code: n.code })),
    ...(provider && { provider: { line: provider.line, element: provider.element, root: root.name } }) };

  // A TEXT property per text layer; its default is a Drafted value (drafts.mjs), the label until it is drafted.
  const properties = texts.map(n => ({ key: n.key, label: n.label, type: 'TEXT', default: n.label, binds: [{ node: n.node, field: 'characters' }], code: n.code }));
  return { name: Name, file, files: sortedFiles, element: root.element, axes, anatomy, properties, layout, paint,
    synthesized: Object.fromEntries(Object.keys(synthesized).sort(byKey).map(k => [k, synthesized[k]])),
    notes, omit, expectedCount, alias: `${ui}/${family}`, renderer, facts };
}

/**
 * Rules for one section: [{match, set: {node: {field: value}}}], `{}` first, a later rule winning where two match
 * (contract.mjs resolve). `byNode` is {node: {field: [value per tuple]}}, the root first. Per node and field:
 * - drop every axis the value does not depend on;
 * - `{}` holds the Base Component's value;
 * - then each match over the remaining axes, fewest axes first (axis order, then value order), takes the value of its
 *   anchor (the Base Component with the match's values) when the rules so far get the anchor wrong and that value
 *   also holds at no fewer than half of the anchor's neighbours (the anchor with one other axis changed), so a rule
 *   names what a value has in common (`{variant: "outline"}`, not one rule per State);
 * - a match over every remaining axis always takes its value when the rules so far get it wrong, so the rules
 *   reproduce every tuple;
 * - the matches over one set of axes that take the same value are merged while two differ in one axis alone.
 * Rule names depend on this (Synthesized tokens are named by their rule's match, #120).
 */
function compress(axes, tuples, byNode) {
  const keys = axes.map(a => a.key);
  const base = Object.fromEntries(axes.map(a => [a.key, a.default]));
  const valueIndex = Object.fromEntries(axes.map(a => [a.key, a.values.map(v => v.key)]));
  const out = new Map();
  const nodes = Object.keys(byNode);
  const rule = (match, node) => {
    const k = JSON.stringify(match);
    if (!out.has(k)) out.set(k, { match, set: {} });
    const set = out.get(k).set;
    return (set[node] = set[node] || {});
  };
  for (const node of nodes) for (const [field, list] of Object.entries(byNode[node])) {
    const json = list.map(v => JSON.stringify(v));
    let dep = keys.slice();
    for (const k of keys) {
      const rest = dep.filter(x => x !== k);
      const seen = new Map();
      const ok = tuples.every((t, i) => {
        const key = rest.map(a => t[a]).join('\0');
        if (!seen.has(key)) seen.set(key, json[i]);
        return seen.get(key) === json[i];
      });
      if (ok) dep = rest;
    }
    const comboKey = c => dep.map(a => c[a]).join('\0');
    const actual = new Map();
    tuples.forEach((t, i) => { if (!actual.has(comboKey(t))) actual.set(comboKey(t), json[i]); });
    const baseJson = actual.get(comboKey(base));
    rule({}, node)[field] = JSON.parse(baseJson);
    const current = new Map([...actual.keys()].map(k => [k, baseJson]));
    const combos = [...actual.keys()].map(k => Object.fromEntries(k.split('\0').map((v, i) => [dep[i], v])));
    // Every set of the remaining axes, fewest first, then in axis order.
    let subsets = [[]];
    for (const a of dep) subsets = subsets.concat(subsets.map(s => [...s, a]));
    subsets = subsets.filter(s => s.length).sort((x, y) => x.length - y.length || order(x, y));
    for (const subset of subsets) {
      const others = dep.filter(a => !subset.includes(a));
      let picks = [];
      for (const c of combos) {
        if (others.some(a => c[a] !== base[a])) continue; // one anchor per value combination of the subset
        const anchor = comboKey(c);
        const want = actual.get(anchor);
        if (current.get(anchor) === want) continue;
        if (others.length) {
          const near = [anchor, ...others.flatMap(a => valueIndex[a].filter(v => v !== c[a]).map(v => comboKey({ ...c, [a]: v })))];
          if (near.filter(k => actual.get(k) === want).length * 2 < near.length) continue;
        }
        picks.push({ match: Object.fromEntries(subset.map(a => [a, [c[a]]])), json: want });
      }
      // Merge along each axis in turn while two picks differ in that axis alone.
      for (let merged = true; merged;) {
        merged = false;
        for (const axis of subset.slice().reverse()) {
          const groups = new Map();
          for (const r of picks) {
            const k = JSON.stringify([r.json, subset.filter(a => a !== axis).map(a => r.match[a])]);
            if (!groups.has(k)) groups.set(k, { match: { ...r.match, [axis]: [] }, json: r.json });
            groups.get(k).match[axis].push(...r.match[axis]);
          }
          if (groups.size < picks.length) merged = true;
          picks = [...groups.values()];
        }
      }
      for (const r of picks) {
        const match = {};
        for (const a of subset) {
          const vs = valueIndex[a].filter(v => r.match[a].includes(v));
          match[a] = vs.length === 1 ? vs[0] : vs;
        }
        rule(match, node)[field] = JSON.parse(r.json);
        for (const c of combos) if (subset.every(a => r.match[a].includes(c[a]))) current.set(comboKey(c), r.json);
      }
    }
  }
  // Rules in the order each field's were made in: fewest axes, then axis order, then value order.
  function order(x, y) {
    for (const k of keys) if (x.includes(k) !== y.includes(k)) return x.includes(k) ? -1 : 1;
    return 0;
  }
  const cmp = (a, b) => {
    const [ka, kb] = [Object.keys(a.match), Object.keys(b.match)];
    if (ka.length !== kb.length) return ka.length - kb.length;
    const o = order(ka, kb);
    if (o) return o;
    for (const k of keys.filter(x => ka.includes(x))) {
      const d = valueIndex[k].indexOf([].concat(a.match[k])[0]) - valueIndex[k].indexOf([].concat(b.match[k])[0]);
      if (d) return d;
    }
    return 0;
  };
  return [...out.values()].sort(cmp).map(r => ({ match: r.match, set: Object.fromEntries(nodes.filter(n => r.set[n])
    .map(n => [n, Object.fromEntries(Object.keys(byNode[n]).filter(f => f in r.set[n]).map(f => [f, r.set[n][f]]))])) }));
}

/**
 * The draft Contract of a family `readFamily()` read, checked with contract.mjs validate against `foundations`, which
 * must hold the family's Synthesized tokens. Throws when it does not validate.
 */
export function contractFor(f, family, foundations) {
  const columns = f.axes.some(a => a.key === 'size') ? ['size'] : [f.axes[0].key];
  const contract = {
    schemaVersion: 1,
    family: { key: family, name: f.name, description: `shadcn/ui ${f.name} (${f.file}), read from its source and compiled CSS.` },
    // The pins plus the preview renderer's packages. The component is a project module, not a package: its import
    // path is pinned to its file's hash (#123).
    source: { codeLibrary: foundations.source.codeLibrary, adapter: 'generic',
      packages: Object.fromEntries(Object.entries({ ...foundations.source.packages, ...f.renderer, [f.alias]: f.files[f.file] }).sort(([a], [b]) => byKey(a, b))),
      files: f.files, snapshotId: snapshotId(f.files) },
    axes: f.axes,
    excluded: [],
    selection: { status: 'draft', omit: f.omit, expectedCount: f.expectedCount, approval: null },
    anatomy: f.anatomy,
    properties: f.properties,
    layout: f.layout,
    paint: f.paint,
    subComponents: [],
    dependencies: { families: [], fonts: [] },
    figma: { page: f.name, componentSetName: f.name, description: `shadcn/ui ${f.name} (${f.file}).`,
      header: { type: 'Component', title: f.name, namespace: f.alias },
      grid: { columns, rows: f.axes.map(a => a.key).filter(k => !columns.includes(k)) } },
    code: { framework: 'react', package: f.alias, component: f.name, import: `import { ${f.name} } from "${f.alias}"`, alwaysEmit: [] },
    notes: f.notes,
  };
  const { errors } = validate(contract, foundations);
  if (errors.length) fail(`the Contract does not validate:\n${errors.map(e => `  rule ${e.rule} ${e.at}: ${e.message}`).join('\n')}`);
  return contract;
}

/**
 * Generate the draft Contract of one family. `foundations` must be the document foundations.mjs wrote with this
 * family: it holds the family's Synthesized tokens exactly as this run derives them and the Contract's closure entry.
 * The agent tier (drafts.mjs, ADR 0010) then merges the Drafted values: carried from `prior` (the Contract on disk, or
 * null) while their fingerprints hold, otherwise taken from `drafts` ({key: value}) or requested.
 * Throws when the document does not match, on a drafted value of the wrong shape, or when the Contract does not
 * validate.
 * @returns {contract, unchanged, report, requests, summary}: `contract` is null while a request is open, and is
 * `prior` itself (`unchanged`) when it holds the same content, or when its snapshot is this one and no Drafted value
 * reopened, went missing or vanished (ADR 0010: an unchanged snapshot writes nothing, so the owner's omit patch, a
 * tweak and the approval stand). `rewrite` drops the second case, to apply a change of the Adapter's own rules.
 */
export async function generate({ project, family, foundations, prior = null, drafts = {}, rewrite = false, tools = DEFAULT_DIR }) {
  if (prior && prior.family.key !== family) fail(`the prior Contract is for "${prior.family.key}", not "${family}"`);
  const f = await readFamily({ project, family, foundations, tools });
  const json = v => JSON.stringify(v);
  const stale = Object.keys(f.synthesized).filter(k => json(foundations.variables[k]) !== json(f.synthesized[k]));
  for (const [k, v] of Object.entries(foundations.variables))
    if (v.family === family && isSynthesized(v) && !f.synthesized[k]) stale.push(k);
  const exact = stale.length ? null : contractFor(f, family, foundations);
  const listed = exact && (foundations.closure.contracts || []).some(c => c.family === family && c.snapshotId === exact.source.snapshotId);
  if (stale.length || !listed)
    fail(`the Foundations document does not hold ${f.name} as its source reads now (${stale.length ? `Synthesized tokens ${stale.sort(byKey).join(', ')}` : 'its closure has no entry for this snapshot'}); regenerate it with foundations.mjs --family ${family}`);
  const { contract, report, requests } = mergeDrafts({ contract: exact, subjects: subjects(f, exact), prior, drafts });
  const counts = ['carried', 'reopened', 'missing', 'vanished', 'owner', 'ownerCheck', 'unused'].map(k => `${k} ${report[k].length}`).join(', ');
  const summary = [
    `${f.name}: axes ${f.axes.map(a => `${a.key} ${a.values.length}`).join(', ')}; ${f.expectedCount} variants`,
    `rules layout ${f.layout.length}, paint ${f.paint.length}; Synthesized tokens ${Object.keys(f.synthesized).length}; notes ${f.notes.length}`,
    `Drafted values: ${counts}`,
  ];
  if (!contract) return { contract, unchanged: false, report, requests, summary };
  const { errors } = validate(contract, foundations);
  if (errors.length) fail(`the Contract does not validate:\n${errors.map(e => `  rule ${e.rule} ${e.at}: ${e.message}`).join('\n')}`);
  const settled = !rewrite && prior !== null && prior.source.snapshotId === contract.source.snapshotId
    && !report.reopened.length && !report.missing.length && !report.vanished.length;
  const unchanged = settled || (prior !== null && contentHash(contract) === contentHash(prior));
  return { contract: unchanged ? prior : contract, unchanged, report, requests, summary };
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  const path = (flag, fallback) => (args.includes(flag) ? resolvePath(opt(flag)) : fallback);
  try {
    const family = opt('--family') || fail('--family <key> is required');
    const project = path('--project', FIXTURE);
    const tools = path('--tools', DEFAULT_DIR);
    const foundationsPath = path('--foundations', join(REPO_ROOT, 'design-systems/shadcn/shadcn.foundations.json'));
    const out = path('-o', join(REPO_ROOT, `design-systems/shadcn/contracts/${family}.component.json`));
    const requestsPath = path('--requests', join(REPO_ROOT, `.scratch/adapter-generic/drafts/${family}.requests.json`));
    const foundations = JSON.parse(readFileSync(foundationsPath, 'utf8'));
    const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    let drafts = {};
    if (args.includes('--drafts')) {
      const file = JSON.parse(readFileSync(path('--drafts'), 'utf8'));
      if (file.family !== family) fail(`--drafts holds drafts for "${file.family}", not "${family}"`);
      drafts = file.drafts;
    }
    const rewrite = args.includes('--rewrite');
    const { contract, unchanged, report, requests, summary } = await generate({ project, family, foundations, prior, drafts, rewrite, tools });
    if (!contract) {
      writeJson(requestsPath, { family, requests });
      console.log([...summary, `${requests.length} Drafted values needed (reopened ${report.reopened.length}, missing ${report.missing.length}): wrote ${relative(process.cwd(), requestsPath)}`,
        `Draft each one, then run again with --drafts <file> holding {"family": "${family}", "drafts": {"<key>": <value>}}.`].join('\n'));
      process.exit(2);
    }
    if (unchanged) console.log([...summary, `unchanged: ${relative(process.cwd(), out)} not written (--rewrite applies a change of the Adapter's rules)`, 'OK'].join('\n'));
    else {
      writeJson(out, contract);
      console.log([...summary, `wrote ${relative(process.cwd(), out)}`, 'OK'].join('\n'));
    }
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
