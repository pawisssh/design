// To-design fixed builder core for components (MCP-only; runs inside use_figma): the base slice (#31), and the
// component sets (#32) next. Foundations and icons run on builder-core.js: one core holding every slice would
// not fit use_figma's 50,000-char code limit next to the foundations plan. Never edited per run: a run changes
// only the build plan and the ledger state that the packager embeds next to it.
// Everything lives inside buildComponentSets, because the integrity gate hashes buildComponentSets.toString().
// Keep this file ASCII.
async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK) {
  const t0 = Date.now();

  // ---- integrity gate (#17): verify every CHECK field before the first change ----
  const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const mismatch = (field, expected, got) => ({ error: 'package-mismatch', field, expected, got });
  if (!CHECK || typeof PLAN_SRC !== 'string' || typeof STATE_SRC !== 'string') return mismatch('check', 'CHECK, PLAN_SRC and STATE_SRC', typeof CHECK);
  if (PLAN_SRC.length !== CHECK.planLen) return mismatch('planLen', CHECK.planLen, PLAN_SRC.length);
  if (fnv(PLAN_SRC) !== CHECK.plan) return mismatch('plan', CHECK.plan, fnv(PLAN_SRC));
  if (fnv(STATE_SRC) !== CHECK.state) return mismatch('state', CHECK.state, fnv(STATE_SRC));
  const coreHash = fnv(buildComponentSets.toString());
  if (coreHash !== CHECK.core) return mismatch('core', CHECK.core, coreHash);
  let plan, state;
  try { plan = JSON.parse(PLAN_SRC); state = JSON.parse(STATE_SRC); } catch (e) { return mismatch('json', 'valid JSON', String(e && e.message)); }
  const entries = plan.slice === 'base' ? 1 : ((plan.selection && plan.selection.entries) || []).length;
  if (entries !== CHECK.entries) return mismatch('entries', CHECK.entries, entries);
  if (typeof figma.fileKey === 'string' && figma.fileKey !== plan.fileKey) return { error: 'wrong-file', expected: plan.fileKey, got: figma.fileKey };

  const slices = { base: baseSlice };
  if (!slices[plan.slice]) return { error: 'unknown-slice', slice: plan.slice };

  const result = await slices[plan.slice]();
  result.ms = Date.now() - t0;
  result.outputBytes = JSON.stringify(result).length;
  return result;

  // ---- shared helpers ----
  function near(a, b, eps) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps; }
  function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1, 7), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha == null ? 1 : alpha };
  }

  // ---- base slice: one family's Base Component, from the spec build-plan resolved from the Contract (#31) ----
  // The spec names tokens; state maps them to ids. A field is written only when its read value differs, so a
  // rerun writes nothing. A layer tree unlike the anatomy is rebuilt inside the same component (its id stays).
  // plan.options.readOnly reads back without writing. The readback is in ids ({var}, {style}, component ids);
  // base-loop.mjs names them through the ledger. Ownership as in icons: the ledger's bases[family] records
  // the page and the component; an unrecorded one with the target name is a conflict unless adopt.
  async function baseSlice() {
    const B = plan.base;
    const opts = plan.options || {};
    const all = state.bases || {};
    const prev = all[plan.family] || null;
    const conflicts = [];
    const conflict = (kind, name, reason, id) => conflicts.push(id ? { kind, name, reason, id } : { kind, name, reason });
    const report = { slice: 'base', fileKey: plan.fileKey, family: plan.family };
    const AXIS = { row: 'HORIZONTAL', column: 'VERTICAL' };
    const ALIGN = { start: 'MIN', center: 'CENTER', end: 'MAX', 'space-between': 'SPACE_BETWEEN' };
    const NUM = { paddingTop: 'paddingTop', paddingRight: 'paddingRight', paddingBottom: 'paddingBottom', paddingLeft: 'paddingLeft', gap: 'itemSpacing',
      minWidth: 'minWidth', maxWidth: 'maxWidth', minHeight: 'minHeight', maxHeight: 'maxHeight', strokeWeight: 'strokeWeight', opacity: 'opacity' };
    const RADII = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
    const EFFECT = { color: 'color', spread: 'spread', blur: 'radius', x: 'offsetX', y: 'offsetY' };
    const ORDER = ['direction', 'alignMain', 'alignCross', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'minWidth', 'maxWidth',
      'minHeight', 'maxHeight', 'width', 'height', 'radius', 'strokeWeight', 'strokeAlign', 'textStyle', 'textResize', 'fill', 'stroke', 'effects', 'opacity'];
    const keyOf = (o, v) => Object.keys(o).find(k => o[k] === v);
    const isTok = v => !!v && typeof v === 'object' && 'token' in v;
    // Instance children that are hidden must still be found and read.
    figma.skipInvisibleInstanceChildren = false;

    // -- readers: one value per Contract field, in ids; used both to skip unchanged writes and for the readback --
    const hex = c => '#' + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    const val = (n, prop) => { const b = n.boundVariables && n.boundVariables[prop]; return b ? { var: b.id } : { raw: n[prop] == null ? null : n[prop] }; };
    const effVal = (e, f, raw) => (e.boundVariables && e.boundVariables[f] ? { var: e.boundVariables[f].id } : { raw });
    function paintOf(list) {
      if (list === figma.mixed) return 'mixed';
      const vis = list.filter(p => p.visible !== false);
      if (!vis.length) return 'none';
      const p = vis[0];
      if (p.boundVariables && p.boundVariables.color) return { var: p.boundVariables.color.id };
      return { raw: p.type === 'SOLID' ? hex(p.color) : p.type };
    }
    function effectsOf(list) {
      return list.map(e => {
        const o = { type: e.type.toLowerCase().replace('_', '-'), color: effVal(e, 'color', e.color ? hex(e.color) : null), spread: effVal(e, 'spread', e.spread || 0),
          blur: effVal(e, 'radius', e.radius), x: effVal(e, 'offsetX', e.offset.x), y: effVal(e, 'offsetY', e.offset.y) };
        if (e.visible === false) o.visible = false;
        return o;
      });
    }
    function readField(n, f) {
      if (f === 'direction') return keyOf(AXIS, n.layoutMode) || 'none';
      if (f === 'width' || f === 'height') { const s = f === 'width' ? n.layoutSizingHorizontal : n.layoutSizingVertical; return s === 'FIXED' ? val(n, f) : String(s).toLowerCase(); }
      if (f === 'alignMain') return keyOf(ALIGN, n.primaryAxisAlignItems);
      if (f === 'alignCross') return keyOf(ALIGN, n.counterAxisAlignItems);
      if (NUM[f]) return val(n, NUM[f]);
      if (f === 'radius') return val(n, 'topLeftRadius');
      if (f === 'strokeAlign') return String(n.strokeAlign).toLowerCase();
      if (f === 'textStyle') return n.textStyleId === figma.mixed ? 'mixed' : n.textStyleId ? { style: n.textStyleId } : null;
      if (f === 'textResize') return String(n.textAutoResize).toLowerCase().replace(/_/g, '-');
      if (f === 'fill') return paintOf(n.fills);
      if (f === 'stroke') return paintOf(n.strokes);
      if (f === 'effects') return effectsOf(n.effects);
      return undefined;
    }
    const metric = m => (m.unit === 'PIXELS' ? m.value : m.unit === 'PERCENT' ? m.value + '%' : m.unit);
    const treeOf = n => { const o = { name: n.name, type: n.type }; if (n.type !== 'INSTANCE' && n.children && n.children.length) o.children = n.children.map(treeOf); return o; };
    const find = name => (name === B.tree.name ? comp : comp.findOne(x => x.name === name));
    const at = path => path.split('/').reduce((n, p, i) => (!n ? null : i === 0 ? find(p) : n.findOne(x => x.name === p)), comp);

    async function readAll() {
      const r = { id: comp.id, name: comp.name, tree: treeOf(comp), layout: {}, paint: {}, visible: {}, text: {}, swap: {}, extras: {}, size: { w: comp.width, h: comp.height } };
      for (const sec of ['layout', 'paint']) {
        for (const name of Object.keys(B[sec])) {
          const n = at(name);
          if (!n) continue;
          const o = r[sec][name] = {};
          for (const f of Object.keys(B[sec][name])) o[f] = readField(n, f);
          // a variable bound to a field the Contract does not set for this node is reported too
          if (sec === 'layout') {
            for (const p of Object.keys(n.boundVariables || {})) {
              const f = keyOf(NUM, p) || (RADII.indexOf(p) !== -1 ? 'radius' : p === 'width' || p === 'height' ? p : null);
              if (f && !(f in o) && !(f in (B.paint[name] || {}))) o[f] = readField(n, f);
            }
          }
        }
      }
      const walk = async (n, root) => {
        if (!root) r.visible[n.name] = n.visible;
        if (n.type === 'TEXT') {
          r.text[n.name] = n.characters;
          r.extras[n.name] = { fontFamily: n.fontName.family, fontStyle: n.fontName.style, fontSize: n.fontSize, lineHeight: metric(n.lineHeight), letterSpacing: metric(n.letterSpacing) };
        }
        if (n.type === 'INSTANCE') { const main = await n.getMainComponentAsync(); r.swap[n.name] = main ? main.id : null; return; }
        for (const c of n.children || []) await walk(c, false);
      };
      await walk(comp, true);
      return r;
    }

    // -- preflight: read only --
    let page = prev && prev.page ? figma.root.children.find(p => p.id === prev.page) || null : null;
    if (!page) {
      const same = figma.root.children.find(p => p.name === plan.page);
      if (same && !opts.adopt) conflict('page', plan.page, 'unowned', same.id);
      else page = same || null;
    }
    if (page) await page.loadAsync();
    let comp = prev && prev.id ? await figma.getNodeByIdAsync(prev.id) : null;
    if (comp && comp.type !== 'COMPONENT') { conflict('base', B.name, 'type-change', comp.id); comp = null; }
    if (!comp && page) {
      const same = page.children.find(n => n.type === 'COMPONENT' && n.name === B.name);
      if (same && !opts.adopt) conflict('base', B.name, 'unowned', same.id);
      else comp = same || null;
    }
    const carry = () => ({ bases: state.bases || null });
    const stop = () => Object.assign(report, { summary: { created: 0, updated: 0, unchanged: 0, conflicts: conflicts.length }, conflicts, ledger: carry() });
    if (opts.readOnly) {
      if (!comp && !conflicts.length) conflict('base', B.name, 'not-built');
      if (conflicts.length) return stop();
      return Object.assign(report, { summary: { created: 0, updated: 0, unchanged: 1, conflicts: 0 }, readback: await readAll(), ledger: carry() });
    }
    const V = {};
    const S = {};
    const I = {};
    const toks = { var: {}, style: {} };
    const scan = (f, v) => { if (Array.isArray(v)) v.forEach(e => Object.keys(e).forEach(k => scan(k, e[k]))); else if (isTok(v)) toks[f === 'textStyle' ? 'style' : 'var'][v.token] = 1; };
    for (const sec of ['layout', 'paint']) {
      for (const name of Object.keys(B[sec])) {
        for (const f of Object.keys(B[sec][name])) { if (ORDER.indexOf(f) === -1) conflict('field', name + '.' + f, 'unsupported'); scan(f, B[sec][name][f]); }
      }
    }
    for (const t of Object.keys(toks.var)) {
      const v = state.variables[t] ? await figma.variables.getVariableByIdAsync(state.variables[t]) : null;
      if (v) V[t] = v; else conflict('variable', t, 'missing');
    }
    for (const t of Object.keys(toks.style)) {
      const s = state.textStyles[t] ? await figma.getStyleByIdAsync(state.textStyles[t]) : null;
      if (s) S[t] = s.id; else conflict('textStyle', t, 'missing');
    }
    for (const name of Object.keys(B.swap)) {
      const id = (state.icons || {})[B.swap[name]];
      const c = id ? await figma.getNodeByIdAsync(id) : null;
      if (c && c.type === 'COMPONENT') I[B.swap[name]] = c; else conflict('icon', B.swap[name], 'missing');
    }
    (function check(s) {
      if (s !== B.tree && ['FRAME', 'TEXT', 'INSTANCE'].indexOf(s.type) === -1) conflict('layer', s.name, 'unsupported-type:' + s.type);
      if (s.type === 'INSTANCE' && !B.swap[s.name]) conflict('layer', s.name, 'no-main-component');
      (s.children || []).forEach(check);
    })(B.tree);
    if (conflicts.length) return stop();

    // -- apply --
    const created = [];
    const updated = {};
    const missing = [];
    const touch = (name, f) => { (updated[name] = updated[name] || []).push(f); };
    if (!page) { page = figma.createPage(); page.name = plan.page; created.push('page'); }
    await figma.setCurrentPageAsync(page);
    for (const font of B.fonts) await figma.loadFontAsync(font);
    if (!comp) { comp = figma.createComponent(); page.appendChild(comp); created.push('component'); }
    else if (!comp.parent || comp.parent.id !== page.id) { page.appendChild(comp); touch(B.tree.name, 'page'); }
    if (comp.name !== B.name) { comp.name = B.name; touch(B.tree.name, 'name'); }

    function make(parent, s) {
      const n = s.type === 'TEXT' ? figma.createText() : s.type === 'INSTANCE' ? I[B.swap[s.name]].createInstance() : figma.createFrame();
      if (s.type === 'FRAME') n.fills = [];
      n.name = s.name;
      parent.appendChild(n);
      if (s.type !== 'INSTANCE') for (const c of s.children || []) make(n, c);
    }
    if (JSON.stringify(treeOf(comp).children || []) !== JSON.stringify(treeOf(B.tree).children || [])) {
      for (const c of comp.children.slice()) c.remove();
      for (const s of B.tree.children || []) make(comp, s);
      created.push('layers');
    }

    // The spec's value in ids, as readField reports it.
    const idOf = (f, v) => {
      if (Array.isArray(v)) return v.map(e => { const o = {}; for (const k of Object.keys(e)) o[k] = idOf(k, e[k]); return o; });
      if (isTok(v)) return f === 'textStyle' ? { style: S[v.token] } : { var: V[v.token].id };
      return v;
    };
    function eq(a, b) {
      if (near(a, b, 1e-3)) return true;
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        return Object.keys(Object.assign({}, a, b)).every(k => eq(a[k], b[k]));
      }
      return a === b;
    }
    function num(n, prop, want) {
      if (isTok(want)) { n.setBoundVariable(prop, V[want.token]); return; }
      if (n.boundVariables && n.boundVariables[prop]) n.setBoundVariable(prop, null);
      if (prop === 'width' || prop === 'height') n.resize(prop === 'width' ? want.raw : n.width, prop === 'height' ? want.raw : n.height);
      else n[prop] = want.raw;
    }
    function paints(want) {
      if (want === 'none') return [];
      if (isTok(want)) return [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[want.token])];
      const c = rgba(want.raw);
      return [{ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }];
    }
    function effect(e) {
      const raw = (v, d) => (v && 'raw' in v && v.raw != null ? v.raw : d);
      let out = { type: e.type.toUpperCase().replace('-', '_'), color: e.color && e.color.raw ? rgba(e.color.raw) : { r: 0, g: 0, b: 0, a: 1 },
        offset: { x: raw(e.x, 0), y: raw(e.y, 0) }, radius: raw(e.blur, 0), spread: raw(e.spread, 0), visible: e.visible !== false, blendMode: 'NORMAL' };
      for (const k of Object.keys(EFFECT)) if (isTok(e[k])) out = figma.variables.setBoundVariableForEffect(out, EFFECT[k], V[e[k].token]);
      return out;
    }
    function writeField(n, f, want) {
      if (f === 'direction') n.layoutMode = AXIS[want] || 'NONE';
      else if (f === 'width' || f === 'height') {
        const k = f === 'width' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
        if (typeof want === 'string') n[k] = want.toUpperCase();
        else { n[k] = 'FIXED'; num(n, f, want); }
      } else if (f === 'alignMain') n.primaryAxisAlignItems = ALIGN[want];
      else if (f === 'alignCross') n.counterAxisAlignItems = ALIGN[want];
      else if (NUM[f]) num(n, NUM[f], want);
      else if (f === 'radius') RADII.forEach(r => num(n, r, want));
      else if (f === 'strokeAlign') n.strokeAlign = want.toUpperCase();
      else if (f === 'textResize') n.textAutoResize = want.toUpperCase().replace(/-/g, '_');
      else if (f === 'fill') n.fills = paints(want);
      else if (f === 'stroke') n.strokes = paints(want);
      else if (f === 'effects') n.effects = want.map(effect);
    }
    async function writeFields(name, n) {
      if (!n) { missing.push(name); return; }
      const L = B.layout[name] || {};
      const P = B.paint[name] || {};
      const fields = Object.keys(L).concat(Object.keys(P)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      for (const f of fields) {
        const want = f in L ? L[f] : P[f];
        if (eq(readField(n, f), idOf(f, want))) continue;
        if (f === 'textStyle') await n.setTextStyleIdAsync(want ? S[want.token] : '');
        else writeField(n, f, want);
        touch(name, f);
      }
    }

    // Top-down, so a parent's auto layout is set before a child fills it; the main component before its overrides.
    const names = [];
    (function walk(s) { names.push(s.name); if (s.type !== 'INSTANCE') (s.children || []).forEach(walk); })(B.tree);
    for (const name of names) {
      const n = find(name);
      if (!n) { missing.push(name); continue; }
      if (B.swap[name]) {
        const main = await n.getMainComponentAsync();
        if (!main || main.id !== I[B.swap[name]].id) { n.swapComponent(I[B.swap[name]]); touch(name, 'mainComponent'); }
      }
      await writeFields(name, n);
      if (name in B.text && n.characters !== B.text[name]) { n.characters = B.text[name]; touch(name, 'characters'); }
      if (name in B.visible && n.visible !== B.visible[name]) { n.visible = B.visible[name]; touch(name, 'visible'); }
    }
    for (const path of Object.keys(B.paint).filter(p => p.indexOf('/') !== -1)) await writeFields(path, at(path));

    const bases = Object.assign({}, all);
    bases[plan.family] = { page: page.id, id: comp.id, key: comp.key, name: comp.name, snapshotId: plan.snapshotId, contentHash: plan.contentHash, documentHash: plan.documentHash, builtAt: plan.at };
    const touched = Object.keys(updated).length;
    return Object.assign(report, {
      summary: { created: created.length, updated: touched, unchanged: touched || created.length ? 0 : 1, missing: missing.length, conflicts: 0 },
      created, updated, missing, conflicts, readback: await readAll(), ledger: { bases },
    });
  }
}
