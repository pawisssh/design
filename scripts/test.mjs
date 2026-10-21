// `npm test`: every skill's node:test suite, started through run() so the slowest files go first.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import { run } from 'node:test';
import * as builtin from 'node:test/reporters';

// Slowest first, from recent CI job summaries. A file listed here that no longer exists is ignored.
const SLOWEST = [
  'skills/to-design/tests/sets.test.mjs',
  'skills/to-handoff/test/recorded.test.mjs',
  'skills/to-handoff/test/runtime.test.mjs',
  'skills/to-handoff/test/react.test.mjs',
  'skills/to-handoff/test/shadcn.test.mjs',
  'skills/vibe-to-figma/test/rerun.test.mjs',
  'skills/vibe-to-figma/test/build.test.mjs',
  'skills/vibe-to-figma/test/approve.test.mjs',
  'skills/adapter-generic/test/drafts.test.mjs',
  'skills/vibe-to-figma/test/held.test.mjs',
];

const root = resolve(import.meta.dirname, '..');

// skills/*/test/*.test.mjs and skills/*/tests/*.test.mjs. The `node --test` CLI sorts files alphabetically whatever
// order they are passed in, so a long file can start late and stretch the end of the run; run() keeps the order it is
// given, so the slowest files go first and the rest follow in sorted order.
function testFiles() {
  const found = [];
  for (const skill of readdirSync(join(root, 'skills')).sort()) {
    for (const dir of ['test', 'tests']) {
      let names;
      try { names = readdirSync(join(root, 'skills', skill, dir)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      for (const name of names.sort()) if (name.endsWith('.test.mjs')) found.push(`skills/${skill}/${dir}/${name}`);
    }
  }
  const slow = SLOWEST.filter(f => found.includes(f));
  return [...slow, ...found.filter(f => !slow.includes(f))].map(f => join(root, f));
}

async function reporter(name) {
  if (name in builtin) {
    const r = builtin[name];
    return name === 'spec' ? new r() : r;
  }
  return (await import(pathToFileURL(resolve(name)).href)).default;
}

// Files run at once. A higher setting starved the shadcn Next-build runtime test into its timeout (#247).
const concurrency = Number(process.env.TEST_CONCURRENCY) || 4;
// Comma-separated reporters, each a node:test built-in or a module path from the working directory. NODE_OPTIONS
// `--test-reporter` does not apply to run(), so CI names its reporters here.
const names = (process.env.TEST_REPORTERS || 'spec').split(',').map(s => s.trim()).filter(Boolean);

const stream = run({ files: testFiles(), concurrency });
stream.on('test:fail', () => { process.exitCode = 1; });

// Every reporter reads the whole event stream, so each gets its own copy of it.
const reporting = names.map(async name => {
  const events = new PassThrough({ objectMode: true });
  stream.pipe(events);
  const out = events.compose(await reporter(name));
  out.pipe(process.stdout, { end: false });
  await new Promise((resolve, reject) => out.on('end', resolve).on('error', reject));
});
await Promise.all(reporting);
