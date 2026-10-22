// PROTOTYPE, throwaway. Question: what should the HTML Rendering look like once a Handoff carries the
// content decided in the 2026-10-21 grill (Q14–Q26)? Three variants on the real request-access Rendering,
// switchable via ?variant=A|B|C and the bottom bar. All v2 content below is MOCK, hand-written for this page.

const V2 = {
  signedRevision: 8,
  widths: ['320', 'sm', 'md', 'lg', 'xl', '2xl'],
  // Box positions are % of the md screenshot (768×900); other widths have no overlay in this mock.
  usages: {
    'name': { label: 'Input · Full name', box: [22.9, 33.4, 54.2, 3.6], focus: 1, name: { copy: 'label-text', text: 'Full name' },
      errors: [{ when: 'empty', text: 'Enter your full name' }],
      limit: { max: 80, overflow: 'scroll in field', from: 'question', q: 'q-limit-name' },
      samples: { long: 'Maximiliana Alexandrina Featherstonehaugh-Worthington', short: 'Al' } },
    'email': { label: 'Input · Work email', box: [22.9, 41.2, 54.2, 3.6], focus: 2, name: { copy: 'label-2-text', text: 'Work email' },
      errors: [{ when: 'empty', text: 'Enter your work email' }, { when: 'wrong format', text: 'Enter an email address like ada@example.com' }, { when: 'personal domain', text: 'Use your work email, not a personal one' }],
      limit: { max: 254, overflow: 'scroll in field', from: 'Prototype maxLength' },
      samples: { long: 'maximiliana.featherstonehaugh-worthington@research.example.com', short: 'a@b.co' } },
    'select': { label: 'Select · Team', box: [22.9, 49.0, 54.2, 3.6], focus: 3, name: { copy: 'label-3-text', text: 'Team' },
      errors: [{ when: 'empty', text: 'Pick a team' }], data: 'teams' },
    'reason': { label: 'Textarea · Why do you need access?', box: [22.9, 56.8, 54.2, 7.1], focus: 4, name: { copy: 'label-4-text', text: 'Why do you need access?' },
      errors: [{ when: 'too long', text: 'Keep it under 500 characters' }],
      limit: { max: 500, overflow: 'wrap, field grows to 6 lines then scrolls', from: 'Prototype maxLength' },
      samples: { long: 'I lead the onboarding redesign and need to review the workspace’s current flows, comment on drafts and share them with three contractors before the quarterly review. '.repeat(2), short: 'Review' } },
    'button-2': { label: 'Button · Request access', box: [23.0, 65.8, 54.0, 3.4], focus: 5, name: { copy: 'button-2-label', text: 'Request access' } },
    'button-3': { label: 'Button (link, sm) · Sign in', box: [70.3, 73.0, 6.2, 2.6], focus: 6, name: { copy: 'button-3-label', text: 'Sign in' } },
    'w-full': { label: 'Card · Request workspace access', box: [20.7, 22.2, 58.6, 55.6], heading: { level: 1, text: 'Request workspace access', q: 'q-a11y-heading-w-full-title' } },
  },
  focusBy: 'agent: DOM order',
  landmarks: [{ landmark: 'main', region: 'card', headings: [{ level: 1, text: 'Request workspace access', note: 'Prototype has no heading element: question' }] },
    { landmark: null, region: 'toaster', headings: [], note: 'no landmark: a live region instead' }],
  a11yQuestions: [
    { id: 'q-a11y-heading-w-full-title', text: 'The card title is a div. Should it be the page’s h1?' },
    { id: 'q-a11y-icon-shield', text: 'Is the shield icon beside the title decorative (no name)?' },
    { id: 'q-a11y-announce-offline', text: 'What should a screen reader hear when the page goes offline?' },
  ],
  states: [
    { name: 'default', kind: 'standard' },
    { name: 'loading', kind: 'standard', trigger: 'pending or status === "loading"', announce: { text: 'Sending…', politeness: 'polite' }, focusAfter: 'stays on Request access (disabled)' },
    { name: 'empty', kind: 'standard', missing: 'q-state-empty' },
    { name: 'error', kind: 'standard', trigger: 'status === "error"', announce: { text: 'Something went wrong', politeness: 'assertive' }, focusAfter: 'moves to the alert', fieldErrors: true },
    { name: 'success', kind: 'standard', trigger: 'status === "success"', announce: { text: 'Thanks! Your request is in.', politeness: 'polite' }, focusAfter: 'moves to Send another request' },
    { name: 'offline', kind: 'extra', trigger: '!navigator.onLine', by: 'agent, from state:!navigator.onLine', unreachable: 'the runtime reader cannot drop the network', announce: { q: 'q-a11y-announce-offline' } },
    { name: 'already-member', kind: 'extra', by: 'owner', missing: 'q-state-already-member-index' },
  ],
  acceptance: { error: ['Given a personal email, when I submit, then the email field says “Use your work email, not a personal one”.'],
    success: ['Given a valid form, when I submit, then I see “Thanks! Your request is in.” and it is announced.'],
    offline: ['Given I am offline, when the page loads, then Request access is disabled and I am told why.'] },
  responsive: [
    { region: 'card (main)', at: { '320': 'full width − 32 px, footer stacks: column', sm: 'width 448 px, footer: row', md: 'same as sm', lg: 'same as sm', xl: 'same as sm', '2xl': 'same as sm' } },
    { region: 'toaster', at: { '320': 'bottom, full width', sm: 'bottom right', md: 'bottom right', lg: 'bottom right', xl: 'bottom right', '2xl': 'bottom right' } },
  ],
  data: [{ id: 'teams', source: 'mock', note: 'the Team options are a fixed list in the Prototype', shape: [{ name: 'id', type: 'string', at: 'Select item value' }, { name: 'label', type: 'string', at: 'Select item text' }], q: 'q-data-teams' }],
  tokensToAdd: [{ name: 'color.success', role: 'colour', values: { Light: '#15803d', Dark: null }, from: 'the success message text (#15803d)', q: 'q-token-mode-color.success-dark' }],
  changes: [
    { op: '+', what: 'copy button-2-label-loading', detail: '“Sending…”' },
    { op: '~', what: 'states.loading.trigger', detail: 'status === "loading" → pending or status === "loading"' },
    { op: '~', what: 'usageStates.button-2 in loading', detail: 'adds label → copy:button-2-label-loading' },
  ],
};

