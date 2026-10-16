// PROTOTYPE layout for the HTML Rendering (#63). It lays out the embedded Handoff only: every word below that is
// not chrome comes from handoff.json, the Proposals it references, or the Contract. Variants: ?variant=A|B|C.
const D = JSON.parse(document.getElementById('handoff-data').textContent);
const H = D.handoff;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STATES = ['default', 'loading', 'empty', 'error', 'success'];
const BP = { sm: 320, md: 672, lg: 1056, xlg: 1312, max: 1584 };
const mode = () => (document.body.classList.contains('cds--g100') ? 'g100' : 'white');

// ---------- flags ----------
const flag = (cls, g, text, title = '') => `<span class="flag ${cls}" data-g="${g}" title="${esc(title)}">${esc(text)}</span>`;
const F = {
  exact: () => flag('f-exact', '=', 'exact'),
  near: d => flag('f-near', '≈', `near${d !== undefined ? (typeof d === 'number' ? ' · ΔE ' : ' · ') + d : ''}`, 'Near match: kept beside the raw value, never snapped silently'),
  off: id => flag('f-off', '≠', `Off-system${id ? ' · ' + id : ''}`, 'Matches no token; kept as written in values[]'),
  agent: t => flag('f-agent', '◇', t || 'agent pick', 'Picked by the agent; the other candidates are listed'),
  import: () => flag('f-import', '✓', 'import', 'Recognised by the Design System import'),
  proposal: s => flag('f-proposal', '+', `Proposal · ${s}`),
  nocontract: () => flag('f-nocontract', '∅', 'no Contract'),
  offaxis: () => flag('f-offaxis', '↯', 'off-axis raw', 'A value the Contract has no axis value for. Not an Off-system value'),
  missing: () => flag('f-missing', '!', 'missing', 'Applies, but the Prototype has no branch for it'),
  na: () => flag('f-na', '–', 'n/a'),
  standin: k => flag('f-standin', '◌', k, 'Stand-in: the Prototype fakes this; do not build it as is'),
  q: id => `<a href="#q-${esc(id)}" class="flag f-q" data-g="?" onclick="return go('q-${esc(id)}')">${esc(id)}</a>`,
  info: t => flag('f-info', 'i', t),
};
const sw = (hex, big) => `<span class="sw${big ? ' big' : ''}" style="background:${esc(hex)}"></span>`;
const tokHex = t => D.swatches[t]?.[mode()];
const tok = t => [].concat(t).map(n => `<span class="tok">${tokHex(n) ? sw(tokHex(n)) : ''}${esc(n)}${D.spacing[n] !== undefined ? ` <span class="muted">${D.spacing[n]}px</span>` : D.radius[n] !== undefined ? ` <span class="muted">${D.radius[n]}px</span>` : ''}</span>`).join(' ');
const copyOf = ref => (typeof ref === 'string' && ref.startsWith('copy:') ? H.copy[ref.slice(5)] : null);
const at = a => [].concat(a || []).map(x => `<span class="at">${esc(x)}</span>`).join(' ');
const valueById = id => H.values.find(v => v.id === id);
const questionById = id => H.openQuestions.find(q => q.id === id);

