// The compiled-CSS cascade (#119): utility rules read from Tailwind's output, each sorted into the conditions it
// applies under, with its specificity. Pure, so it runs on literal CSS with no tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateRules, compiledRules, specificity, winner } from '../scripts/cascade.mjs';

const MODES = [{ key: 'light', selector: ':root' }, { key: 'dark', selector: '.dark' }];
const CSS = `@layer theme { :root { --x: 1px; } }
@layer utilities {
  .bg-muted { background-color: var(--muted); }
  @media (hover: hover) {
    .hover\\:bg-muted:hover { background-color: var(--muted); }
    .hover\\:bg-primary\\/80:hover { background-color: var(--primary); }
    @supports (color: color-mix(in lab, red, red)) {
      .hover\\:bg-primary\\/80:hover { background-color: color-mix(in oklab, var(--primary) 80%, transparent); }
    }
  }
  .bg-destructive\\/10 {
    background-color: var(--destructive);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--destructive) 10%, transparent);
    }
  }
  .dark\\:bg-input\\/30:is(.dark *) { background-color: var(--input); }
  @media (hover: hover) {
    .dark\\:hover\\:bg-input\\/50:is(.dark *):hover { background-color: var(--input); }
  }
  .focus-visible\\:border-ring:focus-visible { border-color: var(--ring); }
  .disabled\\:opacity-50:disabled { opacity: 50%; }
  .aria-disabled\\:opacity-50[aria-disabled="true"] { opacity: 50%; }
  .data-disabled\\:opacity-50[data-disabled] { opacity: 50%; }
  .aria-invalid\\:border-destructive[aria-invalid="true"] { border-color: var(--destructive); }
  .data-\\[size\\=sm\\]\\:p-1[data-size="sm"] { padding: var(--spacing); }
  .active\\:not-aria-\\[haspopup\\]\\:translate-y-px:active:not([aria-haspopup]) { --tw-translate-y: 1px; translate: var(--tw-translate-x) var(--tw-translate-y); }
  :where([data-slot="button-group"]) .in-data-\\[slot\\=button-group\\]\\:rounded-lg { border-radius: var(--radius); }
  .has-data-\\[icon\\=inline-end\\]\\:pr-2:has([data-icon="inline-end"]) { padding-right: calc(var(--spacing) * 2); }
  .\\[\\&_svg\\]\\:shrink-0 svg { flex-shrink: 0; }
  @media (width >= 40rem) { .sm\\:p-2 { padding: calc(var(--spacing) * 2); } }
}
.dark { --x: 2px; }`;

const rules = compiledRules(CSS);
const one = (cand, attrs) => {
  const r = candidateRules(rules, cand, { modes: MODES, attrs });
  assert.equal(r.length, 1, `${cand}: one rule`);
  return r[0];
};

test('only the utilities layer is read, and an @supports branch replaces the fallback it guards', () => {
  assert.ok(rules.every(r => r.selector.startsWith('.') || r.selector.startsWith(':where')));
  assert.equal(one('hover:bg-primary/80').decls['background-color'], 'color-mix(in oklab, var(--primary) 80%, transparent)');
  assert.equal(one('bg-destructive/10').decls['background-color'], 'color-mix(in oklab, var(--destructive) 10%, transparent)');
});

test('conditions: a Mode, a canonical state, its other spellings, and an attribute state', () => {
  assert.deepEqual(one('bg-muted').when, { mode: null, state: null, attrs: {} });
  assert.deepEqual(one('hover:bg-muted').when, { mode: null, state: 'hover', attrs: {} });
  assert.deepEqual(one('dark:hover:bg-input/50').when, { mode: 'dark', state: 'hover', attrs: {} });
  assert.deepEqual(one('focus-visible:border-ring').when, { mode: null, state: 'focus', attrs: {} });
  for (const cand of ['disabled:opacity-50', 'aria-disabled:opacity-50', 'data-disabled:opacity-50'])
    assert.equal(one(cand).when.state, 'disabled', cand);
  assert.deepEqual(one('aria-disabled:opacity-50').css, '[aria-disabled="true"]');
  assert.deepEqual(one('aria-invalid:border-destructive').when, { mode: null, state: null, attrs: { 'aria-invalid': 'true' } });
});

test('an attribute the component sets from its own prop is a condition on that prop', () => {
  assert.deepEqual(one('data-[size=sm]:p-1', { 'data-size': 'size' }).when, { mode: null, state: null, attrs: {}, props: { size: 'sm' } });
});

test('rules the tuple cannot decide are kept apart, each with its kind', () => {
  assert.equal(one('in-data-[slot=button-group]:rounded-lg').skip, 'ancestor');
  assert.equal(one('has-data-[icon=inline-end]:pr-2').skip, 'slot');
  assert.equal(one('[&_svg]:shrink-0').skip, 'descendant');
  assert.equal(one('sm:p-2').skip, 'media');
  assert.equal(one('active:not-aria-[haspopup]:translate-y-px').skip, 'condition');
});

test('specificity counts classes, attributes and pseudo-classes; :is takes its argument, :where counts nothing', () => {
  assert.deepEqual(specificity('.a'), [0, 1, 0]);
  assert.deepEqual(specificity('.a:hover'), [0, 2, 0]);
  assert.deepEqual(specificity('.a:is(.dark *):hover'), [0, 3, 0]);
  assert.deepEqual(specificity('.a[aria-invalid="true"]'), [0, 2, 0]);
  assert.deepEqual(specificity(':where([data-slot="x"]) .a'), [0, 1, 0]);
  assert.deepEqual(specificity('.a svg:not([class*=\'size-\'])'), [0, 2, 1]);
});

test('the winner per property: higher specificity, then later in the output', () => {
  const pick = cands => winner(cands.map(c => one(c)), 'background-color').candidate;
  assert.equal(pick(['bg-muted', 'hover:bg-muted', 'dark:bg-input/30']), 'dark:bg-input/30', 'equal specificity: later wins');
  assert.equal(pick(['dark:bg-input/30', 'hover:bg-muted', 'dark:hover:bg-input/50']), 'dark:hover:bg-input/50');
  assert.equal(winner([one('bg-muted')], 'border-color'), null);
});
