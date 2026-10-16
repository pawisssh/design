// The one CSS colour → sRGB converter (#70 §5). An Adapter uses it for a Foundations COLOR value, and To-handoff's
// matcher uses it for every Prototype colour, so both sides of a match convert the same way.
//
// Route (CSS Color 4): parse → linear sRGB (via XYZ-D65 / OKLab with the spec's matrices) → sRGB transfer →
// clip each channel to [0, 1] → 8-bit #rrggbb. Alpha stays separate, rounded to 4 decimals.
// color-mix() is CSS Color 5: premultiplied, in srgb, oklab or oklch, with missing components carried and an
// achromatic colour's hue treated as missing.
//
// Pure ES2019 with no imports, so the builder core and the To-preview page can inline it (strip `export`).
// Private names are prefixed `col` so the file can share one scope with contract.mjs.

/** CSS colour text → {hex: "#rrggbb", alpha, clipped}. Throws, naming the value, for text it cannot evaluate. */
export function convert(text) {
  const color = colParse(text, text);
  const rgb = colGamma(colToLinear(color));
  let clipped = false;
  const bytes = rgb.map(c => {
    const v = Math.min(1, Math.max(0, c));
    // Clipped means the clip moved a channel by more than half an 8-bit step, so float noise on white stays false.
    if (Math.abs(v - c) > 0.5 / 255) clipped = true;
    return Math.round(v * 255);
  });
  return { hex: '#' + bytes.map(b => (b < 16 ? '0' : '') + b.toString(16)).join(''), alpha: colRound(colAlpha(color)), clipped: clipped };
}

/** OKLab [L, a, b] of the converted 8-bit colour (what the matcher measures, #91). */
export function oklab(text) {
  const hex = convert(text).hex;
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return colLinearToOklab(colLinear(rgb));
}

/** OKLab ΔE (Euclidean distance) between two colours, each measured on its converted 8-bit value. */
export function deltaE(a, b) {
  const p = oklab(a), q = oklab(b);
  return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2));
}

/** OKLab chroma C = √(a² + b²) of the converted 8-bit colour. */
export function chroma(text) {
  const lab = oklab(text);
  return Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
}

// ---------- parsing: a colour is {space, coords: [c0, c1, c2], alpha}; a missing (`none`) component is null ----------

const COL_NAMED = { transparent: [0, 0, 0, 0], black: [0, 0, 0, 1], white: [1, 1, 1, 1] };

function colFail(value, why) {
  throw new Error(`colour ${JSON.stringify(String(value))}: ${why}`);
}

function colParse(text, whole) {
  const s = String(text).trim().toLowerCase();
  if (/^#[0-9a-f]+$/.test(s)) return colHex(s, whole);
  if (Object.prototype.hasOwnProperty.call(COL_NAMED, s)) {
    const n = COL_NAMED[s];
    return { space: 'srgb', coords: n.slice(0, 3), alpha: n[3] };
  }
  const m = /^([a-z-]+)\(([\s\S]*)\)$/.exec(s);
  if (!m) colFail(whole, 'not a colour this converter reads (hex, rgb(), hsl(), oklab(), oklch(), color(), color-mix(), transparent, black, white)');
  const fn = m[1], body = m[2];
  if (fn === 'var' || fn === 'calc' || fn === 'env') colFail(whole, `${fn}() must be resolved before conversion`);
  if (/(^|[\s,(])from\s/.test(body)) colFail(whole, 'relative colour syntax is not supported');
  if (fn === 'color-mix') return colMix(body, whole);
  const parts = colArgs(body, whole);
  if (fn === 'rgb' || fn === 'rgba') {
    return { space: 'srgb', coords: parts.coords.map(t => colNum(t, whole, 1, 255)), alpha: colAlphaArg(parts.alpha, whole) };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    const h = colHue(parts.coords[0], whole), sat = colNum(parts.coords[1], whole, 1, 100), l = colNum(parts.coords[2], whole, 1, 100);
    return { space: 'hsl', coords: [h, sat, l], alpha: colAlphaArg(parts.alpha, whole) };
  }
  if (fn === 'oklab') {
    return { space: 'oklab', coords: [colNum(parts.coords[0], whole, 1, 1), colNum(parts.coords[1], whole, 0.4, 1), colNum(parts.coords[2], whole, 0.4, 1)], alpha: colAlphaArg(parts.alpha, whole) };
  }
  if (fn === 'oklch') {
    return { space: 'oklch', coords: [colNum(parts.coords[0], whole, 1, 1), colNum(parts.coords[1], whole, 0.4, 1), colHue(parts.coords[2], whole)], alpha: colAlphaArg(parts.alpha, whole) };
  }
  if (fn === 'color') {
    const space = parts.coords.length === 4 ? parts.coords[0] : '';
    if (space !== 'srgb' && space !== 'display-p3') colFail(whole, `color() space "${space}" is not supported (srgb, display-p3)`);
    return { space: space, coords: parts.coords.slice(1).map(t => colNum(t, whole, 1, 1)), alpha: colAlphaArg(parts.alpha, whole) };
  }
  colFail(whole, `${fn}() is not supported`);
}

function colHex(s, whole) {
  let h = s.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 && h.length !== 8) colFail(whole, 'hex colour must have 3, 4, 6 or 8 digits');
  const n = [0, 2, 4, 6].map(i => (i < h.length ? parseInt(h.slice(i, i + 2), 16) / 255 : 1));
  return { space: 'srgb', coords: n.slice(0, 3), alpha: n[3] };
}

// Splits a function body into 3 or 4 component tokens and an optional alpha (after "/" or a 4th legacy comma value).
function colArgs(body, whole) {
  const slash = body.split('/');
  if (slash.length > 2) colFail(whole, 'more than one "/"');
  const tokens = slash[0].split(/[\s,]+/).filter(Boolean);
  let alpha = slash.length === 2 ? slash[1].trim() : null;
  if (alpha === null && body.indexOf(',') >= 0 && tokens.length === 4) alpha = tokens.pop();
  if (tokens.length !== 3 && !(tokens.length === 4 && /^[a-z]/.test(tokens[0]) && tokens[0] !== 'none')) colFail(whole, 'expected three components');
  return { coords: tokens, alpha: alpha };
}

// A number or percentage: 100% stands for `pctRef`, and a plain number is divided by `numScale`.
function colNum(t, whole, pctRef, numScale) {
  if (t === 'none') return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%?)$/.exec(t);
  if (!m) colFail(whole, `cannot read component "${t}"`);
  const v = parseFloat(m[1]);
  return m[2] ? (v / 100) * pctRef : v / numScale;
}

