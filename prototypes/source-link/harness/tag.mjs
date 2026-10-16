// PROTOTYPE (#84). Tags every JSX element in a scratch copy with
// data-handoff-at="<chain>", where the chain is the space-separated list of
// JSX sites (file:line:col) that produced the element, outermost first.
//
// - Rewrites source text in place, before any bundler runs, using the
//   TypeScript parser the static reader uses, so locations agree by
//   construction and no bundler config or plugin changes.
// - The attribute goes last, after every spread, so it is never overwritten.
// - When the element has a spread of a plain identifier/property access
//   (`{...props}`), the chain carried in by that spread is prefixed, so a
//   host <button> inside components/ui/button.tsx ends up with
//   "app/form.tsx:12:7 components/ui/button.tsx:52:5".
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

export const ATTR = "data-handoff-at"
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".git", "public"])

export function tagSource(text, relPath) {
  const kind = relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, kind)
  // A file the parser can't read cleanly is left untagged; its elements fall
  // back to the fibre / DOM ancestor (see measure.mjs resolve()).
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) throw new Error(`parse errors in ${relPath}`)
  const edits = []
  let count = 0

  function isFragment(tag) {
    const name = tag.getText(sf)
    return name === "Fragment" || name === "React.Fragment"
  }

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!isFragment(node.tagName)) {
        const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        const loc = `${relPath}:${line + 1}:${character + 1}`
        const spreads = node.attributes.properties
          .filter(ts.isJsxSpreadAttribute)
          .map((s) => s.expression)
          .filter((e) => ts.isIdentifier(e) || ts.isPropertyAccessExpression(e))
          .map((e) => e.getText(sf))
        let attr
        if (spreads.length === 0) {
          attr = ` ${ATTR}="${loc}"`
        } else {
          // Object(x) is typed `any`, so this passes `tsc` in strict mode.
          const incoming = spreads.map((s) => `Object(${s})["${ATTR}"]`).reverse().join(" || ")
          attr = ` ${ATTR}={[${incoming}, "${loc}"].filter(Boolean).join(" ")}`
        }
        // Insert at the end of the attribute list: before `>` or `/>`.
        edits.push({ pos: node.attributes.end, text: attr })
        count++
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  edits.sort((a, b) => b.pos - a.pos)
  let out = text
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos)
  return { out, count }
}

export function tagTree(root) {
  const stats = { files: 0, elements: 0, failed: [] }
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name)) continue
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(abs)
      else if (/\.(tsx|jsx)$/.test(ent.name)) {
        const rel = path.relative(root, abs)
        try {
          const { out, count } = tagSource(fs.readFileSync(abs, "utf8"), rel)
          fs.writeFileSync(abs, out)
          stats.files++
          stats.elements += count
        } catch (err) {
          stats.failed.push({ file: rel, error: String(err) })
        }
      }
    }
  }
  walk(root)
  return stats
}

if (process.argv[1] && process.argv[1].endsWith("tag.mjs") && process.argv[2]) {
  console.log(JSON.stringify(tagTree(path.resolve(process.argv[2])), null, 2))
}
