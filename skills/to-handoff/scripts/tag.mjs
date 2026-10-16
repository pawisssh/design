// Source tagging for the runtime reader (#84, #113): the scratch copy's elements carry `data-handoff-at`, so a
// rendered host element joins back to the static reader's `at`. Only the copy is rewritten, never the Prototype.
//   tagHtml(doc)        one HTML file: every element the static reader found, scripted markup included.
//   tagJsx(text, rel, ts)  one .tsx/.jsx file: every JSX element, as a chain of sites (outermost first).
// Both insert text only, back to front, so every other offset stays where the static reader saw it.

export const ATTR = 'data-handoff-at';

/**
 * The HTML file the reader read (`doc` from readHtml), with ` data-handoff-at=<file:line:col>` after each
 * element's tag name. The value is unquoted (an `at` has no space, quote, `=`, `<`, `>` or backtick), so it is
 * safe inside markup a script holds in a quoted string or a template literal.
 */
export function tagHtml(doc) {
  const edits = [];
  const visit = el => {
    if (el.type !== 'element') return;
    const name = new RegExp(`^<${el.tag}`, 'i').exec(doc.text.slice(el.offset, el.offset + el.tag.length + 1));
    if (name) edits.push({ pos: el.offset + name[0].length, text: ` ${ATTR}=${doc.at(el.offset)}` });
    el.children.forEach(visit);
  };
  visit(doc.root);
  return apply(doc.text, edits);
}

/**
 * One JSX/TSX file with `data-handoff-at` appended to every JSX element but fragments, after every spread so
 * nothing overwrites it (#84). With a `{...x}` spread the value is a chain: the site carried in by the spread,
 * then this one. Ported from prototype/source-link `harness/tag.mjs`. Throws on a file TypeScript cannot parse.
 */
export function tagJsx(text, rel, ts) {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) throw new Error(`${rel} does not parse: ${ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText, ' ')}`);
  const edits = [];
  const visit = node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && !/^(React\.)?Fragment$/.test(node.tagName.getText(sf))) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      const site = `${rel}:${line + 1}:${character + 1}`;
      const spreads = node.attributes.properties.filter(ts.isJsxSpreadAttribute).map(s => s.expression)
        .filter(e => ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)).map(e => e.getText(sf));
      // Object(x) is typed `any`, so the rewrite passes a strict type check.
      const value = spreads.length
        ? `{[${spreads.map(s => `Object(${s})["${ATTR}"]`).reverse().join(' || ')}, "${site}"].filter(Boolean).join(" ")}`
        : `"${site}"`;
      edits.push({ pos: node.attributes.end, text: ` ${ATTR}=${value}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return apply(text, edits);
}

function apply(text, edits) {
  let out = text;
  for (const e of edits.sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  return out;
}
