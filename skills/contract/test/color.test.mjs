// Tests for the shared colour converter (#104), through its public functions only.
// Anchors: #70 §2 and §5 (clipping, opacity mixes) and the #91 worked pairs (ΔE and chroma).
// Run: node --test skills/contract/test/color.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { convert, oklab, deltaE, chroma } from '../scripts/color.mjs';

const close = (actual, expected, digits) => assert.equal(actual.toFixed(digits), expected.toFixed(digits));

test('an out-of-gamut oklch value clips per channel: Tailwind yellow-400 is #fdc700', () => {
  assert.deepEqual(convert('oklch(0.852 0.199 91.936)'), { hex: '#fdc700', alpha: 1, clipped: true });
  assert.equal(convert('color(display-p3 1 0 0)').clipped, true);
});

test('achromatic shadcn tokens and P3 white are not reported as clipped', () => {
  assert.deepEqual(convert('oklch(1 0 0)'), { hex: '#ffffff', alpha: 1, clipped: false });
  assert.deepEqual(convert('oklch(0.985 0 0)'), { hex: '#fafafa', alpha: 1, clipped: false });
  assert.deepEqual(convert('oklch(0.145 0 0)'), { hex: '#0a0a0a', alpha: 1, clipped: false });
  assert.deepEqual(convert('color(display-p3 1 1 1)'), { hex: '#ffffff', alpha: 1, clipped: false });
});

test('an in-gamut colour round-trips through oklab() and oklch() to its hex', () => {
  for (const hex of ['#0f62fe', '#da1e28', '#161616', '#edf5ff', '#24a148']) {
    const [L, a, b] = oklab(hex);
    const C = Math.sqrt(a * a + b * b), H = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    assert.deepEqual(convert(`oklab(${L} ${a} ${b})`), { hex, alpha: 1, clipped: false });
    assert.deepEqual(convert(`oklch(${L} ${C} ${H})`), { hex, alpha: 1, clipped: false });
  }
});

test('OKLab of pure red matches CSS Color 4 (oklch 0.628 0.2577 29.23)', () => {
  const [L, a, b] = oklab('#ff0000');
  close(L, 0.628, 3);
  close(Math.sqrt(a * a + b * b), 0.2577, 4);
  close(Math.atan2(b, a) * 180 / Math.PI, 29.23, 2);
});

test('mixing with transparent changes only alpha', () => {
  assert.deepEqual(convert('color-mix(in oklab, oklch(0.205 0 0) 90%, transparent)'), { hex: '#171717', alpha: 0.9, clipped: false });
  assert.deepEqual(convert('color-mix(in oklab, #0f62fe 90%, transparent)'), { hex: '#0f62fe', alpha: 0.9, clipped: false });
  // dark --input at /30: white at 0.15 × 0.3.
  assert.deepEqual(convert('color-mix(in oklab, oklch(1 0 0 / 15%) 30%, transparent)'), { hex: '#ffffff', alpha: 0.045, clipped: false });
});

test('ΔE and chroma match the #91 worked pairs', () => {
  const pairs = [['#edf5ff', '#f4f4f4', 0.0159], ['#fafafa', '#ffffff', 0.0149], ['#0f62fe', '#0b5cff', 0.0134], ['#18181b', '#161616', 0.0117]];
  for (const [a, b, d] of pairs) close(deltaE(a, b), d, 4);
  assert.ok(chroma('#edf5ff') >= 0.01);
  assert.ok(chroma('#f4f4f4') < 0.01);
  close(chroma('#18181b'), 0.0059, 4);
});

test('mixing in oklch keeps the chromatic colour\'s hue when the other colour is achromatic', () => {
  // L 0.5×0.8 + 0.6×0.2, C 0×0.8 + 0.2×0.2, hue 30 (not 0×0.8 + 30×0.2).
  assert.equal(convert('color-mix(in oklch, oklch(0.5 0 0), oklch(0.6 0.2 30) 20%)').hex, convert('oklch(0.52 0.04 30)').hex);
  assert.equal(convert('color-mix(in oklch, #808080, oklch(0.6 0.2 30) 20%)').hex, convert(`oklch(${oklab('#808080')[0] * 0.8 + 0.12} 0.04 30)`).hex);
});

