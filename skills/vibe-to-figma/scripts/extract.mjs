// Path A's extraction (#257, spec #249, ADR 0016): a React + Tailwind Prototype with no Code Library becomes an
// Extracted Library, one generated React + cva component per Component Family found among its repeated elements.
// The JSX is read statically with TypeScript; the Prototype is never run.
//
//   extract({project, answers, map}) -> {library, families, requests, skipped, map, used}
//   familySites({project, map}) -> the Family map's sites as they are in the code now, with their axis values (#265)
//
// Each rule's comment sits beside the code that applies it. The library is a pure function of the Prototype and the
// answers: each component file holds only its family's class strings and names.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../contract/scripts/io.mjs';
import { cssEntry, sha256, sourceFiles } from '../../adapter-generic/scripts/sources.mjs';
import { loadTypescript } from '../../to-handoff/scripts/deps.mjs';

const INTERACTIVE = new Set(['button', 'input', 'select', 'textarea', 'a']);
const MAX_RENDERINGS = 64;
const SNIPPET_MAX = 240;
// The sides an icon slot takes, as the Adapter's Slot axis names them (`has-data-[icon=inline-start]:`).
const SIDES = ['inline-start', 'inline-end'];
const PREVIEW = readJson(fileURLToPath(new URL('../../adapter-generic/preview/package.json', import.meta.url))).dependencies;
// The packages the library's lockfile takes from the Prototype's: what the Adapter compiles with, and what a component renders with.
// The other packages the generated components import, at the Adapter's pins; no icon package or Radix (#262).
const GENERATED_IMPORTS = ['class-variance-authority', 'cn'];
const FROM_PROTOTYPE = ['react', 'react-dom', 'scheduler', 'tailwindcss', 'tw-animate-css', 'shadcn'];

const mostFrequent = list => list.reduce((best, t) => (list.filter(x => x === t).length > list.filter(x => x === best).length ? t : best), list[0]);
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = list => [...list].sort(byKey);
const unique = list => [...new Set(list)];
const pascal = key => key.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
const camel = key => { const p = pascal(key); return p[0].toLowerCase() + p.slice(1); };
const identifier = key => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key));

// ---------- class names ----------

/** `hover:bg-[#fff]` -> {variants: ['hover'], util: 'bg-[#fff]'}; the `!` and a leading `-` stay with the utility. */
function split(cls) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) { parts.push(cls.slice(start, i)); start = i + 1; }
  }
  return { variants: parts, util: cls.slice(start) };
}

// Placement classes (#257) say where an element sits in its parent, not what it is: they are stripped before anything is
// compared, so margins, widths, `flex-1`, positioning and `self-*` never split a group or make an axis.
const PLACEMENT = /^(?:-?m[xytblrse]?-|flex-(?:1|auto|none|initial)$|(?:grow|shrink)(?:-|$)|basis-|w-|min-w-|max-w-|absolute$|relative$|fixed$|sticky$|static$|-?inset-|-?(?:top|right|bottom|left|start|end)-|-?z-|-?order-|col-(?:span|start|end)-|row-(?:span|start|end)-|self-|justify-self-|place-self-)/;
const isPlacement = cls => PLACEMENT.test(split(cls).util.replace(/^!/, ''));

const TEXT_SIZE = /^text-(?:xs|sm|base|lg|xl|\d+xl|\[\d[^\]]*(?:px|rem|em)\])$/;
const WEIGHT = /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;

/** The kind of style a utility sets, with its variants: the unit that differs between sites. `*-color` kinds are colours. */
function category(cls) {
  const { variants, util: raw } = split(cls);
  const u = raw.replace(/^!/, '').replace(/^-/, '');
  const kind = (() => {
    let m;
    if (u.startsWith('bg-')) return /^bg-(?:clip|origin|repeat|no-repeat|cover|contain|center|fixed|local|scroll|none|gradient|linear|radial|conic|size|position|top|bottom|left|right)/.test(u) ? 'bg-other' : 'bg-color';
    if (u.startsWith('text-')) return TEXT_SIZE.test(u) ? 'text-size' : /^text-(?:left|center|right|justify|start|end)$/.test(u) ? 'text-align' : /^text-(?:wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(u) ? 'text-wrap' : 'text-color';
    if (/^border(?:-[xytblrse])?(?:-\d+|-\[\d+px\])?$/.test(u)) return 'border-width';
    if (/^border-(?:solid|dashed|dotted|double|none|hidden)$/.test(u)) return 'border-style';
    if (u.startsWith('border-')) return /^border-(?:collapse|separate|spacing)/.test(u) ? 'border-other' : 'border-color';
    if (/^ring(?:-\d+|-inset)?$/.test(u)) return 'ring-width';
    if (/^ring-offset-\d+$/.test(u)) return 'ring-offset';
    if (u.startsWith('ring-')) return 'ring-color';
    if (/^shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner|none))?$/.test(u)) return 'shadow';
    if (u.startsWith('shadow-')) return 'shadow-color';
    if (/^outline(?:-\d+|-none|-hidden|-dashed|-dotted|-double)?$/.test(u)) return 'outline-width';
    if (u.startsWith('outline-')) return 'outline-color';
    if (WEIGHT.test(u)) return 'font-weight';
    if (/^(?:fill|stroke|accent|caret|decoration|divide|from|to|via)-[^\d]/.test(u)) return `${u.split('-')[0]}-color`;
    if ((m = /^([a-z]+(?:-[a-z]+)?)-(.+)$/.exec(u))) return m[1];
    return u;
  })();
  return `${variants.map(v => `${v}:`).join('')}${kind}`;
}
const isColour = cat => /-color$/.test(cat);
/** A colour utility with its colour masked (`bg-[#fff]` -> `bg-*`): the paint signature compares shapes, not tones. */
const mask = cls => { const c = category(cls); return isColour(c) ? `${c.slice(0, -'color'.length)}*` : cls; };
const isDisabledState = cls => split(cls).variants.includes('disabled');
const paints = cls => split(cls).variants.length === 0 && /^(?:bg|border|rounded|shadow|ring|outline)(?:-|$)/.test(split(cls).util);

