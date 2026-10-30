// Path A's reruns (#261, spec #249): the Family map carries each family's sites and answers, so a rerun asks only what is
// new and redrafts only what changed, and the owner's corrections in the map are always kept. Each test builds the
// fixture's folder from the committed answers, edits a copy of the Prototype (a sibling of the output, so the library is
// never read as Prototype JSX) and reruns without answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../../contract/scripts/io.mjs';
import { mockFigma } from '../../to-design/tests/mock-figma.mjs';
import { approveFolder } from '../scripts/approve.mjs';
import { UNRENDERED, buildFolder } from '../scripts/folder.mjs';
import { reviewModel } from '../scripts/review.mjs';
import { AT, FILE_KEY, RED, drive, exported } from './drive.mjs';
import { PATH_A as FIXTURE, PATH_A_ANSWERS as ANSWERS, PATH_A_FAMILIES as FAMILIES, read, scratch, skip, tree } from './helpers.mjs';

const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));

/** A copy of the Prototype with its folder built from the committed answers: {proto, root, dir, edit(from, to), rerun()}. */
async function world() {
  const base = scratch(), proto = join(base, 'proto'), root = join(base, 'out');
  cpSync(FIXTURE, proto, { recursive: true });
  const world = {
    proto, root, dir: join(root, 'path-a-app'),
    app: () => readFileSync(join(proto, 'src/App.tsx'), 'utf8'),
    edit(from, to) {
      const text = world.app();
      assert.ok(text.includes(from), `the fixture has ${from}`);
      writeFileSync(join(proto, 'src/App.tsx'), text.replaceAll(from, to));
    },
    mapPath: () => join(world.dir, 'path-a-app.family-map.json'),
    rerun: (answers = {}) => buildFolder({ project: proto, root, answers }),
  };
  await buildFolder({ project: proto, root, answers: read(ANSWERS) });
  return world;
}

const ICON_BASE = 'justify-center rounded p-1 text-[#';

test('a rerun with no change asks nothing and writes nothing, with no answers given', { skip }, async () => {
  const w = await world();
  const before = tree(w.root);
  const again = await w.rerun();
  assert.equal(again.extraction, null);
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.unchanged, FAMILIES);
  assert.deepEqual(again.library.written, []);
  assert.deepEqual(tree(w.root), before);
});

