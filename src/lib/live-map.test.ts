import { describe, expect, it } from "vitest";

import type { RunEvent } from "@/server/engine/schema";

import { layerComponents } from "./architecture-layout";
import { liveMapState } from "./live-map";
import { applyEvent, emptyFeed } from "./run-feed";

const component = (id: string, kind: string, paths: string[] = []) => ({
  id,
  name: id,
  kind: kind as "service",
  workspace: null,
  paths,
  description: "",
});

describe("layerComponents", () => {
  it("puts callers before what they call, and things with no code last", () => {
    const layers = layerComponents(
      [
        component("db", "database"),
        component("billing", "service"),
        component("orders", "service"),
        component("gateway", "service"),
        component("worker", "service"),
        component("web", "frontend"),
        component("queue", "queue"),
      ],
      [
        { from: "web", to: "gateway" },
        { from: "gateway", to: "orders" },
        { from: "orders", to: "billing" },
        { from: "orders", to: "db" },
        { from: "orders", to: "queue" },
        { from: "worker", to: "queue" },
      ],
    );
    expect(layers).toEqual([
      ["web"],
      ["gateway", "worker"],
      ["orders"],
      ["billing"],
      ["db", "queue"],
    ]);
  });

  it("ends even when two parts call each other", () => {
    const layers = layerComponents(
      [component("a", "service"), component("b", "service")],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    );
    expect(layers.flat().sort()).toEqual(["a", "b"]);
  });
});

describe("liveMapState", () => {
  const architecture = {
    components: [
      component("cmp-web", "frontend", ["web"]),
      component("cmp-orders", "service", ["orders"]),
      component("cmp-db", "database"),
    ],
    connections: [{ from: "cmp-web", to: "cmp-orders", label: "REST" }],
  };
  const finding = (
    uid: string,
    path: string,
    severity: "high" | "critical",
  ) => ({
    type: "agent.finding" as const,
    agentId: "chaos" as const,
    finding: {
      uid,
      type: "architecture_weakness" as const,
      severity,
      title: uid,
      path,
      startLine: 1,
    },
  });
  const play = (events: RunEvent[]) =>
    liveMapState(events.reduce(applyEvent, emptyFeed()));

  it("places agents on what they read and findings on what they cite", () => {
    const state = play([
      { type: "workspace.ready", name: "web", label: "rvren/storefront-web" },
      { type: "workspace.ready", name: "web", label: "again" },
      { type: "architecture.ready", architecture },
      { type: "agent.started", agentId: "chaos" },
      { type: "agent.started", agentId: "scale" },
      { type: "agent.reading", agentId: "chaos", path: "orders/orders.py" },
      { type: "agent.reading", agentId: "scale", path: "README.md" },
      finding("chaos/f1", "orders/orders.py", "high"),
      finding("chaos/f2", "orders/events.py", "critical"),
      finding("chaos/f2", "orders/events.py", "critical"),
      finding("chaos/f3", "web/src/x.ts", "high"),
    ]);
    expect(state.components["cmp-orders"]).toEqual({
      agents: ["chaos"],
      findings: 2,
      worst: "critical",
    });
    expect(state.components["cmp-web"]).toMatchObject({
      findings: 1,
      worst: "high",
    });
    expect(state.components["cmp-db"]).toEqual({
      agents: [],
      findings: 0,
      worst: null,
    });
    expect(state.idle).toEqual([
      "normal_user",
      "adversarial_user",
      "scale",
      "product_critic",
    ]);
    expect(state.findings).toBe(3);
  });

  it("sends an agent home when it is done", () => {
    const state = play([
      { type: "architecture.ready", architecture },
      { type: "agent.started", agentId: "chaos" },
      { type: "agent.reading", agentId: "chaos", path: "orders/orders.py" },
      {
        type: "agent.completed",
        agentId: "chaos",
        scenarios: 0,
        findings: 0,
        dropped: 0,
      },
    ]);
    expect(state.components["cmp-orders"].agents).toEqual([]);
    expect(state.idle).toContain("chaos");
  });
});
