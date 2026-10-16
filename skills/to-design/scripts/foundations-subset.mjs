// The foundations subset To-design builds (#107, ADR 0006). The Foundations document carries the whole theme;
// a Design Library holds the closure (what Contracts use), the groups the owner selected (Spacing and Size by
// default, kept in the ledger's `foundationsGroups`), and every alias and Text Style bind target they reach.

/** The groups a file builds when its ledger names none, where the document has them (shadcn has no Size). */
export const DEFAULT_GROUPS = ['Size', 'Spacing'];

/** A variable's or Text Style's group: the first segment of its Figma name (`Spacing/spacing-05` is in Spacing). */
export const groupOf = entry => entry.name.split('/')[0];

/**
 * The groups a file builds: the ledger's list, else the default groups `doc` has. A group the owner named stays in
 * even when the document lacks it, so `selection` refuses it by name.
 */
export function selectedGroups(ledger, doc) {
  if (ledger && ledger.foundationsGroups) return ledger.foundationsGroups;
  const known = new Set([...Object.values(doc.variables), ...Object.values(doc.textStyles)].map(groupOf));
  return DEFAULT_GROUPS.filter(g => known.has(g));
}

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

// use_figma takes 50,000 chars of code. The packaged core and its wrapper take 16.8K of them (measured on the
// foundations package), so a call's plan and state get the rest, less a margin.
export const CALL_BUDGET = 50000 - 18000;
// Per call, outside the entries: the plan's header and collections, the state's collections and orphans.
const FIXED = 3000;

const union = (a, b) => ({ variables: new Set([...a.variables, ...b.variables]), textStyles: new Set([...a.textStyles, ...b.textStyles]) });

/**
 * The selection `names` split into calls of at most `budget` chars (#107): whole groups in document order, so
 * Primitives come first, each call carrying the alias and bind targets its groups reach. `sizeOf(kind, name)` is
 * an entry's chars in the plan and the state. The split depends only on the document and the selection, so a
 * chunk names the same groups before and after the one before it is recorded. A group that cannot fit one call
 * is refused by name. Returns [{groups, owned, names}], `owned` holding the chunk's own groups' entries.
 */
export function chunks(doc, names, sizeOf, budget = CALL_BUDGET) {
  const units = new Map();
  for (const kind of ['variables', 'textStyles'])
    for (const [name, entry] of Object.entries(doc[kind])) {
      if (!names[kind].has(name)) continue;
      const g = groupOf(entry);
      if (!units.has(g)) units.set(g, { variables: new Set(), textStyles: new Set() });
      units.get(g)[kind].add(name);
    }
  const size = set => ['variables', 'textStyles'].reduce((n, kind) => n + [...set[kind]].reduce((m, name) => m + sizeOf(kind, name), 0), 0);
  const room = budget - FIXED;
  const out = [];
  let cur = null;
  for (const [group, owned] of units) {
    const need = reach(doc, [...owned.variables, ...owned.textStyles]);
    const own = size(need);
    if (own > room) throw new Error(`group ${group} (${own} chars with its alias and bind targets) does not fit one call (${room} chars)`);
    if (cur && size(union(cur.names, need)) > room) { out.push(cur); cur = null; }
    cur = cur ? { groups: [...cur.groups, group], owned: union(cur.owned, owned), names: union(cur.names, need) } : { groups: [group], owned, names: need };
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The state for one chunk of a chunked build: the ledger with its foundations variables and Text Styles cut to the
 * chunk's names, so the unchanged core orphans none of the other chunks' names. Chunk 1 also carries the recorded
 * names that left the selection (`selected` given), so they are orphaned once. Collections and orphans stay whole.
 */
export function chunkState(ledger, part, selected = null) {
  const f = ledger.foundations;
  if (!f) return ledger;
  const cut = kind => Object.fromEntries(Object.entries(f[kind] || {}).filter(([n]) => part.names[kind].has(n) || (selected && !selected[kind].has(n))));
  return { ...ledger, foundations: { ...f, variables: cut('variables'), textStyles: cut('textStyles') } };
}

/** Refuses chunk `k` (1-based) of `parts` until every earlier chunk's groups are recorded from this document. */
export function assertRecorded(ledger, parts, k, documentHash) {
  const f = ledger && ledger.foundations;
  for (let j = 0; j < k - 1; j++) {
    const missing = ['variables', 'textStyles'].some(kind => [...parts[j].owned[kind]].some(n => !f || f.documentHash !== documentHash || !(f[kind] || {})[n]));
    if (missing) throw new Error(`chunk ${j + 1} is not recorded yet: build and record it first`);
  }
}
