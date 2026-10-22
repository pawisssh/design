# Prototype: To-handoff's React reader on a TanStack Start app and on wouter (#336)

Throwaway. Never merged. It answers [#336](https://github.com/pawisssh/design/issues/336): can To-handoff's React
reader (`readReact`) find the screens of a TanStack Start app from its file routes under `src/routes/`, with no
`index.html`, and the screens of a wouter app from its `<Route>`s? And what does Vibe-to-Figma's `used.mjs` then
yield, and what does the runtime reader need to build and serve a TanStack Start app?

`react.mjs` here is a fork of `skills/to-handoff/scripts/react.mjs` at `ea4491c` with both front ends added;
`react.diff` is the whole change. `run.mjs` runs the fork and `used.mjs`'s logic on each sample. Nothing under
`skills/` changed.

The samples are third-party code. Clone each at its pin into its own empty folder outside the repo:

```
git clone https://github.com/cgcarlosg/inventory <scratch>/lovable && git -C <scratch>/lovable checkout df38065496a09a271443bf79e19558f5f884dbb6
git clone https://github.com/hammad986/simple_foundation_website <scratch>/replit && git -C <scratch>/replit checkout 585175d1eb22af95307333a0c8ab40f795a34e5c
node skills/to-handoff/scripts/deps.mjs
node docs/prototype/tanstack-start-wouter/run.mjs <scratch>/lovable <scratch>/replit/artifacts/hopebridge
```

It writes `out/report.md` and `out/<sample>.json`.

## Answer key: what a person reading the code would list

Written before the fork ran.

### Lovable sample (cgcarlosg/inventory, TanStack Start)

**Screens (15).** One per leaf route file under `src/routes/`:
- `/` (`index.tsx`, the landing page);
- `/app/ai-insights`, `/app/analytics`, `/app/assets`, `/app/catalog`, `/app/dashboard`, `/app/help`,
  `/app/inventory`, `/app/locations`, `/app/maintenance`, `/app/movements`, `/app/purchase-orders`,
  `/app/requests`, `/app/settings`, `/app/suppliers` (`app.<name>.tsx`).

**Not screens:**
- `__root.tsx` is the document shell: `shellComponent` renders `<html>`, `<HeadContent/>` and `<Scripts/>`, and
  `component` wraps every page in providers, an `ErrorBoundary` and the `Toaster`.
- `app.tsx` is the `/app` layout (sidebar, header, banner, bottom nav), with an `<Outlet/>`.
- `app.index.tsx` (`/app/`) only renders `<Navigate to="/app/dashboard"/>`: a redirect.
- Each `/app` page is behind a role guard (`canAccessRoute`); the screens still exist.

**Component Families: at most 26.** The Code Library is `src/components/ui/` (46 files). App code outside it
imports 26 of them: accordion, alert-dialog, badge, button, card, checkbox, collapsible, command, dialog,
dropdown-menu, form, input, label, popover, progress, scroll-area, select, separator, sheet, skeleton, sonner,
switch, table, tabs, textarea, tooltip. That is an upper bound for "what the screens render": a family imported
only by a file no screen reaches, or rendered only where a static reader can't follow (a component passed as a
prop, a config array, a render prop), is listed in the results with its reason.

### Replit sample (hammad986/simple_foundation_website, `artifacts/hopebridge/`, wouter)

**Screens (11).** The `<Route path>`s inside `<Switch>` in `src/App.tsx`:
`/`, `/about`, `/projects`, `/projects/:slug`, `/volunteer`, `/donate`, `/events`, `/blog`, `/blog/:slug`,
`/gallery`, `/contact`.

**Not screens:**
- `<Route component={NotFound} />` has no path: a catch-all, ignored as react-router's `*` is today.
- `src/pages/not-found.tsx` is dead code: nothing imports it.

**Component Families: 5.**
- accordion (Home), form, input, textarea (Volunteer, Contact, Donate).
- `Breadcrumbs` (10 pages): an app component, not shadcn's, but its file sits in `src/components/ui/`.
  `used.mjs` keys a family by its file in the Code Library folder, so it counts. A person would count it too:
  it is a reusable component every inner page draws the same way.
- Not families of the screens:
  - `card` is imported only by the dead `not-found.tsx`;
  - `toast` is a type-only import in `hooks/use-toast.ts`;
  - the `<Toaster>` in `App.tsx` comes from the `sonner` package, not from `ui/sonner.tsx`.

## Baseline: the reader at `ea4491c`

| Sample | `readReact` | `usedFamilies` (default) | `--all` |
|---|---|---|---|
| Lovable | throws "has no index.html" | throws the same | 46 |
| Replit | one screen, `/` | **none** (`[]`) | 56 |

The Replit app reads as the layout alone: `<Route path="/" component={Home}/>` is a transparent package
component with no children, so every page drops out. Navbar and Footer render no Code Library component, so the
default list is not short but empty. The shadcn path does not refuse an empty list (`folder.mjs:123` onwards; only
path A throws on no family): it writes a Foundations document and no Contract.

