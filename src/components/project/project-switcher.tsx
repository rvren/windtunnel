"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { NewProjectDialog } from "./project-dialogs";

/*
 * The scope card at the top of the sidebar: the project every page is about,
 * and one menu to move to another. It says where you are even when there is
 * nothing to switch to.
 */

export interface SwitcherProject {
  id: string;
  name: string;
  workspaces: number;
  /** A sample project: its runs replay a script. */
  demo: boolean;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-xs font-semibold text-background uppercase"
    >
      {children}
    </span>
  );
}

const row =
  "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none transition-colors duration-200 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectSwitcher({ projects }: { projects: SwitcherProject[] }) {
  // The project the page is about, if it is about one. A run's page has an
  // id too, but it matches no project.
  const { id } = useParams<{ id?: string }>();
  const currentId = projects.some((project) => project.id === id) ? id : null;
  const [open, setOpen] = useState(false);
  const { isMobile, setOpenMobile } = useSidebar();
  const current = projects.find((project) => project.id === currentId) ?? null;
  const close = () => {
    setOpen(false);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="project-switcher"
        aria-label={`Project: ${current?.name ?? "all projects"}. Switch project`}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-md bg-sidebar-accent px-3 py-2.5 text-left outline-none transition-[background-color,transform] duration-200 hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring active:scale-[0.98] data-popup-open:bg-sidebar-accent/70",
          "group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
        )}
      >
        <Tile>
          {current ? (
            current.name.slice(0, 1)
          ) : (
            <LayoutGrid className="size-3.5" />
          )}
        </Tile>
        <span className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate text-[15px] font-medium">
            {current?.name ?? "All projects"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {current
              ? `${plural(current.workspaces, "workspace")}${current.demo ? " · Sample" : ""}`
              : plural(projects.length, "project")}
          </span>
        </span>
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 gap-px p-1.5"
        data-testid="project-switcher-menu"
      >
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Project
        </p>
        {projects.length > 0 ? (
          <div
            className="flex max-h-72 flex-col gap-px overflow-y-auto"
            role="group"
            aria-label="Project"
          >
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/projects/${project.id}`}
                onClick={close}
                aria-current={project.id === currentId ? "page" : undefined}
                data-testid="project-switcher-item"
                className={cn(
                  row,
                  "h-11",
                  project.id === currentId && "bg-accent",
                )}
              >
                <Tile>{project.name.slice(0, 1)}</Tile>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {plural(project.workspaces, "workspace")}
                    {project.demo ? " · Sample" : ""}
                  </span>
                </span>
                {project.id === currentId ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">
            No projects yet.
          </p>
        )}
        <div className="mt-1 flex flex-col gap-px border-t pt-1">
          <Link
            href="/app/projects"
            onClick={close}
            data-testid="project-switcher-all"
            className={cn(row, "text-muted-foreground hover:text-foreground")}
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
            All projects
          </Link>
          <NewProjectDialog>
            <Button
              type="button"
              variant="ghost"
              data-testid="project-switcher-new"
              className={cn(
                row,
                "justify-start font-normal text-muted-foreground hover:text-foreground",
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
              New project
            </Button>
          </NewProjectDialog>
        </div>
      </PopoverContent>
    </Popover>
  );
}
