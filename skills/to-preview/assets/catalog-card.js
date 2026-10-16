(function (root) {
  "use strict";
  // One catalog card (#45), after the IBM UI Icon Library grid: the axis values at top-left (the full
  // variant name is the tooltip), the selection checkbox at top-right, the specimen host, then a
  // label/value footer. `h(tag, props, ...children)` builds a node: the page passes a DOM factory.
  function catalogCard(specimen, { contract, baseId, source, h }) {
    const base = specimen.id === baseId;
    const values = contract.axes
      .map(a => (a.values.find(v => v.key === specimen.tuple[a.key]) || { label: specimen.tuple[a.key] }).label)
      .join(" / ");
    const checkbox = h("input", { type: "checkbox", "aria-label": specimen.name, ...(base ? { disabled: true, title: "The Base Component is locked on" } : {}) });
    const host = h("div", { className: "tp-specimen", dataset: { key: specimen.id } });
    const footer = base ? [h("span", {}, "Base Component")] : [h("span", {}, "Source"), h("span", {}, source)];
    const card = h("section", { className: "tp-cell", dataset: { id: specimen.id } },
      h("div", { className: "tp-card-head" }, h("span", { className: "tp-card-name", title: specimen.name }, values), checkbox),
      host,
      h("footer", { className: "tp-card-foot" }, ...footer));
    return { card, checkbox, host };
  }
  root.catalogCard = catalogCard;
  if (typeof module !== "undefined" && module.exports) module.exports = catalogCard;
})(typeof globalThis !== "undefined" ? globalThis : window);
