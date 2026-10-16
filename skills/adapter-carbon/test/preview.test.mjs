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

// Form controls (#93, #106), on the TextInput and Select fixture Contracts.
const fixture = name => JSON.parse(readFileSync(new URL(`../../contract/test/fixtures/form-controls/${name}.component.json`, import.meta.url)));

test('a `code.required` prop gets a placeholder unique per tuple, so a TextInput renders its label for its own input', { skip }, async () => {
  const { render } = await previewRenderer(fixture('text-input'));
  const html = render({ size: 'md', validation: 'none', readOnly: 'editable', state: 'enabled' });
  assert.match(html, /<label for="text-input-md-none-editable-enabled" class="cds--label"/);
  assert.match(html, /<input[^>]* id="text-input-md-none-editable-enabled"/);
  assert.match(render({ size: 'lg', validation: 'none', readOnly: 'editable', state: 'enabled' }), /id="text-input-lg-none-editable-enabled"/);
});

test('validation shows one version of the content: the warn icon and text replace the helper text', { skip }, async () => {
  const { render } = await previewRenderer(fixture('text-input'));
  const html = render({ size: 'md', validation: 'warn', readOnly: 'editable', state: 'enabled' });
  assert.match(html, /cds--text-input__invalid-icon--warning/);
  assert.match(html, /cds--form-requirement/);
  assert.doesNotMatch(html, /cds--form__helper-text/);
});

test('a Repeated child renders as one SelectItem whose text is the `itemProp` property default', { skip }, async () => {
  const s = fixture('select');
  const text = s.properties.find(p => p.code && p.code.itemProp === 'text').default;
  const { render } = await previewRenderer(s);
  const html = render({ size: 'md', validation: 'none', readOnly: 'editable', state: 'enabled' });
  assert.match(html, /<select[^>]* id="select-md-none-editable-enabled"/);
  assert.equal((html.match(/<option /g) || []).length, 1);
  assert.match(html, new RegExp(`<option[^>]* value="${text}"[^>]*>${text}</option>`));
});

test('every To-preview specimen renders exactly as before render took properties', { skip }, async () => {
  const { expand } = await import('../../contract/scripts/contract.mjs');
  const { createHash } = await import('node:crypto');
  const { render } = await previewRenderer(button);
  const all = expand(button).map(t => render(t)).join('\n');
  assert.equal(createHash('sha256').update(all).digest('hex'), '169c50d42d922fb3ca88492c0e47e9412e1519cb023a7a0f300a8989a6c69dea');
});

test('a partial tuple renders with each missing axis at its default', { skip }, async () => {
  const { render } = await previewRenderer(button);
  assert.equal(render({ size: 'sm' }), render({ kind: 'primary', size: 'sm', state: 'enabled' }));
  assert.equal(render({}), render({ kind: 'primary', size: 'lg', state: 'enabled' }));
  assert.throws(() => render({ kind: 'success' }), /unknown kind value success/);
});

test('a usage renders its own label and icon; missing properties take their Contract defaults', { skip }, async () => {
  const { render } = await previewRenderer(button);
  assert.equal(render({ kind: 'secondary' }, { label: 'Save' }), '<button class="cds--btn cds--btn--lg cds--layout--size-lg cds--btn--secondary" type="button">Save</button>');
  assert.equal(render({ kind: 'secondary' }, { label: 'Save', icon: false, swapIcon: 'save' }), render({ kind: 'secondary' }, { label: 'Save' }));
  const withIcon = render({}, { label: 'Save', icon: true, swapIcon: 'save' });
  assert.match(withIcon, /type="button">Save<svg[^>]*class="cds--btn__icon"/);
  assert.notEqual(withIcon, render({}, { label: 'Save', icon: true }), 'the save icon differs from the default add icon');
  assert.equal(render({}, { label: 'Save', icon: true, swapIcon: 'icon:save' }), withIcon);
});

test('code.required props come from the usage, else a per-tuple placeholder', { skip }, async () => {
  const required = JSON.parse(JSON.stringify(button));
  required.code.required = ['id'];
  const { render } = await previewRenderer(required);
  assert.match(render({ kind: 'ghost' }, { label: 'Go' }), /^<button id="button-ghost-lg-enabled" /);
  assert.match(render({}, { label: 'Go', id: 'cta-1' }), /^<button id="cta-1" /);
  assert.match(render({ kind: 'ghost' }), /^<button id="button-ghost-lg-enabled" /);
});
