// validateHandoff (#56, #64): handoff.schema.json (the JSON Schema keyword subset it uses), then the
// cross-field rules a schema cannot say: tuples against the Contract or Proposal axes, every token a theme
// token (never a Primitive or a component token), copy, value and question references, the five standard
// states, no usage of a retired Proposal, every usage's `in` a Contract usage on its screen with no cycle,
// and an approval that matches the content (a test approval only under .scratch/).
import { readFileSync } from 'node:fs';
import { handoffContentHash } from './hash.mjs';
import { STANDARD_STATES } from './recognise.mjs';
import { TEST_APPROVER, inScratch, stateAxisOf } from './system.mjs';

const SCHEMA = JSON.parse(readFileSync(new URL('../handoff.schema.json', import.meta.url), 'utf8'));

/** handoff.schema.json errors: [{rule: "schema", at, message}]. */
export function schemaErrors(value) {
  const errors = [];
  check(SCHEMA, value, '$', errors);
  return errors.map(e => ({ rule: 'schema', at: e.at, message: `${e.at}: ${e.message}` }));
}

function check(s, v, path, errors) {
  if (s.$ref) return check(s.$ref.split('#')[1].split('/').slice(1).reduce((o, k) => o[k], SCHEMA), v, path, errors);
  const typeOf = x => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  const fail = message => errors.push({ at: path, message });
  if (s.type) {
    const types = [].concat(s.type), t = typeOf(v);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return fail(`expected ${types}, got ${t}`);
  }
  if ('const' in s && v !== s.const) fail(`expected ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) fail(`expected one of ${s.enum.join(', ')}, got ${JSON.stringify(v)}`);
  if (s.pattern && typeof v === 'string' && !new RegExp(s.pattern).test(v)) fail(`${JSON.stringify(v)} does not match ${s.pattern}`);
  if (s.minLength && typeof v === 'string' && v.length < s.minLength) fail('is empty');
  if (s.minItems && Array.isArray(v) && v.length < s.minItems) fail(`needs at least ${s.minItems} item(s)`);
  if (s.items && Array.isArray(v)) v.forEach((x, i) => check(s.items, x, `${path}[${i}]`, errors));
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of s.required || []) if (!(k in v)) fail(`missing ${k}`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties && s.properties[k]) check(s.properties[k], x, `${path}.${k}`, errors);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(s.additionalProperties, x, `${path}.${k}`, errors);
    }
  }
  if (s.anyOf && !s.anyOf.some(alt => { const e = []; check(alt, v, path, e); return !e.length; })) fail('matches none of its allowed shapes');
  if (s.not) { const e = []; check(s.not, v, path, e); if (!e.length) fail('has a forbidden shape'); }
}

/**
 * Validate a Handoff against its Design System (from loadDesignSystem). Returns {ok, errors: [{rule, at, message}]}.
 */
export function validateHandoff(handoff, system) {
  const errors = schemaErrors(handoff);
  const err = (rule, at, message) => errors.push({ rule, at, message });
  const { foundations, contracts, proposals } = system;
  const h = handoff;
  const copy = h.copy || {};
  const values = new Set((h.values || []).map(v => v.id));
  const questions = new Set((h.openQuestions || []).map(q => q.id));
  const copyRef = (ref, at) => { if (typeof ref === 'string' && ref.startsWith('copy:') && !(ref.slice(5) in copy)) err('copy', at, `${at}: unknown copy "${ref}"`); };
  const questionRef = (id, at) => { if (id !== undefined && !questions.has(id)) err('question', at, `${at}: unknown question "${id}"`); };
  const token = (key, at) => {
    const v = foundations.variables[key];
    if (!v) return err('token', at, `${at}: unknown token "${key}"`);
    if (v.hidden) return err('token', at, `${at}: "${key}" is a hidden Primitive; a Handoff binds theme tokens only`);
    if (v.family) return err('token', at, `${at}: "${key}" is a component token of \`${v.family}\`; a Handoff binds theme tokens only`);
  };
  const textStyle = (key, at) => { if (!foundations.textStyles[key]) err('token', at, `${at}: unknown Text Style "${key}"`); };
  const state = (s, at) => { if (!STANDARD_STATES.includes(s)) err('state', at, `${at}: "${s}" is not a standard state`); };

  (h.screens || []).forEach((screen, si) => {
    const sp = `screens[${si}]`;
    const ids = new Set();
    const stateCheck = new Map();
    for (const s of STANDARD_STATES) if (!screen.states || !(s in screen.states)) err('states', `${sp}.states`, `${sp}.states: missing the ${s} state`);
    (screen.regions || []).forEach((region, ri) => {
      const rp = `${sp}.regions[${ri}] (${region.id})`;
      (region.states || []).forEach(s => state(s, rp));
      (region.styles || []).forEach((st, i) => {
        const at = `${rp}.styles[${i}]`;
        if (st.token !== undefined) token(st.token, at);
        (st.candidates || []).forEach(c => token(c, `${at}.candidates`));
        if (st.value !== undefined && !values.has(st.value.slice(6))) err('value', at, `${at}: unknown value "${st.value}"`);
      });
      (region.text || []).forEach((t, i) => {
        const at = `${rp}.text[${i}]`;
        copyRef(`copy:${t.copy}`, at);
        const s = t.style || {};
        if (s.textStyle !== undefined) textStyle(s.textStyle, at);
        (s.candidates || []).forEach(c => textStyle(c, `${at}.candidates`));
        for (const m of Object.values(s.partial || {})) { if (m.token) token(m.token, `${at}.partial`); (m.candidates || []).forEach(c => token(c, `${at}.partial`)); }
        (t.states || []).forEach(x => state(x, at));
      });
      (region.usages || []).forEach(u => {
        const at = `${rp} usage \`${u.id}\``;
        if (ids.has(u.id)) err('usage', at, `${at}: duplicate usage id`);
        ids.add(u.id);
        const def = u.contract ? contracts[u.contract] : u.proposal ? proposals[u.proposal] : null;
        if (u.contract && !def) err('usage', at, `${at}: no Contract "${u.contract}" in ${system.key}`);
        if (u.proposal && !def) err('usage', at, `${at}: no Proposal "${u.proposal}" in ${system.key}`);
        if (u.proposal && def && def.retirement)
          err('retired', at, `${at}: \`${u.proposal}\` retired into \`${def.retirement.contract}\`: migrate this usage to the Contract`);
        if (def && u.tuple) for (const [k, v] of Object.entries(u.tuple)) {
          const axis = def.axes.find(a => a.key === k);
          if (!axis) err('tuple', at, `${at}: tuple axis ${k} is not an axis of \`${def.family.key}\``);
          else if (axis === stateAxisOf(def)) err('tuple', at, `${at}: tuple axis ${k} is the State axis; use usage.state`);
          else if (!axis.values.some(x => x.key === v)) err('tuple', at, `${at}: tuple ${k} "${v}" is not a ${axis.label} value of \`${def.family.key}\``);
        }
        // A Family map site's switched axes (#265): each an axis of the Contract, out of the tuple, switching between its values.
        if (def && u.match && u.match.switches) for (const [k, values] of Object.entries(u.match.switches)) {
          const axis = def.axes.find(a => a.key === k);
          if (!axis || axis === stateAxisOf(def)) err('tuple', at, `${at}: match.switches ${k} is not a variant axis of \`${def.family.key}\``);
          else if (u.tuple && k in u.tuple) err('tuple', at, `${at}: match.switches ${k} is also in the tuple`);
          else for (const v of values) if (!axis.values.some(x => x.key === v)) err('tuple', at, `${at}: match.switches ${k} "${v}" is not a ${axis.label} value of \`${def.family.key}\``);
        }
        const stateValue = s => {
          const axis = def && stateAxisOf(def);
          const value = axis && axis.values.find(x => x.key === s);
          if (!value || !value.code) err('state', at, `${at}: state "${s}" is not an authored State value of \`${def ? def.family.key : '?'}\``);
        };
        if (u.state !== undefined) stateValue(u.state);
        for (const ref of Object.values(u.properties || {})) copyRef(ref, at);
        (u.items || []).forEach(item => Object.values(item.properties || {}).forEach(ref => copyRef(ref, `${at} item`)));
        questionRef(u.question, at);
        (u.offAxis || []).forEach(o => questionRef(o.question, `${at} offAxis`));
        (u.states || []).forEach(s => state(s, at));
        stateCheck.set(u.id, stateValue);
      });
    });
    const usageById = new Map((screen.regions || []).flatMap(r => r.usages || []).map(u => [u.id, u]));
    // in (#193): the nearest enclosing usage is a Contract usage on this screen, and the links form no cycle.
    (screen.regions || []).forEach((region, ri) => (region.usages || []).forEach(u => {
      if (u.in === undefined) return;
      const at = `${sp}.regions[${ri}] (${region.id}) usage \`${u.id}\``;
      const target = usageById.get(u.in);
      if (!target) return err('in', at, `${at}: in "${u.in}" names no usage on this screen`);
      if (!target.contract) err('in', at, `${at}: in "${u.in}" names a usage with no Contract`);
      const chain = [u.id];
      for (let next = usageById.get(u.in); next && !chain.includes(next.id); next = next.in === undefined ? null : usageById.get(next.in)) chain.push(next.id);
      const last = usageById.get(chain.at(-1)).in;
      if (last === u.id) err('in', at, `${at}: in forms a cycle: ${[...chain, u.id].join(' -> ')}`);
    }));
    for (const [name, s] of Object.entries(screen.states || {})) {
      const at = `${sp}.states.${name}`;
      state(name, at);
      if (s && s.missing) questionRef(s.question, at);
      for (const [id, us] of Object.entries((s && s.usageStates) || {})) {
        const u = usageById.get(id);
        if (!u) { err('usage', at, `${at}: usageStates names unknown usage "${id}"`); continue; }
        if (us.state !== undefined) stateCheck.get(id)(us.state);
        for (const ref of Object.values(us.properties || {})) copyRef(ref, `${at}.usageStates.${id}`);
      }
    }
  });
  const screens = new Set((h.screens || []).map(s => s.id));
  (h.acceptance || []).forEach((a, i) => {
    if (!screens.has(a.screen)) err('acceptance', `acceptance[${i}]`, `acceptance[${i}]: unknown screen "${a.screen}"`);
    state(a.state, `acceptance[${i}]`);
  });
  (h.data || []).forEach((x, i) => questionRef(x.question, `data[${i}]`));
  // A data entry or question is answered by its id (#370): two of one id would share an answer.
  for (const [path, list, what] of [['data', h.data, 'data'], ['openQuestions', h.openQuestions, 'question']]) {
    const seen = new Set();
    (list || []).forEach((x, i) => { if (seen.has(x.id)) err(what, `${path}[${i}]`, `${path}[${i}]: duplicate ${what} id "${x.id}"`); seen.add(x.id); });
  }
  for (const [key, ref] of Object.entries((h.a11y && h.a11y.labels) || {})) copyRef(ref, `a11y.labels.${key}`);
  if (h.source && h.source.contracts) for (const k of Object.keys(h.source.contracts)) if (!contracts[k]) err('source', 'source.contracts', `source.contracts: no Contract "${k}" in ${system.key}`);
  if (h.source && h.source.modes) for (const [m, key] of Object.entries(h.source.modes))
    if (!foundations.collections.some(c => c.modes.some(x => x.key === key))) err('mode', 'source.modes', `source.modes.${m}: unknown Foundations mode "${key}"`);
  checkApproval(h, system, err);
  return { ok: errors.length === 0, errors };
}

// Sign-off (#116): approved <=> an approval, which names this content and revision. A test approval is valid
// only in a Design System under <repo>/.scratch/: outside it, only the owner signs off.
function checkApproval(h, system, err) {
  const a = h.approval;
  if (h.status === 'approved' && !a) return err('approval', 'approval', 'approval: an approved Handoff needs an approval {by, at, revision, contentHash}');
  if (h.status === 'pending' && a) return err('approval', 'approval', 'approval: a pending Handoff has `approval: null`');
  if (!a || typeof a !== 'object') return;
  if (a.by === TEST_APPROVER && !inScratch(system.dir))
    err('approval', 'approval.by', `approval.by: "${TEST_APPROVER}" is a test approval, valid only under .scratch/; only the owner signs off a Handoff`);
  const hash = handoffContentHash(h);
  if (a.contentHash !== hash) err('approval', 'approval.contentHash', `approval.contentHash ${a.contentHash} does not match the Handoff's ${hash}: it changed since sign-off`);
  if (a.revision !== h.revision) err('approval', 'approval.revision', `approval.revision ${a.revision} does not match revision ${h.revision}`);
}