// ---------- reading a file ----------

class Unresolved extends Error {}
const KIND = {
  CallExpression: 'a function call',
  PropertyAccessExpression: 'a property access',
  ElementAccessExpression: 'an element access',
  ArrowFunction: 'a function',
  ObjectLiteralExpression: 'an object',
  ArrayLiteralExpression: 'an array',
};
const tokens = text => text.split(/\s+/).filter(Boolean);
const normal = text => text.replace(/\s+/g, '').replace(/^\((.*)\)$/, '$1');

/** The JSX of one source file: [{file, line, col, tag, path, node, text, ternary, at}] and the className expressions it cannot read. */
function readFile(ts, file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, extname(file) === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const col = n => sf.getLineAndCharacterOfPosition(n.getStart()).character + 1;
  const sites = [], skipped = [];
  // The element's opening tag as written, on one line: what the review page shows of a site (#262).
  const snippetOf = opening => {
    const text = opening.getText().replace(/\s+/g, ' ').replace(/\{ /g, '{').replace(/ \}/g, '}').replace(/ >$/, '>');
    return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX - 1)}…` : text;
  };
  const tagNameOf = x => (ts.isJsxElement(x) ? x.openingElement.tagName.getText() : x.tagName.getText());
  // The names this file imports from a package (`import { Check } from "lucide-react"`), not from its own code.
  const packaged = new Set(sf.statements.filter(st => ts.isImportDeclaration(st) && st.importClause && !/^(?:\.|\/|@\/|~\/)/.test(st.moduleSpecifier.text))
    .flatMap(st => [st.importClause.name, ...(st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings) ? st.importClause.namedBindings.elements.map(e => e.name) : [])])
    .filter(Boolean).map(n => n.text));

  // A `let` that is assigned again cannot be read from its initializer.
  const assigned = new Set();
  (function scan(n) {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(n.left)) assigned.add(n.left.text);
    ts.forEachChild(n, scan);
  })(sf);

  const declarations = body => {
    const found = {};
    for (const st of body) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer) found[d.name.text] = { init: d.initializer, mutable: !(st.declarationList.flags & ts.NodeFlags.Const) };
    }
    return found;
  };
  const moduleScope = declarations(sf.statements);
  const isFunction = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);
  const scopesOf = node => {
    const scopes = [];
    for (let n = node.parent; n; n = n.parent) {
      if (!isFunction(n)) continue;
      // A parameter (a prop) hides a module constant of the same name; its value is the caller's.
      const params = {};
      const bind = name => {
        if (ts.isIdentifier(name)) params[name.text] = { param: true };
        else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) name.elements.forEach(e => ts.isBindingElement(e) && bind(e.name));
      };
      n.parameters.forEach(p => bind(p.name));
      scopes.push({ ...(n.body && ts.isBlock(n.body) ? declarations(n.body.statements) : {}), ...params });
    }
    return [...scopes, moduleScope];
  };
  const componentOf = node => {
    let name = 'module';
    for (let n = node.parent; n; n = n.parent) {
      if (ts.isFunctionDeclaration(n) && n.name) name = n.name.text;
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isFunction(n.initializer)) name = n.name.text;
      else if (ts.isExportAssignment(n)) name = name === 'module' ? 'default' : name;
    }
    return name;
  };

  /** The className expression as a tree: {c: [classes]} | {cat: [nodes]} | {pick: [options], conds: [text]}. */
  function resolve(node, scopes, ctx, seen = []) {
    const unresolved = why => { throw new Unresolved(`\`${node.getText()}\` ${why}`); };
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)))
      return resolve(node.expression, scopes, ctx, seen);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { c: tokens(node.text) };
    if (ts.isTemplateExpression(node)) {
      // A class name built from parts (`bg-${c}-500`) cannot be read: each expression must stand between spaces.
      const texts = [node.head.text, ...node.templateSpans.map(sp => sp.literal.text)];
      texts.forEach((t, i) => {
        if ((i > 0 && t && !/^\s/.test(t)) || (i < texts.length - 1 && t && !/\s$/.test(t))) unresolved('builds a class name from parts, which is not read');
      });
      const parts = [{ c: tokens(node.head.text) }];
      for (const span of node.templateSpans) parts.push(resolve(span.expression, scopes, ctx, seen), { c: tokens(span.literal.text) });
      return { cat: parts };
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const [l, r] = [node.left, node.right].map(n => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null));
      if ((l !== null && l && !/\s$/.test(l)) || (r !== null && r && !/^\s/.test(r)) || (l === null && r === null)) unresolved('builds a class name from parts, which is not read');
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
      return { cat: [resolve(node.left, scopes, ctx, seen), { c: [] }, resolve(node.right, scopes, ctx, seen)] };
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      return { pick: [resolve(node.right, scopes, ctx, seen), { c: [] }], conds: [node.left.getText()] };
    if (ts.isConditionalExpression(node)) {
      const cond = node.condition.getText();
      const a = resolve(node.whenTrue, scopes, ctx, seen), b = resolve(node.whenFalse, scopes, ctx, seen);
      const mirror = ctx.disabled && mirrors(cond, ctx.disabled);
      if (mirror) {
        const [on, off] = mirror === 'true' ? [b, a] : [a, b];
        if (!plain(on) || !plain(off)) unresolved('mirrors the element\'s disabled but holds another condition');
        ctx.mirrored = true;
        return { c: [...flat(on), ...flat(off).map(c => `disabled:${c}`)] };
      }
      // `a ? x : b ? y : z` is one pick with three options.
      if (b.pick && b.conds.length === b.pick.length - 1) return { pick: [a, ...b.pick], conds: [cond, ...b.conds] };
      return { pick: [a, b], conds: [cond] };
    }
    if (ts.isIdentifier(node)) {
      if (node.text === 'undefined') return { c: [] };
      if (seen.includes(node.text)) unresolved('refers to itself');
      const decl = scopes.map(s => s[node.text]).find(Boolean);
      if (!decl) unresolved('is not a constant or local variable of this file (a prop or an import?)');
      if (decl.param) unresolved('is a parameter of its component (a prop)');
      if (decl.mutable && assigned.has(node.text)) unresolved('is a `let` that is assigned again');
      return resolve(decl.init, scopes, ctx, [...seen, node.text]);
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) return { c: [] };
    return unresolved(`is ${KIND[ts.SyntaxKind[node.kind]] || ts.SyntaxKind[node.kind]}, which is not read`);
  }
  const plain = n => n.c !== undefined;
  const flat = n => n.c;
  /** Whether `cond` is the element's `disabled` expression ('true': the condition holds when disabled) or its negation ('false'). */
  function mirrors(cond, disabled) {
    const c = normal(cond), d = normal(disabled);
    if (c === d) return 'true';
    if (c === `!${d}` || d === `!${c}`) return 'false';
    return null;
  }

  const hasPick = n => (n.pick ? true : n.cat ? n.cat.some(hasPick) : false);
  (function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText();
      const className = opening.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'className');
      if (/^[a-z]/.test(tag) && className && className.initializer) {
        const at = `${file}:${line(node)}`;
        const init = className.initializer;
        const expr = ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) ? init.expression : null;
        const disabledAttr = opening.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'disabled');
        // in (#260): a site with a `disabled` attribute (but `disabled={false}`) renders its State's disabled value
        const disables = !!disabledAttr && !(disabledAttr.initializer && /^\{\s*false\s*\}$/.test(disabledAttr.initializer.getText()));
        const ctx = { disabled: disabledAttr && disabledAttr.initializer && ts.isJsxExpression(disabledAttr.initializer) && disabledAttr.initializer.expression ? disabledAttr.initializer.expression.getText() : null, mirrored: false };
        try {
          if (!expr) throw new Unresolved('`className` has no value');
          const tree = resolve(expr, scopesOf(node), ctx);
          sites.push({ file, line: line(node), col: col(node), tag, path: pathOf(node), node: tree, ternary: ctx.mirrored || hasPick(tree), text: textOf(node), icon: iconOf(node), disables, at, snippet: snippetOf(opening) });
        } catch (e) {
          if (!(e instanceof Unresolved)) throw e;
          skipped.push({ site: at, tag, reason: e.message, snippet: snippetOf(opening) });
        }
      }
    }
    ts.forEachChild(node, visit);
  })(sf);

  function textOf(node) {
    if (!ts.isJsxElement(node)) return null;
    for (const child of node.children) {
      const t = ts.isJsxText(child) ? child.text : ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression) ? child.expression.text : '';
      if (t.trim()) return t.trim().replace(/\s+/g, ' ');
    }
    return null;
  }
  /**
   * The element's icon child (#259): an <svg>, or a childless element a package exports (lucide-react's <Check />), beside
   * a label as its first child (inline-start) or its last (inline-end), with its size classes ([] when its className sets none or is not a string).
   */
  function iconOf(node) {
    if (!ts.isJsxElement(node)) return null;
    const children = node.children.filter(c => !(ts.isJsxText(c) && !c.text.trim()) && !(ts.isJsxExpression(c) && !c.expression));
    // An icon is an `<svg>`, or a package's element with no children of its own (`<Check />`, not `<Badge>2</Badge>`).
    const isIcon = c => c && (ts.isJsxElement(c) && tagNameOf(c) === 'svg' || ts.isJsxSelfClosingElement(c) && (tagNameOf(c) === 'svg' || packaged.has(tagNameOf(c))));
    // An icon beside a label: an icon alone, or icons at both ends, fill no one side.
    const first = children[0], last = children[children.length - 1];
    if (children.length < 2 || isIcon(first) && isIcon(last)) return null;
    const [side, icon] = isIcon(first) ? ['inline-start', first] : isIcon(last) ? ['inline-end', last] : [];
    if (!side) return null;
    const cls = (ts.isJsxElement(icon) ? icon.openingElement : icon).attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'className');
    const init = cls && cls.initializer && (ts.isJsxExpression(cls.initializer) ? cls.initializer.expression : cls.initializer);
    const text = init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) ? init.text : '';
    return { side, size: sorted(tokens(text).filter(c => /^(?:size|w|h)-/.test(c))) };
  }
  /** The element's place in the code: the enclosing component, then each ancestor element's tag and its index among its parent's elements. */
  function pathOf(node) {
    const steps = [];
    const jsxParent = n => { for (let p = n.parent; p; p = p.parent) if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) return p; return null; };
    for (let n = node; n; n = jsxParent(n)) {
      const parent = jsxParent(n);
      const siblings = [];
      (function collect(root) {
        ts.forEachChild(root, c => {
          if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) siblings.push(c);
          else collect(c);
        });
      })(parent ? parent : sf);
      steps.unshift(`${tagNameOf(n)}[${siblings.indexOf(n)}]`);
    }
    return `${componentOf(node)}:${steps.join('/')}`;
  }
  return { sites, skipped };
}

