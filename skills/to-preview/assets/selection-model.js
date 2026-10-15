(function (root) {
  "use strict";
  class ComponentSheetSelection {
    constructor(catalog) {
      if (!catalog || catalog.schemaVersion !== 1 || !catalog.snapshotId || !Array.isArray(catalog.families)) throw new Error("Invalid versioned catalog");
      this.catalog = catalog;
      this.families = new Map();
      this.specimens = new Map();
      this.selected = new Set();
      this.verified = new Set();
      for (const family of catalog.families) {
        if (!family.id || this.families.has(family.id) || !Array.isArray(family.specimens)) throw new Error("Invalid or duplicate family");
        this.families.set(family.id, family);
        for (const specimen of family.specimens) {
          if (!specimen.id || this.specimens.has(specimen.id) || !specimen.themeId || !specimen.properties || typeof specimen.properties !== "object") throw new Error("Invalid or duplicate specimen");
          if (Object.values(specimen.properties).some(value => typeof value !== "string" || !value)) throw new Error("Specimen axis values must be nonempty strings");
          this.specimens.set(specimen.id, { ...specimen, familyId: family.id });
        }
      }
    }
    family(id) {
      const family = this.families.get(id);
      if (!family) throw new Error("Unknown family: " + id);
      return family;
    }
    selectFamily(id, value) {
      for (const specimen of this.family(id).specimens) this.select(specimen.id, value);
    }
    select(id, value) {
      if (!this.specimens.has(id)) throw new Error("Unknown specimen: " + id);
      if (value) this.selected.add(id); else this.selected.delete(id);
    }
    selectMatching(familyId, filters, value) {
      for (const specimen of this.family(familyId).specimens) {
        if (this.matches(specimen, filters)) this.select(specimen.id, value);
      }
    }
    matches(specimen, filters) {
      return Object.entries(filters || {}).every(([axis, value]) => !value || (axis === "$theme" ? specimen.themeId : specimen.properties[axis]) === value);
    }
    verify(id) {
      if (!this.specimens.has(id)) throw new Error("Unknown specimen: " + id);
      this.verified.add(id);
    }
    dependencyClosure() {
      const registry = new Map((this.catalog.dependencies || []).map(item => [item.id, item]));
      if (registry.size !== (this.catalog.dependencies || []).length) throw new Error("Duplicate dependency IDs");
      const visiting = new Set(), visited = new Set(), result = [];
      const visit = id => {
        if (visited.has(id)) return;
        if (visiting.has(id)) throw new Error("Dependency cycle: " + id);
        const dependency = registry.get(id);
        if (!dependency) throw new Error("Missing dependency: " + id);
        visiting.add(id);
        for (const child of dependency.dependencies || []) visit(child);
        visiting.delete(id); visited.add(id); result.push(dependency);
      };
      const selectedFamilies = new Set();
      for (const id of this.selected) {
        const specimen = this.specimens.get(id);
        selectedFamilies.add(specimen.familyId);
        for (const dependency of specimen.dependencies || []) visit(dependency);
      }
      for (const id of selectedFamilies) for (const dependency of this.family(id).dependencies || []) visit(dependency);
      return result;
    }
    manifest() {
      if (!this.selected.size) throw new Error("Select at least one variant");
      const unverified = [...this.selected].filter(id => !this.verified.has(id));
      if (unverified.length) throw new Error("Selected specimens not rendered/verified: " + unverified.join(", "));
      const entries = [...this.specimens.values()].filter(item => this.selected.has(item.id)).map(item => ({
        familyId: item.familyId, specimenId: item.id,
        properties: { ...item.properties }, themeId: item.themeId
      }));
      const selectedFamilies = [...this.families.keys()].filter(id => entries.some(item => item.familyId === id));
      return {
        schemaVersion: 1, snapshotId: this.catalog.snapshotId,
        intent: "generate-native-script", selectedFamilies, entries,
        dependencies: this.dependencyClosure(),
        families: selectedFamilies.map(id => {
          const family = this.family(id);
          const selectedRows = entries.filter(item => item.familyId === id);
          const selectedCount = selectedRows.length;
          const sourceDefault = family.defaultProperties || family.specimens[0].properties;
          const defaultRow = selectedRows.find(row => Object.entries(sourceDefault).every(([key,value]) => row.properties[key] === value)) || selectedRows[0];
          return { id, name: family.name, expectedFile: family.expectedFile, layoutPlanFile: family.layoutPlanFile, tokenPlanFile: family.tokenPlanFile,
            sourceDefaultProperties: { ...sourceDefault }, effectiveDefaultProperties: { ...defaultRow.properties }, selectedThemes: [...new Set(selectedRows.map(row => row.themeId))],
            selectedCount, fullCount: family.specimens.length, scope: selectedCount === family.specimens.length ? "complete" : "partial" };
        }),
        approval: { action: "export-selection", approvedAt: new Date().toISOString(), executionAuthorized: false }
      };
    }
  }
  root.ComponentSheetSelection = ComponentSheetSelection;
  if (typeof module !== "undefined" && module.exports) module.exports = ComponentSheetSelection;
})(typeof globalThis !== "undefined" ? globalThis : window);
