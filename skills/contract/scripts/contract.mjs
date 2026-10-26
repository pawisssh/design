// Shared Contract module (#24): the only implementation of validate, expand, match/resolve,
// token closure, apply-omit and contentHash for a Contract (component.json, schemaVersion 1).
//
// Pure, synchronous, dependency-free JavaScript. It uses no node, browser or Figma API, so the
// builder core and the To-preview page can inline it as is. File reading lives in check.mjs.
// Syntax stays at ES2019 plus `export` (no `?.`, `??`, `??=`) so the Figma plugin sandbox accepts it.

/** True when `tuple` matches `pattern`: an array is any-of, a missing axis matches all. */
export function matches(pattern, tuple) {
  return Object.entries(pattern || {}).every(([axis, want]) =>
    (Array.isArray(want) ? want : [want]).includes(tuple[axis]));
}

/** The selected tuples, in axis order: cartesian product of `axes` − `excluded` − `selection.omit`. */
export function expand(contract) {
  let tuples = [{}];
  for (const axis of contract.axes)
    tuples = tuples.flatMap(t => axis.values.map(v => ({ ...t, [axis.key]: v.key })));
  const hit = list => t => (list || []).some(p => matches(p.match, t));
  return tuples.filter(t => !hit(contract.excluded)(t) && !hit(contract.selection.omit)(t));
}

/** The Base Component tuple: every axis at its `default`. */
export function baseTuple(contract) {
  return Object.fromEntries(contract.axes.map(a => [a.key, a.default]));
}

/**
 * A tuple's code props for a preview renderer: `{tuple, props}`, the tuple with each missing axis at its default and
 * the props its axis values' `code` set, in axis order. Throws on an unknown value.
 */
export function codeProps(contract, tuple) {
  const full = {};
  const props = {};
  for (const axis of contract.axes) {
    full[axis.key] = tuple[axis.key] === undefined ? axis.default : tuple[axis.key];
    const value = axis.values.find(v => v.key === full[axis.key]);
    if (!value) throw new Error(`unknown ${axis.key} value ${full[axis.key]}`);
    Object.assign(props, value.code || {});
  }
  return { tuple: full, props };
}

/**
 * The content props a preview renderer gives the component: `{props, children, value}`, from each property's `code`.
 * The specimen (`properties` undefined) shows TEXT defaults and the default icon (non-default BOOLEANs on), so the icon
 * slot is reviewed too. A usage takes each property from `properties` by key, else its Contract default: a BOOLEAN that
 * gates a swap (`visibleWhen`) hides it when false, and `whenFalse: "omit"` drops the prop. `icon(value)` gives the
 * prop for an INSTANCE_SWAP with `valueFrom: "icon"` (`icon:default`, `icon:save`). `value(property)` is the value used.
 */
export function contentProps(contract, properties, icon) {
  const specimen = properties === undefined;
  const value = p => (specimen ? (p.type === 'BOOLEAN' ? !p.default : p.default) : p.key in properties ? properties[p.key] : p.default);
  const props = {};
  let children;
  const swapProps = contract.properties.filter(p => p.type === 'INSTANCE_SWAP' && p.code && p.code.prop).map(p => p.code.prop);
  for (const p of contract.properties) {
    const code = p.code || {};
    if (!code.prop) continue;
    const v = value(p);
    if (p.type === 'TEXT') {
      if (code.prop === 'children') children = v;
      else props[code.prop] = v;
    } else if (p.type === 'INSTANCE_SWAP' && code.valueFrom === 'icon') {
      const gate = code.visibleWhen && contract.properties.find(x => x.key === code.visibleWhen);
      if ((specimen || !gate || value(gate)) && v) props[code.prop] = icon(v);
    } else if (p.type === 'BOOLEAN' && swapProps.indexOf(code.prop) < 0) {
      if (v || code.whenFalse !== 'omit') props[code.prop] = v;
    }
  }
  return { props, children, value };
}

const SECTIONS = ['layout', 'paint'];
// A copy of plain JSON data, as a JSON round trip gives it but without the text in between (resolve copies per tuple):
// an undefined, function or symbol drops out of an object and is null in an array, as is a number that is not finite;
// -0 is 0.
function clone(v) {
  if (typeof v === 'number') return isFinite(v) ? (v === 0 ? 0 : v) : null;
  if (typeof v === 'function' || typeof v === 'symbol') return undefined;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) { const c = clone(v[i]); out.push(c === undefined ? null : c); }
    return out;
  }
  const out = {};
  for (const k of Object.keys(v)) {
    const c = clone(v[k]);
    if (c === undefined) continue;
    // a "__proto__" key is a field, as JSON.parse makes it, not the prototype
    if (k === '__proto__') Object.defineProperty(out, k, { value: c, enumerable: true, writable: true, configurable: true });
    else out[k] = c;
  }
  return out;
}
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Resolve one tuple: apply every matching `layout` and `paint` rule in order (later wins per field),
 * then replace each `{sameAs: "Node.field"}` with that node's resolved value in the same section.
 * Returns {layout, paint, from, binds}:
 * - layout / paint: {node: {field: value}}, values as written in the Contract (a copy), `by`/`was` kept;
 * - from: {"layout.Button.gap": ruleIndex}, the rule that last set each field (where an in-place edit lands);
 * - binds: {propertyKey: [{node, field}]}, the property binds whose `match` covers the tuple.
 */
export function resolve(contract, tuple) {
  const out = { layout: {}, paint: {}, from: {}, binds: {} };
  for (const section of SECTIONS)
    (contract[section] || []).forEach((rule, i) => {
      if (!matches(rule.match, tuple)) return;
      for (const [node, fields] of Object.entries(rule.set || {}))
        for (const [field, value] of Object.entries(fields)) {
          if (!out[section][node]) out[section][node] = {};
          out[section][node][field] = value;
          out.from[`${section}.${node}.${field}`] = i;
        }
    });
  const resolved = clone({ layout: out.layout, paint: out.paint });
  for (const section of SECTIONS) {
    const nodes = resolved[section];
    for (const fields of Object.values(nodes))
      for (const [field, value] of Object.entries(fields)) {
        let v = value;
        for (let hops = 0; isObj(v) && typeof v.sameAs === 'string' && hops < 8; hops++) {
          const [n, f] = splitRef(v.sameAs);
          v = nodes[n] && nodes[n][f];
        }
        if (v !== value && v !== undefined && !(isObj(v) && 'sameAs' in v)) fields[field] = clone(v);
      }
  }
  out.layout = resolved.layout;
  out.paint = resolved.paint;
  for (const p of contract.properties || [])
    out.binds[p.key] = (p.binds || []).filter(b => matches(b.match, tuple)).map(b => ({ node: b.node, field: b.field }));
  return out;
}

// "Glyph/Vector.fill" -> ["Glyph/Vector", "fill"]: the field is after the last dot.
function splitRef(ref) {
  const i = ref.lastIndexOf('.');
  return [ref.slice(0, i), ref.slice(i + 1)];
}

/**
 * The token closure: the sorted token names (variables and Text Styles) that the selected variants
 * resolve to, after `sameAs`. History under `was` is not a live value and is skipped.
 */
