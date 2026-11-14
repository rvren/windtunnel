"use client";

import { useState } from "react";

import { Panel } from "@/components/panel";
import { Remediation } from "@/components/run/remediation";
import { SeverityBadge } from "@/components/run/badges";
import { ProgressBar } from "@/components/tuff/progress-bar";
import { Button } from "@/components/ui/button";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import type { Severity } from "@/server/engine/schema";
import type { CockpitIssue } from "@/server/projects/cockpit";

/*
 * The cockpit's Security section: a project's security issues with their
 * CWE, OWASP category and place, each opening its remediation. Filtered by
 * OWASP category and by severity.
 */
export function SecurityView({ issues }: { issues: CockpitIssue[] }) {
  const security = issues.filter(
    (issue) => issue.type === "security_vulnerability",
  );
  const [owasp, setOwasp] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  if (security.length === 0) return null;

  const categories = [
    ...new Map(
      security.flatMap((issue) =>
        issue.remediation?.owasp
          ? [[issue.remediation.owasp.id, issue.remediation.owasp] as const]
          : [],
      ),
    ).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const shown = security.filter(
    (issue) =>
      (!owasp || issue.remediation?.owasp?.id === owasp) &&
      (!severity || issue.severity === severity),
  );
  const withPatch = security.filter(
    (issue) => (issue.remediation?.edits.length ?? 0) > 0,
  ).length;

  return (
    <section data-testid="cockpit-security">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-medium">Security</h2>
        <div
          className="flex w-full items-center gap-3 sm:w-72"
          data-testid="cockpit-security-patched"
        >
          <p className="shrink-0 text-xs text-muted-foreground">
            <span className="font-mono text-foreground tabular-nums">
              {withPatch} of {security.length}
            </span>{" "}
            with a checked patch
          </p>
          <ProgressBar
            className="flex-1"
            size="sm"
            kind="meter"
            label="Security issues with a checked patch"
            valueText={`${withPatch} of ${security.length}`}
            value={withPatch}
            max={security.length}
            tone={withPatch === security.length ? "positive" : "brand"}
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {categories.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={owasp === item.id ? "secondary" : "outline"}
            aria-pressed={owasp === item.id}
            onClick={() => setOwasp(owasp === item.id ? null : item.id)}
            data-testid="security-filter-owasp"
          >
            {item.id.slice(0, 3)} · {item.name}
          </Button>
        ))}
        {SEVERITY_ORDER.filter((value) =>
          security.some((issue) => issue.severity === value),
        ).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={severity === value ? "secondary" : "ghost"}
            aria-pressed={severity === value}
            onClick={() => setSeverity(severity === value ? null : value)}
            data-testid="security-filter-severity"
          >
            {SEVERITY_LABEL[value]}
          </Button>
        ))}
      </div>
      <Panel>
        <ul className="divide-y" data-testid="security-issues">
          {shown.map((issue) => (
            <li key={issue.id}>
              <details className="group px-4 py-3" data-testid="security-issue">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 outline-none [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 basis-64">
                    <span className="block text-sm font-medium">
                      {issue.title}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                      {[
                        issue.remediation?.cwe?.id,
                        issue.remediation?.owasp?.id.slice(0, 3),
                        issue.path
                          ? `${issue.path}${issue.startLine ? `:${issue.startLine}` : ""}`
                          : null,
                        issue.foundByCode ? "secret scan" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <SeverityBadge severity={issue.severity} />
                </summary>
                {issue.remediation ? (
                  <Remediation record={issue.remediation} />
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No remediation for this issue: {issue.summary}
                  </p>
                )}
              </details>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No security issue matches these filters.
            </li>
          ) : null}
        </ul>
      </Panel>
    </section>
  );
}