test('the CLI reruns with no --drafts: exit 0, nothing written', { skip }, async () => {
  const w = await world();
  const before = tree(w.root);
  const r = spawnSync(process.execPath, [FOLDER, w.proto, '--root', w.root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /library unchanged/);
  assert.match(r.stdout, /OK\s*$/);
  assert.deepEqual(tree(w.root), before);
});

test('a class edit in one family redrafts only that family', { skip }, async () => {
  const w = await world();
  w.edit(ICON_BASE, 'justify-center rounded p-1.5 text-[#');
  const again = await w.rerun();
  assert.equal(again.extraction, null, 'no answer is asked');
  assert.deepEqual(again.written, ['icon-button']);
  assert.deepEqual(again.unchanged, FAMILIES.filter(f => f !== 'icon-button'));
  assert.deepEqual(again.library.written.filter(f => f.startsWith('components/')), ['components/ui/icon-button.tsx']);
  assert.match(readFileSync(join(w.dir, 'library/components/ui/icon-button.tsx'), 'utf8'), /p-1\.5/);
});

// Combinations no site renders (#260): the Adapter's own omits, so they start unticked on the review page. Only the
// warning icon button has `disabled`, so no site shows the positive or danger one disabled; hover is never omitted.
// Cuts both cards, two plain elements in their place, so the trend chips after them keep their JSX paths.
const removeCards = w => {
  const app = w.app();
  const start = app.indexOf('      <div className={CARD}>'), end = app.indexOf('      <div className="rounded-[4px] bg-[#fef9c3]');
  writeFileSync(join(w.proto, 'src/App.tsx'), `${app.slice(0, start)}      <hr />\n      <hr />\n${app.slice(end)}`);
};
const contractOf = (w, family) => read(join(w.dir, 'contracts', `${family}.component.json`));
const approveWith = (w, edits) => approveFolder({ dir: w.dir, project: join(w.dir, 'library'), exported: exported(w.dir, edits), said: 'approve', at: AT, test: true });

test('a combination no site renders starts unticked, and approved as the page has it keeps its reason', { skip }, async () => {
  const w = await world();
  assert.deepEqual(contractOf(w, 'icon-button').selection.omit, [
    { match: { tone: 'positive', state: 'disabled' }, reason: UNRENDERED },
    { match: { tone: 'danger', state: 'disabled' }, reason: UNRENDERED },
  ]);
  assert.equal(contractOf(w, 'icon-button').selection.expectedCount, 7);
  for (const f of FAMILIES.filter(f => f !== 'icon-button')) assert.deepEqual(contractOf(w, f).selection.omit, [], f);
  await approveWith(w);
  const icon = contractOf(w, 'icon-button');
  assert.equal(icon.selection.status, 'approved');
  assert.deepEqual(icon.selection.omit.map(o => [o.match.tone, o.reason]), [['positive', UNRENDERED], ['danger', UNRENDERED]]);
});

test('the owner ticks one back: approve accepts it, and a rerun keeps the tick, a redraft included', { skip }, async () => {
  const w = await world();
  const a = await approveWith(w, { 'icon-button': m => m.selectMatching({ tone: 'positive', state: 'disabled' }, true) });
  assert.ok(a.approved.includes('icon-button'), JSON.stringify(a));
  const ticked = [{ match: { tone: 'danger', state: 'disabled' }, reason: UNRENDERED }];
  assert.deepEqual([contractOf(w, 'icon-button').selection.omit, contractOf(w, 'icon-button').selection.expectedCount], [ticked, 8]);
  assert.deepEqual((await w.rerun()).written, []);
  // A class edit redrafts icon-button: the variant the owner ticked stays ticked, the other keeps its reason.
  w.edit(ICON_BASE, 'justify-center rounded p-1.5 text-[#');
  assert.deepEqual((await w.rerun()).written, ['icon-button']);
  assert.deepEqual([contractOf(w, 'icon-button').selection.omit, contractOf(w, 'icon-button').selection.expectedCount], [ticked, 8]);
});

/** world() with its folder approved and built on the mock: {w, approve(), mock, ledger, record}. */
async function built() {
  const w = await world();
  const approve = () => approveFolder({ dir: w.dir, project: join(w.dir, 'library'), exported: exported(w.dir), said: 'approve', at: AT, test: true });
  await approve();
  const mock = mockFigma({ fileKey: FILE_KEY, pages: ['Page 1'] });
  const { n, ledger, record } = await drive({ dir: w.dir, mock });
  assert.equal(n.status, 'built', JSON.stringify(n));
  return { w, approve, mock, ledger, record };
}

test('built into Figma, a class edit in one family is reviewed, approved and sent as one update call, into its set alone', { skip }, async () => {
  const { w, approve, mock, ledger: first, record: was } = await built();
  // The owner's own edit in Figma to one of icon-button's variants: it is held, not written over (#181).
  const ids = first.sets['icon-button'].variants;
  (await mock.figma.getNodeByIdAsync(ids[0])).fills = RED;

  w.edit(ICON_BASE, 'justify-center rounded p-1.5 text-[#');
  assert.deepEqual((await w.rerun()).written, ['icon-button']);
  assert.deepEqual(reviewModel(w.dir).families.map(f => f.family), ['icon-button']);
  const a = await approve();
  assert.deepEqual([a.approved, a.kept], [['icon-button'], FAMILIES.filter(f => f !== 'icon-button')]);

  // A Foundations call that writes nothing, a read-only edit check, then the one call into icon-button's set, with
  // the variants Figma did not edit, and its coverage.
  const { n, ledger, record, steps } = await drive({ dir: w.dir, mock, ledger: first, record: was });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(n.held.map(h => [h.family, h.reason]), [['icon-button', 'edited']]);
  assert.deepEqual(steps.filter(s => s.step === 'sets').map(s => [s.family, s.plan.selection.entries.map(e => e[0])]), [['icon-button', [1, 2, 3, 4, 5, 6]]]);
  assert.ok(steps.every(s => s.family === 'icon-button' || (s.step === 'foundations' && !s.writes.length)), steps.map(s => `${s.step} ${s.family}`).join());
  assert.equal(record.coverage['icon-button'].ok, true);
  assert.deepEqual(ledger.sets['icon-button'].variants, ids);
  assert.deepEqual((await mock.figma.getNodeByIdAsync(ids[0])).fills, RED);
  for (const f of FAMILIES.filter(f => f !== 'icon-button')) assert.deepEqual(ledger.sets[f], first.sets[f], f);
  assert.deepEqual((await drive({ dir: w.dir, mock, ledger, record })).steps.filter(s => s.step === 'sets'), []);
});

test('built into Figma, a family whose sites all go is set aside, and the build names its set orphaned', { skip }, async () => {
  const { w, approve, mock, ledger: first, record: was } = await built();
  removeCards(w);
  assert.deepEqual((await w.rerun()).setAside.map(s => s.family), ['card']);
  const a = await approve();
  assert.deepEqual([a.approved, a.kept], [[], FAMILIES.filter(f => f !== 'card')]);
  const { n, steps } = await drive({ dir: w.dir, mock, ledger: first, record: was });
  assert.equal(n.status, 'built', JSON.stringify(n));
  assert.deepEqual(n.orphaned, [{ family: 'card', set: first.sets.card.set.id, variants: first.sets.card.variants.length }]);
  assert.deepEqual(steps.filter(s => s.step !== 'foundations'), [], 'no call into any set');
  assert.ok(await mock.figma.getNodeByIdAsync(first.sets.card.set.id), 'nothing in Figma is deleted');
});

test('an edited axis value keeps the names the agent gave it', { skip }, async () => {
  const w = await world();
  w.edit('text-[#16a34a] hover', 'text-[#15803d] hover');
  const again = await w.rerun();
  assert.equal(again.extraction, null, 'no answer is asked');
  assert.deepEqual(again.written, ['icon-button']);
  const icon = read(join(w.dir, 'contracts/icon-button.component.json'));
  assert.deepEqual(icon.axes.map(a => [a.key, a.values.map(v => v.key)]), [['tone', ['positive', 'danger', 'warning']], ['state', ['enabled', 'hover', 'disabled']]]);
});

test('an edit elsewhere in the file redrafts nothing', { skip }, async () => {
  const w = await world();
  const before = tree(w.root);
  w.edit('flex flex-col gap-4 p-6', 'flex flex-col gap-8 p-6');
  w.edit('<span className="text-sm">Total</span>', '<span className="text-base">Total</span>');
  const again = await w.rerun();
  assert.equal(again.extraction, null);
  assert.deepEqual(again.written, []);
  assert.deepEqual(tree(w.root), before);
});

test('a line inserted above a site keeps its family', { skip }, async () => {
  const w = await world();
  const before = tree(w.root);
  w.edit('  const [view, setView]', '  // a note\n  const margin = 0;\n  const [view, setView]');
  const again = await w.rerun();
  assert.equal(again.extraction, null);
  assert.deepEqual(again.written, []);
  // The map records no line, so it and everything generated from it are byte-identical. The report records each site's
  // line for the review page (#262), so it moves with the code and nothing else in it.
  const lines = files => Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.endsWith('.families-report.json') ? v.replace(/"line": \d+/g, '"line": 0').replace(/\.tsx:\d+"/g, '.tsx:0"') : v]));
  const now = tree(w.root);
  assert.deepEqual(lines(now), lines(before));
  const [report] = Object.keys(now).filter(k => k.endsWith('.families-report.json'));
  assert.notEqual(now[report], before[report], 'the report follows the lines');
});

test('a new repeated element is requested with the existing names offered; nothing else is asked', { skip }, async () => {
  const w = await world();
  const before = tree(w.root);
  w.edit('    </div>\n  );\n}', '      <button className="rounded-[2px] bg-[#111111] px-1">One</button>\n      <button className="rounded-[2px] bg-[#222222] px-1">Two</button>\n    </div>\n  );\n}');
  const again = await w.rerun();
  assert.equal(again.extraction.length, 1);
  const [group] = again.extraction;
  assert.equal(group.sites.length, 2);
  assert.ok(group.open.includes('family'));
  assert.deepEqual(group.families, FAMILIES);
  assert.deepEqual(tree(w.root), before, 'nothing is written while it is open');
  // Answered with an existing name, it joins that family, which keeps its recorded answers: only what the new sites add is asked.
  const joined = await w.rerun({ groups: { [group.id]: { family: 'pill-button' } } });
  assert.equal(joined.extraction.length, 1);
  assert.equal(joined.extraction[0].family, 'pill-button');
  assert.ok(joined.extraction[0].open.length && joined.extraction[0].open.every(k => k.startsWith('axes.') || k === 'grid'), joined.extraction[0].open.join());
  assert.deepEqual(tree(w.root), before);
});

test('a family a group joins keeps its recorded answers; only what it adds is asked', { skip }, async () => {
  const w = await world();
  // A third segment-style button: same paint signature as the segment's, a new site.
  w.edit('    </div>\n  );\n}', '      <button className="inline-flex items-center justify-center rounded-[6px] px-3 py-1 text-sm font-medium text-[#64748b]">Year</button>\n    </div>\n  );\n}');
  const again = await w.rerun();
  assert.equal(again.extraction, null, 'its group has a recorded site');
  assert.equal(read(w.mapPath()).families.segment.sites.length, 2);
});

test('an owner merge in the Family map survives reruns, with and without the original answers', { skip }, async () => {
  const w = await world();
  const map = read(w.mapPath());
  map.families['action-button'] = { ...map.families['action-button'], by: 'owner', evidence: ['owner: merge pill-button into action-button'],
    sites: [...map.families['action-button'].sites, ...map.families['pill-button'].sites] };
  delete map.families['pill-button'];
  writeJson(w.mapPath(), map);

  // The merged family has axes nobody named: the agent is asked for that family alone, by its known name.
  const asked = await w.rerun();
  assert.equal(asked.extraction.length, 1);
  const [request] = asked.extraction;
  assert.equal(request.family, 'action-button');
  assert.ok(request.axes.length > 0 && request.open.every(k => k.startsWith('axes.') || k === 'grid'));
  const axes = Object.fromEntries(request.axes.map((a, i) => [a.id, { key: `axis-${i}`, label: `Axis ${i}`,
    values: Object.fromEntries(a.values.map((v, j) => [v.id, { key: `value-${j}`, label: `Value ${j}` }])) }]));
  const answered = { groups: { [request.id]: { family: 'action-button', axes, grid: { columns: request.axes.map((a, i) => `axis-${i}`), rows: [] } } } };
  const built = await w.rerun(answered);
  assert.equal(built.extraction, null);
  assert.deepEqual(built.families, ['action-button', 'card', 'chip', 'icon-button', 'segment', 'trend-chip']);
  assert.deepEqual(built.setAside.map(s => s.family), ['pill-button']);
  assert.ok(existsSync(join(w.dir, 'removed/pill-button.component.json')));

  const settled = tree(w.root);
  for (const answers of [{}, read(ANSWERS)]) {
    const again = await w.rerun(answers);
    assert.equal(again.extraction, null);
    assert.deepEqual(again.written, []);
    assert.deepEqual(tree(w.root), settled);
  }
  const kept = read(w.mapPath());
  assert.equal(kept.families['action-button'].by, 'owner');
  assert.equal(kept.families['action-button'].sites.length, 2);
  assert.deepEqual(kept.families['action-button'].evidence, ['owner: merge pill-button into action-button']);
});

test('an owner rename and an owner drop in the Family map are kept', { skip }, async () => {
  const w = await world();
  const map = read(w.mapPath());
  map.families.panel = { ...map.families.card, by: 'owner', evidence: ['owner: rename card to panel'] };
  delete map.families.card;
  map.dropped = [{ ...map.families.segment.sites[0], by: 'owner', evidence: 'owner: drop segment' }];
  delete map.families.segment;
  writeJson(w.mapPath(), map);
  const again = await w.rerun();
  assert.equal(again.extraction, null, 'the renamed family is built from its recorded answers; the dropped site is not asked');
  assert.deepEqual(again.families, ['action-button', 'chip', 'icon-button', 'panel', 'pill-button', 'trend-chip']);
  assert.ok(existsSync(join(w.dir, 'library/components/ui/panel.tsx')) && !existsSync(join(w.dir, 'library/components/ui/card.tsx')));
  const settled = tree(w.root);
  const third = await w.rerun(read(ANSWERS));
  assert.deepEqual(third.written, []);
  assert.deepEqual(tree(w.root), settled);
  const kept = read(w.mapPath());
  assert.equal(kept.families.panel.by, 'owner');
  assert.equal(kept.dropped.length, 1);
  assert.equal(kept.dropped[0].by, 'owner');
});

test('removing every site of a family sets it aside', { skip }, async () => {
  const w = await world();
  removeCards(w);
  const again = await w.rerun();
  assert.equal(again.extraction, null);
  assert.deepEqual(again.families, ['action-button', 'chip', 'icon-button', 'pill-button', 'segment', 'trend-chip']);
  assert.deepEqual(again.setAside.map(s => [s.family, s.reason]), [['card', 'not used by the screens']]);
  assert.ok(existsSync(join(w.dir, 'removed/card.component.json')) && !existsSync(join(w.dir, 'contracts/card.component.json')));
  assert.ok(!existsSync(join(w.dir, 'library/components/ui/card.tsx')));
  assert.ok(!('card' in read(w.mapPath()).families));
  assert.deepEqual(again.written, [], 'the other families are untouched');
});

test('a Family map that names a site twice is refused', { skip }, async () => {
  const w = await world();
  const map = read(w.mapPath());
  map.families.card.sites.push(map.families.segment.sites[0]);
  writeJson(w.mapPath(), map);
  await assert.rejects(w.rerun(), /the Family map names src\/App\.tsx .* twice/);
});
