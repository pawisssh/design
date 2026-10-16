// A mock of the part of the Figma Plugin API the builder core uses, for node tests.
// It follows the behavior probed live in #27: setDefaultMode moves a mode to index 0 and keeps the
// others in order, numbers are stored as float32, and scopes outside the API enum throw.
// Every call that writes (or loads a font, or switches page) is appended to `log`.

const SCOPES = new Set(['ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL',
  'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'COLOR_OPACITY',
  'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT']);
const WEIGHTS = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' };
const f32 = Math.fround;
const clone = x => JSON.parse(JSON.stringify(x));

export function mockFigma({ fileKey = 'MOCKFILEKEY', pages = ['Page 1'] } = {}) {
  let next = 1;
  const log = [];
  const collections = new Map();
  const variables = new Map();
  const styles = new Map();
  const fonts = new Set();
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
      else if (field === 'fontWeight') this._font = { ...this._font, style: WEIGHTS[Math.round(value / 100) * 100] || 'Regular' };
      else if (field === 'fontSize') this._size = value;
      else if (field === 'lineHeight') this._lh = { unit: 'PIXELS', value };
      else if (field === 'letterSpacing') this._ls = { unit: 'PIXELS', value };
      else throw new Error(`unsupported text style field ${field}`);
      this._bound[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
    }
    remove() { w('style.remove', this.id); styles.delete(this.id); }
    _needFont(font) { if (!fonts.has(`${font.family}/${font.style}`)) throw new Error(`font not loaded: ${font.family} ${font.style}`); }
  }

  const root = { children: pages.map(name => ({ id: `0:${next++}`, type: 'PAGE', name })) };
  const figma = {
    fileKey,
    root,
    currentPage: root.children[0],
    async setCurrentPageAsync(page) { w('setCurrentPage', page.id); figma.currentPage = page; },
    async loadFontAsync(font) { w('loadFont', `${font.family}/${font.style}`); fonts.add(`${font.family}/${font.style}`); },
    async getLocalTextStylesAsync() { return [...styles.values()]; },
    async getStyleByIdAsync(id) { return styles.get(id) || null; },
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
    },
  };

  // What the file holds, by Figma name, with ids, for whole-state comparisons.
  function snapshot() {
    return {
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