test('mix percentages normalise: one omitted, sum below 100% scales alpha, sum above 100% rescales', () => {
  assert.deepEqual(convert('color-mix(in srgb, #ff0000 25%, #0000ff)'), convert('color-mix(in srgb, #ff0000 25%, #0000ff 75%)'));
  assert.deepEqual(convert('color-mix(in srgb, #ff0000, #0000ff)'), convert('color-mix(in srgb, #ff0000 50%, #0000ff 50%)'));
  const under = convert('color-mix(in srgb, #ff0000 30%, #0000ff 20%)');
  assert.equal(under.alpha, 0.5);
  assert.equal(under.hex, convert('color-mix(in srgb, #ff0000 60%, #0000ff 40%)').hex);
  assert.deepEqual(convert('color-mix(in srgb, #ff0000 90%, #0000ff 60%)'), convert('color-mix(in srgb, #ff0000 60%, #0000ff 40%)'));
});

test('a mix of two tokens is evaluated premultiplied, and nests', () => {
  assert.equal(convert('color-mix(in srgb, #ff0000, #0000ff)').hex, '#800080');
  assert.deepEqual(convert('color-mix(in srgb, rgb(255 0 0 / 0.5), #0000ff)'), { hex: '#5500aa', alpha: 0.75, clipped: false });
  assert.deepEqual(convert('color-mix(in oklab, color-mix(in oklab, #0f62fe 50%, transparent) 50%, transparent)'), { hex: '#0f62fe', alpha: 0.25, clipped: false });
});

test('every listed syntax reads', () => {
  const cases = {
    '#0f62fe': '#0f62fe', '#F00': '#ff0000', '#abc8': '#aabbcc',
    'rgb(15, 98, 254)': '#0f62fe', 'rgba(15,98,254,.3)': '#0f62fe', 'rgb(100% 0% 0% / 50%)': '#ff0000',
    'hsl(120 100% 50%)': '#00ff00', 'hsla(210deg, 50%, 40%, 1)': '#336699', 'hsl(0.5turn 100% 50%)': '#00ffff',
    'oklab(0.62796 0.22486 0.12585)': '#ff0000', 'oklab(62.796% 56.2% 31.5%)': '#ff0000',
    'oklch(62.796% 0.25768 29.2339deg)': '#ff0000',
    'color(srgb 0 0.5 1)': '#0080ff', 'color(display-p3 1 1 1 / 0.5)': '#ffffff',
    'transparent': '#000000', 'white': '#ffffff', 'BLACK': '#000000',
  };
  for (const [text, hex] of Object.entries(cases)) assert.equal(convert(text).hex, hex, text);
  assert.equal(convert('#abc8').alpha, 0.5333);
  assert.equal(convert('rgba(15,98,254,.3)').alpha, 0.3);
  assert.equal(convert('transparent').alpha, 0);
});

test('text the converter cannot evaluate throws, naming the value', () => {
  const cases = [
    ['oklch(from var(--primary) 0.3 calc(c*0.4) h)', /relative colour syntax/],
    ['var(--primary)', /var\(\) must be resolved/],
    ['calc(1px + 2px)', /calc\(\)/],
    ['rebeccapurple', /not a colour/],
    ['color-mix(in hsl, #fff, #000)', /in hsl" is not supported/],
    ['color(rec2020 1 0 0)', /rec2020/],
    ['rgb(1 2)', /three components/],
    ['#12345', /3, 4, 6 or 8/],
  ];
  for (const [text, why] of cases) {
    assert.throws(() => convert(text), err => err.message.includes(JSON.stringify(text)) && why.test(err.message), text);
  }
});

test('the module runs inlined, without export, beside contract.mjs in a bare context', () => {
  const read = rel => readFileSync(new URL(`../scripts/${rel}`, import.meta.url), 'utf8').replace(/^export /gm, '');
  const out = vm.runInNewContext(`${read('contract.mjs')}\n${read('color.mjs')}
    ;JSON.stringify([convert('oklch(0.852 0.199 91.936)'), deltaE('#edf5ff', '#f4f4f4').toFixed(4), typeof require, typeof process])`, {});
  assert.deepEqual(JSON.parse(out), [{ hex: '#fdc700', alpha: 1, clipped: true }, '0.0159', 'undefined', 'undefined']);
});
