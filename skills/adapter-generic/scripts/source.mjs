// The component source reader (#119): what a shadcn/ui component file says, read from the TypeScript AST with the
// pinned `typescript` (sources.mjs). Nothing in the file is executed. It reads:
// - every `cva(base, {variants, defaultVariants, compoundVariants})` call bound to a name;
// - every top-level function component: whether it is exported, its element, `data-slot`, the attributes a prop
//   sets (`data-size={size}`), its destructured defaults, the literal unions in its props type, the cva it calls
//   and its className string literals.
// Each class list keeps its 1-based line, so a later step can point at it.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DEFAULT_DIR, toolDir } from './sources.mjs';

const loaded = {};
const typescript = tools => (loaded[tools] = loaded[tools] || createRequire(import.meta.url)(join(toolDir('typescript', tools), 'lib/typescript.js')));

/**
 * Read one component file. Returns {cvas: {name: {base, variants, keys, defaults, compound}}, components: [...]}:
 * - a class list is {classes, line};
 * - `variants` is {axis: {value: classList}}, in source order; `keys` is {axis: {line, values: {value: line}}}, the
 *   lines of the keys themselves; `compound` is [{match, classes, line}];
 * - a component is {name, line, exported, element, slot, cva, attrs: {attr: {prop} | {value}}, defaults, unions,
 *   classes: [classList]}. `element` is the intrinsic tag, also through `const Comp = cond ? X : "button"`.
 */
export function readSource(text, file, { tools = DEFAULT_DIR } = {}) {
  const ts = typescript(tools);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const literal = n => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
  const keyOf = p => (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText());
  const assignments = n => (n && ts.isObjectLiteralExpression(n) ? n.properties.filter(ts.isPropertyAssignment) : []);
  const members = n => Object.fromEntries(assignments(n).map(p => [keyOf(p), p.initializer]));
  const classList = n => ({ classes: literal(n), line: line(n) });
  const valueOf = n => {
    if (literal(n) !== undefined) return literal(n);
    if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    return n.getText();
  };

  const exported = new Set();
  const cvas = {};
  const components = [];
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause))
      st.exportClause.elements.forEach(e => exported.add((e.propertyName || e.name).text));
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations) {
        const call = d.initializer;
        if (!call || !ts.isCallExpression(call) || call.expression.getText() !== 'cva' || !ts.isIdentifier(d.name)) continue;
        const [base, config] = call.arguments;
        const c = members(config);
        const variants = {};
        for (const [axis, values] of Object.entries(members(c.variants)))
          variants[axis] = Object.fromEntries(Object.entries(members(values)).map(([k, v]) => [k, classList(v)]));
        const keys = Object.fromEntries(assignments(c.variants).map(p =>
          [keyOf(p), { line: line(p), values: Object.fromEntries(assignments(p.initializer).map(q => [keyOf(q), line(q)])) }]));
        const defaults = Object.fromEntries(Object.entries(members(c.defaultVariants)).map(([k, v]) => [k, valueOf(v)]));
        const compound = c.compoundVariants && ts.isArrayLiteralExpression(c.compoundVariants)
          ? c.compoundVariants.elements.map(el => {
            const m = members(el);
            const cls = m.className || m.class;
            return { match: Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'className' && k !== 'class').map(([k, v]) => [k, valueOf(v)])),
              classes: literal(cls), line: line(cls) };
          })
          : [];
        cvas[d.name.text] = { base: classList(base), variants, keys, defaults, compound };
      }
    if (ts.isFunctionDeclaration(st) && st.name) components.push(readFunction(st));
  }
  for (const c of components) c.exported = exported.has(c.name) || !!(ts.getCombinedModifierFlags(c.node) & ts.ModifierFlags.Export);
  return { cvas, components: components.map(({ node, ...c }) => c) };

  function readFunction(fn) {
    const out = { name: fn.name.text, line: line(fn), node: fn, exported: false, element: null, slot: null, cva: null, attrs: {}, defaults: {}, unions: {}, classes: [] };
    const param = fn.parameters[0];
    if (param && ts.isObjectBindingPattern(param.name))
      for (const el of param.name.elements)
        if (!el.dotDotDotToken && el.initializer) out.defaults[(el.propertyName || el.name).getText()] = valueOf(el.initializer);
    if (param && param.type) (function visit(n) {
      if (ts.isPropertySignature(n) && n.type && ts.isUnionTypeNode(n.type)) {
        const values = n.type.types.map(t => (ts.isLiteralTypeNode(t) ? literal(t.literal) : undefined));
        if (values.every(v => v !== undefined)) out.unions[keyOf(n)] = values;
      }
      n.forEachChild(visit);
    })(param.type);
    // `const Comp = asChild ? Slot.Root : "button"`: the literal branch is the element.
    const locals = {};
    (function visit(n) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isConditionalExpression(n.initializer)) {
        const lit = [n.initializer.whenTrue, n.initializer.whenFalse].map(literal).filter(v => v !== undefined);
        if (lit.length === 1) locals[n.name.text] = lit[0];
      }
      n.forEachChild(visit);
    })(fn.body);
    (function visit(n) {
      if (!out.element && (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n))) {
        const tag = n.tagName.getText();
        out.element = /^[a-z]/.test(tag) ? tag : locals[tag] || tag;
        for (const a of n.attributes.properties) {
          if (!ts.isJsxAttribute(a) || !a.initializer) continue;
          const k = a.name.getText();
          const init = a.initializer;
          if (k === 'data-slot') out.slot = literal(init);
          else if (k === 'className') (function inner(y) {
            if (literal(y) !== undefined) out.classes.push(classList(y));
            if (ts.isCallExpression(y) && cvas[y.expression.getText()]) out.cva = y.expression.getText();
            y.forEachChild(inner);
          })(init);
          else if (literal(init) !== undefined) out.attrs[k] = { value: literal(init) };
          else if (ts.isJsxExpression(init) && init.expression && ts.isIdentifier(init.expression)) out.attrs[k] = { prop: init.expression.text };
        }
      }
      n.forEachChild(visit);
    })(fn.body);
    return out;
  }
}

/**
 * The component a family is read from, among `components` (readSource): {named, provider, root}. `named` is the export
 * named after the family (Input). When it renders a primitive's Root with no classes (Select: SelectPrimitive.Root),
 * it is a provider with no box of its own: `provider` is it and `root` its exported Trigger (SelectTrigger), the box a
 * designer sees (#153). Otherwise `provider` is null and `root` is `named`. Throws when either export is missing.
 */
export function familyRoot(components, Name, file) {
  const named = components.find(c => c.name === Name && c.exported);
  if (!named) throw new Error(`${file} exports no ${Name}`);
  if (named.cva || named.classes.length || !/\.Root$/.test(named.element || '')) return { named, provider: null, root: named };
  const root = components.find(c => c.name === `${Name}Trigger` && c.exported);
  if (!root) throw new Error(`${file}: ${Name} renders ${named.element} with no classes, a provider with no box, and exports no ${Name}Trigger to read instead`);
  return { named, provider: named, root };
}