## Results: the static reader

`out/report.md` holds the measured tables; `out/<sample>.json` the raw output.

| Sample | Screens found / key | Default family list / key | Read time |
|---|---|---|---|
| Lovable (TanStack Start) | 15 / 15, none missing or extra; `app.index.tsx` ignored as a redirect | 25 / 25 reachable | ~0.25 s |
| Replit (wouter) | 11 / 11, none missing or extra; the path-less `NotFound` ignored as the catch-all | 3 / 5: `input` and `textarea` missing | ~0.04 s |

**The Lovable key was one too high.** `skeleton` is imported only by `src/components/shared/skeletons/*.tsx`, and
nothing imports that folder or its `index.ts` barrel: dead code, like Replit's `not-found.tsx`. So the reachable
key is 25, and the fork finds all 25. `routeTree.gen.ts` lists the same 18 route files the fork read.
The document title (`Stackwise`) comes from the root route's `head()`, and the stylesheet (`../styles.css?url`)
is read once the `?url` query is stripped: 14 rules, Tailwind on.

**Replit's `input` and `textarea` are a reader limit shared by every React kind, not wouter's.** They render only
inside shadcn's `<FormField render={({ field }) => (… <Input {...field}/> …)} />`. `setAttr` drops a prop whose
value holds JSX (`react.mjs:398`), and `nodes()` renders nothing for a function child, so a render prop's markup is
never read. A v0 or Lovable form loses its controls the same way. `form` is still found, from `<Form>` itself.

**What the fork changed** (`react.diff`, about 140 lines added to 780):
- **wouter:** `wouter` joins `ROUTERS` and `HOSTS` (`Link` → `a`), and `Switch` joins `ROUTER_PARTS`, read as
  `Routes` is. A wouter `<Route>` renders its `component={X}` (resolved through `classify` to the app component)
  or its children; one with no path in a `<Switch>` is the catch-all. App.tsx's local `Router()` inlines though
  wouter's `Router` is imported there as `WouterRouter`, and the `<Switch>` is found through `Layout`'s
  `{children}` slot inside `AnimatePresence`.
- **TanStack Start:** chosen when `@tanstack/react-start` is a dependency and `src/routes/__root.*` exists, before
  `readVite`'s `index.html` would throw. Every file under `src/routes/` (but `-`-prefixed ones) is read; its
  `createFileRoute('<id>')({ component })` literal gives the route id, the parent is the route with the longest id
  that prefixes it, and the leaves are the screens. Each screen renders as Next's do: the root's
  `shellComponent` is the document (`<html>`, mount `<body>`), its `{children}` hold the root `component`, and
  each `<Outlet/>` renders the next route in the chain. `@tanstack/react-router` joins `ROUTERS` (`Outlet`) and
  `HOSTS` (`Link` → `a`); `HeadContent` and `Scripts` stay transparent and render nothing.
- **Stylesheets:** `import x from './a.css?url'` reads `a.css`.

**Not handled by the fork, each absent from both samples:** a configured `routesDirectory` or a `tsr.config.json`;
folder routes (`posts/route.tsx`, `posts/index.tsx`) beyond what the id literal already gives; `createLazyFileRoute`
(`.lazy.tsx`) components; a route's `pendingComponent`, `errorComponent` and `notFoundComponent` (the fork only names
them in `ignored`; Next's `loading`/`error` boundaries are read as conditions today, and these would be too); a `beforeLoad` that throws
`redirect()`; a TanStack Router app on plain Vite with an `index.html` (it takes the `readVite` path and its
`<RouterProvider>` holds no array, so it reads as one screen); wouter's `nest`, a `<Route>` outside a `<Switch>`,
and function children (`{params => …}`).

## Results: what a run needs to build and serve each app

**Lovable (TanStack Start), run end to end on this Mac (arm64, Node 26).** The source was copied, every JSX file
tagged with `data-handoff-at` by To-handoff's own `tagJsx` (169 files, none failed), then:

