// The hand-over copy (#440, spec #343 The hand-over): a signed-off Handoff's Rendering, copied into scratch with
// its screenshots beside it, ready to publish as a private Artifact. Every Sign-off here is a test approval under
// .scratch/from-prototype-tests/ (removed after the run), as To-handoff's Sign-off tests make it, so nothing
// committed changes.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasSources } from '../../adapter-carbon/scripts/sources.mjs';
import { hasRuntime } from '../../to-handoff/scripts/deps.mjs';
import { approve, render } from '../../to-handoff/scripts/handoff.mjs';
import { repo } from '../../to-handoff/test/helpers.mjs';
import { AT, generated, shown, signed } from '../../to-handoff/test/signed.mjs';
import { handOver } from '../scripts/from-prototype.mjs';

const CLI = fileURLToPath(new URL('../scripts/from-prototype.mjs', import.meta.url));
const SCRATCH = repo('.scratch/from-prototype-tests');
after(() => rmSync(SCRATCH, { recursive: true, force: true }));
const skip = (!hasRuntime() && 'the runtime reader is missing; run: node skills/to-handoff/scripts/deps.mjs')
  || (!hasSources() && 'Carbon sources missing; run: node skills/adapter-carbon/scripts/sources.mjs');

// A Handoff with screenshots, signed off (or left pending) and rendered, as the approve CLI leaves it.
async function rendered({ sign = true } = {}) {
  const g = await (sign ? signed : (base, options) => generated(undefined, base, options))(SCRATCH, { runtime: true });
  await render({ handoffPath: g.handoffPath, designSystem: g.ds });
  return { ...g, out: join(g.ds, 'hand-over') };
}