export function closure(contract) {
  const tokens = new Set();
  forEachUse(contract, use => { if (use.ref.token !== undefined) tokens.add(use.ref.token); });
  return [...tokens].sort();
}

/** A Foundations document's `closure.contracts`: each Contract's family, path and snapshotId, by family. */
export function closureContracts(contracts) {
  return contracts.map(({ path, contract }) => ({ family: contract.family.key, path, snapshotId: contract.source.snapshotId }))
    .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0));
}

// Calls fn({tuple, section, node, field, key, path, ref}) for every value reference ({token} or {raw})
// that a selected variant resolves to, including those nested in effects. Skips `was`. `path` names
// the rule that set the field ("paint[1].Button.fill"); `key` is set for a nested reference ("color").
function forEachUse(contract, fn) {
  for (const tuple of expand(contract)) {
    const r = resolve(contract, tuple);
    for (const section of SECTIONS)
      for (const [node, fields] of Object.entries(r[section]))
        for (const [field, value] of Object.entries(fields))
          walkRefs(value, `${section}[${r.from[`${section}.${node}.${field}`]}].${node}.${field}`, (ref, path, key) =>
            fn({ tuple, section, node, field, key, path, ref }));
  }
}

// Finds {token} and {raw} objects in a value; `key` is the innermost property name ("color", "spread").
function walkRefs(value, path, fn, key) {
  if (Array.isArray(value)) value.forEach((v, i) => walkRefs(v, `${path}[${i}]`, fn, key));
  else if (isObj(value)) {
    if ('token' in value || 'raw' in value) fn(value, path, key);
    for (const [k, v] of Object.entries(value)) if (k !== 'was') walkRefs(v, `${path}.${k}`, fn, k);
  }
}

/**
 * The icon list: the icon keys the builder makes atoms for, `icons.default` then `icons.preferred`, then every
 * fixed `icon:<key>` an INSTANCE names (a form control's status icons, #93), each once.
 */
export function icons(contract) {
  const i = contract.icons;
  if (!i) return [];
  const fixed = [contract, ...(contract.subComponents || [])]
    .flatMap(c => Object.values(anatomyIndex(c)))
    .map(n => /^icon:(.+)$/.exec(n.instanceOf || ''))
    .filter(m => m && m[1] !== 'default')
    .map(m => m[1]);
  return [i.default].concat(i.preferred || [], fixed).filter((k, n, all) => k && all.indexOf(k) === n);
}

