# Roadmap

Where Windtunnel is, and what comes next. Each stage must work with Windtunnel
alone: plain input in, plain output out. Connectors come last and stay optional.

The stage names keep the wind tunnel metaphor. They are working titles.

## Now

Done:

- Name, logo and brand colour ([brand/](brand/README.md))
- The home page, and the product app at `/app`
- Tunnel run, version 1 (below), on a written requirement or on a repository
- Postgres for runs; Docker Compose to run everything locally
- Projects and workspaces: one application made of several repositories, run
  together, with a cockpit (issue flow, architecture, issues) per project
- Every run belongs to a project; runs filter by workspace
- Connectors: work orders sent to 8090 Software Factory over its MCP server,
  with a catalog of planned connectors
- The live map of a run in progress, and Storefront, a sample application of
  seven services in private repositories, with scripted runs
- Run kinds: Crosswind, Fly-off and Black box (below), each with a free
  scripted demo on Storefront
- Tunnel run v2: an idea's risks linked to the code issues that realise
  them, the cost of every run, and scheduled runs with a monthly cap
- A clean, minimal UI: near-black, hairline borders, small type, a chip
  row and tabs on each page, an activity rail on run pages
- A simple product in three steps: a launcher of the four kinds, one start
  page, and a live wind tunnel of the agents at work that turns into the
  result

## Before production: evals for every agent

Required before Windtunnel goes to production. Today nothing measures
whether the agents find the right flaws: the tests replay fixed answers,
and a run's own checks only drop malformed output. Each eval needs a
reviewed answer key, a grader checked on known-good and known-bad output,
and repeats, since the same repository can give very different runs.

- **The agents on code** (the five agents, the challenge round, the judge):
  recall and precision per agent against known flaws in Storefront and
  DVNA. Planned in
  [evals/agents-on-code/PLAN.md](evals/agents-on-code/PLAN.md).
- **The agents on a requirement:** known gaps and contradictions planted in
  written specs.
- **The judge alone:** keeps real findings, drops false ones, and never
  rejects a real flaw because a description calls it deliberate (a run of
  DVNA on 14 November lost 11 real findings that way).
- **The fix agent:** the patch applies and closes the flaw, checked on the
  code afterwards.
- **The design model:** roles, operations and permissions against
  hand-written models of sample requirements.

Evals run offline, when a prompt, note or model changes; they add nothing
to what a user's run costs.

## 1. Tunnel run

**Version 1 is built.** Still to do in this stage:

- Sign-in, organizations and per-user access to projects.

Built in version 2: a code run can name the requirement run it builds, and
each risk of that idea is linked to the code issue that realises it; every
run shows its cost; the project page charts open issues by severity
across its audits; a project can run an audit daily or weekly, inside a
monthly cap in dollars.

What version 1 does:

The core simulation. One requirement, five agents, one report.

- Input: a requirement typed in, or Markdown files (a PRD, a design doc).
- Agents: normal user, adversarial user, chaos, scale, product critic. Each has
  its own goal, and they compete to find flaws in the proposed design.
- Output: missing requirements, architecture weaknesses, security
  vulnerabilities, unhandled user journeys, and new work orders with acceptance
  criteria. On screen, as Markdown and as JSON.

Needs a model API key. That is the only outside dependency of the standalone
product.

## 2. Crosswind

"What happens if we change our authentication architecture?"

The agents simulate the effect of a change on every requirement, blueprint,
component, API, test and downstream feature, and show the architecture before
and after as an impact graph.

**Built.** Input: a pull request, two branches, or a change in plain words.
Output: the parts the change touches, what it breaks, the known issues it
fixes, and the architecture before and after.

Original idea: Factory Time Machine.

## 3. Fly-off

No single agent designs a feature alone. Several agents each propose an
architecture and challenge the others' decisions. A judge agent then picks the
strongest design and gives its evidence. The output is a reviewed blueprint.

**Built.** Three designers, a round of critiques, a verdict with evidence,
and work orders for the winning blueprint.

In aviation, a fly-off is a contest between rival prototypes.

Original idea: Agent Jury.

## 4. Black box

Production feedback starts a full loop: find the affected requirement, locate
the implementation, generate a fix, run the tests, propose a pull request and
update the project context.

**Built.** Paste an error or an incident note: an agent traces it to cited
lines, the defect is tracked as an issue, and a fix is written and checked
against the code. A pull request opens only when you ask; Windtunnel never
merges. Running the tests is still to do: nothing from a repository is run.

Original idea: Self-Healing Software Factory.

## Connectors (optional)

A connector reads requirements and designs from another tool and writes work
orders back to it. All connectors sit behind one interface, and the core never
imports one.

- **8090 Software Factory** — requirements from Refinery and blueprints from
  Foundry in, work orders to Planner out.
- **GitHub issues** — work orders out.
