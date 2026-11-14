# Architecture

How Windtunnel is put together, from the whole system down to the agents.
Every diagram names the files that hold what it shows. The in-app view of
this page is under the book icon in the top bar (`/app/docs`).

**Keep this file current.** A change that adds, removes or renames a stage,
an agent, a table, an API route group, a connector or a top-level module
updates the matching section here in the same commit. `pnpm test` checks
that every file path, stage, agent and table named below still exists.

## 1. The system

One Next.js server holds the site, the product app, the API and the engine.
A run is not a separate service: it runs inside the server process and
outlives the request that started it.

```mermaid
flowchart LR
  person([Person in a browser])

  subgraph server["Windtunnel server · one Next.js process"]
    site["Site<br/>src/app/(site)"]
    app["Product app<br/>src/app/app"]
    api["API routes<br/>src/app/api"]
    engine["Engine<br/>src/server/engine"]
    connectors["Connectors<br/>src/server/connectors"]
    projects["Projects and cockpit<br/>src/server/projects"]
  end

  db[("Postgres<br/>src/server/db")]
  claude["Claude API<br/>Opus 5.5 · Sonnet 5.5"]
  github["GitHub<br/>repositories to read"]
  folders["Local folders<br/>repos/"]
  factory["8090 Software Factory<br/>MCP server"]

  person --> site
  person --> app
  app -- "fetch, server render" --> api
  app -- "event stream (SSE)" --> api
  api --> engine
  api --> projects
  api --> connectors
  engine --> claude
  engine -- "git clone, read only" --> github
  engine -- "read only" --> folders
  engine --> db
  projects --> db
  connectors --> db
  connectors -- "MCP over HTTP, OAuth" --> factory
```

| Part                  | Where                              | What it does                                       |
| --------------------- | ---------------------------------- | -------------------------------------------------- |
| Site                  | `src/app/(site)/page.tsx`          | The home page                                      |
| Product app           | `src/app/app/layout.tsx`           | Projects, cockpit, runs, settings                  |
| API                   | `src/app/api/`                     | `runs`, `projects`, `connectors`, `demo`, `health` |
| Engine                | `src/server/engine/run.ts`         | The stages of a run                                |
| One door to the model | `src/server/engine/llm.ts`         | Every Claude API call                              |
| Run registry          | `src/server/engine/registry.ts`    | Starts runs, streams their events                  |
| Database              | `src/server/db/schema.ts`          | The tables; migrations in `drizzle/`               |
| Docker                | `docker-compose.yml`, `Dockerfile` | The app and Postgres, locally                      |

## 2. The code, module by module

```mermaid
flowchart TB
  subgraph ui["Screens · src/app and src/components"]
    pages["Pages<br/>src/app/app/**/page.tsx"]
    shell["Shell<br/>src/components/app"]
    runui["Run view<br/>src/components/run"]
    projectui["Cockpit and live map<br/>src/components/project"]
    connectorui["Connectors<br/>src/components/connectors"]
  end

  subgraph shared["Shared · src/lib"]
    feed["Live feed reducer<br/>src/lib/run-feed.ts"]
    livemap["Live map state<br/>src/lib/live-map.ts"]
    layout["Diagram layouts<br/>src/lib/sankey-layout.ts<br/>src/lib/architecture-layout.ts"]
    labels["Agents and labels<br/>src/lib/agents.ts<br/>src/lib/labels.ts"]
    catalog["Connector catalog<br/>src/lib/connectors.ts"]
  end

  subgraph serverside["Server · src/server"]
    run["run.ts · stages"]
    llm["llm.ts · Claude"]
    prompts["prompts.ts"]
    checks["coverage.ts · validate.ts · score.ts"]
    repo["repo/ · fetch, survey, read tools"]
    sample["sample.ts · sample-project.ts"]
    store["store.ts · runs in Postgres"]
    cockpit["projects/cockpit.ts"]
    deliver["connectors/deliver.ts"]
    mcp["connectors/mcp.ts · oauth.ts"]
  end

  pages --> shell & runui & projectui & connectorui
  runui & projectui --> feed --> livemap
  projectui --> layout
  pages --> cockpit
  run --> llm & prompts & checks & repo & store
  sample -. "stands in for" .-> llm
  deliver --> mcp
  run -. "finished run" .-> deliver
```

Rules that hold across modules (from `CLAUDE.md`):

- Only `src/server/engine/llm.ts` talks to the Claude API.
- Only `src/server/connectors/mcp.ts` talks to an MCP server.
- Nothing from a repository is ever installed, built or run.
- A model's claims are checked by code before they are kept.

