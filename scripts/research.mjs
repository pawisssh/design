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
const DEFINITION = /^(?:- )?`([A-Z][A-Z0-9_-]*)` = /gm;
const DEFINITION_OF = p => new RegExp(`^(?:- )?\`${p}\` = `);
const SPAN = /`([^`\n]+)`/g;
// A span cites a prefix by its first word ("`C4-CTX`", "`GH packages/icons/…`"). A hyphenated capitals word reads
// as a prefix even when undefined; a bare one ("`LICENSE`", "`VECTOR`") is as often a file or an enum value.
const PREFIX = /^[A-Z][A-Z0-9_]*(-[A-Z0-9_]+)*$/;
const LINK = /\]\(([^)\s]+)\)/g;
const FENCE = /^```[\s\S]*?^```/gm;

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
      if (!defined.has(word) && PREFIX.exec(word)?.[1]) out.push({ what: 'undefined prefix', file, ref: word });
    }
    // A citation is any whole-word mention off the prefix's own line: some notes cite one outside backticks
    // ("— NPM_ICONS `metadata.json`"), and one source's line may cite another ("`AG-LICENSE` = `AG-REPO` `LICENSE`").
    const lines = text.split('\n');
    for (const p of defined) {
      const word = new RegExp(`(?<![\\w-])${p}(?![\\w-])`);
      if (!lines.some(l => !l.match(DEFINITION_OF(p)) && word.test(l))) out.push({ what: 'unused prefix', file, ref: p });
    }
    for (const [, target] of text.matchAll(LINK)) {
      if (/^[a-z][a-z+.-]*:/i.test(target)) continue;
      const [path, anchor] = target.split('#');
      const to = path ? resolve(root, dirname(file), decodeURI(path)) : join(root, file);
      if (!existsSync(to)) out.push({ what: 'broken link', file, ref: target });
      else if (anchor !== undefined && to.endsWith('.md') && !anchors(readFileSync(to, 'utf8')).has(anchor))
        out.push({ what: 'broken anchor', file, ref: target });
    }
  }
  return out;
}

/** The anchors GitHub gives a Markdown file's headings: lower case, punctuation dropped, spaces to hyphens, and -1, -2 on repeats. */
export function anchors(text) {
  const out = new Set();
  const seen = new Map();
  for (const [, heading] of text.replace(FENCE, '').matchAll(/^#{1,6} +(.+?) *#* *$/gm)) {
    const base = heading.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
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
