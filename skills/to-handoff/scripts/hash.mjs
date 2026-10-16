// The Handoff's hashes and pins (#64 §6), shared by generate, validate and the Sign-off lifecycle so a pin
// is computed one way only: the content hash, the Prototype's files and snapshotId, and the Foundations
// usedHash. No parse5 here: validate and check load without the reader's package.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { canonical, sha256 } from '../../contract/scripts/contract.mjs';

export const fileHash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const clone = o => JSON.parse(JSON.stringify(o));

/** A Handoff's content hash: everything but revision, status and approval (#64). */
export function handoffContentHash(handoff) {
  const h = clone(handoff);
  delete h.revision;
  delete h.status;
  delete h.approval;
  return 'sha256:' + sha256(canonical(h));
}

/**
 * The Prototype's snapshotId: a hash over its sorted file hashes (#64), as for a Code Library snapshot. The same
 * manifest as each Adapter's `snapshotId` in its sources.mjs; To-handoff names no Adapter, so it keeps its own.
 */
export function snapshotIdOf(files) {
  return 'sha256:' + sha256(Object.keys(files).sort().map(p => `${files[p].slice(7)}  ${p}\n`).join(''));
}

/** Every file the reader reads, as {path relative to the Prototype root: hash}. A single HTML file is one entry. */
export function prototypeFiles(prototype) {
  return { [basename(prototype)]: fileHash(readFileSync(prototype)) };
}

/** The tokens and Text Styles a Handoff's regions bind: {tokens, textStyles}, each sorted. */
export function usedOf(handoff) {
  const tokens = new Set(), textStyles = new Set();
  for (const screen of handoff.screens || []) for (const r of screen.regions || []) {
    for (const s of r.styles || []) if (s.token) tokens.add(s.token);
    for (const t of r.text || []) {
      const s = t.style || {};
      if (s.textStyle) textStyles.add(s.textStyle);
      for (const m of Object.values(s.partial || {})) if (m.token) tokens.add(m.token);
    }
  }
  return { tokens: [...tokens].sort(), textStyles: [...textStyles].sort() };
}

/**
 * `foundations.usedHash` (#64 §6): sha256 of the canonical {name: value per mode} of every token and Text Style
 * the Handoff binds, plus `source.modes` (Prototype mode -> Foundations mode key). Adding another family's Contract leaves it alone.
 */
export function usedHash(handoff, foundations) {
  const strip = o => { const c = clone(o); delete c.usedBy; return c; };
  const { tokens, textStyles } = usedOf(handoff);
  const used = {
    variables: Object.fromEntries(tokens.map(k => [k, foundations.variables[k] ? strip(foundations.variables[k]) : null])),
    textStyles: Object.fromEntries(textStyles.map(k => [k, foundations.textStyles[k] ? strip(foundations.textStyles[k]) : null])),
    modes: (handoff.source && handoff.source.modes) || {},
  };
  return 'sha256:' + sha256(canonical(used));
}
