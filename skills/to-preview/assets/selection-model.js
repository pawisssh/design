(function (root) {
  "use strict";
  // To-preview selection over one Contract. Specimens are the Contract's tuples (axes minus `excluded`);
  // the ones the Contract omits start unchecked. `contractModule` is the shared Contract module
  // (skills/contract/scripts/contract.mjs): the only implementation of expand, match and apply-omit.
  class CatalogSelection {
    constructor(contract, contractModule) {
      if (!contract || contract.schemaVersion !== 1 || !contract.family || !contract.source || !contract.source.snapshotId)
        throw new Error("Invalid Contract: schemaVersion 1 with family and source.snapshotId required");
      this.contract = contract;
      this.module = contractModule;
      this.specimens = new Map();
      this.selected = new Set();
      this.verified = new Set();
      const all = contractModule.expand({ ...contract, selection: { ...contract.selection, omit: [] } });
      for (const tuple of all) {
        const id = this.idOf(tuple);
        this.specimens.set(id, { id, tuple, name: contractModule.variantName(contract, tuple) });
      }
      for (const tuple of contractModule.expand(contract)) this.selected.add(this.idOf(tuple));
      this.baseId = this.idOf(contractModule.baseTuple(contract));
    }
    // The specimen id is the tuple key ("primary|lg|enabled"): an internal DOM id only; it never leaves the page.
    idOf(tuple) {
      return this.module.tupleKey(this.contract, tuple);
    }
    specimen(id) {
      const specimen = this.specimens.get(id);
      if (!specimen) throw new Error("Unknown specimen: " + id);
      return specimen;
    }
    select(id, value) {
      const specimen = this.specimen(id);
      if (value) this.selected.add(id);
      else if (id === this.baseId) throw new Error("The Base Component (" + specimen.name + ") is locked on");
      else this.selected.delete(id);
    }
    selectAll(value) {
      this.selectMatching({}, value);
    }
    // Select visible / Clear visible: every specimen the display filters show, except the locked base.
    selectMatching(filters, value) {
      for (const specimen of this.specimens.values())
        if (this.matches(specimen, filters) && (value || specimen.id !== this.baseId)) this.select(specimen.id, value);
    }
    // Display filters {axisKey: valueKey}; an empty value shows every value of that axis.
    matches(specimen, filters) {
      return Object.entries(filters || {}).every(([axis, value]) => !value || specimen.tuple[axis] === value);
    }
    // Called once a specimen has rendered in the default mode; export needs every checked one.
    verify(id) {
      this.specimen(id);
      this.verified.add(id);
    }
    checkedTuples() {
      return [...this.specimens.values()].filter(s => this.selected.has(s.id)).map(s => ({ ...s.tuple }));
    }
    /**
     * The export: {family, snapshotId, omit, expectedCount}. `omit` is the whole owner omit list:
     * the Contract's own patterns that still hold (unchanged, so their reasons survive), then one
     * pattern per axis whose whole values are off, then single tuples for the rest. Throws unless
     * applying it to the Contract expands to exactly the checked tuples.
     */
    omitPatch() {
      const c = this.contract, m = this.module;
      const names = ids => ids.slice(0, 5).map(id => this.specimen(id).name).join("; ") + (ids.length > 5 ? " and " + (ids.length - 5) + " more" : "");
      const unrendered = [...this.selected].filter(id => !this.verified.has(id));
      if (unrendered.length) throw new Error("Checked specimens not rendered in the default mode: " + names(unrendered));
      const specimens = [...this.specimens.values()];
      const off = specimens.filter(s => !this.selected.has(s.id));
      const allOff = pattern => {
        const hit = specimens.filter(s => m.matches(pattern, s.tuple));
        return hit.length > 0 && hit.every(s => !this.selected.has(s.id));
      };
      const omit = [];
      const covered = s => omit.some(p => m.matches(p, s.tuple));
      for (const o of c.selection.omit) if (allOff(o.match)) omit.push(JSON.parse(JSON.stringify(o.match)));
      const keptCount = omit.length;
      for (const axis of c.axes) {
        const values = axis.values.map(v => v.key)
          .filter(v => allOff({ [axis.key]: v }) && off.some(s => s.tuple[axis.key] === v && !covered(s)));
        if (values.length) omit.push({ [axis.key]: values.length === 1 ? values[0] : values });
      }
      // A kept Contract pattern now swallowed by a whole-value pattern is dropped, so nothing repeats.
      const kept = omit.splice(0, keptCount), wholeValues = omit.slice();
      omit.unshift(...kept.filter(p => !specimens.every(s => !m.matches(p, s.tuple) || wholeValues.some(w => m.matches(w, s.tuple)))));
      for (const s of off) if (!covered(s)) omit.push({ ...s.tuple });
      const patch = { family: c.family.key, snapshotId: c.source.snapshotId, omit, expectedCount: this.selected.size };
      const expanded = m.expand(m.applyOmit(c, patch)).map(t => this.idOf(t));
      if (expanded.length !== this.selected.size || !expanded.every(id => this.selected.has(id)))
        throw new Error("The omit patch does not reproduce the checked specimens; nothing exported");
      return patch;
    }
  }
  root.CatalogSelection = CatalogSelection;
  if (typeof module !== "undefined" && module.exports) module.exports = CatalogSelection;
})(typeof globalThis !== "undefined" ? globalThis : window);
