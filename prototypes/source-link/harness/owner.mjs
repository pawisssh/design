// PROTOTYPE (#84). The no-transform alternative: React 19 dev builds keep a
// `_debugStack` Error on each fibre (where its JSX element was created).
// Run the untouched copy in dev mode, read those stacks for the labelled
// elements, map frames through the dev server's source maps, and grade.
//
//   node owner.mjs <v0|lovable>
import { execSync, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { SourceMapConsumer } from "source-map-js"

import * as labels from "./labels.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const app = process.argv[2]
const APPS = {
  v0: { src: "v0-app", ui: "components/ui/", start: ["npx", ["next", "dev", "-p", "3103"]], port: 3103, trigger: "#team" },
  lovable: { src: "lovable-app", ui: "src/components/ui/", start: ["npx", ["vite", "--port", "3104", "--strictPort"]], port: 3104, trigger: "#size" },
}
const cfg = APPS[app]
const work = path.join(root, "work", `${app}-owner`)
fs.rmSync(work, { recursive: true, force: true })
execSync(`rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git ${path.join(root, cfg.src)}/ ${work}/`)
execSync("npm ci --ignore-scripts --no-audit --no-fund --prefer-offline", { cwd: work, stdio: "ignore" })
const server = spawn(cfg.start[0], cfg.start[1], { cwd: work, stdio: "ignore", detached: true })
const url = `http://localhost:${cfg.port}/`
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(url)).ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

// In the page: for an element, the host fibre's stack plus each composite
// ancestor's stack up to the next host fibre (same shape as the tag chain),
// then keep climbing for the fallback.
function stacks({ sel, nth }) {
  const el = document.querySelectorAll(sel)[nth]
  if (!el) return null
  const fk = Object.keys(el).find((k) => k.startsWith("__reactFiber"))
  const out = []
  for (let f = fk && el[fk], i = 0; f && i < 40; f = f.return, i++) {
    const name = typeof f.type === "string" ? f.type : f.type && (f.type.displayName || f.type.name)
    out.push({ name: name || null, host: typeof f.type === "string", stack: f._debugStack ? String(f._debugStack.stack) : null })
  }
  return { fiber: !!fk, out }
}

const browser = await chromium.launch()
const page = await browser.newPage()
async function load() {
  await page.goto(url, { waitUntil: "load" })
  await page.waitForFunction(() => {
    const f = document.querySelector("form")
    return f && Object.keys(f).some((k) => k.startsWith("__reactFiber"))
  }, null, { timeout: 120000 })
}
async function fill(email) {
  await load()
  await page.fill("#name", "Test Person")
  await page.fill("#email", email)
  await page.click("button[type=submit]")
}
const raw = []
async function capture(state) {
  for (const [sel, nth, expect, kind] of labels[app][state]) raw.push({ state, sel, nth, expect, kind, r: await page.evaluate(stacks, { sel, nth }) })
}
await load()
await capture("default")
await page.click(cfg.trigger)
await page.waitForSelector("[data-slot=select-item]")
await capture("select-open")
await page.keyboard.press("Escape")
await fill("ok@example.com")
await page.waitForSelector("button[type=submit] svg")
await capture("loading")
await fill("fail@example.com")
await page.waitForSelector("[data-slot=alert]")
await capture("error")
await fill("ok@example.com")
await page.waitForSelector("[data-sonner-toast]")
await page.waitForSelector("svg.text-emerald-600")
await capture("success")

fs.writeFileSync(path.join(here, "results", `${app}-owner-raw.json`), JSON.stringify(raw, null, 2))
// Source-map a frame URL:line:col back to the original file:line.
const maps = new Map()
async function mapFrame(u, line, col) {
  if (!maps.has(u)) {
    let consumer = null
    try {
      const text = await (await fetch(u)).text()
      const m = text.match(/\/\/# sourceMappingURL=(\S+)\s*$/)
      if (m) {
        const mapText = m[1].startsWith("data:")
          ? Buffer.from(m[1].split(",")[1], "base64").toString("utf8")
          : await (await fetch(new URL(m[1], u))).text()
        consumer = new SourceMapConsumer(JSON.parse(mapText))
      }
    } catch {}
    maps.set(u, consumer)
  }
  const c = maps.get(u)
  if (!c) return null
  const p = c.originalPositionFor({ line, column: col - 1 })
  return p.source ? { source: new URL(p.source, u).pathname, line: p.line } : null
}
const FRAME = /(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?$/
async function siteOf(stack) {
  if (!stack) return null
  for (const ln of stack.split("\n").slice(1)) {
    const m = ln.trim().match(FRAME)
    if (!m) continue
    const [, u, l, c] = m
    if (/node_modules|\.vite\/deps|react-dom|jsx-dev-runtime|next\/dist|_next\/static\/chunks\/(?!app)/.test(u)) continue
    const o = await mapFrame(u, Number(l), Number(c))
    if (!o) return { unmapped: u }
    const rel = o.source.replace(/^.*?(src\/|app\/|components\/)/, "$1").replace(/\?.*$/, "")
    return { loc: `${rel}:${o.line}` }
  }
  return null
}

const rows = []
let ok = 0
for (const x of raw) {
  if (!x.r) {
    rows.push({ ...x, r: undefined, got: "selector not found" })
    continue
  }
  const sites = []
  for (const f of x.r.out) sites.push({ name: f.name, host: f.host, site: await siteOf(f.stack) })
  // Same rule as the tag chain: innermost app-code site, climbing as needed.
  const got = sites.map((s) => s.site && s.site.loc).find((l) => l && !l.startsWith(cfg.ui))
  if (got === x.expect) ok++
  rows.push({ state: x.state, sel: x.sel, nth: x.nth, expect: x.expect, got, fiber: x.r.fiber, first: sites.slice(0, 4) })
}
await browser.close()
process.kill(-server.pid)
const report = { app, mode: "owner-stack (dev, no transform)", labels: raw.length, ok, misses: rows.filter((r) => r.got !== r.expect) }
fs.mkdirSync(path.join(here, "results"), { recursive: true })
fs.writeFileSync(path.join(here, "results", `${app}-owner.json`), JSON.stringify({ ...report, rows }, null, 2))
console.log(JSON.stringify(report, null, 2))
