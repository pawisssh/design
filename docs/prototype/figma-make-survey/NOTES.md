# Figma Make bundles: how they are recognised and read (#338)

Throwaway checks behind the resolution of [#338](https://github.com/pawisssh/design/issues/338). No PR. The clones lived in scratch, outside the repo, and were read as data. `out/repos.txt` names each one with its full commit SHA.

## What ran

- `survey.sh <dir> <list>`: shallow-clones each repo. Output in `out/survey.txt`.
- `classify.mjs <dir>...`: for each of the 33 bundles, records:
  - its root;
  - where React is declared;
  - its lockfiles;
  - whether a source file outside `components/ui/` imports from it, either relatively or through `@/` (which Make maps to `./src` in `vite.config.ts`);
  - its router;
  - its MUI imports.

  Output in `out/classify.txt`.
- `make-check.mjs`: runs the repo's own readers on a bundle, as is and on a copy:
  - readers: `choosePath`, `reactKind`, `codeLibraryDir`, `readReact`, `usedFamilies`, `projectPins`;
  - the copy has React moved into `dependencies` and a stand-in `components.json`.
- `sim-prep.mjs`: prepares a copy for the Generic Adapter:
  - a stand-in `components.json` with a root-relative `aliases.ui`;
  - the lock's `tw-animate-css` moved to the Adapter's pin.
- `patha-check.mjs`: runs path A's `extract` on a copy, first run with no answers.
- The no-lockfile remedy, run on a copy of smart-parking: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` (npm 11.19.0, 60 s, no scripts run).

Nothing was installed globally. Only that `npm install --package-lock-only` touched the network beyond `git clone`.

## Results

**The 33 bundles**, all named `@figma/my-make-file` except where the package.json is invalid:

| Kind | Bundles | Detail |
|---|---|---|
| React + Tailwind + shadcn | 12 | a source file outside `src/app/components/ui/` imports it |
| React + Tailwind, no Code Library | 17 | 10 carry the folder unused; 7 have no folder |
| Plain HTML + JS, Tailwind built by Vite | 2 | rewritten from Make |
| React + CSS-in-JS | 1 | `@mui/material`: 31 importing files, no ui folder |
| Invalid package.json | 1 | it holds a committed diff |

- **Where React is declared:**
  - an optional peer only: 15;
  - `dependencies`: 15;
  - not declared: 2, the plain HTML ones.
- **Lockfiles:**
  - `package-lock.json`: 23;
  - `pnpm-lock.yaml`: 4;
  - both: 3;
  - none: 2 (smart-parking, JuanCamiloTorres15/PROYECTO-2.0).
- **Locks resolve React:** every lock of a bundle that declares React resolves it, at 18.3.1, or 19.2.8 in one. Often it is `peer: true`, pulled in by react-dom and Radix.
- **`pnpm-workspace.yaml`:** 11 carry one at the bundle's own root.
- **Routers:**
  - a data router: 11. In every one, `createBrowserRouter` sits in `routes.ts(x)` and App.tsx passes it to `<RouterProvider>`;
  - JSX `<Routes>`: 7;
  - none: 14.
- **Routers of the 12 shadcn ones:** data 5, JSX 3, none 4.
- **Import forms that reach the folder**, counted across all bundles:

  | Form | Count |
  |---|---|
  | `@/app/components/ui/…` | 322 |
  | `../ui/…` | 197 |
  | `../components/ui/…` | 129 |
  | `./ui/…` | 102 |

**The repo's readers on lost-found, smart-parking and portfolio** (`make-check.mjs`):

- **As is:**
  - smart-parking and lost-found: `choosePath` refuses "plain HTML, with no React", and `reactKind` is null;
  - portfolio, whose React is also in `dependencies`: path A and `react-vite`.
- **With React in `dependencies`:**
  - `codeLibraryDir` falls back to `src/components/ui/`, which is wrong for Make;
  - `readReact` reads one screen, `index`, on lost-found, because its data router is in another file.
- **With a stand-in `components.json` as well:**
  - `usedFamilies` is `[]`;
  - `--all` gives 46 families;
  - `projectPins`: "the project resolves tw-animate-css@1.3.8, but the Adapter pins tw-animate-css@1.4.0".

**The Generic Adapter on a lost-found copy:**
- **Foundations fail on Make's theme:**
  - with `index.css`: no `@theme --font-sans`;
  - with `theme.css`: `--radius-md: calc(var(--radius) - 2px)` "is not a rem or px length".
- **After a simulated fix**, both pass:
  - the fix: one flattened stylesheet, radius as `calc(var(--radius) * 0.8)`, and a `--font-sans`;
  - Foundations: 72 colours converted, 96 utilities matched;
  - Button: 24 variants, with 15 Drafted values requested.

**Path A's extract** (`patha-check.mjs`):

| Bundle | Requests | Touch `components/ui` | Skipped (in the folder) |
|---|---|---|---|
| portfolio | 21 | 2 | 90 (78) |
| lost-found | 28 | 3 | 82 (80) |

smart-parking throws: no `package-lock.json`.

**The no-lockfile remedy on smart-parking:**
- The new lock resolves:
  - react 18.3.1 (`peer`);
  - tailwindcss 4.1.12 with sha512;
  - tw-animate-css 1.3.8;
  - vite 6.3.5.
- `projectPins` then fails only on the tw-animate-css pin. With that moved, it passes, taking tailwindcss 4.1.12 at the lock's integrity.