/** Kit-style Figma name of an icon key: first letter capitalised, `--` and camelCase kept (`arrow--right` -> `Arrow--right`, `forwardArrow` -> `ForwardArrow`). */
export function iconName(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** A tuple's key: its value keys in axis order, joined by "|" ("primary|lg|enabled"). For comparing tuples only. */
export function tupleKey(contract, tuple) {
  return contract.axes.map(a => tuple[a.key]).join('|');
}

/** Figma variant name, `Prop=Value, …` with axis and value labels. */
export function variantName(contract, tuple) {
  return contract.axes
    .map(a => `${a.label}=${(a.values.find(v => v.key === tuple[a.key]) || { label: tuple[a.key] }).label}`)
    .join(', ');
}

// ---------- validate ----------

// Required fields per anatomy node type. On top of these, a field that any rule sets for a node is
// required for that node in every selected variant, so the builder never falls back to a Figma default.
const REQUIRED = {
  COMPONENT: { layout: ['direction', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap'], paint: ['fill', 'stroke'] },
  TEXT: { layout: ['textStyle'], paint: ['fill'] },
  FRAME: { layout: ['width', 'height'], paint: [] },
  INSTANCE: { layout: [], paint: [] },
};

// The Figma VariableScope a bound variable needs, per Contract field (validation rule 6). Figma has no
// PADDING scope, so padding binds under GAP (#27). `fill` depends on the node (see fillScope).
const FIELD_SCOPE = {
  paddingTop: 'GAP', paddingRight: 'GAP', paddingBottom: 'GAP', paddingLeft: 'GAP', gap: 'GAP',
  width: 'WIDTH_HEIGHT', height: 'WIDTH_HEIGHT', minWidth: 'WIDTH_HEIGHT', maxWidth: 'WIDTH_HEIGHT',
  minHeight: 'WIDTH_HEIGHT', maxHeight: 'WIDTH_HEIGHT', radius: 'CORNER_RADIUS', strokeWeight: 'STROKE_FLOAT',
  stroke: 'STROKE_COLOR', opacity: 'OPACITY',
  color: 'EFFECT_COLOR', spread: 'EFFECT_FLOAT', blur: 'EFFECT_FLOAT', x: 'EFFECT_FLOAT', y: 'EFFECT_FLOAT',
};
const FILLS = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'];
/** Whether a variable's `scopes` cover the scope `need` (ALL_SCOPES covers all, ALL_FILLS every fill). */
export const coversScope = (scopes, need) =>
  scopes.includes(need) || scopes.includes('ALL_SCOPES') || (scopes.includes('ALL_FILLS') && FILLS.includes(need));

/**
 * The VariableScope a token bound at `node.field` needs (rule 6), or undefined when the field cannot bind a
 * variable. `key` names a reference nested in the field, such as an effect's "color" or "spread".
 */
export function scopeFor(contract, node, field, key) {
  return key === undefined && field === 'fill' ? fillScope(anatomyIndex(contract), node) : FIELD_SCOPE[key || field];
}

// Anatomy nodes by name.
function anatomyIndex(contract) {
  const anatomy = {};
  (function walk(n) { anatomy[n.name] = n; (n.children || []).forEach(walk); })(contract.anatomy);
  return anatomy;
}

/**
 * Validate a Contract against the foundations document of its Design System.
 * Returns {ok, errors: [{rule, at, message}]}; `rule` is the number in contract-schema.md#validation,
 * or "schema" for a structural error (then the numbered rules are skipped).
 */
export function validate(contract, foundations) {
  const errors = [];
  const err = (rule, at, message) => errors.push({ rule, at, message });

  checkShape(contract, err);
  if (!isObj(foundations) || !isObj(foundations.variables) || !isObj(foundations.textStyles))
    err('schema', 'foundations', 'a foundations document with `variables` and `textStyles` is required (rule 6)');
  if (errors.length) return { ok: false, errors };

  const c = contract;
  // 1. keys and labels
  if (c.schemaVersion !== 1) err(1, 'schemaVersion', `unknown schemaVersion ${JSON.stringify(c.schemaVersion)}; this module reads 1`);
  checkKeys(c, err);

  // 3. patterns, rule nodes and bind nodes
  const domain = checkPatterns(c, err);
  checkCode(c, err);
  if (errors.length) return { ok: false, errors }; // rules 2, 4, 5 and 6 expand, which needs valid patterns

  // 2. defaults and the Base Component
  const selected = expand(c);
  checkDefaults(c, domain, err);
  const base = baseTuple(c);
  if (!selected.some(t => c.axes.every(a => t[a.key] === base[a.key])))
    err(2, 'selection', `the Base Component (${variantName(c, base)}) is not selected`);

  // 4. checksum
  if (selected.length !== c.selection.expectedCount)
    err(4, 'selection.expectedCount', `expansion gives ${selected.length} variants but expectedCount is ${c.selection.expectedCount}`);

  // 5. every selected variant resolves every required field and gets exactly one bind per property
  const anatomy = anatomyIndex(c);
  const required = { layout: {}, paint: {} };
  for (const [name, node] of Object.entries(anatomy))
    for (const section of SECTIONS) required[section][name] = new Set((REQUIRED[node.type] || REQUIRED.INSTANCE)[section]);
  for (const section of SECTIONS)
    for (const rule of c[section])
      for (const [node, fields] of Object.entries(rule.set || {}))
        for (const field of Object.keys(fields)) {
          if (!required[section][node]) required[section][node] = new Set();
          required[section][node].add(field);
        }
  const gaps = {}; // problem text -> {at, tuples}, so one problem is reported once with its variant count
  const gap = (at, problem, t) => { (gaps[problem] = gaps[problem] || { at, tuples: [] }).tuples.push(t); };
  const slotAxes = c.axes.filter(a => a.slot !== undefined);
  for (const t of selected) {
    const r = resolve(c, t);
    // A Slot axis's node shows exactly where the tuple fills it (#121).
    for (const a of slotAxes) {
      const { filled } = a.values.find(v => v.key === t[a.key]);
      const shown = r.layout[a.slot] && r.layout[a.slot].visible;
      if (shown !== filled) gap(`layout ${a.slot}.visible`, `layout ${a.slot}.visible must be ${filled} where ${a.key} is ${t[a.key]}`, t);
    }
    for (const section of SECTIONS)
      for (const [node, fields] of Object.entries(required[section]))
        for (const field of fields) {
          const at = `${section} ${node}.${field}`;
          const v = r[section][node] && r[section][node][field];
          if (v === undefined) gap(at, `${at} is unresolved`, t);
          else if (isObj(v) && 'sameAs' in v) gap(at, `${at} sameAs "${v.sameAs}" does not resolve`, t);
        }
    for (const p of c.properties) {
      if (r.binds[p.key].length !== 1)
        gap(`properties.${p.key}.binds`, `property ${p.key} has ${r.binds[p.key].length} binds (needs exactly 1)`, t);
      // One owner per node's visibility: a `visible` rule or a BOOLEAN property, never both (#93).
      for (const b of r.binds[p.key])
        if (b.field === 'visible' && r.layout[b.node] && 'visible' in r.layout[b.node])
          gap(`properties.${p.key}.binds`, `${b.node}.visible is set by a rule and bound to property ${p.key}`, t);
    }
  }
  for (const [problem, { at, tuples }] of Object.entries(gaps))
    err(5, at, `${problem} in ${tuples.length} selected variant${tuples.length === 1 ? '' : 's'}, e.g. ${variantName(c, tuples[0])}`);

  // 6. raw values carry level and reason; tokens exist and are used inside their variable's scopes
  checkTokens(c, foundations, err);

  // 7. instance targets
  checkInstances(c, err, key => c.dependencies.families.some(f => f.key === key));

  // 8. selection status and approval
  checkApproval(c, err);

  // 9. the drafted side table
  checkDrafted(c, err);

  return { ok: errors.length === 0, errors };
}

// Rule 1 (keys and labels, without schemaVersion), shared by validate and validateProposal.
function checkKeys(c, err) {
  dupes(c.axes.map(a => a.key)).forEach(k => err(1, 'axes', `duplicate axis key "${k}"`));
  dupes((c.properties || []).map(p => p.key)).forEach(k => err(1, 'properties', `duplicate property key "${k}"`));
  for (const a of c.axes) {
    dupes(a.values.map(v => v.key)).forEach(k => err(1, `axes.${a.key}`, `duplicate value key "${k}"`));
    dupes(a.values.map(v => v.label)).forEach(l => err(1, `axes.${a.key}`, `duplicate value label "${l}"`));
    for (const v of a.values) {
      if (/[=,]/.test(v.label)) err(1, `axes.${a.key}.${v.key}`, `label "${v.label}" contains "=" or ","`);
      if (/(^|\s)[^\sA-Za-z0-9]*[a-z]/.test(v.label)) err(1, `axes.${a.key}.${v.key}`, `label "${v.label}" is not Title Case`);
    }
  }
}

// Rule 3 (patterns, rule nodes and bind nodes). Returns the axis domain {axisKey: [valueKey]}.
function checkPatterns(c, err) {
  const domain = Object.fromEntries(c.axes.map(a => [a.key, a.values.map(v => v.key)]));
  const checkPattern = (pattern, at) => {
    if (!isObj(pattern)) return err(3, at, 'match must be an object');
    for (const [axis, want] of Object.entries(pattern)) {
      if (!domain[axis]) { err(3, at, `unknown axis "${axis}"`); continue; }
      for (const v of Array.isArray(want) ? want : [want])
        if (!domain[axis].includes(v)) err(3, at, `unknown ${axis} value "${v}"`);
    }
  };
  (c.excluded || []).forEach((e, i) => {
    checkPattern(e.match, `excluded[${i}].match`);
    if (!e.reason || !e.evidence || (Array.isArray(e.evidence) && !e.evidence.length))
      err(3, `excluded[${i}]`, 'an exclusion needs `reason` and `evidence`');
  });
  (c.selection ? c.selection.omit : []).forEach((o, i) => checkPattern(o.match, `selection.omit[${i}].match`));
  const anatomy = anatomyIndex(c);
  const nodeKnown = name => !!anatomy[name] ||
    (name.includes('/') && anatomy[name.split('/')[0]] && anatomy[name.split('/')[0]].type === 'INSTANCE');
  for (const section of SECTIONS)
    (c[section] || []).forEach((rule, i) => {
      checkPattern(rule.match, `${section}[${i}].match`);
      for (const [node, fields] of Object.entries(rule.set || {})) {
        if (!nodeKnown(node)) err(3, `${section}[${i}].set`, `unknown anatomy node "${node}"`);
        // `visible` (#93): a layout field that shows or hides an anatomy node below the root.
        if (!isObj(fields) || !('visible' in fields)) continue;
        const at = `${section}[${i}].set`;
        if (section !== 'layout') err(3, at, `"${node}": \`visible\` is a layout field, not a ${section} field`);
        else if (typeof fields.visible !== 'boolean') err(3, at, `"${node}": \`visible\` is true or false, not ${JSON.stringify(fields.visible)}`);
        else if (node === c.anatomy.name) err(3, at, `"${node}" is the root, which cannot be hidden`);
        else if (!anatomy[node]) err(3, at, `"${node}": \`visible\` is set on anatomy nodes only`);
      }
    });
  (c.properties || []).forEach(p => (p.binds || []).forEach((b, i) => {
    if (b.match) checkPattern(b.match, `properties.${p.key}.binds[${i}].match`);
    if (!anatomy[b.node]) err(3, `properties.${p.key}.binds[${i}]`, `unknown anatomy node "${b.node}"`);
  }));
  // A Slot axis (#121, ADR 0011) names a non-root anatomy node; one value fills the slot and one leaves it empty.
  for (const a of c.axes) {
    const at = `axes.${a.key}`;
    if (a.slot === undefined) {
      if (a.values.some(v => 'filled' in v)) err(3, at, `\`filled\` is for a Slot axis, and ${a.key} names no \`slot\``);
      continue;
    }
    if (!anatomy[a.slot] || a.slot === c.anatomy.name) err(3, `${at}.slot`, `slot "${a.slot}" is not a non-root anatomy node`);
    if (a.canonical) err(3, at, `${a.key} is canonical; a Slot axis never is`);
    if (a.values.some(v => typeof v.filled !== 'boolean')) err(3, at, 'every value of a Slot axis says whether it is `filled` (true or false)');
    else if (a.values.length !== 2 || a.values.filter(v => v.filled).length !== 1) err(3, at, 'a Slot axis needs one filled and one empty value');
  }
  // An INSTANCE_SWAP whose node a Slot axis shows and hides says so in `code.visibleWhen: {axis}` (a string there
  // names the BOOLEAN that shows it instead).
  for (const p of c.properties || []) {
    const when = p.code && p.code.visibleWhen;
    if (!isObj(when)) continue;
    const at = `properties.${p.key}.code.visibleWhen`;
    const axis = c.axes.find(a => a.key === when.axis && a.slot !== undefined);
    if (!axis) err(3, at, `visibleWhen names ${JSON.stringify(when.axis)}, which is not a Slot axis`);
    else (p.binds || []).filter(b => b.node !== axis.slot)
      .forEach(b => err(3, at, `Slot axis ${axis.key} shows "${axis.slot}", not "${b.node}"`));
  }
  return domain;
}

// Rule 3 for `code`: `code.required` names props nothing else sets; `code.items` names a Repeated child, and a
// TEXT property with `code.itemProp` shows one prop of the shown child (#93, ADR 0013).
function checkCode(c, err) {
  const code = c.code;
  const setProps = new Set([
    ...c.axes.flatMap(a => a.values.flatMap(v => Object.keys(isObj(v.code) ? v.code : {}))),
    ...c.properties.map(p => p.code && p.code.prop).filter(Boolean),
  ]);
  if (code.required !== undefined) {
    if (!Array.isArray(code.required) || code.required.some(r => typeof r !== 'string')) err(3, 'code.required', '`code.required` is a list of prop names');
    else code.required.filter(r => setProps.has(r)).forEach(r => err(3, 'code.required', `required prop "${r}" is already set by an axis value or a property`));
  }
  const items = code.items;
  if (items !== undefined && (!isObj(items) || typeof items.component !== 'string' || !Array.isArray(items.props) || !items.props.length))
    err(3, 'code.items', '`code.items` needs `component` and a non-empty `props` list');
  for (const p of c.properties) {
    const ip = p.code && p.code.itemProp;
    if (ip === undefined) continue;
    const at = `properties.${p.key}.code.itemProp`;
    if (p.type !== 'TEXT') err(3, at, 'only a TEXT property can show a Repeated child prop');
    else if (!isObj(items) || !Array.isArray(items.props) || !items.props.includes(ip)) err(3, at, `"${ip}" is not one of code.items.props`);
  }
  // A TEXT property with `code.child` is the text of a child component (CardTitle), or with `childProp` one of its
  // props (SelectValue's placeholder): not a prop of the component itself (#166).
  for (const p of c.properties) {
    if (p.type !== 'TEXT' || !isObj(p.code) || p.code.child === undefined) continue;
    const at = `properties.${p.key}.code`;
    if (typeof p.code.child !== 'string' || !p.code.child) err(3, `${at}.child`, '`code.child` names the child component');
    if (p.code.childProp !== undefined && (typeof p.code.childProp !== 'string' || !p.code.childProp)) err(3, `${at}.childProp`, '`code.childProp` names one prop of the child');
    if (p.code.prop !== undefined || p.code.itemProp !== undefined) err(3, at, 'a TEXT property is `code.prop`, `code.itemProp` or `code.child`, not two of them');
  }
}

// Rule 2's first half: every axis default is one of its values.
function checkDefaults(c, domain, err) {
  for (const a of c.axes)
    if (!domain[a.key].includes(a.default)) err(2, `axes.${a.key}.default`, `default "${a.default}" is not a value of ${a.key}`);
}

// Rule 6. `extra(variable, token, path)` returns a further problem for a token use, or undefined.
function checkTokens(c, foundations, err, extra) {
  for (const section of SECTIONS)
    (c[section] || []).forEach((rule, i) => {
      for (const [node, fields] of Object.entries(rule.set || {}))
        for (const [field, value] of Object.entries(fields))
          walkRefs(value, `${section}[${i}].${node}.${field}`, (ref, path) => {
            if ('raw' in ref && (!['info', 'warning'].includes(ref.level) || !ref.reason))
              err(6, path, `the raw value at ${path} needs \`level\` (info or warning) and \`reason\``);
          });
    });
  const seen = new Set();
  forEachUse(c, ({ node, field, key, path, ref }) => {
    if (ref.token === undefined) return;
    const t = ref.token;
    let problem;
    if (field === 'textStyle') {
      if (!foundations.textStyles[t]) problem = `text style "${t}" is not in the foundations textStyles`;
    } else if (!foundations.variables[t]) {
      problem = `token "${t}" is not a variable in the foundations document`;
    } else {
      // `key` is set for a reference nested in a field (an effect's color or spread)
      const need = scopeFor(c, node, field, key);
      const scopes = foundations.variables[t].scopes || [];
      if (!need) problem = `${path} cannot bind a variable (token "${t}")`;
      else if (!coversScope(scopes, need))
        problem = `token "${t}" is used as ${need} at ${path} but its variable is scoped [${scopes.join(', ')}]`;
      else if (extra) problem = extra(foundations.variables[t], t, path);
    }
    if (problem && !seen.has(problem)) { seen.add(problem); err(6, path, problem); }
  });
}

// Rule 7. `familyKnown(key)` says whether a `family:<key>` instance target is declared.
function checkInstances(c, err, familyKnown) {
  const anatomy = anatomyIndex(c);
  const icons = c.icons;
  for (const n of Object.values(anatomy)) {
    const to = n.instanceOf;
    if (!to) continue;
    const [kind, name] = [to.slice(0, to.indexOf(':')), to.slice(to.indexOf(':') + 1)];
    const ok = kind === 'icon' ? !!(icons && icons.default)
      : kind === 'family' ? familyKnown(name)
      : kind === 'sub' ? (c.subComponents || []).some(s => s.name === name) : false;
    if (!ok) err(7, `anatomy.${n.name}.instanceOf`, `instance target "${to}" is not declared`);
  }
  if (icons && Array.isArray(icons.preferred) && !icons.preferred.includes(icons.default))
    err(7, 'icons.default', `default icon "${icons.default}" is not in icons.preferred`);
}

// A fill binds TEXT_FILL on a TEXT node, SHAPE_FILL on a vector inside an instance ("Glyph/Vector"),
// and FRAME_FILL on a frame or component.
function fillScope(anatomy, node) {
  if (node.includes('/')) return 'SHAPE_FILL';
  return anatomy[node] && anatomy[node].type === 'TEXT' ? 'TEXT_FILL' : 'FRAME_FILL';
}

function checkApproval(c, err) {
  const { status, approval } = c.selection;
  if (status === 'draft') {
    if (approval !== null) err(8, 'selection.approval', 'a draft Contract has `approval: null`');
    return;
  }
  if (status !== 'approved') return err(8, 'selection.status', `status must be "draft" or "approved", not ${JSON.stringify(status)}`);
  if (!isObj(approval)) return err(8, 'selection.approval', 'an approved Contract needs an approval {by, at, snapshotId, contentHash}');
  if (approval.by !== 'owner') err(8, 'selection.approval.by', `only the owner approves (by: "owner"), not ${JSON.stringify(approval.by)}`);
  if (typeof approval.at !== 'string' || !approval.at) err(8, 'selection.approval.at', 'approval.at must be an ISO time');
  for (const n of blockingNotes(c))
    err(8, 'notes', `the warning note at ${n.at} blocks approval (an uncarried owner tweak): ${n.message}`);
  if (approval.snapshotId !== c.source.snapshotId)
    err(8, 'selection.approval.snapshotId', `approval.snapshotId ${approval.snapshotId} does not match source.snapshotId ${c.source.snapshotId}: the source moved since approval`);
  const hash = contentHash(c);
  if (approval.contentHash !== hash)
    err(8, 'selection.approval.contentHash', `approval.contentHash ${approval.contentHash} does not match the Contract's ${hash}: the Contract changed since approval`);
}

const dupes = list => [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];

// Structural checks that the numbered rules rely on; contract.schema.json is the full formal schema.
const TOP_LEVEL = {
  schemaVersion: 'number', family: 'object', source: 'object', axes: 'array', excluded: 'array',
  selection: 'object', anatomy: 'object', properties: 'array', layout: 'array', paint: 'array',
  subComponents: 'array', dependencies: 'object', figma: 'object', code: 'object',
};
function checkShape(c, err) {
  const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (!isObj(c)) return err('schema', '', 'a Contract is a JSON object');
  for (const [key, type] of Object.entries(TOP_LEVEL))
    if (typeOf(c[key]) !== type) err('schema', key, `\`${key}\` is required and must be ${type === 'array' ? 'an' : 'a'} ${type}`);
  if (isObj(c.source) && typeof c.source.snapshotId !== 'string') err('schema', 'source.snapshotId', '`source.snapshotId` is required');
  if (isObj(c.selection)) {
    if (!Array.isArray(c.selection.omit)) err('schema', 'selection.omit', '`selection.omit` is required and must be an array');
    if (!Number.isInteger(c.selection.expectedCount)) err('schema', 'selection.expectedCount', '`selection.expectedCount` is required and must be an integer');
    if (!('approval' in c.selection)) err('schema', 'selection.approval', '`selection.approval` is required (null when draft)');
    if (!('status' in c.selection)) err('schema', 'selection.status', '`selection.status` is required');
  }
  if (isObj(c.dependencies) && !Array.isArray(c.dependencies.families)) err('schema', 'dependencies.families', '`dependencies.families` is required and must be an array');
  (Array.isArray(c.axes) ? c.axes : []).forEach((a, i) => {
    if (!isObj(a) || typeof a.key !== 'string' || typeof a.label !== 'string' || !Array.isArray(a.values) || !a.values.length
      || !('default' in a) || typeof a.defaultSource !== 'string')
      err('schema', `axes[${i}]`, 'an axis needs `key`, `label`, `default`, `defaultSource` and non-empty `values`');
    else a.values.forEach((v, j) => {
      if (!isObj(v) || typeof v.key !== 'string' || typeof v.label !== 'string') err('schema', `axes[${i}].values[${j}]`, 'a value needs `key` and `label`');
    });
  });
  (Array.isArray(c.properties) ? c.properties : []).forEach((p, i) => {
    if (!isObj(p) || typeof p.key !== 'string' || !['TEXT', 'BOOLEAN', 'INSTANCE_SWAP'].includes(p.type) || !Array.isArray(p.binds))
      err('schema', `properties[${i}]`, 'a property needs `key`, `type` (TEXT, BOOLEAN or INSTANCE_SWAP) and `binds`');
  });
  for (const section of SECTIONS)
    (Array.isArray(c[section]) ? c[section] : []).forEach((r, i) => {
      if (!isObj(r) || !isObj(r.match) || !isObj(r.set)) err('schema', `${section}[${i}]`, 'a rule is {match, set}');
    });
  if (isObj(c.anatomy) && (typeof c.anatomy.name !== 'string' || typeof c.anatomy.type !== 'string'))
    err('schema', 'anatomy', 'the anatomy root needs `name` and `type`');
}

// ---------- Component Proposal (#60, #80): a family the Code Library does not ship ----------

const PROPOSAL_REQUIRED = { schemaVersion: 'number', family: 'object', proposal: 'object', axes: 'array', anatomy: 'object' };
const PROPOSAL_OPTIONAL = { properties: 'array', layout: 'array', paint: 'array', icons: 'object', subComponents: 'array', dependencies: 'object', notes: 'array', retirement: 'object', built: 'object' };
const PROPOSAL_FORBIDDEN = ['source', 'code', 'selection', 'excluded', 'figma'];

/**
 * Validate a Component Proposal against the foundations document and the Design System's other files.
 * `known` is {contracts: [Contract], proposals: [Proposal]} (an array is read as `contracts`); checks that need
 * them are skipped when they are not given. Rules 1, 2 (defaults only), 3, 6 and 7 are the Contract's; rules
 * 4 and 5 do not apply. Further rules: "schema" (required, optional and forbidden blocks), 6 also refuses
 * component tokens and Primitives, 7 lets `family:<key>` name a Contract or a Proposal, "cycle", "considered",
 * 8 (status and approval), "retirement" and "built".
 * Returns {ok, errors, readyToRetire}: `readyToRetire` is the Contract key equal to the Proposal's key, or null.
 * A collision is not an error; the owner confirms retirement in chat (#80).
 */
export function validateProposal(proposal, foundations, known) {
  const errors = [];
  const err = (rule, at, message) => errors.push({ rule, at, message });
  const opts = Array.isArray(known) ? { contracts: known } : known || {};
  const contracts = opts.contracts || [], proposals = opts.proposals || [];
  const p = proposal;

  checkProposalShape(p, err);
  if (!isObj(foundations) || !isObj(foundations.variables) || !isObj(foundations.textStyles))
    err('schema', 'foundations', 'a foundations document with `variables` and `textStyles` is required (rule 6)');
  if (errors.length) return { ok: false, errors, readyToRetire: null };

  // 1. keys and labels
  if (p.schemaVersion !== 1) err(1, 'schemaVersion', `unknown Proposal schemaVersion ${JSON.stringify(p.schemaVersion)}; this module reads 1`);
  checkKeys(p, err);
  // 3. patterns, rule nodes and bind nodes
  const domain = checkPatterns(p, err);
  if (errors.length) return { ok: false, errors, readyToRetire: null };
  // 2. defaults (no selection, so no Base Component check)
  checkDefaults(p, domain, err);

  // 6. tokens, theme tokens only
  const asContract = Object.assign({}, p, { excluded: [], selection: { omit: [] } });
  checkTokens(asContract, foundations, err, (variable, t) => {
    if (variable.family) return `token "${t}" is a component token of "${variable.family}"; a Proposal binds theme tokens only`;
    if (variable.hidden) return `token "${t}" is a hidden Primitive; a Proposal binds theme tokens only`;
  });

  // 7. instance targets: a declared dependency that names a Contract or a Proposal
  const contractKeys = contracts.map(c => c.family.key), proposalKeys = proposals.map(x => x.family.key);
  const deps = (p.dependencies && p.dependencies.families) || [];
  const exists = key => contractKeys.indexOf(key) >= 0 || proposalKeys.indexOf(key) >= 0;
  checkInstances(p, err, key => deps.some(f => f.key === key));
  if (contracts.length || proposals.length)
    deps.forEach((f, i) => { if (!exists(f.key)) err(7, `dependencies.families[${i}]`, `family "${f.key}" is neither a Contract nor a Proposal in this Design System`); });

  // cycle: a Proposal may compose other Proposals, never itself
  const byKey = {};
  proposals.forEach(x => { byKey[x.family.key] = x; });
  byKey[p.family.key] = p;
  const cycle = findCycle(p.family.key, byKey);
  if (cycle) err('cycle', 'dependencies.families', `Proposals compose in a cycle: ${cycle.join(' → ')}`);

  // considered: every family considered and rejected is a Contract
  if (contracts.length)
    p.proposal.considered.forEach((c, i) => {
      if (contractKeys.indexOf(c.contract) < 0) err('considered', `proposal.considered[${i}]`, `considered Contract "${c.contract}" does not exist`);
    });

  // 8. status and approval (no snapshotId: there is no code)
  checkProposalApproval(p, err);

  // retirement: a tombstone skips the collision report and names a real Contract and real keys
  let readyToRetire = null;
  if (p.retirement) checkRetirement(p, contracts, err);
  else if (contractKeys.indexOf(p.family.key) >= 0) readyToRetire = p.family.key;
  if (p.built) {
    const b = p.built;
    if (p.proposal.home.where !== 'app') err('built', 'built', '`built` is only for a Proposal whose home is the app');
    if (typeof b.ref !== 'string' || !b.ref || typeof b.export !== 'string' || b.by !== 'owner' || typeof b.at !== 'string')
      err('built', 'built', '`built` is {ref: "repo@commit:path", export, by: "owner", at}');
  }

  return { ok: errors.length === 0, errors, readyToRetire };
}

function checkProposalShape(p, err) {
  const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (!isObj(p)) return err('schema', '', 'a Proposal is a JSON object');
  for (const [key, type] of Object.entries(PROPOSAL_REQUIRED))
    if (typeOf(p[key]) !== type) err('schema', key, `\`${key}\` is required and must be ${type === 'array' ? 'an' : 'a'} ${type}`);
  for (const [key, type] of Object.entries(PROPOSAL_OPTIONAL))
    if (key in p && typeOf(p[key]) !== type) err('schema', key, `\`${key}\` must be ${type === 'array' ? 'an' : 'a'} ${type}`);
  for (const key of ['status', 'approval']) if (!(key in p)) err('schema', key, `\`${key}\` is required`);
  for (const key of PROPOSAL_FORBIDDEN)
    if (key in p) err('schema', key, `a Proposal never has \`${key}\`: it has no code source, selection or Figma mapping`);
  if (isObj(p.family) && (typeof p.family.key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(p.family.key) || typeof p.family.name !== 'string'))
    err('schema', 'family', '`family` needs a kebab-case `key` and a `name`');
  if (isObj(p.proposal)) {
    const pr = p.proposal;
    if (typeof pr.reason !== 'string' || !pr.reason) err('schema', 'proposal.reason', '`proposal.reason` says why no existing Contract fits');
    if (!Array.isArray(pr.considered) || pr.considered.some(c => !isObj(c) || typeof c.contract !== 'string' || typeof c.whyNot !== 'string'))
      err('schema', 'proposal.considered', '`proposal.considered` is a list of {contract, whyNot}');
    if (!isObj(pr.origin) || typeof pr.origin.input !== 'string') err('schema', 'proposal.origin', '`proposal.origin` needs `input`');
    if (!isObj(pr.home) || ['code-library', 'app'].indexOf(pr.home.where) < 0)
      err('schema', 'proposal.home', '`proposal.home.where` is "code-library" or "app"');
  }
  (Array.isArray(p.axes) ? p.axes : []).forEach((a, i) => {
    if (!isObj(a) || typeof a.key !== 'string' || typeof a.label !== 'string' || !Array.isArray(a.values) || !a.values.length || !('default' in a))
      return err('schema', `axes[${i}]`, 'an axis needs `key`, `label`, `default` and non-empty `values`');
    a.values.forEach((v, j) => {
      if (!isObj(v) || typeof v.key !== 'string' || typeof v.label !== 'string') err('schema', `axes[${i}].values[${j}]`, 'a value needs `key` and `label`');
      else if ('code' in v) err('schema', `axes[${i}].values[${j}].code`, 'a Proposal has no code mapping; the value key is the suggested prop value');
    });
  });
  (Array.isArray(p.properties) ? p.properties : []).forEach((x, i) => {
    if (!isObj(x) || typeof x.key !== 'string' || !['TEXT', 'BOOLEAN', 'INSTANCE_SWAP'].includes(x.type) || !Array.isArray(x.binds))
      err('schema', `properties[${i}]`, 'a property needs `key`, `type` (TEXT, BOOLEAN or INSTANCE_SWAP) and `binds`');
    else if ('code' in x) err('schema', `properties[${i}].code`, 'a Proposal has no code mapping; the property key is the suggested prop name');
  });
  for (const section of SECTIONS)
    (Array.isArray(p[section]) ? p[section] : []).forEach((r, i) => {
      if (!isObj(r) || !isObj(r.match) || !isObj(r.set)) err('schema', `${section}[${i}]`, 'a rule is {match, set}');
    });
  if (isObj(p.anatomy) && (typeof p.anatomy.name !== 'string' || typeof p.anatomy.type !== 'string'))
    err('schema', 'anatomy', 'the anatomy root needs `name` and `type`');
  if (isObj(p.dependencies) && 'families' in p.dependencies && !Array.isArray(p.dependencies.families))
    err('schema', 'dependencies.families', '`dependencies.families` must be an array');
}

function findCycle(start, byKey) {
  const path = [];
  const walk = key => {
    const i = path.indexOf(key);
    if (i >= 0) return path.slice(i).concat(key);
    const x = byKey[key];
    if (!x) return null;
    path.push(key);
    for (const f of (x.dependencies && x.dependencies.families) || []) {
      const found = walk(f.key);
      if (found) return found;
    }
    path.pop();
    return null;
  };
  const found = walk(start);
  return found && found.indexOf(start) >= 0 ? found : null;
}

function checkProposalApproval(p, err) {
  if (p.status === 'pending') {
    if (p.approval !== null) err(8, 'approval', 'a pending Proposal has `approval: null`');
    return;
  }
  if (p.status !== 'approved') return err(8, 'status', `status must be "pending" or "approved", not ${JSON.stringify(p.status)}`);
  if (!isObj(p.approval)) return err(8, 'approval', 'an approved Proposal needs an approval {by, at, contentHash}');
  if (p.approval.by !== 'owner') err(8, 'approval.by', `only the owner approves (by: "owner"), not ${JSON.stringify(p.approval.by)}`);
  if (typeof p.approval.at !== 'string' || !p.approval.at) err(8, 'approval.at', 'approval.at must be an ISO time');
  const hash = proposalContentHash(p);
  if (p.approval.contentHash !== hash)
    err(8, 'approval.contentHash', `approval.contentHash ${p.approval.contentHash} does not match the Proposal's ${hash}: the Proposal changed since approval`);
}

// retirement: {contract, how: "built" | "replaced", map: {values: {"<axis>.<value>": {axis, value} | {property, value} | null},
// properties: {"<property>": "<contract property>" | null}}, by: "owner", at}.
function checkRetirement(p, contracts, err) {
  const r = p.retirement;
  if (typeof r.contract !== 'string' || ['built', 'replaced'].indexOf(r.how) < 0 || !isObj(r.map) || r.by !== 'owner' || typeof r.at !== 'string')
    return err('retirement', 'retirement', '`retirement` is {contract, how: "built" | "replaced", map, by: "owner", at}');
  if (!contracts.length) return;
  const target = contracts.find(c => c.family.key === r.contract);
  if (!target) return err('retirement', 'retirement.contract', `retired into Contract "${r.contract}", which does not exist`);
  const contractValue = (axis, value) => target.axes.some(a => a.key === axis && a.values.some(v => v.key === value));
  const contractProperty = key => (target.properties || []).some(x => x.key === key);
  for (const [from, to] of Object.entries(r.map.values || {})) {
    const [axis, value] = [from.slice(0, from.indexOf('.')), from.slice(from.indexOf('.') + 1)];
    if (!p.axes.some(a => a.key === axis && a.values.some(v => v.key === value)))
      err('retirement', `retirement.map.values.${from}`, `"${from}" is not a value of this Proposal`);
    if (to === null) continue;
    const ok = isObj(to) && ('axis' in to ? contractValue(to.axis, to.value) : 'property' in to && contractProperty(to.property));
    if (!ok) err('retirement', `retirement.map.values.${from}`, `${JSON.stringify(to)} is not an axis value or property of Contract "${r.contract}"`);
  }
  for (const [from, to] of Object.entries(r.map.properties || {})) {
    if (!(p.properties || []).some(x => x.key === from)) err('retirement', `retirement.map.properties.${from}`, `"${from}" is not a property of this Proposal`);
    if (to !== null && !contractProperty(to)) err('retirement', `retirement.map.properties.${from}`, `"${to}" is not a property of Contract "${r.contract}"`);
  }
}

/** sha256 of the canonical Proposal without `status`, `approval`, `retirement` and `built`, as "sha256:<hex>". */
export function proposalContentHash(proposal) {
  const p = clone(proposal);
  delete p.status;
  delete p.approval;
  delete p.retirement;
  delete p.built;
  return 'sha256:' + sha256(canonical(p));
}

/** A copy marked as edited: `status: "pending"`, `approval: null`. Call it on every Proposal write except one that only adds `retirement` or `built`. */
export function asPending(proposal) {
  const p = clone(proposal);
  p.status = 'pending';
  p.approval = null;
  return p;
}

// ---------- writes: every write returns a copy with status "draft" and approval null ----------

/**
 * Apply a To-preview omit patch {family, snapshotId, omit: [pattern], expectedCount}. The patch is the
 * whole owner omit list, so it replaces `selection.omit` (a re-included combination drops out of it).
 * Throws when the patch is for another family or another source snapshot. Validate the result.
 */
export function applyOmit(contract, patch) {
  if (patch.family !== contract.family.key)
    throw new Error(`omit patch is for family "${patch.family}", not "${contract.family.key}"`);
  if (patch.snapshotId !== contract.source.snapshotId)
    throw new Error(`omit patch snapshotId ${patch.snapshotId} does not match source.snapshotId ${contract.source.snapshotId}`);
  const c = clone(contract);
  const patternKey = p => canonical(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])));
  const reasons = {};
  for (const o of contract.selection.omit) if (o.reason) reasons[patternKey(o.match)] = o.reason;
  c.selection.omit = patch.omit.map(match => {
    const reason = reasons[patternKey(match)];
    return reason ? { match: clone(match), reason } : { match: clone(match) };
  });
  c.selection.expectedCount = patch.expectedCount;
  return asDraft(c);
}

