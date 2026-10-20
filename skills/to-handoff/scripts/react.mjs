// The static reader for a React Prototype (#62, #84, #114): a Next.js App Router or Vite + react-router project
// folder, parsed with TypeScript 6 into reader.mjs's element tree, one tree per screen (page route).
//
// Every file the reader reads gets a base offset in one address space, so an element's `offset` is a single
// number and `at(offset)` maps it back to `file:line:col`, as for an HTML Prototype. An element's offset is its
// opening `<`, the site tag.mjs writes into the runtime copy, so the static and runtime readers join.
//
// JSX reads as the HTML reader's model:
//   c ? <A/> : <B/>, c && <A/>     a condition on each branch's elements and their descendants;
//   list.map(x => <A/>)            a repeated fragment;
//   {c ? 'a' : 'b'}                a text ternary; any other {expr} is a dynamic value;
//   disabled={c}                   a boolean attribute hole, as `${c ? 'disabled' : ''}` reads in HTML.
// App components (in the same file, or imported from the project outside the Code Library) are inlined.
// Components from the copied Code Library (components.json `aliases.ui`) and from a Design System package are
// leaves: usage candidates carrying `component: {module, export, kind}`. Other package components are
// transparent (their children read in place), but for links and images, which read as `a` and `img`. A leaf
// with `asChild` takes its single child's attributes and children and keeps its own `at` (#84's asChild lift).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parseCss } from './css.mjs';
import { loadTypescript } from './deps.mjs';
import { lineOf, lineStarts, readHtml, walk } from './reader.mjs';

const EXTS = ['.tsx', '.ts', '.jsx', '.js'];
// Props that read as boolean attributes when bound to an expression.
const BOOLEAN_PROPS = new Set(['disabled', 'checked', 'hidden', 'readOnly', 'required', 'selected', 'open', 'multiple', 'autoFocus', 'invalid']);
const ATTR_NAMES = { className: 'class', htmlFor: 'for' };
// Package components that render one host element.
const HOSTS = { 'next/link': { default: 'a' }, 'next/image': { default: 'img' }, 'react-router': { Link: 'a', NavLink: 'a' }, 'react-router-dom': { Link: 'a', NavLink: 'a' } };
const ROUTERS = new Set(['react-router', 'react-router-dom']);
const ROUTER_PARTS = new Set(['Routes', 'Route', 'Outlet', 'RouterProvider']);

/** 'react-next' or 'react-vite' for a React project folder (by its package.json), else null. */
export function reactKind(root) {
  const pkg = packageOf(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.react) return null;
  return deps.next ? 'react-next' : deps.vite ? 'react-vite' : null;
}

/**
 * The Code Library folder (#84, #102), relative to the root with a trailing slash: components.json
 * `aliases.ui` through the tsconfig paths (`@/` is the root on Next, src/ on Vite without paths), else
 * components/ui/ on Next and src/components/ui/ on Vite.
 */
