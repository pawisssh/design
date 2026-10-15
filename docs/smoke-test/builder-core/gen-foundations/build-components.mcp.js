// Native build package: 5f8d8b4e1ae3323b72fa612a75317396513be73537c108e90a0219ac8d18e98a
// Minimal fixed builder core for the use_figma smoke test (Carbon Button pilot).
// Plain Plugin API only (no createAutoLayout / notify / setPluginData) so it also runs in Console/Scripter.
// Runs one plan slice per call: "foundations" (variables) or "components" (Component Sets); "all" does both.
async function buildComponentSets(figma, plan, state) {
  const t0 = Date.now();
  if (typeof figma.createComponent !== 'function' || typeof figma.combineAsVariants !== 'function' || !figma.variables) {
    throw new Error('Raw Plugin API (figma.create*/variables) not available in this runtime');
  }
  const slice = plan.slice || 'all';
  const ledger = { variables: Object.assign({}, (state.variables || {})), collection: state.collection || null, sets: Object.assign({}, state.sets || {}) };
  const out = { slice, created: { variables: 0, variants: 0, sets: 0 }, reused: { variables: 0, sets: 0 }, removed: [], ms: {} };

  const hex = h => { const n = parseInt(h.slice(1), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };

  // ---- foundations: one collection, N modes, color variables (idempotent by name) ----
  if (slice === 'foundations' || slice === 'all') {
    const f = plan.foundations;
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    let col = cols.find(c => c.id === ledger.collection) || cols.find(c => c.name === f.collection);
    if (!col) {
      col = figma.variables.createVariableCollection(f.collection);
      col.renameMode(col.modes[0].modeId, f.modes[0]);
      for (const m of f.modes.slice(1)) col.addMode(m);
    }
    const modeId = name => col.modes.find(m => m.name === name).modeId;
    const existing = (await figma.variables.getLocalVariablesAsync('COLOR')).filter(v => v.variableCollectionId === col.id);
    for (const [name, def] of Object.entries(f.colors)) {
      let v = existing.find(x => x.name === name);
      if (v) out.reused.variables++;
      else { v = figma.variables.createVariable(name, col, 'COLOR'); out.created.variables++; }
      v.scopes = def.scopes;
      v.setVariableCodeSyntax('WEB', `var(--cds-${def.css})`);
      for (const m of f.modes) v.setValueForMode(modeId(m), hex(def.values[m]));
      ledger.variables[name] = v.id;
    }
    ledger.collection = col.id;
    out.ms.foundations = Date.now() - t0;
  }

  // ---- components: one Component Set per family from the selected tuples ----
  if (slice === 'components' || slice === 'all') {
    const t1 = Date.now();
    const page = figma.root.children.find(p => p.name === plan.page) || (() => { const p = figma.createPage(); p.name = plan.page; return p; })();
    await figma.setCurrentPageAsync(page);
    const font = plan.font;
    await figma.loadFontAsync(font);
    const varCache = {};
    const getVar = async name => {
      if (!(name in varCache)) {
        const id = ledger.variables[name];
        varCache[name] = id ? await figma.variables.getVariableByIdAsync(id) : null;
        if (!varCache[name]) throw new Error(`Variable not in ledger: ${name}`);
      }
      return varCache[name];
    };
    const boundPaint = async name => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', await getVar(name));

    for (const fam of plan.families) {
      const tuples = plan.selection.entries.filter(e => e.familyId === fam.id);
      const prior = ledger.sets[fam.id] && await figma.getNodeByIdAsync(ledger.sets[fam.id].id);
      if (prior && plan.onExisting === 'reuse') { out.reused.sets++; continue; }
      if (prior) { out.removed.push(prior.id); prior.remove(); }
      const comps = [];
      for (const t of tuples) {
        const p = t.properties, size = fam.sizes[p.size];
        const c = figma.createComponent();
        c.name = fam.axes.map(a => `${a}=${p[a]}`).join(', ');
        c.layoutMode = 'HORIZONTAL';
        c.primaryAxisSizingMode = 'AUTO';
        c.counterAxisSizingMode = 'FIXED';
        c.counterAxisAlignItems = 'CENTER';
        c.resize(c.width, size.height);
        c.paddingLeft = 16; c.paddingRight = size.paddingRight; c.paddingTop = 0; c.paddingBottom = 0;
        c.fills = [await boundPaint(`button/${p.kind}/${p.state}/bg`)];
        const label = figma.createText();
        label.fontName = font;
        label.fontSize = 14;
        label.characters = 'Button';
        label.name = 'Label';
        label.fills = [await boundPaint(p.state === 'disabled' ? 'button/disabled/text' : `button/${p.kind}/text`)];
        c.appendChild(label);
        comps.push(c);
        out.created.variants++;
      }
      const set = figma.combineAsVariants(comps, page);
      set.name = fam.name;
      set.description = fam.description;
      const labelKey = set.addComponentProperty('Label', 'TEXT', 'Button');
      for (const c of set.children) c.findOne(n => n.name === 'Label').componentPropertyReferences = { characters: labelKey };
      // grid: one row per kind, columns = size x state
      let maxX = 0, y = 24;
      const rows = {};
      for (const c of set.children) { const k = c.name.split(', ')[0]; (rows[k] = rows[k] || []).push(c); }
      for (const row of Object.values(rows)) {
        let x = 24, h = 0;
        for (const c of row) { c.x = x; c.y = y; x += c.width + 16; h = Math.max(h, c.height); }
        maxX = Math.max(maxX, x); y += h + 16;
      }
      set.resizeWithoutConstraints(maxX + 8, y + 8);
      set.x = plan.origin.x; set.y = plan.origin.y;
      ledger.sets[fam.id] = { id: set.id, variants: Object.fromEntries(set.children.map(c => [c.name, c.id])), labelKey };
      out.created.sets++;
    }
    out.ms.components = Date.now() - t1;
  }
  out.ms.total = Date.now() - t0;
  out.ledger = ledger;
  out.outputBytes = JSON.stringify(out).length;
  return out;
}

const BUILD_PLAN = {"families": [{"axes": ["kind", "size", "state"], "description": "Smoke-test Button Component Set (Carbon v11 pilot).", "id": "button", "name": "Button", "sizes": {"2xl": {"height": 80, "paddingRight": 64}, "lg": {"height": 48, "paddingRight": 64}, "md": {"height": 40, "paddingRight": 64}, "sm": {"height": 32, "paddingRight": 32}, "xl": {"height": 64, "paddingRight": 64}}}], "font": {"family": "IBM Plex Sans", "style": "Regular"}, "foundations": {"collection": "Smoke / Button", "colors": {"button/danger/active/bg": {"css": "button-danger-active", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#750e13", "White": "#750e13"}}, "button/danger/default/bg": {"css": "button-danger-default", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#da1e28", "White": "#da1e28"}}, "button/danger/disabled/bg": {"css": "button-danger-disabled", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#525252", "White": "#c6c6c6"}}, "button/danger/hover/bg": {"css": "button-danger-hover", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#b81921", "White": "#b81921"}}, "button/danger/text": {"css": "text-on-danger", "scopes": ["TEXT_FILL"], "values": {"G100": "#ffffff", "White": "#ffffff"}}, "button/disabled/text": {"css": "text-on-color-disabled", "scopes": ["TEXT_FILL"], "values": {"G100": "#8d8d8d", "White": "#8d8d8d"}}, "button/ghost/active/bg": {"css": "button-ghost-active", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#525252", "White": "#c6c6c6"}}, "button/ghost/default/bg": {"css": "button-ghost-default", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#161616", "White": "#ffffff"}}, "button/ghost/disabled/bg": {"css": "button-ghost-disabled", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#525252", "White": "#c6c6c6"}}, "button/ghost/hover/bg": {"css": "button-ghost-hover", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#333333", "White": "#e8e8e8"}}, "button/ghost/text": {"css": "text-on-ghost", "scopes": ["TEXT_FILL"], "values": {"G100": "#78a9ff", "White": "#0f62fe"}}, "button/primary/active/bg": {"css": "button-primary-active", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#002d9c", "White": "#002d9c"}}, "button/primary/default/bg": {"css": "button-primary-default", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#0f62fe", "White": "#0f62fe"}}, "button/primary/disabled/bg": {"css": "button-primary-disabled", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#525252", "White": "#c6c6c6"}}, "button/primary/hover/bg": {"css": "button-primary-hover", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#0050e6", "White": "#0050e6"}}, "button/primary/text": {"css": "text-on-primary", "scopes": ["TEXT_FILL"], "values": {"G100": "#ffffff", "White": "#ffffff"}}, "button/secondary/active/bg": {"css": "button-secondary-active", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#393939", "White": "#6f6f6f"}}, "button/secondary/default/bg": {"css": "button-secondary-default", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#6f6f6f", "White": "#393939"}}, "button/secondary/disabled/bg": {"css": "button-secondary-disabled", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#525252", "White": "#c6c6c6"}}, "button/secondary/hover/bg": {"css": "button-secondary-hover", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#5e5e5e", "White": "#474747"}}, "button/secondary/text": {"css": "text-on-secondary", "scopes": ["TEXT_FILL"], "values": {"G100": "#ffffff", "White": "#ffffff"}}, "button/tertiary/active/bg": {"css": "button-tertiary-active", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#c6c6c6", "White": "#002d9c"}}, "button/tertiary/default/bg": {"css": "button-tertiary-default", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#161616", "White": "#ffffff"}}, "button/tertiary/disabled/bg": {"css": "button-tertiary-disabled", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#525252", "White": "#c6c6c6"}}, "button/tertiary/hover/bg": {"css": "button-tertiary-hover", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "values": {"G100": "#f4f4f4", "White": "#0050e6"}}, "button/tertiary/text": {"css": "text-on-tertiary", "scopes": ["TEXT_FILL"], "values": {"G100": "#ffffff", "White": "#0f62fe"}}}, "modes": ["White", "G100"]}, "onExisting": "rebuild", "origin": {"x": 400, "y": 100}, "page": "Smoke test", "schemaVersion": 1, "selection": {"entries": [{"familyId": "button", "properties": {"kind": "primary", "size": "md", "state": "default"}, "specimenId": "button:primary:md:default", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "primary", "size": "md", "state": "hover"}, "specimenId": "button:primary:md:hover", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "primary", "size": "md", "state": "active"}, "specimenId": "button:primary:md:active", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "primary", "size": "md", "state": "disabled"}, "specimenId": "button:primary:md:disabled", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "secondary", "size": "md", "state": "default"}, "specimenId": "button:secondary:md:default", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "secondary", "size": "md", "state": "hover"}, "specimenId": "button:secondary:md:hover", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "secondary", "size": "md", "state": "active"}, "specimenId": "button:secondary:md:active", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "secondary", "size": "md", "state": "disabled"}, "specimenId": "button:secondary:md:disabled", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "tertiary", "size": "md", "state": "default"}, "specimenId": "button:tertiary:md:default", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "tertiary", "size": "md", "state": "hover"}, "specimenId": "button:tertiary:md:hover", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "tertiary", "size": "md", "state": "active"}, "specimenId": "button:tertiary:md:active", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "tertiary", "size": "md", "state": "disabled"}, "specimenId": "button:tertiary:md:disabled", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "ghost", "size": "md", "state": "default"}, "specimenId": "button:ghost:md:default", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "ghost", "size": "md", "state": "hover"}, "specimenId": "button:ghost:md:hover", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "ghost", "size": "md", "state": "active"}, "specimenId": "button:ghost:md:active", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "ghost", "size": "md", "state": "disabled"}, "specimenId": "button:ghost:md:disabled", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "danger", "size": "md", "state": "default"}, "specimenId": "button:danger:md:default", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "danger", "size": "md", "state": "hover"}, "specimenId": "button:danger:md:hover", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "danger", "size": "md", "state": "active"}, "specimenId": "button:danger:md:active", "themeId": "white"}, {"familyId": "button", "properties": {"kind": "danger", "size": "md", "state": "disabled"}, "specimenId": "button:danger:md:disabled", "themeId": "white"}], "schemaVersion": 1, "selectedFamilies": ["button"], "snapshotId": "carbon-react@v11.118.0"}, "slice": "foundations", "snapshotId": "carbon-react@v11.118.0"};
const BUILD_STATE = {};
return await buildComponentSets(figma, BUILD_PLAN, BUILD_STATE);
