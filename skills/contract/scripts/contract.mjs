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

const SECTIONS = ['layout', 'paint'];
const clone = o => JSON.parse(JSON.stringify(o));
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
        if (v !== undefined && !(isObj(v) && 'sameAs' in v)) fields[field] = clone(v);
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

/** The icon list: the icon keys the builder makes atoms for, `icons.default` then `icons.preferred`, each once. */
export function icons(contract) {
  const i = contract.icons;
  if (!i) return [];
  return [i.default].concat(i.preferred || []).filter((k, n, all) => k && all.indexOf(k) === n);
}

/** Kit-style Figma name of an icon key: first letter capitalised, `--` kept (`arrow--right` -> `Arrow--right`). */
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
  dupes(c.axes.map(a => a.key)).forEach(k => err(1, 'axes', `duplicate axis key "${k}"`));
  dupes(c.properties.map(p => p.key)).forEach(k => err(1, 'properties', `duplicate property key "${k}"`));
  for (const a of c.axes) {
    dupes(a.values.map(v => v.key)).forEach(k => err(1, `axes.${a.key}`, `duplicate value key "${k}"`));
    dupes(a.values.map(v => v.label)).forEach(l => err(1, `axes.${a.key}`, `duplicate value label "${l}"`));
    for (const v of a.values) {
      if (/[=,]/.test(v.label)) err(1, `axes.${a.key}.${v.key}`, `label "${v.label}" contains "=" or ","`);
      if (/(^|\s)[^\sA-Za-z0-9]*[a-z]/.test(v.label)) err(1, `axes.${a.key}.${v.key}`, `label "${v.label}" is not Title Case`);
    }
  }

  // 3. patterns, rule nodes and bind nodes
  const domain = Object.fromEntries(c.axes.map(a => [a.key, a.values.map(v => v.key)]));
  const checkPattern = (pattern, at) => {
    if (!isObj(pattern)) return err(3, at, 'match must be an object');
    for (const [axis, want] of Object.entries(pattern)) {
      if (!domain[axis]) { err(3, at, `unknown axis "${axis}"`); continue; }
      for (const v of Array.isArray(want) ? want : [want])
        if (!domain[axis].includes(v)) err(3, at, `unknown ${axis} value "${v}"`);
    }
  };
  c.excluded.forEach((e, i) => {
    checkPattern(e.match, `excluded[${i}].match`);
    if (!e.reason || !e.evidence || (Array.isArray(e.evidence) && !e.evidence.length))
      err(3, `excluded[${i}]`, 'an exclusion needs `reason` and `evidence`');
  });
  c.selection.omit.forEach((o, i) => checkPattern(o.match, `selection.omit[${i}].match`));
  const anatomy = anatomyIndex(c);
  const nodeKnown = name => !!anatomy[name] ||
    (name.includes('/') && anatomy[name.split('/')[0]] && anatomy[name.split('/')[0]].type === 'INSTANCE');
  for (const section of SECTIONS)
    c[section].forEach((rule, i) => {
      checkPattern(rule.match, `${section}[${i}].match`);
      for (const node of Object.keys(rule.set || {}))
        if (!nodeKnown(node)) err(3, `${section}[${i}].set`, `unknown anatomy node "${node}"`);
    });
  c.properties.forEach(p => (p.binds || []).forEach((b, i) => {
    if (b.match) checkPattern(b.match, `properties.${p.key}.binds[${i}].match`);
    if (!anatomy[b.node]) err(3, `properties.${p.key}.binds[${i}]`, `unknown anatomy node "${b.node}"`);
  }));
  if (errors.length) return { ok: false, errors }; // rules 2, 4, 5 and 6 expand, which needs valid patterns

  // 2. defaults and the Base Component
  const selected = expand(c);
  for (const a of c.axes)
    if (!domain[a.key].includes(a.default)) err(2, `axes.${a.key}.default`, `default "${a.default}" is not a value of ${a.key}`);
  const base = baseTuple(c);
  if (!selected.some(t => c.axes.every(a => t[a.key] === base[a.key])))
    err(2, 'selection', `the Base Component (${variantName(c, base)}) is not selected`);

  // 4. checksum
  if (selected.length !== c.selection.expectedCount)
    err(4, 'selection.expectedCount', `expansion gives ${selected.length} variants but expectedCount is ${c.selection.expectedCount}`);

  // 5. every selected variant resolves every required field and gets exactly one bind per property
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
  for (const t of selected) {
    const r = resolve(c, t);
    for (const section of SECTIONS)
      for (const [node, fields] of Object.entries(required[section]))
        for (const field of fields) {
          const at = `${section} ${node}.${field}`;
          const v = r[section][node] && r[section][node][field];
          if (v === undefined) gap(at, `${at} is unresolved`, t);
          else if (isObj(v) && 'sameAs' in v) gap(at, `${at} sameAs "${v.sameAs}" does not resolve`, t);
        }
    for (const p of c.properties)
      if (r.binds[p.key].length !== 1)
        gap(`properties.${p.key}.binds`, `property ${p.key} has ${r.binds[p.key].length} binds (needs exactly 1)`, t);
  }
  for (const [problem, { at, tuples }] of Object.entries(gaps))
    err(5, at, `${problem} in ${tuples.length} selected variant${tuples.length === 1 ? '' : 's'}, e.g. ${variantName(c, tuples[0])}`);

  // 6. raw values carry level and reason; tokens exist and are used inside their variable's scopes
  for (const section of SECTIONS)
    c[section].forEach((rule, i) => {
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
    }
    if (problem && !seen.has(problem)) { seen.add(problem); err(6, path, problem); }
  });

  // 7. instance targets
  const icons = c.icons;
  for (const n of Object.values(anatomy)) {
    const to = n.instanceOf;
    if (!to) continue;
    const [kind, name] = [to.slice(0, to.indexOf(':')), to.slice(to.indexOf(':') + 1)];
    const ok = kind === 'icon' ? !!(icons && icons.default)
      : kind === 'family' ? c.dependencies.families.some(f => f.key === name)
      : kind === 'sub' ? c.subComponents.some(s => s.name === name) : false;
    if (!ok) err(7, `anatomy.${n.name}.instanceOf`, `instance target "${to}" is not declared`);
  }
  if (icons && Array.isArray(icons.preferred) && !icons.preferred.includes(icons.default))
    err(7, 'icons.default', `default icon "${icons.default}" is not in icons.preferred`);

  // 8. selection status and approval
  checkApproval(c, err);

  return { ok: errors.length === 0, errors };
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

// ---------- contentHash (pure-JS sha256 so it runs in node, the browser and the Figma sandbox) ----------

/** sha256 of the canonical Contract without `selection.status` and `selection.approval`, as "sha256:<hex>". */
export function contentHash(contract) {
  const c = clone(contract);
  delete c.selection.status;
  delete c.selection.approval;
  return 'sha256:' + sha256(canonical(c));
}

// Canonical JSON: object keys sorted, no whitespace.
function canonical(v) {
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