export function codeLibraryDir(root, ts, kind = reactKind(root), paths = compilerPaths(root, ts)) {
  const file = join(root, 'components.json');
  const ui = existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).aliases?.ui;
  if (!ui) return kind === 'react-vite' ? 'src/components/ui/' : 'components/ui/';
  const viaPaths = resolveAlias(ui, paths)[0];
  const dir = viaPaths !== undefined ? viaPaths : ui.replace(/^@\//, kind === 'react-vite' ? 'src/' : '');
  return dir.replace(/^\.\//, '').replace(/\/?$/, '/');
}

/**
 * readReact(root, {depsDir, packages}) -> {kind, title, files, at, rules, standIns, fonts, screens, uiDir, ignored}.
 * `packages` are the Design System's code packages (each Contract's `code.package`): their components are
 * leaves, and a package that resolves to a project file is that file under any import of it. `screens` is
 * [{id, name, route, offset, root, mount}], `files` the files read (relative paths), `fonts` the next/font and
 * geist/font imports [{module, name, offset}]. On Next, a loading.tsx, error.tsx or not-found.tsx boundary is a condition named by its file, true for the boundary's tree and false for what it wraps.
 */
export function readReact(root, { depsDir, packages = [] } = {}) {
  const ts = loadTypescript(depsDir);
  const kind = reactKind(root);
  if (!kind) throw new Error(`${root} is not a Next.js or Vite React project: its package.json needs react with next or vite`);
  const space = addressSpace();
  const paths = compilerPaths(root, ts);
  const uiDir = codeLibraryDir(root, ts, kind, paths);
  const rules = [];
  const sources = new Map();
  const ignored = [];
  const fonts = [];
  const text = (s, node) => node.getText(s.sf).replace(/\s+/g, ' ').trim();

  // ---------- files ----------

  const isFile = rel => { const p = join(root, rel); return existsSync(p) && statSync(p).isFile(); };
  const resolveFile = (fromRel, spec) => {
    const bases = spec.startsWith('.') ? [posix.join(posix.dirname(fromRel), spec)] : spec.startsWith('/') ? [spec.slice(1)] : resolveAlias(spec, paths);
    for (const b of bases) for (const c of [b, ...EXTS.map(e => b + e), ...EXTS.map(e => `${b}/index${e}`)]) if (isFile(c)) return posix.normalize(c);
    return null;
  };
  // A Contract package that is a project file (shadcn's `@/components/ui/button`) is that file however it is imported.
  const packageFiles = new Map(packages.map(p => [resolveFile('', p), p]).filter(([file]) => file));
  const css = rel => {
    if (!rel || space.has(rel)) return;
    const f = space.add(rel, readFileSync(join(root, rel), 'utf8'));
    rules.push(...parseCss(f.text, f.base));
  };
  const has = (node, kind) => (node.modifiers || []).some(m => m.kind === kind);
  const source = rel => {
    if (sources.has(rel)) return sources.get(rel);
    const f = space.add(rel, readFileSync(join(root, rel), 'utf8'));
    const sf = ts.createSourceFile(rel, f.text, ts.ScriptTarget.Latest, true, /x$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if (sf.parseDiagnostics && sf.parseDiagnostics.length) throw new Error(`${rel} does not parse: ${ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText, ' ')}`);
    const s = { rel, sf, base: f.base, imports: new Map(), locals: new Map(), exports: new Map(), reexports: new Map(), defaultExport: null };
    sources.set(rel, s);
    // Every project module it imports is read too, components or not: Stand-ins live in data modules.
    const imported = [];
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st)) {
        const spec = st.moduleSpecifier.text;
        const clause = st.importClause;
        if (/\.css$/.test(spec)) { css(resolveFile(rel, spec)); continue; }
        if (/^(next\/font\/|geist\/font\/)/.test(spec) && clause) {
          const names = [clause.name, ...(clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.map(e => e.name) : [])].filter(Boolean);
          for (const n of names) fonts.push({ module: spec, name: n.text, offset: f.base + n.getStart(sf) });
        }
        const file = resolveFile(rel, spec);
        if (file && EXTS.some(e => file.endsWith(e))) imported.push(file);
        if (!clause) continue;
        if (clause.name) s.imports.set(clause.name.text, { module: spec, export: 'default' });
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) s.imports.set(nb.name.text, { module: spec, export: '*' });
        if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) s.imports.set(e.name.text, { module: spec, export: (e.propertyName || e.name).text });
      } else if (ts.isFunctionDeclaration(st)) {
        if (st.name) s.locals.set(st.name.text, st);
        if (has(st, ts.SyntaxKind.DefaultKeyword)) s.defaultExport = st;
        else if (st.name && has(st, ts.SyntaxKind.ExportKeyword)) s.exports.set(st.name.text, st);
      } else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) continue;
          s.locals.set(d.name.text, d);
          if (has(st, ts.SyntaxKind.ExportKeyword)) s.exports.set(d.name.text, d);
        }
      } else if (ts.isExportAssignment(st)) s.defaultExport = st.expression;
      else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const e of st.exportClause.elements) s.reexports.set(e.name.text, { module: st.moduleSpecifier && st.moduleSpecifier.text, name: (e.propertyName || e.name).text });
      }
    }
    for (const file of imported) source(file);
    return s;
  };

  // ---------- components ----------

  // What a JSX tag is: {host: tag} | {router: part} | {leaf: component} | {app: {file, export | local}} | {transparent}.
  const classify = (s, tagName) => {
    const name = tagName.getText(s.sf);
    if (/^[a-z]/.test(name) && !name.includes('.')) return { host: name };
    const [local, ...rest] = name.split('.');
    const member = rest.join('.');
    const imp = s.imports.get(local);
    if (!imp) return !member && s.locals.has(local) ? { app: { file: s.rel, local } } : { transparent: true };
    const exp = imp.export === '*' ? member : member ? `${imp.export}.${member}` : imp.export;
    const file = resolveFile(s.rel, imp.module);
    if (file) {
      if (packageFiles.has(file)) return { leaf: { module: packageFiles.get(file), export: exp, kind: 'ds', file } };
      if (file.startsWith(uiDir)) return { leaf: { module: imp.module, export: exp, kind: 'ui', file } };
      return member ? { transparent: true } : { app: { file, export: exp } };
    }
    const host = HOSTS[imp.module] && HOSTS[imp.module][exp];
    if (host) return { host, link: true };
    if (ROUTERS.has(imp.module) && ROUTER_PARTS.has(exp)) return { router: exp };
    if (packages.includes(imp.module)) return { leaf: { module: imp.module, export: exp, kind: 'ds' } };
    return { transparent: true };
  };

  // A component's function: {s, fn}, through `export default X`, re-exports, forwardRef(..) and memo(..).
  const componentOf = (ref, depth = 0) => {
    const s = source(ref.file);
    let node = ref.local ? s.locals.get(ref.local) : ref.export === 'default' ? s.defaultExport : s.exports.get(ref.export);
    if (!node && ref.export && s.reexports.has(ref.export) && depth < 8) {
      const re = s.reexports.get(ref.export);
      const file = re.module ? resolveFile(s.rel, re.module) : s.rel;
      return file ? componentOf(re.module ? { file, export: re.name } : { file, local: re.name }, depth + 1) : null;
    }
    if (node && ts.isIdentifier(node)) node = s.locals.get(node.text);
    if (node && ts.isVariableDeclaration(node)) node = node.initializer;
    while (node && ts.isCallExpression(node) && node.arguments.length) node = node.arguments[0];
    return node && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body ? { s, fn: node } : null;
  };

  // What a function renders: [{expr, cond}], an early `if (c) return …` guarding the returns after it.
  const returnsOf = (s, fn) => {
    if (!ts.isBlock(fn.body)) return [{ expr: fn.body, cond: [] }];
    const out = [];
    const guards = [];
    for (const st of fn.body.statements) {
      if (ts.isIfStatement(st)) {
        const ret = ts.isReturnStatement(st.thenStatement) ? st.thenStatement
          : ts.isBlock(st.thenStatement) && st.thenStatement.statements.length === 1 && ts.isReturnStatement(st.thenStatement.statements[0]) ? st.thenStatement.statements[0] : null;
        if (ret && ret.expression) {
          const c = conditionOf(s, st.expression);
          out.push({ expr: ret.expression, cond: [...guards, { ...c, value: true }] });
          guards.push({ ...c, value: false });
        }
      } else if (ts.isReturnStatement(st) && st.expression) { out.push({ expr: st.expression, cond: guards.slice() }); break; }
    }
    return out;
  };

  // The caller's literal props as the component's own names: destructured props (with literal defaults) or props.x.
  const propsIn = (fn, given) => {
    const param = fn.parameters[0];
    if (!param) return { names: {}, param: null };
    if (ts.isIdentifier(param.name)) return { names: given, param: param.name.text };
    const names = {};
    if (ts.isObjectBindingPattern(param.name)) for (const e of param.name.elements) {
      if (!ts.isIdentifier(e.name)) continue;
      const prop = (e.propertyName || e.name).getText();
      const fallback = e.initializer && (ts.isStringLiteral(e.initializer) || ts.isNoSubstitutionTemplateLiteral(e.initializer)) ? e.initializer.text : undefined;
      if (given[prop] !== undefined) names[e.name.text] = given[prop];
      else if (fallback !== undefined) names[e.name.text] = fallback;
    }
    return { names, param: null };
  };
  const propValue = (e, ctx) => {
    if (!ctx.props) return undefined;
    if (ts.isIdentifier(e)) return ctx.props.param ? undefined : ctx.props.names[e.text];
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === ctx.props.param) return ctx.props.names[e.name.text];
    return undefined;
  };
  const isChildren = (e, ctx) => (ts.isIdentifier(e) && e.text === 'children' && !(ctx.props && ctx.props.param))
    || (ts.isPropertyAccessExpression(e) && e.name.text === 'children' && ts.isIdentifier(e.expression) && ctx.props && e.expression.text === ctx.props.param);

  // ---------- conditions (#213) ----------

  // A condition expression as {expr, ast}: ast is recognise.mjs's {or|and|not|atom} tree read from the TypeScript
  // AST, so a template literal or a parenthesized comparison is never split; each atom keeps its offset.
  const conditionOf = (s, node) => {
    const tree = n => {
      while (ts.isParenthesizedExpression(n)) n = n.expression;
      if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) return { not: tree(n.operand) };
      const op = ts.isBinaryExpression(n) && n.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return { and: [tree(n.left), tree(n.right)].flatMap(x => x.and || [x]) };
      if (op === ts.SyntaxKind.BarBarToken) return { or: [tree(n.left), tree(n.right)].flatMap(x => x.or || [x]) };
      return { atom: text(s, n), offset: s.base + n.getStart(s.sf) };
    };
    return { expr: text(s, node), ast: tree(node) };
  };
  // An attribute expression that reads as a condition: a negation, a comparison or logical operator, or an is/has… name.
  const TESTS = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken]);
  const testLike = (s, e) => {
    if (ts.isPrefixUnaryExpression(e)) return e.operator === ts.SyntaxKind.ExclamationToken;
    if (ts.isBinaryExpression(e)) return TESTS.has(e.operatorToken.kind);
    return (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isCallExpression(e)) && /^(is|has|can|should|show)[A-Z]/.test(text(s, e));
  };

  // ---------- JSX -> the element tree ----------

  const unwrap = e => {
    while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression;
    return e;
  };
  const hasJsx = n => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || Boolean(ts.forEachChild(n, hasJsx));
  const rendersMarkup = (e, ctx) => hasJsx(e) || isChildren(e, ctx);
  const withCond = (ctx, c, value) => ({ ...ctx, cond: [...ctx.cond, { ...c, value }] });
  const ternaryOf = (s, e, ctx) => ({ expr: text(s, e), ternary: { cond: text(s, e.condition), ast: conditionOf(s, e.condition).ast, then: branchOf(s, e.whenTrue, ctx), else: branchOf(s, e.whenFalse, ctx) } });
  const branchOf = (s, e, ctx) => {
    e = unwrap(e);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { text: e.text };
    const v = propValue(e, ctx);
    return v !== undefined ? { text: v } : { expr: text(s, e) };
  };
  const textPart = (e, ctx) => {
    const s = ctx.s;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isNumericLiteral(e)) return e.text;
    const v = propValue(e, ctx);
    if (v !== undefined) return v;
    if (ts.isConditionalExpression(e)) return ternaryOf(s, e, ctx);
    return { expr: text(s, e) };
  };
  const SILENT = new Set([ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword]);

  // The nodes an expression renders.
  const nodes = (expr, ctx) => {
    const s = ctx.s;
    const e = unwrap(expr);
    if (!e || SILENT.has(e.kind) || (ts.isIdentifier(e) && e.text === 'undefined')) return [];
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) return element(e, ctx);
    if (ts.isJsxFragment(e)) return children(e.children, ctx);
    if (isChildren(e, ctx)) return ctx.children ? ctx.children(ctx) : [];
    if (!rendersMarkup(e, ctx)) return [{ type: 'text', parts: [textPart(e, ctx)], offset: s.base + e.getStart(s.sf), parent: ctx.parent }];
    if (ts.isConditionalExpression(e)) {
      const c = conditionOf(s, e.condition);
      return [...nodes(e.whenTrue, withCond(ctx, c, true)), ...nodes(e.whenFalse, withCond(ctx, c, false))];
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return nodes(e.right, withCond(ctx, conditionOf(s, e.left), true));
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return nodes(e.right, withCond(ctx, conditionOf(s, e.left), false));
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map') {
      const fn = unwrap(e.arguments[0]);
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        const item = fn.parameters[0] ? fn.parameters[0].name.getText(s.sf) : '_';
        const repeat = { list: text(s, e.expression.expression), item };
        return returnsOf(s, fn).flatMap(r => nodes(r.expr, { ...ctx, cond: [...ctx.cond, ...r.cond], repeat }));
      }
    }
    return [];
  };

  // JSX children: runs of text and non-markup expressions become one text node, as HTML text with holes.
  const children = (list, ctx) => {
    const s = ctx.s;
    const out = [];
    let parts = [], offset = null;
    const flush = () => {
      if (parts.some(p => typeof p !== 'string' || p.trim())) out.push({ type: 'text', parts: mergeStrings(parts), offset, parent: ctx.parent });
      parts = []; offset = null;
    };
    for (const c of list) {
      if (ts.isJsxText(c)) {
        const t = cleanJsxText(c.text);
        if (!t) continue;
        if (offset === null) offset = s.base + c.pos + (c.text.length - c.text.trimStart().length);
        parts.push(t);
        continue;
      }
      if (ts.isJsxExpression(c)) {
        const e = c.expression && unwrap(c.expression);
        if (!e) continue;
        if (rendersMarkup(e, ctx) || SILENT.has(e.kind)) { flush(); out.push(...nodes(e, ctx)); continue; }
        if (offset === null) offset = s.base + e.getStart(s.sf);
        parts.push(textPart(e, ctx));
        continue;
      }
      flush();
      out.push(...nodes(c, ctx));
    }
    flush();
    return out;
  };

  // A JSX element's props: [{name, value, offset, test}], value a string, a boolean, {expr}, {expr, ternary},
  // {parts} (a template literal, its holes as text parts) or {jsx}. `test` is an {expr} that reads as a condition.
  const propsOf = (opening, ctx) => {
    const s = ctx.s;
    const out = [];
    for (const a of opening.attributes.properties) {
      if (!ts.isJsxAttribute(a)) continue;
      const name = a.name.getText(s.sf);
      const offset = s.base + a.getStart(s.sf);
      const init = a.initializer;
      let value, test = null;
      if (!init) value = true;
      else if (ts.isStringLiteral(init)) value = init.text;
      else if (ts.isJsxExpression(init) && init.expression) {
        const e = unwrap(init.expression);
        const v = propValue(e, ctx);
        if (v !== undefined) value = v;
        else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isNumericLiteral(e)) value = e.text;
        else if (e.kind === ts.SyntaxKind.TrueKeyword) value = true;
        else if (e.kind === ts.SyntaxKind.FalseKeyword) value = false;
        else if (hasJsx(e)) value = { jsx: e };
        else if (ts.isConditionalExpression(e)) value = ternaryOf(s, e, ctx);
        else if (ts.isTemplateExpression(e)) value = { parts: mergeStrings([e.head.text, ...e.templateSpans.flatMap(sp => [textPart(unwrap(sp.expression), ctx), sp.literal.text])].filter(p => p !== '')) };
        else { value = { expr: text(s, e) }; if (BOOLEAN_PROPS.has(name) || testLike(s, e)) test = conditionOf(s, e); }
      } else if (ts.isJsxElement(init) || ts.isJsxSelfClosingElement(init)) value = { jsx: init };
      else continue;
      out.push({ name, value, offset, test });
    }
    return out;
  };

  const element = (node, ctx) => {
    const s = ctx.s;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const kids = ts.isJsxElement(node) ? node.children : [];
    const what = classify(s, opening.tagName);
    const props = propsOf(opening, ctx);
    if (what.transparent) return children(kids, ctx);
    if (what.router) return router(what.router, props, kids, ctx);
    if (what.app) return inline(what.app, props, kids, ctx);
    const el = {
      type: 'element', tag: what.host || what.leaf.export, attrs: {}, classes: [], children: [], parent: ctx.parent,
      offset: s.base + opening.getStart(s.sf), cond: ctx.cond, repeat: ctx.repeat, attrHoles: [],
    };
    if (what.leaf) el.component = what.leaf;
    for (const p of props) setAttr(el, p, what.link);
    el.children = children(kids, { ...ctx, parent: el });
    if (el.component && 'asChild' in el.attrs) {
      // The static asChild lift (#84): the single child is the leaf's host; its attributes and children are the leaf's.
      const only = el.children.filter(c => c.type === 'element');
      if (only.length === 1 && el.children.length === 1) {
        const child = only[0];
        el.attrs = { ...child.attrs, ...el.attrs };
        el.attrHoles = [...child.attrHoles, ...el.attrHoles];
        el.asChild = { tag: child.tag, offset: child.offset };
        el.children = child.children;
        for (const c of el.children) c.parent = el;
      }
      delete el.attrs.asChild;
    }
    if (typeof el.attrs.class === 'string') el.classes = el.attrs.class.split(/\s+/).filter(Boolean);
    return [el];
  };

  const setAttr = (el, { name, value, offset, test }, link) => {
    if (name === 'key' || name === 'ref' || /^on[A-Z]/.test(name) || value === false || (value && value.jsx)) return;
    const attr = link && name === 'to' ? 'href' : ATTR_NAMES[name] || name;
    if (value === true) el.attrs[attr] = '';
    else if (typeof value === 'string') el.attrs[attr] = value;
    else if (value.parts) el.attrs[attr] = { parts: value.parts };
    else if (test && attr !== 'class' && attr !== 'style') {
      el.attrHoles.push({ expr: value.expr, ternary: { cond: test.expr, ast: test.ast, then: { text: attr }, else: { text: '' } }, offset });
    } else el.attrs[attr] = { parts: [value] };
  };

  // An app component, inlined: its returns in its own file, the caller's children where it renders {children}.
  const inline = (ref, props, kids, ctx) => {
    const given = Object.fromEntries(props.filter(p => typeof p.value === 'string').map(p => [p.name, p.value]));
    const slot = kids.length ? at => children(kids, { ...ctx, parent: at.parent, cond: at.cond, repeat: at.repeat || ctx.repeat }) : null;
    return renderComponent(ref, given, slot, ctx) || children(kids, ctx);
  };
  // What a component renders, given literal props and a {children} slot; null when its function is not found.
  const renderComponent = (ref, given, slot, ctx) => {
    const key = `${ref.file}#${ref.local || ref.export}`;
    const c = ctx.stack.includes(key) ? null : componentOf(ref);
    if (!c) return null;
    const inner = { ...ctx, s: c.s, props: propsIn(c.fn, given), children: slot, stack: [...ctx.stack, key] };
    return returnsOf(c.s, c.fn).flatMap(r => nodes(r.expr, { ...inner, cond: [...ctx.cond, ...r.cond] }));
  };

  // ---------- routes (Vite: react-router) ----------

  // Discovery (no ctx.chain) records the route tree; a screen render follows its chain of matched routes.
  const routeSets = [];
  const router = (part, props, kids, ctx) => {
    if (part === 'Route') return [];
    if (part === 'Outlet') return ctx.chain && ctx.chain[ctx.level + 1] ? renderRoute(ctx, ctx.level + 1) : [];
    if (!ctx.chain) {
      if (part === 'Routes') routeSets.push(jsxRoutes(ctx.s, kids, '/', []));
      if (part === 'RouterProvider') {
        const r = props.find(p => p.name === 'router');
        const decl = r && r.value.expr && ctx.s.locals.get(r.value.expr);
        const call = decl && decl.initializer && unwrap(decl.initializer);
        if (call && ts.isCallExpression(call) && ts.isArrayLiteralExpression(unwrap(call.arguments[0]))) routeSets.push(objectRoutes(ctx.s, unwrap(call.arguments[0]), '/', []));
      }
      return [];
    }
    return renderRoute(ctx, 0);
  };
  const renderRoute = (ctx, level) => {
    const r = ctx.chain[level];
    return r.element ? nodes(r.element, { ...ctx, s: r.s, level, props: null, children: null }) : (ctx.chain[level + 1] ? renderRoute(ctx, level + 1) : []);
  };
  const joinPath = (prefix, path) => (path === undefined ? prefix : path.startsWith('/') ? path : posix.join(prefix, path));
  const leafRoutes = (s, defs, prefix, parents) => {
    const out = [];
    for (const d of defs) {
      const path = joinPath(prefix, d.path);
      const r = { path, element: d.element, s, offset: d.offset };
      const chain = [...parents, r];
      if (d.children.length) out.push(...leafRoutes(s, d.children, path, chain));
      else if (d.path === '*') ignored.push(`route ${path} (catch-all)`);
      else out.push(chain);
    }
    return out;
  };
  const jsxRoutes = (s, kids, prefix, parents) => {
    const defs = list => list.filter(k => (ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k))
      && classify(s, (ts.isJsxElement(k) ? k.openingElement : k).tagName).router === 'Route').map(k => {
      const opening = ts.isJsxElement(k) ? k.openingElement : k;
      const props = propsOf(opening, { s, cond: [] });
      const path = props.find(p => p.name === 'path');
      const el = props.find(p => p.name === 'element');
      return { path: path && typeof path.value === 'string' ? path.value : undefined, element: el && el.value.jsx, offset: s.base + opening.getStart(s.sf), children: defs(ts.isJsxElement(k) ? k.children : []) };
    });
    return leafRoutes(s, defs(kids), prefix, parents);
  };
  const objectRoutes = (s, array, prefix, parents) => {
    const defs = arr => arr.elements.map(unwrap).filter(ts.isObjectLiteralExpression).map(o => {
      const prop = n => { const p = o.properties.find(x => ts.isPropertyAssignment(x) && x.name.getText(s.sf) === n); return p && unwrap(p.initializer); };
      const path = prop('path'), el = prop('element'), kids = prop('children');
      return { path: path && ts.isStringLiteral(path) ? path.text : undefined, element: el, offset: s.base + o.getStart(s.sf), children: kids && ts.isArrayLiteralExpression(kids) ? defs(kids) : [] };
    });
    return leafRoutes(s, defs(array), prefix, parents);
  };

  // ---------- Vite ----------

  const readVite = () => {
    const htmlRel = 'index.html';
    if (!isFile(htmlRel)) throw new Error(`${root} has no index.html`);
    const hf = space.add(htmlRel, readFileSync(join(root, htmlRel), 'utf8'));
    const shell = first => {
      const doc = readHtml(join(root, htmlRel), htmlRel, { depsDir, text: hf.text });
      shift(doc.root, hf.base);
      if (first) for (const r of doc.rules) { for (const d of r.decls) d.offset += hf.base; rules.push(r); }
      return doc;
    };
    const firstShell = shell(true);
    const src = /<script\b[^>]*\bsrc=["']\/?([^"']+\.[jt]sx?)["']/.exec(hf.text);
    if (!src) throw new Error(`${htmlRel} loads no module script`);
    const main = source(src[1]);
    let render = null;
    const find = n => {
      if (render) return;
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'render' && n.arguments[0] && hasJsx(n.arguments[0])) render = n;
      else ts.forEachChild(n, find);
    };
    find(main.sf);
    if (!render) throw new Error(`${main.rel} renders no JSX (no createRoot(..).render(<App />))`);
    const mountId = (/getElementById\(\s*['"]([^'"]+)['"]/.exec(render.expression.expression.getText(main.sf)) || [])[1] || 'root';
    const mountIn = doc => findEl(doc.root, e => e.attrs.id === mountId) || findEl(doc.root, e => e.tag === 'body');
    const base = { s: main, cond: [], repeat: null, stack: [], props: null, children: null };
    // Discovery: read the whole app once, which loads every reachable file and records the routes.
    nodes(render.arguments[0], { ...base, parent: mountIn(firstShell) });
    const chains = routeSets[0] || [[{ path: '/', element: null, s: main, offset: main.base + render.arguments[0].getStart(main.sf) }]];
    const screens = chains.map(chain => {
      const doc = shell(false);
      const mount = mountIn(doc);
      const leaf = chain[chain.length - 1];
      mount.children = leaf.element || chain.length > 1 ? nodes(render.arguments[0], { ...base, parent: mount, chain, level: 0 }) : nodes(render.arguments[0], { ...base, parent: mount });
      return { id: screenIdOf(leaf.path), name: leaf.path, route: leaf.path, offset: leaf.offset, root: doc.root, mount };
    });
    return { title: firstShell.title, screens };
  };

  // ---------- Next.js App Router ----------

  const special = (dir, name) => EXTS.map(e => posix.join(dir, name + e)).find(isFile) || null;
  // `export const metadata = {title}` in a layout or page: the title string, or its `default`.
  const metadataTitle = file => {
    const d = file && source(file).exports.get('metadata');
    const o = d && d.initializer && unwrap(d.initializer);
    if (!o || !ts.isObjectLiteralExpression(o)) return null;
    const p = o.properties.find(x => ts.isPropertyAssignment(x) && x.name.getText(source(file).sf) === 'title');
    const v = p && unwrap(p.initializer);
    if (v && ts.isStringLiteral(v)) return v.text;
    const def = v && ts.isObjectLiteralExpression(v) && v.properties.find(x => ts.isPropertyAssignment(x) && /^(default|absolute)$/.test(x.name.getText(source(file).sf)));
    return def && ts.isStringLiteral(def.initializer) ? def.initializer.text : null;
  };
  const readNext = () => {
    const app = ['app', 'src/app'].find(d => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory());
    if (!app) throw new Error(`${root} has no app/ folder: only the App Router is read`);
    const rootLayout = special(app, 'layout');
    if (!rootLayout) throw new Error(`${app}/ has no root layout`);
    for (const dir of ['.', 'src']) { const m = special(dir, 'middleware'); if (m) ignored.push(`${m} (middleware)`); }
    // Pages, by sorted folder walk: route groups drop out of the path; private and parallel-route folders are ignored.
    const pages = [];
    const visit = (dir, segs) => {
      const page = special(dir, 'page');
      if (page) pages.push({ dir, page, route: '/' + segs.join('/') });
      const handler = special(dir, 'route');
      if (handler) ignored.push(`${handler} (API route)`);
      for (const ent of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        if (!ent.isDirectory()) continue;
        const sub = posix.join(dir, ent.name);
        if (ent.name.startsWith('_')) { ignored.push(`${sub}/ (private folder)`); continue; }
        if (ent.name.startsWith('@')) { ignored.push(`${sub}/ (parallel route)`); continue; }
        visit(sub, /^\(.*\)$/.test(ent.name) ? segs : [...segs, ent.name]);
      }
    };
    visit(app, []);
    const def = file => ({ file, export: 'default' });
    const screens = pages.map(({ dir, page, route }) => {
      const levels = [];
      for (let d = dir; ; d = posix.dirname(d)) { levels.unshift(d); if (d === app) break; }
      let pageAt = null, mount = null;
      // Inside out, as Next nests them: page, then per level not-found, loading and error boundaries, then the layout.
      let content = ctx => {
        const out = renderComponent(def(page), {}, null, ctx) || [];
        const first = out.find(n => n.type === 'element');
        if (pageAt === null && first) pageAt = first.offset;
        return out;
      };
      levels.slice().reverse().forEach(d => {
        for (const name of ['not-found', 'loading', 'error']) {
          const f = special(d, name);
          if (!f) continue;
          // The root not-found answers unmatched URLs, never "no record" (#62): it is scaffolding.
          if (name === 'not-found' && d === app) { ignored.push(`${f} (root not-found)`); continue; }
          const inner = content;
          content = ctx => [...(renderComponent(def(f), {}, null, withCond(ctx, { expr: f }, true)) || []), ...inner(withCond(ctx, { expr: f }, false))];
        }
        const layout = special(d, 'layout');
        if (!layout) return;
        const inner = content;
        content = ctx => renderComponent(def(layout), {}, at => {
          if (layout === rootLayout) mount = at.parent;
          return inner({ ...ctx, parent: at.parent, cond: at.cond, repeat: at.repeat });
        }, ctx) || [];
      });
      const top = content({ s: null, parent: null, cond: [], repeat: null, stack: [], props: null, children: null });
      const rootEl = top.find(n => n.type === 'element' && n.tag === 'html');
      if (!rootEl) throw new Error(`${rootLayout} renders no <html>`);
      return { id: screenIdOf(route), name: metadataTitle(page) || route, route, offset: pageAt, root: rootEl, mount: mount || findEl(rootEl, e => e.tag === 'body') };
    });
    return { title: metadataTitle(rootLayout), screens };
  };

  const read = kind === 'react-vite' ? readVite() : readNext();
  rules.forEach((r, i) => { r.order = i; });
  return {
    kind, title: read.title || packageOf(root).name || posix.basename(root), files: space.files.map(f => f.rel).sort(), at: space.at, rules,
    standIns: standInsOf(ts, [...sources.values()]), fonts, screens: read.screens, uiDir, ignored: [...new Set(ignored)].sort(),
  };
}

