#!/usr/bin/env node
// The ADRs in docs/adr/: their numbers, the references to them, and the next free number.
//
//   node scripts/adr.mjs next    the next free number across this checkout, origin/main and every open PR
//   node scripts/adr.mjs check   duplicate numbers and references that name no ADR; exits 1 on any
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADR_DIR = 'docs/adr';
const FILE = /^(\d{4})-[a-z0-9-]+\.md$/;

/** The ADR files in a folder: [{number, file}], sorted by number. */
export function adrs(root = ROOT) {
  return readdirSync(join(root, ADR_DIR)).flatMap(f => {
    const m = FILE.exec(f);
    return m ? [{ number: +m[1], file: f }] : [];
  }).sort((a, b) => a.number - b.number);
}

/** The ADR numbers among some paths, as git or `gh pr view --json files` lists them. */
export function numbersIn(paths) {
  return paths.flatMap(p => {
    const m = p.startsWith(`${ADR_DIR}/`) && FILE.exec(p.slice(ADR_DIR.length + 1));
    return m ? [+m[1]] : [];
  });
}

/** One past the highest number taken anywhere. */
export const nextNumber = taken => pad(Math.max(0, ...taken) + 1);
const pad = n => String(n).padStart(4, '0');

// A reference by number in prose or code ("ADR 0005", "ADR-0007"), and a Markdown link to an ADR file.
const BY_NUMBER = /\bADR[ -](\d{4})\b/g;
const LINK = /\]\(([^)\s]*?(\d{4})-[a-z0-9-]+\.md)(#[^)]*)?\)/g;

/**
 * Every problem in the tracked files: a number two ADR files share, a reference by a number no ADR has, and a link
 * to an ADR file that is not there. -> [{what, file, ref}]
 */
export function problems(root = ROOT, files = trackedTextFiles(root)) {
  const list = adrs(root);
  const have = new Set(list.map(a => a.number));
  const out = [];
  const seen = new Map();
  for (const a of list) {
    if (seen.has(a.number)) out.push({ what: 'duplicate number', file: `${ADR_DIR}/${a.file}`, ref: `${ADR_DIR}/${seen.get(a.number)}` });
    else seen.set(a.number, a.file);
  }
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const [ref, n] of text.matchAll(BY_NUMBER)) if (!have.has(+n)) out.push({ what: 'no such ADR', file, ref });
    if (!file.endsWith('.md')) continue;
    for (const [, target] of text.matchAll(LINK)) {
      const path = resolve(root, dirname(file), target);
      if (dirname(path) !== join(root, ADR_DIR)) continue;
      if (!existsSync(path)) out.push({ what: 'broken ADR link', file, ref: target });
    }
  }
  return out;
}

// Tracked Markdown, scripts and Contracts; test fixtures are other projects' files.
function trackedTextFiles(root) {
  return execFileSync('git', ['ls-files', '*.md', '*.mjs', '*.js', '*.json'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(f => f && !f.includes('/fixtures/') && existsSync(join(root, f)));
}

// The ADR numbers origin/main and each open PR hold: {main: [n], prs: {<number>: [n]}}. Parallel sessions each took
// the highest number in their own checkout, so #248 and #250 both claimed 0014 and one was renumbered after the fact.
// A source that cannot be read (no remote, no gh) is left out with a warning, so `next` still answers from the rest.
function remoteTaken(root) {
  const read = (what, cmd, args) => {
    try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }); }
    catch (e) { console.error(`adr next: ${what} not read (${String(e.message).split('\n')[0]})`); return null; }
  };
  // a PR merged since the last fetch is no longer open, so its number is only on a fresh origin/main
  read('a fetch of origin/main', 'git', ['fetch', '--quiet', 'origin', 'main']);
  const tree = read('origin/main', 'git', ['ls-tree', '--name-only', 'origin/main', `${ADR_DIR}/`]);
  const main = tree ? numbersIn(tree.split('\n')) : [];
  const list = read('open PRs', 'gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,files']);
  const prs = {};
  for (const pr of list ? JSON.parse(list) : []) {
    const ns = numbersIn((pr.files || []).map(f => f.path));
    if (ns.length) prs[pr.number] = ns;
  }
  return { main, prs };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === 'next') {
    const { main, prs } = remoteTaken(ROOT);
    for (const [pr, ns] of Object.entries(prs)) console.log(`PR #${pr} adds ${ns.map(pad).join(', ')}`);
    console.log(nextNumber([...adrs().map(a => a.number), ...main, ...Object.values(prs).flat()]));
  } else if (cmd === 'check') {
    const found = problems();
    for (const p of found) console.log(`${p.what}: ${p.file}: ${p.ref}`);
    if (found.length) process.exit(1);
    console.log('OK');
  } else {
    console.error('usage: node scripts/adr.mjs next | check');
    process.exit(2);
  }
}
