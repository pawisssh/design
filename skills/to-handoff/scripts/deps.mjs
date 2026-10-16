#!/usr/bin/env node
// Pinned packages for To-handoff's readers (#112, #113): parse5 (static HTML reader and tagger), TypeScript 6
// (the JSX tagger; TypeScript 7 has no JS compiler API) and playwright-core (the runtime reader).
//   node skills/to-handoff/scripts/deps.mjs [--dir <dir>]   fetch into .scratch/to-handoff
//
// Packages come from deps/package.json and its lockfile, installed with `npm ci --ignore-scripts` into
// gitignored scratch, so each tarball is checked against its lockfile `integrity` and nothing from a package
// runs at install. The repo keeps zero dependencies; tests that need a package skip when it is absent.
//
// The browser is the system Chrome (playwright-core's `chrome` channel). Without one, the command fetches
// Chromium's headless shell into <dir>/browsers with playwright-core's own installer, which checks no pinned
// hash: unlike the packages, that download is trusted as playwright-core's CDN serves it.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEPS_DIR = join(REPO_ROOT, '.scratch/to-handoff');
const PINNED_DIR = fileURLToPath(new URL('../deps/', import.meta.url));
const lockOf = dir => (existsSync(join(dir, 'package-lock.json')) ? readFileSync(join(dir, 'package-lock.json'), 'utf8') : null);
const installed = (dir, name) => existsSync(join(dir, 'node_modules', name, 'package.json'));
const requireIn = dir => createRequire(join(dir, 'package.json'));

// Where playwright-core's `chrome` channel finds the system Chrome on each platform.
const SYSTEM_CHROME = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/opt/google/chrome/chrome'],
  win32: [join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'), join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')],
};

/** True when the pinned packages are installed in `dir` from the committed lockfile. */
export function hasDeps(dir = DEPS_DIR) {
  return lockOf(dir) === lockOf(PINNED_DIR) && installed(dir, 'parse5');
}

/** True when the runtime reader's packages are installed and a browser is there to run them. */
export function hasRuntime(dir = DEPS_DIR) {
  return hasDeps(dir) && installed(dir, 'typescript') && installed(dir, 'playwright-core') && Boolean(findBrowser(dir));
}

/** Install the pinned packages into `dir`, and Chromium when there is no system Chrome. Skips what is there. */
export function fetchDeps(dir = DEPS_DIR) {
  if (!hasDeps(dir)) {
    mkdirSync(dir, { recursive: true });
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(PINNED_DIR, f), join(dir, f));
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  }
  if (!findBrowser(dir)) {
    execFileSync(process.execPath, [join(dir, 'node_modules/playwright-core/cli.js'), 'install', 'chromium-headless-shell'], {
      cwd: dir, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(dir, 'browsers') },
    });
  }
  return dir;
}

/**
 * The browser the runtime reader launches: {channel: "chrome", name} for the system Chrome, else
 * {browsersPath, name} for the fetched headless shell, else null.
 */
export function findBrowser(dir = DEPS_DIR) {
  const chrome = (SYSTEM_CHROME[process.platform] || []).find(p => p && existsSync(p));
  if (chrome) return { channel: 'chrome', name: `system Chrome (${chrome})` };
  const browsers = join(dir, 'browsers');
  const shell = existsSync(browsers) && readdirSync(browsers).find(d => d.startsWith('chromium_headless_shell-'));
  return shell ? { browsersPath: browsers, name: `fetched ${shell}` } : null;
}

const missing = (dir, what) => new Error(`To-handoff ${what} missing in ${dir}; run: node skills/to-handoff/scripts/deps.mjs`);

/** parse5 from the scratch install. Throws, naming the fetch command, when it is missing. */
export function loadParse5(dir = DEPS_DIR) {
  if (!hasDeps(dir)) throw missing(dir, 'packages');
  return requireIn(dir)('parse5');
}

/** TypeScript 6 from the scratch install, for the JSX tagger. */
export function loadTypescript(dir = DEPS_DIR) {
  if (!hasDeps(dir) || !installed(dir, 'typescript')) throw missing(dir, 'packages');
  return requireIn(dir)('typescript');
}

/** playwright-core's chromium, set up to launch the browser findBrowser picks. */
export function loadChromium(dir = DEPS_DIR) {
  if (!hasDeps(dir) || !installed(dir, 'playwright-core')) throw missing(dir, 'packages');
  const browser = findBrowser(dir);
  if (!browser) throw missing(dir, 'browser (no system Chrome, no fetched Chromium)');
  if (browser.browsersPath) process.env.PLAYWRIGHT_BROWSERS_PATH = browser.browsersPath;
  const { chromium } = requireIn(dir)('playwright-core');
  return { chromium, launchOptions: browser.channel ? { channel: browser.channel } : {}, name: browser.name };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : DEPS_DIR;
  try { fetchDeps(dir); console.log(`To-handoff packages OK in ${dir}; browser: ${findBrowser(dir).name}`); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
}
