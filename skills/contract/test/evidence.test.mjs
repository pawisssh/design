// draftedEvidence (ADR 0010, #387): each citation in `drafted`'s agent evidence must lie in a source file and show a
// word its claim names. The two citations #387's review found a line off are the first cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftedEvidence, reasonEvidence } from '../scripts/contract.mjs';

const files = {
  'packages/web/src/buttons/Button.tsx': [
    'import { Icon } from "../icons";',       // L1
    'export const Button = () => (',          // L2
    '  <span className={endNodeCss}>',        // L3
    '    <Icon color="currentColor" name={endIcon} />', // L4
    '  </span>',                              // L5
    ');',                                     // L6
  ].join('\n'),
  'apps/docs/Button/_webExamples.mdx': ['```jsx live', '<Button startIcon="wallet" endIcon="forwardArrow">'].join('\n'),
  'styles/_select.scss': '.#{$prefix}--select {\n  inline-size: 100%;\n}',
  'a/_mixins.scss': '', 'b/_mixins.scss': '',
};
const check = (evidence, normalise) => draftedEvidence({ drafted: { 'anatomy.End glyph': { by: 'agent', evidence, fingerprint: 'sha256:0' } } }, files, normalise);

test('a citation a line off shows none of the words its claim names', () => {
  assert.deepEqual(check(['Button.tsx:L4 the Icon named by endIcon, color currentColor']), []);
  assert.deepEqual(check(['Button.tsx:L3 the Icon named by endIcon, color currentColor']),
    ['anatomy.End glyph: "Button.tsx:L3 the Icon named by endIcon, color currentColor": the cited lines show none of Icon, endIcon, color, currentColor']);
  assert.match(check(['_webExamples.mdx:L1 startIcon="wallet" with endIcon="forwardArrow"'])[0], /show none of startIcon, wallet, endIcon, forwardArrow$/);
  assert.deepEqual(check(['_webExamples.mdx:L2 startIcon="wallet"']), []);
});

test('every range must lie in its file, and each file must be exactly one source path', () => {
  assert.match(check(['Button.tsx:L5-L9 the span'])[0], /: L5-L9 is not in Button\.tsx \(6 lines\)$/);
  assert.match(check(['Button.tsx:L4-L3 the Icon'])[0], /: L4-L3 is not in Button\.tsx/);
  assert.match(check(['Missing.tsx:L1 the Icon'])[0], /: no source file is Missing\.tsx$/);
  assert.match(check(['_mixins.scss:L1 a mixin'])[0], /: more than one source file is _mixins\.scss$/);
  assert.match(check(['the Icon at L4'])[0], /: it cites no <file>:L<n>$/);
  assert.deepEqual(check(['packages/web/src/buttons/Button.tsx:L4 the Icon']), [], 'a full path names the file too');
});

test('a claim may cite more lines, in the same file or another', () => {
  assert.deepEqual(check(['Button.tsx:L1 and L4 the Icon named by endIcon']), []);
  assert.deepEqual(check(['_webExamples.mdx:L2 endIcon="forwardArrow", rendered at Button.tsx:L4']), []);
  assert.match(check(['_webExamples.mdx:L2 rendered at Button.tsx:L9'])[0], /: L9-L9 is not in Button\.tsx/);
});

test('normalise rewrites the source before the match; a claim naming no source word passes', () => {
  const prefix = t => t.replace(/#\{\$prefix\}/g, 'cds');
  assert.deepEqual(check(['_select.scss:L2 .cds--select hugs its content']), [], 'a word no source file holds is not checked');
  assert.match(check(['_select.scss:L2 .cds--select hugs its content'], prefix)[0], /show none of cds--select$/);
  assert.deepEqual(check(['_select.scss:L1 .cds--select hugs its content'], prefix), []);
  assert.deepEqual(check(['Button.tsx:L6 closes the expression']), []);
});

test('owner entries are not checked', () => {
  assert.deepEqual(draftedEvidence({ drafted: { 'axes.size.label': { by: 'owner', was: 'Size' } } }, files), []);
  assert.deepEqual(draftedEvidence({}, files), []);
});

// reasonEvidence (#460): a reason or note cites as `<file> L<n>` or `<file>:L<n>`, and a bare `L<n>` is in the file
// named last. Only texts citing an `L<n>` are checked.
const reasonProblems = (reason, note) => reasonEvidence({
  axes: [{ key: 'size', values: [], dropped: [{ value: 'xl', reason: 'Button.tsx L9 has no xl' }] }],
  layout: [{ when: {}, set: { 'End glyph': { width: { value: 16, reason } } } }],
  notes: note ? [{ at: 'code', severity: 'info', message: note }] : [],
}, files);
const AXIS = 'axes[0].dropped[0].reason: "Button.tsx L9 has no xl": L9-L9 is not in Button.tsx (6 lines)';

test('a reason cites `<file> L<n>`, and a bare `L<n>` is in the file named last, in a citation or the prose', () => {
  assert.deepEqual(reasonProblems('Button.tsx L3 wraps it in endNodeCss; the Icon is at L4'), [AXIS]);
  assert.deepEqual(reasonProblems('Button.tsx:L3-L4 endNodeCss, then Icon (L4)'), [AXIS]);
  assert.deepEqual(reasonProblems('the Icon (Button.tsx) sits at L4'), [AXIS]);
  assert.deepEqual(reasonProblems('a fixed 16 px glyph, no citation'), [AXIS]);
});

test('a reason fails when its citation does not hold', () => {
  const problem = reason => reasonProblems(reason).filter(p => p !== AXIS);
  assert.deepEqual(problem('the Icon sits at L4'), [
    'layout[0].End glyph.width.reason: "the Icon sits at L4": L4 names no file']);
  assert.match(problem('Button.tsx L7 renders the Icon')[0], /L7-L7 is not in Button.tsx \(6 lines\)$/);
  assert.match(problem('Button.tsx L1 wraps it in endNodeCss')[0], /the cited lines show none of endNodeCss$/);
  assert.match(problem('the size is at _mixins.scss L1')[0], /more than one source file is _mixins.scss$/);
});

test('a note is checked as a reason is; a file that is no source names none; a wrong value its line holds passes', () => {
  const notes = note => reasonProblems(undefined, note).filter(p => p !== AXIS);
  assert.match(notes('Other.figma.ts maps it (L13-L19)')[0], /^note at code: .*: L13 names no file$/);
  // #453's first draft gave a dashoffset of 0.25 at a line that held pathLength: the line exists and names the
  // word, so only a review catches the value.
  assert.deepEqual(notes('Button.tsx L4 Icon color is 0.25'), []);
});