// ---------- matches (#61 tiers) ----------
function matchHtml(m) {
  if (m.value) {
    const v = valueById(m.value.slice(6));
    const raw = Object.values(v.raw)[0];
    return `${typeof raw === 'string' && raw.startsWith('#') ? sw(raw) : ''}<code>${esc(typeof raw === 'object' ? JSON.stringify(raw) : raw)}</code> ${F.off(v.id)} <a href="#val-${esc(v.id)}" onclick="return go('val-${esc(v.id)}')" class="small">see value</a>`;
  }
  const name = m.token ?? m.textStyle;
  if (m.match === 'near') {
    const isColor = typeof m.raw === 'string' && m.raw.startsWith('#');
    const left = isColor ? `<span class="pair">${sw(m.raw, true)}${sw(tokHex(name), true)}</span><span class="pair-l"><span>raw</span><span>token</span></span>` : `<code>${esc(typeof m.raw === 'object' ? JSON.stringify(m.raw) : m.raw)}</code> →`;
    return `${left} ${F.near(m.delta)} ${tok(name)} ${F.agent()} ${m.candidates?.length ? `<span class="cand">also: ${m.candidates.map(esc).join(', ')}</span>` : ''}`;
  }
  if (m.by === 'agent') return `${tok(name)} ${F.exact()} ${F.agent('agent pick of ' + (m.candidates.length + 1))} <span class="cand">tied: ${m.candidates.map(esc).join(', ')}</span>`;
  return `${tok(name)} ${F.exact()}`;
}
const styleRow = (prop, m, where) => `<div class="match-row"><span class="prop">${esc(prop)}</span>${matchHtml(m)}${m.note ? ` <span class="small muted">${esc(m.note)}</span>` : ''}<span style="flex:1"></span>${at(m.at || where)}</div>`;

// ---------- usages ----------
const allUsages = () => H.screens.flatMap(s => s.regions.flatMap(r => (r.usages || []).map(u => ({ u, r, s }))));
function tupleHtml(u) {
  if (!u.tuple) return '';
  const fam = u.contract ? D.contracts[u.contract] : D.proposals[u.proposal];
  return Object.entries(u.tuple).map(([k, v]) => { const a = fam.axes.find(x => x.key === k); return `<span class="tok">${esc(a?.label || k)}: ${esc(a?.values.find(x => x.key === v)?.label || v)}</span>`; }).join(' ');
}
function matchFlag(u) {
  if (!u.match || u.match.by === 'import') return F.import();
  const via = u.match.via === 'library' ? 'agent · from another library' : 'agent · from a plain element';
  const c = (u.match.candidates || []).map(c => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', '));
  return `${F.agent(via)} ${c.length ? `<span class="cand">also considered: ${c.map(esc).join('; ')}</span>` : ''}`;
}
function usageCard(u, stateKey, { compact } = {}) {
  const st = stateKey && H.screens[0].states[stateKey]?.usageStates?.[u.id];
  const key = st ? `${u.id}@${stateKey}` : u.id;
  if (u.contract) {
    const c = D.contracts[u.contract];
    return `<div class="usage" id="u-${esc(u.id)}"><div class="usage-h"><span class="id">${esc(u.id)}</span><b>${esc(c.name)}</b> ${tupleHtml(u)} ${st?.state ? `<span class="tok">State: ${esc(st.state)}</span>` : ''} ${matchFlag(u)}<span style="flex:1"></span>${at(u.at)}</div>
      <div class="specimen">${D.renders[key]}</div>
      <div class="frame-cap">Real render · ${esc(c.package)}${c.status === "draft" ? " · Contract draft, not approved" : ""}${u.properties?.label ? ` · label ${esc(u.properties.label)}` : ''}</div>
      ${(u.offAxis || []).map(o => `<div class="offaxis">${F.offaxis()} <code>${esc(o.property)}</code> ${sw(o.raw)} <code>${esc(o.raw)}</code>: ${esc(o.reason)} ${F.q(o.question)}</div>`).join('')}
      ${compact ? '' : `<pre>${esc(D.snippets[key])}</pre>`}</div>`;
  }
  if (u.proposal) {
    const p = D.proposals[u.proposal];
    const api = `<${p.family.name.replace(/\s/g, '')} ${p.axes.map(a => `${a.key}="${u.tuple?.[a.key] ?? a.default}"`).join(' ')} ${(p.properties || []).map(x => `${x.key}={…}`).join(' ')} />`;
    return `<div class="usage proposal" id="u-${esc(u.id)}"><div class="usage-h"><span class="id">${esc(u.id)}</span><b>${esc(p.family.name)}</b> ${tupleHtml(u)} ${F.proposal(p.status)}<span style="flex:1"></span>${at(u.at)}</div>
      <div class="specimen none">No code yet, so no real render.<br>See the Prototype for how it looks.</div>
      <div class="small" style="margin-top:8px">${esc(p.proposal.reason)} Home: <b>${esc(p.proposal.home.where)}</b>.</div>
      ${compact ? '' : `<div class="frame-cap" style="margin-top:8px">Suggested API (axis and property keys, not real props)</div><pre>${esc(api)}</pre>
      <div class="frame-cap">Anatomy: ${esc(p.anatomy.name)} → ${p.anatomy.children.map(c => esc(c.name + (c.repeat ? ' ×n' : ''))).join(', ')} · Paint: ${Object.entries(p.paint.avatar).map(([k, v]) => `${esc(k)} ${v.token ? tok(v.token) : ''}`).join(' ')}</div>`}</div>`;
  }
  return `<div class="usage nocontract" id="u-${esc(u.id)}"><div class="usage-h"><span class="id">${esc(u.id)}</span><code>${esc(u.raw.element)}</code> ${F.nocontract()} ${F.q(u.question)}<span style="flex:1"></span>${at(u.at)}</div>
    <div class="specimen none">No Contract, so no real render.</div><div class="small" style="margin-top:8px">${esc(u.reason)}</div></div>`;
}
function usagesInState(screen, stateKey) {
  return screen.regions.filter(r => !r.states || r.states.includes(stateKey)).map(r => ({ r, us: r.usages || [] })).filter(x => x.us.length);
}

