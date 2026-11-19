import { describe, expect, it } from "vitest";

import { runTool, ToolFailure } from "../llm";
import type { Architecture, OutageHop } from "../schema";

import {
  distances,
  findPart,
  orderCascade,
  outageGroups,
  reportHopTool,
} from "./engineout";

const part = (id: string, name: string) => ({
  id,
  name,
  kind: "service" as const,
  workspace: null,
  paths: [],
  description: "",
});

const map: Architecture = {
  components: [
    part("cmp-web", "Shop frontend"),
    part("cmp-gateway", "API gateway"),
    part("cmp-orders", "Orders service"),
    part("cmp-billing", "Billing service"),
  ],
  connections: [
    { from: "cmp-web", to: "cmp-gateway", label: "REST" },
    { from: "cmp-gateway", to: "cmp-orders", label: "HTTP" },
    { from: "cmp-orders", to: "cmp-billing", label: "HTTP" },
  ],
};

const hop = (
  id: string,
  to: string,
  behaviour: OutageHop["behaviour"] = "errors",
): OutageHop => ({
  id,
  from: "cmp-billing",
  to,
  behaviour,
  effect: `effect ${id}`,
  severity: "medium",
  depth: 0,
  by: "outage",
  location: { path: "x.py", startLine: 1, endLine: 1, quote: "" },
});

describe("findPart", () => {
  it("finds the part by id, by name, then by part of its name", () => {
    expect(findPart(map, "cmp-billing")?.id).toBe("cmp-billing");
    expect(findPart(map, "Orders service")?.id).toBe("cmp-orders");
    expect(findPart(map, "gateway")?.id).toBe("cmp-gateway");
    expect(findPart(map, "payments")).toBeNull();
    expect(findPart(map, "  ")).toBeNull();
  });
});

describe("distances", () => {
  it("counts steps from the cut along the calls, either way round", () => {
    const far = distances(map, "cmp-billing");
    expect(far.get("cmp-orders")).toBe(1);
    expect(far.get("cmp-web")).toBe(3);
  });
});

describe("report_hop", () => {
  const reader = {
    async slice(path: string, startLine: number, endLine: number) {
      if (path !== "orders/client.py") throw new ToolFailure("no such file");
      return { path, startLine, endLine, totalLines: 20, text: "code" };
    },
  };
  const tool = (filed: OutageHop[]) =>
    reportHopTool({
      agentId: "outage",
      reader,
      architecture: map,
      cut: "cmp-billing",
      filed,
      onHop: () => {},
    });
  const input = (over: Record<string, unknown> = {}) => ({
    at: "cmp-orders",
    from: "cmp-billing",
    behaviour: "retries",
    effect: "Sends the charge again.",
    path: "orders/client.py",
    startLine: 3,
    endLine: 5,
    ...over,
  });

  it("files a hop with the code it cites", async () => {
    const filed: OutageHop[] = [];
    const result = await runTool(tool(filed), input());
    expect(result.text).toBe("Recorded as outage-1.");
    expect(filed[0]).toMatchObject({
      id: "outage-1",
      from: "cmp-billing",
      to: "cmp-orders",
      behaviour: "retries",
      location: { path: "orders/client.py", startLine: 3, quote: "code" },
    });
  });

  it.each([
    [{ at: "cmp-nowhere" }, /part ids/],
    [{ at: "cmp-billing" }, /not running/],
    [{ path: "made/up.py" }, /no such file/],
    [{ effect: " " }, /Say what happens/],
  ])("refuses %o", async (over, reason) => {
    const filed: OutageHop[] = [];
    const result = await runTool(tool(filed), input(over));
    expect(result.failed).toBe(true);
    expect(result.text).toMatch(reason);
    expect(filed).toEqual([]);
  });
});

describe("orderCascade", () => {
  it("keeps every hop, in the judge's order, and never rates a hold above low", () => {
    const ordered = orderCascade(
      [
        hop("a", "cmp-web"),
        hop("b", "cmp-orders", "holds"),
        hop("c", "cmp-gateway"),
      ],
      {
        headline: "",
        journeys: [],
        hops: [
          { id: "a", depth: 3, severity: "high" },
          { id: "b", depth: 1, severity: "critical" },
          { id: "made-up", depth: 1, severity: "critical" },
        ],
      },
      map,
      "cmp-billing",
    );
    expect(ordered.map((item) => [item.id, item.depth, item.severity])).toEqual(
      [
        ["b", 1, "low"],
        ["c", 2, "medium"],
        ["a", 3, "high"],
      ],
    );
  });
});

describe("outageGroups", () => {
  it("turns the hops that need fixing into findings, by part", () => {
    const groups = outageGroups(
      [
        { ...hop("a", "cmp-orders"), severity: "critical" },
        { ...hop("b", "cmp-orders", "holds"), severity: "low" },
        { ...hop("c", "cmp-web"), severity: "low" },
      ],
      map,
    );
    expect(groups.map((group) => [group.id, group.title])).toEqual([
      ["a", "Orders service: effect a"],
    ]);
  });
});
