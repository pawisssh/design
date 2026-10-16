// Prototype for #79: can To-design build a Component Proposal ahead of code?
// Throwaway. It feeds a Proposal through the existing base and sets plans unchanged, through a Contract-shaped
// shim. The real seam is a neutral build input derived after validateProposal() (see README); the shim exists
// only so this prototype needs no change to build-plan.mjs or the cores.
import { contentHash, expand, validate, variantName } from '../../skills/contract/scripts/contract.mjs';

export const LKEY = key => `proposal:${key}`;
const clone = v => JSON.parse(JSON.stringify(v));

/** #60: the Contract's contentHash() over the Proposal with status, approval, retirement and built removed. */
export function proposalHash(p) {
  const { status, approval, retirement, built, ...rest } = clone(p);
  return contentHash({ ...rest, selection: {} });
}

/**
 * What stands in for `figma`, derived and never stored in the Proposal:
 * page "<name> (Proposal)", set named after the family, Header Type "Component Proposal", the description
 * prefixed with the Proposal mark, and the grid: the last non-State axis as columns, the other axes then State
 * as rows (this reproduces Button's hand-picked grid: columns [size], rows [kind, state]).
 */
export function derivedFigma(p, codeLibrary) {
  const plain = p.axes.filter(a => !a.canonical).map(a => a.key);
  const state = p.axes.filter(a => a.canonical).map(a => a.key);
  return {
    page: `${p.family.name} (Proposal)`,
    componentSetName: p.family.name,
    description: `Component Proposal: not in ${codeLibrary} yet. ${p.family.description}`,
    header: { type: 'Component Proposal', title: p.family.name, namespace: p.proposal.home.package || p.proposal.home.path || p.proposal.home.where },
    grid: { columns: plain.slice(-1), rows: [...plain.slice(0, -1), ...state] },
  };
}

/** The Contract-shaped shim the unchanged plans read: every combination selected (no `selection`, no `excluded`). */
export function buildView(p, codeLibrary) {
  const hash = proposalHash(p);
  const noCode = v => ({ ...v, code: v.code === undefined ? {} : v.code });
  const view = {
    schemaVersion: 1,
    family: p.family,
    source: { codeLibrary: '(none: Component Proposal)', adapter: 'proposal', repository: '-', tag: '-', commit: '0'.repeat(40), packages: {}, files: {}, snapshotId: hash },
    axes: p.axes.map(a => ({ ...a, values: a.values.map(noCode) })),
    excluded: [],
    selection: { status: 'draft', omit: [], expectedCount: 1, approval: null },
    anatomy: p.anatomy,
    properties: (p.properties || []).map(noCode),
    layout: p.layout,
    paint: p.paint,
    ...(p.icons ? { icons: p.icons } : {}),
    subComponents: p.subComponents || [],
    dependencies: p.dependencies || { families: [], fonts: [] },
    figma: derivedFigma(p, codeLibrary),
    code: { framework: 'none', package: '-', component: '-', import: '-', alwaysEmit: [] },
  };
  view.selection.expectedCount = expand(view).length;
  if (p.status === 'approved') {
    view.selection.status = 'approved';
    view.selection.approval = { by: p.approval.by, at: p.approval.at, snapshotId: hash, contentHash: contentHash(view) };
  }
  return view;
}

/**
 * The build gate (#79): validateProposal plus rule 5 over every combination. Not part of validateProposal, so a
 * description-only Proposal stays valid; only a Figma build needs it. Also refuses a Proposal whose key a Contract
 * already holds (ready to retire: retire first, never build both).
 */
export function buildReady(p, foundations, { contracts = [] } = {}) {
  const errors = [];
  for (const k of ['layout', 'paint']) if (!Array.isArray(p[k]) || !p[k].length) errors.push(`${k}: required for a Figma build`);
  if (contracts.some(c => c.family.key === p.family.key)) errors.push(`family.key: a Contract "${p.family.key}" exists: ready to retire (#80), not to build`);
  if (p.status === 'approved' && p.approval.contentHash !== proposalHash(p)) errors.push('approval.contentHash: stale');
  if (!errors.length) {
    const v = validate(buildView(p, foundations.source.codeLibrary), foundations);
    for (const e of v.errors) if (e.rule !== 8) errors.push(`rule ${e.rule} ${e.at}: ${e.message}`);
  }
  return { ok: !errors.length, errors };
}

// ---------- the ledger: Proposal entries under "proposal:<key>" ----------

/** The ledger as the unchanged plans should see it for this Proposal: its own entries under the plain key. */
export function ledgerView(ledger, key) {
  const out = clone(ledger);
  for (const sec of ['bases', 'sets']) {
    if (!out[sec]) continue;
    delete out[sec][key];
    if (out[sec][LKEY(key)]) out[sec][key] = out[sec][LKEY(key)];
    delete out[sec][LKEY(key)];
  }
  return out;
}

/** A derived plan and state, moved to the Proposal's ledger key, so the core records under "proposal:<key>". */
export function namespaced({ plan, state }, key, ledger) {
  plan.family = LKEY(key);
  for (const sec of ['bases', 'sets']) {
    if (!state[sec]) continue;
    const s = {};
    for (const [k, v] of Object.entries(state[sec])) s[k === key ? LKEY(key) : k] = v;
    if (sec === 'bases' && ledger.bases && ledger.bases[key]) s[key] = ledger.bases[key];
    state[sec] = s;
  }
  return { plan, state };
}

/**
 * #80 section 9, adoption in place: move the Proposal's ledger entries to the Contract's key and re-key each
 * variant id through the retirement map, so the Contract's first build finds the same nodes by id. A Proposal
 * variant the map sends nowhere becomes an Orphan (ADR 0003). `map(tuple)` returns the Contract tuple or null.
 */
export function adoptInPlace(ledger, proposalView, contract, map, at) {
  const out = clone(ledger);
  const pk = LKEY(proposalView.family.key);
  const ck = contract.family.key;
  if (out.bases && out.bases[pk]) { out.bases[ck] = { ...out.bases[pk], snapshotId: contract.source.snapshotId }; delete out.bases[pk]; }
  const rec = out.sets && out.sets[pk];
  if (rec) {
    const from = expand(proposalView);
    const to = expand(contract).map(t => JSON.stringify(t));
    const variants = new Array(to.length).fill(null);
    const orphans = {};
    from.forEach((t, i) => {
      const target = map(t);
      const j = target ? to.indexOf(JSON.stringify(target)) : -1;
      if (j >= 0) variants[j] = rec.variants[i];
      else if (rec.variants[i]) orphans[variantName(proposalView, t)] = { id: rec.variants[i], key: null, droppedAt: at };
    });
    out.sets[ck] = { ...rec, variants, total: to.length, contentHash: contentHash(contract), snapshotId: contract.source.snapshotId, orphans };
    delete out.sets[pk];
  }
  return out;
}
