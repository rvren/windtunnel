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

| Area     | Path                         | What it is                                                    |
| -------- | ---------------------------- | ------------------------------------------------------------- |
| Site     | `src/app/(site)/`            | The home page, with the marketing header                      |
| App      | `src/app/app/`               | The product: Runs, New run, Run, Settings, in the app shell   |
| API      | `src/app/api/`               | `runs` (start, list, read, event stream, export) and `health` |
| Engine   | `src/server/engine/`         | The five stages and everything they need                      |
| Database | `src/server/db/`, `drizzle/` | Three tables, the pool, the migrations                        |
| Shared   | `src/lib/`                   | The agents, labels, limits, the live-feed reducer             |

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
- Fonts: Sora for text and headings, Geist Mono for labels and code.
- pnpm 10. Node 24.

## The engine

`model → coverage → agents (five, in parallel) → judge → work orders`, run by
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
- **A live run spends money on the user's key.** Ask before starting one.

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
   `border`, `bg-card`, `text-brand`, `bg-sev-critical` and so on. No hex
   values in components. The two exceptions are the image routes
   (`opengraph-image.tsx`, `apple-icon.tsx`) and the SVG files, which cannot
   read CSS variables.
4. **Violet is the brand colour** (`--brand`, `#7C5CFF`). `--primary` is the
   same violet tuned per theme so text on it passes WCAG AA. Details:
   [brand/README.md](brand/README.md).
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
