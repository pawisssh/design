#!/usr/bin/env node
// To-handoff (#102): a Prototype (one HTML file or a React app folder, #114) -> a validated Handoff -> its HTML Rendering, and its Sign-off.
//   node skills/to-handoff/scripts/handoff.mjs generate <index.html | app folder> --ds <design-systems/ds> --decisions <decisions.json> [--static]
//   node skills/to-handoff/scripts/handoff.mjs validate <handoff.json> --ds <design-systems/ds>
//   node skills/to-handoff/scripts/handoff.mjs render <handoff.json> --ds <design-systems/ds> [--screenshot]
//   node skills/to-handoff/scripts/handoff.mjs review <handoff.json> --ds <design-systems/ds>
//   node skills/to-handoff/scripts/handoff.mjs answer <handoff.json> --decisions <decisions.json> --question <id> --answer "<text>"
//   node skills/to-handoff/scripts/handoff.mjs approve <handoff.json> --ds <design-systems/ds> --content-hash <h> [--proposal <key>=<hash> …]
//   node skills/to-handoff/scripts/handoff.mjs check <handoff.json> --ds <design-systems/ds> --prototype <index.html | app folder>
//
// generate runs the Prototype's scratch copy with the runtime reader (#113) for screenshots, computed text
// metrics and, on a React Prototype, computed colours (#284), unless --static; when the runtime cannot run, the
// Handoff is static-only and says why.
// generate exits 2 and prints {requests} when any decision is unanswered; it writes nothing then. A generated
// Handoff is always pending. approve is the owner's sign-off: run it only after the owner types "approve" in
// chat, with the hashes review printed (#116). It exits 1 with its reasons when it refuses; check exits 1 on Drift.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export { generate } from './generate.mjs';
export { handoffContentHash, snapshotIdOf } from './hash.mjs';
export { TEST_APPROVER, loadDesignSystem } from './system.mjs';
export { answerQuestion, approve, check, diffJson, driftOf, review } from './signoff.mjs';
export { validateHandoff } from './validate.mjs';
export { render, renderHtml, screenshotRendering } from './render-html.mjs';

import { generate } from './generate.mjs';
import { loadDesignSystem } from './system.mjs';
import { validateHandoff } from './validate.mjs';
import { render, screenshotRendering } from './render-html.mjs';
import { answerQuestion, approve, check, review } from './signoff.mjs';

