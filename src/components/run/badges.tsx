import {
  MessageCircleQuestionMark,
  Scaling,
  ShieldAlert,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AgentId } from "@/lib/agents";
import {
  OUTCOME_LABEL,
  PRIORITY_LABEL,
  RUN_STATUS_LABEL,
  termsFor,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { RunStatus, Severity } from "@/server/engine/schema";

const AGENT_ICON: Record<AgentId, LucideIcon> = {
  normal_user: User,
  adversarial_user: ShieldAlert,
  chaos: Zap,
  scale: Scaling,
  product_critic: MessageCircleQuestionMark,
};

export function AgentIcon({
  agentId,
  className,
}: {
  agentId: AgentId;
  className?: string;
}) {
  const Icon = AGENT_ICON[agentId];
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

export function SeverityBadge({
  severity,
  probable = false,
}: {
  severity: Severity;
  /** A requirement run's risk: "High risk" rather than "High". */
  probable?: boolean;
}) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", SEVERITY_DOT[severity])} />
      {termsFor(probable).severity(severity)}
    </Badge>
  );
}

export const PROBABLE_NOTE =
  "Nothing is built yet: this is what could go wrong if the requirement is built as written.";

/** Marks a requirement run's result: a probable risk of an idea. */
export function ProbableTag({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      title={PROBABLE_NOTE}
      className={className}
      data-testid="probable-tag"
    >
      Probable
    </Badge>
  );
}

const STATUS_DOT: Record<RunStatus, string> = {
  running: "bg-brand",
  completed: "bg-ok",
  failed: "bg-sev-critical",
  interrupted: "bg-sev-high",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {RUN_STATUS_LABEL[status]}
    </Badge>
  );
}

const OUTCOME_TEXT: Record<keyof typeof OUTCOME_LABEL, string> = {
  defined: "text-muted-foreground",
  undefined: "text-sev-high",
  conflict: "text-sev-high",
  failure: "text-sev-critical",
};

export function OutcomeLabel({
  outcome,
}: {
  outcome: keyof typeof OUTCOME_LABEL;
}) {
  return (
    <span className={cn("font-mono text-xs", OUTCOME_TEXT[outcome])}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function PriorityBadge({
  priority,
}: {
  priority: keyof typeof PRIORITY_LABEL;
}) {
  return (
    <Badge variant={priority === "p0" ? "default" : "secondary"}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

/** Marks a run that replayed sample data and never called the model. */
export function SampleBadge() {
  return (
    <Badge
      variant="secondary"
      title="Sample data. This run did not call the model."
    >
      Sample run
    </Badge>
  );
}
