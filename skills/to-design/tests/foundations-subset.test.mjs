// Foundations subset (#107, ADR 0006): the document carries the whole theme, and To-design builds a selected subset
// of it — the closure plus Spacing and Size by default, plus the groups the owner adds, with alias and bind targets.
// Run with `node --test skills/to-design/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foundationsPlan, stripReviewFields } from '../scripts/build-plan.mjs';
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
