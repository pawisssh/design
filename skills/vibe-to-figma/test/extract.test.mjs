// Path A's extraction (#257, spec #249): a Prototype's JSX becomes Component Families by rule, and the agent's one batch
// of answers names them. Each rule is tested through the one entry, `extract`, on a few lines of JSX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { extract } from '../scripts/extract.mjs';
import { noReader as skip } from './helpers.mjs';

/** A Prototype of `files` ({path: text}) with the manifest, lockfile and stylesheet path A needs. */
function proto(files) {
  const dir = mkdtempSync(join(tmpdir(), 'extract-'));
  const all = {
    'package.json': JSON.stringify({ name: 'proto', dependencies: { react: '19.2.4' }, devDependencies: { tailwindcss: '4.2.2' } }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/react': { version: '19.2.4' }, 'node_modules/tailwindcss': { version: '4.2.2', integrity: 'sha512-x' } } }),
    'src/index.css': '@import "tailwindcss";\n@theme {\n  --font-sans: Inter, sans-serif;\n}\n',
    ...files,
  };
  for (const [f, text] of Object.entries(all)) { mkdirSync(join(dir, dirname(f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  return dir;
}
const app = body => proto({ 'src/App.tsx': `export default function App() {\n${body}\n}\n` });
const BTN = 'inline-flex items-center justify-center rounded';

/** Answers that name every group `<tag>-<n>`, every axis `a<n>` and every value `v<n>`, with a description and a grid. */
function answerAll(requests) {
  const groups = {};
  requests.forEach((g, i) => {
    const axes = Object.fromEntries(g.axes.map((a, j) => [a.id, { key: `a${j}`, label: `A${j}`,
      values: Object.fromEntries(a.values.map((v, k) => [v.id, { key: `v${k}`, label: `V${k}` }])) }]));
    groups[g.id] = { family: `${g.tag}-${i}`, description: `A ${g.tag}.`, axes, grid: { columns: g.axes.map((_, j) => `a${j}`), rows: [] }, ...(g.needsText && { text: 'Text' }) };
  });
  return { groups };
}
const requestsOf = (dir, extra = {}) => extract({ project: dir, ...extra }).requests;

test('layout-only wrappers and one-off plain elements are no candidates', { skip }, () => {
  const dir = app(`return (<div className="flex items-center gap-1"><div className="flex items-center gap-1"><span className="text-sm" /></div><button className="${BTN} p-1">One</button></div>);`);
  const r = extract({ project: dir });
  assert.deepEqual(r.requests, []);
  assert.deepEqual(r.families, []);
});

test('an interactive element at two sites is a group; placement classes are stripped and do not split it', { skip }, () => {
  const dir = app(`return (<div><button className="ml-2 flex-1 w-full ${BTN} p-1 text-[#111111]">A</button><button className="${BTN} p-1 text-[#111111]">B</button></div>);`);
  const [g, ...rest] = requestsOf(dir);
  assert.equal(rest.length, 0);
  assert.equal(g.tag, 'button');
  assert.equal(g.sites.length, 2);
  assert.deepEqual(g.common, [...`${BTN} p-1 text-[#111111]`.split(' ')].sort());
  assert.deepEqual(g.axes, []);
});

test('an element that paints itself counts; a ternary makes a one-off a candidate', { skip }, () => {
  const dir = app(`return (<div><div className="rounded border p-4" /><div className="rounded border p-4" /><div className="flex gap-1" /><div className="flex gap-1" /></div>);`);
  const gs = requestsOf(dir);
  assert.deepEqual(gs.map(g => g.tag), ['div']);
  assert.equal(gs[0].sites.length, 2);
  const one = app(`const on = true; return <button className={on ? "p-1 bg-[#111111]" : "p-1 bg-[#222222]"}>X</button>;`);
  assert.equal(requestsOf(one).length, 1);
});

test('a ternary is one axis with its branches as values; a nested ternary is one N-value axis', { skip }, () => {
  const two = app(`const on = true; return <button className={\`${BTN} \${on ? "bg-[#111111] text-[#ffffff]" : "text-[#222222]"}\`}>X</button>;`);
  const [g] = requestsOf(two);
  assert.equal(g.axes.length, 1, 'bg and text change with the same condition: one axis');
  assert.equal(g.axes[0].values.length, 2);
  const three = app(`const a = 1, b = 2; return <button className={\`${BTN} \${a ? "bg-[#111111]" : b ? "bg-[#222222]" : "bg-[#333333]"}\`}>X</button>;`);
  const [n] = requestsOf(three);
  assert.equal(n.axes.length, 1);
  assert.equal(n.axes[0].values.length, 3);
});

test('a ternary that mirrors the element\'s own disabled is the disabled State, not an axis', { skip }, () => {
  const dir = app(`const ok = true; return <button disabled={!ok} className={\`${BTN} \${ok ? "bg-[#111111]" : "bg-[#cccccc]"}\`}>X</button>;`);
  const r = extract({ project: dir, answers: answerAll(requestsOf(dir)) });
  assert.deepEqual(requestsOf(dir)[0].axes, []);
  const file = Object.entries(r.library).find(([p]) => p.startsWith('components/ui/'))[1];
  assert.match(file, /bg-\[#111111\]/);
  assert.match(file, /disabled:bg-\[#cccccc\]/);
  assert.doesNotMatch(file, /variants:/);
});

test('colours that change together across sites are one axis; the default is the value most sites use', { skip }, () => {
  const tone = (n, c) => `<button className="${BTN} p-1 text-[${c}] hover:bg-[${c}1]">${n}</button>`;
  const dir = app(`return (<div>${tone('a', '#16a34a')}${tone('b', '#dc2626')}${tone('c', '#dc2626')}</div>);`);
  const [g] = requestsOf(dir);
  assert.equal(g.axes.length, 1, 'text colour and hover background co-vary');
  assert.equal(g.axes[0].values.length, 2);
  assert.deepEqual(g.axes[0].values.map(v => v.sites.length).sort(), [1, 2]);
  const r = extract({ project: dir, answers: answerAll([g]) });
  const file = Object.entries(r.library).find(([p]) => p.startsWith('components/ui/'))[1];
  assert.match(file, /defaultVariants: \{ a0: "v1" \}/, 'v1 is the red the two sites use');
});

test('other independent differences are one axis each; disabled: classes do not split a group', { skip }, () => {
  const b = (size, tone, more = '') => `<button className="${BTN} ${size} ${tone} ${more}">x</button>`;
  const dir = app(`return (<div>${b('p-1', 'text-[#111111]')}${b('p-2', 'text-[#222222]')}${b('p-1', 'text-[#222222]')}${b('p-2', 'text-[#111111]', 'disabled:opacity-40')}</div>);`);
  const gs = requestsOf(dir);
  assert.equal(gs.length, 1, 'the disabled: utility on one site does not make another group');
  assert.equal(gs[0].axes.length, 2);
  assert.deepEqual(gs[0].axes.map(a => a.values.length), [2, 2]);
  assert.ok(gs[0].common.includes('disabled:opacity-40'), 'a disabled: utility is the family\'s State, in its base');
});

test('constants and local class variables resolve; an unresolvable className is skipped with its reason', { skip }, () => {
  const dir = app(`const K = "rounded border p-4"; let s = on ? "bg-[#111111]" : "bg-[#222222]"; const on = true;
    return (<div><div className={K} /><div className={\`\${K} mt-2\`} /><button className={\`${BTN} \${s}\`}>x</button><button className={cls(1)}>y</button></div>);`);
  const r = extract({ project: dir });
  assert.equal(r.requests.length, 2);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].site, /src\/App\.tsx:\d+/);
  assert.match(r.skipped[0].reason, /cls\(1\).*function call/);
});

test('with every judgement answered the library holds one cva component per family and no request is open', { skip }, () => {
  const dir = app(`return (<div><button className="${BTN} p-1 text-[#111111]">A</button><button className="${BTN} p-1 text-[#222222]">B</button></div>);`);
  const first = extract({ project: dir });
  assert.equal(first.requests.length, 1);
  assert.deepEqual(first.families, []);
  const done = extract({ project: dir, answers: answerAll(first.requests) });
  assert.deepEqual(done.requests, []);
  assert.deepEqual(done.families.map(f => f.key), ['button-0']);
  assert.deepEqual(Object.keys(done.library).sort(), ['components.json', 'components/ui/button-0.tsx', 'package-lock.json', 'src/index.css']);
  const tsx = done.library['components/ui/button-0.tsx'];
  assert.match(tsx, /function Button0\(/);
  assert.match(tsx, /variants: \{\n      a0: \{\n        v0: "text-\[#111111\]",\n        v1: "text-\[#222222\]",/);
  assert.equal(JSON.parse(done.library['components.json']).tailwind.css, 'src/index.css');
  assert.deepEqual(extract({ project: dir, answers: answerAll(first.requests) }).library, done.library, 'a pure function of the Prototype and the answers');
});

test('an answer that misses an axis or value reopens only that key', { skip }, () => {
  const dir = app(`return (<div><button className="${BTN} p-1 text-[#111111]">A</button><button className="${BTN} p-1 text-[#222222]">B</button></div>);`);
  const first = extract({ project: dir });
  const answers = answerAll(first.requests);
  const g = answers.groups[first.requests[0].id];
  delete g.axes[first.requests[0].axes[0].id].values[first.requests[0].axes[0].values[1].id];
  const r = extract({ project: dir, answers });
  assert.equal(r.requests.length, 1);
  assert.deepEqual(r.requests[0].open, [`axes.${first.requests[0].axes[0].id}.values.${first.requests[0].axes[0].values[1].id}`]);
});

test('a group answered null is dropped', { skip }, () => {
  const dir = app(`return (<div><button className="${BTN} p-1">A</button><button className="${BTN} p-1">B</button><a className="rounded border p-2">x</a><a className="rounded border p-2">y</a></div>);`);
  const first = extract({ project: dir });
  assert.equal(first.requests.length, 2);
  const answers = answerAll(first.requests);
  const at = first.requests.findIndex(g => g.tag === 'button');
  answers.groups[first.requests[1 - at].id].family = null;
  assert.deepEqual(extract({ project: dir, answers }).families.map(f => f.key), [`button-${at}`]);
});

test('two groups answered with one family name are one family; groups of different tags cannot merge', { skip }, () => {
  const dir = app(`return (<div><button className="${BTN} p-1">A</button><button className="${BTN} p-1">B</button><button className="rounded-md border p-1">x</button><button className="rounded-md border p-1">y</button><a className="rounded border p-2">x</a><a className="rounded border p-2">y</a></div>);`);
  const first = extract({ project: dir });
  assert.equal(first.requests.length, 3);
  const answers = answerAll(first.requests);
  const buttons = first.requests.filter(g => g.tag === 'button');
  for (const g of buttons) answers.groups[g.id].family = 'button';
  answers.groups[first.requests.find(g => g.tag === 'a').id].family = null;
  const reopened = extract({ project: dir, answers });
  assert.equal(reopened.requests.length, 1, 'the merged shapes differ: that is a new axis, still to be named');
  assert.match(reopened.requests[0].open.join(), /^axes\./);
  const [m] = reopened.requests;
  const named = answers.groups[buttons[0].id];
  for (const [j, a] of m.axes.entries()) {
    named.axes[a.id] = { key: `m${j}`, label: `M${j}`, values: Object.fromEntries(a.values.map((v, k) => [v.id, { key: `w${k}`, label: `W${k}` }])) };
  }
  assert.match(extract({ project: dir, answers }).requests[0].problems.join(), /grid must name every axis/, 'the first group\'s grid names no axis');
  for (const g of buttons) answers.groups[g.id].grid = { columns: m.axes.map((_, j) => `m${j}`), rows: [] };
  const r = extract({ project: dir, answers });
  assert.deepEqual(r.requests, []);
  assert.deepEqual(r.families.map(f => f.key), ['button']);
  assert.equal(r.families[0].sites.length, 4);
  answers.groups[first.requests.find(g => g.tag === 'a').id].family = 'button';
  assert.match(extract({ project: dir, answers }).requests[0].problems[0], /different tags/);
});

test('a class name built from parts, or a prop that shadows a constant, is skipped with its reason', { skip }, () => {
  const dir = proto({ 'src/App.tsx': `function Tag({ s }) { return <button className={s}>z</button>; }
export default function App() {
  const c = "red", s = "rounded bg-[#111111]";
  return (<div><button className={\`${BTN} bg-\${c}-500\`}>x</button><button className={"a" + c}>y</button><Tag s="x" /></div>);
}\n` });
  const r = extract({ project: dir });
  assert.deepEqual(r.requests, []);
  assert.equal(r.skipped.length, 3);
  assert.ok(r.skipped.every(x => /builds a class name from parts|is a parameter/.test(x.reason)));
});

test('a Prototype with no lockfile fails before any request is made', { skip }, () => {
  const dir = app('return (<div><button className="rounded p-1">a</button><button className="rounded p-1">b</button></div>);');
  rmSync(join(dir, 'package-lock.json'));
  assert.throws(() => extract({ project: dir }), /no package-lock\.json/);
});

// #259: an icon child whose presence changes the element's classes is a Slot axis (ADR 0011), written as
// `has-data-[icon=…]:` utilities the Adapter reads, with the icons' size as the slot's svg size utility.
const CHIP = 'inline-flex items-center rounded-full bg-[#eef2ff] px-2 py-0.5 text-xs';
const ICON = '<svg className="size-3" viewBox="0 0 16 16"><path d="M2 8h12" /></svg>';
const chips = (...sites) => proto({ 'src/App.tsx': `import { Check } from "lucide-react";\nexport default function App() {\n  return (<div>${sites.join('')}</div>);\n}\n` });
const tsxOf = dir => {
  const first = extract({ project: dir });
  return { requests: first.requests, tsx: extract({ project: dir, answers: answerAll(first.requests) }).library['components/ui/span-0.tsx'] };
};

test('an icon child that adds classes is a Slot axis: its classes are has-data-[icon=…]: utilities, not a cva axis (#259)', { skip }, () => {
  const dir = chips(`<span className="${CHIP}">Paid</span>`, `<span className="${CHIP}">Due</span>`,
    `<span className="${CHIP} gap-1">${ICON}Sent</span>`, `<span className="${CHIP} gap-1"><Check className="size-3" />Done</span>`);
  const { requests, tsx } = tsxOf(dir);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].axes, [], 'the with-icon classes are no axis the agent names');
  assert.ok(requests[0].common.includes('has-data-[icon=inline-start]:gap-1'));
  assert.doesNotMatch(tsx, /variants:/);
  assert.match(tsx, /"[^"]*has-data-\[icon=inline-start\]:gap-1[^"]*"/);
  assert.match(tsx, /\[&_svg:not\(\[class\*='size-'\]\)\]:size-3/);
  assert.doesNotMatch(tsx, /(?<!has-data-\[icon=inline-start\]:)\bgap-1\b/, 'without the slot, gap-1 is absent');
  assert.deepEqual([...tsx.matchAll(/^import .* from "([^"]+)"/gm)].map(m => m[1]), ['react', 'cn'], 'no icon package');
});

test('an icon after the text is the inline-end slot; a class only the plain sites have stays in the base (#259)', { skip }, () => {
  const base = 'inline-flex items-center rounded-full bg-[#eef2ff] py-0.5 text-xs';
  const dir = chips(`<span className="${base} px-2">Paid</span>`, `<span className="${base} px-2">Due</span>`,
    `<span className="${base} pl-2 pr-1.5 gap-1">Sent${ICON}</span>`);
  const { tsx } = tsxOf(dir);
  assert.match(tsx, /has-data-\[icon=inline-end\]:gap-1/);
  assert.match(tsx, /has-data-\[icon=inline-end\]:pr-1\.5/);
  assert.match(tsx, /"[^"]*(?<![:\w-])px-2\b/);
});

test('an icon with no size class, or a family whose every site has the icon, makes no Slot axis (#259)', { skip }, () => {
  const unsized = chips(`<span className="${CHIP}">Paid</span>`, `<span className="${CHIP}">Due</span>`,
    `<span className="${CHIP} gap-1"><Check />Done</span>`);
  const [g] = requestsOf(unsized);
  assert.deepEqual(g.axes.map(a => a.id), ['gap']);
  assert.ok(!g.common.some(c => c.startsWith('has-data-')));
  const all = chips(`<span className="${CHIP} gap-1">${ICON}Sent</span>`, `<span className="${CHIP} gap-1">${ICON}Done</span>`);
  assert.ok(!requestsOf(all)[0].common.some(c => c.startsWith('has-data-') || c.startsWith('[&_svg')));
});