/** The renderings of a className tree: every class list it can produce, in order. */
function renderings(node) {
  const out = (() => {
    if (node.c) return [node.c];
    if (node.pick) return node.pick.flatMap(renderings);
    let acc = [[]];
    for (const part of node.cat) acc = acc.flatMap(a => renderings(part).map(b => [...a, ...b]));
    return acc;
  })();
  if (out.length > MAX_RENDERINGS) throw new Unresolved(`has more than ${MAX_RENDERINGS} class combinations`);
  return out;
}
/** Each ternary of the tree, as its options' class lists. */
function choicesOf(node) {
  if (node.pick) return [node.pick.map(o => renderings(o).flat()), ...node.pick.flatMap(choicesOf)];
  if (node.cat) return node.cat.flatMap(choicesOf);
  return [];
}

// ---------- groups and axes ----------

const strip = list => unique(list.filter(c => !isPlacement(c)));

/**
 * A site's renderings (#257): the class lists it can produce, placement and `disabled:` utilities set aside (the latter
 * are the family's State). It is a candidate when it is interactive or paints itself (a background, border, radius,
 * shadow, ring or outline of its own); a group of candidates is a family only with 2 or more sites or a className ternary.
 */
function prepare(site) {
  const lists = renderings(site.node).map(strip);
  const disabled = unique(lists.flat().filter(isDisabledState));
  const plainLists = lists.map(l => l.filter(c => !isDisabledState(c)));
  const choices = choicesOf(site.node).map(opts => opts.map(strip).map(l => l.filter(c => !isDisabledState(c))));
  return { ...site, lists: plainLists, disabled, choices, candidate: INTERACTIVE.has(site.tag) || lists.flat().some(paints) };
}

