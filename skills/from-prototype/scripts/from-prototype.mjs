#!/usr/bin/env node
// From-Prototype (spec #343): one entry from a Prototype to Component Sets or a Handoff. This module's hand-over
// entry writes the publish copy of a signed-off Handoff's Rendering; the agent publishes it as a private Artifact.
//   node skills/from-prototype/scripts/from-prototype.mjs hand-over <handoff.json> [--out <dir under .scratch/>]
//
// hand-over exits 1 with its reason when it refuses, writing nothing.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { handoffContentHash } from '../../to-handoff/scripts/hash.mjs';
import { stampOf } from '../../to-handoff/scripts/render-html.mjs';
import { REPO_ROOT, inScratch } from '../../to-handoff/scripts/system.mjs';

// An Artifact's limits, as the Artifact tool states them: the page and each text file at most 16 MB, each binary
// file at most 15 MB, and a version at most 511 files and 256 MB in all. Past 255 files the agent publishes in
// batches to the same URL, which is no limit of the copy.
const MB = 1000 * 1000;
const LIMITS = { page: 16 * MB, file: 15 * MB, files: 511, total: 256 * MB };
const mb = bytes => `${(bytes / MB).toFixed(1)} MB`;
const unescape = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * handOver({handoffPath, out}) -> {dir, title, files, bytes}: the publish copy of a signed-off Handoff's Rendering
 * (#440, spec #343 The hand-over), written to `out` (default .scratch/from-prototype/<feature-key>/): the stamped
 * page as index.html, titled `<feature-key> handoff`, every screenshot it refers to beside it under screens/, and
 * its links rewritten from ../screens/ to screens/. `files` lists the copy's paths, the page first; `title` is the
 * Artifact's.
 * Refuses (throws, writing nothing) a Handoff not signed off, one whose signed.json doesn't match handoff.json, a
 * Rendering whose stamp isn't the signed Handoff's, a link that leaves the copy, and a copy over an Artifact's
 * limits. A copy already at `out` is replaced: its index.html and screens/ go, nothing else there.
 */
export function handOver({ handoffPath, out }) {
  const dir = dirname(handoffPath);
  const text = readFileSync(handoffPath, 'utf8');
  const h = JSON.parse(text);
  const at = out || join(REPO_ROOT, '.scratch/from-prototype', h.feature.key);
  const refuse = reason => { throw new Error(`cannot hand over ${handoffPath}: ${reason}`); };
  if (!inScratch(at)) refuse(`the copy is written only under ${join(REPO_ROOT, '.scratch')}/, not ${at}`);
  if (h.status !== 'approved') refuse(`it is not signed off (${h.status}): nothing is published before Sign-off`);
  const signedPath = join(dir, 'signed.json');
  if (!existsSync(signedPath)) refuse('there is no signed.json beside it: sign it off again');
  if (readFileSync(signedPath, 'utf8') !== text) refuse("its signed.json doesn't match handoff.json: re-run To-handoff and sign it off again");
  if (handoffContentHash(h) !== (h.approval || {}).contentHash) refuse('its content changed after Sign-off: re-run To-handoff and sign it off again');

  const pagePath = join(dir, 'renderings', 'index.html');
  if (!existsSync(pagePath)) refuse(`it has no Rendering at ${pagePath}: render it`);
  const page = readFileSync(pagePath, 'utf8');
  const stamp = (page.match(/<p class="stamp">([^<]*)<\/p>/) || [])[1];
  if (stamp !== stampOf(h)) refuse(`its Rendering's stamp reads "${stamp}", not "${stampOf(h)}": render it again`);

  // A screenshot path is relative to handoff.json and the Rendering sits in renderings/, so its links climb one
  // folder (render-html.mjs); the copy puts the page beside screens/. An Artifact takes its title from the page's
  // first <title>, so the copy's names the feature key and a later Sign-off finds the same Artifact by it.
  const title = `${h.feature.key} handoff`;
  const copy = page.replace(/((?:src|href)=")\.\.\/screens\//g, '$1screens/').replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  const leaving = [...copy.matchAll(/(?:src|href)="([^"]*\.\.\/[^"]*)"/g)].map(m => m[1]);
  if (leaving.length) refuse(`its Rendering links outside the copy: ${[...new Set(leaving)].join(', ')}`);
  const shots = [...new Set([...copy.matchAll(/(?:src|href)="(screens\/[^"]+)"/g)].map(m => unescape(m[1])))].sort();
  const absent = shots.filter(s => !existsSync(join(dir, s)));
  if (absent.length) refuse(`its Rendering refers to screenshots that aren't there: ${absent.join(', ')}`);

  const pageBytes = Buffer.byteLength(copy);
  const sizes = shots.map(s => [s, statSync(join(dir, s)).size]);
  const bytes = sizes.reduce((sum, [, n]) => sum + n, pageBytes);
  const over = [];
  if (pageBytes > LIMITS.page) over.push(`the page is ${mb(pageBytes)} (at most ${mb(LIMITS.page)})`);
  for (const [s, n] of sizes) if (n > LIMITS.file) over.push(`${s} is ${mb(n)} (at most ${mb(LIMITS.file)} a file)`);
  if (shots.length + 1 > LIMITS.files) over.push(`the copy is ${shots.length + 1} files (at most ${LIMITS.files})`);
  if (bytes > LIMITS.total) over.push(`the copy is ${mb(bytes)} in all (at most ${mb(LIMITS.total)})`);
  if (over.length) refuse(`the copy is over an Artifact's limits: ${over.join('; ')}`);

  rmSync(join(at, 'index.html'), { force: true });
  rmSync(join(at, 'screens'), { recursive: true, force: true });
  mkdirSync(join(at, 'screens'), { recursive: true });
  writeFileSync(join(at, 'index.html'), copy);
  for (const s of shots) writeFileSync(join(at, s), readFileSync(join(dir, s)));
  return { dir: at, title, files: ['index.html', ...shots], bytes };
}

function main(argv) {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' } } });
  const [command, input] = positionals;
  if (command !== 'hand-over' || !input) {
    console.error('usage: from-prototype.mjs hand-over <handoff.json> [--out <dir under .scratch/>]');
    return 1;
  }
  try {
    const r = handOver({ handoffPath: input, out: values.out });
    console.log(`wrote ${r.dir}: index.html and ${r.files.length - 1} screenshot${r.files.length === 2 ? '' : 's'}, ${mb(r.bytes)}`);
    console.log(`publish it as a private Artifact titled "${r.title}", with screens/ as its supporting files`);
    return 0;
  } catch (e) { console.error(e.message); return 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
