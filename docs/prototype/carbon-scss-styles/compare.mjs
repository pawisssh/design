// PROTOTYPE (#312), throwaway. Joins out/static.json and out/runtime.json per state and element path, scores the
// static way's resolved values against the computed ones (the ground truth for resolved values), and shows what
// each way says about where a colour comes from. Writes out/report.md.
//
//   node docs/prototype/carbon-scss-styles/compare.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
const S = JSON.parse(readFileSync(join(OUT, 'static.json'), 'utf8'));
const R = JSON.parse(readFileSync(join(OUT, 'runtime.json'), 'utf8'));
const ST = JSON.parse(readFileSync(join(OUT, 'static.timing.json'), 'utf8'));
const RT = JSON.parse(readFileSync(join(OUT, 'runtime.timing.json'), 'utf8'));

// The DrilldownItem elements the answer key covers, by path inside the row.
const KEY = { '': 'row', '0': 'content', '0>0': 'name', '0>1': 'meta', '0>1>0': 'tag', '1': 'icons', '1>0': 'memo wrapper',
  '1>0>0>0>0>0': 'OverflowMenu button', '1>0>0>0>0>0>0': 'memo <i>', '1>1': 'clock <i>', '1>2': 'chat <i>' };
const INITIAL = { 'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px', 'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
  'background-color': 'rgba(0, 0, 0, 0)', 'border-top-left-radius': '0px', 'row-gap': 'normal', 'column-gap': 'normal', 'letter-spacing': 'normal', 'border-bottom-style': 'none', 'border-bottom-width': '0px', 'min-height': 'auto' };
const LAYOUT = new Set(['width', 'height', 'min-height']);

