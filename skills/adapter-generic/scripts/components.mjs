#!/usr/bin/env node
// The Generic Adapter's component step, exact tier (#119): a shadcn/ui component family's draft Contract, read from
// its source (source.mjs) and Tailwind's compiled CSS (cascade.mjs). Never edit its output by hand.
//
//   node skills/adapter-generic/scripts/components.mjs --family <key> [--project <dir>] [--foundations <file>]
//     [--tools <dir>] [-o <file>]
//
// Defaults: the committed fixture project (sources.mjs FIXTURE), its Foundations document
// design-systems/shadcn/shadcn.foundations.json, output design-systems/shadcn/contracts/<family>.component.json.
// The Contract is checked with contract.mjs validate and written with io.mjs writeJson; two runs are byte-identical.
//
// What it reads, for the family's root component (the export named after the family):
// - axes: each cva variant axis, then an axis per attribute state the CSS styles (ATTR_AXES), then the canonical
//   State from the CSS pseudo-classes. Every axis is fully selected.
// - layout and paint of the root node, per variant: the cva classes each variant renders, merged as `cn()` merges
//   them, then the CSS cascade over their compiled rules (specificity, then output order).
// What it leaves to later tickets, each in a note: text and anatomy beyond the root (#122), slot conditions (#121),
// styling set by an ancestor (ADR 0012), and paint that differs by Mode, carries an opacity or mixes tokens (#120).
// Generation throws (the CLI exits 1 and writes nothing) on the last, listing every value, and on anything it cannot
// read exactly: compound variants, an attribute state with no known state words, layout that differs by Mode, a
// border whose colour comes from the base layer, or a Foundations document from another snapshot.
import { readFileSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert } from '../../contract/scripts/color.mjs';
import { resolve, validate, variantName } from '../../contract/scripts/contract.mjs';
import { writeJson } from '../../contract/scripts/io.mjs';
import { candidateRules, compiledRules, winner } from './cascade.mjs';
import { evaluate, round } from './foundations.mjs';
import { readSource } from './source.mjs';
import { DEFAULT_DIR, FIXTURE, REPO_ROOT, fetchTools, hasTools, sha256, snapshotId } from './sources.mjs';
import { build } from './tailwind.mjs';

