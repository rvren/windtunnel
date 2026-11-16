"use client";

import { ChevronRight, KeyRound } from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { ProgressBar } from "@/components/tuff/progress-bar";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { Cockpit, CockpitIssue } from "@/server/projects/cockpit";

import type { Drill } from "./drawer";

/*
 * The column of widgets on the right of focus mode: the issues the filters
 * leave, security, and data and privacy. Each is a short summary; selecting
 * it opens the full detail in the drawer.
 */

const glass = "rounded-tile border bg-card p-3.5";
const heading =
  "flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase";

function Open({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-0.5 text-xs text-link hover:underline"
    >
      {label}
      <ChevronRight className="size-3" aria-hidden="true" />
    </button>
  );
}

export function FocusRail({
  cockpit,
  shown,
  filtered,
  onDrill,
}: {
  cockpit: Cockpit;
  /** The issues the current filters leave. */
  shown: CockpitIssue[];
  /** True when any filter is on. */
  filtered: boolean;
  onDrill: (drill: Drill) => void;
}) {
  const list: Drill = {
    kind: "issues",
    title: filtered ? "Filtered issues" : "All issues",
    issues: shown,
  };
  const security = cockpit.issues.filter(
    (issue) => issue.type === "security_vulnerability",
  );
  const patched = security.filter(
    (issue) => (issue.remediation?.edits.length ?? 0) > 0,
  ).length;
  const owasp = [
    ...security
      .reduce((counts, issue) => {
        const id = issue.remediation?.owasp?.id;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
      .entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const privacy = cockpit.privacy;
  const places = privacy
    ? privacy.categories.reduce((sum, item) => sum + item.places, 0)
    : 0;

  return (
    <div className="flex h-full flex-col gap-2" data-testid="focus-rail">
      {/* The issues the filters leave */}
      <section className={`${glass} flex min-h-0 flex-1 flex-col`}>
        <header className="mb-2 flex items-center justify-between">
          <h3 className={heading}>
            Issues
            <InfoTip about="issuesList" label="Issues" className="size-3.5" />
          </h3>
          <span className="font-mono text-xs tabular-nums">
            {shown.length}
            {filtered ? ` of ${cockpit.issues.length}` : ""}
          </span>
        </header>
        <ul className="-mx-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {shown.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                onClick={() => onDrill({ kind: "issue", issue, from: list })}
                data-testid="rail-issue"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-0.5 shrink-0 rounded-full"
                  style={{ background: SEVERITY_TONE[issue.severity] }}
                />
                <span className="line-clamp-2 min-w-0 flex-1 text-foreground/90">
                  {issue.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <Open label="Open the list" onClick={() => onDrill(list)} />
        </div>
      </section>

      {security.length > 0 ? (
        <section className={glass} data-testid="rail-security">
          <header className="mb-2 flex items-center justify-between">
            <h3 className={heading}>
              Security
              <InfoTip
                about="securitySection"
                label="Security"
                className="size-3.5"
              />
            </h3>
            <span className="font-mono text-xs tabular-nums">
              {security.length}
            </span>
          </header>
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>With a checked patch</span>
            <span className="font-mono tabular-nums">
              {patched}/{security.length}
            </span>
          </div>
          <ProgressBar
            label="Security issues with a checked patch"
            value={patched}
            max={security.length}
            size="sm"
            kind="meter"
            tone={patched === security.length ? "positive" : "brand"}
          />
          {owasp.length > 0 ? (
            <ul className="mt-2.5 space-y-0.5 text-xs">
              {owasp.map(([id, count]) => (
                <li key={id} className="flex justify-between">
                  <span className="text-muted-foreground">
                    OWASP {id.slice(0, 3)}
                  </span>
                  <span className="font-mono tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2.5">
            <Open
              label="Fixes and patches"
              onClick={() => onDrill({ kind: "security" })}
            />
          </div>
        </section>
      ) : null}

      {privacy && (places > 0 || privacy.secrets.length > 0) ? (
        <section className={glass} data-testid="rail-privacy">
          <header className="mb-2 flex items-center justify-between">
            <h3 className={heading}>
              Data and privacy
              <InfoTip
                about="privacy"
                label="Data and privacy"
                className="size-3.5"
              />
            </h3>
          </header>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[10px] text-muted-foreground">Places</dt>
              <dd className="font-mono text-sm tabular-nums">{places}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted-foreground">To logs</dt>
              <dd className="font-mono text-sm tabular-nums">
                {privacy.exposedPlaces}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted-foreground">Secrets</dt>
              <dd
                className={
                  privacy.secrets.length > 0
                    ? "flex items-center justify-center gap-1 font-mono text-sm text-sev-critical tabular-nums"
                    : "font-mono text-sm tabular-nums"
                }
              >
                {privacy.secrets.length > 0 ? (
                  <KeyRound className="size-3" aria-hidden="true" />
                ) : null}
                {privacy.secrets.length}
              </dd>
            </div>
          </dl>
          <div className="mt-2.5">
            <Open
              label="Where personal data goes"
              onClick={() => onDrill({ kind: "privacy" })}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
