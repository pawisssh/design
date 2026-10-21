# Which kinds of Prototype do vibe-coding tools produce by default?

Research for [pawisssh/design#319](https://github.com/pawisssh/design/issues/319). Map: [#318](https://github.com/pawisssh/design/issues/318). Vocabulary follows `GLOSSARY.md` (Prototype, Component Family, Design System, Handoff). A **kind** of Prototype here means its framework plus its styling. It is a working word for this note, not a glossary term.

Researched 2026-10-22. A claim from a page that shows its own last-updated date carries that date. Any other claim is dated by retrieval, 2026-10-22. The repo side is read at commit `1594a3f`. Each claim names where it comes from:

- **docs**: the tool's own documentation, help centre or blog.
- **template**: a file the tool itself writes into each project, such as Bolt's `.bolt/` folder, or the package name its starter carries.
- **sample**: one public repo exported from the tool, pinned to a commit. A sample shows what one project held at that commit. Its owner may have changed it after export.

## Answer

1. **Most tools default to one kind: React + Tailwind + shadcn/ui, with lucide icons.**
   - v0, Lovable (both its templates), Replit Agent, Figma Make and Base44 write this kind.
   - Bolt and Google AI Studio write React + Tailwind with no component library, also with lucide icons.
   - Claude writes plain HTML by default.
   - Cursor and Claude Code have no default of their own. They follow the repo they are opened on.
   - No tool defaults to Carbon or to SCSS.

2. **The tools side by side.** The cell's label says where each value comes from.

   | Tool | Framework / build tool | Styling | Component library | Default icons | Source export | Sample repo (pinned) |
   | --- | --- | --- | --- | --- | --- | --- |
   | v0 | Next.js App Router, TypeScript (docs, 2026-10-21) | Tailwind CSS (docs); v4 in sample | shadcn/ui (docs) | lucide (sample: `iconLibrary` in `components.json`) | Code export, two-way GitHub sync, a zip download through the Platform API (docs) | [sunnydev07/patna-run-club-website](https://github.com/sunnydev07/patna-run-club-website/tree/10578937638823e5e3cdaabba34cb8f053caa557) |
   | Lovable, projects from 2026-05-13 | TanStack Start on Vite, server-rendered (docs) | Tailwind v4 (sample) | shadcn/ui (sample) | lucide (sample) | Download codebase `.zip` on paid plans; Git sync to a new repo on GitHub, GitLab or Bitbucket (docs) | [cgcarlosg/inventory](https://github.com/cgcarlosg/inventory/tree/df38065496a09a271443bf79e19558f5f884dbb6) |
   | Lovable, older projects | React + Vite, react-router-dom (docs; router from sample) | Tailwind v3 (sample) | shadcn/ui (sample) | lucide (sample) | as above | [Walbrkt/HackBerlin_Solar](https://github.com/Walbrkt/HackBerlin_Solar/tree/5deef2d7c820e4f118cda1499179c008797ce380) |
   | Bolt | Vite + React + TypeScript, no router (template `bolt-vite-react-ts`) | Tailwind v3 (template) | none (template) | lucide (template) | Download as zip; Open in StackBlitz; GitHub (docs) | [malDuffin/free-web-tuner](https://github.com/malDuffin/free-web-tuner/tree/b3105a27fbf9e18887e9fb92054887f50fe9bef9) |
   | Replit Agent | pnpm workspace: a React + Vite app beside an Express API server, routed with wouter (sample) | Tailwind v4 (sample) | shadcn/ui (sample) | lucide, plus react-icons (sample) | Download as zip; GitHub through the Git pane with two-way sync (docs) | [hammad986/simple_foundation_website](https://github.com/hammad986/simple_foundation_website/tree/585175d1eb22af95307333a0c8ab40f795a34e5c) |
   | Figma Make | React (docs, 2026-10-13) on Vite (sample) | Tailwind v4 (sample) | shadcn/ui files with no `components.json`, plus Material UI in `package.json` (sample) | lucide (sample) | Download a `.zip` with a Full or Dev seat (docs, 2026-10-21); push to GitHub (docs, 2026-10-01) | [sushmitha2127-collab/smart-parking](https://github.com/sushmitha2127-collab/smart-parking/tree/0a7d8319ea82214c37b51d958494855499c1a1f2) |
   | Google AI Studio (Build mode) | React frontend and a Node.js server (docs, 2026-10-20); Vite, no router (sample) | Tailwind v4 (sample) | none (sample) | lucide (sample) | ZIP download; two-way GitHub sync (docs, 2026-10-20) | [Anirudhh1738/maincs1](https://github.com/Anirudhh1738/maincs1/tree/7f2c1554884b2c9efc56694f3d6116c6b72e6395) |
   | Base44 | React + Vite + React Router (docs); JavaScript, not TypeScript (sample) | Tailwind CSS (docs); v3 in sample | shadcn/ui (docs) | lucide (sample) | Two-way GitHub sync; a one-time eject to a local copy (docs) | [shahata/demo-333](https://github.com/shahata/demo-333/tree/678e21998cc9b7f489f344390a7bc7dc448c248b) |
   | Claude (chat artifacts, Claude Design) | Plain HTML: a single self-contained page (docs, 2025-11-12 and retrieved) | inline CSS (docs) | none | none stated | Legacy artifacts: view, copy or download the code. Designs: `.zip`, PDF, PowerPoint or standalone HTML (docs) | none: artifacts live on claude.ai |
   | Cursor, Claude Code | No default: they work in the folder or repo you open (docs) | follows the repo | follows the repo | follows the repo | none needed: the code is local | none |

3. **What this means for the map.** The map lists the owner's own Prototypes:
   - `batch-sell-main`: Vite + React 19 + Tailwind v4, lucide;
   - `health-check-main`: plain HTML;
   - `health-check-management-main`: Vite + React 19 + Carbon + SCSS.

   Against those, the tools rank the kinds this way:
   - **React + Tailwind + shadcn/ui** is the kind most tools hand over. Weight it highest.
   - **React + Tailwind without shadcn/ui** is the default of Bolt and AI Studio. Weight it second. `batch-sell-main` has the same shape as the AI Studio sample: Vite, React 19, Tailwind 4, lucide, no router. Bolt's starter is the same kind on Tailwind 3.
   - **Plain HTML** is Claude's default, and `health-check-main` is one. Only one tool family produces it, but that family is the owner's own tool.
   - **React + Carbon + SCSS** is no tool's default. It appears only when someone asks for Carbon. Weight it by the owner's own projects, not by the tools.
   - **Vue, Svelte, Angular and others** are no tool's default either. Bolt keeps starters for Angular, Vue and Qwik, and v0, Replit and Figma Make use other frameworks when asked. Lovable's design systems are React only. They rank below every React kind.

4. **Within React + Tailwind, styling is not what splits the tools.** The repo's gates split them by four other things:
   - the Tailwind major version;
   - the lockfile;
   - the framework and router;
   - where the app sits in the repo.

   The table below runs the repo's own `choosePath` (`skills/vibe-to-figma/scripts/path.mjs`) read-only on each pinned sample. It then reads the other gates by hand. No sample was run through `/vibe-to-figma` or `/to-handoff`. So "stops at" means the first of the gates checked here that the sample does not meet, by the code at `1594a3f`. Other steps may run before that gate. For example, path A runs `extract.mjs` before the Adapter's Tailwind check, and `extract.mjs` was not read end to end.

   | Sample | `choosePath` | Tailwind resolved | Lockfile | React reader (`to-handoff/scripts/react.mjs`) | First gate it stops at |
   | --- | --- | --- | --- | --- | --- |
   | v0 | shadcn | 4.3.3 | `package-lock.json` and `pnpm-lock.yaml` | Next App Router, read | none of those checked |
   | Lovable, new | shadcn | ^4.2.1 (no npm lockfile) | `bun.lock`, `bun.lockb` | Vite kind with no `index.html` | no `package-lock.json` (`adapter-generic/scripts/sources.mjs:68`). The reader also stops at `react.mjs:484`, because TanStack Start has no `index.html`. |
   | Lovable, older | shadcn | 3.4.17 | `package-lock.json` | Vite + react-router-dom, read | Tailwind 3 (`sources.mjs:72`, the Adapter compiles Tailwind 4 only) |
   | Bolt | A | 3.4.17 | `package-lock.json` | Vite, no router | Tailwind 3 (`sources.mjs:72`) |
   | Replit, repo root | refused, no React | — | `pnpm-lock.yaml` | — | `path.mjs:67`: the root `package.json` is the workspace's and has no React |
   | Replit, `artifacts/hopebridge` | shadcn | `catalog:` (pnpm) | none in the folder | Vite; wouter routes are not read (`react.mjs:30` knows react-router only) | no `package-lock.json` (`sources.mjs:68`) |
   | Figma Make | refused, no React | 4.1.12 (no lockfile) | none | refused (`react.mjs:65`) | `path.mjs:62,67`: React is declared only in `peerDependencies` (optional), and the gate reads `dependencies` and `devDependencies` |
   | AI Studio | A | 4.3.1 | `package-lock.json` | Vite, no router | none of those checked |
   | Base44 | shadcn | 3.4.19 | `package-lock.json` | Vite + react-router-dom; `.jsx` is read (`react.mjs:24`) | Tailwind 3 (`sources.mjs:72`) |
   | Claude | refused | — | — | — | `path.mjs:60`: plain HTML, with no `package.json` |

   The Generic Adapter calls `projectPins` (`sources.mjs:64`) from `foundations.mjs:121`, `components.mjs:169` and `preview.mjs:142`. So both Vibe-to-Figma paths need a `package-lock.json` that resolves Tailwind 4. Path A's Extracted Library also copies the Prototype's lockfile entries (`vibe-to-figma/scripts/extract.mjs:394`). Of the eight pinned samples, only v0's and AI Studio's pass every gate checked here.

5. **Some claims in the repo need correcting.**
   - The map's "What works today" table says `/vibe-to-figma` works for React + shadcn + Tailwind from v0 and Lovable. By the gates above, that holds for the v0 sample only. Neither Lovable template passes:
     - the new template has no `package-lock.json` and no `index.html`;
     - the older template is on Tailwind 3.
   - The same pairing appears in `skills/vibe-to-figma/SKILL.md`, which describes the shadcn path as React + shadcn + Tailwind as v0 and Lovable write it.
   - `choosePath` gives Figma Make's bundle a misleading refusal: plain HTML, with no React. The bundle is a React app whose React is declared only in optional `peerDependencies`.

## Findings

### v0

- **Default stack (docs, last updated 2026-10-21).**
  - The [Design Systems 2.0](https://v0.app/docs/design-systems-2) page says new chats start with a Next.js app that uses shadcn/ui and Tailwind CSS.
  - The [Design systems](https://v0.app/docs/design-systems) page calls shadcn/ui v0's default component system. It adds that v0 can use other libraries and frameworks when asked.
  - [Full-stack apps](https://v0.app/docs/full-stack-apps) says v0 defaults to Next.js and builds backend endpoints with App Router conventions.
  - The [FAQs](https://v0.app/docs/faqs) list Next.js, React, TypeScript, Tailwind CSS and shadcn/ui.
- **Export (docs, 2026-10-21).**
  - The FAQs say you can export the code to work locally.
  - A two-way [GitHub integration](https://v0.app/docs/github) keeps a repo in sync.
  - The Platform API has a download endpoint for a chat version, as a zip.
- **Icons (sample).** The docs do not name an icon set.
  - The sample's `components.json` sets `iconLibrary` to `lucide`.
  - Its `package.json` lists `lucide-react` 0.454.
- **Sample.** [sunnydev07/patna-run-club-website](https://github.com/sunnydev07/patna-run-club-website/tree/10578937638823e5e3cdaabba34cb8f053caa557), created 2026-07-26.
  - Its package name is `my-v0-project`.
  - It has Next 16.0.10, React 19.2, Tailwind 4 through `@tailwindcss/postcss`, and shadcn/ui in the `new-york` style.
  - It holds both `package-lock.json` and `pnpm-lock.yaml`.
  - The repo's own fixture [`skills/to-handoff/test/fixtures/v0-app`](../../skills/to-handoff/test/fixtures/v0-app) has the same kind.

### Lovable

- **Framework (docs).**
  - The [FAQ](https://docs.lovable.dev/introduction/faq) says apps created from 2026-05-13 use TanStack Start, rendered on the server. For Enterprise workspaces the date is 2026-06-22.
  - Older apps use React + Vite and render in the browser.
  - Lovable offers no choice of framework. The database is PostgreSQL, through its built-in backend or Supabase.
  - [Upgrade to TanStack Start](https://docs.lovable.dev/features/upgrade-to-tanstack-start) gives the same dates.
  - Lovable's blog post [Building apps using TanStack Start](https://lovable.dev/blog/building-apps-using-tanstack-start) announced the switch.
- **Design systems (docs).** [Design systems](https://docs.lovable.dev/features/design-systems) are supported for React only, not for Vue, Angular or Svelte. Tokens are read from a top-level styling file such as `src/index.css` or a `tailwind.config`.
- **Export (docs).**
  - On paid plans, anyone with edit access can download the whole project as a `.zip` with Download codebase ([code mode](https://docs.lovable.dev/features/code-mode)). Enterprise admins can restrict this.
  - Git sync to GitHub (all plans), GitLab or Bitbucket creates a new repository. It cannot connect an existing one.
- **Styling, component library, icons (sample).** The docs do not name them.
- **Sample, new template.** [cgcarlosg/inventory](https://github.com/cgcarlosg/inventory/tree/df38065496a09a271443bf79e19558f5f884dbb6), created 2026-09-11.
  - Its package name is `tanstack_start_ts`.
  - It has `@tanstack/react-start` 1.162, Vite 7.3, React 19.2, and Tailwind 4.2 through `@tailwindcss/vite`.
  - Its `components.json` is in the `new-york` style, uses `src/styles.css` and names `lucide` as the icon library.
  - It has the full `src/components/ui` set, file routes in `src/routes` and a generated `routeTree.gen.ts`.
  - Its lockfiles are `bun.lock` and `bun.lockb`. It has no `package-lock.json` and no `index.html`.
- **Sample, older template.** [Walbrkt/HackBerlin_Solar](https://github.com/Walbrkt/HackBerlin_Solar/tree/5deef2d7c820e4f118cda1499179c008797ce380), created 2026-04-25.
  - Its package name is `vite_react_shadcn_ts`.
  - It has React 18.3, Tailwind 3.4, lucide-react 0.462 and react-router-dom.

### Bolt

- **Default stack (docs).** The docs name no default.
  - [Supported technologies](https://support.bolt.new/reference/supported-technologies) says Bolt focuses on JavaScript-based web technologies. It accepts any frontend JavaScript framework and only JavaScript backends, and builds mobile apps through Expo.
  - [Intro to Bolt](https://support.bolt.new/get-started/intro-bolt) says the user can choose languages and frameworks.
- **Default stack (template).** Bolt writes two files into each project:
  - `.bolt/config.json` names the starter template. In public repos from 2026 the common value is `bolt-vite-react-ts`. Others seen are `vite-react-shadcn`, `nextjs-shadcn`, `vite-react`, `bolt-expo`, `angular`, `vite-vue-ts` and `qwik`.
  - `.bolt/prompt` tells the model that the template supports JSX with Tailwind classes, React hooks and lucide-react icons. It also says not to install other UI theme or icon packages unless needed.
- **Export (docs).**
  - [Manage your projects](https://support.bolt.new/managing-projects): download the project as a zip from the project title menu, or open it in StackBlitz.
  - GitHub through the [Git integration](https://support.bolt.new/integrations/git).
- **Sample.** [malDuffin/free-web-tuner](https://github.com/malDuffin/free-web-tuner/tree/b3105a27fbf9e18887e9fb92054887f50fe9bef9), created 2026-03-24, template `bolt-vite-react-ts`.
  - Its package name is `vite-react-typescript-starter`.
  - It has Vite 5.4, React 18.3, TypeScript, Tailwind 3.4 with `tailwind.config.js`, and lucide-react 0.344. It has no shadcn/ui and no router.
  - It has a `package-lock.json`.
  - A second repo, [troyhoch-cmd/ezlegal.ai-bolt-eca93c73](https://github.com/troyhoch-cmd/ezlegal.ai-bolt-eca93c73), created 2026-04-22, carries the same starter versions.
- **Not current.** The open-source [stackblitz/bolt.new](https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts) system prompt, last pushed 2024-12-17, tells the model to prefer Vite. It is the 2024 open-source release, not the current product's prompt.

### Replit Agent

- **Default output (docs).**
  - [Web Apps](https://docs.replit.com/features/artifact-types/web-apps) says web apps are Replit's default output type, and every web app gets a frontend and a backend.
  - The blog post [Agent on any framework](https://replit.com/blog/agent-on-any-framework), 2025-09-02, names curated app types such as HTML, CSS, React and shadcn/ui. Other frameworks are available on request.
  - The docs name no styling or icon set.
- **Export (docs).** [Projects and files](https://docs.replit.com/help/projects-and-files): Download as zip from the file tree's menu, and GitHub through the Git tool with auto-sync.
- **Sample.** [hammad986/simple_foundation_website](https://github.com/hammad986/simple_foundation_website/tree/585175d1eb22af95307333a0c8ab40f795a34e5c), created 2026-07-20.
  - It is a pnpm workspace with a pnpm version catalog (`catalog:`).
  - `artifacts/hopebridge` holds React 19.1, Vite 7.3, Tailwind 4.1 through `@tailwindcss/vite`, shadcn/ui in the `new-york` style (no `iconLibrary` key), lucide-react, react-icons and wouter routing.
  - `artifacts/api-server` holds Express 5.
  - `replit.md` lists the stack.
  - Its lockfile is `pnpm-lock.yaml`.

### Figma Make

- **Default framework (docs).**
  - [Working with React](https://help.figma.com/hc/en-us/articles/43639024392855-Working-with-React), updated 2026-10-13, says React is the default framework for Make files and any web framework can be used.
  - [Troubleshoot in Figma Make](https://help.figma.com/hc/en-us/articles/31304610458647-Troubleshoot-in-Figma-Make), updated 2026-10-20, says point-and-edit works only on projects built with Tailwind CSS and shadcn/ui, not with other libraries such as Material UI.
- **Export (docs).**
  - [Edit the code](https://help.figma.com/hc/en-us/articles/33649966245783-Edit-the-code-of-a-functional-prototype-or-web-app), updated 2026-10-21: download a `.zip` of all the Make file's files. Viewing and downloading code needs a Full or Dev seat.
  - [Push from Figma Make to GitHub](https://help.figma.com/hc/en-us/articles/35463818346647-Push-from-Figma-Make-to-GitHub), updated 2026-10-01, says push is available on all plans. Pushes go to the repo's default branch.
- **Sample.** [sushmitha2127-collab/smart-parking](https://github.com/sushmitha2127-collab/smart-parking/tree/0a7d8319ea82214c37b51d958494855499c1a1f2), created 2026-04-12.
  - Its package name is `@figma/my-make-file`, and the README calls it a code bundle.
  - It has Vite 6.3.5 and Tailwind 4.1.12 (in `devDependencies`).
  - React 18.3.1 sits only in `peerDependencies`, marked optional.
  - It has Radix UI with class-variance-authority. `src/app/components/ui` holds shadcn/ui files, `ATTRIBUTIONS.md` credits shadcn/ui, and the CSS is a `default_shadcn_theme.css`.
  - It has lucide-react 0.487 (26 imports in `src`).
  - `@mui/material` 7.3.5 and `@emotion/react` are listed, but nothing in `src` imports them.
  - It has no `components.json` and no lockfile.
  - Two other Make bundles carry the same `package.json`: package name, `@mui/material` 7.3.5, lucide-react 0.487.0, Tailwind 4.1.12, and React in `peerDependencies`. They are [Maria23-17/Lost_and_Found1](https://github.com/Maria23-17/Lost_and_Found1) and [cristiancarrasco-git/cristian-co-portfolio](https://github.com/cristiancarrasco-git/cristian-co-portfolio).
    - Both also hold a `package-lock.json`, probably from a local `npm install` after export.
    - The second one also lists React in `dependencies`.

### Google AI Studio, Build mode

- **Default stack (docs).** [Build mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode), last updated 2026-10-20:
  - Web apps are the default, and native Android is an option.
  - A web app gets a React frontend by default and a Node.js server side.
  - The docs do not name the styling or icons.
- **Export (docs, 2026-10-20).** Export the code as a ZIP; two-way sync with a new or existing GitHub repo; deploy to Cloud Run.
- **Sample.** [Anirudhh1738/maincs1](https://github.com/Anirudhh1738/maincs1/tree/7f2c1554884b2c9efc56694f3d6116c6b72e6395), created 2026-06-17.
  - Its package name is `react-example`.
  - It has Vite 6.2, React 19, TypeScript 5.8, Tailwind 4.1 through `@tailwindcss/vite`, lucide-react 0.546, `motion` and `@google/genai`. It has no shadcn/ui and no router.
  - It has a `package-lock.json`.

### Base44

- **Default stack (docs).**
  - The [app code introduction](https://docs.base44.com/developers/app-code/overview/introduction) lists React with React Router, Vite, Tailwind CSS and shadcn/ui.
  - [Project structure](https://docs.base44.com/developers/app-code/overview/project-structure) calls Base44 apps standard React apps built with Vite, with a `tailwind.config.js`.
- **Export (docs).**
  - [GitHub integration](https://docs.base44.com/developers/app-code/local-development/github) with two-way sync.
  - Eject, which makes a one-time local copy with a new app id.
- **Sample.** [shahata/demo-333](https://github.com/shahata/demo-333/tree/678e21998cc9b7f489f344390a7bc7dc448c248b), created 2026-10-14.
  - Its package name is `base44-app`.
  - It has Vite 6.1, React 18.2, Tailwind 3.4 and lucide-react 0.475.
  - Its `components.json` sets `tsx: false`, so the source is `.jsx` with a `jsconfig`.
  - It has a `package-lock.json`.

### Claude: artifacts, Claude Design, Claude Code

- **Chat artifacts (docs).** [What are artifacts](https://support.claude.com/en/articles/9487310), retrieved 2026-10-22:
  - Artifacts made in a chat before 2026-09-16 are now legacy, and no new legacy artifacts can be made. Their code can still be viewed, copied or downloaded.
  - New artifacts are either pages or start from a template (Docs, Slides, Design). Designs export as `.zip`, PDF, PowerPoint or standalone HTML.
- **Default frontend (docs).** Anthropic's post [Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills), 2025-11-12, says that when asked for a frontend, Claude builds a single HTML file with CSS and JS, because that is what renders as an artifact.
  - The opt-in [web-artifacts-builder](https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md) skill builds React + TypeScript + Vite + Tailwind + shadcn/ui instead. It then bundles everything into one HTML file.
- **Claude Code artifacts (docs).** [Artifacts](https://code.claude.com/docs/en/artifacts), retrieved 2026-10-22:
  - An artifact is one self-contained page with no backend, published from an `.html` or `.md` file.
  - It runs under a strict Content Security Policy.
  - Scripts may load only from a few CDNs.
- **Claude Design (docs).** [Get started with Claude Design](https://support.claude.com/en/articles/14604416):
  - A design is a canvas of artboards.
  - `/design` hands it to Claude Code.
  - The standalone claude.ai/design closes on 2026-12-14.
- **Sample.** There is none: artifacts live on claude.ai. A Prototype of this kind is a plain HTML file.

### Cursor and Claude Code as editors

They scaffold nothing by default. They open an existing folder or repo and work in it, so a Prototype's kind follows that repo or the prompt ([Cursor quickstart](https://cursor.com/docs/get-started/quickstart)). The code is local, so there is nothing to export.

### Not covered

- **GitHub Spark.** Its public template [github/spark-template](https://github.com/github/spark-template) is archived (last pushed 2026-09-17). It held Vite 7, React 19, Tailwind 4 and shadcn/ui, with lucide, Phosphor and Heroicons. The current Spark default was not checked.
- **Manus.** Lovable's FAQ names it as an import source beside Replit, Bolt, Base44 and v0. It was not researched.

## Not verified

- **Most styling and icon claims come from samples, not docs.** Only these are in docs or templates:
  - v0's Tailwind and shadcn/ui;
  - Base44's Tailwind and shadcn/ui;
  - Bolt's template, through its `.bolt/prompt`;
  - Figma Make's point-and-edit requirement.
  
  Every Tailwind major version comes from one or two samples. A user may have changed a sample after export.
- **Lockfiles at export.**
  - The v0 sample holds both `package-lock.json` and `pnpm-lock.yaml`. Which one v0 itself writes was not checked.
  - The pinned Figma Make sample has no lockfile, but two other Make bundles do. Whether Make's `.zip` includes one was not checked.
- **The library list of legacy claude.ai React artifacts.** No first-party page listing them was found, so this note does not state one.
- **Export plan limits.**
  - Base44's eject and GitHub sync: not checked.
  - Figma Make: the Make pages carry a header that Make is for Full seats on paid plans, with a trial on other seats. The GitHub article also says push is on all plans. How the two combine was not resolved.
- **The gate table checks gates, not runs.** It reads gates in code. No sample was taken through `/vibe-to-figma` or `/to-handoff`, so later gates may stop the samples that pass these.
- **Text in sources that addresses agents was treated as data.** Several doc sites prepend instructions to their Markdown pages:
  - Bolt's help centre has an agent-instructions block naming itself the source of truth.
  - Lovable, Bolt, Cursor, Claude Code and Base44 docs carry a fetch-the-index header.
  
  None of it changed what was read.