function colHue(t, whole) {
  if (t === 'none') return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(t);
  if (!m) colFail(whole, `cannot read hue "${t}"`);
  const v = parseFloat(m[1]);
  const deg = m[2] === 'grad' ? v * 0.9 : m[2] === 'rad' ? v * 180 / Math.PI : m[2] === 'turn' ? v * 360 : v;
  return ((deg % 360) + 360) % 360;
}

function colAlphaArg(t, whole) {
  if (t === null || t === undefined) return 1;
  const v = colNum(t, whole, 1, 1);
  return v === null ? null : Math.min(1, Math.max(0, v));
}

function colAlpha(color) {
  return color.alpha === null ? 0 : color.alpha;
}

function colRound(v) {
  return Math.round(v * 10000) / 10000;
}

// ---------- color-mix() (CSS Color 5) ----------

function colMix(body, whole) {
  const args = colSplitTop(body, ',', whole);
  if (args.length !== 3) colFail(whole, 'color-mix() takes an interpolation space and two colours');
  const head = /^in\s+(srgb|oklab|oklch)(?:\s+(shorter|longer|increasing|decreasing)\s+hue)?$/.exec(args[0].trim());
  if (!head) colFail(whole, `color-mix() "${args[0].trim()}" is not supported (in srgb, in oklab, in oklch)`);
  const space = head[1], method = head[2] || 'shorter';
  const sides = [args[1], args[2]].map(a => {
    const words = colSplitTop(a.trim(), ' ', whole).filter(Boolean);
    const pct = words.filter(w => /%$/.test(w) && !/[()]/.test(w));
    const rest = words.filter(w => pct.indexOf(w) < 0);
    if (pct.length > 1 || rest.length !== 1) colFail(whole, `cannot read color-mix() argument "${a.trim()}"`);
    const p = pct.length ? colNum(pct[0], whole, 1, 1) : null;
    if (p !== null && (p < 0 || p > 1)) colFail(whole, 'color-mix() percentage outside 0%–100%');
    return { color: colParse(rest[0], whole), p: p };
  });
  let p1 = sides[0].p, p2 = sides[1].p;
  if (p1 === null && p2 === null) { p1 = 0.5; p2 = 0.5; }
  else if (p1 === null) p1 = 1 - p2;
  else if (p2 === null) p2 = 1 - p1;
  const sum = p1 + p2;
  if (sum === 0) colFail(whole, 'color-mix() percentages sum to zero');
  const multiplier = sum < 1 ? sum : 1;
  p1 /= sum; p2 /= sum;

  const a = colInSpace(sides[0].color, space), b = colInSpace(sides[1].color, space);
  // Missing components take the other colour's value; missing in both stays missing.
  for (let i = 0; i < 3; i++) {
    if (a.coords[i] === null) a.coords[i] = b.coords[i];
    else if (b.coords[i] === null) b.coords[i] = a.coords[i];
  }
  if (a.alpha === null) a.alpha = b.alpha;
  else if (b.alpha === null) b.alpha = a.alpha;
  const aa = a.alpha === null ? 1 : a.alpha, ba = b.alpha === null ? 1 : b.alpha;
  const alpha = aa * p1 + ba * p2;
  const hueIndex = space === 'oklch' ? 2 : -1;
  if (hueIndex >= 0 && a.coords[2] !== null) {
    const fixed = colFixHues(a.coords[2], b.coords[2], method);
    a.coords[2] = fixed[0]; b.coords[2] = fixed[1];
  }
  const coords = [0, 1, 2].map(i => {
    if (a.coords[i] === null) return null;
    if (i === hueIndex) return ((a.coords[i] * p1 + b.coords[i] * p2) % 360 + 360) % 360;
    const mixed = a.coords[i] * aa * p1 + b.coords[i] * ba * p2;
    return alpha === 0 ? mixed : mixed / alpha;
  });
  return { space: space, coords: coords, alpha: alpha * multiplier };
}

