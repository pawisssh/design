// The Generic Adapter's agent tier (#122, ADR 0010): Drafted values with rule-fixed keys, fingerprints and anchored
// re-drafts, through components.mjs generate() and its CLI. The drafts come from fixed files
// (skills/adapter-generic/fixtures/drafts), so every run is deterministic. #65's two simulated upgrades run on copies
// of the fixture project. They need the pinned tools (node skills/adapter-generic/scripts/sources.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../scripts/components.mjs';
import { generate as library } from '../scripts/foundations.mjs';
import { FIXTURE, hasTools } from '../scripts/sources.mjs';
import { approve, validate } from '../../contract/scripts/contract.mjs';
import { writeJson } from '../../contract/scripts/io.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');
const COMMITTED_PATH = 'design-systems/shadcn/contracts/button.component.json';
const committed = JSON.parse(read(COMMITTED_PATH));
const foundations = JSON.parse(read('design-systems/shadcn/shadcn.foundations.json'));
const draftsFile = name => new URL(`../fixtures/drafts/${name}`, import.meta.url).pathname;
const drafts = name => JSON.parse(readFileSync(draftsFile(name), 'utf8')).drafts;
const CLI = new URL('../scripts/components.mjs', import.meta.url).pathname;
const skip = hasTools() ? false : 'Generic Adapter tools missing: run node skills/adapter-generic/scripts/sources.mjs';

const VARIANT_KEYS = ['axes.variant.label', ...['default', 'destructive', 'ghost', 'link', 'outline', 'secondary'].map(v => `axes.variant.values.${v}.label`)];
const SIZE_VALUES = ['default', 'icon', 'icon-lg', 'icon-sm', 'icon-xs', 'lg', 'sm', 'xs'];
const SIZE_KEYS = ['axes.size.label', ...SIZE_VALUES.map(v => `axes.size.values.${v}.label`)];
const ATTRIBUTE_KEYS = ['axes.expanded.label', 'axes.invalid.label'];
const FAMILY_KEYS = ['family.description', 'figma.grid'];
const TEXT_KEYS = ['properties.label.default']; // the Label layer's default text (#166)
const ALL_KEYS = [...SIZE_KEYS, ...VARIANT_KEYS, ...ATTRIBUTE_KEYS, ...FAMILY_KEYS, ...TEXT_KEYS].sort();

// #65's simulated upgrades (prototype/generic-drafts make-v2.mjs and make-v3.mjs), as edits per file.
const UPGRADE_1 = {
  'components/ui/button.tsx': t => t.replace('lg: "h-9 gap-1.5', 'lg: "h-10 gap-1.5'),
  'components/ui/alert.tsx': t => t.replace('        destructive:\n', '        warning: "bg-card text-amber-700 *:[svg]:text-current",\n        destructive:\n'),
  'components/ui/card.tsx': t => t.replace('import * as React from "react"', '// upgraded\nimport * as React from "react"'),
};
const UPGRADE_2 = {
  'components/ui/button.tsx': t => t.replace('        xs: ', '        xxs: '),
  'components/ui/alert.tsx': t => t.replace(' has-[>svg]:grid-cols-[auto_1fr]', ''),
  'components/ui/card.tsx': t => t
    .replace('function CardContent(', 'function CardMedia({ className, ...props }: React.ComponentProps<"div">) {\n  return <div data-slot="card-media" className={cn("aspect-video w-full overflow-hidden", className)} {...props} />\n}\n\nfunction CardContent(')
    .replace('  CardHeader,\n', '  CardHeader,\n  CardMedia,\n')
    .replace('"flex items-center rounded-b-xl', '"flex flex-col items-center rounded-b-xl')
    .replace('font-heading text-base leading-snug', 'font-heading text-lg leading-snug'),
};

// A copy of `from` with each file rewritten; every edit must change its file.
function upgrade(from, edits) {
  const dir = mkdtempSync(join(tmpdir(), 'generic-drafts-'));
  cpSync(from, dir, { recursive: true });
  for (const [file, edit] of Object.entries(edits)) {
    const before = readFileSync(join(dir, file), 'utf8');
    const after = edit(before);
    assert.notEqual(after, before, `the upgrade edit of ${file} applies`);
    writeFileSync(join(dir, file), after);
  }
  return dir;
}

// One Adapter run over a project: the Foundations document with Button, then Button's Contract.
async function run(project, opts) {
  const { doc } = await library({ project, families: ['button'] });
  return { doc, ...(await generate({ project, family: 'button', foundations: doc, ...opts })) };
}