// ---------- prototype frame ----------
function frame(stateKey, bp, width, thumb) {
  const src = D.protoByState[stateKey];
  const w = BP[bp], scale = width / w, h = 620;
  if (!src) return `<div class="state-missing" style="width:${width}px">${F.missing()} No branch for <b>${esc(stateKey)}</b> in the Prototype, so nothing to show. ${F.q(H.screens[0].states[stateKey].question)}</div>`;
  return `<div class="frame" style="width:${width}px;height:${Math.round(h * scale)}px"><iframe ${thumb ? 'tabindex="-1" ' : ''}title="Prototype ${esc(stateKey)} at ${bp}" style="${thumb ? 'pointer-events:none;' : ''}width:${w}px;height:${h}px;transform:scale(${scale})" srcdoc="${esc(src)}"></iframe></div>`;
}
function stateTabs(screen, cur, on) {
  return `<div class="states" role="tablist">${STATES.map(k => { const s = screen.states[k]; const f = s.missing ? F.missing() : s.na ? F.na() : ''; return `<button role="tab" aria-selected="${k === cur}" onclick="${on}('${k}')">${k} ${f}</button>`; }).join('')}</div>`;
}
function stateNote(screen, k) {
  const s = screen.states[k];
  if (s.missing) return `<p>${F.missing()} ${esc(questionById(s.question).text)} ${F.q(s.question)}</p>`;
  if (s.na) return `<p>${F.na()} ${esc(s.reason)}</p>`;
  return `<p>${esc(s.content)} ${s.trigger ? `<span class="small muted">Trigger: <code>${esc(s.trigger)}</code></span>` : ''}</p>`;
}

