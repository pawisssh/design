// Copies the CLI-installed shadcn/ui (radix-nova) files from origin/prototype/source-link (#84)
// into ../library, so nothing is fetched from the shadcn registry.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repo = process.argv[2];
const ref = 'origin/prototype/source-link';
const base = 'prototypes/source-link/v0-app/';
const files = ['components.json', 'package.json', 'app/globals.css',
  'components/ui/button.tsx', 'components/ui/card.tsx', 'components/ui/alert.tsx'];
const out = new URL('../library/', import.meta.url).pathname;
const commit = execFileSync('git', ['-C', repo, 'rev-parse', ref]).toString().trim();
for (const f of files) {
  const body = execFileSync('git', ['-C', repo, 'show', `${ref}:${base}${f}`]);
  mkdirSync(dirname(join(out, f)), { recursive: true });
  writeFileSync(join(out, f), body);
}
writeFileSync(join(out, 'ORIGIN.txt'), `${ref} ${commit} ${base}\n`);
console.log('copied', files.length, 'files from', commit);
