// CDS preview renderer (#386): real @coinbase/cds-web markup per Contract tuple, once per Theme Mode, and CDS's CSS
// in its @layer cds order. Until the Button Contract lands (#387) the tests render a fixture Contract. Skips until
// the packages are fetched (node skills/adapter-cds/scripts/sources.mjs fetches them with the sources).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPreviewPackages, previewRenderer } from '../scripts/preview.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
const button = fixture('button.component.json');
const skip = hasPreviewPackages() ? false : 'CDS preview packages missing: run node skills/adapter-cds/scripts/sources.mjs';

// One specimen holds a subtree per Mode; `scheme` picks one, and `button` its <button> open tag.
const scheme = (html, mode) => html.match(new RegExp(`<div class="cds-default ${mode} cds-preview-scheme"[^>]*>([\\s\\S]*?)</div>(?=<div class="cds-default|</div>$)`))[1];
const openTag = html => html.match(/<button [^>]*>/)[0];

test('renders the Base Component with the real CDS Button, its label and the default icon', { skip }, async () => {
  const { render } = await previewRenderer(button);
  const light = scheme(render({}), 'light');
  assert.match(openTag(light), /class="[^"]*\bcds-Interactable\b[^"]*\bcds-Button\b[^"]*" style="[^"]*" type="button" data-variant="primary">/);
  assert.match(light, /<span class="startNodeCss-[^"]+"><div class="[^"]*cds-Icon"><span aria-hidden="true" class="[^"]*" data-icon-name="add"[^>]*>\u{F0012}<\/span>/u);
  assert.match(light, /<span class="">Button<\/span>/);
});

