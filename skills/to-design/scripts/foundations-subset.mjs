// The foundations subset To-design builds (#107, ADR 0006). The Foundations document carries the whole theme;
// a Design Library holds the closure (what Contracts use), the groups the owner selected (Spacing and Size by
// default, kept in the ledger's `foundationsGroups`), and every alias and Text Style bind target they reach.

/** The groups a file builds when its ledger names none. */
export const DEFAULT_GROUPS = ['Size', 'Spacing'];

/** A variable's or Text Style's group: the first segment of its Figma name (`Spacing/spacing-05` is in Spacing). */
export const groupOf = entry => entry.name.split('/')[0];

/** The groups a file builds: the ledger's list, else the default. */
export const selectedGroups = ledger => (ledger && ledger.foundationsGroups) || DEFAULT_GROUPS;

/** Every name an entry needs built with it: alias targets of a variable, bind targets of a Text Style. */
const targetsOf = (doc, name) => doc.variables[name]
  ? Object.values(doc.variables[name].values).map(v => v.alias).filter(a => a != null)
  : Object.values((doc.textStyles[name] || {}).binds || {});

/**
 * The names `seeds` reach through alias and bind targets, transitively (a Layer token aliases a Theme token,
 * which aliases a Primitive), as {variables, textStyles} sets.
 */
export function reach(doc, seeds) {
  const out = { variables: new Set(), textStyles: new Set() };
  const todo = [...seeds];
  while (todo.length) {
    const name = todo.pop();
    const kind = doc.variables[name] ? 'variables' : doc.textStyles[name] ? 'textStyles' : null;
    if (!kind) throw new Error(`${name} is neither a variable nor a Text Style of the foundations document`);
    if (out[kind].has(name)) continue;
    out[kind].add(name);
    todo.push(...targetsOf(doc, name));
  }
  return out;
}

/** The selection for `groups`: the closure, every variable and Text Style of those groups, and what they reach. */
export function selection(doc, groups) {
  const all = [...Object.entries(doc.variables), ...Object.entries(doc.textStyles)];
  const known = new Set(all.map(([, e]) => groupOf(e)));
  const unknown = groups.filter(g => !known.has(g));
  if (unknown.length) throw new Error(`no variable or Text Style is in group ${unknown.join(', ')}`);
  return reach(doc, [...doc.closure.tokens, ...all.filter(([, e]) => groups.includes(groupOf(e))).map(([n]) => n)]);
}

/** The document holding only `names` ({variables, textStyles} sets), in document order, with only the collections they use. */
export function subsetDocument(doc, names) {
  const pick = (map, set) => Object.fromEntries(Object.entries(map).filter(([n]) => set.has(n)));
  const variables = pick(doc.variables, names.variables);
  const used = new Set(Object.values(variables).map(v => v.collection));
  return { ...doc, collections: doc.collections.filter(c => used.has(c.key)), variables, textStyles: pick(doc.textStyles, names.textStyles) };
}
