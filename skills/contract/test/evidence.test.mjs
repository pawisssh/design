// draftedEvidence (ADR 0010, #387): each citation in `drafted`'s agent evidence must lie in a source file and show a
// word its claim names. The two citations #387's review found a line off are the first cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftedEvidence } from '../scripts/contract.mjs';

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

// ---------- a citation in a `reason` or a note (#459) ----------
// The lines of CDS's ProgressCircle.tsx that #453's Arc note cites, renumbered, and a css literal.
const circle = {
  ...files,
  'packages/web/src/visualizations/ProgressCircle.tsx': [
    'const progressOffset = 1 - progress;',   // L1
    '  strokeDashoffset: progressOffset,',    // L2
    '  pathLength={1}',                       // L3
    '  strokeDasharray={1}',                  // L4
    '  progress = indeterminate ? 0.75 : 0,', // L5
    '  <span className={cx(loading && hiddenCss)}>{children}</span>', // L6
    'const hiddenCss = css`',                 // L7
    '  opacity: 0;',                          // L8
    '`;',                                     // L9
  ].join('\n'),
};
const raw = reason => ({ raw: 24, level: 'info', reason });
const prose = ({ reason, note }) => draftedEvidence({
  family: { key: 'button', name: 'Button' },
  layout: [{ match: {}, set: { Arc: { width: raw(reason || 'a constant') } } }],
  paint: [{ match: {}, set: { Arc: { stroke: { token: 'focus', by: 'owner', was: raw('ProgressCircle.tsx L1 pathLength, a value the owner replaced') } } } }],
  notes: note ? [{ level: 'info', at: 'layout.Arc.arc', message: note }] : [],
}, circle);

test('each citation in a note shows every identifier of its own claim: #453\'s first Arc note fails, the fixed one holds', () => {
  const good = 'The Contract draws that start: 270 degrees clockwise from 12 o\'clock (an indeterminate progress of 0.75, ProgressCircle.tsx L5, drawn as stroke-dashoffset 1 - 0.75 = 0.25, L1 and L2, of pathLength 1 and stroke-dasharray 1, L3-L4).';
  assert.deepEqual(prose({ note: good }), []);
  // #453's first draft, verbatim but for the line numbers: the dashoffset cited the dasharray's lines
  const bad = 'The Contract draws that start: 270 degrees clockwise from 12 o\'clock (stroke-dashoffset 0.25 of pathLength 1, ProgressCircle.tsx L3-L4).';
  assert.deepEqual(prose({ note: bad }), [`notes[0]: "${bad}": ProgressCircle.tsx L3-L4: the cited lines do not show stroke-dashoffset`]);
});

test('a reason cites `<file> L<n>`, and a bare L<n> or one after an identifier is in the last file named', () => {
  assert.deepEqual(prose({ reason: 'opacity 0 while loading: the label is hidden (packages/web/src/visualizations/ProgressCircle.tsx L6, hiddenCss L6)' }), []);
  const bad = 'the label is hidden by hiddenCss (ProgressCircle.tsx L5)';
  assert.deepEqual(prose({ reason: bad }), [`layout[0].set.Arc.width.reason: "${bad}": ProgressCircle.tsx L5: the cited lines do not show hiddenCss`]);
  assert.match(prose({ reason: 'the label is hidden (L6)' })[0], /: L6 names no file$/);
  assert.match(prose({ reason: 'the label (ProgressCircle.tsx L12)' })[0], /: L12-L12 is not in ProgressCircle\.tsx \(9 lines\)$/);
});

test('only identifiers are checked; one that names the block around the cited lines holds', () => {
  assert.deepEqual(prose({ reason: 'the label is hidden (ProgressCircle.tsx L5)' }), [], 'plain words are not identifiers');
  assert.deepEqual(prose({ reason: 'opacity 0 in hiddenCss (ProgressCircle.tsx L8)' }), []);
  assert.match(prose({ reason: 'opacity 0 in progressOffset (ProgressCircle.tsx L8)' })[0], /L8: the cited lines do not show progressOffset$/);
});

test('a citation that opens a sentence backs the claim after it; a claim stops at its sentence', () => {
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset and L3 sets pathLength.' }), []);
  assert.match(prose({ note: 'ProgressCircle.tsx L4 sets progressOffset' })[0], /L4: the cited lines do not show progressOffset$/);
  assert.deepEqual(prose({ note: 'The Arc names strokeDasharray. The span hides with hiddenCss (ProgressCircle.tsx L6).' }), []);
});

