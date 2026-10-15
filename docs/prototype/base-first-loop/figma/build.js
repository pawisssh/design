// PROTOTYPE #8 use_figma body: build resolved variants (from loop.resolve) as COMPONENTs.
// Replaces an existing frame of the same name (rebuild, not patch). SPEC injected by run.mjs.
const S = __SPEC__;
const page = await figma.getNodeByIdAsync(S.pageId);
await figma.setCurrentPageAsync(page);
const V = async name => { const id = S.ledger[name]; if (!id) throw new Error('no ledger entry ' + name); return figma.variables.getVariableByIdAsync(id); };
const old = page.children.find(n => n.name === S.frameName); if (old) old.remove();
const wrap = figma.createAutoLayout('HORIZONTAL', { name: S.frameName, itemSpacing: 40, paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 });
page.appendChild(wrap); wrap.x = S.x; wrap.y = S.y; wrap.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
await figma.loadFontAsync({ family: 'IBM Plex Sans', style: 'Regular' });
const iconMain = await figma.getNodeByIdAsync(S.ledger['icon:add']);
const FIELD = { paddingTop: 'paddingTop', paddingRight: 'paddingRight', paddingBottom: 'paddingBottom', paddingLeft: 'paddingLeft', gap: 'itemSpacing', minHeight: 'minHeight', maxWidth: 'maxWidth', width: 'width', height: 'height' };
async function num(node, field, val) {
  const prop = FIELD[field];
  if (val && val.token) node.setBoundVariable(prop, await V(val.token));
  else if (val && 'raw' in val) node[prop] = val.raw;
}
async function paint(val) {
  if (!val || val === 'none') return [];
  const p = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
  return [figma.variables.setBoundVariableForPaint(p, 'color', await V(val.token))];
}
const out = [];
for (const s of S.variants) {
  const L = s.layout, P = s.paint;
  const b = figma.createComponent(); b.name = s.name; wrap.appendChild(b);
  b.layoutMode = 'HORIZONTAL'; b.primaryAxisSizingMode = 'AUTO'; b.counterAxisSizingMode = 'AUTO';
  b.primaryAxisAlignItems = 'MIN'; b.counterAxisAlignItems = 'MIN';
  for (const f of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'minHeight', 'maxWidth']) await num(b, f, L.Button[f]);
  if (L.Button.radius?.token) { const v = await V(L.Button.radius.token); for (const c of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) b.setBoundVariable(c, v); }
  b.strokeWeight = L.Button.strokeWeight.raw; b.strokeAlign = 'INSIDE';
  b.fills = await paint(P.Button.fill); b.strokes = await paint(P.Button.stroke);
  const t = figma.createText(); t.name = 'Label'; b.appendChild(t);
  await t.setTextStyleIdAsync(S.ledger[L.Label.textStyle.token]);
  t.characters = s.label || 'Button'; t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.fills = await paint(P.Label.fill);
  const ic = figma.createFrame(); ic.name = 'Icon'; b.appendChild(ic); ic.fills = []; ic.layoutMode = 'HORIZONTAL';
  ic.primaryAxisSizingMode = 'FIXED'; ic.counterAxisSizingMode = 'FIXED';
  await num(ic, 'width', L.Icon.width); await num(ic, 'height', L.Icon.height);
  const g = iconMain.createInstance(); g.name = 'Glyph'; ic.appendChild(g);
  g.layoutSizingHorizontal = 'FILL'; g.layoutSizingVertical = 'FILL';
  const vec = g.findOne(n => n.name === 'Vector'); vec.fills = await paint(P['Glyph/Vector'].fill);
  if (s.visible.Glyph === false) g.visible = false;
  if (s.visible.Icon === false) ic.visible = false;
  out.push({ id: b.id, name: s.name, w: b.width, h: b.height });
}
return { frameId: wrap.id, variants: out };
