// A mock of the part of the Figma Plugin API the builder core uses, for node tests.
// It follows the behavior probed live in #27: setDefaultMode moves a mode to index 0 and keeps the
// others in order, numbers are stored as float32, and scopes outside the API enum throw.
// Every call that writes (or loads a font, or switches page) is appended to `log`.

const SCOPES = new Set(['ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL',
  'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'COLOR_OPACITY',
  'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT']);
const WEIGHTS = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' };
const f32 = Math.fround;
// Node fields the base slice reads and writes, with Figma's defaults for a new frame.
const LAYOUT_DEFAULTS = {
  layoutMode: 'NONE', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN',
  paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, itemSpacing: 0, minWidth: null, maxWidth: null, minHeight: null, maxHeight: null,
  topLeftRadius: 0, topRightRadius: 0, bottomLeftRadius: 0, bottomRightRadius: 0, strokeWeight: 1, strokeAlign: 'INSIDE', strokes: [], effects: [],
  opacity: 1, visible: true, textAutoResize: 'NONE', dashPattern: [], gridRowGap: 0, gridColumnGap: 0,
};
const PAINT_LISTS = { strokes: 1, effects: 1, dashPattern: 1 };
const BINDABLE = new Set(['width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'minWidth', 'maxWidth',
  'minHeight', 'maxHeight', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'strokeWeight', 'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight', 'opacity']);
// Probed live in #419: binding strokeWeight stores the four per-side keys, never `strokeWeight` itself.
const STROKE_SIDES = ['strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight'];
const clone = x => JSON.parse(JSON.stringify(x));

