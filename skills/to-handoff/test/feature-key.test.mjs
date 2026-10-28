// The feature key (#431): one function, with no parser to fetch, names a Prototype's Handoff for generate and
// for From-Prototype's check, so the two can't disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureOf } from '../scripts/feature-key.mjs';
import { PROTOTYPE } from './helpers.mjs';

const fixtures = p => fileURLToPath(new URL(`fixtures/${p}`, import.meta.url));
const project = (files, name = '') => {
  const dir = join(mkdtempSync(join(tmpdir(), 'to-handoff-key-')), name);
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return dir;
};
const VITE = { 'package.json': JSON.stringify({ name: 'from-package', dependencies: { react: '19', vite: '6' } }) };
const NEXT = { 'package.json': JSON.stringify({ name: 'from-package', dependencies: { react: '19', next: '15' } }) };
const layout = metadata => ({ ...NEXT, 'app/layout.tsx': `import type { Metadata } from 'next';\n${metadata}\nexport default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n` });

test('an HTML file: its <title>, else its file name', () => {
  assert.deepEqual(featureOf(PROTOTYPE), { name: 'Invite teammates', key: 'invite-teammates' });
  const dir = project({ 'Rebalance.html': '<!doctype html><html><head></head><body><h1>Hi</h1></body></html>', 'package.json': '{"name":"not-this"}' });
  assert.deepEqual(featureOf(join(dir, 'Rebalance.html')), { name: 'Rebalance', key: 'rebalance' });
});

test('an HTML <title> reads as parse5 reads it: any case, with attributes, its entities decoded, trimmed, outside comments', () => {
  const dir = project({ 'a.html': '<!-- <title>Old</title> -->\n<HEAD><TITLE lang="en">\n  Q&amp;A &#8211; &#x41;nswers&nbsp;</TITLE></HEAD>' });
  assert.deepEqual(featureOf(join(dir, 'a.html')), { name: 'Q&A \u2013 Answers', key: 'q-a-answers' });
});

test('an HTML <title>: the common named entities, a bad code point as U+FFFD, CRLF as LF, never one in a raw-text element', () => {
  const dir = project({ 'a.html': '<textarea><title>Typed</title></textarea><template><title>Later</title></template><title>A &mdash; B&hellip; &copy;&#99999999;\r\nC</title>' });
  assert.deepEqual(featureOf(join(dir, 'a.html')), { name: 'A \u2014 B\u2026 \u00a9\ufffd\nC', key: 'a-b-c' });
});

test("the head's <title> names the feature, not an inline SVG's later one", () => {
  const dir = project({ 'a.html': '<html><head><title>Portfolio</title></head><body><svg><title>Close</title></svg></body></html>' });
  assert.equal(featureOf(join(dir, 'a.html')).key, 'portfolio');
});

test('an empty <title> falls through to the next source', () => {
  const dir = project({ 'Home page.html': '<title>  </title>' });
  assert.deepEqual(featureOf(join(dir, 'Home page.html')), { name: 'Home page', key: 'home-page' });
  assert.equal(featureOf(project({ ...VITE, 'index.html': '<title></title>' })).name, 'from-package');
});

test("Vite: index.html's <title>", () => {
  assert.deepEqual(featureOf(fixtures('vite-app')), { name: 'Project members', key: 'project-members' });
});

test("Next: the root layout's metadata.title, in app/ or src/app/", () => {
  assert.deepEqual(featureOf(fixtures('next-app')), { name: 'Release notes', key: 'release-notes' });
  assert.deepEqual(featureOf(fixtures('v0-app')), { name: 'Request access', key: 'request-access' });
  const src = project({ ...NEXT, 'src/app/layout.js': 'export const metadata = { title: `Src app` };' });
  assert.equal(featureOf(src).name, 'Src app');
});

test('Next: metadata.title as a default or absolute, behind as or satisfies', () => {
  assert.equal(featureOf(project(layout("export const metadata = { title: { template: '%s | X', default: 'By default' } };"))).name, 'By default');
  assert.equal(featureOf(project(layout('export const metadata = ({ title: { absolute: "Absolute" } }) satisfies Metadata;'))).name, 'Absolute');
  assert.equal(featureOf(project(layout("export const metadata = { 'title': 'Quoted' } as Metadata;"))).name, 'from-package');
  assert.equal(featureOf(project(layout("export const metadata: Shaped<{ f: (x: string) => void }> = { title: 'Behind an arrow type' };"))).name, 'Behind an arrow type');
});

test("Next: only the top-level title counts, never a nested one, a comment's or a string's", () => {
  const nested = layout([
    'export const metadata: Metadata = {',
    "  description: 'title: \"Not this\" }',",
    '  // title: "Nor this",',
    "  openGraph: { title: 'Shared', images: [{ url: '/a.png' }] },",
    "  title: 'Top level',",
    '};',
  ].join('\n'));
  assert.equal(featureOf(project(nested)).name, 'Top level');
  assert.equal(featureOf(project(layout("export const metadata = { openGraph: { title: 'Shared' } };"))).name, 'from-package');
});

test('Next: no metadata title (generateMetadata, a computed title, a Next app with an index.html) falls back to the package name', () => {
  assert.equal(featureOf(project(layout("export async function generateMetadata() { return { title: 'Later' }; }"))).name, 'from-package');
  assert.equal(featureOf(project(layout('export const metadata = { title: `${site} home` };'))).name, 'from-package');
  assert.equal(featureOf(project({ ...layout(''), 'index.html': '<title>Stray</title>' })).name, 'from-package');
});

test('a folder with no title and no package name: the folder name', () => {
  const dir = project({ 'package.json': JSON.stringify({ dependencies: { react: '19', vite: '6' } }), 'index.html': '<div id="root"></div>' }, 'BatchSell');
  assert.deepEqual(featureOf(dir), { name: 'BatchSell', key: 'batch-sell' });
  assert.equal(featureOf(project({}, 'no-package')).name, 'no-package');
});

// Every module the function loads, its relative imports followed: Node's own only, so no fetched parser (parse5,
// TypeScript) can load, whatever is fetched.
test('the feature key loads no parser that has to be fetched', () => {
  const seen = new Set();
  const visit = url => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const [, spec] of readFileSync(url, 'utf8').matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (spec.startsWith('.')) visit(new URL(spec, url));
      else assert.match(spec, /^node:/, `${url.pathname} imports ${spec}`);
    }
  };
  visit(new URL('../scripts/feature-key.mjs', import.meta.url));
  assert.ok(seen.size >= 1);
});