let v2Run;
const v2 = () => (v2Run = v2Run || (async () => {
  const project = upgrade(FIXTURE, UPGRADE_1);
  return { project, ...(await run(project, { prior: committed })) };
})());

const sorted = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]));

test('from no prior Contract, the v1 drafts file gives the committed Button Contract: a draft, every entry the agent\'s', { skip }, async () => {
  const { contract, requests, report } = await generate({ project: FIXTURE, family: 'button', foundations, drafts: drafts('button.json') });
  assert.deepEqual(requests, []);
  assert.deepEqual(contract, committed);
  assert.deepEqual([contract.selection.status, contract.selection.approval], ['draft', null]);
  assert.deepEqual(Object.keys(contract.drafted), ALL_KEYS);
  assert.deepEqual(report.missing.sort(), ALL_KEYS);
  for (const [key, e] of Object.entries(contract.drafted)) {
    assert.equal(e.by, 'agent', key);
    assert.match(e.evidence[0], /^components\/ui\/button\.tsx:L\d+ /, key);
    assert.match(e.fingerprint, /^sha256:[0-9a-f]{64}$/, key);
  }
  assert.equal(contract.axes.find(a => a.key === 'size').values.find(v => v.key === 'xs').label, 'Extra Small');
  assert.deepEqual(contract.figma.grid, drafts('button.json')['figma.grid']);
  assert.ok(!contract.notes.some(n => n.at === 'figma.grid'), 'no placeholder grid note');
  assert.deepEqual(validate(contract, foundations).errors, []);
});

test('rule-made labels are not drafted: Slot and State axes, and the attribute axes\' state-word values', { skip }, () => {
  for (const key of ['icon-inline-start', 'icon-inline-end', 'state'])
    assert.ok(!Object.keys(committed.drafted).some(k => k.startsWith(`axes.${key}.`)), key);
  for (const key of ['invalid', 'expanded'])
    assert.ok(!Object.keys(committed.drafted).some(k => k.startsWith(`axes.${key}.values.`)), key);
});

test('evidence cites the line of the key it is drafted from', { skip }, () => {
  const at = key => committed.drafted[key].evidence[0];
  assert.match(at('axes.size.label'), /^components\/ui\/button\.tsx:L22 buttonVariants variants\.size: "default", "xs"/);
  assert.match(at('axes.size.values.default.label'), /:L23 size "default" in buttonVariants variants$/);
  assert.match(at('axes.size.values.icon-xs.label'), /:L29 size "icon-xs"/);
  assert.match(at('axes.invalid.label'), /aria-invalid:\S+ styles \[aria-invalid="true"\]; prefixes .*aria-invalid/);
});

test('with no prior Contract and no drafts, every subject is requested and no Contract is made', { skip }, async () => {
  const { contract, requests } = await generate({ project: FIXTURE, family: 'button', foundations });
  assert.equal(contract, null);
  assert.deepEqual(requests.map(r => r.key).sort(), ALL_KEYS);
  const xs = requests.find(r => r.key === 'axes.size.values.xs.label');
  assert.equal(xs.prior, undefined);
  assert.match(xs.evidence[0], /^components\/ui\/button\.tsx:L25 size "xs"/);
  assert.match(xs.brief, /label/i);
});

test('a re-run over the committed Contract is unchanged: every entry carried, nothing to write', { skip }, async () => {
  const { contract, unchanged, report, requests } = await generate({ project: FIXTURE, family: 'button', foundations, prior: committed });
  assert.equal(unchanged, true);
  assert.deepEqual(requests, []);
  assert.deepEqual(contract, committed);
  assert.deepEqual(sorted(report), { carried: ALL_KEYS, reopened: [], vanished: [], missing: [], owner: [], ownerCheck: [], unused: [] });
});