// Attribute states with known state words: the attribute becomes an axis, absent by default (#119).
const ATTR_AXES = {
  'aria-invalid': { key: 'invalid', label: 'Invalid', off: 'valid', on: 'invalid' },
  'aria-expanded': { key: 'expanded', label: 'Expanded', off: 'collapsed', on: 'expanded' },
};
const STATES = ['hover', 'active', 'focus', 'disabled'];
const STATE_CSS = [':hover', ':active', ':focus-visible', ':focus', ':disabled', '[aria-disabled="true"]', '[data-disabled]'];
const NATIVE_DISABLED = new Set(['button', 'input', 'select', 'textarea', 'fieldset']);
const VARIANT_LIMIT = 600; // ADR 0004
// CSS properties a Contract field carries; any other utility is reported, not carried.
const LAYOUT_PROPS = ['display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'width', 'height', 'border-radius',
  'border-width', 'padding', 'padding-inline', 'padding-block', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
const PAINT_PROPS = ['background-color', 'border-color', 'opacity', '--tw-ring-shadow', '--tw-ring-color'];
const TEXT_PROPS = ['color', 'font-size', 'line-height', 'font-weight', '--tw-font-weight', '--tw-leading', 'letter-spacing',
  '--tw-tracking', 'text-align', 'text-decoration-line', 'text-underline-offset', 'white-space'];
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

const fail = msg => { throw new Error(msg); };
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const words = s => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
const title = s => words(s).join(' ');
const pascal = s => words(s).join('');
const has = (rule, props) => props.some(p => p in rule.decls);
const declOf = (rule, props) => rule.decls[props.find(p => p in rule.decls)];

// "a b(c d)" -> ["a", "b(c d)"]: the space-separated parts of a value, outside parentheses.
function parts(text) {
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
 * Read one family at the exact tier. Returns {name, file, files, axes, layout, paint, pending, notes, expectedCount}:
 * `pending` lists the paint values #120 owns: [{at, light, dark, lines, reason, variants}], each with the winning
 * utility per Mode, the source lines that name them and how many variants use them. Throws on anything it cannot
 * read exactly (see the header).
 */
export async function readFamily({ project, family, foundations, tools = DEFAULT_DIR }) {
  const readText = rel => readFileSync(join(project, rel), 'utf8');
  const config = JSON.parse(readText('components.json'));
  const cssFile = config.tailwind && config.tailwind.css;
  const ui = (config.aliases && config.aliases.ui) || '@/components/ui';
  if (!ui.startsWith('@/')) fail(`components.json aliases.ui "${ui}" is not under "@/"`);
  const file = `${ui.slice(2)}/${family}.tsx`;
  const Name = pascal(family);

  // 0. The Foundations document must come from this snapshot of the project.
  if (!foundations.source || foundations.source.adapter !== 'generic') fail('the Foundations document was not written by the Generic Adapter');
  const files = {};
  for (const [f, hash] of Object.entries(foundations.source.files)) {
    files[f] = `sha256:${sha256(readFileSync(join(project, f)))}`;
    if (files[f] !== hash) fail(`${f} differs from the one the Foundations document was read from: it is from another snapshot; regenerate it (foundations.mjs) first`);
  }
  files[file] = `sha256:${sha256(readFileSync(join(project, file)))}`;
  const sortedFiles = Object.fromEntries(Object.keys(files).sort(byKey).map(f => [f, files[f]]));

  // 1. Source: the root component and its cva call.
  const { cvas, components } = readSource(readText(file), file, { tools });
  const root = components.find(c => c.name === Name && c.exported) || fail(`${file} exports no ${Name}`);
  if (!root.cva) fail(`${file}:${root.line} ${Name} calls no cva; only cva families are read yet`);
  const cv = cvas[root.cva];
  if (cv.compound.length) fail(`${file}:${cv.compound[0].line} ${root.cva}: compoundVariants are not read yet`);
  const entries = []; // every class occurrence: {candidate, line, axis?, value?}, in the order cva emits them
  const add = (list, origin) => list.classes.split(/\s+/).filter(Boolean).forEach(c => entries.push({ candidate: c, line: list.line, ...origin }));
  add(cv.base, {});
  for (const [axis, values] of Object.entries(cv.variants))
    for (const [value, list] of Object.entries(values)) add(list, { axis, value });
  root.classes.forEach(list => add(list, {}));
  const at = e => `${file}:${e.line}`;

  // 2. Compile every utility and sort its rules by condition.
  const candidates = [...new Set(entries.map(e => e.candidate))].sort(byKey);
  const compiled = await build(readText(cssFile), candidates, { base: join(project, cssFile, '..'), tools });
  const rules = compiledRules(compiled);
  const modes = foundations.collections.find(c => c.key === 'theme').modes;
  const propAttrs = Object.fromEntries(Object.entries(root.attrs).filter(([, a]) => a.prop && cv.variants[a.prop]).map(([k, a]) => [k, a.prop]));
  const ruleOf = {};
  for (const c of candidates) ruleOf[c] = candidateRules(rules, c, { modes, attrs: propAttrs });
  const propsOf = c => new Set(ruleOf[c].flatMap(r => Object.keys(r.decls)));

  // 3. Sort the utilities: carried, or reported in a note.
  const report = { none: [], text: [], other: [], slot: [], ancestor: [], descendant: [], media: [], condition: [] };
  const carried = new Set();
  for (const c of candidates) {
    const props = [...propsOf(c)];
    const skip = ruleOf[c].map(r => r.skip).find(Boolean);
    if (!props.length) report.none.push(c);
    else if (skip) report[skip].push(c);
    else if (props.some(p => LAYOUT_PROPS.includes(p) || PAINT_PROPS.includes(p))) carried.add(c);
    else report[props.some(p => TEXT_PROPS.includes(p)) ? 'text' : 'other'].push(c);
  }
  const live = entries.filter(e => carried.has(e.candidate)).flatMap(e => ruleOf[e.candidate].map(r => ({ ...r, entry: e })));

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
  const stateValue = key => {
    const css = [...stateCss[key]].sort((a, b) => STATE_CSS.indexOf(a) - STATE_CSS.indexOf(b));
    let code = null;
    if (key === 'disabled')
      code = NATIVE_DISABLED.has(root.element) && css.includes(':disabled') ? { disabled: true }
        : css.includes('[aria-disabled="true"]') ? { 'aria-disabled': true } : { 'data-disabled': true };
    return { key, label: title(key), code, css: css.join(', ') };
  };
  axes.push({ key: 'state', label: 'State', canonical: true, default: 'enabled', defaultSource: 'canonical State axis (#6)',
    values: [{ key: 'enabled', label: 'Enabled', code: {} }, ...STATES.filter(s => stateCss[s]).map(stateValue)] });
  let tuples = [{}];
  for (const a of axes) tuples = tuples.flatMap(t => a.values.map(v => ({ ...t, [a.key]: v.key })));

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
    return !w.props || Object.entries(w.props).every(([p, v]) => t[p] === v);
  };

  const env = {};
  for (const [k, v] of Object.entries(foundations.variables)) {
    const d = v.values.default;
    if (d && d.from && d.from.multiplier && d.from.factor) env[d.from.multiplier] = round(d.value / d.from.factor);
    if (/^radius-/.test(k)) env[`--${k}`] = d.value;
  }
  const tokenFor = (text, scope) => Object.keys(foundations.variables).sort(byKey).find(k => {
    const v = foundations.variables[k];
    return v.codeSyntax && v.codeSyntax.WEB === text && (v.scopes || []).includes(scope);
  });
  const length = (field, r, props) => {
    const text = declOf(r, props);
    if (parts(text).length > 1) fail(`${r.candidate} (${at(r.entry)}): ${text} sets more than one side; not read yet`);
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
    if (/^color-mix\(in \w+, var\(--[\w-]+\) \d*\.?\d+%, transparent\)$/.test(text)) return { pending: 'a token at an opacity' };
    if (/^color-mix\(/.test(text)) return { pending: 'mixes tokens' };
    if (/^currentcolor$/i.test(text)) fail(`${r.candidate} (${at(r.entry)}): currentcolor is not read yet`);
    let c;
    try { c = convert(text); } catch (e) { fail(`${r.candidate} (${at(r.entry)}): ${e.message}`); }
    const out = { raw: c.hex, level: 'warning', reason: `${r.candidate}: the literal colour ${text} has no Foundations variable` };
    if (c.alpha !== 1) out.alpha = c.alpha;
    return out;
  };

  const usesBorder = live.some(r => 'border-width' in r.decls);
  const usesRadius = live.some(r => 'border-radius' in r.decls);
  // Layout and paint of one variant in one Mode: {layout, paint, by: {field: winning rule}}.
  function render(t, mode) {
    const keep = survivors(t);
    const here = live.filter(r => applies(r, t, mode, keep));
    const win = props => winner(here, props);
    const layout = {}, paint = {}, by = {};
    const display = win(['display']);
    if (!display || !/^(inline-)?flex$/.test(display.decls.display))
      fail(`${Name} (${variantName({ axes }, t)}) is not a flex container (display: ${display ? display.decls.display : 'not set'}); only Auto Layout is read`);
    const dir = win(['flex-direction']);
    layout.direction = dir && /^column/.test(dir.decls['flex-direction']) ? 'column' : 'row';
    for (const [field, prop] of [['width', 'width'], ['height', 'height']]) {
      const r = win([prop]);
      layout[field] = r ? length(field, r, [prop]).value : 'hug';
      if (r) by[field] = r;
    }
    for (const [field, prop] of [['alignMain', 'justify-content'], ['alignCross', 'align-items']]) {
      const r = win([prop]);
      const v = r ? r.decls[prop] : 'normal';
      layout[field] = ALIGN[v] || fail(`${r.candidate} (${at(r.entry)}): ${prop}: ${v} has no Auto Layout alignment`);
    }
    const border = win(['border-width']);
    const bw = border ? evaluate(border.decls['border-width'], env, border.candidate) : 0;
    for (const [field, props] of Object.entries(PADDING)) {
      const r = win(props);
      if (r) by[field] = r;
      if (!bw) { layout[field] = r ? length(field, r, props).value : { token: 'spacing-0' }; continue; }
      const p = r ? length(field, r, props) : null;
      layout[field] = { raw: round((p ? p.px : 0) + bw), level: 'info', reason: p
        ? `derived: ${r.candidate} ${p.prop} ${p.text} = ${p.px}px + ${bw}px border (an inside stroke takes no layout space)`
        : `derived: no padding + ${bw}px border (an inside stroke takes no layout space)` };
    }
    const gap = win(['gap']);
    layout.gap = gap ? length('gap', gap, ['gap']).value : { token: 'spacing-0' };
    if (gap) by.gap = gap;
    if (usesRadius) {
      const r = win(['border-radius']);
      layout.radius = r ? length('radius', r, ['border-radius']).value : { raw: 0, level: 'info', reason: 'no border-radius utility' };
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
      const r = win(['border-color']);
      if (!r) fail(`${Name} (${variantName({ axes }, t)}): a ${bw}px border with no border-color utility takes its colour from the base layer, which is not read`);
      paint.stroke = colour(r.decls['border-color'], r);
      by.stroke = r;
    } else paint.stroke = 'none';
    const op = win(['opacity']);
    paint.opacity = op ? round(/%$/.test(op.decls.opacity) ? parseFloat(op.decls.opacity) / 100 : parseFloat(op.decls.opacity)) : 1;
    const ring = win(['--tw-ring-shadow']);
    paint.effects = [];
    if (ring) {
      const m = /calc\((\d*\.?\d+)px \+ var\(--tw-ring-offset-width\)\)/.exec(ring.decls['--tw-ring-shadow']);
      if (!m) fail(`${ring.candidate} (${at(ring.entry)}): ring ${ring.decls['--tw-ring-shadow']} is not read`);
      const rc = win(['--tw-ring-color']);
      if (!rc) fail(`${ring.candidate} (${at(ring.entry)}): a ring with no ring colour is currentcolor, which is not read yet`);
      const color = colour(rc.decls['--tw-ring-color'], rc);
      paint.effects = color.pending ? color : [{ type: 'drop-shadow',
        spread: { raw: parseFloat(m[1]), level: 'info', reason: `${ring.candidate}: a ${m[1]}px ring (box-shadow 0 0 0 ${m[1]}px); no effect-spread variable` }, color }];
      by.effects = rc;
    }
    return { layout, paint, by };
  }

  // 6. Every variant in every Mode. Layout must not differ by Mode; paint that does is #120's.
  const values = { layout: {}, paint: {} };
  LAYOUT_FIELDS.forEach(f => { values.layout[f] = []; });
  PAINT_FIELDS.forEach(f => { values.paint[f] = []; });
  const pendingBy = new Map();
  for (const t of tuples) {
    const [light, ...others] = modes.map(m => render(t, m.key));
    others.forEach((o, i) => {
      for (const f of LAYOUT_FIELDS)
        if (JSON.stringify(o.layout[f]) !== JSON.stringify(light.layout[f])) {
          const r = o.by[f] || light.by[f];
          fail(`${Name}.${f}: ${r ? `${r.candidate} (${at(r.entry)})` : 'a value'} differs by mode (${modes[i + 1].key}); layout is the same in every Mode`);
        }
    });
    for (const f of LAYOUT_FIELDS) values.layout[f].push(light.layout[f]);
    for (const f of PAINT_FIELDS) {
      const dark = others[0] || light;
      const [lv, dv] = [JSON.stringify(light.paint[f]), JSON.stringify(dark.paint[f])];
      const reason = lv !== dv ? 'differs by mode' : light.paint[f] && light.paint[f].pending;
      if (!reason) { values.paint[f].push(light.paint[f]); continue; }
      values.paint[f].push({ pending: reason });
      const [lr, dr] = [light.by[f], dark.by[f]];
      const key = [f, lr && lr.candidate, dr && dr.candidate, reason].join('\0');
      if (!pendingBy.has(key))
        pendingBy.set(key, { at: `${Name}.${f}`, light: lr ? lr.candidate : null, dark: dr ? dr.candidate : null,
          lines: [...new Set([lr, dr].filter(Boolean).map(r => at(r.entry)))], reason, variants: 0 });
      pendingBy.get(key).variants++;
    }
  }
  for (const f of LAYOUT_FIELDS) if (values.layout[f].every(v => v === undefined)) delete values.layout[f];

  // 7. Rules: per field, the fewest axes it depends on; the commonest value in `{}`, the rest as exceptions.
  const layout = compress(axes, tuples, values.layout, Name);
  const paint = compress(axes, tuples, values.paint, Name);
  const check = { axes, layout, paint, properties: [] };
  tuples.forEach((t, i) => {
    const r = resolve(check, t);
    for (const [section, fields] of [['layout', values.layout], ['paint', values.paint]])
      for (const [f, list] of Object.entries(fields))
        if (JSON.stringify(r[section][Name][f]) !== JSON.stringify(list[i]))
          fail(`internal: the ${section} rules do not reproduce ${Name}.${f} at ${variantName(check, t)}`);
  });

  // 8. Notes.
  const expectedCount = tuples.length;
  const list = cs => cs.join(', ');
  const notes = [];
  if (drops.size)
    notes.push({ level: 'info', at: `${file} ${root.cva}`, message: `Each variant's classes are merged as cn() merges them, modelled (no package code runs): a later class drops an earlier one with the same variants whose CSS properties it covers, or that also sets font-size. Here: ${list([...drops].sort(byKey))}.` });
  const why = {
    slot: 'Styled by what the component holds (:has); the slot axis is #121. Not carried.',
    ancestor: 'Styled by an ancestor; that is a Mode or the parent\'s Contract (ADR 0012). Not carried.',
    descendant: 'Styles a descendant; anatomy beyond the root is the agent tier (#122). Not carried.',
    media: 'Under a media query no tuple decides. Not carried.',
    condition: 'Under a condition no tuple decides (a negation, or two states at once). Not carried.',
    text: 'Text utilities; text styles, the label and the anatomy beyond the root are the agent tier (#122). Not carried.',
    other: 'No Contract field carries these properties. Not carried.',
    none: 'Compiles to no CSS (a group or peer marker).',
  };
  for (const kind of ['slot', 'ancestor', 'descendant', 'media', 'condition', 'text', 'other', 'none'])
    if (report[kind].length) notes.push({ level: 'info', at: file, message: `${list(report[kind])}: ${why[kind]}` });
  const exportedParts = components.filter(c => c.exported && c !== root).map(c => c.name);
  if (exportedParts.length) notes.push({ level: 'info', at: file, message: `${list(exportedParts)}: parts beyond the root are the agent tier (#122).` });
  notes.push({ level: 'info', at: 'figma.grid', message: 'A placeholder layout (size across, every other axis down); the agent tier (#122) lays the grid out.' });
  if (expectedCount > VARIANT_LIMIT)
    notes.push({ level: 'verify', at: 'selection', message: `${expectedCount} variants: past ADR 0004's ~${VARIANT_LIMIT}. Every axis is fully selected and nothing is cut; probe the build cost before building it, or narrow it with selection.omit.` });

  return { name: Name, file, files: sortedFiles, element: root.element, axes, layout, paint,
    pending: [...pendingBy.values()], notes, expectedCount, alias: `${ui}/${family}` };
}

/**
 * Rules for one section: [{match, set: {node: {field: value}}}], `{}` first. `values` is {field: [value per tuple]}.
 * Per field: drop every axis the value does not depend on; the commonest value (a tie goes to the Base Component's)
 * goes in `{}`, each other value in a rule matching its axes, merged while two rules differ in one axis alone.
 * The rules of one field never overlap, so their order only needs `{}` first.
 */
function compress(axes, tuples, values, node) {
  const keys = axes.map(a => a.key);
  const base = Object.fromEntries(axes.map(a => [a.key, a.default]));
  const valueIndex = Object.fromEntries(axes.map(a => [a.key, a.values.map(v => v.key)]));
  const out = new Map();
  const rule = match => {
    const k = JSON.stringify(match);
    if (!out.has(k)) out.set(k, { match, set: { [node]: {} } });
    return out.get(k).set[node];
  };
  rule({});
  for (const [field, list] of Object.entries(values)) {
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
    const combos = new Map();
    tuples.forEach((t, i) => {
      const key = dep.map(a => t[a]).join('\0');
      if (!combos.has(key)) combos.set(key, { combo: t, json: json[i] });
    });
    const count = new Map();
    for (const c of combos.values()) count.set(c.json, (count.get(c.json) || 0) + 1);
    const most = Math.max(...count.values());
    const baseJson = combos.get(dep.map(a => base[a]).join('\0')).json;
    const common = count.get(baseJson) === most ? baseJson : [...count.keys()].find(j => count.get(j) === most);
    rule({})[field] = JSON.parse(common);
    // Exceptions, one per combination, then merged along each axis in turn while two differ in that axis alone.
    let rest = [...combos.values()].filter(c => c.json !== common).map(c => ({ match: Object.fromEntries(dep.map(a => [a, [c.combo[a]]])), json: c.json }));
    for (let merged = true; merged;) {
      merged = false;
      for (const axis of dep.slice().reverse()) {
        const groups = new Map();
        for (const r of rest) {
          const k = JSON.stringify([r.json, dep.filter(a => a !== axis).map(a => r.match[a])]);
          if (!groups.has(k)) groups.set(k, { match: { ...r.match, [axis]: [] }, json: r.json });
          groups.get(k).match[axis].push(...r.match[axis]);
        }
        if (groups.size < rest.length) merged = true;
        rest = [...groups.values()];
      }
    }
    for (const r of rest) {
      const match = {};
      for (const a of dep) {
        const vs = valueIndex[a].filter(v => r.match[a].includes(v));
        if (vs.length < valueIndex[a].length) match[a] = vs.length === 1 ? vs[0] : vs;
      }
      rule(match)[field] = JSON.parse(r.json);
    }
  }
  const rank = m => [Object.keys(m).length, ...keys.map(k => (k in m ? 1 + valueIndex[k].indexOf([].concat(m[k])[0]) : 0))];
  const cmp = (a, b) => {
    const [ra, rb] = [rank(a.match), rank(b.match)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  };
  const fieldOrder = Object.keys(values);
  return [...out.values()].sort(cmp).map(r => ({ match: r.match,
    set: { [node]: Object.fromEntries(fieldOrder.filter(f => f in r.set[node]).map(f => [f, r.set[node][f]])) } }));
}

/**
 * Generate the draft Contract of one family. Throws when #120 owns a value (listing every one), when `drafts` is
 * not empty (the agent tier, #122), or when the Contract does not validate.
 * @returns {contract, summary}
 */
export async function generate({ project, family, foundations, drafts = [], tools = DEFAULT_DIR }) {
  if (drafts.length) fail('drafts are read by the agent tier (#122), which does not exist yet');
  const f = await readFamily({ project, family, foundations, tools });
  if (f.pending.length)
    fail(`Synthesized tokens (#120) are needed for ${f.pending.length} paint values of ${f.name}; nothing is written:\n${f.pending.map(p =>
      `  ${p.at} ${p.light || '(none)'} / ${p.dark || '(none)'}: ${p.reason} (${p.variants} variants; ${p.lines.join(', ')})`).join('\n')}`);
  const columns = f.axes.some(a => a.key === 'size') ? ['size'] : [f.axes[0].key];
  const contract = {
    schemaVersion: 1,
    family: { key: family, name: f.name, description: `shadcn/ui ${f.name} (${f.file}), read from its source and compiled CSS.` },
    source: { codeLibrary: foundations.source.codeLibrary, adapter: 'generic', packages: foundations.source.packages,
      files: f.files, snapshotId: snapshotId(f.files) },
    axes: f.axes,
    excluded: [],
    selection: { status: 'draft', omit: [], expectedCount: f.expectedCount, approval: null },
    anatomy: { name: f.name, type: 'COMPONENT' },
    properties: [],
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
  const summary = [
    `${f.name}: axes ${f.axes.map(a => `${a.key} ${a.values.length}`).join(', ')}; ${f.expectedCount} variants`,
    `rules layout ${f.layout.length}, paint ${f.paint.length}; notes ${f.notes.length}`,
  ];
  return { contract, summary };
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
    if (!hasTools(tools)) await fetchTools(tools);
    const foundations = JSON.parse(readFileSync(foundationsPath, 'utf8'));
    const { contract, summary } = await generate({ project, family, foundations, tools });
    writeJson(out, contract);
    console.log([...summary, `wrote ${relative(process.cwd(), out)}`, 'OK'].join('\n'));
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
