// The words people see for the engine's values. Used by the screens and by
// the Markdown export, so the two always agree.

/**
 * Every stage any run can have, in order. A run goes through its own kind's
 * stages (stagesOf in the engine schema).
 */
export const STAGE_ORDER = [
  "change",
  "survey",
  "triage",
  "model",
  "coverage",
  "agents",
  "proposals",
  "critique",
  "challenge",
  "judge",
  "remediation",
  "impact",
  "work_orders",
] as const;

/** What each kind of run is called (as in lib/features.ts). */
export const KIND_LABEL = {
  audit: "Tunnel Run",
  crosswind: "Crosswind",
  flyoff: "Fly-off",
  blackbox: "Black Box",
} as const;

export const STAGE_LABEL = {
  change: "Change",
  triage: "Triage",
  proposals: "Proposals",
  critique: "Critique",
  impact: "Impact",
  survey: "Survey",
  model: "Model",
  coverage: "Coverage",
  agents: "Agents",
  challenge: "Challenge",
  judge: "Judge",
  remediation: "Remediation",
  work_orders: "Work orders",
} as const;

export const STAGE_DESCRIPTION = {
  change: "Reading the change: its pull request, branches or words",
  triage: "Tracing the production feedback to its cause in the code",
  proposals: "Three agents each designing the feature their own way",
  critique: "Each designer critiquing the others' blueprints",
  impact: "Mapping what the change does to every service",
  survey: "Fetching the repository and listing its files",
  model: "Writing the design model from the requirement",
  coverage: "Finding the gaps code can see",
  agents: "Five agents walking scenarios against the model",
  challenge: "The agents reviewing each other's findings",
  judge: "Merging, checking and ranking the findings",
  remediation: "Writing fixes for the security findings",
  work_orders: "Writing work orders with acceptance criteria",
} as const;

export const FINDING_TYPE_LABEL = {
  missing_requirement: "Missing requirements",
  architecture_weakness: "Architecture weaknesses",
  security_vulnerability: "Security vulnerabilities",
  unhandled_journey: "Unhandled user journeys",
} as const;

export const FINDING_TYPE_ORDER = [
  "security_vulnerability",
  "missing_requirement",
  "architecture_weakness",
  "unhandled_journey",
] as const;

export const SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

/**
 * The words for a run's results. A requirement run tests an idea: nothing
 * is built yet, so what it finds are probable risks, its fixes are
 * suggested changes and its work orders are proposals. A code run's
 * findings are issues in real code.
 */
export function termsFor(probable: boolean) {
  return probable
    ? {
        issue: "risk",
        issues: "risks",
        Issue: "Risk",
        Issues: "Risks",
        severity: (severity: keyof typeof SEVERITY_LABEL) =>
          `${SEVERITY_LABEL[severity]} risk`,
        fix: "Suggested change",
        workOrders: "Proposed work orders",
        workOrder: "Proposed work order",
        accepted: "kept by the judge",
        found: "raised",
      }
    : {
        issue: "issue",
        issues: "issues",
        Issue: "Issue",
        Issues: "Issues",
        severity: (severity: keyof typeof SEVERITY_LABEL) =>
          SEVERITY_LABEL[severity] as string,
        fix: "Fix",
        workOrders: "Work orders",
        workOrder: "Work order",
        accepted: "accepted by the judge",
        found: "found",
      };
}

export type Terms = ReturnType<typeof termsFor>;

export const PRIORITY_LABEL = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
} as const;

export const OUTCOME_LABEL = {
  defined: "Defined",
  undefined: "Not defined",
  conflict: "Conflict",
  failure: "Fails",
} as const;

export const RUN_STATUS_LABEL = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
} as const;

export const GAP_KIND_LABEL = {
  permission_unspecified: "No permission rule",
  condition_missing: "Condition not given",
  failure_unspecified: "No failure behaviour",
  limit_unspecified: "No limit",
  operation_without_journey: "Operation in no journey",
  role_without_journey: "Role with no journey",
} as const;