// generate's requests counted by kind for stderr (#219), most first, a tie in the order asked:
// `69 requests: 44 condition, 23 recognise, 1 feature, 1 acceptance`.
const requestCounts = requests => {
  const counts = new Map();
  for (const r of requests) counts.set(r.kind, (counts.get(r.kind) || 0) + 1);
  const kinds = [...counts].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${n} ${kind}`);
  return `${requests.length} request${requests.length === 1 ? '' : 's'}: ${kinds.join(', ')}`;
};
const printDropped = dropped => { for (const x of dropped || []) console.error(`dropped owner decision ${x.key}: ${x.reason}`); };

async function main(argv) {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: {
    ds: { type: 'string' }, decisions: { type: 'string' }, static: { type: 'boolean' }, screenshot: { type: 'boolean' },
    'content-hash': { type: 'string' }, proposal: { type: 'string', multiple: true }, prototype: { type: 'string' },
    question: { type: 'string' }, answer: { type: 'string' },
  } });
  const [command, input] = positionals;
  if (!command || !input || (!values.ds && command !== 'answer')) {
    console.error('usage: handoff.mjs generate <index.html | app folder> --ds <dir> --decisions <file> [--static] | validate|render [--screenshot]|review <handoff.json> --ds <dir>'
      + ' | answer <handoff.json> --decisions <file> --question <id> --answer <text>'
      + ' | approve <handoff.json> --ds <dir> --content-hash <h> [--proposal <key>=<hash> …] | check <handoff.json> --ds <dir> --prototype <index.html | app folder>');
    return 1;
  }
  if (command === 'generate') {
    const decisions = values.decisions ? JSON.parse(readFileSync(values.decisions, 'utf8')) : {};
    const result = await generate({ prototype: input, designSystem: values.ds, decisions, runtime: !values.static });
    if (result.requests.length) console.error(requestCounts(result.requests));
    printDropped(result.dropped);
    if (result.requests.length) { console.log(JSON.stringify({ requests: result.requests }, null, 2)); return 2; }
    const check = validateHandoff(result.handoff, await loadDesignSystem(values.ds));
    if (!check.ok) { for (const e of check.errors) console.error(`[${e.rule}] ${e.message}`); return 1; }
    console.log(`${result.wrote ? 'wrote' : 'unchanged'} ${result.path} (r${result.handoff.revision}, ${result.contentHash})`);
    return 0;
  }
  if (command === 'validate') {
    const check = validateHandoff(JSON.parse(readFileSync(input, 'utf8')), await loadDesignSystem(values.ds));
    for (const e of check.errors) console.error(`[${e.rule}] ${e.message}`);
    if (check.ok) console.log(`OK ${input}`);
    return check.ok ? 0 : 1;
  }
  if (command === 'render') {
    const out = await render({ handoffPath: input, designSystem: values.ds });
    console.log(out);
    if (values.screenshot) {
      const shot = await screenshotRendering(out);
      if (shot.path) console.log(shot.path);
      else console.error(`no screenshot of the Rendering: ${shot.note}`);
    }
    return 0;
  }
  if (command === 'review') {
    const r = await review({ handoffPath: input, designSystem: values.ds });
    process.stdout.write(r.text);
    return 0;
  }
  // answer (retro, 2026-10-24) writes the owner's answer to an owner question into decisions.json, only on the
  // owner's words in chat, as approve; the next generate carries it. It needs no Design System.
  if (command === 'answer') {
    if (!values.decisions || !values.question || !values.answer) { console.error('answer needs --decisions <file> --question <id> --answer <text>'); return 1; }
    try {
      answerQuestion({ handoffPath: input, decisionsPath: values.decisions, id: values.question, answer: values.answer });
      console.log(`answered question:${values.question} in ${values.decisions}; re-run generate with it`);
      return 0;
    } catch (e) { console.error(e.message); return 1; }
  }
  if (command === 'approve') {
    if (!values['content-hash']) { console.error('approve needs --content-hash <h>, as review printed it'); return 1; }
    const proposals = {};
    for (const x of values.proposal || []) { const i = x.indexOf('='); if (i < 1) { console.error(`--proposal ${x}: expected <key>=<hash>`); return 1; } proposals[x.slice(0, i)] = x.slice(i + 1); }
    try {
      const r = await approve({ handoffPath: input, designSystem: values.ds, contentHash: values['content-hash'], proposals });
      console.log(`signed off ${input} (r${r.handoff.revision}, ${r.handoff.approval.contentHash})${r.approved.length ? `; approved ${r.approved.join(', ')}` : ''}; wrote ${r.signedPath}`);
      // The Rendering's stamp carries the status, so a Sign-off renders it again.
      console.log(`rendered ${await render({ handoffPath: input, designSystem: values.ds })}`);
      return 0;
    } catch (e) { console.error(e.message); return 1; }
  }
  if (command === 'check') {
    if (!values.prototype) { console.error('check needs --prototype <index.html | app folder>: the Handoff pins its files, not where they live'); return 1; }
    const r = await check({ handoffPath: input, designSystem: values.ds, prototype: values.prototype });
    console.log(r.verdict);
    for (const d of r.drift) console.log(`  ${d.kind} ${d.key}: ${d.change}`);
    for (const e of r.errors) console.log(`  [${e.rule}] ${e.message}`);
    return r.ok ? 0 : 1;
  }
  console.error(`unknown command ${command}`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(`FAIL: ${e.message}`); process.exitCode = 1; });
}
