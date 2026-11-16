# Windtunnel

Simulate an application before it is built. Five competing agents test a
requirement and its design and report the flaws. Product pitch and how to run
it: [README.md](README.md). What is built and what is next:
[ROADMAP.md](ROADMAP.md).

@AGENTS.md

## Commands

```bash
pnpm db:up        # Postgres in Docker, port 5433
pnpm dev          # the app on http://localhost:3300
pnpm dev:sample   # the same, replaying sample runs: spends nothing
pnpm lint
pnpm typecheck
pnpm test         # unit tests: no network, no database
pnpm test:db      # Postgres store tests (needs pnpm db:up)
pnpm build
pnpm db:generate  # after changing src/server/db/schema.ts
docker compose up --build   # the whole application, as it ships
```

A change is done when `pnpm lint`, `pnpm typecheck`, `pnpm test` and
`pnpm build` pass and you have looked at the page in a browser, in dark and
light theme, at desktop and phone width. A change to the store also needs
`pnpm test:db`; a change to the Dockerfile, the config or the startup path
needs a `docker compose up --build` from `docker compose down -v`.

## Where things are

| Area     | Path                         | What it is                                                                   |
| -------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Site     | `src/app/(site)/`            | The home page: the pitch as a click-through slide deck                       |
| App      | `src/app/app/`               | The product: Projects, the project cockpit, Runs, New run, Run, Settings     |
| API      | `src/app/api/`               | `projects` (and their workspaces and runs), `runs`, `health`                 |
| Projects | `src/server/projects/`       | The project store, and `cockpit.ts`: a run turned into the cockpit's numbers |
| Samples  | `samples/storefront/`        | Seven small services for the scripted project run. Read, never run           |
| Engine   | `src/server/engine/`         | The five stages and everything they need                                     |
| Database | `src/server/db/`, `drizzle/` | Five tables, the pool, the migrations                                        |
| Shared   | `src/lib/`                   | The agents, labels, limits, the live-feed reducer                            |

The root layout holds only fonts, theme and styles. Each area adds its own
chrome in a nested layout.

## Stack

- Next.js 16 (App Router, TypeScript, Turbopack, Cache Components on). This
  version differs from older ones; read the note in `AGENTS.md` first. Two
  things it enforces here: data read at request time sits inside `<Suspense>`,
  and so does any client component that reads the path on a page with an id in
  its address.
- Tailwind CSS v4. Theme tokens live in `src/app/globals.css`, not in a config
  file.
- shadcn/ui, `base-nova` style, on Base UI (not Radix): compose with the
  `render` prop, not `asChild`. Icons: lucide-react.
- Postgres 17, `pg` and Drizzle. Migrations are SQL files in `drizzle/`, applied
  by the app when it starts (`src/instrumentation.ts`).
- The Claude API through `@anthropic-ai/sdk`.
- Fonts: Barlow for text and headings, Geist Mono for labels and code.
- pnpm 10. Node 24.

## Design

The owner's brief: **clean, minimal, calm and professional**, in the manner
of Linear (the reference video: near-black, nearly monochrome, hairline
borders, small type, a breadcrumb, a title, a row of metadata chips and
tabs, quiet cards, an activity rail on detail pages). When in doubt, take
something away.

- **Nearly monochrome, nothing glows.** Ground, panels, borders and text are
  neutral greys from the tokens in `src/app/globals.css`; panels sit one
  quiet step above the ground with a hairline border. `--glow` is
  transparent in both themes: no glow, no glass (`backdrop-blur`), no
  gradients on panels, no big shadows.
- **Widgets earn their place.** Before adding a chart or widget, name the one
  question it answers that the page does not already answer. A big visual
  that repeats a table, needs hovering to read, or shows one number is cut
  (the owner rejected a Lap Timer, Tool Call Graph, Radar, Blast Radius and
  Tick Gauge for this reason). Prefer one line (a bar, a count with a
  change) over a chart.
- **The fix loop.** A project's issues are tracked across runs (table
  `issues`, `src/server/issues/`): matched by kind and cited file (then CWE,
  then title words), states open → PR open → merged → fixed, or reopened /
  not found again, reconciled after every finished run. Each issue has an
  `origin` (`code` or `requirement`, the kind of run that found it); a run
  only settles issues of its own origin, so a requirement run never closes
  code issues, nor the reverse. A fix leaves
  Windtunnel only as a new branch and pull request on GitHub
  (`src/server/connectors/github.ts`, `src/server/issues/pull-request.ts`),
  after a person confirms it in the PR dialog; every edit is checked again
  against the base branch first, and Windtunnel never merges. The fix agent
  (`src/server/issues/fix.ts`) is the remediation stage for one issue on
  fresh code; outside demo projects it spends the owner's key, so the
  dialog says so before it runs. A merged fix waits for a rescan, which the
  owner starts (it asks first). The home page (`/app`) is a projects board: one card per project with its next action;
  runs are at `/app/runs`.
