// `npm test`: every skill's node:test suite, the slowest files first. The `node --test` CLI sorts files alphabetically
// whatever order they are passed in, so a long file can start late and stretch the end of the run; run() keeps the
// order it is given. Files are named as in the old command: skills/*/test/*.test.mjs and skills/*/tests/*.test.mjs.
//
// TEST_CONCURRENCY: files run at once (default 4; a higher setting starved the shadcn Next-build runtime test, #247).
// TEST_REPORTERS: comma-separated reporters, each a node:test built-in or a module path; default `spec`. NODE_OPTIONS
// `--test-reporter` does not apply to run(), so CI names its reporters here.
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

function testFiles() {
  const found = [];
  for (const skill of readdirSync(join(root, 'skills')).sort()) {
    for (const dir of ['test', 'tests']) {
      let names;
      try { names = readdirSync(join(root, 'skills', skill, dir)); } catch { continue; }
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

const concurrency = Number(process.env.TEST_CONCURRENCY) || 4;
const names = (process.env.TEST_REPORTERS || 'spec').split(',').map(s => s.trim()).filter(Boolean);

const stream = run({ files: testFiles(), concurrency });
stream.on('test:fail', () => { process.exitCode = 1; });

// Every reporter reads the whole event stream, so each gets its own copy of it.
const done = names.map(async name => {
  const copy = new PassThrough({ objectMode: true });
  stream.pipe(copy);
  const out = copy.compose(await reporter(name));
  out.pipe(process.stdout, { end: false });
  await new Promise((ok, fail) => out.on('end', ok).on('error', fail));
});
await Promise.all(done);
