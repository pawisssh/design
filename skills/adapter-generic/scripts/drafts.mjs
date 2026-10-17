// The Generic Adapter's agent tier (#122, ADR 0010): the values an agent drafts for a family, under keys fixed by
// rule, each with its evidence and a fingerprint of the exact-tier facts it is drafted from; and how a re-run carries,
// reopens, drops or asks for them. components.mjs generate() is the only caller.
//
// The agent drafts, for now:
// - each cva axis's label and its values' labels (fingerprint: the axis's value keys);
// - `figma.grid` and `family.description` (fingerprint, family-wide: every axis's key, value keys and default, and
//   the family's exported parts; compound variants fail the exact tier, so there are none to pin).
// Attribute, Slot and State axis labels are made by rule, so they are not drafted.
import { canonical, draftedValue } from '../../contract/scripts/contract.mjs';
import { sha256 } from './sources.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fingerprint = facts => `sha256:${sha256(canonical(facts))}`;
const isOwner = e => /^owner\b/.test(e.by);
const fail = message => { throw new Error(message); };

const ANCHOR = 'It was drafted before as `prior`: keep it unless the new evidence contradicts it.';

const label = key => value => {
  if (typeof value !== 'string' || !value.trim()) fail(`${key}: a drafted label is a non-empty string, not ${JSON.stringify(value)}`);
};
const description = value => {
  if (typeof value !== 'string' || !value.trim()) fail(`family.description: a drafted description is a non-empty string, not ${JSON.stringify(value)}`);
};
const grid = axes => value => {
  const keys = axes.map(a => a.key);
  if (!value || !Array.isArray(value.columns) || !Array.isArray(value.rows)) fail('figma.grid: a drafted grid is {columns, rows}, each a list of axis keys');
  if (!value.columns.length) fail('figma.grid: columns must name at least one axis');
  const named = [...value.columns, ...value.rows];
  const missing = keys.filter(k => !named.includes(k));
  const extra = named.filter((k, i) => !keys.includes(k) || named.indexOf(k) !== i);
  if (missing.length || extra.length)
    fail(`figma.grid: columns and rows must name every axis exactly once${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; repeated or unknown ${extra.join(', ')}` : ''}`);
};

/**
 * What the agent drafts for a family readFamily() read, in the draft Contract `contract` built from it:
 * [{key, evidence, fingerprint, brief, check}], `check(value)` throwing on a value of the wrong shape.
 */
export function subjects(f, contract) {
  const { file, facts } = f;
  const at = (line, what) => `${file}:L${line} ${what}`;
  const out = [];
  for (const [axis, lines] of Object.entries(facts.variants)) {
    const values = Object.keys(lines);
    const print = fingerprint({ kind: 'labels', axis, values });
    out.push({ key: `axes.${axis}.label`, fingerprint: print, check: label(`axes.${axis}.label`),
      evidence: [at(lines[values[0]], `${facts.cva} variants.${axis}: ${values.map(v => `"${v}"`).join(', ')}`)],
      brief: `The ${axis} axis's label: the Figma variant property name, in Title Case.` });
    for (const v of values)
      out.push({ key: `axes.${axis}.values.${v}.label`, fingerprint: print, check: label(`axes.${axis}.values.${v}.label`),
        evidence: [at(lines[v], `${axis} "${v}" in ${facts.cva} variants`)],
        brief: `The label of ${axis} value "${v}": the name a designer picks it by, in Title Case, abbreviations spelled out.` });
  }
  const family = fingerprint({ kind: 'family', axes: contract.axes.map(a => ({ key: a.key, values: a.values.map(v => v.key), default: a.default })), parts: facts.parts });
  const axisList = contract.axes.map(a => `${a.key} (${a.values.length})`).join(', ');
  const rootEvidence = at(facts.line, `exports ${f.name}, rendered as <${f.element}>${facts.parts.length ? `; also exports ${facts.parts.join(', ')}` : ''}`);
  const axesEvidence = at(facts.cvaLine, `${facts.cva}; the Contract's axes: ${axisList}`);
  out.push({ key: 'family.description', fingerprint: family, check: description, evidence: [rootEvidence, axesEvidence],
    brief: 'One sentence on what the component is and how its axes vary it, from its source.' });
  out.push({ key: 'figma.grid', fingerprint: family, check: grid(contract.axes), evidence: [axesEvidence],
    brief: 'The Component Set grid, {columns, rows}: lists of axis keys naming every axis exactly once, columns across and rows down, outermost first.' });
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// Set the value a simple key names (`axes.<axis>[.values.<value>].label`, `family.<field>`, `figma.<field>`).
function put(contract, key, value) {
  const parts = key.split('.');
  let cur = contract;
  for (const p of parts.slice(0, -1)) cur = Array.isArray(cur) ? cur.find(e => e.key === p) : cur[p];
  cur[parts[parts.length - 1]] = clone(value);
}

/**
 * Merge the Drafted values into `contract`, a draft Contract from the exact tier, against the `prior` Contract (the
 * one on disk, or null) and the agent's `drafts` ({key: value}):
 * - an owner entry is kept with its value; when the snapshot changed it is also listed in `ownerCheck`, since an
 *   owner entry has no fingerprint to tell whether its evidence moved;
 * - an agent entry whose fingerprint is unchanged is carried verbatim with its value;
 * - a moved fingerprint reopens the entry and a subject with no entry is missing: each takes its value from `drafts`,
 *   or is requested, a reopened one anchored on its prior value;
 * - a prior entry whose subject is gone is dropped and listed as vanished;
 * - a draft no subject took is listed as unused.
 * @returns {contract, report: {carried, reopened, vanished, missing, owner, ownerCheck, unused}, requests}; `contract`
 * is null while a request is open. Throws on a drafted value of the wrong shape.
 */
export function mergeDrafts({ contract, subjects: list, prior = null, drafts = {} }) {
  const c = clone(contract);
  const report = { carried: [], reopened: [], vanished: [], missing: [], owner: [], ownerCheck: [], unused: [] };
  const requests = [];
  const drafted = {};
  const was = (prior && prior.drafted) || {};
  const moved = prior !== null && prior.source.snapshotId !== contract.source.snapshotId;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  for (const s of list) {
    const old = has(was, s.key) ? was[s.key] : null;
    const priorValue = old && draftedValue(prior, s.key).value;
    if (old && isOwner(old)) {
      put(c, s.key, priorValue);
      drafted[s.key] = clone(old);
      report.owner.push(s.key);
      if (moved) report.ownerCheck.push(s.key);
      continue;
    }
    if (old && old.fingerprint === s.fingerprint) {
      put(c, s.key, priorValue);
      drafted[s.key] = clone(old);
      report.carried.push(s.key);
      continue;
    }
    report[old ? 'reopened' : 'missing'].push(s.key);
    if (has(drafts, s.key)) {
      s.check(drafts[s.key]);
      put(c, s.key, drafts[s.key]);
      drafted[s.key] = { by: 'agent', evidence: s.evidence.slice(), fingerprint: s.fingerprint };
    } else {
      requests.push({ key: s.key, evidence: s.evidence.slice(), brief: old ? `${s.brief} ${ANCHOR}` : s.brief, ...(old && { prior: clone(priorValue) }) });
    }
  }
  const keys = new Set(list.map(s => s.key));
  report.vanished = Object.keys(was).filter(k => !keys.has(k));
  report.unused = Object.keys(drafts).filter(k => !keys.has(k) || report.carried.includes(k) || report.owner.includes(k));
  if (requests.length) return { contract: null, report, requests };
  c.drafted = drafted;
  return { contract: c, report, requests };
}
