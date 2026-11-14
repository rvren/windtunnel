# Eval plan: the agents on code

## What it answers

When an agent's prompt or expertise notes change, did it get better at
finding real flaws in code, and did it raise fewer false ones? It scores
each of the five agents (Everyday user, Attacker, Outage tester, Load
tester, Product reviewer), the challenge round and the judge, from one set
of runs.

Today nothing measures this. The engine tests replay fixed answers
(`ScriptedLlm`) and check the pipeline; the run's own checks
(`checkAgentReport`, `reconcileVerdict`, `checkEdits`) drop malformed
output; the scoreboard ranks agents against each other in one run. None of
them knows what the right answer was.

## Cases

One case is one repository run through the real entry point
(`executeRun` with the real model client, the same path as a run started
in the app), on a fresh copy of the code.

| Case                                                                                           | Code                        | Why                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `sf-auth`, `sf-billing`, `sf-catalog`, `sf-gateway`, `sf-notifications`, `sf-orders`, `sf-web` | One Storefront service each | Flaws written for Windtunnel; small enough to run often                                |
| `sf-project`                                                                                   | All seven together          | Flaws that cross services (a gateway that trusts a header the auth service never sets) |
| `dvna`                                                                                         | DVNA, pinned to one commit  | A public app with a published list of flaws, written by someone else                   |

Two traps, closed by construction:

- **The answer key must not be readable by the agents.** DVNA ships its
  own list of flaws (`docs/`, the README). The eval's copy of DVNA has
  those removed, and the key lives in `evals/`, outside every workspace.
  The Storefront READMEs only say the flaws are deliberate; they list none.
- **DVNA is famous.** The model may know its flaws from memory. Its scores
  are reported in their own column, and the headline is the Storefront
  cases.

## The answer key

One file per case, `evals/agents-on-code/key/<case>.json`. Each known flaw:

```json
{
  "id": "sf-catalog-01",
  "title": "Search joins the query text into SQL",
  "kind": "security_vulnerability",
  "severity": "critical",
  "cwe": "CWE-89",
  "file": "search.py",
  "lines": [12, 18],
  "source": "human-verified"
}
```

I draft the Storefront entries from the code and the DVNA entries from its
published list; **you read and correct every entry before anything runs**
(sign-off 1). Nothing in the key comes from a Windtunnel run, so the eval
never rewards copying the current agents.

## Grading

Each finding is matched to the key, cheapest first:

1. **Code.** Same file, line ranges overlapping (within 5 lines), and the
   same kind (and the same CWE when both have one) → a match.
2. **Judge** for what code could not place: Haiku 5.5, structured output,
   reads the finding and the key entries of that case, and says one of:
   _same as key entry X_, _a real flaw not in the key_, _not a real flaw_.
   Both texts are passed as data, never as instructions.
3. **You** decide every _real flaw not in the key_: added to the key (a new
   key version) or not. Scores are always reported with the key version.

Metrics, per agent and for the whole run:

| Metric        | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Recall        | Known flaws found, out of all in the key (critical and high also shown alone) |
| Precision     | Findings that match a known flaw, out of all findings                         |
| Severity      | Matched findings whose severity is the key's, or one step off                 |
| Judge kept    | Matched findings the judge accepted (the judge's recall)                      |
| Judge dropped | Unmatched findings the judge rejected (the judge's precision)                 |
| Unique        | Known flaws only this agent found                                             |

Recorded with every case: tokens per stage (input, output, cache), cost
from those tokens and the models that answered, wall-clock time, findings
the run's checks dropped, and agents that failed or declined.

## Repeats and noise

The same repository gave 14 findings in one past DVNA run and 1 in
another, so a single run says little. Every case runs **3 times**. The
report gives each metric with a 95% interval; a change smaller than the
interval is not acted on. After the baseline, I put the measured interval
next to the size of change you would act on; if it cannot see that
change, we add repeats or cases before tuning anything.

## How it runs

- `scripts/eval/agents-on-code.ts`, in the repo's own TypeScript, writing
  `.claude/hillclimb/agents-on-code/<variant>/results.jsonl`, one transcript
  per (case, repeat), and `errors.jsonl` for runs that failed for reasons
  other than the agents (timeouts, API errors). Those never count as a 0.
- Flags `--variant`, `--reps`, `--cases`; resumes where it stopped; a time
  limit per case; backoff on rate limits; checks that the model that
  answered is the model asked for.
- Each case starts from a clean copy of the code; nothing from one case
  reaches the next.
- A report page (`report.html`) per run: a table per case and agent, each
  row linking to its transcript.

## Before any money is spent

1. **Grader check, free:** the key itself fed through the grader scores
   100%; no findings scores 0%; a confident finding about the wrong file
   is not matched. The judge gets an empty finding and a wrong one, and
   must fail both.
2. **Pilot, paid, asked first:** one case, one repeat, to measure tokens
   and time. Past repository runs used roughly 0.6 to 1.1 million input
   tokens and 24,000 to 59,000 output tokens each; the pilot gives the
   real figure for these cases.
3. **Full baseline, paid, asked first:** 9 cases × 3 repeats = 27 runs,
   priced from the pilot's measured use, before it starts.

## Where it stands (14 November)

Built, all free so far:

- **Answer keys** in `key/`: 54 Storefront flaws over 8 cases and 44 DVNA
  flaws at commit `9ba473a`. Drafted from the code and DVNA's own list;
  **not yet reviewed by you** (entries marked `"confidence": "likely"` need
  a look first).
- **Grader** (`src/server/eval/grade.ts`, `judge.ts`, with tests). Code
  matches a finding only when the choice is clear: one flaw fits, or one
  fits clearly best. Small files put several flaws on the same lines (31
  overlapping pairs in the keys), so the rest go to the judge.
- **Runner** `pnpm eval:agents`: `--check` (every key line exists; the key
  grades itself; no findings grade 0%), `--sample` (the whole harness on
  the scripted model), then paid runs with `--cases`, `--reps`, `--variant`.
  Paid runs need `--approve-harness` first, and again after any change to
  the runner, the grader or a key.
- **Engine:** an eval run skips the fix and work-order stages (`skip` in
  `EngineDeps`), and the API client reports which model answered each call,
  so a fallback model is counted (`fallbacks` in each row).

What one live DVNA run (14 November, with DVNA's "deliberately insecure"
description) showed, scored in code only: the judge kept every security
finding (the earlier run that lost 11 is fixed), but the agents filed 15
findings, and code alone places 5 known flaws (3 of 16 critical and high).
Missed: SQL injection, XSS, CSRF, XXE, vulnerable dependencies,
misconfiguration. The Attacker's notes and the code agents' prompt were
changed for that (see the first variant below); the baseline measures the version with those changes; to measure the version before, check out the commit before them and run it as its own `--variant`.

## Order of work

1. Draft the answer key (free) → **your review, sign-off 1**.
2. Runner and grader, with tests; grader check (free). Done.
3. Five graded examples from the pilot in the report → **your review of
   the grading, sign-off 2**.
4. Full baseline → the report, and the interval next to the change you
   would act on.

## Later evals (not in this one)

- Requirement runs: known gaps planted in written specs.
- The fix agent: does the patch apply and close the flaw, checked on the
  code afterwards.
