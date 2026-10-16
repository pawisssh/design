// PROTOTYPE (#65): the Generic Adapter's exact tier on an installed shadcn/ui copy.
// Reads only standard formats, deterministically:
//   - CSS custom properties per mode selector (:root, .dark) and Tailwind v4 @theme inline;
//   - cva variants/defaultVariants from the TypeScript AST;
//   - TS prop literal unions plus destructured defaults (Card has no cva);
//   - every class list compiled by Tailwind's own compiler, one candidate at a time.
// Writes ../out/exact.json. Two runs must be byte-identical.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { compile } from '@tailwindcss/node';

const HERE = new URL('.', import.meta.url).pathname;
const LIB = process.argv[2] ? resolve(process.argv[2]) : join(HERE, '../library');
const OUT = join(HERE, '../out');
const FILES = ['app/globals.css', 'components.json', 'components/ui/alert.tsx', 'components/ui/button.tsx', 'components/ui/card.tsx'];
const sha = b => createHash('sha256').update(b).digest('hex');

// 1. Pin: source.files and snapshotId (Adapter guide recipe).
const files = {};
for (const f of [...FILES].sort()) files[f] = 'sha256:' + sha(readFileSync(join(LIB, f)));
const manifest = Object.entries(files).map(([p, h]) => `${h.slice(7)}  ${p}\n`).join('');
const snapshotId = 'sha256:' + sha(manifest);

// 2. Tokens: custom properties per mode selector, and @theme inline's utility → variable map.
const css = readFileSync(join(LIB, 'app/globals.css'), 'utf8');
const block = sel => {
  const i = css.indexOf(sel + ' {');
  if (i < 0) return {};
  const body = css.slice(i + sel.length + 2, css.indexOf('\n}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};
const modes = { light: block(':root'), dark: block('.dark') };
const themeInline = block('@theme inline');
const tokens = {};
for (const name of Object.keys(modes.light).sort())
  tokens[name] = { light: modes.light[name], dark: modes.dark[name] ?? null, codeSyntax: `var(--${name})` };

// 3. Components: cva calls, prop unions, slot functions, from the TS AST.
function readComponent(rel) {
  const text = readFileSync(join(LIB, rel), 'utf8');
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const str = n => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;
  const obj = n => Object.fromEntries(n.properties.map(p => [p.name.text ?? p.name.getText(), p.initializer]));
  const cvas = {}; const slots = [];
  ts.forEachChild(sf, function visit(n) {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText() === 'cva') {
      const [base, cfg] = n.initializer.arguments;
      const c = obj(cfg);
      const variants = {};
      for (const [axis, values] of Object.entries(obj(c.variants)))
        variants[axis] = Object.fromEntries(Object.entries(obj(values)).map(([k, v]) => [k, { classes: str(v), line: line(v) }]));
      const defaults = c.defaultVariants ? Object.fromEntries(Object.entries(obj(c.defaultVariants)).map(([k, v]) => [k, str(v)])) : {};
      cvas[n.name.text] = { base: str(base), baseLine: line(base), variants, defaultVariants: defaults,
        compoundVariants: c.compoundVariants ? c.compoundVariants.getText() : null };
    }
    if (ts.isFunctionDeclaration(n) && n.name) {
      const fn = { name: n.name.text, line: line(n), props: {}, defaults: {}, element: null, dataSlot: null, attrs: {}, classes: [], cva: null };
      const param = n.parameters[0];
      if (param && ts.isObjectBindingPattern(param.name))
        for (const el of param.name.elements) {
          const key = (el.propertyName ?? el.name).getText();
          if (el.dotDotDotToken) continue;
          fn.defaults[key] = el.initializer ? el.initializer.getText().replace(/^"|"$/g, '') : null;
        }
      // literal unions in the props type: { size?: "default" | "sm" }
      if (param && param.type) param.type.forEachChild(function t(x) {
        if (ts.isPropertySignature(x) && x.type && ts.isUnionTypeNode(x.type))
          fn.props[x.name.getText()] = x.type.types.map(u => u.getText().replace(/^"|"$/g, ''));
        else if (ts.isPropertySignature(x) && x.type) fn.props[x.name.getText()] = x.type.getText();
        x.forEachChild(t);
      });
      n.body && n.body.forEachChild(function j(x) {
        if ((ts.isJsxSelfClosingElement(x) || ts.isJsxOpeningElement(x)) && !fn.element) {
          fn.element = x.tagName.getText();
          for (const a of x.attributes.properties) {
            if (!ts.isJsxAttribute(a)) continue;
            const k = a.name.getText();
            const v = a.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : a.initializer && a.initializer.getText();
            if (k === 'data-slot') fn.dataSlot = v; else if (k !== 'className') fn.attrs[k] = v;
            if (k === 'className') a.initializer.forEachChild(function s(y) {
              if (ts.isStringLiteral(y)) fn.classes.push(y.text);
              if (ts.isCallExpression(y) && cvas[y.expression.getText()]) fn.cva = y.expression.getText();
              y.forEachChild(s);
            });
          }
        }
        x.forEachChild(j);
      });
      slots.push(fn);
    }
    ts.forEachChild(n, visit);
  });
  return { file: rel, cvas, slots };
}
const components = Object.fromEntries(['alert', 'button', 'card'].map(k => [k, readComponent(`components/ui/${k}.tsx`)]));

// 4. Compile every candidate with Tailwind's compiler, against the project's CSS entry.
const candidates = new Set();
const add = s => s && s.split(/\s+/).filter(Boolean).forEach(c => candidates.add(c));
for (const c of Object.values(components)) {
  for (const v of Object.values(c.cvas)) { add(v.base); for (const ax of Object.values(v.variants)) for (const val of Object.values(ax)) add(val.classes); }
  for (const s of c.slots) s.classes.forEach(add);
}
// build() is incremental, so each candidate gets a fresh compiler.
const compiled = {};
for (const cand of [...candidates].sort()) {
  const compiler = await compile(css, { base: HERE, onDependency() {} });
  const out = compiler.build([cand]);
  // keep only the utilities layer: preflight/theme/properties layers are identical across candidates
  const i = out.indexOf('@layer utilities');
  const j = out.indexOf('\n@property', i);
  compiled[cand] = i < 0 ? null : out.slice(i, j < 0 ? undefined : j).replace(/\s+/g, ' ').trim();
}
const unknown = Object.entries(compiled).filter(([, v]) => !v || v === '@layer utilities { }' || !v.includes('{ .')).map(([k]) => k);

const exact = {
  source: { codeLibrary: 'shadcn/ui (radix-nova, installed copy)', adapter: 'generic', files, snapshotId,
    packages: { tailwindcss: '4.3.3', typescript: '6.0.3' } },
  modes: { light: ':root', dark: '.dark' },
  tokens, themeInline, components, compiled, uncompiled: unknown,
};
mkdirSync(OUT, { recursive: true });
const body = JSON.stringify(exact, null, 1) + '\n';
writeFileSync(process.argv[3] ? resolve(process.argv[3]) : join(OUT, 'exact.json'), body);
console.log('exact.json', 'sha256:' + sha(body), 'candidates', candidates.size, 'uncompiled', unknown.length, unknown.join(' '));
