#!/usr/bin/env node
// To-handoff (#102, tracer #112): a single-HTML-file Prototype -> a validated Handoff -> its HTML Rendering.
//   node skills/to-handoff/scripts/handoff.mjs generate <index.html> --ds <design-systems/ds> --decisions <decisions.json> [--static]
//   node skills/to-handoff/scripts/handoff.mjs validate <handoff.json> --ds <design-systems/ds>
//   node skills/to-handoff/scripts/handoff.mjs render <handoff.json> --ds <design-systems/ds>
//
// generate runs the Prototype's scratch copy with the runtime reader (#113) for screenshots and computed text
// metrics, unless --static; when the runtime cannot run, the Handoff is static-only and says why.
// generate exits 2 and prints {requests} when any decision is unanswered; it writes nothing then. Sign-off
// (review, approve) is the owner's and is not here: a generated Handoff is always pending.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export { generate, handoffContentHash, snapshotIdOf } from './generate.mjs';
export { loadDesignSystem } from './system.mjs';
export { validateHandoff } from './validate.mjs';
export { render, renderHtml } from './render-html.mjs';

import { generate } from './generate.mjs';
import { loadDesignSystem } from './system.mjs';
import { validateHandoff } from './validate.mjs';
import { render } from './render-html.mjs';

async function main(argv) {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { ds: { type: 'string' }, decisions: { type: 'string' }, static: { type: 'boolean' } } });
  const [command, input] = positionals;
  if (!command || !input || !values.ds) {
    console.error('usage: handoff.mjs generate <index.html> --ds <dir> --decisions <file> [--static] | validate <handoff.json> --ds <dir> | render <handoff.json> --ds <dir>');
    return 1;
  }
  if (command === 'generate') {
    const decisions = values.decisions ? JSON.parse(readFileSync(values.decisions, 'utf8')) : {};
    const result = await generate({ prototype: input, designSystem: values.ds, decisions, runtime: !values.static });
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
    console.log(await render({ handoffPath: input, designSystem: values.ds }));
    return 0;
  }
  console.error(`unknown command ${command}`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(`FAIL: ${e.message}`); process.exitCode = 1; });
}
