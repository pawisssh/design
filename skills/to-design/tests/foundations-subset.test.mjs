// Foundations subset (#107, ADR 0006): the document carries the whole theme, and To-design builds a selected subset
// of it — the closure plus Spacing and Size by default, plus the groups the owner adds, with alias and bind targets.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationsPlan, stripReviewFields } from '../scripts/build-plan.mjs';
import { formatDiff, review } from '../scripts/base-loop.mjs';
import { recordResult, setGroups } from '../scripts/ledger.mjs';
import { mockFigma, runPackage } from './mock-figma.mjs';

const DOC_TEXT = readFileSync(new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url), 'utf8');
const CORE = new URL('../assets/builder-core.js', import.meta.url).pathname;
const PACKAGER = new URL('../scripts/package_native_builder.py', import.meta.url).pathname;
const FILE_KEY = 'MOCKFILEKEY';
const AT = '2026-10-17T00:00:00.000Z';

function pack({ docText = DOC_TEXT, ledger = null, options = {} } = {}) {
  const { plan, state } = foundationsPlan(docText, ledger, { fileKey: FILE_KEY, at: AT, ...options });
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-design-subset-')));
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  const run = spawnSync('python3', [PACKAGER, CORE, 'plan.json', 'out', '--state', 'state.json'], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return { code: readFileSync(join(root, 'out/build-components.mcp.js'), 'utf8'), out: JSON.parse(run.stdout), plan, state };
}

const call = async (mock, opts) => runPackage(pack(opts).code, mock.figma);
const names = mock => mock.snapshot().collections.flatMap(c => c.variables.map(v => v.name));

// Today's document plus theme a Contract does not use, in document order: a Primitive, a Theme group aliasing it,
// a Layer collection after Theme aliasing that group (two hops), a Fluid spacing group and an unused Text Style.
const COLLECTIONS = ['primitives', 'theme', 'layer', 'layout', 'type'];
function wholeTheme() {
  const doc = JSON.parse(DOC_TEXT);
  doc.collections.splice(2, 0, { key: 'layer', name: 'Layer', modes: [{ key: 'one', label: 'Layer 01' }, { key: 'two', label: 'Layer 02' }] });
  const themeModes = alias => Object.fromEntries(['white', 'g10', 'g90', 'g100'].map(m => [m, { alias, resolved: '#24a148' }]));
  const extra = {
    'green.50': { collection: 'primitives', name: 'Green/50', type: 'COLOR', scopes: [], codeSyntax: {}, hidden: true, values: { default: { value: '#24a148', resolved: '#24a148' } }, usedBy: [] },
    'support-success': { collection: 'theme', name: 'Support/support-success', type: 'COLOR', scopes: ['ALL_FILLS'], codeSyntax: { WEB: 'var(--cds-support-success)' }, values: themeModes('green.50'), usedBy: [] },
    'field': { collection: 'layer', name: 'Layer/field', type: 'COLOR', scopes: ['ALL_FILLS'], codeSyntax: { WEB: 'var(--cds-field)' }, values: { one: { alias: 'support-success', resolved: '#24a148' }, two: { alias: 'support-success', resolved: '#24a148' } }, usedBy: [] },
    'fluid-spacing-01': { collection: 'layout', name: 'Fluid spacing/fluid-spacing-01', type: 'FLOAT', scopes: ['GAP'], codeSyntax: {}, values: { default: { value: 0 } }, usedBy: [] },
    'heading-01-font-size': { collection: 'type', name: 'Heading/heading-01-font-size', type: 'FLOAT', scopes: ['FONT_SIZE'], codeSyntax: {}, values: { default: { value: 14 } }, usedBy: [] },
  };
  const byOrder = ([ka, a], [kb, b]) => COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection) || (ka < kb ? -1 : ka > kb ? 1 : 0);
  doc.variables = Object.fromEntries(Object.entries({ ...doc.variables, ...extra }).sort(byOrder));
  doc.textStyles['heading-01'] = { ...doc.textStyles['body-compact-01'], name: 'Heading/heading-01', usedBy: [],
    binds: { ...doc.textStyles['body-compact-01'].binds, fontSize: 'heading-01-font-size' } };
  return JSON.stringify(doc, null, 2) + '\n';
}

