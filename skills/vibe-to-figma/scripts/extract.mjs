// Path A's extraction (#257, spec #249, ADR 0016): a React + Tailwind Prototype with no Code Library becomes an
// Extracted Library, one generated React + cva component per Component Family found among its repeated elements.
// The JSX is read statically with TypeScript; the Prototype is never run.
//
//   extract({project, answers}) -> {library, families, requests, skipped, map, used}
//
// Each rule's comment sits beside the code that applies it. The library is a pure function of the Prototype and the
// answers: each component file holds only its family's class strings and names.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../contract/scripts/io.mjs';
import { sha256 } from '../../adapter-generic/scripts/sources.mjs';
import { loadTypescript } from '../../to-handoff/scripts/deps.mjs';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out']);
const INTERACTIVE = new Set(['button', 'input', 'select', 'textarea', 'a']);
const MAX_RENDERINGS = 64;
const PREVIEW = readJson(fileURLToPath(new URL('../../adapter-generic/preview/package.json', import.meta.url))).dependencies;
// The packages the library's lockfile takes from the Prototype's: what the Adapter compiles with, and what a component renders with.
const FROM_PROTOTYPE = ['react', 'react-dom', 'tailwindcss', 'tw-animate-css', 'shadcn'];

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

/** The JSX of one source file: [{file, line, tag, path, node, text, ternary, at}] and the className expressions it cannot read. */
function readFile(ts, file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, extname(file) === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const sites = [], skipped = [];
  const tagNameOf = x => (ts.isJsxElement(x) ? x.openingElement.tagName.getText() : x.tagName.getText());

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
        const ctx = { disabled: disabledAttr && disabledAttr.initializer && ts.isJsxExpression(disabledAttr.initializer) && disabledAttr.initializer.expression ? disabledAttr.initializer.expression.getText() : null, mirrored: false };
        try {
          if (!expr) throw new Unresolved('`className` has no value');
          const tree = resolve(expr, scopesOf(node), ctx);
          sites.push({ file, line: line(node), tag, path: pathOf(node), node: tree, ternary: ctx.mirrored || hasPick(tree), text: textOf(node), at });
        } catch (e) {
          if (!(e instanceof Unresolved)) throw e;
          skipped.push({ site: at, tag, reason: e.message });
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
 * (the categories, the canonical class set), so an answer survives a merge.
 */
function deriveAxes(sites) {
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

  const axes = [...components.values()].map(group => {
    const categories = sorted(group);
    const values = new Map();
    residual.forEach((l, i) => {
      const classes = sorted(l.filter(c => categories.includes(category(c))));
      const id = classes.length ? `v-${sha256(classes.join(' ')).slice(0, 8)}` : 'v-none';
      if (!values.has(id)) values.set(id, { id, classes, sites: [], keys: new Set() });
      const v = values.get(id);
      const s = all[i].site;
      if (!v.keys.has(`${s.file}|${s.path}`)) { v.keys.add(`${s.file}|${s.path}`); v.sites.push(s.at); }
    });
    const list = [...values.values()].map(({ id, classes, sites: where }) => ({ id, classes, sites: where }));
    const usual = list.reduce((best, v) => (v.sites.length > best.sites.length ? v : best), list[0]);
    return { id: categories.join('+'), categories, values: list, default: usual.id };
  }).sort((a, b) => byKey(a.id, b.id));
  return { base: sorted([...base, ...sites.flatMap(s => s.disabled)].filter((c, i, l) => l.indexOf(c) === i)), axes };
}

// ---------- the Prototype ----------

function* sourceFiles(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    let isDir;
    try { isDir = statSync(path).isDirectory(); } catch { continue; }
    if (isDir) yield* sourceFiles(path);
    else yield path;
  }
}

/** The stylesheet that imports Tailwind (`@import "tailwindcss"`), the shallowest first. */
function cssEntry(project) {
  const found = [...sourceFiles(project)].filter(f => extname(f) === '.css' && /@import\s+(?:url\(\s*)?["']tailwindcss["']/.test(readFileSync(f, 'utf8')))
    .map(f => relative(project, f)).sort((a, b) => a.split('/').length - b.split('/').length || byKey(a, b));
  if (!found.length) throw new Error('no stylesheet of the project imports tailwindcss (@import "tailwindcss")');
  return found[0];
}

/** The stylesheet and the relative stylesheets it imports, as {path: text}. */
function stylesheets(project, entry) {
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
  for (const pkg of sorted([...FROM_PROTOTYPE, ...Object.keys(PREVIEW)])) {
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
function requestOf(id, tag, sites, derived, open, problems) {
  const text = sites.map(s => s.text).filter(Boolean);
  const classes = [...derived.base, ...derived.axes.flatMap(a => a.values.flatMap(v => v.classes))];
  const styled = classes.some(c => split(c).variants.length === 0 && (TEXT_SIZE.test(split(c).util) || WEIGHT.test(split(c).util)));
  return { id, tag, sites: sites.map(s => s.at), common: derived.base,
    axes: derived.axes.map(a => ({ id: a.id, categories: a.categories, default: a.default, values: a.values })),
    text: text.length ? mostFrequent(text) : null,
    needsText: !text.length && styled, open, ...(problems.length && { problems }) };
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
 * - `families` [{key, tag, groups, description, grid, text, names, derived, sites: [{file, path, line}]}], `used` their keys;
 * - `requests` the groups with a judgement still open (each with the `open` keys it still needs; nothing is built until none is open); `skipped` [{site, tag, reason}] the className
 *   expressions the script could not resolve;
 * - `map` the Family map: each family's member sites, by file and JSX path.
 * Nothing is written.
 */
export function extract({ project, answers = {} }) {
  const ts = loadTypescript();
  const skipped = [];
  let sites = [];
  for (const abs of sourceFiles(project)) {
    if (!['.tsx', '.jsx'].includes(extname(abs)) || abs.endsWith('.d.ts')) continue;
    const file = relative(project, abs);
    const read = readFile(ts, file, readFileSync(abs, 'utf8'));
    skipped.push(...read.skipped);
    for (const site of read.sites) {
      try { sites.push(prepare(site)); } catch (e) { if (!(e instanceof Unresolved)) throw e; skipped.push({ site: site.at, tag: site.tag, reason: e.message }); }
    }
  }

  const groups = new Map();
  for (const s of sites.filter(s => s.candidate)) {
    const id = groupId(s);
    groups.set(id, [...(groups.get(id) || []), s]);
  }
  for (const [id, list] of groups) if (list.length < 2 && !list.some(s => s.ternary)) groups.delete(id);
  const ids = sorted([...groups.keys()]);
  // What the library needs is checked before any request is written, so the agent never answers for a run that cannot finish.
  if (ids.length) { cssEntry(project); prototypeLock(project); }

  // Group the groups into families by the agent's names.
  const given = answers.groups || {};
  const requests = [];
  const families = new Map(); // key -> [group ids]
  for (const id of ids) {
    const a = given[id];
    const sitesOf = groups.get(id);
    if (a === undefined || a.family === undefined) {
      const derived = deriveAxes(sitesOf);
      requests.push(requestOf(id, sitesOf[0].tag, sitesOf, derived, ['family', ...missing({ axes: {} }, '', derived).open], []));
    } else if (a.family !== null) {
      if (!FAMILY_KEY.test(a.family)) requests.push({ ...requestOf(id, sitesOf[0].tag, sitesOf, deriveAxes(sitesOf), ['family'], []), problems: [`family "${a.family}" is not a lower-case key`] });
      else families.set(a.family, [...(families.get(a.family) || []), id]);
    }
  }

  const built = [];
  for (const [key, members] of families) {
    const memberSites = members.flatMap(id => groups.get(id));
    const tags = unique(memberSites.map(s => s.tag));
    const derived = deriveAxes(memberSites);
    // The family's answers: the first group that gives each one.
    const merged = { axes: {}, description: undefined, grid: undefined, text: undefined };
    for (const id of members) {
      const a = given[id];
      merged.description = merged.description || a.description;
      merged.grid = merged.grid || a.grid;
      merged.text = merged.text || a.text;
      for (const [axisId, axis] of Object.entries(a.axes || {})) {
        const m = merged.axes[axisId] = merged.axes[axisId] || { values: {} };
        m.key = m.key || axis.key; m.label = m.label || axis.label;
        for (const [vid, v] of Object.entries(axis.values || {})) m.values[vid] = m.values[vid] || v;
      }
    }
    const { open, problems } = missing(merged, key, derived);
    if (tags.length > 1) problems.push(`family ${key} merges groups of different tags (${tags.join(', ')})`);
    const text = memberSites.map(s => s.text).filter(Boolean);
    if (!text.length && merged.text === undefined) {
      const probe = requestOf(members[0], tags[0], memberSites, derived, [], []);
      if (probe.needsText) open.push('text');
    }
    if (open.length || problems.length) requests.push(requestOf(members[0], tags[0], memberSites, derived, open, problems));
    else built.push({ key, members, memberSites, derived, merged, tag: tags[0] });
  }

  if (requests.length || !built.length) return { library: {}, families: [], used: [], requests, skipped, map: null };

  const library = {};
  const familyList = [];
  for (const f of built.sort((a, b) => byKey(a.key, b.key))) {
    const names = Object.fromEntries(f.derived.axes.map(a => [a.id, { key: f.merged.axes[a.id].key, label: f.merged.axes[a.id].label,
      values: Object.fromEntries(a.values.map(v => [v.id, f.merged.axes[a.id].values[v.id]])) }]));
    library[`components/ui/${f.key}.tsx`] = componentFile(f.key, f.tag, f.derived, names);
    const texts = f.memberSites.map(s => s.text).filter(Boolean);
    const text = texts.length ? mostFrequent(texts) : f.merged.text;
    familyList.push({ key: f.key, tag: f.tag, groups: f.members, description: f.merged.description, grid: f.merged.grid, text, names,
      sites: f.memberSites.map(s => ({ file: s.file, path: s.path, line: s.line })), derived: f.derived });
  }
  const entry = cssEntry(project);
  const sheets = stylesheets(project, entry);
  const manifest = readJson(join(project, 'package.json'));
  library['components.json'] = `${JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json', tailwind: { css: entry }, aliases: { ui: '@/components/ui', utils: '@/lib/utils' } }, null, 2)}\n`;
  Object.assign(library, sheets);
  library['package-lock.json'] = lockfile(project, String(manifest.name || 'prototype').replace(/^@[^/]+\//, ''));

  const map = { version: 1, families: Object.fromEntries(familyList.map(f => [f.key, {
    by: 'agent',
    evidence: f.groups.map(g => `group ${g}: ${f.tag}, ${f.sites.length} site${f.sites.length === 1 ? '' : 's'}`),
    fingerprint: `sha256:${sha256(f.derived.base.join(' ') + JSON.stringify(f.derived.axes.map(a => [a.id, a.values.map(v => v.id)])))}`,
    sites: f.sites.map(({ file, path }) => ({ file, path })),
  }])) };
  return { library, families: familyList, used: familyList.map(f => f.key), requests: [], skipped, map };
}
