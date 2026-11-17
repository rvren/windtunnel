"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Search } from "lucide-react";

import { termsFor } from "@/lib/labels";

import { InfoTip } from "@/components/info-tip";
import { FadeInItem } from "@/components/motion";
import { Segmented } from "@/components/tuff/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TrackedState } from "@/components/issues/state-chip";
import type { AgentId } from "@/lib/agents";
import {
  SORT_LABEL,
  kindCounts,
  searchRows,
  sortRows,
  type IssueRow,
  type IssueSort,
} from "@/lib/viz/insights";
import type { FindingType } from "@/server/engine/schema";

import { IssueDrawer, type DrawerFocus } from "./issue-drawer";
import { IssueRowView, type RowAction } from "./issue-row";

/*
 * The accepted issues of a finished run: a tab per kind with its count,
 * sort and search, then one rich row per issue. A row's action or Details
 * opens the drawer. An agent picked in the right column narrows the list.
 */

type Kind = "all" | FindingType;

export function IssueList({
  rows,
  tracked = {},
  pr = null,
  agent,
  onClearAgent,
  probable = false,
}: {
  rows: IssueRow[];
  /** A requirement run: its results are probable risks of an idea. */
  probable?: boolean;
  /** Each issue's tracked state, by its group id. */
  tracked?: Record<string, TrackedState>;
  /** What a pull request needs; null when the run read no GitHub code. */
  pr?: { demo: boolean; fixCost: string } | null;
  /** Only issues this agent filed, when set. */
  agent: { id: AgentId; name: string } | null;
  onClearAgent: () => void;
}) {
  const terms = termsFor(probable);
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<IssueSort>("severity");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{
    row: IssueRow;
    focus: DrawerFocus;
  } | null>(null);
  const search = useRef<HTMLInputElement>(null);

  // "/" jumps to the search field, unless typing somewhere already.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== "/" ||
        target?.closest("input, textarea, [contenteditable=true]")
      )
        return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scoped = agent
    ? rows.filter((row) => row.agents.includes(agent.id))
    : rows;
  const counts = kindCounts(scoped);
  const shown = sortRows(
    searchRows(
      kind === "all" ? scoped : scoped.filter((row) => row.type === kind),
      query,
    ),
    sort,
  );
  const act = (row: IssueRow, action: RowAction) =>
    setOpen({
      row,
      focus:
        action === "fix"
          ? "fix"
          : action === "work-order"
            ? "work-order"
            : null,
    });

  return (
    <section
      className="min-w-0 overflow-hidden rounded-card bg-card"
      data-testid="insights"
    >
      <header className="space-y-3 border-b px-4 py-3">
        <div className="-mx-1 overflow-x-auto px-1">
          <Segmented
            label={`Kind of ${terms.issue}`}
            value={kind}
            onValueChange={(next) => setKind(next as Kind)}
            options={[
              {
                value: "all",
                label: (
                  <span className="flex items-center gap-1.5">
                    All
                    <span className="font-mono text-[0.6875rem] text-muted-foreground">
                      {scoped.length}
                    </span>
                  </span>
                ),
              },
              ...counts.map((item) => ({
                value: item.type,
                label: (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {item.label}
                    <span className="font-mono text-[0.6875rem] text-muted-foreground">
                      {item.count}
                    </span>
                  </span>
                ),
              })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono text-foreground tabular-nums">
              {shown.length}
            </span>{" "}
            {shown.length === 1 ? terms.issue : terms.issues} shown
            <InfoTip
              about={probable ? "findingsProbable" : "findings"}
              label={terms.Issues}
            />
          </p>
          {agent ? (
            <button
              type="button"
              onClick={onClearAgent}
              className="h-8 rounded-md bg-brand/15 px-2 text-xs ring-1 ring-brand/40"
              data-testid="insights-agent-filter"
            >
              Filed by {agent.name} ×
            </button>
          ) : null}
          <Select
            value={sort}
            onValueChange={(value) => value && setSort(value as IssueSort)}
          >
            <SelectTrigger
              size="sm"
              className="w-44"
              aria-label={`Sort ${terms.issues}`}
              data-testid="insights-sort"
            >
              <SelectValue>Sort: {SORT_LABEL[sort]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as IssueSort[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex h-8 w-56 items-center gap-1.5 rounded-md px-2 text-xs ring-1 ring-foreground/10 focus-within:ring-ring">
            <Search
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${terms.issues}`}
              aria-label={`Search ${terms.issues}`}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              data-testid="insights-search"
            />
            <kbd className="rounded-sm px-1 font-mono text-[0.625rem] text-muted-foreground ring-1 ring-foreground/10">
              /
            </kbd>
          </label>
        </div>
      </header>

      {shown.length > 0 ? (
        <ul className="divide-y">
          <AnimatePresence initial={false}>
            {shown.map((row) => (
              <FadeInItem key={row.id}>
                <IssueRowView
                  row={row}
                  probable={probable}
                  tracked={tracked[row.id]}
                  onAction={act}
                />
              </FadeInItem>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? probable
              ? "The agents raised no risks that the judge kept."
              : "The agents found no flaws that the judge accepted."
            : `No ${terms.issue} matches.`}
        </p>
      )}

      <IssueDrawer
        row={open?.row ?? null}
        probable={probable}
        focus={open?.focus ?? null}
        tracked={open ? tracked[open.row.id] : undefined}
        pr={pr}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