// ---------- sections (shared by every variant) ----------
const S = {};
S.summary = () => {
  const f = H.feature, s = H.source;
  return `<h1>${esc(f.name)}</h1><p class="muted">${esc(f.goal)}</p>
  <div class="grid2"><div class="kv"><span>Status</span><span>${esc(f.status)} · revision ${H.revision}</span><span>Owner</span><span>${esc(f.owner)}</span>
    <span>Scope</span><span>${f.scope.map(esc).join(' · ')}</span><span>Non-goals</span><span>${f.nonGoals.map(esc).join(' · ')}</span></div>
  <div class="kv"><span>Input</span><span>${esc(s.input)} (${esc(s.kind)}) <span class="at">${esc(s.ref)}</span></span><span>Design System</span><span>${esc(s.designSystem)} · ${Object.entries(s.contracts).map(([k, v]) => `<code>${esc(k)}</code> <span class="at">${esc(v.slice(0, 19))}…</span>`).join(', ')}</span>
    <span>Proposals</span><span>${Object.keys(s.proposals).map(k => `<code>${esc(k)}</code> ${F.proposal(D.proposals[k].status)}`).join(' ')}</span>
    <span>Modes</span><span>${Object.entries(s.modes).map(([p, m]) => `Prototype <b>${esc(p)}</b> → <b>${esc(m)}</b>`).join(', ')} ${s.notes.map(n => F.info(n.level)).join('')}<br><span class="small muted">${s.notes.map(n => esc(n.text)).join(' ')}</span></span></div></div>`;
};
function queueItems() {
  const items = [];
  const add = (group, id, title, sub, target) => items.push({ group, id, title, sub, target });
  for (const q of H.openQuestions) add('Open questions', 'q-' + q.id, q.text, q.kind, 'q-' + q.id);
  for (const s of H.screens) for (const k of STATES) if (s.states[k].missing) add('Missing states', `ms-${s.id}-${k}`, `${s.name}: ${k}`, 'no branch in the Prototype', 'sec-screens');
  for (const { u } of allUsages()) {
    if (u.proposal) add('Component Proposals', 'u-' + u.id, `${D.proposals[u.proposal].family.name} (${u.id})`, `pending approval · home ${D.proposals[u.proposal].proposal.home.where}`, 'u-' + u.id);
    if (u.raw) add('No Contract', 'u-' + u.id, `${u.raw.element} (${u.id})`, u.reason, 'u-' + u.id);
    for (const o of u.offAxis || []) add('Off-axis raw values', 'u-' + u.id, `${u.id}: ${o.property} ${o.raw}`, o.reason, 'u-' + u.id);
    if (u.match && u.match.by === 'agent') add('Agent picks: components', 'u-' + u.id, `${u.id} → ${D.contracts[u.contract].name} ${Object.values(u.tuple).join(' / ')}`, u.match.via === 'library' ? 'from another library' : 'from a plain element', 'u-' + u.id);
  }
  for (const v of H.values) add('Off-system values', 'val-' + v.id, `${v.id}: ${Object.values(v.raw)[0]}`, v.reason, 'val-' + v.id);
  for (const s of H.screens) for (const r of s.regions) {
    const rows = [...r.styles.map(m => [m.property, m]), ...(r.text || []).filter(t => t.style).map(t => [`copy:${t.copy}`, t.style])];
    for (const [p, m] of rows) {
      if (m.match === 'near') add('Near matches', `sty-${r.id}-${p}`, `${r.id} ${p}: ${typeof m.raw === 'object' ? m.raw.fontSize + '/' + m.raw.lineHeight : m.raw} ≈ ${m.token ?? m.textStyle}`, `Δ ${m.delta}`, 'sec-tokens');
      else if (m.by === 'agent') add('Agent picks: tokens', `sty-${r.id}-${p}`, `${r.id} ${p} → ${m.token ?? m.textStyle}`, `tied with ${m.candidates.length}`, 'sec-tokens');
    }
  }
  for (const d of H.data || []) add('Stand-ins', 'data-' + d.id, `${d.id}`, `${d.source}: ${d.note}`, 'sec-data');
  for (const [k, c] of Object.entries(H.copy)) if (c.placeholder) add('Stand-ins', 'copy-' + k, `copy:${k}`, `placeholder: "${c.text}"`, 'sec-copy');
  return items;
}
const GROUP_FLAG = { 'Open questions': () => flag('f-q', '?', 'question'), 'Missing states': F.missing, 'Component Proposals': () => F.proposal('pending'), 'No Contract': F.nocontract, 'Off-axis raw values': F.offaxis, 'Agent picks: components': () => F.agent(), 'Off-system values': () => F.off(), 'Near matches': () => F.near(), 'Agent picks: tokens': () => F.agent(), 'Stand-ins': () => F.standin('stand-in') };
S.needs = () => {
  const groups = {};
  for (const i of queueItems()) (groups[i.group] ||= []).push(i);
  return `<h2>Needs a look</h2><p class="small muted">Counted from the Handoff. Exact matches and import matches need nothing and are not listed.</p><table class="t"><tr><th>Flag</th><th>What</th><th>Count</th></tr>${Object.entries(groups).map(([g, is]) => `<tr><td>${GROUP_FLAG[g]()}</td><td>${esc(g)}</td><td>${is.length}</td></tr>`).join('')}</table>`;
};
S.flow = () => `<h2>Flow</h2><table class="t"><tr><th>From</th><th>Trigger</th><th>To</th></tr>${(H.flow || []).map(t => `<tr><td><code>${esc(t.from)}</code></td><td>${esc(t.trigger)}</td><td><code>${esc(t.to)}</code> ${t.source === 'missing' ? F.missing() : ''}</td></tr>`).join('')}</table>`;
let screenState = 'default', screenBp = 'lg';
S.screens = () => {
  const s = H.screens[0];
  const cards = usagesInState(s, screenState).map(({ r, us }) => `<div class="region-h">Region · ${esc(r.id)}${r.overlay ? ' (overlay)' : ''}</div>${us.map(u => usageCard(u, screenState, { compact: true })).join('')}`).join('');
  return `<h2>Screen · ${esc(s.name)}</h2>
  <p class="small muted">Breakpoints from the Foundations Layout: ${s.breakpoints.map(b => `<b>${b}</b> ${BP[b]}px`).join(', ')}. ${Object.entries(s.regions.find(r => r.responsive)?.responsive || {}).map(([b, t]) => `${b}: ${esc(t)}`).join(' · ')}</p>
  ${stateTabs(s, screenState, 'setScreenState')}${stateNote(s, screenState)}
  <div class="beside"><div><div class="frame-cap">Prototype as vibed · <select onchange="setScreenBp(this.value)">${s.breakpoints.map(b => `<option ${b === screenBp ? 'selected' : ''}>${b}</option>`).join('')}</select> · state forced by the Rendering</div>${frame(screenState, screenBp, screenBp === 'sm' ? 320 : 560)}</div>
  <div><div class="frame-cap">Real per-family renders for this state, in region order</div>${cards || '<p class="muted">No usages.</p>'}</div></div>`;
};
S.components = () => `<h2>Components</h2><p class="small muted">Every usage, by region. Recognition: ${F.import()} by Design System import · ${F.agent('agent · from another library')} · ${F.agent('agent · from a plain element')} · ${F.proposal('pending')} · ${F.nocontract()}</p>
  ${H.screens.flatMap(s => s.regions.filter(r => r.usages?.length).map(r => `<div class="region-h">${esc(s.id)} · ${esc(r.id)}</div>${r.usages.map(u => usageCard(u)).join('')}`)).join('')}`;