test('an unchanged snapshot writes nothing, so an approved Contract stays approved (CLI)', { skip }, () => {
  const out = join(mkdtempSync(join(tmpdir(), 'generic-drafts-')), 'button.component.json');
  writeJson(out, approve(committed, '2026-10-17T00:00:00Z'));
  const before = readFileSync(out, 'utf8');
  const r = spawnSync('node', [CLI, '--family', 'button', '-o', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unchanged/);
  assert.equal(readFileSync(out, 'utf8'), before);
});

test('answers for carried keys are not used, and are reported', { skip }, async () => {
  const { contract, unchanged, report } = await generate({ project: FIXTURE, family: 'button', foundations, prior: committed, drafts: drafts('button.json') });
  assert.equal(unchanged, true);
  assert.deepEqual(contract, committed);
  assert.deepEqual(report.unused.sort(), ALL_KEYS);
});

test('the CLI asks for drafts with exit code 2, writing the requests and no Contract; then the drafts file completes it', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'generic-drafts-'));
  const out = join(dir, 'button.component.json');
  const requests = join(dir, 'button.requests.json');
  const asked = spawnSync('node', [CLI, '--family', 'button', '-o', out, '--requests', requests], { encoding: 'utf8' });
  assert.equal(asked.status, 2, asked.stderr);
  assert.match(asked.stdout, /21 Drafted values needed/);
  assert.throws(() => readFileSync(out), /ENOENT/);
  const file = JSON.parse(readFileSync(requests, 'utf8'));
  assert.equal(file.family, 'button');
  assert.deepEqual(file.requests.map(r => r.key).sort(), ALL_KEYS);
  const done = spawnSync('node', [CLI, '--family', 'button', '-o', out, '--drafts', draftsFile('button.json')], { encoding: 'utf8' });
  assert.equal(done.status, 0, done.stderr);
  assert.equal(readFileSync(out, 'utf8'), read(COMMITTED_PATH));
});

test('upgrade 1 (lg h-9 to h-10; Alert and Card edited): every Button entry carried verbatim, the Contract rewritten as a draft', { skip }, async () => {
  const { contract, report, requests, unchanged } = await v2();
  assert.deepEqual(requests, []);
  assert.equal(unchanged, false);
  assert.deepEqual(sorted(report), { carried: ALL_KEYS, reopened: [], vanished: [], missing: [], owner: [], ownerCheck: [], unused: [] });
  assert.deepEqual(contract.drafted, committed.drafted);
  assert.notEqual(contract.source.snapshotId, committed.source.snapshotId);
  assert.deepEqual([contract.selection.status, contract.selection.approval], ['draft', null]);
});

