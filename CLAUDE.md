# Windtunnel

Simulate an application before it is built. Five competing agents test a
requirement and its design and report the flaws. Product pitch:
[README.md](README.md). What is built and what is next: [ROADMAP.md](ROADMAP.md).

**Status: foundation only.** The app is a shell with a home page. There is no
simulation engine yet.

@AGENTS.md

## Commands

```bash
pnpm dev      # http://localhost:3300
pnpm lint
pnpm build
```

A change is done when `pnpm lint` and `pnpm build` pass and you have looked at
the page in a browser, in dark and light theme, at desktop and phone width.

## Stack

- Next.js 16 (App Router, TypeScript, Turbopack, Cache Components on). This
  version differs from older ones; read the note in `AGENTS.md` first.
- Tailwind CSS v4. Theme tokens live in `src/app/globals.css`, not in a config
  file.
- shadcn/ui, `base-nova` style, on Base UI (not Radix). Icons: lucide-react.
- Fonts: Sora for text and headings, Geist Mono for labels and code.
- pnpm 10. Node 20 or later.

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
   `border`, `bg-card`, `text-brand` and so on. No hex values in components.
   The two exceptions are the image routes (`opengraph-image.tsx`,
   `apple-icon.tsx`) and the SVG files, which cannot read CSS variables.
4. **Violet is the brand colour** (`--brand`, `#7C5CFF`). `--primary` is the
   same violet tuned per theme so text on it passes WCAG AA. Details:
   [brand/README.md](brand/README.md).
5. **Nothing fake.** Show only what exists. No sample results dressed up as
   real ones, and no button that does nothing. Label an example as an example.
6. **Every interactive element gets a `data-testid`**
   (`<area>-<element>[-<action>]`, kebab-case).
7. **Dark is the default theme**; light must still look right.
8. **The logo has one source.** `brand/mark.svg`, `brand/icon.svg`,
   `src/app/icon.svg` and the `Mark` component in
   `src/components/brand/logo.tsx` all carry the same two paths. Change them
   together.

## Git

Commits are authored as `rvren`. The repo is private at `rvren/windtunnel`.
Commit and push only when asked.
