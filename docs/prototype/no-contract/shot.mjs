#!/usr/bin/env node
// PROTOTYPE helper (#90): screenshot the Handoff around the email-input usage, now rendered from the drafted
// text-input Contract, beside the role-select usage that still has no Contract. Headless Chrome ignores the
// #u-email-input anchor, so this shoots variant A full height and crops with sips (macOS).
//   node docs/prototype/html-handoff/build.mjs && node docs/prototype/no-contract/shot.mjs
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const page = pathToFileURL(join(HERE, '../html-handoff/out/handoff.html')).href;
const full = join(tmpdir(), 'no-contract-full.png');
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,10400', '--virtual-time-budget=4000',
  `--screenshot=${full}`, `${page}?variant=A`], { stdio: 'ignore' });
// Offsets fit the sample Handoff as built on this branch; re-measure if the sample changes.
execFileSync('sips', ['-c', '700', '1440', '--cropOffset', '2880', '0', full, '--out', join(HERE, 'email-input-render.png')], { stdio: 'ignore' });
console.log('docs/prototype/no-contract/email-input-render.png');