// Notes that block approval: an owner tweak the Contract cannot carry is recorded as a `warning` note.
const blockingNotes = c => (c.notes || []).filter(n => n.level === 'warning');

/** A copy marked as edited: `status: "draft"`, `approval: null`. Call it on every Contract write. */
export function asDraft(contract) {
  const c = clone(contract);
  c.selection.status = 'draft';
  c.selection.approval = null;
  return c;
}

/** Who a prototype approval names. Rule 8 rejects it, so it is never valid outside a prototype. */
export const PROTOTYPE_APPROVER = 'orchestrator (prototype)';

/**
 * Record the owner's approval, given only after an explicit "approve" in chat at the end of the base
 * loop. Returns a copy with status "approved" and approval {by: "owner", at, snapshotId, contentHash}.
 * `{prototype: true}` writes `by: PROTOTYPE_APPROVER` instead, for a prototype run only: validate() rejects
 * it (rule 8), because only the owner approves outside prototypes.
 * Throws while a `warning` note (an uncarried owner tweak) is open: resolve or remove it first.
 */
export function approve(contract, at, { prototype = false } = {}) {
  const blocking = blockingNotes(contract);
  if (blocking.length)
    throw new Error(`cannot approve: ${blocking.length} warning note(s) block approval, first at ${blocking[0].at}: ${blocking[0].message}`);
  const c = clone(contract);
  c.selection.status = 'approved';
  c.selection.approval = { by: prototype ? PROTOTYPE_APPROVER : 'owner', at, snapshotId: c.source.snapshotId, contentHash: contentHash(c) };
  return c;
}

