// What the use_figma hooks share: the stub they recognise, the project they act in, and the scratch logs they keep.
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

// The packager's fail-closed stub, which the package hook swaps for the file; MARKER is how any package call starts.
export const MARKER = '/*@package';
export const STUB = /^\s*\/\*@package (\S+) sha256=([0-9a-f]{64})\*\/\s*throw new Error\("package not injected"\);?\s*$/;
// The first line package_native_builder.py writes into every package, which the swapped code starts with.
export const PACKAGE_HEADER = /^\/\/ Native build package: [0-9a-f]{64}\n/;

export const PACKAGE_LOG = 'use-figma-package.log';
export const RESULT_LOG = 'use-figma-result.log';

export const readInput = () => JSON.parse(readFileSync(0, 'utf8'));

// Resolve symlinks so a link can't point a hook outside the project.
export const projectRoot = input => realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());

// The path relative to the project root ('' for the root itself), or null when it lies outside.
export function within(root, path) {
  const rel = relative(root, path);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : rel;
}

export const logDir = root => join(root, '.scratch', 'to-design');

// One JSON line per record in gitignored scratch; a failed write never blocks the call.
export function appendLog(root, name, record) {
  try {
    mkdirSync(logDir(root), { recursive: true });
    appendFileSync(join(logDir(root), name), JSON.stringify(record) + '\n');
  } catch {}
}