S.tokens = () => {
  const fq = H.openQuestions.find(q => q.kind === 'font');
  const rows = H.screens.flatMap(s => s.regions.map(r => {
    const list = [...r.styles.map(m => styleRow(m.property, m)), ...(r.text || []).filter(t => t.style).map(t => styleRow(`copy:${t.copy}`, t.style))];
    return list.length ? `<div class="region-h">${esc(r.id)}</div>${list.join('')}` : '';
  })).join('');
  return `<h2>Tokens &amp; values</h2>
  ${fq ? `<div class="card" style="margin-bottom:16px">${flag('f-q', '?', 'font, once per Handoff')} ${esc(fq.text)} ${F.q(fq.id)}</div>` : ''}
  <p class="small muted">Shown in mode <b>${mode()}</b>. Legend: ${F.exact()} ${F.agent()} ${F.near()} ${F.off()}</p>${rows}
  <h3>Off-system values (values[])</h3>${H.values.map(v => `<div class="usage" id="val-${esc(v.id)}"><div class="usage-h"><span class="id">${esc(v.id)}</span>${F.off()} <code>${esc(v.role)}</code><span style="flex:1"></span>${at(v.at)}</div>
    <div>${Object.entries(v.raw).map(([m, x]) => `${typeof x === 'string' && x.startsWith('#') ? sw(x, true) : ''} <b>${esc(m)}</b> <code>${esc(x)}</code>`).join(' ')}</div>
    <p class="small">${esc(v.reason)}</p><div class="small">Nearest: ${v.nearest.map(n => `${tok(n.token)} <span class="muted">${n.delta !== undefined ? 'ΔE ' + n.delta : n.px + 'px'}</span>`).join(' ')}${v.primitive ? ` · equals Primitive <code>${esc(v.primitive)}</code> (Primitives never match)` : ''}</div></div>`).join('')}
  <h3>Tokens to add</h3>${H.tokensToAdd ? `<p class="small muted">DTCG. Developers add these to code; To-handoff never writes tokens back.</p><pre>${esc(JSON.stringify(H.tokensToAdd, null, 2))}</pre>` : notSpecified('tokensToAdd')}`;
};
const notSpecified = k => `<div class="not-specified"><b>Not specified</b> · this Handoff has no <code>${esc(k)}</code>.</div>`;
S.interactions = () => `<h2>Interactions &amp; motion</h2>${H.interactions ? '' : notSpecified('interactions')}<p class="small muted">Hover, active and focus come with each Contract and are never listed per usage.</p>`;
S.copy = () => `<h2>Copy</h2><table class="t"><tr><th>id</th><th>Text</th><th></th></tr>${Object.entries(H.copy).map(([k, c]) => `<tr id="copy-${esc(k)}"><td><code>copy:${esc(k)}</code></td><td>${esc(c.text)}</td><td>${c.placeholder ? F.standin('placeholder') : ''}</td></tr>`).join('')}</table>`;
S.a11y = () => { const a = H.a11y; if (!a) return `<h2>Accessibility</h2>${notSpecified('a11y')}`;
  return `<h2>Accessibility</h2><p class="small muted">Feature-level only; each Contract carries its own.</p><div class="kv">${Object.entries(a.focusOrder).map(([s, o]) => `<span>Focus order · ${esc(s)}</span><span>${o.map(x => `<code>${esc(x)}</code>`).join(' → ')}</span>`).join('')}
  ${Object.entries(a.landmarks).map(([r, l]) => `<span>Landmark · ${esc(r)}</span><span>${esc(l)}</span>`).join('')}${Object.entries(a.labels).map(([u, c]) => `<span>Label · ${esc(u)}</span><span><code>${esc(c)}</code> “${esc(copyOf(c)?.text)}”</span>`).join('')}</div>`; };
