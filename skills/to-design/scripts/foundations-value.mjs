// What a token of the Foundations document stands for, with its collections at given modes (#109). A Theme
// token carries its `resolved` colour per Theme mode; a Layer token carries only an alias per Layer mode, to the
// Theme token that level uses, so its colour is that Theme token's in the Theme mode.

/**
 * The value `name` stands for: a resolved colour "#rrggbb" (lowercase) or a number. `modes` maps a collection
 * key to one of its mode keys; a collection it leaves out sits at its first mode, the default. An alias with no
 * `resolved` beside it is followed to its target, in the target collection's mode.
 */
export function valueAt(doc, name, modes = {}) {
  const seen = new Set();
  for (let at = name; at != null && !seen.has(at); ) {
    seen.add(at);
    const v = doc.variables[at];
    if (!v) return undefined;
    const collection = doc.collections.find(c => c.key === v.collection);
    const value = v.values[modes[v.collection] || (collection && collection.modes[0].key)];
    if (!value) return undefined;
    if (v.type === 'COLOR' && value.resolved != null) return String(value.resolved).toLowerCase();
    if (v.type !== 'COLOR' && value.value !== undefined) return value.value;
    at = value.alias;
  }
  return undefined;
}
