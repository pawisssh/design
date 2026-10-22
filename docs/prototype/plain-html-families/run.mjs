// PROTOTYPE (#322), throwaway: run both ways twice on a scratch copy, diff each against its rerun, and write
// out/static.json, out/rendered.json, out/rendered.png, out/rendered-fa-free.png and out/report.md.
//   node docs/prototype/plain-html-families/run.mjs <scratch copy>/banner-app.html
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readRendered } from './rendered.mjs';
import { readStatic } from './static.mjs';

const page = process.argv[2];
if (!page || page.includes('.kane/projects')) { console.error('usage: run.mjs <scratch copy>/banner-app.html (never the original)'); process.exit(2); }
const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });

const timed = async fn => { const t = Date.now(); const r = await fn(); return [r, Date.now() - t]; };
const [s1, sMs1] = await timed(() => readStatic(page));
const [s2, sMs2] = await timed(() => readStatic(page));
const [r1, rMs1] = await timed(() => readRendered(page, { shot: out + 'rendered.png' }));
const [r2, rMs2] = await timed(() => readRendered(page));
const [rf] = await timed(() => readRendered(page, { faFree: true, shot: out + 'rendered-fa-free.png' }));

// The server's port changes every run: it is not a difference.
const norm = x => JSON.parse(JSON.stringify(x).replace(/127\.0\.0\.1:\d+/g, '<server>'));
const diff = (a, b, path = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => diff(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return [path];
};
const sDiff = diff(norm(s1), norm(s2));
const { timing: _t1, ...r1Body } = norm(r1);
const { timing: _t2, ...r2Body } = norm(r2);
const rDiff = diff(r1Body, r2Body);

writeFileSync(out + 'static.json', JSON.stringify(s1, null, 2) + '\n');
writeFileSync(out + 'rendered.json', JSON.stringify(norm(r1), null, 2) + '\n');
const icons = r => r.elements.filter(e => e.tag === 'i').map(e => `${e.label} ${e.rect.w}×${e.rect.h}${e.before ? ` ${e.before.content} in ${e.before.fontFamily}` : ''}`);
const kb = x => (JSON.stringify(x).length / 1024).toFixed(1) + ' KB';

const report = `# #322 prototype run

Page: \`${page}\`, read ${new Date().toISOString().slice(0, 10)}. Browser: ${r1.browser}, ${r1.width}px wide.

## Cost

| | static | rendered |
|---|---|---|
| wall time, run 1 / run 2 | ${sMs1} ms / ${sMs2} ms | ${rMs1} ms / ${rMs2} ms |
| of which | parse only | load ${r1.timing.load} ms, text samples ${r1.timing.textSamples} ms, read ${r1.timing.read} ms, hover and press ${r1.timing.states} ms |
| network | none | ${r1.network.filter(n => !n.url.includes('127.0.0.1')).map(n => `${n.url.replace(/^https:\/\//, '').split('/')[0]} ${n.status ?? n.failed}`).join(', ')} |
| packages | parse5 | parse5, playwright-core, a Chrome |
| output | ${kb(s1)} | ${kb(r1)} |
| rerun diff | ${sDiff.length ? sDiff.join(', ') : 'identical'} | ${rDiff.length ? `${rDiff.length} paths: ${[...new Set(rDiff.map(p => p.split('.').slice(0, 2).join('.')))].join(', ')}` : 'identical'} |

## Groups

| | static | rendered |
|---|---|---|
| elements in body | ${s1.counts.elements} | ${r1.groups.counts.elements} |
| naive groups | ${s1.counts.naiveGroups} (one per class list) | ${r1.groups.counts.naiveGroups} (one per computed signature); ${r1.groups.counts.repeatedGroups} repeated: ${r1.groups.repeated.map(g => g.join(' + ')).join('; ')} |
| similarity over every element | n/a | ${r1.groups.counts.similarGroups}: ${r1.groups.similar.map(g => g.join(' + ')).join(' · ')} |
| candidates | ${s1.counts.candidates}: interactive, own paint or own state rules | ${r1.groups.counts.candidates}: painted or pointer |
| families proposed | ${s1.families.map(f => f.family).join(', ')}; parts: ${s1.parts.map(p => `${p.part} of ${p.of}`).join(', ')} | ${r1.groups.filtered.map(g => g.join(' + ')).join(' · ')} (no names: labels shown here only) |
| merge proposals | ${s1.merges.map(m => `${m.families.join(' + ')} (jaccard ${m.jaccard}${m.samePaintToken ? ', same paint token' : ''}; differ: ${m.differ.map(d => d.property).join(', ')})`).join('; ')} | the similarity groups above |
| slots | ${s1.families.filter(f => f.slots.length).map(f => `${f.family}: ${f.slots.join(', ')}`).join('; ')} | none: no nesting rule |
| states | ${s1.families.map(f => `${f.family}: ${f.states.join(', ') || 'none'}`).join('; ')}, from \`:hover\`/\`:active\` rules | forced on ${Object.keys(r1.states).length} pointer elements: ${Object.values(r1.states).map(s => `${s.label} hover ${s.hover.bg}, pressed ${s.pressed.transform}`).join('; ')} |
| axis names | from tokens: ${Object.entries(s1.tokenAxes).map(([k, v]) => `${k}: ${v.join(' | ')}`).join('; ')} | values only, e.g. ${r1.elements.find(e => e.label === '.send-button').style['background-color']} vs ${r1.elements.find(e => e.label === '.add-button').style['background-color']} |
| icons | ${s1.icons.map(i => `${i.name} (${i.style})`).join(', ')} | ${icons(r1).join('; ')} |
| icons, Free CDN experiment | n/a | ${icons(rf).join('; ')} |
| image icon | ${s1.images.map(i => i.src).join(', ')}; unused: ${s1.unusedAssets.join(', ')} | ${r1.elements.filter(e => e.img).map(e => `${e.img.src} ${e.img.natural.join('×')}`).join(', ')} |
| script text | ${s1.script.text.map(t => `${t.target}: ${t.strings.length} strings`).join('; ')} | one element changes over ${r1.textSamples.length} samples: ${r1.groups.changingText.map(c => c.seen.map(x => `"${x}"`).join(' → ')).join('; ')} |
| inline style from script | ${s1.script.inlineStyle.map(i => `${i.target} ${i.event}: ${i.property} ${i.value}`).join('; ')} | not seen (no touch events) |
| classes toggled by script | ${s1.script.toggled.length || 'none'} | n/a |
| fonts | declared: ${s1.families.find(f => f.own['font-family'])?.own['font-family'] ?? 'n/a'} | @font-face fonts: ${r1.fonts.length ? r1.fonts.map(f => `${f.family} ${f.status}`).join(', ') : 'none'}; the text renders in whatever font this machine has installed under that name (Finnomena Trek is installed on the owner's Mac, so the metrics differ elsewhere) |
| media rules | ${s1.media.map(m => `${m.media.replace(/\n/g, ' ')} → ${m.selectors.join(', ')}`).join('; ')} | at DPR 2: ${r1.dprDiff.map(d => `${d.label} border ${d.dpr1} → ${d.dpr2}`).join('; ')} |
| browser CSSOM | n/a | ${r1.cssom.sheets.map(s => `${s.href.replace(/^https?:\/\/[^/]+\//, '')} ${s.blocked ? 'blocked (' + s.blocked + ')' : s.rules + ' rules'}`).join('; ')}; \`.send-button\` matched: ${r1.cssom.matched['.send-button'].map(m => m.selector).join(', ')} |
`;
writeFileSync(out + 'report.md', report);
console.log(report);
