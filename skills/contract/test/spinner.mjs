// The Carbon Button with a CDS-style spinner (#442), for the contract and schema tests: `Spinner` is an absolute
// FRAME without Auto Layout, centred in the root, holding a full-circle `Track` and a 270° `Arc`, both ELLIPSE.
import { asDraft } from '../scripts/contract.mjs';

/** A raw size, as the spinner's nodes take it. */
export const px = n => ({ raw: n, level: 'info', reason: 'spinner test size' });

/** A draft copy of `button` with the spinner; `edit(spinnerLayout, spinnerPaint)` may change the two rules first. */
export function withSpinner(button, edit = () => {}) {
  const c = asDraft(button);
  c.anatomy.children.push({ name: 'Spinner', type: 'FRAME', children: [
    { name: 'Track', type: 'ELLIPSE' }, { name: 'Arc', type: 'ELLIPSE' }] });
  const layout = { match: {}, set: {
    Spinner: { direction: 'none', position: 'absolute', constraints: { horizontal: 'center', vertical: 'center' }, width: px(24), height: px(24) },
    Track: { width: px(24), height: px(24), strokeWeight: px(2), arc: { start: 0, sweep: 360 } },
    Arc: { width: px(24), height: px(24), strokeWeight: px(2), arc: { start: 0, sweep: 270 }, strokeCap: 'round' },
  } };
  // To-design's tests override Track's stroke with `focus`: their foundations lack border-subtle-01 (#459).
  const paint = { match: {}, set: { Track: { stroke: { token: 'border-subtle-01' } }, Arc: { stroke: { sameAs: 'Track.stroke' } } } };
  edit(layout.set, paint.set);
  c.layout.push(layout);
  c.paint.push(paint);
  return c;
}