- **Requirement runs are probable.** A requirement run tests an idea, so
  its results are probable risks: the UI says "Risks" with a **Probable**
  tag, "High risk", "Suggested change" and "Proposed work orders", from one
  switch (`termsFor(probable)` in `src/lib/labels.ts`; `probable` is
  `!run.source`, `Cockpit.fromRequirement` or `Issue.origin ===
"requirement"`). Never word them as defects, fixes or "accepted". Home
  health (% fixed, open issues, "Fix N…") counts code issues only;
  requirement risks get their own line. They settle only within their own
  requirement's versions. Exports say so, and 8090 gets them as
  `requirements` work with the `proposal` label.
- **Calls to action** are in title case, every word ("Open The Cockpit");
  `src/lib/cta-case.test.ts` checks plain-text button labels.
- **Deleting.** One run (run page), several (checkboxes in run tables), or
  a project with or without its runs (`DELETE /api/projects/[id]?runs=1`,
  `src/server/runs/delete.ts`). A run in progress is never deleted.
- **Refining a requirement.** A finished requirement run's "Refine
  requirement" opens a sheet (`src/components/run/refine/`): questions built
  from the run (coverage gaps, items the model assumed, requirement issues;
  `src/lib/viz/refine.ts`, no model call), the owner's answers added to the
  text as a plain `## Decisions` section in their own words (never rewritten
  by a model), a diff, and "Run version N". The new run's `parent_run_id`
  links the versions; the run page shows a `v1 · v2` switcher, the text diff
  and a "Since version N" widget (gaps closed and new, assumptions now
  stated, issues gone and new). Answers are a draft in the browser until the
  run starts.
- **The run page** tells a live run as a story (`components/run/story/`:
  stepper, a card per stage that turns into its result, agents as parallel
  lanes on one clock from the events' times, focus mode `?focus=1`). A
  finished run's Issues tab is an insights page (`components/run/insights/`:
  rows with a tag, one action and a chart of their own, a drawer for the
  detail, and a right column of widgets); its data comes from the pure
  adapters `src/lib/viz/story.ts`, `insights.ts` and `run-widgets.ts`.
