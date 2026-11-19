"use client";

import { useState } from "react";
import {
  Check,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  Download,
  X,
} from "lucide-react";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { plainTitle } from "@/lib/features";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  statusCounts,
  traceabilityCsv,
  traceabilityMarkdown,
} from "@/lib/viz/preflight";
import type { LineStatus, RunRecord } from "@/server/engine/schema";

/*
 * Preflight's result: the spec as written, each line marked with what the
 * code does about it, and the code that shows it. Exports the same table
 * as Markdown and CSV, the traceability matrix regulated teams keep.
 */

const MARK: Record<
  LineStatus,
  { icon: typeof Check; tone: string; label: string }
> = {
  implemented: { icon: Check, tone: "var(--ok)", label: "Implemented" },
  partly: { icon: CircleSlash, tone: "var(--sev-high)", label: "Partly" },
  missing: { icon: CircleDashed, tone: "var(--sev-low)", label: "Missing" },
  contradicted: { icon: X, tone: "var(--sev-critical)", label: "Contradicted" },
  unclear: { icon: CircleHelp, tone: "var(--sev-low)", label: "Not checked" },
};

function save(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function PreflightReport({ run }: { run: RunRecord }) {
  const [open, setOpen] = useState<string | null>(null);
  const preflight = run.preflight;
  if (!preflight) return null;
  const counts = statusCounts(preflight);
  const title = plainTitle(run.title);
  const file = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);

  return (
    <Panel className="p-5 md:p-6" data-testid="preflight-report">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
            Preflight · the spec against the code
          </p>
          <dl className="flex flex-wrap gap-x-7 gap-y-2 pt-1 text-[0.8125rem] text-muted-foreground">
            {(
              ["implemented", "partly", "missing", "contradicted"] as const
            ).map((status) => (
              <div key={status} className="flex items-baseline gap-1.5">
                <dt className="sr-only">{STATUS_LABEL[status]}</dt>
                <dd className="text-lg font-medium text-foreground tabular-nums">
                  {counts[status]}
                </dd>
                <span>{STATUS_LABEL[status].toLowerCase()}</span>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              save(
                `${file}-traceability.md`,
                "text/markdown",
                traceabilityMarkdown(title, preflight),
              )
            }
            data-testid="preflight-export-md"
          >
            <Download />
            Markdown
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              save(
                `${file}-traceability.csv`,
                "text/csv",
                traceabilityCsv(preflight),
              )
            }
            data-testid="preflight-export-csv"
          >
            <Download />
            CSV
          </Button>
        </div>
      </div>

      <ol className="mt-5 divide-y border-t" data-testid="preflight-lines">
        {preflight.lines.map((line) => {
          const mark = MARK[line.status];
          const Icon = mark.icon;
          const shown = open === line.id;
          const first = line.locations[0];
          return (
            <li key={line.id} data-status={line.status}>
              <button
                type="button"
                onClick={() => setOpen(shown ? null : line.id)}
                aria-expanded={shown}
                className={cn(
                  "grid w-full grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-3 text-left sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]",
                  shown && "bg-muted/30",
                )}
                data-testid="preflight-line"
              >
                <Icon
                  className="mt-0.5 size-4"
                  style={{ color: mark.tone }}
                  aria-label={mark.label}
                />
                <span className="min-w-0">
                  <span className="block text-[0.875rem]">{line.text}</span>
                  {line.status !== "implemented" ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {line.note}
                    </span>
                  ) : null}
                </span>
                <span className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-auto sm:text-right">
                  {first
                    ? `${first.path}:${first.startLine}${line.locations.length > 1 ? ` +${line.locations.length - 1}` : ""}`
                    : line.status === "missing"
                      ? "no code found"
                      : ""}
                </span>
              </button>
              {shown ? (
                <div className="mb-3 ml-8 space-y-2">
                  {line.status === "implemented" ? (
                    <p className="text-xs text-muted-foreground">{line.note}</p>
                  ) : null}
                  {line.searched ? (
                    <p className="text-xs text-muted-foreground">
                      Searched: {line.searched}
                    </p>
                  ) : null}
                  {line.locations.map((at) => (
                    <figure key={`${at.path}:${at.startLine}`}>
                      <figcaption className="mb-1 font-mono text-[0.6875rem] text-muted-foreground">
                        {at.path}:{at.startLine}-{at.endLine}
                      </figcaption>
                      <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                        {at.quote}
                      </pre>
                    </figure>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
