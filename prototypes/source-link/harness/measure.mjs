// PROTOTYPE (#84). Simulates To-handoff's runtime reader on a scratch copy:
// copy -> npm ci --ignore-scripts -> tag -> production build -> start ->
// drive each screen state in headless Chromium -> snapshot every host element
// -> resolve each to a usage file:line -> grade against labels.mjs.
//
//   node measure.mjs <v0|lovable> <variant: rewrite|vite-plugin|none>
import { execSync, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import ts from "typescript"

import { ATTR, tagTree } from "./tag.mjs"
import * as labels from "./labels.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const [app, variant = "rewrite"] = process.argv.slice(2)

const APPS = {
  v0: {
    src: "v0-app",
    ui: "components/ui/",
    // --no-lint: v0 output often fails Next's build-time lint; types are still checked.
    build: variant === "rewrite-turbopack" ? "npx next build --turbopack --no-lint" : "npx next build --no-lint",
    parseFail: "app/request-access-form.tsx",
    start: (port) => ["npx", ["next", "start", "-p", String(port)]],
    port: 3101,
    trigger: "#team",
    email: "#email",
  },
  lovable: {
    src: "lovable-app",
    ui: "src/components/ui/",
    build: variant === "vite-plugin" ? "npx vite build --config vite.handoff.config.ts" : "npx vite build",
    start: (port) => ["npx", ["vite", "preview", "--port", String(port), "--strictPort"]],
    port: 3102,
    trigger: "#size",
    parseFail: "src/pages/Index.tsx",
    email: "#email",
  },
}
const cfg = APPS[app]
const work = path.join(root, "work", `${app}-${variant}`)
const log = (...a) => console.error(`[${app}/${variant}]`, ...a)
const sh = (cmd) => execSync(cmd, { cwd: work, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" })

// 1. Scratch copy + install with scripts disabled.
fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(path.dirname(work), { recursive: true })
execSync(`rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git ${path.join(root, cfg.src)}/ ${work}/`)
let t = Date.now()
sh("npm ci --ignore-scripts --no-audit --no-fund --prefer-offline")
const installMs = Date.now() - t

// 2. Tag.
let tagStats = null
if (variant.startsWith("rewrite")) tagStats = tagTree(work)
if (variant === "parse-fail") tagStats = tagTree(work, [cfg.parseFail])
if (variant === "vite-plugin") {
  fs.copyFileSync(path.join(here, "tag.mjs"), path.join(work, "handoff-tag.mjs"))
  fs.writeFileSync(
    path.join(work, "vite.handoff.config.ts"),
    `import { mergeConfig } from "vite"
import base from "./vite.config"
// @ts-ignore
import { tagSource } from "./handoff-tag.mjs"
import path from "node:path"
export default mergeConfig(base, {
  plugins: [{
    name: "handoff-tag",
    enforce: "pre",
    transform(code: string, id: string) {
      if (id.includes("node_modules") || !/\\.(tsx|jsx)$/.test(id)) return
      return { code: tagSource(code, path.relative(__dirname, id)).out, map: null }
    },
  }],
})
`,
  )
}

// 3. Build + start.
t = Date.now()
sh(cfg.build)
const buildMs = Date.now() - t
const [cmd, args] = cfg.start(cfg.port)
const server = spawn(cmd, args, { cwd: work, stdio: "ignore", detached: true })
const url = `http://localhost:${cfg.port}/`
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(url)).ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

// 4. Drive states and snapshot.
const SKIP = ["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE", "NEXT-ROUTE-ANNOUNCER"]
function snapshot({ ATTR, SKIP }) {
  const out = []
  for (const el of [document.body, ...document.body.querySelectorAll("*")]) {
    if (SKIP.includes(el.tagName) || el.closest("next-route-announcer")) continue
    const ancestors = []
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (a.hasAttribute(ATTR)) ancestors.push(a.getAttribute(ATTR))
    }
    const fibers = []
    const fk = Object.keys(el).find((k) => k.startsWith("__reactFiber"))
    for (let f = fk && el[fk]; f; f = f.return) {
      const c = f.memoizedProps && typeof f.memoizedProps === "object" && f.memoizedProps[ATTR]
      if (c) fibers.push(c)
    }
    out.push({ tag: el.tagName.toLowerCase(), chain: el.getAttribute(ATTR), ancestors, fibers })
  }
  return out
}
function pick({ ATTR, sel, nth }) {
  const el = document.querySelectorAll(sel)[nth]
  if (!el) return null
  const ancestors = []
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (a.hasAttribute(ATTR)) ancestors.push(a.getAttribute(ATTR))
  }
  const fibers = []
  const fk = Object.keys(el).find((k) => k.startsWith("__reactFiber"))
  for (let f = fk && el[fk]; f; f = f.return) {
    const c = f.memoizedProps && typeof f.memoizedProps === "object" && f.memoizedProps[ATTR]
    if (c) fibers.push(c)
  }
  return { tag: el.tagName.toLowerCase(), chain: el.getAttribute(ATTR), ancestors, fibers }
}