## 3. A run, stage by stage

```mermaid
flowchart LR
  start(["Run started<br/>registry.ts startRun"]) --> survey
  survey["survey<br/>fetch, list files,<br/>data inventory<br/>repository runs only"] --> model
  model["model<br/>Opus 5.5<br/>design model, then<br/>architecture (2nd call)"] --> coverage
  coverage["coverage<br/>no model call<br/>gaps code can see"] --> agents
  agents["agents<br/>Sonnet 5.5 × 5<br/>in parallel"] --> challenge
  challenge["challenge<br/>Sonnet 5.5 × 5<br/>review each other"] --> judge
  judge["judge<br/>Opus 5.5<br/>merge, reject, rank<br/>+ secrets found by code"] --> remediation
  remediation["remediation<br/>Opus 5.5<br/>fix, patch, CWE, OWASP<br/>security findings only"] --> work_orders
  work_orders["work_orders<br/>Opus 5.5<br/>with acceptance criteria"] --> done
  done(["Run completed"]) -. "project linked" .-> deliver["Send work orders<br/>connectors/deliver.ts"]
```

| Stage       | Code                                                                                                         | Model      | Checked by                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| survey      | `src/server/engine/repo/fetch.ts`, `src/server/engine/repo/survey.ts`, `src/server/engine/repo/inventory.ts` | none       | file and size limits                                                                                                     |
| model       | `src/server/engine/run.ts` with `MODEL_SYSTEM` or `REPO_MODEL_SYSTEM` in `src/server/engine/prompts.ts`      | Opus 5.5   | `normalizeModel` in `src/server/engine/coverage.ts`, `normalizeArchitecture` in `src/server/engine/architecture.ts`      |
| coverage    | `findCoverage` in `src/server/engine/coverage.ts`                                                            | none       | it is code                                                                                                               |
| agents      | `src/server/engine/run.ts`, briefs in `src/lib/agents.ts`                                                    | Sonnet 5.5 | `checkAgentReport` in `src/server/engine/validate.ts`, or `report_finding` in `src/server/engine/repo/agent-tools.ts`    |
| challenge   | `CHALLENGE_SYSTEM` in `src/server/engine/prompts.ts`                                                         | Sonnet 5.5 | `checkChallenges` in `src/server/engine/validate.ts`                                                                     |
| judge       | `JUDGE_SYSTEM` in `src/server/engine/prompts.ts`                                                             | Opus 5.5   | `reconcileVerdict` in `src/server/engine/validate.ts`                                                                    |
| remediation | `src/server/engine/remediation.ts`, `REMEDIATION_SYSTEM` in `src/server/engine/prompts.ts`                   | Opus 5.5   | `checkEdits` (every edit matches the real file), `resolveCwe` and `resolveOwasp` in `src/server/engine/security-refs.ts` |
| work_orders | `WORK_ORDER_SYSTEM` in `src/server/engine/prompts.ts`                                                        | Opus 5.5   | `checkWorkOrders` in `src/server/engine/validate.ts`                                                                     |

The stage list is `STAGES` in `src/server/engine/schema.ts`. Models are set
with `WINDTUNNEL_MODEL_REASONING` and `WINDTUNNEL_MODEL_AGENTS`
(`src/server/engine/config.ts`).

## 4. The agents

Five agents, each with one brief and its own expertise, compete to find
flaws. A judge credits each for the real flaws it found, more when no other
agent found them.

| Agent            | id                 | Looks for                                                    | Expertise                                         |
| ---------------- | ------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| Normal user      | `normal_user`      | Everyday journeys that the design leaves undefined           | `src/server/engine/expertise/normal-user.md`      |
| Adversarial user | `adversarial_user` | Abuse: permissions, tenancy, injection, secrets              | `src/server/engine/expertise/adversarial-user.md` |
| Chaos            | `chaos`            | Failure part-way: retries, timeouts, ordering, lost messages | `src/server/engine/expertise/chaos.md`            |
| Scale            | `scale`            | Growth: unbounded lists, hot paths, limits, cost             | `src/server/engine/expertise/scale.md`            |
| Product critic   | `product_critic`   | What the product must decide but has not                     | `src/server/engine/expertise/product-critic.md`   |

The briefs are `AGENTS` in `src/lib/agents.ts`; the expertise notes are
loaded by `src/server/engine/expertise.ts`.

### How they run

