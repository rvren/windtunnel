import { describe, expect, it } from "vitest";

import type { Architecture, CodeLocation } from "@/server/engine/schema";

import {
  hopsAlong,
  partsOnPath,
  placedHops,
  type FlightPlan,
} from "./flight-path";

const architecture: Architecture = {
  components: [
    {
      id: "web",
      name: "Web",
      kind: "frontend",
      workspace: "web",
      paths: ["web"],
      description: "",
    },
    {
      id: "catalog",
      name: "Catalog",
      kind: "service",
      workspace: "catalog",
      paths: ["catalog"],
      description: "",
    },
    {
      id: "auth",
      name: "Auth",
      kind: "service",
      workspace: "auth",
      paths: ["auth"],
      description: "",
    },
  ],
  connections: [],
};

const at = (path: string, line = 1): CodeLocation => ({
  path,
  startLine: line,
  endLine: line,
  quote: "",
});

describe("hopsAlong", () => {
  it("joins each step to the part of the step before", () => {
    const hops = hopsAlong(
      [
        {
          id: "a",
          label: "SQL",
          location: at("catalog/search.py", 5),
          tone: "danger",
        },
        {
          id: "b",
          label: "HTML",
          location: at("web/src/search.ts", 8),
          tone: "danger",
        },
        {
          id: "c",
          label: "token",
          location: at("web/src/session.ts", 6),
          tone: "danger",
        },
        {
          id: "d",
          label: "expiry",
          location: at("auth/src/session.ts", 5),
          tone: "danger",
        },
      ],
      architecture,
    );
    expect(hops.map((hop) => [hop.from, hop.to])).toEqual([
      ["catalog", "catalog"],
      ["catalog", "web"],
      ["web", "web"],
      ["web", "auth"],
    ]);
  });

  it("keeps a step in no part where the route already is", () => {
    const hops = hopsAlong(
      [
        { id: "a", label: "", location: null, tone: "accent" },
        { id: "b", label: "", location: at("web/x.ts"), tone: "accent" },
        { id: "c", label: "", location: at("README.md"), tone: "accent" },
      ],
      architecture,
    );
    // The first step is in no part and nothing came before: dropped.
    expect(hops.map((hop) => [hop.id, hop.from, hop.to])).toEqual([
      ["b", "web", "web"],
      ["c", "web", "web"],
    ]);
  });
});

describe("placedHops", () => {
  const plan: FlightPlan = {
    cut: ["billing"],
    hops: [
      {
        id: "1",
        from: "billing",
        to: "orders",
        label: "",
        location: null,
        tone: "danger",
      },
      {
        id: "2",
        from: "orders",
        to: "nowhere",
        label: "",
        location: null,
        tone: "danger",
      },
      {
        id: "3",
        from: "orders",
        to: "gateway",
        label: "",
        location: null,
        tone: "warning",
      },
    ],
  };

  it("drops hops off the map and keeps the route's numbers", () => {
    const placed = placedHops(plan, ["billing", "orders", "gateway"]);
    expect(placed.map((hop) => [hop.id, hop.number])).toEqual([
      ["1", 1],
      ["3", 3],
    ]);
  });

  it("lists the parts on the path in the order it reaches them", () => {
    expect(partsOnPath(plan)).toEqual([
      "billing",
      "orders",
      "nowhere",
      "gateway",
    ]);
  });
});
