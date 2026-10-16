(function (root) {
  "use strict";
  // One catalog card (#45); the layout is described in references/interactive-template.md ("Cards").
  // `h(tag, props, ...children)` builds a node: the page passes a DOM factory, the tests a plain-object one.
  function catalogCard(specimen, { contract, baseId, sourceLabel, h }) {
    const base = specimen.id === baseId;
    // A label the agent drafted and the owner has not corrected (ADR 0010) is marked; To-preview never approves it.
    const drafted = contract.drafted || {};
    const byAgent = key => !!drafted[key] && drafted[key].by === "agent";
    const parts = contract.axes.map(a => {
      const v = a.values.find(x => x.key === specimen.tuple[a.key]);
      return { label: (v || { label: specimen.tuple[a.key] }).label, drafted: !!v && byAgent(`axes.${a.key}.values.${v.key}.label`) };
    });
    const values = parts.some(p => p.drafted)
      ? parts.flatMap((p, i) => (i ? [" / "] : []).concat(p.drafted
        ? [h("span", { className: "tp-drafted", title: `Drafted label: the agent chose "${p.label}" and the owner has not confirmed it` }, p.label)]
        : [p.label]))
      : [parts.map(p => p.label).join(" / ")];
    const flagged = contract.axes.filter((a, i) => parts[i].drafted || byAgent(`axes.${a.key}.label`)).map(a => a.label);
    const title = specimen.name + (flagged.length ? ` (drafted: ${flagged.join(", ")})` : "");
    const checkbox = h("input", { type: "checkbox", "aria-label": specimen.name, ...(base ? { disabled: true, title: "The Base Component is locked on" } : {}) });
    const host = h("div", { className: "tp-specimen", dataset: { key: specimen.id } });
    const footer = base ? [h("span", {}, "Base Component")] : [h("span", {}, "Source"), h("span", {}, sourceLabel)];
    const card = h("section", { className: "tp-cell", dataset: { id: specimen.id } },
      h("label", { className: "tp-card-head" }, h("span", { className: "tp-card-name", title }, ...values), checkbox),
      host,
      h("footer", { className: "tp-card-foot" }, ...footer));
    return { card, checkbox, host };
  }
  root.catalogCard = catalogCard;
  if (typeof module !== "undefined" && module.exports) module.exports = catalogCard;
})(typeof globalThis !== "undefined" ? globalThis : window);
