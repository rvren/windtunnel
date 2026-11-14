"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  GitPullRequest,
  LoaderCircle,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/*
 * Opening a pull request for an issue's fix. First a preview: every edit is
 * checked against the base branch and nothing is written. When the patch
 * is missing or no longer fits, the fix agent can write a fresh one (on a
 * demo project for free; otherwise on the owner's key, said plainly first).
 * Nothing reaches GitHub until "Create Pull Request".
 */

interface TargetPreview {
  workspace: string | null;
  repo: string | null;
  base: string | null;
  problem: string | null;
  diff: string;
  files: { path: string; ok: boolean; reason: string | null }[];
}

interface Preview {
  branch: string;
  title: string;
  body: string;
  targets: TargetPreview[];
  ready: boolean;
}

type Step =
  | { kind: "loading" }
  | { kind: "preview"; preview: Preview }
  | { kind: "needs-fix"; reason: string }
  | { kind: "writing" }
  | { kind: "creating"; preview: Preview }
  | { kind: "done"; created: { url: string; number: number; repo: string }[] }
  | { kind: "error"; message: string };

export function PullRequestDialog({
  issueId,
  open,
  onOpenChange,
  demo,
  fixCost,
}: {
  issueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A demo project's fix agent replays a script: free. */
  demo: boolean;
  /** What the fix agent will spend, in words, from the run's own numbers. */
  fixCost: string;
}) {
  const [step, setStep] = useState<Step>({ kind: "loading" });

  const loadPreview = async () => {
    setStep({ kind: "loading" });
    try {
      const response = await fetch(`/api/issues/${issueId}/pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      const body = await response.json();
      if (body.needsFix) {
        setStep({ kind: "needs-fix", reason: body.reason });
      } else if (!response.ok) {
        setStep({
          kind: "error",
          message: body.error ?? "The preview failed.",
        });
      } else {
        setStep({ kind: "preview", preview: body.preview });
      }
    } catch {
      setStep({ kind: "error", message: "Could not reach the server." });
    }
  };

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    void (async () => {
      if (!stopped) await loadPreview();
    })();
    return () => {
      stopped = true;
    };
    // loadPreview is stable enough for this one-shot fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, issueId]);

  const writeFix = async () => {
    setStep({ kind: "writing" });
    const response = await fetch(`/api/issues/${issueId}/fix`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStep({
        kind: "error",
        message: body.error ?? "The fix agent failed.",
      });
      return;
    }
    await loadPreview();
  };

  const create = async (preview: Preview) => {
    setStep({ kind: "creating", preview });
    const response = await fetch(`/api/issues/${issueId}/pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.created?.length) {
      setStep({ kind: "done", created: body.created });
    } else if (body.preview) {
      setStep({ kind: "preview", preview: body.preview });
    } else {
      setStep({ kind: "error", message: body.error ?? "GitHub refused." });
    }
  };

  const stale =
    step.kind === "preview" &&
    step.preview.targets.some((target) =>
      target.files.some((file) => !file.ok),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"
        data-testid="pr-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="size-4" aria-hidden="true" />
            Open a pull request
          </DialogTitle>
          <DialogDescription>
            A new branch with the checked fix, and a pull request into the
            default branch. Windtunnel never merges it.
          </DialogDescription>
        </DialogHeader>
        {/* Only the body scrolls; the title and the buttons stay in view. */}
        <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          {step.kind === "loading" ||
          step.kind === "writing" ||
          step.kind === "creating" ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              {step.kind === "loading"
                ? "Checking the fix against the branch as it is now…"
                : step.kind === "writing"
                  ? "The fix agent is reading the code and writing a fix…"
                  : "Creating the branch, the commit and the pull request…"}
            </p>
          ) : null}

          {step.kind === "error" ? (
            <p className="flex items-start gap-2 rounded-tile bg-sev-critical/10 p-3 text-sm text-sev-critical">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {step.message}
            </p>
          ) : null}

          {step.kind === "needs-fix" || stale ? (
            <div
              className="space-y-3 rounded-tile bg-muted/50 p-4 text-sm"
              data-testid="pr-needs-fix"
            >
              <p>
                {step.kind === "needs-fix"
                  ? step.reason
                  : "The code changed since the run, so the patch no longer fits."}{" "}
                The fix agent can read the code as it is now and write one.
              </p>
              <p className="text-xs text-muted-foreground">
                {demo
                  ? "This is a demo project: the fix agent replays its script and costs nothing."
                  : fixCost}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={writeFix}
                data-testid="pr-write-fix"
              >
                <Wand2 />
                {demo ? "Write A Fix" : "Write A Fix On My Key"}
              </Button>
            </div>
          ) : null}

          {step.kind === "preview" ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Title</dt>
                <dd>{step.preview.title}</dd>
                <dt className="text-muted-foreground">Branch</dt>
                <dd className="font-mono text-xs">{step.preview.branch}</dd>
              </dl>
              {step.preview.targets.map((target) => (
                <section
                  key={target.workspace ?? target.repo ?? "repo"}
                  className="space-y-2 rounded-tile ring-1 ring-foreground/10"
                >
                  <header className="flex flex-wrap items-center gap-2 px-3 pt-3 text-xs">
                    <span className="font-mono">
                      {target.repo ?? target.workspace}
                    </span>
                    {target.base ? (
                      <span className="text-muted-foreground">
                        into {target.base}
                      </span>
                    ) : null}
                    {target.problem === null ? (
                      <span className="ml-auto flex items-center gap-1 text-ok">
                        <Check className="size-3.5" aria-hidden="true" />
                        every edit still fits
                      </span>
                    ) : null}
                  </header>
                  {target.problem ? (
                    <p className="mx-3 rounded-md bg-sev-high/10 px-2 py-1.5 text-xs text-sev-high">
                      {target.problem}
                    </p>
                  ) : null}
                  <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed">
                    {target.diff.split("\n").map((line, index) => (
                      <span
                        key={index}
                        className={cn(
                          "block",
                          line.startsWith("+") &&
                            !line.startsWith("+++") &&
                            "text-ok",
                          line.startsWith("-") &&
                            !line.startsWith("---") &&
                            "text-sev-critical",
                        )}
                      >
                        {line || " "}
                      </span>
                    ))}
                  </pre>
                </section>
              ))}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  The pull request&apos;s description
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted/50 p-3 whitespace-pre-wrap">
                  {step.preview.body}
                </pre>
              </details>
            </div>
          ) : null}

          {step.kind === "done" ? (
            <ul className="space-y-2 py-2 text-sm" data-testid="pr-created">
              {step.created.map((item) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-link hover:underline"
                  >
                    <Check className="size-4 text-ok" aria-hidden="true" />
                    {item.repo} #{item.number}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
              <li className="text-xs text-muted-foreground">
                Once it is merged, rescan the project to confirm the issue is
                gone.
              </li>
            </ul>
          ) : null}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {step.kind === "done" ? "Close" : "Cancel"}
          </Button>
          {step.kind === "preview" ? (
            <Button
              disabled={!step.preview.ready}
              onClick={() => create(step.preview)}
              data-testid="pr-create"
            >
              <GitPullRequest />
              Create Pull Request
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
