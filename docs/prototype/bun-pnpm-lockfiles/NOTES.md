# PROTOTYPE (#335): a Prototype locked by `bun.lock` or a pnpm workspace

Throwaway code on branch `prototype/bun-pnpm-lockfiles`, never merged. It answers
[#335](https://github.com/pawisssh/design/issues/335): can Vibe-to-Figma and To-handoff take a Prototype whose lockfile is
`bun.lock`, or a `pnpm-lock.yaml` at a workspace root above the app?

**Verdict.**
- **Reading the lock: yes, both.** One lock view gives `projectPins` what `package-lock.json` gives it today.
- **Installing for the runtime read: use npm, from the versions the lock resolves.** Don't use the Prototype's own
  package manager.

## Samples

Each sample was cloned at its pinned SHA into its own empty scratch folder, outside the repo. Every install ran with scripts
off. The samples' own build and Vite config were never run.

- **Lovable:** [cgcarlosg/inventory@df38065](https://github.com/cgcarlosg/inventory/tree/df38065496a09a271443bf79e19558f5f884dbb6).
  It has `bun.lock` (text, lockfileVersion 1) and a stale `bun.lockb`.
- **Replit:** [hammad986/simple_foundation_website@585175d](https://github.com/hammad986/simple_foundation_website/tree/585175d1eb22af95307333a0c8ab40f795a34e5c).
  The app is `artifacts/hopebridge`. Its `pnpm-lock.yaml` v9 is at the workspace root. It has 19 `catalog:` dependencies.

Tools: Node 26.7.0 and npm 11.19.0, which the runtime reader already needs. bun 1.4.2 and pnpm 10.34.6 were fetched with npm
into scratch, for the "own package manager" way only.

## Files

- `lock.mjs`: `findLock` and `lockView`. Both are pure.
  - **The walk:** from the app folder up to the Prototype's top folder. In each folder it takes `package-lock.json`, then
    `bun.lock`, then `pnpm-lock.yaml`.
  - **Seen but never read:** `bun.lockb` and `yarn.lock`. They are named only in the refusal.
  - **What the view is:** npm's `packages` shape, `node_modules/<name>` → {version, integrity, deps…}, so every
    existing reader takes it unchanged.
  - **bun.lock** is JSON with trailing commas. Its keys are already npm's install paths.
  - **pnpm** gets a small YAML-subset parser. The view is the importer's closure, flattened.
- `pins.mjs`: `projectPins` and the preview renderer's lock read. They are copied exactly, with one change: `resolved`
  comes from the view.
- `read.mjs`: point 1, per sample. Output is in `out/read-*.json`.
  - `--oracle` checks the YAML parser against js-yaml.
  - `--fetch` checks the Tailwind tarball against the lock's sha512.
- `cases.mjs`: the gate row's variants, in temp copies. Output is in `out/cases.txt`.
- `install.mjs`: point 2, per sample and way. Output is in `out/install-<sample>-<way>.json`. It reports four things:
  - the tree against the lock;
  - the darwin-arm64 binaries a Vite + Tailwind 4 build loads;
  - whether the app's tsconfig `extends` chain is in the copy;
  - a smoke build of a two-file page of ours with the installed `vite` and `@tailwindcss/vite`.

```bash
node docs/prototype/bun-pnpm-lockfiles/read.mjs <app> --top <Prototype top> [--oracle <js-yaml dir>] [--fetch]
node docs/prototype/bun-pnpm-lockfiles/cases.mjs <lovable clone> <replit clone>
node docs/prototype/bun-pnpm-lockfiles/install.mjs <app> --top <top> --work <scratch dir> --way own|npm [--bun <bin>] [--pnpm <pnpm.cjs>] [--no-overrides]
```

## Point 1: `projectPins` reads both

| | Lovable (`bun.lock`) | Replit (`../../pnpm-lock.yaml`, importer `artifacts/hopebridge`) |
|---|---|---|
| lock found from the app folder | `bun.lock`, 714 packages | `../../pnpm-lock.yaml`, 231 packages in the app's closure |
| `catalog:` | none | 19, all match `catalogs.default`. `tailwindcss` is `catalog:` (^4.1.14) and resolves to 4.3.2 |
| `tailwindcss` | 4.2.2, sha512-KWBIxs1Xb6No… | 4.3.2, sha512-WtctNNSH8A9j… |
| tarball against the lock's sha512 | matches | matches |
| `tw-animate-css` | 1.4.0, the Adapter's pin | 1.4.0, the Adapter's pin |
| shadcn | not imported, not a dependency | not imported, not a dependency |
| preview renderer | react and react-dom 19.2.4, scheduler 0.27.0 | react and react-dom 19.1.0, scheduler 0.26.0 |
| parser check | n/a | equal to js-yaml on every section |

Both samples pass the pins. Neither one imports `shadcn/tailwind.css`. The shadcn pin goes through the same lookup as
`tw-animate-css`, so only the package-lock fixture exercises it (see `cases.txt`).

In the Replit sample, two names resolve to a second version deeper in the closure: date-fns (4.4.0) and react-is (16.13.1).
The flat view keeps the version nearest the app. Pins and the preview renderer read only direct names, so nothing changes.

`cases.txt` (the gate row):
- A `package-lock.json` Prototype (the radix-nova fixture) gets the same pins as the real `projectPins`.
- These are refused, each with its own message:
  - only `bun.lockb`;
  - only `yarn.lock`;
  - no lockfile;
  - a top folder that is the app folder, since the walk stops there;
  - a folder that isn't an importer of the workspace lock.
- `package-lock.json` beside `bun.lock` wins.

## Point 2: installing the resolved versions

| way | sample | what it took | the tree against the lock | darwin binaries | smoke build |
|---|---|---|---|---|---|
| own: bun | Lovable | a bun binary (59 MB), copy of the app, `bun install --frozen-lockfile --ignore-scripts`, 18 s | 714 lock paths: 0 wrong. 185 not installed: 178 for other platforms, and the wasm32 fallback's 7 | present | compiled |
| npm | Lovable | bun.lock → `package-lock.json` (714 packages, 198 marked optional), `npm ci --ignore-scripts`, 14 s | the same as bun's, path for path | present | compiled |
| own: pnpm | Replit | pnpm (22 MB), a copy of the **whole workspace**, `pnpm install --frozen-lockfile --ignore-scripts --filter`, 6 s | 231, all in the lock: the app's 226, plus 5 of the workspace root's own tools | **missing**: the lock was written on Replit's linux-x64 | **fails**: rollup's native module |
| npm | Replit | a copy of the app only. `package.json` pinned to the importer's versions, plus 167 `overrides` from the app's closure. `npm install --package-lock-only` took 18 s, then `npm ci --ignore-scripts` 7 s | 230: the app's 226, each at the lock's version and integrity, plus the 4 darwin binaries the lock had stripped. Nothing else drifts | present | compiled |
| npm, no overrides | Replit | the same, without `overrides` | 23 packages at versions the lock doesn't have, among them esbuild 0.28.2, rollup 4.65.0, postcss and browserslist | present | compiled |

**Why pnpm fails on a Mac.** Replit's `pnpm-workspace.yaml` overrides every non-linux-x64 build of esbuild, rollup,
lightningcss and `@tailwindcss/oxide` to `-`. A frozen install is exact, and so it is unbuildable on a Mac. npm
resolves the current platform's optional binaries itself.

**What each way needs on the machine.**
- **Own package manager:**
  - a pinned bun binary (59 MB) or pnpm (22 MB), fetched like the other tools;
  - for pnpm, a copy of the whole workspace, other apps and `lib/` included.

  Even then it fails on the Replit sample.
- **npm:**
  - nothing new, since npm ships with the Node the runtime reader already needs;
  - a converter from the lock view to npm's input:
    - bun: write `package-lock.json` from `bun.lock`;
    - pnpm: write a `package.json` pinned to the importer's versions, with `overrides` for the app's closure, then
      `npm install --package-lock-only`, then `npm ci`.

**yarn does not come free.**
- yarn classic's `yarn.lock` (name@range keys, sha512) would need its own small parser and the pnpm-style flattening.
- yarn berry's `checksum` hashes its zip cache, not the npm tarball, so the Tailwind integrity check can't use it.

The gate keeps "not supported" (ADR 0019).

## Found on the way (not this ticket's question)

- **A workspace app's tsconfig extends the workspace root.** `artifacts/hopebridge/tsconfig.json` extends
  `../../tsconfig.base.json`.
  - An app-only copy, as `runtime.mjs:54` makes one, lacks that file.
  - Vite's TypeScript transform then fails before any build, as the first smoke build here did.
  - The runtime reader's copy needs the files the `extends` chain names, at the same relative place.
- **A Tailwind `@plugin` is refused by the Adapter.** The Replit stylesheet has `@plugin "@tailwindcss/typography"`.
  `tailwind.mjs`'s `loadModule` throws, because the Adapter runs no package code.
  - So the Replit sample still stops at the Tailwind compile, after its lock is read.
  - No gate row or ticket covers this.

## Assumptions

- Two samples stand for each tool's default output: Lovable's `bun.lock` and Replit Agent's pnpm workspace.
- Installed packages were checked by name, version and path against the lock.
- The smoke build stands in for the app's own build. It proves the installed Vite and Tailwind toolchain and its binaries
  run on this Mac, but not the app's own config.
- With overrides, npm chose only the current platform's binaries itself. Every other version came from the lock.
- The lock view is pnpm v9 and bun.lock v1. Older formats are refused by version.