// ---------- Stand-ins (#62) by name and shape, over the files the reader read ----------

/**
 * {mocks: [{name, offset}], simulated: [{name, delay, offset, before, after}]}: `mock…` constants and literal
 * exports of a data/ or fixtures/ file; functions that wait on a setTimeout, with the state each `setX(true)`
 * sets before the timer (`before`) and after it (`after`), named by its useState pair.
 */
function standInsOf(ts, sources) {
  const mocks = [], simulated = [];
  for (const s of sources) {
    const setters = {};
    const visit = n => {
      if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && /^(React\.)?useState\b/.test(n.initializer.getText(s.sf))) {
        const [v, set] = n.name.elements;
        if (v && set && ts.isBindingElement(v) && ts.isBindingElement(set)) setters[set.name.getText(s.sf)] = v.name.getText(s.sf);
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
        const literal = n.initializer && (ts.isArrayLiteralExpression(n.initializer) || ts.isObjectLiteralExpression(n.initializer));
        const exported = n.parent && n.parent.parent && (n.parent.parent.modifiers || []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (/^mock[A-Z]/.test(n.name.text) || (literal && exported && /(^|\/)(data|fixtures)\//.test(s.rel))) mocks.push({ name: n.name.text, offset: s.base + n.name.getStart(s.sf) });
      }
      ts.forEachChild(n, visit);
    };
    visit(s.sf);
    // Each setTimeout's innermost named function, with the setX(true) calls in it before and after the timer.
    const nameOf = n => (ts.isFunctionDeclaration(n) && n.name ? n.name.text
      : (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : null);
    const timers = [];
    const findTimers = n => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'setTimeout') timers.push(n); ts.forEachChild(n, findTimers); };
    findTimers(s.sf);
    const seen = new Set();
    for (const timer of timers) {
      let fn = timer.parent;
      while (fn && !nameOf(fn)) fn = fn.parent;
      if (!fn || seen.has(fn)) continue;
      seen.add(fn);
      const calls = [];
      const scan = x => {
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && /^set[A-Z]/.test(x.expression.text) && x.arguments[0] && x.arguments[0].kind === ts.SyntaxKind.TrueKeyword) calls.push(x);
        ts.forEachChild(x, scan);
      };
      scan(fn.body);
      const atom = c => setters[c.expression.text] || c.expression.text.replace(/^set(.)/, (_, ch) => ch.toLowerCase());
      const start = timer.getStart(s.sf);
      simulated.push({
        name: nameOf(fn), delay: timer.arguments[1] && ts.isNumericLiteral(timer.arguments[1]) ? Number(timer.arguments[1].text) : null,
        offset: s.base + (ts.isFunctionDeclaration(fn) ? fn : fn.parent).getStart(s.sf),
        before: calls.filter(c => c.getStart(s.sf) < start).map(atom),
        after: calls.filter(c => c.getStart(s.sf) > start).map(atom),
      });
    }
  }
  return { mocks, simulated };
}