// Splits on a separator at parenthesis depth 0.
function colSplitTop(s, sep, whole) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) colFail(whole, 'unbalanced parentheses'); }
    else if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { out.push(s.slice(start, i)); start = i + 1; }
  }
  if (depth !== 0) colFail(whole, 'unbalanced parentheses');
  out.push(s.slice(start));
  return out;
}

function colFixHues(h1, h2, method) {
  let d = h2 - h1;
  if (method === 'shorter') { if (d > 180) h1 += 360; else if (d < -180) h2 += 360; }
  else if (method === 'longer') { if (d > 0 && d < 180) h1 += 360; else if (d > -180 && d <= 0) h2 += 360; }
  else if (method === 'increasing') { if (d < 0) h2 += 360; }
  else if (d > 0) h1 += 360;
  return [h1, h2];
}

// A colour in the mixing space. A colour already declared there keeps its components (none included), and
// oklab ↔ oklch carries a missing lightness. In oklch an achromatic colour's hue is powerless, so it is missing.
function colInSpace(color, space) {
  if (color.space === space) {
    const own = color.coords.slice();
    if (space === 'oklch' && own[1] !== null && own[1] < 1e-6) own[2] = null;
    return { space: space, coords: own, alpha: color.alpha };
  }
  const lin = colToLinear(color);
  let coords;
  if (space === 'srgb') coords = colGamma(lin);
  else {
    const lab = colLinearToOklab(lin);
    if (space === 'oklab') coords = lab;
    else {
      const c = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
      coords = [lab[0], c, c < 1e-6 ? null : ((Math.atan2(lab[2], lab[1]) * 180 / Math.PI) + 360) % 360];
    }
    const labLike = color.space === 'oklab' || color.space === 'oklch';
    if (labLike && color.coords[0] === null) coords[0] = null;
  }
  return { space: space, coords: coords, alpha: color.alpha };
}

// ---------- conversions (CSS Color 4 sample code matrices) ----------

function colMul(m, v) {
  return m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

function colLinear(rgb) {
  return rgb.map(c => {
    const a = Math.abs(c);
    return a <= 0.04045 ? c / 12.92 : (c < 0 ? -1 : 1) * Math.pow((a + 0.055) / 1.055, 2.4);
  });
}

function colGamma(rgb) {
  return rgb.map(c => {
    const a = Math.abs(c);
    return a > 0.0031308 ? (c < 0 ? -1 : 1) * (1.055 * Math.pow(a, 1 / 2.4) - 0.055) : 12.92 * c;
  });
}

const COL_LIN_SRGB_TO_XYZ = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
const COL_XYZ_TO_LIN_SRGB = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];
const COL_LIN_P3_TO_XYZ = [
  [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
  [35783 / 156275, 247089 / 357200, 198249 / 2500400],
  [0, 32229 / 714400, 5220557 / 5000800],
];
const COL_XYZ_TO_LMS = [
  [0.8190224379967030, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const COL_LMS_TO_OKLAB = [
  [0.2104542683093140, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.4505937096174110],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const COL_OKLAB_TO_LMS = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
const COL_LMS_TO_XYZ = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.1122868032803170, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

function colLinearToOklab(lin) {
  const lms = colMul(COL_XYZ_TO_LMS, colMul(COL_LIN_SRGB_TO_XYZ, lin));
  return colMul(COL_LMS_TO_OKLAB, lms.map(Math.cbrt));
}

function colOklabToLinear(lab) {
  const lms = colMul(COL_OKLAB_TO_LMS, lab).map(c => c * c * c);
  return colMul(COL_XYZ_TO_LIN_SRGB, colMul(COL_LMS_TO_XYZ, lms));
}

// Any parsed colour → linear sRGB, unclipped. A missing component counts as 0.
function colToLinear(color) {
  const c = color.coords.map(v => (v === null ? 0 : v));
  if (color.space === 'srgb') return colLinear(c);
  if (color.space === 'display-p3') return colMul(COL_XYZ_TO_LIN_SRGB, colMul(COL_LIN_P3_TO_XYZ, colLinear(c)));
  if (color.space === 'hsl') return colLinear(colHslToRgb(c));
  if (color.space === 'oklab') return colOklabToLinear(c);
  const h = c[2] * Math.PI / 180;
  return colOklabToLinear([c[0], c[1] * Math.cos(h), c[1] * Math.sin(h)]);
}

function colHslToRgb(hsl) {
  const h = hsl[0], s = hsl[1], l = hsl[2];
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