const css = `
.pv { --accent:#0f62fe; --accent-soft:#edf5ff; }
.pv .badge { display:inline-grid; place-items:center; min-width:20px; height:20px; padding:0 4px; border-radius:10px; background:var(--accent); color:#fff; font:600 11px/1 system-ui; }
.pv .pill { display:inline-block; font-size:12px; padding:1px 8px; border-radius:10px; border:1px solid var(--line); background:var(--soft); white-space:nowrap; }
.pv .pill.extra { border-color:var(--accent); background:var(--accent-soft); }
.pv .pill.q { border-style:dashed; }
.pv .mock { font-size:12px; color:var(--warn); }
.pv .shotbox { position:relative; display:inline-block; max-width:100%; }
.pv .shotbox img { display:block; max-width:100%; border:1px solid var(--line); }
.pv .ov { position:absolute; border:2px solid var(--accent); border-radius:4px; cursor:pointer; }
.pv .ov .badge { position:absolute; left:-10px; top:-10px; }
.pv .ov.h { border-style:dashed; border-color:#8a3800; }
.pv .ov.h .badge { background:#8a3800; }
.pv .ov.err { border-color:var(--bad); background:rgba(255,215,217,.35); }
.pv .ov.sel { box-shadow:0 0 0 4px rgba(15,98,254,.3); }
.pv .copybtn { font-size:11px; padding:0 6px; margin-left:6px; border:1px solid var(--line); background:#fff; cursor:pointer; border-radius:3px; }
.pv .cols { display:grid; gap:16px; }
.pv .ws { grid-template-columns: 180px minmax(0,1fr) 300px; align-items:start; }
.pv .insp { grid-template-columns: 260px minmax(0,1fr) 320px; align-items:start; }
@media (max-width: 900px) { .pv .ws, .pv .insp { grid-template-columns: 1fr; } }
.pv .rail button { display:flex; width:100%; justify-content:space-between; gap:6px; text-align:left; padding:6px 8px; border:1px solid transparent; background:none; cursor:pointer; font-size:13px; }
.pv .rail button[aria-pressed="true"] { border-color:var(--ink); background:var(--soft); }
.pv .rail h4 { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin:12px 0 4px; }
.pv .panel { border:1px solid var(--line); padding:12px; font-size:13px; } .pv .panel h4 { margin:12px 0 4px; font-size:13px; } .pv .panel h4:first-child { margin-top:0; }
.pv .toolbar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:8px; font-size:13px; }
.pv .toolbar button { padding:3px 10px; border:1px solid var(--line); background:#fff; cursor:pointer; font-size:12px; }
.pv .toolbar button[aria-pressed="true"] { border-color:var(--ink); background:var(--soft); }
.pv .slot320 { width:320px; max-width:100%; height:375px; }
.pv .ulist button { display:grid; grid-template-columns:28px 1fr; gap:6px; width:100%; text-align:left; padding:6px; border:1px solid transparent; background:none; cursor:pointer; font-size:13px; }
.pv .ulist button[aria-pressed="true"] { border-color:var(--ink); background:var(--soft); }
.pv .ulist .chips { grid-column:2; display:flex; gap:4px; flex-wrap:wrap; }
.pv .strip { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; } .pv .strip details { border:1px solid var(--line); padding:6px 10px; font-size:13px; } .pv .strip summary { cursor:pointer; font-weight:600; }
.pv ul.plain { margin:0; padding-left:18px; list-style:disc; } .pv ol.plain { margin:0; padding-left:18px; list-style:decimal; }
.pv-bar { position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:50; display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:999px; background:#161616; color:#fff; font:13px system-ui; box-shadow:0 6px 24px rgba(0,0,0,.3); }
.pv-bar button { border:0; background:#393939; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; }
`;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = id => `<a class="pill q" href="#${id}">? ${esc(id)}</a>`;
const copyBtn = v => `<button class="copybtn" data-copy="${esc(v)}">copy</button>`;
const shot = (state, w) => `../screens/index.${state}.${w}.png`;
const usageList = () => Object.entries(V2.usages);
const focusable = () => usageList().filter(([, u]) => u.focus).sort((a, b) => a[1].focus - b[1].focus);