test('each axis value maps through its Contract code props; forced States render like Enabled', { skip }, async () => {
  const { render } = await previewRenderer(button);
  const tag = tuple => openTag(render(tuple));
  assert.match(tag({ variant: 'negative' }), /data-variant="negative"/);
  assert.match(tag({ fill: 'transparent' }), /\btransparentWhileInactiveCss-[^"]*" [^>]*data-transparent="true"/);
  assert.match(tag({ state: 'disabled' }), / disabled="" /);
  assert.match(tag({ loading: 'on' }), /^<button aria-label="Loading" [^>]*aria-busy="true"[^>]* data-loading="true"/);
  assert.match(render({ loading: 'on' }), /class="hiddenCss-[^"]+">Button</);
  assert.notEqual(tag({ size: 's' }), tag({ size: 'l' }), 'size changes the padding and radius classes');
  assert.equal(render({ state: 'hover' }), render({}));
  assert.equal(render({ state: 'active' }), render({}));
  assert.throws(() => render({ variant: 'foregroundMuted' }), /unknown variant value foregroundMuted/);
});

test('each Mode renders the specimen under ThemeProvider with its activeColorScheme, and its class shows that Mode', { skip }, async () => {
  const { render, stylesheet, modeClass } = await previewRenderer(button);
  const html = render({});
  assert.match(html, /^<div class="cds-preview"><div class="cds-default light cds-preview-scheme" style="--activeColorScheme:light">/);
  assert.match(html, /<div class="cds-default dark cds-preview-scheme" style="--activeColorScheme:dark">/);
  // Interactable blends the hover background for the active scheme, so the two subtrees differ.
  const hover = mode => scheme(html, mode).match(/--inter-hover-bg:([^;"]+)/)[1];
  assert.equal(hover('light'), 'rgb(0, 72, 224)');
  assert.equal(hover('dark'), 'rgb(95, 144, 250)');
  // The theme variables ThemeProvider would write inline sit in the stylesheet, once per scheme.
  assert.match(stylesheet, /\.cds-preview-scheme\.light\{[^}]*--color-bgPrimary:rgb\(0,82,255\)/);
  assert.match(stylesheet, /\.cds-preview-scheme\.dark\{[^}]*--color-bgPrimary:rgb\(87,139,250\)/);
  assert.deepEqual(['light', 'dark'].map(modeClass), ['cds-preview-light', 'cds-preview-dark']);
  assert.match(stylesheet, /\.cds-preview-dark \.cds-preview-scheme\.light\{display:none\}/);
  assert.throws(() => modeClass('white'), /CDS has no colour scheme for the Theme Mode white/);
});

test("the stylesheet is CDS's CSS in @layer cds order, then the icon font, with Inter and CoinbaseIcons inlined", { skip }, async () => {
  const { stylesheet } = await previewRenderer(button);
  const order = ['styles/global.css', 'styles/defaultFont.css', 'styles/responsive/base.css', 'styles/responsive/phone.css',
    'styles/responsive/tablet.css', 'styles/responsive/desktop.css', 'system/Interactable.css', 'buttons/Button.css']
    .map(p => `/* @coinbase/cds-web/esm/${p} */`).concat('/* @coinbase/cds-icons/esm/fonts/web/icon-font.css */');
  const at = order.map(marker => stylesheet.indexOf(marker));
  assert.ok(at.every(i => i >= 0), `every file is in the stylesheet: ${order.filter((_, i) => at[i] < 0)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in order');
  assert.ok(!stylesheet.includes('buttons/IconButton.css'), 'only the CSS the bundled component imports');
  assert.match(stylesheet, /\.cds-Button|baseCss-b99zquh/);
  assert.match(stylesheet, /@font-face \{\s*font-family: 'Inter';[^}]*src: url\(data:font\/woff2;base64,/);
  assert.match(stylesheet, /font-family: 'CoinbaseIcons';[^}]*src: url\(data:font\/woff2;base64,/);
  assert.ok(!/url\(['"]?\.\//.test(stylesheet), 'no relative url() left');
});

test('refuses to render when the installed packages differ from the Contract pin', { skip }, async () => {
  const moved = JSON.parse(JSON.stringify(button));
  moved.source.packages['@coinbase/cds-web'] = '9.30.0';
  await assert.rejects(previewRenderer(moved), /@coinbase\/cds-web 9\.29\.0 is installed but the Contract pins 9\.30\.0/);
  const icons = JSON.parse(JSON.stringify(button));
  icons.source.packages['@coinbase/cds-icons'] = '5.27.0';
  await assert.rejects(previewRenderer(icons), /@coinbase\/cds-icons 5\.26\.0 is installed but the Contract pins 5\.27\.0/);
});

test('refuses a code.import outside code.package, and an icon CDS does not have', { skip }, async () => {
  const other = JSON.parse(JSON.stringify(button));
  other.code.import = "import { Button } from '@coinbase/cds-mobile/buttons';";
  await assert.rejects(previewRenderer(other), /code\.import must import from @coinbase\/cds-web/);
  const { render } = await previewRenderer(button);
  assert.throws(() => render({}, { startIcon: true, swapStartIcon: 'icon:notAnIcon' }), /@coinbase\/cds-icons has no icon notAnIcon/);
});

test('a usage renders its own label and icon; missing properties take their Contract defaults', { skip }, async () => {
  const { render } = await previewRenderer(button);
  const plain = render({ variant: 'secondary' }, { label: 'Save' });
  assert.match(plain, /<span class="">Save<\/span>/);
  assert.doesNotMatch(plain, /cds-Icon/, 'the start icon is off by default');
  const withIcon = render({}, { label: 'Save', startIcon: true, swapStartIcon: 'icon:download' });
  assert.match(withIcon, /data-icon-name="download"/);
  assert.match(render({}, { label: 'Save', startIcon: true }), /data-icon-name="add"/);
});

test('To-preview builds a catalog page for the fixture Contract, one specimen per tuple', { skip }, async () => {
  const { buildCatalog } = await import('../../to-preview/scripts/catalog.mjs');
  const { expand } = await import('../../contract/scripts/contract.mjs');
  const renderer = await previewRenderer(button);
  const html = buildCatalog({ contract: button, foundations: fixture('cds.foundations.json'), renderer });
  const data = JSON.parse(html.match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(data.specimens).length, expand(button).length);
  assert.equal(data.sourceLabel, '@coinbase/cds-web 9.29.0');
  assert.deepEqual(data.toggles, [{ key: 'theme', label: 'Theme', modes: [
    { key: 'light', label: 'Light', className: 'cds-preview-light' }, { key: 'dark', label: 'Dark', className: 'cds-preview-dark' }] }]);
  assert.deepEqual(data.forces.map(f => f.pseudo), [':hover', ':active']);
  assert.ok(html.includes('/* @coinbase/cds-web/esm/buttons/Button.css */'));
});

test("the preview lockfile installs the CDS packages the sources pin, at the sources' integrities", async () => {
  const { CDS } = await import('../scripts/sources.mjs');
  const pinned = new URL('../preview/', import.meta.url);
  const deps = JSON.parse(readFileSync(new URL('package.json', pinned))).dependencies;
  const lock = JSON.parse(readFileSync(new URL('package-lock.json', pinned))).packages;
  for (const [name, { version, integrity }] of Object.entries(CDS.packages)) {
    assert.equal(deps[name], version, name);
    assert.deepEqual([lock[`node_modules/${name}`].version, lock[`node_modules/${name}`].integrity], [version, integrity], name);
  }
  assert.deepEqual(Object.keys(lock).filter(k => /node_modules\/.+\/node_modules\/@coinbase\//.test(k)), [], 'no nested CDS copy');
});