export function mockFigma({ fileKey = 'MOCKFILEKEY', pages = ['Page 1'] } = {}) {
  let next = 1;
  const log = [];
  const collections = new Map();
  const variables = new Map();
  const styles = new Map();
  const fonts = new Set();
  // A bound weight picks the family's loaded style of that weight, spelled as the family spells it: Inter's
  // `Semi Bold`, IBM Plex's `SemiBold`.
  const weightStyle = (family, value) => {
    const want = WEIGHTS[Math.round(value / 100) * 100] || 'Regular';
    const loaded = [...fonts].map(f => f.split('/')).find(([fam, style]) => fam === family && style.replace(/\s/g, '') === want);
    return loaded ? loaded[1] : want;
  };
  const w = (op, ...args) => log.push([op, ...args]);

  function storeValue(type, value) {
    if (value && value.type === 'VARIABLE_ALIAS') {
      if (!variables.has(value.id)) throw new Error(`alias to unknown variable ${value.id}`);
      return { type: 'VARIABLE_ALIAS', id: value.id };
    }
    if (type === 'COLOR') {
      if (!value || typeof value.r !== 'number') throw new Error('COLOR value must be RGB(A)');
      return { r: f32(value.r), g: f32(value.g), b: f32(value.b), a: f32(value.a ?? 1) };
    }
    if (type === 'FLOAT') { if (typeof value !== 'number') throw new Error('FLOAT value must be a number'); return f32(value); }
    if (type === 'STRING') { if (typeof value !== 'string') throw new Error('STRING value must be a string'); return value; }
    throw new Error(`unsupported type ${type}`);
  }
  const initial = { COLOR: { r: 0, g: 0, b: 0, a: 1 }, FLOAT: 0, STRING: '' };

  class Collection {
    constructor(name) {
      this.id = `VariableCollectionId:1:${next++}`;
      this._name = name; this._modes = [{ modeId: `1:${next++}`, name: 'Mode 1' }];
      this._hidden = false; this.remote = false;
    }
    get name() { return this._name; }
    set name(v) { w('collection.name', this.id, v); this._name = v; }
    get modes() { return clone(this._modes); }
    get defaultModeId() { return this._modes[0].modeId; }
    get hiddenFromPublishing() { return this._hidden; }
    set hiddenFromPublishing(v) { w('collection.hidden', this.id, v); this._hidden = !!v; }
    get variableIds() { return [...variables.values()].filter(v => v.variableCollectionId === this.id).map(v => v.id); }
    addMode(name) {
      w('addMode', this.id, name);
      const modeId = `1:${next++}`;
      for (const v of variables.values()) if (v.variableCollectionId === this.id) v._values[modeId] = clone(v._values[this.defaultModeId]);
      this._modes.push({ modeId, name });
      return modeId;
    }
    renameMode(modeId, name) { w('renameMode', this.id, modeId, name); this._mode(modeId).name = name; }
    removeMode(modeId) { w('removeMode', this.id, modeId); this._mode(modeId); this._modes = this._modes.filter(m => m.modeId !== modeId); }
    setDefaultMode(modeId) {
      w('setDefaultMode', this.id, modeId);
      const mode = this._mode(modeId);
      this._modes = [mode, ...this._modes.filter(m => m !== mode)];
    }
    remove() { w('collection.remove', this.id); for (const id of this.variableIds) variables.delete(id); collections.delete(this.id); }
    _mode(modeId) { const m = this._modes.find(x => x.modeId === modeId); if (!m) throw new Error(`unknown mode ${modeId}`); return m; }
  }

  class Variable {
    constructor(name, collection, type) {
      this.id = `VariableID:1:${next++}`;
      this._name = name; this.variableCollectionId = collection.id; this.resolvedType = type;
      this._scopes = ['ALL_SCOPES']; this._code = {}; this._hidden = false; this.remote = false;
      this._values = Object.fromEntries(collection._modes.map(m => [m.modeId, clone(initial[type])]));
    }
    get name() { return this._name; }
    set name(v) { w('variable.name', this.id, v); this._name = v; }
    get scopes() { return [...this._scopes]; }
    set scopes(v) {
      for (const s of v) if (!SCOPES.has(s)) throw new Error(`invalid scope ${s}`);
      w('variable.scopes', this.id, v); this._scopes = [...v];
    }
    get codeSyntax() { return { ...this._code }; }
    setVariableCodeSyntax(platform, value) { w('setVariableCodeSyntax', this.id, platform, value); this._code[platform] = value; }
    removeVariableCodeSyntax(platform) { w('removeVariableCodeSyntax', this.id, platform); delete this._code[platform]; }
    get hiddenFromPublishing() { return this._hidden; }
    set hiddenFromPublishing(v) { w('variable.hidden', this.id, v); this._hidden = !!v; }
    get valuesByMode() { return clone(this._values); }
    setValueForMode(modeId, value) {
      const col = collections.get(this.variableCollectionId);
      col._mode(modeId);
      w('setValueForMode', this.id, modeId, value);
      this._values[modeId] = storeValue(this.resolvedType, value);
    }
    remove() { w('variable.remove', this.id); variables.delete(this.id); }
    // The value for a node: the mode its nearest ancestor sets for the collection, else the default; aliases followed.
    resolveForConsumer(node) {
      let mode = null;
      for (let n = node; n && n.type; n = n.parent) if (n._modes && n._modes[this.variableCollectionId]) { mode = n._modes[this.variableCollectionId]; break; }
      const value = this._values[mode || collections.get(this.variableCollectionId).defaultModeId];
      if (value && value.type === 'VARIABLE_ALIAS') return variables.get(value.id).resolveForConsumer(node);
      return { value: clone(value), resolvedType: this.resolvedType };
    }
  }

  // The variable's value in its collection's default mode, following aliases.
  function resolved(variable) {
    let v = variable;
    for (;;) {
      const value = v._values[collections.get(v.variableCollectionId).defaultModeId];
      if (value && value.type === 'VARIABLE_ALIAS') v = variables.get(value.id); else return value;
    }
  }

  class TextStyle {
    constructor() {
      this.id = `S:mock${next},1:${next++}`;
      this.type = 'TEXT'; this.remote = false;
      this._name = 'Text style'; this._font = { family: 'Inter', style: 'Regular' }; this._size = 12;
      this._lh = { unit: 'AUTO' }; this._ls = { unit: 'PERCENT', value: 0 }; this._bound = {};
    }
    get name() { return this._name; }
    set name(v) { w('style.name', this.id, v); this._name = v; }
    get fontName() { return { ...this._font }; }
    set fontName(v) { this._needFont(v); w('style.fontName', this.id, v); this._font = { ...v }; delete this._bound.fontFamily; delete this._bound.fontWeight; }
    get fontSize() { return this._size; }
    set fontSize(v) { this._needFont(this._font); w('style.fontSize', this.id, v); this._size = f32(v); delete this._bound.fontSize; }
    get lineHeight() { return { ...this._lh }; }
    set lineHeight(v) { this._needFont(this._font); w('style.lineHeight', this.id, v); this._lh = v.unit === 'AUTO' ? { unit: 'AUTO' } : { unit: v.unit, value: f32(v.value) }; delete this._bound.lineHeight; }
    get letterSpacing() { return { ...this._ls }; }
    set letterSpacing(v) { this._needFont(this._font); w('style.letterSpacing', this.id, v); this._ls = { unit: v.unit, value: f32(v.value) }; delete this._bound.letterSpacing; }
    get boundVariables() { return clone(this._bound); }
    setBoundVariable(field, variable) {
      w('style.setBoundVariable', this.id, field, variable && variable.id);
      if (!variable) { delete this._bound[field]; return; }
      const value = resolved(variable);
      if (field === 'fontFamily') this._font = { ...this._font, family: value };
      else if (field === 'fontWeight') this._font = { ...this._font, style: weightStyle(this._font.family, value) };
      else if (field === 'fontSize') this._size = value;
      else if (field === 'lineHeight') this._lh = { unit: 'PIXELS', value };
      else if (field === 'letterSpacing') this._ls = { unit: 'PIXELS', value };
      else throw new Error(`unsupported text style field ${field}`);
      this._bound[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
    }
    remove() { w('style.remove', this.id); styles.delete(this.id); }
    _needFont(font) { if (!fonts.has(`${font.family}/${font.style}`)) throw new Error(`font not loaded: ${font.family} ${font.style}`); }
  }

  // ---- scene nodes: pages, frames, components, vectors (what the icons slice uses) ----
  // createNodeFromSvg gives a FRAME the size of the viewBox with one VECTOR per shape, constrained SCALE/SCALE
  // (probed in #13). resize() scales only children whose constraints are SCALE, so the order of
  // "set SCALE, then resize" matters as it does in Figma. flatten() names its result "Flattened" and resets
  // constraints to MIN, so the core has to set both.
  const nodes = new Map();
  class SceneNode {
    constructor(type, name, { x = 0, y = 0, width = 100, height = 100 } = {}) {
      this.id = `${next++}:${next++}`; this.type = type; this._name = name; this.parent = null; this.children = [];
      this._x = x; this._y = y; this.width = width; this.height = height; this._fills = []; this._description = '';
      this._constraints = { horizontal: 'MIN', vertical: 'MIN' };
      this._p = { ...LAYOUT_DEFAULTS }; this._bound = {};
      this._anchor = [-1, -1]; this._rows = []; this._cols = []; this._refs = null; this._modes = {};
      nodes.set(this.id, this);
    }
    // ---- grid auto layout (probed live in #32): switching to GRID unplaces every child (anchors -1); a child
    // appended later flows into the first free cell; placing a child on a taken cell throws ----
    get gridRowAnchorIndex() { return this._anchor[0]; }
    get gridColumnAnchorIndex() { return this._anchor[1]; }
    get gridRowCount() { return this._rows.length; }
    set gridRowCount(n) {
      if (this.children.some(c => c._anchor[0] >= n)) throw new Error(`mock: a child sits in a row past ${n}`);
      w('node.gridRowCount', this.id, n); this._rows = Array.from({ length: n }, (_, i) => this._rows[i] || { type: 'FLEX', value: 1 });
    }
    get gridColumnCount() { return this._cols.length; }
    set gridColumnCount(n) {
      if (this.children.some(c => c._anchor[1] >= n)) throw new Error(`mock: a child sits in a column past ${n}`);
      w('node.gridColumnCount', this.id, n); this._cols = Array.from({ length: n }, (_, i) => this._cols[i] || { type: 'FLEX', value: 1 });
    }
    get gridRowSizes() { return clone(this._rows); }
    set gridRowSizes(v) { if (v.length !== this._rows.length) throw new Error('mock: gridRowSizes length'); w('node.gridRowSizes', this.id, v); this._rows = v.map(x => ({ value: 1, ...x })); }
    get gridColumnSizes() { return clone(this._cols); }
    set gridColumnSizes(v) { if (v.length !== this._cols.length) throw new Error('mock: gridColumnSizes length'); w('node.gridColumnSizes', this.id, v); this._cols = v.map(x => ({ value: 1, ...x })); }
    _taken(r, c, but) { return this.children.find(k => k !== but && k._anchor[0] === r && k._anchor[1] === c) || null; }
    setGridChildPosition(r, c) {
      const g = this.parent;
      if (!g || g._p.layoutMode !== 'GRID') throw new Error('mock: setGridChildPosition needs a GRID parent');
      if (r < 0 || c < 0 || r >= g.gridRowCount || c >= g.gridColumnCount) throw new Error(`mock: cell ${r},${c} is outside the grid`);
      if (g._taken(r, c, this)) throw new Error("in setGridChildPosition: Cannot set grid child position: Can't place child at this position because it is occupied by another node");
      w('setGridChildPosition', this.id, r, c); this._anchor = [r, c];
    }
    // ---- component properties ----
    _owner() { for (let n = this; n && n.type; n = n.parent) if (n.type === 'COMPONENT') return n.parent && n.parent.type === 'COMPONENT_SET' ? n.parent : n; return null; }
    get componentPropertyReferences() { return this._refs ? { ...this._refs } : null; }
    set componentPropertyReferences(v) {
      const owner = this._owner();
      for (const [f, key] of Object.entries(v)) {
        if (!['characters', 'visible', 'mainComponent'].includes(f)) throw new Error(`mock: reference field ${f}`);
        const d = owner && owner._props[key];
        if (!d) throw new Error(`mock: no component property ${key}`);
        if ({ characters: 'TEXT', visible: 'BOOLEAN', mainComponent: 'INSTANCE_SWAP' }[f] !== d.type) throw new Error(`mock: ${f} cannot follow a ${d.type} property`);
        if (f === 'characters' && this.type !== 'TEXT') throw new Error('mock: characters references need a TEXT node');
        if (f === 'mainComponent' && this.type !== 'INSTANCE') throw new Error('mock: mainComponent references need an INSTANCE');
      }
      w('node.componentPropertyReferences', this.id, v); this._refs = { ...v };
    }
    // ---- explicit variable modes ----
    get explicitVariableModes() { return { ...this._modes }; }
    setExplicitVariableModeForCollection(col, modeId) {
      const c = collections.get(typeof col === 'string' ? col : col.id);
      c._mode(modeId);
      w('setExplicitVariableMode', this.id, c.id, modeId); this._modes[c.id] = modeId;
    }
    clearExplicitVariableModeForCollection(col) { const id = typeof col === 'string' ? col : col.id; w('clearExplicitVariableMode', this.id, id); delete this._modes[id]; }
    get boundVariables() { return clone(this._bound); }
    // Binds a FLOAT variable to a node field (or unbinds it with null); the field takes the variable's value.
    setBoundVariable(field, variable) {
      w('node.setBoundVariable', this.id, field, variable && variable.id);
      if (!variable) { for (const k of field === 'strokeWeight' ? STROKE_SIDES : [field]) delete this._bound[k]; return; }
      if (!BINDABLE.has(field)) throw new Error(`mock: field ${field} is not bindable`);
      if (variable.resolvedType !== 'FLOAT') throw new Error(`mock: ${field} needs a FLOAT variable`);
      const value = resolved(variable);
      if (field === 'width' || field === 'height') this[field] = value; else this._p[STROKE_SIDES.includes(field) ? 'strokeWeight' : field] = value;
      for (const k of field === 'strokeWeight' ? STROKE_SIDES : [field]) this._bound[k] = { type: 'VARIABLE_ALIAS', id: variable.id };
    }
    // Inside an instance, a hidden node is skipped while figma.skipInvisibleInstanceChildren is true (the default).
    _kids() { return this.children.filter(c => !(figma.skipInvisibleInstanceChildren && c._inInstance() && !c.visible)); }
    _inInstance() { for (let p = this.parent; p && p.type; p = p.parent) if (p.type === 'INSTANCE') return true; return false; }
    findAll(pred = () => true) { const out = []; const walk = n => n._kids().forEach(c => { if (pred(c)) out.push(c); walk(c); }); walk(this); return out; }
    findOne(pred) { return this.findAll(pred)[0] || null; }
    get name() { return this._name; }
    set name(v) { w('node.name', this.id, v); this._name = v; }
    get x() { return this._x; }
    set x(v) { w('node.x', this.id, v); this._x = v; }
    get y() { return this._y; }
    set y(v) { w('node.y', this.id, v); this._y = v; }
    get fills() { return clone(this._fills); }
    set fills(v) { w('node.fills', this.id, v); this._fills = clone(v); }
    get constraints() { return { ...this._constraints }; }
    set constraints(v) { w('node.constraints', this.id, v); this._constraints = { ...v }; }
    get description() { return this._description; }
    set description(v) { w('node.description', this.id, v); this._description = v; }
    get removed() { return !nodes.has(this.id); }
    appendChild(child) { this.insertChild(this.children.length, child); }
    insertChild(index, child) {
      w('appendChild', this.id, child.id);
      if (this.type === 'COMPONENT_SET' && child.type !== 'COMPONENT') throw new Error('mock: a component set holds only components');
      const from = child.parent;
      if (from) from.children = from.children.filter(n => n !== child);
      child.parent = this; this.children.splice(Math.min(index, this.children.length), 0, child);
      if (from !== this) child._anchor = [-1, -1];
      if (from !== this && this._p.layoutMode === 'GRID') {
        for (let i = 0; i < this.gridRowCount * this.gridColumnCount; i++) {
          const r = Math.floor(i / this.gridColumnCount), c = i % this.gridColumnCount;
          if (!this._taken(r, c, child)) { child._anchor = [r, c]; break; }
        }
      }
    }
    resize(width, height) {
      w('resize', this.id, width, height);
      const sx = width / this.width, sy = height / this.height;
      for (const c of this.children) {
        if (c._constraints.horizontal === 'SCALE') { c._x *= sx; c.width *= sx; }
        if (c._constraints.vertical === 'SCALE') { c._y *= sy; c.height *= sy; }
      }
      this.width = width; this.height = height;
    }
    remove() {
      w('node.remove', this.id);
      const drop = n => { nodes.delete(n.id); n.children.forEach(drop); };
      drop(this);
      if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this);
    }
  }
  for (const [k, v] of Object.entries(LAYOUT_DEFAULTS)) {
    Object.defineProperty(SceneNode.prototype, k, {
      get() {
        // Probed live (#32): a hidden child of an auto layout reports FILL sizing as FIXED; the fill is still
        // there, as layoutGrow (main axis) and layoutAlign STRETCH (cross axis).
        if ((k === 'layoutSizingHorizontal' || k === 'layoutSizingVertical') && this._p[k] === 'FILL' && this._p.visible === false) return 'FIXED';
        return k in PAINT_LISTS ? clone(this._p[k]) : this._p[k];
      },
      set(v) {
        if (k === 'layoutSizingHorizontal' || k === 'layoutSizingVertical') {
          if (v === 'HUG' && this._p.layoutMode === 'NONE' && this.type !== 'TEXT') throw new Error(`mock: HUG needs auto layout on ${this.name}`);
          if (v === 'FILL' && (!this.parent || !this.parent._p || this.parent._p.layoutMode === 'NONE')) throw new Error(`mock: FILL needs an auto layout parent for ${this.name}`);
        }
        if (k === 'layoutMode' && !['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'].includes(v)) throw new Error(`mock: layoutMode ${v}`);
        if (k === 'layoutMode' && v === 'GRID' && this._p.layoutMode !== 'GRID') {
          for (const c of this.children) c._anchor = [-1, -1];
          if (!this._rows.length) { this._rows = [{ type: 'FLEX', value: 1 }, { type: 'FLEX', value: 1 }]; this._cols = [{ type: 'FLEX', value: 1 }, { type: 'FLEX', value: 1 }]; }
        }
        w(`node.${k}`, this.id, v);
        delete this._bound[k];
        if (k === 'strokeWeight') for (const side of STROKE_SIDES) delete this._bound[side];
        this._p[k] = typeof v === 'number' ? f32(v) : k in PAINT_LISTS ? clone(v) : v;
      },
    });
  }
  Object.defineProperty(SceneNode.prototype, 'layoutGrow', { get() {
    const dir = this.parent && this.parent._p && this.parent._p.layoutMode;
    return this._p[dir === 'VERTICAL' ? 'layoutSizingVertical' : 'layoutSizingHorizontal'] === 'FILL' ? 1 : 0;
  } });
  Object.defineProperty(SceneNode.prototype, 'layoutAlign', { get() {
    const dir = this.parent && this.parent._p && this.parent._p.layoutMode;
    return this._p[dir === 'VERTICAL' ? 'layoutSizingHorizontal' : 'layoutSizingVertical'] === 'FILL' ? 'STRETCH' : 'INHERIT';
  } });
  // fills live in _fills (the icons slice's snapshot reads them); strokes and effects in _p.
  class Page extends SceneNode {
    constructor(name) { super('PAGE', name); this.loaded = false; }
    async loadAsync() { this.loaded = true; }
  }
  // Component properties live on a component set, or on a component outside one (probed live in #32: keys
  // are "<name>#<id>"; a variant's definitions can only be read from its set).
  const propsKit = {
    get componentPropertyDefinitions() {
      if (this.type === 'COMPONENT' && this.parent && this.parent.type === 'COMPONENT_SET') throw new Error('mock: read componentPropertyDefinitions from the component set');
      const out = clone(this._props);
      if (this.type === 'COMPONENT_SET') {
        const axes = {};
        for (const c of this.children) for (const part of c.name.split(', ')) { const [k, v] = part.split('='); axes[k] = axes[k] || []; if (!axes[k].includes(v)) axes[k].push(v); }
        for (const [k, vals] of Object.entries(axes)) out[k] = { type: 'VARIANT', defaultValue: vals[0], variantOptions: vals };
      }
      return out;
    },
    addComponentProperty(name, type, defaultValue, options) {
      if (!['TEXT', 'BOOLEAN', 'INSTANCE_SWAP'].includes(type)) throw new Error(`mock: property type ${type}`);
      if (type === 'INSTANCE_SWAP' && (nodes.get(defaultValue) || {}).type !== 'COMPONENT') throw new Error('mock: an INSTANCE_SWAP default is a component id');
      const key = `${name}#${next++}:0`;
      w('addComponentProperty', this.id, key);
      this._props[key] = { type, defaultValue, ...(options && options.preferredValues ? { preferredValues: clone(options.preferredValues) } : {}) };
      return key;
    },
    editComponentProperty(key, change) {
      if (!this._props[key]) throw new Error(`mock: no property ${key}`);
      w('editComponentProperty', this.id, key, change);
      if ('defaultValue' in change) this._props[key].defaultValue = change.defaultValue;
      if ('preferredValues' in change) this._props[key].preferredValues = clone(change.preferredValues);
      return key;
    },
  };
  class Component extends SceneNode {
    constructor(name, box) { super('COMPONENT', name, box); this.key = createKey(this.id); this._props = {}; }
    createInstance() { const i = new Instance(this); w('createInstance', i.id, this.id); figma.currentPage.appendChild(i); return i; }
    // every instance of this component in the file, on any page
    async getInstancesAsync() { return [...nodes.values()].filter(n => n.type === 'INSTANCE' && n._main === this); }
  }
  class ComponentSet extends SceneNode {
    constructor() { super('COMPONENT_SET', 'Component 1'); this.key = createKey(this.id); this._props = {}; }
    // the variant in the top-left cell, else the first child
    get defaultVariant() { return this._taken(0, 0, null) || this.children[0] || null; }
  }
  for (const K of [Component, ComponentSet]) Object.defineProperties(K.prototype, Object.getOwnPropertyDescriptors(propsKit));
  // An instance holds copies of its main component's children; swapComponent replaces them.
  class Instance extends SceneNode {
    constructor(main) { super('INSTANCE', main.name, { width: main.width, height: main.height }); this._main = main; this._copy(); }
    _copy() {
      const copy = (src, parent) => {
        const n = new SceneNode(src.type, src.name, { x: src._x, y: src._y, width: src.width, height: src.height });
        n._fills = clone(src._fills); n._constraints = { ...src._constraints }; n.parent = parent;
        n.children = src.children.map(c => copy(c, n));
        return n;
      };
      this.children = this._main.children.map(c => copy(c, this));
    }
    get mainComponent() { throw new Error('mock: in dynamic-page mode, use getMainComponentAsync'); }
    get componentProperties() {
      const values = this._values || {};
      return Object.fromEntries(Object.entries(this._main._props).map(([k, d]) => [k, { type: d.type, value: k in values ? values[k] : d.defaultValue }]));
    }
    setProperties(values) {
      for (const k of Object.keys(values)) if (!this._main._props[k]) throw new Error(`mock: no property ${k}`);
      w('setProperties', this.id, values); this._values = { ...(this._values || {}), ...values };
    }
    async getMainComponentAsync() { return nodes.has(this._main.id) ? this._main : null; }
    swapComponent(main) {
      w('swapComponent', this.id, main.id);
      const drop = n => { nodes.delete(n.id); n.children.forEach(drop); };
      this.children.forEach(drop);
      this._main = main; this._copy();
    }
  }
  // A TEXT node starts in Inter Regular; changing its characters or typography needs the font loaded,
  // and typography set on the node detaches its Text Style (probed live in #29).
  // It starts named "Text" with autoRename on, so its characters rename it; a name it does not have already turns
  // autoRename off, but setting "Text" again does not (seen live in #179: a Label's "Text" layer became "Label").
  class Text extends SceneNode {
    constructor() {
      super('TEXT', 'Text', { width: 0, height: 0 });
      this._fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      this._font = { family: 'Inter', style: 'Regular' }; this._size = 12; this._lh = { unit: 'AUTO' }; this._ls = { unit: 'PERCENT', value: 0 };
      this._chars = ''; this._style = ''; this._p.textAutoResize = 'NONE'; this._autoRename = true;
    }
    get name() { return this._name; }
    set name(v) { w('node.name', this.id, v); if (v !== this._name) this._autoRename = false; this._name = v; }
    get autoRename() { return this._autoRename; }
    set autoRename(v) { w('text.autoRename', this.id, v); this._autoRename = !!v; }
    _need() { if (!fonts.has(`${this._font.family}/${this._font.style}`)) throw new Error(`font not loaded: ${this._font.family} ${this._font.style}`); }
    get characters() { return this._chars; }
    set characters(v) { this._need(); w('text.characters', this.id, v); this._chars = v; if (this._autoRename) this._name = v; }
    get fontName() { return { ...this._font }; }
    set fontName(v) { this._font = { ...v }; this._need(); w('text.fontName', this.id, v); this._style = ''; }
    get fontSize() { return this._size; }
    set fontSize(v) { this._need(); w('text.fontSize', this.id, v); this._size = f32(v); this._style = ''; }
    get lineHeight() { return { ...this._lh }; }
    set lineHeight(v) { this._need(); w('text.lineHeight', this.id, v); this._lh = v.unit === 'AUTO' ? { unit: 'AUTO' } : { unit: v.unit, value: f32(v.value) }; this._style = ''; }
    get letterSpacing() { return { ...this._ls }; }
    set letterSpacing(v) { this._need(); w('text.letterSpacing', this.id, v); this._ls = { unit: v.unit, value: f32(v.value) }; this._style = ''; }
    get textStyleId() { return this._style; }
    set textStyleId(v) { throw new Error('mock: in dynamic-page mode, use setTextStyleIdAsync'); }
    async setTextStyleIdAsync(id) {
      w('text.setTextStyleIdAsync', this.id, id);
      if (!id) { this._style = ''; return; }
      const s = styles.get(id);
      if (!s) throw new Error(`unknown text style ${id}`);
      if (!fonts.has(`${s._font.family}/${s._font.style}`)) throw new Error(`font not loaded: ${s._font.family} ${s._font.style}`);
      this._font = { ...s._font }; this._size = s._size; this._lh = { ...s._lh }; this._ls = { ...s._ls }; this._style = id;
    }
  }
  const createKey = id => [...id].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261).toString(16).padStart(8, '0').repeat(5);

  // Bounds of one SVG shape, from a rect's attributes or the absolute coordinate pairs of a path.
  function shapeBox(tag, attrs, view) {
    const attr = name => { const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
    if (tag === 'rect') return { x: +(attr('x') || 0), y: +(attr('y') || 0), width: +attr('width'), height: +attr('height') };
    const nums = (attr('d') || attr('points') || '').match(/-?\d*\.?\d+/g);
    if (!nums || nums.length < 2) return { x: 0, y: 0, width: view.width, height: view.height };
    const xs = nums.filter((_, i) => i % 2 === 0).map(Number), ys = nums.filter((_, i) => i % 2 === 1).map(Number);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  const root = { children: pages.map(name => { const p = new Page(name); return p; }) };
  for (const p of root.children) p.parent = root;
  const figma = {
    fileKey,
    root,
    currentPage: root.children[0],
    async setCurrentPageAsync(page) { w('setCurrentPage', page.id); figma.currentPage = page; },
    async getNodeByIdAsync(id) { return nodes.get(id) || null; },
    createPage() {
      const p = new Page('Page');
      w('createPage', p.id);
      p.parent = root; root.children.push(p);
      return p;
    },
    createNodeFromSvg(svg) {
      const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
      if (!vb) throw new Error('mock createNodeFromSvg needs a viewBox');
      const view = { width: +vb[1], height: +vb[2] };
      const frame = new SceneNode('FRAME', 'svg', view);
      w('createNodeFromSvg', frame.id);
      frame._fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      for (const [, tag, attrs] of svg.matchAll(/<(path|rect|circle|polygon|ellipse)\b([^>]*)\/?>/g)) {
        const v = new SceneNode('VECTOR', 'Vector', shapeBox(tag, attrs, view));
        v._fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        v._constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
        v.parent = frame; frame.children.push(v);
      }
      frame.parent = figma.currentPage; figma.currentPage.children.push(frame);
      return frame;
    },
    createComponentFromNode(node) {
      if (!node.parent || node.parent.type !== 'PAGE') throw new Error('mock createComponentFromNode needs a node on a page');
      const c = new Component(node.name, { x: node._x, y: node._y, width: node.width, height: node.height });
      w('createComponentFromNode', c.id, node.id);
      c._fills = node._fills;
      for (const child of node.children) child.parent = c;
      c.children = node.children; node.children = [];
      const siblings = node.parent.children;
      siblings.splice(siblings.indexOf(node), 1, c);
      c.parent = node.parent; nodes.delete(node.id);
      return c;
    },
    flatten(list, parent) {
      if (!list.length) throw new Error('flatten needs nodes');
      const host = parent || list[0].parent;
      const x = Math.min(...list.map(n => n._x)), y = Math.min(...list.map(n => n._y));
      const box = { x, y, width: Math.max(...list.map(n => n._x + n.width)) - x, height: Math.max(...list.map(n => n._y + n.height)) - y };
      const v = new SceneNode('VECTOR', 'Flattened', box);
      w('flatten', v.id, list.map(n => n.id));
      v._fills = list[0]._fills;
      for (const n of list) { nodes.delete(n.id); n.parent.children = n.parent.children.filter(c => c !== n); }
      v.parent = host; host.children.push(v);
      return v;
    },
    combineAsVariants(list, parent) {
      if (!list.length || list.some(n => n.type !== 'COMPONENT')) throw new Error('mock: combineAsVariants needs components');
      const set = new ComponentSet();
      w('combineAsVariants', set.id, list.map(n => n.id));
      parent.appendChild(set);
      for (const n of list) set.appendChild(n);
      return set;
    },
    async loadFontAsync(font) { w('loadFont', `${font.family}/${font.style}`); fonts.add(`${font.family}/${font.style}`); },
    async getLocalTextStylesAsync() { return [...styles.values()]; },
    async getStyleByIdAsync(id) { return styles.get(id) || null; },
    mixed: Symbol('mixed'),
    skipInvisibleInstanceChildren: true,
    createComponent() { const c = new Component('Component', {}); w('createComponent', c.id); figma.currentPage.appendChild(c); return c; },
    createFrame() { const f = new SceneNode('FRAME', 'Frame'); f._fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]; w('createFrame', f.id); figma.currentPage.appendChild(f); return f; },
    createText() { const t = new Text(); w('createText', t.id); figma.currentPage.appendChild(t); return t; },
    createTextStyle() { const s = new TextStyle(); w('createTextStyle', s.id); styles.set(s.id, s); return s; },
    variables: {
      async getLocalVariableCollectionsAsync() { return [...collections.values()]; },
      async getLocalVariablesAsync(type) { return [...variables.values()].filter(v => !type || v.resolvedType === type); },
      async getVariableByIdAsync(id) { return variables.get(id) || null; },
      async getVariableCollectionByIdAsync(id) { return collections.get(id) || null; },
      createVariableCollection(name) { const c = new Collection(name); w('createVariableCollection', c.id, name); collections.set(c.id, c); return c; },
      createVariable(name, collection, type) {
        if (!collection || !collections.has(collection.id)) throw new Error('createVariable needs a local collection object');
        const v = new Variable(name, collection, type); w('createVariable', v.id, name); variables.set(v.id, v); return v;
      },
      createVariableAlias(variable) { return { type: 'VARIABLE_ALIAS', id: variable.id }; },
      // Both return a copy with the variable's value and the binding, as Figma does.
      setBoundVariableForPaint(paint, field, variable) {
        if (field !== 'color' || variable.resolvedType !== 'COLOR') throw new Error('mock: paints bind a COLOR variable to color');
        const c = resolved(variable);
        return { ...clone(paint), color: { r: c.r, g: c.g, b: c.b }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } } };
      },
      setBoundVariableForEffect(effect, field, variable) {
        const out = clone(effect);
        const value = resolved(variable);
        if (field === 'color') out.color = value; else if (field === 'offsetX') out.offset.x = value; else if (field === 'offsetY') out.offset.y = value; else out[field] = value;
        out.boundVariables = { ...(effect.boundVariables || {}), [field]: { type: 'VARIABLE_ALIAS', id: variable.id } };
        return out;
      },
    },
  };

  const tree = n => ({
    id: n.id, type: n.type, name: n.name, x: n._x, y: n._y, width: n.width, height: n.height, fills: n.fills,
    constraints: n.constraints, ...(n.type === 'COMPONENT' ? { key: n.key, description: n.description } : {}),
    children: n.children.map(tree),
  });

  // What the file holds, by Figma name, with ids, for whole-state comparisons.
  function snapshot() {
    return {
      pages: root.children.map(p => ({ id: p.id, name: p.name, children: p.children.map(tree) })),
      collections: [...collections.values()].map(c => ({
        id: c.id, name: c.name, hidden: c.hiddenFromPublishing, modes: c.modes,
        variables: [...variables.values()].filter(v => v.variableCollectionId === c.id).map(v => ({
          id: v.id, name: v.name, type: v.resolvedType, scopes: v.scopes, codeSyntax: v.codeSyntax, hidden: v.hiddenFromPublishing,
          values: c.modes.map(m => [m.name, v.valuesByMode[m.modeId]]),
        })),
      })),
      textStyles: [...styles.values()].map(s => ({
        id: s.id, name: s.name, fontName: s.fontName, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
        bound: Object.fromEntries(Object.entries(s.boundVariables).map(([k, a]) => [k, variables.get(a.id)?.name])),
      })),
    };
  }

  return { figma, log, snapshot };
}

// Runs a package file's code the way use_figma does: as an async function body with `figma` in scope.
export async function runPackage(code, figma) {
  const AsyncFunction = (async () => {}).constructor;
  return new AsyncFunction('figma', code)(figma);
}