/**
 * The group id: the tag and the paint signature, the paint classes (background, border, radius, shadow, ring, outline)
 * that every rendering of the site has, colours masked. Size, type and layout do not split a group; they become axes.
 */
function groupId(site) {
  const masked = site.lists.map(l => l.map(mask));
  const common = masked.reduce((a, l) => a.filter(c => l.includes(c)));
  return `${site.tag}-${sha256(`${site.tag}|${sorted(common.filter(paints)).join(' ')}`).slice(0, 8)}`;
}

/**
 * deriveAxes(sites) -> {base, axes} (#257): `base` the classes every rendering has plus the sites' `disabled:` utilities,
 * each axis {id, categories, values: [{id, classes, sites}], default}. A ternary is one axis (a nested one an N-value
 * axis); the categories that one ternary changes, and those that change together across renderings, are one axis; any
 * other independent difference is one axis each. The default is the value most sites use. Ids derive from content
 * (the categories, the canonical class set), so an answer survives a merge. `bySite` holds each site's value ids per axis.
 */
function deriveAxes(members) {
  const { sites, slotted, slots } = iconSlots(members);
  const all = sites.flatMap(s => s.lists.map(classes => ({ site: s, classes })));
  const base = all.map(r => r.classes).reduce((a, l) => a.filter(c => l.includes(c)));
  const residual = all.map(r => r.classes.filter(c => !base.includes(c)));
  const cats = sorted(unique(residual.flat().map(category)));
  const parent = Object.fromEntries(cats.map(c => [c, c]));
  const find = c => (parent[c] === c ? c : (parent[c] = find(parent[c])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const s of sites)
    for (const options of s.choices) {
      const inAll = options.reduce((a, l) => a.filter(c => l.includes(c)));
      const changed = unique(options.flat().filter(c => !inAll.includes(c)).map(category)).filter(c => cats.includes(c));
      changed.slice(1).forEach(c => union(changed[0], c));
    }
  const pattern = cat => {
    const seen = new Map();
    return residual.map(l => { const key = sorted(l.filter(c => category(c) === cat)).join(' '); if (!seen.has(key)) seen.set(key, seen.size); return seen.get(key); }).join(',');
  };
  const byPattern = new Map();
  for (const c of cats) { const p = pattern(c); if (byPattern.has(p)) union(byPattern.get(p), c); else byPattern.set(p, c); }
  const components = new Map();
  for (const c of cats) { const root = find(c); components.set(root, [...(components.get(root) || []), c]); }

  // Each site's value ids per axis, by its file and JSX path (#265): two or more where a className ternary picks.
  const given = new Map();
  const axes = [...components.values()].map(group => {
    const categories = sorted(group);
    const values = new Map();
    residual.forEach((l, i) => {
      const classes = sorted(l.filter(c => categories.includes(category(c))));
      const id = classes.length ? `v-${sha256(classes.join(' ')).slice(0, 8)}` : 'v-none';
      if (!values.has(id)) values.set(id, { id, classes, sites: [], keys: new Set() });
      const v = values.get(id);
      const s = all[i].site;
      if (!v.keys.has(siteKey(s))) { v.keys.add(siteKey(s)); v.sites.push(s.at); }
    });
    const list = [...values.values()].map(({ id, classes, sites: where }) => ({ id, classes, sites: where }));
    const usual = list.reduce((best, v) => (v.sites.length > best.sites.length ? v : best), list[0]);
    const id = categories.join('+');
    for (const v of values.values()) for (const k of v.keys) {
      const per = given.get(k) || {};
      (per[id] = per[id] || []).push(v.id);
      given.set(k, per);
    }
    return { id, categories, values: list, default: usual.id };
  }).sort((a, b) => byKey(a.id, b.id));
  return { base: sorted([...base, ...slotted, ...sites.flatMap(s => s.disabled)].filter((c, i, l) => l.indexOf(c) === i)), axes, slots, bySite: given };
}

// The box a spacing utility sets, its sides as one (`px-2`, `pr-1.5`: padding), so one side overrides the whole.
const box = cls => category(cls).replace(/^(.*:)?([pm])[xytblrse]?$/, '$1$2').replace(/^(.*:)?gap-[xy]$/, '$1gap');

/**
 * An icon child whose presence changes the element's classes is a Slot axis (#259, ADR 0011), never a cva axis: on a
 * side where some sites have the icon and some have none, the classes every with-icon rendering has and no plain one
 * has become `has-data-[icon=<side>]:` utilities, and the icons' one size an `[&_svg:not([class*='size-'])]:` utility,
 * which the Adapter reads as the slot frame's size. The classes only the plain sites have join the with-icon sites, so
 * they are base, when a `has-data` utility overrides each; one none overrides makes no slot, nor do an icon with no size
 * class or icons of different sizes: the Adapter cannot size its frame. Returns the sites as deriveAxes reads them, the `slotted` utilities and
 * the `slots`, each {key, classes, filled, empty, keys}: the key of the Slot axis the Adapter reads (`icon-inline-start`),
 * its utilities, the sites that fill it and those that do not, for the review page, and the filled sites' keys, for
 * familySites.
 */
function iconSlots(sites) {
  const slotted = [], slots = [];
  const every = list => list.flatMap(s => s.lists).reduce((a, l) => a.filter(c => l.includes(c)));
  const any = list => new Set(list.flatMap(s => s.lists.flat()));
  for (const side of SIDES) {
    const iconed = sites.filter(s => s.icon && s.icon.side === side), plain = sites.filter(s => !s.icon);
    if (!iconed.length || !plain.length) continue;
    const inPlain = any(plain), inIconed = any(iconed);
    const only = every(iconed).filter(c => !inPlain.has(c));
    const sizes = unique(iconed.map(s => s.icon.size.join(' ')));
    if (!only.length || sizes.length !== 1 || !sizes[0]) continue;
    // A class only the plain sites have joins the icon sites when a has-data utility overrides it (`px-2` under `pr-1.5`);
    // one none overrides (`underline`) would style the icon sites, so the difference stays an axis.
    const plainOnly = every(plain).filter(c => !inIconed.has(c));
    if (plainOnly.some(c => !only.some(o => box(o) === box(c)))) continue;
    sites = sites.map(s => (iconed.includes(s) ? { ...s, lists: s.lists.map(l => [...l.filter(c => !only.includes(c)), ...plainOnly]) } : s));
    const classes = [...only.map(c => `has-data-[icon=${side}]:${c}`), ...sizes[0].split(' ').map(c => `[&_svg:not([class*='size-'])]:${c}`)];
    const at = list => unique(list.map(s => s.at));
    slotted.push(...classes);
    slots.push({ key: `icon-${side}`, classes, filled: at(iconed), empty: at(plain), keys: new Set(iconed.map(siteKey)) });
  }
  return { sites, slotted, slots };
}

// ---------- the Prototype ----------

/** The stylesheet that imports Tailwind (sources.mjs cssEntry). */
function tailwindEntry(project) {
  const entry = cssEntry(project);
  if (!entry) throw new Error('no stylesheet of the project imports tailwindcss (@import "tailwindcss")');
  return entry;
}

/** The stylesheet and the relative stylesheets it imports, as {path: text}. */
export function stylesheets(project, entry) {
  const out = {};
  (function add(rel) {
    if (out[rel] !== undefined) return;
    out[rel] = readFileSync(join(project, rel), 'utf8');
    for (const [, id] of out[rel].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+(?:url\(\s*)?["'](\.[^"']+)["']/g)) {
      const next = join(dirname(rel), id);
      if (existsSync(join(project, next))) add(next);
    }
  })(entry);
  return out;
}

/** The library's lockfile (#257): the Prototype's own entries for FROM_PROTOTYPE (so the Adapter compiles with the Tailwind it resolves), the preview set's versions for the rest. */
function prototypeLock(project) {
  const path = join(project, 'package-lock.json');
  if (!existsSync(path)) throw new Error('no package-lock.json: the Extracted Library takes its resolved versions from it');
  return readJson(path).packages || {};
}
function lockfile(project, name) {
  const have = prototypeLock(project);
  const packages = {};
  for (const pkg of sorted([...FROM_PROTOTYPE, ...GENERATED_IMPORTS])) {
    const entry = have[`node_modules/${pkg}`];
    if (entry && FROM_PROTOTYPE.includes(pkg)) packages[`node_modules/${pkg}`] = entry;
    else if (PREVIEW[pkg]) packages[`node_modules/${pkg}`] = { version: PREVIEW[pkg] };
  }
  return `${JSON.stringify({ name: `${name}-library`, lockfileVersion: 3, requires: true, packages: { '': { name: `${name}-library` }, ...packages } }, null, 2)}\n`;
}

// ---------- answers ----------

const FAMILY_KEY = /^[a-z][a-z0-9-]*$/;
const VALUE_KEY = /^[a-z0-9][a-z0-9-]*$/;

/** The group request the agent answers: where the sites are, what they share and how they differ. */
function requestOf(id, tag, sites, derived, open, problems, existing = []) {
  const text = sites.map(s => s.text).filter(Boolean);
  const classes = [...derived.base, ...derived.axes.flatMap(a => a.values.flatMap(v => v.classes))];
  const styled = classes.some(c => split(c).variants.length === 0 && (TEXT_SIZE.test(split(c).util) || WEIGHT.test(split(c).util)));
  return { id, tag, sites: sites.map(s => s.at), common: derived.base,
    axes: derived.axes.map(a => ({ id: a.id, categories: a.categories, default: a.default, values: a.values })),
    text: text.length ? mostFrequent(text) : null,
    needsText: !text.length && styled, open, ...(open.includes('family') && existing.length && { families: existing }), ...(problems.length && { problems }) };
}

/**
 * What the answers still owe a family (#257), as {open, problems}: `open` the keys not answered yet, `problems` the answers
 * that are wrong. The answers are {groups: {<group id>: {family, description, grid, text?, axes: {<axis id>: {key,
 * label, values: {<value id>: {key, label}}}}}}}; `family: null` drops a group, and groups answered with one family name merge.
 */
function missing(group, family, derived) {
  const open = [], problems = [];
  if (!group.description) open.push('description');
  const axisKeys = [];
  for (const a of derived.axes) {
    const given = group.axes[a.id] || {};
    if (!given.key) open.push(`axes.${a.id}.key`);
    else if (!FAMILY_KEY.test(given.key) || given.key === 'state') problems.push(`axes.${a.id}.key "${given.key}" is not a lower-case key, or is the reserved "state"`);
    else axisKeys.push(given.key);
    if (!given.label) open.push(`axes.${a.id}.label`);
    const valueKeys = [];
    for (const v of a.values) {
      const gv = (given.values || {})[v.id] || {};
      if (!gv.key || !gv.label) open.push(`axes.${a.id}.values.${v.id}`);
      else if (!VALUE_KEY.test(gv.key)) problems.push(`axes.${a.id}.values.${v.id} key "${gv.key}" is not a lower-case key`);
      else valueKeys.push(gv.key);
    }
    if (new Set(valueKeys).size !== valueKeys.length) problems.push(`axes.${a.id}: two values share a key`);
  }
  if (new Set(axisKeys).size !== axisKeys.length) problems.push(`family ${family}: two axes share a key`);
  // The grid names the answered axes; every family has the canonical State axis, which the CLI adds to the grid itself.
  const grid = group.grid;
  if (derived.axes.length) {
    if (!grid || !Array.isArray(grid.columns) || !Array.isArray(grid.rows)) open.push('grid');
    else if (new Set([...grid.columns, ...grid.rows]).size !== axisKeys.length || [...grid.columns, ...grid.rows].some(k => !axisKeys.includes(k))) problems.push(`grid must name every axis exactly once: ${axisKeys.join(', ')}`);
  }
  return { open, problems };
}

const siteKey = s => `${s.file}|${s.path}`;

/**
 * readMap(map) -> {families, sites, dropped, droppedList} (#261): the committed Family map as extract() reads it. `families` is the map's
 * own entries, `sites` maps a site's file and JSX path to {family, by}, `dropped` the sites the owner or the agent said are no
 * family. A map that names a site twice, or a family that is not a key, is refused with the plain reason.
 */
function readMap(map) {
  const out = { families: {}, sites: new Map(), dropped: new Set(), droppedList: (map && map.dropped) || [] };
  if (!map) return out;
  const claim = (where, site, by, family) => {
    const k = siteKey(site);
    if (out.sites.has(k) || out.dropped.has(k)) throw new Error(`the Family map names ${site.file} ${site.path} twice (${where})`);
    if (family === null) out.dropped.add(k); else out.sites.set(k, { family, by });
  };
  for (const [key, entry] of Object.entries(map.families || {})) {
    if (!FAMILY_KEY.test(key)) throw new Error(`the Family map's family "${key}" is not a lower-case key`);
    if (!['agent', 'owner'].includes(entry.by) || !Array.isArray(entry.sites)) throw new Error(`the Family map's family "${key}" needs \`by\` ("agent" or "owner") and a \`sites\` list`);
    out.families[key] = entry;
    for (const site of entry.sites) claim(`family ${key}`, site, entry.by, key);
  }
  for (const site of out.droppedList) claim('dropped', site, site.by, null);
  return out;
}

/** (#261) The stored answers with their axis and value ids brought to the current ones: an id that no longer exists (its classes changed) hands its names to the one new id in its place, in order. */
function rekey(stored, derived) {
  const out = { ...stored, axes: {} };
  for (const a of derived.axes) {
    const s = (stored.axes || {})[a.id];
    if (!s) continue;
    const have = s.values || {}, values = {};
    for (const v of a.values) if (v.id in have) values[v.id] = have[v.id];
    const added = a.values.map(v => v.id).filter(id => !(id in have)), gone = Object.keys(have).filter(id => !a.values.some(v => v.id === id));
    if (added.length === gone.length) added.forEach((id, i) => { values[id] = have[gone[i]]; });
    out.axes[a.id] = { key: s.key, label: s.label, values };
  }
  return out;
}

/** (#261) The answers of several layers as one, each key from the first layer that gives it; the grid is the first one that names exactly the answered axes. */
function answersFor(derived, layers) {
  const out = { description: undefined, grid: undefined, text: undefined, axes: {} };
  for (const l of layers) { out.description ??= l.description; out.text ??= l.text; }
  for (const a of derived.axes) {
    const m = out.axes[a.id] = { values: {} };
    for (const l of layers) {
      const given = (l.axes || {})[a.id];
      if (!given) continue;
      m.key ??= given.key; m.label ??= given.label;
      for (const [id, v] of Object.entries(given.values || {})) m.values[id] ??= v;
    }
  }
  const keys = derived.axes.map(a => out.axes[a.id].key);
  const fits = g => g && Array.isArray(g.columns) && Array.isArray(g.rows) && new Set([...g.columns, ...g.rows]).size === keys.length && keys.every(k => [...g.columns, ...g.rows].includes(k));
  out.grid = layers.map(l => l.grid).find(fits) ?? layers.map(l => l.grid).find(Boolean);
  return out;
}

// ---------- the library ----------

function componentFile(key, tag, derived, names) {
  const Name = pascal(key), variants = `${camel(key)}Variants`;
  const base = derived.base.join(' ');
  const lines = ['import * as React from "react"'];
  if (!derived.axes.length) {
    return [...lines, 'import { cn } from "cn"', '',
      `function ${Name}({ className, ...props }: React.ComponentProps<${JSON.stringify(tag)}>) {`,
      `  return <${tag} data-slot=${JSON.stringify(key)} className={cn(${JSON.stringify(base)}, className)} {...props} />`,
      '}', '', `export { ${Name} }`, ''].join('\n');
  }
  const axes = derived.axes.map(a => ({ ...a, name: names[a.id] }));
  const body = axes.map(a => [`      ${identifier(a.name.key)}: {`, ...a.values.map(v => `        ${identifier(a.name.values[v.id].key)}: ${JSON.stringify(v.classes.join(' '))},`), '      },'].join('\n')).join('\n');
  const defaults = axes.map(a => `${identifier(a.name.key)}: ${JSON.stringify(a.name.values[a.default].key)}`).join(', ');
  const props = axes.map(a => `${identifier(a.name.key)} = ${JSON.stringify(a.name.values[a.default].key)}`).join(', ');
  const args = axes.map(a => identifier(a.name.key)).join(', ');
  return [...lines, 'import { cva, type VariantProps } from "class-variance-authority"', 'import { cn } from "cn"', '',
    `const ${variants} = cva(`, `  ${JSON.stringify(base)},`, '  {', '    variants: {', body, '    },', `    defaultVariants: { ${defaults} },`, '  }', ')', '',
    `function ${Name}({ className, ${props}, ...props }: React.ComponentProps<${JSON.stringify(tag)}> & VariantProps<typeof ${variants}>) {`,
    `  return <${tag} data-slot=${JSON.stringify(key)} className={cn(${variants}({ ${args}, className }))} {...props} />`,
    '}', '', `export { ${Name}, ${variants} }`, ''].join('\n');
}

/**
 * extract({project, answers}) -> {library, families, requests, skipped, map, used}:
 * - `library` {path: text} is the Extracted Library (empty while a request is open);
 * - `families` [{key, tag, groups, description, grid, text, names, derived, sites: [{file, path, line, values, disables}]}],
 *   `used` their keys; a site's `values` are the axis values its classes give ({<axis key>: [<value key>]}, two or more
 *   on an axis a className ternary at the site picks), `disables` whether it has a `disabled` attribute;
 * - `requests` the groups with a judgement still open (each with the `open` keys it still needs; nothing is built until none is open); `skipped` [{site, tag, reason}] the className
 *   expressions the script could not resolve;
 * - `map` the Family map: each family's member sites, by file and JSX path.
 * Nothing is written.
 */
export function extract({ project, answers = {}, map = null }) {
  const ts = loadTypescript();
  const skipped = [];
  let sites = [];
  for (const abs of sourceFiles(project)) {
    if (!['.tsx', '.jsx'].includes(extname(abs)) || abs.endsWith('.d.ts')) continue;
    const file = relative(project, abs);
    const read = readFile(ts, file, readFileSync(abs, 'utf8'));
    skipped.push(...read.skipped);
    for (const site of read.sites) {
      try { sites.push(prepare(site)); } catch (e) { if (!(e instanceof Unresolved)) throw e; skipped.push({ site: site.at, tag: site.tag, reason: e.message, snippet: site.snippet }); }
    }
  }

  // The Family map (#261): sites are matched to their recorded family by file and JSX path, never by line or classes, so a
  // rerun neither asks again nor loses the owner's corrections. A site the owner dropped is no candidate.
  const prior = readMap(map);
  const present = new Set(sites.map(siteKey));
  const candidates = sites.filter(s => s.candidate && !prior.dropped.has(siteKey(s)));
  const groups = new Map();
  for (const s of candidates) {
    s.group = groupId(s);
    groups.set(s.group, [...(groups.get(s.group) || []), s]);
  }
  const ids = sorted([...groups.keys()]);

  // Each site's family. An owner's entry is final. Otherwise this run's answer for the site's group, then the site's own
  // recorded family, then the family most of its group's recorded sites have, so a site that joins a known group joins its
  // family. Only a group with none of these is new: it goes to the agent, with the existing family names offered.
  const given = answers.groups || {};
  const existing = sorted(Object.keys(prior.families));
  const requests = [], drops = [], assigned = new Map();
  for (const id of ids) {
    const list = groups.get(id), a = given[id] || {};
    const recorded = list.map(s => prior.sites.get(siteKey(s))).filter(Boolean);
    const common = mostFrequent(sorted(recorded.map(r => r.family)));
    const owned = s => (prior.sites.get(siteKey(s)) || {}).by === 'owner';
    const free = list.filter(s => !owned(s));
    for (const s of list.filter(owned)) assigned.set(siteKey(s), prior.sites.get(siteKey(s)).family);
    if (a.family === null) { for (const s of free) drops.push({ file: s.file, path: s.path, by: 'agent', evidence: `group ${id}: answered as no family` }); continue; }
    if (a.family !== undefined && !FAMILY_KEY.test(a.family)) { requests.push({ ...requestOf(id, list[0].tag, list, deriveAxes(list), ['family'], [], existing), problems: [`family "${a.family}" is not a lower-case key`] }); continue; }
    if (a.family === undefined && !recorded.length && !free.some(s => s.ternary) && list.length < 2) continue;
    if (a.family === undefined && !recorded.length) {
      const derived = deriveAxes(list);
      requests.push(requestOf(id, list[0].tag, list, derived, ['family', ...missing({ axes: {} }, '', derived).open], [], existing));
      continue;
    }
    for (const s of free) assigned.set(siteKey(s), a.family ?? (prior.sites.get(siteKey(s)) || {}).family ?? common);
  }

  const families = new Map(); // key -> member sites
  for (const s of candidates) if (assigned.has(siteKey(s))) families.set(assigned.get(siteKey(s)), [...(families.get(assigned.get(siteKey(s))) || []), s]);

  // What the library needs is checked before any request is written, so the agent never answers for a run that cannot finish.
  if (requests.length || families.size) { tailwindEntry(project); prototypeLock(project); }

  const built = [];
  for (const key of sorted([...families.keys()])) {
    const memberSites = families.get(key);
    const members = sorted(unique(memberSites.map(s => s.group)));
    const tags = unique(memberSites.map(s => s.tag));
    const derived = deriveAxes(memberSites);
    const record = prior.families[key];
    // The family's answers: the owner's recorded ones, then this run's, then the agent's recorded ones, each key from the first layer that gives it.
    const fresh = answersFor(derived, members.map(id => given[id] || {}));
    const stored = rekey(record ? record.answers || {} : {}, derived);
    const merged = answersFor(derived, record && record.by === 'owner' ? [stored, fresh] : [fresh, stored]);
    const { open, problems } = missing(merged, key, derived);
    if (tags.length > 1) problems.push(`family ${key} merges groups of different tags (${tags.join(', ')})`);
    const text = memberSites.map(s => s.text).filter(Boolean);
    if (!text.length && merged.text === undefined) {
      const probe = requestOf(members[0], tags[0], memberSites, derived, [], [], existing);
      if (probe.needsText) open.push('text');
    }
    if (open.length || problems.length) requests.push({ ...requestOf(members[0], tags[0], memberSites, derived, open, problems, existing), family: key });
    else built.push({ key, members, memberSites, derived, merged, tag: tags[0], record });
  }

  if (requests.length || !built.length) return { library: {}, families: [], used: [], requests, skipped, map: null, report: null };

  const library = {};
  const familyList = [];
  for (const f of built.sort((a, b) => byKey(a.key, b.key))) {
    const names = Object.fromEntries(f.derived.axes.map(a => [a.id, { key: f.merged.axes[a.id].key, label: f.merged.axes[a.id].label,
      values: Object.fromEntries(a.values.map(v => [v.id, f.merged.axes[a.id].values[v.id]])) }]));
    library[`components/ui/${f.key}.tsx`] = componentFile(f.key, f.tag, f.derived, names);
    const texts = f.memberSites.map(s => s.text).filter(Boolean);
    const text = texts.length ? mostFrequent(texts) : f.merged.text;
    familyList.push({ key: f.key, tag: f.tag, groups: f.members, description: f.merged.description, grid: f.merged.grid, text, answeredText: f.merged.text, names, record: f.record,
      sites: f.memberSites.map(s => ({ file: s.file, path: s.path, line: s.line, col: s.col, group: s.group, snippet: s.snippet, values: valuesAt(f.derived, names, s), disables: s.disables }))
        .sort((x, y) => byKey(siteKey(x), siteKey(y))), derived: f.derived });
  }
  const entry = tailwindEntry(project);
  const sheets = stylesheets(project, entry);
  const manifest = readJson(join(project, 'package.json'));
  library['components.json'] = `${JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json', tailwind: { css: entry }, aliases: { ui: '@/components/ui', utils: '@/lib/utils' } }, null, 2)}\n`;
  Object.assign(library, sheets);
  library['package-lock.json'] = lockfile(project, String(manifest.name || 'prototype').replace(/^@[^/]+\//, ''));

  // A dropped site stays recorded while its element is in the code.
  const dropped = [...prior.droppedList.filter(d => present.has(siteKey(d))), ...drops].sort((x, y) => byKey(siteKey(x), siteKey(y)));
  const next = { version: 1, families: Object.fromEntries(familyList.map(f => {
    const { record } = f;
    const owner = record && record.by === 'owner';
    const groupSites = id => f.sites.filter(s => s.group === id).length;
    return [f.key, {
      by: owner ? 'owner' : 'agent',
      evidence: owner ? record.evidence : f.groups.map(g => `group ${g}: ${f.tag}, ${groupSites(g)} site${groupSites(g) === 1 ? '' : 's'}`),
      fingerprint: `sha256:${sha256(f.derived.base.join(' ') + JSON.stringify(f.derived.axes.map(a => [a.id, a.values.map(v => v.id)])))}`,
      sites: f.sites.map(({ file, path }) => ({ file, path })),
      answers: { description: f.description, ...(f.grid && { grid: f.grid }), ...(f.answeredText !== undefined && { text: f.answeredText }),
        axes: Object.fromEntries(f.derived.axes.map(a => [a.id, f.names[a.id]])) },
    }];
  })), ...(dropped.length && { dropped }) };
  const report = reportOf({ families: familyList, map: next, sites, assigned, prior, drops, skipped });
  return { library, families: familyList, used: familyList.map(f => f.key), requests: [], skipped, map: next, report };
}

/**
 * familySites({project, map}) -> [{file, line, col, family, values: {<axis key>: [<value key>]}}] (#265): each site the
 * committed Family map records, where it is in the Prototype's code now and the axis values its classes give, by the
 * family's answered names (two or more on an axis a className ternary at the site picks). To-handoff recognises Usages
 * through it. A map that this code no longer gives back byte for byte (a class edit, a new group, an owner's correction
 * not yet run) is refused: the Contracts were drafted from the map as it was.
 */
export function familySites({ project, map }) {
  const found = extract({ project, map });
  if (!found.map || JSON.stringify(found.map) !== JSON.stringify(map))
    throw new Error(`the Family map is not what ${project}'s code gives now: run Vibe-to-Figma's folder step again (node skills/vibe-to-figma/scripts/folder.mjs ${project}), or, if the folder is another Prototype's own, name another Design System`);
  return found.families.flatMap(f => f.sites.map(s => ({ file: s.file, line: s.line, col: s.col, family: f.key, values: s.values })));
}

/** The axis values a site's classes give, by the family's answered names: {<axis key>: [<value key>]}. */
function valuesAt(derived, names, s) {
  const given = derived.bySite.get(siteKey(s));
  return Object.fromEntries([...derived.axes.map(a => [names[a.id].key, given[a.id].map(id => names[a.id].values[id].key)]),
    // An icon Slot axis (#259): filled where the site has the icon child.
    ...derived.slots.map(sl => [sl.key, [sl.keys.has(siteKey(s)) ? sl.key : 'none']])]);
}

/**
 * The review page's record of a run (#262): what the owner checks before anything reaches Figma. Each family with its sites
 * (file:line, JSX path, source snippet), its axes with the sites that give each value, the candidate elements no family
 * took with the reason, and the sites skipped. Lines and snippets are for display, so this file is rewritten when the code
 * above a site moves; the Contracts do not read it.
 */
function reportOf({ families, map, sites, assigned, prior, drops, skipped }) {
  const dropped = new Map([...prior.droppedList, ...drops].map(d => [siteKey(d), d]));
  const place = s => ({ file: s.file, path: s.path, line: s.line, tag: s.tag, snippet: s.snippet });
  const at = (a, b) => byKey(a.file, b.file) || a.line - b.line || byKey(a.path, b.path);
  return {
    version: 1,
    families: Object.fromEntries(families.map(f => [f.key, {
      tag: f.tag, by: map.families[f.key].by, evidence: map.families[f.key].evidence, description: f.description,
      sites: f.sites.map(place).sort(at),
      axes: [...f.derived.axes.map(a => ({ id: a.id, key: f.names[a.id].key, label: f.names[a.id].label, default: f.names[a.id].values[a.default].key,
        values: a.values.map(v => ({ id: v.id, key: f.names[a.id].values[v.id].key, label: f.names[a.id].values[v.id].label, classes: v.classes, sites: v.sites })) })),
      // An icon Slot axis (#259), named by the Adapter's rule: the Title Case of its key, False and True.
      ...f.derived.slots.map(s => ({ id: s.key, key: s.key, label: s.key.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), default: 'none',
        values: [{ id: 'none', key: 'none', label: 'False', classes: [], sites: s.empty }, { id: s.key, key: s.key, label: 'True', classes: s.classes, sites: s.filled }] }))],
    }])),
    unmatched: sites.filter(s => s.candidate && !assigned.has(siteKey(s))).map(s => ({ ...place(s),
      reason: dropped.has(siteKey(s)) ? dropped.get(siteKey(s)).evidence : 'it appears once and has no className ternary' })).sort(at),
    skipped,
  };
}
