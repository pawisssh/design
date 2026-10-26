// The pinned CDS sources (#384), read from the fetch in .scratch/adapter-cds/sources. Fetch them first with:
//   node skills/adapter-cds/scripts/sources.mjs
// Without them every test here is skipped, with that message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { CDS, hasSources, readSources } from '../scripts/sources.mjs';
import { SOURCES_MISSING } from './helpers.mjs';

const skip = hasSources() ? false : SOURCES_MISSING;
const sources = skip ? null : readSources();
const pkg = name => sources.packages[name];
const manifest = name => JSON.parse(readFileSync(join(pkg(name).dir, 'package/package.json'), 'utf8'));

test('the pinned commit is the version bump: each package.json there has the npm version the Adapter pins', { skip }, () => {
  for (const [name, folder] of [['@coinbase/cds-web', 'web'], ['@coinbase/cds-common', 'common'], ['@coinbase/cds-icons', 'icons']]) {
    const atCommit = JSON.parse(sources.files[`packages/${folder}/package.json`]);
    assert.equal(atCommit.name, name);
    assert.equal(atCommit.version, CDS.packages[name].version, name);
    assert.equal(manifest(name).version, CDS.packages[name].version, `${name} tarball`);
  }
  assert.equal(CDS.tag, '');
});

test('cds-web 9.29.0 depends on the cds-common and cds-icons versions the Adapter pins', { skip }, () => {
  const deps = manifest('@coinbase/cds-web').dependencies;
  assert.equal(deps['@coinbase/cds-common'], `^${CDS.packages['@coinbase/cds-common'].version}`);
  assert.equal(deps['@coinbase/cds-icons'], `^${CDS.packages['@coinbase/cds-icons'].version}`);
});

test('the license at the commit is Apache-2.0, the one the NOTICE cites', { skip }, () => {
  assert.match(sources.files.LICENSE, /^Apache-2\.0 License\n\nCopyright 2026 Coinbase\n/);
  assert.match(sources.files.LICENSE, /Licensed under the Apache License, Version 2\.0/);
  const notice = readFileSync(new URL('../../../design-systems/cds/NOTICE', import.meta.url), 'utf8');
  assert.ok(notice.includes(CDS.commit), 'the NOTICE names the pinned commit');
});

test('the named members are there: stylesheets, themes, the CSS-variable and blend modules, token maps and SVGs', { skip }, () => {
  const web = new Set(pkg('@coinbase/cds-web').members);
  for (const m of ['esm/buttons/Button.css', 'esm/styles/global.css', 'esm/styles/defaultFont.css',
    'esm/styles/responsive/base.css', 'esm/styles/responsive/phone.css', 'esm/styles/responsive/tablet.css',
    'esm/styles/responsive/desktop.css', 'esm/themes/defaultTheme.js', 'esm/core/createThemeCssVars.js'])
    assert.ok(web.has(`package/${m}`), m);
  assert.ok(![...web].some(m => /\.js$/.test(m) && !/\/(themes|core)\//.test(m)), 'no component module is extracted');
  const common = new Set(pkg('@coinbase/cds-common').members);
  for (const m of ['esm/tokens/button.js', 'esm/tokens/interactable.js', 'esm/color/getBlendedColor.js']) assert.ok(common.has(`package/${m}`), m);
  const svgs = pkg('@coinbase/cds-icons').members.filter(m => m.startsWith('package/esm/svgs/'));
  assert.ok(svgs.includes('package/esm/svgs/add-16-inactive.svg') && svgs.includes('package/esm/svgs/add-24-inactive.svg'));
});

// The compiled modules import each other without extensions ('./blendColors'), as a bundler resolves them. An import
// is `from '<spec>'`, a side-effect `import '<spec>'`, or a dynamic `import('<spec>')`.
test('every relative import of an extracted module is extracted too; d3-color is the only package one', { skip }, () => {
  const bare = new Set();
  let relative = 0;
  for (const name of Object.keys(CDS.packages)) {
    const members = new Set(pkg(name).members);
    for (const m of pkg(name).members.filter(p => p.endsWith('.js'))) {
      const text = readFileSync(join(pkg(name).dir, m), 'utf8');
      for (const [, spec] of text.matchAll(/(?:\bfrom\s+|^\s*import\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/gm)) {
        if (!spec.startsWith('.')) { bare.add(spec); continue; }
        relative++;
        const base = posix.join(dirname(m), spec);
        assert.ok([base, `${base}.js`, `${base}/index.js`].some(p => members.has(p)), `${name} ${m} imports ${spec}`);
      }
    }
  }
  assert.ok(relative > 0, 'no relative import was read');
  assert.deepEqual([...bare], ['d3-color']);
});
