"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ProjectSelect,
  type SelectableProject,
} from "@/components/project/project-select";

/*
 * Narrows a list of runs by project and by workspace. The choice lives in
 * the address (?project=…&workspace=…), so a filtered list can be linked
 * and survives a reload.
 */

const ALL = "all";

export function RunFilters({
  projects,
  workspaces,
}: {
  /** Left out on a project's own page, where the project is fixed. */
  projects?: SelectableProject[];
  /** The workspaces that can be picked: those of the project in view. */
  workspaces: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const project = params.get("project") ?? ALL;
  const picked = params.getAll("workspace");

  function go(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    change(next);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  if (!projects && workspaces.length < 2) return null;
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2"
      data-testid="run-filters"
    >
      {projects ? (
        <ProjectSelect
          size="sm"
          className="w-56"
          testId="run-filter-project"
          allLabel="All projects"
          projects={projects}
          value={project === ALL ? null : project}
          onChange={(value) =>
            go((next) => {
              if (value) next.set("project", value);
              else next.delete("project");
              // Workspaces belong to one project; a new project starts over.
              next.delete("workspace");
            })
          }
        />
      ) : null}
      {workspaces.length > 0 ? (
        <span className="text-xs text-muted-foreground">Workspace</span>
      ) : null}
      {workspaces.map((name) => {
        const on = picked.includes(name);
        return (
          <Button
            key={name}
            type="button"
            size="sm"
            variant={on ? "secondary" : "outline"}
            aria-pressed={on}
            data-testid="run-filter-workspace"
            data-workspace={name}
            onClick={() =>
              go((next) => {
                next.delete("workspace");
                for (const item of on
                  ? picked.filter((item) => item !== name)
                  : [...picked, name]) {
                  next.append("workspace", item);
                }
              })
            }
          >
            {on ? <Check /> : null}
            {name}
          </Button>
        );
      })}
      {picked.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="link"
          data-testid="run-filter-clear"
          onClick={() => go((next) => next.delete("workspace"))}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

/** The workspaces a run read, as small chips. */
export function WorkspaceChips({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
        >
          {name}
        </span>
      ))}
    </span>
  );
}
