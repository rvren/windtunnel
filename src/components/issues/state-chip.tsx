"use client";

import {
  ArrowUpRight,
  Check,
  GitMerge,
  GitPullRequest,
  RotateCcw,
} from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Where a tracked issue is in its life: open, a pull request open, merged
 * and waiting for a rescan, fixed, reopened, or not found again. A
 * requirement run's risk is only raised, raised again or no longer raised.
 */

export interface TrackedState {
  id: string;
  state: "open" | "pr_open" | "merged" | "fixed" | "reopened" | "gone";
  pr: { number: number; url: string; state: string } | null;
  /** "requirement" for a requirement run's probable risk. */
  origin?: "code" | "requirement";
}

/** A risk of an idea is raised or not; it is never fixed or reopened. */
const RISK_LOOK: Partial<
  Record<TrackedState["state"], { label: string; className: string }>
> = {
  open: {
    label: "Raised",
    className: "text-muted-foreground ring-foreground/15",
  },
  reopened: {
    label: "Raised again",
    className: "text-muted-foreground ring-foreground/25",
  },
  gone: {
    label: "No longer raised",
    className: "text-muted-foreground ring-foreground/15",
  },
};

const LOOK: Record<
  TrackedState["state"],
  {
    label: (pr: TrackedState["pr"]) => string;
    className: string;
    icon?: typeof Check;
  }
> = {
  open: {
    label: () => "Open",
    className: "text-muted-foreground ring-foreground/15",
  },
  pr_open: {
    label: (pr) => (pr ? `PR #${pr.number} open` : "PR open"),
    className: "text-link ring-brand/40 bg-brand/10",
    icon: GitPullRequest,
  },
  merged: {
    label: () => "Merged · rescan to confirm",
    className: "text-sev-high ring-sev-high/40 bg-sev-high/10",
    icon: GitMerge,
  },
  fixed: {
    label: () => "Fixed",
    className: "text-ok ring-ok/40 bg-ok/10",
    icon: Check,
  },
  reopened: {
    label: () => "Reopened",
    className: "text-sev-critical ring-sev-critical/40 bg-sev-critical/10",
    icon: RotateCcw,
  },
  gone: {
    label: () => "Not found again",
    className: "text-muted-foreground ring-foreground/15",
  },
};

export function StateChip({
  tracked,
  className,
}: {
  tracked: TrackedState;
  className?: string;
}) {
  const risk =
    tracked.origin === "requirement" ? RISK_LOOK[tracked.state] : undefined;
  const look = risk
    ? { label: () => risk.label, className: risk.className, icon: undefined }
    : LOOK[tracked.state];
  const Icon = look.icon;
  const body = (
    <>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {look.label(tracked.pr)}
      {tracked.pr &&
      (tracked.state === "pr_open" || tracked.state === "merged") ? (
        <ArrowUpRight className="size-3" aria-hidden="true" />
      ) : null}
    </>
  );
  const classes = cn(
    "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.625rem] font-medium whitespace-nowrap ring-1",
    look.className,
    className,
  );
  return tracked.pr &&
    (tracked.state === "pr_open" || tracked.state === "merged") ? (
    <a
      href={tracked.pr.url}
      target="_blank"
      rel="noreferrer"
      className={cn(classes, "hover:underline")}
      data-testid="issue-state"
      data-state={tracked.state}
    >
      {body}
    </a>
  ) : (
    <span
      className={classes}
      data-testid="issue-state"
      data-state={tracked.state}
    >
      {body}
    </span>
  );
}
