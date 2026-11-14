"use client";

import { LayoutGrid } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/*
 * The one way to pick a project: each with its initial, its name, and how
 * many workspaces it has (or that it is a sample). Used by the new-run form
 * and the runs filter.
 */

export interface SelectableProject {
  id: string;
  name: string;
  /** How many workspaces it has, when known. */
  workspaces?: number;
  /** A sample project: its runs replay a script. */
  demo?: boolean;
}

const ALL = "all";

function Initial({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold uppercase",
        muted
          ? "bg-muted text-muted-foreground"
          : "bg-brand/15 text-brand ring-1 ring-brand/25",
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

const meta = (project: SelectableProject) =>
  [
    project.workspaces === undefined
      ? null
      : `${project.workspaces} ${project.workspaces === 1 ? "workspace" : "workspaces"}`,
    project.demo ? "Sample" : null,
  ]
    .filter(Boolean)
    .join(" · ");

export function ProjectSelect({
  projects,
  value,
  onChange,
  allLabel,
  size = "default",
  className,
  id,
  testId,
}: {
  projects: SelectableProject[];
  /** The chosen project's id, or null for all (when `allLabel` is given). */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Offers "all projects" first, with this label. */
  allLabel?: string;
  size?: "sm" | "default";
  className?: string;
  id?: string;
  testId?: string;
}) {
  const current = projects.find((project) => project.id === value) ?? null;
  return (
    <Select
      value={current ? current.id : ALL}
      onValueChange={(next) => {
        const text = String(next ?? ALL);
        onChange(text === ALL ? null : text);
      }}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label="Project"
        className={cn("gap-2", className)}
        data-testid={testId}
      >
        <SelectValue>
          {current ? (
            <span className="flex min-w-0 items-center gap-2">
              <Initial name={current.name} />
              <span className="truncate">{current.name}</span>
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <LayoutGrid className="size-4" aria-hidden="true" />
              <span className="truncate">{allLabel ?? "Choose a project"}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-64">
        {allLabel ? (
          <>
            <SelectItem value={ALL}>
              <span className="flex items-center gap-2.5 py-0.5">
                <span className="grid size-5 place-items-center text-muted-foreground">
                  <LayoutGrid className="size-4" aria-hidden="true" />
                </span>
                {allLabel}
              </span>
            </SelectItem>
            <SelectSeparator />
          </>
        ) : null}
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <span className="flex min-w-0 items-center gap-2.5 py-0.5">
              <Initial name={project.name} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{project.name}</span>
                {meta(project) ? (
                  <span className="text-[11px] text-muted-foreground">
                    {meta(project)}
                  </span>
                ) : null}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
