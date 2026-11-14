# Roadmap

Where Windtunnel is, and what comes next. Each stage must work with Windtunnel
alone: plain input in, plain output out. Connectors come last and stay optional.

The stage names keep the wind tunnel metaphor. They are working titles.

## Now: foundation

Done:

- Name, logo and brand colour ([brand/](brand/README.md))
- App shell on Next.js, Tailwind CSS and shadcn/ui
- Home page that explains the product

Not done: everything below.

## 1. Tunnel run

The core simulation. One requirement, five agents, one report.

- Input: a requirement typed in, or Markdown files (a PRD, a design doc).
- Agents: normal user, adversarial user, chaos, scale, product critic. Each has
  its own goal, and they compete to find flaws in the proposed design.
- Output: missing requirements, architecture weaknesses, security
  vulnerabilities, unhandled user journeys, and new work orders with acceptance
  criteria. On screen, as Markdown and as JSON.
- Later in this stage: run the same checks against the real code once it exists.

Needs a model API key. That is the only outside dependency of the standalone
product.

## 2. Crosswind

"What happens if we change our authentication architecture?"

The agents simulate the effect of a change on every requirement, blueprint,
component, API, test and downstream feature, and show the architecture before
and after as an impact graph.

Original idea: Factory Time Machine.

## 3. Fly-off

No single agent designs a feature alone. Several agents each propose an
architecture and challenge the others' decisions. A judge agent then picks the
strongest design and gives its evidence. The output is a reviewed blueprint.

In aviation, a fly-off is a contest between rival prototypes.

Original idea: Agent Jury.

## 4. Black box

Production feedback starts a full loop: find the affected requirement, locate
the implementation, generate a fix, run the tests, propose a pull request and
update the project context.

Original idea: Self-Healing Software Factory.

## Connectors (optional)

A connector reads requirements and designs from another tool and writes work
orders back to it. All connectors sit behind one interface, and the core never
imports one.

- **8090 Software Factory** — requirements from Refinery and blueprints from
  Foundry in, work orders to Planner out.
- **GitHub issues** — work orders out.
