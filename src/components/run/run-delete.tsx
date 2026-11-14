"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";

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
 * Deleting runs: one from its own page, or several picked in a list of
 * runs. A run in progress cannot be deleted; the server refuses it too.
 */

async function remove(ids: string[]): Promise<string | null> {
  try {
    const response =
      ids.length === 1
        ? await fetch(`/api/runs/${ids[0]}`, { method: "DELETE" })
        : await fetch("/api/runs/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return body?.error ?? "The runs could not be deleted.";
  } catch {
    return "Could not reach the server.";
  }
}

function DeleteDialog({
  open,
  onOpenChange,
  ids,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const one = ids.length === 1;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="run-delete-dialog">
        <DialogHeader>
          <DialogTitle>
            {one ? "Delete this run?" : `Delete ${ids.length} runs?`}
          </DialogTitle>
          <DialogDescription>
            {one ? "The run" : "The runs"}, with {one ? "its" : "their"} report,
            events and deliveries, {one ? "is" : "are"} removed. Issues tracked
            from {one ? "it" : "them"} stay. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
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
            variant="destructive"
            disabled={busy}
            data-testid="run-delete-confirm"
            onClick={async () => {
              setBusy(true);
              const failed = await remove(ids);
              setBusy(false);
              if (failed) {
                setError(failed);
                return;
              }
              onOpenChange(false);
              onDeleted();
            }}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            {one ? "Delete Run" : `Delete ${ids.length} Runs`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Delete Run" on a run's own page; afterwards, back to the runs. */
export function DeleteRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="run-delete"
      >
        <Trash2 />
        Delete Run
      </Button>
      <DeleteDialog
        open={open}
        onOpenChange={setOpen}
        ids={[runId]}
        onDeleted={() => {
          router.push("/app/runs");
          router.refresh();
        }}
      />
    </>
  );
}

// ── Picking several runs in a table ─────────────────────────────────────────

interface Selection {
  picked: Set<string>;
  toggle: (id: string) => void;
  setAll: (ids: string[], on: boolean) => void;
}

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Use inside RunSelection.");
  return value;
}

/**
 * Wraps a table of runs: rows get a checkbox, and a bar offers to delete
 * the picked ones. `ids` are the runs that may be picked (not in progress).
 */
export function RunSelection({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  // Runs that left the list (deleted, filtered out) are no longer picked.
  const live = [...picked].filter((id) => ids.includes(id));
  const value: Selection = {
    picked: new Set(live),
    toggle: (id) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (all, on) => setPicked(on ? new Set(all) : new Set()),
  };
  return (
    <SelectionContext.Provider value={value}>
      {live.length > 0 ? (
        <div
          className="mb-3 flex items-center gap-3 rounded-tile bg-card px-4 py-2.5 text-sm ring-1 ring-foreground/10"
          data-testid="runs-selection-bar"
        >
          <span>
            <span className="font-mono tabular-nums">{live.length}</span> picked
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPicked(new Set())}
          >
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            onClick={() => setOpen(true)}
            data-testid="runs-delete-picked"
          >
            <Trash2 />
            Delete {live.length} {live.length === 1 ? "Run" : "Runs"}
          </Button>
        </div>
      ) : null}
      {children}
      <DeleteDialog
        open={open}
        onOpenChange={setOpen}
        ids={live}
        onDeleted={() => {
          setPicked(new Set());
          router.refresh();
        }}
      />
    </SelectionContext.Provider>
  );
}

const box = "size-4 cursor-pointer accent-[var(--brand)]";

/** The checkbox of one run's row; empty for a run in progress. */
export function RunCheck({
  id,
  title,
  disabled = false,
}: {
  id: string;
  title: string;
  disabled?: boolean;
}) {
  const { picked, toggle } = useSelection();
  if (disabled) return null;
  return (
    <input
      type="checkbox"
      className={box}
      checked={picked.has(id)}
      onChange={() => toggle(id)}
      aria-label={`Pick ${title}`}
      data-testid="runs-row-check"
    />
  );
}

/** The header checkbox: picks or clears every run that may be deleted. */
export function RunCheckAll({ ids }: { ids: string[] }) {
  const { picked, setAll } = useSelection();
  const all = ids.length > 0 && ids.every((id) => picked.has(id));
  return (
    <input
      type="checkbox"
      className={box}
      checked={all}
      disabled={ids.length === 0}
      onChange={() => setAll(ids, !all)}
      aria-label="Pick every run"
      data-testid="runs-check-all"
    />
  );
}
