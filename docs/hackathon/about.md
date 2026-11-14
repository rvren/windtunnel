## Inspiration

Shipping code has never been easier. Any engineer, and now any AI coding agent, can open a pull request in minutes. In an enterprise web app spread across dozens of microservices, that is also how things break. A change that looks harmless in one repository quietly breaks a flow three services away: the gateway starts trusting a header the auth service never sets, or a retry in orders charges a card three times through billing.

Code review looks at a diff. Nobody looks at the whole system. We wanted the software equivalent of a wind tunnel: a place to put the entire application, or even just the idea for a feature, under stress before real users ever touch it.

## What it does

**Windtunnel** points five competing AI agents at your application:

- **Everyday user:** walks the normal paths a real customer takes.
- **Attacker:** probes access control, injection, secrets and unsafe defaults.
- **Outage tester:** breaks dependencies, timeouts, retries and half-done steps.
- **Load tester:** pushes to huge teams, lots of data and heavy traffic.
- **Product reviewer:** spots unclear rules and missing steps.

You can point it at:

- **A project:** every repository of one application, read together, so it can find flaws _between_ services.
- **A written requirement:** an idea not yet built, where every finding is a _probable risk_ to decide on, not a defect.

Every finding must cite a real file and line range, or it is thrown out. The agents then challenge each other's findings. A judge merges duplicates, ranks severity and keeps only what the evidence supports. The results land in a **cockpit**: an issue flow across services, an architecture map read from the code, and a security view by OWASP category and CWE.

Then it **closes the loop**. For a security issue, Windtunnel writes a fix and checks it line by line against the code. You open a pull request from the app. After your team merges it, a rescan confirms the issue is really gone. For requirements, it turns what the run found unsaid into questions. Your answers become decisions in the text, and you run the next version and see what got better.

## How we built it

- **App:** Next.js 16 (App Router), Tailwind, shadcn on Base UI, Motion for transitions. Postgres with Drizzle for runs, events, tracked issues and projects. Docker Compose runs it all locally.
- **Models:**
  - Claude Opus 5.5 does the reasoning stages: the design model, the judge, fixes and work orders.
  - Claude Sonnet 5.5 runs the five agents in parallel, plus the challenge round between them.
  - Responses use structured outputs against Zod schemas, so every stage returns typed data, not prose.
- **Agents on real code:** each agent explores the repository with read-only tools and files findings through a `report_finding` tool that refuses citations to files or lines that don't exist. Nothing from a repository is ever executed.
- **Checks in code, not just prompts:**
  - Citations are verified.
  - Every finding is placed exactly once by the judge.
  - Patches must match the real file before they are offered.
  - Secrets are found by known key formats and masked; their values are never stored, shown or sent.
- **The fix loop:** GitHub's Git Data API creates a branch, one commit and a pull request, only after a person confirms. Windtunnel never merges. Tracked issues move through open → PR open → merged → fixed, reconciled after every run.
- **Live runs:** the run page streams events, so you watch the agents work in parallel lanes and each stage reveal its result as it finishes.
- **Samples and safety:**
  - **Storefront** is a seven-service sample app with deliberate flaws, and its runs replay for free.
  - Live runs never start without an explicit confirmation of cost.
- **Evals:** answer keys for 98 known flaws (54 across the Storefront cases, 44 in the public DVNA app), a grader that matches findings to known flaws, and a runner that scores each agent's recall and precision.

## Challenges we ran into

- **The judge excused real vulnerabilities.** On DVNA, described as "deliberately insecure", the judge rejected 11 real findings as "intended". The agents had found SQL injection, command injection and account takeover, and almost none of it reached the report. We added a hard rule: a flaw the code shows is a flaw, whatever the description says. A later live run confirmed the fix.
- **The same repository gave very different runs.** Two DVNA runs reported 14 issues and 1 issue. One run proves little, which is why we built the eval with repeats and confidence intervals.
- **Grounding.** Models confidently cite lines that don't exist. Turning citation checks into code made every finding defensible.
- **Masked secrets broke patches.** Fixes were written against `••••` instead of the real secret, so they could never match the file. We made the mask a wildcard when matching, and refuse any patch that would write it.
- **Ideas aren't defects.** At first, requirement runs closed real code issues, and inflated "open issues" with risks that could never be fixed. We separated the two by origin and gave requirement findings their own language: probable risks.
- **Cost and trust.** Every live run bills an API key, so the product asks before every run, and sample mode lets anyone explore for free.

## Accomplishments that we're proud of

- On DVNA, one run found SQL injection, command injection, code execution through unsafe deserialization and XML entities, account takeover through profile edits, a predictable password-reset token, and an admin API leaking password hashes. Every finding was tied to the lines that prove it.
- A full loop, from finding to pull request to verified fix, in one product.
- A real eval harness, so the agents can be improved by measurement, not by gut feeling.

## What we learned

- **Evidence beats opinion.** Making agents prove findings with code mattered more than any prompt wording.
- **Competition works.** Agents that score points and dispute each other surface more, and keep each other honest.
- **AI output varies a lot from run to run.** Without evals, you can't tell whether a prompt change helped.
- **Words matter.** "Issue" and "probable risk" lead teams to very different decisions.

## What's next

The roadmap keeps the wind tunnel metaphor. Each stage works with Windtunnel alone (plain input in, plain output out), and connectors stay optional.

**Before production: evals for every agent.** The first eval (the agents on code, scored against 98 known flaws) is built. Next come:

- The agents on a requirement, with gaps and contradictions planted in written specs.
- The judge alone: it keeps real findings, drops false ones, and never excuses a real flaw because a description calls it deliberate.
- The fix agent: the patch applies and actually closes the flaw, checked on the code afterwards.
- The design model, against hand-written models of sample requirements.

**1. Tunnel run, version 2.** What we have today, extended:

- Check a repository against the findings of an earlier requirement run, so the risks raised by an idea are tracked into the code that implements it.
- Sign-in, organizations and per-user access to projects.
- Trends across a project's runs, and scheduled runs with cost caps.

**2. Crosswind.** _"What happens if we change our authentication architecture?"_ The agents simulate the effect of a change on every requirement, component, API, test and downstream feature, and show the architecture before and after as an impact graph. Pointed at an incoming pull request, this becomes a review of its reach across every service, not just its diff.

**3. Fly-off.** No single agent designs a feature alone. Several agents each propose an architecture and challenge the others' decisions, and a judge picks the strongest design with its evidence. The output is a reviewed blueprint. (In aviation, a fly-off is a contest between rival prototypes.)

**4. Black box.** Production feedback starts the full loop: find the affected requirement, locate the implementation, write the fix, run the tests, open the pull request and update the project's context.

**Connectors.** All behind one interface, so the core never depends on one:

- **8090 Software Factory** (built): work orders out today, with requirements from Refinery and blueprints from Foundry coming in next.
- **GitHub Issues** (planned): work orders out.
- **Jira, Linear, Slack and email** (planned): alerts for new critical issues and merged fixes.
