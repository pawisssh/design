# PROTOTYPE: source link (#84)

Throwaway code. It answers one question from map #52: how does To-handoff link a rendered Prototype's host elements back to their source lines? The verdict lives on issue #84. This branch is never merged.

## What's here

- `v0-app/`: a v0-style sample. Next.js 15.5 App Router, React 19.1, Tailwind 4, and shadcn/ui (radix-nova) added by its CLI. A server `page.tsx` renders a `"use client"` request-access form with loading, error and success states. It also has:
  - a `SubmitButton` wrapper that forwards props to `Button`;
  - a `Button asChild` + `Link`;
  - a portaled Select;
  - a sonner toast.
- `lovable-app/`: a Lovable-style sample. Vite 8, `@vitejs/plugin-react-swc`, React 19.3 and react-router 7, with the same shadcn set. It adds a `PlanCard` wrapper rendered from mock data by `.map`, and a `setTimeout` stub API.
- `harness/`:
  - `tag.mjs` is the transform. It rewrites a scratch copy's `.tsx`/`.jsx` before any bundler runs and appends `data-handoff-at="<chain>"` to every JSX element.
  - `measure.mjs` does the following in order:
    1. copies the app;
    2. runs `npm ci --ignore-scripts`;
    3. tags it;
    4. makes a production build;
    5. drives default, select-open, loading, error and success in headless Chromium;
    6. snapshots every host element;
    7. grades against `labels.mjs`, ground truth hand-written from the original source.
  - `owner.mjs` is the no-transform alternative. It reads React 19 `_debugStack` in dev mode and maps it through the dev server's source maps.
  - `results/` holds the measured JSON.

## Run

Node 26 and Playwright's cached Chromium 1248 are expected, matching `playwright-core` 1.64. Use TypeScript 6. TypeScript 7 has no JS compiler API.

```bash
cd harness && npm install
node measure.mjs v0 rewrite
node measure.mjs v0 rewrite-turbopack
node measure.mjs lovable rewrite
node measure.mjs lovable vite-plugin
node measure.mjs v0 none
node measure.mjs v0 parse-fail
node measure.mjs lovable none
node measure.mjs lovable parse-fail
node owner.mjs lovable
node owner.mjs v0
node summary.mjs
```

`none` builds the copy with no tagging, which is the baseline. `parse-fail` leaves one page file untagged to measure the fallback. `summary.mjs` prints the per-state tables used in #84.