test("today's document is exactly the default subset, so the plan carries it whole", () => {
  assert.deepEqual(pack().plan.foundations, stripReviewFields(JSON.parse(DOC_TEXT)));
});

test('a document larger than the selection builds only the closure, Spacing, Size and their alias and bind targets', async () => {
  const docText = wholeTheme();
  const { plan } = pack({ docText });
  assert.deepEqual(Object.keys(plan.foundations.variables), Object.keys(JSON.parse(DOC_TEXT).variables));
  assert.deepEqual(Object.keys(plan.foundations.textStyles), ['body-compact-01', 'body-compact-02']);
  assert.deepEqual(plan.foundations.collections.map(c => c.key), ['primitives', 'theme', 'layout', 'type'], 'a collection with nothing selected is left out');
  assert.match(plan.documentHash, /^sha256:/);
  const mock = mockFigma({ fileKey: FILE_KEY });
  const result = await call(mock, { docText });
  assert.equal(result.summary.conflicts, 0, JSON.stringify(result.conflicts));
  assert.deepEqual(mock.snapshot().collections.map(c => c.variables.length), [20, 24, 22, 9]);
  assert.ok(!names(mock).includes('Support/support-success'));
});

test('a group the owner adds is kept in the ledger, pulls in its alias targets two hops back, and is built on every later run', async () => {
  const docText = wholeTheme();
  const doc = JSON.parse(docText);
  const ledger = setGroups(null, FILE_KEY, doc, { add: ['Layer'] });
  assert.deepEqual(ledger.foundationsGroups, ['Layer', 'Size', 'Spacing']);
  assert.throws(() => setGroups(ledger, FILE_KEY, doc, { add: ['Nope'] }), /no variable or Text Style is in group Nope/);

  const mock = mockFigma({ fileKey: FILE_KEY });
  const first = await call(mock, { docText, ledger });
  assert.equal(first.summary.conflicts, 0, JSON.stringify(first.conflicts));
  for (const name of ['Layer/field', 'Support/support-success', 'Green/50']) assert.ok(names(mock).includes(name), name);
  assert.ok(!names(mock).includes('Fluid spacing/fluid-spacing-01'));

  const recorded = recordResult(ledger, first);
  assert.deepEqual(recorded.foundationsGroups, ['Layer', 'Size', 'Spacing'], 'recording a build keeps the selection');
  mock.log.length = 0;
  const second = await call(mock, { docText, ledger: recorded });
  assert.deepEqual({ created: second.summary.created, orphaned: second.summary.orphaned }, { created: 0, orphaned: 0 });
  assert.ok(second.ledger.foundations.variables.field);
});

test('removing a group makes its variables Orphans that keep their nodes; a target another group still needs stays built', async () => {
  const docText = wholeTheme();
  const doc = JSON.parse(docText);
  const mock = mockFigma({ fileKey: FILE_KEY });
  const ledger = setGroups(null, FILE_KEY, doc, { add: ['Layer', 'Support'] });
  const built = recordResult(ledger, await call(mock, { docText, ledger }));

  const noSupport = setGroups(built, FILE_KEY, doc, { remove: ['Support'] });
  const kept = await call(mock, { docText, ledger: noSupport });
  assert.deepEqual(kept.orphaned, { variables: [], textStyles: [] }, 'Layer/field still aliases support-success');

  const noLayer = setGroups(recordResult(noSupport, kept), FILE_KEY, doc, { remove: ['Layer'] });
  assert.throws(() => setGroups(noLayer, FILE_KEY, doc, { remove: ['Layer'] }), /Layer is not a selected group/);
  mock.log.length = 0;
  const dropped = await call(mock, { docText, ledger: noLayer });
  assert.deepEqual(dropped.orphaned.variables.sort(), ['field', 'green.50', 'support-success']);
  assert.deepEqual(Object.keys(dropped.ledger.foundations.orphans.variables).sort(), ['field', 'green.50', 'support-success']);
  for (const name of ['Layer/field', 'Support/support-success', 'Green/50']) assert.ok(names(mock).includes(name), `${name} is never deleted by a run`);
  assert.deepEqual(mock.log.filter(([op]) => !['setCurrentPage', 'loadFont'].includes(op)), []);
});

