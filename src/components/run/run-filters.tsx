"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  projects?: { id: string; name: string }[];
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
        <Select
          value={project}
          onValueChange={(value) =>
            go((next) => {
              next.delete("workspace");
              if (!value || value === ALL) next.delete("project");
              else next.set("project", String(value));
            })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-48"
            aria-label="Project"
            data-testid="run-filter-project"
          >
            <SelectValue>
              {projects.find((item) => item.id === project)?.name ??
                "All projects"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {name}
        </span>
      ))}
    </span>
  );
}
