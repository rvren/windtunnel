import { describe, expect, it } from "vitest";

import type { OutageHop, RunOutage } from "@/server/engine/schema";

import { outageFlight, outageNumbers, worstHops } from "./outage";

const hop = (
  id: string,
  from: string,
  to: string,
  behaviour: OutageHop["behaviour"],
  severity: OutageHop["severity"],
): OutageHop => ({
  id,
  from,
  to,
  behaviour,
  severity,
  effect: id,
  depth: 1,
  by: "outage",
  location: { path: "x", startLine: 1, endLine: 1, quote: "" },
});

const outage: RunOutage = {
  part: { id: "billing", name: "Billing service" },
  mode: "slow",
  mapFrom: null,
  headline: "Charged three times.",
  hops: [
    hop("a", "billing", "orders", "retries", "critical"),
    hop("b", "orders", "orders", "holds", "low"),
    hop("c", "orders", "gateway", "wrong_data", "medium"),
    hop("d", "gateway", "web", "silent", "high"),
  ],
  journeys: [
    { name: "Checkout", effect: "", broken: true },
    { name: "Search", effect: "", broken: false },
  ],
};

describe("outageFlight", () => {
  it("cuts the part and colours each hop by what it does", () => {
    const plan = outageFlight(outage);
    expect(plan.cut).toEqual(["billing"]);
    expect(plan.hops.map((item) => item.tone)).toEqual([
      "danger",
      "ok",
      "warning",
      "danger",
    ]);
  });
});

describe("outageNumbers", () => {
  it("counts broken journeys, the parts reached and what holds", () => {
    expect(outageNumbers(outage)).toEqual({ broken: 1, reached: 3, holds: 1 });
  });
});

describe("worstHops", () => {
  it("lists the worst failures first, leaving out what holds", () => {
    expect(worstHops(outage).map((item) => item.id)).toEqual(["a", "d", "c"]);
  });
});