// ---- a selection over the use_figma cap ----

// Builds every chunk in order, recording each result before deriving the next. Returns the ledger and the results.
async function buildInChunks(mock, docText, ledger, options = {}) {
  const of = foundationsPlan(docText, ledger, { fileKey: FILE_KEY, at: AT, ...options }).plan.chunk?.of || 1;
  const results = [];
  const plans = [];
  for (let chunk = 1; chunk <= of; chunk++) {
    const { code, plan } = pack({ docText, ledger, options: { ...options, chunk } });
    const result = await runPackage(code, mock.figma);
    assert.equal(result.summary.conflicts, 0, `chunk ${chunk}: ${JSON.stringify(result.conflicts)}`);
    ledger = recordResult(ledger, result);
    results.push(result);
    plans.push(plan);
  }
  return { ledger, results, plans };
}

test('today\'s default subset fits one call', () => {
  const { plan, out } = pack();
  assert.equal(plan.chunk, undefined);
  assert.ok(out.chars < 50000);
});

test('a selection over the budget is chunked by group, Primitives first, each chunk recorded before the next', async () => {
  const budget = 14000;
  const mock = mockFigma({ fileKey: FILE_KEY });
  const { ledger, results, plans } = await buildInChunks(mock, DOC_TEXT, null, { budget });
  const chunks = plans.map(p => p.chunk);
  assert.ok(chunks.length > 1, 'chunked');
  assert.deepEqual(chunks.map(c => c.index), chunks.map((_, i) => i + 1));
  assert.deepEqual(chunks[0].groups.slice(0, 4), ['Blue', 'Gray', 'Red', 'Neutral'], 'Primitives first, in document order');
  const groups = chunks.flatMap(c => c.groups);
  assert.equal(new Set(groups).size, groups.length, 'each group in one chunk');
  assert.deepEqual([...groups].sort(), ['Background', 'Blue', 'Body', 'Border radius', 'Button', 'Focus', 'Font family', 'Gray', 'Icon size', 'Link', 'Neutral', 'Red', 'Size', 'Spacing', 'Text']);

  assert.throws(() => foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, budget, chunk: 2 }), /chunk 1 is not recorded yet: build and record it first/);
  assert.throws(() => foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, budget, chunk: chunks.length + 1 }), /chunk \d+ of \d+/);
  assert.throws(() => foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, budget, chunk: 2, prune: ['spacing-13'] }), /prune runs with chunk 1/);

  for (const r of results) assert.deepEqual(r.orphaned, { variables: [], textStyles: [] });
  const single = mockFigma({ fileKey: FILE_KEY });
  const whole = await call(single);
  assert.deepEqual(names(mock).sort(), names(single).sort());
  assert.deepEqual(Object.keys(ledger.foundations.variables).sort(), Object.keys(whole.ledger.foundations.variables).sort());
  assert.deepEqual(Object.keys(ledger.foundations.textStyles), ['body-compact-01', 'body-compact-02']);
  assert.equal(ledger.foundations.documentHash, whole.ledger.foundations.documentHash);

  mock.log.length = 0;
  const again = await buildInChunks(mock, DOC_TEXT, ledger, { budget });
  assert.equal(again.results.reduce((n, r) => n + r.summary.created + r.summary.orphaned, 0), 0);
  assert.deepEqual(again.ledger.foundations.variables, ledger.foundations.variables);
});

test('a chunked build orphans a dropped group once, in chunk 1', async () => {
  const docText = wholeTheme();
  const doc = JSON.parse(docText);
  const budget = 14000;
  const mock = mockFigma({ fileKey: FILE_KEY });
  const { ledger } = await buildInChunks(mock, docText, setGroups(null, FILE_KEY, doc, { add: ['Layer'] }), { budget });
  assert.ok(ledger.foundations.variables.field);
  const { ledger: after, results } = await buildInChunks(mock, docText, setGroups(ledger, FILE_KEY, doc, { remove: ['Layer'] }), { budget });
  assert.deepEqual(results[0].orphaned.variables.sort(), ['field', 'green.50', 'support-success']);
  assert.deepEqual(results.slice(1).flatMap(r => r.orphaned.variables), []);
  assert.deepEqual(Object.keys(after.foundations.orphans.variables).sort(), ['field', 'green.50', 'support-success']);
  assert.equal(after.foundations.variables.field, undefined);
  assert.equal(Object.keys(after.foundations.variables).length, 75);
});

