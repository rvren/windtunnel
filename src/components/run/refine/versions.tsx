"use client";

import Link from "next/link";

import { InfoTip } from "@/components/info-tip";
import { Widget } from "@/components/run/insights/rail";
import { cn } from "@/lib/utils";
import { lineDiff, type VersionChanges } from "@/lib/viz/refine";
import type { RunStatus } from "@/server/engine/schema";

/*
 * A requirement's versions: the switcher in the run header, what changed
 * since the version this one refines, and the text that changed.
 */

export function VersionSwitcher({
  versions,
  current,
}: {
  versions: { id: string; number: number; status: RunStatus }[];
  current: string;
}) {
  return (
    <nav
      aria-label="Versions of this requirement"
      className="flex flex-wrap items-center gap-1 text-xs"
      data-testid="run-versions"
    >
      {versions.map((version) => {
        const here = version.id === current;
        return (
          <Link
            key={version.id}
            href={`/app/runs/${version.id}`}
            aria-current={here ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono transition-colors",
              here
                ? "bg-brand/15 text-foreground ring-1 ring-brand/30"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            v{version.number}
            {version.status === "running" ? (
              <span
                aria-label="running"
                className="size-1.5 animate-pulse rounded-full bg-brand"
              />
            ) : version.status === "failed" ||
              version.status === "interrupted" ? (
              <span
                aria-label={version.status}
                className="size-1.5 rounded-full bg-sev-critical"
              />
            ) : null}
          </Link>
        );
      })}
      <InfoTip about="versions" label="Versions" />
    </nav>
  );
}

function Row({
  label,
  count,
  good,
  items,
}: {
  label: string;
  count: number;
  /** Whether more of this is better; null for neither. */
  good: boolean | null;
  items: string[];
}) {
  const tone =
    count === 0 || good === null
      ? "text-muted-foreground"
      : good
        ? "text-ok"
        : "text-sev-critical";
  const head = (
    <>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", tone)}>{count}</span>
    </>
  );
  if (items.length === 0) {
    return <li className="flex items-center gap-3 py-2 text-sm">{head}</li>;
  }
  return (
    <li className="py-2 text-sm">
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3">
          {head}
        </summary>
        <ul className="mt-2 space-y-1.5 border-l pl-3 text-xs text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export function VersionWidget({
  number,
  changes,
}: {
  /** The number of the version this one refines. */
  number: number;
  changes: VersionChanges;
}) {
  const { gaps, issues, permissions, workOrders, assumed, nowStated } = changes;
  return (
    <Widget
      title={`Since version ${number}`}
      about="sinceVersion"
      testId="widget-since-version"
    >
      <ul className="-mt-2 divide-y">
        <Row
          label="Gaps closed"
          count={gaps.closed.length}
          good
          items={gaps.closed.map((gap) => gap.text)}
        />
        <Row
          label="New gaps"
          count={gaps.opened.length}
          good={false}
          items={gaps.opened.map((gap) => gap.text)}
        />
        <Row
          label="Assumptions now stated"
          count={nowStated.length}
          good
          items={nowStated}
        />
        <Row
          label="Issues gone"
          count={issues.gone.length}
          good
          items={issues.gone.map((group) => group.title)}
        />
        <Row
          label="New issues"
          count={issues.found.length}
          good={false}
          items={issues.found.map((group) => group.title)}
        />
      </ul>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        {[
          {
            label: "Permissions",
            before: `${permissions.before.specified}/${permissions.before.total}`,
            after: `${permissions.after.specified}/${permissions.after.total}`,
          },
          {
            label: "Assumed",
            before: String(assumed.before),
            after: String(assumed.after),
          },
          {
            label: "Work orders",
            before: String(workOrders.before),
            after: String(workOrders.after),
          },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 font-mono tabular-nums">
              <span className="text-muted-foreground">{item.before}</span> →{" "}
              {item.after}
            </dd>
          </div>
        ))}
      </dl>
    </Widget>
  );
}

/** The requirement's text changes against the version it refines. */
export function RequirementDiff({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  const lines = lineDiff(before, after);
  if (!lines.some((line) => line.kind !== "same")) {
    return (
      <p className="text-xs text-muted-foreground">
        The text is the same as the earlier version.
      </p>
    );
  }
  return (
    <pre
      className="overflow-x-auto rounded-tile bg-muted/40 py-2 font-mono text-xs leading-relaxed"
      data-testid="run-requirement-diff"
    >
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "px-3 whitespace-pre-wrap",
            line.kind === "added" && "bg-ok/10 text-ok",
            line.kind === "removed" &&
              "bg-sev-critical/10 text-sev-critical line-through",
          )}
        >
          {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
          {line.text || " "}
        </div>
      ))}
    </pre>
  );
}