const listing = dir => readdirSync(dir, { recursive: true }).sort();
const refs = html => [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map(m => m[1]);
const REMOTE = /url\(\s*['"]?\s*(?:https?:|\/\/)/i;

test('a signed-off Handoff: the copy holds the stamped page and every screenshot it refers to, with no ../ left', { skip }, async () => {
  const { handoffPath, out } = await rendered();
  const r = handOver({ handoffPath, out });
  assert.equal(r.dir, out);
  assert.equal(r.title, 'invite-teammates handoff');
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok(!html.includes('../'));
  assert.match(html, /<p class="stamp">r1 · [0-9a-f]{12} · signed off<\/p>/);
  // The Artifact takes its title from the page's: the copy's names the feature key, so a later Sign-off finds it.
  assert.equal(html.match(/<title>([^<]*)<\/title>/)[1], 'invite-teammates handoff');
  const images = [...new Set([...html.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]))].sort();
  assert.equal(images.length, 20);
  for (const ref of refs(html)) {
    const at = resolve(out, ref);
    assert.ok(at.startsWith(out + '/') && existsSync(at), `${ref} resolves inside the copy`);
    assert.deepEqual(readFileSync(at), readFileSync(join(dirname(handoffPath), ref)));
  }
  assert.deepEqual(r.files, ['index.html', ...images]);
  assert.deepEqual(listing(out), ['index.html', 'screens', ...images]);
  // Carbon's IBM Plex faces are in the page (#521): an Artifact blocks fonts from IBM's CDN.
  assert.doesNotMatch(html, REMOTE);
  assert.match(html, /@font-face \{[^}]*font-family: "IBM Plex Sans";[^}]*src: url\("data:font\/woff2;base64,/);
});

test('a Rendering that loads a url() from outside the copy is refused, naming each once; data: URIs pass (#521)', { skip }, async () => {
  const { handoffPath, out } = await rendered();
  const pagePath = join(dirname(handoffPath), 'renderings/index.html');
  const css = '<style>.a{background:url(https://cdn.example/a.png)} .b{background:url( "HTTP://cdn.example/b.png" )}'
    + ' .c{background:url(https://cdn.example/a.png)} .d{background:url(data:image/png;base64,AAAA)}</style>';
  writeFileSync(pagePath, readFileSync(pagePath, 'utf8').replace('</head>', `${css}</head>`)
    .replace('<body', '<body style="background-image: url(&quot;//cdn.example/c.png&quot;)"'));
  assert.throws(() => handOver({ handoffPath, out }), e => {
    assert.match(e.message, /its Rendering loads from outside the copy: https:\/\/cdn\.example\/a\.png, HTTP:\/\/cdn\.example\/b\.png, \/\/cdn\.example\/c\.png$/);
    assert.ok(!e.message.includes('data:'));
    return true;
  });
  assert.ok(!existsSync(out));
});

test('a pending Handoff is refused, and nothing is written', { skip }, async () => {
  const { handoffPath, out } = await rendered({ sign: false });
  assert.throws(() => handOver({ handoffPath, out }), /is not signed off \(pending\): nothing is published before Sign-off/);
  assert.ok(!existsSync(out));
});

test("a signed.json that doesn't match handoff.json is refused", { skip }, async () => {
  const { handoffPath, out } = await rendered();
  const signedPath = join(dirname(handoffPath), 'signed.json');
  writeFileSync(signedPath, readFileSync(signedPath, 'utf8').replace('"revision": 1', '"revision": 2'));
  assert.throws(() => handOver({ handoffPath, out }), /its signed\.json doesn't match handoff\.json/);
  rmSync(signedPath);
  assert.throws(() => handOver({ handoffPath, out }), /there is no signed\.json beside it/);
  assert.ok(!existsSync(out));
});

test('a Rendering not rendered again after Sign-off is refused: its stamp reads pending', { skip }, async () => {
  const { ds, handoffPath, out } = await rendered({ sign: false });
  await approve({ handoffPath, designSystem: ds, ...shown(ds, handoffPath), at: AT, test: true });
  assert.throws(() => handOver({ handoffPath, out }), /its Rendering's stamp reads "r1 · [0-9a-f]{12} · pending sign-off", not "r1 · [0-9a-f]{12} · signed off": render it again/);
  assert.ok(!existsSync(out));
});

test("a copy over an Artifact's limits is refused, naming the size", { skip }, async () => {
  const { handoffPath, out } = await rendered();
  writeFileSync(join(dirname(handoffPath), 'screens/invite-teammates.default.sm.png'), Buffer.alloc(16 * 1000 * 1000 + 1));
  assert.throws(() => handOver({ handoffPath, out }), /over an Artifact's limits: screens\/invite-teammates\.default\.sm\.png is 16\.0 MB \(at most 15\.0 MB a file\)/);
  assert.ok(!existsSync(out));
});

test('the copy is written only under .scratch/; a copy already there is replaced, and nothing else there goes', { skip }, async () => {
  const { handoffPath, out } = await rendered();
  assert.throws(() => handOver({ handoffPath, out: repo('design-systems/hand-over') }), /the copy is written only under .*\.scratch\//);
  assert.ok(!existsSync(repo('design-systems/hand-over')));
  handOver({ handoffPath, out });
  writeFileSync(join(out, 'screens/gone.png'), '');
  writeFileSync(join(out, 'notes.txt'), 'kept');
  handOver({ handoffPath, out });
  assert.ok(!existsSync(join(out, 'screens/gone.png')));
  assert.equal(readFileSync(join(out, 'notes.txt'), 'utf8'), 'kept');
});

test('the CLI: exit 0 naming the copy and its title; exit 1 with the reason, no stack, on a pending Handoff', { skip }, async () => {
  const cli = args => spawnSync(process.execPath, [CLI, 'hand-over', ...args], { encoding: 'utf8' });
  const ok = await rendered();
  const r = cli([ok.handoffPath, '--out', ok.out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^wrote .*hand-over: index\.html and 20 screenshots, \d+\.\d MB\npublish it as a private Artifact titled "invite-teammates handoff"/);
  const pending = await rendered({ sign: false });
  const no = cli([pending.handoffPath, '--out', pending.out]);
  assert.equal(no.status, 1);
  assert.match(no.stderr, /^cannot hand over .*: it is not signed off \(pending\): nothing is published before Sign-off\n$/);
});