| Step | Command | Result |
|---|---|---|
| Install | `bun install --frozen-lockfile --ignore-scripts` (bun 1.4.2 through `npx`) | exit 0, 510 packages, 853 MB. The text `bun.lock` matched `package.json`; `bun.lockb` beside it was not touched. `npm ci` can't run: no `package-lock.json` (#335). The 33 minutes were the network (2.7 s of user CPU). |
| Build | `vite build` | exit 0 in 8.7 s. The config adds `@cloudflare/vite-plugin` only when `command === 'build'`, so the output is a **Cloudflare Worker**: `dist/server/index.js` + `dist/server/wrangler.json` + `dist/client/assets`. No HTML is prerendered: `dist/client` has no `index.html`. |
| Serve, as `runtime.mjs` does | `vite preview --port P --host 127.0.0.1 --strictPort` | **every page 500.** `preview` is a `serve` command, so the Cloudflare plugin is off and TanStack Start's own preview plugin looks for a Node `dist/server/server.js` that the Worker build never wrote. |
| Serve the Worker | `wrangler dev -c dist/server/wrangler.json --ip 127.0.0.1 --port P` (wrangler 4.76 from the app's own deps) | ready in ~4 s, in local workerd (`@cloudflare/workerd-darwin-arm64`, 112 MB native binary, installed as an optional dependency, no script needed). |

Served by workerd, every screen is **server-rendered**, and the tags survive into the markup: `/` 200 with 161
tagged elements, `/app/dashboard` 200 with 106, `/app/catalog` 200 with 77 (its `CatalogFilters`, `select` and
`EmptyState` among them), `/app/` a 307 (the redirect route), an unknown path 404 from the root's
`notFoundComponent`. The page `<title>` comes from each route's `head()` (`Dashboard — Stackwise`). In system Chrome
with every request off 127.0.0.1 blocked (only the app's Supabase host was asked for), `/app/dashboard` hydrated
with no page error and the same 106 tagged elements.

**One screen moved after load, for a reason of the app's, not TanStack's.** `/app/catalog` server-renders the
catalog, but once hydrated, `app.tsx`'s role guard (`canAccessRoute`) sends a visitor outside the app's in-memory
demo mode, whose role is a stub `requestor` (`RoleContext`), to `/app/dashboard` with a toast. Any Prototype with a client-side guard does this. `runtime.mjs` would not notice: a default state has no `expect`
sites (`generate.mjs` lists only sites shown in a non-default state), so the catalog's default shot would be the
dashboard. And `runtime.mjs` blocks no request to another host, so a real run would call the app's live Supabase
project, and what each screen shows would depend on its answer.

So, for the runtime reader, a TanStack Start Prototype needs:
1. its own package manager's frozen install (bun here; #335);
2. `vite build`;
3. a server chosen from the build output, not from the kind: `wrangler dev -c dist/server/wrangler.json` when the
   build wrote a Worker (`dist/server/wrangler.json`), else `vite preview` (TanStack Start's Node preview, which
   wants `dist/server/server.js`);
4. no `index.html` for `rel` (the shell is `__root`'s `<html>`, as in a Next app), and screens visited by route.

What the machine needs: Node, bun (through `npx` is enough), ~0.9 GB of `node_modules`, and workerd's native binary
for the platform. No account: `wrangler dev` runs locally without a login.

**Replit (wouter), read, not built.** It is a plain Vite SPA with an `index.html`, so `runtime.mjs`'s existing
build + preview path applies once three things outside the reader are met, none of them wouter's:
- `vite.config.ts` throws unless `PORT` and `BASE_PATH` are set (`BASE_PATH` becomes Vite's `base`); the build
  writes `dist/public`, not `dist`.
- `tsconfig.json` extends `../../tsconfig.base.json`, outside the app folder, and the package versions are
  `catalog:` entries in the workspace root's `pnpm-workspace.yaml`: the run must copy and install from the
  workspace root, not the app folder (#335).
- The workspace's `overrides` strip every esbuild, rollup and lightningcss/oxide platform binary but linux-x64
  ("replit uses linux-x64 only"), and `pnpm-lock.yaml` resolves only those. A frozen install on a Mac gets no
  esbuild binary for darwin, so `vite build` can't run (#335).

## Verdict

**Yes for both, statically, with one reader limit that is not the router's.** A TanStack Start app is read from
`src/routes/` with no `index.html`: 15/15 screens, 25/25 reachable families, the document from `__root`'s
`shellComponent`. A wouter app's `<Switch>`/`<Route>`s are read as react-router's are: 11/11 screens. Replit's
family list is 3 of 5 because a shadcn form's controls sit in a render prop, which no React kind reads today.

**At runtime, TanStack Start needs one change to the run, not to the reader:** serve the Worker with `wrangler dev`
when the build wrote one. The wouter app needs nothing new from the run; its blockers are its workspace and
lockfile (#335) and two required env vars.

## Assumptions

- The two samples stand for each tool's default output: Lovable's TanStack Start template with the Cloudflare
  build plugin, and Replit's pnpm monorepo with an `artifacts/<app>` Vite app.
- The route id literal in `createFileRoute('<id>')` is the source of truth for the route tree; `routeTree.gen.ts`
  (generated, and may be stale or absent in a fresh export) is only a cross-check.
- A leaf route that only renders `<Navigate>` is a redirect, not a screen, as the answer key counts it.
- A route's `pendingComponent`/`errorComponent`/`notFoundComponent` are not screens of their own: like Next's
  `loading`/`error` boundaries, they belong to a screen as conditions.
- The runtime finding is from one Mac (arm64). On linux-x64 Replit's lockfile would install; the Worker would
  still need workerd's linux binary.
