// PROTOTYPE #8 driver. Usage:
//   node run.mjs emit-foundations
//   node run.mjs emit-build <contract> <frameName> <x> <y> <kind/size/state> ...   (owner view: Icon=true)
//   node run.mjs emit-readback <id> ...
//   node run.mjs diff <contract> <readback.json>            -> out/proposals.json
//   node run.mjs apply <contract> <proposals.json> <out>     -> in-place edits (strategy A)
//   node run.mjs check <contract> <readback.json>           -> per-variant diff vs its own tuple
//   node run.mjs approval <contract-before> <contract-after>
//   ./regen.sh                                            -> re-runs every offline step above from out/readback.*.json
import fs from 'node:fs';
import path from 'node:path';
import * as L from './loop.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const out = (name, s) => { fs.writeFileSync(path.join(here, 'out', name), s); console.log('wrote out/' + name); };
const F = rd(path.join(here, 'foundations.json'));
const SPECIMEN_PROPS = { icon: true }; // what the owner looks at: Icon BOOLEAN on, so gap/icon are visible
const [cmd, ...a] = process.argv.slice(2);

const anatomyTree = n => ({ name: n.name, type: n.type, ...(n.type !== 'INSTANCE' && n.children ? { children: n.children.map(anatomyTree) } : {}) });
const tupleFromName = (c, name) => Object.fromEntries(name.split(', ').map(kv => {
  const [lab, val] = kv.split('='); const ax = c.axes.find(x => x.label === lab);
  return [ax.key, ax.values.find(v => v.label === val).key];
}));

if (cmd === 'emit-foundations') {
  out('foundations.code.js', fs.readFileSync(path.join(here, 'figma/foundations.js'), 'utf8').replace('__FOUNDATIONS__', JSON.stringify(F)));
} else if (cmd === 'emit-build') {
  const [cp, frameName, x, y, ...tuples] = a; const c = rd(cp); const st = rd(path.join(here, 'out/foundations.result.json'));
  const keys = c.axes.map(x => x.key);
  const variants = tuples.map(s => { const t = Object.fromEntries(s.split('/').map((v, i) => [keys[i], v]));
    const r = L.resolve(c, t, SPECIMEN_PROPS); return { name: L.variantName(c, t), layout: r.layout, paint: r.paint, visible: r.visible }; });
  const spec = { pageId: st.pageId, ledger: st.ledger, frameName, x: +x, y: +y, variants };
  out(`build-${frameName}.code.js`, fs.readFileSync(path.join(here, 'figma/build.js'), 'utf8').replace('__SPEC__', JSON.stringify(spec)));
} else if (cmd === 'emit-readback') {
  const st = rd(path.join(here, 'out/foundations.result.json'));
  out('readback.code.js', fs.readFileSync(path.join(here, 'figma/readback.js'), 'utf8').replace('__IDS__', JSON.stringify({ pageId: st.pageId, ids: a })));
} else if (cmd === 'diff' || cmd === 'check') {
  const c = rd(a[0]); const rbs = rd(a[1]);
  const all = [];
  for (const rb of (cmd === 'diff' ? rbs.slice(0, 1) : rbs)) {
    const t = cmd === 'diff' ? L.baseTuple(c) : tupleFromName(c, rb.name);
    const exp = L.resolve(c, t, SPECIMEN_PROPS);
    const readTree = { ...rb.tree, name: c.anatomy.name }; // the variant COMPONENT is the anatomy root
    const ch = L.diff(exp, rb, F, anatomyTree(c.anatomy), readTree);
    console.log(`\n${rb.name}  (${rb.id})  ${ch.length ? ch.length + ' difference(s)' : 'MATCHES the Contract'}`);
    for (const x of ch) console.log(`  [${x.kind}] ${x.section}.${x.node}.${x.field}: ${L.show(x.from)} -> ${L.show(x.to)}${x.why ? '  (' + x.why + ')' : ''}`);
    all.push({ name: rb.name, changes: ch });
  }
  if (cmd === 'diff') {
    const props = all[0].changes.map(ch => L.proposeEdit(c, ch, F));
    console.log('\nProposed Contract edits:');
    for (const p of props) {
      const ch = p.change;
      if (!p.expressible) { console.log(`  ✗ ${ch.node}.${ch.field}: NOT expressible (${p.note})`); continue; }
      const s = p.strategies;
      console.log(`  ✓ ${ch.section}[${p.rule}] match=${JSON.stringify(p.ruleMatch)} (${p.scope}${p.widerThanBase ? ', wider than the base' : ''}) ${ch.node}.${ch.field} := ${JSON.stringify(p.newValue)}`);
      console.log(`      blast radius  A edit-in-place ${s.A_editInPlace.count}/${s.A_editInPlace.of}   B append-same-match ${s.B_appendSameMatch.count}   C append-base-only ${s.C_appendBaseOnly.count}`);
      for (const sh of p.shields) console.log(`      shielded by ${ch.section}[${sh.rule}] ${JSON.stringify(sh.match)} = ${sh.value}${sh.reason ? '  reason: ' + sh.reason : ''}`);
      if (p.tokenCandidates?.length) console.log(`      raw value equals token(s) ${p.tokenCandidates.join(', ')} -> ask the owner: bind the token instead? (never upgrade silently)`);
      if (p.tokenOutsideClosure) console.log(`      token ${p.tokenOutsideClosure} is outside the derived closure -> foundations must carry it`);
    }
    out('proposals.json', JSON.stringify(props, null, 2));
  } else out('check.json', JSON.stringify(all, null, 2));
} else if (cmd === 'apply') {
  const c = rd(a[0]); const props = rd(a[1]);
  const c2 = L.applyInPlace(c, props);
  const notes = props.filter(p => p.change.kind === 'unmapped').map(p => ({ level: 'warning', at: `layout.${p.change.node}.${p.change.field}`,
    message: `Owner tweak at Base Component review not carried: ${p.change.field} ${L.show(p.change.from)} -> ${L.show(p.change.to)} (${p.note}; in Figma it also detached the text style). Not carried; discarded when the Base Component is rebuilt from the Contract. Needs a token or a schema field.` }));
  c2.notes = [...(c2.notes || []), ...notes];
  fs.writeFileSync(a[2], JSON.stringify(c2, null, 2) + '\n'); console.log('wrote', a[2], 'closure:', [...L.closure(c2)].length, 'tokens');
} else if (cmd === 'approval') {
  const before = rd(a[0]), after = rd(a[1]);
  const at = '2026-10-16T00:00:00Z';
  const appBefore = L.approve(before, 'owner (simulated by orchestrator)', at);
  console.log('1. approve the Adapter Contract (To-preview):', JSON.stringify(appBefore.selection.approval));
  console.log('   valid?', L.approvalValid(appBefore));
  const edited = structuredClone(after); edited.selection = appBefore.selection;
  console.log('2. same approval block carried onto the owner-edited Contract:');
  console.log('   valid?', L.approvalValid(edited), ' <- Q25 (snapshotId only) still says valid');
  const re = L.approve(after, 'owner (simulated by orchestrator)', at);
  console.log('3. re-approve after the base loop:', JSON.stringify(re.selection.approval));
  console.log('   valid?', L.approvalValid(re));
  const drift = structuredClone(re); drift.layout[0].set.Button.gap = { token: 'spacing-05' };
  console.log('4. any later edit:', L.approvalValid(drift));
  const src = structuredClone(re); src.source.snapshotId = 'sha256:changed';
  console.log('5. Adapter re-run with new source:', L.approvalValid(src));
} else console.log('unknown command');
