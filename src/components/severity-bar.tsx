import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { Severity } from "@/server/engine/schema";

/** A thin bar of issues by severity, with the counts beside it. */
export function SeverityBar({
  counts,
  label,
}: {
  counts: Record<Severity, number>;
  /** What the bar is of, for screen readers. */
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <div
        className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]"
        role="img"
        aria-label={label}
      >
        {SEVERITY_ORDER.map((severity) =>
          counts[severity] > 0 ? (
            <span
              key={severity}
              style={{
                flexGrow: counts[severity],
                background: SEVERITY_TONE[severity],
              }}
            />
          ) : null,
        )}
      </div>
      <span className="flex flex-wrap gap-x-2.5 font-mono text-[0.6875rem] whitespace-nowrap text-muted-foreground tabular-nums">
        {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} title={SEVERITY_LABEL[s]}>
            <span style={{ color: SEVERITY_TONE[s] }}>●</span> {counts[s]}
          </span>
        ))}
      </span>
    </div>
  );
}
