"use client";

import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toUnifiedDiff } from "@/lib/patch";
import { cn } from "@/lib/utils";
import type { RemediationRecord } from "@/server/engine/schema";

/*
 * How to fix one security finding: its CWE and OWASP category, the steps,
 * the patch as a diff, and what the patch leaves to do. The diff is the one
 * place code is coloured: removed lines red, added lines green.
 */

function DiffLines({ diff }: { diff: string }) {
  return (
    <pre className="overflow-x-auto py-2 font-mono text-xs leading-relaxed">
      {diff
        .trimEnd()
        .split("\n")
        .map((line, index) => (
          <span
            key={index}
            className={cn(
              "block px-3",
              line.startsWith("+") && !line.startsWith("+++")
                ? "bg-ok/10 text-ok"
                : line.startsWith("-") && !line.startsWith("---")
                  ? "bg-sev-critical/10 text-sev-critical"
                  : line.startsWith("@@")
                    ? "text-link"
                    : line.startsWith("---") || line.startsWith("+++")
                      ? "text-muted-foreground"
                      : "text-foreground/80",
            )}
          >
            {line || " "}
          </span>
        ))}
    </pre>
  );
}

export function Remediation({ record }: { record: RemediationRecord }) {
  const [copied, setCopied] = useState(false);
  const diff = toUnifiedDiff(record.edits);

  if (record.status === "failed") {
    return (
      <div
        className="mt-5 rounded-card border border-dashed px-4 py-3 text-sm text-muted-foreground"
        data-testid="remediation"
        data-status="failed"
      >
        No remediation could be written for this finding: {record.error}
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="mt-5 rounded-card border bg-background/40 p-4"
      data-testid="remediation"
      data-status="made"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ShieldCheck className="size-4 text-ok" aria-hidden="true" />
        <h4 className="text-sm font-medium text-foreground">Remediation</h4>
        {record.cwe ? (
          <a
            href={record.cwe.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            title={`${record.cwe.name}${record.cwe.fallback ? " (the closest category; the model's own id was not known)" : ""}`}
            data-testid="remediation-cwe"
          >
            {record.cwe.id} · {record.cwe.name}
          </a>
        ) : null}
        {record.owasp ? (
          <a
            href={record.owasp.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            data-testid="remediation-owasp"
          >
            OWASP {record.owasp.id.slice(0, 3)} · {record.owasp.name}
          </a>
        ) : null}
      </header>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {record.summary}
      </p>

      {record.steps.length > 0 ? (
        <ol className="mt-3 max-w-3xl list-decimal space-y-1.5 pl-5 text-sm">
          {record.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}

      {diff ? (
        <figure className="mt-4 overflow-hidden rounded-card border bg-card">
          <figcaption className="flex items-center justify-between gap-3 border-b px-3 py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              Suggested patch · {record.edits.length}{" "}
              {record.edits.length === 1 ? "edit" : "edits"}, checked against
              the code, not applied
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={copy}
              data-testid="remediation-copy"
              className="h-7"
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy patch"}
            </Button>
          </figcaption>
          <DiffLines diff={diff} />
        </figure>
      ) : null}

      {record.notes.length > 0 ? (
        <ul className="mt-3 max-w-3xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {record.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {record.dropped.length > 0 ? (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            {record.dropped.length}{" "}
            {record.dropped.length === 1 ? "edit was" : "edits were"} left out
            because they did not match the code
          </summary>
          <ul className="mt-2 space-y-1">
            {record.dropped.map((item, index) => (
              <li key={`${item.path}-${index}`}>
                <span className="font-mono">{item.path}</span>: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
