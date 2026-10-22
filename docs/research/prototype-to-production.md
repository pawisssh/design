# What must a Prototype's owner prepare so developers can build it for production, and who already helps?

Research for the question an owner asked: having built a Prototype with a prototyping tool (a Claude artifact, for example), what should go to developers so they can build it production-grade, which tools help, and has anyone built this on GitHub? Related: map [#318](https://github.com/pawisssh/design/issues/318). Each tool's default Prototype kind is [#319](https://github.com/pawisssh/design/issues/319)'s research, recorded in [ADR 0019](../adr/0019-a-prototype-reaches-component-sets-or-a-handoff-by-its-kind.md)'s table. Finding 2 here covers only each tool's way out (download, git, handoff) and what its docs say about production readiness. Vocabulary follows `GLOSSARY.md` (Prototype, Prototype kind, Handoff, Stand-in, Rendering, Off-system value, Drift, Sign-off, Contract, Design System, Code Library, Standard state, Extra state, To-handoff).

Two notes cover the ground around this one, and this note does not restate them:

- [design-handoff-contents.md](design-handoff-contents.md), "the earlier note" below: the design-side content of a Handoff (screens, states, copy, accessibility annotations, responsive behaviour, motion).
- [dev-ready-package.md](dev-ready-package.md): the package a developer needs around a feature (PRD, stories, flows, diagrams, API description, NFR targets, analytics), and which parts To-handoff could derive, must ask the owner for, or leaves to the developer. It was researched the same day, in parallel with this note.

This note covers what neither does: the build from a Prototype's *code* (what production work replaces in it), each prototyping tool's way out, and prior work on GitHub.

Researched 2026-10-22. The repo side is read at commit `1594a3f`, and rechecked at `ea4491c`, which adds ADR 0019, `dev-ready-package.md` and the glossary's From-Prototype, Prototype kind, Owner, Standard state and Extra state. `skills/to-handoff/` is unchanged between the two.

- `GLOSSARY.md`;
- the schema: `skills/to-handoff/handoff.schema.json`;
- the skill: `skills/to-handoff/SKILL.md`;
- what the React reader sets aside: `skills/to-handoff/scripts/react.mjs`;
- at the recheck: ADR 0019 and `docs/research/dev-ready-package.md`.

Notation:
- **unverified** marks a claim whose primary source I could not open;
- **unverified** (description only) marks a repo whose README I did not read (the claim rests on its one-line GitHub description);
- **Reasoning, not sourced** marks this note's own inference;
- a claim that something is absent means it is absent from the sources and searches listed here, not that it does not exist.

## Answer

1. **Developers need the owner's intent and decisions, not the Prototype's code.** The code is never handed to developers (GLOSSARY, Prototype). The tools' own docs agree that generated code is not production code as it stands:
   - v0 says its output can be incomplete or contain bugs, and that judging its fitness is the user's job (`V0-FAQ`);
   - Lovable lists what a team becomes responsible for when it leaves the platform: environments, CI/CD, hosting, databases and backups, auth and data isolation, secrets, and security audits (`LOVABLE-OWN`);
   - Lovable's scans say they do not replace a thorough security review (`LOVABLE-SEC`).

   Finding 1 sets out ten production areas, each from a primary source. For each it says what the owner decides and what the developer builds.

2. **Every tool's path out ends at a git repo or a download, never at a Handoff.**
   - v0 pushes to a private GitHub repo and publishes through pull requests (`V0-GH`).
   - Lovable syncs both ways with GitHub (`LOVABLE-GH`).
   - Bolt syncs with GitHub and downloads a zip (`BOLT-GIT`, `BOLT-PROJ`).
   - Replit is git-backed (`REPLIT-VC`).
   - Figma Make pushes one way to GitHub (`FIG-MAKE-GH`).
   - Claude's artifact help pages name no move-to-code feature. A Claude Code artifact is one page with no backend. Claude Code can read an artifact shared with you and save its full source locally (`CC-ARTIFACTS`).
   - Claude Design hands a design to Claude Code to continue from (`CLAUDE-DESIGN`).

   The production checks the tools ship are security scans (`LOVABLE-SEC`, `BOLT-SEC`, `REPLIT-PUBLISH`) and v0's warning on browser-exposed variables (`V0-SEC`).

3. **No repo in these searches turns a Prototype into a library-bound Handoff.** The nearest neighbours (Finding 3):
   - code-to-PRD skills, which reverse-engineer a codebase into page-by-page requirements and tell mock data from real API calls (the original lives in `alirezarezvani/claude-skills`, a collection with about 28,500 stars);
   - pm-ai-shipping (in `phuryn/pm-skills`, about 27,300 stars as a collection), which documents an AI-built app's architecture, flows, permissions, variables and test coverage, then audits the code against those documents;
   - production-readiness and security agent skills. One has over 1,000 stars (`raroque/vibe-security-skill`). Most have under 50 stars and a handful of commits;
   - runners and migration CLIs, such as `claude-artifact-runner` (581 stars, last commit 2025-11-21) and `lovable-eject`.

   Single production areas are filled by widely used general tools: axe-core, Lighthouse CI, gitleaks, OSV-Scanner, and Supabase's splinter.

4. **A Handoff has no key for any of the ten production areas, which fits its definition: it describes a feature, not its build.**
   - The nearest seam is `source.ignored`. The React reader lists there the API routes, middleware, catch-all routes, and private and parallel-route folders it sets aside (`react.mjs`). That is where a Prototype's server-side Stand-ins live; dev-ready-package's Finding 4 found request-access's stub route lost there. `NEXT-PROD` says authorization checks belong inside every server action, not in middleware alone.
   - The owner-side decisions in Finding 1 have no key at all. dev-ready-package already proposes asking the owner for NFR targets (accessibility, security, performance) and tracked events (its Group 2). Finding 1 adds two it does not list: who may do what, and which environments exist. Which data is real is partly held already, by `data[].source` (`mock`, `simulated` or `real`). Candidates are in "Against this repo".

5. **A Claude artifact reaches To-handoff as a file, not as a URL.** ADR 0019 records plain HTML + CSS classes as Claude's default Prototype kind, with a Handoff supported through the one-HTML-file reader. GLOSSARY still says To-handoff takes "an artifact URL", but the schema's `source.kind` allows only `html-file`, `react-next` and `react-vite`, and no reader takes a URL. The missing step is from the URL to a file (candidates, "Against this repo"):
   - an HTML artifact whose source Claude Code has saved locally, read as `html-file`;
   - a React artifact turned into a Vite project by `claude-artifact-runner`, read as `react-vite`, but only after a reader change: the React reader does not find the runner's routes.

6. **Among the keys generate never writes, only `data[].shape` has an outside source that could fill it. `a11y` has outside checks, but nothing that fills it.**
   - For `data[].shape`, code-to-PRD writes request and response requirements for endpoints that exist only as mock data, and v0's PRD page drafts API descriptions and database schemas. dev-ready-package proposes that generate write the key from the mock data's fields (its Group 1); these two are outside precedents for that proposal.
   - For `a11y`, axe-core can check the key's content but cannot author a focus order or labels. Its README says it finds about 57% of WCAG issues automatically ([axe-core](https://github.com/dequelabs/axe-core)), and the W3C says human evaluation is required (`WAI-EVAL`).
   - Nothing found fills `interactions`, `tokensToAdd` or `regions[].responsive`, or any of To-handoff's four out-of-scope items.
   - Two of those four (compiling Tailwind or cva classes, and icons as the icon property) bear on the Prototype kind that v0 and the artifact runner produce: React + Tailwind with shadcn/ui, and lucide icons in the runner.

## Sources

Every source was read on 2026-10-22. Where a page states its own update date, it is given in brackets. The sources are paraphrased, and any direct quote is a few words long. GitHub repositories in Finding 3 are cited by their URL in the table. Their metadata comes from the GitHub REST API.

Production practice (Finding 1):

- `NEXT-PROD` = https://nextjs.org/docs/app/guides/production-checklist (lastUpdated 2026-03-10)
- `NEXT-ENV` = https://nextjs.org/docs/app/guides/environment-variables (lastUpdated 2026-08-25)
- `NEXT-TEST` = https://nextjs.org/docs/app/guides/testing (lastUpdated 2026-02-03)
- `NEXT-OTEL` = https://nextjs.org/docs/app/guides/open-telemetry (lastUpdated 2026-08-06)
- `VITE-ENV` = https://vite.dev/guide/env-and-mode
- `SUPA-PROD` = https://supabase.com/docs/guides/deployment/going-into-prod
- `SUPA-KEYS` = https://supabase.com/docs/guides/api/api-keys
- `VERCEL-PROD` = https://vercel.com/docs/production-checklist (last_updated 2026-08-11)
- `VERCEL-ENV` = https://vercel.com/docs/deployments/environments (last_updated 2026-09-17)
- `OWASP-TOP10` = https://top10.owasp.org/2025 (OWASP Top 10, 2025 edition)
- `OWASP-INPUT` = https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- `OWASP-SECRETS` = https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- `WAI-EVAL` = https://www.w3.org/WAI/test-evaluate/ (updated 2026-08-12)
- `WEBDEV-CWV` = https://web.dev/articles/vitals (updated 2024-10-31)
- `GH-DEPREVIEW` = https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review
- `GH-LICENSE` = https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

Prototyping tools (Finding 2):

- `CLAUDE-ARTIFACTS` = https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- `CLAUDE-SHARE` = https://support.claude.com/en/articles/9547008-publish-and-share-artifacts
- `CC-ARTIFACTS` = https://code.claude.com/docs/en/artifacts
- `CLAUDE-DESIGN` = https://support.claude.com/en/articles/14604416-get-started-with-claude-design
- `CLAUDE-DESIGN-ACADEMY` = https://academy.claude.com/tutorials/using-claude-design-for-prototypes-and-ux
- `V0-DOCS` = https://v0.app/docs/llms.txt (the full docs as one file; its pages carry lastUpdated 2026-10-21; used for the PRD design page, the MCP server and the API)
- `V0-FAQ` = https://v0.app/docs/faqs
- `V0-GH` = https://v0.app/docs/github
- `V0-DEPLOY` = https://v0.app/docs/deployments
- `V0-SEC` = https://v0.app/docs/security
- `LOVABLE-GH` = https://docs.lovable.dev/integrations/github
- `LOVABLE-OWN` = https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership.md
- `LOVABLE-EXT` = https://docs.lovable.dev/tips-tricks/external-deployment-hosting.md
- `LOVABLE-SEC` = https://docs.lovable.dev/features/security.md
- `BOLT-INDEX` = https://support.bolt.new/llms.txt (the help centre's page index; used for Bolt Cloud hosting)
- `BOLT-GIT` = https://support.bolt.new/integrations/git.md
- `BOLT-PROJ` = https://support.bolt.new/managing-projects/projects-files.md
- `BOLT-SEC` = https://support.bolt.new/building/security.md
- `BOLT-TECH` = https://support.bolt.new/reference/supported-technologies.md
- `BOLT-DB` = https://support.bolt.new/bolt-cloud/database/advanced.md
- `REPLIT-VC` = https://docs.replit.com/learn/projects-and-artifacts/version-control.md
- `REPLIT-HELP` = https://docs.replit.com/help/projects-and-files (read through https://docs.replit.com/llms-full.txt)
- `REPLIT-ENT` = https://docs.replit.com/teams/enterprise-privacy-settings (read through https://docs.replit.com/llms-full.txt)
- `REPLIT-PUBLISH` = https://docs.replit.com/build/publish-your-app
- `REPLIT-SCANS` = https://docs.replit.com/features/security/agent-security-scans (read through https://docs.replit.com/llms-full.txt)
- `REPLIT-SECCHK` = https://docs.replit.com/learn/security-checklist.md
- `FIG-MAKE-CODE` = https://help.figma.com/hc/en-us/articles/33649966245783
- `FIG-MAKE-GH` = https://help.figma.com/hc/en-us/articles/35463818346647-Push-from-Figma-Make-to-GitHub
- `FIG-MAKE-BACKEND` = https://help.figma.com/hc/en-us/articles/34162517434007
- `FIG-MAKE-KITS` = https://help.figma.com/hc/en-us/articles/35946832653975
- `FIG-MCP` = https://developers.figma.com/docs/figma-mcp-server/
- `FIG-CC` = https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect
- `GH-SPARK` = https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com/
- `BUILDER` = https://www.builder.io/c/docs/key-concepts-fusion
- `ANIMA` = https://docs.animaapp.com/docs/getting-started
- `LOCOFY` = https://www.locofy.ai/docs/plugin/quickstart/

GitHub (Finding 3):

- `SPECKIT-EXISTING` = https://github.github.io/spec-kit/guides/existing-projects.html

## Findings

### 1. What developers need, and what production work replaces

Each item below lists:
- what production needs, from a primary source;
- what only the owner can decide;
- what the developer builds.

The split mirrors `openQuestions[].to`, which already addresses each question to the owner or to the developer.

**1.1 Authentication, authorization and secrets.**
- Production needs:
  - Check authentication and authorization inside every server action. Checks in middleware, layouts or pages alone are not enough. Keep data access in a server-only layer (`NEXT-PROD`).
  - Keep `.env.*` files out of git (`NEXT-PROD`, `NEXT-ENV`).
  - Next.js copies every `NEXT_PUBLIC_` variable into the JavaScript sent to the browser at build time (`NEXT-ENV`). Vite does the same with `VITE_` variables, and its docs say they must not hold API keys (`VITE-ENV`).
  - Supabase publishable keys may be public because row-level security (RLS) limits what they reach. Secret keys bypass RLS and must never reach a browser, a shipped app or source control (`SUPA-KEYS`). Supabase also says it is deprecating its `anon` and `service_role` keys by the end of 2026 (`SUPA-KEYS`).
  - Never hardcode secrets, detect them before commit, and rotate them (`OWASP-SECRETS`).
  - OWASP ranks broken access control first, and authentication failures seventh (`OWASP-TOP10`).
- The owner decides:
  - who may do each action in the feature (roles against actions);
  - which sign-in methods to offer;
  - which outside services the feature calls.
- The developer builds: the auth implementation, where secrets are stored, and their rotation.
- Prototype Stand-ins to replace:
  - A Claude artifact's AI calls need no API key and count against each viewer's own plan (`CLAUDE-ARTIFACTS`). Production needs its own provider account and keys.
  - Lovable connectors and AI calls keep running through Lovable until they are replaced, and Lovable cannot create real secrets, only placeholders (`LOVABLE-EXT`).
  - GitHub Spark shows the risk. Its `llm()` calls stopped working when GitHub Models was retired on 2026-07-30, and apps copied out need their own provider and keys (`GH-SPARK`).

**1.2 A data layer to replace the Stand-ins.**
- Production needs:
  - RLS on every table, because a table without it lets any client read and change its rows (`SUPA-PROD`).
  - Indexes, load testing, point-in-time recovery, and auth rate limits (`SUPA-PROD`).
  - A server-only data access layer (`NEXT-PROD`).
- The owner decides:
  - which data is real and where its source of truth lives;
  - the shape the UI depends on (the never-written `data[].shape`, see "Against this repo");
  - what is personal or sensitive.
- The developer builds: schema, API, migrations and backups.
- Where each tool's data lives:
  - Lovable's built-in backend can move only to managed or self-hosted Supabase (`LOVABLE-OWN`).
  - Bolt's database can be claimed into the user's own Supabase account on paid plans (`BOLT-DB`).
  - Figma Make's backend sets up key-value stores, not a SQL schema, and only on Organization and Enterprise plans. Where an admin has turned the integration off, a prompt to use Supabase gives placeholder code rather than a working connection (`FIG-MAKE-BACKEND`).

**1.3 Error, empty and loading states.**
- Production needs:
  - custom error and not-found pages, a global error boundary, and loading UI with Suspense (`NEXT-PROD`);
  - handling of exceptional conditions, a category OWASP added in 2025 (`OWASP-TOP10`);
  - error messages that do not leak internals (`REPLIT-SECCHK`).
- The owner decides what each state shows and says. That is design-side Handoff content (`screens[].states`: the Standard states, and Extra states once ADR 0018 is built), and the earlier note covers it. Anthropic's Claude Design tutorial tells owners to ask for the empty, error and loading states first (`CLAUDE-DESIGN-ACADEMY`).
- The developer builds: where boundaries go, retries and timeouts, and error logging.

**1.4 Tests.**
- Production needs: unit, component, integration and end-to-end tests, with Vitest, Jest, Playwright or Cypress. End-to-end tests are recommended for async Server Components (`NEXT-TEST`).
- The owner decides: the acceptance criteria. A Handoff already holds these as Given/When/Then in `acceptance[]`.
- The developer builds: the suite and the CI gate.

**1.5 Accessibility audit.**
- Production needs:
  - No tool alone can decide conformance, and knowledgeable human evaluation is required (`WAI-EVAL`). WAI points to its evaluation methodology (WCAG-EM) and its Easy Checks.
  - `eslint-plugin-jsx-a11y` catches problems while coding (`NEXT-PROD`).
- The owner decides: the conformance target (dev-ready-package, Finding 7), plus focus order, labels and landmarks (design-side, under `a11y` in the earlier note).
- The developer builds: automated checks plus a manual audit.

**1.6 Performance budget.**
- Production needs:
  - A target, such as the Core Web Vitals thresholds that dev-ready-package's Finding 7 sets out (`WEBDEV-CWV`).
  - Lighthouse plus field data, `useReportWebVitals` and a bundle analyzer (`NEXT-PROD`).
  - Speed Insights, image, script and font optimization, and function region (`VERCEL-PROD`).
- The owner decides: targets, priority devices and expected traffic.
- The developer builds: measurement, and a budget enforced in CI.

**1.7 Dependency and licence hygiene.**
- Production needs:
  - OWASP's 2025 list ranks software supply chain failures third (`OWASP-TOP10`).
  - GitHub's dependency review shows each change's vulnerabilities, licence, dependents and age, and its action can allow or deny licences. Private repos need GitHub Code Security or Advanced Security (`GH-DEPREVIEW`).
  - Commit lockfiles (`VERCEL-PROD`).
  - Code with no licence falls under default copyright law (`GH-LICENSE`). This matters when reusing code from Finding 3.
  - Lovable's quick scan includes a dependency audit (`LOVABLE-SEC`).
- The owner decides: little, beyond the licence of fonts and assets the Prototype uses.
- The developer builds: the audit, and the policy.

**1.8 Security beyond auth: input validation, client-side keys and headers.**
- Production needs:
  - Validate on the server even when the browser already checks, because client-side validation can be bypassed. Prefer allowlists (`OWASP-INPUT`).
  - Validate Server Action input, rate limiting, and a Content Security Policy (`NEXT-PROD`).
  - Headers, deployment protection, a WAF and rate limiting (`VERCEL-PROD`).
  - Replit's checklist for AI-built apps groups the same items for the front end, the back end and day-to-day habits (`REPLIT-SECCHK`).
- The owner decides: what data the feature accepts, and from whom. The security target, an ASVS level chosen by risk, is in dev-ready-package's Finding 7.
- The developer builds: validation, headers, and the review.
- Tool scans:
  - v0 analyses `NEXT_PUBLIC_` use and warns about risky exposure (`V0-SEC`).
  - Lovable, Bolt and Replit each scan before publishing (Finding 2).

**1.9 Observability.**
- Production needs:
  - Next.js recommends OpenTelemetry. It instruments itself out of the box, with spans for each request, route render and fetch (`NEXT-OTEL`).
  - Security logging and alerting failures are ninth on OWASP's 2025 list (`OWASP-TOP10`).
  - Vercel's checklist adds an incident response plan, tracing and log drains (`VERCEL-PROD`).
- The owner decides:
  - what counts as failure for the feature, and who is alerted;
  - which analytics events matter. dev-ready-package's Finding 8 covers the tracking plan; the Handoff has no key for it.
- The developer builds: the instrumentation.

**1.10 Deployment and environments.**
- Production needs:
  - Vercel has three default environments: Local, Preview and Production. Pro and Enterprise teams can add custom ones, such as `staging`, each with its own variables (`VERCEL-ENV`).
  - A project's first deployment is always a production one (`VERCEL-ENV`).
  - A staged production deployment uses production variables, and so reaches production data (`VERCEL-ENV`).
  - `NEXT_PUBLIC_` values are fixed at build time. One image promoted across environments carries the values of the environment it was built in (`NEXT-ENV`).
  - Stage, promote and roll back (`VERCEL-PROD`).
- The owner decides: which environments exist, who sees previews, and domains.
- The developer builds: the pipeline.

Summary of Finding 1:

| Production area | The owner decides | The developer builds | Sources |
| --- | --- | --- | --- |
| Auth and secrets | Who may do what; sign-in methods; outside services | Auth, secret storage, rotation | `NEXT-PROD`, `NEXT-ENV`, `VITE-ENV`, `SUPA-KEYS`, `OWASP-SECRETS`, `OWASP-TOP10` |
| Data layer | Which data is real; its shape; what is sensitive | Schema, API, migrations, backups | `SUPA-PROD`, `NEXT-PROD` |
| Error, empty, loading | What each state shows (design side) | Boundaries, retries, error logging | `NEXT-PROD`, `OWASP-TOP10`, `CLAUDE-DESIGN-ACADEMY` |
| Tests | Acceptance criteria | Suite and CI gate | `NEXT-TEST` |
| Accessibility | Target; focus order, labels, landmarks (design side) | Automated and manual audit | `WAI-EVAL`, `NEXT-PROD` |
| Performance | Targets, devices, traffic | Measurement, budget in CI | `WEBDEV-CWV`, `NEXT-PROD`, `VERCEL-PROD` |
| Dependencies, licences | Licences of fonts and assets | Audit and policy | `OWASP-TOP10`, `GH-DEPREVIEW`, `GH-LICENSE`, `VERCEL-PROD` |
| Security | What input is accepted, from whom | Server validation, headers, review | `OWASP-INPUT`, `NEXT-PROD`, `VERCEL-PROD`, `REPLIT-SECCHK` |
| Observability | What counts as failure; analytics events | Instrumentation, alerting | `NEXT-OTEL`, `OWASP-TOP10`, `VERCEL-PROD` |
| Deploy, environments | Which environments; preview access; domains | Pipeline, promotion, rollback | `VERCEL-ENV`, `NEXT-ENV`, `VERCEL-PROD` |

### 2. What each prototyping tool hands developers

| Tool | Way out | What the code is | What its docs say about production |
| --- | --- | --- | --- |
| Claude artifacts | Legacy artifacts (made before 2026-09-16) can be viewed as code, copied or downloaded. Design templates download as .zip, PDF, PPTX or standalone HTML; Docs as Word, PDF, Markdown or Google Docs (`CLAUDE-ARTIFACTS`). Share and publish links, and embed code (`CLAUDE-SHARE`). | One self-contained page with no backend and no routes. Scripts load only from a short CDN allowlist, `fetch` reaches only the page's own origin, and the size limit is 16 MiB (`CC-ARTIFACTS`). | For a hosted tool with a backend, deploy on your own infrastructure. An artifact cannot authenticate viewers itself (`CC-ARTIFACTS`). |
| Claude Design | Download as .zip, PDF, PPTX, Google Slides or standalone HTML. "Send to" partners including Lovable, Replit, v0, Vercel and Netlify. "Handoff to Claude Code", to a local agent or Claude Code on the web (`CLAUDE-DESIGN`). | Design files. Linking a codebase makes the Prototype closer to production from the start (`CLAUDE-DESIGN`). | A design system import is only as good as its source, and there is no version history yet (`CLAUDE-DESIGN`). |
| v0 | Private GitHub repo as the source of truth, branch roles, previews per branch. Publish opens and merges a PR and respects branch protection (`V0-GH`). Per-file download (`V0-DOCS`), and a zip of a version through API v1 (`V0-DOCS`). | Next.js, React, TypeScript, Tailwind CSS and shadcn/ui (`V0-FAQ`). | Output may be incomplete or contain bugs (`V0-FAQ`). Deploys go to Vercel only, with environment variables per environment (`V0-DEPLOY`). Warns on `NEXT_PUBLIC_` exposure (`V0-SEC`). |
| Lovable | Two-way sync on one branch with GitHub (also GitLab and Bitbucket); repos are private by default; download on paid plans; an existing repo cannot be connected (`LOVABLE-GH`). | TanStack Start for apps created from 2026-05-13; React + Vite static builds before that. Built-in backend based on Supabase (`LOVABLE-OWN`). | Leaving makes the team responsible for environments, CI/CD, infrastructure, databases, auth, secrets and audits (`LOVABLE-OWN`). Connectors are not carried out (`LOVABLE-EXT`). Scans do not replace a review (`LOVABLE-SEC`). |
| Bolt | GitHub sync on every change, and import of an existing repo (`BOLT-GIT`). Zip download. "Open in StackBlitz" goes away once a project moves to Bolt's new storage format (`BOLT-PROJ`). | JavaScript only: a Node.js backend and any browser framework, plus Expo for mobile (`BOLT-TECH`). Bolt Cloud database or Supabase (`BOLT-DB`). Built-in hosting (`BOLT-INDEX`). | A project security audit on paid plans covers data access, sign-in, input, keys and secrets kept out of code and browsers, and CORS (`BOLT-SEC`). |
| Replit Agent | Git-backed; Agent checkpoints are commits; GitHub sync (`REPLIT-VC`). Zip download (`REPLIT-HELP`), which a workspace admin can ban (`REPLIT-ENT`). | Not stated in the pages read. ADR 0019, from #319's research, records React + Tailwind + shadcn as its default Prototype kind. | Publishing runs security checks, with an optional deep scan and an option to block critical findings (`REPLIT-PUBLISH`). The scans use Semgrep and HoundDog.ai (`REPLIT-SCANS`). |
| Figma Make | Zip download for Full or Dev seats (`FIG-MAKE-CODE`). One-way push to GitHub's default branch; edits made in GitHub are overwritten (`FIG-MAKE-GH`). | Framework not named in the pages read. ADR 0019 records React + Tailwind + shadcn, written without a `components.json` (#338). Make kits bring a team's production design system package in, for any web framework. An earlier version of the page said React only (`FIG-MAKE-KITS`). | Taking a Make file to production with the production design system goes through the Figma MCP server (`FIG-MAKE-KITS`, `FIG-MCP`). |
| GitHub Spark | Retired: no new apps from 2026-08-04; copy out to a repository by 2026-08-31 (`GH-SPARK`). | n/a | The platform's AI calls stopped with GitHub Models' retirement (`GH-SPARK`). |

Notes on the Claude rows:

- **Moving an artifact into Claude Code.**
  - `CC-ARTIFACTS` describes giving Claude Code the URL of an artifact shared with you. Claude receives a summary, and Claude Code also saves the page's full source to a local file. People with edit access can republish.
  - **unverified:** whether an artifact made in a claude.ai chat can be read into Claude Code the same way. The page speaks of artifacts shared with you, and no public page confirms it for chat artifacts.
- **Claude Design's "Handoff to Claude Code"** continues from the existing design instead of starting again from a screenshot. Inside Claude Code, `/design` imports a design (`CLAUDE-DESIGN`). The tutorial's alternative is to paste the design's link in the repo and ask Claude to build it. It also advises naming artboards and components clearly and writing decisions down as you make them (`CLAUDE-DESIGN-ACADEMY`).
  - In this repo's terms, that hands over design and code, not a Handoff: nothing in it is bound to a Design System's Contracts.
  - **unverified:** what the handoff bundle contains. Only third-party sources describe it. One is `kiwuuu/claude-handoff-mcp`, whose README calls the format observed, not specified.
- **v0 reads Claude Design.** v0's MCP server and API can import a Claude Design HTML file from a Claude-hosted URL into a new private chat (`V0-DOCS`).
- **v0's PRD design page** says v0 can draft API descriptions and database schemas, the latter as mermaid entity-relationship diagrams (`V0-DOCS`).

Other first-party tools whose docs aim at developer handoff or production:

- **Figma Dev Mode and Code Connect.**
  - Code Connect links design components to code components, through a UI or a CLI, on Professional plans and above. It feeds the MCP server (`FIG-CC`).
  - The MCP server can gather code resources from Make files to help move from prototype to production (`FIG-MCP`).
  - The design side is in the earlier note.
- **Builder.io (now "Builder Code").** It connects to a GitHub, GitLab, Azure DevOps or Bitbucket repo and learns the component library. Every change arrives as a pull request. It calls its output production-ready (`BUILDER`).
- **Anima.** It takes a Figma file, a prompt or a URL, and downloads React, HTML or Tailwind code or syncs it into an existing codebase. "Production-ready" is claimed but not defined (`ANIMA`).
- **Locofy.** A Figma plugin that generates React, Next.js, HTML/CSS, Gatsby, Vue and Angular for the web, and Flutter, React Native, Swift and Compose for mobile. Its pages describe a development-ready workflow and make no production claim (`LOCOFY`).

### 3. Prior work on GitHub

**Method.**
- **Searches.** `gh search repos`, sorted by stars, top 6 to 15 results per query, run on 2026-10-22 local time (GitHub's clock read 2026-10-21 UTC). Queries:
  - "vibe coding production", "vibe code production ready", "vibe coding checklist", "vibe code audit", "vibe security scanner", "vibe check security", "vibe to production", "shipping vibe coded", "vibe coding production readiness";
  - "production readiness checklist", "production readiness skill", "prototype to production", "prototype to production checklist", "ai generated code production";
  - "claude artifact", "claude artifacts runner", "artifact to nextjs";
  - "lovable production", "lovable migrate", "lovable self-host", "lovable supabase migration", "lovable export", "lovable eject", "lovable to nextjs";
  - "v0 to production", "v0 export", "bolt.new production";
  - "supabase rls scanner";
  - "design handoff", "prototype handoff", "handoff skill claude", "developer handoff ai", "vibe coding handoff", "vibe handoff", "ai prototype engineer handoff";
  - "prd from codebase", "code to prd", "reverse engineer prd", "reverse spec", "reverse engineer spec from code", "brownfield spec", "spec-driven development", "prototype to spec", "spec from prototype";
  - "vibe coded app hardening", "awesome vibe coding".
- **Code searches.** `gh search code` over `SKILL.md` files for "handoff" and for "vibe-coded", top 30 each.
- **Queries that returned nothing:** "prototype to production checklist", "claude artifacts runner", "artifact to nextjs", "v0 to production", "v0 export", "bolt.new production", "handoff skill claude", "developer handoff ai", "vibe coding handoff", "vibe handoff", "ai prototype engineer handoff", "vibe coded app hardening", "vibe coding production readiness", "lovable to nextjs", "prototype to spec", "spec from prototype", "reverse engineer prd".
- **Rate limit.** Several queries first hit GitHub's search rate limit. They were re-run after a pause, and the lists above give their results.
- **Metadata.** Stars and licence come from the repo API, and the last commit from the default branch's history (not `pushed_at`, which counts any branch). Commit counts are approximate, read from the API's pagination.
- **Maintained** here means a commit on the default branch on or after 2026-07-24 (within 90 days) and more than five commits. A repo whose commits all fall in its first days is marked as too new to judge.
- **Licences.**
  - "none" means GitHub detected no licence file, so default copyright applies (`GH-LICENSE`).
  - "NOASSERTION" means a licence file exists that GitHub could not classify.
  - "per skill" means the repo has no top-level licence and each skill carries its own.

**3a. Closest to To-handoff: code read back into a description developers build from.**

| Repo | What it does (from its README or source) | Licence | Last commit | Stars | Commits (≈) | Maintained? |
| --- | --- | --- | --- | --- | --- | --- |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) (skill `product-team/code-to-prd`) | Reverse-engineers a codebase into a PRD: one document per page with layout regions, a field inventory, interaction logic and API dependencies, plus an enum dictionary, page relations and an API inventory. It tells real API calls from mock or fixture data, and for endpoints that exist only as mock data it writes API requirements with request and response shapes. Covers React, Vue, Angular, Svelte, Next.js (App and Pages routers) and more, with Python scanner scripts. | MIT | repo 2026-10-21; skill path 2026-06-11 | 28,497 (collection) | many | Collection yes; this skill unchanged for over 90 days |
| [lihanglogan/code-to-prd](https://github.com/lihanglogan/code-to-prd) | The same skill packaged on its own; its README shows the same output tree. How it relates to the original is **unverified**. | MIT | 2026-03-17 | 10 | 2 | No |
| [k57597907-netizen/code-to-prd](https://github.com/k57597907-netizen/code-to-prd) | A Codex-tuned copy. Its `NOTICE.md` names alirezarezvani/claude-skills as the original. | MIT | 2026-07-02 | 17 | 14 | No |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (plugin `pm-ai-shipping`) | "AI Shipping Kit". `document-app` reverse-engineers an AI-built app into architecture, flows, permissions and variables documents, plus conditional ones (email, cron, SEO, automation). `derive-tests` turns those into a test-coverage map, and static security and performance audits compare the code against them. `ship-check` runs the whole sequence. It follows the host repo's existing docs layout. | MIT | 2026-10-16 (plugin path too) | 27,269 (collection) | many | Yes |
| [VSreedharan/reverse-spec](https://github.com/VSreedharan/reverse-spec) | Guides an agent to write baseline product and technical documents for an existing app, as the starting point for planning changes. | Apache-2.0 | 2025-12-07 | 13 | 4 | No |
| [nekolife1984/specback](https://github.com/nekolife1984/specback) | A multi-agent skill that writes documentation from a codebase. It marks guesses, keeps a chapter of unresolved items, and gives every statement a source reference. | MIT | 2026-08-27 | 2 | 242 | Yes |
| [Docsbook-io/specify](https://github.com/Docsbook-io/specify) | A CLI and skill: behavioural documents from code, then checks that code still matches them. | MIT | 2026-06-30 | 0 | 6 | No |
| [Justineo/vibe-hand-off](https://github.com/Justineo/vibe-hand-off) | **Unverified** (description only): an interactive visualisation of a "Prototype Handoff Dilemma" (runtime results versus design intent). Its README is the stock Vite template. | none | 2026-09-08 | 1 | 48 | Yes |

None of these is library-bound. They describe what the code does, not which Code Library component each element is. None records Off-system values, and none has a Sign-off or Drift model.

**3b. Production readiness and security for AI-built apps.**

| Repo | What it does | Licence | Last commit | Stars | Commits (≈) | Maintained? |
| --- | --- | --- | --- | --- | --- | --- |
| [raroque/vibe-security-skill](https://github.com/raroque/vibe-security-skill) | An agent skill. It loads reference files by technology: authentication, data access, database security (RLS), deployment, payments, rate limiting, secrets and env, AI integration, mobile. | MIT | 2026-03-15 | 1,139 | 4 | No |
| [Moeeryani/Vibe-Coding-Production-Kit](https://github.com/Moeeryani/Vibe-Coding-Production-Kit) | A zero-dependency CLI plus repo docs. Repository documents are the source of truth, with bounded tasks, readiness gates, recorded verification evidence and an independent review. | MIT | 2026-10-06 | 36 | 335 | Yes |
| [MarinJursic/production-readiness-checklist](https://github.com/MarinJursic/production-readiness-checklist) | 10,042 controls and a read-only scanner, `prc`. The README says 686 controls are deterministic, and that only a few evidence collectors ship today. | MIT | 2026-09-03 | 41 | 142 | Yes |
| [fractal-nyc/software-engineering-go-launch-checklist](https://github.com/fractal-nyc/software-engineering-go-launch-checklist) | A review-only checklist for an agent. Each ID gets PASS, FAIL, UNKNOWN or N/A, and the result is a GO, NO-GO or NEEDS EVIDENCE call. It separates what the agent can verify from what an accountable person approves. | none | 2026-10-16 | 6 | 1 | Too new |
| [Shawnchee/preflight-skill](https://github.com/Shawnchee/preflight-skill) | A scanner skill with 780 items across six deployment types. It reports pass or fail with file paths, and can apply fixes. | MIT | 2026-04-03 | 8 | 17 | No |
| [jacobpowaza/launchify-skills](https://github.com/jacobpowaza/launchify-skills) | 60 audit and fix commands across 25 categories, for Claude Code, OpenCode and Codex. | none | 2026-08-30 | 6 | 6, all on its creation day | Too new |
| [Nordic-AI/production-readiness-skills](https://github.com/Nordic-AI/production-readiness-skills) | 12 audit and remediation skills, EU-first on compliance. | Apache-2.0 | 2026-04-17 | 2 | 3 | No |
| [enigma-137/ship-ready](https://github.com/enigma-137/ship-ready) | Audits, then fixes on request. It tags claims it cannot verify against docs as needing verification. | MIT | 2026-09-13 | 1 | 1 | Too new |
| [dungnotnull/vibe-to-production-agent-skill](https://github.com/dungnotnull/vibe-to-production-agent-skill) | A seven-phase skill that writes a readiness report, a launch checklist and a runbook. | none | 2026-06-15 | 4 | 1 | No |
| [funky-monkey/vibecoding-security-scanner](https://github.com/funky-monkey/vibecoding-security-scanner) | A security audit skill covering 30+ categories, with severity ranking and proof-of-concept commands. | none | 2026-09-24 | 6 | 14 | Yes |
| [csmoove530/vibe-codebase-audit](https://github.com/csmoove530/vibe-codebase-audit) | A local pattern scanner, plus a multi-model audit that sends code to OpenRouter. | MIT | 2026-01-12 | 3 | 2 | No |
| [flamehaven01/AI-SLOP-Detector](https://github.com/flamehaven01/AI-SLOP-Detector) | An offline detector for code that looks finished but is not: empty functions with plausible bodies, imports of things that do not exist, docs that overstate. | MIT | 2026-10-20 | 102 | 499 | Yes |
| [NFTYoginis/vibe-code-audits](https://github.com/NFTYoginis/vibe-code-audits) | Audits of apps built with named tools. So far there are two, both of the author's own Lovable and Bolt apps. | MIT | 2026-08-19 | 0 | 9 | Yes |
| [therealultrachucknorris/vibe-coding-checklist](https://github.com/therealultrachucknorris/vibe-coding-checklist) | A `/vibe-check` skill: 11 categories, three parallel agents. | MIT | 2026-04-06 | 0 | 1 | No |
| [finehq/vibe-coding-checklist](https://github.com/finehq/vibe-coding-checklist) | A security checklist as JSON, in 11 categories. | MIT | 2025-04-16 | 37 | 4 | No |
| [aiqualitylab/vibe-coding-checklist](https://github.com/aiqualitylab/vibe-coding-checklist) | A review framework with weighted scoring. It checks for stubbed logic behind a finished-looking UI and for packages that do not exist. | MIT | 2026-02-23 | 9 | 3 | No |
| [ja023/ship-it-safe](https://github.com/ja023/ship-it-safe) | A checklist of 500+ items across 23 areas. | none | 2026-10-02 | 1 | 2 | Too new |
| [oskar-makarov/pipeline-md](https://github.com/oskar-makarov/pipeline-md) | A 16-stage checklist for an agent, which is told not to deploy while a blocking stage is open. The base is free, with a paid tier. | MIT | 2026-07-22 | 14 | 4 | No |
| [mercari/production-readiness-checklist](https://github.com/mercari/production-readiness-checklist) | Mercari's checklist for its microservices. A reference, not AI-specific. | MIT | 2021-05-17 | 946 | 17 | No |

**3c. Getting a Claude artifact or a Lovable app out.**

| Repo | What it does | Licence | Last commit | Stars | Commits (≈) | Maintained? |
| --- | --- | --- | --- | --- | --- | --- |
| [claudio-silva/claude-artifact-runner](https://github.com/claudio-silva/claude-artifact-runner) | `npx run-claude-artifact` runs, builds, or creates a full project from a Claude React artifact. The project is React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, lucide and Three.js. It gives no backend, and its README says so. Document-type artifacts are out of its scope. | MIT | 2025-11-21 | 581 | 84 | No (it predates the 2026-09-16 artifact change in `CLAUDE-ARTIFACTS`) |
| [risonsimon/claude-artifacts-react](https://github.com/risonsimon/claude-artifacts-react) | A deploy-button template: paste artifact code into one file. | MIT | 2024-07-02 | 238 | 6 | No |
| [ABS-Projects-2026/lovable-eject](https://github.com/ABS-Projects-2026/lovable-eject) | `analyse`, `transform` and `deploy`. It removes Lovable dependencies, replaces OAuth calls, fixes SQL migrations, and writes `.env.example`, `vercel.json` and a health endpoint. | MIT | 2026-04-18 | 2 | 19 | No |
| [wengxiaoxiong/lovable-migrate-cursor](https://github.com/wengxiaoxiong/lovable-migrate-cursor) | A script that moves a Lovable Vite project into a Next.js template. A coding agent then adds the API and database. | none | 2025-08-08 | 1 | 8 | No |

**3d. Design-side bundles for agents (adjacent).**

| Repo | What it does | Licence | Last commit | Stars | Commits (≈) | Maintained? |
| --- | --- | --- | --- | --- | --- | --- |
| [kiwuuu/claude-handoff-mcp](https://github.com/kiwuuu/claude-handoff-mcp) | An MCP server that fetches a Claude Design handoff bundle URL, summarises its README, and copies its files into a project. It says the URLs expire and the format is observed, not specified. | MIT | 2026-04-18 | 3 | 1 | No |
| [Kacep91/figma-ai-bridge](https://github.com/Kacep91/figma-ai-bridge) | A Figma Desktop plugin and localhost bridge that write a compact bundle for an agent, with no Figma API or tokens. | MIT | 2026-08-11 | 17 | 3 | No |
| [imyezhiyong/prd-prototype-handoff](https://github.com/imyezhiyong/prd-prototype-handoff) | A Codex skill. A Modao prototype is the source of truth, and the skill generates a `handoff.md` with stable IDs for fields, actions, states and acceptance criteria. | none | 2026-06-25 | 0 | 12 | No |
| [belschak/claude-design-handoff](https://github.com/belschak/claude-design-handoff) | Freezes facts in a document before a Claude Design pass, then checks that they survived. It deals with documents, not code. | MIT | 2026-07-21 | 2 | 11 | No |

**3e. General tools that fill single production areas.**

| Repo | Fills | Licence | Last commit | Stars | Maintained? |
| --- | --- | --- | --- | --- | --- |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | Accessibility (1.5). The README says it finds about 57% of WCAG issues automatically, and marks uncertain results as incomplete for manual review. | MPL-2.0 | 2026-10-20 | 7,679 | Yes |
| [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) | Performance budget (1.6): runs and asserts Lighthouse on every commit. | Apache-2.0 | 2026-10-19 | 7,118 | Yes |
| [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) | Secrets (1.1): finds secrets in git repos and files, including as a pre-commit hook. | MIT | 2026-07-22 | 30,195 | No: its last default-branch commit is just outside the window, though the repo saw pushes until 2026-09-30 |
| [google/osv-scanner](https://github.com/google/osv-scanner) | Dependencies (1.7): a vulnerability scanner using osv.dev data. **Unverified** (description only). | Apache-2.0 | 2026-10-21 | 11,223 | Yes |
| [supabase/splinter](https://github.com/supabase/splinter) | Data layer (1.2): SQL lints for Supabase projects, among them RLS disabled on public tables, RLS on with no policy, a policy that is always true, and sensitive columns exposed. | none detected (the README has a licence badge) | 2026-09-29 | 283 | Yes |

**3f. Adjacent workflows, not specific to a Prototype.** spec-kit, OpenSpec, Kiro, anthropics/skills and vercel-labs/agent-skills are maintained by the rule above: each has a default-branch commit after 2026-07-24 and between 60 and about 2,250 commits. The original bolt.new and the two repos under "Not this problem" are not.
- **[github/spec-kit](https://github.com/github/spec-kit)** (MIT, last commit 2026-10-21, 142,287 stars). For existing code, its guide says it does not infer descriptions of existing behaviour: each new document describes one change (`SPECKIT-EXISTING`). [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) (MIT, 2026-10-20, 72,650 stars) says it is built for existing codebases too.
- **[kirodotdev/Kiro](https://github.com/kirodotdev/Kiro)** (none, 2026-08-27, 4,384 stars) is only Kiro's public issue tracker. The product's source is not there.
- **[anthropics/skills](https://github.com/anthropics/skills)** (licence per skill; 2026-10-09; 182,720 stars):
  - `web-artifacts-builder` goes the other way, building claude.ai HTML artifacts from React, Tailwind and shadcn/ui;
  - `webapp-testing` tests local web apps with Playwright.
- **[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)** (licence per skill; 2026-08-28; 32,767 stars):
  - `web-design-guidelines` reviews UI code, accessibility included;
  - `deploy-to-vercel`;
  - `react-best-practices`.
- **Unverified** (description only):
  - [vercel/v0-sdk](https://github.com/vercel/v0-sdk) (NOASSERTION, 2026-10-21, 515);
  - [stackblitz-labs/bolt.diy](https://github.com/stackblitz-labs/bolt.diy) (MIT, 2026-10-14, 19,975). The original [stackblitz/bolt.new](https://github.com/stackblitz/bolt.new) has had no commit since 2024-12-17;
  - [Nutlope/llamacoder](https://github.com/Nutlope/llamacoder) (MIT, 2026-10-15, 7,136), which generates artifact-style apps.
- **Not this problem:**
  - [TexasBedouin/vibe-check](https://github.com/TexasBedouin/vibe-check) (MIT, 2026-07-17, 624 stars; not maintained by the rule above) works from an idea to a plan, before any code exists;
  - [ToolMonsters/handoff-skill](https://github.com/ToolMonsters/handoff-skill) (MIT, 2026-07-23, 43 stars; not maintained by the rule above) hands one chat session over to another model. Only the name matches.

**What the search shows.**
- The popular repos are collections, in which a code-to-PRD or shipping-docs skill is one entry, or general tools for one concern.
- The repos aimed squarely at AI-built apps are young and small. Most have a last commit more than 90 days old, or only one to four commits.
- None takes a Prototype to a Handoff bound to a Design System. None reads a Claude artifact URL.

## Summary table

A rollup of Findings 1 to 3 and of "Against this repo" below, one row per production area. It adds no claims beyond those sections. What the owner decides per area is in Finding 1's table.

| Production area | What the tools ship (Finding 2) | GitHub help (Finding 3) | Handoff key today | Gap |
| --- | --- | --- | --- | --- |
| Auth and secrets | v0's `NEXT_PUBLIC_` warning; Bolt's audit covers sign-in, keys and secrets; Lovable and Replit scans | gitleaks; raroque/vibe-security-skill; pm-ai-shipping's permissions and variables documents | none; `source.ignored` lists middleware and API routes | The owner's roles against actions have no key |
| Data layer | Bolt's audit covers data access; Lovable's and Bolt's databases move to Supabase | supabase/splinter; code-to-PRD (mock data versus real calls) | `data[]` (`source`, `note`, `question`); `stand-in` questions | `data[].shape` is never written (dev-ready-package proposes drafting it) |
| Error, empty, loading | none in the pages read | none specific found | `screens[].states`; Next.js `loading` and `error` files read as conditions | Covered by the earlier note |
| Tests | none in the pages read | pm-ai-shipping's `derive-tests`; anthropics/skills `webapp-testing` | `acceptance[]` | Test level and coverage |
| Accessibility | none in the pages read | axe-core; vercel-labs/agent-skills `web-design-guidelines` | `regions[].landmark`; `a11y` never written | `a11y` is never written; no audit result |
| Performance | none in the pages read | lighthouse-ci; pm-ai-shipping's static performance audit | none | Owner targets have no key (dev-ready-package proposes asking for them) |
| Dependencies, licences | Lovable's quick scan includes a dependency audit | osv-scanner (**unverified**); checks for packages that do not exist (AI-SLOP-Detector, aiqualitylab checklist) | none | No key |
| Security | Lovable, Bolt and Replit scans; v0's warning | Repos in 3b; pm-ai-shipping's static security audit | none | No key (dev-ready-package proposes asking for an ASVS level) |
| Observability | none in the pages read | none specific found | none; no analytics key | Alerting; analytics events (dev-ready-package, Finding 8) |
| Deploy, environments | v0 deploys to Vercel with variables per environment; Bolt hosting; Replit publishing | lovable-eject (`vercel.json`, health endpoint); vercel-labs/agent-skills `deploy-to-vercel` | none | Environments have no key |

## Against this repo

**1. Where each production area sits in a Handoff today.**

| Production area | Handoff key today | Note |
| --- | --- | --- |
| Auth and secrets | none | `source.ignored` lists middleware and API routes (`react.mjs` L539, L546). |
| Data layer | `data[]` (`source`, `note`, `question`); `openQuestions` kind `stand-in` | `data[].shape` is in the schema (L82) but never written. |
| Error, empty, loading | `screens[].states` (design side) | The React reader reads Next.js `loading` and `error` boundary files as conditions (`react.mjs` L569–575) and sets the root `not-found` aside as ignored (L573). |
| Tests | `acceptance[]` | Given/When/Then is the input to tests. Nothing records test level or coverage. |
| Accessibility | `a11y` (never written); `regions[].landmark` (written) | No key holds an audit result. |
| Performance | none | |
| Dependencies, licences | none | |
| Security | none | |
| Observability | none | No analytics key (earlier note; dev-ready-package, Finding 8). |
| Deploy, environments | none | |

This fits GLOSSARY. A Handoff describes one feature against a Design System. Production work is the developer's build of it. The owner-side column of Finding 1 is the part with no home.

**2. Candidates (not decisions).**

1. **Read Claude artifacts through kinds that already exist.** GLOSSARY lists "an artifact URL" as To-handoff input, but `source.kind` (schema L39) allows only `html-file`, `react-next` and `react-vite`. ADR 0019 already supports Claude's default kind, plain HTML + CSS classes, through the HTML-file reader. What is missing is the step from the URL to the file.
   - An HTML artifact whose source Claude Code has saved locally (`CC-ARTIFACTS`) would be an `html-file` Prototype.
   - A React artifact made into a Vite project by `claude-artifact-runner create` would be a React + Tailwind + shadcn Prototype, ADR 0019's first kind, read as `react-vite`. The React reader would not find its screens, though:
     - The runner's `src/main.tsx` builds its router with a conditional, `useHash ? createHashRouter(mkRoutes) : createBrowserRouter(mkRoutes)`, over routes mapped from the generated module `virtual:generated-pages-react`.
     - The reader takes routes from `RouterProvider` only through a direct call whose first argument is an array literal (`react.mjs` L433–437).
     - **Reasoning, not sourced** (read from the code, not run): the reader would get one empty `index` screen. Reading the runner's projects needs a reader change.
   - A Claude Design standalone HTML download would also be an `html-file`.
   - **unverified:**
     - that a chat artifact URL can be read into Claude Code;
     - that the runner works on artifacts made after 2026-09-16;
     - what Claude Design's handoff bundle contains.
2. **Turn ignored middleware into a Stand-in question too.**
   - dev-ready-package already proposes reading a `fetch` to the Prototype's own stub API route as a `data[]` Stand-in (its Group 1). Middleware has no `fetch` to follow, so that proposal does not reach it.
   - `source.ignored` names the middleware as well (`react.mjs` L539). **Reasoning, not sourced:** a Prototype's middleware is where a sign-in Stand-in would sit. `NEXT-PROD` says authorization must not live in middleware alone.
   - A developer-addressed `openQuestions` entry of kind `stand-in` per ignored middleware ("what does this pretend to do?") would follow GLOSSARY's Stand-in rule: record what it pretends to do, never how. It needs no new schema key.
3. **Two owner asks beside dev-ready-package's.**
   - dev-ready-package's Group 2 proposes asking the owner for metrics, NFR targets and tracked events, as `feature` fields or new decision keys.
   - Finding 1 adds two owner decisions that list does not have: who may do each action, and which environments exist and who sees previews.
   - Two more are partly covered. Which data is real is held by `data[].source` (`mock`, `simulated` or `real`; schema L82). What is sensitive overlaps Group 2's DPIA ask.
   - Asked as open questions instead, they would meet a closed enum: `openQuestions.kind` (schema L72) needs a new kind or reuse of an existing one. Either is an ADR-sized choice.
4. **Point to a shipping packet instead of growing the schema.** ("Shipping packet" is this note's phrase, not a glossary term.)
   - pm-ai-shipping's core documents (architecture, flows, permissions, variables, test-coverage map) cover the production areas a Handoff has no place for: auth and authorization, secrets and environment variables, and test coverage. They describe a whole app, reverse-engineered from code that will be built.
   - A Handoff Rendering could link to such a packet, if a team keeps one. It would not copy the packet in, because a Rendering never adds content (GLOSSARY).

**3. The never-written keys.**

| Key | Outside source found | What it gives | Limit |
| --- | --- | --- | --- |
| `data[].shape` | code-to-PRD (alirezarezvani/claude-skills); v0's PRD design page (`V0-DOCS`) | Request and response requirements for endpoints that exist only as mock data; API descriptions and database schemas | Both describe a whole codebase or product, not one feature's UI. v0's runs only inside v0. The earlier note marked this key "reasoning, not sourced"; dev-ready-package proposes drafting it from mock data. |
| `a11y` | axe-core; `vercel-labs/agent-skills` `web-design-guidelines` | Checks: violations, plus incomplete results for manual review | They check content but cannot author a focus order, landmarks or labels. Human evaluation is still required (`WAI-EVAL`). The earlier note and dev-ready-package propose a draft focus order from DOM order. |
| `interactions` | nothing found | | |
| `tokensToAdd` | nothing found | | Figma Make kits and Code Connect bring an existing design system in (`FIG-MAKE-KITS`, `FIG-CC`). Neither proposes new tokens. |
| `regions[].responsive` | nothing found | | |

**4. The out-of-scope list.** No tool or repo found does any of To-handoff's four out-of-scope items for React Prototypes: compiling Tailwind or cva classes, icons as the icon property, layout regions recorded once across screens, and overlay flow transitions.
- v0 builds with Tailwind and shadcn/ui (`V0-FAQ`), so the first item applies to every v0 Prototype.
- claude-artifact-runner's projects are Tailwind and shadcn/ui with lucide icons, so the first two items would apply to an artifact read through it, once a reader takes its routes (candidate 1).
- v0's docs read here name no icon library.

**5. Gaps nobody fills, in these sources and searches.**
- A library-bound Handoff produced from a Prototype.
- An owner-facing record, per feature, of environments and alerting. Performance targets and analytics events have proposals in dev-ready-package's Group 2, but no tool or repo found records them per feature.
- Any reader of a claude.ai artifact URL as input.
