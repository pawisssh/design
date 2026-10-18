(function (root) {
  "use strict";
  // Vibe-to-Figma's combined export (#177): every family's To-preview selection in one file. `model` is the page's
  // reviewModel() (scripts/review.mjs); `selections` maps a family to its catalog's Catalog.getSelection(),
  // {patch, checked}. The page calls it on export and the tests call it in node, so both write the same file.
  function reviewExport(model, selections) {
    const families = model.families.map(f => f.family);
    for (const family of Object.keys(selections)) {
      if ((model.kept || []).includes(family)) throw new Error(family + " is approved and not on the review page");
      if (!families.includes(family)) throw new Error(family + " has no Contract in " + model.designSystem);
    }
    const out = {};
    for (const family of families) {
      const s = selections[family];
      if (!s || !s.patch || !s.checked) throw new Error("no ticks for " + family);
      if (s.patch.family !== family || s.checked.family !== family) throw new Error(family + "'s ticks are " + s.patch.family + "'s");
      out[family] = { patch: s.patch, checked: s.checked };
    }
    return { designSystem: model.designSystem, documentHash: model.foundations.documentHash, families: out };
  }
  root.ReviewExport = { reviewExport };
  if (typeof module !== "undefined" && module.exports) module.exports = { reviewExport };
})(typeof globalThis !== "undefined" ? globalThis : window);