// A whole theme the size of Carbon's: 300 Primitives in 15 hue groups, 240 Theme tokens in 20 groups, all selected.
function carbonSized() {
  const doc = JSON.parse(DOC_TEXT);
  const hues = Array.from({ length: 15 }, (_, i) => `Hue${String(i).padStart(2, '0')}`);
  for (const h of hues) for (let s = 0; s < 20; s++)
    doc.variables[`${h.toLowerCase()}.${s}`] = { collection: 'primitives', name: `${h}/${s}`, type: 'COLOR', scopes: [], codeSyntax: {}, hidden: true, values: { default: { value: '#0f62fe', resolved: '#0f62fe' } }, usedBy: [] };
  for (let g = 0; g < 20; g++) for (let t = 0; t < 12; t++) {
    const p = `${hues[(g + t) % 15].toLowerCase()}.${t}`;
    doc.variables[`group${g}-token-${t}`] = { collection: 'theme', name: `Group${String(g).padStart(2, '0')}/group${g}-token-${t}`, type: 'COLOR', scopes: ['ALL_FILLS', 'STROKE_COLOR'],
      codeSyntax: { WEB: `var(--cds-group${g}-token-${t})` }, values: Object.fromEntries(['white', 'g10', 'g90', 'g100'].map(m => [m, { alias: p, resolved: '#0f62fe' }])), usedBy: [] };
  }
  const order = ['primitives', 'theme', 'layout', 'type'];
  doc.variables = Object.fromEntries(Object.entries(doc.variables).sort(([ka, a], [kb, b]) => order.indexOf(a.collection) - order.indexOf(b.collection) || (ka < kb ? -1 : ka > kb ? 1 : 0)));
  return { docText: JSON.stringify(doc, null, 2) + '\n', groups: [...hues, ...Array.from({ length: 20 }, (_, g) => `Group${String(g).padStart(2, '0')}`)] };
}

test('every chunk of a Carbon-sized selection packages under the 50,000-char cap with its full ledger state', async () => {
  const { docText, groups } = carbonSized();
  const ledger = setGroups(null, FILE_KEY, JSON.parse(docText), { add: groups });
  const mock = mockFigma({ fileKey: FILE_KEY });
  const { ledger: built, results } = await buildInChunks(mock, docText, ledger);
  assert.ok(results.length > 1, `${results.length} chunks`);
  assert.equal(Object.keys(built.foundations.variables).length, 75 + 300 + 240);
  // the package of each chunk again, now with every id recorded in its state
  const of = results.length;
  for (let chunk = 1; chunk <= of; chunk++) {
    const { out } = pack({ docText, ledger: built, options: { chunk } });
    assert.ok(out.chars < 50000, `chunk ${chunk} is ${out.chars} chars`);
  }
});

test('a group too large for one call is refused by name', () => {
  assert.throws(() => foundationsPlan(DOC_TEXT, null, { fileKey: FILE_KEY, budget: 9000 }), /group Button .* does not fit one call/);
});

// ---- CLIs ----

test('ledger.mjs groups adds and removes the owner\'s groups in the given ledger, and build-plan derives from them', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'subset-cli-')));
  const docPath = join(dir, 'whole.foundations.json');
  writeFileSync(docPath, wholeTheme());
  const at = join(dir, `${FILE_KEY}.ledger.json`);
  const ledgerCli = fileURLToPath(new URL('../scripts/ledger.mjs', import.meta.url));
  const planCli = fileURLToPath(new URL('../scripts/build-plan.mjs', import.meta.url));
  const groups = (...args) => spawnSync('node', [ledgerCli, 'groups', '--doc', docPath, '--file-key', FILE_KEY, '--ledger', at, ...args], { cwd: dir, encoding: 'utf8' });

  const added = groups('--add', 'Layer', '--add', 'Fluid spacing');
  assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(JSON.parse(added.stdout).groups, ['Fluid spacing', 'Layer', 'Size', 'Spacing']);
  assert.deepEqual(JSON.parse(readFileSync(at, 'utf8')).foundationsGroups, ['Fluid spacing', 'Layer', 'Size', 'Spacing']);
  const removed = groups('--remove', 'Fluid spacing');
  assert.deepEqual(JSON.parse(removed.stdout).groups, ['Layer', 'Size', 'Spacing']);
  assert.equal(groups('--add', 'Nope').status, 1);

  const plan = spawnSync('node', [planCli, 'foundations', '--doc', docPath, '--file-key', FILE_KEY, '--ledger', at, '--out', join(dir, 'run'), '--chunk', '1'], { cwd: dir, encoding: 'utf8' });
  assert.equal(plan.status, 0, plan.stderr);
  assert.deepEqual(JSON.parse(plan.stdout).chunk, { index: 1, of: 1 });
  assert.ok(JSON.parse(readFileSync(join(dir, 'run', 'plan.json'), 'utf8')).foundations.variables.field);
});

