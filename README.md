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

| Agent            | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| Normal user      | Walks the expected path, the way a real user would                       |
| Adversarial user | Tries privilege escalation and unauthorized access                       |
| Chaos            | Brings API failures, network timeouts and partial failures               |
| Scale            | Pushes to large organizations, thousands of users and performance limits |
| Product critic   | Finds ambiguous requirements and missing workflows                       |

Three things keep the report honest:

- **The model is visible.** The report shows the design model the engine built,
  with its assumptions, so you can see exactly what was tested.
- **Evidence is checked by code.** A finding must cite scenario steps that
  exist. One that cites nothing real is dropped, and the report says so.
- **The agents compete.** They score for accepted findings, more when nobody
  else found the same thing. The scoreboard is part of the report.

The model, the judge and the work orders use Claude Opus 5.5; the five agents
use Claude Sonnet 5.5. Both are settings (see `.env.example`).

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

To work on the screens without spending on the model, start the app with
`WINDTUNNEL_SAMPLE_RUN=1`. Runs then replay a small hand-written sample and are
marked "Sample run" everywhere.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, Turbopack)
- [Tailwind CSS](https://tailwindcss.com) v4 and
  [shadcn/ui](https://ui.shadcn.com) on Base UI, with lucide icons
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
src/components/        brand/, app/ (shell), run/ (screens), ui/ (shadcn)
src/lib/               the agents, labels, limits, the live-feed reducer
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
