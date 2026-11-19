import { describe, expect, it } from "vitest";

import { outageGroups } from "./kinds/engineout";
import { repairRun } from "./repair";
import type { Architecture, OutageHop, RunRecord } from "./schema";

const map: Architecture = {
  components: [
    {
      id: "cmp-web",
      name: "Web",
      kind: "frontend",
      workspace: "web",
      paths: ["web"],
      description: "",
    },
    {
      id: "cmp-db",
      name: "Database",
      kind: "database",
      workspace: null,
      paths: [],
      description: "",
    },
  ],
  connections: [{ from: "cmp-web", to: "cmp-db", label: "reads" }],
};

const hop = (
  id: string,
  startLine: number,
  over: Partial<OutageHop> = {},
): OutageHop => ({
  id,
  from: "cmp-db",
  to: "cmp-web",
  behaviour: "hangs",
  effect: `Waits at line ${startLine}.`,
  severity: "high",
  depth: 1,
  location: {
    path: "web/app.js",
    startLine,
    endLine: startLine + 2,
    quote: "",
  },
  by: id.split("-")[0],
  ...over,
});

const runWith = (hops: OutageHop[]): RunRecord =>
  ({
    id: "r1",
    kind: "engineout",
    outage: {
      part: { id: "cmp-db", name: "Database" },
      mode: "slow",
      mapFrom: null,
      headline: "",
      hops,
      journeys: [],
    },
    groups: outageGroups(hops, map),
  }) as unknown as RunRecord;

describe("repairRun", () => {
  it("leaves a run with distinct hop ids as it is", () => {
    const run = runWith([hop("outage-1", 1), hop("outage-2", 9)]);
    expect(repairRun(run)).toBe(run);
  });

  it("gives each repeated hop, and its finding, an id of its own", () => {
    // As a run saved before the fix holds them: three hops filed at once,
    // all numbered 1, and a later one numbered 4.
    const run = runWith([
      hop("journeys-1", 1),
      hop("journeys-1", 10),
      hop("journeys-1", 20, { behaviour: "holds", severity: "low" }),
      hop("journeys-4", 30),
    ]);
    const mended = repairRun(run);
    expect(mended.outage?.hops.map((item) => item.id)).toEqual([
      "journeys-1",
      "journeys-1-2",
      "journeys-1-3",
      "journeys-4",
    ]);
    // A hop that holds makes no finding: the others keep their hop's id.
    expect(mended.groups.map((group) => group.id)).toEqual([
      "journeys-1",
      "journeys-1-2",
      "journeys-4",
    ]);
    // Nothing else changes.
    expect(mended.outage?.hops.map((item) => item.effect)).toEqual(
      run.outage?.hops.map((item) => item.effect),
    );
    expect(mended.groups.map((group) => group.summary)).toEqual(
      run.groups.map((group) => group.summary),
    );
  });

  it("never mends one id into another that is already there", () => {
    const run = runWith([
      hop("outage-1", 1),
      hop("outage-1", 5),
      hop("outage-1-2", 9),
    ]);
    const ids = repairRun(run).outage?.hops.map((item) => item.id) ?? [];
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(["outage-1", "outage-1-3", "outage-1-2"]);
  });
});