// ---------- Drafted values (ADR 0010) ----------

// The parts of a Contract that hold values an Adapter's agent drafts. `excluded` has no key form yet.
const DRAFTABLE = ['family', 'axes', 'anatomy', 'properties', 'layout', 'paint', 'icons', 'figma', 'code'];
const BIND_FIELDS = ['characters', 'visible', 'mainComponent'];
const OWNER_BY = /^owner( \(simulated[^)]*\))?$/;
const noMatch = o => !isObj(o) || Object.keys(o).length === 0;

/** The `drafted` key of a value set by a layout or paint rule: `layout.Button.width`, or `layout{"size":"sm"}.Box.height` under a non-empty match. */
export function draftedKey(section, match, node, field) {
  return `${section}${noMatch(match) ? '' : canonical(match)}.${node}.${field}`;
}

/**
 * The value a `drafted` key names, as {found: true, value} or {found: false, why}. Keys follow ADR 0010:
 * `axes.<axis>.values.<value>.label`, `anatomy.<node>`, `properties.<key>.<field>`, `properties.<node>.<characters|visible|mainComponent>`,
 * `layout.<node>.<field>` for the base rule and `layout<match as canonical JSON>.<node>.<field>` for any other; other keys walk the
 * Contract, picking list items by `key` or `name`.
 */
