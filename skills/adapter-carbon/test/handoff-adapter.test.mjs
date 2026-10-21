// The Carbon Adapter's To-handoff module (#228): the theme wrapper's values map to modes the Foundations document has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { themeWrapper } from '../scripts/handoff-adapter.mjs';

const foundations = JSON.parse(readFileSync(fileURLToPath(new URL('../../../design-systems/carbon/carbon.foundations.json', import.meta.url)), 'utf8'));

test('<Theme theme> maps white, g10, g90 and g100 to the Foundations Theme modes', () => {
  const theme = Object.values(foundations.collections).find(c => !c.hidden && c.modes.length > 1);
  assert.deepEqual({ component: themeWrapper.component, prop: themeWrapper.prop }, { component: 'Theme', prop: 'theme' });
  assert.deepEqual(Object.keys(themeWrapper.modes), ['white', 'g10', 'g90', 'g100']);
  for (const key of Object.values(themeWrapper.modes)) assert.ok(theme.modes.some(m => m.key === key), `${key} is a Theme mode`);
});
