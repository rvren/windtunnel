import { describe, expect, it } from "vitest";

import type { HomeNumbers } from "@/lib/viz/home";
import type { RunSummary } from "@/server/engine/schema";

import { sidebarProjects, sidebarRuns } from "./sidebar";

const project = (
  id: string,
  over: Partial<HomeNumbers["projects"][number]> = {},
) =>
  ({
    id,
    name: id,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    open: 0,
    fixed: 0,
    risks: 0,
    lastRun: { id: "r", at: `2026-11-1${id}T00:00:00Z`, status: "completed" },
    ...over,
  }) as HomeNumbers["projects"][number];

describe("sidebarProjects", () => {
  it("lists the latest run first, with the worst open severity", () => {
    const numbers = {
      projects: [
        project("1"),
        project("3", {
          open: 9,
          bySeverity: { critical: 0, high: 2, medium: 7, low: 0 },
        }),
        project("2", { lastRun: null }),
      ],
    } as unknown as HomeNumbers;
    const list = sidebarProjects(numbers);
    expect(list.map((item) => item.id)).toEqual(["3", "1", "2"]);
    expect(list[0]).toMatchObject({ worst: "high", note: "2 high open" });
    expect(list[1].note).toBe("Nothing open");
    expect(list[2].note).toBe("No run yet");
  });
});

describe("sidebarRuns", () => {
  it("keeps running runs, with their stage out of the kind's stages", () => {
    const runs = [
      {
        id: "a",
        title: "A",
        status: "running",
        kind: "audit",
        stage: "agents",
      },
      { id: "b", title: "B", status: "running", kind: "flyoff", stage: null },
      { id: "c", title: "C", status: "completed", kind: "audit", stage: null },
    ] as RunSummary[];
    expect(sidebarRuns(runs)).toEqual([
      { id: "a", title: "A", step: "Agents 4/9" },
      { id: "b", title: "B", step: "Starting" },
    ]);
  });
});
