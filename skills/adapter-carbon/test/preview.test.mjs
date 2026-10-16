// Carbon preview renderer (#33): real @carbon/react markup per Contract tuple, the compiled Carbon CSS and
// the theme class per foundations mode. Skips until the packages are fetched
// (node skills/adapter-carbon/scripts/sources.mjs fetches them with the sources).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';

const button = JSON.parse(readFileSync(new URL('../../../design-systems/carbon/contracts/button.component.json', import.meta.url)));
const skip = hasPreviewPackages() ? false : 'Carbon preview packages missing: run node skills/adapter-carbon/scripts/sources.mjs';

test('renders the Base Component with the real Carbon Button, its label and the default icon', { skip }, async () => {
  const { render } = await previewRenderer(button);
  const html = render({ kind: 'primary', size: 'lg', state: 'enabled' });
  assert.match(html, /^<button class="cds--btn cds--btn--lg cds--layout--size-lg cds--btn--primary" type="button">Button<svg[^>]*class="cds--btn__icon"/);
});

test('each axis value maps through its Contract code props; forced States render like Enabled', { skip }, async () => {
  const { render } = await previewRenderer(button);
  assert.match(render({ kind: 'danger--ghost', size: 'lg-expressive', state: 'enabled' }), /class="cds--btn cds--layout--size-lg cds--btn--danger--ghost cds--btn--expressive"/);
  assert.match(render({ kind: 'tertiary', size: 'xs', state: 'disabled' }), /class="[^"]*cds--btn--xs[^"]*cds--btn--tertiary cds--btn--disabled" disabled=""/);
  const enabled = render({ kind: 'secondary', size: 'md', state: 'enabled' });
  assert.equal(render({ kind: 'secondary', size: 'md', state: 'hover' }), enabled);
});

test('the stylesheet is the compiled Carbon CSS and each Theme mode has its theme class', { skip }, async () => {
  const { stylesheet, modeClass } = await previewRenderer(button);
  assert.deepEqual(['white', 'g10', 'g90', 'g100'].map(modeClass), ['cds--white', 'cds--g10', 'cds--g90', 'cds--g100']);
  for (const cls of ['.cds--btn--primary', '.cds--g100', '.cds--white']) assert.ok(stylesheet.includes(cls), cls);
});

test('refuses to render when the installed packages differ from the Contract pin', { skip }, async () => {
  const moved = JSON.parse(JSON.stringify(button));
  moved.source.packages['@carbon/react'] = '1.119.0';
  await assert.rejects(previewRenderer(moved), /@carbon\/react 1\.118\.0 is installed but the Contract pins 1\.119\.0/);
});
