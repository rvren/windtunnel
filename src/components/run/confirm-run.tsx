"use client";

import { LoaderCircle, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/*
 * The one question before any run starts: a live run is billed to the
 * owner's Claude API key, so nothing starts without a yes. Free runs (a
 * sample project, or sample mode) still ask once and say they cost nothing.
 */

export type RunCost = "billed" | "sample-project" | "sample-mode";

export function costText(cost: RunCost): string {
  return cost === "sample-project"
    ? "This is a sample project: the run replays a script, does not call the model and costs nothing."
    : cost === "sample-mode"
      ? "Sample mode is on: the run replays sample data, does not call the model and costs nothing."
      : "The run uses your Claude API key and is billed to it. It takes a few minutes and goes on if you close this page.";
}

export function ConfirmRunDialog({
  open,
  onOpenChange,
  title = "Start this run?",
  cost,
  starting,
  error,
  onConfirm,
  confirmLabel = "Start run",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  cost: RunCost;
  starting: boolean;
  error: string | null;
  onConfirm: () => void;
  confirmLabel?: string;
  /** More to say, such as what the last run used. */
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="confirm-run">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription data-testid="confirm-run-cost">
            {costText(cost)}
          </DialogDescription>
        </DialogHeader>
        {children}
        {error ? (
          <p className="text-sm text-sev-critical" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={starting}
            onClick={onConfirm}
            data-testid="confirm-run-start"
          >
            {starting ? <LoaderCircle className="animate-spin" /> : <Play />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rough words for a run's token use, as a guide to what the next costs. */
export function tokensUsed(
  usage: Partial<
    Record<string, { inputTokens: number; outputTokens: number } | undefined>
  >,
): number {
  return Object.values(usage).reduce(
    (sum, item) => sum + (item ? item.inputTokens + item.outputTokens : 0),
    0,
  );
}
