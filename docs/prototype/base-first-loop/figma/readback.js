// PROTOTYPE #8 use_figma body: read COMPONENTs back into Contract vocabulary, independent of the Contract.
// Tokens come only from boundVariables -> variable name (last path segment) and textStyleId -> style name.
// IDS injected by run.mjs: { pageId, ids: [componentId...] }.
const S = __IDS__;
const page = await figma.getNodeByIdAsync(S.pageId);
await figma.setCurrentPageAsync(page);
const vname = async id => (await figma.variables.getVariableByIdAsync(id)).name.split('/').pop();
async function val(node, prop, rawVal) {
  const b = node.boundVariables?.[prop];
  return b ? { token: await vname(b.id) } : { raw: rawVal };
}
async function paint(paints) {
  if (paints === figma.mixed) return 'mixed';
  const vis = paints.filter(p => p.visible !== false);
  if (!vis.length) return 'none';
  const p = vis[0];
  if (p.boundVariables?.color) return { token: await vname(p.boundVariables.color.id) };
  const h = c => Math.round(c * 255).toString(16).padStart(2, '0');
  return { raw: `#${h(p.color.r)}${h(p.color.g)}${h(p.color.b)}` };
}
const tree = n => ({ name: n.name, type: n.type, ...(n.type !== 'INSTANCE' && 'children' in n && n.children.length ? { children: n.children.map(tree) } : {}) });
const align = { MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'space-between' };
const out = [];
for (const id of S.ids) {
  const b = await figma.getNodeByIdAsync(id);
  const t = b.findOne(n => n.name === 'Label'), ic = b.findOne(n => n.name === 'Icon'), g = b.findOne(n => n.name === 'Glyph');
  const vec = g.findOne(n => n.name === 'Vector');
  const style = t.textStyleId && t.textStyleId !== figma.mixed ? await figma.getStyleByIdAsync(t.textStyleId) : null;
  const r = {
    id, name: b.name, tree: tree(b),
    layout: {
      Button: {
        direction: b.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
        width: b.primaryAxisSizingMode === 'AUTO' ? 'hug' : 'fixed', height: b.counterAxisSizingMode === 'AUTO' ? 'hug' : 'fixed',
        alignMain: align[b.primaryAxisAlignItems], alignCross: align[b.counterAxisAlignItems],
        paddingTop: await val(b, 'paddingTop', b.paddingTop), paddingRight: await val(b, 'paddingRight', b.paddingRight),
        paddingBottom: await val(b, 'paddingBottom', b.paddingBottom), paddingLeft: await val(b, 'paddingLeft', b.paddingLeft),
        gap: await val(b, 'itemSpacing', b.itemSpacing), minHeight: await val(b, 'minHeight', b.minHeight),
        maxWidth: await val(b, 'maxWidth', b.maxWidth), radius: await val(b, 'topLeftRadius', b.topLeftRadius),
        strokeWeight: { raw: b.strokeWeight }, strokeAlign: b.strokeAlign.toLowerCase(),
      },
      Label: { textStyle: style ? { token: style.name.split('/').pop() } : null, textResize: t.textAutoResize.toLowerCase().replace(/_/g, '-') },
      Icon: { direction: ic.layoutMode === 'HORIZONTAL' ? 'row' : 'column', width: await val(ic, 'width', ic.width), height: await val(ic, 'height', ic.height) },
      Glyph: { width: g.layoutSizingHorizontal.toLowerCase(), height: g.layoutSizingVertical.toLowerCase() },
    },
    paint: {
      Button: { fill: await paint(b.fills), stroke: await paint(b.strokes) },
      Label: { fill: await paint(t.fills) },
      'Glyph/Vector': { fill: await paint(vec.fills) },
    },
    visible: { Icon: ic.visible, Glyph: g.visible },
    extras: { Label: { fontFamily: t.fontName.family, fontStyle: t.fontName.style, fontSize: t.fontSize,
      lineHeight: t.lineHeight.unit === 'PIXELS' ? t.lineHeight.value : t.lineHeight.unit,
      letterSpacing: t.letterSpacing.unit === 'PIXELS' ? +t.letterSpacing.value.toFixed(4) : `${t.letterSpacing.value}%` } },
    size: { w: b.width, h: b.height },
  };
  out.push(r);
}
return out;