// ---------- helpers ----------

function packageOf(root) {
  const file = join(root, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

// tsconfig.json (or jsconfig.json) `paths` as [{pattern, targets}], targets relative to the root.
function compilerPaths(root, ts) {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const config = ts ? ts.parseConfigFileTextToJson(name, text).config : JSON.parse(text.replace(/\/\/.*$/gm, ''));
    const options = (config && config.compilerOptions) || {};
    const baseUrl = options.baseUrl || '.';
    return Object.entries(options.paths || {}).map(([pattern, targets]) => ({ pattern, targets: targets.map(t => posix.normalize(posix.join(baseUrl, t))) }));
  }
  return [];
}

function resolveAlias(spec, paths) {
  const out = [];
  for (const { pattern, targets } of paths) {
    if (pattern.endsWith('*') ? spec.startsWith(pattern.slice(0, -1)) : spec === pattern) {
      const rest = pattern.endsWith('*') ? spec.slice(pattern.length - 1) : '';
      for (const t of targets) out.push(t.replace('*', rest));
    }
  }
  return out;
}

function addressSpace() {
  const files = [];
  let next = 0;
  return {
    files,
    has: rel => files.some(f => f.rel === rel),
    add(rel, text) {
      let f = files.find(x => x.rel === rel);
      if (f) return f;
      f = { rel, text, base: next, lines: lineStarts(text) };
      next += text.length + 1;
      files.push(f);
      return f;
    },
    at(offset) {
      const f = files.find(x => offset >= x.base && offset <= x.base + x.text.length);
      if (!f) return null;
      const local = offset - f.base;
      const l = lineOf(f.lines, local);
      return `${f.rel}:${l + 1}:${local - f.lines[l] + 1}`;
    },
  };
}

// Move an HTML reader tree into the address space at `base`.
function shift(root, base) {
  const visit = n => {
    n.offset += base;
    if (n.type !== 'element') return;
    for (const d of n.inline || []) d.offset += base;
    for (const h of n.attrHoles) h.offset += base;
    n.children.forEach(visit);
  };
  visit(root);
}

function findEl(root, pick) { let found = null; walk(root, e => { if (!found && pick(e)) found = e; }); return found; }

// A route path as a screen id: "/" is "index", "/projects/:id" is "projects-id".
export function screenIdOf(route) {
  const id = route.replace(/[:[\]()]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return id || 'index';
}

// JSX text as React renders it: lines trimmed, blank lines dropped, line breaks read as one space.
function cleanJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) last = i; });
  let out = '';
  lines.forEach((l, i) => {
    let line = l.replace(/\t/g, ' ');
    if (i !== 0) line = line.replace(/^ +/, '');
    if (i !== lines.length - 1) line = line.replace(/ +$/, '');
    if (line) { if (i !== last) line += ' '; out += line; }
  });
  return out;
}

const mergeStrings = parts => parts.reduce((out, p) => {
  if (typeof p === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += p; else out.push(p);
  return out;
}, []);

