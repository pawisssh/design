// To-handoff on a path A Prototype against its own Design System folder (#265, ADR 0016): the Prototype's elements are
// inline JSX, never imports of the Extracted Library, so each site the Family map records is a Usage of its family's
// Contract, with the axis values the extraction reads for it. The folder is Vibe-to-Figma's, built from the fixture's
// committed answers into .scratch; nothing is written under design-systems/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '../scripts/generate.mjs';
import { driftOf, review } from '../scripts/signoff.mjs';
import { loadDesignSystem } from '../scripts/system.mjs';
import { validateHandoff } from '../scripts/validate.mjs';
import { pathAFolder, skip } from '../../vibe-to-figma/test/helpers.mjs';
import { decided } from './helpers.mjs';

// What the run asks beside recognition: the two plain conditions, and the one button whose className is a function call,
// which extraction skips, so the map has no family for it.
const DECISIONS = decided({
  'condition:extra === 0': true,
  'condition:canClear': false,
  'recognise:button': { raw: true, reason: 'its className is a function call, which no family reads' },
});
const usagesOf = handoff => handoff.screens.flatMap(s => s.regions.flatMap(r => r.usages || []));

test('each mapped site is a Usage of its family\'s Contract by the Family map, with the axis values its classes give', { skip }, async () => {
  const { proto, dir } = await pathAFolder();
  const r = await generate({ prototype: proto, designSystem: dir, decisions: DECISIONS });
  assert.deepEqual(r.requests, []);
  const mapped = usagesOf(r.handoff).filter(u => u.match && u.match.by === 'family-map')
    .map(u => ({ at: u.at, contract: u.contract, tuple: u.tuple, ...(u.match.switches && { switches: u.match.switches }) }));
  assert.deepEqual(mapped, [
    { at: 'src/App.tsx:20:9', contract: 'icon-button', tuple: { tone: 'positive' } },
    { at: 'src/App.tsx:23:9', contract: 'icon-button', tuple: { tone: 'danger' } },
    { at: 'src/App.tsx:26:9', contract: 'icon-button', tuple: { tone: 'warning' } },
    // A className ternary at the site switches its axis between values: the tuple leaves it out, `switches` names them.
    { at: 'src/App.tsx:32:11', contract: 'segment', tuple: {}, switches: { selected: ['on', 'off'] } },
    { at: 'src/App.tsx:41:7', contract: 'action-button', tuple: {} },
    { at: 'src/App.tsx:48:7', contract: 'pill-button', tuple: {}, switches: { active: ['on', 'off'] } },
    { at: 'src/App.tsx:55:7', contract: 'card', tuple: {} },
    { at: 'src/App.tsx:60:7', contract: 'card', tuple: {} },
  ]);
  // The skipped site is no family: it is decided by its signature, as before.
  assert.deepEqual(usagesOf(r.handoff).filter(u => u.raw).map(u => [u.at, u.raw.element]), [['src/App.tsx:54:7', 'button']]);
  assert.deepEqual(validateHandoff(r.handoff, await loadDesignSystem(dir)).errors, []);
});

test('the review lists the Usages the Family map gave and pins the map; a rerun writes nothing', { skip }, async () => {
  const { proto, dir } = await pathAFolder();
  const first = await generate({ prototype: proto, designSystem: dir, decisions: DECISIONS });
  assert.equal(first.handoff.source.familyMap, `sha256:${createHash('sha256').update(readFileSync(join(dir, 'path-a-app.family-map.json'))).digest('hex')}`);
  const { text } = await review({ handoffPath: first.path, designSystem: dir });
  assert.match(text, /^ {2}family map sha256:/m);
  assert.match(text, /\nRecognised through the Family map \(8\)\n/);
  assert.match(text, /\n {2}[\w-]+: segment \{\} switching selected on\/off at src\/App\.tsx:32:11\n/);
  assert.match(text, /\n {2}[\w-]+: icon-button \{"tone":"danger"\} at src\/App\.tsx:23:9\n/);
  const again = await generate({ prototype: proto, designSystem: dir, decisions: DECISIONS });
  assert.equal(again.wrote, false);
});

test('a Family map that moved is Drift, and blocks sign-off', { skip }, async () => {
  const { proto, dir } = await pathAFolder();
  const r = await generate({ prototype: proto, designSystem: dir, decisions: DECISIONS });
  const file = join(dir, 'path-a-app.family-map.json');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n');
  const system = await loadDesignSystem(dir);
  assert.deepEqual(driftOf(r.handoff, system), [{ kind: 'family-map', key: 'familyMap', change: 'changed' }]);
  assert.ok((await review({ handoffPath: r.path, designSystem: dir })).blocks.includes('pinned Family map familyMap moved: re-run To-handoff'));
});

test('a Family map the code no longer gives is refused, naming the folder step', { skip }, async () => {
  const { proto, dir } = await pathAFolder();
  const app = join(proto, 'src/App.tsx');
  writeFileSync(app, readFileSync(app, 'utf8').replace('text-[#dc2626] hover:bg-[#fef2f2]', 'text-[#7c3aed] hover:bg-[#f5f3ff]'));
  await assert.rejects(generate({ prototype: proto, designSystem: dir, decisions: DECISIONS }),
    /the Family map is not what .* code gives now: run Vibe-to-Figma's folder step again/);
});

test('validate refuses a switched axis that is not one of the Contract\'s, or is also in the tuple', { skip }, async () => {
  const { proto, dir } = await pathAFolder();
  const { handoff } = await generate({ prototype: proto, designSystem: dir, decisions: DECISIONS });
  const segment = usagesOf(handoff).find(u => u.contract === 'segment');
  segment.match.switches = { selected: ['on', 'maybe'] };
  segment.tuple = { selected: 'on' };
  const system = await loadDesignSystem(dir);
  assert.match(validateHandoff(handoff, system).errors.map(e => e.message).join('\n'), /match\.switches selected is also in the tuple/);
  delete segment.tuple.selected;
  assert.match(validateHandoff(handoff, system).errors.map(e => e.message).join('\n'), /match\.switches selected "maybe" is not a/);
});
