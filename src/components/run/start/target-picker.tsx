"use client";

import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { Severity } from "@/server/engine/schema";

/*
 * Dogfight's one input: the security issue whose fix must hold. The list is
 * the project's latest code run's security issues, worst first. On a sample
 * project only the issues with a scripted duel can be picked, so the demo
 * stays free.
 */

export interface PickTarget {
  runId: string;
  groupId: string;
  title: string;
  severity: string;
  hasFix: boolean;
}

export function TargetPicker({
  targets,
  scripted,
  value,
  onChange,
  example,
}: {
  targets: PickTarget[];
  /** Issue ids a sample project can fight; null when any can. */
  scripted: string[] | null;
  value: { runId: string; groupId: string; label: string };
  onChange: (next: { runId: string; groupId: string; label: string }) => void;
  example: React.ReactNode;
}) {
  if (targets.length === 0) {
    return (
      <p className="max-w-xl text-[0.8125rem] text-muted-foreground">
        This project has no security issues from a code run yet. Run a Tunnel
        Run on its code first; its security issues show here.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="start-targets">
      <ul className="max-w-2xl divide-y rounded-md border">
        {targets.map((target) => {
          const ok = !scripted || scripted.includes(target.groupId);
          const on =
            value.runId === target.runId && value.groupId === target.groupId;
          return (
            <li key={`${target.runId}:${target.groupId}`}>
              <button
                type="button"
                disabled={!ok}
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    runId: target.runId,
                    groupId: target.groupId,
                    label: target.title,
                  })
                }
                title={ok ? undefined : "Not scripted in the sample project"}
                className={cn(
                  "flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[0.8125rem] transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-35",
                  on && "bg-muted/60",
                )}
                data-testid={`start-target-${target.groupId}`}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border",
                    on && "border-foreground",
                  )}
                >
                  {on ? (
                    <span className="size-2 rounded-full bg-foreground" />
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      SEVERITY_TONE[target.severity as Severity] ?? undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{target.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {target.hasFix ? "Fix ready" : "No fix yet"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {scripted ? (
        <p className="text-xs text-muted-foreground">
          A sample project: only the issues with a scripted duel can be picked,
          so the run stays free.
        </p>
      ) : null}
      {example}
    </div>
  );
}
