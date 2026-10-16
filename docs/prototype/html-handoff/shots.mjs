#!/usr/bin/env node
// PROTOTYPE helper (#63): screenshot each Rendering variant with headless Chrome into out/.
//   node docs/prototype/html-handoff/shots.mjs
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const page = pathToFileURL(join(HERE, 'out/handoff.html')).href;
const shots = [
  ['variant-A-document.png', '?variant=A', '1440,6200'],
  ['variant-B-screen-board.png', '?variant=B', '1440,3600'],
  ['variant-C-review-queue.png', '?variant=C', '1440,1600'],
  ['variant-A-g100.png', '?variant=A&mode=g100', '1440,2600'],
];
for (const [name, q, size] of shots) {
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${size}`, '--virtual-time-budget=4000', `--screenshot=${join(HERE, 'out', name)}`, page + q], { stdio: 'ignore' });
  console.log(`out/${name}`);
}