- **Tuffui widgets** live in `src/components/tuff/` (copied from
  tuffui.com, MIT, adapted: our tokens, read-only where Windtunnel never
  acts). In use: `SegmentedBar` (time by stage), `RunTrace` (time and
  tokens), `FileChanges` (a patch, read-only), `ProgressBar`, `Segmented`
  (the cockpit's view switcher).
- **The cockpit is the one console-style screen** (after Palo Alto
  Networks' Command Center, at the owner's request). The diagrams come
  first: the project header is one line (last run · workspaces · 8090), and
  the workspaces, the description and the 8090 link live in "Setup" at the
  end of the page. The stage (`components/project/command/stage.tsx`) has a
  fixed height (640px, 700px from `xl`) for every view, so switching never
  moves the page; everything else floats on it: the top bar (view name,
  switcher, way to the run), the filters and legend, and a glass card dock
  that folds away (flat panels, no glass). The sidebar folds on a cockpit
  only when the project has a workspace. Flow views are laid out to fit the box exactly by
  `src/lib/viz/stage-layout.ts` (even slots, rings sized to the room).
  Every workspace and node is always shown; never fold them into "+N more"
  (the owner asked): a crowded column puts names beside smaller rings.
  Architecture fits by `FitBox`. **Focus mode** (`?focus=1`, the Focus
  button, Esc to leave) draws the same stage over the whole screen, in a
  portal, with a widget column on the right (`command/rail.tsx`: issues,
  security, data and privacy); a widget, an issue or a node opens the full
  detail in a wide drawer (`command/drawer.tsx`). Every card and widget has
  an "i" tooltip (`components/info-tip.tsx`); its words live in
  `src/lib/explain.ts`, and a test checks each is used. Never prefix a
  custom background-image utility with `bg-` (tailwind-merge drops the
  colour beside it: the dot grid is `dot-grid`). There is no Data flow view (removed at the
  owner's request); personal data stays in the table below.
  Coloured strands are allowed there, without glow. A new view is one adapter in `src/lib/viz/cockpit-views.ts` (with its note
  and legend) plus one switcher entry.
- **One white block per view.** The main action (`Button` default) is solid
  white on dark, ink on light. Every other button is `outline` or `ghost`.
  The current sidebar item is a soft grey chip in the text colour, never a
  solid block.
- **Tabs are underline tabs** (`ui/tabs.tsx`): plain labels on a hairline,
  the current one in the text colour with a 2px line that slides. No box, no
  fill, and on keyboard focus a thin outline only.
- **The shell.** Sidebar: a plain column on the ground with a hairline edge;
  the mark and the collapse control in one row, quiet 32px rows (the current
  one a faint grey fill), "New Run" as the one solid button at the bottom.
  No horizontal lines inside the sidebar: space separates its parts (the
  owner asked). Top bar: solid, 44px, a hairline below; scope, then the trail
  parted by slashes, the last step in medium weight. Content: the full width
  of the page with 24px side padding; a form keeps its own reading measure.
- **Every page opens with `PageHeader`** (`components/app/page-header.tsx`):
  a small title with the actions on the right, an optional line of text,
  then a row of `MetaChip`s (status, time, counts, what was read) and, where
  a page has sections, tabs. Detail pages (a run) put an activity rail on the
  right (`components/run/activity-rail.tsx`).
- **Settings is a section, not tabs.** A section with several pages
  (Settings) gets its own sidebar, as in the Claude Console: its row in the main menu has a
  "›", and opening any of its pages swaps the sidebar to "← Settings" (an
  arrow and the section's name in the main menu) above its pages as one
  flat list, with no group labels. "← Settings" shows the main menu again
  without leaving the page. There, the section's row shows which of its pages
  is open ("Settings Connectors ›"), as in the frontend Test Console. Each
  page has its own address. Add a section's pages in `SETTINGS` (or a new
  list like it) in `components/app/app-sidebar.tsx`.
- **Connector logos are the one exception to "no colour"**: on Settings →
  Connectors each provider's logo is in its brand colour, at the owner's
  request. They come from `lib/connector-icons.ts`, generated by
  `scripts/build-connector-icons.mjs`; do not hand-edit it.
- **Colour is for meaning only.** Violet (`text-link`, `bg-brand`) marks
  progress, "now" and links. Green, orange, red and grey (`bg-ok`, `bg-sev-*`)
  mark state and severity, as a small dot in a neutral badge or a thin mark.
  Never fill a large area with a status colour.
- **Shapes.** Small corners: `rounded-card` (10px) for panels, dialogs and
  tables (use `Panel`); `rounded-tile` (8px) for tiles; `rounded-md` (6px)
  for controls, rows and chips; `rounded-sm` (4px) for badges.
  The scale is in `src/app/globals.css`. Only status dots are round. No box
  inside a box: separate rows in a panel with hairlines.
- **Type.** Geist Sans on a 15px root (everything in rem is a step
  smaller). A page title is `text-xl font-semibold`; section headings are
  13px medium; body is 13px; secondary text is `text-muted-foreground`.
  Numbers stay modest (`text-2xl` at most). Geist Mono only for ids, numbers
  in sequence and times. Barlow stays in the wordmark only.
- **Density.** Compact: panels `p-4`, list rows about 36-44px, buttons 28-32px
  high, one idea per panel. A page is a header (title, chips, tabs), then
  panels.
- **Loading and empty.** One quiet line of text or a spinner icon; never
  shimmer. An empty state is a dashed panel with one sentence and one action.
- **Motion.** Every animation uses Motion (`motion/react`) through the
  helpers in `src/components/motion.tsx`: `FadeIn` for content that mounts,
  `Reveal` for sections that scroll into view, `FadeInItem` for rows that are
  added, `Smooth` for size changes. One soft ease-out, about half a second,
  a rise of 10px at most. The tuffui widgets keep their own motion
  (`tuff/motion-tokens.ts`) and honour reduced motion. Nothing bounces, spins for show or loops, except
  the hero art and a spinner while work is going on. Do not add CSS
  keyframes or new `transition-*` classes; add a helper instead. Reduced
  motion is honoured in `MotionRoot`.
- **Words.** Sentence case, short, no exclamation marks.

Change a token before you restyle a component, and restyle the shared
component before you add classes at a call site.

## The engine

`model → coverage → agents (five, in parallel) → challenge → judge → work
orders`, run by
`executeRun` in `src/server/engine/run.ts`. Read that file first.

- **One door to the model.** Only `llm.ts` calls the Claude API. Everything
  else uses the `LlmClient` interface, so tests use `ScriptedLlm` and never
  touch the network. Use the `claude-api` skill before changing `llm.ts`.
- **The model's claims are checked by code.** `coverage.ts` tidies the design
  model, `validate.ts` drops findings that cite steps that do not exist and
  reconciles the judge's verdict with what it was given. Keep it that way: a
  new stage gets a schema in `schema.ts` and a check in `validate.ts`.
- **Schemas sent to the API** (the first half of `schema.ts`) allow no optional
  fields and no recursion. Use `.nullable()`.
- **Prompts** are in `prompts.ts`. The requirement is data inside tags; no
  stage may fill a hole in the design, because the holes are what a run looks
  for. The five agents share one byte-identical context so it is cached: put
  anything agent-specific in `agentPrompt`, never in `agentSharedContext`.
- **A run lives in the server process.** `registry.ts` starts it and it goes on
  after the request ends. Every step is an event, saved to `run_events` and
  published; the page replays them and then follows live. One server process
  only.
- **Models:** Claude Opus 5.5 for the model, judge and work orders; Claude
  Sonnet 5.5 for the agents. Changed by the person who pays, through
  `WINDTUNNEL_MODEL_REASONING` and `WINDTUNNEL_MODEL_AGENTS`, not in code.
- **Repository runs** (`repo/`) add a survey stage and give the model and the
  agents three read-only tools. The engine never parses code, so it stays
  language-agnostic: do not add a parser or a per-language rule. Nothing from
  a repository is ever installed, built or run. Every path an agent gives is
  untrusted and is confined in `repo/tools.ts`. Agents file findings one by
  one through `report_finding`, which checks the cited file and lines and
  announces the finding at once.
- **Project runs** read every workspace of a project as one. Paths are
  `workspace/path` (no workspace name when the project has one workspace), and
  each workspace is confined to its own folder. The model stage of any
  repository run also returns the architecture; `architecture.ts` checks it
  and maps a finding to its workspace and component by the file it cites.
  `projects/cockpit.ts` is pure and only counts what a run holds.
- **Every run belongs to a project.** `POST /api/runs` needs a `projectId`;
  with `workspaces` (names) it reads their code, without it tests the
  requirement. `projects/adopt.ts` gathers older runs under "Demo project" /
  "demo" at start. `runs.workspaces` holds what a run read, for the filters.
- **Sample data** (`projects/demo.ts`, the `projects.demo` flag, called
  "Sample" on screen): a sample project's runs use `ScriptedLlm` with
  `sample-project.ts` and never reach the API, but fetch and read the real
  repositories. The script is keyed by repository (`storefront-<service>`),
  and its line numbers must match `samples/storefront`; after changing a
  sample file, fix the script, run `pnpm test`, then
  `scripts/publish-samples.sh`. Do not confuse it with "Demo project", which
  holds the owner's real older runs and is never removed with sample data.
- **The live map** (`components/project/live-map.tsx`) is driven only by the
  run's events (`workspace.ready`, `architecture.ready`, `agent.reading`,
  `agent.finding`) through `lib/run-feed.ts` and `lib/live-map.ts`.
- **Looking at animations:** headless Chrome cannot capture a page with an
  open event stream, and the Browser pane pauses animation while hidden.
  Show the pane first, then take screenshots there.
- **Connectors** (`server/connectors/`): `mcp.ts` is the only MCP client;
  `oauth.ts` keeps the sign-in in `connections.secrets`, which no API answer
  ever includes. 8090's server is the one per organization at
  `https://api.factory.8090.dev/v3/mcp/org/<org id>` (newer than its public
  docs); a call names the project with `project_id`, and `list_projects`
  answers in plain text. `parseConnectorUrl` accepts only 8090's own host, so
  tokens cannot be sent elsewhere. `deliver.ts` claims each send in
  `deliveries` before making it: never create a work order without a claim.
  A real send writes into the owner's 8090 project: ask before each one.
  The catalog is `lib/connectors.ts`; logos are generated
  (`scripts/build-connector-icons.mjs`).
- **Security** (`remediation.ts`, `repo/inventory.ts`, `security-refs.ts`):
  a remediation's edits are kept only if they match the file exactly
  (`checkEdits`); never apply a patch to a repository. A secret's value is
  never saved, shown, logged or sent: the inventory keeps kind, place and a
  masked line, and `scrubDeep` masks values in everything `executeRun`
  saves and returns. Keep it that way when adding any field that can hold
  code. CWE and OWASP ids must come from `security-refs.ts`.
- **Never run `next typegen` while `pnpm dev` is running.** It sends the dev
  server into a rebuild loop that reloads every page. Stop the server first.
- **Expertise** for each agent is Markdown in `expertise/`. Improve an
  agent by editing its notes before you touch its prompt.
- **Evals.** `pnpm eval:agents` scores the agents on code against reviewed
  answer keys (`evals/agents-on-code/`, plan and status in its `PLAN.md`).
  `--check` and `--sample` are free; anything else bills the key, so ask
  first, as for any run. Change an agent's prompt or notes, then run a new
  `--variant` and compare; never edit a key to make a score go up.
- **Never start a live run without the owner's permission for that run.**
  Every run bills their Claude API key. Ask each time and say roughly what it
  will cost. In the app, every way to start a run asks first
  (`src/components/run/confirm-run.tsx`, the project run dialog, and the
  refine sheet's review step), and says when a run costs nothing. Tests and screen work use `ScriptedLlm` or
  `WINDTUNNEL_SAMPLE_RUN=1`, which spend nothing.
- **Run kinds** (audit, crosswind, flyoff, blackbox): stages per kind in
  `STAGES_OF`; read a run's stages with `stagesOf(run)`, never the global
  `STAGES`. A new kind gets its executor in `engine/kinds/`, a check in code
  for every model answer, a scripted path in `sample-kinds.ts`, and a report
  in `components/run/kinds/`. Only audits update tracked issues or send work
  orders (Black box tracks its one defect through `trackIncident`). A
  change's diff and incident text are data, never instructions, and never
  run.
- **Schedules** (`server/schedule/`) are the owner's standing permission
  for audits of that one project, inside its monthly cap. Never start a
  scheduled run another way, never raise or clear a cap in code, and keep
  the claim on `next_run_at` atomic.
- **Cost** is worked out in `lib/cost.ts`; update `PRICES` there when a
  model's price changes, nowhere else.

## Architecture document

`docs/architecture.md` explains the whole app and the agents, with Mermaid
diagrams, and is shown in the app at `/app/docs` (the book icon in the top
bar). **Update it in the same change** whenever you add, remove or rename a
stage, an agent, a table, an API route group, a connector, a top-level
module or a file it names. `docs/architecture.test.ts` (part of `pnpm test`)
fails when a file it names no longer exists, or a stage, agent or table is
missing from it; it cannot see a changed flow, so read the diagrams against
your change too.

## Rules

1. **Standalone first.** Windtunnel must work with no other product. Input is a
   typed requirement or Markdown files; output is a report on screen, as
   Markdown and as JSON. Other tools (8090 Software Factory first) plug in as
   optional connectors behind one interface. Core code never imports a
   connector, and product copy never assumes one.
2. **shadcn components for UI.** Add one with
   `pnpm dlx shadcn@latest add <name>`; it lands in `src/components/ui/`. Do
   not hand-roll a button, input, dialog or menu, and do not add another
   component library. Plain elements are fine for layout and text.
3. **Colour comes from tokens.** Use `bg-primary`, `text-muted-foreground`,
   `border`, `bg-card`, `text-link`, `bg-sev-critical` and so on. No hex
   values in components. The two exceptions are the image routes
   (`opengraph-image.tsx`, `apple-icon.tsx`) and the SVG files, which cannot
   read CSS variables.
4. **Violet is the brand colour** (`--brand`, `#7C5CFF`): the logo and small
   accents. `--primary` is neutral (white on dark, ink on light), and
   `--link` is the violet tuned per theme for small text. Details: "Design"
   above and [brand/README.md](brand/README.md).
5. **Nothing fake.** Show only what exists. No sample results dressed up as
   real ones, and no button that does nothing. The sample mode
   (`WINDTUNNEL_SAMPLE_RUN=1`) is for development only, and its runs carry a
   "Sample run" mark everywhere they appear.
6. **Never cut input short.** Input over a limit is refused with the reason
   (`src/lib/limits.ts`, `input.ts`).
7. **Secrets stay on the server.** The API key is read from the environment,
   never shown, never sent to the browser, never written to a file by an
   agent. Database addresses are shown without their password.
8. **Every interactive element gets a `data-testid`**
   (`<area>-<element>[-<action>]`, kebab-case).
9. **Dark is the default theme**; light must still look right. Format times in
   the browser (`LocalTime`), not on the server.
10. **The logo has one source.** `brand/mark.svg`, `brand/icon.svg`,
    `src/app/icon.svg` and the `Mark` component in
    `src/components/brand/logo.tsx` all carry the same two paths. Change them
    together.

## Git

Commits are authored as `rvren`. The repo is private at `rvren/windtunnel`.
Commit and push only when asked.
