# What does a developer need, beyond a PRD, to start building a feature?

Research for what a PM or designer should prepare before a developer starts on a feature, and for which parts of it this repo could produce. It looks at the whole package. The UI layer is covered in depth by [What must a Handoff for one Prototype's feature carry](design-handoff-contents.md), and this note only summarises and updates it (Finding 11). Related: map [#318](https://github.com/pawisssh/design/issues/318) (any vibe-coded Prototype reaches Component Sets or a Handoff) and [#334](https://github.com/pawisssh/design/issues/334) (the one entry from a Prototype). Vocabulary follows `GLOSSARY.md` (Handoff, Rendering, Prototype, Prototype kind, Owner, From-Prototype, To-handoff, Stand-in, Contract, Container, Component Family, Usage, Sign-off, Drift, Standard state, Extra state).

Researched 2026-10-22. Every source below was read on that date. The repo side was read at commit `614e5ff` and rechecked at `e211f04`, which adds ADR 0019 and touches only the glossary, the ADRs and Vibe-to-Figma's `SKILL.md`:

- the schema: `skills/to-handoff/handoff.schema.json`, unchanged since `c650fc6`, the commit the earlier note read (`git diff c650fc6..HEAD` on it is empty);
- what generate writes: `skills/to-handoff/scripts/generate.mjs`;
- what validate accepts: `skills/to-handoff/scripts/validate.mjs`;
- `skills/to-handoff/SKILL.md`, `GLOSSARY.md` and `docs/adr/` up to ADR 0019;
- the two recorded Handoffs, `design-systems/carbon/handoffs/invite-teammates` and `design-systems/shadcn/handoffs/request-access`, and their Prototypes, `skills/to-handoff/test/fixtures/invite-teammates/index.html` and `skills/to-handoff/test/fixtures/v0-app`.

Labels, as in the earlier note: **Practitioner consensus only** marks a claim that no primary source read for this note makes; it comes from common practice. **Reasoning, not sourced** marks this note's own inference. **First-party for X only** marks a vendor's or company's own document, which is authoritative for its own product or method and nothing wider.

**Terms used in this note.** **Dev-ready package** (this note's proposal, not a glossary term; if the repo adopts it, it goes to `GLOSSARY.md` through `/domain-modeling`): everything a developer needs in hand to start building one feature: the product intent, the stories and their acceptance criteria, the flows and diagrams, the data and API questions, the non-functional targets, the analytics plan, the decisions already made, and the UI.

Where the repo's Handoff sits inside it:

- **The Handoff is one part of the package, not the package.** GLOSSARY defines a Handoff as the library-bound description of one feature (one user goal, across its screens and states) written against a Design System's Contracts and Component Proposals, and lists _handoff doc_, _spec_, _feature spec_ and _brief_ under _Avoid_. So the industry's "handoff document", which usually means the whole package, is not the repo's Handoff.
- **What the Handoff covers today:** the UI layer in full (screens, Standard states, Usages, tokens, Off-system values, copy), plus a thin slice of the rest: the goal, scope and non-goals (`feature`), the flow between states (`flow[]`), the Stand-ins (`data[]`), acceptance criteria (`acceptance[]`) and open questions (`openQuestions[]`).
- **What it does not cover:** metrics, non-functional requirement (NFR) targets, analytics, the API, the architecture and the data model. The last section, [What this repo could do about it](#what-this-repo-could-do-about-it), sorts each of these by who can supply it.
- **A Rendering is a layout of the Handoff, not the package either.** It never adds or drops a Handoff's content (GLOSSARY, Rendering).

Words this note keeps apart, because the sources and the glossary use them differently:

| Source's word | Glossary word it collides with | This note says |
| --- | --- | --- |
| "API contract" | **Contract**, the library-neutral description of a Component Family | **API description**, OpenAPI's own term for the document (`OAS`) |
| C4 "container", an application or a data store (`C4-CON`) | **Container**, a Code Library component that holds other Usages, such as a Card around a form | **C4 container**, always with the prefix |
| C4 "component", a part inside a C4 container (`C4`) | **Component Family**, and Code Library components | **C4 component**, always with the prefix |
| a UML or Mermaid "state" | **State**, a Property Axis of a Contract; **Standard state** and **Extra state**, a screen's states | A state diagram derived from a Handoff has Standard and Extra states as its nodes, never State axis values |
| PRD "sign-off" or "approval" | **Sign-off**, the owner's one approval of a Handoff revision | A PRD is **agreed**; only a Handoff is signed off |
| Definition of Ready | none | The **DoR** is the team's checklist; the **dev-ready package** is the content that meets it |
| "user flow" | `flow[]`, the Handoff's transitions between states | A **user flow** spans screens and steps; `flow[]` is one input to drawing one |

## Answer

1. **A PRD alone is not enough; a developer needs the package around it.** No primary source defines the package as a whole. Each part has its own primary source: user stories (`GOVUK-STORY`), acceptance criteria (`GHERKIN`), diagrams (`C4`, `UML`, `BPMN`), the API description (`OAS`, `ASYNC`), the quality model (`ISO-25010`), accessibility (`WCAG`), security (`ASVS`), privacy (`ICO-DPBD`) and decision records (`NYGARD`). The PRD, the user flow, the tracking plan and the Definition of Ready have no primary source; they are **Practitioner consensus only**, or **first-party** for one company's template or one vendor's product.

2. **The PRD's job is intent, not design.** Atlassian's template asks for an objective, success metrics, assumptions, user stories, supporting designs, open questions and out of scope (`ATLASSIAN-PRD`, **first-party for Atlassian only**). Basecamp's pitch asks for a problem, an appetite, a solution, rabbit holes and no-gos (`SHAPEUP`, **first-party for Basecamp only**). The common core across them is goal, metrics, scope and non-goals: **Practitioner consensus only**. The Handoff's `feature` already holds the goal, scope and non-goals; it has no key for metrics.

3. **Stories and acceptance criteria have free, public guidance.** A story names an actor, what they want and why, and the goal matters most (`GOVUK-STORY`). Acceptance criteria are a checklist of outcomes (`GOVUK-STORY`), or Given/When/Then examples of three to five steps whose Then is observable output, not internal state (`GHERKIN`). The Handoff's `acceptance[]` is already Given/When/Then. It has no story actor.

4. **Diagrams are worth drawing only where they add value.** The C4 model says most teams need only the system context and container diagrams, not all four levels (`C4-DIAG`). The state machine, sequence (interaction) and activity diagrams are UML behaviours (`UML-XMI`); BPMN is for business processes (`BPMN`). Mermaid draws flowchart, sequence, state, ER and C4 diagrams in Markdown, and GitHub renders it, at whatever Mermaid version GitHub runs (`MERMAID`, `GH-DIAG`). Mermaid's C4 is experimental (`MERMAID-C4`). A state diagram is the one a Prototype can give almost for free: its nodes are a screen's Standard and Extra states, and its edges are `flow[]`.

5. **The API description and the architecture are the developer's.** OpenAPI 3.2.1 describes an HTTP API so that people and tools can understand it without the source (`OAS`). AsyncAPI 3.1.0 does the same for message-driven APIs (`ASYNC`). GLOSSARY says the Handoff records what a Stand-in pretends to do, never how. So the Handoff's part is the questions (`q-data-…`, addressed to the developer) and, where the UI depends on it, a draft of the data shape. `data[].shape` exists for that but is never written.

6. **Non-functional requirements need a target from the owner and an implementation from the developer.** The targets are a WCAG conformance level (`WCAG`; AA is GOV.UK's bar, `GOVUK-WCAG`), an ASVS level chosen by risk, where most applications should aim for L2 (`ASVS-USE`), and a performance budget such as Google's Core Web Vitals (`CWV`, **first-party for Google's metrics only**). Privacy is data protection by design from the planning stage, with a data protection impact assessment (DPIA) where the risk is high (`ICO-DPBD`). ISO/IEC 25010:2023 gives the checklist of nine quality characteristics (`ISO-25010`). The Handoff has no key for any of these targets.

7. **Analytics has no primary standard.** Segment, Amplitude and Mixpanel each describe a tracking plan: events and their properties, tied to business goals, starting small. Each is **first-party for its own product only** (`SEGMENT`, `AMPLITUDE`, `MIXPANEL`). The Handoff has no key for analytics. This finding from the earlier note still stands.

8. **The Definition of Ready is not in the Scrum Guide.** The 2020 guide defines only the Definition of Done. It says an item that the team can finish within one Sprint is ready for selection, usually after refinement (`SCRUM`). A DoR checklist is **Practitioner consensus only**. INVEST's Testable, a story the team understands well enough to write a test for (`INVEST`), is a usual item on it (**Practitioner consensus only**).

9. **Decision records are for decisions that are architecturally significant**: those that affect structure, quality attributes, dependencies, interfaces or construction techniques (`NYGARD`, `ADR-ORG`). The repo's own ADRs follow that convention; only three of the nineteen (0003, 0006, 0008) have a Status section. For a feature, the Handoff's `ownerDecisions` and answered `openQuestions[]` already act as a small decision log.

10. **The earlier UI note is out of date in two places.** ADR 0018 (2026-10-21) decided Extra states and a per-field `errors[]` on a Usage. Neither is built at `614e5ff`: the schema is unchanged, `validate.mjs` still accepts only `STANDARD_STATES`, and [#328](https://github.com/pawisssh/design/issues/328) is open. Its other findings still hold.

11. **What the repo could do** (last section):
    - **Derive from the Prototype:** a state diagram, a screen map, a draft sequence of each simulated operation, a draft data shape from mock data, a `.feature` file generated from `acceptance[]`, and a draft focus order. The diagrams would be new sections of the existing Rendering, laid out from keys the Handoff already has.
    - **A reading gap found on the way:** a `fetch` to the Prototype's own stub API route is not read as a Stand-in. request-access's route fakes latency and failure, yet its Handoff has `flow: []` and `data: []` (Finding 4).
    - **Ask the owner:** metrics, NFR targets, the story's actor, and which events to track. Only the goal, scope and non-goals are asked today.
    - **Leave to the developer:** the API description, the architecture, the data model and every NFR's implementation.

## Sources

Every source was read on 2026-10-22. They are paraphrased. The one exception is a single quote from `WCAG`.

Short prefixes:

- `C4` = https://c4model.com/ (Simon Brown, CC BY 4.0)
- `C4-DIAG` = https://c4model.com/diagrams
- `C4-CTX` = https://c4model.com/diagrams/system-context
- `C4-CON` = https://c4model.com/diagrams/container
- `UML` = https://www.omg.org/spec/UML/2.5.1/About-UML (UML 2.5.1, formal, December 2017)
- `UML-XMI` = https://www.omg.org/spec/UML/20161101/UML.xmi (OMG's machine-readable metamodel for UML 2.5.1; its package names and element comments are cited, not clause numbers)
- `BPMN` = https://www.omg.org/spec/BPMN/2.0.2/About-BPMN (BPMN 2.0.2, formal, January 2014)
- `ERD-CHEN` = P. Chen, "The Entity-Relationship Model: Toward a Unified View of Data", ACM TODS 1(1), 9–36, 1976, https://doi.org/10.1145/320434.320440. Only the bibliographic record was read (search index); the ACM page returned 403.
- `MERMAID` = https://mermaid.js.org/intro/ (Mermaid 12.2.0)
- `MERMAID-C4` = https://mermaid.js.org/syntax/c4.html
- `MERMAID-STATE` = https://mermaid.js.org/syntax/stateDiagram.html
- `MERMAID-ER` = https://mermaid.js.org/syntax/entityRelationshipDiagram.html
- `GH-DIAG` = https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
- `OAS` = https://spec.openapis.org/oas/latest.html (OpenAPI 3.2.1, 10 September 2026)
- `ASYNC` = https://www.asyncapi.com/docs/reference/specification/latest (AsyncAPI 3.1.0)
- `JSCHEMA` = https://json-schema.org/specification (JSON Schema 2020-12)
- `ISO-29148` = https://standards.ieee.org/ieee/29148/6937/ (IEEE's page for ISO/IEC/IEEE 29148-2018, published 2018-11-30). The standard is paywalled and iso.org returned 403, so only this public scope text was read.
- `ISO-25010` = https://committee.iso.org/standard/78176.html (ISO/IEC 25010:2023, edition 2, 2023-11; abstract only, paywalled)
- `ISO25000` = https://iso25000.com/en/iso-25000-standards/iso-25010 (a third-party portal, **secondary**; its page lists only part of the model)
- `GOVUK-STORY` = https://www.gov.uk/service-manual/agile-delivery/writing-user-stories (last updated 23 May 2016)
- `GOVUK-WCAG` = https://www.gov.uk/service-manual/helping-people-to-use-your-service/understanding-wcag (last updated 29 October 2024)
- `GHERKIN` = https://cucumber.io/docs/gherkin/reference/
- `INVEST` = https://xp123.com/invest-in-good-stories-and-smart-tasks/ (Bill Wake, 2003; first-party for INVEST, which he coined)
- `SCRUM` = https://scrumguides.org/scrum-guide.html (the Scrum Guide, November 2020)
- `ADR-ORG` = https://adr.github.io/
- `ADR-TPL` = https://adr.github.io/adr-templates/
- `NYGARD` = https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions (Michael Nygard, 15 November 2011)
- `WCAG` = https://www.w3.org/TR/WCAG22/ (W3C Recommendation, 12 December 2024)
- `ASVS` = https://asvs.owasp.org/ (OWASP ASVS 5.0.0, 30 May 2025)
- `ASVS-USE` = https://github.com/OWASP/ASVS/blob/master/5.0/en/0x03-What-is-the-ASVS.md (read through the GitHub API)
- `ICO-DPBD` = https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default/ (UK regulator, UK GDPR Article 25; updated 5 February 2026)
- `CWV` = https://web.dev/articles/vitals (updated 31 October 2024; first-party for Google's metrics only)
- `ATLASSIAN-PRD` = https://www.atlassian.com/software/confluence/templates/product-requirements (first-party for Atlassian's template only)
- `SHAPEUP` = https://basecamp.com/shapeup/1.5-chapter-06 (first-party for Basecamp's Shape Up only)
- `SEGMENT` = https://www.twilio.com/docs/segment/protocols/tracking-plan/best-practices (first-party for Segment only)
- `AMPLITUDE` = https://amplitude.com/docs/data/create-tracking-plan (updated 2026-09-22; first-party for Amplitude only)
- `MIXPANEL` = https://docs.mixpanel.com/docs/tracking-best-practices/tracking-plan (first-party for Mixpanel only)

Sources that could not be reached, and what was used instead:

- **ISO/IEC/IEEE 29148** on iso.org returned 403. `ISO-29148`, IEEE's public page for the same standard, was used.
- **The UML 2.5.1 PDF** (formal/17-12-05) downloads without a login, but its text could not be extracted with the tools at hand. `UML-XMI` was used, so no clause numbers are cited.
- **Chen's ER paper** on the ACM Digital Library returned 403. Only its bibliographic record was read.
- **Atlassian's PRD article** (`atlassian.com/agile/product-management/requirements`) rendered no body. `ATLASSIAN-PRD`, the Confluence template page, was used.
- **segment.com** returned 403. `SEGMENT`, the same docs on twilio.com, was used.
- **The GDPR on EUR-Lex** returned an empty page. `ICO-DPBD`, the UK regulator's guidance on UK GDPR Article 25, was used, so no EU article text is cited.
- **ISO/IEC 25010:2023's characteristic names** are not public. The abstract says there are nine. `ISO25000`, a secondary source, showed six of them.

## Findings

### 1. The package as a whole

- **No primary source defines the package.** None of the standards read here names a set of artifacts a developer must receive before starting. ISO/IEC/IEEE 29148 is the nearest. It covers requirements processes and the information items they produce, says what makes a good requirement, and can be used on its own or with the life-cycle standards (`ISO-29148`). Its contents are paywalled, so this note does not use its item list.
- **The list of artifacts in the question is Practitioner consensus only.** Each artifact on it is sourced separately below.
- **Reasoning, not sourced:** the package splits along who can know each part:
  - the owner knows intent and targets;
  - a Prototype shows behaviour and UI;
  - the developer decides how it is built.

  The last section uses that split.

### 2. PRD: goal, success metrics, scope, non-goals

**What it is for.** It agrees why the feature exists and where it stops, before anyone designs or builds.

**What it should contain.** There is no standard, so the list is **Practitioner consensus only**. Two published templates agree on the core:

- **Atlassian's Confluence template** (`ATLASSIAN-PRD`, **first-party for Atlassian only**):
  - target release, status and team;
  - objective, linked to the organisation's goals;
  - success metrics;
  - assumptions;
  - requirements as user stories with importance;
  - supporting designs and diagrams;
  - open questions with answers and dates;
  - out of scope.
- **Basecamp's Shape Up pitch** (`SHAPEUP`, **first-party for Basecamp only**):
  - the problem;
  - the appetite (the time the team is willing to spend);
  - the solution's core elements;
  - rabbit holes to avoid;
  - no-gos.

**Worth it vs overkill.**

- **Practitioner consensus only:** worth it when more than one person decides scope. A one-line goal is enough when the owner is also the builder.
- **A tension, left open here.** Shape Up says wireframes and high-fidelity mocks over-specify and box designers in, and prefers rough sketches (`SHAPEUP`, **first-party for Basecamp only**). A Handoff carries screenshots of every state from a Prototype. The two aim at different readers: Shape Up's team still designs, while a Handoff's developer builds a design already made.

**In the repo.**

- `feature.goal` is required.
- `feature.scope[]`, `feature.nonGoals[]` and `feature.owner` come from the `feature` decision.
- There is no key for metrics, assumptions, appetite or a release date.

### 3. User stories and acceptance criteria

**What they are for.** Stories split the work into pieces that each deliver an outcome. Acceptance criteria say when each piece is done.

**What they should contain.**

- **A story** names the actor, what they want to do and why. The goal is the most important part; if it is hard to write, the feature may not be needed. Epics are split into stories that fit an iteration (`GOVUK-STORY`).
- **INVEST** says a good story is Independent, Negotiable, Valuable, Estimable, Small and Testable. Testable means the team understands it well enough to write a test (`INVEST`).
- **Acceptance criteria**, two forms:
  - **GOV.UK's:** a checklist of outcomes, each phrased as done-when the user can do something, optionally linked to evidence such as diagrams (`GOVUK-STORY`).
  - **Gherkin's:**
    - Given puts the system in a known state, When is the event, and Then is an observable outcome, not internal state such as a database row.
    - Three to five steps per example.
    - A Rule groups the examples of one business rule, and a Scenario Outline runs one example per row of a table (`GHERKIN`).

**Worth it vs overkill.** Gherkin's own advice is a short scenario: more steps lose its value as a specification (`GHERKIN`). **Practitioner consensus only:** criteria are always worth it; executable `.feature` files are worth it only where the team runs Cucumber or a similar tool.

**In the repo.**

- `acceptance[]` holds `{id, screen, state, given, when, then, by}`. The agent drafts the criteria through the `acceptance` decision, and the owner can replace any of them (`acceptance:<id>`).
- There is no key for a story's actor or its why. `feature.goal` is the nearest.
- Today `state` may name only a Standard state (`validate.mjs`, the `state` check against `STANDARD_STATES`). ADR 0018 lets it name an Extra state, but that is not built yet.

### 4. User flows

**What they are for.** They show the path a user takes through screens and decisions to reach the goal, including the failure paths.

**What they should contain.** There is no primary source for a "user flow" as a design artifact, so this is **Practitioner consensus only**: the entry points, screens, decisions, success and error branches, and the exits. In notation, a user flow is usually a flowchart. UML would draw it as an activity, and BPMN as a process (Finding 5).

**Worth it vs overkill.** **Reasoning, not sourced:** worth it once a feature has more than one screen or a branch, and overkill for a single form with one success and one error.

**In the repo.**

- `flow[]` holds `{from, trigger, to, source}`, where `source` is `mock`, `simulated` or `missing`. With more than one screen, states read `<screen>/<state>`.
- What it holds depends on the Prototype.
  - invite-teammates has three entries: `sendInvites()` from default to loading, an 800 ms timer from loading to success, and a `missing` edge for the failure.
  - request-access has `flow: []`, and `data: []` too, although its Prototype (`skills/to-handoff/test/fixtures/v0-app`) submits and fails. Its form `fetch`es `POST /api/request-access` and moves to loading, then to error or success. The route is itself a Stand-in: its file says so in a comment, it waits 800 ms, and it fails when the email contains `fail`. The React reader (`react.mjs`) lists the route in `source.ignored`, and nothing reads a `fetch` as a Stand-in, so neither the transitions nor the stub API reach the Handoff. GLOSSARY counts a stub API as a Stand-in, so this is a reading gap, not a design choice.
- `SKILL.md` puts overlay flow transitions out of scope for React Prototypes.

### 5. Diagrams

**State machine.**

- **What it is for:** event-driven behaviour, modelled as states joined by transitions that events trigger (`UML-XMI`, the StateMachine element's comment).
- **Worth it:** **Reasoning, not sourced:** when a screen has more than its Standard states and the edges between them, such as retries, offline or partial data.
- **Mermaid** supports composite states, choice, fork and join, notes and concurrency (`MERMAID-STATE`). Its syntax follows PlantUML's and does not claim UML conformance (`MERMAID-STATE`).

**Sequence (UML interaction).**

- **What it is for:** the observable exchange of messages between participants (`UML-XMI`, the Interaction element's comment), such as UI, API and a third party.
- **Worth it:** **Reasoning, not sourced:** when an action crosses more than one system, or when timing matters, such as optimistic updates, polling or a webhook.
- **Practitioner consensus only:** this is usually the developer's diagram once the API is known.

**Activity, flowchart, BPMN.**

- **Activity:** UML's activity is behaviour as the coordinated sequencing of smaller units (`UML-XMI`).
- **BPMN:** a flowchart-like notation for business processes, meant for the people who design and run them, and precise enough to map to software (`BPMN`).
- **Worth it:** **Reasoning, not sourced:** BPMN when the feature is one step in a process that crosses people or teams, such as approvals. A flowchart is enough for a user flow.

**C4 context and container.**

- **System context:** one software system with its users and the systems it connects to. Its audience is everybody, technical or not, and C4 recommends it for all teams (`C4-CTX`).
- **C4 container:** the applications and data stores inside one system, for technical people. C4 recommends it for all teams too (`C4-CON`).
- **The other levels are optional.** C4 says those two are enough for most teams, and that teams need not draw all four levels, only those that add value (`C4-DIAG`). That covers the C4 component and code levels. For the supporting diagrams (landscape, dynamic, deployment), the page gives no recommendation either way.
- **Worth it:** **Reasoning, not sourced:** for a feature that adds a new system, C4 container, external dependency or data store. A feature inside an existing app changes none of them.

**ERD (entity-relationship diagram) and data model.**

- **What it is for:** entities, their attributes and the relationships between them. Chen's 1976 paper introduced the model and its diagram (`ERD-CHEN`, bibliographic record only). This note found no standard for ER notation.
- **Mermaid** draws crow's foot cardinality and attributes with types and PK, FK or UK keys (`MERMAID-ER`).
- **Worth it:** **Reasoning, not sourced:** when the feature adds or changes stored data. The developer owns the stored model. The designer owns only the fields the UI shows or depends on (Finding 6).

**Mermaid, because the repo renders Markdown.**

- **Diagram types:** Mermaid 12.2.0 lists flowchart, sequence, class, state, ER, user journey, C4 and many others (`MERMAID`).
- **C4 is experimental.** Its page warns that the syntax may change (`MERMAID-C4`).
- **GitHub** renders a `mermaid` code block in Markdown files, issues, pull requests and wikis. It suggests checking its Mermaid version with `info` (`GH-DIAG`).

**The repo has no diagram today.** The HTML Rendering shows `flow[]` as a table (earlier note, §3).

### 6. API description and data shape

**What it is for.** It agrees the interface between the UI and the services behind it, so both sides can build against it.

**What it should contain.**

- **OpenAPI 3.2.1** describes an HTTP API's surface and behaviour so that people and tools can understand the service without its source or its traffic. Tools generate documentation, clients, servers and tests from it. Its top-level fields include `info`, `servers`, `paths`, `webhooks`, `components` and `security` (`OAS`).
- **AsyncAPI 3.1.0** does the same for message-driven APIs over protocols such as Kafka, MQTT, AMQP or WebSockets. Its top-level fields include `channels` and `operations`, and it borrows from OpenAPI (`ASYNC`).
- **JSON Schema 2020-12** is the current dialect (`JSCHEMA`). The Handoff's own schema uses it.

**Worth it vs overkill.** **Practitioner consensus only:** an API description is worth it whenever the front end and back end are built by different people or at different times. For a single developer, it is a byproduct.

**In the repo.**

- GLOSSARY says a Stand-in records what it pretends to do, never how.
- `data[]` records each Stand-in's `source` and `note`, with a developer question. invite-teammates asks where the invites come from, and what `sendInvites()` calls and how it fails.
- `data[].shape` exists but is never written.
- `source.ignored` lists the Prototype's API routes and middleware (`SKILL.md`). That tells the developer what exists, not what the API should be, and a stub route such as request-access's is lost there (Finding 4).
- **Reasoning, not sourced:** the fields the UI reads are the designer's content. invite-teammates' `mockInvites` holds `{email, role}`, with role values Editor and Viewer, and the list renders them. The endpoint, the auth, the pagination and the error codes are the developer's.

### 7. Non-functional requirements

**What they are for.** They set how well the feature must work, as opposed to what it does.

**What they should contain.** A target the team can verify, per quality.

- **The quality model.** ISO/IEC 25010:2023 (edition 2) defines nine characteristics with sub-characteristics. It is a reference for specifying, measuring and evaluating quality, including in requirements and acceptance criteria (`ISO-25010`, abstract only). The abstract does not name them. A secondary portal lists six: functional suitability, performance efficiency, compatibility, interaction capability, reliability and security (`ISO25000`, **secondary**). This note does not name the other three.
- **Accessibility.**
  - **The levels.** Each level requires all success criteria up to and including it: A, then AA, then AAA (`WCAG` §5.2.1).
  - **Full pages and complete processes.** Conformance applies to full pages, including every responsive variant. Every page in a process, such as a checkout, must conform (`WCAG` §5.2.2–5.2.3).
  - **AAA site-wide is too much.** WCAG warns that "it is not recommended that Level AAA conformance be required as a general policy for entire sites", because some content cannot meet every AAA criterion (`WCAG` §5.2.1, note 2).
  - **AA is a common bar.** GOV.UK services must meet WCAG 2.2 AA (`GOVUK-WCAG`).
- **Security.**
  - **What ASVS is.** ASVS 5.0.0 is a list of requirements for secure development and a basis for testing. It can also be named in a contract (`ASVS`).
  - **The three levels:**
    - L1 is about 20% of the requirements: the first-layer defences.
    - L2 brings the total to about 70%, and most applications should aim for it.
    - L3 is the rest: defence in depth.
  - **Choosing a level.** The organisation picks it by risk. A startup holding little sensitive data might start at L1, and a bank would struggle to justify less than L3 (`ASVS-USE`).
- **Privacy.**
  - Data protection by design and by default is required under UK GDPR Article 25, from the planning stage on.
  - A DPIA is required where processing is likely to be high risk, and good practice otherwise (`ICO-DPBD`).
- **Performance.** Core Web Vitals give a ready target: Largest Contentful Paint (LCP) at most 2.5 s, Interaction to Next Paint (INP) at most 200 ms and Cumulative Layout Shift (CLS) at most 0.1, at the 75th percentile of page loads, split by mobile and desktop (`CWV`, **first-party for Google's metrics only**).

**Worth it vs overkill.**

- The levels are chosen by risk (`ASVS-USE`).
- AAA is not a site-wide target (`WCAG`).
- **Practitioner consensus only:** most features inherit the product's NFRs. A feature needs its own only when it changes them, for example new personal data, a new public endpoint or a heavy page.

**In the repo.**

- There is no key for any target.
- Accessibility is partly there as content, not as a target: `regions[].landmark` is written, and `a11y` exists but is never written (earlier note, §2).
- **Reasoning, not sourced:** the owner states the targets; the developer implements and verifies them (last section).

### 8. Analytics and tracking events

**What it is for.** It names the events the feature emits, so the success metrics can be measured.

**What it should contain.** No primary standard exists. Three vendors describe a tracking plan, each **first-party for its own product only**:

- **Segment** (`SEGMENT`):
  - start from measurable business goals and the actions tied to them;
  - name events Object + Action in Title Case, and properties in snake_case;
  - keep dynamic values out of names;
  - start with a few core events;
  - record where each event lives in the code and why it matters.
- **Amplitude** (`AMPLITUDE`):
  - each event has a name, description, category, source and status;
  - each property has a type, rules and a required flag;
  - write the plan before instrumenting.
- **Mixpanel** (`MIXPANEL`):
  - start from KPIs and map them to flows, then to events and properties;
  - avoid tracking everything.

**Worth it vs overkill.** **Practitioner consensus only:** worth it when the PRD has a metric that a product event measures. Overkill for internal tools nobody measures.

**In the repo.** There is no key. The earlier note's "missing" still holds.

### 9. Definition of Ready

**What it is for.** It is the team's checklist that an item is understood well enough to start.

**What the Scrum Guide says.**

- The 2020 guide defines the Definition of Done, a formal description of the state of the Increment, and does not mention a Definition of Ready.
- It says an item that the team can finish within one Sprint is ready for selection in Sprint Planning, usually after refinement adds detail such as description, order and size (`SCRUM`).

**What it should contain.** **Practitioner consensus only:** the story meets INVEST (`INVEST`), the acceptance criteria are written, the designs and states are available, dependencies are known, and the open questions to the team are answered. **Practitioner consensus only:** treated as a rigid gate, a DoR delays work. So it should stay a short checklist.

**In the repo.** **Reasoning, not sourced:** the DoR is the team's to agree, not To-handoff's. `review` already prints what blocks Sign-off, including the open questions by addressee and the missing states. A signed-off Handoff with every developer question answered meets the UI part of a typical DoR.

### 10. Decision records

**What they are for.** They keep the reason behind a hard-to-reverse choice, for whoever changes it later.

**What they should contain.**

- **Nygard's form** (`NYGARD`):
  - a numbered title;
  - the context, as neutral facts about the forces;
  - the decision, in active voice;
  - a status: proposed, accepted, deprecated or superseded;
  - the consequences, negative ones included.

  Keep it to one or two pages. Store it in the repo. A reversed record is superseded, never deleted.
- **Which decisions to record:** only architecturally significant ones (`NYGARD`). adr.github.io defines that as a decision that addresses a requirement with a measurable effect on the architecture and quality (`ADR-ORG`). It lists other templates: MADR 4.0.0 with considered options and their pros and cons, and Y-statements (`ADR-TPL`).

**Worth it vs overkill.** Only for architecturally significant decisions (`NYGARD`). A feature's product decisions rarely qualify.

**In the repo.**

- **The repo's ADRs** (`docs/adr/`) differ from Nygard's form:
  - the title is the decision as a sentence;
  - one paragraph holds the context and the decision, followed by who decided it and when;
  - they have Considered Options and Consequences sections;
  - the README's revisit list gives a trigger to 12 of the 19;
  - only 0003, 0006 and 0008 have a Status section;
  - numbers come from `node scripts/adr.mjs next`.
- **For one feature,** `ownerDecisions` (by stable key) and the answered `openQuestions[]` already record the owner's decisions, and a re-run carries them over.

### 11. The UI layer: what the earlier note covers, and what changed since

The UI layer is the earlier note's subject: [What must a Handoff for one Prototype's feature carry](design-handoff-contents.md). In brief, the Handoff holds:

- screens × Standard states × breakpoints, with screenshots;
- every element as a Usage: a Contract with its tuple, a Component Proposal, or a raw element with a reason;
- token-bound styles and Off-system values;
- copy, flow, Stand-ins, acceptance criteria and open questions;
- Sign-off, with Drift computed from pins.

Its gaps:

- **Keys that exist but are never written:** `a11y`, `interactions`, `tokensToAdd`, `regions[].responsive`, `data[].shape`.
- **Content with no key at all:** content limits, i18n and RTL, headings, status announcements, motion, assets, analytics.

What changed between `c650fc6` and `614e5ff` (still so at `e211f04`):

- **States beyond the five: was "missing", now decided but not built.**
  - ADR 0018 (owner, 2026-10-21) lets a screen have Extra states.
  - An Extra state comes from a Prototype condition named through a new `state:<expr>` decision, or from the owner's word, as a missing state with a question.
  - Acceptance criteria may name it.
  - At `614e5ff`, `validate.mjs` still rejects any name outside `STANDARD_STATES` (its `state` and `states` checks), the schema is unchanged, and [#328](https://github.com/pawisssh/design/issues/328) (one place for a screen's allowed state names) is open.
  - The earlier note labelled such states **Practitioner consensus only**. ADR 0018 is now the repo's own source for them.
- **Field validation: was "partial", now decided but not built.** ADR 0018 puts a field's errors on its Usage as a new `errors[]`, each a condition and its copy, inside the `error` state, following GOV.UK's error-message guidance (ADR 0018). The schema has no `errors[]` yet.
- **Everything else in its tables still holds.**
  - The schema file has no diff since `c650fc6`.
  - generate still writes none of `a11y`, `interactions`, `tokensToAdd`, `responsive` or `shape`: `git diff c650fc6..HEAD` on `generate.mjs` touches none of them, and `grep` finds no writer.

## Summary table

| Artifact | What it is for | What it should contain | Primary source | Worth it when / overkill when | In the Handoff today |
| --- | --- | --- | --- | --- | --- |
| PRD | Agree why and where it stops | Goal, metrics, scope, non-goals, assumptions, open questions | None. `ATLASSIAN-PRD`, `SHAPEUP` first-party for their own templates; **Practitioner consensus only** | More than one person decides scope / owner builds alone | `feature.goal`, `scope[]`, `nonGoals[]`, `owner`; no metrics |
| User stories | Split into valuable pieces | Actor, want, why; INVEST | `GOVUK-STORY`, `INVEST` | Several stories or iterations / one small change | None (goal only) |
| Acceptance criteria | Say when it is done | Given/When/Then of 3–5 steps, or done-when outcomes | `GHERKIN`, `GOVUK-STORY` | Always; executable `.feature` files only with a runner | `acceptance[]`, Standard states only until ADR 0018 is built |
| User flow | Path through screens and branches | Entry, steps, branches, exits | None; **Practitioner consensus only** | More than one screen or branch / one form | `flow[]`, when the Prototype simulates work in its own code; a `fetch` to a stub route is not read |
| State diagram | Event-driven behaviour of a screen | States, transitions, triggers | `UML-XMI`; `MERMAID-STATE` | Retries, offline, partial data / only the Standard states | Derivable from `screens[].states` + `flow[]`; not drawn |
| Sequence diagram | Messages between participants | Lifelines, messages, alternatives | `UML-XMI` | Crosses systems or timing matters / one call | Derivable in draft from simulated `data[]`; not drawn |
| Activity / flowchart / BPMN | Process across steps or people | Activities, decisions, lanes | `UML-XMI`, `BPMN` | Process across people or teams / a single screen | None |
| C4 context and container | Where the feature sits in the system | Users, systems, C4 containers | `C4`, `C4-CTX`, `C4-CON` | New system, C4 container or dependency / inside one app | None (developer's) |
| ERD / data model | Stored entities and relations | Entities, attributes, keys, cardinality | `ERD-CHEN` (record only); `MERMAID-ER` | New or changed stored data / no persistence change | `data[].shape` exists, never written |
| API description | The interface between UI and services | Paths or channels, schemas, errors, security | `OAS`, `ASYNC`, `JSCHEMA` | Front and back end built apart / one developer | `data[]` questions to the developer; `source.ignored` |
| NFR: accessibility | Conformance target | WCAG level, complete processes | `WCAG`, `GOVUK-WCAG` | Always; AA, not AAA site-wide | `a11y` content partly; no target |
| NFR: security | Security target | ASVS level by risk | `ASVS`, `ASVS-USE` | New data, endpoint or auth / no new surface | None |
| NFR: privacy | Data protection by design | DPIA need, data minimisation | `ICO-DPBD` | Personal data handled / none | None |
| NFR: performance and quality | Measurable quality targets | Budgets (such as Core Web Vitals); 25010 as a checklist | `ISO-25010`; `CWV` first-party for Google | Heavy page or new load / inherits product's | None |
| Analytics | Measure the metrics | Events, properties, types, where and why | None. `SEGMENT`, `AMPLITUDE`, `MIXPANEL` first-party for their own products | PRD has a measurable metric / nothing is measured | No key |
| Definition of Ready | Team's start checklist | INVEST, criteria, designs, dependencies, answered questions | None (`SCRUM` has only the DoD, and items ready for selection); **Practitioner consensus only** | Team agrees one / not as a rigid gate | `review` shows what blocks Sign-off |
| Decision records | Keep the why of hard-to-reverse choices | Context, decision, status, consequences | `NYGARD`, `ADR-ORG`, `ADR-TPL` | Architecturally significant / product choices | `ownerDecisions`, answered `openQuestions[]` |
| UI: screens, states, components, tokens | What to build, against the Design System | See the [earlier note](design-handoff-contents.md) | See the [earlier note](design-handoff-contents.md) | Always | The Handoff's core; Extra states decided, not built |

## What this repo could do about it

The project goal (owner, 2026-10-22, recorded in ADR 0019) is to take a vibe-coded Prototype to either Figma Component Sets or a developer Handoff. Work is judged by which vibe-coded projects reach either output. Every run starts at From-Prototype (`/from-prototype`), which names the Prototype kind and runs To-handoff when the owner asks for a Handoff. ADR 0019 supports a Handoff wherever To-handoff's reader takes the framework (one HTML file, a Next.js App Router app, or a Vite app), so Group 1 assumes those readers. The question for each artifact is whether To-handoff can get it from the Prototype, must ask the owner, or should leave it to the developer. Everything below is a proposal. No skill, schema or glossary is changed by this note.

**Group 1: To-handoff could derive it from a Prototype.** These are drafts. The owner confirms them at Sign-off like any agent decision.

| Artifact | What already exists | What would be new |
| --- | --- | --- |
| State diagram per screen | `screens[].states` (Standard states; Extra states once ADR 0018 is built) and `flow[]` with `trigger` and `source` | A Mermaid `stateDiagram-v2` section in the Rendering. Nodes are Standard and Extra states, never State axis values; edges are `flow[]`, and a `missing` edge is flagged. It is a layout of existing keys, so it adds no content (GLOSSARY, Rendering). Today a Prototype whose work goes through a `fetch`, like request-access, gives no edges (see the `fetch` row below). |
| Screen map / user flow across screens | `screens[]` from Next `app/**/page.tsx` or Vite `<Route>` entries, with `at`; multi-screen `flow[]` reads `<screen>/<state>` | A flowchart section across screens. Navigation links between routes are not read into `flow[]` today, so that would be new reading. |
| Draft sequence of each simulated operation | `data[]` entries with `source: "simulated"` (`sendInvites()`, 800 ms) and the `flow[]` edges around them | A sequence section, with participants named as what the Stand-in pretends to do (UI → send invites → success or failure), never how. It is a draft for the developer's real one. |
| A `fetch` to a stub API route, recorded as a Stand-in | Nothing: the route is only listed in `source.ignored`, and request-access gets `flow: []` and `data: []` (Finding 4) | Reading a `fetch` to the Prototype's own API route as a `data[]` Stand-in with `source: "simulated"`, with the state changes around it as `flow[]` edges, and a developer question. It would record what the route pretends (accepts the form, sometimes fails), not its code. |
| Draft data shape the UI depends on | `data[].shape` in the schema, never written; mock literals such as `mockInvites` `{email, role}` | generate writes `shape` from the mock data's fields and the values the UI reads. It could be shown as a JSON Schema fragment (`JSCHEMA`) or a Mermaid ER fragment (`MERMAID-ER`). Only UI-needed fields; persistence stays the developer's. |
| Gherkin form of the acceptance criteria | `acceptance[]` in Given/When/Then, agent-drafted, owner-replaceable | A `.feature` file generated from `acceptance[]`, grouped by screen, with a Rule per state. It is not a Rendering, because it carries only one key. |
| Accessibility content | `a11y.focusOrder`, `a11y.landmarks`, `a11y.labels`, never written; `regions[].landmark` written | Writing a draft focus order from DOM order, as the earlier note proposed (§2). |
| Inventory hints for the developer | `source.ignored` (API routes, middleware); `data[]` questions addressed to the developer | Nothing. This is already there. |
| The UI layer: screens, states, Usages, tokens, copy | The Handoff's core (Finding 11; the [earlier note](design-handoff-contents.md)) | Extra states and a field's `errors[]`, decided in ADR 0018 and not built ([#328](https://github.com/pawisssh/design/issues/328)); the earlier note's never-written keys |
| Candidate analytics events | `flow[]` triggers and the Usages that start them | **Reasoning, not sourced:** a list of candidate interaction points. Which ones to track is the owner's (Group 2), so only the candidates are derivable. |

**Group 2: only the owner or PM can supply it.** No Prototype shows these. To-handoff can only ask for them, through the `feature` decision or new decision keys.

| Artifact | Asked today? | Proposal |
| --- | --- | --- |
| Goal | Yes: `feature.goal`, required | Nothing. |
| Scope, non-goals, owner | Yes: the `feature` decision's `scope`, `nonGoals` and `owner` | Nothing. invite-teammates has them; request-access has the goal only. |
| Success metrics | No | A `feature.metrics[]` key, asked in the same `feature` decision. |
| Story actor and why | No (`feature.goal` approximates it) | An actor in `feature`, so criteria can name who. |
| NFR targets: WCAG level, ASVS level, performance budget, whether a DPIA is needed | No | Targets only, as `feature` fields or a new decision. ASVS says the organisation picks its level by risk (`ASVS-USE`); that the owner speaks for the organisation here is **Reasoning, not sourced**. The implementation is not the owner's (Group 3). |
| Which events to track, and for which metric | No | A tracking decision that picks from Group 1's candidates. |
| Extra states the Prototype does not show | Decided (ADR 0018: the owner's word, as a missing state with a question), not built | Nothing beyond ADR 0018. |
| Owner's acceptance criteria and answers | Yes: `acceptance:<id>`, `question:<id>` owner decisions | Nothing. |
| Sign-off | Yes: `approve` on the owner's word | Nothing. |
| A process across people or teams (activity diagram or BPMN) | No | Nothing in the Handoff. A Prototype shows one user's path, so a wider process is the owner's to supply beside it; the user flow inside it is Group 1's. |
| Definition of Ready | No; it is the team's (owner with developers) | **Reasoning, not sourced:** `review` could print the package parts that are present and absent beside what blocks Sign-off, without owning the checklist. |

**Group 3: the developer owns it.** GLOSSARY says the Handoff records what a Stand-in pretends to do, never how. ADR 0007 keeps To-handoff out of the developer's project. So these stay outside the Handoff, and the Handoff's part is the question that hands them over.

| Artifact | Why it is the developer's | What the Handoff gives them |
| --- | --- | --- |
| API description (OpenAPI or AsyncAPI) | It is the how of every Stand-in | `data[]` questions (`q-data-…`, addressed to the developer), the draft `shape`, `source.ignored` |
| C4 context, C4 containers, deployment | Architecture | Nothing. The Handoff names no systems. |
| Stored data model and ERD | Persistence beyond what the UI shows | The draft `shape` of UI-needed fields |
| Sequence diagrams of the real calls | They depend on the API | The draft sequence of each simulated operation (Group 1) |
| NFR implementation and verification: ASVS controls, performance work, privacy measures, a raw element's accessibility | Built and tested in code. A Contract Usage inherits its Code Library component's behaviour (earlier note, §2, Reasoning) | The owner's targets (Group 2) and the Handoff's `a11y` content |
| Analytics instrumentation | Code | The owner's chosen events (Group 2) |
| Technical decision records | Architecturally significant decisions (`NYGARD`) | Nothing. The repo's own `docs/adr/` is for this repo, not the developer's. |
| Definition of Done | The team's quality bar for the increment (`SCRUM`) | Nothing. |
