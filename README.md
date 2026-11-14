<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/wordmark-dark.svg">
    <img src="brand/wordmark.svg" alt="Windtunnel" height="44">
  </picture>
</p>

**Break it before you build it.**

Windtunnel simulates an application before it is built. Give it a requirement,
and five agents with competing goals use it, attack it, overload it and question
it. You get the flaws while they are still cheap to fix.

A wind tunnel tests the shape of a thing before anyone builds it at full size.
That is the whole design brief.

---

## Status

**Early build.** The product app and the first engine, Tunnel run, are in this
repo: a requirement goes in, five agents test the design, and a report with
findings and work orders comes out. What comes after is in
[ROADMAP.md](ROADMAP.md).

On the example requirement below, a run takes about three minutes.

## Run it

You need Docker and a Claude API key.

1. Copy `.env.example` to `.env.local` and put your key in it:

   ```
   ANTHROPIC_API_KEY=...
   ```

2. Start the app and its database:

   ```bash
   docker compose up --build
   ```

3. Open <http://localhost:3300>. "Launch app" opens the product at
   <http://localhost:3300/app>.

To stop everything and delete the saved runs:

```bash
docker compose down -v
```

A run sends the requirement and any attached files to the Claude API, takes a
few minutes, and goes on if you close the page.

## How a run works

```
requirement (+ Markdown files)
   │
 1 Model        writes an explicit design model: roles, data, operations,
   │            permission rules, failure behaviour, limits, journeys.
   │            Each item is marked "stated" or "assumed".
 2 Coverage     code finds the gaps that need no judgement: an operation with
   │            no rule for a role, no failure behaviour, no limit.
 3 Agents ×5    in parallel, each walks its own scenarios against the model
   │            and reports findings with the steps as evidence.
 4 Challenge    each agent reviews the others' findings and disputes or
   │            supports them.
 5 Judge        weighs findings and challenges, merges duplicates, rejects
   │            what the requirement does not support, sets severity.
 6 Work orders  one per accepted finding group, with acceptance criteria.
   │
 report: findings by type, work orders, the design model, a scoreboard
```

| Agent            | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| Everyday user    | Walks the normal path, like a real customer          |
| Attacker         | Tries to get in where they should not                |
| Outage tester    | Breaks things: timeouts, retries, half-done steps    |
| Load tester      | Pushes to huge teams, lots of data and heavy traffic |
| Product reviewer | Spots unclear rules and missing steps                |

Three things keep the report honest:

- **The model is visible.** The report shows the design model the engine built,
  with its assumptions, so you can see exactly what was tested.
- **Evidence is checked by code.** A finding must cite scenario steps that
  exist. One that cites nothing real is dropped, and the report says so.
- **The agents compete.** They score for accepted findings, more when nobody
  else found the same thing. The scoreboard is part of the report.

The model, the judge and the work orders use Claude Opus 5.5; the five agents
use Claude Sonnet 5.5. Both are settings (see `.env.example`).

The run page tells the run as it happens: a row of stages fills as each
finishes, with its time, and a card for each stage appears when it starts
and turns into what it found when it ends (the design model, the gaps, each
agent's findings, disputes, the accepted issues by severity, fixes and work
orders). The agents' stage shows them working in parallel: one lane each on
a shared clock, with scenarios and findings landing as they arrive. Focus
opens the run full screen (Esc leaves).

A finished run's Issues tab reads like an insights page: tabs per kind with
counts, sort and search, and one row per issue with its tag, a plain
summary, one action (View fix or Work order), and a small chart of which
agents filed it, how the challenge round went and its patch. Details opens
a wide drawer with every merged finding, the comments, the fix and the work
order. The right column shows how fully the design is specified, what
changed since the project's last run, the agents (select one to filter),
and delivery to 8090.

## Run it against a repository

On the New run page choose "A repository". The same five agents then read
real code, in any language, and file findings that point at the file and lines
that show the flaw. Each finding appears on the run page the moment it is
filed.

- **From GitHub:** paste the repository address and, if you want, a branch.
  Public repositories work straight away. For private ones, add
  `GITHUB_TOKEN` to `.env.local` (read-only access to contents is enough) and
  restart.
- **A local folder:** put or link the repository into `repos/` in this
  project, or set `WINDTUNNEL_REPOS_HOST_DIR` to the folder that holds your
  code. Each subfolder can then be picked on the form.

The engine never parses or runs the code. A model reads it through three
read-only tools (list files, read a file, search), confined to the repository.
Each agent carries notes that make it a specialist in its area; they are plain
Markdown in `src/server/engine/expertise/`, so you can sharpen them with your
own standards.

Limits: about 6,000 text files or 40 MB per repository, and a reading budget
per agent. A repository run costs more than a requirement run, because the
agents take many turns to read code. On a 63-file example app, one run took
about three and a half minutes.

