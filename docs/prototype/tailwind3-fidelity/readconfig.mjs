// Read a Tailwind 3 config without running it: the pinned TypeScript 6 parser, and a literal-only evaluator.
// Returns {config, plugins, refused}: `refused` lists each construct the evaluator can't read (kind and line).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const TS = '/Users/kane/Projects/kane/design/.scratch/adapter-generic/tools/typescript@6.0.3/package/lib/typescript.js';
const ts = createRequire(import.meta.url)(TS);

export function readConfig(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const refused = [], plugins = [], imports = {};
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const refuse = (n, why) => { refused.push(`${why} (${ts.SyntaxKind[n.kind]}, line ${line(n)})`); return undefined; };
  const name = n => (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n)) ? n.text : refuse(n, 'a computed key');
  function value(n) {
    while (ts.isSatisfiesExpression?.(n) || ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isTypeAssertionExpression?.(n)) n = n.expression;
    if (ts.isStringLiteralLike(n)) return n.text;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(n)) return n.elements.map(value);
    if (ts.isObjectLiteralExpression(n)) {
      const o = {};
      for (const p of n.properties) {
        if (ts.isPropertyAssignment(p)) o[name(p.name)] = value(p.initializer);
        else refuse(p, 'a spread, method or shorthand property');
      }
      return o;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require' && n.arguments.length === 1 && ts.isStringLiteralLike(n.arguments[0])) {
      plugins.push(n.arguments[0].text); return { plugin: n.arguments[0].text };
    }
    if (ts.isIdentifier(n) && imports[n.text]) { plugins.push(imports[n.text]); return { plugin: imports[n.text] }; }
    return refuse(n, 'not a literal');
  }
  let config;
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) {
      if (s.importClause?.isTypeOnly) continue;
      const from = s.moduleSpecifier.text;
      if (s.importClause?.name) imports[s.importClause.name.text] = from;
      else if (s.importClause?.namedBindings && !s.importClause.namedBindings.elements?.every(e => e.isTypeOnly)) refuse(s, `a named import from ${from}`);
    } else if (ts.isExportAssignment(s)) config = value(s.expression);
    else if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && s.expression.left.getText() === 'module.exports') config = value(s.expression.right);
    else if (!ts.isTypeAliasDeclaration(s) && !ts.isInterfaceDeclaration(s)) refuse(s, 'a statement other than the export');
  }
  return { config, plugins, refused };
}
if (process.argv[1] === new URL(import.meta.url).pathname) console.log(JSON.stringify(readConfig(process.argv[2]), null, 1).slice(0, 1500));
