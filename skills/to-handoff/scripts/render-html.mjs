// The HTML Rendering of a Handoff (#63, #102): one static, self-contained page beside handoff.json, at
// handoffs/<feature-key>/renderings/index.html. A Contract usage renders as the real Code Library component
// through the Adapter's renderer; its snippet comes from the Contract's `code`. The page is built from the
// Handoff alone (no clock), so a re-render of the same Handoff is byte-identical. It is the review copy the
// owner signs off from; it never signs off itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { handoffContentHash } from './generate.mjs';
import { loadDesignSystem, stateAxisOf } from './system.mjs';

const OPTIONAL = ['flow', 'interactions', 'data', 'a11y', 'tokensToAdd'];
const FLAGS = {
  exact: ['=', 'exact'], import: ['✓', 'import'], na: ['–', 'n/a'],
  off: ['≠', 'Off-system'], near: ['≈', 'near match'], pick: ['◇', 'agent pick'], proposal: ['+', 'Proposal'],
  raw: ['∅', 'no Contract'], axis: ['↯', 'off-axis'], missing: ['!', 'missing state'], mock: ['◌', 'mock'],
  simulated: ['◌', 'simulated'], placeholder: ['◌', 'placeholder copy'], draft: ['◐', 'Contract draft, not approved'],
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const flag = k => `<span class="flag" data-g="${FLAGS[k][0]}">${FLAGS[k][0]} ${FLAGS[k][1]}</span>`;
// "? q-…": a link to the open question that settles the item.
const qflag = id => (id ? ` <a class="flag" data-g="?" href="#${esc(id)}">? ${esc(id)}</a>` : '');
const code = s => `<code>${esc(s)}</code>`;

/** Render the Handoff at `handoffPath` against `designSystem`; returns the written path. */
export async function render({ handoffPath, designSystem }) {
  const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
  const system = await loadDesignSystem(designSystem);
  if (!system.adapter.available()) throw new Error('The Adapter renderer is not available; run its fetch step (for Carbon: node skills/adapter-carbon/scripts/sources.mjs)');
  const html = await renderHtml(handoff, system);
  const out = join(dirname(handoffPath), 'renderings', 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return out;
}

/** The Rendering page for a Handoff, as HTML text. */
export async function renderHtml(handoff, system) {
  const h = handoff;
  const { foundations, contracts } = system;
  const text = ref => (typeof ref === 'string' && ref.startsWith('copy:') ? (h.copy[ref.slice(5)] || {}).text ?? ref : ref);
  const renderers = {};
  for (const key of Object.keys(h.source.contracts).sort()) renderers[key] = await system.adapter.renderer(contracts[key]);
  const anyRenderer = Object.values(renderers)[0];
  const mapped = Object.values(h.source.modes)[0];
  // The toggle covers the collection of the mapped mode (the Theme). A Mode applies as the one class its
  // `selector` names (#109); a Mode with none takes the Adapter renderer's class for its key, as in To-preview.
  const theme = foundations.collections.find(c => c.modes.length > 1 && c.modes.some(m => m.key === mapped));
  const modeClass = key => {
    const m = theme && theme.modes.find(x => x.key === key);
    if (m && m.selector !== undefined) {
      if (!/^\.[A-Za-z_][\w-]*$/.test(m.selector)) throw new Error(`${theme.key}/${key}: selector "${m.selector}" is not one class, and the Rendering applies a Mode as one class`);
      return m.selector.slice(1);
    }
    return anyRenderer ? anyRenderer.modeClass(key) : `mode-${key}`;
  };
  const hash = handoffContentHash(h);
  const screen = h.screens[0];
  const regions = h.screens.flatMap(s => s.regions);
  const usages = regions.flatMap(r => (r.usages || []).map(u => ({ ...u, region: r.id })));

  // ---- Needs a look ----
  const look = [];
  for (const v of h.values) look.push(['off', `${code(v.raw[Object.keys(v.raw)[0]])} as ${esc(v.role)}`, esc(v.reason), v.at.join(', ')]);
  for (const r of regions) for (const s of r.styles) {
    if (s.match === 'near') look.push(['near', `${code(`${s.property}: ${s.raw}`)} → ${code(s.token)} (ΔE ${s.delta})`, `among ${s.candidates.map(esc).join(', ')}`, s.at.join(', ')]);
    else if (s.by === 'agent') look.push(['pick', `${code(`${s.property}: ${s.raw}`)} → ${code(s.token)}`, `tied with ${s.candidates.filter(c => c !== s.token).map(esc).join(', ')}`, s.at.join(', ')]);
  }
  for (const r of regions) for (const t of r.text) {
    const s = t.style || {};
    const what = `“${esc(h.copy[t.copy].text)}”`;
    if (s.match === 'near') look.push(['near', `${what} → ${code(s.textStyle)}`, `among ${s.candidates.map(esc).join(', ')}`, t.at]);
    else if (s.by === 'agent') look.push(['pick', `${what} → ${code(s.textStyle)}`, `tied with ${s.candidates.filter(c => c !== s.textStyle).map(esc).join(', ')}`, t.at]);
    else if (s.partial && s.partial.fontSize.by === 'agent') look.push(['pick', `${what} → font size ${code(s.partial.fontSize.token)}`, `no whole Text Style matches; tied with ${s.partial.fontSize.candidates.filter(c => c !== s.partial.fontSize.token).map(esc).join(', ')}`, t.at]);
  }
  for (const u of usages) {
    if (u.proposal) look.push(['proposal', `${code(u.id)} is Proposal ${code(u.proposal)}`, 'not in the Code Library yet; build it in the app', u.at]);
    if (u.raw) look.push(['raw', `${code(u.id)} (${code(u.raw.element)})`, esc(u.reason) + qflag(u.question), u.at]);
    if (u.contract && u.match && u.match.by === 'agent') look.push(['pick', `${code(u.id)} → ${code(u.contract)} ${esc(Object.values(u.tuple).join(' '))}`, `recognised by the agent (${esc(u.match.via)})`, u.at]);
    for (const o of u.offAxis || []) look.push(['axis', `${code(u.id)} ${code(`${o.property}: ${o.raw}`)}`, esc(o.reason) + qflag(o.question), u.at]);
  }
  // A draft Contract (one written mid-run among them, #115) renders real components, but its owner has not
  // approved it: this Handoff's sign-off does not approve it either.
  const isDraft = key => ((contracts[key] || {}).selection || {}).status === 'draft';
  for (const key of Object.keys(h.source.contracts).sort()) {
    if (!isDraft(key)) continue;
    const drafted = Object.keys(contracts[key].drafted || {}).length;
    look.push(['draft', `${code(key)} Contract draft, not approved`, `${drafted} Drafted values; the owner approves it through To-design's base loop, not this sign-off`, usages.filter(u => u.contract === key).map(u => u.at).join(', ')]);
  }
  for (const [name, s] of Object.entries(screen.states)) if (s.missing) look.push(['missing', `${esc(name)} state`, esc(question(s.question)) + qflag(s.question), screen.at || '']);
  for (const x of h.data || []) look.push([x.source === 'mock' ? 'mock' : 'simulated', code(x.id), esc(x.note || ''), x.at || '']);
  for (const [id, c] of Object.entries(h.copy)) if (c.placeholder) look.push(['placeholder', `${code(id)} “${esc(c.text)}”`, 'Stand-in copy: replace before release', c.at || '']);
  const lookCounts = Object.keys(FLAGS).map(k => [k, look.filter(r => r[0] === k).length]).filter(([, n]) => n);
  function question(id) { const q = h.openQuestions.find(x => x.id === id); return q ? q.text : id; }

  // ---- usage cards ----
  const cards = [];
  for (const u of usages) {
    const flags = [u.contract && flag('import'), u.contract && isDraft(u.contract) && flag('draft'), u.proposal && flag('proposal'), u.raw && flag('raw'), u.match && u.match.by === 'agent' && flag('pick'), (u.offAxis || []).length && flag('axis')].filter(Boolean).join(' ');
    let specimen = '', snippet = '';
    const perState = [];
    if (u.contract) {
      const c = contracts[u.contract];
      const props = propsFor(c, u, text);
      specimen = renderers[u.contract].render({ ...u.tuple, ...(u.state ? { state: u.state } : {}) }, props);
      for (const [name, s] of Object.entries(screen.states)) {
        const us = s.usageStates && s.usageStates[u.id];
        if (!us) continue;
        const p = { ...props };
        for (const [k, ref] of Object.entries(us.properties || {})) p[k] = text(ref);
        perState.push(`<figure><figcaption>${esc(name)}${us.state ? ` · ${esc(us.state)}` : ''}</figcaption>${renderers[u.contract].render({ ...u.tuple, ...(us.state ? { state: us.state } : {}) }, p)}</figure>`);
      }
      snippet = snippetFor(c, u, text);
    } else if (u.proposal) {
      const items = (u.items || []).map(i => `<span class="chip">${esc(text(Object.values(i.properties)[0]))}</span>`).join('');
      specimen = `<div class="proposal-box">${items || esc(u.proposal)}</div>`;
    } else {
      specimen = `<div class="raw-box">${code(u.raw.element)} ${esc(text((u.properties || {}).text || ''))}</div>`;
    }
    cards.push(`<article class="card" id="usage-${esc(u.id)}">
<header><h3>${esc(u.id)}</h3><p>${u.contract ? `${code(u.contract)} ${esc(Object.entries(u.tuple).map(([k, v]) => `${k}=${v}`).join(' '))}` : u.proposal ? `Proposal ${code(u.proposal)} ${esc(Object.entries(u.tuple || {}).map(([k, v]) => `${k}=${v}`).join(' '))}` : 'raw element'} · ${esc(u.region)} · ${esc(u.at)}${u.states ? ` · shows in ${esc(u.states.join(', '))}` : ''}</p><p>${flags}</p></header>
<div class="specimen mode-root ${esc(modeClass(mapped))}" data-mode-root>${specimen}</div>
${perState.length ? `<div class="states-row mode-root ${esc(modeClass(mapped))}" data-mode-root>${perState.join('')}</div>` : ''}
${snippet ? `<textarea class="snippet" readonly wrap="off" rows="${snippet.split('\n').length}">${snippet.replace(/&/g, '&amp;').replace(/<\/textarea/gi, '&lt;/textarea')}</textarea>` : ''}
${(u.offAxis || []).map(o => `<p class="note">${flag('axis')} ${esc(o.reason)} (${esc(question(o.question))})${qflag(o.question)}</p>`).join('')}
${u.question ? `<p class="note">${esc(question(u.question))}${qflag(u.question)}</p>` : ''}
</article>`);
  }

  // ---- states: the states x breakpoints matrix, then one tab per state ----
  // A screenshot path is relative to handoff.json; the Rendering sits one folder down, in renderings/.
  const shotCell = (name, bp, shot) => (typeof shot === 'string'
    ? `<a href="../${esc(shot)}"><img src="../${esc(shot)}" alt="${esc(name)} at ${esc(bp)}" loading="lazy"></a>`
    : `<div class="slot">screenshot missing · ${esc((shot && shot.reason) || 'no reason given')}</div>`);
  const matrixRows = Object.entries(screen.states).map(([name, s]) => `<tr><th>${esc(name)}</th>${s.missing
    ? `<td class="hatch" colspan="${screen.breakpoints.length || 1}">${flag('missing')} ${esc(question(s.question))}${qflag(s.question)}</td>`
    : s.na ? `<td colspan="${screen.breakpoints.length || 1}">${flag('na')} Not applicable: ${esc(s.reason)}</td>`
      : screen.breakpoints.map(bp => `<td>${shotCell(name, bp, (s.screenshots || {})[bp])}</td>`).join('')}</tr>`).join('\n');
  const matrix = `<div class="table-wrap"><table class="matrix"><tr><th>state</th>${screen.breakpoints.map(bp => `<th>${esc(bp)}</th>`).join('')}</tr>
${matrixRows}
</table></div>`;
  const stateTabs = Object.keys(screen.states).map((name, i) => `<button type="button" class="tab" data-state="${esc(name)}" aria-selected="${i === 0}">${esc(name)}${screen.states[name].missing ? ' !' : screen.states[name].na ? ' –' : ''}</button>`).join('');
  const statePanels = Object.entries(screen.states).map(([name, s], i) => {
    const body = s.missing ? `<p>${flag('missing')} ${esc(question(s.question))}${qflag(s.question)}</p>`
      : s.na ? `<p>${flag('na')} Not applicable: ${esc(s.reason)}</p>`
        : `<p>${esc(s.content)}</p>${s.trigger ? `<p>Trigger: ${code(s.trigger)}</p>` : ''}
${Object.keys(s.usageStates || {}).length ? `<ul>${Object.entries(s.usageStates).map(([id, us]) => `<li>${code(id)}${us.state ? ` is ${code(us.state)}` : ''}${Object.entries(us.properties || {}).map(([k, ref]) => ` · ${esc(k)} “${esc(text(ref))}”`).join('')}</li>`).join('')}</ul>` : ''}
<div class="shots">${Object.entries(s.screenshots || {}).map(([bp, shot]) => `<figure class="shot"><figcaption>${esc(bp)}</figcaption>${shotCell(name, bp, shot)}</figure>`).join('')}</div>`;
    return `<div class="panel" data-panel="${esc(name)}"${i === 0 ? '' : ' hidden'}><h3>${esc(name)}</h3>${body}</div>`;
  }).join('\n');

  // ---- regions, styles and values ----
  const styleRows = regions.flatMap(r => r.styles.map(s => {
    const target = s.token ? code(s.token) + (s.via ? ` via ${s.via.map(code).join(', ')}` : '') : code(s.value);
    const f = s.value ? flag('off') : s.match === 'near' ? flag('near') : s.by === 'agent' ? flag('pick') : flag('exact');
    return `<tr><td>${esc(r.id)}</td><td>${code(s.property)}</td><td>${code(s.raw)}</td><td>${target}</td><td>${f}</td><td>${esc(s.at.join(', '))}</td></tr>`;
  })).join('\n');
  const textRows = regions.flatMap(r => r.text.map(t => {
    const s = t.style || {};
    const target = s.textStyle ? code(s.textStyle) : s.partial ? `font size ${code(s.partial.fontSize.token)}` : 'Off-system';
    const f = s.match === 'near' ? flag('near') : s.by === 'agent' || (s.partial && s.partial.fontSize.by) ? flag('pick') : s.textStyle ? flag('exact') : flag('off');
    return `<tr><td>${esc(r.id)}</td><td>“${esc(h.copy[t.copy].text)}”</td><td>${target}</td><td>${f}</td><td>${esc(t.at)}${t.states ? ` · ${esc(t.states.join(', '))}` : ''}</td></tr>`;
  })).join('\n');
  const valueRows = h.values.map(v => `<tr><td>${code(v.id)}</td><td><span class="swatch" style="background:${/color/.test(v.role) ? esc(Object.values(v.raw)[0]) : 'transparent'}"></span>${code(Object.values(v.raw)[0])}</td><td>${esc(v.role)}</td><td>${esc(v.reason)}</td><td>${v.nearest.map(n => code(n.token)).join(', ')}${v.primitive ? ` · Primitive ${code(v.primitive)}` : ''}</td></tr>`).join('\n');

  // ---- overview ----
  const f = h.feature;
  const pins = [
    ...Object.entries(h.source.contracts).map(([k, p]) => `<tr><td>Contract ${code(k)}</td><td>${code(p.contentHash.slice(7, 19))}</td></tr>`),
    ...Object.entries(h.source.proposals).map(([k, p]) => `<tr><td>Proposal ${code(k)}</td><td>${code(p.slice(7, 19))}</td></tr>`),
    `<tr><td>Prototype ${Object.keys(h.source.prototype.files).map(code).join(', ')}</td><td>${code(h.source.prototype.snapshotId.slice(7, 19))}</td></tr>`,
    `<tr><td>Foundations (used)</td><td>${code(h.source.foundations.usedHash.slice(7, 19))}</td></tr>`,
  ].join('');
  const optional = OPTIONAL.map(k => {
    if (!(k in h)) return `<section class="optional"><h3>${esc(k)}</h3><p class="not-specified">Not specified · this Handoff has no <code>${esc(k)}</code></p></section>`;
    if (k === 'flow') return `<section class="optional"><h3>flow</h3><table><tr><th>from</th><th>trigger</th><th>to</th><th>source</th></tr>${h.flow.map(x => `<tr><td>${esc(x.from)}</td><td>${code(x.trigger)}</td><td>${esc(x.to)}</td><td>${x.source ? esc(x.source) : ''}${x.source === 'missing' ? ` ${flag('missing')}` : ''}</td></tr>`).join('')}</table></section>`;
    if (k === 'data') return `<section class="optional"><h3>data</h3><ul>${h.data.map(x => `<li>${code(x.id)} ${flag(x.source === 'mock' ? 'mock' : 'simulated')} ${esc(x.note || '')} ${x.at ? `· ${esc(x.at)}` : ''}</li>`).join('')}</ul></section>`;
    return `<section class="optional"><h3>${esc(k)}</h3><pre>${esc(JSON.stringify(h[k], null, 2))}</pre></section>`;
  }).join('\n');

  const nav = [['overview', 'Overview'], ['look', `Needs a look (${look.length})`], ['states', 'States'], ['usages', 'Components'], ['tokens', 'Tokens & values'], ['copy', 'Copy & questions']];
  const options = theme ? theme.modes.map(m => `<option value="${esc(m.key)}" data-class="${esc(modeClass(m.key))}"${m.key === mapped ? ' selected' : ''}>${esc(m.label)}</option>`).join('') : '';
  const mappedLabel = theme ? theme.modes.find(m => m.key === mapped).label : mapped;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(f.name)} Handoff</title>
<style>
${(anyRenderer ? anyRenderer.stylesheet : '').replace(/<\/style/gi, '<\\/style')}
</style>
<style>
:root { --ink: #161616; --muted: #525252; --line: #e0e0e0; --bg: #ffffff; --soft: #f4f4f4; --warn: #8a3800; --bad: #a2191f; --bad-soft: #fff1f1; --bad-line: #ffd7d9; }
body.page { margin: 0; font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink); background: var(--bg); }
.top { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; padding: 12px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
.top h1 { font-size: 20px; margin: 0; } .stamp { margin: 0; color: var(--muted); font-size: 14px; }
.unverified { margin: 0; color: var(--warn); font-size: 14px; }
nav.groups { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 8px 16px; border-bottom: 1px solid var(--line); font-size: 14px; }
main.doc { max-width: 1100px; margin: 0 auto; padding: 16px; }
section.group { margin: 32px 0; } section.group > h2 { font-size: 18px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; } td, th { text-align: left; vertical-align: top; padding: 4px 8px; border-bottom: 1px solid var(--line); }
.table-wrap { overflow-x: auto; }
.flag { display: inline-block; white-space: nowrap; font-size: 12px; padding: 0 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--soft); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.card { border: 1px solid var(--line); padding: 12px; min-width: 0; } .card h3 { margin: 0 0 4px; font-size: 16px; } .card p { margin: 4px 0; font-size: 13px; color: var(--muted); }
.specimen, .states-row { padding: 16px; margin: 8px 0; background: var(--cds-background, #fff); color: var(--cds-text-primary, #161616); }
.states-row { display: flex; flex-wrap: wrap; gap: 12px; } .states-row figure { margin: 0; } .states-row figcaption { font-size: 12px; margin-bottom: 4px; }
.snippet { width: 100%; box-sizing: border-box; font: 12px/1.5 'IBM Plex Mono', ui-monospace, monospace; border: 1px solid var(--line); padding: 8px; resize: vertical; }
.proposal-box, .raw-box { display: flex; gap: 4px; align-items: center; padding: 8px; border: 1px dashed var(--muted); }
.chip { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--soft); font-size: 10px; }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; } .tab { padding: 6px 12px; border: 1px solid var(--line); background: var(--bg); cursor: pointer; } .tab[aria-selected="true"] { border-color: var(--ink); }
.shots { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; } .shot { margin: 0; flex: 0 1 240px; min-width: 0; } .shot figcaption { font-size: 12px; margin-bottom: 4px; }
.shots img, .matrix img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); } .matrix td { min-width: 96px; max-width: 200px; }
.slot { min-height: 96px; padding: 8px; display: grid; place-items: center; text-align: center; border: 1px dashed var(--muted); color: var(--muted); font-size: 12px; }
.hatch { background: repeating-linear-gradient(45deg, var(--bad-soft) 0 6px, var(--bad-line) 6px 12px); color: var(--bad); }
.swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid var(--line); vertical-align: middle; margin-right: 4px; }
.not-specified { color: var(--muted); } a.flag { color: inherit; text-decoration: none; } .counts { font-size: 13px; } .note { font-size: 13px; }
.doc h3 { font-size: 15px; font-weight: 600; margin: 16px 0 4px; } .raw-box code { font-size: 12px; }
</style>
</head>
<body class="page">
<header class="top">
<h1>${esc(f.name)}</h1>
<p class="stamp">r${h.revision} · ${hash.slice(7, 19)} · ${h.status === 'approved' ? 'signed off' : 'pending sign-off'}</p>
${theme ? `<label>Mode <select id="mode">${options}</select></label>` : ''}
<p class="unverified" id="unverified" hidden>Unverified: the Prototype maps only ${esc(Object.keys(h.source.modes).join(', '))} → ${esc(mappedLabel)}.</p>
</header>
<nav class="groups">${nav.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('')}</nav>
<main class="doc">
<section class="group" id="overview"><h2>Overview</h2>
<p>${esc(f.goal)}</p>
${f.owner ? `<p>Owner: ${esc(f.owner)}</p>` : ''}
${f.scope ? `<p>Scope:</p><ul>${f.scope.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
${f.nonGoals ? `<p>Non-goals:</p><ul>${f.nonGoals.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
<div class="table-wrap"><table>${pins}</table></div>
${(h.source.notes || []).map(n => `<p class="note">${esc(n.level)}: ${esc(n.text)}</p>`).join('')}
${optional}
</section>
<section class="group" id="look"><h2>Needs a look</h2>
<p class="counts">${lookCounts.map(([k, n]) => `${flag(k)} ${n}`).join(' · ')}</p>
<div class="table-wrap"><table><tr><th>flag</th><th>what</th><th>why</th><th>where</th></tr>
${look.map(([k, what, why, where]) => `<tr><td>${flag(k)}</td><td>${what}</td><td>${why}</td><td>${esc(where)}</td></tr>`).join('\n')}
</table></div>
</section>
<section class="group" id="states"><h2>States · ${esc(screen.name)}</h2>
${matrix}
<div class="tabs" role="tablist">${stateTabs}</div>
${statePanels}
<h3>Acceptance</h3>
<ul>${h.acceptance.map(a => `<li>${code(a.id)} (${esc(a.state)}): given ${esc(a.given)}, when ${esc(a.when)}, then ${esc(a.then)} · ${esc(a.by)}</li>`).join('')}</ul>
</section>
<section class="group" id="usages"><h2>Components</h2>
<div class="cards">
${cards.join('\n')}
</div>
</section>
<section class="group" id="tokens"><h2>Tokens &amp; values</h2>
<h3>Styles</h3>
<div class="table-wrap"><table><tr><th>region</th><th>property</th><th>raw</th><th>token or value</th><th></th><th>where</th></tr>
${styleRows}
</table></div>
<h3>Text</h3>
<div class="table-wrap"><table><tr><th>region</th><th>text</th><th>Text Style</th><th></th><th>where</th></tr>
${textRows}
</table></div>
<h3>Off-system values</h3>
<div class="table-wrap"><table><tr><th>id</th><th>raw</th><th>role</th><th>reason</th><th>nearest</th></tr>
${valueRows}
</table></div>
</section>
<section class="group" id="copy"><h2>Copy &amp; questions</h2>
<div class="table-wrap"><table><tr><th>id</th><th>text</th><th>where</th></tr>
${Object.entries(h.copy).map(([id, c]) => `<tr><td>${code(id)}</td><td>${esc(c.text)}${c.placeholder ? ` ${flag('placeholder')}` : ''}</td><td>${esc(c.at || '')}</td></tr>`).join('\n')}
</table></div>
<h3>Open questions</h3>
<ul>${h.openQuestions.map(q => `<li id="${esc(q.id)}">${code(q.id)} · ${esc(q.kind)} · to ${esc(q.to)}: ${esc(q.text)}${q.answer ? ` <strong>${esc(q.answer)}</strong>` : ''}</li>`).join('\n')}</ul>
</section>
</main>
<script>
(function () {
  var mode = document.getElementById('mode');
  var note = document.getElementById('unverified');
  if (mode) mode.addEventListener('change', function () {
    var opt = mode.options[mode.selectedIndex];
    var classes = Array.prototype.map.call(mode.options, function (o) { return o.getAttribute('data-class'); });
    document.querySelectorAll('[data-mode-root]').forEach(function (el) {
      classes.forEach(function (c) { el.classList.remove(c); });
      el.classList.add(opt.getAttribute('data-class'));
    });
    note.hidden = mode.value === ${JSON.stringify(mapped)};
  });
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t === tab)); });
      document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== tab.getAttribute('data-state'); });
    });
  });
})();
</script>
</body>
</html>
`;
}

// A usage's Contract property values for the renderer: copy refs resolved; a TEXT property the Prototype does
// not show is empty (not the Contract default), and a Repeated child takes the first item.
function propsFor(contract, u, text) {
  const props = {};
  for (const p of contract.properties || []) if (p.type === 'TEXT') props[p.key] = '';
  for (const [k, ref] of Object.entries(u.properties || {})) props[k] = text(ref);
  const first = (u.items || [])[0];
  if (first) for (const [k, ref] of Object.entries(first.properties)) props[k] = text(ref);
  return props;
}

// The usage's code, from the Contract's `code`: required props, content props, then the axis props that differ
// from their default (or that `alwaysEmit` names); a Repeated child once per item.
function snippetFor(contract, u, text) {
  const c = contract.code;
  const attrs = [];
  const put = (k, v) => { if (!attrs.some(a => a[0] === k)) attrs.push([k, v]); };
  for (const prop of c.required || []) if (u.properties && u.properties[prop] !== undefined) put(prop, text(u.properties[prop]));
  let children = null;
  for (const p of contract.properties || []) {
    if (p.type !== 'TEXT' || !p.code || !p.code.prop || !u.properties || u.properties[p.key] === undefined) continue;
    if (p.code.prop === 'children') children = text(u.properties[p.key]);
    else put(p.code.prop, text(u.properties[p.key]));
  }
  for (const axis of contract.axes) {
    if (axis === stateAxisOf(contract)) continue;
    const key = u.tuple[axis.key] === undefined ? axis.default : u.tuple[axis.key];
    const value = axis.values.find(v => v.key === key);
    if (!value || !value.code) continue;
    const emit = key !== axis.default || Object.keys(value.code).some(k => (c.alwaysEmit || []).includes(k));
    if (emit) for (const [k, v] of Object.entries(value.code)) put(k, v);
  }
  if (u.state) {
    const axis = stateAxisOf(contract);
    const value = axis && axis.values.find(v => v.key === u.state);
    if (value && value.code) for (const [k, v] of Object.entries(value.code)) put(k, v);
  }
  const jsx = ([k, v]) => (v === true ? k : typeof v === 'string' && !v.includes('"') ? `${k}="${v}"` : `${k}={${JSON.stringify(v)}}`);
  const open = [c.component, ...attrs.map(jsx)].join(' ');
  const lines = [c.import];
  if (c.items && (u.items || []).length) {
    const itemProp = (contract.properties || []).find(p => p.code && p.code.itemProp);
    lines.push(`<${open}>`);
    for (const item of u.items) {
      const t = text(item.properties[itemProp.key]);
      lines.push(`  <${[c.items.component, ...c.items.props.map(k => jsx([k, t]))].join(' ')} />`);
    }
    lines.push(`</${c.component}>`);
  } else if (children !== null) lines.push(`<${open}>${children}</${c.component}>`);
  else lines.push(`<${open} />`);
  return lines.join('\n');
}