test('upgrade 2 (xs renamed xxs; Alert and Card edited): size labels and family-wide keys reopen, anchored; xs vanishes; xxs is missing', { skip }, async () => {
  const prior = (await v2()).contract;
  const project = upgrade((await v2()).project, UPGRADE_2);
  const asked = await run(project, { prior });
  assert.equal(asked.contract, null);
  const reopened = [...SIZE_KEYS.filter(k => !k.includes('.xs.')), ...FAMILY_KEYS].sort();
  assert.deepEqual(sorted(asked.report), {
    carried: [...VARIANT_KEYS, ...ATTRIBUTE_KEYS, ...TEXT_KEYS].sort(), reopened, vanished: ['axes.size.values.xs.label'], missing: ['axes.size.values.xxs.label'],
    owner: [], ownerCheck: [], unused: [] });
  assert.deepEqual(asked.requests.map(r => r.key).sort(), [...reopened, 'axes.size.values.xxs.label'].sort());
  const lg = asked.requests.find(r => r.key === 'axes.size.values.lg.label');
  assert.equal(lg.prior, 'Large');
  assert.match(lg.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(lg.brief, /keep it unless the new evidence contradicts it/i);
  assert.deepEqual(asked.requests.find(r => r.key === 'figma.grid').prior, prior.figma.grid);
  assert.equal(asked.requests.find(r => r.key === 'axes.size.values.xxs.label').prior, undefined);

  const { contract, requests } = await generate({ project, family: 'button', foundations: asked.doc, prior, drafts: drafts('button.upgrade-2.json') });
  assert.deepEqual(requests, []);
  for (const key of VARIANT_KEYS) assert.deepEqual(contract.drafted[key], prior.drafted[key], `${key} carried verbatim`);
  for (const key of reopened) assert.notEqual(contract.drafted[key].fingerprint, prior.drafted[key].fingerprint, `${key} has a new fingerprint`);
  assert.equal(contract.drafted['axes.size.values.xs.label'], undefined);
  assert.equal(contract.axes.find(a => a.key === 'size').values.find(v => v.key === 'xxs').label, '2X Small');
  assert.match(contract.family.description, /2X small/);
  assert.deepEqual(validate(contract, asked.doc).errors, []);
});

test('owner entries survive an upgrade with their values, and are listed for a check when the snapshot changed', { skip }, async () => {
  const prior = structuredClone(committed);
  prior.axes.find(a => a.key === 'variant').values.find(v => v.key === 'ghost').label = 'Quiet';
  prior.drafted['axes.variant.values.ghost.label'] = { by: 'owner', was: 'Ghost' };
  prior.axes.find(a => a.key === 'size').values.find(v => v.key === 'lg').label = 'Big';
  prior.drafted['axes.size.values.lg.label'] = { by: 'owner', was: 'Large' };
  const project = (await v2()).project;
  const { contract, report } = await run(project, { prior });
  assert.equal(contract.axes.find(a => a.key === 'variant').values.find(v => v.key === 'ghost').label, 'Quiet');
  assert.equal(contract.axes.find(a => a.key === 'size').values.find(v => v.key === 'lg').label, 'Big');
  assert.deepEqual(contract.drafted['axes.variant.values.ghost.label'], { by: 'owner', was: 'Ghost' });
  assert.deepEqual(contract.drafted['axes.size.values.lg.label'], { by: 'owner', was: 'Large' });
  const owned = ['axes.size.values.lg.label', 'axes.variant.values.ghost.label'];
  assert.deepEqual(report.owner.sort(), owned);
  assert.deepEqual(report.ownerCheck.sort(), owned);
  assert.ok(!report.carried.some(k => owned.includes(k)));

  // On the unchanged snapshot an owner entry is kept and needs no check.
  const same = await generate({ project: FIXTURE, family: 'button', foundations, prior });
  assert.equal(same.unchanged, true);
  assert.deepEqual(same.report.ownerCheck, []);
});

test('an owner entry whose subject vanished is dropped and listed', { skip }, async () => {
  const prior = structuredClone((await v2()).contract);
  prior.axes.find(a => a.key === 'size').values.find(v => v.key === 'xs').label = 'Tiny';
  prior.drafted['axes.size.values.xs.label'] = { by: 'owner', was: 'Extra Small' };
  const project = upgrade((await v2()).project, UPGRADE_2);
  const { report } = await run(project, { prior, drafts: drafts('button.upgrade-2.json') });
  assert.deepEqual(report.vanished, ['axes.size.values.xs.label']);
  assert.deepEqual(report.owner, []);
});

test('a drafted value of the wrong shape is refused, naming its key', { skip }, async () => {
  const bad = (key, value) => generate({ project: FIXTURE, family: 'button', foundations, drafts: { ...drafts('button.json'), [key]: value } });
  await assert.rejects(bad('axes.size.values.xs.label', ''), /axes\.size\.values\.xs\.label: .*non-empty string/);
  await assert.rejects(bad('family.description', 42), /family\.description: .*non-empty string/);
  await assert.rejects(bad('figma.grid', { columns: ['state'], rows: ['variant', 'size'] }), /figma\.grid: .*every axis exactly once.*invalid/);
  await assert.rejects(bad('figma.grid', { columns: ['state', 'state'], rows: ['variant', 'size', 'invalid', 'expanded', 'icon-inline-start', 'icon-inline-end'] }), /figma\.grid: .*every axis exactly once/);
  await assert.rejects(bad('figma.grid', { columns: [], rows: ['state', 'variant', 'size', 'invalid', 'expanded', 'icon-inline-start', 'icon-inline-end'] }), /figma\.grid: .*columns/);
});

test('drafts for another family are refused by the CLI', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'generic-drafts-'));
  const file = join(dir, 'card.json');
  writeFileSync(file, JSON.stringify({ family: 'card', drafts: {} }));
  const r = spawnSync('node', [CLI, '--family', 'button', '-o', join(dir, 'out.json'), '--drafts', file], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /drafts for "card", not "button"/);
});

test('an unchanged snapshot keeps the owner\'s omit patch: nothing is written unless --rewrite applies the Adapter\'s rules', { skip }, async () => {
  const prior = structuredClone(committed);
  prior.selection.omit = [...prior.selection.omit, { match: { variant: 'link', size: 'icon-lg' } }];
  const same = await generate({ project: FIXTURE, family: 'button', foundations, prior });
  assert.equal(same.unchanged, true);
  assert.equal(same.contract, prior);
  const rewritten = await generate({ project: FIXTURE, family: 'button', foundations, prior, rewrite: true });
  assert.equal(rewritten.unchanged, false);
  assert.deepEqual(rewritten.contract, committed);
});

test('an owner value the subject no longer accepts is reopened, anchored on it, and listed for a check', { skip }, async () => {
  const prior = structuredClone(committed);
  prior.figma.grid = { columns: ['state'], rows: ['variant', 'size'] };
  prior.drafted['figma.grid'] = { by: 'owner', was: committed.figma.grid };
  const { contract, report, requests } = await generate({ project: FIXTURE, family: 'button', foundations, prior });
  assert.equal(contract, null);
  assert.deepEqual(report.reopened, ['figma.grid']);
  assert.deepEqual(report.ownerCheck, ['figma.grid']);
  assert.deepEqual(requests.map(r => [r.key, r.prior]), [['figma.grid', prior.figma.grid]]);
});