function overlayShot(state, { focus = true, headings = false, errors = false, select = null } = {}) {
  const boxes = usageList().map(([id, u]) => {
    const [l, t, w, h] = u.box;
    const style = `left:${l}%;top:${t}%;width:${w}%;height:${h}%`;
    if (headings && u.heading) return `<div class="ov h" style="${style}" data-u="${id}" title="h${u.heading.level}"><span class="badge">h${u.heading.level}</span></div>`;
    if (errors && u.errors) return `<div class="ov err ${select === id ? 'sel' : ''}" style="${style}" data-u="${id}"><span class="badge" style="background:var(--bad)">${u.errors.length}</span></div>`;
    if (focus && u.focus) return `<div class="ov ${select === id ? 'sel' : ''}" style="${style}" data-u="${id}" title="${esc(u.label)}"><span class="badge">${u.focus}</span></div>`;
    if (select === id) return `<div class="ov sel" style="${style}" data-u="${id}"></div>`;
    return '';
  }).join('');
  return `<div class="shotbox"><img src="${shot(state, 'md')}" alt="${state} at md">${boxes}</div>`;
}

const tables = {
  focus: () => `<ol class="plain">${focusable().map(([id, u]) => `<li><code>${id}</code> ${esc(u.label)}</li>`).join('')}</ol><p class="note">Drafted ${esc(V2.focusBy)}; the owner can reorder.</p>`,
  outline: () => `<ul class="plain">${V2.landmarks.map(l => `<li>${l.landmark ? `<b>${l.landmark}</b>` : '<i>no landmark</i>'} · ${esc(l.region)}${l.note ? ` <span class="note">(${esc(l.note)})</span>` : ''}${l.headings.length ? `<ul class="plain">${l.headings.map(h => `<li>h${h.level} “${esc(h.text)}” ${h.note ? q('q-a11y-heading-w-full-title') : ''}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`,
  names: () => `<table><tr><th>usage</th><th>accessible name</th></tr>${usageList().filter(([, u]) => u.name).map(([id, u]) => `<tr><td><code>${id}</code></td><td>“${esc(u.name.text)}” <span class="note">copy:${u.name.copy}</span></td></tr>`).join('')}<tr><td><code>w-full</code> icon</td><td>${q('q-a11y-icon-shield')}</td></tr></table>`,
  announce: () => `<table><tr><th>state</th><th>announced</th><th>focus after</th></tr>${V2.states.filter(s => s.announce || s.focusAfter).map(s => `<tr><td>${s.name}</td><td>${s.announce?.text ? `“${esc(s.announce.text)}” <span class="pill">${s.announce.politeness}</span>` : q(s.announce.q)}</td><td>${esc(s.focusAfter || '—')}</td></tr>`).join('')}</table>`,
  responsive: () => `<div class="table-wrap"><table><tr><th>region</th>${V2.widths.map(w => `<th>${w}</th>`).join('')}</tr>${V2.responsive.map(r => `<tr><td>${esc(r.region)}</td>${V2.widths.map(w => `<td>${esc(r.at[w])}</td>`).join('')}</tr>`).join('')}</table></div>`,
  errors: () => `<table><tr><th>usage</th><th>when</th><th>message</th></tr>${usageList().filter(([, u]) => u.errors).flatMap(([id, u]) => u.errors.map((e, i) => `<tr><td>${i ? '' : `<code>${id}</code>`}</td><td>${esc(e.when)}</td><td>“${esc(e.text)}”</td></tr>`)).join('')}</table>`,
  limits: () => `<table><tr><th>usage</th><th>max</th><th>overflow</th><th>from</th><th>long sample</th><th>short</th></tr>${usageList().filter(([, u]) => u.limit).map(([id, u]) => `<tr><td><code>${id}</code></td><td>${u.limit.max}</td><td>${esc(u.limit.overflow)}</td><td>${u.limit.q ? q(u.limit.q) : esc(u.limit.from)}</td><td>${esc(u.samples.long.slice(0, 60))}${u.samples.long.length > 60 ? '…' : ''} <span class="note">(${u.samples.long.length})</span></td><td>${esc(u.samples.short)}</td></tr>`).join('')}</table>`,
  data: () => V2.data.map(d => `<p><b>${d.id}</b> <span class="pill">${d.source}</span> ${esc(d.note)} ${q(d.q)}</p><table><tr><th>field</th><th>type</th><th>the UI uses it as</th></tr>${d.shape.map(f => `<tr><td><code>${f.name}</code></td><td>${f.type}</td><td>${esc(f.at)}</td></tr>`).join('')}</table>`).join(''),
  tokens: () => `<table><tr><th>new token</th><th>Light</th><th>Dark</th><th>from</th></tr>${V2.tokensToAdd.map(t => `<tr><td><code>${t.name}</code>${copyBtn(t.name)}</td>${['Light', 'Dark'].map(m => `<td>${t.values[m] ? `<span class="swatch" style="background:${t.values[m]}"></span><code>${t.values[m]}</code>${copyBtn(t.values[m])}` : q(t.q)}</td>`).join('')}<td>${esc(t.from)}</td></tr>`).join('')}</table><p class="note">A proposal: it joins the Foundations document only through its own step.</p>`,
  changes: () => `<p class="note">Since the last Sign-off (r${V2.signedRevision}); this is r9.</p><ul class="plain">${V2.changes.map(c => `<li><b>${c.op}</b> <code>${esc(c.what)}</code> ${esc(c.detail)}</li>`).join('')}</ul>`,
  states: () => `<table><tr><th>state</th><th>kind</th><th>trigger / source</th><th>screenshots</th></tr>${V2.states.map(s => `<tr><td>${s.name}</td><td><span class="pill ${s.kind === 'extra' ? 'extra' : ''}">${s.kind === 'extra' ? 'Extra' : 'Standard'}</span></td><td>${s.trigger ? `<code>${esc(s.trigger)}</code>` : ''} ${s.by ? `<span class="note">${esc(s.by)}</span>` : ''}</td><td>${s.missing ? `missing ${q(s.missing)}` : s.unreachable ? `unreachable: ${esc(s.unreachable)}` : 'all widths'}</td></tr>`).join('')}</table>`,
};

function wireCopy(root) {
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); b.textContent = 'copied'; setTimeout(() => b.textContent = 'copy', 900); });
}
function addTokenCopyButtons() {
  document.querySelectorAll('#tokens td code').forEach(c => { if (!c.nextElementSibling?.classList?.contains('copybtn')) c.insertAdjacentHTML('afterend', `<span class="pv">${copyBtn(c.textContent)}</span>`); });
}
function addNav(items) {
  const nav = document.querySelector('nav.groups');
  items.forEach(([id, label]) => nav.insertAdjacentHTML('beforeend', `<a href="#${id}" class="pv-added">${label}</a>`));
}
const section = (id, title, body) => `<section class="group pv" id="${id}"><h2>${title} <span class="mock">mock v2 content</span></h2>${body}</section>`;

// ── A: new sections in the existing document ──────────────────────────────────
function variantA(main) {
  addNav([['a11y', 'Accessibility'], ['responsive', 'Responsive'], ['errors', 'Field errors & limits'], ['data', 'Data'], ['new-tokens', 'Tokens to add'], ['changes', 'Changes since r8']]);
  document.querySelector('#look').insertAdjacentHTML('afterend', section('changes', 'Changes since Sign-off', tables.changes()));
  // Extra states and a 320 column in the existing matrix.
  const matrix = document.querySelector('#states table.matrix');
  matrix.querySelector('tr').children[0].insertAdjacentHTML('afterend', '<th>320</th>');
  [...matrix.querySelectorAll('tr')].slice(1).forEach(tr => {
    const name = tr.children[0].textContent.trim();
    const s = V2.states.find(x => x.name === name);
    if (tr.children[1].colSpan > 1) tr.children[1].colSpan += 1; else tr.children[0].insertAdjacentHTML('afterend', '<td><div class="slot slot320" style="height:auto;min-height:96px">320 not captured in this mock</div></td>');
    if (s?.announce?.text) tr.children[0].insertAdjacentHTML('beforeend', `<div class="pv"><span class="note">🔊 “${esc(s.announce.text)}”</span></div>`);
  });
  V2.states.filter(s => s.kind === 'extra').forEach(s => matrix.insertAdjacentHTML('beforeend', `<tr class="pv"><th>${s.name}<br><span class="pill extra">Extra</span></th><td colspan="6" class="${s.missing ? 'hatch' : ''}">${s.missing ? `<span class="flag">! missing state</span> named by the owner ${q(s.missing)}` : `<code>${esc(s.trigger)}</code> · unreachable: ${esc(s.unreachable)} · announce ${q(s.announce.q)}`}</td></tr>`));
  document.querySelector('#states').insertAdjacentHTML('afterend',
    section('a11y', 'Accessibility', `<div class="cols" style="grid-template-columns:minmax(0,420px) 1fr"><div>${overlayShot('default')}</div><div><h3>Focus order</h3>${tables.focus()}<h3>Landmarks & headings</h3>${tables.outline()}</div></div><h3>Accessible names</h3>${tables.names()}<h3>Announcements & focus after actions</h3>${tables.announce()}`) +
    section('responsive', 'Responsive', tables.responsive()) +
    section('errors', 'Field errors & copy limits', `<h3>Errors (inside the error state)</h3>${tables.errors()}<h3>Limits & samples</h3>${tables.limits()}`) +
    section('data', 'Data the UI depends on', tables.data()));
  document.querySelector('#tokens').insertAdjacentHTML('afterend', section('new-tokens', 'Tokens to add', tables.tokens()));
  addTokenCopyButtons();
}

// ── B: a state workspace replaces the States matrix ───────────────────────────
function variantB(main) {
  const statesSec = document.querySelector('#states');
  statesSec.style.display = 'none';
  let st = 'default', w = 'md', layers = { focus: true, headings: false, errors: false };
  statesSec.insertAdjacentHTML('beforebegin', `<section class="group pv" id="workspace"><h2>Screen “/” · states <span class="mock">mock v2 content</span></h2><div class="cols ws"><nav class="rail" id="b-rail"></nav><div><div class="toolbar" id="b-tools"></div><div id="b-shot"></div></div><aside class="panel" id="b-panel"></aside></div></section>`);
  const rail = document.querySelector('#b-rail'), tools = document.querySelector('#b-tools'), shotEl = document.querySelector('#b-shot'), panel = document.querySelector('#b-panel');
  const changedIn = s => s === 'loading';
  function draw() {
    rail.innerHTML = ['standard', 'extra'].map(k => `<h4>${k === 'extra' ? 'Extra states' : 'Standard states'}</h4>` + V2.states.filter(s => s.kind === k).map(s => `<button aria-pressed="${s.name === st}" data-s="${s.name}"><span>${s.name}</span><span>${s.missing ? '<span class="pill">!</span>' : ''}${s.unreachable ? '<span class="pill">⊘</span>' : ''}${changedIn(s.name) ? '<span class="pill" title="changed since r8">Δ</span>' : ''}</span></button>`).join('')).join('') + `<h4>Since r${V2.signedRevision}</h4><div class="note">${V2.changes.length} changes</div>`;
    tools.innerHTML = V2.widths.map(x => `<button aria-pressed="${x === w}" data-w="${x}">${x}</button>`).join('') + '<span style="width:12px"></span>' + [['focus', 'Focus order'], ['headings', 'Headings'], ['errors', 'Field errors']].map(([k, l]) => `<button aria-pressed="${layers[k]}" data-l="${k}">${l}</button>`).join('');
    const s = V2.states.find(x => x.name === st);
    if (s.missing) shotEl.innerHTML = `<div class="slot hatch" style="min-height:300px">missing state ${q(s.missing)}</div>`;
    else if (s.unreachable) shotEl.innerHTML = `<div class="slot" style="min-height:300px">no screenshot: ${esc(s.unreachable)}</div>`;
    else if (w === '320') shotEl.innerHTML = `<div class="slot slot320">320 not captured in this mock</div>`;
    else if (w === 'md') shotEl.innerHTML = overlayShot(st, layers);
    else shotEl.innerHTML = `<div class="shotbox"><img src="${shot(st, w)}" alt=""></div><p class="note">Overlays are mocked for md only.</p>`;
    const acc = V2.acceptance[st] || [];
    panel.innerHTML = `<h4>${st} <span class="pill ${s.kind === 'extra' ? 'extra' : ''}">${s.kind === 'extra' ? 'Extra' : 'Standard'}</span></h4>
      ${s.trigger ? `<p>Trigger <code>${esc(s.trigger)}</code></p>` : ''}${s.by ? `<p class="note">${esc(s.by)}</p>` : ''}
      <h4>Screen reader</h4>${s.announce ? (s.announce.text ? `<p>Announces “${esc(s.announce.text)}” <span class="pill">${s.announce.politeness}</span></p>` : q(s.announce.q)) : '<p class="note">Nothing announced.</p>'}
      ${s.focusAfter ? `<p>Focus ${esc(s.focusAfter)}</p>` : ''}
      ${s.fieldErrors ? `<h4>Field errors</h4>${tables.errors()}` : ''}
      <h4>At ${w}</h4><ul class="plain">${V2.responsive.map(r => `<li>${esc(r.region)}: ${esc(r.at[w])}</li>`).join('')}</ul>
      <h4>Acceptance</h4>${acc.length ? `<ul class="plain">${acc.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="note">None.</p>'}
      ${changedIn(st) ? `<h4>Changed since r${V2.signedRevision}</h4>${tables.changes()}` : ''}`;
    rail.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st = b.dataset.s; draw(); });
    tools.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { w = b.dataset.w; draw(); });
    tools.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { layers[b.dataset.l] = !layers[b.dataset.l]; draw(); });
  }
  draw();
  document.querySelector('#tokens').insertAdjacentHTML('afterend', section('new-tokens', 'Tokens to add', tables.tokens()) + section('data', 'Data the UI depends on', tables.data()) + section('a11y-names', 'Accessible names & landmarks', tables.names() + '<h3>Outline</h3>' + tables.outline()));
  addNav([['workspace', 'States workspace'], ['new-tokens', 'Tokens to add'], ['data', 'Data'], ['a11y-names', 'Names & landmarks']]);
  addTokenCopyButtons();
}

