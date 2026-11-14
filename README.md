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

**Foundation only.** This repo holds the name, the brand and the app shell with
its home page. The simulation engine is not built yet. See
[ROADMAP.md](ROADMAP.md).

## The idea

A product requirement is not just a document. It is a world of possible user
behaviour, edge cases, failures and security holes. Windtunnel turns the
requirement into a simulation and lets agents loose in it.

You give it a requirement:

> Build a multi-tenant dashboard where organization admins can invite users and
> manage permissions.

Five agents then compete to find flaws in the proposed design:

| Agent            | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| Normal user      | Walks the expected path, the way a real user would                       |
| Adversarial user | Tries privilege escalation and unauthorized access                       |
| Chaos            | Brings API failures, network timeouts and partial failures               |
| Scale            | Pushes to large organizations, thousands of users and performance limits |
| Product critic   | Finds ambiguous requirements and missing workflows                       |

The report lists:

- Missing requirements
- Architecture weaknesses
- Security vulnerabilities
- Unhandled user journeys
- New work orders with acceptance criteria

Windtunnel tests the design before implementation. Once the code exists, it can
check the real thing against the same findings.

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

Needs Node 20 or later and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

The app runs on <http://localhost:3300>.

```bash
pnpm lint
```

```bash
pnpm build
```

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Turbopack)
- [Tailwind CSS](https://tailwindcss.com) v4
- [shadcn/ui](https://ui.shadcn.com) on Base UI, with lucide icons
- Sora for text and headings, Geist Mono for labels

## Layout

```
brand/            logo files, colours, usage notes, preview sheet
src/app/          routes, global styles, icons and the share card
src/components/   brand/ (mark, hero art), ui/ (shadcn), site chrome
src/lib/          helpers
```

## Brand

The mark is called Parting. The app under test is not built yet, so it is not
drawn; you see it only in how two lines of air part around it. The brand colour
is violet `#7C5CFF` and the typeface is Sora. Files and rules are in
[brand/](brand/README.md).