const NAMED = { transparent: 'rgba(0, 0, 0, 0)', white: 'rgb(255, 255, 255)', black: 'rgb(0, 0, 0)' };
function rgb(v) {
  v = v.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1]; if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); const a = h.length === 8 ? Math.round(parseInt(h.slice(6), 16) / 255 * 100) / 100 : 1;
    return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return p.length === 4 && p[3] !== 1 ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})` : `rgb(${p[0]}, ${p[1]}, ${p[2]})`; }
  return null;
}
const isColour = p => /color$/.test(p);
// Static's resolved value, in the form getComputedStyle gives.
function norm(p, s, el) {
  if (!s) return undefined;
  let v = s.resolved.trim();
  if (isColour(p)) { if (v === 'currentcolor') v = el.props.color ? el.props.color.resolved : 'currentcolor'; return rgb(v) || v; }
  if (p === 'font-weight') return { normal: '400', bold: '700' }[v] || v;
  if (p === 'line-height' && /^[\d.]+$/.test(v)) { const fs = parseFloat(el.props['font-size'] ? el.props['font-size'].resolved : '16'); return `${+(parseFloat(v) * fs).toFixed(4)}px`; }
  if (p === 'font-family') return v.replace(/["']/g, '').replace(/\s*,\s*/g, ', ');
  if (/^0$/.test(v)) return '0px';
  return v;
}
// Chrome serialises BlinkMacSystemFont as "system-ui".
const fam = v => v.replace(/["']/g, '').replace(/BlinkMacSystemFont/g, 'system-ui');
const same = (p, a, b) => (p === 'font-family' ? fam(a) === fam(b) : a === b || (/px$/.test(a) && /px$/.test(b) && Math.abs(parseFloat(a) - parseFloat(b)) < 0.01));

const rows = []; const tally = { agree: 0, initial: 0, layout: 0, differ: 0, staticOnly: 0 };
for (const rs of R.states) {
  const ss = S.states.find(x => x.state === rs.state);
  for (const re of rs.elements) {
    const se = ss.elements.find(x => x.path === re.path);
    for (const [p, rv] of Object.entries(re.props)) {
      const s = se.props[p]; const sv = norm(p, s, se);
      let verdict;
      if (sv === undefined) verdict = LAYOUT.has(p) ? 'layout' : INITIAL[p] === rv || (p === 'border-bottom-color' && rv === re.props.color) || (p === 'display' && rv === ({ span: 'inline', i: 'inline', button: 'inline-block' }[re.tag] || 'block')) ? 'initial' : 'differ';
      else verdict = same(p, sv, rv) ? 'agree' : LAYOUT.has(p) && sv === 'auto' ? 'layout' : 'differ';
      tally[verdict]++;
      if (verdict === 'differ' && KEY[re.path] !== undefined) rows.push({ state: rs.state, el: KEY[re.path], p, s: s ? `${s.authored}${s.authored !== s.resolved ? ` → ${s.resolved}` : ''} (${s.source}${s.inherited ? ', inherited' : ''})` : 'none declared', r: rv });
    }
  }
}

// Colours, by state: what static says about the source, what the computed value matches by value.
const byValue = {};
for (const [n, v] of Object.entries(S.g10)) { const c = rgb(v); if (c) (byValue[c] ||= []).push(`${n.replace('--cds-', '')}`); }
const colourRows = [];
for (const rs of R.states) {
  const ss = S.states.find(x => x.state === rs.state);
  for (const [path, name] of Object.entries(KEY)) {
    const re = rs.elements.find(x => x.path === path), se = ss.elements.find(x => x.path === path);
    for (const p of ['color', 'background-color', 'border-bottom-color']) {
      const s = se.props[p]; if (!s || s.inherited) continue; const rv = re.props[p]; if (rv === 'rgba(0, 0, 0, 0)') continue;
      colourRows.push({ state: rs.state, el: name, p, authored: s.authored, kind: s.kind, source: s.source, computed: rv, g10: (byValue[rv] || []).slice(0, 4).join(', ') + ((byValue[rv] || []).length > 4 ? ` +${byValue[rv].length - 4}` : '') });
    }
  }
}
const uniq = (arr, key) => { const seen = new Map(); for (const x of arr) { const k = key(x); if (!seen.has(k)) seen.set(k, { ...x, states: [x.state] }); else seen.get(k).states.push(x.state); } return [...seen.values()]; };

// Hover: static's :hover rules against the computed hover.
const hoverRows = [];
for (const rs of R.states.slice(0, 1)) {
  const ss = S.states.find(x => x.state === rs.state);
  const sh = ss.elements.filter(e => e.hover).flatMap(e => Object.entries(e.hover).map(([p, v]) => ({ el: KEY[e.path] || e.path, p, v: `${v.authored}${v.authored !== v.resolved ? ` → ${v.resolved}` : ''} (${v.source})` })));
  for (const [target, diffs] of Object.entries(R.hover[rs.state])) for (const d of diffs) hoverRows.push({ how: `hover ${target}`, el: KEY[d.path] || d.path, p: d.p || d.prop, from: d.from, to: d.to, stat: (sh.find(x => x.el === (KEY[d.path] || d.path) && x.p === d.prop) || {}).v || '—' });
  for (const x of sh) if (!hoverRows.some(h => h.el === x.el && h.p === x.p)) hoverRows.push({ how: 'static only', el: x.el, p: x.p, from: '', to: '', stat: x.v });
}

const md = [];
md.push('# #312 prototype: measured output', '', `Generated by \`compare.mjs\` from \`static.json\` and \`runtime.json\`. ${R.states.length} states, ${R.states[0].elements.length} elements each, ${R.states[0].elements.length * Object.keys(R.states[0].elements[0].props).length} property reads per state.`, '');
md.push('## Static resolved values against computed values', '', '| Verdict | Count | Meaning |', '|---|---|---|',
  `| agree | ${tally.agree} | static's resolved value equals the computed one |`,
  `| initial | ${tally.initial} | nothing declared, and the computed value is the initial one |`,
  `| layout | ${tally.layout} | a size the layout decides; static has no value |`,
  `| differ | ${tally.differ} | listed below for the answer-key elements |`, '');
