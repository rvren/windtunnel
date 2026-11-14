"use client";

import { AgentIcon, SeverityBadge } from "@/components/run/badges";
import { Remediation } from "@/components/run/remediation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FINDING_TYPE_LABEL, PRIORITY_LABEL } from "@/lib/labels";
import type { IssueRow } from "@/lib/viz/insights";

/*
 * The full detail of one issue: its summary, every finding merged into it
 * with the agent and evidence, what the other agents said, the fix, and the
 * work order that covers it. `focus` scrolls to the fix or the work order.
 */

export type DrawerFocus = "fix" | "work-order" | null;

const heading = "text-xs tracking-[0.1em] text-muted-foreground uppercase";

export function IssueDrawer({
  row,
  focus,
  onClose,
}: {
  row: IssueRow | null;
  focus: DrawerFocus;
  onClose: () => void;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:sm:max-w-2xl"
        data-testid="issue-drawer"
        initialFocus={false}
      >
        {row ? (
          <>
            <SheetHeader className="gap-1.5 border-b px-6 pt-6 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <SeverityBadge severity={row.severity} />
                <span>{FINDING_TYPE_LABEL[row.type]}</span>
                {row.where ? <span>· {row.where}</span> : null}
              </div>
              <SheetTitle className="pr-8 text-lg leading-snug">
                {row.title}
              </SheetTitle>
              {row.location ? (
                <SheetDescription className="font-mono text-xs">
                  {row.location.path}:{row.location.line}
                </SheetDescription>
              ) : null}
            </SheetHeader>
            <div
              className="flex-1 space-y-8 overflow-y-auto px-6 py-5"
              ref={(element) => {
                if (!element || !focus) return;
                requestAnimationFrame(() =>
                  element
                    .querySelector(`[data-part="${focus}"]`)
                    ?.scrollIntoView({ block: "start" }),
                );
              }}
            >
              <p className="max-w-prose text-sm leading-relaxed">
                {row.summary}
              </p>

              <section className="space-y-3">
                <h3 className={heading}>
                  {row.foundByCode
                    ? "Found by a scan of the code"
                    : `What the agents found · ${row.findings.length}`}
                </h3>
                <ul className="space-y-3">
                  {row.findings.map((finding) => (
                    <li
                      key={finding.uid}
                      className="rounded-tile bg-muted/40 p-3.5"
                    >
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <AgentIcon
                          agentId={finding.agentId}
                          className="size-3.5"
                        />
                        {finding.agentName}
                        <span>· said {finding.severity}</span>
                      </p>
                      <p className="mt-1.5 text-sm font-medium">
                        {finding.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {finding.description}
                      </p>
                      {finding.location ? (
                        <pre className="mt-2 overflow-x-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
                          {`${finding.location.path}:${finding.location.startLine}\n${finding.location.quote}`}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              {row.comments.length > 0 ? (
                <section className="space-y-3">
                  <h3 className={heading}>
                    What the other agents said · {row.comments.length}
                  </h3>
                  <ul className="space-y-2">
                    {row.comments.map((comment, index) => (
                      <li
                        key={`${comment.agentId}-${index}`}
                        className="flex gap-3 text-sm"
                      >
                        <span
                          className={
                            comment.stance === "support"
                              ? "mt-0.5 shrink-0 rounded-sm bg-ok/15 px-1.5 text-[10px] font-medium text-ok uppercase"
                              : "mt-0.5 shrink-0 rounded-sm bg-sev-high/15 px-1.5 text-[10px] font-medium text-sev-high uppercase"
                          }
                        >
                          {comment.stance === "support" ? "For" : "Against"}
                        </span>
                        <span className="text-muted-foreground">
                          <span className="text-foreground">
                            {comment.agentName}:
                          </span>{" "}
                          {comment.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {row.remediation ? (
                <section data-part="fix" className="scroll-mt-4">
                  <Remediation record={row.remediation} />
                </section>
              ) : null}

              {row.workOrder ? (
                <section
                  data-part="work-order"
                  className="scroll-mt-4 space-y-3"
                >
                  <h3 className={heading}>Work order</h3>
                  <div className="rounded-tile bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">
                      {PRIORITY_LABEL[row.workOrder.priority]} priority
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {row.workOrder.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {row.workOrder.description}
                    </p>
                    {row.workOrder.acceptanceCriteria.length > 0 ? (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                        {row.workOrder.acceptanceCriteria.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
