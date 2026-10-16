// PROTOTYPE (#84). Prints the per-state tables used in the #84 resolution.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "results")
for (const f of fs.readdirSync(dir).filter((f) => /-(rewrite|rewrite-turbopack|vite-plugin|none|parse-fail)\.json$/.test(f))) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
  console.log(`\n## ${r.app} / ${r.variant}  (install ${r.installMs} ms, build ${r.buildMs} ms, tagged ${r.tagStats ? r.tagStats.elements : 0} JSX elements)`)
  console.log("| state | hosts | own app site | own chain library-only | untagged | fibre: lib→app | fibre: untagged→app | fibre none | labels | raw | +asChild | +fibre |")
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|")
  for (const [k, s] of Object.entries(r.states)) {
    console.log(`| ${k} | ${s.hosts} | ${s.direct} | ${s.libAnc} | ${s.untAnc + s.none} | ${s["fiber_library-ancestor"] || 0} | ${s["fiber_untagged-ancestor"] || 0} | ${s.fiber_none || 0} | ${s.labels} | ${s.raw} | ${s.joined} | ${s.fiberJoined || 0} |`)
  }
  const t = r.total
  console.log(`| **total** | ${t.hosts} | ${t.direct} | ${t.libAnc} | ${t.untAnc + t.none} | ${t["fiber_library-ancestor"]} | ${t["fiber_untagged-ancestor"]} | ${t.fiber_none} | ${t.labels} | ${t.raw} | ${t.joined} | ${t.fiberJoined} |`)
  const fiberMiss = r.misses.filter((m) => m.mode === "fiber")
  if (fiberMiss.length) console.log("fibre misses:", fiberMiss.map((m) => `${m.state} ${m.sel}[${m.nth}] want ${m.expect} got ${m.got}`).join("; "))
  for (const s of Object.values(r.states)) if (s.fiberNone) console.log("fibre none:", s.fiberNone.join(", "))
}