S.data = () => `<h2>Data</h2><table class="t"><tr><th>id</th><th>Source</th><th>Shape</th><th>Note</th></tr>${(H.data || []).map(d => `<tr id="data-${esc(d.id)}"><td><code>${esc(d.id)}</code></td><td>${F.standin(d.source)}</td><td><code>${esc(d.shape)}</code></td><td>${esc(d.note)} ${d.question ? F.q(d.question) : ''} ${at(d.at)}</td></tr>`).join('')}</table>`;
S.acceptance = () => `<h2>Acceptance criteria</h2><table class="t"><tr><th>id</th><th>Screen · state</th><th>Given</th><th>When</th><th>Then</th><th></th></tr>${H.acceptance.map(a => `<tr><td><code>${esc(a.id)}</code></td><td>${esc(a.screen)} · ${esc(a.state)}</td><td>${esc(a.given)}</td><td>${esc(a.when)}</td><td>${esc(a.then)}</td><td>${a.by === 'agent' ? F.agent('drafted by agent') : ''}</td></tr>`).join('')}</table>`;
S.questions = () => `<h2>Open questions</h2><table class="t">${H.openQuestions.map(q => `<tr id="q-${esc(q.id)}"><td><code>${esc(q.id)}</code></td><td>${esc(q.kind)}</td><td>${esc(q.text)}</td></tr>`).join('')}</table>`;