export function draftedValue(contract, key) {
  const miss = why => ({ found: false, why });
  const root = String(key).split(/[.{]/)[0];
  if (DRAFTABLE.indexOf(root) < 0) return miss(`"${root}" holds no Drafted values`);
  const path = String(key).slice(root.length);
  if (root === 'layout' || root === 'paint') {
    const m = /^(\{.*\})?\.([^.]+)\.([^.]+)$/.exec(path);
    if (!m) return miss(`a ${root} key is ${root}[<match>].<node>.<field>`);
    const [, match, node, field] = m;
    if (match === '{}') return miss('a value in the base rule has no match in its key');
    let value;
    let found = false;
    for (const rule of contract[root] || []) {
      const same = match === undefined ? noMatch(rule.match) : !noMatch(rule.match) && canonical(rule.match) === match;
      if (same && isObj(rule.set) && isObj(rule.set[node]) && Object.prototype.hasOwnProperty.call(rule.set[node], field)) {
        found = true;
        value = rule.set[node][field];
      }
    }
    return found ? { found, value } : miss(`no ${root} rule with ${match === undefined ? 'the base match' : `match ${match}`} sets ${node}.${field}`);
  }
  const parts = path.split('.').slice(1);
  if (root === 'anatomy') {
    const n = anatomyIndex(contract)[parts[0]];
    if (!n || parts.length > 1) return miss(`no anatomy node "${parts.join('.')}"`);
    return { found: true, value: { name: n.name, type: n.type } };
  }
  if (root === 'properties' && parts.length === 2 && BIND_FIELDS.indexOf(parts[1]) >= 0 && !(contract.properties || []).some(p => p.key === parts[0])) {
    const p = (contract.properties || []).find(q => (q.binds || []).some(b => b.node === parts[0] && b.field === parts[1]));
    return p ? { found: true, value: { key: p.key, label: p.label, type: p.type, default: p.default } } : miss(`no property binds ${parts[0]}.${parts[1]}`);
  }
  let cur = contract[root];
  if (!parts.length) return miss(`a key names a value inside "${root}"`);
  for (const part of parts) {
    if (Array.isArray(cur)) cur = cur.find(e => isObj(e) && (e.key === part || e.name === part));
    else if (isObj(cur) && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
    else cur = undefined;
    if (cur === undefined) return miss(`no value at ${key}`);
  }
  return { found: true, value: cur };
}

/**
 * The fingerprint of each `drafted` key (ADR 0010): `sha256:` of the canonical facts its key kind is drafted from.
 * The Adapter reads its Code Library and passes `nodeFacts(layer)` (the layer's {node, element, rules, ...}; it throws on
 * a layer it can't map) and `parts`, the family's part names; the key kinds are the same for every Adapter (#144, #387).
 * `keys` defaults to the agent entries of `drafted`. Returns {facts: {key: facts}, fingerprints: {key: "sha256:…"}}.
 * Throws on a key with no fingerprint kind.
 */
export function draftedFingerprints(contract, { nodeFacts, parts, keys }) {
  const axes = contract.axes || [];
  const values = a => a.values.map(v => v.key);
  const factsOf = key => {
    const [root, ...rest] = key.split('.');
    const axis = root === 'axes' && axes.find(a => a.key === rest[0]);
    if (axis) return { kind: 'axis', axis: axis.key, values: values(axis) };
    if (['family', 'icons', 'figma', 'code'].includes(root))
      return { kind: 'family', axes: Object.fromEntries(axes.map(a => [a.key, values(a)])), defaults: Object.fromEntries(axes.map(a => [a.key, a.default])), parts };
    if (root === 'anatomy') return { kind: 'node', ...nodeFacts(rest.join('.')), parts };
    // A layout rule's match is not a fact: `layout{"size":"sm"}.Box.height` hashes like `layout.Box.height`.
    const layout = /^layout(\{.*\})?\.([^.]+)\.[^.]+$/.exec(key);
    if (layout) return { kind: 'layout', ...nodeFacts(layout[2]) };
    const p = root === 'properties' && (contract.properties || []).find(q => q.key === rest[0]);
    if (p && p.code && p.code.prop && p.binds && p.binds.length) return { kind: 'property', prop: p.code.prop, ...nodeFacts(p.binds[0].node), parts };
    throw new Error(`no fingerprint kind for "${key}"`);
  };
  const list = keys || Object.entries(contract.drafted || {}).filter(([, e]) => e.by === 'agent').map(([k]) => k);
  const facts = Object.fromEntries(list.map(k => [k, factsOf(k)]));
  return { facts, fingerprints: Object.fromEntries(list.map(k => [k, `sha256:${sha256(canonical(facts[k]))}`])) };
}

function checkDrafted(c, err) {
  if (c.drafted === undefined) return;
  if (!isObj(c.drafted)) return err(9, 'drafted', '`drafted` must be an object keyed by value path');
  for (const [key, e] of Object.entries(c.drafted)) {
    const at = `drafted.${key}`;
    const r = draftedValue(c, key);
    if (!r.found) err(9, at, `${key} is not a value in this Contract: ${r.why}`);
    if (!isObj(e)) { err(9, at, `${key}: an entry is an object, {by: "agent", evidence, fingerprint} or {by: "owner", was}`); continue; }
    if (e.by === 'agent') {
      if (!Array.isArray(e.evidence) || !e.evidence.length || e.evidence.some(x => typeof x !== 'string' || !x))
        err(9, at, `${key}: an agent entry needs evidence, a non-empty list of "file:Lnn what it shows" strings`);
      if (typeof e.fingerprint !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(e.fingerprint))
        err(9, at, `${key}: an agent entry needs a fingerprint "sha256:<64 hex>"`);
    } else if (OWNER_BY.test(String(e.by))) {
      if (!('was' in e)) err(9, at, `${key}: an owner entry needs was, the value before the owner's correction`);
    } else err(9, at, `${key}: by must be "agent" or "owner", not ${JSON.stringify(e.by)}`);
  }
}

// ---------- contentHash (pure-JS sha256 so it runs in node, the browser and the Figma sandbox) ----------

/** sha256 of the canonical Contract without `selection.status` and `selection.approval`, as "sha256:<hex>". */
export function contentHash(contract) {
  const c = clone(contract);
  delete c.selection.status;
  delete c.selection.approval;
  return 'sha256:' + sha256(canonical(c));
}

/** Canonical JSON: object keys sorted at every level, no whitespace. The text every content hash is taken over. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Hex sha256 of a string's UTF-8 bytes. */
export function sha256(text) {
  const bytes = utf8(text);
  const K = [];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let n = 2, found = 0; found < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) K[found++] = (Math.pow(n, 1 / 3) % 1) * 4294967296 | 0;
  }
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 4294967296));
  view.setUint32(padded.length - 4, bits >>> 0);
  const w = new Int32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    for (let i = 0; i < 8; i++) H[i] |= 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// UTF-8 bytes without TextEncoder (absent in the Figma plugin sandbox).
function utf8(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp < 0xdc00 && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo < 0xe000) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); i++; }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(out);
}
