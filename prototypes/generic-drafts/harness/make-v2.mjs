// PROTOTYPE (#65): a simulated Code Library upgrade, ../library -> ../library-v2.
//   button.tsx: size lg h-9 -> h-10 (one cva value's classes change)
//   alert.tsx:  a new `warning` variant
//   card.tsx:   a comment line added at the top (every line moves, no fact changes)
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const from = join(HERE, '../library'), to = join(HERE, '../library-v2');
cpSync(from, to, { recursive: true });
const edit = (rel, a, b) => {
  const p = join(to, rel), s = readFileSync(p, 'utf8');
  if (!s.includes(a)) throw new Error(`${rel}: ${a} not found`);
  writeFileSync(p, s.replace(a, b));
};
edit('components/ui/button.tsx', 'lg: "h-9 gap-1.5', 'lg: "h-10 gap-1.5');
edit('components/ui/alert.tsx', '      destructive:\n', '      warning: "bg-card text-amber-700 *:[svg]:text-current",\n      destructive:\n');
edit('components/ui/card.tsx', 'import * as React from "react"', '// upgraded\nimport * as React from "react"');
console.log('library-v2 written');
