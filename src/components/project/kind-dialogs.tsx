"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Play } from "lucide-react";

import { costText, type RunCost } from "@/components/run/confirm-run";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatCost } from "@/lib/cost";
import { cn } from "@/lib/utils";

/*
 * Starting the newer kinds of run from a project, and setting its scheduled
 * runs. Every start says what it costs before it goes; a schedule says it
 * is a standing permission, inside its cap.
 */

export interface KindWorkspace {
  name: string;
  label: string;
  /** Only a GitHub workspace has pull requests and branches. */
  github: boolean;
}

const field =
  "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const COPY = {
  crosswind: {
    title: "Crosswind",
    lead: "Trace one change through every service: what it breaks, what it fixes, and the architecture before and after.",
  },
  flyoff: {
    title: "Fly-off",
    lead: "Three designers each propose a design for a requirement, critique each other, and a judge picks the strongest.",
  },
  blackbox: {
    title: "Black box",
    lead: "Paste production feedback. An agent traces it to lines in the code and a fix is written, checked against the code.",
  },
} as const;

export function StartKindDialog({
  kind,
  projectId,
  workspaces,
  cost,
  blocked,
  requirement = "",
  children,
}: {
  kind: "crosswind" | "flyoff" | "blackbox";
  projectId: string;
  workspaces: KindWorkspace[];
  cost: RunCost;
  /** Why a run cannot start now, or null. */
  blocked: string | null;
  /** A fly-off's requirement to start from: the project's description. */
  requirement?: string;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const github = workspaces.filter((item) => item.github);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pr" | "branches" | "text">(
    github.length > 0 ? "pr" : "text",
  );
  const [workspace, setWorkspace] = useState(github[0]?.name ?? "");
  const [number, setNumber] = useState("");
  const [base, setBase] = useState("main");
  const [head, setHead] = useState("");
  const [text, setText] = useState(kind === "flyoff" ? requirement : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const names = workspaces.map((item) => item.name);
    const body =
      kind === "flyoff"
        ? { projectId, kind, requirement: text, documents: [] }
        : kind === "blackbox"
          ? {
              projectId,
              kind,
              workspaces: names,
              incident: text,
              requirement: "",
              documents: [],
            }
          : {
              projectId,
              kind,
              workspaces: names,
              requirement: "",
              documents: [],
              change:
                mode === "pr"
                  ? { kind: "pr", workspace, number: Number(number) }
                  : mode === "branches"
                    ? { kind: "branches", workspace, base, head }
                    : { kind: "text", text },
            };
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json()) as { id?: string; error?: string };
      if (response.ok && answer.id) {
        router.push(`/app/runs/${answer.id}`);
        return;
      }
      setError(answer.error ?? "The run could not be started.");
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-lg" data-testid={`start-${kind}`}>
        <DialogHeader>
          <DialogTitle>{COPY[kind].title}</DialogTitle>
          <DialogDescription>{COPY[kind].lead}</DialogDescription>
        </DialogHeader>

        {kind === "crosswind" ? (
          <div className="space-y-3">
            <Tabs
              value={mode}
              onValueChange={(next) => setMode(next as typeof mode)}
            >
              <TabsList>
                <TabsTrigger value="pr" disabled={github.length === 0}>
                  Pull request
                </TabsTrigger>
                <TabsTrigger value="branches" disabled={github.length === 0}>
                  Branches
                </TabsTrigger>
                <TabsTrigger value="text">In words</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "text" ? (
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Move sessions from cookies to a shared Redis, and let the gateway check them."
                className="min-h-28 text-[0.8125rem]"
                data-testid="crosswind-text"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Workspace
                  <select
                    className={field}
                    value={workspace}
                    onChange={(event) => setWorkspace(event.target.value)}
                    data-testid="crosswind-workspace"
                  >
                    {github.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} · {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {mode === "pr" ? (
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Pull request number
                    <Input
                      inputMode="numeric"
                      value={number}
                      onChange={(event) =>
                        setNumber(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="42"
                      data-testid="crosswind-number"
                    />
                  </label>
                ) : (
                  <>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Into (base)
                      <Input
                        value={base}
                        onChange={(event) => setBase(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      From (head)
                      <Input
                        value={head}
                        onChange={(event) => setHead(event.target.value)}
                        placeholder="feature/redis-sessions"
                      />
                    </label>
                  </>
                )}
              </div>
            )}
            {github.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No workspace is on GitHub, so describe the change in words.
              </p>
            ) : null}
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              kind === "flyoff"
                ? "The feature to design, in plain words."
                : "500 Internal Server Error on GET /catalog/search?q=men's shoes …"
            }
            className={cn(
              "min-h-36 text-[0.8125rem]",
              kind === "blackbox" && "font-mono text-xs",
            )}
            data-testid={`${kind}-text`}
          />
        )}

        <p className="text-xs text-muted-foreground">{costText(cost)}</p>
        {blocked || error ? (
          <p className="text-[0.8125rem] text-sev-critical" role="alert">
            {blocked ?? error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={busy || Boolean(blocked)}
            onClick={start}
            data-testid={`start-${kind}-confirm`}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
            Start {COPY[kind].title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
