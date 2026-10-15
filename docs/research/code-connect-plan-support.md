# Does the Figma Professional plan support Code Connect?

Research for [#4](https://github.com/pawisssh/design/issues/4) (map [#1](https://github.com/pawisssh/design/issues/1)). Sources checked on 2026-10-16.

## Short answer

**Yes.** Professional supports Code Connect through both the CLI and Code Connect UI. You need a **Full or Dev seat**, and Professional is limited to **one active library and one active framework**. Code Connect therefore stays in scope for the Button pilot. The limit does affect the later plan to prove a second Code Library.

## Findings

### 1. Plans and seats

- The Figma help center lists Code Connect as "Professional, Organization, Government, and Enterprise plans" and says it "Requires a Full or Dev seat" ([Help: Code Connect][help-cc]).
- The plan comparison table marks Code Connect and Dev Mode as included on Professional, Organization and Enterprise, and not on Starter ([Help: Compare plans][help-plans]).
- The pricing page data sets `professionalPlan.hasFeature: true` for the "Code Connect" row ("Access design system component code in Dev Mode"). Professional seat prices are Full $16/mo, Dev $12/mo and Collab $3/mo ([Pricing][pricing]).
- The Code Connect CLI v2.0.2 changelog (2026-10-14) adds Professional-specific handling: "Code Connect publishing on Professional plans now confirms the active library and framework when they are first selected. If a publish exceeds the one-library, one-framework limit, the CLI explains the restriction…" ([CHANGELOG v2.0.2][changelog]). Figma would not ship that code if the CLI could not publish on Professional.

### 2. Sources that disagree, and why they lose

Three first-party pages still say Professional is excluded:

- The developer docs intro says "Available on a Dev or Full seat on the Organization, and Enterprise plans" ([Dev docs: Code Connect][dev-cc]).
- The Code Connect UI setup page uses the same wording ([Dev docs: Code Connect UI][dev-ccui]).
- The GitHub README (line 14) says "Code Connect is available on Organization and Enterprise plans and requires a full Design or Dev Mode seat" ([figma/code-connect README][readme]).

The newer, more specific sources win. The README was last changed 2026-08-18 (commit `f55fc3a`, v2.0.0). The CLI's own changelog for v2.0.2, released 2026-10-14, implements the Professional limit. The help center, plan table and pricing page all agree with the changelog. The developer docs and README look stale. The release note announcing the change to Professional was not found, so the change date is unconfirmed.

### 3. What Professional gets

**The one-library, one-framework limit.** "Professional plans can have one active library and one active framework." Whichever library and framework is published first, through UI or CLI, becomes active. A team admin can switch it under Admin → Settings → Resources → Code Connect. Connections for any other library or framework are kept but "show a Deactivated badge in Dev Mode and Code Connect UI and aren't returned by the Figma MCP server" ([Help: Code Connect][help-cc]).

**CLI and Dev Mode.**
- The CLI uses template files to map Figma properties to code components, so Dev Mode shows real code snippets.
- Connections made with the CLI show up in Code Connect UI but can only be edited from the CLI ([Help: Code Connect][help-cc]).

**Code Connect UI.**
- It links published library components to a code file path, either through GitHub or entered by hand.
- These connections "do not display code snippets in the Inspect panel". Inspect shows only the file and component name ([Dev docs: Code Connect UI][dev-ccui]).
- It requires "a Figma library file with published design components" ([Dev docs: Code Connect UI][dev-ccui]).
- One-to-many mapping (one design component to React, SwiftUI and other frameworks) is a UI feature ([Help: Code Connect][help-cc]). On Professional only one framework is active, so this adds nothing there.

**MCP server.**
- Both UI and CLI connections feed the Figma MCP server ([Help: Code Connect][help-cc]).
- For frames that contain connected components, the server adds `<CodeConnectSnippet>` wrappers to the context it returns.
- CLI mappings carry the snippets from the Code Connect file. UI mappings only produce an import line and a basic snippet ([Dev docs: MCP × Code Connect][mcp-cc]).
- Relevant tools are `get_design_context`, `get_code_connect_map`, `add_code_connect_map`, `get_code_connect_suggestions` and `send_code_connect_mappings`. None of them is marked as plan-restricted ([Dev docs: MCP tools][mcp-tools]).

**MCP rate limits on Professional.**

| Seat | Limit |
|---|---|
| Dev or Full | Up to 200 tool calls a day and 10 a minute |
| View or Collab | Up to 20 a month |

- These limits apply to tools that read Figma data.
- Tools that write are exempt, including `add_code_connect_map` ([Dev docs: MCP rate limits][mcp-limits]).

## What this means for the map

These are options for the map to weigh, not decisions.

- **Code Connect stays in scope.** The Contract does not have to settle for storing only the code↔design mapping.
- **The seat type is unconfirmed.** #1 says "Figma plan: Professional" but doesn't name the seat. Code Connect needs a Full or Dev seat. A View or Collab seat also caps MCP at 20 calls a month, which would block MCP batch building whatever happens with Code Connect.
- **The Button pilot fits the limit.** It uses one Design Library (Carbon) and one framework (React).
- **Proving a second Code Library collides with the "one active library" limit.**
  - shadcn/ui is also React, so the *framework* limit is not the problem.
  - A second Design Library built from shadcn/ui would be a second *library*. Its connections would be deactivated, and MCP would not return them, until an admin switches the active library.
  - This assumes Figma's "library" means one published library file, which equals one Design Library. That is how the help-center wording reads, but it is not stated outright.
- **CLI or UI.**
  - To get real snippets in Dev Mode and rich MCP context, use the CLI. To-design (or a later skill) could generate Code Connect template files from the Contract.
  - Code Connect UI or `add_code_connect_map` gives a path plus a basic snippet with no template files to maintain.
- **Order of steps.** Code Connect needs published library components, so it can only run after the Component Set is published to the Design Library.

### If the one-and-one limit bites, Professional can still:

1. Keep the mapping only in the Contract, the original fallback. The agent reads it alongside MCP output.
2. Use Code Connect for the active library only, and have the team admin switch the active library while working on a second one.
3. Upgrade to Organization, which has no one-library, one-framework limit ([Help: Code Connect][help-cc]).

## Open uncertainty

- The developer docs and README contradict the help center, plan table, pricing page and CLI changelog. The latter four are newer and agree with each other. A one-step check would settle it: see whether **Admin → Settings → Resources → Code Connect** appears in the owner's Professional team admin.
- The owner's seat type (Full, Dev, Collab or View) is unknown.
- When Figma made Code Connect available on Professional is unknown, because no release note was found.

[help-cc]: https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect
[help-plans]: https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features
[pricing]: https://www.figma.com/pricing/
[changelog]: https://github.com/figma/code-connect/blob/main/CHANGELOG.md
[readme]: https://github.com/figma/code-connect/blob/main/README.md
[dev-cc]: https://developers.figma.com/docs/code-connect/
[dev-ccui]: https://developers.figma.com/docs/code-connect/code-connect-ui-setup/
[mcp-cc]: https://developers.figma.com/docs/figma-mcp-server/code-connect-integration/
[mcp-tools]: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
[mcp-limits]: https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/