// ── C: a Usage inspector, with feature-level changes in a strip ───────────────
function variantC(main) {
  let sel = 'email', sample = 'as designed';
  main.insertAdjacentHTML('afterbegin', `<section class="pv" id="inspector">
    <div class="strip">
      <details><summary>Δ ${V2.changes.length} changes since r${V2.signedRevision}</summary>${tables.changes()}</details>
      <details><summary>${V2.states.filter(s => s.kind === 'extra').length} Extra states</summary>${tables.states()}</details>
      <details><summary>${V2.tokensToAdd.length} token to add</summary>${tables.tokens()}</details>
      <details><summary>${V2.data.length} data source</summary>${tables.data()}</details>
      <details><summary>Outline</summary>${tables.outline()}</details>
      <span class="mock">mock v2 content</span>
    </div>
    <div class="cols insp"><div class="ulist" id="c-list"></div><div><div class="toolbar" id="c-tools"></div><div id="c-shot"></div></div><aside class="panel" id="c-panel"></aside></div></section>`);
  const list = document.querySelector('#c-list'), shotEl = document.querySelector('#c-shot'), panel = document.querySelector('#c-panel'), tools = document.querySelector('#c-tools');
  function draw() {
    const ordered = [...focusable(), ...usageList().filter(([, u]) => !u.focus)];
    list.innerHTML = '<h3 style="margin-top:0">Usages, in focus order</h3>' + ordered.map(([id, u]) => `<button aria-pressed="${id === sel}" data-u="${id}"><span>${u.focus ? `<span class="badge">${u.focus}</span>` : u.heading ? `<span class="badge" style="background:#8a3800">h${u.heading.level}</span>` : ''}</span><span>${esc(u.label)}</span><span class="chips">${u.errors ? `<span class="pill">${u.errors.length} errors</span>` : ''}${u.limit ? `<span class="pill">max ${u.limit.max}</span>` : ''}${u.data ? `<span class="pill">data: ${u.data}</span>` : ''}</span></button>`).join('');
    tools.innerHTML = `Sample copy: ${['as designed', 'long', 'short'].map(x => `<button aria-pressed="${x === sample}" data-sample="${x}">${x}</button>`).join('')} <span class="note">(fills the live render below in a real build)</span>`;
    shotEl.innerHTML = overlayShot('default', { focus: true, select: sel });
    const u = V2.usages[sel];
    const sampleText = sample === 'as designed' ? null : u.samples?.[sample];
    panel.innerHTML = `<h4>${esc(u.label)}</h4><p><code>${sel}</code></p>
      ${u.focus ? `<p>Focus <span class="badge">${u.focus}</span> of ${focusable().length}</p>` : ''}
      ${u.heading ? `<p>Heading h${u.heading.level} “${esc(u.heading.text)}” ${q(u.heading.q)}</p>` : ''}
      ${u.name ? `<h4>Accessible name</h4><p>“${esc(u.name.text)}” <span class="note">copy:${u.name.copy}</span></p>` : ''}
      ${u.errors ? `<h4>Errors <span class="note">(error state)</span></h4><ul class="plain">${u.errors.map(e => `<li>${esc(e.when)} → “${esc(e.text)}”</li>`).join('')}</ul>` : ''}
      ${u.limit ? `<h4>Limit</h4><p>max ${u.limit.max} · ${esc(u.limit.overflow)} · ${u.limit.q ? q(u.limit.q) : esc(u.limit.from)}</p>` : ''}
      ${sampleText ? `<h4>${sample} sample</h4><p style="word-break:break-word">${esc(sampleText)}</p>` : ''}
      ${u.data ? `<h4>Data</h4><p>options from <b>${u.data}</b> (${V2.data[0].shape.map(f => f.name).join(', ')})</p>` : ''}
      <h4>Responsive</h4><p class="note">from its region: ${esc(V2.responsive[0].at['320'])} at 320</p>`;
    list.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { sel = b.dataset.u; draw(); });
    shotEl.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { sel = b.dataset.u; draw(); });
    tools.querySelectorAll('[data-sample]').forEach(b => b.onclick = () => { sample = b.dataset.sample; draw(); });
    wireCopy(document.querySelector('#inspector'));
  }
  draw();
  addNav([['inspector', 'Inspector']]);
  addTokenCopyButtons();
}

// ── switcher ──────────────────────────────────────────────────────────────────
const VARIANTS = { A: ['Sections', variantA], B: ['State workspace', variantB], C: ['Usage inspector', variantC] };
const keys = Object.keys(VARIANTS);
const current = keys.includes(new URLSearchParams(location.search).get('variant')) ? new URLSearchParams(location.search).get('variant') : 'A';
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
VARIANTS[current][1](document.querySelector('main.doc'));
wireCopy(document);
const go = d => { const k = keys[(keys.indexOf(current) + d + keys.length) % keys.length]; const u = new URL(location); u.searchParams.set('variant', k); location.replace(u); };
document.body.insertAdjacentHTML('beforeend', `<div class="pv-bar"><button id="pv-prev" aria-label="Previous variant">←</button><span>${current} (${VARIANTS[current][0]})</span><button id="pv-next" aria-label="Next variant">→</button></div>`);
document.querySelector('#pv-prev').onclick = () => go(-1);
document.querySelector('#pv-next').onclick = () => go(1);
document.addEventListener('keydown', e => { if (e.target.closest('input,textarea,select,[contenteditable]')) return; if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
