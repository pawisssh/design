// To-design fixed builder core (MCP-only; runs inside use_figma). Never edited per run: a run changes only
// the build plan and the ledger state that the packager embeds next to it.
// Everything lives inside buildComponentSets, because the integrity gate hashes buildComponentSets.toString().
// Keep this file ASCII.
async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK) {
  const t0 = Date.now();

  // ---- integrity gate (#17): verify every CHECK field before the first change ----
  // Kept identical in builder-core-components.js, except the per-core block (tests/gate-parity.test.mjs).
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
  const entries = plan.slice === 'foundations'
    ? Object.keys(plan.foundations.variables).length + Object.keys(plan.foundations.textStyles).length
    : plan.slice === 'icons' ? plan.icons.length
      : ((plan.selection && plan.selection.entries) || []).length;
  // gate per-core end
  if (entries !== CHECK.entries) return mismatch('entries', CHECK.entries, entries);
  if (typeof figma.fileKey === 'string' && figma.fileKey !== plan.fileKey) return { error: 'wrong-file', expected: plan.fileKey, got: figma.fileKey };
  // gate end

  const slices = { foundations: foundationsSlice, icons: iconsSlice };
  if (!slices[plan.slice]) return { error: 'unknown-slice', slice: plan.slice };

  const result = await slices[plan.slice]();
  result.ms = Date.now() - t0;
  result.outputBytes = JSON.stringify(result).length;
  return result;

  // ---- shared helpers ----
  function near(a, b, eps) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps; }
  function sameList(a, b) { return a.length === b.length && a.slice().sort().join() === b.slice().sort().join(); }
  // Figma stores numbers as float32 (0.16 reads back as 0.1599999964), so compare with a tolerance.
  function sameValue(cur, want) {
    if (cur == null) return false;
    if (want.type === 'VARIABLE_ALIAS') return cur.type === 'VARIABLE_ALIAS' && cur.id === want.id;
    if (cur.type === 'VARIABLE_ALIAS') return false;
    if (typeof want === 'object') return ['r', 'g', 'b', 'a'].every(k => near(cur[k], want[k], 1 / 512));
    if (typeof want === 'number') return near(cur, want, 1e-4);
    return cur === want;
  }
  function sameMetric(a, b) { return !!a && a.unit === b.unit && (b.unit === 'AUTO' || near(a.value, b.value, 1e-4)); }
  function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1, 7), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha == null ? 1 : alpha };
  }
  function countAll(groups) { return Object.values(groups).reduce((n, g) => n + (Array.isArray(g) ? g.length : Object.keys(g).length), 0); }

  // ---- foundations slice: Variables and Text Styles from the foundations document ----
  // Ownership: only ledger-recorded objects are touched. An unrecorded object with a target name is a
  // conflict unless plan.options.adopt. Any conflict stops the slice before its first change.
  async function foundationsSlice() {
    const F = plan.foundations;
    const opts = plan.options || {};
    const adopt = !!opts.adopt;
    const prev = state.foundations || null;
    const prevCollections = (prev && prev.collections) || {};
    const prevVariables = (prev && prev.variables) || {};
    const prevStyles = (prev && prev.textStyles) || {};
    const prevOrphans = { variables: {}, textStyles: {}, ...((prev && prev.orphans) || {}) };
    const conflicts = [];
    const conflict = (kind, name, reason, id) => conflicts.push(id ? { kind, name, reason, id } : { kind, name, reason });
    const colIndex = {};
    F.collections.forEach((c, i) => { colIndex[c.key] = i; });

    // -- preflight: read only --
    const localCols = await figma.variables.getLocalVariableCollectionsAsync();
    const localVars = await figma.variables.getLocalVariablesAsync();
    const localStyles = await figma.getLocalTextStylesAsync();
    const colById = new Map(localCols.map(c => [c.id, c]));
    const varById = new Map(localVars.map(v => [v.id, v]));
    const styleById = new Map(localStyles.map(s => [s.id, s]));
    const orphanIds = kind => Object.values(prevOrphans[kind]).map(o => o.id);
    const recorded = new Set([].concat(
      Object.values(prevCollections).map(c => c.id), Object.values(prevVariables), Object.values(prevStyles),
      orphanIds('variables'), orphanIds('textStyles')));

    const cols = {};
    for (const c of F.collections) {
      const rec = prevCollections[c.key];
      let col = rec ? colById.get(rec.id) || null : null;
      const recModes = col ? rec.modes || {} : {};
      if (!col) {
        const same = localCols.find(x => x.name === c.name && !recorded.has(x.id));
        if (same && !adopt) { conflict('collection', c.key, 'unowned', same.id); continue; }
        col = same || null;
      }
      const modes = {};
      if (col) {
        const known = Object.values(recModes);
        for (const m of c.modes) {
          let mode = col.modes.find(x => x.modeId === recModes[m.key]);
          if (!mode) {
            const same = col.modes.find(x => x.name === m.label && !known.includes(x.modeId) && !Object.values(modes).includes(x.modeId));
            if (same && !adopt) conflict('mode', `${c.key}/${m.key}`, 'unowned', same.modeId);
            else mode = same;
          }
          if (mode) modes[m.key] = mode.modeId;
        }
      }
      cols[c.key] = { col, modes };
    }

    const vars = {};
    for (const [flat, v] of Object.entries(F.variables)) {
      const c = cols[v.collection];
      if (!(v.collection in colIndex)) { conflict('variable', flat, 'unknown-collection'); continue; }
      if (!c) continue;
      for (const val of Object.values(v.values)) {
        const target = val.alias != null && F.variables[val.alias];
        if (val.alias != null && (!target || colIndex[target.collection] >= colIndex[v.collection])) conflict('variable', flat, `alias-target:${val.alias}`);
      }
      const id = prevVariables[flat] || (prevOrphans.variables[flat] && prevOrphans.variables[flat].id);
      let x = id ? varById.get(id) || null : null;
      if (!x && c.col) {
        const same = localVars.find(y => y.variableCollectionId === c.col.id && y.name === v.name && !recorded.has(y.id));
        if (same && !adopt) { conflict('variable', flat, 'unowned', same.id); continue; }
        x = same || null;
      }
      if (x && (!c.col || x.variableCollectionId !== c.col.id)) { conflict('variable', flat, 'collection-change', x.id); continue; }
      if (x && x.resolvedType !== v.type) { conflict('variable', flat, 'type-change', x.id); continue; }
      vars[flat] = x;
    }

    const styles = {};
    for (const [flat, s] of Object.entries(F.textStyles)) {
      for (const token of Object.values(s.binds || {})) if (!F.variables[token]) conflict('textStyle', flat, `bind-target:${token}`);
      const id = prevStyles[flat] || (prevOrphans.textStyles[flat] && prevOrphans.textStyles[flat].id);
      let st = id ? styleById.get(id) || null : null;
      if (!st) {
        const same = localStyles.find(y => y.name === s.name && !recorded.has(y.id));
        if (same && !adopt) { conflict('textStyle', flat, 'unowned', same.id); continue; }
        st = same || null;
      }
      styles[flat] = st;
    }

    // Dropped names become orphans (never deleted here); names that came back leave the orphans.
    const orphans = { variables: {}, textStyles: {} };
    const orphaned = { variables: [], textStyles: [] };
    const docNames = { variables: F.variables, textStyles: F.textStyles };
    const prevLive = { variables: prevVariables, textStyles: prevStyles };
    for (const kind of ['variables', 'textStyles']) {
      for (const [name, o] of Object.entries(prevOrphans[kind])) if (!docNames[kind][name]) orphans[kind][name] = o;
      for (const [name, id] of Object.entries(prevLive[kind])) {
        if (!docNames[kind][name]) { orphans[kind][name] = { id, since: plan.documentHash }; orphaned[kind].push(name); }
      }
    }
    const prune = [];
    for (const name of opts.prune || []) {
      const kind = orphans.variables[name] ? 'variables' : orphans.textStyles[name] ? 'textStyles' : null;
      if (kind) prune.push([kind, name]); else conflict('prune', name, 'not-orphan');
    }

    const report = { slice: 'foundations', fileKey: plan.fileKey };
    if (conflicts.length) {
      return Object.assign(report, {
        summary: { created: 0, updated: 0, unchanged: 0, orphaned: 0, restored: 0, pruned: 0, conflicts: conflicts.length },
        conflicts, ledger: { foundations: prev },
      });
    }

    // -- apply --
    const page = figma.root.children.find(p => p.name === plan.page) || figma.root.children[0];
    await figma.setCurrentPageAsync(page);
    const created = { collections: [], modes: [], variables: [], textStyles: [] };
    const updated = { collections: {}, variables: {}, textStyles: {} };
    const restored = [];
    const extraModes = [];
    let unchanged = 0;
    const note = (kind, name, fields) => { if (fields.length) updated[kind][name] = fields; else unchanged++; };

    const ledgerCollections = Object.assign({}, prevCollections);
    for (const c of F.collections) {
      let col = cols[c.key].col;
      const isNew = !col;
      const fields = [];
      if (isNew) { col = figma.variables.createVariableCollection(c.name); created.collections.push(c.key); }
      else if (col.name !== c.name) { col.name = c.name; fields.push('name'); }
      if (col.hiddenFromPublishing !== !!c.hidden) { col.hiddenFromPublishing = !!c.hidden; fields.push('hidden'); }
      const ids = {};
      c.modes.forEach((m, i) => {
        let id = cols[c.key].modes[m.key];
        if (!id) {
          if (isNew && i === 0) { id = col.modes[0].modeId; col.renameMode(id, m.label); } else id = col.addMode(m.label);
          created.modes.push(`${c.key}/${m.key}`);
        } else if (col.modes.find(x => x.modeId === id).name !== m.label) { col.renameMode(id, m.label); fields.push(`mode:${m.key}`); }
        ids[m.key] = id;
      });
      // No reorder API: setDefaultMode moves a mode to index 0, so calling it in reverse order fixes the order (#27).
      const target = c.modes.map(m => ids[m.key]);
      if (target.some((id, i) => col.modes[i].modeId !== id)) {
        for (const id of target.slice().reverse()) col.setDefaultMode(id);
        fields.push('modeOrder');
      }
      for (const m of col.modes) if (!target.includes(m.modeId)) extraModes.push({ collection: c.key, name: m.name, modeId: m.modeId });
      if (!isNew) note('collections', c.key, fields);
      cols[c.key] = { col, modes: ids };
      ledgerCollections[c.key] = { id: col.id, modes: ids };
    }

    const made = {};
    const ledgerVariables = {};
    const value = (type, val) => {
      if (val.alias != null) return figma.variables.createVariableAlias(made[val.alias]);
      if (val.raw != null) return rgba(val.raw, val.alpha);
      return type === 'COLOR' ? rgba(val.value) : val.value;
    };
    for (const c of F.collections) {
      const { col, modes } = cols[c.key];
      for (const [flat, v] of Object.entries(F.variables)) {
        if (v.collection !== c.key) continue;
        let x = vars[flat];
        const isNew = !x;
        if (isNew) { x = figma.variables.createVariable(v.name, col, v.type); created.variables.push(flat); }
        else if (prevOrphans.variables[flat] && prevOrphans.variables[flat].id === x.id) restored.push(flat);
        const fields = [];
        if (x.name !== v.name) { x.name = v.name; fields.push('name'); }
        if (!sameList(x.scopes, v.scopes)) { x.scopes = v.scopes; fields.push('scopes'); }
        const web = (v.codeSyntax || {}).WEB;
        if (x.codeSyntax.WEB !== web) { if (web) x.setVariableCodeSyntax('WEB', web); else x.removeVariableCodeSyntax('WEB'); fields.push('codeSyntax'); }
        if (x.hiddenFromPublishing !== !!v.hidden) { x.hiddenFromPublishing = !!v.hidden; fields.push('hidden'); }
        const current = x.valuesByMode;
        for (const [mk, val] of Object.entries(v.values)) {
          const want = value(v.type, val);
          if (!sameValue(current[modes[mk]], want)) { x.setValueForMode(modes[mk], want); fields.push(`value:${mk}`); }
        }
        if (!isNew) note('variables', flat, fields);
        made[flat] = x;
        ledgerVariables[flat] = x.id;
      }
    }

    // Text Styles: literals first (a new style, or fields no variable binds), then bind the Type variables.
    const ledgerStyles = {};
    for (const [flat, s] of Object.entries(F.textStyles)) {
      let st = styles[flat];
      const isNew = !st;
      if (isNew) { st = figma.createTextStyle(); created.textStyles.push(flat); }
      else if (prevOrphans.textStyles[flat] && prevOrphans.textStyles[flat].id === st.id) restored.push(flat);
      const fields = [];
      if (st.name !== s.name) { st.name = s.name; fields.push('name'); }
      const binds = s.binds || {};
      const literal = field => isNew || !binds[field];
      const font = { family: s.fontFamily, style: s.fontStyle };
      await figma.loadFontAsync(font);
      if ((literal('fontFamily') || literal('fontWeight')) && (st.fontName.family !== font.family || st.fontName.style !== font.style)) { st.fontName = font; fields.push('fontName'); }
      if (s.fontSize != null && literal('fontSize') && !near(st.fontSize, s.fontSize, 1e-4)) { st.fontSize = s.fontSize; fields.push('fontSize'); }
      if (s.lineHeight && literal('lineHeight') && !sameMetric(st.lineHeight, s.lineHeight)) { st.lineHeight = s.lineHeight; fields.push('lineHeight'); }
      if (s.letterSpacing && literal('letterSpacing') && !sameMetric(st.letterSpacing, s.letterSpacing)) { st.letterSpacing = s.letterSpacing; fields.push('letterSpacing'); }
      const bound = st.boundVariables || {};
      for (const [field, token] of Object.entries(binds)) {
        if (!bound[field] || bound[field].id !== made[token].id) { st.setBoundVariable(field, made[token]); fields.push(`bind:${field}`); }
      }
      if (!isNew) note('textStyles', flat, fields);
      ledgerStyles[flat] = st.id;
    }

    // Prune: delete only orphans the owner listed.
    const pruned = [];
    for (const [kind, name] of prune) {
      const id = orphans[kind][name].id;
      const obj = kind === 'variables' ? varById.get(id) : styleById.get(id);
      if (obj) obj.remove();
      delete orphans[kind][name];
      pruned.push(name);
    }

    const orphanedCount = orphaned.variables.length + orphaned.textStyles.length;
    return Object.assign(report, {
      summary: { created: countAll(created), updated: countAll(updated), unchanged, orphaned: orphanedCount, restored: restored.length, pruned: pruned.length, conflicts: 0 },
      created, updated, orphaned, restored, pruned, conflicts, extraModes,
      ledger: {
        foundations: {
          designSystem: plan.designSystem, snapshotId: plan.snapshotId, documentHash: plan.documentHash, appliedAt: plan.at,
          collections: ledgerCollections, variables: ledgerVariables, textStyles: ledgerStyles, orphans,
        },
      },
    });
  }

  // ---- icons slice: icon atoms from SVG text, on the Icons page (#30) ----
  // Each icon is one 16x16 component with no fill and one flattened VECTOR named Vector, constrained
  // SCALE/SCALE (#13), named kit style. Ownership as in foundations: only ledger-recorded nodes are touched;
  // an unrecorded page or component with a target name is a conflict unless plan.options.adopt. A changed
  // SVG rebuilds only the Vector, so the component keeps its id and key. A dropped icon becomes an orphan
  // and is never deleted here.
  async function iconsSlice() {
    const SIZE = 16;
    const SCALE = { horizontal: 'SCALE', vertical: 'SCALE' };
    const adopt = !!(plan.options || {}).adopt;
    const prev = state.icons || null;
    const prevComps = (prev && prev.components) || {};
    const prevOrphans = (prev && prev.orphans) || {};
    const conflicts = [];
    const conflict = (kind, name, reason, id) => conflicts.push(id ? { kind, name, reason, id } : { kind, name, reason });
    const report = { slice: 'icons', fileKey: plan.fileKey };

    // -- preflight: read only --
    let page = prev && prev.page ? figma.root.children.find(p => p.id === prev.page) || null : null;
    if (!page) {
      const same = figma.root.children.find(p => p.name === plan.page);
      if (same && !adopt) conflict('page', plan.page, 'unowned', same.id);
      else page = same || null;
    }
    if (page) await page.loadAsync();
    const recorded = new Set(Object.values(prevComps).concat(Object.values(prevOrphans)).map(r => r.id));
    const nodes = {};
    for (const icon of plan.icons) {
      const rec = prevComps[icon.key] || prevOrphans[icon.key];
      let node = rec ? await figma.getNodeByIdAsync(rec.id) : null;
      if (node && node.type !== 'COMPONENT') { conflict('icon', icon.key, 'type-change', node.id); continue; }
      if (!node && page) {
        const same = page.children.find(n => n.type === 'COMPONENT' && n.name === icon.name && !recorded.has(n.id));
        if (same && !adopt) { conflict('icon', icon.key, 'unowned', same.id); continue; }
        node = same || null;
      }
      nodes[icon.key] = node;
    }

    const inPlan = {};
    for (const icon of plan.icons) inPlan[icon.key] = true;
    const orphans = {};
    const orphaned = [];
    for (const key of Object.keys(prevOrphans)) if (!inPlan[key]) orphans[key] = prevOrphans[key];
    for (const key of Object.keys(prevComps)) {
      if (!inPlan[key]) { orphans[key] = Object.assign({}, prevComps[key], { since: plan.at }); orphaned.push(key); }
    }

    if (conflicts.length) {
      return Object.assign(report, {
        summary: { created: 0, updated: 0, unchanged: 0, orphaned: 0, restored: 0, conflicts: conflicts.length },
        conflicts, ledger: { icons: prev },
      });
    }

    // -- apply --
    const created = { page: false, icons: [] };
    const updated = {};
    const restored = [];
    let pageRenamed = false;
    let unchanged = 0;
    if (!page) { page = figma.createPage(); page.name = plan.page; created.page = true; }
    else if (page.name !== plan.page) { page.name = plan.page; pageRenamed = true; }
    // createNodeFromSvg adds to the current page.
    await figma.setCurrentPageAsync(page);

    // The SVG as a SIZE x SIZE frame holding one VECTOR named Vector. Flatten first (a frame may hold several
    // shapes), constrain the result SCALE (flatten resets constraints), and only then resize, so a 32 source
    // scales down with its frame.
    function svgFrame(icon) {
      const frame = figma.createNodeFromSvg(icon.svg);
      const kids = frame.children;
      const v = kids.length === 1 && kids[0].type === 'VECTOR' ? kids[0] : figma.flatten(kids, frame);
      v.name = 'Vector';
      v.constraints = SCALE;
      frame.resize(SIZE, SIZE);
      return frame;
    }

    const components = {};
    for (let i = 0; i < plan.icons.length; i++) {
      const icon = plan.icons[i];
      const description = plan.source.package + '@' + plan.source.version + ' ' + icon.file;
      let comp = nodes[icon.key];
      if (!comp) {
        comp = figma.createComponentFromNode(svgFrame(icon));
        comp.name = icon.name;
        comp.fills = [];
        comp.description = description;
        comp.x = i * SIZE * 2;
        comp.y = 0;
        created.icons.push(icon.key);
      } else {
        const rec = prevComps[icon.key] || prevOrphans[icon.key];
        if (prevOrphans[icon.key] && prevOrphans[icon.key].id === comp.id) restored.push(icon.key);
        const fields = [];
        if (!comp.parent || comp.parent.id !== page.id) { page.appendChild(comp); fields.push('page'); }
        if (comp.name !== icon.name) { comp.name = icon.name; fields.push('name'); }
        if (comp.description !== description) { comp.description = description; fields.push('description'); }
        if (!near(comp.width, SIZE, 1e-3) || !near(comp.height, SIZE, 1e-3)) { comp.resize(SIZE, SIZE); fields.push('size'); }
        if (comp.fills.length) { comp.fills = []; fields.push('fills'); }
        const kids = comp.children;
        const v = kids.length === 1 && kids[0].type === 'VECTOR' ? kids[0] : null;
        if (!v || !rec || rec.id !== comp.id || rec.sha256 !== icon.sha256) {
          // Rebuild the Vector inside the same component; keep the new vector's place in its frame.
          const frame = svgFrame(icon);
          const nv = frame.children[0];
          const x = nv.x;
          const y = nv.y;
          for (const old of kids) old.remove();
          comp.appendChild(nv);
          nv.x = x;
          nv.y = y;
          frame.remove();
          fields.push('vector');
        } else {
          if (v.name !== 'Vector') { v.name = 'Vector'; fields.push('vector:name'); }
          const c = v.constraints;
          if (c.horizontal !== 'SCALE' || c.vertical !== 'SCALE') { v.constraints = SCALE; fields.push('vector:constraints'); }
        }
        if (fields.length) updated[icon.key] = fields; else unchanged++;
      }
      components[icon.key] = { id: comp.id, key: comp.key, file: icon.file, sha256: icon.sha256 };
    }

    return Object.assign(report, {
      summary: {
        created: created.icons.length + (created.page ? 1 : 0), updated: Object.keys(updated).length + (pageRenamed ? 1 : 0),
        unchanged, orphaned: orphaned.length, restored: restored.length, conflicts: 0,
      },
      created, updated, orphaned, restored, conflicts,
      ledger: { icons: { source: plan.source, page: page.id, components, orphans } },
    });
  }
}
