"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCost } from "@/lib/cost";

/*
 * Setting a project's scheduled runs. A schedule says it is a standing
 * permission, inside its cap. (Runs start from the start page,
 * /app/runs/new.)
 */

export interface KindWorkspace {
  name: string;
  label: string;
  /** Only a GitHub workspace has pull requests and branches. */
  github: boolean;
}

const field =
  "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function ScheduleDialog({
  projectId,
  schedule,
  spentUsd,
  free,
  children,
}: {
  projectId: string;
  schedule: {
    every: "off" | "daily" | "weekly";
    hour: number;
    monthlyCapUsd: number | null;
  };
  /** What this month's runs of the project cost so far. */
  spentUsd: number;
  /** A sample project: its runs cost nothing. */
  free: boolean;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [every, setEvery] = useState(schedule.every);
  const [hour, setHour] = useState(schedule.hour);
  const [cap, setCap] = useState(
    schedule.monthlyCapUsd === null ? "" : String(schedule.monthlyCapUsd),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: {
            every,
            hour,
            monthlyCapUsd: cap.trim() === "" ? null : Number(cap),
          },
        }),
      });
      const answer = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(answer.error ?? "The schedule could not be saved.");
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md" data-testid="schedule-dialog">
        <DialogHeader>
          <DialogTitle>Scheduled runs</DialogTitle>
          <DialogDescription>
            An audit of all the project&apos;s code, on a schedule.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            How often
            <select
              className={field}
              value={every}
              onChange={(event) => setEvery(event.target.value as typeof every)}
              data-testid="schedule-every"
            >
              <option value="off">Off</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            At (server time)
            <select
              className={field}
              value={hour}
              onChange={(event) => setHour(Number(event.target.value))}
              disabled={every === "off"}
            >
              {HOURS.map((item) => (
                <option key={item} value={item}>
                  {String(item).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
            Monthly cap in US dollars (empty: no cap)
            <Input
              inputMode="decimal"
              value={cap}
              onChange={(event) =>
                setCap(event.target.value.replace(/[^\d.]/g, ""))
              }
              disabled={every === "off"}
              placeholder="20"
              data-testid="schedule-cap"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {free
            ? "This is a sample project: its runs replay a script and cost nothing."
            : `Setting a schedule is your standing permission for these runs. Each is billed to your Claude API key; a run is skipped when this month's spending plus the last run's cost would pass the cap. This month so far: ${formatCost(spentUsd)}.`}
        </p>
        {error ? (
          <p className="text-[0.8125rem] text-sev-critical" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={busy}
            onClick={save}
            data-testid="schedule-save"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
