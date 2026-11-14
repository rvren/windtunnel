/*
 * What each KPI card and widget shows, and how it is worked out, in one
 * place: the words behind every "i" tooltip (components/info-tip.tsx).
 * Keep each to a few plain sentences: what it is, where the numbers
 * come from, what a click does.
 */

export const EXPLAIN = {
  // Cockpit stage views
  issueFlow:
    "Every accepted issue runs from where it is (its workspace, or its component in a one-workspace project) through its kind to its severity. A band's width is the number of issues. Select a name to filter the list below.",
  architecture:
    "The parts of the application and what calls what, read from the code by the model in this run. The number on a part counts the issues whose cited file is in it. Select a part to filter the list.",
  security:
    "Security issues by OWASP Top 10 category, split by whether a patch was written and its lines matched the real files. Select a name to filter the list.",

  // Cockpit cards
  issues:
    "Findings the judge accepted, merged into one issue per flaw. The change compares this run with the project's previous finished run. Select a severity to filter.",
  fixFirst:
    "The critical and high issues, most severe first. Open one to see its evidence and fix in the run.",
  history:
    "The number of issues in each finished run of this project, oldest to newest. Lower is better.",
  readiness:
    "Patched: security issues with a patch whose lines matched the real files. In 8090: this run's work orders sent to Software Factory. Data to logs: places where personal data reaches a log or an outside call.",

  // Cockpit sections
  issuesList:
    "Every issue the judge accepted, after merging findings that describe the same flaw. Filters picked on the canvas or a card apply here.",
  securitySection:
    "Each security issue with its fix: steps, its CWE and OWASP mapping, and a patch checked line by line against the code. Patches are never applied.",
  privacy:
    "Found by reading the code for names that hold personal data (email, phone, card number and more) and where they go: logs, outside calls, storage, responses. Found by name, so it can include false positives. Secrets are found by known key formats; their values are never stored.",

  // Run page
  liveMap:
    "The parts of the application as this run reads them, with each agent shown on the part whose files it is reading now.",
  stages:
    "The steps of a run, in order. Each says what it did when it finished.",
  stageTime:
    "How long each finished stage took, from the times the run recorded when each stage started and ended.",
  agents:
    "Five agents walk scenarios against the design model, each from its own angle, and file findings with evidence. The count is findings filed so far.",
  liveFindings:
    "Findings as the agents file them, before the judge rules. Some will be merged with others or rejected.",
  findings:
    "Accepted issues by kind. Each merges the agents' findings about the same flaw, with the evidence that backs it and, for security issues, a fix.",
  rejected:
    "Findings the judge threw out, with its reason, and findings dropped because their evidence did not match the cited code or scenario.",
  workOrders:
    "Each accepted issue becomes a work order with acceptance criteria, ready to hand to engineering or send to 8090 Software Factory.",
  permissions:
    "Who may do what, as the design model reads it from the requirement or the code.",
  gaps: "Found by code, not by the model: places where the design model leaves a permission, a condition, a failure or a limit unstated.",
  scoreboard:
    "Points per agent for accepted findings: 8 for critical, 5 high, 3 medium, 1 low, shared when agents found the same flaw. Disputing a finding the judge then rejects earns 1.",
  timeAndTokens:
    "A flame graph of the run: each block is a stage or an agent, its width the time it took. Tokens are the model's input and output counts for that block.",
  designSpecified:
    "How fully the design states its rules: the share of role and operation pairs it gives a permission for. Below: permissions given, items stated rather than assumed by the model, and operations that some journey uses.",
  whatChanged:
    "This run against the project's previous finished run: each number now, and how much it went up or down.",
  remediation:
    "A fix for this security issue: steps, its CWE and OWASP mapping, and a patch whose lines matched the real files. It is never applied.",
} as const;

export type ExplainKey = keyof typeof EXPLAIN;