const browser = await chromium.launch()
const page = await browser.newPage()
const consoleErrors = []
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()))
const states = {}
async function capture(name) {
  const els = await page.evaluate(snapshot, { ATTR, SKIP })
  const picked = []
  for (const [sel, nth, expect, kind, instance] of labels[app][name]) {
    picked.push({ sel, nth, expect, kind, instance, el: await page.evaluate(pick, { ATTR, sel, nth }) })
  }
  states[name] = { els, picked }
}
async function load() {
  await page.goto(url, { waitUntil: "load" })
  // Wait for hydration: the form's DOM node carries a React fibre key.
  await page.waitForFunction(() => {
    const f = document.querySelector("form")
    return f && Object.keys(f).some((k) => k.startsWith("__reactFiber"))
  })
}
async function fill(email) {
  await load()
  await page.fill("#name", "Test Person")
  await page.fill(cfg.email, email)
  await page.click("button[type=submit]")
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
await browser.close()
process.kill(-server.pid)

// 5. Resolve + grade.
const isApp = (loc) => !loc.startsWith(cfg.ui)
const lineOf = (loc) => loc.split(":").slice(0, 2).join(":")
const appEntry = (chain) => (chain ? chain.split(" ").filter(isApp).pop() : undefined)
function resolve(el, mode = "dom") {
  const own = appEntry(el.chain)
  if (own) return { loc: own, how: "direct" }
  for (const c of mode === "fiber" ? el.fibers : el.ancestors) {
    const a = appEntry(c)
    if (a) return { loc: a, how: el.chain ? "library-ancestor" : "untagged-ancestor" }
  }
  return { loc: undefined, how: "none" }
}

// The static reader's join: a usage whose JSX is the only child of an
// `asChild` element is lifted to that element (Radix Slot lets the child's
// props win, so the runtime sees the child's site).
const parsed = new Map()
function staticLift(loc) {
  if (!loc) return loc
  const [file, line, col] = loc.split(":")
  const abs = path.join(root, cfg.src, file)
  if (!parsed.has(abs)) {
    const text = fs.readFileSync(abs, "utf8")
    parsed.set(abs, ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
  }
  const sf = parsed.get(abs)
  const pos = sf.getPositionOfLineAndCharacter(Number(line) - 1, Number(col) - 1)
  let lifted = loc
  ;(function find(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && node.getStart(sf) === pos) {
      const parent = node.parent
      if (ts.isJsxElement(parent)) {
        const attrs = parent.openingElement.attributes.properties
        if (attrs.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "asChild")) {
          const p = sf.getLineAndCharacterOfPosition(parent.getStart(sf))
          lifted = `${file}:${p.line + 1}:${p.character + 1}`
        }
      }
      return
    }
    ts.forEachChild(node, find)
  })(sf)
  return lifted
}

const report = { app, variant, installMs, buildMs, tagStats, consoleErrors: consoleErrors.slice(0, 5), states: {} }
let tot = { hosts: 0, direct: 0, libAnc: 0, untAnc: 0, none: 0, labels: 0, raw: 0, joined: 0, instance: 0, instanceTotal: 0 }
const misses = []
for (const [name, { els, picked }] of Object.entries(states)) {
  const s = { hosts: els.length, direct: 0, libAnc: 0, untAnc: 0, none: 0, untaggedTags: {} }
  for (const el of els) {
    const r = resolve(el)
    const rf = resolve(el, "fiber")
    if (rf.how === "none") (s.fiberNone ||= []).push(`${name}:${el.tag}:${el.chain}:${el.ancestors[0]}`)
    if (rf.how !== "direct") s[`fiber_${rf.how}`] = (s[`fiber_${rf.how}`] || 0) + 1
    if (r.how === "direct") s.direct++
    else if (r.how === "library-ancestor") s.libAnc++
    else if (r.how === "untagged-ancestor") s.untAnc++
    else s.none++
    if (!el.chain) s.untaggedTags[el.tag] = (s.untaggedTags[el.tag] || 0) + 1
  }
  s.labels = picked.length
  s.raw = 0
  s.joined = 0
  for (const p of picked) {
    if (!p.el) {
      misses.push({ state: name, sel: p.sel, nth: p.nth, problem: "selector not found" })
      continue
    }
    const r = resolve(p.el)
    const raw = r.loc && lineOf(r.loc) === p.expect
    const joined = r.loc && lineOf(staticLift(r.loc)) === p.expect
    const rf = resolve(p.el, "fiber")
    const fiberJoined = rf.loc && lineOf(staticLift(rf.loc)) === p.expect
    if (fiberJoined) s.fiberJoined = (s.fiberJoined || 0) + 1
    else misses.push({ state: name, sel: p.sel, nth: p.nth, mode: "fiber", expect: p.expect, got: rf.loc, how: rf.how })
    if (raw) s.raw++
    if (joined) s.joined++
    if (p.instance) {
      tot.instanceTotal++
      if ([p.el.chain, ...p.el.ancestors].join(" ").split(" ").some((l) => lineOf(l) === p.instance)) tot.instance++
    }
    if (!joined || !raw)
      misses.push({ state: name, sel: p.sel, nth: p.nth, kind: p.kind, expect: p.expect, got: r.loc, how: r.how, chain: p.el.chain, joined: !!joined })
  }
  for (const k of ["hosts", "direct", "libAnc", "untAnc", "none", "labels", "raw", "joined", "fiberJoined", "fiber_library-ancestor", "fiber_untagged-ancestor", "fiber_none"]) tot[k] = (tot[k] || 0) + (s[k] || 0)
  report.states[name] = s
}
report.total = tot
report.misses = misses
fs.mkdirSync(path.join(here, "results"), { recursive: true })
fs.writeFileSync(path.join(here, "results", `${app}-${variant}.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ total: tot, misses, consoleErrors: report.consoleErrors, installMs, buildMs, tagStats }, null, 2))
