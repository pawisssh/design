// PROTOTYPE, throwaway. Builds prototype-standard.html (screenshots by path) and
// prototype-standard.standalone.html (screenshots inlined) from handoff.json, signed.json and the
// live Code Library renders in index.html. Run: node prototype-standard.build.mjs
// Another Handoff: node prototype-standard.build.mjs <handoff folder> <output stem>; signed.json is optional.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] || join(here, '..'));
const stem = process.argv[3] || 'prototype-standard';
const read = p => readFileSync(join(dir, p), 'utf8');
const handoff = JSON.parse(read('handoff.json'));
const signed = existsSync(join(dir, 'signed.json')) ? JSON.parse(read('signed.json')) : null;
const index = read('renderings/index.html');

// The Code Library's CSS (Tailwind + theme Modes) is the first <style> block of the real Rendering.
const libraryCss = index.match(/<style>([\s\S]*?)<\/style>/)[1];

// Live renders and snippets per Usage, lifted from the real Rendering.
const specimens = {};
for (const chunk of index.split('<article class="card" id="usage-').slice(1)) {
  const id = chunk.slice(0, chunk.indexOf('"'));
  const lines = chunk.split('\n');
  const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  const snippet = chunk.match(/<textarea class="snippet"[^>]*>([\s\S]*?)<\/textarea>/);
  specimens[id] = {
    live: lines.find(l => l.startsWith('<div class="specimen')) || '',
    states: lines.find(l => l.startsWith('<div class="states-row')) || '',
    snippet: snippet ? unescape(snippet[1]) : '',
  };
}

// Changes since the last Sign-off, compared by id rather than by array position.
function byId(h) {
  const m = {};
  for (const s of h.screens) {
    for (const r of s.regions) {
      m[`region ${r.id}`] = { ...r, usages: undefined, text: undefined };
      for (const u of r.usages) m[`usage ${u.id}`] = u;
      for (const t of r.text) m[`text ${t.copy}`] = t;
    }
    for (const [k, v] of Object.entries(s.states)) m[`state ${k}`] = v;
  }
  for (const [k, v] of Object.entries(h.copy)) m[`copy ${k}`] = v;
  for (const q of h.openQuestions) m[`question ${q.id}`] = q;
  for (const a of h.acceptance) m[`acceptance ${a.id}`] = a;
  for (const v of h.values) m[`value ${v.id}`] = v;
  m['foundations'] = h.source.foundations;
  for (const [k, v] of Object.entries(h.source.contracts)) m[`contract ${k}`] = v;
  (h.source.notes || []).forEach(n => { m[`note “${n.text.slice(0, 48)}…”`] = n; });
  return m;
}
const before = signed ? byId(signed) : {}, after = byId(handoff);
const changes = [];
if (signed) for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const a = before[k], b = after[k];
  if (!a) changes.push({ op: '+', what: k, detail: '' });
  else if (!b) changes.push({ op: '−', what: k, detail: '' });
  else if (JSON.stringify(a) !== JSON.stringify(b)) {
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
    changes.push({ op: '~', what: k, detail: fields.join(', ') });
  }
}

const shotFiles = {};
for (const s of handoff.screens) for (const [state, v] of Object.entries(s.states))
  for (const [w, p] of Object.entries(v.screenshots || {})) if (typeof p === 'string') shotFiles[`${s.id}.${state}.${w}`] = p;
// Pixel size of each screenshot, from the PNG header.
const shotSize = Object.fromEntries(Object.entries(shotFiles).map(([k, p]) => { const b = readFileSync(join(dir, p)); return [k, [b.readUInt32BE(16), b.readUInt32BE(20)]]; }));

const js = readFileSync(join(here, 'prototype-standard.js'), 'utf8');
function page(shots) {
  const data = { stamp: index.match(/<p class="stamp">([^<]*)<\/p>/)[1], handoff, signedRevision: signed?.revision ?? null, changes, specimens, shots, shotSize };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PROTOTYPE · ${handoff.feature.name} Handoff</title>
<style>${libraryCss}</style>
</head>
<body class="x-body">
<div id="app"></div>
<script>window.DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script>${js}</script>
</body>
</html>
`;
}

const inline = Object.fromEntries(Object.entries(shotFiles).map(([k, p]) => [k, `data:image/png;base64,${readFileSync(join(dir, p)).toString('base64')}`]));
if (!process.argv[2]) writeFileSync(join(here, `${stem}.html`), page(Object.fromEntries(Object.entries(shotFiles).map(([k, p]) => [k, `../${p}`]))));
writeFileSync(join(here, `${stem}.standalone.html`), page(inline));
console.log(`specimens ${Object.keys(specimens).length}, changes ${changes.length}, shots ${Object.keys(shotFiles).length}`);
