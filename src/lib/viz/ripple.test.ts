import { describe, expect, it } from "vitest";

import type { RunImpact } from "@/server/engine/schema";

import { rippleFlight } from "./ripple";

const part = (id: string) => ({
  id,
  name: id,
  kind: "service" as const,
  workspace: null,
  paths: [],
  description: "",
});

const impact = {
  components: [
    {
      id: "auth",
      name: "auth",
      effect: "changed",
      note: "Sessions move to Redis.",
    },
    { id: "web", name: "web", effect: "affected", note: "Signs in again." },
    {
      id: "orders",
      name: "orders",
      effect: "affected",
      note: "Reads the session.",
    },
    { id: "gone", name: "gone", effect: "affected", note: "Not on the map." },
  ],
  after: {
    components: ["web", "gateway", "auth", "orders"].map(part),
    connections: [
      { from: "web", to: "gateway", label: "" },
      { from: "gateway", to: "auth", label: "" },
      { from: "gateway", to: "orders", label: "" },
      { from: "orders", to: "auth", label: "" },
    ],
  },
} as unknown as RunImpact;

describe("rippleFlight", () => {
  it("starts at what the change alters and reaches the nearest parts first", () => {
    const plan = rippleFlight(impact)!;
    expect(plan.hops.map((hop) => [hop.from, hop.to, hop.tone])).toEqual([
      ["auth", "auth", "accent"],
      ["auth", "orders", "warning"],
      ["auth", "web", "warning"],
    ]);
  });

  it("draws nothing when no part on the map was changed", () => {
    expect(
      rippleFlight({ ...impact, components: impact.components.slice(1) }),
    ).toBeNull();
  });

  it("starts a change in words from the parts it names", () => {
    const words = {
      ...impact,
      components: impact.components.map((part) => ({
        ...part,
        effect: "affected" as const,
      })),
    };
    const plan = rippleFlight(words, "Let the gateway check sessions.")!;
    expect(plan.hops[0]).toMatchObject({ from: "gateway", to: "gateway" });
    // All one step from the gateway: they keep the impact's order.
    expect(plan.hops.slice(1).map((hop) => hop.to)).toEqual([
      "auth",
      "web",
      "orders",
    ]);
  });
});