```mermaid
sequenceDiagram
  autonumber
  participant R as run.ts
  participant L as llm.ts
  participant A1 as First agent
  participant A as Other four agents
  participant T as Read tools (repo runs)

  R->>R: build the shared context once<br/>(design model, gaps, outline)
  R->>L: first agent, shared context marked for caching
  L->>A1: stream starts
  A1-->>R: first byte: the cache is written
  par the other four, reading the cache
    R->>L: agent 2..5 with the same shared context
  end
  loop up to 28 turns (repository runs)
    A1->>T: list_files · read_file · search
    T-->>A1: file text, confined to the repository
    A1->>T: report_finding(path, lines, severity…)
    T-->>R: checked against the real lines, announced live
  end
  A1-->>R: summary (repo) or scenarios and findings (requirement)
  A-->>R: same, each on its own
```

Why the first agent starts alone: the five share one long context. Sending
it once and letting it be cached before the others start makes the other
four read it at a fraction of the price (`release` in
`src/server/engine/run.ts`).

### Two kinds of run

|               | Requirement run                                            | Repository or project run                                                                  |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Input         | A written requirement and files                            | One or more repositories (workspaces)                                                      |
| Agent call    | One structured answer: scenarios and findings (`llm.call`) | A tool loop (`llm.agent`): read the code, file findings one by one                         |
| Tools         | none                                                       | `src/server/engine/repo/agent-tools.ts`, reading through `src/server/engine/repo/tools.ts` |
| Finding check | Every reference must exist in the design model             | Every cited file and line must exist in the code                                           |
| Live findings | At the end                                                 | The moment each is filed                                                                   |

### From findings to work orders

```mermaid
flowchart TB
  f1["Findings<br/>5 agents"] --> ch["Challenge round<br/>each agent supports or disputes<br/>the others' findings"]
  ch --> j["Judge<br/>merges duplicates into groups<br/>rejects what the design or code does not show"]
  j --> rec["reconcileVerdict<br/>every finding placed exactly once<br/>unreviewed ones kept, marked"]
  rec --> wo["Work orders<br/>each settles one or more groups<br/>with acceptance criteria"]
  rec --> score["Scoreboard<br/>score.ts: points by severity,<br/>more for a flaw only one agent found,<br/>1 per upheld dispute"]
```

### The stand-in model

`ScriptedLlm` in `src/server/engine/sample.ts` takes the place of `llm.ts`
for tests, sample mode and sample projects. It makes the same tool calls a
model would, so every check still runs. The Storefront script is
`src/server/engine/sample-project.ts`, keyed by repository, against the
files in `samples/storefront/`.

## 5. Security: remediation, personal data and secrets

Three parts work together. None of them runs code from the repository.

```mermaid
flowchart TB
  files["Repository files<br/>after the survey"] --> inv["Data inventory<br/>repo/inventory.ts<br/>no model"]
  inv --> pii["Personal data by name<br/>contact, identity, financial,<br/>location, health, credentials, online"]
  inv --> flows["Where it goes<br/>logs · outside calls ·<br/>storage · responses"]
  inv --> secrets["Secrets<br/>known key formats and<br/>hard-coded literals"]
  pii & flows & secrets --> ctx["Summary in the agents'<br/>shared context"]
  secrets --> sg["One critical finding each<br/>secretGroups, after the judge"]
  judge["Accepted security findings"] --> rem
  sg --> rem["Remediation stage<br/>reads the code again (12 turns)<br/>3 findings at a time"]
  rem --> check["checkEdits: exact match with the file,<br/>at most 5 edits and 80 lines,<br/>no lockfiles, vendored or generated files"]
  rem --> refs["CWE and OWASP Top 10 2021<br/>checked against fixed lists"]
  check & refs --> record["RemediationRecord on the run<br/>steps · patch · CWE · OWASP · notes"]
  record --> ui["Run findings · cockpit Security ·<br/>8090 work orders · exports"]
```

| Part            | Where                                                                                                             | Holds to                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Data inventory  | `src/server/engine/repo/inventory.ts`                                                                             | Found by name, so it may include false positives; says so on screen                                                            |
| Secret findings | `secretGroups` in `src/server/engine/remediation.ts`                                                              | A secret's value is never saved: only its kind, file, line and a masked line. `scrubDeep` masks it in everything the run saves |
| Remediation     | `src/server/engine/remediation.ts`                                                                                | Never fails the run; an edit that does not match the file is dropped with the reason; a patch is never applied                 |
| References      | `src/server/engine/security-refs.ts`                                                                              | An unknown CWE falls back to its OWASP category's CWE, marked as such                                                          |
| Diff            | `src/lib/patch.ts`                                                                                                | Three lines of context; `git apply --check` accepts it                                                                         |
| Screens         | `src/components/run/remediation.tsx`, `src/components/project/security.tsx`, `src/components/project/privacy.tsx` | Colour only in the diff                                                                                                        |

