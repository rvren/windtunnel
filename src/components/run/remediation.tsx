"use client";

import { useState } from "react";
import { Check, Copy, Lightbulb, ShieldCheck } from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { FileChanges } from "@/components/tuff/file-changes";
import { Button } from "@/components/ui/button";
import { toUnifiedDiff } from "@/lib/patch";
import { remediationFiles } from "@/lib/viz/run";
import type { RemediationRecord } from "@/server/engine/schema";

/*
 * How to fix one security finding: its CWE and OWASP category, the steps,
 * the patch as a read-only diff (file, hunks, line numbers), and what the
 * patch leaves to do. The patch is never applied.
 */

export function Remediation({
  record,
  probable = false,
}: {
  record: RemediationRecord;
  /** A requirement run's risk: a suggested change, not a fix. */
  probable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const diff = toUnifiedDiff(record.edits);
  const files = remediationFiles(record);

  if (record.status === "failed") {
    return (
      <div
        className="mt-5 rounded-card border border-dashed px-4 py-3 text-sm text-muted-foreground"
        data-testid="remediation"
        data-status="failed"
      >
        No {probable ? "suggested change" : "remediation"} could be written for
        this finding: {record.error}
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
        {probable ? (
          <Lightbulb
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ShieldCheck className="size-4 text-ok" aria-hidden="true" />
        )}
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {probable ? "Suggested change" : "Remediation"}
          <InfoTip
            about={probable ? "remediationProbable" : "remediation"}
            label={probable ? "Suggested change" : "Remediation"}
          />
        </h4>
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
        <div className="mt-4" data-testid="remediation-patch">
          <FileChanges
            className="max-w-none"
            data={files}
            view={files.length > 1 ? "split" : "stacked"}
            footer={
              <>
                <span className="mr-auto font-mono text-xs text-muted-foreground">
                  {record.edits.length}{" "}
                  {record.edits.length === 1 ? "edit" : "edits"}, checked
                  against the code, not applied
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
                  {copied ? "Copied" : "Copy Patch"}
                </Button>
              </>
            }
          />
        </div>
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
