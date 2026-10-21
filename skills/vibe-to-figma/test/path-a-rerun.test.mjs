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
import { buildFolder } from '../scripts/folder.mjs';
import { read, scratch, skip, tree } from './helpers.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/path-a-app', import.meta.url));
const ANSWERS = fileURLToPath(new URL('./fixtures/path-a-app.answers.json', import.meta.url));
const FOLDER = fileURLToPath(new URL('../scripts/folder.mjs', import.meta.url));
const FAMILIES = ['action-button', 'card', 'icon-button', 'pill-button', 'segment'];

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

test('an edited axis value keeps the names the agent gave it', { skip }, async () => {
  const w = await world();
  w.edit('text-[#16a34a]', 'text-[#15803d]');
  const again = await w.rerun();
  assert.equal(again.extraction, null, 'no answer is asked');
  assert.deepEqual(again.written, ['icon-button']);
  const icon = read(join(w.dir, 'contracts/icon-button.component.json'));
  assert.deepEqual(icon.axes.map(a => [a.key, a.values.map(v => v.key)]), [['tone', ['positive', 'danger', 'warning']], ['state', ['enabled']]]);
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
  assert.deepEqual(tree(w.root), before, 'the map records no line, so it is byte-identical');
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
  assert.deepEqual(built.families, ['action-button', 'card', 'icon-button', 'segment']);
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
  assert.deepEqual(again.families, ['action-button', 'icon-button', 'panel', 'pill-button']);
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
  const app = w.app();
  const start = app.indexOf('      <div className={CARD}>'), end = app.indexOf('    </div>\n  );\n}');
  writeFileSync(join(w.proto, 'src/App.tsx'), app.slice(0, start) + app.slice(end));
  const again = await w.rerun();
  assert.equal(again.extraction, null);
  assert.deepEqual(again.families, ['action-button', 'icon-button', 'pill-button', 'segment']);
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
