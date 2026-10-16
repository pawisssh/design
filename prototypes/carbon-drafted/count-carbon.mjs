// #94: classify every value in a Carbon Contract by where it comes from.
//   read      a token, CSS selector, code prop, default or exclusion the procedure reads from pinned source
//   computed  an `info` raw: computed from tokens, with the derivation in `reason`
//   constant  a `warning` raw: a Sass constant with no token, with the constant in `reason`
//   rule      a value `skills/adapter-carbon/SKILL.md` §2 (or the canonical State axis) names outright
//   drafted   a value the agent judged inside the procedure: what ADR 0010 calls a Drafted value
// Keys follow ADR 0010's paths; a value set in a non-base rule would need its match in the key (none here).
// usage: node prototypes/carbon-drafted/count-carbon.mjs <component.json>
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = { read: [], computed: [], constant: [], rule: [], drafted: [] };
const add = (cls, path, v, why = '') => out[cls].push(`${path} = ${JSON.stringify(v).slice(0, 70)}${why ? `  (${why})` : ''}`);
// Layout scalars checked by hand against the pinned SCSS (44f90d8) and found to be read, not judged.
// Every other direction/width/height/align/textResize counts as drafted, so `drafted` is an upper bound.
const READ_LAYOUT = {
  'button:layout.Button.direction': '_mixins.scss L50 display: inline-flex',
  'button:layout.Button.width': '_mixins.scss L56 inline-size: max-content',
};

for (const a of c.axes) {
  add(a.canonical ? 'rule' : 'drafted', `axes.${a.key}.label`, a.label, a.canonical ? 'canonical State axis' : '');
  add(a.canonical ? 'rule' : 'read', `axes.${a.key}.default`, a.default, a.defaultSource || 'canonical');
  for (const v of a.values) {
    add(a.canonical ? 'rule' : 'drafted', `axes.${a.key}.values.${v.key}.label`, v.label, a.canonical ? 'canonical' : '');
    // A fold: one state value whose selectors include another canonical state's pseudo-class (":focus, :active").
    const folded = a.canonical && v.css && ['hover', 'active', 'focus'].some(s => s !== v.key && v.css.includes(`:${s}`));
    add(folded ? 'drafted' : a.canonical && !v.css ? 'rule' : 'read', `axes.${a.key}.values.${v.key}.code`, v.css ? { code: v.code, css: v.css } : v.code,
      folded ? 'two states folded into one: §2 has no fold rule yet' : a.key === 'size' && v.code && v.code.isExpressive ? '§2.4 expressive is its own size value' : a.canonical ? '§2.5' : '');
  }
  const order = a.values.map(v => v.key);
  if (a.canonical) add('rule', `axes.${a.key}.order`, order, 'canonical');
  else if (a.key === 'kind') add('rule', `axes.${a.key}.order`, order, '§2.3 Carbon docs order');
  else if (a.key === 'size') add('rule', `axes.${a.key}.order`, order, '§2.4 size token scale');
  else add('drafted', `axes.${a.key}.order`, order);
}
add('drafted', 'family.description', c.family.description, 'prose');
if (/separate .* family/i.test(c.family.description)) add('drafted', 'family.split', c.family.description.match(/[^.]*separate[^.]*/i)[0].trim());
add('read', 'excluded', c.excluded, c.excluded.length ? 'read from source logic' : 'nothing impossible in source');

const walk = (n, root) => {
  const iconSlot = n.role === 'icon-slot' || n.role === 'icon';
  add(root ? 'rule' : iconSlot ? 'rule' : 'drafted', `anatomy.${n.name}`, { type: n.type, role: n.role },
    root ? 'root is the COMPONENT' : iconSlot ? '§2.9 Icon slot FRAME + Glyph INSTANCE' : '');
  (n.children || []).forEach(ch => walk(ch, false));
};
walk(c.anatomy, true);
for (const p of c.properties) {
  const iconProp = p.type === 'INSTANCE_SWAP' || (p.type === 'BOOLEAN' && p.binds.every(b => /Glyph|Icon/.test(b.node)));
  add(iconProp ? 'rule' : 'drafted', `properties.${p.key}`, { type: p.type, label: p.label, default: p.default }, iconProp ? '§2.9' : '');
  if (p.binds.some(b => b.match)) add('drafted', `properties.${p.key}.binds`, p.binds.map(b => [b.match, b.node]), 'per-value binding judged from SCSS');
}
for (const area of ['layout', 'paint']) for (const r of c[area]) {
  const m = Object.keys(r.match).length ? JSON.stringify(r.match) : '';
  for (const [node, fields] of Object.entries(r.set)) for (const [f, v] of Object.entries(fields)) {
    const path = `${area}${m}.${node}.${f}`;
    if (v && typeof v === 'object' && 'raw' in v) add(v.level === 'warning' ? 'constant' : 'computed', path, v.raw);
    else if (Array.isArray(v)) add(JSON.stringify(v).includes('"level":"warning"') ? 'constant' : 'read', path, `${v.length} entries`, '§2.8 focus ring');
    else if (v && typeof v === 'object') add('read', path, v);
    else if (f === 'strokeAlign') add('rule', path, v, '§2.8 inside stroke');
    else if (v === 'none') add('rule', path, v, '§2.7 transparent');
    else if (READ_LAYOUT[`${c.family.key}:${path}`]) add('read', path, v, READ_LAYOUT[`${c.family.key}:${path}`]);
    else if (/^(direction|width|height|alignMain|alignCross|textResize)$/.test(f)) add('drafted', path, v, 'no declaration checked');
    else add('read', path, v);
  }
}
add('drafted', 'icons.default', c.icons.default, '§2.9 picked from docs examples');
add('drafted', 'icons.preferred', c.icons.preferred, '§2.9 picked from docs examples');
add('rule', 'figma.page', c.figma.page);
add('rule', 'figma.componentSetName', c.figma.componentSetName);
add('drafted', 'figma.description', c.figma.description, 'prose');
add('drafted', 'figma.grid', c.figma.grid);
add('drafted', 'code.alwaysEmit', c.code.alwaysEmit, c.code.alwaysEmitWhy || '');

const total = Object.values(out).reduce((s, v) => s + v.length, 0);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(9), String(v.length).padStart(3), `${(100 * v.length / total).toFixed(0)}%`);
console.log('total    ', total);
for (const k of ['drafted', 'rule', 'constant', 'computed']) { console.log(`\n${k}:`); for (const l of out[k]) console.log('  ' + l); }
