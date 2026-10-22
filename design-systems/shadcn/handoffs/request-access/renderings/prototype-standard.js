// PROTOTYPE, throwaway. Question: what should the HTML Rendering of a Handoff look like if it is laid out
// from industry practice rather than from today's render-html.mjs? Every annotation is filed under one of
// Figma Dev Mode's four annotation categories (Development, Interaction, Accessibility, Content), and the
// a11y marks follow Primer's annotation stamps (focus order, headings, landmarks). Two variants:
// ?variant=doc (a spec document, top to bottom) and ?variant=inspect (Dev Mode-like canvas + inspector).
// Real content comes from handoff.json via window.DATA; MOCK holds the v2 content decided in the
// 2026-10-21 grill (Q14–Q26), hand-written for request-access only and tagged "mock" wherever it shows;
// any other Handoff renders with an empty MOCK, so those sections show what today's Handoff lacks.
(() => {
const D = window.DATA, H = D.handoff, S = H.screens[0];

const MOCK_REQUEST_ACCESS = {
  labelledBy: { name: 'label', email: 'label-2', select: 'label-3', reason: 'label-4' },
  focusable: ['name', 'email', 'select', 'reason', 'button-2', 'button', 'button-3'],
  focusBy: 'agent, from DOM order; the owner can reorder',
  headings: [{ target: 'title', level: 1, copy: 'w-full-title', q: 'q-a11y-heading-w-full-title' }],
  landmarks: [
    { region: 'shell', landmark: null, note: 'page shell, no landmark of its own' },
    { region: 'flex', landmark: 'main', target: 'w-full' },
    { region: 'toaster', landmark: null, note: 'a live region (sonner), not a landmark' },
  ],
  names: { icon: { q: 'q-a11y-icon-shield', note: 'shield icon beside the title' } },
  announce: {
    loading: { copy: 'button-2-label-loading', politeness: 'polite', target: 'button-2' },
    error: { copy: 'alert-title', politeness: 'assertive', target: 'alert', via: 'role="alert" on the Alert' },
    success: { copy: 'font-medium', politeness: 'polite', target: 'font-medium' },
    offline: { q: 'q-a11y-announce-offline' },
  },
  focusAfter: { error: 'alert', success: 'button' },
  errors: {
    name: [{ when: 'empty', copy: 'Enter your full name' }],
    email: [{ when: 'empty', copy: 'Enter your work email' }, { when: 'wrong format', copy: 'Enter an email address like ada@example.com' }, { when: 'personal domain', copy: 'Use your work email, not a personal one' }],
    select: [{ when: 'empty', copy: 'Pick a team' }],
    reason: [{ when: 'too long', copy: 'Keep it under 500 characters' }],
  },
  limits: {
    name: { max: 80, overflow: 'scrolls inside the field', q: 'q-limit-name', long: 'Maximiliana Alexandrina Featherstonehaugh-Worthington', short: 'Al' },
    email: { max: 254, overflow: 'scrolls inside the field', from: 'Prototype maxLength', long: 'maximiliana.featherstonehaugh-worthington@research.example.com', short: 'a@b.co' },
    reason: { max: 500, overflow: 'wraps; the field grows to 6 lines, then scrolls', from: 'Prototype maxLength', long: 'I lead the onboarding redesign and need to review the workspace’s current flows, comment on drafts and share them with three contractors before the quarterly review. I also need edit access to the shared component library.', short: 'Review' },
  },
  extraStates: [
    { name: 'offline', kind: 'extra', trigger: '!navigator.onLine', by: 'agent, from a state:!navigator.onLine decision', unreachable: 'the runtime reader cannot drop the network' },
    { name: 'already-member', kind: 'extra', by: 'owner', missing: true, question: 'q-state-already-member-index' },
  ],
  acceptance: [
    { id: 'personal-email', state: 'error', given: 'a personal email address', when: 'Request access is pressed', then: 'the Work email field says “Use your work email, not a personal one”' },
    { id: 'sent-announced', state: 'success', given: 'a valid form', when: 'Request access is pressed', then: '“Thanks! Your request is in.” shows and is announced' },
    { id: 'offline-blocked', state: 'offline', given: 'the visitor is offline', when: 'the page loads', then: 'Request access is disabled and the page says why' },
  ],
  responsive: {
    widths: ['320', 'sm', 'md', 'lg', 'xl', '2xl'],
    rows: [
      { region: 'flex', at: { '320': { visible: true, direction: 'column', columns: 1, note: 'card fills the width less 16 px gutters; footer stacks' }, sm: { visible: true, direction: 'row', columns: 1, note: 'card 448 px, centred' } } },
      { region: 'toaster', at: { '320': { visible: true, note: 'bottom, full width' }, sm: { visible: true, note: 'bottom right' } } },
    ],
  },
  interactions: [{ usage: 'toaster', note: 'sonner draws its own hover and focus looks; the Prototype sets none' }],
  data: [{ id: 'teams', usage: 'select', standIn: 'a fixed list in the Prototype', shape: [{ name: 'id', type: 'string', at: 'SelectItem value' }, { name: 'label', type: 'string', at: 'SelectItem text' }], q: 'q-data-teams' }],
  tokensToAdd: [{ name: 'color.success', type: 'color', values: { Light: '#15803d', Dark: null }, from: 'the success check icon and text (#15803d)', q: 'q-token-mode-color.success-dark' }],
  questions: [
    { id: 'q-a11y-heading-w-full-title', kind: 'a11y', text: 'The card title is a div. Should it be the page’s h1?' },
    { id: 'q-a11y-icon-shield', kind: 'a11y', text: 'Is the shield icon beside the title decorative, with no accessible name?' },
    { id: 'q-a11y-announce-offline', kind: 'a11y', text: 'What should a screen reader hear when the page goes offline?' },
    { id: 'q-limit-name', kind: 'limit', text: 'Full name has no maxLength or line clamp in the Prototype. How long can a name be, and what happens past it?' },
    { id: 'q-data-teams', kind: 'stand-in', text: 'The Team options are a fixed list in the Prototype. Where does the real list come from?' },
    { id: 'q-token-mode-color.success-dark', kind: 'token', text: 'color.success has no Dark value. What should it be?' },
    { id: 'q-state-already-member-index', kind: 'missing-state', text: 'What should the screen show when the visitor is already a member?' },
  ],
};

// Where each Usage or text sits on the md screenshot, in px of 768×900. Other widths shift x, since the
// card is centred (and the toaster sits bottom right). Read by eye from the screenshots: mock.
const BOX_REQUEST_ACCESS = {
  default: { 'w-full': [160, 201, 448, 499], title: [176, 216, 200, 24], icon: [177, 219, 18, 18], desc: [176, 244, 364, 16], label: [176, 277, 60, 18], name: [176, 301, 416, 32], 'label-2': [176, 347, 70, 18], email: [176, 371, 416, 32], 'label-3': [176, 417, 34, 18], select: [176, 441, 416, 32], 'label-4': [176, 487, 148, 18], reason: [176, 511, 416, 64], 'button-2': [177, 592, 414, 30], span: [176, 662, 96, 16], 'button-3': [534, 658, 58, 24] },
  error: { 'w-full': [160, 163, 448, 576], title: [176, 178, 200, 24], icon: [177, 181, 18, 18], desc: [176, 206, 364, 16], alert: [176, 241, 416, 60], label: [176, 315, 60, 18], name: [176, 339, 416, 32], 'label-2': [176, 385, 70, 18], email: [176, 409, 416, 32], 'label-3': [176, 455, 34, 18], select: [176, 479, 416, 32], 'label-4': [176, 525, 148, 18], reason: [176, 549, 416, 64], 'button-2': [177, 630, 414, 30], span: [176, 700, 96, 16], 'button-3': [534, 696, 58, 24] },
  success: { 'w-full': [160, 291, 448, 320], title: [176, 306, 200, 24], icon: [177, 309, 18, 18], desc: [176, 334, 364, 16], 'font-medium': [308, 445, 152, 18], button: [314, 477, 140, 32], span: [176, 572, 96, 16], 'button-3': [534, 568, 58, 24], toaster: [389, 803, 354, 72, 'right'] },
};
BOX_REQUEST_ACCESS.loading = BOX_REQUEST_ACCESS.default;
const EMPTY = { labelledBy: {}, focusable: [], focusBy: '', headings: [], landmarks: [], names: {}, announce: {}, focusAfter: {}, errors: {}, limits: {},
  extraStates: [], acceptance: [], responsive: { widths: S.breakpoints, rows: [] }, interactions: [], data: [], tokensToAdd: [], questions: [] };
const OURS = H.feature.key === 'request-access';
const MOCK = OURS ? MOCK_REQUEST_ACCESS : EMPTY;
const BOX = OURS ? BOX_REQUEST_ACCESS : {};
const COPYBOX = { 'w-full-title': 'title', 'w-full-description': 'desc', 'font-medium': 'font-medium', span: 'span' };

const CATS = [
  { key: 'dev', name: 'Development', letter: 'D' },
  { key: 'int', name: 'Interaction', letter: 'I' },
  { key: 'a11y', name: 'Accessibility', letter: 'A' },
  { key: 'content', name: 'Content', letter: 'C' },
];

// ---------- model ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const PLAIN = () => ui.variant === 'confluence';
const mock = { toString: () => PLAIN() ? '<b>[MOCK]</b>' : '<span class="x-mock" title="v2 content, hand-written for this prototype">mock</span>' };
const USAGES = S.regions.flatMap(r => r.usages.map(u => ({ ...u, region: r.id })));
const U = Object.fromEntries(USAGES.map(u => [u.id, u]));
const TEXTS = S.regions.flatMap(r => r.text.map(t => ({ ...t, region: r.id })));
const QUESTIONS = [...H.openQuestions, ...MOCK.questions.map(q => ({ ...q, to: 'owner', answer: null, mock: true }))];
const Q = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const copyText = k => H.copy[k]?.text ?? k;
const family = u => u.contract ? cap(u.contract) : u.raw.element;
const ownCopy = u => Object.values(u.properties || {}).filter(v => typeof v === 'string' && v.startsWith('copy:')).map(v => v.slice(5));
const nameCopy = u => ownCopy(u)[0] || (MOCK.labelledBy[u.id] && ownCopy(U[MOCK.labelledBy[u.id]])[0]);
const label = u => `${family(u)}${nameCopy(u) ? ` · ${copyText(nameCopy(u))}` : ''}`;
const visibleIn = (u, st) => !u.states || u.states.includes(st);
const STATES = [
  ...Object.entries(S.states).map(([name, v]) => ({ name, kind: 'standard', ...v })),
  ...MOCK.extraStates,
];
const ST = Object.fromEntries(STATES.map(s => [s.name, s]));
const disabledIn = (id, st) => S.states[st]?.usageStates?.[id]?.state === 'disabled';
const focusOrder = st => MOCK.focusable.filter(id => U[id] && visibleIn(U[id], st) && !disabledIn(id, st));
const ACCEPT = [...H.acceptance.map(a => ({ ...a })), ...MOCK.acceptance.map(a => ({ ...a, mock: true, by: 'agent' }))];

const qlink = id => {
  const q = Q[id];
  if (PLAIN()) return `<code>${esc(id)}</code> (${q && q.answer == null ? 'open' : 'answered'}, see Questions)`;
  const cls = q && q.answer == null ? 'x-q open' : 'x-q';
  return `<a class="${cls}" href="#${esc(id)}" data-q="${esc(id)}" title="${esc(q?.text || '')}">${q && q.answer == null ? '?' : '✓'} ${esc(id)}</a>`;
};
const copyBtn = v => PLAIN() ? '' : `<button class="x-copy" type="button" data-copy="${esc(v)}" title="Copy">copy</button>`;
const code = s => `<code>${esc(s)}</code>`;
const table = (head, rows) => !rows.length ? '<p class="x-none"><i>None in this Handoff.</i></p>' : PLAIN() ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<div class="x-tw"><table class="x-t"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const tr = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
const short = h => h.slice(7, 19);

// ---------- annotations: every note on the canvas, in one of the four categories ----------
function annotations(st) {
  const out = [];
  const add = (cat, target, title, body, extra = {}) => out.push({ cat, target, title, body, ...extra });
  const shown = USAGES.filter(u => visibleIn(u, st));
  const state = ST[st];
  // Development: every Usage the state shows
  for (const u of shown) add('dev', u.id, label(u), devBody(u), { usage: u.id });
  // Interaction: the state's trigger, what changes, field errors
  if (state.trigger) add('int', null, `Trigger: ${state.trigger}`, `<p>${esc(state.content || '')}</p>`);
  for (const [id, v] of Object.entries(state.usageStates || {}))
    add('int', id, `${label(U[id])} → ${v.state}`, `<p>${code(id)} is ${code(v.state)}${v.properties?.label ? `, label “${esc(copyText(v.properties.label.slice(5)))}”` : ''} in ${st}.</p>`, { usage: id });
  if (st === 'error') for (const [id, errs] of Object.entries(MOCK.errors))
    add('int', id, `${label(U[id])}: ${errs.length} field error${errs.length > 1 ? 's' : ''}`, errorsTable(id), { usage: id, mock: true });
  // Accessibility: focus order, heading, landmark, announcement, focus after
  focusOrder(st).forEach((id, i) => add('a11y', id, `Tab stop ${i + 1}: ${label(U[id])}`, `<p>Accessible name “${esc(copyText(nameCopy(U[id])))}”.</p>`, { usage: id, focus: i + 1, mock: true }));
  if (BOX[st]) {
    for (const h of MOCK.headings) add('a11y', h.target, `Heading level ${h.level}: “${copyText(h.copy)}”`, `<p>${qlink(h.q)}</p>`, { stamp: `H${h.level}`, mock: true });
    for (const l of MOCK.landmarks.filter(l => l.landmark)) add('a11y', l.target, `Landmark: ${l.landmark}`, `<p>Region ${code(l.region)}</p>`, { stamp: l.landmark, mock: true });
    if (MOCK.names.icon) add('a11y', 'icon', 'Shield icon: decorative?', `<p>${qlink(MOCK.names.icon.q)}</p>`, { stamp: '?', mock: true });
  }
  const an = MOCK.announce[st];
  if (an) add('a11y', an.target || null, `Announce ${an.politeness || ''}${an.copy ? `: “${copyText(an.copy)}”` : ''}`, an.q ? `<p>${qlink(an.q)}</p>` : `<p>${an.via ? esc(an.via) : `aria-live="${an.politeness}"`}</p>`, { stamp: '📢', mock: true });
  if (MOCK.focusAfter[st]) add('a11y', MOCK.focusAfter[st], `Focus moves to ${label(U[MOCK.focusAfter[st]])}`, `<p>After the action that enters ${st}.</p>`, { stamp: '→', mock: true });
  // Content: every copy key the state shows
  for (const u of shown) {
    const keys = [...ownCopy(u), ...Object.values(state.usageStates?.[u.id]?.properties || {}).map(v => v.slice(5))];
    for (const k of keys) add('content', COPYBOX[k] || u.id, `“${copyText(k)}”`, contentBody(k, u.id), { usage: u.id });
    if (MOCK.limits[u.id]) add('content', u.id, `${label(u)}: up to ${MOCK.limits[u.id].max} characters`, limitBody(u.id), { usage: u.id, mock: true });
  }
  for (const t of TEXTS.filter(t => !t.states || t.states.includes(st))) add('content', COPYBOX[t.copy] || null, `“${copyText(t.copy)}”`, contentBody(t.copy) + `<p>Text Style ${code(t.style?.textStyle)}</p>`);
  const n = {};
  for (const a of out) { n[a.cat] = (n[a.cat] || 0) + 1; a.num = `${CATS.find(c => c.key === a.cat).letter}${n[a.cat]}`; }
  return out;
}
function devBody(u) {
  const tuple = Object.entries(u.tuple || {}).map(([k, v]) => `${k}=${v}`).join(' ');
  return `<p>${u.contract ? `Contract ${code(u.contract)}${tuple ? ` ${code(tuple)}` : ''}` : `Raw ${code(u.raw.element)}: ${esc(u.reason)}`}</p>
<p class="x-dim">${u.match ? `recognised by ${esc(u.match.by)} · ` : ''}${esc(u.at)}${u.in ? ` · in ${code(u.in)}` : ''}</p>
${(u.offAxis || []).map(o => `<p><span class="x-flag">↯ off-axis</span> ${code(`${o.property}=${o.raw}`)} ${qlink(o.question)}</p>`).join('')}
${!u.contract && u.question ? `<p><span class="x-flag">∅ no Contract</span> ${qlink(u.question)}</p>` : ''}`;
}
function contentBody(k, usage) {
  return `<p>${code(k)} <span class="x-dim">${esc(H.copy[k]?.at || '')}</span></p>`;
}
function limitBody(id) {
  const l = MOCK.limits[id];
  return `<p>Max ${l.max}, ${esc(l.overflow)} · ${l.q ? qlink(l.q) : esc(l.from)}</p><p class="x-dim">Long sample (${l.long.length}): ${esc(l.long)}</p><p class="x-dim">Short sample: ${esc(l.short)}</p>`;
}
function errorsTable(id) {
  return table(['when', 'message'], MOCK.errors[id].map(e => tr([esc(e.when), `“${esc(e.copy)}”`])));
}

// ---------- the canvas ----------
const VARIANTS = [['doc', 'Spec document'], ['inspect', 'Inspect'], ['confluence', 'Confluence']];
const ui = { variant: 'confluence', state: 'default', width: 'md', layers: { dev: true, int: true, a11y: true, content: false }, mode: 'light', sel: null, pane: 'overview', sample: 'prototype' };
try { const p = new URLSearchParams(location.search); if (VARIANTS.some(([k]) => k === p.get('variant'))) ui.variant = p.get('variant'); } catch {}

function canvas() {
  const st = ST[ui.state];
  const anns = annotations(ui.state);
  const src = D.shots[`${S.id}.${ui.state}.${ui.width}`];
  let stage;
  if (src) {
    const [W, IH] = D.shotSize[`${S.id}.${ui.state}.${ui.width}`];
    const boxes = BOX[ui.state] || {};
    const pct = (b) => { const dx = b[4] === 'right' ? W - 768 : (W - 768) / 2; return { l: (b[0] + dx) / W * 100, t: b[1] / IH * 100, w: b[2] / W * 100, h: b[3] / IH * 100 }; };
    const perTarget = {};
    const marks = anns.filter(a => ui.layers[a.cat] && a.target && boxes[a.target]).map(a => {
      const p = pct(boxes[a.target]);
      // Development pins sit left of the element, tab stops right of it (Primer), the rest on its top-right corner.
      const side = a.cat === 'dev' ? 'left' : a.focus ? 'right' : 'corner';
      const key = a.target + side;
      const i = perTarget[key] = (perTarget[key] ?? -1) + 1;
      const txt = a.focus ? a.focus : a.stamp || a.num;
      const kind = a.focus ? 'focus' : a.stamp ? 'stamp' : 'pin';
      const container = USAGES.some(u => u.in === a.target);
      const pos = side === 'left' && container ? `left:calc(${p.l}% - 10px);top:calc(${p.t}% - 12px)`
        : side === 'left' ? `left:calc(${p.l}% - ${26 + i * 26}px);top:calc(${p.t + p.h / 2}% - 10px)`
        : side === 'right' ? `left:calc(${p.l + p.w}% + 6px);top:calc(${p.t + p.h / 2}% - 11px)`
        : `left:calc(${p.l + p.w}% - ${14 + i * 26}px);top:calc(${p.t}% - 12px)`;
      return `<button type="button" class="x-pin x-${a.cat} x-${kind}${ui.sel === a.num ? ' sel' : ''}" style="${pos}" data-ann="${a.num}" title="${esc(a.num + ' · ' + a.title)}">${esc(txt)}</button>`;
    });
    const outline = ui.layers.dev ? Object.entries(boxes).filter(([id]) => U[id] && visibleIn(U[id], ui.state)).map(([id, b]) => {
      const p = pct(b);
      const on = anns.find(a => a.num === ui.sel)?.target === id || ui.selUsage === id;
      return `<div class="x-box${on ? ' on' : ''}" style="left:${p.l}%;top:${p.t}%;width:${p.w}%;height:${p.h}%" data-usage="${id}"><span>${esc(label(U[id]))}</span></div>`;
    }).join('') : '';
    const fit = ui.variant === 'inspect' ? `;width:min(100%, calc((100vh - 240px) * ${W / IH}))` : '';
    stage = `<div class="x-stage" style="aspect-ratio:${W}/${IH}${fit}"><img src="${src}" alt="${esc(ui.state)} at ${ui.width}">${outline}${marks.join('')}</div>`;
  } else {
    const why = ui.width === '320' ? `No 320 screenshot yet: the Generic Adapter adds this width (grill Q6). ${mock}`
      : st.screenshots?.[ui.width]?.missing ? `No screenshot at ${esc(ui.width)}: ${esc(st.screenshots[ui.width].reason)}`
      : st.missing ? `Missing state. ${st.question ? qlink(st.question) : ''}${Q[st.question]?.answer ? ` <b>${esc(Q[st.question].answer)}</b>` : ''}${st.kind === 'extra' ? ' ' + mock : ''}`
      : st.unreachable ? `Unreachable: ${esc(st.unreachable)}. ${mock}` : 'No screenshot.';
    stage = `<div class="x-stage x-empty"><p>${why}</p></div>`;
  }
  const counts = Object.fromEntries(CATS.map(c => [c.key, anns.filter(a => a.cat === c.key).length]));
  const stateBtn = s => `<button type="button" class="x-seg${ui.state === s.name ? ' on' : ''}" data-state="${s.name}">${esc(s.name)}${s.missing ? ' <span class="x-dim">missing</span>' : s.unreachable ? ' <span class="x-dim">unreachable</span>' : ''}</button>`;
  return `<div class="x-controls">
<div class="x-ctl"><span class="x-lbl">Standard states</span>${STATES.filter(s => s.kind === 'standard').map(stateBtn).join('')}</div>
<div class="x-ctl"><span class="x-lbl">Extra states ${mock}</span>${STATES.filter(s => s.kind === 'extra').map(stateBtn).join('') || '<span class="x-dim">none</span>'}</div>
<div class="x-ctl"><span class="x-lbl">Width</span>${MOCK.responsive.widths.map(w => `<button type="button" class="x-seg${ui.width === w ? ' on' : ''}" data-width="${w}">${w}</button>`).join('')}</div>
<div class="x-ctl"><span class="x-lbl">Annotations</span>${CATS.map(c => `<label class="x-chip x-${c.key}"><input type="checkbox" data-layer="${c.key}"${ui.layers[c.key] ? ' checked' : ''}> ${c.name} <b>${counts[c.key]}</b></label>`).join('')}</div>
</div>${stage}`;
}
function annList(st, compact) {
  const anns = annotations(st);
  return CATS.filter(c => ui.layers[c.key]).map(c => {
    const list = anns.filter(a => a.cat === c.key);
    if (!list.length) return '';
    return `<div class="x-anns"><h4><span class="x-dot x-${c.key}"></span>${c.name}</h4><ol>${list.map(a => `<li class="x-ann${ui.sel === a.num ? ' sel' : ''}" data-ann="${a.num}"><span class="x-num x-${a.cat}">${a.focus ? a.focus : esc(a.stamp || a.num)}</span><div><b>${esc(a.title)}</b>${a.mock ? ' ' + mock : ''}${!a.target || !(BOX[st] || {})[a.target] ? ' <span class="x-dim">(screen-wide)</span>' : ''}${compact && ui.sel !== a.num ? '' : `<div class="x-annbody">${a.body}</div>`}</div></li>`).join('')}</ol></div>`;
  }).join('');
}

// ---------- sections, shared by both variants ----------
const flags = () => {
  const off = USAGES.flatMap(u => (u.offAxis || []).map(o => ({ u, o })));
  const noC = USAGES.filter(u => !u.contract);
  const miss = STATES.filter(s => s.missing);
  return { off, noC, miss, open: QUESTIONS.filter(q => q.answer == null) };
};
function secCover() {
  const f = flags();
  const stamp = D.stamp;
  return `<section class="x-sec" id="cover"><div class="x-cover">
<p class="x-eyebrow">Handoff · ${esc(H.source.designSystem)} · screen ${esc(S.name)}</p>
<h1>${esc(H.feature.name)}</h1>
<p class="x-goal">${esc(H.feature.goal)}</p>
<div class="x-status ${H.status}"><b>${H.status === 'approved' ? 'Signed off' : 'Pending Sign-off'}</b> · ${esc(stamp)} · ${D.signedRevision ? `last signed r${D.signedRevision}` : 'never signed off'}<br><span class="x-dim">Sign-off is the owner’s approve in chat, not Figma’s Ready for dev. Build from a signed-off revision.</span></div>
<div class="x-kpis">
<a href="#sec-dev"><b>${USAGES.length}</b> Usages</a>
<a href="#sec-int"><b>${STATES.filter(s => s.kind === 'standard').length} + ${STATES.filter(s => s.kind === 'extra').length}</b> states</a>
<a href="#acceptance"><b>${ACCEPT.length}</b> acceptance criteria</a>
<a href="#questions"><b>${f.open.length}</b> open questions</a>
<a href="#changes">${D.signedRevision ? `<b>${D.changes.length}</b> changes since r${D.signedRevision}` : '<b>first</b> Sign-off'}</a>
</div>
<p class="x-needs"><b>Needs a look:</b> <span class="x-flag">↯ off-axis</span> ${f.off.length} · <span class="x-flag">∅ no Contract</span> ${f.noC.length} · <span class="x-flag">! missing state</span> ${f.miss.length} — ${[...f.off.map(x => x.o.question), ...f.noC.map(u => u.question), ...f.miss.map(s => s.question)].filter(Boolean).map(qlink).join(' ')}</p>
</div></section>`;
}
function secChanges() {
  if (!D.signedRevision) return `<section class="x-sec" id="changes"><h2>Changes since Sign-off</h2><p>First Sign-off: no <code>signed.json</code> yet, so everything is new.</p></section>`;
  return `<section class="x-sec" id="changes"><h2>Changes since Sign-off r${D.signedRevision}</h2>
<p class="x-dim">Computed from <code>signed.json</code> (r${D.signedRevision}) and <code>handoff.json</code> (r${H.revision}); not stored in the Handoff (grill Q13).</p>
${table(['', 'what', 'fields'], groupChanges().map(c => tr([`<span class="x-op x-op${c.op === '+' ? 'add' : c.op === '~' ? 'chg' : 'del'}">${c.op}</span>`, c.whats.map(code).join(' '), esc(c.detail)])))}</section>`;
}
function groupChanges() {
  const g = [];
  for (const c of D.changes) {
    const kind = c.what.split(' ')[0];
    const hit = g.find(x => x.op === c.op && x.detail === c.detail && x.kind === kind);
    if (hit) hit.whats.push(c.what); else g.push({ op: c.op, detail: c.detail, kind, whats: [c.what] });
  }
  return g;
}
function secAcceptance() {
  return `<section class="x-sec" id="acceptance"><h2>Acceptance criteria</h2>
${table(['id', 'state', 'Given', 'When', 'Then', 'by'], ACCEPT.map(a => tr([code(a.id) + (a.mock ? ' ' + mock : ''), esc(a.state), esc(a.given), esc(a.when), esc(a.then), esc(a.by)])))}</section>`;
}
function secScreen(compact) {
  return `<section class="x-sec" id="screen"><h2>Screen ${esc(S.name)} <span class="x-dim">${esc(S.at)}</span></h2>
<p class="x-dim">Pins sit on the screenshot; each one is listed beside it. Tab-stop numbers and H/landmark stamps follow Primer’s annotation stamps. Pin positions are read by eye: ${mock}</p>
<div class="x-screen"><div class="x-canvaswrap" id="x-canvas">${canvas()}</div><aside class="x-annside" id="x-anns">${annList(ui.state, compact)}</aside></div></section>`;
}
function secContent() {
  const usedBy = k => USAGES.filter(u => ownCopy(u).includes(k) || Object.values(S.states).some(s => Object.values(s.usageStates || {}).some(v => Object.values(v.properties || {}).includes('copy:' + k)))).map(u => u.id);
  const textOf = k => TEXTS.find(t => t.copy === k);
  const rows = Object.entries(H.copy).map(([k, v]) => {
    const t = textOf(k);
    const users = usedBy(k);
    const lim = users.map(id => MOCK.limits[id]).find(Boolean);
    return tr([code(k), `“${esc(v.text)}”`, users.map(code).join(' ') || (t ? `text in ${code(t.region)}` : ''), t?.style?.textStyle ? code(t.style.textStyle) : '', esc(v.at)]);
  });
  const lrows = Object.entries(MOCK.limits).map(([id, l]) => tr([code(id), String(l.max), esc(l.overflow), l.q ? qlink(l.q) : esc(l.from), `<span class="x-sample">${esc(l.long)}</span> <span class="x-dim">(${l.long.length})</span>`, esc(l.short)]));
  return `<section class="x-sec" id="sec-content"><h2><span class="x-dot x-content"></span>Content</h2>
<h3>Copy</h3>${table(['key', 'text', 'used by', 'Text Style', 'where'], rows)}
<h3>Limits and samples ${mock}</h3><p class="x-dim">Only text fed by data or typed by the user (grill Q22).</p>${table(['Usage', 'max', 'past the limit', 'from', 'long sample', 'short sample'], lrows)}
${Object.keys(MOCK.limits).length ? '' : '<!--'}<div class="x-sampler"><div class="x-ctl"><span class="x-lbl">Try in the live components</span>${['prototype', 'long', 'short'].map(s => `<button type="button" class="x-seg${ui.sample === s ? ' on' : ''}" data-sample="${s}">${cap(s)}</button>`).join('')}</div>
<div class="x-samples">${Object.keys(MOCK.limits).map(id => `<figure><figcaption>${esc(label(U[id]))}</figcaption><div class="x-live" data-sample-for="${id}">${D.specimens[id]?.live || ''}</div></figure>`).join('')}</div></div>${Object.keys(MOCK.limits).length ? '' : '-->'}
</section>`;
}
function secInteraction() {
  const rows = STATES.map(s => {
    const changes = Object.entries(s.usageStates || {}).map(([id, v]) => `${code(id)} → ${code(v.state)}`).join(' ');
    const shots = s.screenshots ? `${Object.keys(s.screenshots).length} widths` : s.missing ? `missing ${s.question ? qlink(s.question) : ''}${Q[s.question]?.answer ? ` <b>${esc(Q[s.question].answer)}</b>` : ''}` : s.unreachable ? `unreachable: ${esc(s.unreachable)}` : '';
    return tr([`<b>${esc(s.name)}</b>`, s.kind === 'extra' ? `<span class="x-tag">Extra</span> ${mock}` : '<span class="x-tag std">Standard</span>', s.trigger ? code(s.trigger) : '', esc(s.by || (s.kind === 'standard' ? 'agent' : '')), changes, shots]);
  });
  const erows = Object.entries(MOCK.errors).flatMap(([id, es]) => es.map((e, i) => tr([i ? '' : `${code(id)} ${esc(label(U[id]))}`, esc(e.when), `“${esc(e.copy)}”`])));
  return `<section class="x-sec" id="sec-int"><h2><span class="x-dot x-int"></span>Interaction</h2>
<h3>States</h3><p class="x-dim">Five Standard states are required; Extra states as the Prototype or the owner needs (ADR 0018).</p>
${table(['state', 'kind', 'trigger', 'source', 'what changes', 'screenshots'], rows)}
<h3>Field errors ${mock}</h3><p class="x-dim">Shown in the <code>error</code> state, one message per field and kind of error (GOV.UK).</p>${table(['Usage', 'when', 'message'], erows)}
<h3>Flow</h3><p class="x-dim">How each state is reached: its trigger, or the When of its acceptance criterion. ${H.flow.length ? '' : 'One screen: no flow between screens.'}</p>
${H.flow.length ? table(['from', 'trigger', 'to'], H.flow.map(f => tr([esc(f.from), esc(f.trigger), esc(f.to)]))) : ''}
<div class="x-mermaid" data-mermaid="${esc(flowMermaid())}"></div>
${PLAIN() ? `<p><i>Mermaid source, for a Mermaid macro in Confluence:</i></p><pre>${esc(flowMermaid())}</pre>` : ''}
<h3>Interaction looks of raw Usages ${mock}</h3><p class="x-dim">Contract Usages take hover, pressed and focus looks from the Code Library (grill Q16).</p>${table(['Usage', 'looks'], MOCK.interactions.map(i => tr([code(i.usage), esc(i.note)])))}
</section>`;
}
function secA11y() {
  const groups = [...new Set(STATES.filter(s => BOX[s.name]).map(s => focusOrder(s.name).join(',')))].map(k => ({ ids: k.split(','), states: STATES.filter(s => BOX[s.name] && focusOrder(s.name).join(',') === k).map(s => s.name) }));
  const names = MOCK.focusable.filter(id => U[id]).map(id => tr([code(id), esc(family(U[id])), `“${esc(copyText(nameCopy(U[id])))}”`, code(nameCopy(U[id]))]));
  if (MOCK.names.icon) names.push(tr([code('icon'), 'Icon', qlink(MOCK.names.icon.q), esc(MOCK.names.icon.note)]));
  const ann = STATES.filter(s => MOCK.announce[s.name] || MOCK.focusAfter[s.name]).map(s => {
    const a = MOCK.announce[s.name] || {};
    return tr([`<b>${esc(s.name)}</b>`, a.q ? qlink(a.q) : `“${esc(copyText(a.copy))}”`, a.politeness ? `<span class="x-tag">${a.politeness}</span>` : '', esc(a.via || ''), MOCK.focusAfter[s.name] ? code(MOCK.focusAfter[s.name]) : 'stays where it is']);
  });
  return `<section class="x-sec" id="sec-a11y"><h2><span class="x-dot x-a11y"></span>Accessibility ${mock}</h2>
<h3>Focus order</h3><p class="x-dim">${MOCK.focusBy ? `Drafted by the ${esc(MOCK.focusBy)} ` : ''}(WCAG 2.4.3). Contract Usages keep the Code Library’s own keyboard behaviour.</p>
<div class="x-focus">${MOCK.focusable.length ? '' : '<p class="x-none">None in this Handoff.</p>'}${groups.filter(g => g.ids[0]).map(g => `<div><p class="x-dim">${g.states.join(', ')}</p><ol class="x-tabs">${g.ids.map((id, i) => `<li><span class="x-num x-a11y">${i + 1}</span>${esc(label(U[id]))} ${code(id)}</li>`).join('')}</ol></div>`).join('')}</div>
<h3>Accessible names</h3>${table(['Usage', 'family', 'name', 'from copy'], names)}
<h3>Landmarks and headings</h3>${MOCK.landmarks.length ? '' : `<p class="x-none">None in this Handoff. Regions: ${S.regions.map(r => `${code(r.id)} ${r.landmark ? `&lt;${esc(r.landmark)}&gt;` : 'no landmark'}`).join(' · ')}</p>`}<ul class="x-tree">${MOCK.landmarks.map(l => `<li>${l.landmark ? `<span class="x-tag">${l.landmark}</span>` : '<span class="x-dim">no landmark</span>'} region ${code(l.region)}${l.note ? ` <span class="x-dim">${esc(l.note)}</span>` : ''}${l.landmark === 'main' ? `<ul>${MOCK.headings.map(h => `<li><span class="x-tag">h${h.level}</span> “${esc(copyText(h.copy))}” ${qlink(h.q)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>
<h3>Announcements and focus after an action</h3>${table(['state', 'announced', 'politeness', 'how', 'focus moves to'], ann)}
</section>`;
}
function usageCard(u) {
  const sp = D.specimens[u.id] || {};
  return `<article class="x-ucard" id="usage-${u.id}"><header><h4>${esc(label(u))}</h4><p>${code(u.id)} · region ${code(u.region)}${u.states ? ` · ${u.states.join(', ')}` : ' · every state'}</p></header>
<div class="x-live">${sp.live || ''}${sp.states || ''}</div>
${devBody(u)}
${sp.snippet ? `<div class="x-snip"><pre>${esc(sp.snippet)}</pre>${copyBtn(sp.snippet)}</div>` : ''}</article>`;
}
function secDev() {
  const contracts = Object.entries(H.source.contracts).map(([k, v]) => tr([code(k), code(short(v.contentHash)), USAGES.filter(u => u.contract === k).map(u => code(u.id)).join(' ')]));
  const tokens = MOCK.tokensToAdd.map(t => tr([`${code(t.name)} ${copyBtn(t.name)}`, esc(t.type), ...['Light', 'Dark'].map(m => t.values[m] ? `<span class="x-sw" style="background:${t.values[m]}"></span>${code(t.values[m])} ${copyBtn(t.values[m])}` : qlink(t.q)), esc(t.from)]));
  const resp = MOCK.responsive.rows.map(r => tr([code(r.region), ...MOCK.responsive.widths.map(w => { const v = r.at[w]; return v ? `${v.direction ? code(v.direction) + ' ' : ''}${v.columns ? v.columns + ' col · ' : ''}${esc(v.note)}` : '<span class="x-dim">as sm</span>'; })]));
  return `<section class="x-sec" id="sec-dev"><h2><span class="x-dot x-dev"></span>Development</h2>
<div class="x-ctl"><span class="x-lbl">Mode</span>${Object.entries(H.source.modes).map(([k, v]) => `<button type="button" class="x-seg${ui.mode === 'light' ? ' on' : ''}" data-mode="light">${esc(cap(v))}</button>`).join('')}<button type="button" class="x-seg${ui.mode === 'dark' ? ' on' : ''}" data-mode="dark">Dark <span class="x-dim">unverified</span></button></div>
<h3>Components · all ${USAGES.length} Usages on this screen</h3><div class="x-ucards">${USAGES.map(usageCard).join('')}</div>
<h3>Tokens</h3>
<p>Text Styles: ${TEXTS.length ? '' : 'none'}${TEXTS.map(t => `${code(t.style?.textStyle)} ${copyBtn(t.style?.textStyle)} <span class="x-dim">“${esc(copyText(t.copy))}”</span>`).join(' · ')}</p>
<p>Off-system values: ${H.values.length ? H.values.length : 'none'}.</p>
<h4>Tokens to add ${mock}</h4><p class="x-dim">A proposal: it joins the Foundations document only through its own step (grill Q24).</p>${table(['token', 'type', 'Light', 'Dark', 'from'], tokens)}
<h3>Data and Stand-ins</h3>${table(['id', 'Stand-in', 'note', 'where', 'question'], (H.data || []).map(d => tr([code(d.id), esc(d.source), esc(d.note), esc(d.at), d.question ? qlink(d.question) : ''])))}
<h4>Shape ${mock}</h4>${MOCK.data.length ? '' : '<p class="x-none">None in this Handoff.</p>'}${MOCK.data.map(d => `<p>${code(d.id)} feeds ${code(d.usage)} · Stand-in: ${esc(d.standIn)} ${qlink(d.q)}</p>${table(['field', 'type', 'the UI uses it as'], d.shape.map(f => tr([code(f.name), esc(f.type), esc(f.at)])))}`).join('')}
<h3>Responsive ${mock}</h3>${table(['region', ...MOCK.responsive.widths], resp)}
<h3>Source</h3>
<p>Prototype ${esc(H.source.kind)} · ${Object.keys(H.source.prototype.files).length} files · snapshot ${code(short(H.source.prototype.snapshotId))} · Foundations ${code(short(H.source.foundations.documentHash))}</p>
${table(['Contract', 'content hash', 'Usages'], contracts)}
${(H.source.notes || []).map(n => `<p class="x-dim">${esc(n.level)}: ${esc(n.text)}</p>`).join('')}
<p class="x-dim">Ignored: ${(H.source.ignored || []).map(esc).join(', ') || 'nothing'}</p>
</section>`;
}
function secQuestions() {
  const item = q => `<li id="${esc(q.id)}" class="x-qi${q.answer == null ? ' open' : ''}"><p>${code(q.id)} <span class="x-tag">${esc(q.kind)}</span> to ${esc(q.to)}${q.mock ? ' ' + mock : ''}</p><p>${esc(q.text)}</p>${q.answer != null ? `<p class="x-ans">${esc(q.answer)} <span class="x-dim">— ${esc(q.by)}${H.ownerDecisions['question:' + q.id] ? ', recorded in ownerDecisions' : ''}</span></p>` : ''}</li>`;
  const open = QUESTIONS.filter(q => q.answer == null), done = QUESTIONS.filter(q => q.answer != null);
  return `<section class="x-sec" id="questions"><h2>Questions</h2><h3>Open (${open.length})</h3><ul class="x-qs">${open.map(item).join('')}</ul><h3>Answered (${done.length})</h3><ul class="x-qs">${done.map(item).join('')}</ul></section>`;
}
function usageDetail(id) {
  const u = U[id];
  const inStates = STATES.filter(s => BOX[s.name] && visibleIn(u, s.name)).map(s => s.name);
  const tabStops = inStates.map(s => { const i = focusOrder(s).indexOf(id); return i < 0 ? null : `${s}: ${i + 1}`; }).filter(Boolean);
  const keys = [...new Set([...ownCopy(u), ...Object.values(S.states).flatMap(s => Object.values(s.usageStates?.[id]?.properties || {}).map(v => v.slice(5)))])];
  const sp = D.specimens[id] || {};
  return `<div class="x-detail"><p class="x-eyebrow">Usage</p><h2>${esc(label(u))}</h2><p>${code(id)} · shows in ${inStates.join(', ') || 'no captured state'}</p>
<div class="x-live">${sp.live || ''}${sp.states || ''}</div>
<h3><span class="x-dot x-dev"></span>Development</h3>${devBody(u)}${sp.snippet ? `<div class="x-snip"><pre>${esc(sp.snippet)}</pre>${copyBtn(sp.snippet)}</div>` : ''}
<h3><span class="x-dot x-int"></span>Interaction</h3>${Object.entries(S.states).filter(([, s]) => s.usageStates?.[id]).map(([n, s]) => `<p>In ${n}: ${code(s.usageStates[id].state)}</p>`).join('') || '<p class="x-dim">No state changes it.</p>'}${MOCK.errors[id] ? `<p>Field errors ${mock}</p>${errorsTable(id)}` : ''}
<h3><span class="x-dot x-a11y"></span>Accessibility</h3>${tabStops.length ? `<p>Tab stop ${tabStops.join(' · ')} ${mock}</p><p>Name “${esc(copyText(nameCopy(u)))}”</p>` : '<p class="x-dim">Not a tab stop.</p>'}${Object.entries(MOCK.announce).filter(([, a]) => a.target === id).map(([s, a]) => `<p>Announces “${esc(copyText(a.copy))}” (${a.politeness}) in ${s} ${mock}</p>`).join('')}${Object.entries(MOCK.focusAfter).filter(([, t]) => t === id).map(([s]) => `<p>Focus moves here on entering ${s} ${mock}</p>`).join('')}
<h3><span class="x-dot x-content"></span>Content</h3>${keys.map(k => `<p>“${esc(copyText(k))}” ${code(k)}</p>`).join('') || '<p class="x-dim">No copy of its own.</p>'}${MOCK.limits[id] ? limitBody(id) : ''}
</div>`;
}

// ---------- Confluence: one static column built for a paste into the Confluence editor ----------
// A paste keeps headings, paragraphs, tables, lists, code, pre and images, and drops CSS, JS and positioning;
// so pins are drawn into the screenshots, every state is laid out in turn, and marks are words, not colours.
const CF_WIDTH = 'md';
const catName = k => CATS.find(c => c.key === k).name;
function cfShot(st) {
  const s = ST[st];
  const key = `${S.id}.${st}.${CF_WIDTH}`;
  const why = s.screenshots?.[CF_WIDTH]?.missing ? `No screenshot at ${CF_WIDTH}: ${esc(s.screenshots[CF_WIDTH].reason)}`
    : s.missing ? `Missing state. ${s.question ? qlink(s.question) : ''}${Q[s.question]?.answer ? ` Answer: <b>${esc(Q[s.question].answer)}</b>` : ''}${s.kind === 'extra' ? ' ' + mock : ''}`
    : s.unreachable ? `Unreachable: ${esc(s.unreachable)}. ${mock}` : 'No screenshot.';
  return D.shots[key] ? `<p><img data-burn="${esc(st)}" alt="${esc(st)} at ${CF_WIDTH}, annotated" width="${Math.min(D.shotSize[key][0], 720)}"></p>` : `<p><i>${why}</i></p>`;
}
function cfLegend(st) {
  const boxes = BOX[st] || {};
  return table(['mark', 'category', 'note', 'detail'], annotations(st).map(a => tr([
    `<b>${esc(a.focus ? `${a.focus}` : a.stamp || a.num)}</b>`, catName(a.cat),
    `${esc(a.title)}${a.mock ? ' ' + mock : ''}${a.target && boxes[a.target] ? '' : ' <i>(whole screen, no pin)</i>'}`, a.body])));
}
function renderConfluence() {
  const f = flags();
  const props = [
    ['Feature', esc(H.feature.name)], ['Owner', esc(H.feature.owner || '')],
    ['Status', H.status === 'approved' ? '<b>SIGNED OFF</b>' : '<b>PENDING SIGN-OFF</b>'],
    ['Revision', `${esc(D.stamp)}${D.signedRevision ? ` · last signed r${D.signedRevision}` : ' · never signed off'}`],
    ['Design system', esc(H.source.designSystem)], ['Screen', `${esc(S.name)} <code>${esc(S.at)}</code>`],
    ['Needs a look', `${f.off.length} off-axis · ${f.noC.length} with no Contract · ${f.miss.length} missing states · ${f.open.length} open questions`],
  ];
  const states = STATES.map(s => `<h3>State: ${esc(s.name)} (${s.kind === 'extra' ? `Extra ${mock}` : 'Standard'})</h3>
${s.trigger ? `<p>Trigger <code>${esc(s.trigger)}</code>${s.content ? ` · ${esc(s.content)}` : ''}</p>` : ''}${cfShot(s.name)}${s.missing || s.unreachable ? '' : cfLegend(s.name)}`).join('');
  const usageRows = USAGES.map(u => tr([`<code>${esc(u.id)}</code>`, esc(label(u)), u.contract ? `Contract <code>${esc(u.contract)}</code> ${esc(Object.entries(u.tuple || {}).map(([k, v]) => `${k}=${v}`).join(' '))}` : `Raw <code>${esc(u.raw.element)}</code>: ${esc(u.reason)}`,
    `<code>${esc(u.region)}</code>`, esc(u.states ? u.states.join(', ') : 'every state'), `<code>${esc(u.at)}</code>`]));
  const snippets = USAGES.filter(u => D.specimens[u.id]?.snippet).map(u => `<h4>${esc(label(u))} <code>${esc(u.id)}</code></h4><pre>${esc(D.specimens[u.id].snippet)}</pre>`).join('');
  return `<div class="x-cfbar"><button type="button" class="x-cfsel" data-cfselect>Select page for Confluence</button><span>Then press ⌘C / Ctrl+C and paste into a Confluence page. Images missing after the paste? Download them:</span><span id="x-cfdl"></span></div>
<article class="x-cf" id="x-cf">
<h1>${esc(H.feature.name)}: design Handoff</h1>
<p>${esc(H.feature.goal)}</p>
<table><tbody>${props.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
<p><i>Sign-off is the owner’s approve in chat, not Figma’s Ready for dev. Build from a signed-off revision. Items marked [MOCK] are v2 content that this Handoff does not carry yet.</i></p>
${H.feature.scope?.length ? `<h2>Scope</h2><ul>${H.feature.scope.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${H.feature.nonGoals?.length ? `<p><b>Not in scope</b></p><ul>${H.feature.nonGoals.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
<h2>Changes since Sign-off</h2>${D.signedRevision ? table(['', 'what', 'fields'], groupChanges().map(c => tr([c.op, c.whats.map(code).join(' '), esc(c.detail)]))) : '<p>First Sign-off: everything is new.</p>'}
<h2>Acceptance criteria</h2>${table(['id', 'state', 'Given', 'When', 'Then', 'by'], ACCEPT.map(a => tr([code(a.id) + (a.mock ? ' ' + mock : ''), esc(a.state), esc(a.given), esc(a.when), esc(a.then), esc(a.by)])))}
<h2>Screen ${esc(S.name)}</h2>
<p>Each state at ${CF_WIDTH} width, with its notes drawn on as pins. Pins are filed under Figma Dev Mode’s four categories: <b>D</b> Development, <b>I</b> Interaction, <b>A</b> Accessibility, <b>C</b> Content. Plain numbers are tab stops; <b>H1</b> and landmark stamps follow Primer.</p>
${states}
<h2>Development</h2>
<h3>Components (${USAGES.length} Usages)</h3>${table(['id', 'Usage', 'implementation', 'region', 'shows in', 'source'], usageRows)}
${snippets ? `<h3>Snippets</h3>${snippets}` : ''}
<h3>Tokens</h3><p>Text Styles: ${TEXTS.length ? TEXTS.map(t => `<code>${esc(t.style?.textStyle)}</code> “${esc(copyText(t.copy))}”`).join(' · ') : 'none'}. Off-system values: ${H.values.length || 'none'}.</p>
<h4>Tokens to add ${mock}</h4>${table(['token', 'type', 'Light', 'Dark', 'from'], MOCK.tokensToAdd.map(t => tr([code(t.name), esc(t.type), ...['Light', 'Dark'].map(m => t.values[m] ? code(t.values[m]) : qlink(t.q)), esc(t.from)])))}
<h3>Data and Stand-ins</h3>${table(['id', 'Stand-in', 'note', 'where', 'question'], (H.data || []).map(d => tr([code(d.id), esc(d.source), esc(d.note), code(d.at), d.question ? qlink(d.question) : ''])))}
${MOCK.data.map(d => `<p><code>${esc(d.id)}</code> feeds <code>${esc(d.usage)}</code>: shape ${mock}</p>${table(['field', 'type', 'the UI uses it as'], d.shape.map(x => tr([code(x.name), esc(x.type), esc(x.at)])))}`).join('')}
<h3>Responsive ${mock}</h3>${table(['region', ...MOCK.responsive.widths], MOCK.responsive.rows.map(r => tr([code(r.region), ...MOCK.responsive.widths.map(w => { const v = r.at[w]; return v ? `${v.direction ? code(v.direction) + ' ' : ''}${v.columns ? v.columns + ' col · ' : ''}${esc(v.note)}` : 'as sm'; })])))}
<h3>Source</h3><p>Prototype ${esc(H.source.kind)} · ${Object.keys(H.source.prototype.files).length} files · snapshot <code>${short(H.source.prototype.snapshotId)}</code> · Foundations <code>${short(H.source.foundations.documentHash)}</code></p>
${table(['Contract', 'content hash', 'Usages'], Object.entries(H.source.contracts).map(([k, v]) => tr([code(k), code(short(v.contentHash)), USAGES.filter(u => u.contract === k).map(u => code(u.id)).join(' ')])))}
${(H.source.notes || []).map(n => `<p><i>${esc(n.level)}: ${esc(n.text)}</i></p>`).join('')}
${secInteraction().replace(/<section[^>]*>|<\/section>|<span class="x-dot[^>]*><\/span>/g, '')}
${secA11y().replace(/<section[^>]*>|<\/section>|<span class="x-dot[^>]*><\/span>/g, '')}
<h2>Content</h2>
<h3>Copy</h3>${table(['key', 'text', 'where'], Object.entries(H.copy).map(([k, v]) => tr([code(k), `“${esc(v.text)}”`, code(v.at)])))}
<h3>Limits and samples ${mock}</h3>${table(['Usage', 'max', 'past the limit', 'from', 'long sample', 'short sample'], Object.entries(MOCK.limits).map(([id, l]) => tr([code(id), String(l.max), esc(l.overflow), l.q ? qlink(l.q) : esc(l.from), esc(l.long), esc(l.short)])))}
<h2>Questions</h2>
${['open', 'answered'].map(kind => { const qs = QUESTIONS.filter(q => (q.answer == null) === (kind === 'open')); return `<h3>${cap(kind)} (${qs.length})</h3>${table(['id', 'kind', 'to', 'question', 'answer'], qs.map(q => tr([code(q.id) + (q.mock ? ' ' + mock : ''), esc(q.kind), esc(q.to), esc(q.text), q.answer != null ? `${esc(q.answer)} <i>(${esc(q.by)})</i>` : '']))) }`; }).join('')}
</article>`;
}
// Draw each state's screenshot with its pins into a PNG, so the pins survive a paste.
const PIN_COLOR = { dev: '#2563eb', int: '#9333ea', a11y: '#15803d', content: '#c2410c' };
function burnPins() {
  const dl = document.getElementById('x-cfdl');
  document.querySelectorAll('img[data-burn]').forEach(img => {
    const st = img.dataset.burn, key = `${S.id}.${st}.${CF_WIDTH}`;
    const src = new Image();
    src.onload = () => {
      const [W, IH] = D.shotSize[key], c = document.createElement('canvas'), g = c.getContext('2d');
      const boxes = BOX[st] || {}, used = {};
      const px = b => { const dx = b[4] === 'right' ? W - 768 : (W - 768) / 2; return { x: b[0] + dx, y: b[1], w: b[2], h: b[3] }; };
      // Crop to the annotated content, with room for the pins; a screen with no pins keeps its whole frame.
      const rs = Object.values(boxes).map(px);
      const M = 48, cx = rs.length ? Math.max(0, Math.min(...rs.map(r => r.x)) - M) : 0, cy = rs.length ? Math.max(0, Math.min(...rs.map(r => r.y)) - M) : 0;
      const cw = rs.length ? Math.min(W, Math.max(...rs.map(r => r.x + r.w)) + M) - cx : W, ch = rs.length ? Math.min(IH, Math.max(...rs.map(r => r.y + r.h)) + M) - cy : IH;
      c.width = cw * 2; c.height = ch * 2; g.scale(2, 2); g.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch); g.translate(-cx, -cy);
      img.width = Math.min(720, Math.round(cw * 1.25));
      g.font = 'bold 11px -apple-system, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
      for (const a of annotations(st).filter(a => a.target && boxes[a.target])) {
        const p = px(boxes[a.target]);
        const side = a.cat === 'dev' ? 'left' : a.focus ? 'right' : 'corner';
        const i = used[a.target + side] = (used[a.target + side] ?? -1) + 1;
        const txt = String(a.focus || a.stamp || a.num), w = Math.max(20, g.measureText(txt).width + 10), h = 18;
        const container = USAGES.some(u => u.in === a.target);
        let x, y;
        if (side === 'left' && container) { x = p.x - 10; y = p.y - 12; }
        else if (side === 'left') { x = p.x - w - 4 - i * (w + 2); y = p.y + p.h / 2 - h / 2; }
        else if (side === 'right') { x = p.x + p.w + 6; y = p.y + p.h / 2 - h / 2; }
        else { x = p.x + p.w - w + 6 - i * (w + 2); y = p.y - 12; }
        if (a.cat === 'dev') { g.strokeStyle = PIN_COLOR.dev; g.setLineDash([3, 3]); g.strokeRect(p.x + .5, p.y + .5, p.w, p.h); g.setLineDash([]); }
        g.fillStyle = PIN_COLOR[a.cat]; g.beginPath(); g.roundRect(x, y, w, h, a.focus ? 9 : 4); g.fill();
        g.fillStyle = '#fff'; g.fillText(txt, x + w / 2, y + h / 2 + .5);
      }
      img.src = c.toDataURL('image/png');
      dl.insertAdjacentHTML('beforeend', ` <a href="${img.src}" download="${esc(H.feature.key)}.${esc(st)}.${CF_WIDTH}.png">${esc(st)}.png</a>`);
    };
    src.src = D.shots[key];
  });
}

// The flow as a Mermaid state diagram: one node per state, reached from the start by its trigger or by
// the When of its acceptance criterion; missing and Extra states are marked. Screen-to-screen flow goes between.
function flowMermaid() {
  const id = n => 's_' + n.replace(/[^a-z0-9]/gi, '_');
  const clean = t => String(t).replace(/["`:;#{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 48);
  const lines = ['stateDiagram-v2', '  direction LR'];
  for (const st of STATES) {
    const tag = st.missing ? ' (missing)' : st.unreachable ? ' (unreachable)' : '';
    lines.push(`  state "${clean(st.name)}${tag}${st.kind === 'extra' ? ' · Extra' : ''}" as ${id(st.name)}`);
    const ac = ACCEPT.find(a => a.state === st.name);
    const how = st.trigger || ac?.when || (st.name === 'default' ? 'the screen opens' : st.missing ? 'not in the Prototype' : '');
    lines.push(`  [*] --> ${id(st.name)}${how ? ` : ${clean(how)}` : ''}`);
  }
  for (const f of H.flow) lines.push(`  ${id(f.from)} --> ${id(f.to)} : ${clean(f.trigger)}`);
  const miss = STATES.filter(st => st.missing || st.unreachable).map(st => id(st.name));
  if (miss.length) lines.push('  classDef gap stroke-dasharray:4 3,stroke:#b45309', `  class ${miss.join(',')} gap`);
  return lines.join('\n');
}
let mermaidLib;
async function drawMermaid() {
  const boxes = [...document.querySelectorAll('[data-mermaid]')];
  if (!boxes.length) return;
  try {
    mermaidLib ||= (await import('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs')).default;
    mermaidLib.initialize({ startOnLoad: false, htmlLabels: false, flowchart: { htmlLabels: false }, theme: 'neutral', securityLevel: 'strict' });
  } catch { boxes.forEach(b => (b.innerHTML = '<p class="x-none"><i>Mermaid could not load (offline?); the source is below.</i></p>')); return; }
  for (const [i, b] of boxes.entries()) {
    const { svg } = await mermaidLib.render(`x-mmd-${Date.now()}-${i}`, b.dataset.mermaid);
    if (!PLAIN()) { b.innerHTML = svg; continue; }
    // A paste keeps images, not inline SVG: draw it to a PNG.
    const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    const vb = (el.getAttribute('viewBox') || '0 0 800 300').split(/\s+/).map(Number);
    el.setAttribute('width', vb[2]); el.setAttribute('height', vb[3]);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = vb[2] * 2; c.height = vb[3] * 2;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      try { b.innerHTML = `<p><img alt="Flow" width="${Math.min(720, vb[2])}" src="${c.toDataURL('image/png')}"></p>`; }
      catch { b.innerHTML = svg; }
      document.getElementById('x-cfdl')?.insertAdjacentHTML('beforeend', ` <a href="${b.querySelector('img')?.src || ''}" download="${esc(H.feature.key)}.flow.png">flow.png</a>`);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el));
  }
}

// ---------- variants ----------
const SECTIONS = [['cover', 'Overview'], ['changes', 'Changes'], ['acceptance', 'Acceptance'], ['screen', `Screen ${S.name}`], ['sec-dev', 'Development'], ['sec-int', 'Interaction'], ['sec-a11y', 'Accessibility'], ['sec-content', 'Content'], ['questions', 'Questions']];
function renderDoc() {
  return `<div class="x-doc"><nav class="x-toc"><p class="x-eyebrow">On this page</p>${SECTIONS.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>
<main class="x-main">${secCover()}${secChanges()}${secAcceptance()}${secScreen(false)}${secDev()}${secInteraction()}${secA11y()}${secContent()}${secQuestions()}</main></div>`;
}
const PANES = { overview: ['Overview', () => secCover() + secAcceptance()], changes: ['Changes', secChanges], questions: ['Questions', secQuestions], 'sec-dev': ['Development', secDev], 'sec-int': ['Interaction', secInteraction], 'sec-a11y': ['Accessibility', secA11y], 'sec-content': ['Content', secContent] };
function inspector() {
  if (ui.pane.startsWith('usage:')) return usageDetail(ui.pane.slice(6));
  if (ui.pane.startsWith('ann:')) {
    const a = annotations(ui.state).find(x => x.num === ui.pane.slice(4));
    if (a) return `<div class="x-detail"><p class="x-eyebrow"><span class="x-dot x-${a.cat}"></span>${CATS.find(c => c.key === a.cat).name} · ${a.num}</p><h2>${esc(a.title)} ${a.mock ? mock : ''}</h2>${a.body}${a.usage ? `<p><button type="button" class="x-link" data-pane="usage:${a.usage}">Open ${esc(label(U[a.usage]))} →</button></p>` : ''}</div>`;
  }
  return (PANES[ui.pane] || PANES.overview)[1]();
}
function renderInspect() {
  const tree = S.regions.map(r => `<li><span class="x-dim">${r.landmark ? `&lt;${r.landmark}&gt; ` : ''}region ${esc(r.id)}</span><ul>${r.usages.map(u => `<li><button type="button" class="x-node${ui.pane === 'usage:' + u.id ? ' on' : ''}${visibleIn(u, ui.state) ? '' : ' x-off'}" data-pane="usage:${u.id}">${u.in ? '<span class="x-indent"></span>' : ''}${esc(label(u))}</button></li>`).join('')}</ul></li>`).join('');
  return `<div class="x-ins">
<header class="x-bar"><b>${esc(H.feature.name)}</b><span class="x-status-mini ${H.status}">r${H.revision} · ${H.status === 'approved' ? 'signed off' : 'pending sign-off'}</span><span class="x-dim">${esc(H.feature.goal)}</span></header>
<nav class="x-left"><p class="x-eyebrow">Handoff</p>${Object.entries(PANES).slice(0, 3).map(([k, [t]]) => `<button type="button" class="x-node${ui.pane === k ? ' on' : ''}" data-pane="${k}">${t}</button>`).join('')}
<p class="x-eyebrow">Screen ${esc(S.name)} · ${USAGES.length} Usages</p><ul class="x-layers">${tree}</ul>
<p class="x-eyebrow">By category</p>${Object.entries(PANES).slice(3).map(([k, [t]]) => `<button type="button" class="x-node${ui.pane === k ? ' on' : ''}" data-pane="${k}"><span class="x-dot x-${k.slice(4) === 'content' ? 'content' : k.slice(4)}"></span>${t}</button>`).join('')}</nav>
<div class="x-center"><div id="x-canvas">${canvas()}</div></div>
<aside class="x-right" id="x-insp">${inspector()}</aside></div>`;
}

// ---------- wiring ----------
const app = document.getElementById('app');
function applyMode(root = document) {
  root.querySelectorAll('[data-mode-root]').forEach(el => { el.classList.remove('mode-light', 'dark'); el.classList.add(ui.mode === 'dark' ? 'dark' : 'mode-light'); });
}
function applySamples() {
  document.querySelectorAll('[data-sample-for]').forEach(box => {
    const l = MOCK.limits[box.dataset.sampleFor];
    const el = box.querySelector('input, textarea');
    if (el) el.value = ui.sample === 'prototype' ? '' : l[ui.sample];
  });
}
function render() {
  app.innerHTML = (ui.variant === 'doc' ? renderDoc() : ui.variant === 'confluence' ? renderConfluence() : renderInspect()) + switcher();
  drawMermaid();
  if (ui.variant === 'confluence') return burnPins();
  applyMode(); applySamples();
}
function rerenderScreen() {
  const c = document.getElementById('x-canvas'); if (c) c.innerHTML = canvas();
  const a = document.getElementById('x-anns'); if (a) a.innerHTML = annList(ui.state, false);
  if (ui.variant === 'inspect') { const i = document.getElementById('x-insp'); i.innerHTML = inspector(); drawMermaid(); document.querySelectorAll('.x-left .x-node').forEach(n => { n.classList.toggle('on', n.dataset.pane === ui.pane); n.classList.toggle('x-off', n.dataset.pane.startsWith('usage:') && !visibleIn(U[n.dataset.pane.slice(6)], ui.state)); }); }
  applyMode(); applySamples();
}
function switcher() {
  const v = VARIANTS;
  return `<div class="x-switch" role="group" aria-label="Prototype variant"><span>PROTOTYPE</span>${v.map(([k, t]) => `<button type="button" class="${ui.variant === k ? 'on' : ''}" data-variant="${k}">${t}</button>`).join('')}<span class="x-dim">← →</span></div>`;
}
function setVariant(k) { ui.variant = k; try { const u = new URL(location); u.searchParams.set('variant', k); history.replaceState(null, '', u); } catch {} render(); window.scrollTo(0, 0); }
app.addEventListener('click', e => {
  const t = e.target.closest('button, a, .x-ann, .x-box');
  if (!t) return;
  const d = t.dataset;
  if (d.copy !== undefined) { navigator.clipboard?.writeText(d.copy); t.textContent = 'copied'; setTimeout(() => (t.textContent = 'copy'), 900); return; }
  if (d.variant) return setVariant(d.variant);
  if (d.cfselect !== undefined) { const r = document.createRange(); r.selectNodeContents(document.getElementById('x-cf')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); t.textContent = 'Selected: press ⌘C'; return; }
  if (d.state) { ui.state = d.state; ui.sel = null; if (ui.pane.startsWith('ann:')) ui.pane = 'overview'; return rerenderScreen(); }
  if (d.width) { ui.width = d.width; return rerenderScreen(); }
  if (d.mode) { ui.mode = d.mode; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === ui.mode)); return applyMode(); }
  if (d.sample) { ui.sample = d.sample; document.querySelectorAll('[data-sample]').forEach(b => b.classList.toggle('on', b.dataset.sample === ui.sample)); return applySamples(); }
  if (d.ann) {
    ui.sel = ui.sel === d.ann ? null : d.ann;
    if (ui.variant === 'inspect') ui.pane = ui.sel ? 'ann:' + ui.sel : 'overview';
    rerenderScreen();
    const li = document.querySelector(`.x-ann[data-ann="${ui.sel}"]`); if (li && t.classList.contains('x-pin')) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (d.usage) { ui.pane = 'usage:' + d.usage; ui.selUsage = d.usage; if (ui.variant === 'inspect') return rerenderScreen(); const card = document.getElementById('usage-' + d.usage); card?.scrollIntoView({ behavior: 'smooth', block: 'center' }); card?.classList.add('flash'); setTimeout(() => card?.classList.remove('flash'), 1200); return; }
  if (d.pane) { ui.pane = d.pane; ui.selUsage = d.pane.startsWith('usage:') ? d.pane.slice(6) : null; ui.sel = null; return rerenderScreen(); }
  if (d.q && ui.variant === 'inspect') { e.preventDefault(); ui.pane = 'questions'; rerenderScreen(); document.getElementById(d.q)?.scrollIntoView({ block: 'center' }); }
});
app.addEventListener('change', e => { const l = e.target.dataset.layer; if (l) { ui.layers[l] = e.target.checked; rerenderScreen(); } });
document.addEventListener('keydown', e => { if (e.target.closest('input, textarea, select')) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const i = VARIANTS.findIndex(([k]) => k === ui.variant); setVariant(VARIANTS[(i + (e.key === 'ArrowLeft' ? VARIANTS.length - 1 : 1)) % VARIANTS.length][0]); } });

const css = `
:root { --x-bg:#ffffff; --x-fg:#18181b; --x-dim:#71717a; --x-line:#e4e4e7; --x-soft:#f4f4f5; --x-panel:#fafafa;
  --x-dev:#2563eb; --x-int:#9333ea; --x-a11y:#15803d; --x-content:#c2410c; --x-warn:#b45309; --x-ok:#15803d; --x-mock:#a16207; --x-mockbg:#fef9c3; }
@media (prefers-color-scheme: dark) { :root { --x-bg:#0b0b0d; --x-fg:#f4f4f5; --x-dim:#a1a1aa; --x-line:#27272a; --x-soft:#18181b; --x-panel:#111113;
  --x-dev:#60a5fa; --x-int:#c084fc; --x-a11y:#4ade80; --x-content:#fb923c; --x-warn:#fbbf24; --x-ok:#4ade80; --x-mock:#fde68a; --x-mockbg:#422006; } }
body.x-body { margin:0; background:var(--x-bg); color:var(--x-fg); font:14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
#app code, #app pre { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size:12px; }
#app code { background:var(--x-soft); padding:1px 4px; border-radius:4px; overflow-wrap:anywhere; }
#app h1 { font-size:32px; font-weight:650; letter-spacing:-.02em; line-height:1.15; }
#app h2 { font-size:20px; font-weight:650; margin:0 0 8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#app h3 { font-size:15px; font-weight:650; margin:24px 0 8px; }
#app h4 { font-size:13px; font-weight:650; margin:12px 0 6px; display:flex; align-items:center; gap:6px; }
#app p { margin:4px 0; }
#app a { color:inherit; }
.x-dim { color:var(--x-dim); font-size:12px; }
.x-eyebrow { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--x-dim); margin:16px 0 6px !important; display:flex; gap:6px; align-items:center; }
.x-mock { display:inline-block; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; padding:0 5px; border-radius:4px; color:var(--x-mock); background:var(--x-mockbg); vertical-align:middle; }
.x-tag { display:inline-block; font-size:11px; padding:0 6px; border-radius:999px; border:1px solid var(--x-line); background:var(--x-soft); }
.x-tag.std { opacity:.8; }
.x-flag { display:inline-block; font-size:11px; padding:0 6px; border-radius:999px; background:#fef3c7; color:#92400e; white-space:nowrap; }
@media (prefers-color-scheme: dark) { .x-flag { background:#451a03; color:#fcd34d; } }
.x-q { font-size:11px; padding:0 6px; border-radius:999px; border:1px solid var(--x-line); text-decoration:none; white-space:nowrap; }
.x-q.open { border-color:var(--x-warn); color:var(--x-warn); }
.x-dot { display:inline-block; width:10px; height:10px; border-radius:50%; flex:none; }
.x-dot.x-dev, .x-num.x-dev, .x-pin.x-dev { background:var(--x-dev); } .x-dot.x-int, .x-num.x-int, .x-pin.x-int { background:var(--x-int); }
.x-dot.x-a11y, .x-num.x-a11y, .x-pin.x-a11y { background:var(--x-a11y); } .x-dot.x-content, .x-num.x-content, .x-pin.x-content { background:var(--x-content); }
.x-tw { overflow-x:auto; margin:6px 0 12px; }
.x-t { border-collapse:collapse; width:100%; font-size:13px; }
.x-t th { text-align:left; font-weight:600; color:var(--x-dim); font-size:12px; border-bottom:1px solid var(--x-line); padding:6px 8px; white-space:nowrap; }
.x-t td { border-bottom:1px solid var(--x-line); padding:6px 8px; vertical-align:top; }
.x-copy, .x-link { font-size:11px; padding:0 6px; border:1px solid var(--x-line); border-radius:4px; background:var(--x-bg); color:var(--x-fg); cursor:pointer; }
.x-link { font-size:13px; padding:4px 10px; }
.x-sw { display:inline-block; width:14px; height:14px; border-radius:3px; vertical-align:middle; margin-right:4px; border:1px solid var(--x-line); }
.x-op { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:4px; font-weight:700; }
.x-opadd { background:#dcfce7; color:#166534; } .x-opchg { background:#dbeafe; color:#1e40af; } .x-opdel { background:#fee2e2; color:#991b1b; }
/* controls */
.x-controls { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
.x-ctl { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
.x-lbl { font-size:12px; color:var(--x-dim); min-width:112px; display:inline-flex; gap:4px; align-items:center; }
.x-seg { font-size:12px; padding:3px 10px; border:1px solid var(--x-line); border-radius:6px; background:var(--x-bg); color:var(--x-fg); cursor:pointer; }
.x-seg.on { background:var(--x-fg); color:var(--x-bg); border-color:var(--x-fg); }
.x-seg.on .x-dim { color:inherit; opacity:.7; }
.x-chip { font-size:12px; padding:3px 10px 3px 6px; border:1px solid var(--x-line); border-radius:999px; cursor:pointer; display:inline-flex; gap:6px; align-items:center; }
.x-chip input { accent-color: currentColor; }
.x-chip.x-dev { color:var(--x-dev); } .x-chip.x-int { color:var(--x-int); } .x-chip.x-a11y { color:var(--x-a11y); } .x-chip.x-content { color:var(--x-content); }
/* canvas */
.x-stage { position:relative; width:100%; max-width:820px; border:1px solid var(--x-line); border-radius:8px; overflow:hidden; background:var(--x-soft); }
.x-stage img { width:100%; height:100%; display:block; }
.x-none { color:var(--x-dim); font-style:italic; }
.x-cfbar { position:sticky; top:0; z-index:5; display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; padding:10px 16px; background:var(--x-soft); border-bottom:1px solid var(--x-line); font-size:13px; color:var(--x-dim); }
.x-cfbar a { color:var(--x-dev); }
.x-cfsel { padding:6px 12px; border-radius:4px; background:#0c66e4; color:#fff; font-weight:600; cursor:pointer; }
.x-cf { max-width:760px; margin:0 auto; padding:24px 16px 96px; font:14px/1.6 -apple-system, 'Segoe UI', system-ui, sans-serif; color:#172b4d; background:#fff; }
.x-cf h1 { font-size:28px; line-height:1.2; margin:8px 0 12px; } .x-cf h2 { font-size:20px; margin:32px 0 8px; } .x-cf h3 { font-size:16px; margin:24px 0 8px; } .x-cf h4 { font-size:14px; margin:16px 0 6px; }
.x-cf table { border-collapse:collapse; width:100%; margin:8px 0 16px; font-size:13px; } .x-cf th, .x-cf td { border:1px solid #dfe1e6; padding:6px 8px; text-align:left; vertical-align:top; } .x-cf th { background:#f4f5f7; }
.x-cf td p { margin:0 0 4px; } .x-cf code { font-size:12px; background:#f4f5f7; padding:1px 4px; border-radius:3px; } .x-cf pre { background:#f4f5f7; padding:8px; overflow:auto; font-size:12px; }
.x-mermaid svg { max-width:100%; height:auto; }
.x-cf img { max-width:100%; height:auto; border:1px solid #dfe1e6; }
.x-stage.x-empty { aspect-ratio:768/500; display:grid; place-items:center; padding:24px; text-align:center; color:var(--x-dim);
  background:repeating-linear-gradient(45deg, var(--x-soft) 0 8px, var(--x-bg) 8px 16px); }
.x-box { position:absolute; border:1px dashed color-mix(in srgb, var(--x-dev) 45%, transparent); border-radius:3px; cursor:pointer; }
.x-box span { display:none; position:absolute; right:-1px; top:-18px; font-size:10px; line-height:16px; padding:0 4px; background:var(--x-dev); color:#fff; border-radius:3px 3px 0 0; white-space:nowrap; }
.x-box:hover, .x-box.on { border-style:solid; border-color:var(--x-dev); background:color-mix(in srgb, var(--x-dev) 8%, transparent); }
.x-box:hover span, .x-box.on span { display:block; }
.x-pin { position:absolute; z-index:2; min-width:20px; height:20px; padding:0 4px; border-radius:10px; color:#fff; font-size:10px; font-weight:700; line-height:20px; text-align:center; cursor:pointer; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.x-pin.x-focus { border-radius:50%; width:22px; height:22px; line-height:18px; font-size:11px; }
.x-pin.x-stamp { border-radius:4px; }
.x-pin.sel, .x-pin:hover { transform:scale(1.25); z-index:3; }
.x-screen { display:grid; grid-template-columns:minmax(0, 1fr) 340px; gap:20px; align-items:start; }
.x-annside { max-height:80vh; overflow:auto; position:sticky; top:12px; }
.x-anns ol { list-style:none; margin:0; padding:0; }
.x-ann { display:flex; gap:8px; padding:6px; border-radius:6px; cursor:pointer; font-size:13px; }
.x-ann:hover { background:var(--x-soft); } .x-ann.sel { background:var(--x-soft); outline:1px solid var(--x-line); }
.x-num { flex:none; min-width:22px; height:20px; padding:0 4px; border-radius:10px; color:#fff; font-size:10px; font-weight:700; display:inline-grid; place-items:center; }
.x-annbody { margin-top:2px; font-size:12px; }
.x-annbody .x-t { font-size:12px; }
/* doc */
.x-doc { display:grid; grid-template-columns:180px minmax(0, 1fr); gap:32px; max-width:1320px; margin:0 auto; padding:0 24px 96px; }
.x-toc { position:sticky; top:0; align-self:start; padding-top:24px; display:flex; flex-direction:column; gap:2px; }
.x-toc a { text-decoration:none; font-size:13px; padding:3px 8px; border-radius:4px; color:var(--x-dim); } .x-toc a:hover { background:var(--x-soft); color:var(--x-fg); }
.x-sec { padding:32px 0; border-bottom:1px solid var(--x-line); scroll-margin-top:8px; }
.x-cover { display:flex; flex-direction:column; gap:12px; }
.x-goal { font-size:17px; color:var(--x-dim); }
.x-status { border-left:4px solid var(--x-warn); background:var(--x-panel); padding:10px 14px; border-radius:0 6px 6px 0; }
.x-status.approved { border-color:var(--x-ok); }
.x-kpis { display:flex; flex-wrap:wrap; gap:8px; }
.x-kpis a { text-decoration:none; border:1px solid var(--x-line); border-radius:8px; padding:8px 14px; font-size:12px; color:var(--x-dim); }
.x-kpis b { display:block; font-size:22px; color:var(--x-fg); }
.x-needs { font-size:13px; line-height:2; }
.x-ucards { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px; }
.x-ucard { border:1px solid var(--x-line); border-radius:8px; padding:12px; min-width:0; font-size:13px; transition:box-shadow .3s; }
.x-ucard.flash { box-shadow:0 0 0 3px var(--x-dev); }
.x-ucard header h4 { margin:0; } .x-ucard header p { font-size:12px; color:var(--x-dim); }
.x-live { padding:12px; margin:8px 0; border-radius:6px; background:var(--x-soft); overflow:auto; }
.x-live .specimen, .x-live .states-row { background:var(--background); color:var(--foreground); padding:12px; border-radius:6px; }
.x-live .states-row { margin-top:8px; display:flex; gap:12px; flex-wrap:wrap; } .x-live figcaption { font-size:11px; color:var(--x-dim); margin-bottom:4px; }
.x-snip { position:relative; } .x-snip pre { background:var(--x-soft); padding:8px; border-radius:6px; overflow:auto; white-space:pre; } .x-snip .x-copy { position:absolute; top:6px; right:6px; }
.x-samples { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; margin-top:8px; }
.x-samples figure { margin:0; } .x-samples figcaption { font-size:12px; color:var(--x-dim); }
.x-sample { display:inline-block; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }
.x-focus { display:flex; flex-wrap:wrap; gap:24px; }
.x-tabs { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:4px; } .x-tabs li { display:flex; gap:8px; align-items:center; }
.x-tree, .x-tree ul { list-style:none; padding-left:16px; margin:4px 0; } .x-tree li { margin:4px 0; }
.x-qs { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
.x-qi { border:1px solid var(--x-line); border-radius:8px; padding:10px 12px; scroll-margin-top:60px; } .x-qi.open { border-left:4px solid var(--x-warn); }
.x-qi:target { box-shadow:0 0 0 3px var(--x-warn); }
.x-ans { color:var(--x-ok); }
/* inspect */
.x-ins { display:grid; grid-template-columns:240px minmax(0, 1fr) 380px; grid-template-rows:auto 1fr; height:100vh; }
.x-bar { grid-column:1 / -1; display:flex; gap:12px; align-items:center; padding:10px 16px; border-bottom:1px solid var(--x-line); white-space:nowrap; overflow:hidden; }
.x-status-mini { font-size:12px; padding:1px 8px; border-radius:999px; border:1px solid var(--x-warn); color:var(--x-warn); } .x-status-mini.approved { border-color:var(--x-ok); color:var(--x-ok); }
.x-left { border-right:1px solid var(--x-line); overflow:auto; padding:4px 8px 80px; background:var(--x-panel); }
.x-node { display:flex; gap:6px; align-items:center; width:100%; text-align:left; font-size:13px; padding:3px 8px; border-radius:4px; background:none; color:var(--x-fg); cursor:pointer; }
.x-layers .x-node { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.x-node:hover { background:var(--x-soft); } .x-node.on { background:var(--x-fg); color:var(--x-bg); } .x-node.x-off { opacity:.45; }
.x-indent { display:inline-block; width:10px; }
.x-layers, .x-layers ul { list-style:none; margin:0; padding:0 0 0 4px; } .x-layers > li > span { display:block; padding:6px 8px 2px; }
.x-center { overflow:auto; padding:16px 24px 80px; background:var(--x-soft); }
.x-center .x-stage { margin:0 auto; background:var(--x-bg); }
.x-right { border-left:1px solid var(--x-line); overflow:auto; padding:8px 16px 80px; }
.x-right .x-sec { padding:12px 0; } .x-right .x-cover h1 { font-size:24px; } .x-right .x-ucards { grid-template-columns:1fr; } .x-right .x-screen { display:block; }
.x-detail h2 { font-size:18px; } .x-detail h3 { display:flex; gap:6px; align-items:center; }
/* prototype switcher */
.x-switch { position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:10; display:flex; gap:4px; align-items:center; padding:6px 8px; border-radius:999px; background:#18181b; color:#fff; font-size:12px; box-shadow:0 4px 16px rgba(0,0,0,.3); }
.x-switch > span:first-child { font-weight:700; letter-spacing:.06em; padding:0 6px; color:#fde68a; }
.x-switch button { color:#fff; background:none; padding:4px 12px; border-radius:999px; cursor:pointer; } .x-switch button.on { background:#fff; color:#18181b; }
.x-switch .x-dim { color:#a1a1aa; padding:0 6px; }
@media (max-width: 1100px) { .x-screen { grid-template-columns:1fr; } .x-annside { position:static; max-height:none; } .x-ins { grid-template-columns:200px minmax(0,1fr); } .x-right { grid-column:1 / -1; border-left:0; border-top:1px solid var(--x-line); } .x-ins { height:auto; } }
@media (max-width: 720px) { .x-doc { grid-template-columns:1fr; padding:0 16px 96px; } .x-toc { display:none; } .x-ins { display:block; } .x-left { max-height:40vh; } }
`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
render();
})();
