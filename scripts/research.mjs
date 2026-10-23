#!/usr/bin/env node
// The research notes in docs/research/: their source prefixes and their relative links.
//
//   node scripts/research.mjs check   prefixes and links that do not hold; exits 1 on any
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = 'docs/research';

// A prefix definition, on a line of its own ("- `C4-CTX` = https://…"), and an inline code span.
const definition = (name, flags) => new RegExp(`^(?:- )?\`(${name})\` = `, flags);
const DEFINITION = definition('[A-Z][A-Z0-9_-]*', 'gm');
const SPAN = /`([^`\n]+)`/g;
// A span cites a prefix by its first word ("`C4-CTX`", "`GH packages/icons/…`"). A hyphenated capitals word reads
// as a prefix even when undefined; a bare one ("`LICENSE`", "`VECTOR`") is as often a file or an enum value, so a
// typo of a one-word prefix goes unflagged.
const looksLikePrefix = word => word.includes('-') && /^[A-Z][A-Z0-9_]*(-[A-Z0-9_]+)+$/.test(word);
const WEB_ADDRESS = /\b[a-z][a-z+.-]*:\/\/\S+/gi;
// An inline link, its target optionally in <> and followed by a "title".
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gm;

/**
 * Every problem in the notes: a prefix a span cites that no line defines, a defined prefix nothing cites, a relative
 * link to a missing file, and an anchor no heading of its target has. -> [{what, file, ref}]
 */
export function problems(root = ROOT, files = notes(root)) {
  const out = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8').replace(FENCE, '');
    const defined = new Set([...text.matchAll(DEFINITION)].map(m => m[1]));
    for (const [, span] of text.replace(DEFINITION, '').matchAll(SPAN)) {
      const word = span.split(' ')[0];
      if (!defined.has(word) && looksLikePrefix(word)) out.push({ what: 'undefined prefix', file, ref: word });
    }
    // A citation is any whole-word mention off the prefix's own line and outside a URL: some notes cite one outside
    // backticks ("— NPM_ICONS `metadata.json`"), and one source's line may cite another ("`AG-LICENSE` = `AG-REPO`").
    const lines = text.replace(WEB_ADDRESS, '').split('\n');
    for (const p of defined) {
      const own = definition(p);
      const word = new RegExp(`(?<![\\w-])${p}(?![\\w-])`);
      if (!lines.some(l => !own.test(l) && word.test(l))) out.push({ what: 'unused prefix', file, ref: p });
    }
    for (const [, target] of text.matchAll(LINK)) {
      if (/^[a-z][a-z+.-]*:/i.test(target)) continue;
      const [path, anchor] = target.split('#');
      const to = path ? resolve(root, dirname(file), decodeURI(path)) : join(root, file);
      if (!existsSync(to)) out.push({ what: 'broken link', file, ref: target });
      else if (anchor !== undefined && to.endsWith('.md') && !anchors(readFileSync(to, 'utf8')).has(anchor.toLowerCase()))
        out.push({ what: 'broken anchor', file, ref: target });
    }
  }
  return out;
}

/**
 * The anchors GitHub gives a Markdown file's headings: a link keeps its text, then lower case, punctuation dropped,
 * spaces to hyphens, and -1, -2 on repeats. GitHub matches an anchor in any case.
 */
export function anchors(text) {
  const out = new Set();
  const seen = new Map();
  for (const [, heading] of text.replace(FENCE, '').matchAll(/^#{1,6} +(.+?) *#* *$/gm)) {
    const base = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

function notes(root) {
  return readdirSync(join(root, NOTES)).filter(f => f.endsWith('.md')).map(f => `${NOTES}/${f}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv[2] === 'check') {
    const found = problems();
    for (const p of found) console.log(`${p.what}: ${p.file}: ${p.ref}`);
    if (found.length) process.exit(1);
    console.log('OK');
  } else {
    console.error('usage: node scripts/research.mjs check');
    process.exit(2);
  }
}