md.push('| State | Element | Property | Static (authored → resolved, source) | Computed |', '|---|---|---|---|---|');
if (!rows.length) md.push('| — | — | — | none | — |');
for (const r of uniq(rows, r => `${r.el}|${r.p}|${r.s}|${r.r}`)) md.push(`| ${r.states.length === R.states.length ? 'all' : r.states.join(', ')} | ${r.el} | ${r.p} | ${r.s.replace(/\|/g, '\\|')} | ${r.r} |`);
const SR = S.selectorRisk;
md.push('', `Selectors the static matcher guessed at (\`:not()\`, \`:where()\`, \`:is()\`, \`:has()\`, sibling combinators) on these elements: ${SR.rules} rules, ${SR.applied} applied and ${SR.keptApart} kept apart. None changed a value read here.`, '', ...SR.examples.map(x => `- \`${x}\``));
md.push('', '## Colours: the authored source against a by-value match', '', `The g10 column lists the Carbon g10 tokens (\`.cds--g10\`, ${Object.keys(S.g10).length} tokens) whose value equals the computed colour: what a by-value match would offer.`, '');
md.push('| States | Element | Property | Authored (static) | Kind | Source | Computed | g10 tokens with that value |', '|---|---|---|---|---|---|---|---|');
for (const r of uniq(colourRows, r => `${r.el}|${r.p}|${r.authored}`)) md.push(`| ${r.states.length === R.states.length ? 'all' : r.states.join(', ')} | ${r.el} | ${r.p} | \`${r.authored}\` | ${r.kind} | ${r.source} | ${r.computed} | ${r.g10 || '—'} |`);
md.push('', '## Hover (state None)', '', '| How | Element | Property | Computed from → to | Static :hover rule |', '|---|---|---|---|---|');
for (const h of hoverRows) md.push(`| ${h.how} | ${h.el} | ${h.p} | ${h.from} → ${h.to} | ${h.stat.replace(/\|/g, '\\|')} |`);
md.push('', '## Axis sources (static only)', '', ...S.axes.map(a => `- \`${a.at}\`: \`${a.condition} ? '${a.whenTrue}' : '${a.whenFalse}'\``), '');
md.push('## Element joins (runtime)', '', '| Path | Element | Classes | Joins to |', '|---|---|---|---|');
for (const e of R.states[0].elements) md.push(`| ${e.path || '(row)'} | ${KEY[e.path] || e.tag} | ${e.classes.join(' ').slice(0, 90)} | ${e.at || '—'} (${e.via || 'none'}) |`);
md.push('', '## Stylesheets and network (runtime)', '', '| Sheet | crossorigin | cssRules |', '|---|---|---|', ...R.cssom.sheets.map(s => `| ${s.href} | ${s.crossorigin ?? '—'} | ${s.error || s.rules} |`), '');
md.push(`Built CSS: ${R.builtCss.files} file, ${(R.builtCss.bytes / 1024).toFixed(0)} KB, \`var(--cds-\` ${R.builtCss.varCds} times. Custom properties on \`:root\` (CSSOM): ${R.cssom.tokenCount}. Requests: ${Object.entries(R.network).map(([k, v]) => `${k} ×${v}`).join('; ')}.`, '');
md.push('Matched rules for the Ready to Report memo `<i>`, read from the CSSOM:', '', ...R.cssom.matched.memo.map(m => `- \`${m.selector.slice(0, 60)}\` ${m.prop}${m.keepsVar ? ', `var()` kept' : ''}`), '');
md.push('## Cost (ms)', '', `- Static: ${Object.entries(ST).map(([k, v]) => `${k} ${v}`).join(', ')}. Compiled CSS ${(S.sheets.reduce((a, s) => a + s.bytes, 0) / 1024).toFixed(0)} KB in ${S.sheets.length} sheets, ${S.rules} rules.`,
  `- Runtime: ${Object.entries(RT).map(([k, v]) => `${k} ${v}`).join(', ')}. Browser: ${R.browser.replace(/\(.*\)/, '').trim()}.`);
writeFileSync(join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