// ---- the base-loop picker ----

test('the base-loop picker offers every document token with the typed value and marks the ones this file has not built', () => {
  const fix = new URL('./fixtures/base-loop/', import.meta.url);
  const contract = JSON.parse(readFileSync(new URL('button.component.json', fix), 'utf8'));
  const typed24 = JSON.parse(readFileSync(new URL('readback.typed24.json', fix), 'utf8'))[0];
  const doc = JSON.parse(DOC_TEXT);
  doc.variables['fluid-spacing-03'] = { ...doc.variables['spacing-06'], name: 'Fluid spacing/fluid-spacing-03', usedBy: [] };
  const built = Object.fromEntries(Object.keys(JSON.parse(DOC_TEXT).variables).map((n, i) => [n, `VariableID:1:${i}`]));

  const [gap] = review(contract, typed24, doc, { built }).proposals;
  assert.deepEqual(gap.tokenCandidates, ['fluid-spacing-03', 'spacing-06']);
  assert.deepEqual(gap.unbuiltGroups, { 'fluid-spacing-03': 'Fluid spacing' });
  assert.match(formatDiff(contract, typed24, review(contract, typed24, doc, { built })), /token\(s\) fluid-spacing-03 \(not built: add group Fluid spacing\), spacing-06 /);

  const [unknown] = review(contract, typed24, doc).proposals;
  assert.deepEqual(unknown.unbuiltGroups, {}, 'without the ledger nothing is marked');
});

test('binding a token this file has not built cannot be carried until its group is added', () => {
  const fix = new URL('./fixtures/base-loop/', import.meta.url);
  const contract = JSON.parse(readFileSync(new URL('button.component.json', fix), 'utf8'));
  const tweaked = JSON.parse(readFileSync(new URL('readback.tweaked.json', fix), 'utf8'))[0];
  const doc = JSON.parse(DOC_TEXT);
  const edit = review(contract, tweaked, doc).proposals.find(p => p.change.kind === 'token-edit');
  const token = edit.newValue.token;
  const built = Object.fromEntries(Object.keys(doc.variables).filter(n => n !== token).map(n => [n, 'id']));
  const refused = review(contract, tweaked, doc, { built }).proposals.find(p => p.id === edit.id);
  assert.equal(refused.problem, `token "${token}" is not built in this file: add group ${doc.variables[token].name.split('/')[0]} (ledger.mjs groups --add) and rebuild foundations`);
  assert.equal(edit.problem, undefined);
});

test('a Mode selector, a COLOR value\'s from.css and a component token\'s family stay out of the package; the core needs none', async () => {
  const doc = JSON.parse(DOC_TEXT);
  doc.collections.find(c => c.key === 'theme').modes.forEach(m => { m.selector = `.cds--${m.key}`; });
  doc.variables.background.values.white.from = { css: 'var(--cds-background, #ffffff)' };
  doc.variables['button-primary'].family = 'button';
  const docText = JSON.stringify(doc, null, 2) + '\n';
  const { plan } = pack({ docText });
  const text = JSON.stringify(plan.foundations);
  assert.ok(!text.includes('"selector":') && !text.includes('"css":') && !text.includes('"family":'));
  const a = mockFigma({ fileKey: FILE_KEY });
  const b = mockFigma({ fileKey: FILE_KEY });
  await call(a, { docText });
  await call(b);
  assert.deepEqual(a.snapshot(), b.snapshot());
});
