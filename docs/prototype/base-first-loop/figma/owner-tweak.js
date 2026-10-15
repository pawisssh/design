// SIMULATED OWNER (orchestrator-delegated): acts like a designer in the Figma UI. Knows nothing about the Contract.
const page = await figma.getNodeByIdAsync('17:24');
await figma.setCurrentPageAsync(page);
const src = await figma.getNodeByIdAsync('18:2');
const old = page.children.find(n => n.name === '2 Base Component (owner tweaked)'); if (old) old.remove();
const copy = src.clone(); copy.name = '2 Base Component (owner tweaked)'; page.appendChild(copy); copy.x = 0; copy.y = 200;
const b = copy.children[0];
// Tweak 1 (token-backed): pick "spacing-06" from the variable picker for the gap
const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c => c.name === 'proto-8 / Foundations');
let sp06; for (const id of col.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); if (v.name === 'Spacing/spacing-06') sp06 = v; }
b.setBoundVariable('itemSpacing', sp06);
// Tweak 2 (raw, no token): nudge the label's letter spacing
const t = b.findOne(n => n.name === 'Label');
const styleBefore = t.textStyleId;
await figma.loadFontAsync(t.fontName);
t.letterSpacing = { unit: 'PIXELS', value: 0.32 };
const styleAfter = t.textStyleId;
// Tweak 3 (raw, axis-specific rule): nudge top padding 15 -> 14 while looking at Large
b.paddingTop = 14;
return { copyId: copy.id, baseId: b.id, styleBefore, styleAfter, gapBound: b.boundVariables.itemSpacing, w: b.width, h: b.height };