## Projects and the cockpit

A real application is often several repositories. A **project** is one
application, and each **workspace** in it is one repository: the frontend, a
backend service, a shared library. Workspaces take the same two sources as a
repository run.

"Run project" reads every workspace together, so an agent can follow a journey
from the frontend into a service and find the flaws between them. Files are
addressed as `workspace/path`. It always asks you to confirm first, because a
run uses your API key, and a project run costs more than a run of one
repository.

The project page is its cockpit, a command center built from the latest
finished run:

- one stage of fixed height, so switching views never moves the page, with
  a switcher for four views: **Issue flow** (workspace →
  kind → severity, as bundles of coloured strands, with the top issues of
  each severity listed), **Architecture** (frontends, services, data and
  outside systems, and what calls what), **Security** (OWASP category → patch ready or not → severity). The view is
  kept in the address (`?view=`);
- four cards docked over the bottom of the stage (they fold away): issues by
  severity with the change against the last run, the issues to fix first,
  issues over the project's runs, and readiness (patches, work orders in
  8090, personal data reaching logs);
- the workspaces, the description and the 8090 link under "Setup" at the
  end of the page, so the diagrams come first;
- every accepted issue. Anything picked on the canvas or a card filters the
  list;
- **Focus**: the stage over the whole screen, with the cards and a column of
  widgets (issues, security, data and privacy) on top. Selecting a widget,
  an issue or a name opens the full detail in a wide drawer. Esc leaves.

Every card and widget has an "i": hover it to read what it shows and how
its numbers are worked out.

With one workspace the cockpit adapts: the chart starts from the components
inside it. Nothing is shown that a run did not produce. There is no sign-in
yet, so everyone who can reach the server sees every project.

## From issue to fix to gone

Every project issue is tracked across runs. From an issue's drawer, **Open
a pull request** turns its checked fix into a branch and a pull request on
GitHub: each edit is checked again against the default branch first, and
nothing is sent until you confirm. When there is no patch, or the code has
moved on, the fix agent writes a fresh one against the code as it is now
(on a demo project for free; otherwise on your API key, which the dialog
says first). Windtunnel never merges.

The app checks open pull requests while it runs. A merged one waits for a
rescan ("2 fixes merged · Rescan"); when the next run no longer finds the
issue it is marked **fixed** and leaves the findings, and if it comes back
it is **reopened**. The home page is a board of projects: one card per
project (share fixed, open issues by severity, pull requests, last run and
the next thing to do), then recent runs and pull requests. Pull requests need `GITHUB_TOKEN` with Contents and Pull requests
write access.

## Refining a requirement

A requirement run is the start of a loop. When it ends, **Refine
requirement** lists what it found unsaid: the gaps in the design ("the
design does not say whether Member may invite a user"), what the model had
to assume, and the requirement issues the agents found. Answer what you can
(or keep an assumption as it is); your answers are added to the text under
`## Decisions`, in your words. Edit anything else, check the diff, and run
the next version. Each version links to the one it refines: the run page
shows `v1 · v2 · v3`, what changed in the text, and what got better (gaps
closed, assumptions now stated, issues gone). Nothing is sent to the model
until you start the run, and every run asks first.

## Every run belongs to a project

A run is started in a project: on a written requirement, or on the code of
the workspaces you choose. Runs made before this rule are gathered, at start,
under a project called "Demo project" in a workspace called "demo".

The Runs page and each project's Runs table can be narrowed by workspace (and
the Runs page by project). The filter is in the address, so it can be linked.

## The live map

While a project's code is being read, the run page and the project page show
the application itself: the workspaces arrive, settle into the architecture,
and the five agents move over it. Each sits on the part it is reading, and a
finding lands on its part. When the run ends the map gives way to the cockpit.

## Sample data

Settings has a "Sample data" panel. It adds Storefront, a shop of seven small
services, each a private repository (`rvren/storefront-<service>`; the source
is in `samples/storefront`, published by `scripts/publish-samples.sh`).

- A sample project's runs replay a script and never call the model. Everything
  else is real: the repositories are fetched from GitHub, read through the
  tools, and each scripted finding is checked against the real file and lines.
- "Add sample project" makes it empty, so you can add its repositories one by
  one and run after each. "Add complete sample and run it" does it in one step.
- "Remove sample data" deletes every sample project with its runs, and nothing
  else.
- The repositories are private: set `GITHUB_TOKEN` in `.env.local` first.

## Connectors: work orders into 8090 Software Factory

Settings → Connectors lists the outside systems Windtunnel can send to. One
works today, 8090 Software Factory; the rest of the catalog is marked
"Coming soon".

1. In 8090, copy the connector URL from Settings → MCP Server (one URL per
   organization). Paste it on the 8090 card and save.
