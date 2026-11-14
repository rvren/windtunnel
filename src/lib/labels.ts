// The words people see for the engine's values. Used by the screens and by
// the Markdown export, so the two always agree.

/** The stages of a run, in order. */
export const STAGE_ORDER = [
  "model",
  "coverage",
  "agents",
  "judge",
  "work_orders",
] as const;

export const STAGE_LABEL = {
  model: "Model",
  coverage: "Coverage",
  agents: "Agents",
  judge: "Judge",
  work_orders: "Work orders",
} as const;

export const STAGE_DESCRIPTION = {
  model: "Writing the design model from the requirement",
  coverage: "Finding the gaps code can see",
  agents: "Five agents walking scenarios against the model",
  judge: "Merging, checking and ranking the findings",
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
