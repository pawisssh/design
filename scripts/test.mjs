#!/usr/bin/env node
// Runs the suites of the skills it names, one skill after another, each ending on node's own pass/fail/skipped
// summary. Skills keep their tests in test/ or tests/; this finds either, so "run the suites of contract and
// to-design" is one command rather than a hand-written glob (#450).
//
//   npm run test:skills -- contract to-design   run those skills' suites; exits 1 if any fails
//   npm run test:skills -- to-handoff --name '#230' --skip runtime   only tests whose name matches / not matching a regex (#588)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS = readdirSync(join(ROOT, 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
// npm test's suite folders and concurrency (package.json), read rather than copied, as in scripts/merge.mjs (#376).
const NPM_TEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.test;
const TEST_DIRS = [...NPM_TEST.matchAll(/skills\/\*\/([^/\s]+)\/\*\.test\.mjs/g)].map(m => m[1]);
const CONCURRENCY = process.env.TEST_CONCURRENCY || NPM_TEST.match(/TEST_CONCURRENCY:-(\d+)/)[1];

/** A skill's test files, as repo paths, from the folders npm test globs; throws for an unknown skill or no tests. */
export function testFilesOf(skill) {
  if (!SKILLS.includes(skill)) throw new Error(`no skill "${skill}" under skills/`);
  const files = TEST_DIRS.flatMap(dir => {
    const at = join(ROOT, 'skills', skill, dir);
    return existsSync(at) ? readdirSync(at).filter(f => f.endsWith('.test.mjs')).sort().map(f => `skills/${skill}/${dir}/${f}`) : [];
  });
  // node --test with no files runs every test under the repo, so an empty list is an error, not a pass
  if (!files.length) throw new Error(`no tests in skills/${skill} (${TEST_DIRS.join(' or ')})`);
  return files;
}

/** `--name` and `--skip` regexes become node's name-pattern flags, which must come before the files: after them they are ignored (#588). */
export function parseArgs(args) {
  const skills = [], flags = [];
  for (let i = 0; i < args.length; i++) {
    const flag = { '--name': '--test-name-pattern', '--skip': '--test-skip-pattern' }[args[i]];
    if (!flag) { skills.push(args[i]); continue; }
    if (!args[i + 1]) throw new Error(`${args[i]} needs a regex`);
    flags.push(`${flag}=${args[++i]}`);
  }
  return { skills, flags };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let skills, flags;
  try { ({ skills, flags } = parseArgs(process.argv.slice(2))); } catch (e) { console.error(`test: ${e.message}`); process.exit(2); }
  if (!skills.length) {
    console.error('usage: npm run test:skills -- <skill>… [--name <regex>] [--skip <regex>]');
    process.exit(2);
  }
  const filesOf = {};
  for (const skill of skills) {
    try { filesOf[skill] = testFilesOf(skill); } catch (e) { console.error(`test: ${e.message}`); process.exit(2); }
  }
  const failed = [];
  for (const [skill, files] of Object.entries(filesOf)) {
    console.log(`test: ${skill} (${files.length} files)`);
    const run = spawnSync(process.execPath, ['--test', `--test-concurrency=${CONCURRENCY}`, ...flags, ...files],
      { cwd: ROOT, stdio: 'inherit' });
    if (run.status !== 0) failed.push(skill);
  }
  if (failed.length) {
    console.error(`test: failed in ${failed.join(', ')}`);
    process.exit(1);
  }
}