2. Click **Connect** and sign in to 8090 in the browser.
3. On a project's page, choose its 8090 project from the list.

From then on, when a run of that project finishes, each of its work orders
is created in the 8090 project through its MCP server: priority P0–P3 as
Urgent to Low, type Fix or Requirements, status Backlog, and labels for
`windtunnel` and each workspace its findings are in. A work order is never
sent twice, and a failed send can be tried again from the run's Work orders
tab. Sample runs are sent only when you ask, or when "Also send sample runs"
is on. The sign-in's tokens stay in the database on the server.

## Security: remediation, personal data and secrets

Repository and project runs look at the code from a security angle:

- **Remediation.** Every accepted security finding gets a remediation: what
  is wrong, the steps to fix it, a suggested patch, and its CWE and OWASP
  Top 10 (2021) category. A stage on the reasoning model reads the code again
  to write it; every edit in the patch is checked against the real file and
  dropped if it does not match. Patches are never applied. Shown under the
  finding, in the cockpit's Security section, in the work orders sent to
  8090 and in the exports.
- **Personal data.** A scan in code (no model) finds names that hold
  personal data (contact, identity, financial, location, health,
  credentials, online ids) and where they reach logs, outside calls, storage
  and responses. The agents get a summary; the cockpit shows a Data and
  privacy section. It works by name, so it can include false positives.
- **Secrets.** Known key formats and hard-coded secrets in the code become
  critical findings with a remediation (move it out, rotate it). A secret's
  value is never saved or shown.

Not covered yet: known-vulnerable dependencies.

## Works on its own

Windtunnel is a standalone product. This is a rule, not a preference:

- **Input is plain.** A requirement typed in, or Markdown files such as a PRD or
  a design doc. No account with any other tool is needed.
- **Output is plain.** A report on screen, as Markdown and as JSON.
- **Connectors are optional.** A connector reads requirements and designs from
  another tool and writes work orders back. The core never depends on one.

The first connector planned is
[8090 Software Factory](https://www.8090.ai/): requirements and blueprints in,
work orders out.

## Develop

Needs Node 24, pnpm 10 and Docker.

```bash
pnpm install
```

Run only the database in Docker and the app on your machine, for fast reloads:

```bash
pnpm db:up
```

```bash
pnpm dev
```

The app is on <http://localhost:3300> and Postgres on port 5433.

| Command            | Does                                                        |
| ------------------ | ----------------------------------------------------------- |
| `pnpm lint`        | ESLint                                                      |
| `pnpm typecheck`   | TypeScript                                                  |
| `pnpm test`        | Unit tests. No network, no database                         |
| `pnpm test:db`     | Postgres store tests, against a separate `windtunnel_test`  |
| `pnpm build`       | Production build                                            |
| `pnpm db:generate` | Turn a change in `src/server/db/schema.ts` into a migration |

Migrations in `drizzle/` are applied by the app when it starts.

To work on the screens without spending on the model, add the sample data
(above), or start the app with `pnpm dev:sample`. Runs then replay a small hand-written sample and are marked
"Sample run" everywhere. It also points the local folders at
`samples/storefront`: make a project with the workspaces `web`, `api` and
`billing` from the folders of the same names, run it, and the cockpit fills
with a scripted run against those files.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, Turbopack)
- [Tailwind CSS](https://tailwindcss.com) v4 and
  [shadcn/ui](https://ui.shadcn.com) on Base UI, with lucide icons
- A few widgets from [tuffui](https://tuffui.com) (MIT), copied into
  `src/components/tuff/` and adapted: the cockpit numbers, time by stage,
  time and tokens, the patch view
- Postgres 17 with [Drizzle](https://orm.drizzle.team)
- The Claude API through `@anthropic-ai/sdk`
- Barlow for text and headings, Geist Mono for labels

## Layout

```
brand/                 logo files, colours, usage notes, preview sheet
drizzle/               SQL migrations
src/app/(site)/        the home page
src/app/app/           the product: Runs, New run, Run, Settings
src/app/api/           runs, their event stream and exports, health
src/components/        brand/, app/ (shell), run/ (screens), ui/ (shadcn),
                       tuff/ (tuffui widgets)
src/lib/               the agents, labels, limits, the live-feed reducer,
  viz/                 pure adapters from runs to the widgets' inputs
src/server/engine/     the engine: stages, prompts, checks, scoring, export
  expertise/           the notes that make each agent a specialist
  repo/                fetch, survey and read-only tools for repository runs
src/server/db/         tables, connection, migrations
```

## Brand

The mark is called Parting. The app under test is not built yet, so it is not
drawn; you see it only in how two lines of air part around it. The brand colour
is violet `#7C5CFF` and the typeface is Barlow. Files and rules are in
[brand/](brand/README.md).