test('a claim ends at a contrast word, as at its sentence: what follows is the next claim (#462)', () => {
  for (const word of ['while', 'whereas', 'but', 'though']) {
    assert.deepEqual(prose({ note: `ProgressCircle.tsx L2 sets strokeDashoffset ${word} pathLength stays 1.` }), [], word);
    assert.deepEqual(prose({ note: `progressOffset is strokeDashoffset, ${word} pathLength stays 1 (ProgressCircle.tsx L3).` }), [], word);
  }
  // #462's select notes[0], renumbered: the outer path's colour is a claim of its own, with no citation
  assert.deepEqual(prose({ note: 'The span is two-toned: ProgressCircle.tsx L6 hides it with hiddenCss while the Arc takes strokeDasharray.' }), []);
  const own = 'ProgressCircle.tsx L3 sets strokeDashoffset while pathLength stays 1.';
  assert.deepEqual(prose({ note: own }), [`notes[0]: "${own}": ProgressCircle.tsx L3: the cited lines do not show strokeDashoffset`], 'the claim before the word is still checked');
  const next = 'ProgressCircle.tsx L2 sets strokeDashoffset while pathLength stays 1 (L4).';
  assert.deepEqual(prose({ note: next }), [`notes[0]: "${next}": L4: the cited lines do not show pathLength`], 'the claim after it is checked against its own citation');
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset while L3 sets pathLength.' }), []);
});

test('a citation that opens a clause mid-sentence backs the clause after it (#462)', () => {
  // #462's text-input notes[3], renumbered: L3 was checked against L2's clause
  assert.deepEqual(prose({ note: 'With a progress, ProgressCircle.tsx L2 sets strokeDashoffset and L3 sets pathLength.' }), []);
  const bad = 'With a progress, ProgressCircle.tsx L3 sets strokeDashoffset.';
  assert.deepEqual(prose({ note: bad }), [`notes[0]: "${bad}": ProgressCircle.tsx L3: the cited lines do not show strokeDashoffset`]);
  const after = 'The span takes hiddenCss (ProgressCircle.tsx L6) and L3 sets strokeDashoffset.';
  assert.deepEqual(prose({ note: after }), [`notes[0]: "${after}": L3: the cited lines do not show strokeDashoffset`]);
  assert.deepEqual(prose({ note: 'The span takes hiddenCss, ProgressCircle.tsx L6, and opacity 0.' }), [], 'one followed by punctuation backs the claim before');
});

test('a bare L<n> in a clause that names more than one file is ambiguous: it names its file (#462)', () => {
  // #462's toast-notification notes[4]: bare lines meant for one file resolved to another the note named
  const two = 'ProgressCircle.tsx L2 sets strokeDashoffset and Button.tsx L4 renders the Icon, at pathLength 1 (L3).';
  assert.deepEqual(prose({ note: two }), [`notes[0]: "${two}": L3 follows more than one file in its clause (ProgressCircle.tsx, Button.tsx): name its file`]);
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset but Button.tsx L4 renders the Icon (L4).' }), [], 'a contrast word ends the clause');
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset and Button.tsx L4 renders the Icon; ProgressCircle.tsx L3 sets pathLength (L3).' }), [], 'a `;` clause names its own file');
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset; Button.tsx L4 renders the Icon (L4).' }), [], 'the clause before names another file');
  assert.deepEqual(prose({ note: 'Button.tsx L4 renders the Icon, and pathLength and strokeDasharray are 1 (ProgressCircle.tsx L3 and L4).' }), [], 'L4 continues the run of ProgressCircle.tsx L3');
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset and Button.tsx L4 renders the Icon, at pathLength 1 (ProgressCircle.tsx L3).' }), []);
  assert.deepEqual(prose({ note: 'Button.tsx L4 renders the Icon. ProgressCircle.tsx L2 sets strokeDashoffset and L3 sets pathLength.' }), [], 'a file named in an earlier sentence is not this one\'s');
  assert.deepEqual(prose({ note: 'ProgressCircle.tsx L2 sets strokeDashoffset, packages/web/src/visualizations/ProgressCircle.tsx L3 pathLength, L4 strokeDasharray.' }), [], 'one file named twice');
});

test('prose without a citation and an owner\'s `was` are not checked', () => {
  assert.deepEqual(prose({ reason: 'derived (size − 1lh)/2', note: 'Figma has no animation, so the Arc does not spin.' }), []);
});