// ---------- variants ----------
const NAV = [
  ['Overview', [['sec-summary', 'Summary', S.summary], ['sec-needs', 'Needs a look', S.needs]]],
  ['Flow & Screens', [['sec-flow', 'Flow', S.flow], ['sec-screens', 'Screen · Invite teammates', S.screens]]],
  ['Tokens & Components', [['sec-components', 'Components', S.components], ['sec-tokens', 'Tokens & values', S.tokens]]],
  ['Interaction · Motion · Copy', [['sec-interactions', 'Interactions & motion', S.interactions], ['sec-copy', 'Copy', S.copy]]],
  ['Accessibility & Data', [['sec-a11y', 'Accessibility', S.a11y], ['sec-data', 'Data', S.data]]],
  ['Prototype vs Production', [['sec-acceptance', 'Acceptance criteria', S.acceptance], ['sec-questions', 'Open questions', S.questions]]],
];
const VARIANTS = { A: 'Document + left nav', B: 'Screen board', C: 'Review queue' };
const topbar = () => `<div class="topbar"><b>Handoff</b><span>${esc(H.feature.name)}</span><span class="small">Rendering: HTML · Design System ${esc(H.source.designSystem)}</span><span class="sp"></span>
  <label class="small">Theme <select onchange="setMode(this.value)"><option value="white" ${mode() === 'white' ? 'selected' : ''}>White</option><option value="g100" ${mode() === 'g100' ? 'selected' : ''}>Gray 100 (unverified)</option></select></label></div>`;
const V = {};
V.A = () => `${topbar()}<div class="va"><nav>${NAV.map(([g, items]) => `<div class="g">${esc(g)}</div>${items.map(([id, t]) => `<a href="#${id}" onclick="return go('${id}')">${esc(t)}</a>`).join('')}`).join('')}</nav>
  <main>${NAV.flatMap(([, items]) => items).map(([id, , f]) => `<section class="sec" id="${id}">${f()}</section>`).join('')}</main></div>`;
