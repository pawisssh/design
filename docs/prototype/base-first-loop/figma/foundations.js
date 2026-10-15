// PROTOTYPE #8 use_figma body: page + proto foundations + icon atom. Idempotent by name.
// The F placeholder is replaced by run.mjs with foundations.json.
const F = __FOUNDATIONS__;
let page = figma.root.children.find(p => p.name === 'proto-8-base-first');
if (!page) { page = figma.createPage(); page.name = 'proto-8-base-first'; }
await figma.setCurrentPageAsync(page);
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
let col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c => c.name === F.collection);
if (!col) { col = figma.variables.createVariableCollection(F.collection); col.renameMode(col.modes[0].modeId, F.modes[0]); col.addMode(F.modes[1]); }
const modes = col.modes.map(m => m.modeId);
const existing = {};
for (const id of col.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); existing[v.name] = v; }
const ledger = {}; let created = 0;
const scopeOf = n => n.startsWith('text-') || n.startsWith('link-') ? ['TEXT_FILL', 'SHAPE_FILL'] : n.startsWith('button-') ? ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR']
  : n.startsWith('spacing-') ? ['GAP'] : n.startsWith('size-') || n.startsWith('icon-size') ? ['WIDTH_HEIGHT'] : ['CORNER_RADIUS'];
const group = n => n.startsWith('button-') ? 'Button' : n.startsWith('text-') ? 'Text' : n.startsWith('link-') ? 'Link' : n.startsWith('spacing-') ? 'Spacing' : n.startsWith('icon-size') ? 'Icon size' : n.startsWith('size-') ? 'Size' : 'Border radius';
async function upsert(name, type, vals) {
  const full = `${group(name)}/${name}`;
  let v = existing[full];
  if (!v) { v = figma.variables.createVariable(full, col, type); created++; }
  v.scopes = scopeOf(name);
  v.setVariableCodeSyntax('WEB', `var(--cds-${name})`);
  modes.forEach((m, i) => v.setValueForMode(m, vals[i]));
  ledger[name] = v.id;
}
for (const [n, [a, b]] of Object.entries(F.colors)) await upsert(n, 'COLOR', [hex(a), hex(b)]);
for (const [n, x] of Object.entries(F.floats)) await upsert(n, 'FLOAT', [x, x]);
const styles = await figma.getLocalTextStylesAsync();
for (const [n, t] of Object.entries(F.textStyles)) {
  const full = `proto-8/${n}`;
  let s = styles.find(s => s.name === full);
  await figma.loadFontAsync({ family: t.family, style: t.style });
  if (!s) { s = figma.createTextStyle(); s.name = full; }
  s.fontName = { family: t.family, style: t.style }; s.fontSize = t.fontSize;
  s.lineHeight = { unit: 'PIXELS', value: t.lineHeight }; s.letterSpacing = { unit: 'PIXELS', value: t.letterSpacing };
  ledger[n] = s.id;
}
// icon atom: one 16x16 component with a single flattened Vector (#13)
let icon = page.findOne(n => n.type === 'COMPONENT' && n.name === 'Add');
if (!icon) {
  const svg = figma.createNodeFromSvg('<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 7.5V3h-1v4.5H3v1h4.5V13h1V8.5H13v-1z" fill="#000"/></svg>');
  icon = figma.createComponent(); icon.name = 'Add'; icon.resize(16, 16); icon.fills = [];
  const vec = figma.flatten(svg.children.map(c => c), icon); vec.name = 'Vector';
  vec.constraints = { horizontal: 'SCALE', vertical: 'SCALE' }; svg.remove();
  page.appendChild(icon); icon.x = 0; icon.y = -120;
}
ledger['icon:add'] = icon.id;
return { pageId: page.id, collectionId: col.id, created, ledger };
