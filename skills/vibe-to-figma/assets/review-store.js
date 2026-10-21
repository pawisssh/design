(function (root) {
  "use strict";
  // Vibe-to-Figma's saved ticks (#178). Published as an Artifact, the review page keeps every family's ticks in the
  // Artifact's db, one document at DOC: {designSystem, documentHash, families: {<family>: <omit patch>}}. The patch is
  // the one To-preview's export writes; the checked tuples are left out, since the patch gives them back (a 3,072-
  // variant Button's would outgrow a 256 KiB document). approve.mjs --ticks reads the document the agent saves.
  const DOC = "review/ticks";

  // The document to save, from the page's combined export (review-export.js).
  function storedTicks(exported) {
    const families = {};
    for (const [family, s] of Object.entries(exported.families)) families[family] = s.patch;
    return { designSystem: exported.designSystem, documentHash: exported.documentHash, families };
  }

  // The saved patches this page can restore -> {patches: {<family>: patch}, stale: [reason]}. A document saved for another
  // design system restores nothing. A family's patch restores only at its Contract's snapshot, whatever Foundations
  // document it was saved against (#262): a rerun that redrafts one family moves the document, and the untouched
  // families keep their ticks. The rest show as the Contract has them.
  function restorable(model, stored) {
    const patches = {}, stale = [];
    if (!stored) return { patches, stale };
    if (stored.designSystem !== model.designSystem) return { patches, stale: ["the saved ticks are for another design system"] };
    for (const f of model.families) {
      const patch = (stored.families || {})[f.family];
      if (!patch || typeof patch !== "object") continue;
      if (patch.family === f.family && patch.snapshotId === f.snapshotId) patches[f.family] = patch;
      else stale.push(f.family + "'s saved ticks are from another snapshot");
    }
    return { patches, stale };
  }

  // The document as text with every object's keys sorted: the db hands a document back with its keys sorted, so the
  // page compares this form to tell whether its ticks are saved already.
  function canonical(value) {
    return JSON.stringify(value, (_, v) => (v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
  }

  const api = { DOC, storedTicks, restorable, canonical };
  root.ReviewStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