let boardSel = ['default', 'lg'], tab = 'sec-components';
V.B = () => {
  const s = H.screens[0];
  const cells = STATES.map(k => `<div class="rowh"><b>${k}</b><br>${s.states[k].missing ? F.missing() : ''}</div>${s.breakpoints.map(b => `<div class="cell" aria-selected="${boardSel[0] === k && boardSel[1] === b}" onclick="setBoard('${k}','${b}')">${frame(k, b, b === 'sm' ? 120 : 300, true)}</div>`).join('')}`).join('');
  const [k, b] = boardSel;
  const tabs = NAV.flatMap(([, items]) => items).filter(([id]) => !['sec-screens', 'sec-summary'].includes(id));
  return `${topbar()}<div class="vb"><main>${S.summary()}
  <h2 style="margin-top:24px">Screen · ${esc(s.name)}: states × breakpoints</h2><div class="board"><div></div>${s.breakpoints.map(b => `<div class="small muted">${b} · ${BP[b]}px</div>`).join('')}${cells}</div>
  <h2 style="margin-top:24px">${esc(k)} at ${esc(b)}</h2>${stateNote(s, k)}
  <div class="beside"><div>${frame(k, b, b === 'sm' ? 320 : 560)}</div><div>${usagesInState(s, k).map(({ r, us }) => `<div class="region-h">${esc(r.id)}</div>${us.map(u => usageCard(u, k, { compact: true })).join('')}`).join('')}</div></div>
  <div class="tabs">${tabs.map(([id, t]) => `<button aria-selected="${id === tab}" onclick="setTab('${id}')">${esc(t)}</button>`).join('')}</div>
  <section class="sec" style="border:0">${tabs.find(([id]) => id === tab)[2]()}</section></main></div>`;
};
let qSel = null;
V.C = () => {
  const items = queueItems();
  qSel ||= items[0].id + '|0';
  const groups = {};
  items.forEach((it, i) => (groups[it.group] ||= []).push([it, i]));
  const [selId, selIdx] = qSel.split('|');
  const sel = items[+selIdx] || items[0];
  let detail;
  if (sel.target.startsWith('u-')) { const { u } = allUsages().find(x => 'u-' + x.u.id === sel.target); detail = usageCard(u); }
  else if (sel.target.startsWith('q-')) { const q = questionById(sel.target.slice(2)); detail = `<div class="card"><h3 style="margin-top:0">${esc(q.id)} · ${esc(q.kind)}</h3><p>${esc(q.text)}</p></div>`; }
  else if (sel.target.startsWith('val-')) detail = S.tokens().split('<h3>Off-system values (values[])</h3>')[1].split('<h3>Tokens to add</h3>')[0].split('<div class="usage"').filter(x => x.includes(`id="${sel.target}"`)).map(x => '<div class="usage"' + x).join('');
  else detail = `<section>${(NAV.flatMap(([, i]) => i).find(([id]) => id === sel.target) || [, , () => ''])[2]()}</section>`;
  return `${topbar()}<div class="vc"><div class="queue"><div style="padding:16px"><b>${items.length} things need a look</b><div class="small muted">Exact and import matches are left out.</div></div>
    ${Object.entries(groups).map(([g, is]) => `<div class="qg"><span>${GROUP_FLAG[g]()} ${esc(g)}</span><span>${is.length}</span></div>${is.map(([it, i]) => `<button class="qi" aria-selected="${i === +selIdx}" onclick="setQ('${it.id}|${i}')">${esc(it.title)}<span class="s">${esc(it.sub)}</span></button>`).join('')}`).join('')}</div>
  <main>${S.summary()}<h2 style="margin-top:24px">${esc(sel.group)}</h2>${detail}
    <h2 style="margin-top:32px">The whole Handoff</h2>${NAV.flatMap(([, items]) => items).filter(([id]) => id !== 'sec-summary').map(([id, t, f]) => `<details id="${id}"><summary>${esc(t)}</summary>${f()}</details>`).join('')}</main></div>`;
};

// ---------- state + switcher ----------
let variant = new URLSearchParams(location.search).get('variant') || 'A';
if (!VARIANTS[variant]) variant = 'A';
function draw() {
  document.getElementById('root').innerHTML = V[variant]() + `<div class="pswitch" title="Prototype switcher, not part of the design"><button onclick="cycle(-1)">←</button><span>${variant} · ${VARIANTS[variant]}</span><button onclick="cycle(1)">→</button></div>`;
}
function cycle(d) { const ks = Object.keys(VARIANTS); variant = ks[(ks.indexOf(variant) + d + ks.length) % ks.length]; const u = new URL(location); u.searchParams.set('variant', variant); history.replaceState(null, '', u); draw(); scrollTo(0, 0); }
function go(id) { const el = document.getElementById(id); if (el) { if (el.tagName === 'DETAILS') el.open = true; el.closest('details')?.setAttribute('open', ''); el.scrollIntoView({ block: 'start' }); } return false; }
function setScreenState(k) { screenState = k; draw(); go('sec-screens'); }
function setScreenBp(b) { screenBp = b; draw(); go('sec-screens'); }
function setBoard(k, b) { boardSel = [k, b]; const y = scrollY; draw(); scrollTo(0, y); }
function setTab(id) { tab = id; const y = scrollY; draw(); scrollTo(0, y); }
function setQ(id) { qSel = id; draw(); }
function setMode(m) { document.body.classList.remove('cds--white', 'cds--g100'); document.body.classList.add('cds--' + m); const y = scrollY; draw(); scrollTo(0, y); }
addEventListener('keydown', e => { if (e.target.closest('input,textarea,select,[contenteditable]')) return; if (e.key === 'ArrowLeft') cycle(-1); if (e.key === 'ArrowRight') cycle(1); });
const initMode = new URLSearchParams(location.search).get('mode');
if (initMode === 'g100') setMode('g100'); else draw();
