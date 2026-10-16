#!/usr/bin/env node
// #93 prototype: does each form-control Contract show and hide what real Carbon renders?
//   node prototypes/form-schema/dom-check.mjs [<component.json>...]
//
// For every selected tuple it renders the real @carbon/react component through the Adapter's preview renderer
// (the same render To-preview uses) and reads the markup for the parts the Contract hides with `visible` rules:
// the helper text, the invalid and warn messages, the invalid and warn icons, and a Select's chevron and option.
// It compares what the markup holds with what contract.resolve() says is visible, and checks that every
// `code.required` prop reached the markup. The two sides share nothing but the tuple, so a `visible` rule that
// disagrees with Carbon fails here. Exits 1 on any mismatch.
import { readFileSync } from 'node:fs';
import * as contract from '../../skills/contract/scripts/contract.mjs';
import { previewRenderer } from '../../skills/adapter-carbon/scripts/preview.mjs';

const root = new URL('../../', import.meta.url);
const files = process.argv.slice(2).length ? process.argv.slice(2) : [
  'design-systems/carbon/contracts/text-input.component.json',
  'design-systems/carbon/contracts/select.component.json',
];

const prop = (c, key) => c.properties.find(p => p.key === key).default;
// Markup probes, per anatomy node: what in Carbon's DOM stands for that node being rendered.
const probes = c => {
  const k = c.family.key === 'text-input' ? 'text-input' : 'select';
  return {
    Helper: html => html.includes('cds--form__helper-text') && html.includes(prop(c, 'helperText')),
    'Invalid text': html => new RegExp(`class="cds--form-requirement"[^>]*>${prop(c, 'invalidText')}<`).test(html),
    'Warn text': html => new RegExp(`class="cds--form-requirement"[^>]*>${prop(c, 'warnText')}<`).test(html),
    'Invalid icon': html => new RegExp(`class="cds--${k}__invalid-icon"`).test(html),
    'Warn icon': html => new RegExp(`class="cds--${k}__invalid-icon cds--${k}__invalid-icon--warning"`).test(html),
    ...(k === 'select' ? {
      Chevron: html => html.includes('class="cds--select__arrow"'),
      Value: html => new RegExp(`<option[^>]*>${prop(c, 'value')}</option>`).test(html),
    } : {}),
  };
};

let failed = 0;
for (const file of files) {
  const c = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
  const { render } = await previewRenderer(c);
  const checks = probes(c);
  let tuples = 0;
  const mismatches = [];
  for (const t of contract.expand(c)) {
    tuples++;
    const html = render(t);
    const layout = contract.resolve(c, t).layout;
    for (const [node, inDom] of Object.entries(checks)) {
      const want = !(layout[node] && layout[node].visible === false);
      const got = inDom(html);
      if (want !== got) mismatches.push(`${contract.variantName(c, t)}: ${node} is ${want ? 'visible' : 'hidden'} in the Contract but ${got ? 'present' : 'absent'} in Carbon`);
    }
    for (const r of c.code.required || [])
      if (!new RegExp(`\\b${r}="${c.family.key}-`).test(html)) mismatches.push(`${contract.variantName(c, t)}: required prop ${r} did not reach the markup`);
  }
  console.log(`${c.family.name}: ${tuples} tuples, ${Object.keys(checks).length} nodes each, ${mismatches.length} mismatches`);
  mismatches.slice(0, 20).forEach(m => console.log(`  ${m}`));
  failed += mismatches.length;
}
process.exit(failed ? 1 : 0);
