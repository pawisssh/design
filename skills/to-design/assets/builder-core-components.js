// To-design fixed builder core for components (MCP-only; runs inside use_figma): the base slice (#31) and the
// sets slice (#32). Foundations and icons run on builder-core.js: one core holding every slice would not fit
// use_figma's 50,000-char code limit next to the foundations plan. Never edited per run: a run changes only
// the build plan and the ledger state that the packager embeds next to it.
// Everything lives inside buildComponentSets, because the integrity gate hashes buildComponentSets.toString().
// Keep this file ASCII.
async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK) {
  const t0 = Date.now();

  // ---- integrity gate (#17): verify every CHECK field before the first change ----
  // Kept identical in builder-core.js, except the per-core block (tests/gate-parity.test.mjs).
  // gate begin
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
  // gate per-core begin
  const entries = plan.slice === 'base' ? 1 : ((plan.selection && plan.selection.entries) || []).length;
  // gate per-core end
  if (entries !== CHECK.entries) return mismatch('entries', CHECK.entries, entries);
  if (typeof figma.fileKey === 'string' && figma.fileKey !== plan.fileKey) return { error: 'wrong-file', expected: plan.fileKey, got: figma.fileKey };
  // gate end

  // the field kit's maps (its functions follow the dispatch; these must be set before it runs)
  const V = {}, S = {}, I = {};
  const AXIS = { row: 'HORIZONTAL', column: 'VERTICAL' };
  const ALIGN = { start: 'MIN', center: 'CENTER', end: 'MAX', 'space-between': 'SPACE_BETWEEN' };
  const NUM = { paddingTop: 'paddingTop', paddingRight: 'paddingRight', paddingBottom: 'paddingBottom', paddingLeft: 'paddingLeft', gap: 'itemSpacing',
    minWidth: 'minWidth', maxWidth: 'maxWidth', minHeight: 'minHeight', maxHeight: 'maxHeight', strokeWeight: 'strokeWeight', opacity: 'opacity' };
  const RADII = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
  const EFFECT = { color: 'color', spread: 'spread', blur: 'radius', x: 'offsetX', y: 'offsetY' };
  const ORDER = ['direction', 'alignMain', 'alignCross', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'minWidth', 'maxWidth',
    'minHeight', 'maxHeight', 'width', 'height', 'radius', 'strokeWeight', 'strokeAlign', 'textStyle', 'textResize', 'fill', 'stroke', 'effects', 'opacity'];
  const slices = { base: baseSlice, sets: setsSlice };
  if (!slices[plan.slice]) return { error: 'unknown-slice', slice: plan.slice };
  // Instance children that are hidden must still be found and read.
  figma.skipInvisibleInstanceChildren = false;

  const result = await slices[plan.slice]();
  result.ms = Date.now() - t0;
  result.outputBytes = JSON.stringify(result).length;
  return result;

  // ---- shared field kit: one reader and one writer per Contract field ----
  // A spec is {tree, layout, paint, visible, text, swap}: values name tokens ({token}) that V (variables) and
  // S (text styles) map to Figma objects, and swap names icon keys that I maps to components. A field is
  // written only when its read value differs, so a rerun writes nothing. Readbacks are in ids.
  function near(a, b, eps) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps; }
  function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1, 7), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha == null ? 1 : alpha };
  }
  function keyOf(o, v) { return Object.keys(o).find(k => o[k] === v); }
  function isTok(v) { return !!v && typeof v === 'object' && 'token' in v; }
  function hex(c) { return '#' + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
  function val(n, prop) { const b = n.boundVariables && n.boundVariables[prop]; return b ? { var: b.id } : { raw: n[prop] == null ? null : n[prop] }; }
  function effVal(e, f, raw) { return e.boundVariables && e.boundVariables[f] ? { var: e.boundVariables[f].id } : { raw }; }
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
    if (f === 'width' || f === 'height') {
      const s = f === 'width' ? n.layoutSizingHorizontal : n.layoutSizingVertical;
      if (s !== 'FIXED') return String(s).toLowerCase();
      // A hidden child of an auto layout reports FILL as FIXED; its grow (main axis) or stretch (cross axis) still says fill.
      const dir = !n.visible && n.parent && n.parent.layoutMode;
      if (dir === 'HORIZONTAL' || dir === 'VERTICAL') {
        const main = (f === 'width') === (dir === 'HORIZONTAL');
        if (main ? n.layoutGrow === 1 : n.layoutAlign === 'STRETCH') return 'fill';
      }
      return val(n, f);
    }
    if (f === 'alignMain') return keyOf(ALIGN, n.primaryAxisAlignItems);
    if (f === 'alignCross') return keyOf(ALIGN, n.counterAxisAlignItems);
    if (NUM[f]) return val(n, NUM[f]);
    if (f === 'radius') return val(n, 'topLeftRadius');
    if (f === 'strokeAlign') return String(n.strokeAlign).toLowerCase();
    if (f === 'textStyle') return n.textStyleId === figma.mixed ? 'mixed' : n.textStyleId ? { style: n.textStyleId } : null;
    if (f === 'textResize') return String(n.textAutoResize).toLowerCase().split('_').join('-');
    if (f === 'fill') return paintOf(n.fills);
    if (f === 'stroke') return paintOf(n.strokes);
    if (f === 'effects') return effectsOf(n.effects);
    return undefined;
  }
  function metric(m) { return m.unit === 'PIXELS' ? m.value : m.unit === 'PERCENT' ? m.value + '%' : m.unit; }
  function treeOf(n) { const o = { name: n.name, type: n.type }; if (n.type !== 'INSTANCE' && n.children && n.children.length) o.children = n.children.map(treeOf); return o; }
  function find(spec, comp, name) { return name === spec.tree.name ? comp : comp.findOne(x => x.name === name); }
  function at(spec, comp, path) { return path.split('/').reduce((n, p, i) => (!n ? null : i === 0 ? find(spec, comp, p) : n.findOne(x => x.name === p)), comp); }
  // The tokens and icons specs use, resolved to Figma objects (V, S, I); a missing one is a conflict.
  async function loadRefs(specs, conflict) {
    const toks = { var: {}, style: {} };
    const scan = (f, v) => { if (Array.isArray(v)) v.forEach(e => Object.keys(e).forEach(k => scan(k, e[k]))); else if (isTok(v)) toks[f === 'textStyle' ? 'style' : 'var'][v.token] = 1; };
    const icons = {};
    for (const spec of specs) {
      for (const sec of ['layout', 'paint']) {
        for (const name of Object.keys(spec[sec])) {
          for (const f of Object.keys(spec[sec][name])) { if (ORDER.indexOf(f) === -1) conflict('field', name + '.' + f, 'unsupported'); scan(f, spec[sec][name][f]); }
        }
      }
      for (const name of Object.keys(spec.swap || {})) icons[spec.swap[name]] = 1;
    }
    for (const t of Object.keys(toks.var)) {
      if (V[t]) continue;
      const v = state.variables[t] ? await figma.variables.getVariableByIdAsync(state.variables[t]) : null;
      if (v) V[t] = v; else conflict('variable', t, 'missing');
    }
    for (const t of Object.keys(toks.style)) {
      if (S[t]) continue;
      const s = state.textStyles[t] ? await figma.getStyleByIdAsync(state.textStyles[t]) : null;
      if (s) S[t] = s.id; else conflict('textStyle', t, 'missing');
    }
    for (const k of Object.keys(icons)) {
      if (I[k]) continue;
      const ref = (state.icons || {})[k];
      const id = ref && typeof ref === 'object' ? ref.id : ref;
      const c = id ? await figma.getNodeByIdAsync(id) : null;
      if (c && c.type === 'COMPONENT') I[k] = c; else conflict('icon', k, 'missing');
    }
  }
  function checkTree(spec, conflict) {
    (function check(s) {
      if (s !== spec.tree && ['FRAME', 'TEXT', 'INSTANCE'].indexOf(s.type) === -1) conflict('layer', s.name, 'unsupported-type:' + s.type);
      if (s.type === 'INSTANCE' && !spec.swap[s.name]) conflict('layer', s.name, 'no-main-component');
      (s.children || []).forEach(check);
    })(spec.tree);
  }
  // The spec's value in ids, as readField reports it.
  function idOf(f, v) {
    if (Array.isArray(v)) return v.map(e => { const o = {}; for (const k of Object.keys(e)) o[k] = idOf(k, e[k]); return o; });
    if (isTok(v)) return f === 'textStyle' ? { style: S[v.token] } : { var: V[v.token].id };
    return v;
  }
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
    else if (f === 'textResize') n.textAutoResize = want.toUpperCase().split('-').join('_');
    else if (f === 'fill') n.fills = paints(want);
    else if (f === 'stroke') n.strokes = paints(want);
    else if (f === 'effects') n.effects = want.map(effect);
  }
  async function writeFields(spec, name, n, touch, missing) {
    if (!n) { missing.push(name); return; }
    const L = spec.layout[name] || {};
    const P = spec.paint[name] || {};
    const fields = Object.keys(L).concat(Object.keys(P)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    for (const f of fields) {
      const want = f in L ? L[f] : P[f];
      if (eq(readField(n, f), idOf(f, want))) continue;
      if (f === 'textStyle') await n.setTextStyleIdAsync(want ? S[want.token] : '');
      else writeField(n, f, want);
      touch(name, f);
    }
  }
  // A layer tree unlike the anatomy is rebuilt inside the same component, so its id stays.
  function ensureTree(spec, comp) {
    const make = (parent, s) => {
      const n = s.type === 'TEXT' ? figma.createText() : s.type === 'INSTANCE' ? I[spec.swap[s.name]].createInstance() : figma.createFrame();
      if (s.type === 'FRAME') n.fills = [];
      n.name = s.name;
      parent.appendChild(n);
      if (s.type !== 'INSTANCE') for (const c of s.children || []) make(n, c);
    };
    if (JSON.stringify(treeOf(comp).children || []) === JSON.stringify(treeOf(spec.tree).children || [])) return false;
    for (const c of comp.children.slice()) c.remove();
    for (const s of spec.tree.children || []) make(comp, s);
    return true;
  }
  // Top-down, so a parent's auto layout is set before a child fills it; the main component before its overrides.
  async function applySpec(spec, comp, touch, missing) {
    const names = [];
    (function walk(s) { names.push(s.name); if (s.type !== 'INSTANCE') (s.children || []).forEach(walk); })(spec.tree);
    for (const name of names) {
      const n = find(spec, comp, name);
      if (!n) { missing.push(name); continue; }
      if (spec.swap[name]) {
        const main = await n.getMainComponentAsync();
        if (!main || main.id !== I[spec.swap[name]].id) { n.swapComponent(I[spec.swap[name]]); touch(name, 'mainComponent'); }
      }
      await writeFields(spec, name, n, touch, missing);
      if (name in spec.text && n.characters !== spec.text[name]) { n.characters = spec.text[name]; touch(name, 'characters'); }
      if (name in spec.visible && n.visible !== spec.visible[name]) { n.visible = spec.visible[name]; touch(name, 'visible'); }
    }
    for (const path of Object.keys(spec.paint).filter(p => p.indexOf('/') !== -1)) await writeFields(spec, path, at(spec, comp, path), touch, missing);
  }
  async function readSpec(spec, comp) {
    const r = { id: comp.id, name: comp.name, tree: treeOf(comp), layout: {}, paint: {}, visible: {}, text: {}, swap: {}, extras: {}, size: { w: comp.width, h: comp.height } };
    for (const sec of ['layout', 'paint']) {
      for (const name of Object.keys(spec[sec])) {
        const n = at(spec, comp, name);
        if (!n) continue;
        const o = r[sec][name] = {};
        for (const f of Object.keys(spec[sec][name])) o[f] = readField(n, f);
        // a variable bound to a field the Contract does not set for this node is reported too
        if (sec === 'layout') {
          for (const p of Object.keys(n.boundVariables || {})) {
            const f = keyOf(NUM, p) || (RADII.indexOf(p) !== -1 ? 'radius' : p === 'width' || p === 'height' ? p : null);
            if (f && !(f in o) && !(f in (spec.paint[name] || {}))) o[f] = readField(n, f);
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

  // ---- base slice: one family's Base Component, from the spec build-plan resolved from the Contract (#31) ----
  // plan.options.readOnly reads back without writing. base-loop.mjs names the readback's ids through the
  // ledger. Ownership as in icons: the ledger's bases[family] records the page and the component; an
  // unrecorded one with the target name is a conflict unless adopt.
  async function baseSlice() {
    const B = plan.base;
    const opts = plan.options || {};
    const all = state.bases || {};
    const prev = all[plan.family] || null;
    const conflicts = [];
    const conflict = (kind, name, reason, id) => conflicts.push(id ? { kind, name, reason, id } : { kind, name, reason });
    const report = { slice: 'base', fileKey: plan.fileKey, family: plan.family };

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
      return Object.assign(report, { summary: { created: 0, updated: 0, unchanged: 1, conflicts: 0 }, readback: await readSpec(B, comp), ledger: carry() });
    }
    await loadRefs([B], conflict);
    checkTree(B, conflict);
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
    // Once the sets slice has combined it into its Component Set, the Base Component stays there.
    else if (!comp.parent || (comp.parent.id !== page.id && comp.parent.type !== 'COMPONENT_SET')) { page.appendChild(comp); touch(B.tree.name, 'page'); }
    if (comp.name !== B.name) { comp.name = B.name; touch(B.tree.name, 'name'); }
    if (ensureTree(B, comp)) created.push('layers');
    await applySpec(B, comp, touch, missing);

    const bases = Object.assign({}, all);
    bases[plan.family] = { page: page.id, id: comp.id, key: comp.key, name: comp.name, snapshotId: plan.snapshotId, contentHash: plan.contentHash, documentHash: plan.documentHash, builtAt: plan.at };
    const touched = Object.keys(updated).length;
    return Object.assign(report, {
      summary: { created: created.length, updated: touched, unchanged: touched || created.length ? 0 : 1, missing: missing.length, conflicts: 0 },
      created, updated, missing, conflicts, readback: await readSpec(B, comp), ledger: { bases },
    });
  }

  // ---- sets slice: a family's Component Set, in batches, from pre-resolved fragments (#32) ----
  // Each entry is [expansion index, value position per axis, wiring, fragment...]: the core never matches
  // rules. The set sits in Components > Content on the family page, under a Header instance of the file's
  // Component Header template. Ownership: the ledger's sets[family] records page, section, set and the
  // variant ids by expansion index. Without a recorded set, the Base Component's parent set is ours (the base
  // is recorded), and anything inside our set is ours: a variant is found by id, else by name in the set, so
  // a rerun or a retry after a lost connection updates instead of duplicating. Modes other than build only read.
  async function setsSlice() {
    const opts = plan.options || {};
    const mode = opts.mode || 'build';
    const fam = plan.family;
    const prev = (state.sets || {})[fam] || null;
    const baseRec = (state.bases || {})[fam] || null;
    const tplRec = (state.templates && state.templates.header) || null;
    const byName = mode === 'reconcile' || opts.adopt;
    const conflicts = [];
    const conflict = (kind, name, reason, id) => conflicts.push(id ? { kind, name, reason, id } : { kind, name, reason });
    const report = { slice: 'sets', fileKey: plan.fileKey, family: fam, mode };
    if (opts.batch != null) report.batch = [opts.batch, opts.of];
    const A = plan.set.axes;
    const G = plan.set.grid;
    const E = plan.selection.entries;
    const nAx = A.length;
    const nameOf = vals => A.map((a, i) => a.label + '=' + a.values[vals[i]]).join(', ');
    const span = list => list.reduce((m, a) => m * A[a].values.length, 1);
    const R = span(G.rows);
    const C = span(G.columns);
    const cellOf = vals => [G.rows, G.columns].map(list => list.reduce((m, a) => m * A[a].values.length + A[a].order.indexOf(vals[a]), 0));
    const parse = name => {
      const vals = [];
      for (const part of String(name).split(', ')) { const kv = part.split('='); const a = A.findIndex(x => x.label === kv[0]); if (a === -1) return null; vals[a] = A[a].values.indexOf(kv[1]); }
      for (let a = 0; a !== nAx; a++) if (!(vals[a] >= 0)) return null;
      return vals;
    };
    const specOf = e => {
      const w = plan.P[e[nAx + 1]];
      const s = { tree: plan.tree, layout: {}, paint: {}, visible: w.visible, text: w.text, swap: w.swap, refs: w.refs };
      for (const id of e.slice(nAx + 2)) { const f = plan.frags[id]; s[f[0]][f[1]] = f[2]; }
      return s;
    };
    const get = async id => (id ? await figma.getNodeByIdAsync(id) : null);
    const kidNamed = (parent, type, name) => (parent ? parent.children.find(n => n.type === type && n.name === name) || null : null);
    const pageOf = n => { while (n && n.type !== 'PAGE') n = n.parent; return n || null; };

    // -- preflight: read only --
    let set = prev && prev.set ? await get(prev.set.id) : null;
    if (set && set.type !== 'COMPONENT_SET') { conflict('set', plan.set.name, 'type-change', set.id); set = null; }
    const baseNode = baseRec ? await get(baseRec.id) : null;
    if (baseRec && (!baseNode || baseNode.type !== 'COMPONENT')) conflict('base', baseRec.name, 'missing', baseRec.id);
    if (!set && baseNode && baseNode.parent && baseNode.parent.type === 'COMPONENT_SET') set = baseNode.parent;
    let page = prev && prev.page ? figma.root.children.find(p => p.id === prev.page) || null : null;
    if (!page && set) page = pageOf(set);
    if (!page && baseRec) page = figma.root.children.find(p => p.id === baseRec.page) || null;
    if (!page) {
      const same = figma.root.children.find(p => p.name === plan.page);
      if (same && !byName) conflict('page', plan.page, 'unowned', same.id);
      else page = same || null;
    }
    if (page) await page.loadAsync();
    if (!set && page) {
      const same = page.findAll(n => n.type === 'COMPONENT_SET' && n.name === plan.set.name)[0];
      if (same && !byName) conflict('set', plan.set.name, 'unowned', same.id);
      else set = same || null;
    }
    let section = prev && prev.section ? await get(prev.section) : null;
    if (!section && set && set.parent && set.parent.name === 'Content' && set.parent.parent && set.parent.parent.name === 'Components') section = set.parent.parent;
    if (!section && page) {
      const same = kidNamed(page, 'FRAME', 'Components');
      if (same && !byName) conflict('section', 'Components', 'unowned', same.id);
      else section = same;
    }
    let tplPage = tplRec ? figma.root.children.find(p => p.id === tplRec.page) || null : null;
    let tpl = tplRec ? await get(tplRec.id) : null;
    if (!tplPage) {
      const same = figma.root.children.find(p => p.name === plan.templates.page);
      if (same && !byName && !tplRec) conflict('page', plan.templates.page, 'unowned', same.id);
      else tplPage = same || null;
    }
    if (tplPage && !tpl) {
      await tplPage.loadAsync();
      const same = kidNamed(tplPage, 'COMPONENT', plan.templates.header.name);
      if (same && !byName) conflict('template', plan.templates.header.name, 'unowned', same.id);
      else tpl = same;
    }
    const kids = {};
    if (set) for (const k of set.children) kids[k.name] = k;
    const found = {};
    for (const e of E) {
      let node = prev && prev.variants ? await get(prev.variants[e[0]]) : null;
      if (node && (node.type !== 'COMPONENT' || !set || !node.parent || node.parent.id !== set.id)) node = null;
      if (!node && e[0] === plan.baseIndex && baseNode && baseNode.type === 'COMPONENT') node = baseNode;
      if (!node) node = kids[nameOf(e.slice(1))] || null;
      found[e[0]] = node;
    }
    const total = plan.total;
    // this call's variant ids by expansion index; the ledger merges them into the family's list (state carries only these)
    const variants = {};
    const propKeys = () => {
      const defs = set ? set.componentPropertyDefinitions : {};
      const out = {};
      for (const p of plan.props) out[p.key] = Object.keys(defs).find(k => k.split('#')[0] === p.name && defs[k].type === p.type) || null;
      return out;
    };
    const ledger = props => {
      const sets = {};
      sets[fam] = { page: page && page.id, section: section && section.id, set: set && { id: set.id, key: set.key, name: set.name }, props, variants, total,
        snapshotId: plan.snapshotId, contentHash: plan.contentHash, documentHash: plan.documentHash, builtAt: plan.at };
      const out = { sets };
      if (tpl) out.templates = Object.assign({}, state.templates || {}, { header: { page: tplPage.id, id: tpl.id, key: tpl.key } });
      return out;
    };
    // the set grows from the Base Component, so the batch that makes the set holds it
    if (mode === 'build' && !set && baseNode && !E.some(e => e[0] === plan.baseIndex)) conflict('base', baseRec.name, 'base-first: the first batch holds the Base Component');
    const stop = () => Object.assign(report, { summary: { created: 0, updated: 0, conflicts: conflicts.length }, conflicts });
    if (conflicts.length) return stop();

    // prune-preview (read only) and prune (#67): the ledger's orphans by name, each with its instance count in
    // this file. prune deletes only the owner-confirmed list, after checking each name is an orphan whose count
    // is still the one the preview showed; a refused name stops it before any change.
    if (mode.indexOf('prune') === 0) {
      const O = (prev && prev.orphans) || {};
      const L = opts.prune || O;
      const count = {};
      for (const name of Object.keys(L)) {
        if (!(name in O)) { conflict('prune', name, 'not-orphan'); continue; }
        const n = await get(O[name]);
        count[name] = n && n.type === 'COMPONENT' ? (await n.getInstancesAsync()).length : null;
        if (opts.prune && count[name] !== L[name]) conflict('prune', name, 'stale: ' + count[name] + ' instances, the preview counted ' + L[name]);
      }
      if (conflicts.length) return stop();
      if (!opts.prune) return Object.assign(report, { summary: { orphans: Object.keys(O).length, conflicts: 0 }, orphans: count, scope: 'instances in this file only: other files are not counted' });
      const pruned = [];
      for (const name of Object.keys(L)) { const n = await get(O[name]); if (n && n.type === 'COMPONENT') n.remove(); pruned.push(name); }
      return Object.assign(report, { summary: { pruned: pruned.length, conflicts: 0 }, pruned, ledger: ledger(propKeys()) });
    }
    if (mode === 'reconcile') {
      let hits = 0;
      for (const e of E) { const n = found[e[0]]; variants[e[0]] = n ? n.id : null; if (n) hits++; }
      return Object.assign(report, { summary: { found: hits, absent: E.length - hits, set: !!set, conflicts: 0 }, ledger: ledger(propKeys()) });
    }
    if (mode !== 'build') {
      if (!set) { conflict('set', plan.set.name, 'not-built'); return stop(); }
      return Object.assign(report, await readSet(mode));
    }

    const specs = E.map(specOf);
    await loadRefs(specs, conflict);
    for (const p of plan.props) if (p.type === 'INSTANCE_SWAP') await loadRefs([{ layout: {}, paint: {}, swap: [p.default].concat(p.preferred).reduce((m, k, i) => { m['p' + i] = k; return m; }, {}) }], conflict);
    checkTree(specs[0] || { tree: plan.tree, swap: {} }, conflict);
    if (conflicts.length) return stop();

    // -- apply --
    const made = [];
    const counts = {};
    const missing = [];
    const touch = (name, f) => { counts[f] = (counts[f] || 0) + 1; };
    const setp = (n, k, v, label) => { if (!eq(n[k], v)) { n[k] = v; touch(label, k); } };
    if (!page) { page = figma.createPage(); page.name = plan.page; made.push('page'); }
    for (const font of plan.fonts) await figma.loadFontAsync(font);

    // the file's Component Header template: TEXT properties Type, Title, Namespace
    const TF = plan.templates.header.fields;
    if (!tpl) {
      if (!tplPage) { tplPage = figma.createPage(); tplPage.name = plan.templates.page; made.push('templates-page'); }
      tpl = figma.createComponent();
      tplPage.appendChild(tpl); // moved onto its page without a page switch: at most one switch per call
      tpl.name = plan.templates.header.name;
      tpl.layoutMode = 'VERTICAL';
      tpl.resize(2560, 100);
      tpl.layoutSizingHorizontal = 'FIXED';
      tpl.layoutSizingVertical = 'HUG';
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(k => { tpl[k] = 80; });
      tpl.itemSpacing = 8;
      tpl.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      for (const f of TF) {
        const t = figma.createText();
        tpl.appendChild(t);
        t.fontName = { family: plan.templates.fontFamily, style: f[1] };
        t.fontSize = f[2];
        t.characters = f[0];
        t.name = f[0];
        t.componentPropertyReferences = { characters: tpl.addComponentProperty(f[0], 'TEXT', f[0]) };
      }
      made.push('template');
    }
    await figma.setCurrentPageAsync(page);

    // Components > [Header, Content > set]
    if (!section) {
      section = figma.createFrame();
      page.appendChild(section);
      section.name = 'Components';
      made.push('section');
    }
    setp(section, 'layoutMode', 'VERTICAL', 'Components');
    setp(section, 'minWidth', 2560, 'Components');
    setp(section, 'minHeight', 1440, 'Components');
    setp(section, 'layoutSizingHorizontal', 'HUG', 'Components');
    setp(section, 'layoutSizingVertical', 'HUG', 'Components');
    let header = kidNamed(section, 'INSTANCE', 'Header');
    if (header && (await header.getMainComponentAsync() || {}).id !== tpl.id) { header.remove(); header = null; }
    if (!header) { header = tpl.createInstance(); section.insertChild(0, header); header.name = 'Header'; made.push('header'); }
    setp(header, 'layoutSizingHorizontal', 'FILL', 'Header');
    const hp = header.componentProperties;
    const want = {};
    const hv = [plan.set.header.type, plan.set.header.title, plan.set.header.namespace];
    TF.forEach((f, i) => { const k = Object.keys(hp).find(x => x.split('#')[0] === f[0]); if (k && hp[k].value !== hv[i]) want[k] = hv[i]; });
    if (Object.keys(want).length) { header.setProperties(want); touch('Header', 'properties'); }
    let content = kidNamed(section, 'FRAME', 'Content');
    if (!content) { content = figma.createFrame(); section.appendChild(content); content.name = 'Content'; content.fills = []; made.push('content'); }
    setp(content, 'layoutMode', 'VERTICAL', 'Content');
    ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'].forEach(k => setp(content, k, 80, 'Content'));
    setp(content, 'layoutSizingHorizontal', 'FILL', 'Content');
    setp(content, 'layoutSizingVertical', 'HUG', 'Content');

    // the set: the Base Component (or the first variant) combined, then grown one variant at a time
    const fresh = [];
    if (!set) {
      const first = E.find(e => e[0] === plan.baseIndex) || E[0];
      let seed = found[first[0]];
      if (!seed) { seed = found[first[0]] = figma.createComponent(); fresh.push(seed.id); }
      setp(seed, 'name', nameOf(first.slice(1)), 'variant');
      if (!seed.parent || seed.parent.id !== page.id) page.appendChild(seed);
      set = figma.combineAsVariants([seed], page);
      made.push('set');
    }
    if (!set.parent || set.parent.id !== content.id) content.appendChild(set);
    setp(set, 'name', plan.set.name, 'set');
    setp(set, 'description', plan.set.description, 'set');
    setp(set, 'layoutMode', 'GRID', 'set');
    if (set.gridColumnCount !== C) { set.gridColumnCount = C; touch('set', 'gridColumnCount'); }
    if (set.gridRowCount < R) { set.gridRowCount = R; touch('set', 'gridRowCount'); }
    for (const k of ['gridColumnSizes', 'gridRowSizes']) if (!set[k].every(s => s.type === 'HUG')) { set[k] = set[k].map(() => ({ type: 'HUG' })); touch('set', k); }
    ['gridRowGap', 'gridColumnGap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(k => setp(set, k, 20, 'set'));
    setp(set, 'layoutSizingHorizontal', 'HUG', 'set');
    setp(set, 'layoutSizingVertical', 'HUG', 'set');
    if (!eq(paintOf(set.strokes), { raw: '#9747ff' })) { set.strokes = paints({ raw: '#9747ff' }); touch('set', 'strokes'); }
    setp(set, 'strokeWeight', 1, 'set');
    setp(set, 'dashPattern', [10, 5], 'set');
    RADII.forEach(k => setp(set, k, 5, 'set'));

    // properties on the set; INSTANCE_SWAP prefers the Contract's icons by component key
    const defs = set.componentPropertyDefinitions;
    const keys = propKeys();
    for (const p of plan.props) {
      const dv = p.type === 'INSTANCE_SWAP' ? I[p.default].id : p.default;
      const pv = p.type === 'INSTANCE_SWAP' ? p.preferred.map(k => ({ type: 'COMPONENT', key: I[k].key })) : null;
      if (!keys[p.key]) { keys[p.key] = set.addComponentProperty(p.name, p.type, dv, pv ? { preferredValues: pv } : undefined); made.push('property:' + p.name); continue; }
      const d = defs[keys[p.key]];
      const change = {};
      if (!eq(d.defaultValue, dv)) change.defaultValue = dv;
      if (pv && !eq((d.preferredValues || []).map(x => x.key), pv.map(x => x.key))) change.preferredValues = pv;
      if (Object.keys(change).length) { set.editComponentProperty(keys[p.key], change); touch('set', 'property:' + p.name); }
    }

    // grid cells: every variant is placed right after it joins, so each sits in its own cell
    const cell = {};
    const at2 = (r, c) => r * C + c;
    for (const k of set.children) if (k.gridRowAnchorIndex >= 0) cell[at2(k.gridRowAnchorIndex, k.gridColumnAnchorIndex)] = k;
    const parked = [];
    function place(node, r, c) {
      const from = [node.gridRowAnchorIndex, node.gridColumnAnchorIndex];
      if (from[0] === r && from[1] === c) return;
      const occ = cell[at2(r, c)];
      if (occ && occ.id !== node.id) {
        if (set.gridRowCount !== 2 * R) set.gridRowCount = 2 * R;
        let free = R * C;
        while (cell[free]) free++;
        occ.setGridChildPosition(Math.floor(free / C), free % C);
        cell[free] = occ;
        parked.push(occ);
      }
      const was = from[0] >= 0 ? cell[at2(from[0], from[1])] : null;
      if (was && was.id === node.id) delete cell[at2(from[0], from[1])];
      node.setGridChildPosition(r, c);
      cell[at2(r, c)] = node;
      touch('set', 'cell');
    }
    const joinSet = node => {
      if (node.parent && node.parent.id === set.id) return;
      set.appendChild(node);
      if (node.gridRowAnchorIndex >= 0) cell[at2(node.gridRowAnchorIndex, node.gridColumnAnchorIndex)] = node;
    };

    let createdCount = fresh.length;
    for (let i = 0; i !== E.length; i++) {
      const e = E[i];
      const spec = specs[i];
      let node = found[e[0]];
      if (!node) { node = figma.createComponent(); createdCount++; }
      joinSet(node);
      const target = cellOf(e.slice(1, nAx + 1));
      place(node, target[0], target[1]);
      setp(node, 'name', nameOf(e.slice(1)), 'variant');
      if (ensureTree(spec, node)) touch('variant', 'layers');
      for (const n of Object.keys(spec.refs)) {
        const want = {};
        for (const f of Object.keys(spec.refs[n])) want[f] = keys[spec.refs[n][f]];
        const layer = find(spec, node, n);
        if (!layer) { missing.push(n); continue; }
        if (!eq(layer.componentPropertyReferences || {}, want)) { layer.componentPropertyReferences = want; touch(n, 'references'); }
      }
      await applySpec(spec, node, touch, missing);
      variants[e[0]] = node.id;
    }
    // a parked child, or one a hand left out of place, goes back to the cell its name gives
    for (let pass = parked.splice(0).concat(set.children); pass.length; pass = parked.splice(0)) {
      for (const k of pass) { const vals = parse(k.name); if (vals) { const t = cellOf(vals); place(k, t[0], t[1]); } }
    }
    if (set.gridRowCount !== R && !set.children.some(k => k.gridRowAnchorIndex >= R)) set.gridRowCount = R;
    // variants the whole selection no longer holds (#67): never deleted here; the ledger keeps the ones it
    // recorded as orphans, and the rest stay extra
    const dropped = [];
    for (const k of set.children) {
      const v = parse(k.name);
      const i = v ? v.reduce((m, x, a) => m * A[a].values.length + x, 0) : 0;
      if (v && !((parseInt(plan.selection.member[i >> 2], 16) >> (i & 3)) & 1)) dropped.push([k.name, k.id, k.key]);
    }
    const upd = Object.keys(counts).reduce((m, k) => m + counts[k], 0);
    return Object.assign(report, {
      summary: { created: createdCount, updated: upd, variants: set.children.length, missing: missing.length, dropped: dropped.length, conflicts: 0 },
      made, updated: counts, missing, dropped, conflicts, defaultVariant: set.defaultVariant ? set.defaultVariant.name : null, ledger: ledger(keys),
    });

    // -- readbacks: coverage (names, cells, wiring), sample (full values), theme (colours per mode) --
    async function readSet(what) {
      const iconOf = {};
      for (const k of Object.keys(state.icons || {})) { const r = state.icons[k]; iconOf[r.id] = k; iconOf[r.key] = k; }
      if (what === 'coverage') {
        const dict = [];
        const di = {};
        const D = s => (s in di ? di[s] : (di[s] = dict.push(s) - 1));
        const rows = [];
        for (const k of set.children) {
          const refs = {};
          for (const x of k.findAll(() => true)) {
            const r = x.componentPropertyReferences;
            if (r && Object.keys(r).length) { refs[x.name] = {}; for (const f of Object.keys(r)) refs[x.name][f] = String(r[f]).split('#')[0]; }
          }
          rows.push([k.name.split(', ').map(D), D(JSON.stringify(refs)), k.gridRowAnchorIndex, k.gridColumnAnchorIndex, k.type === 'COMPONENT' ? 1 : 0]);
        }
        const defs = set.componentPropertyDefinitions;
        const props = {};
        for (const k of Object.keys(defs)) {
          const d = defs[k];
          if (d.type === 'VARIANT') continue;
          props[k.split('#')[0]] = { type: d.type, default: d.type === 'INSTANCE_SWAP' ? iconOf[d.defaultValue] || d.defaultValue : d.defaultValue,
            preferred: (d.preferredValues || []).map(x => iconOf[x.key] || x.key) };
        }
        const hdr = section && kidNamed(section, 'INSTANCE', 'Header');
        const hp = hdr ? hdr.componentProperties : {};
        const content = section && kidNamed(section, 'FRAME', 'Content');
        return {
          summary: { variants: rows.length, conflicts: 0 },
          set: { id: set.id, name: set.name, description: set.description, layoutMode: set.layoutMode, grid: [set.gridRowCount, set.gridColumnCount],
            gap: [set.gridRowGap, set.gridColumnGap], padding: set.paddingTop, dash: set.dashPattern, radius: set.topLeftRadius, stroke: paintOf(set.strokes),
            defaultVariant: set.defaultVariant ? set.defaultVariant.name : null, page: pageOf(set).name, parents: [set.parent.name, set.parent.parent && set.parent.parent.name] },
          section: section && { name: section.name, minWidth: section.minWidth, minHeight: section.minHeight, layoutMode: section.layoutMode, children: section.children.map(x => x.name) },
          header: Object.keys(hp).reduce((m, k) => { m[k.split('#')[0]] = hp[k].value; return m; }, {}),
          content: content && { padding: [content.paddingTop, content.paddingRight, content.paddingBottom, content.paddingLeft], gap: content.itemSpacing },
          props, dict, rows,
        };
      }
      const specs = E.map(specOf);
      await loadRefs(specs, conflict);
      if (conflicts.length) return { summary: { conflicts: conflicts.length }, conflicts };
      const out = {};
      const jobs = [];
      for (let i = 0; i !== E.length; i++) {
        const name = nameOf(E[i].slice(1));
        const node = kids[name];
        if (!node) { out[name] = null; continue; }
        if (what === 'sample') {
          const r = await readSpec(specs[i], node);
          r.refs = {};
          for (const n of Object.keys(specs[i].refs)) { const l = find(specs[i], node, n); const x = l && l.componentPropertyReferences; if (x) { r.refs[n] = {}; for (const f of Object.keys(x)) r.refs[n][f] = String(x[f]).split('#')[0]; } }
          r.cell = [node.gridRowAnchorIndex, node.gridColumnAnchorIndex];
          out[name] = r;
          continue;
        }
        // theme: the bound colours (fill, stroke, each effect); an unbound one is left out, which the check reports
        out[name] = {};
        for (const path of Object.keys(specs[i].paint)) {
          const n = at(specs[i], node, path);
          for (const f of Object.keys(specs[i].paint[path])) {
            const list = !n ? [] : f === 'fill' ? n.fills : f === 'stroke' ? n.strokes : f === 'effects' ? n.effects : [];
            (list === figma.mixed ? [] : list).forEach((p, j) => {
              const b = p.boundVariables && p.boundVariables.color;
              if (b && (f === 'effects' || j === 0)) jobs.push([out[name], path + '.' + f + (f === 'effects' ? '.' + j : ''), b.id, n]);
            });
          }
        }
      }
      // each colour resolved with the section switched to every mode of its collection, then the mode restored
      const host = section || set;
      const cols = {};
      for (const job of jobs) {
        const v = job[4] = await figma.variables.getVariableByIdAsync(job[2]);
        cols[v.variableCollectionId] = cols[v.variableCollectionId] || await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      }
      for (const id of Object.keys(cols)) {
        const col = cols[id];
        const before = (host.explicitVariableModes || {})[id];
        try {
          for (const m of col.modes) {
            host.setExplicitVariableModeForCollection(col, m.modeId);
            for (const job of jobs) {
              if (job[4].variableCollectionId !== id) continue;
              const r = job[4].resolveForConsumer(job[3]);
              const c = r && r.value;
              (job[0][job[1]] = job[0][job[1]] || {})[m.name] = c && typeof c === 'object' ? hex(c) + (c.a != null && c.a < 1 ? '/' + Math.round(c.a * 1000) / 1000 : '') : c;
            }
          }
        } finally {
          // the file is left as it was found, even when a resolve throws
          if (before) host.setExplicitVariableModeForCollection(col, before); else host.clearExplicitVariableModeForCollection(col);
        }
      }
      return { summary: { variants: E.length, conflicts: 0 }, [what]: out };
    }
  }
}