Not covered yet: known-vulnerable dependencies (needs an advisory database).

## 6. Live updates

```mermaid
flowchart LR
  run["run.ts emit()"] --> events[("run_events<br/>Postgres")]
  run --> publish["registry.ts publish"]
  publish --> sse["GET /api/runs/[id]/events<br/>replay, then live"]
  events --> sse
  sse --> feed["src/lib/run-feed.ts<br/>applyEvent"]
  feed --> rail["Stage rail and agent lanes<br/>src/components/run/run-progress.tsx"]
  feed --> live["Live map<br/>src/components/project/live-map.tsx"]
  feed --> found["Live findings<br/>src/components/run/live-findings.tsx"]
```

Every event is saved before it is sent, so a page opened half-way replays
what it missed. The event types are `RunEvent` in
`src/server/engine/schema.ts`; the stream is
`src/app/api/runs/[id]/events/route.ts`.

## 7. Projects and the cockpit

```mermaid
flowchart LR
  p["Project"] --> w1["Workspace web"] & w2["Workspace api"] & w3["Workspace …"]
  w1 & w2 & w3 --> run["One project run<br/>paths as workspace/file"]
  run --> arch["Architecture<br/>components and connections"]
  run --> groups["Accepted findings"]
  arch & groups --> c["buildCockpit<br/>src/server/projects/cockpit.ts"]
  c --> s["Sankey<br/>workspace → kind → severity"]
  c --> d["Architecture diagram"]
  c --> i["Issues list"]
```

Projects and workspaces: `src/server/projects/store.ts`. Older runs with no
project are gathered under "Demo project" by `src/server/projects/adopt.ts`.
Sample data: `src/server/projects/demo.ts`.

## 8. The data

```mermaid
erDiagram
  projects ||--o{ workspaces : has
  projects ||--o{ runs : "owns (kept if deleted)"
  projects ||--o{ project_links : "sends to"
  runs ||--o{ agent_reports : "one per agent"
  runs ||--o{ run_events : "in order"
  runs ||--o{ deliveries : "work orders sent"
  connections ||--o{ project_links : "provider"

  projects { uuid id text name boolean demo }
  workspaces { uuid id uuid project_id text name jsonb origin }
  runs { uuid id uuid project_id text status jsonb workspaces jsonb data }
  agent_reports { uuid run_id text agent_id jsonb data }
  run_events { uuid run_id int seq jsonb event }
  connections { text provider text status jsonb settings jsonb secrets }
  project_links { uuid project_id text provider text external_id }
  deliveries { uuid run_id text work_order_id text status text external_id }
```

Tables: `projects`, `workspaces`, `runs`, `agent_reports`, `run_events`,
`connections`, `project_links`, `deliveries`. The structured results of a
run are JSON in `runs.data`, shaped by `RunRecord` in
`src/server/engine/schema.ts`. Migrations are applied at start by
`src/server/db/ready.ts`.

## 9. Connectors

```mermaid
sequenceDiagram
  autonumber
  participant P as Person
  participant W as Windtunnel
  participant F as 8090 MCP server

  P->>W: Connect (connector URL saved)
  W->>F: register client, start sign-in (PKCE)
  F-->>P: 8090 sign-in page
  P->>F: sign in
  F-->>W: /api/connectors/software-factory/callback?code=…
  W->>F: exchange code for tokens (kept server side)
  Note over W: later, a run of a linked project finishes
  W->>W: claim each work order in deliveries
  W->>F: list_item_labels / create_item_label
  loop each work order
    W->>F: create_item(project_id, title, description, priority, type, labels)
    F-->>W: WO-n
  end
```

| Part                      | Where                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| MCP client                | `src/server/connectors/mcp.ts`                                                                                                       |
| Sign-in and token storage | `src/server/connectors/oauth.ts`, `src/server/connectors/store.ts`                                                                   |
| 8090 mapping              | `src/server/connectors/software-factory.ts`                                                                                          |
| Sending, once each        | `src/server/connectors/deliver.ts`                                                                                                   |
| Screens                   | `src/components/connectors/connectors.tsx`, `src/components/connectors/project-link.tsx`, `src/components/connectors/deliveries.tsx` |
| Catalog                   | `src/lib/connectors.ts`, logos in `src/lib/connector-icons.ts`                                                                       |
